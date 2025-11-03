'use strict';

/**
 * photovoltaicHelper
 * -------------------------------------------------------------
 * - Liest PV-Erzeugung und Hausverbrauch (Foreign States aus Admin-Config)
 * - Berechnet Überschussleistung und setzt Photovoltaik-States
 * - Schaltet die Pumpe nur im Modus 'auto_pv' über pump.pump_switch
 * - Respektiert Saison, Nachlaufzeit (Entprellung) und optionales "Umwälzung erreicht"
 * - Einschaltlogik: Überschuss >= (pump_max_watt + threshold_w)
 * -------------------------------------------------------------
 */

const photovoltaicHelper = {
    adapter: null,
    genId: null,
    houseId: null,
    afterrunTimer: null,
    _pvPumpHoldUntil: 0,
    _desiredPump: null,
    _lastCalc: 0,

    init(adapter) {
        this.adapter = adapter;

        this.genId = adapter.config?.power_generated_id || '';
        this.houseId = adapter.config?.power_house_id || '';

        if (!this.genId || !this.houseId) {
            this.adapter.log.info(
                '[photovoltaicHelper] PV-IDs in der Instanz-Konfiguration fehlen. Überschusserkennung bleibt passiv.',
            );
        } else {
            try {
                this.adapter.subscribeForeignStates(this.genId);
                this.adapter.subscribeForeignStates(this.houseId);
                this.adapter.log.info(`[photovoltaicHelper] Subscribed: PV="${this.genId}", Haus="${this.houseId}"`);
            } catch (err) {
                this.adapter.log.warn(`[photovoltaicHelper] Konnte Foreign-States nicht abonnieren: ${err.message}`);
            }
        }

        this.adapter.subscribeStates('photovoltaic.afterrun_min');
        this.adapter.subscribeStates('photovoltaic.ignore_on_circulation');
        this.adapter.subscribeStates('status.season_active');
        this.adapter.subscribeStates('pump.mode');

        this._safeRecalc('init');
        this.adapter.log.info('[photovoltaicHelper] Initialisierung abgeschlossen.');
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }
        try {
            if (this.genId && id === this.genId) {
                await this._updateNumberState('photovoltaic.power_generated_w', Number(state.val) || 0);
                await this._safeRecalc('foreign:pv');
                return;
            }
            if (this.houseId && id === this.houseId) {
                await this._updateNumberState('photovoltaic.power_house_w', Number(state.val) || 0);
                await this._safeRecalc('foreign:house');
                return;
            }

            if (id.endsWith('photovoltaic.afterrun_min')) {
                this.adapter.log.debug(`[photovoltaicHelper] Nachlaufzeit geändert auf ${Number(state.val) || 0} min`);
                return;
            }
            if (id.endsWith('photovoltaic.ignore_on_circulation')) {
                this.adapter.log.debug(
                    `[photovoltaicHelper] Flag "PV ignorieren bei Umwälzung erreicht" = ${!!state.val}`,
                );
                return;
            }

            if (id.endsWith('status.season_active') || id.endsWith('pump.mode')) {
                await this._safeRecalc('mode/season');
                return;
            }
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Fehler in handleStateChange: ${err.message}`);
        }
    },

    async _recalc(_sourceTag = '') {
        const now = Date.now();
        if (now - this._lastCalc < 250) {
            return;
        }
        this._lastCalc = now;

        const seasonActive = !!(await this.adapter.getStateAsync('status.season_active'))?.val;
        const pumpMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'auto';

        const gen = Number((await this.adapter.getStateAsync('photovoltaic.power_generated_w'))?.val ?? 0) || 0;
        const house = Number((await this.adapter.getStateAsync('photovoltaic.power_house_w'))?.val ?? 0) || 0;

        // Schwelle & Pumpenleistung
        const thresholdState = Number((await this.adapter.getStateAsync('photovoltaic.threshold_w'))?.val ?? NaN);
        const threshold = Number.isFinite(thresholdState)
            ? thresholdState
            : Number(this.adapter.config?.threshold_w || 200);

        const pumpMax = Number((await this.adapter.getStateAsync('pump.pump_max_watt'))?.val ?? 0);

        const afterrunMin = Math.max(
            0,
            Number((await this.adapter.getStateAsync('photovoltaic.afterrun_min'))?.val ?? 0) || 0,
        );
        const ignoreOnCirc = !!((await this.adapter.getStateAsync('photovoltaic.ignore_on_circulation'))?.val ?? false);

        // SAFETY: Solarüberhitzungsschutz
        try {
            const collectorWarning = !!(await this.adapter.getStateAsync('solar.collector_warning'))?.val;
            if (collectorWarning) {
                this.adapter.log.warn(
                    '[photovoltaicHelper] Kollektorüberhitzung erkannt → Pumpe ZWANGSEIN (Sicherheits-Override aktiv)',
                );
                return this._maybeStartPump('solar_overheat_protection');
            }
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Fehler beim Prüfen der Solarüberhitzung: ${err.message}`);
        }

        // Überschussberechnung
        const surplus = Math.max(0, gen - house);
        await this._updateNumberState('photovoltaic.power_surplus_w', surplus);

        // **NEU:** Einschaltlogik = Pumpenleistung + Sicherheitsaufschlag
        const requiredPower = pumpMax + threshold;
        const surplusActive = surplus >= requiredPower && seasonActive;
        await this._updateBoolState('photovoltaic.surplus_active', surplusActive);

        const txt = surplusActive
            ? `Überschuss aktiv (${surplus} W ≥ ${pumpMax}+${threshold} W)`
            : `Kein Überschuss (${surplus} W < ${pumpMax}+${threshold} W)`;
        await this._updateStringState('photovoltaic.status_text', txt);
        await this._updateStringState('photovoltaic.last_update', new Date().toISOString());

        // Saison/Modus prüfen
        if (!seasonActive) {
            this.adapter.log.debug('[photovoltaicHelper] Saison inaktiv → keine PV-Schaltlogik.');
            return this._maybeStopPump(false, 0, 'season_inactive');
        }
        if (pumpMode !== 'auto_pv') {
            this.adapter.log.debug(
                `[photovoltaicHelper] Pumpenmodus ist '${pumpMode}' ≠ 'auto_pv' → keine PV-Schaltlogik.`,
            );
            return this._maybeStopPump(false, 0, 'mode_not_auto_pv');
        }

        // Optional: Umwälzung erreicht?
        if (ignoreOnCirc) {
            try {
                const remainingState = await this.adapter.getForeignStateAsync(
                    'poolcontrol.0.circulation.daily_remaining',
                );
                const remaining = Number(remainingState?.val ?? NaN);
                if (Number.isFinite(remaining) && remaining <= 0) {
                    this.adapter.log.debug(
                        `[photovoltaicHelper] Tagesumwälzung erreicht (daily_remaining = ${remaining}) → PV-Steuerung ignoriert.`,
                    );
                    return this._maybeStopPump(false, afterrunMin, 'circulation_reached');
                }
            } catch (err) {
                this.adapter.log.debug(
                    `[photovoltaicHelper] daily_remaining konnte nicht gelesen werden: ${err.message}`,
                );
            }
        }

        // Schaltlogik
        if (surplusActive) {
            return this._maybeStartPump('pv_surplus');
        }
        return this._maybeStopPump(false, afterrunMin, 'pv_ended_afterrun');
    },

    async _maybeStartPump(reason) {
        if (this._desiredPump === true) {
            return;
        }
        this._desiredPump = true;
        if (this.afterrunTimer) {
            clearTimeout(this.afterrunTimer);
            this.afterrunTimer = null;
        }
        this._pvPumpHoldUntil = 0;
        this.adapter.log.info(`[photovoltaicHelper] Pumpe EIN (Grund: ${reason})`);
        await this._setPumpSwitch(true);
    },

    async _maybeStopPump(immediate, afterrunMin, tag) {
        if (immediate || !afterrunMin || afterrunMin <= 0) {
            if (this._desiredPump === false) {
                return;
            }
            this._desiredPump = false;
            this.adapter.log.info(`[photovoltaicHelper] Pumpe AUS (${tag}, ohne Nachlauf)`);
            await this._setPumpSwitch(false);
            return;
        }

        const holdMs = Math.round(afterrunMin * 60 * 1000);
        this._pvPumpHoldUntil = Date.now() + holdMs;
        if (this.afterrunTimer) {
            clearTimeout(this.afterrunTimer);
        }
        this.afterrunTimer = setTimeout(async () => {
            const active = !!(await this.adapter.getStateAsync('photovoltaic.surplus_active'))?.val;
            if (active) {
                this.adapter.log.debug('[photovoltaicHelper] Nachlauf abgebrochen – Überschuss wieder aktiv.');
                return;
            }
            this._desiredPump = false;
            this.adapter.log.info('[photovoltaicHelper] Pumpe AUS (Nachlauf beendet)');
            await this._setPumpSwitch(false);
        }, holdMs);
        this.adapter.log.debug(`[photovoltaicHelper] Nachlauf gestartet: ${afterrunMin} min (${tag})`);
    },

    async _setPumpSwitch(on) {
        try {
            await this.adapter.setStateAsync('pump.pump_switch', { val: !!on, ack: false });
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Konnte pump.pump_switch nicht setzen: ${err.message}`);
        }
    },

    async _updateNumberState(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val: Number(val) || 0, ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setNumber ${id} fehlgeschlagen: ${e.message}`);
        }
    },
    async _updateBoolState(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val: !!val, ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setBool ${id} fehlgeschlagen: ${e.message}`);
        }
    },
    async _updateStringState(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val: String(val ?? ''), ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setString ${id} fehlgeschlagen: ${e.message}`);
        }
    },

    async _safeRecalc(tag) {
        try {
            await this._recalc(tag);
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Recalc-Fehler (${tag}): ${err.message}`);
        }
    },

    cleanup() {
        if (this.afterrunTimer) {
            clearTimeout(this.afterrunTimer);
            this.afterrunTimer = null;
        }
        this._pvPumpHoldUntil = 0;
        this._desiredPump = null;
    },
};

module.exports = photovoltaicHelper;

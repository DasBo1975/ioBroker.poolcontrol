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
                '[photovoltaicHelper] PV IDs are missing in the instance configuration. Surplus detection remains inactive.',
            );
        } else {
            try {
                this.adapter.subscribeForeignStates(this.genId);
                this.adapter.subscribeForeignStates(this.houseId);
                this.adapter.log.info(`[photovoltaicHelper] Subscribed: PV="${this.genId}", house="${this.houseId}"`);
            } catch (err) {
                this.adapter.log.warn(`[photovoltaicHelper] Could not subscribe to foreign states: ${err.message}`);
            }
        }

        this.adapter.subscribeStates('photovoltaic.afterrun_min');
        this.adapter.subscribeStates('photovoltaic.ignore_on_circulation');
        this.adapter.subscribeStates('status.season_active');
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('pump.active_helper');

        this._safeRecalc('init');
        this.adapter.log.info('[photovoltaicHelper] Initialization completed.');
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
                this.adapter.log.debug(`[photovoltaicHelper] Afterrun time changed to ${Number(state.val) || 0} min`);
                return;
            }
            if (id.endsWith('photovoltaic.ignore_on_circulation')) {
                this.adapter.log.debug(
                    `[photovoltaicHelper] Flag "Ignore PV when circulation target reached" = ${!!state.val}`,
                );
                return;
            }

            if (id.endsWith('status.season_active') || id.endsWith('pump.mode') || id.endsWith('pump.active_helper')) {
                await this._safeRecalc('mode/season/owner');
                return;
            }
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Error in handleStateChange: ${err.message}`);
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
                    '[photovoltaicHelper] Collector overheating detected → pump FORCED ON (safety override active)',
                );
                return this._maybeStartPump('solar_overheat_protection');
            }
        } catch (err) {
            this.adapter.log.warn(
                `[photovoltaicHelper] Error while checking solar overheating protection: ${err.message}`,
            );
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
            this.adapter.log.debug('[photovoltaicHelper] Season inactive → PV switching logic disabled.');
            return this._maybeStopPump(false, 0, 'season_inactive');
        }
        if (pumpMode !== 'auto_pv') {
            this.adapter.log.debug(
                `[photovoltaicHelper] Pump mode is '${pumpMode}' ≠ 'auto_pv' → PV switching logic disabled.`,
            );
            return this._maybeStopPump(false, 0, 'mode_not_auto_pv');
        }

        // FIX: PV-Helfer darf nur aktiv sein, solange Umwälzung noch nicht erfüllt ist
        if (ignoreOnCirc) {
            try {
                const remainingState = await this.adapter.getForeignStateAsync(
                    'poolcontrol.0.circulation.daily_remaining',
                );
                const remaining = Number(remainingState?.val ?? NaN);

                if (Number.isFinite(remaining)) {
                    // RULE: Wenn Umwälzung bereits erfüllt → Pumpe sofort AUS (ohne Nachlauf)
                    if (remaining <= 0) {
                        this.adapter.log.info(
                            `[photovoltaicHelper] Daily circulation target reached (daily_remaining=${remaining}) → PV control stopped, pump OFF.`,
                        );
                        return this._maybeStopPump(true, 0, 'circulation_reached_force_off');
                    }

                    // RULE: Wenn Umwälzung noch nicht erfüllt → nur dann darf bei Überschuss eingeschaltet werden
                    if (remaining > 0 && surplusActive) {
                        this.adapter.log.debug(
                            `[photovoltaicHelper] Daily circulation target not yet reached (${remaining}) → PV control active.`,
                        );
                    }
                }
            } catch (err) {
                this.adapter.log.debug(`[photovoltaicHelper] Could not read daily_remaining: ${err.message}`);
            }
        }

        // FIX: PV-Schaltlogik mit Prüfung der Umwälzung
        if (surplusActive) {
            try {
                const remainingState = await this.adapter.getForeignStateAsync(
                    'poolcontrol.0.circulation.daily_remaining',
                );
                const remaining = Number(remainingState?.val ?? NaN);

                // RULE: Einschalten nur, wenn Umwälzung noch nicht erfüllt
                if (Number.isFinite(remaining) && remaining <= 0) {
                    this.adapter.log.info(
                        `[photovoltaicHelper] Daily circulation target already reached (${remaining}) → pump stays OFF (no start despite surplus).`,
                    );
                    return this._maybeStopPump(true, 0, 'circulation_already_reached');
                }

                // RULE: Überschuss aktiv UND Umwälzung noch nicht erfüllt → einschalten
                return this._maybeStartPump('pv_surplus');
            } catch (err) {
                this.adapter.log.warn(`[photovoltaicHelper] Error while checking daily_remaining: ${err.message}`);
                return this._maybeStartPump('pv_surplus');
            }
        }

        // RULE: Kein Überschuss → ggf. Nachlauf/Aus
        return this._maybeStopPump(false, afterrunMin, 'pv_ended_afterrun');
    },

    async _isControlHelperPriorityActive() {
        const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
        return activeHelper === 'controlHelper';
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
        this.adapter.log.info(`[photovoltaicHelper] Pump ON (reason: ${reason})`);
        await this._setPumpSwitch(true);
    },

    async _maybeStopPump(immediate, afterrunMin, tag) {
        if (await this._isControlHelperPriorityActive()) {
            if (this.afterrunTimer) {
                clearTimeout(this.afterrunTimer);
                this.afterrunTimer = null;
            }
            this._pvPumpHoldUntil = 0;
            this._desiredPump = false;
            this.adapter.log.debug(
                `[photovoltaicHelper] Stop '${tag}' suppressed because controlHelper currently has priority.`,
            );
            return;
        }

        if (immediate || !afterrunMin || afterrunMin <= 0) {
            if (this._desiredPump === false) {
                return;
            }
            this._desiredPump = false;
            this.adapter.log.info(`[photovoltaicHelper] Pump OFF (${tag}, no afterrun)`);
            await this._setPumpSwitch(false);
            return;
        }

        const holdMs = Math.round(afterrunMin * 60 * 1000);
        this._pvPumpHoldUntil = Date.now() + holdMs;
        if (this.afterrunTimer) {
            clearTimeout(this.afterrunTimer);
        }
        this.afterrunTimer = setTimeout(async () => {
            if (await this._isControlHelperPriorityActive()) {
                this.adapter.log.debug(
                    '[photovoltaicHelper] Afterrun stop suppressed because controlHelper currently has priority.',
                );
                this._desiredPump = false;
                return;
            }

            const active = !!(await this.adapter.getStateAsync('photovoltaic.surplus_active'))?.val;
            if (active) {
                this.adapter.log.debug('[photovoltaicHelper] Afterrun canceled – surplus active again.');
                return;
            }
            this._desiredPump = false;
            this.adapter.log.info('[photovoltaicHelper] Pump OFF (afterrun finished)');
            await this._setPumpSwitch(false);
        }, holdMs);
        this.adapter.log.debug(`[photovoltaicHelper] Afterrun started: ${afterrunMin} min (${tag})`);
    },

    async _setPumpSwitch(on) {
        try {
            await this.adapter.setStateAsync('pump.pump_switch', { val: !!on, ack: false });
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Could not set pump.pump_switch: ${err.message}`);
        }
    },

    async _updateNumberState(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val: Number(val) || 0, ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setNumber ${id} failed: ${e.message}`);
        }
    },
    async _updateBoolState(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val: !!val, ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setBool ${id} failed: ${e.message}`);
        }
    },
    async _updateStringState(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val: String(val ?? ''), ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setString ${id} failed: ${e.message}`);
        }
    },

    async _safeRecalc(tag) {
        try {
            await this._recalc(tag);
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Recalc error (${tag}): ${err.message}`);
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

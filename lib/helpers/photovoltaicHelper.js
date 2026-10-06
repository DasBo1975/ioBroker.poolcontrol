'use strict';

/**
 * photovoltaicHelper
 * -------------------------------------------------------------
 * - Liest PV-Erzeugung und Hausverbrauch (Foreign States aus Admin-Config)
 * - Berechnet Überschussleistung und setzt Photovoltaik-States
 * - Schaltet die Pumpe nur im Modus 'auto_pv' über pump.pump_switch
 * - Respektiert Saison, Nachlaufzeit (Entprellung) und optionales "Umwälzung erreicht"
 * - Einschaltlogik: Überschuss >= (pump_max_watt + threshold_w)
 * - Haltebedingung: Restüberschuss + aktuelle Pumpenleistung >= erforderliche Leistung
 * -------------------------------------------------------------
 */

const photovoltaicHelper = /** @satisfies {import('../types/poolcontrol-adapter').PhotovoltaicHelper} */ ({
    _adapter: null,
    _active: false,
    _initializationPromise: null,
    genId: null,
    houseId: null,
    afterrunTimer: null,
    recalcDebounceTimer: null,
    _pvPumpHoldUntil: 0,
    _desiredPump: null,
    _lastCalc: 0,
    _recalcRunning: false,
    _recalcPending: false,
    _recalcPendingTag: '',
    _recalcPendingSeq: 0,
    _recalcRequestSeq: 0,
    _recalcDebounceMs: 150,

    /**
     * Liefert die initialisierte ioBroker-Adapterinstanz.
     *
     * @returns Initialisierte Adapterinstanz.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('photovoltaicHelper used before init()');
        }

        return this._adapter;
    },

    /**
     * Initialisiert den Photovoltaik-Helper.
     *
     * @param adapter Adapterinstanz für State-, Timer- und Logging-Zugriffe.
     */
    init(adapter) {
        if (this._adapter && this.recalcDebounceTimer) {
            this._adapter.clearTimeout(this.recalcDebounceTimer);
            this.recalcDebounceTimer = null;
        }
        if (this._adapter && this.afterrunTimer) {
            this._adapter.clearTimeout(this.afterrunTimer);
            this.afterrunTimer = null;
        }
        if (this._active) {
            this._recalcRequestSeq += 1;
        }

        this._adapter = adapter;
        this._active = true;
        this._recalcRunning = false;
        this._recalcPending = false;
        this._recalcPendingTag = '';
        this._recalcPendingSeq = 0;
        this._pvPumpHoldUntil = 0;
        this._desiredPump = null;

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
        this.adapter.subscribeStates('pump.manual_safety_enabled');
        this.adapter.subscribeStates('control.pump.maintenance_active');
        this.adapter.subscribeStates('solar.collector_warning');

        const initializationPromise = this._safeRecalc('init');
        this._initializationPromise = initializationPromise;
        void initializationPromise.then(() => {
            if (this._active && this._initializationPromise === initializationPromise) {
                this._initializationPromise = null;
            }
        });
        this.adapter.log.info('[photovoltaicHelper] Initialization completed.');
    },

    async handleStateChange(id, state) {
        if (!this._active) {
            return;
        }
        const initializationPromise = this._initializationPromise;
        if (initializationPromise) {
            await initializationPromise;
            return;
        }
        if (!state) {
            return;
        }
        try {
            if (this.genId && id === this.genId) {
                await this._updateNumberState('photovoltaic.power_generated_w', Number(state.val) || 0);
                this._scheduleRecalc('foreign:pv');
                return;
            }
            if (this.houseId && id === this.houseId) {
                await this._updateNumberState('photovoltaic.power_house_w', Number(state.val) || 0);
                this._scheduleRecalc('foreign:house');
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

            if (
                id.endsWith('status.season_active') ||
                id.endsWith('pump.mode') ||
                id.endsWith('pump.active_helper') ||
                id.endsWith('pump.manual_safety_enabled') ||
                id.endsWith('control.pump.maintenance_active') ||
                id.endsWith('solar.collector_warning')
            ) {
                await this._safeRecalc('mode/season/owner');
                return;
            }
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Error in handleStateChange: ${err.message}`);
        }
    },

    async _recalc(_sourceTag = '', runSeq) {
        if (runSeq === undefined) {
            runSeq = this._recalcRequestSeq;
        }

        this._lastCalc = Date.now();

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
                if (!this._isLatestRecalc(runSeq)) {
                    return;
                }

                const safetyAllowed = await this._isSolarSafetyAllowed(seasonActive, pumpMode, runSeq);
                if (!safetyAllowed) {
                    this.adapter.log.debug(
                        '[photovoltaicHelper] Collector warning remains active, but the pump safety request is blocked.',
                    );
                    return this._maybeStopPump(true, 0, 'solar_overheat_blocked', runSeq);
                }

                this.adapter.log.warn(
                    '[photovoltaicHelper] Collector overheating detected → pump FORCED ON (safety override active)',
                );
                return this._maybeStartPump('solar_overheat_protection', runSeq);
            }
        } catch (err) {
            this.adapter.log.warn(
                `[photovoltaicHelper] Error while checking solar overheating protection: ${err.message}`,
            );
        }

        // Überschussberechnung
        const surplus = Math.max(0, gen - house);
        // FIX: Nur für die Textausgabe auf ganze Watt runden
        const surplusDisplay = Math.round(surplus);

        const requiredPower = pumpMax + threshold;

        // Wenn Auto-PV die laufende Pumpe tatsächlich hält, ist ihre Leistungsaufnahme
        // bereits im Hausverbrauch enthalten und wird nur für die Halteentscheidung addiert.
        const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
        const pumpSwitch = !!(await this.adapter.getStateAsync('pump.pump_switch'))?.val;
        const currentPumpPower = Math.max(
            0,
            Number((await this.adapter.getStateAsync('pump.current_power'))?.val ?? 0) || 0,
        );
        const pvHoldsRunningPump =
            pumpMode === 'auto_pv' &&
            activeHelper === 'photovoltaicHelper' &&
            pumpSwitch &&
            this._desiredPump === true &&
            !this.afterrunTimer;
        const availablePowerForDecision = surplus + (pvHoldsRunningPump ? currentPumpPower : 0);
        const surplusActive = availablePowerForDecision >= requiredPower && seasonActive;

        const txt = surplusActive
            ? pvHoldsRunningPump
                ? `Überschuss aktiv (Halteprüfung: ${surplusDisplay}+${Math.round(currentPumpPower)} W ≥ ${pumpMax}+${threshold} W)`
                : `Überschuss aktiv (${surplusDisplay} W ≥ ${pumpMax}+${threshold} W)`
            : pvHoldsRunningPump
              ? `Kein ausreichender Überschuss (Halteprüfung: ${surplusDisplay}+${Math.round(currentPumpPower)} W < ${pumpMax}+${threshold} W)`
              : `Kein Überschuss (${surplusDisplay} W < ${pumpMax}+${threshold} W)`;

        if (!this._isLatestRecalc(runSeq)) {
            return;
        }

        // FIX: Bestehende Ergebnisstates zuerst lesen, damit last_update nur bei echter Ergebnisänderung gesetzt wird
        const currentSurplus = Number((await this.adapter.getStateAsync('photovoltaic.power_surplus_w'))?.val ?? 0);
        const currentSurplusActive = !!(await this.adapter.getStateAsync('photovoltaic.surplus_active'))?.val;
        const currentStatusText = (await this.adapter.getStateAsync('photovoltaic.status_text'))?.val ?? '';

        const surplusChanged = currentSurplus !== surplus;
        const surplusActiveChanged = currentSurplusActive !== surplusActive;
        const statusTextChanged = currentStatusText !== txt;

        if (surplusChanged) {
            await this._updateNumberState('photovoltaic.power_surplus_w', surplus, runSeq); // FIX
        }

        if (surplusActiveChanged) {
            await this._updateBoolState('photovoltaic.surplus_active', surplusActive, runSeq); // FIX
        }

        if (statusTextChanged) {
            await this._updateStringState('photovoltaic.status_text', txt, runSeq); // FIX
        }

        if (surplusChanged || surplusActiveChanged || statusTextChanged) {
            await this._updateStringState('photovoltaic.last_update', new Date().toISOString(), runSeq); // FIX
        }

        if (!this._isLatestRecalc(runSeq)) {
            return;
        }

        // Saison/Modus prüfen
        if (!seasonActive) {
            this.adapter.log.debug('[photovoltaicHelper] Season inactive → PV switching logic disabled.');
            return this._maybeStopPump(false, 0, 'season_inactive', runSeq);
        }
        if (pumpMode !== 'auto_pv') {
            this.adapter.log.debug(
                `[photovoltaicHelper] Pump mode is '${pumpMode}' ≠ 'auto_pv' → PV switching logic disabled.`,
            );
            return this._maybeStopPump(false, 0, 'mode_not_auto_pv', runSeq);
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
                        if (!this._isLatestRecalc(runSeq)) {
                            return;
                        }

                        return this._maybeStopPump(true, 0, 'circulation_reached_force_off', runSeq);
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

        // FIX: PV switching logic must only block on fulfilled circulation target if ignoreOnCirc is enabled
        if (surplusActive) {
            if (ignoreOnCirc) {
                try {
                    const remainingState = await this.adapter.getForeignStateAsync(
                        'poolcontrol.0.circulation.daily_remaining',
                    );
                    const remaining = Number(remainingState?.val ?? NaN);

                    // RULE: Start only if circulation target is not fulfilled yet
                    if (Number.isFinite(remaining) && remaining <= 0) {
                        this.adapter.log.info(
                            `[photovoltaicHelper] Daily circulation target already reached (${remaining}) → pump stays OFF (no start despite surplus).`,
                        );
                        if (!this._isLatestRecalc(runSeq)) {
                            return;
                        }

                        return this._maybeStopPump(true, 0, 'circulation_already_reached', runSeq);
                    }
                } catch (err) {
                    this.adapter.log.warn(`[photovoltaicHelper] Error while checking daily_remaining: ${err.message}`);
                }
            }

            // RULE: Surplus active and no circulation blocking active → switch on
            return this._maybeStartPump('pv_surplus', runSeq);
        }

        // RULE: Kein Überschuss → ggf. Nachlauf/Aus
        return this._maybeStopPump(false, afterrunMin, 'pv_ended_afterrun', runSeq);
    },

    async _isControlHelperPriorityActive(runSeq) {
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return false;
        }
        const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return false;
        }
        return activeHelper === 'controlHelper';
    },

    async _isSolarSafetyAllowed(seasonActive, pumpMode, runSeq) {
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return false;
        }
        if (!seasonActive || pumpMode === 'off') {
            return false;
        }

        const maintenanceActive = !!(await this.adapter.getStateAsync('control.pump.maintenance_active'))?.val;
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return false;
        }
        if (maintenanceActive) {
            return false;
        }

        if (pumpMode === 'manual') {
            return !!(await this.adapter.getStateAsync('pump.manual_safety_enabled'))?.val;
        }

        return true;
    },

    _isLatestRecalc(runSeq) {
        return this._active && runSeq === this._recalcRequestSeq && !this._recalcPending;
    },

    async _maybeStartPump(reason, runSeq) {
        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return;
        }

        // FIX: Wenn während eines laufenden Nachlaufs wieder Überschuss kommt,
        // muss der Nachlauf-Timer immer beendet werden
        if (this.afterrunTimer) {
            this.adapter.clearTimeout(this.afterrunTimer);
            this.afterrunTimer = null;
        }
        this._pvPumpHoldUntil = 0;

        const ownsPump = await this._setActiveHelperIfAllowed('photovoltaicHelper', runSeq);
        if (!ownsPump) {
            this._desiredPump = false;
            return;
        }

        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return;
        }

        if (this._desiredPump === true) {
            return;
        }

        this._desiredPump = true;
        this.adapter.log.info(`[photovoltaicHelper] Pump ON (reason: ${reason})`);
        await this._setPumpSwitch(true, runSeq);
    },

    async _maybeStopPump(immediate, afterrunMin, tag, runSeq) {
        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return;
        }

        if (await this._isControlHelperPriorityActive(runSeq)) {
            if (this.afterrunTimer) {
                this.adapter.clearTimeout(this.afterrunTimer);
                this.afterrunTimer = null;
            }
            this._pvPumpHoldUntil = 0;
            this._desiredPump = false;
            this.adapter.log.debug(
                `[photovoltaicHelper] Stop '${tag}' suppressed because controlHelper currently has priority.`,
            );
            return;
        }

        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return;
        }

        if (immediate || !afterrunMin || afterrunMin <= 0) {
            // FIX: Laufenden Nachlauf-Timer bei Sofort-Aus immer sauber beenden
            if (this.afterrunTimer) {
                this.adapter.clearTimeout(this.afterrunTimer);
                this.afterrunTimer = null;
            }
            this._pvPumpHoldUntil = 0;

            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            this._desiredPump = false;

            if (activeHelper !== 'photovoltaicHelper') {
                return;
            }

            this.adapter.log.info(`[photovoltaicHelper] Pump OFF (${tag}, no afterrun)`);
            await this._setPumpSwitch(false, runSeq);
            await this._releaseActiveHelperIfOwned(runSeq);
            return;
        }

        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return;
        }

        const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
        if (activeHelper !== 'photovoltaicHelper') {
            this._desiredPump = false;
            return;
        }

        const holdMs = Math.round(afterrunMin * 60 * 1000);

        // FIX: Nachlauf nur einmal starten, nicht bei jedem Recalc neu setzen
        if (this.afterrunTimer) {
            this.adapter.log.debug(`[photovoltaicHelper] Afterrun already active, timer not restarted (${tag})`);
            return;
        }

        this._pvPumpHoldUntil = Date.now() + holdMs;
        const timer = this.adapter.setTimeout(async () => {
            if (!this._active || this.afterrunTimer !== timer) {
                return;
            }
            // FIX: Timer-Handle direkt freigeben, damit der Zustand sauber ist
            this.afterrunTimer = null;
            this._pvPumpHoldUntil = 0;

            if (await this._isControlHelperPriorityActive()) {
                if (!this._active) {
                    return;
                }
                this.adapter.log.debug(
                    '[photovoltaicHelper] Afterrun stop suppressed because controlHelper currently has priority.',
                );
                this._desiredPump = false;
                return;
            }

            const active = !!(await this.adapter.getStateAsync('photovoltaic.surplus_active'))?.val;
            if (!this._active) {
                return;
            }
            if (active) {
                this.adapter.log.debug('[photovoltaicHelper] Afterrun canceled – surplus active again.');
                return;
            }

            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            if (!this._active) {
                return;
            }
            if (activeHelper !== 'photovoltaicHelper') {
                this._desiredPump = false;
                return;
            }

            this._desiredPump = false;
            this.adapter.log.info('[photovoltaicHelper] Pump OFF (afterrun finished)');
            await this._setPumpSwitch(false);
            if (!this._active) {
                return;
            }
            await this._releaseActiveHelperIfOwned();
        }, holdMs);
        this.afterrunTimer = timer;

        this.adapter.log.debug(`[photovoltaicHelper] Afterrun started: ${afterrunMin} min (${tag})`);
    },

    async _setPumpSwitch(on, runSeq) {
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return;
        }
        try {
            await this.adapter.setStateAsync('pump.pump_switch', { val: !!on, ack: false });
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Could not set pump.pump_switch: ${err.message}`);
        }
    },

    async _setActiveHelperIfAllowed(helperName, runSeq) {
        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return false;
        }
        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
                return false;
            }

            if (activeHelper === helperName) {
                return true;
            }

            if (activeHelper && activeHelper !== helperName) {
                this.adapter.log.debug(
                    `[photovoltaicHelper] Active helper not changed because '${activeHelper}' currently owns the pump.`,
                );
                return false;
            }

            await this.adapter.setStateAsync('pump.active_helper', { val: helperName, ack: true });
            if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
                return false;
            }
            const confirmedHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val;
            if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
                return false;
            }
            return confirmedHelper === helperName;
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Could not set pump.active_helper: ${err.message}`);
            return false;
        }
    },

    async _releaseActiveHelperIfOwned(runSeq) {
        if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
            return;
        }
        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            if (runSeq !== undefined && !this._isLatestRecalc(runSeq)) {
                return;
            }

            if (activeHelper !== 'photovoltaicHelper') {
                return;
            }

            await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicHelper] Could not release pump.active_helper: ${err.message}`);
        }
    },

    async _updateNumberState(id, val, runSeq) {
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return;
        }
        try {
            await this.adapter.setStateAsync(id, { val: Number(val) || 0, ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setNumber ${id} failed: ${e.message}`);
        }
    },
    async _updateBoolState(id, val, runSeq) {
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return;
        }
        try {
            await this.adapter.setStateAsync(id, { val: !!val, ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setBool ${id} failed: ${e.message}`);
        }
    },
    async _updateStringState(id, val, runSeq) {
        if (!this._active || (runSeq !== undefined && !this._isLatestRecalc(runSeq))) {
            return;
        }
        try {
            await this.adapter.setStateAsync(id, { val: String(val ?? ''), ack: true });
        } catch (e) {
            this.adapter.log.warn(`[photovoltaicHelper] setString ${id} failed: ${e.message}`);
        }
    },

    async _safeRecalc(tag) {
        if (!this._active) {
            return;
        }
        this._recalcRequestSeq += 1;
        this._recalcPending = true;
        this._recalcPendingTag = tag;
        this._recalcPendingSeq = this._recalcRequestSeq;

        if (this._recalcRunning) {
            return;
        }

        this._recalcRunning = true;
        let lastRunSeq = this._recalcRequestSeq;

        try {
            while (this._active && this._recalcPending) {
                const nextTag = this._recalcPendingTag || tag;
                const runSeq = this._recalcPendingSeq;
                lastRunSeq = runSeq;
                this._recalcPending = false;
                this._recalcPendingTag = '';
                this._recalcPendingSeq = 0;

                try {
                    await this._recalc(nextTag, runSeq);
                } catch (err) {
                    if (this._active && runSeq === this._recalcRequestSeq) {
                        this.adapter.log.warn(`[photovoltaicHelper] Recalc error (${nextTag}): ${err.message}`);
                    }
                }
            }
        } finally {
            if (this._active && lastRunSeq === this._recalcRequestSeq) {
                this._recalcRunning = false;
            }
        }
    },

    _scheduleRecalc(tag) {
        if (!this._active) {
            return;
        }
        this._recalcRequestSeq += 1;

        if (this.recalcDebounceTimer) {
            this.adapter.clearTimeout(this.recalcDebounceTimer);
            this.recalcDebounceTimer = null;
        }

        const timer = this.adapter.setTimeout(() => {
            if (!this._active || this.recalcDebounceTimer !== timer) {
                return;
            }
            this.recalcDebounceTimer = null;
            void this._safeRecalc(tag);
        }, this._recalcDebounceMs);
        this.recalcDebounceTimer = timer;
    },

    cleanup() {
        this._active = false;
        this._recalcRequestSeq += 1;
        this._initializationPromise = null;

        if (this.recalcDebounceTimer) {
            this.adapter.clearTimeout(this.recalcDebounceTimer);
            this.recalcDebounceTimer = null;
        }
        if (this.afterrunTimer) {
            this.adapter.clearTimeout(this.afterrunTimer);
            this.afterrunTimer = null;
        }
        this._pvPumpHoldUntil = 0;
        this._desiredPump = null;
        this._recalcRunning = false;
        this._recalcPending = false;
        this._recalcPendingTag = '';
        this._recalcPendingSeq = 0;
    },
});

module.exports = photovoltaicHelper;

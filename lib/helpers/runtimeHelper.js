'use strict';

/**
 * runtimeHelper
 * - Zählt Pumpenlaufzeit
 * - Berechnet tägliche Umwälzmenge
 * - Schreibt Werte in die States (Objekte werden in runtimeStates.js angelegt)
 * - Nutzt den zentralen Boolean pump.pump_switch
 * - NEU: zählt Starts, aktuelle Laufzeit, Saisonlaufzeit
 * - NEU: stellt formatiert gespeicherte Laufzeiten nach Neustart korrekt wieder her
 */

const runtimeHelper = {
    adapter: null,
    isRunning: false,
    lastOn: null,
    runtimeTotal: 0, // Gesamtzeit (s)
    runtimeToday: 0, // Tageszeit (s)
    runtimeSeason: 0, // Laufzeit der aktuellen Saison (s)
    startCountToday: 0, // Anzahl Starts heute
    restoreTimer: null, // FIX: ioBroker timer for delayed restore
    resetTimer: null,
    liveTimer: null, // Timer für Live-Updates
    syncTimer: null, // FIX: Timer zur Selbstheilung bei verpasstem Pumpenstart/-stopp
    lastPlausibilityDailyTotal: null,
    lastPlausibilityCheckTs: null,

    /**
     * Initialisiert den Runtime-Helper.
     * Führt eine kurze Startverzögerung ein, um sicherzustellen,
     * dass persistente States nach einer Überinstallation korrekt geladen werden.
     *
     * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz.
     * @returns {Promise<void>}
     */
    async init(adapter) {
        this.adapter = adapter;

        // ------------------------------------------------------
        // NEU: Kurze Startverzögerung, damit ioBroker persistente States
        //      vollständig aus der Datenbank laden kann (Überinstallationsschutz)
        // ------------------------------------------------------
        this.adapter.log.debug('[runtimeHelper] Waiting 3 seconds to load persistent states ...');
        await new Promise(resolve => {
            this.restoreTimer = this.adapter.setTimeout(() => {
                this.restoreTimer = null;
                resolve();
            }, 3000);
        });

        // Pumpenschalter überwachen
        this.adapter.subscribeStates('pump.pump_switch');

        // >>> NEU: Alte Werte aus States laden
        this._restoreFromStates()
            .then(() => {
                // Tagesreset einplanen
                this._scheduleDailyReset();

                // FIX: Start sync timer to recover from missed pump start/stop events
                this._startSyncTimer();

                // Erst nach Restore einmal berechnen
                this._updateStates();

                this.adapter.log.debug('[runtimeHelper] Initialized (with restore)');
            })
            .catch(err => {
                this.adapter.log.warn(`[runtimeHelper] Restore failed: ${err.message}`);
                this._scheduleDailyReset();

                // FIX: Start sync timer to recover from missed pump start/stop events
                this._startSyncTimer();

                this._updateStates();
                this.adapter.log.debug('[runtimeHelper] Initialized (without restore)');
            });
    },

    async _restoreFromStates() {
        const totalRaw = (await this.adapter.getStateAsync('runtime.total'))?.val;
        const todayRaw = (await this.adapter.getStateAsync('runtime.today'))?.val;
        const seasonRaw = (await this.adapter.getStateAsync('runtime.season_total'))?.val;

        const totalSecondsRaw = (await this.adapter.getStateAsync('runtime.total_seconds'))?.val;
        const todaySecondsRaw = (await this.adapter.getStateAsync('runtime.today_seconds'))?.val;
        const seasonSecondsRaw = (await this.adapter.getStateAsync('runtime.season_total_seconds'))?.val;

        const countRaw = (await this.adapter.getStateAsync('runtime.start_count_today'))?.val;

        // FIX: Restore prefers robust numeric seconds states and falls back to formatted legacy text states.
        this.runtimeTotal = this._restoreRuntimeValue(totalSecondsRaw, totalRaw, 'runtime.total');
        this.runtimeToday = this._restoreRuntimeValue(todaySecondsRaw, todayRaw, 'runtime.today');
        this.runtimeSeason = this._restoreRuntimeValue(seasonSecondsRaw, seasonRaw, 'runtime.season_total');
        this.startCountToday = Number(countRaw) || 0;

        await this.adapter.setStateAsync('runtime.total_seconds', { val: this.runtimeTotal, ack: true });
        await this.adapter.setStateAsync('runtime.today_seconds', { val: this.runtimeToday, ack: true });
        await this.adapter.setStateAsync('runtime.season_total_seconds', { val: this.runtimeSeason, ack: true });
        await this.adapter.setStateAsync('runtime.current_session_seconds', { val: 0, ack: true });

        // Falls Pumpe gerade läuft → Status wiederherstellen
        const active = !!(await this.adapter.getStateAsync('pump.pump_switch'))?.val;
        if (active) {
            this.isRunning = true;
            this.lastOn = Date.now();
            this._startLiveTimer();
        }
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // FIX: Robuste Start-/Stop-Logik für pump.pump_switch
        if (id.endsWith('pump.pump_switch')) {
            if (state.val) {
                // FIX: Immer starten, wenn Pumpe an ist (egal welcher Helper)
                if (!this.isRunning || !this.lastOn) {
                    this.isRunning = true;
                    this.lastOn = Date.now();
                    this.startCountToday += 1;

                    // Live-Timer starten (alle 10 Sekunden)
                    this._startLiveTimer();

                    // Start sofort in State schreiben
                    await this.adapter.setStateAsync('runtime.start_count_today', {
                        val: this.startCountToday,
                        ack: true,
                    });

                    // ------------------------------------------------------
                    // Statuswerte bei Pumpenstart setzen
                    // ------------------------------------------------------
                    const nowStr = new Date().toLocaleString();
                    await this.adapter.setStateAsync('status.pump_last_start', { val: nowStr, ack: true });
                    await this.adapter.setStateAsync('status.pump_today_count', {
                        val: this.startCountToday,
                        ack: true,
                    });
                    await this.adapter.setStateAsync('status.pump_was_on_today', { val: true, ack: true });
                    // ------------------------------------------------------
                    this.adapter.log.debug('[runtimeHelper] Pump runtime started.');
                }
            } else {
                // FIX: Immer sauber stoppen, wenn Pumpe aus ist
                if (this.isRunning && this.lastOn) {
                    const delta = Math.floor((Date.now() - this.lastOn) / 1000);
                    this.runtimeToday += delta;
                    this.runtimeTotal += delta;

                    // FIX: Use the actual season state used by the adapter; keep legacy fallback if it exists.
                    const seasonActive = await this._isSeasonActive();
                    if (seasonActive) {
                        this.runtimeSeason += delta;
                    }

                    this.isRunning = false;
                    this.lastOn = null;

                    // Live-Timer stoppen
                    this._stopLiveTimer();

                    // States final aktualisieren
                    await this._updateStates();

                    // ------------------------------------------------------
                    // Statuswert bei Pumpenstopp setzen
                    // ------------------------------------------------------
                    const nowStr = new Date().toLocaleString();
                    await this.adapter.setStateAsync('status.pump_last_stop', { val: nowStr, ack: true });
                    // ------------------------------------------------------
                    this.adapter.log.debug('[runtimeHelper] Pump runtime stopped.');
                } else {
                    // FIX: Falls Pumpe aus, aber kein aktiver Lauf (z. B. Neustart) → nur Timer sicher stoppen
                    this._stopLiveTimer();
                    this.isRunning = false;
                    this.lastOn = null;
                }
            }
        }
    },

    async _updateStates() {
        try {
            // Falls Pumpe läuft → temporäre Laufzeit seit lastOn einrechnen
            const seasonActive = await this._isSeasonActive();
            let effectiveTotal = this.runtimeTotal;
            let effectiveToday = this.runtimeToday;
            let effectiveSeason = this.runtimeSeason;
            let currentSessionSeconds = 0;

            if (this.isRunning && this.lastOn) {
                const delta = Math.floor((Date.now() - this.lastOn) / 1000);
                // FIX: Show the currently running session consistently in total and today.
                effectiveTotal += delta;
                effectiveToday += delta;
                // FIX: Only show the running session in season_total while the same season status is active.
                if (seasonActive) {
                    effectiveSeason += delta;
                }
                currentSessionSeconds = delta;
            }

            // Formatiert schreiben
            const formattedToday = this._formatTime(effectiveToday);
            const formattedTotal = this._formatTime(effectiveTotal);
            const formattedSeason = this._formatTime(effectiveSeason);
            const formattedCurrent = this._formatTime(currentSessionSeconds);

            await this.adapter.setStateAsync('runtime.total', { val: formattedTotal, ack: true });
            await this.adapter.setStateAsync('runtime.today', { val: formattedToday, ack: true });
            await this.adapter.setStateAsync('runtime.current_session', { val: formattedCurrent, ack: true });
            await this.adapter.setStateAsync('runtime.season_total', { val: formattedSeason, ack: true });

            // FIX: Write robust numeric seconds states in parallel to existing formatted text states.
            await this.adapter.setStateAsync('runtime.total_seconds', { val: effectiveTotal, ack: true });
            await this.adapter.setStateAsync('runtime.today_seconds', { val: effectiveToday, ack: true });
            await this.adapter.setStateAsync('runtime.current_session_seconds', {
                val: currentSessionSeconds,
                ack: true,
            });
            await this.adapter.setStateAsync('runtime.season_total_seconds', { val: effectiveSeason, ack: true });

            await this.adapter.setStateAsync('runtime.start_count_today', { val: this.startCountToday, ack: true });

            // Poolparameter laden (vor Durchflussprüfung!)
            const poolSize = (await this.adapter.getStateAsync('general.pool_size'))?.val || 0;
            const minCirc = (await this.adapter.getStateAsync('general.min_circulation_per_day'))?.val || 1;

            // Soll- und Restmenge immer direkt setzen – auch ohne Durchfluss
            const dailyRequired = Math.round(poolSize * minCirc);

            // Bestehenden Tageswert laden, damit daily_remaining unabhängig vom Live-Durchfluss konsistent bleibt
            const oldTotal = Number((await this.adapter.getStateAsync('circulation.daily_total'))?.val || 0);
            const remainingFromCurrentTotal = Math.max(dailyRequired - oldTotal, 0);

            await this.adapter.setStateAsync('circulation.daily_required', { val: dailyRequired, ack: true });
            await this.adapter.setStateAsync('circulation.daily_remaining', {
                val: remainingFromCurrentTotal,
                ack: true,
            });

            // Umwälzmenge berechnen
            // Reeller Durchflusswert aus pump.live.flow_current_lh
            const liveFlowLh = Number((await this.adapter.getStateAsync('pump.live.flow_current_lh'))?.val || 0);

            if (liveFlowLh <= 0) {
                await this._updateCirculationPlausibility({
                    dailyTotal: oldTotal,
                    oldTotal,
                    liveFlowLh,
                    dailyRequired,
                    effectiveToday,
                    currentSessionSeconds,
                });
                this.adapter.log.debug('[runtimeHelper] No live flow value available, calculation skipped');
                return;
            }

            // Berechnung der realen Tagesumwälzung (Liter)
            const dailyTotal = Math.round((effectiveToday / 3600) * liveFlowLh);
            const dailyRemaining = Math.max(dailyRequired - dailyTotal, 0);

            await this._updateCirculationPlausibility({
                dailyTotal,
                oldTotal,
                liveFlowLh,
                dailyRequired,
                effectiveToday,
                currentSessionSeconds,
            });

            // Nur schreiben, wenn tatsächlich sinnvolle Livewerte vorliegen
            if (liveFlowLh > 0 && dailyTotal > 0) {
                await this.adapter.setStateAsync('circulation.daily_total', { val: dailyTotal, ack: true });
                await this.adapter.setStateAsync('circulation.daily_remaining', { val: dailyRemaining, ack: true });
                this.adapter.log.debug(
                    `[runtimeHelper] Circulation values updated (Total=${dailyTotal}, Required=${dailyRequired}, Remaining=${dailyRemaining})`,
                );
            } else {
                this.adapter.log.debug(
                    `[runtimeHelper] No valid live data – keeping existing total (Total=${oldTotal}, Required=${dailyRequired}, Remaining=${remainingFromCurrentTotal})`,
                );
            }
        } catch (err) {
            this.adapter.log.warn(`[runtimeHelper] Error while updating states: ${err.message}`);
        }
    },

    async _updateCirculationPlausibility({
        dailyTotal,
        oldTotal,
        liveFlowLh,
        dailyRequired,
        effectiveToday,
        currentSessionSeconds,
    }) {
        try {
            const nowMs = Date.now();
            const nowIso = new Date(nowMs).toISOString();
            const readNumber = async id => {
                const value = Number((await this.adapter.getStateAsync(id))?.val);
                return Number.isFinite(value) ? value : 0;
            };
            const write = (id, val) => this.adapter.setStateAsync(`circulation.plausibility.${id}`, { val, ack: true });

            const enabledState = await this.adapter.getStateAsync('circulation.plausibility.000_enabled');
            const plausibilityEnabled = enabledState?.val === false ? false : true;

            const currentPower = await readNumber('pump.current_power');
            const pumpMaxWatt = await readNumber('pump.pump_max_watt');
            const pumpPowerLph = await readNumber('pump.pump_power_lph');
            const flowValue = Number.isFinite(Number(liveFlowLh)) ? Number(liveFlowLh) : 0;
            const flowAvailable = flowValue > 0;
            const currentTotal = Number.isFinite(Number(dailyTotal)) ? Number(dailyTotal) : 0;
            const previousTotal =
                this.lastPlausibilityDailyTotal === null ? Number(oldTotal) || 0 : this.lastPlausibilityDailyTotal;

            if (!plausibilityEnabled) {
                await write('00_status', 'disabled');
                await write('01_level', 'info');
                await write('02_message_key', 'circulation_plausibility_disabled');
                await write('03_last_update', nowIso);
                await write('10_power_warning', false);
                await write('20_flow_warning', false);
                await write('30_jump_warning', false);
                await write('40_last_daily_total', previousTotal);
                await write('41_current_daily_total', currentTotal);
                await write('42_delta_liters', 0);
                await write('43_elapsed_seconds', 0);
                await write('44_max_plausible_delta_liters', 0);

                this.lastPlausibilityDailyTotal = currentTotal;
                this.lastPlausibilityCheckTs = nowMs;
                return;
            }

            const powerLimit = pumpMaxWatt > 0 ? pumpMaxWatt * 1.2 : 0;
            const flowLimit = pumpPowerLph > 0 ? pumpPowerLph * 1.2 : 0;
            let powerWarning = currentPower > 0 && powerLimit > 0 && currentPower > powerLimit;
            let flowWarning = flowAvailable && flowLimit > 0 && flowValue > flowLimit;

            let elapsedSeconds = 0;
            let deltaLiters = 0;
            let maxPlausibleDelta = 0;
            let jumpWarning = false;
            const hasPreviousCheck = this.lastPlausibilityCheckTs !== null && this.lastPlausibilityDailyTotal !== null;

            if (hasPreviousCheck) {
                elapsedSeconds = Math.max(0, Math.round((nowMs - this.lastPlausibilityCheckTs) / 1000));
                deltaLiters = Math.max(0, currentTotal - this.lastPlausibilityDailyTotal);

                if (elapsedSeconds > 0 && elapsedSeconds <= 3600 && pumpPowerLph > 0) {
                    maxPlausibleDelta = (pumpPowerLph * 1.5 * elapsedSeconds) / 3600;
                    jumpWarning = deltaLiters > maxPlausibleDelta;
                }
            }

            if (!flowAvailable) {
                flowWarning = false;
                jumpWarning = false;
            }

            const warningCount = [powerWarning, flowWarning, jumpWarning].filter(Boolean).length;
            let status = 'ok';
            let level = 'ok';
            let messageKey = 'circulation_plausibility_ok';

            if (warningCount > 0) {
                status = 'warning';
                level = 'warning';
                if (warningCount > 1) {
                    messageKey = 'circulation_plausibility_multiple_warnings';
                } else if (powerWarning) {
                    messageKey = 'circulation_plausibility_power_warning';
                } else if (flowWarning) {
                    messageKey = 'circulation_plausibility_flow_warning';
                } else {
                    messageKey = 'circulation_plausibility_daily_total_jump_warning';
                }
            } else if (!flowAvailable) {
                status = 'unchecked';
                level = 'info';
                messageKey = 'circulation_plausibility_no_flow';
            }

            await write('00_status', status);
            await write('01_level', level);
            await write('02_message_key', messageKey);
            await write('03_last_update', nowIso);
            await write('10_power_warning', powerWarning);
            await write('11_power_value_w', currentPower > 0 ? currentPower : 0);
            await write('12_power_limit_w', powerLimit > 0 ? powerLimit : 0);
            await write('20_flow_warning', flowWarning);
            await write('21_flow_value_lh', flowAvailable ? flowValue : 0);
            await write('22_flow_limit_lh', flowLimit > 0 ? flowLimit : 0);
            await write('24_flow_available', flowAvailable);
            await write('30_jump_warning', jumpWarning);
            await write('31_jump_value_liters', deltaLiters);
            await write('32_jump_limit_liters', maxPlausibleDelta);
            await write('40_last_daily_total', previousTotal);
            await write('41_current_daily_total', currentTotal);
            await write('42_delta_liters', deltaLiters);
            await write('43_elapsed_seconds', elapsedSeconds);
            await write('44_max_plausible_delta_liters', maxPlausibleDelta);

            if (powerWarning) {
                await write('13_power_warning_at', nowIso);
            }
            if (flowWarning) {
                await write('23_flow_warning_at', nowIso);
            }
            if (jumpWarning) {
                await write('33_jump_warning_at', nowIso);
            }

            this.lastPlausibilityDailyTotal = currentTotal;
            this.lastPlausibilityCheckTs = nowMs;

            if (warningCount > 0) {
                this.adapter.log.warn(
                    `[runtimeHelper] Circulation plausibility warning: power=${powerWarning}, flow=${flowWarning}, jump=${jumpWarning}, dailyTotal=${currentTotal}, delta=${deltaLiters}, maxDelta=${maxPlausibleDelta}`,
                );
            } else {
                this.adapter.log.debug(
                    `[runtimeHelper] Circulation plausibility updated (status=${status}, dailyTotal=${currentTotal}, flow=${flowValue}, required=${dailyRequired}, effectiveToday=${effectiveToday}, currentSession=${currentSessionSeconds})`,
                );
            }
        } catch (err) {
            this.adapter.log.warn(
                `[runtimeHelper] Error while updating circulation plausibility states: ${err.message}`,
            );
        }
    },

    _formatTime(seconds) {
        seconds = Math.max(0, Math.floor(seconds));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    },

    _restoreRuntimeValue(secondsRaw, formattedRaw, stateName) {
        const seconds = Number(secondsRaw);
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.floor(seconds);
        }

        const parsed = this._parseFormattedTimeToSeconds(formattedRaw);
        if (parsed > 0) {
            return parsed;
        }

        if (formattedRaw && String(formattedRaw).trim() !== '0h 0m 0s') {
            this.adapter.log.warn(
                `[runtimeHelper] Could not restore ${stateName} from value "${formattedRaw}". Keeping runtime at 0.`,
            );
        }

        return 0;
    },

    async _isSeasonActive() {
        // FIX: status.season_active is the canonical season state used by the adapter.
        const statusSeason = await this.adapter.getStateAsync('status.season_active');
        if (statusSeason && statusSeason.val !== null && statusSeason.val !== undefined) {
            return !!statusSeason.val;
        }

        // FIX: Keep a backward-compatible fallback for installations that still provide this legacy state.
        const controlSeason = await this.adapter.getStateAsync('control.season.active');
        return !!controlSeason?.val;
    },

    // >>> NEU: formatierten Text (z. B. "3h 12m 5s") in Sekunden zurückrechnen
    _parseFormattedTimeToSeconds(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        } // bereits Sekunden
        const str = String(value ?? '').trim();
        if (!str) {
            return 0;
        }

        let h = 0,
            m = 0,
            s = 0;
        const mh = str.match(/(\d+)\s*h/);
        if (mh) {
            h = parseInt(mh[1], 10);
        }
        const mm = str.match(/(\d+)\s*m/);
        if (mm) {
            m = parseInt(mm[1], 10);
        }
        const ms = str.match(/(\d+)\s*s/);
        if (ms) {
            s = parseInt(ms[1], 10);
        }

        return h * 3600 + m * 60 + s;
    },

    _scheduleDailyReset() {
        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight - now;

        this.resetTimer = this.adapter.setTimeout(async () => {
            this.runtimeToday = 0;
            this.startCountToday = 0;
            this.lastOn = this.isRunning ? Date.now() : null;
            this.lastPlausibilityDailyTotal = 0;
            this.lastPlausibilityCheckTs = Date.now();

            await this.adapter.setStateAsync('circulation.plausibility.40_last_daily_total', { val: 0, ack: true });
            await this.adapter.setStateAsync('circulation.plausibility.41_current_daily_total', { val: 0, ack: true });
            await this.adapter.setStateAsync('circulation.plausibility.42_delta_liters', { val: 0, ack: true });
            await this.adapter.setStateAsync('circulation.plausibility.43_elapsed_seconds', { val: 0, ack: true });
            await this.adapter.setStateAsync('circulation.plausibility.44_max_plausible_delta_liters', {
                val: 0,
                ack: true,
            });

            // Laufzeiten zurücksetzen
            await this._updateStates();

            // --- NEU: Circulation-Werte um Mitternacht zurücksetzen ---
            await this.adapter.setStateAsync('circulation.daily_total', { val: 0, ack: true });

            // daily_required neu berechnen (optional, falls sich Poolgröße geändert hat)
            const poolSize = (await this.adapter.getStateAsync('general.pool_size'))?.val || 0;
            const minCirc = (await this.adapter.getStateAsync('general.min_circulation_per_day'))?.val || 1;
            const dailyRequired = Math.round(poolSize * minCirc);
            await this.adapter.setStateAsync('circulation.daily_required', { val: dailyRequired, ack: true });

            // 👉 daily_remaining neue berechnen auf Grundlage von daily_required
            await this.adapter.setStateAsync('circulation.daily_remaining', { val: dailyRequired, ack: true });

            // ------------------------------------------------------
            // NEU: Pumpenstatuswerte um Mitternacht zurücksetzen
            // ------------------------------------------------------
            await this.adapter.setStateAsync('status.pump_today_count', { val: 0, ack: true });
            await this.adapter.setStateAsync('status.pump_was_on_today', { val: false, ack: true });
            // ------------------------------------------------------

            // Nächsten Reset planen
            this._scheduleDailyReset();

            this.adapter.log.debug('[runtimeHelper] Daily reset (runtime + circulation) executed.');
        }, msUntilMidnight);
    },

    _startLiveTimer() {
        if (this.liveTimer) {
            this.adapter.clearInterval(this.liveTimer);
        }
        this.liveTimer = this.adapter.setInterval(() => this._updateStates(), 10 * 1000);
        this.adapter.log.debug('[runtimeHelper] Live timer started (updates every 10 seconds)');
    },

    _stopLiveTimer() {
        if (this.liveTimer) {
            this.adapter.clearInterval(this.liveTimer);
            this.liveTimer = null;
            this.adapter.log.debug('[runtimeHelper] Live timer stopped');
        }
    },

    _startSyncTimer() {
        if (this.syncTimer) {
            this.adapter.clearInterval(this.syncTimer);
        }

        this.syncTimer = this.adapter.setInterval(() => this._syncPumpRuntimeState(), 30 * 1000);
        this.adapter.log.debug('[runtimeHelper] FIX: Runtime sync timer started (checks every 30 seconds)');
    },

    async _syncPumpRuntimeState() {
        try {
            const pumpState = await this.adapter.getStateAsync('pump.pump_switch');
            const pumpOn = pumpState?.val === true;

            if (pumpOn && (!this.isRunning || !this.lastOn)) {
                this.adapter.log.debug(
                    '[runtimeHelper] FIX: Pump switch is ON but runtime was not running. Synchronizing runtime start.',
                );
                await this.handleStateChange('pump.pump_switch', { val: true, ack: true });
                return;
            }

            // FIX: Stop synchronization is intentionally not handled here.
            // A missed stop event could otherwise cause duplicate runtime accounting
            // during parallel async stop handling. Normal stop events are still handled
            // through handleStateChange().
            // if (!pumpOn && (this.isRunning || this.lastOn)) {
            //    this.adapter.log.debug(
            //        '[runtimeHelper] FIX: Pump switch is OFF but runtime was still running. Synchronizing runtime stop.',
            //    );
            //    await this.handleStateChange('pump.pump_switch', { val: false, ack: true });
            // }
        } catch (err) {
            this.adapter.log.warn(`[runtimeHelper] Error while synchronizing pump runtime state: ${err.message}`);
        }
    },

    cleanup() {
        if (this.restoreTimer) {
            this.adapter.clearTimeout(this.restoreTimer);
            this.restoreTimer = null;
        }

        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        if (this.syncTimer) {
            this.adapter.clearInterval(this.syncTimer);
            this.syncTimer = null;
        }

        this._stopLiveTimer();
    },
};

module.exports = runtimeHelper;

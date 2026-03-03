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
    resetTimer: null,
    liveTimer: null, // Timer für Live-Updates

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
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Pumpenschalter überwachen
        this.adapter.subscribeStates('pump.pump_switch');

        // >>> NEU: Alte Werte aus States laden
        this._restoreFromStates()
            .then(() => {
                // Tagesreset einplanen
                this._scheduleDailyReset();

                // Erst nach Restore einmal berechnen
                this._updateStates();

                this.adapter.log.debug('[runtimeHelper] Initialized (with restore)');
            })
            .catch(err => {
                this.adapter.log.warn(`[runtimeHelper] Restore failed: ${err.message}`);
                this._scheduleDailyReset();
                this._updateStates();
                this.adapter.log.debug('[runtimeHelper] Initialized (without restore)');
            });
    },

    async _restoreFromStates() {
        const totalRaw = (await this.adapter.getStateAsync('runtime.total'))?.val;
        const todayRaw = (await this.adapter.getStateAsync('runtime.today'))?.val;
        const seasonRaw = (await this.adapter.getStateAsync('runtime.season_total'))?.val;
        const countRaw = (await this.adapter.getStateAsync('runtime.start_count_today'))?.val;

        // FIX: Falls States leer oder neu angelegt sind, Warnhinweis ausgeben und Werte nicht überschreiben
        if (!totalRaw && !seasonRaw) {
            this.adapter.log.info(
                '[runtimeHelper] No saved runtimes found – possibly a new or reinstalled instance. Runtimes start at 0.',
            );
        }

        // >>> NEU: Formatierten Text (z. B. "3h 12m 5s") in Sekunden umwandeln
        this.runtimeTotal = this._parseFormattedTimeToSeconds(totalRaw);
        this.runtimeToday = this._parseFormattedTimeToSeconds(todayRaw);
        this.runtimeSeason = this._parseFormattedTimeToSeconds(seasonRaw);
        this.startCountToday = Number(countRaw) || 0;

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

                    // Live-Timer starten (jede Minute)
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

                    // Saisonlaufzeit nur zählen, wenn aktiv
                    const seasonActive = !!(await this.adapter.getStateAsync('control.season.active'))?.val;
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
            let effectiveToday = this.runtimeToday;
            let effectiveSeason = this.runtimeSeason;
            let currentSessionSeconds = 0;

            if (this.isRunning && this.lastOn) {
                const delta = Math.floor((Date.now() - this.lastOn) / 1000);
                effectiveToday += delta;
                effectiveSeason += delta;
                currentSessionSeconds = delta;
            }

            // Formatiert schreiben
            const formattedToday = this._formatTime(effectiveToday);
            const formattedTotal = this._formatTime(this.runtimeTotal);
            const formattedSeason = this._formatTime(effectiveSeason);
            const formattedCurrent = this._formatTime(currentSessionSeconds);

            await this.adapter.setStateAsync('runtime.total', { val: formattedTotal, ack: true });
            await this.adapter.setStateAsync('runtime.today', { val: formattedToday, ack: true });
            await this.adapter.setStateAsync('runtime.current_session', { val: formattedCurrent, ack: true });
            await this.adapter.setStateAsync('runtime.season_total', { val: formattedSeason, ack: true });
            await this.adapter.setStateAsync('runtime.start_count_today', { val: this.startCountToday, ack: true });

            // Poolparameter laden (vor Durchflussprüfung!)
            const poolSize = (await this.adapter.getStateAsync('general.pool_size'))?.val || 0;
            const minCirc = (await this.adapter.getStateAsync('general.min_circulation_per_day'))?.val || 1;

            // daily_required immer direkt setzen – auch ohne Durchfluss
            const dailyRequired = Math.round(poolSize * minCirc);
            if (dailyRequired > 0) {
                await this.adapter.setStateAsync('circulation.daily_required', { val: dailyRequired, ack: true });
            }

            // Umwälzmenge berechnen
            // Reeller Durchflusswert aus pump.live.flow_current_lh
            const liveFlowLh = (await this.adapter.getStateAsync('pump.live.flow_current_lh'))?.val || 0;

            if (liveFlowLh <= 0) {
                this.adapter.log.debug('[runtimeHelper] No live flow value available, calculation skipped');
                return;
            }

            // Berechnung der realen Tagesumwälzung (Liter)
            const dailyTotal = Math.round((effectiveToday / 3600) * liveFlowLh);
            const dailyRemaining = Math.max(dailyRequired - dailyTotal, 0);

            // Bestehende Werte für Total/Remaining laden
            const oldTotal = (await this.adapter.getStateAsync('circulation.daily_total'))?.val || 0;
            const oldRemaining = (await this.adapter.getStateAsync('circulation.daily_remaining'))?.val || 0;

            // Nur schreiben, wenn tatsächlich sinnvolle Livewerte vorliegen
            if (liveFlowLh > 0 && dailyTotal > 0) {
                await this.adapter.setStateAsync('circulation.daily_total', { val: dailyTotal, ack: true });
                await this.adapter.setStateAsync('circulation.daily_remaining', { val: dailyRemaining, ack: true });
                this.adapter.log.debug(
                    `[runtimeHelper] Circulation values updated (Total=${dailyTotal}, Required=${dailyRequired}, Remaining=${dailyRemaining})`,
                );
            } else {
                this.adapter.log.debug(
                    `[runtimeHelper] No valid live data – keeping existing values (Total=${oldTotal}, Required=${dailyRequired}, Remaining=${oldRemaining})`,
                );
            }
        } catch (err) {
            this.adapter.log.warn(`[runtimeHelper] Error while updating states: ${err.message}`);
        }
    },

    _formatTime(seconds) {
        seconds = Math.max(0, Math.floor(seconds));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
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
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight - now;

        this.resetTimer = setTimeout(async () => {
            this.runtimeToday = 0;
            this.startCountToday = 0;
            this.lastOn = this.isRunning ? Date.now() : null;

            // Laufzeiten zurücksetzen
            this._updateStates();

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
            clearInterval(this.liveTimer);
        }
        this.liveTimer = setInterval(() => this._updateStates(), 10 * 1000);
        this.adapter.log.debug('[runtimeHelper] Live timer started (updates every 10 seconds)');
    },

    _stopLiveTimer() {
        if (this.liveTimer) {
            clearInterval(this.liveTimer);
            this.liveTimer = null;
            this.adapter.log.debug('[runtimeHelper] Live timer stopped');
        }
    },

    cleanup() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        this._stopLiveTimer();
    },
};

module.exports = runtimeHelper;

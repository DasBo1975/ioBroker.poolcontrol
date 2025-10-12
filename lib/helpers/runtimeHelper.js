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

    init(adapter) {
        this.adapter = adapter;

        // Pumpenschalter überwachen
        this.adapter.subscribeStates('pump.pump_switch');

        // >>> NEU: Alte Werte aus States laden
        this._restoreFromStates()
            .then(() => {
                // Tagesreset einplanen
                this._scheduleDailyReset();

                // Erst nach Restore einmal berechnen
                this._updateStates();

                this.adapter.log.debug('[runtimeHelper] initialisiert (mit Restore)');
            })
            .catch(err => {
                this.adapter.log.warn(`[runtimeHelper] Restore fehlgeschlagen: ${err.message}`);
                this._scheduleDailyReset();
                this._updateStates();
                this.adapter.log.debug('[runtimeHelper] initialisiert (ohne Restore)');
            });
    },

    async _restoreFromStates() {
        const totalRaw = (await this.adapter.getStateAsync('runtime.total'))?.val;
        const todayRaw = (await this.adapter.getStateAsync('runtime.today'))?.val;
        const seasonRaw = (await this.adapter.getStateAsync('runtime.season_total'))?.val;
        const countRaw = (await this.adapter.getStateAsync('runtime.start_count_today'))?.val;

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

        if (id.endsWith('pump.pump_switch')) {
            if (state.val && !this.isRunning) {
                // Pumpe startet
                this.isRunning = true;
                this.lastOn = Date.now();
                this.startCountToday += 1;

                // Live-Timer starten (jede Minute)
                this._startLiveTimer();

                // Start sofort in State schreiben
                await this.adapter.setStateAsync('runtime.start_count_today', { val: this.startCountToday, ack: true });
            } else if (!state.val && this.isRunning) {
                // Pumpe stoppt
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

            // Umwälzmenge berechnen
            // Reeller Durchflusswert aus pump.live.flow_current_lh
            const liveFlowLh = (await this.adapter.getStateAsync('pump.live.flow_current_lh'))?.val || 0;

            if (liveFlowLh <= 0) {
                this.adapter.log.debug('[runtimeHelper] Kein Live-Durchflusswert vorhanden, Berechnung übersprungen');
                return;
            }

            // Poolparameter laden
            const poolSize = (await this.adapter.getStateAsync('general.pool_size'))?.val || 0;
            const minCirc = (await this.adapter.getStateAsync('general.min_circulation_per_day'))?.val || 1;

            // Berechnung der realen Tagesumwälzung (Liter)
            const dailyTotal = Math.round((effectiveToday / 3600) * liveFlowLh);
            const dailyRequired = Math.round(poolSize * minCirc);
            const dailyRemaining = Math.max(dailyRequired - dailyTotal, 0);

            // --- NEU: Bestehende persistente Werte schützen ---
            const oldTotal = (await this.adapter.getStateAsync('circulation.daily_total'))?.val || 0;
            const oldRequired = (await this.adapter.getStateAsync('circulation.daily_required'))?.val || 0;
            const oldRemaining = (await this.adapter.getStateAsync('circulation.daily_remaining'))?.val || 0;

            if (liveFlowLh > 0 && dailyTotal > 0) {
                await this.adapter.setStateAsync('circulation.daily_total', { val: dailyTotal, ack: true });
                await this.adapter.setStateAsync('circulation.daily_required', { val: dailyRequired, ack: true });
                await this.adapter.setStateAsync('circulation.daily_remaining', { val: dailyRemaining, ack: true });
                this.adapter.log.debug(
                    `[runtimeHelper] Circulation-Werte aktualisiert (Total=${dailyTotal}, Required=${dailyRequired}, Remaining=${dailyRemaining})`,
                );
            } else {
                this.adapter.log.debug(
                    `[runtimeHelper] Keine gültigen Live-Daten – bestehende Werte bleiben erhalten (Total=${oldTotal}, Required=${oldRequired}, Remaining=${oldRemaining})`,
                );
            }
        } catch (err) {
            this.adapter.log.warn(`[runtimeHelper] Fehler beim Update der States: ${err.message}`);
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

        this.resetTimer = setTimeout(() => {
            this.runtimeToday = 0;
            this.startCountToday = 0;
            this.lastOn = this.isRunning ? Date.now() : null;
            this._updateStates();
            this._scheduleDailyReset();
        }, msUntilMidnight);
    },

    _startLiveTimer() {
        if (this.liveTimer) {
            clearInterval(this.liveTimer);
        }
        this.liveTimer = setInterval(() => this._updateStates(), 60 * 1000);
        this.adapter.log.debug('[runtimeHelper] Live-Timer gestartet (Updates jede Minute)');
    },

    _stopLiveTimer() {
        if (this.liveTimer) {
            clearInterval(this.liveTimer);
            this.liveTimer = null;
            this.adapter.log.debug('[runtimeHelper] Live-Timer gestoppt');
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

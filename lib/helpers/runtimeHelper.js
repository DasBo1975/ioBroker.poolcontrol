'use strict';

/**
 * runtimeHelper
 * - Zählt Pumpenlaufzeit
 * - Berechnet tägliche Umwälzmenge
 * - Schreibt Werte in die States (Objekte werden in runtimeStates.js angelegt)
 * - Nutzt den zentralen Boolean pump.pump_switch
 */

const runtimeHelper = {
    adapter: null,
    isRunning: false,
    lastOn: null,
    runtimeTotal: 0, // Gesamtzeit (s)
    runtimeToday: 0, // Tageszeit (s)
    resetTimer: null,
    liveTimer: null, // Timer für Live-Updates

    init(adapter) {
        this.adapter = adapter;

        // Pumpenschalter überwachen
        this.adapter.subscribeStates('pump.pump_switch');

        // >>> NEU: Alte Werte aus States laden
        this._restoreFromStates().then(() => {
            // Tagesreset einplanen
            this._scheduleDailyReset();

            // Erst nach Restore einmal berechnen
            this._updateStates();

            this.adapter.log.info('[runtimeHelper] initialisiert (mit Restore)');
        }).catch(err => {
            this.adapter.log.warn(`[runtimeHelper] Restore fehlgeschlagen: ${err.message}`);
            this._scheduleDailyReset();
            this._updateStates();
            this.adapter.log.info('[runtimeHelper] initialisiert (ohne Restore)');
        });
    },

    async _restoreFromStates() {
        const total = Number((await this.adapter.getStateAsync('runtime.total'))?.val);
        const today = Number((await this.adapter.getStateAsync('runtime.today'))?.val);

        if (Number.isFinite(total)) this.runtimeTotal = total;
        if (Number.isFinite(today)) this.runtimeToday = today;

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

                // Live-Timer starten (jede Minute)
                this._startLiveTimer();
            } else if (!state.val && this.isRunning) {
                // Pumpe stoppt
                const delta = Math.floor((Date.now() - this.lastOn) / 1000);
                this.runtimeToday += delta;
                this.runtimeTotal += delta;
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
            if (this.isRunning && this.lastOn) {
                const delta = Math.floor((Date.now() - this.lastOn) / 1000);
                effectiveToday += delta;
            }

            // Laufzeit-States setzen
            await this.adapter.setStateAsync('runtime.total', {
                val: this.runtimeTotal,
                ack: true,
            });
            await this.adapter.setStateAsync('runtime.today', {
                val: effectiveToday,
                ack: true,
            });
            await this.adapter.setStateAsync('runtime.formatted', {
                val: this._formatTime(effectiveToday),
                ack: true,
            });

            // Umwälzmenge berechnen
            const pumpLph = (await this.adapter.getStateAsync('pump.pump_power_lph'))?.val || 0;
            const poolSize = (await this.adapter.getStateAsync('general.pool_size'))?.val || 0;
            const minCirc = (await this.adapter.getStateAsync('general.min_circulation_per_day'))?.val || 1;

            const dailyTotal = Math.round((effectiveToday / 3600) * pumpLph);
            const dailyRequired = Math.round(poolSize * minCirc);
            const dailyRemaining = Math.max(dailyRequired - dailyTotal, 0);

            await this.adapter.setStateAsync('circulation.daily_total', {
                val: dailyTotal,
                ack: true,
            });
            await this.adapter.setStateAsync('circulation.daily_required', {
                val: dailyRequired,
                ack: true,
            });
            await this.adapter.setStateAsync('circulation.daily_remaining', {
                val: dailyRemaining,
                ack: true,
            });
        } catch (err) {
            this.adapter.log.warn(`[runtimeHelper] Fehler beim Update der States: ${err.message}`);
        }
    },

    _formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    },

    _scheduleDailyReset() {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight - now;

        this.resetTimer = setTimeout(() => {
            this.runtimeToday = 0;
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

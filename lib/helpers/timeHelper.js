'use strict';

/**
 * timeHelper
 * - Überwacht Zeitfenster (time1, time2, time3)
 * - Schaltet Pumpe, wenn Modus "time" aktiv ist
 * - Schaltet über die reale Steckdosen-ID aus der Config
 */

const timeHelper = {
    adapter: null,
    checkTimer: null,

    init(adapter) {
        this.adapter = adapter;

        // Minütlicher Check
        this._scheduleCheck();

        this.adapter.log.debug('[timeHelper] initialisiert (Prüfung alle 60s)');
    },

    _scheduleCheck() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
        }
        this.checkTimer = setInterval(() => this._checkWindows(), 60 * 1000);
        // Beim Start sofort prüfen
        this._checkWindows();
    },

    async _checkWindows() {
        try {
            const mode = (await this.adapter.getStateAsync('pump.mode'))?.val;
            if (mode !== 'time') {
                return;
            } // nur aktiv im Zeitmodus

            const pumpSwitchId = this.adapter.config.pump_switch;
            if (!pumpSwitchId) {
                this.adapter.log.warn('[timeHelper] Keine pump_switch (Fremd-ID) konfiguriert!');
                return;
            }

            const now = new Date();
            const hhmm = now.toTimeString().slice(0, 5); // "HH:MM"
            const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];

            let shouldRun = false;
            for (let i = 1; i <= 3; i++) {
                const active = (await this.adapter.getStateAsync(`timecontrol.time${i}_active`))?.val;
                const start = (await this.adapter.getStateAsync(`timecontrol.time${i}_start`))?.val;
                const end = (await this.adapter.getStateAsync(`timecontrol.time${i}_end`))?.val;
                const dayOk = (await this.adapter.getStateAsync(`timecontrol.time${i}_day_${weekday}`))?.val;

                if (active && dayOk && this._inTimeRange(hhmm, start, end)) {
                    shouldRun = true;
                    break;
                }
            }

            // --- NEU: Sprachsignal für Zeitsteuerung setzen ---
            await this.adapter.setStateAsync('speech.time_active', {
                val: shouldRun,
                ack: true,
            });

            // Pumpe über die echte Steckdosen-ID schalten
            await this.adapter.setForeignStateAsync(pumpSwitchId, {
                val: shouldRun,
                ack: false,
            });
            this.adapter.log.debug(`[timeHelper] Pumpe ${shouldRun ? 'EIN' : 'AUS'} (${hhmm})`);
        } catch (err) {
            this.adapter.log.warn(`[timeHelper] Fehler im Check: ${err.message}`);
        }
    },

    _inTimeRange(now, start, end) {
        if (!start || !end) {
            return false;
        }
        return start <= now && now < end;
    },

    cleanup() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = timeHelper;

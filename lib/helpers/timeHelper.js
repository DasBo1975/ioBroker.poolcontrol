'use strict';

/**
 * timeHelper
 * - Überwacht Zeitfenster (time1, time2, time3)
 * - Schaltet Pumpe, wenn Modus "time" aktiv ist
 * - Schaltet über den internen Pumpenschalter (pump.pump_switch)
 * - Die eigentliche Steckdose wird vom pumpHelper gespiegelt
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

            // NEU: Wenn nicht im Zeitmodus, ggf. Vorrang freigeben
            if (mode !== 'time') {
                const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val;
                if (activeHelper === 'timeHelper') {
                    await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                    this.adapter.log.debug('[timeHelper] Zeitmodus beendet – Vorrang an Solar/Control freigegeben.');
                }
                return;
            } // nur aktiv im Zeitmodus

            // Interner Pumpenschalter statt externer Steckdose
            const pumpStateId = 'pump.pump_switch';

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

            // --- Sprachsignal für Zeitsteuerung setzen ---
            const oldVal = (await this.adapter.getStateAsync('speech.time_active'))?.val;
            if (oldVal !== shouldRun) {
                await this.adapter.setStateAsync('speech.time_active', {
                    val: shouldRun,
                    ack: true,
                });
            }

            // NEU: Vorrangverwaltung (active_helper)
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val;
            if (shouldRun && activeHelper !== 'timeHelper') {
                await this.adapter.setStateAsync('pump.active_helper', { val: 'timeHelper', ack: true });
                this.adapter.log.debug('[timeHelper] Vorrang übernommen (Zeitfenster aktiv).');
            }
            if (!shouldRun && activeHelper === 'timeHelper') {
                await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                this.adapter.log.debug('[timeHelper] Vorrang zurückgegeben (Zeitfenster beendet).');
            }

            // --- Nur schalten, wenn sich der Zustand wirklich ändert ---
            const currentState = (await this.adapter.getStateAsync(pumpStateId))?.val;
            if (currentState !== shouldRun) {
                await this.adapter.setStateAsync(pumpStateId, {
                    val: shouldRun,
                    ack: false,
                });
                this.adapter.log.debug(`[timeHelper] Pumpenschalter ${shouldRun ? 'EIN' : 'AUS'} (${hhmm})`);
            } else {
                this.adapter.log.debug(
                    `[timeHelper] Keine Änderung (${hhmm}) – Zustand bleibt ${shouldRun ? 'EIN' : 'AUS'}.`,
                );
            }
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

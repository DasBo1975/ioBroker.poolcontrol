'use strict';

const { I18n } = require('@iobroker/adapter-core');

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

        this.adapter.log.debug('[timeHelper] Initialized (check every 60s)');
    },

    _scheduleCheck() {
        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
        }
        this.checkTimer = this.adapter.setInterval(() => this._checkWindows(), 60 * 1000);
        // Beim Start sofort prüfen
        void this._checkWindows();
    },

    async _checkWindows() {
        try {
            const mode = (await this.adapter.getStateAsync('pump.mode'))?.val;

            // NEU: Wenn nicht im Zeitmodus, ggf. Vorrang freigeben
            if (mode !== 'time') {
                const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val;
                if (activeHelper === 'timeHelper') {
                    await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                    this.adapter.log.debug('[timeHelper] Time mode ended – priority released to solar/control.');
                }
                await this.adapter.setStateChangedAsync('timecontrol.status_text', { val: '', ack: true });
                return;
            } // nur aktiv im Zeitmodus

            // Interner Pumpenschalter statt externer Steckdose
            const pumpStateId = 'pump.pump_switch';

            const now = new Date();
            const hhmm = now.toTimeString().slice(0, 5); // "HH:MM"
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];

            let shouldRun = false;
            let intervalWindowActive = false;
            let pausedIntervalExists = false;
            let invalidIntervalExists = false;
            for (let i = 1; i <= 3; i++) {
                const active = (await this.adapter.getStateAsync(`timecontrol.time${i}_active`))?.val;
                const start = (await this.adapter.getStateAsync(`timecontrol.time${i}_start`))?.val;
                const end = (await this.adapter.getStateAsync(`timecontrol.time${i}_end`))?.val;
                const dayOk = (await this.adapter.getStateAsync(`timecontrol.time${i}_day_${weekday}`))?.val;

                if (active && dayOk && this._inTimeRange(hhmm, start, end)) {
                    const intervalActive =
                        (await this.adapter.getStateAsync(`timecontrol.time${i}_interval_active`))?.val === true;

                    if (!intervalActive) {
                        shouldRun = true;
                        continue;
                    }

                    intervalWindowActive = true;
                    const intervalEvery = Number(
                        (await this.adapter.getStateAsync(`timecontrol.time${i}_interval_every_min`))?.val,
                    );
                    const intervalRun = Number(
                        (await this.adapter.getStateAsync(`timecontrol.time${i}_interval_run_min`))?.val,
                    );
                    const startMinutes = this._timeToMinutes(start);
                    const intervalValid =
                        startMinutes !== null &&
                        Number.isFinite(intervalEvery) &&
                        intervalEvery >= 10 &&
                        intervalEvery <= 1440 &&
                        Number.isFinite(intervalRun) &&
                        intervalRun >= 5 &&
                        intervalRun <= 1440 &&
                        intervalRun <= intervalEvery;

                    if (!intervalValid) {
                        invalidIntervalExists = true;
                        shouldRun = true;
                        continue;
                    }

                    const elapsed = nowMinutes - startMinutes;
                    const phase = elapsed % intervalEvery;
                    if (phase < intervalRun) {
                        shouldRun = true;
                    } else {
                        pausedIntervalExists = true;
                    }
                }
            }

            let statusText = '';
            if (invalidIntervalExists) {
                statusText = I18n.translate('Invalid interval configuration');
            } else if (shouldRun && pausedIntervalExists) {
                statusText = I18n.translate('Another time window keeps the pump running');
            } else if (intervalWindowActive) {
                statusText = I18n.translate('Interval mode active');
            } else if (shouldRun) {
                statusText = I18n.translate('Time control active');
            }
            await this.adapter.setStateChangedAsync('timecontrol.status_text', { val: statusText, ack: true });

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
                this.adapter.log.debug('[timeHelper] Priority claimed (time window active).');
            }
            if (!shouldRun && activeHelper === 'timeHelper') {
                await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                this.adapter.log.debug('[timeHelper] Priority released (time window ended).');
            }

            // --- Nur schalten, wenn sich der Zustand wirklich ändert ---
            const currentState = (await this.adapter.getStateAsync(pumpStateId))?.val;
            if (currentState !== shouldRun) {
                await this.adapter.setStateAsync(pumpStateId, {
                    val: shouldRun,
                    ack: false,
                });
                this.adapter.log.debug(`[timeHelper] Pump switch ${shouldRun ? 'ON' : 'OFF'} (${hhmm})`);
            } else {
                this.adapter.log.debug(`[timeHelper] No change (${hhmm}) – state remains ${shouldRun ? 'ON' : 'OFF'}.`);
            }
        } catch (err) {
            this.adapter.log.warn(`[timeHelper] Error during check: ${err.message}`);
        }
    },

    _inTimeRange(now, start, end) {
        if (!start || !end) {
            return false;
        }
        return start <= now && now < end;
    },

    _timeToMinutes(value) {
        const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
        if (!match) {
            return null;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) {
            return null;
        }

        return hours * 60 + minutes;
    },

    cleanup() {
        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = timeHelper;

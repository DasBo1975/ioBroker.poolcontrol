'use strict';

/**
 * temperatureHelper
 * - Abonniert konfigurierte Temperatursensoren (Foreign States)
 * - Schreibt aktuelle Werte:
 *   - temperature.<sensor>.current
 * - Berechnet Differenzen:
 *   - temperature.delta.collector_outside = collector - outside
 *   - temperature.delta.surface_ground    = surface - ground
 *   - temperature.delta.flow_return       = flow - return
 * - Tages-Min/Max je Sensor
 * - Änderung pro Stunde (delta_per_hour)
 */

const temperatureHelper = {
    adapter: null,
    sensors: {}, // { collector: 'id', outside: 'id', surface: 'id', ground: 'id', flow: 'id', return: 'id' }
    values: {}, // aktuelle Werte { collector: number, outside: number, ... }
    minMax: {}, // { collector: { min, max }, ... }
    history: {}, // { sensorKey: [{ ts, val }, ...] }
    resetTimer: null,
    diagnosticTimer: null,
    recoveryLastRun: {}, // { sensorKey: timestamp }

    init(adapter) {
        this.adapter = adapter;
        this.sensors = this._collectActiveSensors(adapter);
        this.recoveryLastRun = {};

        // Foreign-States abonnieren
        for (const id of Object.values(this.sensors)) {
            adapter.subscribeForeignStates(id);
        }

        // >>> NEU: Initialwerte aller aktiven Sensoren einlesen
        (async () => {
            for (const [key, id] of Object.entries(this.sensors)) {
                try {
                    const state = await adapter.getForeignStateAsync(id);
                    if (state && state.val !== null && state.val !== undefined && !isNaN(Number(state.val))) {
                        const val = Number(state.val);
                        this.values[key] = val;
                        await this._setCurrentValue(key, val);
                        // NEU: Diagnosewerte für letzten gültigen Sensorwert aktualisieren
                        await this._updateSensorDiagnostics(key, val, state, 'ok');
                        await this._updateMinMax(key, val);
                        adapter.log.debug(`[temperatureHelper] Initial value for ${key}: ${val} °C`);
                    } else {
                        adapter.log.debug(`[temperatureHelper] No valid initial value for ${key}`);
                    }
                } catch (err) {
                    adapter.log.warn(`[temperatureHelper] Error during initial read for ${key}: ${err.message}`);
                }
            }

            // Nach Setzen der ersten Werte gleich Deltas prüfen
            await this._maybeWriteDelta(
                'temperature.delta.collector_outside',
                this.values.collector,
                this.values.outside,
            );
            await this._maybeWriteDelta('temperature.delta.surface_ground', this.values.surface, this.values.ground);
            await this._maybeWriteDelta('temperature.delta.flow_return', this.values.flow, this.values.return);
        })();

        // >>> NEU: Alte Min/Max-Werte wiederherstellen
        this._restoreMinMaxFromStates().catch(err =>
            this.adapter.log.warn(`[temperatureHelper] Min/Max restore failed: ${err.message}`),
        );

        // Reset um Mitternacht
        this._scheduleDailyReset();

        // NEU: Diagnose-Timer für Sensor-Aktualität starten
        this._scheduleSensorDiagnostics();

        adapter.log.debug(
            `[temperatureHelper] Aktiv: ${
                Object.keys(this.sensors).length
                    ? Object.entries(this.sensors)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')
                    : 'no sensors configured'
            }`,
        );
    },

    _collectActiveSensors(adapter) {
        const c = adapter.config || {};
        const map = {};
        if (c.collector_temp_active && c.collector_temp_sensor) {
            map.collector = c.collector_temp_sensor;
        }
        if (c.outside_temp_active && c.outside_temp_sensor) {
            map.outside = c.outside_temp_sensor;
        }
        if (c.surface_temp_active && c.surface_temp_sensor) {
            map.surface = c.surface_temp_sensor;
        }
        if (c.ground_temp_active && c.ground_temp_sensor) {
            map.ground = c.ground_temp_sensor;
        }
        if (c.flow_temp_active && c.flow_temp_sensor) {
            map.flow = c.flow_temp_sensor;
        }
        if (c.return_temp_active && c.return_temp_sensor) {
            map.return = c.return_temp_sensor;
        }
        return map;
    },

    async handleStateChange(id, state) {
        if (!state || state.val === null || state.val === undefined) {
            return;
        }
        const key = Object.keys(this.sensors).find(k => this.sensors[k] === id);
        if (!key) {
            return;
        }

        const num = Number(state.val);
        if (!Number.isFinite(num)) {
            return;
        }

        this.values[key] = num;

        // Aktuellen Wert setzen
        await this._setCurrentValue(key, num);

        // NEU: Diagnosewerte für letzten gültigen Sensorwert aktualisieren
        await this._updateSensorDiagnostics(key, num, state, 'ok');

        // Deltas berechnen
        await this._maybeWriteDelta('temperature.delta.collector_outside', this.values.collector, this.values.outside);
        await this._maybeWriteDelta('temperature.delta.surface_ground', this.values.surface, this.values.ground);
        await this._maybeWriteDelta('temperature.delta.flow_return', this.values.flow, this.values.return);

        // Min/Max aktualisieren
        await this._updateMinMax(key, num);

        // Verlauf speichern und Delta pro Stunde berechnen
        await this._updateHistoryAndDelta(key, num);
    },

    async _setCurrentValue(key, value) {
        try {
            await this.adapter.setStateAsync(`temperature.${key}.current`, {
                val: value,
                ack: true,
            });
        } catch (err) {
            this.adapter.log.warn(`[temperatureHelper] setState current ${key} failed: ${err.message}`);
        }
    },

    // NEU: Diagnosewerte für gültige Temperatursensorwerte schreiben
    async _updateSensorDiagnostics(key, value, state, status) {
        const sourceTs = state && Number.isFinite(Number(state.ts)) ? Number(state.ts) : Date.now();
        const isoTime = new Date(sourceTs).toISOString();
        const minutesSince = Math.max(0, Math.round((Date.now() - sourceTs) / 60000));

        try {
            await this.adapter.setStateAsync(`temperature.${key}.last_valid_value`, {
                val: value,
                ack: true,
            });
            await this.adapter.setStateAsync(`temperature.${key}.last_valid_value_at`, {
                val: isoTime,
                ack: true,
            });
            await this.adapter.setStateAsync(`temperature.${key}.minutes_since_last_value`, {
                val: minutesSince,
                ack: true,
            });
            await this.adapter.setStateAsync(`temperature.${key}.source_status`, {
                val: status,
                ack: true,
            });
        } catch (err) {
            this.adapter.log.warn(`[temperatureHelper] sensor diagnostics ${key} failed: ${err.message}`);
        }
    },

    async _maybeWriteDelta(stateId, a, b) {
        if (a === undefined || b === undefined) {
            return;
        }
        const delta = Number((a - b).toFixed(2));
        try {
            await this.adapter.setStateAsync(stateId, { val: delta, ack: true });
        } catch (err) {
            this.adapter.log.warn(`[temperatureHelper] setState ${stateId} failed: ${err.message}`);
        }
    },

    async _updateMinMax(key, value) {
        if (!this.minMax[key]) {
            this.minMax[key] = { min: value, max: value };
            await this.adapter.setStateAsync(`temperature.${key}.min_today`, {
                val: value,
                ack: true,
            });
            await this.adapter.setStateAsync(`temperature.${key}.max_today`, {
                val: value,
                ack: true,
            });
            return;
        }

        if (value < this.minMax[key].min) {
            this.minMax[key].min = value;
            await this.adapter.setStateAsync(`temperature.${key}.min_today`, {
                val: value,
                ack: true,
            });
        }
        if (value > this.minMax[key].max) {
            this.minMax[key].max = value;
            await this.adapter.setStateAsync(`temperature.${key}.max_today`, {
                val: value,
                ack: true,
            });
        }
    },

    async _updateHistoryAndDelta(key, value) {
        const now = Date.now();
        if (!this.history[key]) {
            this.history[key] = [];
        }

        // Wert speichern
        this.history[key].push({ ts: now, val: value });

        // Nur letzte 2 Stunden behalten
        this.history[key] = this.history[key].filter(p => now - p.ts <= 2 * 3600 * 1000);

        // Referenzwert von vor ~1 Stunde suchen
        const oneHourAgo = now - 3600 * 1000;
        const past = this.history[key].find(p => p.ts <= oneHourAgo);
        if (past) {
            const deltaPerHour = Number((value - past.val).toFixed(2));
            try {
                await this.adapter.setStateAsync(`temperature.${key}.delta_per_hour`, {
                    val: deltaPerHour,
                    ack: true,
                });
            } catch (err) {
                this.adapter.log.warn(`[temperatureHelper] setState delta_per_hour ${key} failed: ${err.message}`);
            }
        }
    },

    _scheduleDailyReset() {
        // Timer berechnen: Millisekunden bis Mitternacht
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight.getTime() - now.getTime();

        this.resetTimer = this.adapter.setTimeout(async () => {
            await this._resetMinMax();
            this._scheduleDailyReset(); // neu für nächsten Tag
        }, msUntilMidnight);
    },

    // NEU: Sensor-Aktualität regelmäßig prüfen
    _scheduleSensorDiagnostics() {
        this.diagnosticTimer = this.adapter.setInterval(async () => {
            for (const key of Object.keys(this.sensors)) {
                try {
                    const lastValidState = await this.adapter.getStateAsync(`temperature.${key}.last_valid_value_at`);
                    const lastValidAt = lastValidState?.val;

                    if (!lastValidAt) {
                        await this.adapter.setStateAsync(`temperature.${key}.source_status`, {
                            val: 'not_received',
                            ack: true,
                        });
                        continue;
                    }

                    const lastTs = Date.parse(lastValidAt);
                    if (!Number.isFinite(lastTs)) {
                        await this.adapter.setStateAsync(`temperature.${key}.source_status`, {
                            val: 'invalid_timestamp',
                            ack: true,
                        });
                        continue;
                    }

                    const minutesSince = Math.max(0, Math.round((Date.now() - lastTs) / 60000));

                    await this.adapter.setStateAsync(`temperature.${key}.minutes_since_last_value`, {
                        val: minutesSince,
                        ack: true,
                    });

                    await this.adapter.setStateAsync(`temperature.${key}.source_status`, {
                        val: minutesSince <= 15 ? 'ok' : 'warning',
                        ack: true,
                    });

                    if (minutesSince > 15) {
                        await this._tryRecoverSensorValue(key, minutesSince);
                    }
                } catch (err) {
                    this.adapter.log.warn(`[temperatureHelper] sensor diagnostic check ${key} failed: ${err.message}`);
                }
            }
        }, 60 * 1000);
    },

    async _tryRecoverSensorValue(key, minutesSince) {
        const sensorId = this.sensors[key];
        if (!sensorId) {
            return;
        }

        const now = Date.now();
        const lastRun = this.recoveryLastRun[key] || 0;
        if (now - lastRun < 10 * 60 * 1000) {
            return;
        }

        this.recoveryLastRun[key] = now;
        this.adapter.log.debug(
            `[temperatureHelper] Recovery check started for ${key} (${sensorId}), stale for ${minutesSince} min`,
        );

        try {
            const state = await this.adapter.getForeignStateAsync(sensorId);
            if (!state || state.val === null || state.val === undefined || !Number.isFinite(Number(state.val))) {
                this.adapter.log.debug(`[temperatureHelper] Recovery check failed for ${key}: no valid numeric value`);
                return;
            }

            await this.handleStateChange(sensorId, state);
            this.adapter.log.debug(`[temperatureHelper] Recovery check successful for ${key}: ${state.val}`);
        } catch (err) {
            this.adapter.log.debug(`[temperatureHelper] Recovery check failed for ${key}: ${err.message}`);
        }
    },

    async _resetMinMax() {
        this.adapter.log.debug('[temperatureHelper] Resetting daily min/max');
        for (const key of Object.keys(this.sensors)) {
            // Bugfix: statt leeres Objekt → löschen, damit Neu-Init greift
            delete this.minMax[key];

            await this.adapter.setStateAsync(`temperature.${key}.min_today`, {
                val: null,
                ack: true,
            });
            await this.adapter.setStateAsync(`temperature.${key}.max_today`, {
                val: null,
                ack: true,
            });
            await this.adapter.setStateAsync(`temperature.${key}.delta_per_hour`, {
                val: null,
                ack: true,
            });
        }
    },

    // >>> NEU: Restore von min/max beim Start
    async _restoreMinMaxFromStates() {
        for (const key of Object.keys(this.sensors)) {
            const min = Number((await this.adapter.getStateAsync(`temperature.${key}.min_today`))?.val);
            const max = Number((await this.adapter.getStateAsync(`temperature.${key}.max_today`))?.val);
            if (Number.isFinite(min) || Number.isFinite(max)) {
                this.minMax[key] = {
                    min: Number.isFinite(min) ? min : undefined,
                    max: Number.isFinite(max) ? max : undefined,
                };
            }
        }
    },

    cleanup() {
        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        if (this.diagnosticTimer) {
            this.adapter.clearInterval(this.diagnosticTimer);
            this.diagnosticTimer = null;
        }
    },
};

module.exports = temperatureHelper;

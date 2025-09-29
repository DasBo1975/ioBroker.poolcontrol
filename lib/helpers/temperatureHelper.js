"use strict";

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
  sensors: {},     // { collector: 'id', outside: 'id', surface: 'id', ground: 'id', flow: 'id', return: 'id' }
  values: {},      // aktuelle Werte { collector: number, outside: number, ... }
  minMax: {},      // { collector: { min, max }, ... }
  history: {},     // { sensorKey: [{ ts, val }, ...] }
  resetTimer: null,

  init(adapter) {
    this.adapter = adapter;
    this.sensors = this._collectActiveSensors(adapter);

    // Foreign-States abonnieren
    for (const id of Object.values(this.sensors)) {
      adapter.subscribeForeignStates(id);
    }

    // Reset um Mitternacht
    this._scheduleDailyReset();

    adapter.log.info(
      `[temperatureHelper] Aktiv: ${
        Object.keys(this.sensors).length
          ? Object.entries(this.sensors).map(([k, v]) => `${k}=${v}`).join(", ")
          : "keine Sensoren konfiguriert"
      }`
    );
  },

  _collectActiveSensors(adapter) {
    const c = adapter.config || {};
    const map = {};
    if (c.collector_temp_active && c.collector_temp_sensor) map.collector = c.collector_temp_sensor;
    if (c.outside_temp_active  && c.outside_temp_sensor)   map.outside       = c.outside_temp_sensor;
    if (c.surface_temp_active  && c.surface_temp_sensor)   map.surface   = c.surface_temp_sensor;
    if (c.ground_temp_active   && c.ground_temp_sensor)    map.ground    = c.ground_temp_sensor;
    if (c.flow_temp_active     && c.flow_temp_sensor)      map.flow      = c.flow_temp_sensor;
    if (c.return_temp_active   && c.return_temp_sensor)    map.return    = c.return_temp_sensor;
    return map;
  },

  async handleStateChange(id, state) {
    if (!state || state.val === null || state.val === undefined) return;
    const key = Object.keys(this.sensors).find(k => this.sensors[k] === id);
    if (!key) return;

    const num = Number(state.val);
    if (!Number.isFinite(num)) return;

    this.values[key] = num;

    // Aktuellen Wert setzen
    await this._setCurrentValue(key, num);

    // Deltas berechnen
    await this._maybeWriteDelta("temperature.delta.collector_outside",  this.values.collector, this.values.outside);
    await this._maybeWriteDelta("temperature.delta.surface_ground", this.values.surface,   this.values.ground);
    await this._maybeWriteDelta("temperature.delta.flow_return",    this.values.flow,      this.values.return);

    // Min/Max aktualisieren
    await this._updateMinMax(key, num);

    // Verlauf speichern und Delta pro Stunde berechnen
    await this._updateHistoryAndDelta(key, num);
  },

  async _setCurrentValue(key, value) {
    try {
      await this.adapter.setStateAsync(`temperature.${key}.current`, { val: value, ack: true });
    } catch (err) {
      this.adapter.log.warn(`[temperatureHelper] setState current ${key} fehlgeschlagen: ${err.message}`);
    }
  },

  async _maybeWriteDelta(stateId, a, b) {
    if (a === undefined || b === undefined) return;
    const delta = Number((a - b).toFixed(2));
    try {
      await this.adapter.setStateAsync(stateId, { val: delta, ack: true });
    } catch (err) {
      this.adapter.log.warn(`[temperatureHelper] setState ${stateId} fehlgeschlagen: ${err.message}`);
    }
  },

  async _updateMinMax(key, value) {
    if (!this.minMax[key]) {
      this.minMax[key] = { min: value, max: value };
      await this.adapter.setStateAsync(`temperature.${key}.min_today`, { val: value, ack: true });
      await this.adapter.setStateAsync(`temperature.${key}.max_today`, { val: value, ack: true });
      return;
    }

    if (value < this.minMax[key].min) {
      this.minMax[key].min = value;
      await this.adapter.setStateAsync(`temperature.${key}.min_today`, { val: value, ack: true });
    }
    if (value > this.minMax[key].max) {
      this.minMax[key].max = value;
      await this.adapter.setStateAsync(`temperature.${key}.max_today`, { val: value, ack: true });
    }
  },

  async _updateHistoryAndDelta(key, value) {
    const now = Date.now();
    if (!this.history[key]) this.history[key] = [];

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
        await this.adapter.setStateAsync(`temperature.${key}.delta_per_hour`, { val: deltaPerHour, ack: true });
      } catch (err) {
        this.adapter.log.warn(`[temperatureHelper] setState delta_per_hour ${key} fehlgeschlagen: ${err.message}`);
      }
    }
  },

  _scheduleDailyReset() {
    // Timer berechnen: Millisekunden bis Mitternacht
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    this.resetTimer = setTimeout(() => {
      this._resetMinMax();
      this._scheduleDailyReset(); // neu für nächsten Tag
    }, msUntilMidnight);
  },

  async _resetMinMax() {
    this.adapter.log.info("[temperatureHelper] Setze Tages-Min/Max zurück");
    for (const key of Object.keys(this.sensors)) {
      // Bugfix: statt leeres Objekt → löschen, damit Neu-Init greift
      delete this.minMax[key];

      await this.adapter.setStateAsync(`temperature.${key}.min_today`, { val: null, ack: true });
      await this.adapter.setStateAsync(`temperature.${key}.max_today`, { val: null, ack: true });
      await this.adapter.setStateAsync(`temperature.${key}.delta_per_hour`, { val: null, ack: true });
    }
  },

  cleanup() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  },
};

module.exports = temperatureHelper;

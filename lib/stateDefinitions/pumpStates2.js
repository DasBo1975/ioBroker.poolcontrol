'use strict';

/**
 * pumpStates2.js
 * ----------------------------------------------------------
 * Legt die erweiterten States für Pumpen-Livewerte an.
 *
 * Diese Datei ergänzt die bestehenden pumpStates.js um
 * reelle Durchflussberechnung und Leistungsdaten.
 *
 * Ordnerstruktur:
 * pump.live.*
 *  ├── current_power_w      (W)   - aktuelle Leistung
 *  ├── flow_current_lh      (L/h) - reell berechneter Durchfluss
 *  ├── flow_percent         (%)   - aktuelle Auslastung
 *  ├── last_flow_lh         (L/h) - letzter bekannter Durchfluss
 *
 * Alle States sind persistent und bleiben über Updates erhalten.
 * ----------------------------------------------------------
 * Version: 1.0.0
 */

/**
 * Erstellt die erweiterten Pumpen-Live-States.
 *
 * @param {import("iobroker").Adapter} adapter - Aktive ioBroker Adapterinstanz
 * @returns {Promise<void>}
 */
async function createPumpStates2(adapter) {
    // ------------------------------------------------------
    // Root-Kanal: pump.live
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live', {
        type: 'channel',
        common: {
            name: { de: 'Pumpen-Livewerte (aktuelle Betriebsdaten)', en: 'Pump live values (current operating data)' },
        },
        native: {},
    });

    // ------------------------------------------------------
    // Aktuelle Leistung (W)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live.current_power_w', {
        type: 'state',
        common: {
            name: { de: 'Aktuelle elektrische Leistung', en: 'Current electrical power' },
            desc: {
                de: 'Momentane Leistungsaufnahme der Pumpe (Watt)',
                en: 'Current power consumption of the pump (watts)',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.live.current_power_w', { val: 0, ack: true });

    // ------------------------------------------------------
    // Reell berechneter Durchfluss (L/h)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live.flow_current_lh', {
        type: 'state',
        common: {
            name: { de: 'Aktueller reeller Durchfluss', en: 'Current actual flow' },
            desc: {
                de: 'Berechnete Umwälzleistung basierend auf aktueller Leistung',
                en: 'Calculated circulation rate based on current power',
            },
            type: 'number',
            role: 'value.flow',
            unit: 'l/h',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.live.flow_current_lh', { val: 0, ack: true });

    // ------------------------------------------------------
    // Prozentuale Auslastung (%)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live.flow_percent', {
        type: 'state',
        common: {
            name: { de: 'Aktuelle Pumpenauslastung (%)', en: 'Current pump load (%)' },
            desc: {
                de: 'Aktuelle Pumpenleistung in Prozent der maximalen Leistung',
                en: 'Current pump power as a percentage of the maximum power',
            },
            type: 'number',
            role: 'value.percent',
            unit: '%',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.live.flow_percent', { val: 0, ack: true });

    // ------------------------------------------------------
    // Letzter bekannter Durchfluss (L/h)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live.last_flow_lh', {
        type: 'state',
        common: {
            name: { de: 'Letzter bekannter Durchfluss', en: 'Last known flow' },
            desc: {
                de: 'Speichert den letzten berechneten Durchflusswert vor Pumpenstopp',
                en: 'Stores the last calculated flow value before the pump stops',
            },
            type: 'number',
            role: 'value.flow',
            unit: 'l/h',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.live.last_flow_lh', { val: 0, ack: true });

    // ------------------------------------------------------
    // Abschluss-Logeintrag
    // ------------------------------------------------------
    adapter.log.debug('[pumpStates2] Live state definitions created or verified.');
}

module.exports = {
    createPumpStates2,
};

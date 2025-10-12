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
            name: 'Pumpen-Livewerte (aktuelle Betriebsdaten)',
        },
        native: {},
    });

    // ------------------------------------------------------
    // Aktuelle Leistung (W)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live.current_power_w', {
        type: 'state',
        common: {
            name: 'Aktuelle elektrische Leistung',
            desc: 'Momentane Leistungsaufnahme der Pumpe (Watt)',
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
            name: 'Aktueller reeller Durchfluss',
            desc: 'Berechnete Umwälzleistung basierend auf aktueller Leistung',
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
            name: 'Aktuelle Pumpenauslastung (%)',
            desc: 'Aktuelle Pumpenleistung in Prozent der maximalen Leistung',
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
            name: 'Letzter bekannter Durchfluss',
            desc: 'Speichert den letzten berechneten Durchflusswert vor Pumpenstopp',
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
    adapter.log.debug('[pumpStates2] Live-State-Definitionen erstellt oder geprüft.');
}

module.exports = {
    createPumpStates2,
};

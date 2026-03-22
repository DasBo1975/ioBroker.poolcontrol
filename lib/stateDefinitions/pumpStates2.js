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
            name: {
                en: 'Pump live values (current operating data)',
                de: 'Pumpen-Livewerte (aktuelle Betriebsdaten)',
            },
        },
        native: {},
    });

    // ------------------------------------------------------
    // Aktuelle Leistung (W)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.live.current_power_w', {
        type: 'state',
        common: {
            name: {
                en: 'Current electrical power (W)',
                de: 'Aktuelle elektrische Leistung (W)',
            },
            desc: {
                en: 'Current power consumption of the pump (watts)',
                de: 'Aktuelle Leistungsaufnahme der Pumpe in Watt',
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
            name: {
                en: 'Current actual flow',
                de: 'Aktueller realer Durchfluss',
            },
            desc: {
                en: 'Calculated circulation rate based on current power',
                de: 'Berechnete Umwaelzleistung basierend auf der aktuellen Leistung',
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
            name: {
                en: 'Current pump load (%)',
                de: 'Aktuelle Pumpenauslastung (%)',
            },
            desc: {
                en: 'Current pump power as a percentage of the maximum power',
                de: 'Aktuelle Pumpenleistung als Prozentwert der maximalen Leistung',
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
            name: {
                en: 'Last known flow',
                de: 'Letzter bekannter Durchfluss',
            },
            desc: {
                en: 'Stores the last calculated flow value before the pump stops',
                de: 'Speichert den zuletzt berechneten Durchflusswert, vor Pumpenstopp',
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

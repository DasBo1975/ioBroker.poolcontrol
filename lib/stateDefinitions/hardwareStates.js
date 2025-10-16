'use strict';

/**
 * hardwareStates.js
 * ----------------------------------------------------------
 * Legt alle States für die Hardware-Verwaltung an:
 *  - hardware.tempbox.*       (Temperatur-Box / PC-TB-01)
 *  - hardware.tasterbox.*     (Taster-Box / PC-BT-01)
 *  - zentrale Sammelstates    (text_message, last_scan, scan_running)
 *
 * Diese Datei enthält keine Logik, sondern nur die Objektdefinitionen.
 * Alle Zustandsänderungen erfolgen später über den hardwareHelper.
 *
 * Struktur (Beispiel):
 *  hardware
 *  ├── text_message
 *  ├── last_scan
 *  ├── scan_running
 *  ├── tempbox
 *  │    ├── settings.enabled
 *  │    ├── source_path
 *  │    ├── handshake.request / confirm / state
 *  │    ├── status.connected / last_seen
 *  │    ├── device_map
 *  │    └── info.mac / ip / fw
 *  └── tasterbox (analog)
 * ----------------------------------------------------------
 */

/**
 * @file hardwareStates.js
 * @description Legt alle States für die Hardware-Verwaltung an (ohne Logik).
 *
 * Erstellt die Root-Struktur `hardware.*`, zentrale Sammelstates
 * sowie die Bereiche für TempBox und TasterBox.
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 * @returns {Promise<void>}
 */
async function createHardwareStates(adapter) {
    // Root-Kanal "hardware"
    await adapter.setObjectNotExistsAsync('hardware', {
        type: 'channel',
        common: { name: 'Externe Hardware (ESPHome-Boxen)' },
        native: {},
    });

    // ------------------------------------------------------
    // Zentrale Sammelstates
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('hardware.text_message', {
        type: 'state',
        common: {
            name: 'Textmeldung (Sammelstatus)',
            desc: 'Kurze Übersicht über alle Boxen, z. B. „TempBox verbunden, TasterBox getrennt“',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('hardware.text_message', { val: '', ack: true });

    await adapter.setObjectNotExistsAsync('hardware.last_scan', {
        type: 'state',
        common: {
            name: 'Letzte Gerätesuche',
            type: 'string',
            role: 'date',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('hardware.last_scan', { val: '', ack: true });

    await adapter.setObjectNotExistsAsync('hardware.scan_running', {
        type: 'state',
        common: {
            name: 'Boxensuche läuft aktuell',
            type: 'boolean',
            role: 'indicator.process',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('hardware.scan_running', { val: false, ack: true });

    // ------------------------------------------------------
    // TempBox (Temperatur-Box)
    // ------------------------------------------------------
    await _createBoxSection(adapter, 'tempbox', 'Temperatur-Box (PC-TB-01)');

    // ------------------------------------------------------
    // TasterBox
    // ------------------------------------------------------
    await _createBoxSection(adapter, 'tasterbox', 'Taster-Box (PC-BT-01)');

    adapter.log.debug('[hardwareStates] Alle Hardware-States erstellt oder geprüft.');
}

/**
 * Hilfsfunktion zum Erstellen eines Box-Bereichs
 *
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 * @param {string} boxId - Interne Kennung der Box, z. B."tempbox", "tasterbox" usw.
 * @param {string} boxLabel - Sprechender Anzeigename im Objektbaum
 */
async function _createBoxSection(adapter, boxId, boxLabel) {
    const base = `hardware.${boxId}`;

    await adapter.setObjectNotExistsAsync(base, {
        type: 'channel',
        common: { name: boxLabel },
        native: {},
    });

    // Einstellungen
    await adapter.setObjectNotExistsAsync(`${base}.settings.enabled`, {
        type: 'state',
        common: {
            name: 'Box aktiviert (aus Instanz-Konfiguration)',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.settings.enabled`, { val: false, ack: true });

    // Quellenpfad
    await adapter.setObjectNotExistsAsync(`${base}.source_path`, {
        type: 'state',
        common: {
            name: 'Pfad im ESPHome-Adapter',
            desc: 'z. B. esphome.0.64B708C8F8C0',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.source_path`, { val: '', ack: true });

    // Handshake
    await adapter.setObjectNotExistsAsync(`${base}.handshake.request`, {
        type: 'state',
        common: {
            name: 'Handshake-Anfrage der Box',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.handshake.request`, { val: '', ack: true });

    await adapter.setObjectNotExistsAsync(`${base}.handshake.confirm`, {
        type: 'state',
        common: {
            name: 'Handshake-Bestätigung des Adapters',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.handshake.confirm`, { val: '', ack: true });

    await adapter.setObjectNotExistsAsync(`${base}.handshake.state`, {
        type: 'state',
        common: {
            name: 'Handshake-Status',
            type: 'string',
            role: 'text',
            states: {
                waiting: 'waiting',
                ok: 'ok',
                timeout: 'timeout',
                error: 'error',
                disabled: 'disabled',
                searching: 'searching',
            },
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.handshake.state`, { val: 'disabled', ack: true });

    // Status
    await adapter.setObjectNotExistsAsync(`${base}.status.connected`, {
        type: 'state',
        common: {
            name: 'Verbunden',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.status.connected`, { val: false, ack: true });

    await adapter.setObjectNotExistsAsync(`${base}.status.last_seen`, {
        type: 'state',
        common: {
            name: 'Zuletzt gesehen (Handshake OK)',
            type: 'string',
            role: 'date',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.status.last_seen`, { val: '', ack: true });

    // Geräteübersicht (JSON)
    await adapter.setObjectNotExistsAsync(`${base}.device_map`, {
        type: 'state',
        common: {
            name: 'Geräteübersicht (JSON)',
            desc: 'Enthält alle zugehörigen Sensor- und TextSensor-Objekte',
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(`${base}.device_map`, { val: '{}', ack: true });

    // Infofelder
    for (const key of ['mac', 'ip', 'fw']) {
        await adapter.setObjectNotExistsAsync(`${base}.info.${key}`, {
            type: 'state',
            common: {
                name: `Info: ${key.toUpperCase()}`,
                type: 'string',
                role: 'text',
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync(`${base}.info.${key}`, { val: '', ack: true });
    }
}

module.exports = {
    createHardwareStates,
};

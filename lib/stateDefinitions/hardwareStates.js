'use strict';

/**
 * hardwareStates.js – Bereich für externe Boxen (TempBox, TasterBox usw.)
 * Überarbeitete Version: Checkboxen & settings_enabled entfernt
 */

/**
 * Erstellt die Objektstruktur für alle Hardware-Boxen (z. B. TempBox, TasterBox).
 * Diese Version enthält keine Instanz-Checkboxen oder settings_enabled States mehr.
 *
 * @param {object} adapter - ioBroker Adapterinstanz
 */
async function createHardwareStates(adapter) {
    try {
        // ------------------------------------------------------
        // Oberordner: Hardware
        // ------------------------------------------------------
        await adapter.setObjectNotExistsAsync('hardware', {
            type: 'channel',
            common: { name: 'Hardware-Boxen (Sensoren & externe Geräte)' },
            native: {},
        });

        // ======================================================
        // TEMPERATUR-BOX (ESP32)
        // ======================================================
        await adapter.setObjectNotExistsAsync('hardware.tempbox', {
            type: 'channel',
            common: { name: 'Temperatur-Box (ESP32)' },
            native: {},
        });

        // Statusmeldung: Erkennung/Verbindung
        await adapter.setObjectNotExistsAsync('hardware.tempbox.status_detected', {
            type: 'state',
            common: {
                name: 'Box-Status',
                desc: 'Status der automatischen Erkennung der Temperatur-Box (z. B. verbunden/nicht gefunden)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'nicht gefunden',
            },
            native: {},
        });

        // LED-Status
        await adapter.setObjectNotExistsAsync('hardware.tempbox.status_led', {
            type: 'state',
            common: {
                name: 'LED-Status (TempBox)',
                desc: 'Status der blauen LED auf der Temperatur-Box',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'unbekannt',
            },
            native: {},
        });

        // Firmware-Version
        await adapter.setObjectNotExistsAsync('hardware.tempbox.fw_version', {
            type: 'state',
            common: {
                name: 'Box-Firmware-Version',
                desc: 'Firmware-Version der Temperatur-Box (ESP32)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });

        // Box-ID
        await adapter.setObjectNotExistsAsync('hardware.tempbox.box_id', {
            type: 'state',
            common: {
                name: 'Box-ID (TempBox)',
                desc: 'Eindeutige Kennung der Temperatur-Box (z. B. PC-TB-01)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });

        // Sensorsystem-Status
        await adapter.setObjectNotExistsAsync('hardware.tempbox.status_sensors', {
            type: 'state',
            common: {
                name: 'Sensorsystem-Status',
                desc: 'Meldung zum Zustand der Temperatursensoren in der TempBox',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'keine Daten',
            },
            native: {},
        });

        // ------------------------------------------------------
        // TASTER-BOX (ESP32)
        // ------------------------------------------------------
        await adapter.setObjectNotExistsAsync('hardware.tasterbox', {
            type: 'channel',
            common: { name: 'Taster-Box (ESP32)' },
            native: {},
        });

        // Statusmeldung
        await adapter.setObjectNotExistsAsync('hardware.tasterbox.status_detected', {
            type: 'state',
            common: {
                name: 'Box-Status',
                desc: 'Status der automatischen Erkennung der Taster-Box (z. B. verbunden/nicht gefunden)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'nicht gefunden',
            },
            native: {},
        });

        // Firmware-Version
        await adapter.setObjectNotExistsAsync('hardware.tasterbox.fw_version', {
            type: 'state',
            common: {
                name: 'Box-Firmware-Version',
                desc: 'Firmware-Version der Taster-Box (ESP32)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });

        // Box-ID
        await adapter.setObjectNotExistsAsync('hardware.tasterbox.box_id', {
            type: 'state',
            common: {
                name: 'Box-ID (TasterBox)',
                desc: 'Eindeutige Kennung der Taster-Box (z. B. PC-TB-02)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });

        // Status der Taster
        await adapter.setObjectNotExistsAsync('hardware.tasterbox.status_buttons', {
            type: 'state',
            common: {
                name: 'Status der Taster',
                desc: 'Textmeldung zum Zustand der Taster (z. B. gedrückt, losgelassen, keine Verbindung)',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'unbekannt',
            },
            native: {},
        });

        adapter.log.debug('[hardwareStates] Hardware-State-Struktur erfolgreich angelegt (bereinigt ohne Checkboxen).');
    } catch (err) {
        adapter.log.error(`[hardwareStates] Fehler beim Anlegen der Hardware-States: ${err.message}`);
    }
}

module.exports = { createHardwareStates };

'use strict';

/**
 * controlStates
 * - Erstellt States, die zur Laufzeit über VIS oder Blockly steuerbar sind
 * - Erstellt zusätzlich beschriftete Channel-Struktur:
 *     control
 *       └─ season
 *            └─ active
 */

/**
 * Erstellt alle States im control-Bereich.
 *
 * @param {import('iobroker').Adapter} adapter - ioBroker Adapterinstanz
 */
async function createControlStates(adapter) {
    try {
        // Channel: control
        await adapter.setObjectNotExistsAsync('control', {
            type: 'channel',
            common: {
                name: 'Steuerung',
                desc: 'Manuelle Steuerung und Laufzeitfunktionen (VIS / Blockly)',
            },
            native: {},
        });

        // Channel: control.season
        await adapter.setObjectNotExistsAsync('control.season', {
            type: 'channel',
            common: {
                name: 'Saisonsteuerung',
                desc: 'Steuerung der aktiven Poolsaison und saisonabhängiger Funktionen',
            },
            native: {},
        });

        // State: control.season.active
        await adapter.setObjectNotExistsAsync('control.season.active', {
            type: 'state',
            common: {
                name: 'Poolsaison aktiv',
                desc: 'Zeigt an, ob die Poolsaison aktiv ist (steuerbar über VIS oder Blockly)',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        // Initialwert aus der Instanzkonfiguration übernehmen
        const cfgValue = !!adapter.config.season_active;
        await adapter.setStateAsync('control.season.active', { val: cfgValue, ack: true });

        adapter.log.debug(`[controlStates] State control.season.active initialisiert mit Wert: ${cfgValue}`);

        // ---------------------------------------------------------------------
        // Channel: control.pump
        await adapter.setObjectNotExistsAsync('control.pump', {
            type: 'channel',
            common: {
                name: 'Pumpensteuerung',
                desc: 'Manuelle Aktionen wie Rückspülen oder Wartung',
            },
            native: {},
        });

        // Rückspülung starten
        await adapter.setObjectNotExistsAsync('control.pump.backwash_start', {
            type: 'state',
            common: {
                name: 'Rückspülung starten',
                desc: 'Startet die Rückspülung für die eingestellte Dauer',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_start', { val: false, ack: true });

        // Rückspülung aktiv
        await adapter.setObjectNotExistsAsync('control.pump.backwash_active', {
            type: 'state',
            common: {
                name: 'Rückspülung aktiv',
                desc: 'Zeigt an, ob gerade eine Rückspülung läuft',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_active', { val: false, ack: true });

        // Rückspülungsdauer
        await adapter.setObjectNotExistsAsync('control.pump.backwash_duration', {
            type: 'state',
            common: {
                name: 'Dauer der Rückspülung (Minuten)',
                desc: 'Bestimmt, wie lange die Rückspülung laufen soll',
                type: 'number',
                role: 'level.timer',
                read: true,
                write: true,
                def: 1,
                min: 1,
                max: 60,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_duration', { val: 1, ack: true });

        // Wartungsmodus aktiv
        await adapter.setObjectNotExistsAsync('control.pump.maintenance_active', {
            type: 'state',
            common: {
                name: 'Wartungsmodus aktiv',
                desc: 'Deaktiviert Automatikfunktionen und lässt Pumpe manuell steuern',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.maintenance_active', { val: false, ack: true });

        // Benachrichtigungen aktivieren
        await adapter.setObjectNotExistsAsync('control.pump.notifications_enabled', {
            type: 'state',
            common: {
                name: 'Benachrichtigungen aktivieren',
                desc: 'Wenn aktiviert, werden bei Rückspülung und Wartung Ansagen oder Nachrichten gesendet (E-Mail, Telegram, Alexa)',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.notifications_enabled', { val: true, ack: true });
    } catch (err) {
        adapter.log.error(`[controlStates] Fehler beim Erstellen der Control-States: ${err.message}`);
    }
}

module.exports = { createControlStates };

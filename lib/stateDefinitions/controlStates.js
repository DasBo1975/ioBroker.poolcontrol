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

        // >>> NEU: Rückspülerinnerung
        await adapter.setObjectNotExistsAsync('control.pump.backwash_reminder_active', {
            type: 'state',
            common: {
                name: 'Rückspülerinnerung aktiv',
                desc: 'Wenn aktiviert, erinnert der Adapter automatisch nach Ablauf des eingestellten Intervalls an die Rückspülung',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_reminder_active', { val: false, ack: true });

        await adapter.setObjectNotExistsAsync('control.pump.backwash_interval_days', {
            type: 'state',
            common: {
                name: 'Rückspülerinnerung: Intervall (Tage)',
                desc: 'Anzahl Tage, nach denen eine Erinnerung für die Rückspülung erfolgt',
                type: 'number',
                role: 'value.interval',
                unit: 'Tage',
                read: true,
                write: true,
                def: 7,
                min: 1,
                max: 60,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_interval_days', { val: 7, ack: true });

        await adapter.setObjectNotExistsAsync('control.pump.backwash_last_date', {
            type: 'state',
            common: {
                name: 'Letzte Rückspülung (Datum)',
                desc: 'Zeitstempel der letzten ausgeführten Rückspülung, dient der Erinnerungsberechnung',
                type: 'string',
                role: 'date',
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_last_date', { val: '', ack: true });

        await adapter.setObjectNotExistsAsync('control.pump.backwash_required', {
            type: 'state',
            common: {
                name: 'Rückspülung erforderlich',
                desc: 'Wird automatisch auf true gesetzt, wenn die eingestellte Rückspülzeit überschritten wurde',
                type: 'boolean',
                role: 'indicator.alarm',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_required', { val: false, ack: true });

        // ---------------------------------------------------------------------
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

        // ---------------------------------------------------------------------
        // Channel: control.energy
        await adapter.setObjectNotExistsAsync('control.energy', {
            type: 'channel',
            common: {
                name: 'Energieverwaltung',
                desc: 'Funktionen zur Verbrauchs- und Kostenrücksetzung',
            },
            native: {},
        });

        // Button: Energiezähler zurücksetzen
        await adapter.setObjectNotExistsAsync('control.energy.reset', {
            type: 'state',
            common: {
                name: 'Energiezähler zurücksetzen',
                desc: 'Setzt alle Verbrauchs- und Kostenwerte auf 0 (Totalreset)',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.energy.reset', { val: false, ack: true });

        // ---------------------------------------------------------------------
        // Channel: control.circulation
        await adapter.setObjectNotExistsAsync('control.circulation', {
            type: 'channel',
            common: {
                name: 'Tagesumwälzungs-Steuerung',
                desc: 'Automatische oder manuelle Prüfung der täglichen Umwälzmenge',
            },
            native: {},
        });

        // State: Modus (auto/manual/notify/off)
        await adapter.setObjectNotExistsAsync('control.circulation.mode', {
            type: 'state',
            common: {
                name: 'Modus der Umwälzungsprüfung',
                desc: 'Legt fest, ob und wie die Tagesumwälzung geprüft und ggf. nachgepumpt wird',
                type: 'string',
                role: 'value',
                read: true,
                write: true,
                def: 'notify',
                persist: true,
                states: {
                    auto: 'Automatik',
                    manual: 'Manuell',
                    notify: 'Nur benachrichtigen',
                    off: 'Aus',
                },
            },
            native: {},
        });

        // --- Nachträgliche Ergänzung für bestehende Installationen ---
        try {
            await adapter.extendObjectAsync('control.circulation.mode', {
                common: { persist: true },
            });
            adapter.log.debug('[controlStates] persist-Flag für control.circulation.mode nachgetragen');
        } catch (err) {
            adapter.log.warn(
                `[controlStates] Konnte persist-Flag für control.circulation.mode nicht setzen: ${err.message}`,
            );
        }

        await adapter.setStateAsync('control.circulation.mode', { val: 'notify', ack: true });

        // State: Prüfzeitpunkt
        await adapter.setObjectNotExistsAsync('control.circulation.check_time', {
            type: 'state',
            common: {
                name: 'Prüfzeitpunkt für Tagesumwälzung',
                desc: 'Uhrzeit, zu der täglich die Tagesumwälzung geprüft und ggf. gemeldet wird (Format HH:MM)',
                type: 'string',
                role: 'value.time',
                read: true,
                write: true,
                def: '18:00',
            },
            native: {},
        });
        await adapter.setStateAsync('control.circulation.check_time', { val: '18:00', ack: true });

        // State: letzter Bericht
        await adapter.setObjectNotExistsAsync('control.circulation.last_report', {
            type: 'state',
            common: {
                name: 'Letzter Bericht zur Tagesumwälzung',
                desc: 'Zeitstempel des letzten automatisch erzeugten Umwälzungs-Reports',
                type: 'string',
                role: 'date',
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.circulation.last_report', { val: '', ack: true });
    } catch (err) {
        adapter.log.error(`[controlStates] Fehler beim Erstellen der Control-States: ${err.message}`);
    }
}

module.exports = { createControlStates };

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
                name: {
                    en: 'Control',
                    de: 'Steuerung',
                },
            },
            native: {},
        });

        // ---------------------------------------------------------------------
        // Channel: control.pump
        await adapter.setObjectNotExistsAsync('control.pump', {
            type: 'channel',
            common: {
                name: {
                    en: 'Pump control',
                    de: 'Pumpensteuerung',
                },
            },
            native: {},
        });

        // Rückspülung starten
        await adapter.setObjectNotExistsAsync('control.pump.backwash_start', {
            type: 'state',
            common: {
                name: {
                    en: 'Start backwash',
                    de: 'Rueckspuelung starten',
                },
                desc: {
                    en: 'Starts backwash for the configured duration',
                    de: 'Startet die Rueckspuelung fuer die konfigurierte Dauer',
                },
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
                name: {
                    en: 'Backwash active',
                    de: 'Rueckspuelung aktiv',
                },
                desc: {
                    en: 'Shows whether backwash is currently running',
                    de: 'Zeigt an, ob die Rueckspuelung aktuell laeuft',
                },
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_active', { val: false, ack: true });

        // Rückspülungsdauer (mit Persist-Schutz)
        await adapter.setObjectNotExistsAsync('control.pump.backwash_duration', {
            type: 'state',
            common: {
                name: {
                    en: 'Backwash duration (minutes)',
                    de: 'Rueckspueldauer (Minuten)',
                },
                desc: {
                    en: 'Defines how long the backwash should run',
                    de: 'Legt fest, wie lange die Rueckspuelung laufen soll',
                },
                type: 'number',
                role: 'level.timer',
                read: true,
                write: true,
                def: 1,
                min: 1,
                max: 60,
                persist: true, // dauerhaft speichern
            },
            native: {},
        });
        const existingBackwashDuration = await adapter.getStateAsync('control.pump.backwash_duration');
        if (
            existingBackwashDuration === null ||
            existingBackwashDuration.val === null ||
            existingBackwashDuration.val === undefined
        ) {
            await adapter.setStateAsync('control.pump.backwash_duration', { val: 1, ack: true });
        }

        // Rückspülerinnerung aktiv (mit Persist-Schutz)
        await adapter.setObjectNotExistsAsync('control.pump.backwash_reminder_active', {
            type: 'state',
            common: {
                name: {
                    en: 'Backwash reminder active',
                    de: 'Rueckspuel-Erinnerung aktiv',
                },
                desc: {
                    en: 'If enabled, the adapter automatically reminds you to backwash after the configured interval has elapsed',
                    de: 'Wenn aktiviert, erinnert der Adapter automatisch an die Rueckspuelung nach Ablauf des konfigurierten Intervalls',
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true, // dauerhaft speichern
            },
            native: {},
        });
        const existingBackwashRem = await adapter.getStateAsync('control.pump.backwash_reminder_active');
        if (existingBackwashRem === null || existingBackwashRem.val === null || existingBackwashRem.val === undefined) {
            await adapter.setStateAsync('control.pump.backwash_reminder_active', { val: false, ack: true });
        }

        // Rückspülintervall (mit Persist-Schutz)
        await adapter.setObjectNotExistsAsync('control.pump.backwash_interval_days', {
            type: 'state',
            common: {
                name: {
                    en: 'Backwash reminder: interval (days)',
                    de: 'Rueckspuel-Erinnerung: Intervall (Tage)',
                },
                desc: {
                    en: 'Number of days after which a backwash reminder is triggered',
                    de: 'Anzahl der Tage, nach denen eine Rueckspuel-Erinnerung ausgeloest wird',
                },
                type: 'number',
                role: 'value.interval',
                unit: 'days',
                read: true,
                write: true,
                def: 7,
                min: 1,
                max: 60,
                persist: true, // dauerhaft speichern
            },
            native: {},
        });
        const existingBackwashInterval = await adapter.getStateAsync('control.pump.backwash_interval_days');
        if (
            existingBackwashInterval === null ||
            existingBackwashInterval.val === null ||
            existingBackwashInterval.val === undefined
        ) {
            await adapter.setStateAsync('control.pump.backwash_interval_days', { val: 7, ack: true });
        }

        await adapter.setObjectNotExistsAsync('control.pump.backwash_last_date', {
            type: 'state',
            common: {
                name: {
                    en: 'Last backwash (date)',
                    de: 'Letzte Rueckspuelung (Datum)',
                },
                desc: {
                    en: 'Timestamp of the last performed backwash, used for reminder calculation',
                    de: 'Zeitstempel der zuletzt durchgefuehrten Rueckspuelung, verwendet fuer die Erinnerungsberechnung',
                },
                type: 'string',
                role: 'date',
                read: true,
                write: false,
                persist: true,
            },
            native: {},
        });

        // 🟢 Überinstallationsschutz – nur schreiben, wenn kein Wert existiert
        const existingLastDate = await adapter.getStateAsync('control.pump.backwash_last_date');
        if (existingLastDate === null || existingLastDate.val === null || existingLastDate.val === undefined) {
            await adapter.setStateAsync('control.pump.backwash_last_date', { val: '', ack: true });
        }

        await adapter.setObjectNotExistsAsync('control.pump.backwash_required', {
            type: 'state',
            common: {
                name: {
                    en: 'Backwash required',
                    de: 'Rueckspuelung erforderlich',
                },
                desc: {
                    en: 'Automatically set to true when the configured backwash interval has been exceeded',
                    de: 'Wird automatisch auf true gesetzt, wenn das konfigurierte Rueckspuelintervall ueberschritten wurde',
                },
                type: 'boolean',
                role: 'indicator.alarm',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.backwash_required', { val: false, ack: true });

        // Wartungsmodus aktiv
        await adapter.setObjectNotExistsAsync('control.pump.maintenance_active', {
            type: 'state',
            common: {
                name: {
                    en: 'Maintenance mode active',
                    de: 'Wartungsmodus aktiv',
                },
                desc: {
                    en: 'Disables automatic functions and allows manual pump control',
                    de: 'Deaktiviert automatische Funktionen und ermoeglicht die manuelle Pumpensteuerung',
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.pump.maintenance_active', { val: false, ack: true });

        // Benachrichtigungen aktivieren (mit Persist-Schutz)
        await adapter.setObjectNotExistsAsync('control.pump.notifications_enabled', {
            type: 'state',
            common: {
                name: {
                    en: 'Enable notifications',
                    de: 'Benachrichtigungen aktivieren',
                },
                desc: {
                    en: 'If enabled, announcements or messages are sent for backwash and maintenance (email, Telegram, Alexa)',
                    de: 'Wenn aktiviert, werden Ansagen oder Nachrichten fuer Rueckspuelung und Wartung gesendet (E-Mail, Telegram, Alexa)',
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: true,
                persist: true, // dauerhaft speichern
            },
            native: {},
        });
        const existingNoti = await adapter.getStateAsync('control.pump.notifications_enabled');
        if (existingNoti === null || existingNoti.val === null || existingNoti.val === undefined) {
            await adapter.setStateAsync('control.pump.notifications_enabled', { val: true, ack: true });
        }

        // ---------------------------------------------------------------------
        // Channel: control.energy
        await adapter.setObjectNotExistsAsync('control.energy', {
            type: 'channel',
            common: {
                name: {
                    en: 'Energy management',
                    de: 'Energiemanagement',
                },
            },
            native: {},
        });

        // Button: Energiezähler zurücksetzen
        await adapter.setObjectNotExistsAsync('control.energy.reset', {
            type: 'state',
            common: {
                name: {
                    en: 'Reset energy counters',
                    de: 'Energiezaehler zuruecksetzen',
                },
                desc: {
                    en: 'Resets all consumption and cost values to 0 (total reset)',
                    de: 'Setzt alle Verbrauchs- und Kostenwerte auf 0 zurueck (Gesamt-Reset)',
                },
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
                name: {
                    en: 'Daily circulation control',
                    de: 'Taegliche Umwaelzungssteuerung',
                },
            },
            native: {},
        });

        // Modus der Umwälzungsprüfung
        await adapter.setObjectNotExistsAsync('control.circulation.mode', {
            type: 'state',
            common: {
                name: {
                    en: 'Circulation check mode',
                    de: 'Modus der Umwaelzungspruefung',
                },
                desc: {
                    en: 'Defines if and how daily circulation is checked and if additional pumping is required',
                    de: 'Legt fest, ob und wie die taegliche Umwaelzung geprueft wird und ob zusaetzliches Pumpen erforderlich ist',
                },
                type: 'string',
                role: 'level',
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
        try {
            await adapter.extendObjectAsync('control.circulation.mode', { common: { persist: true } });
        } catch (err) {
            adapter.log.warn(
                `[controlStates] Persist flag for control.circulation.mode could not be set: ${err.message}`,
            );
        }

        // FIX: Default nur setzen, wenn noch kein Wert existiert (Überinstall-Schutz)
        const existingCirculationMode = await adapter.getStateAsync('control.circulation.mode');
        if (
            existingCirculationMode === null ||
            existingCirculationMode.val === null ||
            existingCirculationMode.val === undefined
        ) {
            await adapter.setStateAsync('control.circulation.mode', { val: 'notify', ack: true });
        }

        // Prüfzeitpunkt (mit Persist-Schutz)
        await adapter.setObjectNotExistsAsync('control.circulation.check_time', {
            type: 'state',
            common: {
                name: {
                    en: 'Daily circulation check time',
                    de: 'Pruefzeit fuer taegliche Umwaelzung',
                },
                desc: {
                    en: 'Time when daily circulation is checked and reported if necessary (format HH:MM)',
                    de: 'Zeitpunkt, zu dem die taegliche Umwaelzung geprueft und bei Bedarf gemeldet wird (Format HH:MM)',
                },
                type: 'string',
                role: 'level',
                read: true,
                write: true,
                def: '18:00',
                persist: true, // dauerhaft speichern
            },
            native: {},
        });
        const existingCheckTime = await adapter.getStateAsync('control.circulation.check_time');
        if (existingCheckTime === null || existingCheckTime.val === null || existingCheckTime.val === undefined) {
            await adapter.setStateAsync('control.circulation.check_time', { val: '18:00', ack: true });
        }

        // letzter Bericht
        await adapter.setObjectNotExistsAsync('control.circulation.last_report', {
            type: 'state',
            common: {
                name: {
                    en: 'Last daily circulation report',
                    de: 'Letzter taeglicher Umwaelzungsbericht',
                },
                desc: {
                    en: 'Timestamp of the last automatically generated circulation report',
                    de: 'Zeitstempel des zuletzt automatisch erzeugten Umwaelzungsberichts',
                },
                type: 'string',
                role: 'date',
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync('control.circulation.last_report', { val: '', ack: true });
    } catch (err) {
        adapter.log.error(`[controlStates] Error while creating control states: ${err.message}`);
    }
}

module.exports = { createControlStates };

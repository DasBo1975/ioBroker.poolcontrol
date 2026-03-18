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
                name: 'Control',
                desc: 'Manual control and runtime functions (VIS / Blockly)',
            },
            native: {},
        });

        // ---------------------------------------------------------------------
        // Channel: control.pump
        await adapter.setObjectNotExistsAsync('control.pump', {
            type: 'channel',
            common: {
                name: 'Pump control',
                desc: 'Manual actions such as backwash or maintenance',
            },
            native: {},
        });

        // Rückspülung starten
        await adapter.setObjectNotExistsAsync('control.pump.backwash_start', {
            type: 'state',
            common: {
                name: 'Start backwash',
                desc: 'Starts backwash for the configured duration',
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
                name: 'Backwash active',
                desc: 'Shows whether backwash is currently running',
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
                name: 'Backwash duration (minutes)',
                desc: 'Defines how long the backwash should run',
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
                name: 'Backwash reminder active',
                desc: 'If enabled, the adapter automatically reminds you to backwash after the configured interval has elapsed',
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
                name: 'Backwash reminder: interval (days)',
                desc: 'Number of days after which a backwash reminder is triggered',
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
                name: 'Last backwash (date)',
                desc: 'Timestamp of the last performed backwash, used for reminder calculation',
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
                name: 'Backwash required',
                desc: 'Automatically set to true when the configured backwash interval has been exceeded',
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
                name: 'Maintenance mode active',
                desc: 'Disables automatic functions and allows manual pump control',
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
                name: 'Enable notifications',
                desc: 'If enabled, announcements or messages are sent for backwash and maintenance (email, Telegram, Alexa)',             type: 'boolean',
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
                name: 'Energy management',
                desc: 'Functions to reset consumption and cost values',
            },
            native: {},
        });

        // Button: Energiezähler zurücksetzen
        await adapter.setObjectNotExistsAsync('control.energy.reset', {
            type: 'state',
            common: {
                name: 'Reset energy counters',
                desc: 'Resets all consumption and cost values to 0 (total reset)',
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
                name: 'Daily circulation control',
                desc: 'Automatic or manual check of the daily circulation amount',
            },
            native: {},
        });

        // Modus der Umwälzungsprüfung
        await adapter.setObjectNotExistsAsync('control.circulation.mode', {
            type: 'state',
            common: {
                name: 'Circulation check mode',
                desc: 'Defines if and how daily circulation is checked and if additional pumping is required',
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
                name: 'Daily circulation check time',
                desc: 'Time when daily circulation is checked and reported if necessary (format HH:MM)',
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
                name: 'Last daily circulation report',
                desc: 'Timestamp of the last automatically generated circulation report',
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

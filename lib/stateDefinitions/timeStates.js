'use strict';

/**
 * Legt alle States für die Zeitsteuerung an:
 * - time1_active, time1_start, time1_end, time1_day_mon ... time1_day_sun
 * - time2_active, time2_start, time2_end, time2_day_mon ... time2_day_sun
 * - time3_active, time3_start, time3_end, time3_day_mon ... time3_day_sun
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createTimeStates(adapter) {
    // Channel: Zeitsteuerung
    await adapter.setObjectNotExistsAsync('timecontrol', {
        type: 'channel',
        common: {
            name: {
                en: 'Time control',
                de: 'Zeitsteuerung',
            },
        },
        native: {},
    });

    async function createTimeWindow(prefix, label) {
        // Aktiv
        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_active`, {
            type: 'state',
            common: {
                name: {
                    en: `Time window ${label} active`,
                    de: `Zeitfenster ${label} Aktiv`,
                },
                desc: {
                    en: `Enables or disables time window ${label}`,
                    de: `Aktiviert oder deaktiviert das Zeitfenster ${label}`,
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
            },
            native: {},
        });
        await adapter.setStateAsync(`timecontrol.${prefix}_active`, {
            val: adapter.config[`${prefix}_active`],
            ack: true,
        });

        // Startzeit
        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_start`, {
            type: 'state',
            common: {
                name: {
                    en: `Time window ${label} start (HH:MM)`,
                    de: `Zeitfenster ${label} Start (HH:MM)`,
                },
                desc: {
                    en: `Start time of time window ${label} in HH:MM format`,
                    de: `Startzeit des Zeitfensters ${label} im Format HH:MM`,
                },
                type: 'string',
                role: 'level',
                read: true,
                write: true,
            },
            native: {},
        });
        await adapter.setStateAsync(`timecontrol.${prefix}_start`, {
            val: adapter.config[`${prefix}_start`] || '00:00',
            ack: true,
        });

        // Endzeit
        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_end`, {
            type: 'state',
            common: {
                name: {
                    en: `Time window ${label} end (HH:MM)`,
                    de: `Zeitfenster ${label} Ende (HH:MM)`,
                },
                desc: {
                    en: `End time of time window ${label} in HH:MM format`,
                    de: `Endzeit des Zeitfensters ${label} im Format HH:MM`,
                },
                type: 'string',
                role: 'level',
                read: true,
                write: true,
            },
            native: {},
        });
        await adapter.setStateAsync(`timecontrol.${prefix}_end`, {
            val: adapter.config[`${prefix}_end`] || '00:00',
            ack: true,
        });

        // Wochentage
        const days = [
            ['mon', { en: 'Monday', de: 'Montag' }],
            ['tue', { en: 'Tuesday', de: 'Dienstag' }],
            ['wed', { en: 'Wednesday', de: 'Mittwoch' }],
            ['thu', { en: 'Thursday', de: 'Donnerstag' }],
            ['fri', { en: 'Friday', de: 'Freitag' }],
            ['sat', { en: 'Saturday', de: 'Samstag' }],
            ['sun', { en: 'Sunday', de: 'Sonntag' }],
        ];

        for (const [key, labelDay] of days) {
            await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_day_${key}`, {
                type: 'state',
                common: {
                    name: {
                        en: `Time window ${label} ${labelDay.en}`,
                        de: `Zeitfenster ${label} ${labelDay.de}`,
                    },
                    desc: {
                        en: `Defines whether time window ${label} is active on ${labelDay.en}`,
                        de: `Legt fest, ob das Zeitfenster ${label} am ${labelDay.de} aktiv ist`,
                    },
                    type: 'boolean',
                    role: 'switch',
                    read: true,
                    write: true,
                },
                native: {},
            });
            await adapter.setStateAsync(`timecontrol.${prefix}_day_${key}`, {
                val: adapter.config[`${prefix}_day_${key}`],
                ack: true,
            });
        }
    }

    // Zeitfenster 1 bis 3 anlegen
    await createTimeWindow('time1', '1');
    await createTimeWindow('time2', '2');
    await createTimeWindow('time3', '3');
}

module.exports = {
    createTimeStates,
};

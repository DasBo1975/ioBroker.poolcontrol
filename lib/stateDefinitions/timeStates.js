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

    async function setInitialStateIfMissing(id, value) {
        const current = await adapter.getStateAsync(id);
        if (!current || current.val === null || current.val === undefined) {
            await adapter.setStateAsync(id, {
                val: value,
                ack: true,
            });
        }
    }

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
                persist: true,
            },
            native: {},
        });

        // FIX: Initialwert nur setzen, wenn noch kein Statewert vorhanden ist
        await setInitialStateIfMissing(`timecontrol.${prefix}_active`, !!adapter.config[`${prefix}_active`]);

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
                persist: true,
            },
            native: {},
        });
        // FIX: Initialwert nur setzen, wenn noch kein Statewert vorhanden ist
        await setInitialStateIfMissing(`timecontrol.${prefix}_start`, adapter.config[`${prefix}_start`] || '00:00');

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
                persist: true,
            },
            native: {},
        });
        // FIX: Initialwert nur setzen, wenn noch kein Statewert vorhanden ist
        await setInitialStateIfMissing(`timecontrol.${prefix}_end`, adapter.config[`${prefix}_end`] || '00:00');

        // Optionaler Intervallbetrieb innerhalb des Zeitfensters
        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_interval_active`, {
            type: 'state',
            common: {
                name: {
                    en: `Time window ${label} interval mode active`,
                    de: `Zeitfenster ${label} Intervallbetrieb aktiv`,
                },
                desc: {
                    en: `Enables interval operation within time window ${label}`,
                    de: `Aktiviert den Intervallbetrieb innerhalb von Zeitfenster ${label}`,
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true,
            },
            native: {},
        });
        await setInitialStateIfMissing(`timecontrol.${prefix}_interval_active`, false);

        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_interval_every_min`, {
            type: 'state',
            common: {
                name: {
                    en: `Time window ${label} interval period`,
                    de: `Zeitfenster ${label} Intervallabstand`,
                },
                desc: {
                    en: `Defines how often an interval starts within time window ${label}`,
                    de: `Legt fest, wie oft ein Intervall innerhalb von Zeitfenster ${label} startet`,
                },
                type: 'number',
                role: 'value.interval',
                unit: 'min',
                read: true,
                write: true,
                def: 60,
                min: 10,
                max: 1440,
                persist: true,
            },
            native: {},
        });
        await setInitialStateIfMissing(`timecontrol.${prefix}_interval_every_min`, 60);

        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_interval_run_min`, {
            type: 'state',
            common: {
                name: {
                    en: `Time window ${label} interval run time`,
                    de: `Zeitfenster ${label} Intervalllaufzeit`,
                },
                desc: {
                    en: `Defines how long the pump runs per interval within time window ${label}`,
                    de: `Legt fest, wie lange die Pumpe je Intervall innerhalb von Zeitfenster ${label} laeuft`,
                },
                type: 'number',
                role: 'value.interval',
                unit: 'min',
                read: true,
                write: true,
                def: 15,
                min: 5,
                max: 1440,
                persist: true,
            },
            native: {},
        });
        await setInitialStateIfMissing(`timecontrol.${prefix}_interval_run_min`, 15);

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
                    persist: true,
                },
                native: {},
            });
            // FIX: Initialwert nur setzen, wenn noch kein Statewert vorhanden ist
            await setInitialStateIfMissing(
                `timecontrol.${prefix}_day_${key}`,
                !!adapter.config[`${prefix}_day_${key}`],
            );
        }
    }

    // Zeitfenster 1 bis 3 anlegen
    await createTimeWindow('time1', '1');
    await createTimeWindow('time2', '2');
    await createTimeWindow('time3', '3');

    await adapter.setObjectNotExistsAsync('timecontrol.status_text', {
        type: 'state',
        common: {
            name: {
                en: 'Time control status',
                de: 'Status der Zeitsteuerung',
            },
            desc: {
                en: 'Diagnostic status of time control and interval operation',
                de: 'Diagnosestatus der Zeitsteuerung und des Intervallbetriebs',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        native: {},
    });
    await setInitialStateIfMissing('timecontrol.status_text', '');
}

module.exports = {
    createTimeStates,
};

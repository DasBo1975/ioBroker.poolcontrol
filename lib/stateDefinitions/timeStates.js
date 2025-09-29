"use strict";

/**
 * Legt alle States für die Zeitsteuerung an:
 * - time1_active, time1_start, time1_end, time1_day_mon ... time1_day_sun
 * - time2_active, time2_start, time2_end, time2_day_mon ... time2_day_sun
 * - time3_active, time3_start, time3_end, time3_day_mon ... time3_day_sun
 */

async function createTimeStates(adapter) {
    async function createTimeWindow(prefix, label) {
        // Aktiv
        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_active`, {
            type: "state",
            common: {
                name: `Zeitfenster ${label} aktiv`,
                type: "boolean",
                role: "switch",
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
            type: "state",
            common: {
                name: `Zeitfenster ${label} Start (HH:MM)`,
                type: "string",
                role: "value.time",
                read: true,
                write: true,
            },
            native: {},
        });
        await adapter.setStateAsync(`timecontrol.${prefix}_start`, {
            val: adapter.config[`${prefix}_start`] || "00:00",
            ack: true,
        });

        // Endzeit
        await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_end`, {
            type: "state",
            common: {
                name: `Zeitfenster ${label} Ende (HH:MM)`,
                type: "string",
                role: "value.time",
                read: true,
                write: true,
            },
            native: {},
        });
        await adapter.setStateAsync(`timecontrol.${prefix}_end`, {
            val: adapter.config[`${prefix}_end`] || "00:00",
            ack: true,
        });

        // Wochentage
        const days = [
            ["mon", "Montag"],
            ["tue", "Dienstag"],
            ["wed", "Mittwoch"],
            ["thu", "Donnerstag"],
            ["fri", "Freitag"],
            ["sat", "Samstag"],
            ["sun", "Sonntag"],
        ];

        for (const [key, labelDay] of days) {
            await adapter.setObjectNotExistsAsync(`timecontrol.${prefix}_day_${key}`, {
                type: "state",
                common: {
                    name: `Zeitfenster ${label} ${labelDay}`,
                    type: "boolean",
                    role: "switch",
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
    await createTimeWindow("time1", "1");
    await createTimeWindow("time2", "2");
    await createTimeWindow("time3", "3");
}

module.exports = {
    createTimeStates,
};

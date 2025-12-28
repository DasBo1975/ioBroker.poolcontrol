'use strict';

/**
 * Legt alle States für die Heizungs- / Wärmepumpensteuerung an
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createHeatStates(adapter) {
    const channelId = 'heat';

    // ---------------------------------------------------------
    // Channel
    // ---------------------------------------------------------
    await adapter.setObjectNotExistsAsync(channelId, {
        type: 'channel',
        common: {
            name: 'Heizung / Wärmepumpe',
        },
        native: {},
    });

    // ---------------------------------------------------------
    // Steuerung / Konfiguration (write = true, persistent)
    // ---------------------------------------------------------

    await adapter.setObjectNotExistsAsync(`${channelId}.control_active`, {
        type: 'state',
        common: {
            name: 'Heizungssteuerung aktiv',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingControlActive = await adapter.getStateAsync(`${channelId}.control_active`);
    if (
        existingControlActive === null ||
        existingControlActive.val === null ||
        existingControlActive.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.control_active`, {
            val: adapter.config.heat_control_active ?? false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.control_type`, {
        type: 'state',
        common: {
            name: 'Art der Heizungssteuerung',
            type: 'string',
            role: 'text',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingControlType = await adapter.getStateAsync(`${channelId}.control_type`);
    if (existingControlType === null || existingControlType.val === null || existingControlType.val === undefined) {
        await adapter.setStateAsync(`${channelId}.control_type`, {
            val: adapter.config.heat_control_type ?? 'socket',
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.control_object_id`, {
        type: 'state',
        common: {
            name: 'Steuer-Objekt-ID Heizung',
            type: 'string',
            role: 'text',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingObjectId = await adapter.getStateAsync(`${channelId}.control_object_id`);
    if (existingObjectId === null || existingObjectId.val === null || existingObjectId.val === undefined) {
        await adapter.setStateAsync(`${channelId}.control_object_id`, {
            val: adapter.config.heat_control_object_id ?? '',
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.target_temperature`, {
        type: 'state',
        common: {
            name: 'Zieltemperatur Pool',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingTargetTemp = await adapter.getStateAsync(`${channelId}.target_temperature`);
    if (existingTargetTemp === null || existingTargetTemp.val === null || existingTargetTemp.val === undefined) {
        await adapter.setStateAsync(`${channelId}.target_temperature`, {
            val: adapter.config.heat_temp_target ?? 26,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.max_temperature`, {
        type: 'state',
        common: {
            name: 'Maximale Pooltemperatur (Sicherheit)',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingMaxTemp = await adapter.getStateAsync(`${channelId}.max_temperature`);
    if (existingMaxTemp === null || existingMaxTemp.val === null || existingMaxTemp.val === undefined) {
        await adapter.setStateAsync(`${channelId}.max_temperature`, {
            val: adapter.config.heat_temp_max ?? 30,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.pump_afterrun_minutes`, {
        type: 'state',
        common: {
            name: 'Pumpen-Nachlaufzeit nach Heizung',
            type: 'number',
            role: 'value.interval',
            unit: 'min',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingAfterrun = await adapter.getStateAsync(`${channelId}.pump_afterrun_minutes`);
    if (existingAfterrun === null || existingAfterrun.val === null || existingAfterrun.val === undefined) {
        await adapter.setStateAsync(`${channelId}.pump_afterrun_minutes`, {
            val: 5,
            ack: true,
        });
    }

    // ---------------------------------------------------------
    // Betriebsstatus (write = false)
    // ---------------------------------------------------------

    await adapter.setObjectNotExistsAsync(`${channelId}.active`, {
        type: 'state',
        common: {
            name: 'Heizung aktiv',
            type: 'boolean',
            role: 'indicator.working',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.mode`, {
        type: 'state',
        common: {
            name: 'Heizungsmodus',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.blocked`, {
        type: 'state',
        common: {
            name: 'Heizung blockiert',
            type: 'boolean',
            role: 'indicator.blocked',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.afterrun_active`, {
        type: 'state',
        common: {
            name: 'Pumpen-Nachlauf aktiv',
            type: 'boolean',
            role: 'indicator.working',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.last_change`, {
        type: 'state',
        common: {
            name: 'Letzte Statusänderung Heizung',
            type: 'number',
            role: 'value.time',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.heating_request`, {
        type: 'state',
        common: {
            name: 'Heizanforderung (PoolControl)',
            type: 'boolean',
            role: 'indicator.request',
            read: true,
            write: false,
            def: false,
        },
        native: {},
    });

    // ---------------------------------------------------------
    // Transparenz / Diagnose
    // ---------------------------------------------------------

    await adapter.setObjectNotExistsAsync(`${channelId}.reason`, {
        type: 'state',
        common: {
            name: 'Grund für Heizungsstatus',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.info`, {
        type: 'state',
        common: {
            name: 'Heizungs-Info',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
}

module.exports = {
    createHeatStates,
};

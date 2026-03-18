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
            name: 'Heating / heat pump',
        },
        native: {},
    });

    // ---------------------------------------------------------
    // Steuerung / Konfiguration (write = true, persistent)
    // ---------------------------------------------------------

    await adapter.setObjectNotExistsAsync(`${channelId}.control_active`, {
        type: 'state',
        common: {
            name: 'Heating control active',
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
            name: 'Type of heating control',
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
            name: 'Control object ID (heating)',
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
            name: 'Pool target temperature',
            type: 'number',
            role: 'level',
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
            name: 'Maximum pool temperature (safety)',
            type: 'number',
            role: 'level',
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

    // --- NEU: Pumpen-Vorlaufzeit vor Heizstart ---
    await adapter.setObjectNotExistsAsync(`${channelId}.pump_prerun_minutes`, {
        type: 'state',
        common: {
            name: 'Pump pre-run time before heating',
            type: 'number',
            role: 'level',
            unit: 'min',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingPrerun = await adapter.getStateAsync(`${channelId}.pump_prerun_minutes`);
    if (existingPrerun === null || existingPrerun.val === null || existingPrerun.val === undefined) {
        await adapter.setStateAsync(`${channelId}.pump_prerun_minutes`, {
            val: 0,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.pump_afterrun_minutes`, {
        type: 'state',
        common: {
            name: 'Pump after-run time after heating',
            type: 'number',
            role: 'level',
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
            name: 'Heating active',
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
            name: 'Heating mode',
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
            name: 'Heating blocked',
            type: 'boolean',
            role: 'indicator.blocked',
            read: true,
            write: false,
        },
        native: {},
    });

    // --- NEU: Pumpen-Vorlauf aktiv ---
    await adapter.setObjectNotExistsAsync(`${channelId}.prerun_active`, {
        type: 'state',
        common: {
            name: 'Pump pre-run active',
            type: 'boolean',
            role: 'indicator.working',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync(`${channelId}.afterrun_active`, {
        type: 'state',
        common: {
            name: 'Pump after-run active',
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
            name: 'Last heating status change',
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
            name: 'Heating request (PoolControl)',
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
            name: 'Reason for heating status',
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
            name: 'Heating info',
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

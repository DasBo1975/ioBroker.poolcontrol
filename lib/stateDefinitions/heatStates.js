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
            name: {
                en: 'Heating / heat pump',
                de: 'Heizung / Waermepumpe',
            },
        },
        native: {},
    });

    // ---------------------------------------------------------
    // Steuerung / Konfiguration (write = true, persistent)
    // ---------------------------------------------------------

    await adapter.setObjectNotExistsAsync(`${channelId}.control_active`, {
        type: 'state',
        common: {
            name: {
                en: 'Heating control active',
                de: 'Heizungssteuerung aktiv',
            },
            desc: {
                en: 'Enables or disables the automatic heating control',
                de: 'Aktiviert oder deaktiviert die automatische Heizungssteuerung',
            },
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
            name: {
                en: 'Type of heating control',
                de: 'Typ der Heizungssteuerung',
            },
            desc: {
                en: 'Defines which type of heating control is used',
                de: 'Legt fest, welcher Typ der Heizungssteuerung verwendet wird',
            },
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
            name: {
                en: 'Control object ID (heating)',
                de: 'Steuerobjekt-ID (Heizung)',
            },
            desc: {
                en: 'Object ID used to control the heating',
                de: 'Objekt-ID, die zur Steuerung der Heizung verwendet wird',
            },
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
            name: {
                en: 'Pool target temperature',
                de: 'Pool-Solltemperatur',
            },
            desc: {
                en: 'Desired target temperature for the pool water',
                de: 'Gewuenschte Solltemperatur fuer das Poolwasser',
            },
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
            name: {
                en: 'Maximum pool temperature (safety)',
                de: 'Maximale Pooltemperatur (Sicherheit)',
            },
            desc: {
                en: 'Maximum allowed pool temperature for safety shutdown',
                de: 'Maximal zulaessige Pooltemperatur fuer die Sicherheitsabschaltung',
            },
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
            name: {
                en: 'Pump pre-run time before heating',
                de: 'Pumpen-Vorlaufzeit vor Heizung',
            },
            desc: {
                en: 'Configured pump pre-run time in minutes before heating starts',
                de: 'Konfigurierte Pumpen-Vorlaufzeit in Minuten vor dem Heizstart',
            },
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
            name: {
                en: 'Pump after-run time after heating',
                de: 'Pumpen-Nachlaufzeit nach Heizung',
            },
            desc: {
                en: 'Configured pump after-run time in minutes after heating stops',
                de: 'Konfigurierte Pumpen-Nachlaufzeit in Minuten nach dem Heizende',
            },
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
            name: {
                en: 'Heating active',
                de: 'Heizung aktiv',
            },
            desc: {
                en: 'Shows whether heating is currently active',
                de: 'Zeigt an, ob die Heizung aktuell aktiv ist',
            },
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
            name: {
                en: 'Heating mode',
                de: 'Heizmodus',
            },
            desc: {
                en: 'Current operating mode of the heating control',
                de: 'Aktueller Betriebsmodus der Heizungssteuerung',
            },
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
            name: {
                en: 'Heating blocked',
                de: 'Heizung blockiert',
            },
            desc: {
                en: 'Shows whether heating is currently blocked',
                de: 'Zeigt an, ob die Heizung aktuell blockiert ist',
            },
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
            name: {
                en: 'Pump pre-run active',
                de: 'Pumpen-Vorlauf aktiv',
            },
            desc: {
                en: 'Indicates whether the pump is currently running before the heating process starts',
                de: 'Zeigt an, ob die Pumpe aktuell vor dem Heizvorgang läuft',
            },
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
            name: {
                en: 'Pump after-run active',
                de: 'Pumpen-Nachlauf aktiv',
            },
            desc: {
                en: 'Indicates whether the pump is currently running after the heating process has finished',
                de: 'Zeigt an, ob die Pumpe aktuell nach dem Heizvorgang läuft',
            },
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
            name: {
                en: 'Last heating status change',
                de: 'Letzte Aenderung des Heizstatus',
            },
            desc: {
                en: 'Timestamp of the last heating status change',
                de: 'Zeitstempel der letzten Aenderung des Heizstatus',
            },
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
            name: {
                en: 'Heating request (PoolControl)',
                de: 'Heizanforderung (PoolControl)',
            },
            desc: {
                en: 'Indicates whether PoolControl currently requests heating',
                de: 'Zeigt an, ob PoolControl aktuell Wärme anfordert',
            },
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
            name: {
                en: 'Reason for heating status',
                de: 'Grund fuer Heizstatus',
            },
            desc: {
                en: 'Reason text for the current heating status',
                de: 'Begruendungstext fuer den aktuellen Heizstatus',
            },
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
            name: {
                en: 'Heating info',
                de: 'Heizungsinfo',
            },
            desc: {
                en: 'Additional information text about the heating status',
                de: 'Zusaetzlicher Informationstext zum Heizstatus',
            },
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

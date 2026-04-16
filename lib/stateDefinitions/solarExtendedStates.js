'use strict';

/**
 * Legt alle States für die erweiterte Solarsteuerung an
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createSolarExtendedStates(adapter) {
    const channelId = 'solar.extended';

    // ---------------------------------------------------------
    // Channel
    // ---------------------------------------------------------
    await adapter.setObjectNotExistsAsync(channelId, {
        type: 'channel',
        common: {
            name: {
                en: 'Extended solar control',
                de: 'Erweiterte Solarsteuerung',
            },
        },
        native: {},
    });

    // ---------------------------------------------------------
    // Konfiguration (write = true, persistent)
    await adapter.setObjectNotExistsAsync(`${channelId}.control_object_id`, {
        type: 'state',
        common: {
            name: {
                en: 'Control object ID',
                de: 'Steuerobjekt-ID',
            },
            desc: {
                en: 'Object ID of the external actuator used for extended solar control',
                de: 'Objekt-ID des externen Aktors fuer die erweiterte Solarsteuerung',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingControlObjectId = await adapter.getStateAsync(`${channelId}.control_object_id`);
    if (
        existingControlObjectId === null ||
        existingControlObjectId.val === null ||
        existingControlObjectId.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.control_object_id`, {
            val: '',
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.control_type`, {
        type: 'state',
        common: {
            name: {
                en: 'Control type',
                de: 'Steuerungstyp',
            },
            desc: {
                en: 'Defines the control type of the external actuator, for example boolean or socket',
                de: 'Legt den Steuerungstyp des externen Aktors fest, zum Beispiel boolean oder socket',
            },
            type: 'string',
            role: 'text',
            // NEU: Auswahlwerte für Dropdown
            states: {
                boolean: 'Schalter (boolean)',
                socket: 'Steckdose (socket)',
            },
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingControlType = await adapter.getStateAsync(`${channelId}.control_type`);
    if (existingControlType === null || existingControlType.val === null || existingControlType.val === undefined) {
        await adapter.setStateAsync(`${channelId}.control_type`, {
            val: 'boolean',
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.control_inverted`, {
        type: 'state',
        common: {
            name: {
                en: 'Control inverted',
                de: 'Steuerung invertiert',
            },
            desc: {
                en: 'Defines whether the external actuator works with inverted logic',
                de: 'Legt fest, ob der externe Aktor logisch invertiert arbeitet',
            },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingControlInverted = await adapter.getStateAsync(`${channelId}.control_inverted`);
    if (
        existingControlInverted === null ||
        existingControlInverted.val === null ||
        existingControlInverted.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.control_inverted`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.delta_on`, {
        type: 'state',
        common: {
            name: {
                en: 'Switch-on temperature difference',
                de: 'Einschalt-Temperaturdifferenz',
            },
            desc: {
                en: 'Temperature difference in degrees Celsius required to activate extended solar control',
                de: 'Temperaturdifferenz in Grad Celsius, die zum Einschalten der erweiterten Solarsteuerung erforderlich ist',
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
    const existingDeltaOn = await adapter.getStateAsync(`${channelId}.delta_on`);
    if (existingDeltaOn === null || existingDeltaOn.val === null || existingDeltaOn.val === undefined) {
        await adapter.setStateAsync(`${channelId}.delta_on`, {
            val: 3,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.delta_off`, {
        type: 'state',
        common: {
            name: {
                en: 'Switch-off temperature difference',
                de: 'Ausschalt-Temperaturdifferenz',
            },
            desc: {
                en: 'Temperature difference in degrees Celsius below which extended solar control is deactivated',
                de: 'Temperaturdifferenz in Grad Celsius, unterhalb der die erweiterte Solarsteuerung ausgeschaltet wird',
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
    const existingDeltaOff = await adapter.getStateAsync(`${channelId}.delta_off`);
    if (existingDeltaOff === null || existingDeltaOff.val === null || existingDeltaOff.val === undefined) {
        await adapter.setStateAsync(`${channelId}.delta_off`, {
            val: 1,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.max_temperature`, {
        type: 'state',
        common: {
            name: {
                en: 'Maximum pool temperature',
                de: 'Maximale Pooltemperatur',
            },
            desc: {
                en: 'Maximum allowed pool temperature for safety shutdown of the extended solar control',
                de: 'Maximal zulaessige Pooltemperatur fuer die Sicherheitsabschaltung der erweiterten Solarsteuerung',
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
    const existingMaxTemperature = await adapter.getStateAsync(`${channelId}.max_temperature`);
    if (
        existingMaxTemperature === null ||
        existingMaxTemperature.val === null ||
        existingMaxTemperature.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.max_temperature`, {
            val: 30,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.pool_temperature_source`, {
        type: 'state',
        common: {
            name: {
                en: 'Pool temperature source selection',
                de: 'Auswahl der Pooltemperatur-Quelle',
            },
            desc: {
                en: 'Defines which pool temperature source is used as comparison value for the extended solar control. Currently only surface or ground are intended values.',
                de: 'Legt fest, welche Pooltemperatur-Quelle als Vergleichswert fuer die erweiterte Solarsteuerung verwendet wird. Aktuell sind nur surface oder ground als Werte vorgesehen.',
            },
            type: 'string',
            role: 'text',
            // NEU: Auswahlwerte für Dropdown
            states: {
                surface: 'Oberfläche (surface)',
                ground: 'Grund (ground)',
            },
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    const existingPoolTemperatureSource = await adapter.getStateAsync(`${channelId}.pool_temperature_source`);
    if (
        existingPoolTemperatureSource === null ||
        existingPoolTemperatureSource.val === null ||
        existingPoolTemperatureSource.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.pool_temperature_source`, {
            val: 'surface',
            ack: true,
        });
    }

    // ---------------------------------------------------------
    // Status / Anforderung (write = false)
    // ---------------------------------------------------------
    await adapter.setObjectNotExistsAsync(`${channelId}.enabled_by_master`, {
        type: 'state',
        common: {
            name: {
                en: 'Enabled by solar master',
                de: 'Durch Solar-Hauptfunktion freigegeben',
            },
            desc: {
                en: 'Shows whether the main solar function currently allows the extended solar control in principle',
                de: 'Zeigt an, ob die Solar-Hauptfunktion die erweiterte Solarsteuerung grundsaetzlich freigibt',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingEnabledByMaster = await adapter.getStateAsync(`${channelId}.enabled_by_master`);
    if (
        existingEnabledByMaster === null ||
        existingEnabledByMaster.val === null ||
        existingEnabledByMaster.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.enabled_by_master`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.request_active`, {
        type: 'state',
        common: {
            name: {
                en: 'Extended solar request active',
                de: 'Solar-Extended-Anforderung aktiv',
            },
            desc: {
                en: 'Shows whether the extended solar logic currently requests activation',
                de: 'Zeigt an, ob die erweiterte Solarlogik aktuell eine Aktivierung anfordert',
            },
            type: 'boolean',
            role: 'indicator.request',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingRequestActive = await adapter.getStateAsync(`${channelId}.request_active`);
    if (
        existingRequestActive === null ||
        existingRequestActive.val === null ||
        existingRequestActive.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.request_active`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.active`, {
        type: 'state',
        common: {
            name: {
                en: 'Extended solar active',
                de: 'Solar Extended aktiv',
            },
            desc: {
                en: 'Shows whether the extended solar control is currently active',
                de: 'Zeigt an, ob die erweiterte Solarsteuerung aktuell aktiv ist',
            },
            type: 'boolean',
            role: 'indicator.working',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingActive = await adapter.getStateAsync(`${channelId}.active`);
    if (existingActive === null || existingActive.val === null || existingActive.val === undefined) {
        await adapter.setStateAsync(`${channelId}.active`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.blocked`, {
        type: 'state',
        common: {
            name: {
                en: 'Extended solar blocked',
                de: 'Solar Extended blockiert',
            },
            desc: {
                en: 'Shows whether the extended solar control is currently blocked',
                de: 'Zeigt an, ob die erweiterte Solarsteuerung aktuell blockiert ist',
            },
            type: 'boolean',
            role: 'indicator.blocked',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingBlocked = await adapter.getStateAsync(`${channelId}.blocked`);
    if (existingBlocked === null || existingBlocked.val === null || existingBlocked.val === undefined) {
        await adapter.setStateAsync(`${channelId}.blocked`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.blocked_by`, {
        type: 'state',
        common: {
            name: {
                en: 'Blocked by',
                de: 'Blockiert durch',
            },
            desc: {
                en: 'Shows what currently blocks the extended solar control, for example standard solar, master disabled or missing config',
                de: 'Zeigt, wodurch die erweiterte Solarsteuerung aktuell blockiert ist, zum Beispiel Standard-Solar, Master deaktiviert oder fehlende Konfiguration',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingBlockedBy = await adapter.getStateAsync(`${channelId}.blocked_by`);
    if (existingBlockedBy === null || existingBlockedBy.val === null || existingBlockedBy.val === undefined) {
        await adapter.setStateAsync(`${channelId}.blocked_by`, {
            val: '',
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.priority_status`, {
        type: 'state',
        common: {
            name: {
                en: 'Priority status',
                de: 'Prioritaetsstatus',
            },
            desc: {
                en: 'Text status for the priority decision between standard solar and extended solar control',
                de: 'Textstatus fuer die Prioritaetsentscheidung zwischen Standard-Solar und erweiterter Solarsteuerung',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingPriorityStatus = await adapter.getStateAsync(`${channelId}.priority_status`);
    if (
        existingPriorityStatus === null ||
        existingPriorityStatus.val === null ||
        existingPriorityStatus.val === undefined
    ) {
        await adapter.setStateAsync(`${channelId}.priority_status`, {
            val: '',
            ack: true,
        });
    }

    // ---------------------------------------------------------
    // Diagnose / Transparenz
    // ---------------------------------------------------------
    await adapter.setObjectNotExistsAsync(`${channelId}.config_ok`, {
        type: 'state',
        common: {
            name: {
                en: 'Configuration valid',
                de: 'Konfiguration gueltig',
            },
            desc: {
                en: 'Shows whether the configuration for the extended solar control is complete and valid',
                de: 'Zeigt an, ob die Konfiguration fuer die erweiterte Solarsteuerung vollstaendig und gueltig ist',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingConfigOk = await adapter.getStateAsync(`${channelId}.config_ok`);
    if (existingConfigOk === null || existingConfigOk.val === null || existingConfigOk.val === undefined) {
        await adapter.setStateAsync(`${channelId}.config_ok`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.actor_state`, {
        type: 'state',
        common: {
            name: {
                en: 'Actor state',
                de: 'Aktorstatus',
            },
            desc: {
                en: 'Optional diagnostic value showing the actual read state of the external actuator',
                de: 'Optionaler Diagnosewert, der den tatsaechlich gelesenen Zustand des externen Aktors zeigt',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingActorState = await adapter.getStateAsync(`${channelId}.actor_state`);
    if (existingActorState === null || existingActorState.val === null || existingActorState.val === undefined) {
        await adapter.setStateAsync(`${channelId}.actor_state`, {
            val: false,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.last_change`, {
        type: 'state',
        common: {
            name: {
                en: 'Last status change',
                de: 'Letzte Statusaenderung',
            },
            desc: {
                en: 'Timestamp of the last status change of the extended solar control',
                de: 'Zeitstempel der letzten Statusaenderung der erweiterten Solarsteuerung',
            },
            type: 'number',
            role: 'value.time',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingLastChange = await adapter.getStateAsync(`${channelId}.last_change`);
    if (existingLastChange === null || existingLastChange.val === null || existingLastChange.val === undefined) {
        await adapter.setStateAsync(`${channelId}.last_change`, {
            val: 0,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.reason`, {
        type: 'state',
        common: {
            name: {
                en: 'Reason for status',
                de: 'Grund fuer Status',
            },
            desc: {
                en: 'Technical reason why the extended solar control is active, inactive or blocked',
                de: 'Technischer Grund, warum die erweiterte Solarsteuerung aktiv, inaktiv oder blockiert ist',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingReason = await adapter.getStateAsync(`${channelId}.reason`);
    if (existingReason === null || existingReason.val === null || existingReason.val === undefined) {
        await adapter.setStateAsync(`${channelId}.reason`, {
            val: '',
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync(`${channelId}.info`, {
        type: 'state',
        common: {
            name: {
                en: 'Extended solar info',
                de: 'Solar-Extended-Info',
            },
            desc: {
                en: 'Readable short summary of the current extended solar status for the user',
                de: 'Lesbare kurze Zusammenfassung des aktuellen Solar-Extended-Status fuer den Nutzer',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    const existingInfo = await adapter.getStateAsync(`${channelId}.info`);
    if (existingInfo === null || existingInfo.val === null || existingInfo.val === undefined) {
        await adapter.setStateAsync(`${channelId}.info`, {
            val: '',
            ack: true,
        });
    }
}

module.exports = {
    createSolarExtendedStates,
};

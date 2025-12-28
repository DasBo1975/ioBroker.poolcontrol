'use strict';

/**
 * Legt alle States für die Pumpenverwaltung an:
 * - pump.pump_max_watt, pump.pump_power_lph
 * - pump.frost_protection_active, pump.frost_protection_temp
 * - pump.pump_switch (JETZT: boolean Schalter)
 * - pump.mode (auto/manual/off/time)
 * - pump.manual_safety_enabled
 * - pump.status, pump.error
 * - pump.current_power
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createPumpStates(adapter) {
    // Channel: Pumpe
    await adapter.setObjectNotExistsAsync('pump', {
        type: 'channel',
        common: {
            name: 'Pumpe',
        },
        native: {},
    });

    // Max. Pumpenleistung (W)
    await adapter.setObjectNotExistsAsync('pump.pump_max_watt', {
        type: 'state',
        common: {
            name: 'Max. Pumpenleistung',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.pump_max_watt', {
        val: adapter.config.pump_max_watt,
        ack: true,
    });

    // Pumpenleistung (l/h)
    await adapter.setObjectNotExistsAsync('pump.pump_power_lph', {
        type: 'state',
        common: {
            name: 'Pumpenleistung (l/h)',
            type: 'number',
            role: 'value.flow',
            unit: 'l/h',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.pump_power_lph', {
        val: adapter.config.pump_power_lph,
        ack: true,
    });

    // Frostschutz aktiv
    await adapter.setObjectNotExistsAsync('pump.frost_protection_active', {
        type: 'state',
        common: {
            name: 'Frostschutz aktiv',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.frost_protection_active', {
        val: adapter.config.frost_protection_active,
        ack: true,
    });

    // Frostschutz-Temperatur
    await adapter.setObjectNotExistsAsync('pump.frost_protection_temp', {
        type: 'state',
        common: {
            name: 'Frostschutz-Temperatur',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.frost_protection_temp', {
        val: adapter.config.frost_protection_temp,
        ack: true,
    });

    // **Zentraler Pumpen-Schalter (boolean)**
    await adapter.setObjectNotExistsAsync('pump.pump_switch', {
        type: 'state',
        common: {
            name: 'Pumpe EIN/AUS',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.pump_switch', { val: false, ack: true });

    // Pumpenmodus (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('pump.mode', {
        type: 'state',
        common: {
            name: 'Pumpenmodus',
            type: 'string',
            role: 'state',
            read: true,
            write: true,
            persist: true, // NEU: dauerhaft speichern
            states: {
                auto: 'Automatik',
                auto_pv: 'Automatik (PV)',
                manual: 'Manuell',
                off: 'Aus',
                time: 'Zeit',
            },
        },
        native: {},
    });

    // Prüfen, ob bereits ein Wert vorhanden ist
    const existingPumpMode = await adapter.getStateAsync('pump.mode');
    if (existingPumpMode === null || existingPumpMode.val === null || existingPumpMode.val === undefined) {
        await adapter.setStateAsync('pump.mode', { val: 'auto', ack: true });
    }

    // Sicherheitslogik im manuellen Modus (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('pump.manual_safety_enabled', {
        type: 'state',
        common: {
            name: "Sicherheitsfunktionen im Modus 'Manuell' aktiv",
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // NEU: dauerhaft speichern
        },
        native: {},
    });

    // Prüfen, ob bereits ein persistierter Wert vorhanden ist
    const existingSafety = await adapter.getStateAsync('pump.manual_safety_enabled');
    if (existingSafety === null || existingSafety.val === null || existingSafety.val === undefined) {
        await adapter.setStateAsync('pump.manual_safety_enabled', {
            val: adapter.config.manual_safety_enabled ?? true,
            ack: true,
        });
    }

    // Pumpenstatus (Text)
    await adapter.setObjectNotExistsAsync('pump.status', {
        type: 'state',
        common: {
            name: 'Pumpenstatus',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.status', { val: 'AUS', ack: true });

    // Aktiver Helfer (Vorrangsteuerung)
    await adapter.setObjectNotExistsAsync('pump.active_helper', {
        type: 'state',
        common: {
            name: 'Aktiver Helfer (Vorrangsteuerung)',
            desc: 'Zeigt an, welcher Helper aktuell die Vorrangsteuerung der Pumpe übernommen hat (z. B. Control, Solar, Frost, Zeit, Heizung …)',
            type: 'string',
            role: 'text',
            read: true,
            write: false, // Nur intern schreibbar
            hidden: false, // Sichtbar, damit Nutzer den aktiven Helper sehen kann
        },
        native: {},
    });
    await adapter.setStateAsync('pump.active_helper', {
        val: '',
        ack: true,
    });

    // Pumpenfehler (bool)
    await adapter.setObjectNotExistsAsync('pump.error', {
        type: 'state',
        common: {
            name: 'Pumpenfehler',
            type: 'boolean',
            role: 'indicator.error',
            read: true,
            write: true, // manuell quittierbar
        },
        native: {},
    });
    await adapter.setStateAsync('pump.error', { val: false, ack: true });

    // Aktuelle Leistung der Pumpe (W)
    await adapter.setObjectNotExistsAsync('pump.current_power', {
        type: 'state',
        common: {
            name: 'Aktuelle Leistung der Pumpe',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.current_power', { val: 0, ack: true });

    await adapter.setObjectNotExistsAsync('pump.reason', {
        type: 'state',
        common: {
            name: 'Grund für aktuellen Pumpenstatus',
            desc: 'Wird intern verwendet, um den Grund des aktuellen Pumpenstatus zu speichern (z. B. Rückspülen, Wartung, Nachpumpen)',
            type: 'string',
            role: 'text',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.reason', { val: '', ack: true });
}

module.exports = {
    createPumpStates,
};

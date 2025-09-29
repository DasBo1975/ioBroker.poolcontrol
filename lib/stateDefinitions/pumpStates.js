"use strict";

/**
 * Legt alle States für die Pumpenverwaltung an:
 * - pump.pump_max_watt, pump.pump_power_lph
 * - pump.frost_protection_active, pump.frost_protection_temp
 * - pump.pump_switch (JETZT: boolean Schalter)
 * - pump.mode (auto/manual/off/time)
 * - pump.manual_safety_enabled
 * - pump.status, pump.error
 * - pump.current_power
 */

async function createPumpStates(adapter) {
    // Max. Pumpenleistung (W)
    await adapter.setObjectNotExistsAsync("pump.pump_max_watt", {
        type: "state",
        common: {
            name: "Max. Pumpenleistung",
            type: "number",
            role: "value.power",
            unit: "W",
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.pump_max_watt", { val: adapter.config.pump_max_watt, ack: true });

    // Pumpenleistung (l/h)
    await adapter.setObjectNotExistsAsync("pump.pump_power_lph", {
        type: "state",
        common: {
            name: "Pumpenleistung (l/h)",
            type: "number",
            role: "value.flow",
            unit: "l/h",
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.pump_power_lph", { val: adapter.config.pump_power_lph, ack: true });

    // Frostschutz aktiv
    await adapter.setObjectNotExistsAsync("pump.frost_protection_active", {
        type: "state",
        common: {
            name: "Frostschutz aktiv",
            type: "boolean",
            role: "switch",
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.frost_protection_active", { val: adapter.config.frost_protection_active, ack: true });

    // Frostschutz-Temperatur
    await adapter.setObjectNotExistsAsync("pump.frost_protection_temp", {
        type: "state",
        common: {
            name: "Frostschutz-Temperatur",
            type: "number",
            role: "value.temperature",
            unit: "°C",
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.frost_protection_temp", { val: adapter.config.frost_protection_temp, ack: true });

    // **Zentraler Pumpen-Schalter (boolean)**
    await adapter.setObjectNotExistsAsync("pump.pump_switch", {
        type: "state",
        common: {
            name: "Pumpe EIN/AUS",
            type: "boolean",
            role: "switch",
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.pump_switch", { val: false, ack: true });

    // Pumpenmodus
    await adapter.setObjectNotExistsAsync("pump.mode", {
        type: "state",
        common: {
            name: "Pumpenmodus",
            type: "string",
            role: "state",
            read: true,
            write: true,
            states: {
                "auto": "Automatik",
                "manual": "Manuell",
                "off": "Aus",
                "time": "Zeit",
            },
        },
        native: {},
    });
    await adapter.setStateAsync("pump.mode", { val: "auto", ack: true });

    // Sicherheitslogik im manuellen Modus
    await adapter.setObjectNotExistsAsync("pump.manual_safety_enabled", {
        type: "state",
        common: {
            name: "Sicherheitsfunktionen im Modus 'Manuell' aktiv",
            type: "boolean",
            role: "switch",
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.manual_safety_enabled", {
        val: adapter.config.manual_safety_enabled ?? true,
        ack: true,
    });

    // Pumpenstatus (Text)
    await adapter.setObjectNotExistsAsync("pump.status", {
        type: "state",
        common: {
            name: "Pumpenstatus",
            type: "string",
            role: "text",
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.status", { val: "AUS", ack: true });

    // Pumpenfehler (bool)
    await adapter.setObjectNotExistsAsync("pump.error", {
        type: "state",
        common: {
            name: "Pumpenfehler",
            type: "boolean",
            role: "indicator.error",
            read: true,
            write: true, // manuell quittierbar
        },
        native: {},
    });
    await adapter.setStateAsync("pump.error", { val: false, ack: true });

    // Aktuelle Leistung der Pumpe (W)
    await adapter.setObjectNotExistsAsync("pump.current_power", {
        type: "state",
        common: {
            name: "Aktuelle Leistung der Pumpe",
            type: "number",
            role: "value.power",
            unit: "W",
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync("pump.current_power", { val: 0, ack: true });
}

module.exports = {
    createPumpStates,
};

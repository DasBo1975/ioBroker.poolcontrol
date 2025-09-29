"use strict";

/**
 * Legt alle States für Verbrauch (kWh) und Kosten (€) an.
 * - consumption.total_kwh
 * - consumption.day_kwh, week_kwh, month_kwh, year_kwh
 * - consumption.last_total_kwh (interner Baseline-Wert)
 * - consumption.offset_kwh (interner Zählerausgleich bei Reset/Wechsel)
 * - costs.total_eur
 * - costs.day_eur, week_eur, month_eur, year_eur
 */

async function createConsumptionStates(adapter) {
    // --- Kanal consumption ---
    await adapter.setObjectNotExistsAsync("consumption", {
        type: "channel",
        common: { name: "Stromverbrauch" },
        native: {},
    });

    const consumptionStates = {
        total_kwh:      { name: "Gesamtverbrauch", unit: "kWh" },
        day_kwh:        { name: "Verbrauch heute", unit: "kWh" },
        week_kwh:       { name: "Verbrauch diese Woche", unit: "kWh" },
        month_kwh:      { name: "Verbrauch dieser Monat", unit: "kWh" },
        year_kwh:       { name: "Verbrauch dieses Jahr", unit: "kWh" },
        last_total_kwh: { name: "Letzter Zählerstand (Baseline)", unit: "kWh" },
        offset_kwh:     { name: "Offset kWh (interner Zählerausgleich)", unit: "kWh" }
    };

    for (const [id, cfg] of Object.entries(consumptionStates)) {
        await adapter.setObjectNotExistsAsync(`consumption.${id}`, {
            type: "state",
            common: {
                name: cfg.name,
                type: "number",
                role: "value.power.consumption",
                unit: cfg.unit,
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync(`consumption.${id}`, { val: 0, ack: true });
    }

    // --- Kanal costs ---
    await adapter.setObjectNotExistsAsync("costs", {
        type: "channel",
        common: { name: "Kosten" },
        native: {},
    });

    const costStates = {
        total_eur: { name: "Gesamtkosten", unit: "€" },
        day_eur:   { name: "Kosten heute", unit: "€" },
        week_eur:  { name: "Kosten diese Woche", unit: "€" },
        month_eur: { name: "Kosten dieser Monat", unit: "€" },
        year_eur:  { name: "Kosten dieses Jahr", unit: "€" }
    };

    for (const [id, cfg] of Object.entries(costStates)) {
        await adapter.setObjectNotExistsAsync(`costs.${id}`, {
            type: "state",
            common: {
                name: cfg.name,
                type: "number",
                role: "value.cost",
                unit: cfg.unit,
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync(`costs.${id}`, { val: 0, ack: true });
    }
}

module.exports = {
    createConsumptionStates,
};

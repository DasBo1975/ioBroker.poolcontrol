'use strict';

/**
 * Legt alle States für Verbrauch (kWh) und Kosten (€) an.
 * - consumption.total_kwh
 * - consumption.day_kwh, week_kwh, month_kwh, year_kwh
 * - consumption.last_total_kwh (interner Baseline-Wert)
 * - consumption.offset_kwh (interner Zählerausgleich bei Reset/Wechsel)
 * - costs.total_eur
 * - costs.day_eur, week_eur, month_eur, year_eur
 *
 * States sind persistent - Werte bleiben erhalten nach Neustart
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createConsumptionStates(adapter) {
    // --- Kanal consumption ---
    await adapter.setObjectNotExistsAsync('consumption', {
        type: 'channel',
        common: { name: { de: 'Stromverbrauch', en: 'Power consumption' } },
        native: {},
    });

    const consumptionStates = {
        total_kwh: { name: { de: 'Gesamtverbrauch', en: 'Total consumption' }, unit: 'kWh' },
        day_kwh: { name: { de: 'Verbrauch heute', en: 'Consumption today' }, unit: 'kWh' },
        week_kwh: { name: { de: 'Verbrauch diese Woche', en: 'Consumption this week' }, unit: 'kWh' },
        month_kwh: { name: { de: 'Verbrauch dieser Monat', en: 'Consumption this month' }, unit: 'kWh' },
        year_kwh: { name: { de: 'Verbrauch dieses Jahr', en: 'Consumption this year' }, unit: 'kWh' },
        last_total_kwh: {
            name: { de: 'Letzter Zählerstand (Baseline)', en: 'Last meter reading (baseline)' },
            unit: 'kWh',
        },
        offset_kwh: {
            name: { de: 'Offset kWh (interner Zählerausgleich)', en: 'Offset kWh (internal counter adjustment)' },
            unit: 'kWh',
        },
    };

    for (const [id, cfg] of Object.entries(consumptionStates)) {
        await adapter.setObjectNotExistsAsync(`consumption.${id}`, {
            type: 'state',
            common: {
                name: cfg.name,
                type: 'number',
                role: 'value.power.consumption',
                unit: cfg.unit,
                read: true,
                write: false,
                persist: true,
            },
            native: {},
        });
        // NUR falls noch kein Wert existiert (erste Installation)
        const cur = await adapter.getStateAsync(`consumption.${id}`);
        if (cur == null) {
            await adapter.setStateAsync(`consumption.${id}`, { val: 0, ack: true });
        }
    }

    // --- Kanal costs ---
    await adapter.setObjectNotExistsAsync('costs', {
        type: 'channel',
        common: { name: { de: 'Kosten', en: 'Costs' } },
        native: {},
    });

    const costStates = {
        total_eur: { name: { de: 'Gesamtkosten', en: 'Total costs' }, unit: '€' },
        day_eur: { name: { de: 'Kosten heute', en: 'Costs today' }, unit: '€' },
        week_eur: { name: { de: 'Kosten diese Woche', en: 'Costs this week' }, unit: '€' },
        month_eur: { name: { de: 'Kosten dieser Monat', en: 'Costs this month' }, unit: '€' },
        year_eur: { name: { de: 'Kosten dieses Jahr', en: 'Costs this year' }, unit: '€' },
    };

    for (const [id, cfg] of Object.entries(costStates)) {
        await adapter.setObjectNotExistsAsync(`costs.${id}`, {
            type: 'state',
            common: {
                name: cfg.name,
                type: 'number',
                role: 'value.cost',
                unit: cfg.unit,
                read: true,
                write: false,
                persist: true,
            },
            native: {},
        });
        const cur = await adapter.getStateAsync(`costs.${id}`);
        if (cur == null) {
            await adapter.setStateAsync(`costs.${id}`, { val: 0, ack: true });
        }
    }
}

module.exports = {
    createConsumptionStates,
};

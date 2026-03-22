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
        common: {
            name: {
                en: 'Power consumption',
                de: 'Stromverbrauch',
            },
        },
        native: {},
    });

    const consumptionStates = {
        total_kwh: {
            name: {
                en: 'Total consumption',
                de: 'Gesamtverbrauch',
            },
            desc: {
                en: 'Total accumulated power consumption',
                de: 'Gesamt aufgelaufener Stromverbrauch',
            },
            unit: 'kWh',
        },
        day_kwh: {
            name: {
                en: 'Consumption today',
                de: 'Verbrauch heute',
            },
            desc: {
                en: 'Power consumption accumulated today',
                de: 'Heute aufgelaufener Stromverbrauch',
            },
            unit: 'kWh',
        },
        week_kwh: {
            name: {
                en: 'Consumption this week',
                de: 'Verbrauch diese Woche',
            },
            desc: {
                en: 'Power consumption accumulated this week',
                de: 'Diese Woche aufgelaufener Stromverbrauch',
            },
            unit: 'kWh',
        },
        month_kwh: {
            name: {
                en: 'Consumption this month',
                de: 'Verbrauch diesen Monat',
            },
            desc: {
                en: 'Power consumption accumulated this month',
                de: 'Diesen Monat aufgelaufener Stromverbrauch',
            },
            unit: 'kWh',
        },
        year_kwh: {
            name: {
                en: 'Consumption this year',
                de: 'Verbrauch dieses Jahr',
            },
            desc: {
                en: 'Power consumption accumulated this year',
                de: 'Dieses Jahr aufgelaufener Stromverbrauch',
            },
            unit: 'kWh',
        },
        last_total_kwh: {
            name: {
                en: 'Last meter reading (baseline)',
                de: 'Letzter Zaehlerstand (Baseline)',
            },
            desc: {
                en: 'Last stored meter reading used as internal baseline',
                de: 'Zuletzt gespeicherter Zaehlerstand als interne Baseline',
            },
            unit: 'kWh',
        },
        offset_kwh: {
            name: {
                en: 'Offset kWh (internal counter adjustment)',
                de: 'Offset kWh (interner Zaehlerausgleich)',
            },
            desc: {
                en: 'Internal offset for meter correction after reset or counter change',
                de: 'Interner Offset zur Zaehlerkorrektur nach Reset oder Zaehlerwechsel',
            },
            unit: 'kWh',
        },
    };

    for (const [id, cfg] of Object.entries(consumptionStates)) {
        await adapter.setObjectNotExistsAsync(`consumption.${id}`, {
            type: 'state',
            common: {
                name: cfg.name,
                desc: cfg.desc,
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
        common: {
            name: {
                en: 'Costs',
                de: 'Kosten',
            },
        },
        native: {},
    });

    const costStates = {
        total_eur: {
            name: {
                en: 'Total costs',
                de: 'Gesamtkosten',
            },
            desc: {
                en: 'Total accumulated costs',
                de: 'Gesamt aufgelaufene Kosten',
            },
            unit: '€',
        },
        day_eur: {
            name: {
                en: 'Costs today',
                de: 'Kosten heute',
            },
            desc: {
                en: 'Costs accumulated today',
                de: 'Heute aufgelaufene Kosten',
            },
            unit: '€',
        },
        week_eur: {
            name: {
                en: 'Costs this week',
                de: 'Kosten diese Woche',
            },
            desc: {
                en: 'Costs accumulated this week',
                de: 'Diese Woche aufgelaufene Kosten',
            },
            unit: '€',
        },
        month_eur: {
            name: {
                en: 'Costs this month',
                de: 'Kosten diesen Monat',
            },
            desc: {
                en: 'Costs accumulated this month',
                de: 'Diesen Monat aufgelaufene Kosten',
            },
            unit: '€',
        },
        year_eur: {
            name: {
                en: 'Costs this year',
                de: 'Kosten dieses Jahr',
            },
            desc: {
                en: 'Costs accumulated this year',
                de: 'Dieses Jahr aufgelaufene Kosten',
            },
            unit: '€',
        },
    };

    for (const [id, cfg] of Object.entries(costStates)) {
        await adapter.setObjectNotExistsAsync(`costs.${id}`, {
            type: 'state',
            common: {
                name: cfg.name,
                desc: cfg.desc,
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

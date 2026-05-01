'use strict';

/**
 * photovoltaicInsightsStates.js
 * -----------------------------
 * Erstellt die States für analytics.insights.photovoltaic.
 *
 * Block 1:
 *   analytics.insights.photovoltaic.inputs.*
 *
 * Wichtig:
 * - Nur Analyse-States, keine Steuerlogik
 * - Aufbau analog zu solarInsightsStates.js
 * - EN + DE direkt enthalten
 * - Weitere Blöcke (calculation, results, debug) folgen später schrittweise
 */

/**
 * @param {ioBroker.Adapter} adapter - Instanz des ioBroker-Adapters
 */
async function createPhotovoltaicInsightsStates(adapter) {
    adapter.log.debug('photovoltaicInsightsStates: Photovoltaic insights initialization started.');

    // Oberstruktur
    await adapter.setObjectNotExistsAsync('analytics', {
        type: 'channel',
        common: {
            name: {
                en: 'Analytics & insights (statistics, history, reports)',
                de: 'Analysen & Statistiken (Verlauf, Berichte)',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.insights', {
        type: 'channel',
        common: {
            name: {
                en: 'Insights & analysis',
                de: 'Erkenntnisse & Analysen',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.insights.photovoltaic', {
        type: 'channel',
        common: {
            name: {
                en: 'Photovoltaic insights (analysis)',
                de: 'Photovoltaik Insights (Analyse)',
            },
        },
        native: {},
    });

    // -------------------------------------------------------------
    // BLOCK 1: INPUTS
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.photovoltaic.inputs', {
        type: 'channel',
        common: {
            name: {
                en: 'Inputs (PV & pump data)',
                de: 'Eingänge (PV- & Pumpendaten)',
            },
        },
        native: {},
    });

    const inputStates = [
        {
            id: 'pv_surplus_active',
            name: {
                en: 'PV surplus active',
                de: 'PV-Überschuss aktiv',
            },
            desc: {
                en: 'Shows whether photovoltaic surplus is currently active',
                de: 'Zeigt an, ob aktuell Photovoltaik-Überschuss aktiv ist',
            },
            type: 'boolean',
            role: 'indicator',
            def: false,
        },
        {
            id: 'pv_surplus_w',
            name: {
                en: 'PV surplus power (W)',
                de: 'PV-Überschussleistung (W)',
            },
            desc: {
                en: 'Current photovoltaic surplus power in watts used as input for the analysis',
                de: 'Aktuelle Photovoltaik-Überschussleistung in Watt als Eingangswert für die Analyse',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            def: 0,
        },
        {
            id: 'pump_power_w',
            name: {
                en: 'Pump power (W)',
                de: 'Pumpenleistung (W)',
            },
            desc: {
                en: 'Current pump power in watts used as input for the photovoltaic analysis',
                de: 'Aktuelle Pumpenleistung in Watt als Eingangswert für die Photovoltaik-Analyse',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            def: 0,
        },
    ];

    for (const state of inputStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.photovoltaic.inputs.${state.id}`, {
            type: 'state',
            common: {
                name: state.name,
                desc: state.desc,
                type: state.type,
                role: state.role,
                unit: state.unit || '',
                read: true,
                write: false,
                def: state.def,
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // BLOCK 2: CALCULATION
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.photovoltaic.calculation', {
        type: 'channel',
        common: {
            name: {
                en: 'Calculation',
                de: 'Berechnung',
            },
        },
        native: {},
    });

    const calculationStates = [
        {
            id: 'mode',
            name: {
                en: 'Calculation mode',
                de: 'Berechnungsmodus',
            },
            desc: {
                en: 'Current calculation mode for photovoltaic insights',
                de: 'Aktueller Berechnungsmodus für die Photovoltaik-Insights',
            },
            type: 'string',
            role: 'text',
            def: '',
        },
        {
            id: 'price_source',
            name: {
                en: 'Electricity price source',
                de: 'Strompreisquelle',
            },
            desc: {
                en: 'Source of the electricity price used for savings calculation',
                de: 'Quelle des Strompreises für die Einsparungsberechnung',
            },
            type: 'string',
            role: 'text',
            def: '',
        },
        {
            id: 'note',
            name: {
                en: 'Calculation note',
                de: 'Berechnungshinweis',
            },
            desc: {
                en: 'Short note about the current photovoltaic insights calculation',
                de: 'Kurzer Hinweis zur aktuellen Photovoltaik-Insights-Berechnung',
            },
            type: 'string',
            role: 'text',
            def: '',
        },
    ];

    for (const state of calculationStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.photovoltaic.calculation.${state.id}`, {
            type: 'state',
            common: {
                name: state.name,
                desc: state.desc,
                type: state.type,
                role: state.role,
                read: true,
                write: false,
                def: state.def,
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // BLOCK 3: RESULTS
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.photovoltaic.results', {
        type: 'channel',
        common: {
            name: {
                en: 'Results',
                de: 'Ergebnisse',
            },
        },
        native: {},
    });

    const resultStates = [
        {
            id: 'active_today',
            name: {
                en: 'PV active today',
                de: 'PV heute aktiv',
            },
            desc: {
                en: 'Shows whether the pump was operated by photovoltaic surplus today',
                de: 'Zeigt an, ob die Pumpe heute durch Photovoltaik-Überschuss betrieben wurde',
            },
            type: 'boolean',
            role: 'indicator',
            def: false,
        },
        {
            id: 'runtime_today_min',
            name: {
                en: 'Runtime today',
                de: 'Laufzeit heute',
            },
            desc: {
                en: 'Pump runtime today caused by photovoltaic surplus',
                de: 'Pumpenlaufzeit heute durch Photovoltaik-Überschuss',
            },
            type: 'number',
            role: 'value',
            unit: 'min',
            def: 0,
        },
        {
            id: 'energy_used_today_kwh',
            name: {
                en: 'Energy used today',
                de: 'Genutzte Energie heute',
            },
            desc: {
                en: 'Estimated pump energy used today during photovoltaic surplus operation',
                de: 'Geschätzte Pumpenenergie heute während des PV-Überschussbetriebs',
            },
            type: 'number',
            role: 'value.power.consumption',
            unit: 'kWh',
            def: 0,
        },
        {
            id: 'savings_today_eur',
            name: {
                en: 'Savings today',
                de: 'Einsparung heute',
            },
            desc: {
                en: 'Estimated savings today based on photovoltaic surplus operation',
                de: 'Geschätzte Einsparung heute durch Photovoltaik-Überschussbetrieb',
            },
            type: 'number',
            role: 'value',
            unit: '€',
            def: 0,
        },
        {
            id: 'starts_today',
            name: {
                en: 'Starts today',
                de: 'Starts heute',
            },
            desc: {
                en: 'Number of photovoltaic surplus pump starts today',
                de: 'Anzahl der heutigen Pumpenstarts durch Photovoltaik-Überschuss',
            },
            type: 'number',
            role: 'value',
            def: 0,
        },
        {
            id: 'summary_text',
            name: {
                en: 'Summary text',
                de: 'Zusammenfassungstext',
            },
            desc: {
                en: 'Short readable summary of today’s photovoltaic surplus usage',
                de: 'Kurze lesbare Zusammenfassung der heutigen PV-Überschussnutzung',
            },
            type: 'string',
            role: 'text',
            def: '',
        },
        {
            id: 'summary_json',
            name: {
                en: 'Summary JSON',
                de: 'Zusammenfassung JSON',
            },
            desc: {
                en: 'Structured JSON summary of today’s photovoltaic surplus usage',
                de: 'Strukturierte JSON-Zusammenfassung der heutigen PV-Überschussnutzung',
            },
            type: 'string',
            role: 'json',
            def: '{}',
        },
        {
            id: 'summary_html',
            name: {
                en: 'Summary HTML',
                de: 'Zusammenfassung HTML',
            },
            desc: {
                en: 'HTML summary of today’s photovoltaic surplus usage',
                de: 'HTML-Zusammenfassung der heutigen PV-Überschussnutzung',
            },
            type: 'string',
            role: 'html',
            def: '',
        },
    ];

    for (const state of resultStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.photovoltaic.results.${state.id}`, {
            type: 'state',
            common: {
                name: state.name,
                desc: state.desc,
                type: state.type,
                role: state.role,
                unit: state.unit || '',
                read: true,
                write: false,
                def: state.def,
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // BLOCK 4: DEBUG
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.photovoltaic.debug', {
        type: 'channel',
        common: {
            name: {
                en: 'Debug',
                de: 'Debug',
            },
        },
        native: {},
    });

    const debugStates = [
        {
            id: 'last_update',
            name: {
                en: 'Last update',
                de: 'Letzte Aktualisierung',
            },
            desc: {
                en: 'Timestamp of the last photovoltaic insights update',
                de: 'Zeitstempel der letzten Photovoltaik-Insights-Aktualisierung',
            },
            type: 'string',
            role: 'date',
            def: '',
        },
        {
            id: 'last_recalculation_reason',
            name: {
                en: 'Last recalculation reason',
                de: 'Letzter Neuberechnungsgrund',
            },
            desc: {
                en: 'Reason for the last photovoltaic insights recalculation',
                de: 'Grund der letzten Photovoltaik-Insights-Neuberechnung',
            },
            type: 'string',
            role: 'text',
            def: '',
        },
        {
            id: 'debug_text',
            name: {
                en: 'Debug text',
                de: 'Debug-Text',
            },
            desc: {
                en: 'Readable debug information for photovoltaic insights',
                de: 'Lesbare Debug-Informationen für Photovoltaik-Insights',
            },
            type: 'string',
            role: 'text',
            def: '',
        },
    ];

    for (const state of debugStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.photovoltaic.debug.${state.id}`, {
            type: 'state',
            common: {
                name: state.name,
                desc: state.desc,
                type: state.type,
                role: state.role,
                read: true,
                write: false,
                def: state.def,
                persist: true,
            },
            native: {},
        });
    }

    adapter.log.debug(
        'photovoltaicInsightsStates: Block 1 inputs, Block 2 calculation, Block 3 results and Block 4 debug created successfully.',
    );
}

module.exports = { createPhotovoltaicInsightsStates };

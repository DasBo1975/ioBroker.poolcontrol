'use strict';

/**
 * solarInsightsStates.js
 * ---------------------
 * Erstellt alle States für analytics.insights.solar.
 *
 * Struktur:
 *   analytics.insights.solar.inputs.*
 *   analytics.insights.solar.calculation.*
 *   analytics.insights.solar.results.*
 *   analytics.insights.solar.logbook.*
 *   analytics.insights.solar.debug.*
 *
 * - Transparente Solar-Analyse als Schätzung (estimated)
 * - JSON- und HTML-Ausgaben parallel
 * - EN + DE direkt enthalten
 * - Keine Steuerlogik, nur Analyse-States
 * - Tagesanalyse nur gültig, wenn Solar an dem Tag gelaufen ist
 */

/**
 * @param {ioBroker.Adapter} adapter - Instanz des ioBroker-Adapters
 */
async function createSolarInsightsStates(adapter) {
    adapter.log.debug('solarInsightsStates: Solar insights initialization started.');

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

    await adapter.setObjectNotExistsAsync('analytics.insights.solar', {
        type: 'channel',
        common: {
            name: {
                en: 'Solar insights (analysis)',
                de: 'Solar Insights (Analyse)',
            },
        },
        native: {},
    });

    // -------------------------------------------------------------
    // INPUTS
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.solar.inputs', {
        type: 'channel',
        common: {
            name: {
                en: 'Inputs (sensors & data)',
                de: 'Eingänge (Sensoren & Daten)',
            },
        },
        native: {},
    });

    const inputStates = [
        {
            id: 'collector_available',
            name: { en: 'Collector sensor available', de: 'Kollektorsensor verfügbar' },
            desc: {
                en: 'Shows whether the collector sensor is available for the solar insights analysis',
                de: 'Zeigt an, ob der Kollektorsensor für die Solar-Insights-Analyse verfügbar ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'surface_available',
            name: { en: 'Surface sensor available', de: 'Oberflächensensor verfügbar' },
            desc: {
                en: 'Shows whether the pool surface sensor is available for the solar insights analysis',
                de: 'Zeigt an, ob der Oberflächensensor für die Solar-Insights-Analyse verfügbar ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'ground_available',
            name: { en: 'Ground sensor available', de: 'Bodensensor verfügbar' },
            desc: {
                en: 'Shows whether the ground sensor is available for the solar insights analysis',
                de: 'Zeigt an, ob der Bodensensor für die Solar-Insights-Analyse verfügbar ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'flow_available',
            name: { en: 'Flow data available', de: 'Durchflussdaten verfügbar' },
            desc: {
                en: 'Shows whether a flow value is available for the solar insights analysis',
                de: 'Zeigt an, ob ein Durchflusswert für die Solar-Insights-Analyse verfügbar ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'return_available',
            name: { en: 'Return sensor available', de: 'Rücklaufsensor verfügbar' },
            desc: {
                en: 'Shows whether the return sensor is available for the solar insights analysis',
                de: 'Zeigt an, ob der Rücklaufsensor für die Solar-Insights-Analyse verfügbar ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'outside_available',
            name: { en: 'Outside temperature available', de: 'Außentemperatur verfügbar' },
            desc: {
                en: 'Shows whether outside temperature data is available for the solar insights analysis',
                de: 'Zeigt an, ob Außentemperaturdaten für die Solar-Insights-Analyse verfügbar sind',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'weather_available',
            name: { en: 'Weather data available', de: 'Wetterdaten verfügbar' },
            desc: {
                en: 'Shows whether weather data is available for the solar insights analysis',
                de: 'Zeigt an, ob Wetterdaten für die Solar-Insights-Analyse verfügbar sind',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'collector_used',
            name: { en: 'Collector sensor used', de: 'Kollektorsensor verwendet' },
            desc: {
                en: 'Shows whether the collector sensor is currently used in the solar insights calculation',
                de: 'Zeigt an, ob der Kollektorsensor aktuell in der Solar-Insights-Berechnung verwendet wird',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'surface_used',
            name: { en: 'Surface sensor used', de: 'Oberflächensensor verwendet' },
            desc: {
                en: 'Shows whether the pool surface sensor is currently used in the solar insights calculation',
                de: 'Zeigt an, ob der Oberflächensensor aktuell in der Solar-Insights-Berechnung verwendet wird',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'ground_used',
            name: { en: 'Ground sensor used', de: 'Bodensensor verwendet' },
            desc: {
                en: 'Shows whether the ground sensor is currently used in the solar insights calculation',
                de: 'Zeigt an, ob der Bodensensor aktuell in der Solar-Insights-Berechnung verwendet wird',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'flow_used',
            name: { en: 'Flow data used', de: 'Durchflussdaten verwendet' },
            desc: {
                en: 'Shows whether the flow value is currently used in the solar insights calculation',
                de: 'Zeigt an, ob der Durchflusswert aktuell in der Solar-Insights-Berechnung verwendet wird',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'return_used',
            name: { en: 'Return sensor used', de: 'Rücklaufsensor verwendet' },
            desc: {
                en: 'Shows whether the return sensor is currently used in the solar insights calculation',
                de: 'Zeigt an, ob der Rücklaufsensor aktuell in der Solar-Insights-Berechnung verwendet wird',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'outside_used',
            name: { en: 'Outside temperature used', de: 'Außentemperatur verwendet' },
            desc: {
                en: 'Shows whether outside temperature data is currently used in the solar insights calculation',
                de: 'Zeigt an, ob Außentemperaturdaten aktuell in der Solar-Insights-Berechnung verwendet werden',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'weather_used',
            name: { en: 'Weather data used', de: 'Wetterdaten verwendet' },
            desc: {
                en: 'Shows whether weather data is currently used in the solar insights calculation',
                de: 'Zeigt an, ob Wetterdaten aktuell in der Solar-Insights-Berechnung verwendet werden',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'used_sensors_text',
            name: { en: 'Used sensors (text)', de: 'Verwendete Sensoren (Text)' },
            desc: {
                en: 'Compact text output of the sensors currently used in the solar insights calculation',
                de: 'Kompakte Textausgabe der aktuell in der Solar-Insights-Berechnung verwendeten Sensoren',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'used_sensors_json',
            name: { en: 'Used sensors (JSON)', de: 'Verwendete Sensoren (JSON)' },
            desc: {
                en: 'Structured JSON output of the available and used sensors for the solar insights calculation',
                de: 'Strukturierte JSON-Ausgabe der verfügbaren und verwendeten Sensoren für die Solar-Insights-Berechnung',
            },
            type: 'string',
            role: 'json',
        },
    ];

    for (const def of inputStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.solar.inputs.${def.id}`, {
            type: 'state',
            common: {
                name: def.name,
                desc: def.desc,
                type: def.type,
                role: def.role,
                read: true,
                write: false,
                def: def.type === 'boolean' ? false : '',
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // CALCULATION
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.solar.calculation', {
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
            name: { en: 'Calculation mode', de: 'Berechnungsmodus' },
            desc: {
                en: 'Active calculation mode for the solar insights analysis',
                de: 'Aktiver Berechnungsmodus für die Solar-Insights-Analyse',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'quality_level',
            name: { en: 'Quality level', de: 'Qualitätsstufe' },
            desc: {
                en: 'Quality level of the current solar insights calculation',
                de: 'Qualitätsstufe der aktuellen Solar-Insights-Berechnung',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'confidence_percent',
            name: { en: 'Confidence (%)', de: 'Vertrauen (%)' },
            desc: {
                en: 'Estimated confidence of the current solar insights calculation in percent',
                de: 'Geschätzte Vertrauensstufe der aktuellen Solar-Insights-Berechnung in Prozent',
            },
            type: 'number',
            role: 'value',
            unit: '%',
        },
        {
            id: 'pool_reference_source',
            name: { en: 'Pool reference source', de: 'Pool-Referenzquelle' },
            desc: {
                en: 'Selected pool reference source used for the solar insights calculation',
                de: 'Ausgewählte Pool-Referenzquelle für die Solar-Insights-Berechnung',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'flow_source',
            name: { en: 'Flow source', de: 'Durchflussquelle' },
            desc: {
                en: 'Source of the flow value used for the solar insights calculation',
                de: 'Quelle des für die Solar-Insights-Berechnung verwendeten Durchflusswerts',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'weather_correction_active',
            name: { en: 'Weather correction active', de: 'Wetterkorrektur aktiv' },
            desc: {
                en: 'Shows whether weather-based correction or plausibility is active in the solar insights calculation',
                de: 'Zeigt an, ob eine wetterbasierte Korrektur oder Plausibilisierung in der Solar-Insights-Berechnung aktiv ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'note',
            name: { en: 'Calculation note', de: 'Berechnungshinweis' },
            desc: {
                en: 'Additional note about the current solar insights calculation',
                de: 'Zusätzlicher Hinweis zur aktuellen Solar-Insights-Berechnung',
            },
            type: 'string',
            role: 'text',
        },
    ];

    for (const def of calculationStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.solar.calculation.${def.id}`, {
            type: 'state',
            common: {
                name: def.name,
                desc: def.desc,
                type: def.type,
                role: def.role,
                unit: def.unit || undefined,
                read: true,
                write: false,
                def: def.type === 'number' ? null : def.type === 'boolean' ? false : '',
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // RESULTS
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.solar.results', {
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
            id: 'analysis_active',
            name: { en: 'Analysis active', de: 'Analyse aktiv' },
            desc: {
                en: 'Shows whether the solar insights analysis is currently active',
                de: 'Zeigt an, ob die Solar-Insights-Analyse aktuell aktiv ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'solar_effective_now',
            name: { en: 'Solar effective now', de: 'Solar aktuell wirksam' },
            desc: {
                en: 'Shows whether solar heating is currently effective according to the solar insights analysis',
                de: 'Zeigt an, ob die Solarerwärmung laut Solar-Insights-Analyse aktuell wirksam ist',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'solar_gain_state',
            name: { en: 'Solar gain state', de: 'Solargewinn-Status' },
            desc: {
                en: 'Qualitative state of the current estimated solar gain',
                de: 'Qualitativer Status des aktuell geschätzten Solarertrags',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'solar_ran_today',
            name: { en: 'Solar ran today', de: 'Solar lief heute' },
            desc: {
                en: 'Shows whether solar was active at least once today',
                de: 'Zeigt an, ob Solar heute mindestens einmal aktiv war',
            },
            type: 'boolean',
            role: 'indicator',
        },
        {
            id: 'collector_temp_used',
            name: { en: 'Collector temperature used', de: 'Verwendete Kollektortemperatur' },
            desc: {
                en: 'Collector temperature value used for the current solar insights calculation',
                de: 'Für die aktuelle Solar-Insights-Berechnung verwendeter Kollektortemperaturwert',
            },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
        },
        {
            id: 'pool_reference_temp_used',
            name: { en: 'Pool reference temperature used', de: 'Verwendete Pool-Referenztemperatur' },
            desc: {
                en: 'Pool reference temperature value used for the current solar insights calculation',
                de: 'Für die aktuelle Solar-Insights-Berechnung verwendeter Pool-Referenztemperaturwert',
            },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
        },
        {
            id: 'delta_t_used',
            name: { en: 'Delta T used', de: 'Verwendetes Delta T' },
            desc: {
                en: 'Temperature difference used for the current solar insights calculation',
                de: 'Für die aktuelle Solar-Insights-Berechnung verwendete Temperaturdifferenz',
            },
            type: 'number',
            role: 'value.temperature',
            unit: 'K',
        },
        {
            id: 'surface_ground_delta',
            name: { en: 'Surface-ground delta', de: 'Differenz Oberfläche-Boden' },
            desc: {
                en: 'Difference between surface and ground temperature used for plausibility in the solar insights analysis',
                de: 'Für die Plausibilisierung in der Solar-Insights-Analyse verwendete Differenz zwischen Oberfläche und Boden',
            },
            type: 'number',
            role: 'value.temperature',
            unit: 'K',
        },
        {
            id: 'outside_temp_used',
            name: { en: 'Outside temperature used', de: 'Verwendete Außentemperatur' },
            desc: {
                en: 'Outside temperature value used for the current solar insights calculation',
                de: 'Für die aktuelle Solar-Insights-Berechnung verwendeter Außentemperaturwert',
            },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
        },
        {
            id: 'flow_lh_used',
            name: { en: 'Flow used (l/h)', de: 'Verwendeter Durchfluss (l/h)' },
            desc: {
                en: 'Flow value in liters per hour used for the current solar insights calculation',
                de: 'Für die aktuelle Solar-Insights-Berechnung verwendeter Durchflusswert in Litern pro Stunde',
            },
            type: 'number',
            role: 'value',
            unit: 'l/h',
        },
        {
            id: 'pump_power_w_used',
            name: { en: 'Pump power used (W)', de: 'Verwendete Pumpenleistung (W)' },
            desc: {
                en: 'Pump power value used for the current solar insights calculation',
                de: 'Für die aktuelle Solar-Insights-Berechnung verwendeter Pumpenleistungswert',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
        },
        {
            id: 'estimated_thermal_power_w',
            name: { en: 'Estimated thermal power (W)', de: 'Geschätzte thermische Leistung (W)' },
            desc: {
                en: 'Estimated thermal solar power in watts based on the current solar insights calculation',
                de: 'Geschätzte thermische Solarleistung in Watt auf Basis der aktuellen Solar-Insights-Berechnung',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
        },
        {
            id: 'estimated_thermal_power_kw',
            name: { en: 'Estimated thermal power (kW)', de: 'Geschätzte thermische Leistung (kW)' },
            desc: {
                en: 'Estimated thermal solar power in kilowatts based on the current solar insights calculation',
                de: 'Geschätzte thermische Solarleistung in Kilowatt auf Basis der aktuellen Solar-Insights-Berechnung',
            },
            type: 'number',
            role: 'value.power',
            unit: 'kW',
        },
        {
            id: 'estimated_efficiency_ratio',
            name: { en: 'Estimated efficiency ratio', de: 'Geschätztes Effizienzverhältnis' },
            desc: {
                en: 'Estimated efficiency ratio of the current solar insights calculation',
                de: 'Geschätztes Effizienzverhältnis der aktuellen Solar-Insights-Berechnung',
            },
            type: 'number',
            role: 'value',
        },
        {
            id: 'estimated_gain_today_wh',
            name: { en: 'Estimated gain today (Wh)', de: 'Geschätzter Tagesertrag (Wh)' },
            desc: {
                en: 'Estimated solar gain of today in watt hours',
                de: 'Geschätzter Solarertrag des heutigen Tages in Wattstunden',
            },
            type: 'number',
            role: 'value.power.consumption',
            unit: 'Wh',
        },
        {
            id: 'estimated_gain_today_kwh',
            name: { en: 'Estimated gain today (kWh)', de: 'Geschätzter Tagesertrag (kWh)' },
            desc: {
                en: 'Estimated solar gain of today in kilowatt hours',
                de: 'Geschätzter Solarertrag des heutigen Tages in Kilowattstunden',
            },
            type: 'number',
            role: 'value.power.consumption',
            unit: 'kWh',
        },
        {
            id: 'active_minutes_today',
            name: { en: 'Active minutes today', de: 'Aktive Minuten heute' },
            desc: {
                en: 'Accumulated active minutes of solar operation used for the daily solar insights evaluation',
                de: 'Aufsummierte aktive Minuten des Solarbetriebs für die tägliche Solar-Insights-Auswertung',
            },
            type: 'number',
            role: 'value',
            unit: 'min',
        },
        {
            id: 'peak_power_today_w',
            name: { en: 'Peak power today (W)', de: 'Heutige Spitzenleistung (W)' },
            desc: {
                en: 'Highest estimated thermal solar power of today in watts',
                de: 'Höchste geschätzte thermische Solarleistung des heutigen Tages in Watt',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
        },
        {
            id: 'summary_json',
            name: { en: 'Summary (JSON)', de: 'Zusammenfassung (JSON)' },
            desc: {
                en: 'Structured JSON summary of the current or daily solar insights result',
                de: 'Strukturierte JSON-Zusammenfassung des aktuellen oder täglichen Solar-Insights-Ergebnisses',
            },
            type: 'string',
            role: 'json',
        },
        {
            id: 'summary_html',
            name: { en: 'Summary (HTML)', de: 'Zusammenfassung (HTML)' },
            desc: {
                en: 'HTML summary of the current or daily solar insights result',
                de: 'HTML-Zusammenfassung des aktuellen oder täglichen Solar-Insights-Ergebnisses',
            },
            type: 'string',
            role: 'html',
        },
    ];

    for (const def of resultStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.solar.results.${def.id}`, {
            type: 'state',
            common: {
                name: def.name,
                desc: def.desc,
                type: def.type,
                role: def.role,
                unit: def.unit || undefined,
                read: true,
                write: false,
                def: def.type === 'number' ? null : def.type === 'boolean' ? false : '',
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // LOGBOOK
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.solar.logbook', {
        type: 'channel',
        common: {
            name: {
                en: 'Solar logbook (readable daily texts)',
                de: 'Solar-Logbuch (lesbare Tages-Texte)',
            },
        },
        native: {},
    });

    const logbookStates = [
        {
            id: 'current_entry',
            name: { en: 'Current entry', de: 'Aktueller Eintrag' },
            desc: {
                en: 'Current readable solar text entry',
                de: 'Aktueller lesbarer Solar-Text-Eintrag',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'current_entry_html',
            name: { en: 'Current entry (HTML)', de: 'Aktueller Eintrag (HTML)' },
            desc: {
                en: 'Current readable solar text entry as HTML',
                de: 'Aktueller lesbarer Solar-Text-Eintrag als HTML',
            },
            type: 'string',
            role: 'html',
        },
        {
            id: 'day_log_json',
            name: { en: 'Day log (JSON)', de: 'Tageslog (JSON)' },
            desc: {
                en: 'Structured JSON day log with readable solar entries',
                de: 'Strukturiertes JSON-Tageslog mit lesbaren Solareinträgen',
            },
            type: 'string',
            role: 'json',
        },
        {
            id: 'day_log_text',
            name: { en: 'Day log (text)', de: 'Tageslog (Text)' },
            desc: {
                en: 'Readable text day log with solar entries',
                de: 'Lesbares Text-Tageslog mit Solareinträgen',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'last_entry_time',
            name: { en: 'Last entry time', de: 'Zeitpunkt des letzten Eintrags' },
            desc: {
                en: 'Timestamp of the last readable solar log entry',
                de: 'Zeitstempel des letzten lesbaren Solar-Logeintrags',
            },
            type: 'string',
            role: 'value.time',
        },
    ];

    for (const def of logbookStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.solar.logbook.${def.id}`, {
            type: 'state',
            common: {
                name: def.name,
                desc: def.desc,
                type: def.type,
                role: def.role,
                read: true,
                write: false,
                def: '',
                persist: true,
            },
            native: {},
        });
    }

    // -------------------------------------------------------------
    // DEBUG
    // -------------------------------------------------------------
    await adapter.setObjectNotExistsAsync('analytics.insights.solar.debug', {
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
            name: { en: 'Last update', de: 'Letzte Aktualisierung' },
            desc: {
                en: 'Timestamp of the last solar insights update',
                de: 'Zeitstempel der letzten Solar-Insights-Aktualisierung',
            },
            type: 'string',
            role: 'value.time',
        },
        {
            id: 'last_recalculation_reason',
            name: { en: 'Last recalculation reason', de: 'Letzter Neuberechnungsgrund' },
            desc: {
                en: 'Reason for the last recalculation of the solar insights analysis',
                de: 'Grund für die letzte Neuberechnung der Solar-Insights-Analyse',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'last_valid_mode',
            name: { en: 'Last valid mode', de: 'Letzter gültiger Modus' },
            desc: {
                en: 'Last valid calculation mode of the solar insights analysis',
                de: 'Letzter gültiger Berechnungsmodus der Solar-Insights-Analyse',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'last_invalid_reason',
            name: { en: 'Last invalid reason', de: 'Letzter ungültiger Grund' },
            desc: {
                en: 'Reason why the last solar insights calculation was considered invalid',
                de: 'Grund, warum die letzte Solar-Insights-Berechnung als ungültig angesehen wurde',
            },
            type: 'string',
            role: 'text',
        },
        {
            id: 'debug_text',
            name: { en: 'Debug text', de: 'Debug-Text' },
            desc: {
                en: 'Detailed debug text for the solar insights analysis',
                de: 'Detaillierter Debug-Text für die Solar-Insights-Analyse',
            },
            type: 'string',
            role: 'text',
        },
    ];

    for (const def of debugStates) {
        await adapter.setObjectNotExistsAsync(`analytics.insights.solar.debug.${def.id}`, {
            type: 'state',
            common: {
                name: def.name,
                desc: def.desc,
                type: def.type,
                role: def.role,
                read: true,
                write: false,
                def: '',
                persist: true,
            },
            native: {},
        });
    }

    adapter.log.debug('solarInsightsStates: Solar insights states created successfully.');
}

module.exports = {
    createSolarInsightsStates,
};

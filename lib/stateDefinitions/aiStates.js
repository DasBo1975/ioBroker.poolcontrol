'use strict';

/**
 * aiStates.js
 * ----------------------------------------------------------
 * Definiert alle States für den KI-Bereich des PoolControl-Adapters.
 *
 * Neue Struktur:
 *   ai.enabled                         → globaler KI-Hauptschalter
 *
 *   ai.weather.switches.*              → Schalter für Wetter-KI
 *   ai.weather.schedule.*              → Zeitpläne für Wetter-KI
 *   ai.weather.outputs.*               → Textausgaben der Wetter-KI
 * ----------------------------------------------------------
 *
 * @param {import('iobroker').Adapter} adapter - ioBroker Adapterinstanz
 */

/**
 * Erstellt alle KI-bezogenen States (ai.*)
 *
 * @param {import('iobroker').Adapter} adapter - ioBroker Adapterinstanz
 */
async function createAiStates(adapter) {
    // FIX: Logs must be English only
    adapter.log.debug('[aiStates] Initialization started');

    // ------------------------------------------------------
    // Hauptordner: ai
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai', {
        type: 'channel',
        common: {
            // FIX: i18n
            name: {
                de: 'KI / AI-Funktionen',
                en: 'AI functions',
            },
        },
        native: {},
    });

    // ------------------------------------------------------
    // NEU / GEÄNDERT:
    // Globaler KI-Hauptschalter (anstatt ai.switches.enabled)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.enabled', {
        type: 'state',
        common: {
            // FIX: i18n
            name: {
                de: 'KI aktivieren',
                en: 'Enable AI',
            },
            // FIX: i18n
            desc: {
                de: 'Globaler Hauptschalter für alle KI-Funktionen',
                en: 'Global master switch for all AI functions',
            },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            def: false,
            persist: true,
        },
        native: {},
    });

    // ------------------------------------------------------
    // NEU: Wetter-Hauptordner
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.weather', {
        type: 'channel',
        common: {
            // FIX: i18n
            name: {
                de: 'Wetterbezogene KI-Funktionen',
                en: 'Weather-related AI functions',
            },
            // FIX: i18n
            desc: {
                de: 'Alle KI-Funktionen rund um Wetter, Vorhersagen und Pooltipps',
                en: 'All AI functions about weather, forecasts and pool tips',
            },
        },
        native: {},
    });

    // ------------------------------------------------------
    // NEU: Unterordner Wetter-Switches
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.weather.switches', {
        type: 'channel',
        common: {
            // FIX: i18n
            name: {
                de: 'Schalter (Wetter-KI)',
                en: 'Switches (weather AI)',
            },
            // FIX: i18n
            desc: {
                de: 'Einzelne Schalter für wetterbezogene KI-Funktionen',
                en: 'Individual switches for weather-related AI functions',
            },
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle bisherigen wetterbezogenen Switches liegen jetzt unter ai.weather.switches.*
    const weatherSwitches = [
        // Steuerung & Debug für Wetter-KI
        {
            id: 'allow_speech',
            name: { de: 'Sprachausgabe für Wetter-KI erlauben', en: 'Allow speech output for weather AI' },
            def: false,
        }, // GEÄNDERT: von ai.switches → ai.weather.switches
        { id: 'debug_mode', name: { de: 'Debugmodus für Wetter-KI', en: 'Debug mode for weather AI' }, def: false }, // GEÄNDERT: von ai.switches → ai.weather.switches

        // Modulspezifische Schalter
        {
            id: 'daily_summary_enabled',
            name: { de: 'Tägliche Zusammenfassung aktiv', en: 'Enable daily summary' },
            def: false,
        },
        {
            id: 'daily_pool_tips_enabled',
            name: { de: 'Tägliche Pool-Tipps aktiv', en: 'Enable daily pool tips' },
            def: false,
        },
        { id: 'weather_advice_enabled', name: { de: 'Wetterhinweise aktiv', en: 'Enable weather advice' }, def: false },
        {
            id: 'weekend_summary_enabled',
            name: { de: 'Wochenende-Zusammenfassung aktiv', en: 'Enable weekend summary' },
            def: false,
        },

        // NEU: Schalter für "Vorhersage für morgen"
        {
            id: 'tomorrow_forecast_enabled',
            name: { de: 'Vorhersage für morgen aktiv', en: 'Enable tomorrow forecast' },
            def: false,
        }, // NEU
    ];

    for (const s of weatherSwitches) {
        await adapter.setObjectNotExistsAsync(`ai.weather.switches.${s.id}`, {
            type: 'state',
            common: {
                name: s.name,
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: s.def,
                persist: true,
            },
            native: {},
        });
    }

    // ------------------------------------------------------
    // NEU: Unterordner Wetter-Schedule
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.weather.schedule', {
        type: 'channel',
        common: {
            // FIX: i18n
            name: {
                de: 'Zeitpläne (Wetter-KI)',
                en: 'Schedules (weather AI)',
            },
            // FIX: i18n
            desc: {
                de: 'Zeitsteuerung für wetterbezogene KI-Ausgaben',
                en: 'Time control for weather-related AI outputs',
            },
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle Zeitpläne liegen jetzt unter ai.weather.schedule.*
    const weatherSchedule = [
        {
            id: 'daily_summary_time',
            name: { de: 'Zeit für tägliche Zusammenfassung', en: 'Time for daily summary' },
            def: '09:00',
        },
        {
            id: 'daily_pool_tips_time',
            name: { de: 'Zeit für tägliche Pool-Tipps', en: 'Time for daily pool tips' },
            def: '10:00',
        },
        {
            id: 'weather_advice_time',
            name: { de: 'Zeit für Wetterhinweise', en: 'Time for weather advice' },
            def: '08:00',
        },
        {
            id: 'weekend_summary_time',
            name: { de: 'Zeit für Wochenend-Zusammenfassung', en: 'Time for weekend summary' },
            def: '18:00',
        },

        // NEU: Zeitplan für "Vorhersage für morgen"
        {
            id: 'tomorrow_forecast_time',
            name: { de: 'Zeit für morgige Vorhersage', en: 'Time for tomorrow forecast' },
            def: '19:00',
        }, // NEU
    ];

    for (const t of weatherSchedule) {
        await adapter.setObjectNotExistsAsync(`ai.weather.schedule.${t.id}`, {
            type: 'state',
            common: {
                name: t.name,
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: t.def,
                persist: true,
            },
            native: {},
        });
    }

    // ------------------------------------------------------
    // NEU: Unterordner Wetter-Outputs
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.weather.outputs', {
        type: 'channel',
        common: {
            // FIX: i18n
            name: {
                de: 'KI-Ausgaben (Wetter-Texte)',
                en: 'AI outputs (weather texts)',
            },
            // FIX: i18n
            desc: {
                de: 'Textausgaben der Wetter-KI (Hinweise, Tipps, Zusammenfassungen)',
                en: 'Text outputs of the weather AI (advice, tips, summaries)',
            },
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle bisherigen Ausgaben + neue Vorhersage + last_message unter ai.weather.outputs.*
    const weatherOutputs = [
        { id: 'daily_summary', name: { de: 'Tägliche Zusammenfassung', en: 'Daily summary' } },
        { id: 'pool_tips', name: { de: 'Pool-Tipps', en: 'Pool tips' } },
        { id: 'weather_advice', name: { de: 'Wetterhinweise', en: 'Weather advice' } },
        { id: 'weekend_summary', name: { de: 'Wochenende-Zusammenfassung', en: 'Weekend summary' } },

        // NEU: Ausgabefeld für die Vorhersage für morgen
        { id: 'tomorrow_forecast', name: { de: 'Vorhersage für morgen', en: 'Tomorrow forecast' } }, // NEU

        // GEÄNDERT: last_message gehört aktuell zur Wetter-KI
        { id: 'last_message', name: { de: 'Letzte Wetter-KI-Meldung', en: 'Last weather AI message' } }, // GEÄNDERT: von ai.outputs → ai.weather.outputs
    ];

    for (const o of weatherOutputs) {
        await adapter.setObjectNotExistsAsync(`ai.weather.outputs.${o.id}`, {
            type: 'state',
            common: {
                name: o.name,
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                persist: false,
            },
            native: {},
        });
    }

    // FIX: Logs must be English only
    adapter.log.debug('[aiStates] Initialization completed');
}

module.exports = {
    createAiStates,
};

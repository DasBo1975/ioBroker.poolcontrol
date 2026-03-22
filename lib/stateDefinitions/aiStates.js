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
            name: {
                en: 'AI functions',
                de: 'KI-Funktionen',
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
            name: {
                en: 'Enable AI',
                de: 'KI aktivieren',
            },
            desc: {
                en: 'Global master switch for all AI functions',
                de: 'Globaler Hauptschalter für alle KI-Funktionen',
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
            name: {
                en: 'Weather-related AI functions',
                de: 'Wetterbezogene KI-Funktionen',
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
            name: {
                en: 'Switches (weather AI)',
                de: 'Schalter (Wetter-KI)',
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
            name: {
                en: 'Allow speech output for weather AI',
                de: 'Sprachausgabe für Wetter-KI erlauben',
            },
            desc: {
                en: 'Enables speech output for weather AI messages',
                de: 'Aktiviert die Sprachausgabe für Wetter-KI-Nachrichten',
            },
            def: false,
        }, // GEÄNDERT: von ai.switches → ai.weather.switches
        {
            id: 'debug_mode',
            name: {
                en: 'Debug mode for weather AI',
                de: 'Debug-Modus für Wetter-KI',
            },
            desc: {
                en: 'Enables debug mode for weather AI functions',
                de: 'Aktiviert den Debug-Modus für Wetter-KI-Funktionen',
            },
            def: false,
        }, // GEÄNDERT: von ai.switches → ai.weather.switches

        // Modulspezifische Schalter
        {
            id: 'daily_summary_enabled',
            name: {
                en: 'Enable daily summary',
                de: 'Tageszusammenfassung aktivieren',
            },
            desc: {
                en: 'Enables the daily summary output',
                de: 'Aktiviert die Ausgabe der Tageszusammenfassung',
            },
            def: false,
        },
        {
            id: 'daily_pool_tips_enabled',
            name: {
                en: 'Enable daily pool tips',
                de: 'Tägliche Pooltipps aktivieren',
            },
            desc: {
                en: 'Enables the daily pool tips output',
                de: 'Aktiviert die Ausgabe der täglichen Pooltipps',
            },
            def: false,
        },
        {
            id: 'weather_advice_enabled',
            name: {
                en: 'Enable weather advice',
                de: 'Wetterhinweise aktivieren',
            },
            desc: {
                en: 'Enables the weather advice output',
                de: 'Aktiviert die Ausgabe der Wetterhinweise',
            },
            def: false,
        },
        {
            id: 'weekend_summary_enabled',
            name: {
                en: 'Enable weekend summary',
                de: 'Wochenendzusammenfassung aktivieren',
            },
            desc: {
                en: 'Enables the weekend summary output',
                de: 'Aktiviert die Ausgabe der Wochenendzusammenfassung',
            },
            def: false,
        },

        // NEU: Schalter für "Vorhersage für morgen"
        {
            id: 'tomorrow_forecast_enabled',
            name: {
                en: 'Enable tomorrow forecast',
                de: 'Vorhersage für morgen aktivieren',
            },
            desc: {
                en: 'Enables the tomorrow forecast output',
                de: 'Aktiviert die Ausgabe der Vorhersage für morgen',
            },
            def: false,
        }, // NEU
    ];

    for (const s of weatherSwitches) {
        await adapter.setObjectNotExistsAsync(`ai.weather.switches.${s.id}`, {
            type: 'state',
            common: {
                name: s.name,
                desc: s.desc,
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
            name: {
                en: 'Schedules (weather AI)',
                de: 'Zeitpläne (Wetter-KI)',
            },
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle Zeitpläne liegen jetzt unter ai.weather.schedule.*
    const weatherSchedule = [
        {
            id: 'daily_summary_time',
            name: {
                en: 'Time for daily summary',
                de: 'Zeit für Tageszusammenfassung',
            },
            desc: {
                en: 'Configured time for the daily summary output',
                de: 'Eingestellte Zeit für die Ausgabe der Tageszusammenfassung',
            },
            def: '09:00',
        },
        {
            id: 'daily_pool_tips_time',
            name: {
                en: 'Time for daily pool tips',
                de: 'Zeit für tägliche Pooltipps',
            },
            desc: {
                en: 'Configured time for the daily pool tips output',
                de: 'Eingestellte Zeit für die Ausgabe der täglichen Pooltipps',
            },
            def: '10:00',
        },
        {
            id: 'weather_advice_time',
            name: {
                en: 'Time for weather advice',
                de: 'Zeit für Wetterhinweise',
            },
            desc: {
                en: 'Configured time for the weather advice output',
                de: 'Eingestellte Zeit für die Ausgabe der Wetterhinweise',
            },
            def: '08:00',
        },
        {
            id: 'weekend_summary_time',
            name: {
                en: 'Time for weekend summary',
                de: 'Zeit für Wochenendzusammenfassung',
            },
            desc: {
                en: 'Configured time for the weekend summary output',
                de: 'Eingestellte Zeit für die Ausgabe der Wochenendzusammenfassung',
            },
            def: '18:00',
        },

        // NEU: Zeitplan für "Vorhersage für morgen"
        {
            id: 'tomorrow_forecast_time',
            name: {
                en: 'Time for tomorrow forecast',
                de: 'Zeit für Vorhersage für morgen',
            },
            desc: {
                en: 'Configured time for the tomorrow forecast output',
                de: 'Eingestellte Zeit für die Ausgabe der Vorhersage für morgen',
            },
            def: '19:00',
        }, // NEU
    ];

    for (const t of weatherSchedule) {
        await adapter.setObjectNotExistsAsync(`ai.weather.schedule.${t.id}`, {
            type: 'state',
            common: {
                name: t.name,
                desc: t.desc,
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
            name: {
                en: 'AI outputs (weather texts)',
                de: 'KI-Ausgaben (Wettertexte)',
            },
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle bisherigen Ausgaben + neue Vorhersage + last_message unter ai.weather.outputs.*
    const weatherOutputs = [
        {
            id: 'daily_summary',
            name: {
                en: 'Daily summary',
                de: 'Tageszusammenfassung',
            },
            desc: {
                en: 'Generated text output for the daily summary',
                de: 'Generierte Textausgabe für die Tageszusammenfassung',
            },
        },
        {
            id: 'pool_tips',
            name: {
                en: 'Pool tips',
                de: 'Pooltipps',
            },
            desc: {
                en: 'Generated text output for pool tips',
                de: 'Generierte Textausgabe für Pooltipps',
            },
        },
        {
            id: 'weather_advice',
            name: {
                en: 'Weather advice',
                de: 'Wetterhinweise',
            },
            desc: {
                en: 'Generated text output for weather advice',
                de: 'Generierte Textausgabe für Wetterhinweise',
            },
        },
        {
            id: 'weekend_summary',
            name: {
                en: 'Weekend summary',
                de: 'Wochenendzusammenfassung',
            },
            desc: {
                en: 'Generated text output for the weekend summary',
                de: 'Generierte Textausgabe für die Wochenendzusammenfassung',
            },
        },

        // NEU: Ausgabefeld für die Vorhersage für morgen
        {
            id: 'tomorrow_forecast',
            name: {
                en: 'Tomorrow forecast',
                de: 'Vorhersage für morgen',
            },
            desc: {
                en: 'Generated text output for the tomorrow forecast',
                de: 'Generierte Textausgabe für die Vorhersage für morgen',
            },
        }, // NEU

        // GEÄNDERT: last_message gehört aktuell zur Wetter-KI
        {
            id: 'last_message',
            name: {
                en: 'Last weather AI message',
                de: 'Letzte Wetter-KI-Nachricht',
            },
            desc: {
                en: 'Last generated message from the weather AI',
                de: 'Letzte generierte Nachricht der Wetter-KI',
            },
        }, // GEÄNDERT: von ai.outputs → ai.weather.outputs
    ];

    for (const o of weatherOutputs) {
        await adapter.setObjectNotExistsAsync(`ai.weather.outputs.${o.id}`, {
            type: 'state',
            common: {
                name: o.name,
                desc: o.desc,
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

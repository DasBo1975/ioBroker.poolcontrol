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
    adapter.log.debug('[aiStates] Initialisierung gestartet');

    // ------------------------------------------------------
    // Hauptordner: ai
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai', {
        type: 'channel',
        common: { name: 'KI / AI-Funktionen' },
        native: {},
    });

    // ------------------------------------------------------
    // NEU / GEÄNDERT:
    // Globaler KI-Hauptschalter (anstatt ai.switches.enabled)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.enabled', {
        type: 'state',
        common: {
            name: 'KI aktivieren',
            desc: 'Globaler Hauptschalter für alle KI-Funktionen',
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
            name: 'Wetterbezogene KI-Funktionen',
            desc: 'Alle KI-Funktionen rund um Wetter, Vorhersagen und Pooltipps',
        },
        native: {},
    });

    // ------------------------------------------------------
    // NEU: Unterordner Wetter-Switches
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.weather.switches', {
        type: 'channel',
        common: {
            name: 'Schalter (Wetter-KI)',
            desc: 'Einzelne Schalter für wetterbezogene KI-Funktionen',
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle bisherigen wetterbezogenen Switches liegen jetzt unter ai.weather.switches.*
    const weatherSwitches = [
        // Steuerung & Debug für Wetter-KI
        { id: 'allow_speech', name: 'Sprachausgabe für Wetter-KI erlauben', def: false }, // GEÄNDERT: von ai.switches → ai.weather.switches
        { id: 'debug_mode', name: 'Debugmodus für Wetter-KI', def: false }, // GEÄNDERT: von ai.switches → ai.weather.switches

        // Modulspezifische Schalter
        { id: 'daily_summary_enabled', name: 'Tägliche Zusammenfassung aktiv', def: false },
        { id: 'daily_pool_tips_enabled', name: 'Tägliche Pool-Tipps aktiv', def: false },
        { id: 'weather_advice_enabled', name: 'Wetterhinweise aktiv', def: false },
        { id: 'weekend_summary_enabled', name: 'Wochenende-Zusammenfassung aktiv', def: false },

        // NEU: Schalter für "Vorhersage für morgen"
        { id: 'tomorrow_forecast_enabled', name: 'Vorhersage für morgen aktiv', def: false }, // NEU
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
            name: 'Zeitpläne (Wetter-KI)',
            desc: 'Zeitsteuerung für wetterbezogene KI-Ausgaben',
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle Zeitpläne liegen jetzt unter ai.weather.schedule.*
    const weatherSchedule = [
        { id: 'daily_summary_time', name: 'Zeit für tägliche Zusammenfassung', def: '09:00' },
        { id: 'daily_pool_tips_time', name: 'Zeit für tägliche Pool-Tipps', def: '10:00' },
        { id: 'weather_advice_time', name: 'Zeit für Wetterhinweise', def: '08:00' },
        { id: 'weekend_summary_time', name: 'Zeit für Wochenend-Zusammenfassung', def: '18:00' },

        // NEU: Zeitplan für "Vorhersage für morgen"
        { id: 'tomorrow_forecast_time', name: 'Zeit für morgige Vorhersage', def: '19:00' }, // NEU
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
            name: 'KI-Ausgaben (Wetter-Texte)',
            desc: 'Textausgaben der Wetter-KI (Hinweise, Tipps, Zusammenfassungen)',
        },
        native: {},
    });

    // NEU / GEÄNDERT:
    // Alle bisherigen Ausgaben + neue Vorhersage + last_message unter ai.weather.outputs.*
    const weatherOutputs = [
        { id: 'daily_summary', name: 'Tägliche Zusammenfassung' },
        { id: 'pool_tips', name: 'Pool-Tipps' },
        { id: 'weather_advice', name: 'Wetterhinweise' },
        { id: 'weekend_summary', name: 'Wochenende-Zusammenfassung' },

        // NEU: Ausgabefeld für die Vorhersage für morgen
        { id: 'tomorrow_forecast', name: 'Vorhersage für morgen' }, // NEU

        // GEÄNDERT: last_message gehört aktuell zur Wetter-KI
        { id: 'last_message', name: 'Letzte Wetter-KI-Meldung' }, // GEÄNDERT: von ai.outputs → ai.weather.outputs
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

    adapter.log.debug('[aiStates] Initialisierung abgeschlossen');
}

module.exports = {
    createAiStates,
};

'use strict';

/**
 * pumpStates4.js
 * ----------------------------------------------------------
 * Legt die States für den Drucksensor im Pumpenbereich an.
 *
 * Ordnerstruktur:
 *   pump.pressure.*
 *
 * Diese Datei ergänzt die bisherigen pumpStates.js,
 * pumpStates2.js und pumpStates3.js um Drucksensor-Unterstützung.
 *
 * Alle States sind echte Variablen (persist = true nur falls nötig).
 * ----------------------------------------------------------
 * Version: 1.0.0
 */

/**
 * Erstellt alle States für den Drucksensor im Bereich pump.pressure.
 *
 * @param {import('iobroker').Adapter} adapter – Aktive ioBroker Adapterinstanz
 */
async function createPumpStates4(adapter) {
    adapter.log.debug('[pumpStates4] Pressure sensor state initialization started.');

    // ------------------------------------------------------
    // Root-Kanal: pump.pressure
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure', {
        type: 'channel',
        common: {
            name: {
                en: 'Pump pressure sensor (filter pressure)',
                de: 'Pumpendrucksensor (Filterdruck)',
            },
        },
        native: {},
    });

    // ------------------------------------------------------
    // Aktueller Druck (bar)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure.current_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Current pressure (bar)',
                de: 'Aktueller Druck (bar)',
            },
            desc: {
                en: 'Measured current filter pressure in bar',
                de: 'Gemessener aktueller Filterdruck in bar',
            },
            type: 'number',
            role: 'value.pressure',
            unit: 'bar',
            read: true,
            write: false,
            persist: false, // Livewert → NICHT speichern
        },
        native: {},
    });

    // initial setzen (überinstallationssicher)
    const existing = await adapter.getStateAsync('pump.pressure.current_bar');
    if (existing === null || existing === undefined) {
        await adapter.setStateAsync('pump.pressure.current_bar', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Vorheriger Druckwert (bar)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure.previous_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Previous pressure (bar)',
                de: 'Vorheriger Druck (bar)',
            },
            desc: {
                en: 'Last known filter pressure before the current measurement',
                de: 'Zuletzt bekannter Filterdruck vor der aktuellen Messung',
            },
            type: 'number',
            role: 'value.pressure',
            unit: 'bar',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // initial setzen (überinstallationssicher)
    const prev = await adapter.getStateAsync('pump.pressure.previous_bar');
    if (prev === null || prev === undefined) {
        await adapter.setStateAsync('pump.pressure.previous_bar', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Benutzerdefinierte Normaldruck-Bereiche (bar)
    // ------------------------------------------------------

    // Unterer Normaldruck-Grenzwert (bar)
    await adapter.setObjectNotExistsAsync('pump.pressure.normal_min_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Normal pressure MIN (bar)',
                de: 'Normaldruck MIN (bar)',
            },
            desc: {
                en: 'Lower limit of the normal pressure range. Values below are considered too low.',
                de: 'Untere Grenze des normalen Druckbereichs. Werte darunter gelten als zu niedrig.',
            },
            type: 'number',
            role: 'level',
            unit: 'bar',
            read: true,
            write: true,
            min: 0,
            max: 2,
            def: 0.2,
            persist: true,
        },
        native: {},
    });

    const minExisting = await adapter.getStateAsync('pump.pressure.normal_min_bar');
    if (minExisting === null || minExisting === undefined) {
        await adapter.setStateAsync('pump.pressure.normal_min_bar', { val: 0.2, ack: true });
    }

    // Oberer Normaldruck-Grenzwert (bar)
    await adapter.setObjectNotExistsAsync('pump.pressure.normal_max_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Normal pressure MAX (bar)',
                de: 'Normaldruck MAX (bar)',
            },
            desc: {
                en: 'Upper limit of the normal pressure range. Values above are considered elevated.',
                de: 'Obere Grenze des normalen Druckbereichs. Werte darueber gelten als erhoeht.',
            },
            type: 'number',
            role: 'level',
            unit: 'bar',
            read: true,
            write: true,
            min: 0,
            max: 2,
            def: 0.8,
            persist: true,
        },
        native: {},
    });

    const maxExisting = await adapter.getStateAsync('pump.pressure.normal_max_bar');
    if (maxExisting === null || maxExisting === undefined) {
        await adapter.setStateAsync('pump.pressure.normal_max_bar', { val: 0.8, ack: true });
    }

    // ------------------------------------------------------
    // Optional vorbereitete States für spätere Erweiterungen
    // ------------------------------------------------------

    // Zustand / Bewertung
    await adapter.setObjectNotExistsAsync('pump.pressure.status_text', {
        type: 'state',
        common: {
            name: {
                en: 'Status message',
                de: 'Statusmeldung',
            },
            desc: {
                en: 'Assessment of the pressure (e.g. normal / high / backwash required)',
                de: 'Bewertung des Drucks (z. B. normal / hoch / Rueckspuelung erforderlich)',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // Erweiterte Diagnoseausgabe
    await adapter.setObjectNotExistsAsync('pump.pressure.status_text_diagnostic', {
        type: 'state',
        common: {
            name: {
                en: 'Diagnostics',
                de: 'Diagnose',
            },
            desc: {
                en: 'Detailed diagnostics based on trend and learning values',
                de: 'Detaillierte Diagnose basierend auf Trend- und Lernwerten',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // Letzte Aktualisierung
    await adapter.setObjectNotExistsAsync('pump.pressure.last_update', {
        type: 'state',
        common: {
            name: {
                en: 'Last update',
                de: 'Letzte Aktualisierung',
            },
            desc: {
                en: 'Timestamp of the last pressure update',
                de: 'Zeitstempel der letzten Druckaktualisierung',
            },
            type: 'string',
            role: 'date',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // ------------------------------------------------------
    // Lernwerte-Unterordner anlegen
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure.learning', {
        type: 'channel',
        common: {
            name: {
                en: 'Learning values (pump pressure behavior)',
                de: 'Lernwerte (Pumpendruckverhalten)',
            },
        },
        native: {},
    });

    // Unterer Lernwert (Wohlfühl-Minimum)
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.learned_min_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Learned minimum (bar)',
                de: 'Gelernter Mindestwert (bar)',
            },
            desc: {
                en: 'Lowest pressure frequently occurring during stable operation',
                de: 'Niedrigster Druck, der waehrend des stabilen Betriebs haeufig auftritt',
            },
            type: 'number',
            unit: 'bar',
            role: 'value',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });

    // Oberer Lernwert (Wohlfühl-Maximum)
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.learned_max_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Learned maximum (bar)',
                de: 'Gelernter Hoechstwert (bar)',
            },
            desc: {
                en: 'Highest pressure frequently occurring during stable operation',
                de: 'Hoechster Druck, der waehrend des stabilen Betriebs haeufig auftritt',
            },
            type: 'number',
            unit: 'bar',
            role: 'value',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });

    // Gleitender Mittelwert
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.avg_bar', {
        type: 'state',
        common: {
            name: {
                en: 'Rolling average pressure (bar)',
                de: 'Gleitender Durchschnittsdruck (bar)',
            },
            desc: {
                en: 'Calculated average of the latest measurements',
                de: 'Berechneter Durchschnitt der letzten Messungen',
            },
            type: 'number',
            unit: 'bar',
            role: 'value',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });

    // Trend: Anstieg
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.trend_rising', {
        type: 'state',
        common: {
            name: {
                en: 'Trend rising (0-1)',
                de: 'Trend steigend (0-1)',
            },
            desc: {
                en: 'Indicates how strongly the pressure is rising',
                de: 'Zeigt an, wie stark der Druck ansteigt',
            },
            type: 'number',
            role: 'indicator',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // Trend: Abfall
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.trend_falling', {
        type: 'state',
        common: {
            name: {
                en: 'Trend falling (0-1)',
                de: 'Trend fallend (0-1)',
            },
            desc: {
                en: 'Indicates how strongly the pressure is falling',
                de: 'Zeigt an, wie stark der Druck faellt',
            },
            type: 'number',
            role: 'indicator',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // Trend: Stabilität
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.trend_stability', {
        type: 'state',
        common: {
            name: {
                en: 'Trend stability (0-1)',
                de: 'Trendstabilitaet (0-1)',
            },
            desc: {
                en: 'Indicates how stable the pressure is overall',
                de: 'Zeigt an, wie stabil der Druck insgesamt ist',
            },
            type: 'number',
            role: 'indicator',
            read: true,
            write: false,
            persist: false,
        },
        native: {},
    });

    // Reset des Lernsystems
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.reset', {
        type: 'state',
        common: {
            name: {
                en: 'Reset learning system',
                de: 'Lernsystem zuruecksetzen',
            },
            desc: {
                en: 'Resets all learning values (min/max/avg/trend) to the current pressure',
                de: 'Setzt alle Lernwerte (Min/Max/Durchschnitt/Trend) auf den aktuellen Druck zurueck',
            },
            type: 'boolean',
            role: 'button',
            read: true,
            write: true,
            def: false,
            persist: false,
        },
        native: {},
    });

    adapter.log.debug('[pumpStates4] Pressure sensor states created or verified successfully.');
}

module.exports = {
    createPumpStates4,
};

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
            name: { de: 'Pumpen-Drucksensor (Filterdruck)', en: 'Pump pressure sensor (filter pressure)' },
        },
        native: {},
    });

    // ------------------------------------------------------
    // Aktueller Druck (bar)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure.current_bar', {
        type: 'state',
        common: {
            name: { de: 'Aktueller Druck (bar)', en: 'Current pressure (bar)' },
            desc: { de: 'Gemessener aktueller Filterdruck in bar', en: 'Measured current filter pressure in bar' },
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
            name: { de: 'Vorheriger Druck (bar)', en: 'Previous pressure (bar)' },
            desc: {
                de: 'Letzter bekannter Filterdruck vor der aktuellen Messung',
                en: 'Last known filter pressure before the current measurement',
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
            name: { de: 'Normaldruck MIN (bar)', en: 'Normal pressure MIN (bar)' },
            desc: {
                de: 'Unterer Grenzwert des Normaldruck-Bereichs. Werte unterhalb gelten als zu niedrig.',
                en: 'Lower limit of the normal pressure range. Values below are considered too low.',
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
            name: { de: 'Normaldruck MAX (bar)', en: 'Normal pressure MAX (bar)' },
            desc: {
                de: 'Oberer Grenzwert des Normaldruck-Bereichs. Werte oberhalb gelten als erhöht.',
                en: 'Upper limit of the normal pressure range. Values above are considered elevated.',
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
            name: { de: 'Statusmeldung', en: 'Status message' },
            desc: {
                de: 'Bewertung des Drucks (z. B. Normal / Hoch / Rückspülen nötig)',
                en: 'Assessment of the pressure (e.g. normal / high / backwash required)',
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
            name: { de: 'Diagnose', en: 'Diagnostics' },
            desc: {
                de: 'Ausführliche Diagnose basierend auf Trend- und Lernwerten',
                en: 'Detailed diagnostics based on trend and learning values',
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
            name: { de: 'Letzte Aktualisierung', en: 'Last update' },
            desc: { de: 'Zeitstempel der letzten Druckaktualisierung', en: 'Timestamp of the last pressure update' },
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
            name: { de: 'Lernwerte (Druckverhalten der Pumpe)', en: 'Learning values (pump pressure behavior)' },
        },
        native: {},
    });

    // Unterer Lernwert (Wohlfühl-Minimum)
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.learned_min_bar', {
        type: 'state',
        common: {
            name: { de: 'Gelerntes Minimum (bar)', en: 'Learned minimum (bar)' },
            desc: {
                de: 'Niedrigster Druck, der im stabilen Betrieb häufig auftritt',
                en: 'Lowest pressure frequently occurring during stable operation',
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
            name: { de: 'Gelerntes Maximum (bar)', en: 'Learned maximum (bar)' },
            desc: {
                de: 'Höchster Druck, der im stabilen Betrieb häufig auftritt',
                en: 'Highest pressure frequently occurring during stable operation',
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
            name: { de: 'Gleitender Durchschnittsdruck (bar)', en: 'Rolling average pressure (bar)' },
            desc: {
                de: 'Berechneter Mittelwert der letzten Messungen',
                en: 'Calculated average of the latest measurements',
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
            name: { de: 'Trend Steigend (0–1)', en: 'Trend rising (0–1)' },
            desc: { de: 'Gibt an, wie stark der Druck steigt', en: 'Indicates how strongly the pressure is rising' },
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
            name: { de: 'Trend Fallend (0–1)', en: 'Trend falling (0–1)' },
            desc: { de: 'Gibt an, wie stark der Druck fällt', en: 'Indicates how strongly the pressure is falling' },
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
            name: { de: 'Trend Stabilität (0–1)', en: 'Trend stability (0–1)' },
            desc: {
                de: 'Gibt an, wie stabil der Druck insgesamt ist',
                en: 'Indicates how stable the pressure is overall',
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
            name: { de: 'Lernsystem zurücksetzen', en: 'Reset learning system' },
            desc: {
                de: 'Setzt alle Lernwerte (Min/Max/Avg/Trend) auf den aktuellen Druck zurück',
                en: 'Resets all learning values (min/max/avg/trend) to the current pressure',
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

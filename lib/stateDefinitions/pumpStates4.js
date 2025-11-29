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
    adapter.log.debug('[pumpStates4] Initialisierung der Drucksensor-States gestartet.');

    // ------------------------------------------------------
    // Root-Kanal: pump.pressure
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure', {
        type: 'channel',
        common: {
            name: 'Pumpen-Drucksensor (Filterdruck)',
        },
        native: {},
    });

    // ------------------------------------------------------
    // Aktueller Druck (bar)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.pressure.current_bar', {
        type: 'state',
        common: {
            name: 'Aktueller Druck (bar)',
            desc: 'Gemessener aktueller Filterdruck in bar',
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
            name: 'Vorheriger Druck (bar)',
            desc: 'Letzter bekannter Filterdruck vor der aktuellen Messung',
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
            name: 'Normaldruck MIN (bar)',
            desc: 'Unterer Grenzwert des Normaldruck-Bereichs. Werte unterhalb gelten als zu niedrig.',
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
            name: 'Normaldruck MAX (bar)',
            desc: 'Oberer Grenzwert des Normaldruck-Bereichs. Werte oberhalb gelten als erhöht.',
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
            name: 'Statusmeldung',
            desc: 'Bewertung des Drucks (z. B. Normal / Hoch / Rückspülen nötig)',
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
            name: 'Diagnose',
            desc: 'Ausführliche Diagnose basierend auf Trend- und Lernwerten',
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
            name: 'Letzte Aktualisierung',
            desc: 'Zeitstempel der letzten Druckaktualisierung',
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
            name: 'Lernwerte (Druckverhalten der Pumpe)',
        },
        native: {},
    });

    // Unterer Lernwert (Wohlfühl-Minimum)
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.learned_min_bar', {
        type: 'state',
        common: {
            name: 'Gelerntes Minimum (bar)',
            desc: 'Niedrigster Druck, der im stabilen Betrieb häufig auftritt',
            type: 'number',
            unit: 'bar',
            role: 'value',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    // Oberer Lernwert (Wohlfühl-Maximum)
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.learned_max_bar', {
        type: 'state',
        common: {
            name: 'Gelerntes Maximum (bar)',
            desc: 'Höchster Druck, der im stabilen Betrieb häufig auftritt',
            type: 'number',
            unit: 'bar',
            role: 'value',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    // Gleitender Mittelwert
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.avg_bar', {
        type: 'state',
        common: {
            name: 'Gleitender Durchschnittsdruck (bar)',
            desc: 'Berechneter Mittelwert der letzten Messungen',
            type: 'number',
            unit: 'bar',
            role: 'value',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    // Trend: Anstieg
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.trend_rising', {
        type: 'state',
        common: {
            name: 'Trend Steigend (0–1)',
            desc: 'Gibt an, wie stark der Druck steigt',
            type: 'number',
            role: 'indicator',
            read: true,
            write: true,
            persist: false,
        },
        native: {},
    });

    // Trend: Abfall
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.trend_falling', {
        type: 'state',
        common: {
            name: 'Trend Fallend (0–1)',
            desc: 'Gibt an, wie stark der Druck fällt',
            type: 'number',
            role: 'indicator',
            read: true,
            write: true,
            persist: false,
        },
        native: {},
    });

    // Trend: Stabilität
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.trend_stability', {
        type: 'state',
        common: {
            name: 'Trend Stabilität (0–1)',
            desc: 'Gibt an, wie stabil der Druck insgesamt ist',
            type: 'number',
            role: 'indicator',
            read: true,
            write: true,
            persist: false,
        },
        native: {},
    });

    // Reset des Lernsystems
    await adapter.setObjectNotExistsAsync('pump.pressure.learning.reset', {
        type: 'state',
        common: {
            name: 'Lernsystem zurücksetzen',
            desc: 'Setzt alle Lernwerte (Min/Max/Avg/Trend) auf den aktuellen Druck zurück',
            type: 'boolean',
            role: 'button',
            read: true,
            write: true,
            def: false,
            persist: false,
        },
        native: {},
    });

    adapter.log.debug('[pumpStates4] Drucksensor-States erfolgreich erstellt oder geprüft.');
}

module.exports = {
    createPumpStates4,
};

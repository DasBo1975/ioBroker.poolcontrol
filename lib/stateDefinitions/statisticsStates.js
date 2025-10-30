'use strict';

/**
 * statisticsStates.js
 * -------------------
 * Erstellt alle States für die Temperaturstatistiken.
 * Struktur:
 *   analytics.statistics.temperature.today.*
 *   analytics.statistics.temperature.week.*
 *   analytics.statistics.temperature.month.*
 *
 * - Sechs Sensorbereiche (outside, ground, surface, flow, return, collector)
 * - Je Sensor: Min/Max/Avg + Zeitstempel + JSON/HTML-Ausgabe
 * - Zusätzlich: Gesamt-Ausgabe (summary_all_json / summary_all_html)
 *
 * Alle States sind persistiert, schreibgeschützt und überinstallationssicher.
 */

/**
 * @param {ioBroker.Adapter} adapter - Instanz des ioBroker-Adapters
 */
async function createStatisticsStates(adapter) {
    adapter.log.debug('statisticsStates: Initialisierung der Temperaturstatistiken gestartet.');

    // Oberstruktur
    await adapter.setObjectNotExistsAsync('analytics', {
        type: 'channel',
        common: { name: 'Analysen & Auswertungen (Statistik, Historie, Berichte)' },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics', {
        type: 'channel',
        common: { name: 'Statistische Auswertungen' },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics.temperature', {
        type: 'channel',
        common: { name: 'Temperaturstatistik' },
        native: {},
    });

    // -------------------------------------------------------------
    // 🔹 TAGESSTATISTIK
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'today', 'Tagesstatistik (Temperaturen)');

    // -------------------------------------------------------------
    // 🔹 WOCHENSTATISTIK
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'week', 'Wochenstatistik (Temperaturen)');

    // -------------------------------------------------------------
    // 🔹 MONATSSTATISTIK (NEU)
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'month', 'Monatsstatistik (Temperaturen)');

    adapter.log.debug('statisticsStates: Tages-, Wochen- und Monatsstatistik (Temperatur) erfolgreich angelegt.');
}

/**
 * Erstellt eine Temperaturstatistik-Gruppe (z. B. "today", "week" oder "month").
 *
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 * @param {string} periodId - z. B. "today", "week" oder "month"
 * @param {string} displayName - Anzeigename im Objektbaum
 */
async function _createTemperatureStatsGroup(adapter, periodId, displayName) {
    const basePathRoot = `analytics.statistics.temperature.${periodId}`;
    await adapter.setObjectNotExistsAsync(basePathRoot, {
        type: 'channel',
        common: { name: displayName },
        native: {},
    });

    // Definierte Sensoren
    const sensors = [
        { id: 'outside', name: 'Außentemperatur' },
        { id: 'ground', name: 'Bodentemperatur' },
        { id: 'surface', name: 'Pooloberfläche' },
        { id: 'flow', name: 'Vorlauf' },
        { id: 'return', name: 'Rücklauf' },
        { id: 'collector', name: 'Kollektor (Solar)' },
    ];

    for (const sensor of sensors) {
        const basePath = `${basePathRoot}.${sensor.id}`;
        await adapter.setObjectNotExistsAsync(basePath, {
            type: 'channel',
            common: { name: `${sensor.name} (${displayName})` },
            native: {},
        });

        const stateDefs = [
            { id: 'temp_min', name: 'Niedrigste Temperatur', type: 'number', role: 'value.temperature', unit: '°C' },
            { id: 'temp_max', name: 'Höchste Temperatur', type: 'number', role: 'value.temperature', unit: '°C' },
            { id: 'temp_min_time', name: 'Zeitpunkt Minimum', type: 'string', role: 'value.time' },
            { id: 'temp_max_time', name: 'Zeitpunkt Maximum', type: 'string', role: 'value.time' },
            { id: 'temp_avg', name: 'Durchschnittstemperatur', type: 'number', role: 'value.temperature', unit: '°C' },
            { id: 'data_points_count', name: 'Anzahl Messwerte', type: 'number', role: 'value' },
            { id: 'last_update', name: 'Letzte Aktualisierung', type: 'string', role: 'value.time' },
            { id: 'reset_today', name: 'Tagesstatistik zurücksetzen', type: 'boolean', role: 'button' },
            {
                id: 'summary_json',
                name: `${displayName} (JSON)`,
                type: 'string',
                role: 'json',
            },
            {
                id: 'summary_html',
                name: `${displayName} (HTML)`,
                type: 'string',
                role: 'html',
            },
        ];

        for (const def of stateDefs) {
            await adapter.setObjectNotExistsAsync(`${basePath}.${def.id}`, {
                type: 'state',
                common: {
                    name: def.name,
                    type: def.type,
                    role: def.role,
                    unit: def.unit || undefined,
                    read: def.type === 'boolean' && def.role === 'button' ? false : true,
                    write: def.type === 'boolean' && def.role === 'button' ? true : false,
                    def:
                        def.type === 'number'
                            ? null
                            : def.type === 'boolean'
                            ? false
                            : '',
                    persist: true,
                },
                native: {},
            });
        }
    }

    // Gesamt-Ausgabe (Outputs)
    const outputBase = `${basePathRoot}.outputs`;
    await adapter.setObjectNotExistsAsync(outputBase, {
        type: 'channel',
        common: { name: 'Gesamtausgaben (alle Sensoren)' },
        native: {},
    });

    const outputs = [
        {
            id: 'summary_all_json',
            name: `Gesamtzusammenfassung aller Sensoren (${displayName}, JSON)`,
            role: 'json',
        },
        {
            id: 'summary_all_html',
            name: `Gesamtzusammenfassung aller Sensoren (${displayName}, HTML)`,
            role: 'html',
        },
    ];

    for (const out of outputs) {
        await adapter.setObjectNotExistsAsync(`${outputBase}.${out.id}`, {
            type: 'state',
            common: {
                name: out.name,
                type: 'string',
                role: out.role,
                read: true,
                write: false,
                def: '',
                persist: true,
            },
            native: {},
        });
    }
}

module.exports = {
    createStatisticsStates,
};

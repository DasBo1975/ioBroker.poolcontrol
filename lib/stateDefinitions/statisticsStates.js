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
    adapter.log.debug('statisticsStates: Temperature statistics initialization started.');

    // Oberstruktur
    await adapter.setObjectNotExistsAsync('analytics', {
        type: 'channel',
        common: {
            name: {
                de: 'Analysen & Auswertungen (Statistik, Historie, Berichte)',
                en: 'Analytics & insights (statistics, history, reports)',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics', {
        type: 'channel',
        common: {
            name: {
                de: 'Statistische Auswertungen',
                en: 'Statistical evaluations',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics.temperature', {
        type: 'channel',
        common: {
            name: {
                de: 'Temperaturstatistik',
                en: 'Temperature statistics',
            },
        },
        native: {},
    });

    // -------------------------------------------------------------
    // 🔹 TAGESSTATISTIK
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'today', {
        de: 'Tagesstatistik (Temperaturen)',
        en: 'Daily statistics (temperatures)',
    });

    // -------------------------------------------------------------
    // 🔹 WOCHENSTATISTIK
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'week', {
        de: 'Wochenstatistik (Temperaturen)',
        en: 'Weekly statistics (temperatures)',
    });

    // -------------------------------------------------------------
    // 🔹 MONATSSTATISTIK (NEU)
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'month', {
        de: 'Monatsstatistik (Temperaturen)',
        en: 'Monthly statistics (temperatures)',
    });

    adapter.log.debug('statisticsStates: Daily, weekly and monthly temperature statistics created successfully.');
}

/**
 * Erstellt eine Temperaturstatistik-Gruppe (z. B. "today", "week" oder "month").
 *
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 * @param {string} periodId - z. B. "today", "week" oder "month"
 * @param {{de: string, en: string}} displayName - Anzeigename im Objektbaum (DE/EN)
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
        { id: 'outside', name: { de: 'Außentemperatur', en: 'Outside temperature' } },
        { id: 'ground', name: { de: 'Bodentemperatur', en: 'Ground temperature' } },
        { id: 'surface', name: { de: 'Pooloberfläche', en: 'Pool surface' } },
        { id: 'flow', name: { de: 'Vorlauf', en: 'Flow' } },
        { id: 'return', name: { de: 'Rücklauf', en: 'Return' } },
        { id: 'collector', name: { de: 'Kollektor (Solar)', en: 'Collector (solar)' } },
    ];

    for (const sensor of sensors) {
        const basePath = `${basePathRoot}.${sensor.id}`;
        await adapter.setObjectNotExistsAsync(basePath, {
            type: 'channel',
            common: {
                name: {
                    de: `${sensor.name.de} (${displayName.de})`,
                    en: `${sensor.name.en} (${displayName.en})`,
                },
            },
            native: {},
        });

        const stateDefs = [
            {
                id: 'temp_min',
                name: { de: 'Niedrigste Temperatur', en: 'Lowest temperature' },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'temp_max',
                name: { de: 'Höchste Temperatur', en: 'Highest temperature' },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'temp_min_time',
                name: { de: 'Zeitpunkt Minimum', en: 'Time of minimum' },
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'temp_max_time',
                name: { de: 'Zeitpunkt Maximum', en: 'Time of maximum' },
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'temp_avg',
                name: { de: 'Durchschnittstemperatur', en: 'Average temperature' },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'data_points_count',
                name: { de: 'Anzahl Messwerte', en: 'Number of values' },
                type: 'number',
                role: 'value',
            },
            {
                id: 'last_update',
                name: { de: 'Letzte Aktualisierung', en: 'Last update' },
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'summary_json',
                name: { de: `${displayName.de} (JSON)`, en: `${displayName.en} (JSON)` },
                type: 'string',
                role: 'json',
            },
            {
                id: 'summary_html',
                name: { de: `${displayName.de} (HTML)`, en: `${displayName.en} (HTML)` },
                type: 'string',
                role: 'html',
            },
        ];

        // FIX: Reset-Button nur bei Tagesstatistik anlegen
        if (periodId === 'today') {
            stateDefs.push({
                id: 'reset_today',
                name: { de: 'Tagesstatistik zurücksetzen', en: 'Reset daily statistics' },
                type: 'boolean',
                role: 'button',
            });
        }

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
                    def: def.type === 'number' ? null : def.type === 'boolean' ? false : '',
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
        common: {
            name: {
                de: 'Gesamtausgaben (alle Sensoren)',
                en: 'Overall outputs (all sensors)',
            },
        },
        native: {},
    });

    const outputs = [
        {
            id: 'summary_all_json',
            name: {
                de: `Gesamtzusammenfassung aller Sensoren (${displayName.de}, JSON)`,
                en: `Overall summary of all sensors (${displayName.en}, JSON)`,
            },
            role: 'json',
        },
        {
            id: 'summary_all_html',
            name: {
                de: `Gesamtzusammenfassung aller Sensoren (${displayName.de}, HTML)`,
                en: `Overall summary of all sensors (${displayName.en}, HTML)`,
            },
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

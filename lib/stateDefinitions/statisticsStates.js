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
            name: 'Analytics & insights (statistics, history, reports)',
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics', {
        type: 'channel',
        common: {
            name: 'Statistical evaluations',
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics.temperature', {
        type: 'channel',
        common: {
            name: 'Temperature statistics',
        },
        native: {},
    });

    // -------------------------------------------------------------
    // 🔹 TAGESSTATISTIK
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'today', 'Daily statistics (temperatures)');

    // -------------------------------------------------------------
    // 🔹 WOCHENSTATISTIK
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'week', 'Weekly statistics (temperatures)');

    // -------------------------------------------------------------
    // 🔹 MONATSSTATISTIK (NEU)
    // -------------------------------------------------------------
    await _createTemperatureStatsGroup(adapter, 'month', 'Monthly statistics (temperatures)');

    adapter.log.debug('statisticsStates: Daily, weekly and monthly temperature statistics created successfully.');
}

/**
 * Erstellt eine Temperaturstatistik-Gruppe (z. B. "today", "week" oder "month").
 *
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 * @param {string} periodId - z. B. "today", "week" oder "month"
 * @param {string} displayName - Display name in the object tree
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
        { id: 'outside', name: 'Outside temperature' },
        { id: 'ground', name: 'Ground temperature' },
        { id: 'surface', name: 'Pool surface' },
        { id: 'flow', name: 'Flow' },
        { id: 'return', name: 'Return' },
        { id: 'collector', name: 'Collector (solar)' },
    ];

    for (const sensor of sensors) {
        const basePath = `${basePathRoot}.${sensor.id}`;
        await adapter.setObjectNotExistsAsync(basePath, {
            type: 'channel',
            common: {
                name: `${sensor.name} (${displayName})`,
            },
            native: {},
        });

        const stateDefs = [
            {
                id: 'temp_min',
                name: 'Lowest temperature',
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'temp_max',
                name: 'Highest temperature',
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'temp_min_time',
                name: 'Time of minimum',
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'temp_max_time',
                name: 'Time of maximum',
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'temp_avg',
                name: 'Average temperature',
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'data_points_count',
                name: 'Number of values',
                type: 'number',
                role: 'value',
            },
            {
                id: 'last_update',
                name: 'Last update',
                type: 'string',
                role: 'value.time',
            },
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

        // FIX: Reset-Button nur bei Tagesstatistik anlegen
        if (periodId === 'today') {
            stateDefs.push({
                id: 'reset_today',
                name: 'Reset daily statistics',
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
            name: 'Overall outputs (all sensors)',
        },
        native: {},
    });

    const outputs = [
        {
            id: 'summary_all_json',
            name: `Overall summary of all sensors (${displayName}, JSON)`,
            role: 'json',
        },
        {
            id: 'summary_all_html',
            name: `Overall summary of all sensors (${displayName}, HTML)`,
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

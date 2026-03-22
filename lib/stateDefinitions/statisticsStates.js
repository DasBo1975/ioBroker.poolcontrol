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
                en: 'Analytics & insights (statistics, history, reports)',
                de: 'Analysen & Statistiken (Verlauf, Berichte)',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics', {
        type: 'channel',
        common: {
            name: {
                en: 'Statistical evaluations',
                de: 'Statistische Auswertungen',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('analytics.statistics.temperature', {
        type: 'channel',
        common: {
            name: {
                en: 'Temperature statistics',
                de: 'Temperaturstatistiken',
            },
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
    const periodNames = {
        today: {
            en: 'Daily statistics (temperatures)',
            de: 'Tagesstatistik (Temperaturen)',
        },
        week: {
            en: 'Weekly statistics (temperatures)',
            de: 'Wochenstatistik (Temperaturen)',
        },
        month: {
            en: 'Monthly statistics (temperatures)',
            de: 'Monatsstatistik (Temperaturen)',
        },
    };

    const sensorNames = {
        outside: {
            en: 'Outside temperature',
            de: 'Aussentemperatur',
        },
        ground: {
            en: 'Ground temperature',
            de: 'Bodentemperatur',
        },
        surface: {
            en: 'Pool surface temperature',
            de: 'Pooloberflaechentemperatur',
        },
        flow: {
            en: 'Flow temperature',
            de: 'Vorlauftemperatur',
        },
        return: {
            en: 'Return temperature',
            de: 'Ruecklauftemperatur',
        },
        collector: {
            en: 'Collector temperature (solar)',
            de: 'Kollektortemperatur (Solar)',
        },
    };

    await adapter.setObjectNotExistsAsync(basePathRoot, {
        type: 'channel',
        common: { name: periodNames[periodId] || { en: displayName, de: displayName } },
        native: {},
    });

    // Definierte Sensoren
    const sensors = [
        { id: 'outside', name: sensorNames.outside },
        { id: 'ground', name: sensorNames.ground },
        { id: 'surface', name: sensorNames.surface },
        { id: 'flow', name: sensorNames.flow },
        { id: 'return', name: sensorNames.return },
        { id: 'collector', name: sensorNames.collector },
    ];

    for (const sensor of sensors) {
        const basePath = `${basePathRoot}.${sensor.id}`;
        await adapter.setObjectNotExistsAsync(basePath, {
            type: 'channel',
            common: {
                name: {
                    en: `${sensor.name.en} (${periodNames[periodId].en})`,
                    de: `${sensor.name.de} (${periodNames[periodId].de})`,
                },
            },
            native: {},
        });

        const stateDefs = [
            {
                id: 'temp_min',
                name: {
                    en: 'Lowest temperature',
                    de: 'Niedrigste Temperatur',
                },
                desc: {
                    en: `Lowest recorded temperature for ${sensor.name.en} in this period`,
                    de: `Niedrigste erfasste Temperatur fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'temp_max',
                name: {
                    en: 'Highest temperature',
                    de: 'Hoechste Temperatur',
                },
                desc: {
                    en: `Highest recorded temperature for ${sensor.name.en} in this period`,
                    de: `Hoechste erfasste Temperatur fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'temp_min_time',
                name: {
                    en: 'Time of minimum temperature',
                    de: 'Zeitpunkt der Mindesttemperatur',
                },
                desc: {
                    en: `Timestamp of the minimum temperature for ${sensor.name.en} in this period`,
                    de: `Zeitstempel der Mindesttemperatur fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'temp_max_time',
                name: {
                    en: 'Time of maximum temperature',
                    de: 'Zeitpunkt der Hoechsttemperatur',
                },
                desc: {
                    en: `Timestamp of the maximum temperature for ${sensor.name.en} in this period`,
                    de: `Zeitstempel der Hoechsttemperatur fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'temp_avg',
                name: {
                    en: 'Average temperature',
                    de: 'Durchschnittstemperatur',
                },
                desc: {
                    en: `Average temperature for ${sensor.name.en} in this period`,
                    de: `Durchschnittstemperatur fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
            },
            {
                id: 'data_points_count',
                name: {
                    en: 'Number of recorded values',
                    de: 'Anzahl der erfasstenWerte',
                },
                desc: {
                    en: `Number of recorded values for ${sensor.name.en} in this period`,
                    de: `Anzahl der erfassten Werte fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'number',
                role: 'value',
            },
            {
                id: 'last_update',
                name: {
                    en: 'Last update',
                    de: 'Letzte Aktualisierung',
                },
                desc: {
                    en: `Timestamp of the last statistics update for ${sensor.name.en}`,
                    de: `Zeitstempel der letzten Statistikaktualisierung fuer ${sensor.name.de}`,
                },
                type: 'string',
                role: 'value.time',
            },
            {
                id: 'summary_json',
                name: {
                    en: `${periodNames[periodId].en} (JSON)`,
                    de: `${periodNames[periodId].de} (JSON)`,
                },
                desc: {
                    en: `JSON summary for ${sensor.name.en} in this period`,
                    de: `JSON-Zusammenfassung fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'string',
                role: 'json',
            },
            {
                id: 'summary_html',
                name: {
                    en: `${periodNames[periodId].en} (HTML)`,
                    de: `${periodNames[periodId].de} (HTML)`,
                },
                desc: {
                    en: `HTML summary for ${sensor.name.en} in this period`,
                    de: `HTML-Zusammenfassung fuer ${sensor.name.de} in diesem Zeitraum`,
                },
                type: 'string',
                role: 'html',
            },
        ];

        // FIX: Reset-Button nur bei Tagesstatistik anlegen
        if (periodId === 'today') {
            stateDefs.push({
                id: 'reset_today',
                name: {
                    en: 'Reset daily statistics',
                    de: 'Tagesstatistik zuruecksetzen',
                },
                desc: {
                    en: `Resets the daily statistics for ${sensor.name.en}`,
                    de: `Setzt die Tagesstatistik fuer ${sensor.name.de} zurueck`,
                },
                type: 'boolean',
                role: 'button',
            });
        }

        for (const def of stateDefs) {
            await adapter.setObjectNotExistsAsync(`${basePath}.${def.id}`, {
                type: 'state',
                common: {
                    name: def.name,
                    desc: def.desc,
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
                en: 'Overall outputs (all sensors)',
                de: 'Gesamtausgaben (alle Sensoren)',
            },
        },
        native: {},
    });

    const outputs = [
        {
            id: 'summary_all_json',
            name: {
                en: `Overall summary of all sensors (${periodNames[periodId].en}, JSON)`,
                de: `Gesamtzusammenfassung aller Sensoren (${periodNames[periodId].de}, JSON)`,
            },
            desc: {
                en: `Combined JSON summary of all temperature sensors for ${periodNames[periodId].en}`,
                de: `Kombinierte JSON-Zusammenfassung aller Temperatursensoren fuer ${periodNames[periodId].de}`,
            },
            role: 'json',
        },
        {
            id: 'summary_all_html',
            name: {
                en: `Overall summary of all sensors (${periodNames[periodId].en}, HTML)`,
                de: `Gesamtzusammenfassung aller Sensoren (${periodNames[periodId].de}, HTML)`,
            },
            desc: {
                en: `Combined HTML summary of all temperature sensors for ${periodNames[periodId].en}`,
                de: `Kombinierte HTML-Zusammenfassung aller Temperatursensoren fuer ${periodNames[periodId].de}`,
            },
            role: 'html',
        },
    ];

    for (const out of outputs) {
        await adapter.setObjectNotExistsAsync(`${outputBase}.${out.id}`, {
            type: 'state',
            common: {
                name: out.name,
                desc: out.desc,
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

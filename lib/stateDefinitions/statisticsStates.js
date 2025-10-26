'use strict';

/**
 * statisticsStates.js
 * -------------------
 * Erstellt alle States für die Tagesstatistik der Temperatursensoren.
 * Struktur: analytics.statistics.temperature.today.*
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
    adapter.log.debug('statisticsStates: Initialisierung der Tagesstatistik (Temperatur) gestartet.');

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

    await adapter.setObjectNotExistsAsync('analytics.statistics.temperature.today', {
        type: 'channel',
        common: { name: 'Tagesstatistik (Temperaturen)' },
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
        const basePath = `analytics.statistics.temperature.today.${sensor.id}`;

        await adapter.setObjectNotExistsAsync(basePath, {
            type: 'channel',
            common: { name: `${sensor.name} (Tagesstatistik)` },
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
            { id: 'summary_json', name: 'Tageszusammenfassung (JSON)', type: 'string', role: 'json' },
            { id: 'summary_html', name: 'Tageszusammenfassung (HTML)', type: 'string', role: 'html' },
        ];

        for (const def of stateDefs) {
            await adapter.setObjectNotExistsAsync(`${basePath}.${def.id}`, {
                type: 'state',
                common: {
                    name: def.name,
                    type: def.type,
                    role: def.role,
                    unit: def.unit || undefined,
                    read: true,
                    write: false,
                    def: def.type === 'number' ? null : '',
                    persist: true,
                },
                native: {},
            });
        }
    }

    // Gesamt-Ausgabe (Outputs)
    const outputBase = 'analytics.statistics.temperature.today.outputs';
    await adapter.setObjectNotExistsAsync(outputBase, {
        type: 'channel',
        common: { name: 'Gesamtausgaben (alle Sensoren)' },
        native: {},
    });

    const outputs = [
        {
            id: 'summary_all_json',
            name: 'Gesamtzusammenfassung aller Sensoren (JSON)',
            role: 'json',
        },
        {
            id: 'summary_all_html',
            name: 'Gesamtzusammenfassung aller Sensoren (HTML)',
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

    adapter.log.debug('statisticsStates: Tagesstatistik (Temperatur) erfolgreich angelegt.');
}

module.exports = {
    createStatisticsStates,
};

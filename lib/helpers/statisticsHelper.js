'use strict';

/**
 * statisticsHelper.js
 * -------------------
 * Vollständige Steuerung der Tagesstatistik (Temperatur)
 * im Bereich analytics.statistics.temperature.today.*
 *
 * - Erstellt alle States (Überinstallationsschutz + Persistenz)
 * - Erkennt aktive Sensoren anhand temperature.<sensor>.active
 * - Reagiert eventbasiert auf Änderungen der Temperaturwerte
 * - Berechnet laufend Min/Max/Durchschnitt
 * - Aktualisiert JSON- und HTML-Ausgaben (pro Sensor & gesamt)
 * - Führt automatisch täglichen Reset um Mitternacht durch
 *
 * @param {ioBroker.Adapter} adapter - Die aktuelle Adapterinstanz (this),
 * über die alle ioBroker-Funktionen wie setStateAsync, getStateAsync usw. aufgerufen werden.
 */

const statisticsHelper = {
    adapter: null,
    midnightTimer: null,
    sensors: [
        { id: 'outside', name: 'Außentemperatur' },
        { id: 'ground', name: 'Bodentemperatur' },
        { id: 'surface', name: 'Pooloberfläche' },
        { id: 'flow', name: 'Vorlauf' },
        { id: 'return', name: 'Rücklauf' },
        { id: 'collector', name: 'Kollektor (Solar)' },
    ],

    async init(adapter) {
        this.adapter = adapter;
        adapter.log.debug('statisticsHelper: Initialisierung gestartet.');

        // --- Überinstallationsschutz ---
        try {
            // Prüft, ob alle States vorhanden sind, und legt fehlende still neu an
            await this._verifyStructure();
        } catch {
            // keine Log-Ausgabe – stiller Schutz
        }

        try {
            await this._createTemperatureStatistics();
            await this._subscribeActiveSensors();
            await this._scheduleMidnightReset();
            adapter.log.debug('statisticsHelper: Initialisierung abgeschlossen (Sensorüberwachung aktiv).');
        } catch (err) {
            adapter.log.warn(`statisticsHelper: Fehler bei Initialisierung: ${err.message}`);
        }
    },

    /**
     * Erstellt States, falls sie fehlen (Überinstallationsschutz)
     */
    async _createTemperatureStatistics() {
        const adapter = this.adapter;

        for (const sensor of this.sensors) {
            const basePath = `analytics.statistics.temperature.today.${sensor.id}`;
            await adapter.setObjectNotExistsAsync(basePath, {
                type: 'channel',
                common: { name: `${sensor.name} (Tagesstatistik)` },
                native: {},
            });

            const activeState = `temperature.${sensor.id}.active`;
            const isActive = (await adapter.getStateAsync(activeState))?.val === true;

            const summaryJsonPath = `${basePath}.summary_json`;
            const summaryHtmlPath = `${basePath}.summary_html`;

            if (!isActive) {
                // Leere JSONs vorbereiten, damit spätere Temperaturwerte sie befüllen können
                await adapter.setStateAsync(summaryJsonPath, { val: '[]', ack: true });
                await adapter.setStateAsync(summaryHtmlPath, { val: '', ack: true });
                continue;
            }

            const stateDefs = [
                { id: 'temp_min', def: null },
                { id: 'temp_max', def: null },
                { id: 'temp_min_time', def: '' },
                { id: 'temp_max_time', def: '' },
                { id: 'temp_avg', def: null },
                { id: 'data_points_count', def: 0 },
                { id: 'last_update', def: '' },
                { id: 'summary_json', def: '' },
                { id: 'summary_html', def: '' },
            ];

            for (const def of stateDefs) {
                const fullPath = `${basePath}.${def.id}`;
                const obj = await adapter.getObjectAsync(fullPath);
                if (!obj) {
                    await adapter.setObjectNotExistsAsync(fullPath, {
                        type: 'state',
                        common: {
                            name: def.id,
                            type: typeof def.def === 'number' ? 'number' : 'string',
                            role: def.id.includes('time')
                                ? 'value.time'
                                : def.id.includes('temp')
                                  ? 'value.temperature'
                                  : 'value',
                            read: true,
                            write: false,
                            persist: true,
                        },
                        native: {},
                    });
                }

                const state = await adapter.getStateAsync(fullPath);
                if (!state || state.val === null || state.val === undefined) {
                    await adapter.setStateAsync(fullPath, { val: def.def, ack: true });
                }
            }
        }

        const outputBase = 'analytics.statistics.temperature.today.outputs';
        await adapter.setObjectNotExistsAsync(outputBase, {
            type: 'channel',
            common: { name: 'Gesamtausgaben (alle Sensoren)' },
            native: {},
        });

        const outputStates = [
            { id: 'summary_all_json', def: '' },
            { id: 'summary_all_html', def: '' },
        ];

        for (const out of outputStates) {
            const fullPath = `${outputBase}.${out.id}`;
            const obj = await adapter.getObjectAsync(fullPath);
            if (!obj) {
                await adapter.setObjectNotExistsAsync(fullPath, {
                    type: 'state',
                    common: {
                        name: out.id,
                        type: 'string',
                        role: out.id.endsWith('json') ? 'json' : 'html',
                        read: true,
                        write: false,
                        persist: true,
                    },
                    native: {},
                });
            }

            const state = await adapter.getStateAsync(fullPath);
            if (!state || state.val === null || state.val === undefined) {
                await adapter.setStateAsync(fullPath, { val: out.id.endsWith('json') ? '{}' : '', ack: true });
            }
        }
    },

    /**
     * Abonniert alle aktiven Temperatursensoren
     */
    async _subscribeActiveSensors() {
        const adapter = this.adapter;
        for (const sensor of this.sensors) {
            const activeState = `temperature.${sensor.id}.active`;
            const isActive = (await adapter.getStateAsync(activeState))?.val === true;
            if (isActive) {
                const stateId = `temperature.${sensor.id}.current`;
                adapter.subscribeStates(stateId);
            }
        }

        adapter.on('stateChange', async (id, state) => {
            if (!state || state.ack === false) {
                return;
            }
            for (const sensor of this.sensors) {
                if (id.endsWith(`temperature.${sensor.id}.current`)) {
                    await this._processTemperatureChange(sensor.id, state.val);
                    break;
                }
            }
        });
    },

    /**
     * Verarbeitung einer Temperaturänderung für einen Sensor.
     * Aktualisiert Min-, Max- und Durchschnittswerte sowie die Zusammenfassungen.
     *
     * @param {string} sensorId - Die ID des betroffenen Sensors (z. B. "outside" oder "flow").
     * @param {number} newValue - Der neue gemessene Temperaturwert in °C.
     */
    async _processTemperatureChange(sensorId, newValue) {
        const adapter = this.adapter;
        const basePath = `analytics.statistics.temperature.today.${sensorId}`;
        const now = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        if (typeof newValue !== 'number') {
            return;
        }

        // NEU: Rundung auf 1 Nachkommastelle
        newValue = Math.round(newValue * 10) / 10;

        const tempMin = (await adapter.getStateAsync(`${basePath}.temp_min`))?.val;
        const tempMax = (await adapter.getStateAsync(`${basePath}.temp_max`))?.val;
        const tempAvg = (await adapter.getStateAsync(`${basePath}.temp_avg`))?.val;
        const count = (await adapter.getStateAsync(`${basePath}.data_points_count`))?.val || 0;

        let newMin = tempMin;
        let newMax = tempMax;
        let newAvg = tempAvg;

        if (tempMin === null || newValue < tempMin) {
            newMin = newValue;
            await adapter.setStateAsync(`${basePath}.temp_min_time`, { val: now, ack: true });
        }
        if (tempMax === null || newValue > tempMax) {
            newMax = newValue;
            await adapter.setStateAsync(`${basePath}.temp_max_time`, { val: now, ack: true });
        }

        // Durchschnitt (gleitend)
        const newCount = count + 1;
        newAvg = tempAvg === null ? newValue : (tempAvg * count + newValue) / newCount;

        // NEU: Alle Temperaturwerte auf 1 Nachkommastelle runden
        newMin = Math.round(newMin * 10) / 10;
        newMax = Math.round(newMax * 10) / 10;
        newAvg = Math.round(newAvg * 10) / 10;

        await adapter.setStateAsync(`${basePath}.temp_min`, { val: newMin, ack: true });
        await adapter.setStateAsync(`${basePath}.temp_max`, { val: newMax, ack: true });
        await adapter.setStateAsync(`${basePath}.temp_avg`, { val: Math.round(newAvg * 100) / 100, ack: true });
        await adapter.setStateAsync(`${basePath}.data_points_count`, { val: newCount, ack: true });
        await adapter.setStateAsync(`${basePath}.last_update`, { val: now, ack: true });

        // Summary aktualisieren – erweitert um Datum, Zeitpunkte, Messanzahl, Name
        const summary = {
            name: 'Tagesstatistik',
            date: new Date().toISOString().slice(0, 10),
            temp_min: newMin,
            temp_min_time: (await adapter.getStateAsync(`${basePath}.temp_min_time`))?.val || '',
            temp_max: newMax,
            temp_max_time: (await adapter.getStateAsync(`${basePath}.temp_max_time`))?.val || '',
            temp_avg: newAvg,
            data_points_count: newCount,
            updated: now,
        };
        await adapter.setStateAsync(`${basePath}.summary_json`, { val: JSON.stringify(summary), ack: true });
        await adapter.setStateAsync(`${basePath}.summary_html`, {
            // NEU: HTML-Ausgabe mit gerundeten Werten
            val: `<div><b>Min:</b> ${newMin} °C / <b>Max:</b> ${newMax} °C / <b>Ø:</b> ${newAvg} °C</div>`,
            ack: true,
        });

        await this._updateOverallSummary();
    },

    /**
     * Gesamt-HTML/JSON-Ausgabe aktualisieren (erweiterte Version)
     * Liest die fertigen summary_json-Werte aller aktiven Sensoren aus
     * und erstellt daraus eine zusammengefasste HTML- und JSON-Ausgabe.
     */
    async _updateOverallSummary() {
        const adapter = this.adapter;
        const allData = [];

        try {
            // Alle Sensoren durchlaufen
            for (const sensor of this.sensors) {
                const summaryState = await adapter.getStateAsync(
                    `analytics.statistics.temperature.today.${sensor.id}.summary_json`,
                );

                if (!summaryState || !summaryState.val) {
                    continue;
                }

                // JSON-Inhalt parsen
                let parsed;
                try {
                    parsed = JSON.parse(summaryState.val);
                } catch {
                    continue;
                }

                const min = parsed.temp_min;
                const max = parsed.temp_max;
                const avg = parsed.temp_avg;
                const date = parsed.date || '';
                const minTime = parsed.temp_min_time || '';
                const maxTime = parsed.temp_max_time || '';
                const count = parsed.data_points_count || 0;

                // Falls gar keine Werte vorhanden, überspringen
                if (min == null && max == null && avg == null) {
                    continue;
                }

                // Werte runden
                const rMin = typeof min === 'number' ? Math.round(min * 10) / 10 : min;
                const rMax = typeof max === 'number' ? Math.round(max * 10) / 10 : max;
                const rAvg = typeof avg === 'number' ? Math.round(avg * 10) / 10 : avg;

                // Erweiterte Datensammlung
                allData.push({
                    name: sensor.name,
                    date,
                    min: rMin,
                    min_time: minTime,
                    max: rMax,
                    max_time: maxTime,
                    avg: rAvg,
                    data_points_count: count,
                });
            }

            // Wenn noch keine Daten vorliegen → leer lassen
            if (allData.length === 0) {
                await adapter.setStateChangedAsync('analytics.statistics.temperature.today.outputs.summary_all_json', {
                    val: '[]',
                    ack: true,
                });
                await adapter.setStateChangedAsync('analytics.statistics.temperature.today.outputs.summary_all_html', {
                    val: '',
                    ack: true,
                });
                return;
            }

            // JSON-Ausgabe erstellen (komplett erweitert)
            const jsonOutput = JSON.stringify(allData, null, 2);

            // HTML-Ausgabe erstellen (mit Datum & Anzahl Messwerte)
            let html = '<table style="width:100%;border-collapse:collapse;">';
            html +=
                '<tr><th style="text-align:left;">Sensor</th><th>Datum</th><th>Min</th><th>Zeit</th><th>Max</th><th>Zeit</th><th>Ø</th><th>Anz.</th></tr>';
            for (const entry of allData) {
                html += `<tr>
                    <td>${entry.name}</td>
                    <td>${entry.date || '-'}</td>
                    <td>${entry.min ?? '-'}</td>
                    <td>${entry.min_time || '-'}</td>
                    <td>${entry.max ?? '-'}</td>
                    <td>${entry.max_time || '-'}</td>
                    <td>${entry.avg ?? '-'}</td>
                    <td>${entry.data_points_count ?? '-'}</td>
                </tr>`;
            }
            html += '</table>';

            // States setzen (auch bei gleichen Werten → Timestamp aktualisieren)
            await adapter.setStateChangedAsync('analytics.statistics.temperature.today.outputs.summary_all_json', {
                val: jsonOutput,
                ack: true,
            });
            await adapter.setStateChangedAsync('analytics.statistics.temperature.today.outputs.summary_all_html', {
                val: html,
                ack: true,
            });
        } catch {
            // bewusst kein Log hier – stiller Schutz
        }
    },

    /**
     * Mitternacht-Reset planen
     */
    async _scheduleMidnightReset() {
        const adapter = this.adapter;
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }

        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 5, 0);
        const msUntilMidnight = nextMidnight.getTime() - now.getTime();

        this.midnightTimer = setTimeout(async () => {
            await this._resetDailyTemperatureStats();
            await this._scheduleMidnightReset();
        }, msUntilMidnight);

        adapter.log.debug(
            `statisticsHelper: Mitternacht-Reset geplant in ${Math.round(msUntilMidnight / 60000)} Minuten.`,
        );
    },

    /**
     * Tagesstatistik zurücksetzen
     */
    async _resetDailyTemperatureStats() {
        const adapter = this.adapter;
        adapter.log.info('statisticsHelper: Tagesstatistik wird zurückgesetzt.');

        const resetDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

        for (const sensor of this.sensors) {
            const basePath = `analytics.statistics.temperature.today.${sensor.id}`;
            const activeState = `temperature.${sensor.id}.active`;
            const isActive = (await adapter.getStateAsync(activeState))?.val === true;

            const summaryJsonPath = `${basePath}.summary_json`;
            const summaryHtmlPath = `${basePath}.summary_html`;

            if (!isActive) {
                await adapter.setStateAsync(summaryJsonPath, {
                    val: JSON.stringify({ status: 'kein Sensor aktiv' }),
                    ack: true,
                });
                await adapter.setStateAsync(summaryHtmlPath, {
                    val: '<div style="color:gray;">kein Sensor aktiv</div>',
                    ack: true,
                });
                continue;
            }

            const stateList = [
                'temp_min',
                'temp_max',
                'temp_min_time',
                'temp_max_time',
                'temp_avg',
                'data_points_count',
                'last_update',
            ];

            for (const state of stateList) {
                const fullPath = `${basePath}.${state}`;
                let defValue = null;
                if (state.includes('time')) {
                    defValue = '';
                }
                if (state === 'data_points_count') {
                    defValue = 0;
                }
                if (state === 'last_update') {
                    defValue = resetDate;
                }
                await adapter.setStateAsync(fullPath, { val: defValue, ack: true });
            }

            await adapter.setStateAsync(summaryJsonPath, {
                val: JSON.stringify({ date_reset: resetDate, status: 'Tageswerte zurückgesetzt' }),
                ack: true,
            });
            await adapter.setStateAsync(summaryHtmlPath, {
                val: `<div style="color:gray;">Tageswerte zurückgesetzt (${resetDate})</div>`,
                ack: true,
            });
        }

        await adapter.setStateAsync('analytics.statistics.temperature.today.outputs.summary_all_json', {
            val: '{}',
            ack: true,
        });
        await adapter.setStateAsync('analytics.statistics.temperature.today.outputs.summary_all_html', {
            val: '',
            ack: true,
        });

        adapter.log.debug('statisticsHelper: Tagesstatistik zurückgesetzt.');
    },

    /**
     * Stiller Überinstallationsschutz:
     * Prüft und legt fehlende States erneut an, ohne bestehende Werte zu überschreiben.
     */
    async _verifyStructure() {
        try {
            await this._createTemperatureStatistics();
        } catch {
            // bewusst keine Logs – stiller Selbstschutz
        }
    },

    cleanup() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }
    },
};

module.exports = statisticsHelper;

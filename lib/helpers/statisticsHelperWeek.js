'use strict';

/**
 * statisticsHelperWeek.js
 * -----------------------
 * Vollständige Steuerung der Wochenstatistik (Temperatur)
 * im Bereich analytics.statistics.temperature.week.*
 *
 * - Erkennt aktive Sensoren anhand temperature.<sensor>.active
 * - Reagiert eventbasiert auf Änderungen der Temperaturwerte
 * - Berechnet laufend Min/Max/Durchschnitt über 7 Tage
 * - Aktualisiert JSON- und HTML-Ausgaben (pro Sensor & gesamt)
 * - Führt automatischen Wochen-Reset (Sonntag 00:05 Uhr) durch
 *
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 */

const statisticsHelperWeek = {
    adapter: null,
    weekResetTimer: null,
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
        adapter.log.debug('statisticsHelperWeek: Initialisierung gestartet.');

        try {
            await this._createTemperatureStatistics();
            await this._subscribeActiveSensors();
            await this._scheduleWeekReset();
            adapter.log.debug('statisticsHelperWeek: Initialisierung abgeschlossen (Sensorüberwachung aktiv).');
        } catch (err) {
            adapter.log.warn(`statisticsHelperWeek: Fehler bei Initialisierung: ${err.message}`);
        }
    },

    /**
     * Erstellt States, falls sie fehlen (Überinstallationsschutz)
     */
    async _createTemperatureStatistics() {
        const adapter = this.adapter;

        for (const sensor of this.sensors) {
            const basePath = `analytics.statistics.temperature.week.${sensor.id}`;
            await adapter.setObjectNotExistsAsync(basePath, {
                type: 'channel',
                common: { name: `${sensor.name} (Wochenstatistik)` },
                native: {},
            });

            const activeState = `temperature.${sensor.id}.active`;
            const isActive = (await adapter.getStateAsync(activeState))?.val === true;

            const summaryJsonPath = `${basePath}.summary_json`;
            const summaryHtmlPath = `${basePath}.summary_html`;

            if (!isActive) {
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

        const outputBase = 'analytics.statistics.temperature.week.outputs';
        await adapter.setObjectNotExistsAsync(outputBase, {
            type: 'channel',
            common: { name: 'Gesamtausgaben (alle Sensoren – Woche)' },
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
     * @param {string} sensorId - Die ID des Sensors (z. B. "outside", "flow", "collector" usw.)
     * @param {number} newValue - Der neue gemessene Temperaturwert in °C
     */
    async _processTemperatureChange(sensorId, newValue) {
        const adapter = this.adapter;
        const basePath = `analytics.statistics.temperature.week.${sensorId}`;
        const now = new Date().toLocaleString('de-DE', {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });

        if (typeof newValue !== 'number') {
            return;
        }

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

        const newCount = count + 1;
        newAvg = tempAvg === null ? newValue : (tempAvg * count + newValue) / newCount;

        newMin = Math.round(newMin * 10) / 10;
        newMax = Math.round(newMax * 10) / 10;
        newAvg = Math.round(newAvg * 10) / 10;

        await adapter.setStateAsync(`${basePath}.temp_min`, { val: newMin, ack: true });
        await adapter.setStateAsync(`${basePath}.temp_max`, { val: newMax, ack: true });
        await adapter.setStateAsync(`${basePath}.temp_avg`, { val: Math.round(newAvg * 100) / 100, ack: true });
        await adapter.setStateAsync(`${basePath}.data_points_count`, { val: newCount, ack: true });
        await adapter.setStateAsync(`${basePath}.last_update`, { val: now, ack: true });

        const summary = {
            temp_min: newMin,
            temp_max: newMax,
            temp_avg: newAvg,
            updated: now,
        };
        await adapter.setStateAsync(`${basePath}.summary_json`, { val: JSON.stringify(summary), ack: true });
        await adapter.setStateAsync(`${basePath}.summary_html`, {
            val: `<div><b>Min:</b> ${newMin} °C / <b>Max:</b> ${newMax} °C / <b>Ø:</b> ${newAvg} °C</div>`,
            ack: true,
        });

        await this._updateOverallSummary();
    },

    /**
     * Gesamtzusammenfassung aller Sensoren aktualisieren
     */
    async _updateOverallSummary() {
        const adapter = this.adapter;
        const allData = [];

        try {
            for (const sensor of this.sensors) {
                const summaryState = await adapter.getStateAsync(
                    `analytics.statistics.temperature.week.${sensor.id}.summary_json`,
                );
                if (!summaryState || !summaryState.val) {
                    continue;
                }

                let parsed;
                try {
                    parsed = JSON.parse(summaryState.val);
                } catch {
                    continue;
                }

                const { temp_min: min, temp_max: max, temp_avg: avg } = parsed;
                if (min == null && max == null && avg == null) {
                    continue;
                }

                const rMin = typeof min === 'number' ? Math.round(min * 10) / 10 : min;
                const rMax = typeof max === 'number' ? Math.round(max * 10) / 10 : max;
                const rAvg = typeof avg === 'number' ? Math.round(avg * 10) / 10 : avg;

                allData.push({ name: sensor.name, min: rMin, max: rMax, avg: rAvg });
            }

            if (allData.length === 0) {
                await adapter.setStateChangedAsync('analytics.statistics.temperature.week.outputs.summary_all_json', {
                    val: '[]',
                    ack: true,
                });
                await adapter.setStateChangedAsync('analytics.statistics.temperature.week.outputs.summary_all_html', {
                    val: '',
                    ack: true,
                });
                return;
            }

            const jsonOutput = JSON.stringify(allData);

            let html = '<table style="width:100%;border-collapse:collapse;">';
            html += '<tr><th style="text-align:left;">Sensor</th><th>Min</th><th>Max</th><th>Ø</th></tr>';
            for (const entry of allData) {
                html += `<tr><td>${entry.name}</td><td>${entry.min ?? '-'}</td><td>${entry.max ?? '-'}</td><td>${entry.avg ?? '-'}</td></tr>`;
            }
            html += '</table>';

            await adapter.setStateChangedAsync('analytics.statistics.temperature.week.outputs.summary_all_json', {
                val: jsonOutput,
                ack: true,
            });
            await adapter.setStateChangedAsync('analytics.statistics.temperature.week.outputs.summary_all_html', {
                val: html,
                ack: true,
            });

            adapter.log.debug('statisticsHelperWeek: Gesamtzusammenfassung erfolgreich aktualisiert.');
        } catch (err) {
            adapter.log.warn(`statisticsHelperWeek: Fehler bei Gesamtzusammenfassung: ${err.message}`);
        }
    },

    /**
     * Wochen-Reset planen (Sonntag 00:05 Uhr)
     */
    async _scheduleWeekReset() {
        const adapter = this.adapter;
        if (this.weekResetTimer) {
            clearTimeout(this.weekResetTimer);
        }

        const now = new Date();
        const nextReset = new Date(now);
        // Sonntag 00:05
        const daysUntilSunday = (7 - now.getDay()) % 7;
        nextReset.setDate(now.getDate() + daysUntilSunday);
        nextReset.setHours(0, 5, 0, 0);

        const msUntilReset = nextReset.getTime() - now.getTime();
        this.weekResetTimer = setTimeout(async () => {
            await this._resetWeeklyTemperatureStats();
            await this._scheduleWeekReset();
        }, msUntilReset);

        adapter.log.debug(`statisticsHelperWeek: Wochen-Reset geplant in ${Math.round(msUntilReset / 60000)} Minuten.`);
    },

    /**
     * Wochenstatistik zurücksetzen
     */
    async _resetWeeklyTemperatureStats() {
        const adapter = this.adapter;
        adapter.log.info('statisticsHelperWeek: Wochenstatistik wird zurückgesetzt.');

        const resetDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

        for (const sensor of this.sensors) {
            const basePath = `analytics.statistics.temperature.week.${sensor.id}`;
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
                val: JSON.stringify({ date_reset: resetDate, status: 'Wochenwerte zurückgesetzt' }),
                ack: true,
            });
            await adapter.setStateAsync(summaryHtmlPath, {
                val: `<div style="color:gray;">Wochenwerte zurückgesetzt (${resetDate})</div>`,
                ack: true,
            });
        }

        await adapter.setStateAsync('analytics.statistics.temperature.week.outputs.summary_all_json', {
            val: '{}',
            ack: true,
        });
        await adapter.setStateAsync('analytics.statistics.temperature.week.outputs.summary_all_html', {
            val: '',
            ack: true,
        });

        adapter.log.debug('statisticsHelperWeek: Wochenstatistik zurückgesetzt.');
    },

    cleanup() {
        if (this.weekResetTimer) {
            clearTimeout(this.weekResetTimer);
        }
    },
};

module.exports = statisticsHelperWeek;

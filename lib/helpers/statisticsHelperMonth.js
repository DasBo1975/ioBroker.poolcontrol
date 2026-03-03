'use strict';

/**
 * statisticsHelperMonth.js
 * ------------------------
 * Vollständige Steuerung der Monatsstatistik (Temperatur)
 * im Bereich analytics.statistics.temperature.month.*
 *
 * - Erkennt aktive Sensoren anhand temperature.<sensor>.active
 * - Reagiert eventbasiert auf Änderungen der Temperaturwerte
 * - Berechnet laufend Min/Max/Durchschnitt über 30 Tage
 * - Aktualisiert JSON- und HTML-Ausgaben (pro Sensor & gesamt)
 * - Führt automatischen Monats-Reset (1. Tag des Monats 00:05 Uhr) durch
 *
 * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
 */

const statisticsHelperMonth = {
    adapter: null,
    monthResetTimer: null,
    isResetting: false,
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
        adapter.log.debug('statisticsHelperMonth: Initialization started.');

        // --- Überinstallationsschutz ---
        try {
            await this._verifyStructure();
        } catch {
            // keine Log-Ausgabe – stiller Schutz
        }

        try {
            await this._createTemperatureStatistics();
            await this._subscribeActiveSensors();
            await this._scheduleMonthReset();
            adapter.log.debug('statisticsHelperMonth: Initialization completed (sensor monitoring active).');
        } catch (err) {
            adapter.log.warn(`statisticsHelperMonth: Error during initialization: ${err.message}`);
        }
    },

    /**
     * Erstellt States, falls sie fehlen (Überinstallationsschutz)
     */
    async _createTemperatureStatistics() {
        const adapter = this.adapter;

        for (const sensor of this.sensors) {
            const basePath = `analytics.statistics.temperature.month.${sensor.id}`;
            await adapter.setObjectNotExistsAsync(basePath, {
                type: 'channel',
                common: { name: `${sensor.name} (Monatsstatistik)` },
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

        const outputBase = 'analytics.statistics.temperature.month.outputs';
        await adapter.setObjectNotExistsAsync(outputBase, {
            type: 'channel',
            common: { name: 'Gesamtausgaben (alle Sensoren – Monat)' },
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
     *
     * @param {string} sensorId - ID des Sensors
     * @param {number} newValue - Neuer Messwert in °C
     */
    async _processTemperatureChange(sensorId, newValue) {
        const adapter = this.adapter;
        const basePath = `analytics.statistics.temperature.month.${sensorId}`;
        const now = `${new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
        })} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

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
            name: 'Monatsstatistik',
            month_label: this._getCurrentMonthLabel(),
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
            val: `<div><b>Min:</b> ${newMin} °C / <b>Max:</b> ${newMax} °C / <b>Ø:</b> ${newAvg} °C</div>`,
            ack: true,
        });

        await this._updateOverallSummary();

        // FIX: last_update korrigieren (echtes Aktualisierungsdatum)
        await adapter.setStateAsync(`${basePath}.last_update`, {
            val: new Date().toISOString(),
            ack: true,
        });
    },

    /**
     * Gesamtzusammenfassung (JSON + HTML)
     */
    async _updateOverallSummary() {
        const adapter = this.adapter;
        const allData = [];

        try {
            for (const sensor of this.sensors) {
                const summaryState = await adapter.getStateAsync(
                    `analytics.statistics.temperature.month.${sensor.id}.summary_json`,
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
                const date = parsed.date || '';
                const minTime = parsed.temp_min_time || '';
                const maxTime = parsed.temp_max_time || '';
                const count = parsed.data_points_count || 0;

                allData.push({
                    month_label: this._getCurrentMonthLabel(),
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

            if (allData.length === 0) {
                await adapter.setStateChangedAsync('analytics.statistics.temperature.month.outputs.summary_all_json', {
                    val: '[]',
                    ack: true,
                });
                await adapter.setStateChangedAsync('analytics.statistics.temperature.month.outputs.summary_all_html', {
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

            await adapter.setStateChangedAsync('analytics.statistics.temperature.month.outputs.summary_all_json', {
                val: jsonOutput,
                ack: true,
            });
            await adapter.setStateChangedAsync('analytics.statistics.temperature.month.outputs.summary_all_html', {
                val: html,
                ack: true,
            });

            adapter.log.debug('statisticsHelperMonth: Overall summary updated successfully.');
        } catch (err) {
            adapter.log.warn(`statisticsHelperMonth: Error while updating overall summary: ${err.message}`);
        }
    },

    /**
     * Monats-Reset planen (1. Tag des Monats 00:05 Uhr)
     */
    async _scheduleMonthReset() {
        const adapter = this.adapter;
        if (this.monthResetTimer) {
            clearTimeout(this.monthResetTimer);
        }

        const now = new Date();
        const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0, 0);
        let msUntilReset = nextReset.getTime() - now.getTime();

        // Wenn heute bereits der 1. ist → keinen sofortigen Reset starten!
        if (now.getDate() === 1) {
            adapter.log.debug('statisticsHelperMonth: Today is already the 1st – reset skipped.');
            // Plan auf nächsten Monat verschieben
            nextReset.setMonth(nextReset.getMonth() + 1);
            msUntilReset = nextReset.getTime() - now.getTime();
        }

        // Wenn Berechnung negativ oder zu klein ist → Sicherheit
        if (msUntilReset <= 0 || msUntilReset < 10 * 60 * 1000) {
            adapter.log.debug('statisticsHelperMonth: msUntilReset was too small – adjusting timer.');
            msUntilReset = 10 * 60 * 1000; // mindestens 10 Minuten warten
        }

        // Timer setzen
        this.monthResetTimer = setTimeout(async () => {
            if (this.isResetting) {
                adapter.log.debug('statisticsHelperMonth: Reset already running – timer skipped.');
                return;
            }

            await this._resetMonthlyTemperatureStats();
            // await this._scheduleMonthReset();
        }, msUntilReset);

        adapter.log.debug(
            `statisticsHelperMonth: Monthly reset scheduled in ${Math.round(msUntilReset / 60000)} minutes.`,
        );
    },

    /**
     * Monatsstatistik zurücksetzen
     */
    async _resetMonthlyTemperatureStats() {
        const adapter = this.adapter;

        // 🟢 Neuer Logikblock: Monatsreset erfolgt nur, wenn wirklich neuer Monat begonnen hat
        try {
            const now = new Date();
            const currentDay = now.getDate();

            // Nur am 1. Tag des Monats ausführen (00:05 Uhr geplant)
            if (currentDay !== 1) {
                adapter.log.debug('[statisticsHelperMonth] Not the first day of the month – reset skipped.');
                return;
            }
        } catch (err) {
            adapter.log.warn(`[statisticsHelperMonth] Error while checking month start: ${err.message}`);
        }

        // 🟢 NEU: Schutz vor Endlosschleifen und Mehrfachausführung
        if (this.isResetting) {
            adapter.log.debug('statisticsHelperMonth: Reset already active – skipped.');
            return;
        }
        this.isResetting = true;

        try {
            adapter.log.info('statisticsHelperMonth: Monthly statistics are being reset.');

            // 🟢 NEU: fehlende Zeile wieder einfügen
            const resetDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

            for (const sensor of this.sensors) {
                const basePath = `analytics.statistics.temperature.month.${sensor.id}`;
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
                    val: JSON.stringify({ date_reset: resetDate, status: 'Monatswerte zurückgesetzt' }),
                    ack: true,
                });
                await adapter.setStateAsync(summaryHtmlPath, {
                    val: `<div style="color:gray;">Monatswerte zurückgesetzt (${resetDate})</div>`,
                    ack: true,
                });
            }

            await adapter.setStateAsync('analytics.statistics.temperature.month.outputs.summary_all_json', {
                val: '{}',
                ack: true,
            });
            await adapter.setStateAsync('analytics.statistics.temperature.month.outputs.summary_all_html', {
                val: '',
                ack: true,
            });

            adapter.log.debug('statisticsHelperMonth: Monthly statistics reset completed.');
        } catch (err) {
            adapter.log.warn(`statisticsHelperMonth: Error during monthly reset: ${err.message}`);
        } finally {
            this.isResetting = false; // 🟢 NEU: Flag wieder freigeben
        }
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

    /**
     * Gibt den aktuellen Monat als lesbares Label zurück, z. B. "Oktober 2025".
     */
    _getCurrentMonthLabel() {
        const d = new Date();
        const month = d.toLocaleString('de-DE', { month: 'long' });
        const year = d.getFullYear();
        return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
    },

    cleanup() {
        if (this.monthResetTimer) {
            clearTimeout(this.monthResetTimer);
        }
    },
};

module.exports = statisticsHelperMonth;

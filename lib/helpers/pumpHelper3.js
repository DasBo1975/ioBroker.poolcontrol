'use strict';

/**
 * pumpHelper3.js
 * ----------------------------------------------------------
 * Lern- und Analysemodul für die Pumpe
 * - Ermittelt Durchschnitts- und Normalwerte aus realen Laufzyklen
 * - Berechnet Abweichungen (Leistung & Durchfluss)
 * - Liefert textbasierte Statusbewertung ("im Normalbereich" etc.)
 * - Keine Sprach- oder Queue-Ausgabe
 *
 * Verwaltet:
 *   pump.learning.*
 *
 * Abhängigkeiten:
 *   - pump.live.current_power_w
 *   - pump.live.flow_current_lh
 *   - pump.pump_switch
 *
 * Version: 1.0.0
 */

const pumpHelper3 = {
    adapter: null,

    /** interner Speicher */
    currentSessionValues: {
        power: [],
        flow: [],
    },

    /**
     * Initialisiert den Helper
     *
     * @param {ioBroker.Adapter} adapter - aktive Adapterinstanz
     */
    async init(adapter) {
        this.adapter = adapter;
        this.adapter.log.info('[pumpHelper3] Initialisierung gestartet');

        // Relevante States überwachen
        this.adapter.subscribeStates('pump.pump_switch');
        this.adapter.subscribeStates('pump.live.current_power_w');
        this.adapter.subscribeStates('pump.live.flow_current_lh');

        this.adapter.log.info('[pumpHelper3] Erfolgreich initialisiert');
    },

    /**
     * Verarbeitet State-Änderungen
     *
     * @param {string} id - State-ID
     * @param {ioBroker.State} state - neuer Statewert
     */
    async handleStateChange(id, state) {
        if (!state || state.ack === false) {
            return;
        }

        try {
            if (id.endsWith('pump.pump_switch')) {
                const isOn = state.val === true;
                if (isOn) {
                    // Pumpe startet → neue Sitzung
                    this.currentSessionValues.power = [];
                    this.currentSessionValues.flow = [];
                    this.adapter.log.debug('[pumpHelper3] Neue Lern-Session gestartet');
                } else {
                    // Pumpe stoppt → Lernwerte aktualisieren
                    await this._finalizeLearningCycle();
                }
            }

            // Wenn Pumpe läuft, aktuelle Werte sammeln
            const pumpRunning = !!(await this.adapter.getStateAsync('pump.pump_switch'))?.val;
            if (pumpRunning) {
                if (id.endsWith('pump.live.current_power_w')) {
                    this._pushValue('power', state.val);
                }
                if (id.endsWith('pump.live.flow_current_lh')) {
                    this._pushValue('flow', state.val);
                }
            }

            // Bei jeder Änderung der Livewerte aktuelle Abweichung bewerten
            await this._updateDeviationAndStatus();
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper3] Fehler bei handleStateChange: ${err.message}`);
        }
    },

    /**
     * Fügt einen neuen Wert in den temporären Speicher ein.
     *
     * @param {"power"|"flow"} type - Art des Wertes
     * @param {number} value - neuer Messwert
     */
    _pushValue(type, value) {
        if (!this.currentSessionValues[type]) {
            this.currentSessionValues[type] = [];
        }
        if (typeof value === 'number' && value > 0) {
            this.currentSessionValues[type].push(value);
        }
    },

    /**
     * Wird aufgerufen, wenn ein Pumpenlauf endet.
     * Berechnet Durchschnittswerte des Laufs und aktualisiert Lernfelder.
     */
    async _finalizeLearningCycle() {
        try {
            const { power, flow } = this.currentSessionValues;
            if (power.length === 0 || flow.length === 0) {
                this.adapter.log.debug('[pumpHelper3] Keine Werte zum Lernen vorhanden, Zyklus übersprungen');
                return;
            }

            const avgPower = this._average(power);
            const avgFlow = this._average(flow);

            // Vorhandene Lernwerte lesen
            const learnedPower = (await this._getNumber('pump.learning.learned_avg_power_w')) || 0;
            const learnedFlow = (await this._getNumber('pump.learning.learned_avg_flow_lh')) || 0;
            const cycles = (await this._getNumber('pump.learning.learning_cycles_total')) || 0;

            // Gleitenden Durchschnitt berechnen
            const newCycles = cycles + 1;
            const newAvgPower = (learnedPower * cycles + avgPower) / newCycles;
            const newAvgFlow = (learnedFlow * cycles + avgFlow) / newCycles;

            // Normalbereiche ±15 %
            const rangePowerLow = Math.round(newAvgPower * 0.85);
            const rangePowerHigh = Math.round(newAvgPower * 1.15);
            const rangeFlowLow = Math.round(newAvgFlow * 0.85);
            const rangeFlowHigh = Math.round(newAvgFlow * 1.15);

            // States schreiben
            await this.adapter.setStateAsync('pump.learning.learned_avg_power_w', {
                val: Math.round(newAvgPower),
                ack: true,
            });
            await this.adapter.setStateAsync('pump.learning.learned_avg_flow_lh', {
                val: Math.round(newAvgFlow),
                ack: true,
            });
            await this.adapter.setStateAsync('pump.learning.normal_range_power_low', { val: rangePowerLow, ack: true });
            await this.adapter.setStateAsync('pump.learning.normal_range_power_high', {
                val: rangePowerHigh,
                ack: true,
            });
            await this.adapter.setStateAsync('pump.learning.normal_range_flow_low', { val: rangeFlowLow, ack: true });
            await this.adapter.setStateAsync('pump.learning.normal_range_flow_high', { val: rangeFlowHigh, ack: true });
            await this.adapter.setStateAsync('pump.learning.learning_cycles_total', { val: newCycles, ack: true });

            this.adapter.log.debug(
                `[pumpHelper3] Lernzyklus #${newCycles} abgeschlossen (Power Ø${avgPower}W, Flow Ø${avgFlow}l/h)`,
            );

            // Speicher leeren
            this.currentSessionValues.power = [];
            this.currentSessionValues.flow = [];
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper3] Fehler bei _finalizeLearningCycle: ${err.message}`);
        }
    },

    /**
     * Bewertet aktuelle Abweichungen und schreibt Status.
     */
    async _updateDeviationAndStatus() {
        try {
            const currentPower = await this._getNumber('pump.live.current_power_w');
            const currentFlow = await this._getNumber('pump.live.flow_current_lh');
            const avgPower = await this._getNumber('pump.learning.learned_avg_power_w');
            const avgFlow = await this._getNumber('pump.learning.learned_avg_flow_lh');

            if (avgPower <= 0 || avgFlow <= 0) {
                return;
            } // Noch kein Lernwert vorhanden

            // Prozentuale Abweichungen
            const deviationPower = ((currentPower - avgPower) / avgPower) * 100;
            const deviationFlow = ((currentFlow - avgFlow) / avgFlow) * 100;

            await this.adapter.setStateAsync('pump.learning.deviation_power_percent', {
                val: Math.round(deviationPower * 10) / 10,
                ack: true,
            });
            await this.adapter.setStateAsync('pump.learning.deviation_flow_percent', {
                val: Math.round(deviationFlow * 10) / 10,
                ack: true,
            });

            // Bewertung
            const statusText = this._getStatusText(deviationPower, deviationFlow);
            await this.adapter.setStateAsync('pump.learning.status_text', { val: statusText, ack: true });
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper3] Fehler bei _updateDeviationAndStatus: ${err.message}`);
        }
    },

    /**
     * Liefert textbasierte Bewertung anhand der Abweichung.
     *
     * @param devPower - Aktuelle Abweichung der Leistung (W)
     * @param devFlow - Aktuelle Abweichung des Durchflusses (L/H)
     */
    _getStatusText(devPower, devFlow) {
        const absPower = Math.abs(devPower);
        const absFlow = Math.abs(devFlow);

        if (absPower <= 15 && absFlow <= 15) {
            return 'Pumpe läuft im Normalbereich';
        }
        if (devPower < -15 || devFlow < -15) {
            return 'Pumpe läuft unterhalb des Normalbereichs (möglicher Filterdruck)';
        }
        if (devPower > 15 || devFlow > 15) {
            return 'Pumpe läuft oberhalb des Normalbereichs (möglicher Luftstau)';
        }
        return 'Pumpe außerhalb des bekannten Bereichs';
    },

    /**
     * Erzeugt Durchschnittswerte aus einem Array numerischer Werte.
     *
     * @param {number[]} arr - Wertearray
     * @returns {number} - Durchschnittswert
     */
    _average(arr) {
        if (!arr || arr.length === 0) {
            return 0;
        }
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    /**
     * Liest einen numerischen Statewert oder 0 bei Fehler.
     *
     * @param {string} id - Objekt-ID
     * @returns {Promise<number>} - Gelesener Wert oder 0
     */
    async _getNumber(id) {
        const state = await this.adapter.getStateAsync(id);
        const val = Number(state?.val);
        return isNaN(val) ? 0 : val;
    },

    /**
     * Cleanup bei Adapter-Unload
     */
    cleanup() {
        this.currentSessionValues = { power: [], flow: [] };
        this.adapter?.log.debug('[pumpHelper3] Cleanup ausgeführt.');
    },
};

module.exports = pumpHelper3;

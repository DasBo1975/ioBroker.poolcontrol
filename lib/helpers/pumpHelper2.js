'use strict';

/**
 * pumpHelper2.js
 * ----------------------------------------------------------
 * Ergänzende Berechnungslogik für Pumpen-Livewerte
 * (reeller Durchfluss, Prozentleistung, letzter Durchflusswert).
 *
 * Verwendet vorhandene States:
 *  - pump.current_power
 *  - pump.pump_max_watt
 *  - pump.pump_power_lph
 *  - pump.pump_switch
 *
 * Schreibt neue Werte in:
 *  - pump.live.current_power_w
 *  - pump.live.flow_current_lh
 *  - pump.live.flow_percent
 *  - pump.live.last_flow_lh
 *
 * Alle Zielstates sind persistent (siehe pumpStates2.js).
 * ----------------------------------------------------------
 * Version: 1.0.3
 */

const pumpHelper2 = {
    adapter: null,
    lastKnownFlow: 0, // merkt sich den letzten gültigen Durchflusswert

    /**
     * Initialisiert den PumpHelper2
     *
     * @param {ioBroker.Adapter} adapter - Aktive ioBroker Adapterinstanz
     */
    async init(adapter) {
        this.adapter = adapter;
        this.adapter.log.info('[pumpHelper2] Initialisierung gestartet');

        // Relevante States überwachen
        this.adapter.subscribeStates('pump.current_power');
        this.adapter.subscribeStates('pump.pump_switch');

        // Initialwerte berechnen
        await this._updateLiveValues();

        this.adapter.log.info('[pumpHelper2] Erfolgreich initialisiert');
    },

    /**
     * StateChange-Verarbeitung
     *
     * @param {string} id - State-ID
     * @param {ioBroker.State | null | undefined} state - Neuer Statewert
     */
    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // FIX: manuelles Schalten von pump_switch berücksichtigen (ack:false zulassen)
        const allowManual = id.endsWith('pump.pump_switch');
        if (!allowManual && state.ack === false) {
            return;
        }

        // Pumpenstatus-Änderung → letzten Durchflusswert sichern
        if (id.endsWith('pump.pump_switch')) {
            const pumpOn = state.val === true;
            if (!pumpOn) {
                // FIX: Verwende den zuletzt gemerkten Wert, statt live zu lesen (verhindert 0-Durchfluss)
                const flowBeforeStop = this.lastKnownFlow;
                if (flowBeforeStop > 0) {
                    await this._setIfChanged('pump.live.last_flow_lh', flowBeforeStop);
                    this.adapter.log.debug(
                        `[pumpHelper2] FIX: Letzter Durchflusswert gesichert: ${flowBeforeStop} l/h`,
                    );
                } else {
                    this.adapter.log.debug('[pumpHelper2] Kein gespeicherter Durchflusswert vorhanden.');
                }
            }
        }
    },

    /**
     * Führt die Berechnung der Livewerte durch.
     * (Nur wenn gültige Basiswerte vorhanden sind.)
     */
    async _updateLiveValues() {
        try {
            const [currentPower, maxPower, nominalFlow] = await Promise.all([
                this._getNumber('pump.current_power'),
                this._getNumber('pump.pump_max_watt'),
                this._getNumber('pump.pump_power_lph'),
            ]);

            // Schutz gegen ungültige Werte
            if (maxPower <= 0 || nominalFlow <= 0) {
                this.adapter.log.debug('[pumpHelper2] Ungültige Basiswerte, Berechnung übersprungen');
                return;
            }

            // Prozentuale Auslastung
            const flowPercent = Math.min(Math.max((currentPower / maxPower) * 100, 0), 100);

            // Reeller Durchfluss
            const flowCurrentLh = Math.round(nominalFlow * (currentPower / maxPower) * 10) / 10; // 1 Nachkommastelle

            // Letzten gültigen Wert merken
            if (flowCurrentLh > 0) {
                this.lastKnownFlow = flowCurrentLh;
            }

            // In States schreiben
            await this._setIfChanged('pump.live.current_power_w', currentPower);
            await this._setIfChanged('pump.live.flow_current_lh', flowCurrentLh);
            await this._setIfChanged('pump.live.flow_percent', flowPercent);

            this.adapter.log.debug(
                `[pumpHelper2] Reeller Durchfluss aktualisiert: ${flowCurrentLh} l/h (${flowPercent.toFixed(1)}%)`,
            );
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper2] Fehler bei _updateLiveValues: ${err.message}`);
        }
    },

    /**
     * Liest einen numerischen Statewert (oder 0 bei Fehler).
     *
     * @param {string} id - Objekt-ID des zu lesenden States
     * @returns {Promise<number>} - Aktueller numerischer Wert oder 0
     */
    async _getNumber(id) {
        const state = await this.adapter.getStateAsync(id);
        const val = Number(state?.val);
        return isNaN(val) ? 0 : val;
    },

    /**
     * Schreibt neuen Wert nur, wenn er sich geändert hat.
     *
     * @param {string} id - Objekt-ID des zu schreibenden States
     * @param {number} newVal - Neuer Wert, des gesetzt werden soll
     */
    async _setIfChanged(id, newVal) {
        const current = await this.adapter.getStateAsync(id);
        if (current && Number(current.val) === newVal) {
            return;
        }
        await this.adapter.setStateAsync(id, { val: newVal, ack: true });
    },

    /**
     * Cleanup bei Adapter-Unload
     * Wird aktuell nur als Platzhalter verwendet.
     */
    cleanup() {
        // Derzeit keine Timer oder Intervalle vorhanden
        // Platzhalter für zukünftige Erweiterungen
        this.adapter?.log.debug('[pumpHelper2] Cleanup ausgeführt.');
    },
};

module.exports = pumpHelper2;

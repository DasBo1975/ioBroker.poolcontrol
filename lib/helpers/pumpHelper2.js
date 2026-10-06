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

const pumpHelper2 = /** @satisfies {import('../types/poolcontrol-adapter').PumpHelper2} */ ({
    _adapter: null,
    _active: false,
    _lifecycleGeneration: 0,
    _initializationPromise: null,
    lastKnownFlow: 0, // merkt sich den letzten gültigen Durchflusswert

    /**
     * Returns the initialized ioBroker adapter instance.
     *
     * @returns Initialized adapter instance.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('pumpHelper2 used before init()');
        }

        return this._adapter;
    },

    /**
     * Initialisiert den PumpHelper2
     *
     * @param {ioBroker.Adapter} adapter - Aktive ioBroker Adapterinstanz
     */
    async init(adapter) {
        this._adapter = adapter;
        this._active = true;
        const generation = ++this._lifecycleGeneration;
        const initializationPromise = this._initialize(generation);
        this._initializationPromise = initializationPromise;

        try {
            await initializationPromise;
        } finally {
            if (this._lifecycleGeneration === generation && this._initializationPromise === initializationPromise) {
                this._initializationPromise = null;
            }
        }
    },

    /**
     * Completes subscriptions and the authoritative initial calculation.
     *
     * @param {number} generation - Lifecycle generation that started initialization.
     */
    async _initialize(generation) {
        this.adapter.log.info('[pumpHelper2] Initialization started');

        // Relevante States überwachen
        this.adapter.subscribeStates('pump.current_power');
        this.adapter.subscribeStates('pump.pump_switch');

        // Initialwerte berechnen
        await this._updateLiveValues(generation);

        if (!this._isGenerationActive(generation)) {
            return;
        }

        this.adapter.log.info('[pumpHelper2] Successfully initialized');
    },

    /**
     * StateChange-Verarbeitung
     *
     * @param {string} id - State-ID
     * @param {ioBroker.State | null | undefined} state - Neuer Statewert
     */
    async handleStateChange(id, state) {
        if (!this._active || !state) {
            return;
        }

        const generation = this._lifecycleGeneration;
        const initializationPromise = this._initializationPromise;
        if (initializationPromise) {
            await initializationPromise;
            return;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        // Leistungsänderung → reelle Durchflusswerte aktualisieren
        if (id.endsWith('pump.current_power')) {
            if (state.ack === false) {
                return;
            }

            await this._updateLiveValues(generation);
            return;
        }

        // Pumpenstatus-Änderung → Livewerte aktualisieren bzw. letzten Durchflusswert sichern
        if (id.endsWith('pump.pump_switch')) {
            const pumpOn = state.val === true;

            if (pumpOn) {
                // FIX: Helper-driven pump starts use ack=false, but live flow must still be recalculated.
                await this._updateLiveValues(generation);
                return;
            }

            // FIX: Verwende den zuletzt gemerkten Wert, statt live zu lesen (verhindert 0-Durchfluss)
            const flowBeforeStop = this.lastKnownFlow;
            if (flowBeforeStop > 0) {
                await this._setIfChanged('pump.live.last_flow_lh', flowBeforeStop, generation);
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                this.adapter.log.debug(`[pumpHelper2] FIX: Last flow value stored: ${flowBeforeStop} l/h`);
            } else {
                this.adapter.log.debug('[pumpHelper2] No stored flow value available.');
            }
        }
    },

    /**
     * Führt die Berechnung der Livewerte durch.
     * (Nur wenn gültige Basiswerte vorhanden sind.)
     *
     * @param {number} [generation] - Lifecycle generation to validate.
     */
    async _updateLiveValues(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        try {
            if (!this._isGenerationActive(generation)) {
                return;
            }

            const [currentPower, maxPower, nominalFlow] = await Promise.all([
                this._getNumber('pump.current_power'),
                this._getNumber('pump.pump_max_watt'),
                this._getNumber('pump.pump_power_lph'),
            ]);

            if (!this._isGenerationActive(generation)) {
                return;
            }

            // Schutz gegen ungültige Werte
            if (maxPower <= 0 || nominalFlow <= 0) {
                this.adapter.log.debug('[pumpHelper2] Invalid base values, calculation skipped');
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
            await this._setIfChanged('pump.live.current_power_w', currentPower, generation);
            await this._setIfChanged('pump.live.flow_current_lh', flowCurrentLh, generation);
            await this._setIfChanged('pump.live.flow_percent', flowPercent, generation);

            if (!this._isGenerationActive(generation)) {
                return;
            }

            this.adapter.log.debug(
                `[pumpHelper2] Actual flow updated: ${flowCurrentLh} l/h (${flowPercent.toFixed(1)}%)`,
            );
        } catch (err) {
            if (this._isGenerationActive(generation)) {
                this.adapter.log.warn(`[pumpHelper2] Error in _updateLiveValues: ${err.message}`);
            }
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
     * @param {number} [generation] - Lifecycle generation to validate.
     */
    async _setIfChanged(id, newVal, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        const current = await this.adapter.getStateAsync(id);
        if (!this._isGenerationActive(generation)) {
            return;
        }
        if (current && Number(current.val) === newVal) {
            return;
        }
        await this.adapter.setStateAsync(id, { val: newVal, ack: true });
    },

    /**
     * Checks whether an asynchronous continuation still belongs to the active lifecycle.
     *
     * @param {number} generation - Lifecycle generation to validate.
     * @returns {boolean} Whether the generation is still active.
     */
    _isGenerationActive(generation) {
        return this._active && generation === this._lifecycleGeneration;
    },

    /**
     * Cleanup bei Adapter-Unload
     * Wird aktuell nur als Platzhalter verwendet.
     */
    cleanup() {
        this._active = false;
        ++this._lifecycleGeneration;
        this._initializationPromise = null;
        // Derzeit keine Timer oder Intervalle vorhanden
        // Platzhalter für zukünftige Erweiterungen
        this._adapter?.log.debug('[pumpHelper2] Cleanup executed.');
    },
});

module.exports = pumpHelper2;

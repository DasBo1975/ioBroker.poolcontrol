'use strict';

/**
 * pumpSpeedHelper.js
 * ----------------------------------------------------------
 * Leistungsempfehlung für die Hauptpumpe (rein passiv)
 *
 * Dieser Helper:
 * - schaltet die Pumpe NICHT
 * - steuert KEINE Hardware (kein 0-10V, kein Shelly, kein FU)
 * - greift NICHT in bestehende Pumpenlogik ein
 *
 * Er reagiert ausschließlich auf bestehende States und leitet daraus
 * EINEN internen Leistungszustand ab, der dann in mehreren Formen
 * ausgegeben wird:
 * - pump.speed.state  (interner Zustand)
 * - pump.speed.mode   (semantische Ausgabe)
 * - pump.speed.percent (technische Ausgabe, aus User-Mapping)
 *
 * Eingänge (Single Source of Truth):
 * - pump.pump_switch
 * - pump.mode
 * - control.pump.backwash_active
 * - pump.speed.config.percent.* (Mapping)
 *
 * Logik (schlank, wie besprochen):
 * 1) Pumpe AUS -> off
 * 2) Rückspülen/Wartung aktiv -> boost
 * 3) FrostHelper aktiv -> frost
 * 4) sonst -> normal
 *
 * Version: 0.1.0
 */

const pumpSpeedHelper = /** @satisfies {import('../types/poolcontrol-adapter').PumpSpeedHelper} */ ({
    _adapter: null,
    _active: false,
    _lifecycleGeneration: 0,
    _initializationPromise: null,

    /**
     * Returns the initialized ioBroker adapter instance.
     *
     * @returns Initialized adapter instance.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('pumpSpeedHelper used before init()');
        }

        return this._adapter;
    },

    // Cache für Mapping (damit nicht jedes Event alles neu gelesen wird)
    mapping: {
        frost: 0,
        low: 0,
        normal: 0,
        high: 0,
        boost: 0,
    },

    /**
     * Initialisiert den Helper
     *
     * @param {ioBroker.Adapter} adapter – aktive Adapterinstanz
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
     * Completes subscriptions, mapping load, and the initial recommendation.
     *
     * @param {number} generation - Lifecycle generation that started initialization.
     */
    async _initialize(generation) {
        const adapter = this.adapter;

        adapter.log.debug('[pumpSpeedHelper] Initialization started');

        // ----------------------------------------------------------
        // Subscriptions (Grundregel: ohne subscribe -> wirkungslos)
        // ----------------------------------------------------------
        adapter.subscribeStates('pump.pump_switch');
        adapter.subscribeStates('pump.mode');
        adapter.subscribeStates('control.pump.backwash_active');

        adapter.subscribeStates('pump.speed.config.percent.frost');
        adapter.subscribeStates('pump.speed.config.percent.low');
        adapter.subscribeStates('pump.speed.config.percent.normal');
        adapter.subscribeStates('pump.speed.config.percent.high');
        adapter.subscribeStates('pump.speed.config.percent.boost');

        // Initiales Mapping laden
        await this._reloadMapping(generation);

        if (!this._isGenerationActive(generation)) {
            return;
        }

        // Initialen Output setzen
        await this._recalculate(generation);

        if (!this._isGenerationActive(generation)) {
            return;
        }

        adapter.log.debug('[pumpSpeedHelper] Successfully initialized');
    },

    /**
     * Verarbeitet relevante State-Änderungen
     *
     * @param {string} id - Objekt-ID
     * @param {ioBroker.State} state - Neuer Wert
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

        try {
            // Mapping geändert? -> Cache aktualisieren + neu berechnen
            if (
                id.endsWith('pump.speed.config.percent.frost') ||
                id.endsWith('pump.speed.config.percent.low') ||
                id.endsWith('pump.speed.config.percent.normal') ||
                id.endsWith('pump.speed.config.percent.high') ||
                id.endsWith('pump.speed.config.percent.boost')
            ) {
                await this._reloadMapping(generation);
                await this._recalculate(generation);
                return;
            }

            // Relevante Eingänge? -> neu berechnen
            if (
                id.endsWith('pump.pump_switch') ||
                id.endsWith('pump.mode') ||
                id.endsWith('control.pump.backwash_active')
            ) {
                await this._recalculate(generation);
                return;
            }
        } catch (e) {
            if (this._isGenerationActive(generation)) {
                this.adapter.log.warn(`[pumpSpeedHelper] Error in handleStateChange: ${e.message}`);
            }
        }
    },

    /**
     * Lädt das User-Mapping in den Cache
     *
     * @param {number} [generation] - Lifecycle generation to validate.
     */
    async _reloadMapping(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        const frost = await this._getPercent('pump.speed.config.percent.frost');
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const low = await this._getPercent('pump.speed.config.percent.low');
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const normal = await this._getPercent('pump.speed.config.percent.normal');
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const high = await this._getPercent('pump.speed.config.percent.high');
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const boost = await this._getPercent('pump.speed.config.percent.boost');
        if (!this._isGenerationActive(generation)) {
            return;
        }

        const mapping = {
            frost,
            low,
            normal,
            high,
            boost,
        };

        this.mapping = mapping;

        this.adapter.log.debug(
            `[pumpSpeedHelper] Mapping loaded: frost=${this.mapping.frost} low=${this.mapping.low} normal=${this.mapping.normal} high=${this.mapping.high} boost=${this.mapping.boost}`,
        );
    },

    /**
     * Führt die eigentliche Ableitung durch und setzt die Ausgänge
     *
     * @param {number} [generation] - Lifecycle generation to validate.
     */
    async _recalculate(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        const pumpSwitch = await this.adapter.getStateAsync('pump.pump_switch');
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const pumpIsOn = !!pumpSwitch?.val;

        // Pumpe aus -> off
        if (!pumpIsOn) {
            await this._setOutputs('off', 0, generation);
            return;
        }

        // Rückspülen/Wartung aktiv? -> boost
        const backwash = await this.adapter.getStateAsync('control.pump.backwash_active');
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const backwashActive = !!backwash?.val;
        if (backwashActive) {
            await this._setOutputs('boost', this.mapping.boost, generation);
            return;
        }

        // Frost? -> frost (über pump.mode = frostHelper)
        const mode = (await this.adapter.getStateAsync('pump.mode'))?.val || '';
        if (!this._isGenerationActive(generation)) {
            return;
        }
        if (mode === 'frostHelper') {
            await this._setOutputs('frost', this.mapping.frost, generation);
            return;
        }

        // Alles andere -> normal
        await this._setOutputs('normal', this.mapping.normal, generation);
    },

    /**
     * Setzt state/mode/percent konsistent aus EINEM Zustand
     *
     * @param {string} stateValue - interner Zustand (off|frost|low|normal|high|boost)
     * @param {number} percentValue - gemappter Prozentwert
     * @param {number} [generation] - Lifecycle generation to validate.
     */
    async _setOutputs(stateValue, percentValue, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        const safePercent = this._clampPercent(percentValue);

        // state (intern)
        await this.adapter.setStateChangedAsync('pump.speed.state', {
            val: stateValue,
            ack: true,
        });

        if (!this._isGenerationActive(generation)) {
            return;
        }

        // mode (semantisch)
        await this.adapter.setStateChangedAsync('pump.speed.mode', {
            val: stateValue,
            ack: true,
        });

        if (!this._isGenerationActive(generation)) {
            return;
        }

        // percent (technisch)
        await this.adapter.setStateChangedAsync('pump.speed.percent', {
            val: safePercent,
            ack: true,
        });

        if (!this._isGenerationActive(generation)) {
            return;
        }

        this.adapter.log.debug(`[pumpSpeedHelper] Output set: state=${stateValue}, percent=${safePercent}`);
    },

    /**
     * Liest einen Prozentwert aus einem Konfigurations-State.
     * Ungültige oder fehlende Werte werden als 0 interpretiert.
     *
     * @param {string} id - Objekt-ID des Prozent-States
     * @returns {Promise<number>} Prozentwert im Bereich 0..100
     */
    async _getPercent(id) {
        const st = await this.adapter.getStateAsync(id);
        const val = Number(st?.val);
        if (Number.isNaN(val)) {
            return 0;
        }
        return this._clampPercent(val);
    },

    /**
     * Begrenzt einen Zahlenwert auf den gültigen Prozentbereich (0..100).
     *
     * @param {number} v - Zu prüfender Prozentwert
     * @returns {number} Gültiger Prozentwert im Bereich 0..100
     */
    _clampPercent(v) {
        if (Number.isNaN(v)) {
            return 0;
        }
        if (v < 0) {
            return 0;
        }
        if (v > 100) {
            return 100;
        }
        return Math.round(v);
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
     */
    cleanup() {
        this._active = false;
        ++this._lifecycleGeneration;
        this._initializationPromise = null;
        this._adapter?.log.debug('[pumpSpeedHelper] Cleanup executed.');
    },
});

module.exports = pumpSpeedHelper;

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

const pumpSpeedHelper = {
    adapter: null,

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
        this.adapter = adapter;

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
        await this._reloadMapping();

        // Initialen Output setzen
        await this._recalculate();

        adapter.log.debug('[pumpSpeedHelper] Successfully initialized');
    },

    /**
     * Verarbeitet relevante State-Änderungen
     *
     * @param {string} id - Objekt-ID
     * @param {ioBroker.State} state - Neuer Wert
     */
    async handleStateChange(id, state) {
        if (!state) {
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
                await this._reloadMapping();
                await this._recalculate();
                return;
            }

            // Relevante Eingänge? -> neu berechnen
            if (
                id.endsWith('pump.pump_switch') ||
                id.endsWith('pump.mode') ||
                id.endsWith('control.pump.backwash_active')
            ) {
                await this._recalculate();
                return;
            }
        } catch (e) {
            this.adapter.log.warn(`[pumpSpeedHelper] Error in handleStateChange: ${e.message}`);
        }
    },

    /**
     * Lädt das User-Mapping in den Cache
     */
    async _reloadMapping() {
        this.mapping.frost = await this._getPercent('pump.speed.config.percent.frost');
        this.mapping.low = await this._getPercent('pump.speed.config.percent.low');
        this.mapping.normal = await this._getPercent('pump.speed.config.percent.normal');
        this.mapping.high = await this._getPercent('pump.speed.config.percent.high');
        this.mapping.boost = await this._getPercent('pump.speed.config.percent.boost');

        this.adapter.log.debug(
            `[pumpSpeedHelper] Mapping loaded: frost=${this.mapping.frost} low=${this.mapping.low} normal=${this.mapping.normal} high=${this.mapping.high} boost=${this.mapping.boost}`,
        );
    },

    /**
     * Führt die eigentliche Ableitung durch und setzt die Ausgänge
     */
    async _recalculate() {
        const pumpSwitch = await this.adapter.getStateAsync('pump.pump_switch');
        const pumpIsOn = !!pumpSwitch?.val;

        // Pumpe aus -> off
        if (!pumpIsOn) {
            await this._setOutputs('off', 0);
            return;
        }

        // Rückspülen/Wartung aktiv? -> boost
        const backwash = await this.adapter.getStateAsync('control.pump.backwash_active');
        const backwashActive = !!backwash?.val;
        if (backwashActive) {
            await this._setOutputs('boost', this.mapping.boost);
            return;
        }

        // Frost? -> frost (über pump.mode = frostHelper)
        const mode = (await this.adapter.getStateAsync('pump.mode'))?.val || '';
        if (mode === 'frostHelper') {
            await this._setOutputs('frost', this.mapping.frost);
            return;
        }

        // Alles andere -> normal
        await this._setOutputs('normal', this.mapping.normal);
    },

    /**
     * Setzt state/mode/percent konsistent aus EINEM Zustand
     *
     * @param {string} stateValue - interner Zustand (off|frost|low|normal|high|boost)
     * @param {number} percentValue - gemappter Prozentwert
     */
    async _setOutputs(stateValue, percentValue) {
        const safePercent = this._clampPercent(percentValue);

        // state (intern)
        await this.adapter.setStateChangedAsync('pump.speed.state', {
            val: stateValue,
            ack: true,
        });

        // mode (semantisch)
        await this.adapter.setStateChangedAsync('pump.speed.mode', {
            val: stateValue,
            ack: true,
        });

        // percent (technisch)
        await this.adapter.setStateChangedAsync('pump.speed.percent', {
            val: safePercent,
            ack: true,
        });

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
     * Cleanup bei Adapter-Unload
     */
    cleanup() {
        this.adapter?.log.debug('[pumpSpeedHelper] Cleanup executed.');
    },
};

module.exports = pumpSpeedHelper;

"use strict";

/**
 * pumpHelper
 * - Spiegelt aktuelle Leistung aus Fremd-State nach pump.current_power
 * - Prüft Fehlerkriterien → setzt pump.error
 * - Bei Überlast: Pumpe ausschalten + Modus blockieren
 * - Leitet pump.status ab aus mode, switch, error
 * - NEU: Synchronisiert zentralen Schalter (pump.pump_switch, boolean) mit der realen Steckdose (adapter.config.pump_switch)
 */

const pumpHelper = {
    adapter: null,
    deviceId: null,        // Objekt-ID der echten Steckdose (aus Config)
    currentPowerId: null,  // Fremd-State für Leistung (aus Config)

    init(adapter) {
        this.adapter = adapter;

        // States aus Config lesen
        this.deviceId       = (adapter.config.pump_switch || "").trim() || null;             
        this.currentPowerId = (adapter.config.pump_current_power_id || "").trim() || null;   

        // Relevante eigenen States beobachten
        this.adapter.subscribeStates("pump.mode");
        this.adapter.subscribeStates("pump.pump_switch"); 
        this.adapter.subscribeStates("pump.error");

        // Fremdleistung beobachten
        if (this.currentPowerId) {
            this.adapter.subscribeForeignStates(this.currentPowerId);

            // Initialwert ziehen
            this.adapter.getForeignStateAsync(this.currentPowerId).then(s => {
                const val = this._parseNumber(s?.val);
                this.adapter.setStateAsync("pump.current_power", { val, ack: true });
                this.adapter.log.info(`[pumpHelper] Überwache Leistung von ${this.currentPowerId} (Startwert: ${val})`);
            }).catch(() => {
                this.adapter.log.info(`[pumpHelper] Überwache Leistung von ${this.currentPowerId}`);
            });
        } else {
            this.adapter.log.info("[pumpHelper] Keine Objekt-ID für aktuelle Leistung konfiguriert");
        }

        // Echte Steckdose beobachten (Status-Spiegelung)
        if (this.deviceId) {
            this.adapter.subscribeForeignStates(this.deviceId);
            this.adapter.log.info(`[pumpHelper] Überwache Steckdose: ${this.deviceId}`);
        } else {
            this.adapter.log.info("[pumpHelper] Keine Objekt-ID für Pumpen-Steckdose konfiguriert");
        }

        this.adapter.log.info("[pumpHelper] initialisiert");
        // Initialer Status
        this._updateStatus().catch(err => this.adapter.log.warn(`[pumpHelper] Initiales Status-Update fehlgeschlagen: ${err.message}`));
    },

    // Hilfsfunktion: Zahlen robust parsen
    _parseNumber(x) {
        if (typeof x === "number" && Number.isFinite(x)) return x;
        const m = String(x ?? "").replace(",", ".").match(/-?\d+(\.\d+)?/);
        return m ? Number(m[0]) : 0;
    },

    async handleStateChange(id, state) {
        if (!state) return;

        // 1) Leistung aus Fremd-State spiegeln
        if (this.currentPowerId && id === this.currentPowerId) {
            const val = this._parseNumber(state.val);
            await this.adapter.setStateAsync("pump.current_power", { val, ack: true });
            await this._checkErrorConditions(); 
            return;
        }

        // 2) Fremde Steckdose hat sich verändert → in unseren bool-Schalter spiegeln
        if (this.deviceId && id === this.deviceId) {
            const val = !!state.val;
            await this.adapter.setStateAsync("pump.pump_switch", { val, ack: true });
            await this._updateStatus();
            await this._checkErrorConditions();
            return;
        }

        // 3) Eigene Pumpen-States geändert
        if (id.endsWith("pump.mode") || id.endsWith("pump.pump_switch") || id.endsWith("pump.error")) {
            if (id.endsWith("pump.pump_switch") && this.deviceId) {
                await this.adapter.setForeignStateAsync(this.deviceId, { val: !!state.val, ack: false });
            }

            await this._updateStatus();
            await this._checkErrorConditions();
            return;
        }
    },

    async _updateStatus() {
        try {
            const mode   = (await this.adapter.getStateAsync("pump.mode"))?.val || "unknown";
            const active = (await this.adapter.getStateAsync("pump.pump_switch"))?.val;
            const error  = (await this.adapter.getStateAsync("pump.error"))?.val;

            let status = "AUS";
            if (error) {
                status = "FEHLER";
            } else if (active) {
                switch (mode) {
                    case "manual":
                        status = "EIN (manuell)";
                        break;
                    case "time":
                        status = "EIN (zeit)";
                        break;
                    case "auto":
                        status = "EIN (automatik)";
                        break;
                    default:
                        status = "EIN";
                        break;
                }
            }
            await this.adapter.setStateAsync("pump.status", { val: status, ack: true });
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper] Fehler beim Setzen von pump.status: ${err.message}`);
        }
    },

    async _checkErrorConditions() {
        try {
            const pumpSwitchId = (this.adapter.config.pump_switch || "").trim();
            let active = null;

            if (pumpSwitchId) {
                active = !!(await this.adapter.getForeignStateAsync(pumpSwitchId))?.val;
            } else {
                const v = (await this.adapter.getStateAsync("pump.pump_switch"))?.val;
                if (typeof v === "boolean") active = v;
            }

            const errorOld   = (await this.adapter.getStateAsync("pump.error"))?.val;
            const power      = this._parseNumber((await this.adapter.getStateAsync("pump.current_power"))?.val);
            const maxWatt    = this._parseNumber((await this.adapter.getStateAsync("pump.pump_max_watt"))?.val);

            let error = false;
            let errorMsg = "";

            if (active === true && power < 5) {
                error = true;
                errorMsg = "Fehler: Pumpe EIN, aber keine Leistung!";
            }

            if (active === false && power > 10) {
                error = true;
                errorMsg = "Fehler: Pumpe AUS, aber Leistung vorhanden!";
            }

            if (active === true && maxWatt > 0 && power > maxWatt) {
                error = true;
                errorMsg = `Überlast: ${power} W > Maximalwert ${maxWatt} W → Pumpe wird abgeschaltet!`;

                if (pumpSwitchId) {
                    await this.adapter.setForeignStateAsync(pumpSwitchId, { val: false, ack: false });
                }

                await this.adapter.setStateAsync("pump.mode", { val: "off", ack: true });
            }

            if (error !== errorOld) {
                await this.adapter.setStateAsync("pump.error", { val: error, ack: true });
                await this._updateStatus();

                if (error && errorMsg) {
                    this.adapter.log.warn(`[pumpHelper] ${errorMsg}`);
                } else if (!error && errorOld) {
                    this.adapter.log.info("[pumpHelper] Pumpenfehler behoben");
                }
            }
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper] Fehler bei Error-Check: ${err.message}`);
        }
    },

    cleanup() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = pumpHelper;

'use strict';

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
    deviceId: null, // Objekt-ID der echten Steckdose (aus Config)
    currentPowerId: null, // Fremd-State für Leistung (aus Config)
    _lastPumpStart: null, // Zeitstempel letzter Start
    _lastPumpStop: null, // Zeitstempel letzter Stopp

    init(adapter) {
        this.adapter = adapter;

        // States aus Config lesen
        this.deviceId = (adapter.config.pump_switch || '').trim() || null;
        this.currentPowerId = (adapter.config.pump_current_power_id || '').trim() || null;

        // Relevante eigenen States beobachten
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('pump.pump_switch');
        this.adapter.subscribeStates('pump.error');

        // Fremdleistung beobachten
        if (this.currentPowerId) {
            this.adapter.subscribeForeignStates(this.currentPowerId);

            // Initialwert ziehen
            this.adapter
                .getForeignStateAsync(this.currentPowerId)
                .then(s => {
                    const val = this._parseNumber(s?.val);
                    this.adapter.setStateAsync('pump.current_power', { val, ack: true });
                    this.adapter.log.debug(
                        `[pumpHelper] Überwache Leistung von ${this.currentPowerId} (Startwert: ${val})`,
                    );
                })
                .catch(() => {
                    this.adapter.log.debug(`[pumpHelper] Überwache Leistung von ${this.currentPowerId}`);
                });
        } else {
            this.adapter.log.debug('[pumpHelper] Keine Objekt-ID für aktuelle Leistung konfiguriert');
        }

        // Echte Steckdose beobachten (Status-Spiegelung)
        if (this.deviceId) {
            this.adapter.subscribeForeignStates(this.deviceId);
            this.adapter.log.debug(`[pumpHelper] Überwache Steckdose: ${this.deviceId}`);

            // NEU: Initialwert übernehmen
            this.adapter
                .getForeignStateAsync(this.deviceId)
                .then(s => {
                    if (s) {
                        const val = !!s.val;
                        this.adapter.setStateAsync('pump.pump_switch', { val, ack: true });
                        this.adapter.log.debug(`[pumpHelper] Initialer Pumpenstatus von Steckdose übernommen: ${val}`);
                    }
                })
                .catch(err =>
                    this.adapter.log.warn(`[pumpHelper] Konnte initialen Pumpenstatus nicht laden: ${err.message}`),
                );
        } else {
            this.adapter.log.debug('[pumpHelper] Keine Objekt-ID für Pumpen-Steckdose konfiguriert');
        }

        this.adapter.log.debug('[pumpHelper] initialisiert');
        // Initialer Status
        this._updateStatus().catch(err =>
            this.adapter.log.warn(`[pumpHelper] Initiales Status-Update fehlgeschlagen: ${err.message}`),
        );
    },

    // Hilfsfunktion: Zahlen robust parsen
    _parseNumber(x) {
        if (typeof x === 'number' && Number.isFinite(x)) {
            return x;
        }
        const m = String(x ?? '')
            .replace(',', '.')
            .match(/-?\d+(\.\d+)?/);
        return m ? Number(m[0]) : 0;
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // Saisonprüfung
        const season = (await this.adapter.getStateAsync('status.season_active'))?.val;
        if (!season) {
            this.adapter.log.debug(
                '[pumpHelper] Saison inaktiv – Pumpenlogik übersprungen (Frostschutz läuft separat)',
            );
            return;
        }

        // 1) Leistung aus Fremd-State spiegeln
        if (this.currentPowerId && id === this.currentPowerId) {
            const val = this._parseNumber(state.val);
            await this.adapter.setStateAsync('pump.current_power', {
                val,
                ack: true,
            });
            await this._checkErrorConditions();
            return;
        }

        // 2) Fremde Steckdose hat sich verändert → in unseren bool-Schalter spiegeln (mit Loop-Schutz)
        if (this.deviceId && id === this.deviceId) {
            const val = !!state.val;
            const current = (await this.adapter.getStateAsync('pump.pump_switch'))?.val;

            // NEU: Filter gegen zyklische Fremdmeldungen ohne echten Zustandswechsel
            if (current === val) {
                this.adapter.log.debug('[pumpHelper] Fremd-State meldet identischen Wert – ignoriert.');
                return;
            }

            if (current !== val) {
                await this.adapter.setStateAsync('pump.pump_switch', { val, ack: true });
                await this._updateStatus();
                await this._checkErrorConditions();
            }
            return;
        }

        // 3) Eigene Pumpen-States geändert (mit Loop-Schutz bei Rückschreiben)
        if (id.endsWith('pump.mode') || id.endsWith('pump.pump_switch') || id.endsWith('pump.error')) {
            if (id.endsWith('pump.pump_switch') && this.deviceId) {
                const current = (await this.adapter.getForeignStateAsync(this.deviceId))?.val;
                if (current !== !!state.val) {
                    await this.adapter.setForeignStateAsync(this.deviceId, {
                        val: !!state.val,
                        ack: false,
                    });
                }

                // Zeitstempel für Kulanzzeiten setzen
                if (state.val === true) {
                    this._lastPumpStart = Date.now();
                } else {
                    this._lastPumpStop = Date.now();
                }
            }

            await this._updateStatus();
            await this._checkErrorConditions();
            return;
        }
    },

    async _updateStatus() {
        try {
            const mode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'unknown';
            const active = (await this.adapter.getStateAsync('pump.pump_switch'))?.val;
            const error = (await this.adapter.getStateAsync('pump.error'))?.val;

            let status = 'AUS';
            if (error) {
                status = 'FEHLER';
            } else if (active) {
                switch (mode) {
                    case 'manual':
                        status = 'EIN (manuell)';
                        break;
                    case 'time':
                        status = 'EIN (zeit)';
                        break;
                    case 'auto':
                        status = 'EIN (automatik)';
                        break;
                    case 'controlHelper':
                        try {
                            const reason = (await this.adapter.getStateAsync('pump.reason'))?.val || '';
                            status = reason ? `EIN (${reason})` : 'EIN (Systemsteuerung)';
                        } catch {
                            status = 'EIN (Systemsteuerung)';
                        }
                        break;
                    case 'speechTextHelper':
                        try {
                            const reason = (await this.adapter.getStateAsync('pump.reason'))?.val || '';
                            status = reason ? `EIN (${reason})` : 'EIN (Sprachsteuerung)';
                        } catch {
                            status = 'EIN (Sprachsteuerung)';
                        }
                        break;
                    default:
                        status = 'EIN';
                        break;
                    case 'frostHelper':
                        try {
                            const reason = (await this.adapter.getStateAsync('pump.reason'))?.val || '';
                            status = reason ? `EIN (${reason})` : 'EIN (Frostschutz)';
                        } catch {
                            status = 'EIN (Frostschutz)';
                        }
                        break;

                    case 'timeHelper':
                        try {
                            const reason = (await this.adapter.getStateAsync('pump.reason'))?.val || '';
                            status = reason ? `EIN (${reason})` : 'EIN (Zeitsteuerung)';
                        } catch {
                            status = 'EIN (Zeitsteuerung)';
                        }
                        break;

                    case 'heatHelper':
                        try {
                            const reason = (await this.adapter.getStateAsync('pump.reason'))?.val || '';
                            status = reason ? `EIN (${reason})` : 'EIN (Heizung)';
                        } catch {
                            status = 'EIN (Heizung)';
                        }
                        break;
                }
            }
            await this.adapter.setStateChangedAsync('pump.status', {
                val: status,
                ack: true,
            });
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper] Fehler beim Setzen von pump.status: ${err.message}`);
        }
    },

    async _checkErrorConditions() {
        try {
            const pumpSwitchId = (this.adapter.config.pump_switch || '').trim();
            let active = null;

            if (pumpSwitchId) {
                active = !!(await this.adapter.getForeignStateAsync(pumpSwitchId))?.val;
            } else {
                const v = (await this.adapter.getStateAsync('pump.pump_switch'))?.val;
                if (typeof v === 'boolean') {
                    active = v;
                }
            }

            const errorOld = (await this.adapter.getStateAsync('pump.error'))?.val;
            const power = this._parseNumber((await this.adapter.getStateAsync('pump.current_power'))?.val);
            const maxWatt = this._parseNumber((await this.adapter.getStateAsync('pump.pump_max_watt'))?.val);

            // --- NEU: Kulanzzeiten für Start/Stop ---
            const graceOnMs = 5000; // 5 Sekunden nach Start ignorieren
            const graceOffMs = 5000; // 5 Sekunden nach Stop ignorieren
            const now = Date.now();

            if (active === true && this._lastPumpStart && now - this._lastPumpStart < graceOnMs) {
                this.adapter.log.debug('[pumpHelper] Innerhalb der Start-Kulanzzeit – Fehlerprüfung übersprungen');
                return;
            }

            if (active === false && this._lastPumpStop && now - this._lastPumpStop < graceOffMs) {
                this.adapter.log.debug('[pumpHelper] Innerhalb der Stopp-Kulanzzeit – Fehlerprüfung übersprungen');
                return;
            }
            // --- Ende Kulanzzeiten ---

            let error = false;
            let errorMsg = '';

            // Pumpe EIN, aber keine Leistung
            if (active === true && power < 5) {
                error = true;
                errorMsg = 'Fehler: Pumpe EIN, aber keine Leistung!';
            }

            // Pumpe AUS, aber Leistung vorhanden
            if (active === false && power > 10) {
                error = true;
                errorMsg = 'Fehler: Pumpe AUS, aber Leistung vorhanden!';
            }

            // --- Überlastschutz (mit fester 10%-Toleranz) ---
            if (active === true && maxWatt > 0) {
                const overloadTolerance = 1.1; // 10 % Sicherheitsfenster
                const overloadLimit = maxWatt * overloadTolerance;

                if (power > overloadLimit) {
                    error = true;
                    errorMsg = `Überlast: ${power.toFixed(1)} W > Sicherheitsgrenze ${overloadLimit.toFixed(
                        1,
                    )} W (Maxwert ${maxWatt} W) → Pumpe wird abgeschaltet!`;

                    if (pumpSwitchId) {
                        await this.adapter.setForeignStateAsync(pumpSwitchId, {
                            val: false,
                            ack: false,
                        });
                    }

                    await this.adapter.setStateAsync('pump.mode', {
                        val: 'off',
                        ack: true,
                    });
                }
            }

            if (error !== errorOld) {
                await this.adapter.setStateAsync('pump.error', {
                    val: error,
                    ack: true,
                });
                await this._updateStatus();

                if (error && errorMsg) {
                    this.adapter.log.warn(`[pumpHelper] ${errorMsg}`);
                } else if (!error && errorOld) {
                    this.adapter.log.info('[pumpHelper] Pumpenfehler behoben');
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

'use strict';

/**
 * frostHelper
 * - Prüft Außentemperatur gegen Frostschutz-Grenze
 * - Frostschutz arbeitet unabhängig von der Poolsaison
 * - OFF, Wartung und die optionale Manual-Safety-Freigabe begrenzen Pumpenstarts
 * - Kleine Hysterese: +2°C zum Ausschalten
 * - Schaltet über den zentralen Bool-State pump.pump_switch
 */

const frostHelper = /** @satisfies {import('../types/poolcontrol-adapter').FrostHelper} */ ({
    _adapter: null,
    _active: false,
    checkTimer: null,

    // NEU: interner Zwischenspeicher für den vorherigen Modus, um nach Frost sauber zurückzuspringen
    _prevModeBeforeFrost: null, // ENDE NEU

    /**
     * Liefert die initialisierte ioBroker-Adapterinstanz.
     *
     * @returns Initialisierte Adapterinstanz.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('frostHelper used before init()');
        }

        return this._adapter;
    },

    init(adapter) {
        this._adapter = adapter;
        this._active = true;

        this.adapter.subscribeStates('pump.frost_protection_active');
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('pump.manual_safety_enabled');
        this.adapter.subscribeStates('control.pump.maintenance_active');
        this.adapter.subscribeStates('status.season_active');

        // Minütlicher Check
        this._scheduleCheck();

        this.adapter.log.debug('[frostHelper] initialized (check every 60s)');
    },

    _scheduleCheck() {
        if (!this._active) {
            return;
        }

        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
        }
        this.checkTimer = this.adapter.setInterval(() => {
            if (this._active) {
                return this._checkFrost();
            }
        }, 60 * 1000);
        // Beim Start sofort prüfen
        this._checkFrost();
    },

    async handleStateChange(id, state) {
        if (!this._active || !state) {
            return;
        }

        const relevantStates = [
            'pump.frost_protection_active',
            'pump.mode',
            'pump.manual_safety_enabled',
            'control.pump.maintenance_active',
            'status.season_active',
        ];

        if (relevantStates.some(stateId => id.endsWith(stateId))) {
            await this._checkFrost();
        }
    },

    async _checkFrost() {
        if (!this._active) {
            return;
        }

        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            if (!this._active) {
                return;
            }
            const ownsPump = activeHelper === 'frostHelper';
            const currentMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'auto';
            if (!this._active) {
                return;
            }
            const maintenanceActive = !!(await this.adapter.getStateAsync('control.pump.maintenance_active'))?.val;
            if (!this._active) {
                return;
            }
            const manualSafetyEnabled = !!(await this.adapter.getStateAsync('pump.manual_safety_enabled'))?.val;
            if (!this._active) {
                return;
            }

            // Frostschutz aktiviert?
            const frostActive = (await this.adapter.getStateAsync('pump.frost_protection_active'))?.val;
            if (!this._active) {
                return;
            }
            if (!frostActive) {
                await this._stopFrostIfOwned('frost_protection_disabled');
                return;
            }

            // Grenztemperatur laden
            const frostTemp = (await this.adapter.getStateAsync('pump.frost_protection_temp'))?.val;
            if (!this._active) {
                return;
            }
            if (frostTemp == null) {
                return;
            }

            // Außentemperatur laden
            const outside = (await this.adapter.getStateAsync('temperature.outside.current'))?.val;
            if (!this._active) {
                return;
            }
            if (outside == null) {
                this.adapter.log.debug('[frostHelper] No outside temperature available');
                return;
            }

            // Aktueller Pumpenzustand (zentraler Bool)
            const pumpActive = (await this.adapter.getStateAsync('pump.pump_switch'))?.val;
            if (!this._active) {
                return;
            }
            let shouldRun = pumpActive;

            // FIX: Stabilere Logik mit fester Hysterese von +2 °C und Ganzzahl-Rundung
            const outsideRounded = Math.round(Number(outside));
            const frostTempRounded = Math.round(Number(frostTemp));

            // Einschalten bei <= frostTempRounded
            // Ausschalten erst bei >= frostTempRounded + 2 (2 K Hysterese)
            if (outsideRounded <= frostTempRounded) {
                shouldRun = true;
            } else if (outsideRounded >= frostTempRounded + 2) {
                shouldRun = false;
            }

            // FIX: Sprachsignal nur nach echter Frostlogik setzen, nicht nach aktuellem Pumpenzustand
            const frostNowActive = outsideRounded <= frostTempRounded;
            const oldVal = (await this.adapter.getStateAsync('speech.frost_active'))?.val;
            if (!this._active) {
                return;
            }
            if (oldVal !== frostNowActive) {
                await this.adapter.setStateChangedAsync('speech.frost_active', {
                    val: frostNowActive,
                    ack: true,
                });
                if (!this._active) {
                    return;
                }
            }

            if (ownsPump && currentMode !== 'frostHelper' && currentMode !== 'off') {
                this._prevModeBeforeFrost = currentMode;
            }

            const policyMode = ownsPump && currentMode === 'frostHelper' ? this._prevModeBeforeFrost : currentMode;
            const blockedByPolicy =
                currentMode === 'off' || maintenanceActive || (policyMode === 'manual' && !manualSafetyEnabled);

            if (blockedByPolicy) {
                await this._stopFrostIfOwned('safety_policy_blocked');
                return;
            }

            if (activeHelper && !ownsPump) {
                this.adapter.log.debug(
                    `[frostHelper] Frost pump request blocked because '${activeHelper}' currently owns the pump.`,
                );
                this._prevModeBeforeFrost = null;
                return;
            }

            // Schalten nur, wenn sich etwas ändert
            if (shouldRun !== pumpActive) {
                // NEU: Beim Einschalten Modus/Helper setzen und vorherigen Modus merken
                if (shouldRun) {
                    // Nur merken, wenn wir nicht bereits im Frostmodus sind
                    if (this._prevModeBeforeFrost == null) {
                        this._prevModeBeforeFrost = currentMode;
                    }

                    // Frost als aktiven Helper/Modus setzen (damit der pumpHelper "EIN (Frostschutz)" anzeigt)
                    await this.adapter.setStateAsync('pump.active_helper', { val: 'frostHelper', ack: true });
                    if (!this._active) {
                        return;
                    }
                    await this.adapter.setStateAsync('pump.mode', { val: 'frostHelper', ack: true });
                    if (!this._active) {
                        return;
                    }

                    await this.adapter.setStateAsync('pump.pump_switch', {
                        val: true,
                        ack: false,
                    });
                    if (!this._active) {
                        return;
                    }
                    this.adapter.log.info(
                        `[frostHelper] Frost protection -> pump ON (outside=${outside}°C, limit=${frostTemp}°C)`,
                    );
                } else {
                    await this._stopFrostIfOwned('temperature_recovered');
                }
                // ENDE NEU
            } else if (shouldRun && ownsPump && currentMode !== 'frostHelper') {
                if (!this._active) {
                    return;
                }
                await this.adapter.setStateAsync('pump.mode', { val: 'frostHelper', ack: true });
            }
        } catch (err) {
            this.adapter.log.warn(`[frostHelper] Error in check: ${err.message}`);
        }
    },

    async _stopFrostIfOwned(reason) {
        if (!this._active) {
            return;
        }

        const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
        if (!this._active) {
            return;
        }
        if (activeHelper !== 'frostHelper') {
            return;
        }

        const currentMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'auto';
        if (!this._active) {
            return;
        }
        const modeToRestore = currentMode === 'off' ? 'off' : this._prevModeBeforeFrost || 'auto';

        await this.adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
        if (!this._active) {
            return;
        }

        const activeHelperNow = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
        if (!this._active) {
            return;
        }
        if (activeHelperNow === 'frostHelper') {
            await this.adapter.setStateAsync('pump.mode', { val: modeToRestore, ack: true });
            if (!this._active) {
                return;
            }
            await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
            if (!this._active) {
                return;
            }
        }

        this._prevModeBeforeFrost = null;
        this.adapter.log.info(`[frostHelper] Frost protection -> pump OFF (${reason})`);
    },

    cleanup() {
        this._active = false;

        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
});

module.exports = frostHelper;

'use strict';

/**
 * frostHelper
 * - Prüft Außentemperatur gegen Frostschutz-Grenze
 * - Frostschutz arbeitet unabhängig vom Pumpenmodus
 * -(Sicherheitsfunktion: greift immer, wenn frost_protection_active = true)
 * - Kleine Hysterese: +2°C zum Ausschalten
 * - Schaltet über den zentralen Bool-State pump.pump_switch
 */

const frostHelper = {
    adapter: null,
    checkTimer: null,

    // NEU: interner Zwischenspeicher für den vorherigen Modus, um nach Frost sauber zurückzuspringen
    _prevModeBeforeFrost: null, // ENDE NEU

    init(adapter) {
        this.adapter = adapter;

        // Minütlicher Check
        this._scheduleCheck();

        this.adapter.log.debug('[frostHelper] initialisiert (Prüfung alle 60s)');
    },

    _scheduleCheck() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
        }
        this.checkTimer = setInterval(() => this._checkFrost(), 60 * 1000);
        // Beim Start sofort prüfen
        this._checkFrost();
    },

    async _checkFrost() {
        try {
            // --- NEU: Vorrangprüfung durch ControlHelper ---
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            if (activeHelper === 'controlHelper') {
                this.adapter.log.debug('[frostHelper] Vorrang durch ControlHelper aktiv – Frostschutz pausiert.');
                return;
            }

            // --- NEU: Vorrangprüfung durch TimeHelper ---
            if (activeHelper === 'timeHelper') {
                this.adapter.log.debug('[frostHelper] Vorrang durch TimeHelper aktiv – Frostschutz pausiert.');
                return;
            }

            // Frostschutz aktiviert?
            const frostActive = (await this.adapter.getStateAsync('pump.frost_protection_active'))?.val;
            if (!frostActive) {
                return;
            }

            // Grenztemperatur laden
            const frostTemp = (await this.adapter.getStateAsync('pump.frost_protection_temp'))?.val;
            if (frostTemp == null) {
                return;
            }

            // Außentemperatur laden
            const outside = (await this.adapter.getStateAsync('temperature.outside.current'))?.val;
            if (outside == null) {
                this.adapter.log.debug('[frostHelper] Keine Außentemperatur verfügbar');
                return;
            }

            // Aktueller Pumpenzustand (zentraler Bool)
            const pumpActive = (await this.adapter.getStateAsync('pump.pump_switch'))?.val;
            let shouldRun = pumpActive;

            // FIX: Stabilere Logik mit fester Hysterese von +2 °C und Ganzzahl-Rundung
            const outsideRounded = Math.round(outside);
            const frostTempRounded = Math.round(frostTemp);

            // Einschalten bei <= frostTempRounded
            // Ausschalten erst bei >= frostTempRounded + 2 (2 K Hysterese)
            if (outsideRounded <= frostTempRounded) {
                shouldRun = true;
            } else if (outsideRounded >= frostTempRounded + 2) {
                shouldRun = false;
            }

            // --- NEU: Sprachsignal für Frostschutz setzen ---
            const oldVal = (await this.adapter.getStateAsync('speech.frost_active'))?.val;
            if (oldVal !== shouldRun) {
                await this.adapter.setStateChangedAsync('speech.frost_active', {
                    val: shouldRun,
                    ack: true,
                });
            }

            // Schalten nur, wenn sich etwas ändert
            if (shouldRun !== pumpActive) {
                // NEU: Beim Einschalten Modus/Helper setzen und vorherigen Modus merken
                if (shouldRun) {
                    // Nur merken, wenn wir nicht bereits im Frostmodus sind
                    const currentMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'auto';
                    if (this._prevModeBeforeFrost == null) {
                        this._prevModeBeforeFrost = currentMode;
                    }

                    // Frost als aktiven Helper/Modus setzen (damit der pumpHelper "EIN (Frostschutz)" anzeigt)
                    await this.adapter.setStateAsync('pump.active_helper', { val: 'frostHelper', ack: true });
                    await this.adapter.setStateAsync('pump.mode', { val: 'frostHelper', ack: true });
                } else {
                    // Ausschalten: Nur zurücksetzen, wenn der Frosthelfer wirklich aktiv war
                    const activeHelperNow = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
                    if (activeHelperNow === 'frostHelper') {
                        const modeToRestore = this._prevModeBeforeFrost || 'auto';
                        await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                        await this.adapter.setStateAsync('pump.mode', { val: modeToRestore, ack: true });
                    }
                    // internen Zwischenspeicher nach Ende löschen
                    this._prevModeBeforeFrost = null;
                }
                // ENDE NEU

                await this.adapter.setStateAsync('pump.pump_switch', {
                    val: shouldRun,
                    ack: false,
                });
                this.adapter.log.debug(
                    `[frostHelper] Frostschutz → Pumpe ${shouldRun ? 'EIN' : 'AUS'} (Außen=${outside}°C, Grenze=${frostTemp}°C)`,
                );
            }
        } catch (err) {
            this.adapter.log.warn(`[frostHelper] Fehler im Check: ${err.message}`);
        }
    },

    cleanup() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = frostHelper;

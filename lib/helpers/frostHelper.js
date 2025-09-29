'use strict';

/**
 * frostHelper
 * - Prüft Außentemperatur gegen Frostschutz-Grenze
 * - Schaltet Pumpe bei Frost ein (nur im Modus "auto")
 * - Kleine Hysterese: +1°C zum Ausschalten
 * - Schaltet über den zentralen Bool-State pump.pump_switch
 */

const frostHelper = {
    adapter: null,
    checkTimer: null,

    init(adapter) {
        this.adapter = adapter;

        // Minütlicher Check
        this._scheduleCheck();

        this.adapter.log.info('[frostHelper] initialisiert (Prüfung alle 60s)');
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
            // Nur aktiv im AUTO-Modus
            const mode = (await this.adapter.getStateAsync('pump.mode'))?.val;
            if (mode !== 'auto') {
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

            // Logik: einschalten bei <= frostTemp, ausschalten bei >= frostTemp+1
            if (outside <= frostTemp) {
                shouldRun = true;
            } else if (outside >= frostTemp + 1) {
                shouldRun = false;
            }

            // Schalten nur, wenn sich etwas ändert
            if (shouldRun !== pumpActive) {
                await this.adapter.setStateAsync('pump.pump_switch', {
                    val: shouldRun,
                    ack: false,
                });
                this.adapter.log.info(
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

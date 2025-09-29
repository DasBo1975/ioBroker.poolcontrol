'use strict';

/**
 * solarHelper
 * - Prüft Kollektor-Temperaturen und schaltet Pumpe entsprechend
 * - Nutzt States aus solarStates.js und temperatureStates.js
 * - Setzt Warnung bei Übertemperatur (mit automatischer Rücksetzung bei 10 % darunter)
 * - Schaltet über den zentralen Bool-State pump.pump_switch
 */

const solarHelper = {
    adapter: null,
    checkTimer: null,

    init(adapter) {
        this.adapter = adapter;

        // Minütlicher Check
        this._scheduleCheck();

        this.adapter.log.info('[solarHelper] initialisiert (Prüfung alle 60s)');
    },

    _scheduleCheck() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
        }
        this.checkTimer = setInterval(() => this._checkSolar(), 60 * 1000);
        // Beim Start sofort prüfen
        this._checkSolar();
    },

    async _checkSolar() {
        try {
            // Solarsteuerung aktiv?
            const active = (await this.adapter.getStateAsync('solar.solar_control_active'))?.val;
            if (!active) {
                return;
            }

            // Pumpenmodus muss AUTO sein
            const mode = (await this.adapter.getStateAsync('pump.mode'))?.val;
            if (mode !== 'auto') {
                return;
            }

            // Grenzwerte laden
            const tempOn = (await this.adapter.getStateAsync('solar.temp_on'))?.val;
            const tempOff = (await this.adapter.getStateAsync('solar.temp_off'))?.val;
            const hysteresis = (await this.adapter.getStateAsync('solar.hysteresis_active'))?.val;

            // Temperaturen laden
            const collector = (await this.adapter.getStateAsync('temperature.collector.current'))?.val;
            const pool = (await this.adapter.getStateAsync('temperature.surface.current'))?.val; // Oberfläche = Pooltemp

            if (collector == null || pool == null) {
                this.adapter.log.debug('[solarHelper] Keine gültigen Temperaturen verfügbar');
                return;
            }

            let shouldRun = false;
            const delta = collector - pool;

            // Logik: Einschalten, wenn Collector > tempOn und Delta > 0
            if (collector >= tempOn && delta > 0) {
                shouldRun = true;
            }

            // Ausschalten, wenn Collector < tempOff oder Delta <= 0
            if (collector <= tempOff || delta <= 0) {
                shouldRun = false;
            }

            // Optional Hysterese (kann später erweitert werden)
            if (hysteresis) {
                // z. B. Ausschaltgrenze etwas absenken
            }

            // ZENTRAL: Pumpe über Bool-Schalter setzen
            await this.adapter.setStateAsync('pump.pump_switch', {
                val: shouldRun,
                ack: false,
            });
            this.adapter.log.debug(
                `[solarHelper] Solarregelung → Pumpe ${shouldRun ? 'EIN' : 'AUS'} (Collector=${collector}°C, Pool=${pool}°C, Delta=${delta}°C)`,
            );

            // --- Kollektor-Warnung ---
            const warnActive = (await this.adapter.getStateAsync('solar.warn_active'))?.val;
            if (warnActive) {
                const warnTemp = Number((await this.adapter.getStateAsync('solar.warn_temp'))?.val) || 0;
                const speechEnabled = (await this.adapter.getStateAsync('solar.warn_speech'))?.val;
                const currentWarning = (await this.adapter.getStateAsync('solar.collector_warning'))?.val || false;

                // Neue Warnung, wenn Collector >= warnTemp
                if (collector >= warnTemp && !currentWarning) {
                    await this.adapter.setStateAsync('solar.collector_warning', {
                        val: true,
                        ack: true,
                    });
                    this.adapter.log.warn(
                        `[solarHelper] WARNUNG: Kollektortemperatur ${collector}°C >= ${warnTemp}°C!`,
                    );

                    // Sprachausgabe bei Aktivierung
                    if (speechEnabled) {
                        await this.adapter.setStateAsync('speech.last_text', {
                            val: `Warnung: Kollektortemperatur ${collector} Grad erreicht.`,
                            ack: true,
                        });
                    }
                }

                // Warnung zurücksetzen, wenn Collector <= 90 % von warnTemp
                if (collector <= warnTemp * 0.9 && currentWarning) {
                    await this.adapter.setStateAsync('solar.collector_warning', {
                        val: false,
                        ack: true,
                    });
                    this.adapter.log.info(
                        `[solarHelper] Kollektorwarnung zurückgesetzt: ${collector}°C <= ${warnTemp * 0.9}°C`,
                    );
                }
            }
        } catch (err) {
            this.adapter.log.warn(`[solarHelper] Fehler im Check: ${err.message}`);
        }
    },

    cleanup() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = solarHelper;

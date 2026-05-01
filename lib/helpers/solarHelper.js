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

        this.adapter.log.debug('[solarHelper] Initialized (check every 60s)');
    },

    _scheduleCheck() {
        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
        }
        this.checkTimer = this.adapter.setInterval(() => this._checkSolar(), 60 * 1000);
        // Beim Start sofort prüfen
        void this._checkSolar();
    },

    async _checkSolar() {
        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            const isExternalPriority = activeHelper === 'controlHelper' || activeHelper === 'timeHelper';

            // --- NEU: Vorrangprüfung durch ControlHelper ---
            if (activeHelper === 'controlHelper') {
                await this.adapter.setStateChangedAsync('solar.request_active', {
                    val: false,
                    ack: true,
                });
                this.adapter.log.debug('[solarHelper] Priority by ControlHelper active – solar control paused.');
            }

            // --- NEU: Vorrangprüfung durch TimeHelper ---
            if (activeHelper === 'timeHelper') {
                await this.adapter.setStateChangedAsync('solar.request_active', {
                    val: false,
                    ack: true,
                });
                this.adapter.log.debug('[solarHelper] Priority by TimeHelper active – solar control paused.');
            }

            // --- NEU: Saisonstatus ---
            const season = (await this.adapter.getStateAsync('status.season_active'))?.val;

            // Solarsteuerung aktiv?
            const active = (await this.adapter.getStateAsync('solar.solar_control_active'))?.val;

            // NEU: Solarsteuerungsmodus
            const controlMode = (await this.adapter.getStateAsync('solar.control_mode'))?.val || 'standard';

            // Pumpenmodus
            const mode = (await this.adapter.getStateAsync('pump.mode'))?.val;

            // Grenzwerte laden
            const tempOn = (await this.adapter.getStateAsync('solar.temp_on'))?.val;
            const tempOff = (await this.adapter.getStateAsync('solar.temp_off'))?.val;
            const hysteresis = (await this.adapter.getStateAsync('solar.hysteresis_active'))?.val;

            // Temperaturen laden
            const collector = Number((await this.adapter.getStateAsync('temperature.collector.current'))?.val);
            const pool = Number((await this.adapter.getStateAsync('temperature.surface.current'))?.val); // Oberfläche = Pooltemp

            // NEU: Absicherung gegen ungültige Werte
            if (isNaN(collector) || isNaN(pool)) {
                await this.adapter.setStateChangedAsync('solar.request_active', {
                    val: false,
                    ack: true,
                });
                this.adapter.log.debug('[solarHelper] No valid temperatures available');
                return;
            }

            // NEU: Standard-Solar nur ausführen, wenn control_mode = standard
            const isStandardMode = controlMode === 'standard';

            if (!isStandardMode) {
                await this.adapter.setStateChangedAsync('solar.request_active', {
                    val: false,
                    ack: true,
                });
                this.adapter.log.debug(
                    `[solarHelper] Standard solar paused because solar.control_mode = ${controlMode}`,
                );
            }

            // --- Schaltlogik nur ausführen, wenn Saison aktiv, Solar aktiv und Modus AUTO ---
            if (season && active && mode === 'auto' && isStandardMode && !isExternalPriority) {
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

                // --- NEU: Sprachvariable für Solarsteuerung setzen ---
                const oldVal = (await this.adapter.getStateAsync('speech.solar_active'))?.val;
                if (oldVal !== shouldRun) {
                    await this.adapter.setStateChangedAsync('speech.solar_active', {
                        val: shouldRun,
                        ack: true,
                    });
                }
                await this.adapter.setStateChangedAsync('solar.request_active', {
                    val: shouldRun,
                    ack: true,
                });

                // ZENTRAL: Pumpe über Bool-Schalter setzen
                if (shouldRun) {
                    await this._setActiveHelperIfAllowed('solarHelper');
                } else {
                    await this._releaseActiveHelperIfOwned();
                }

                await this.adapter.setStateChangedAsync('pump.pump_switch', {
                    val: shouldRun,
                    ack: false,
                });

                this.adapter.log.debug(
                    `[solarHelper] Solar control → pump ${shouldRun ? 'ON' : 'OFF'} (Collector=${collector}°C, Pool=${pool}°C, Delta=${delta}°C)`,
                );
            } else {
                await this.adapter.setStateChangedAsync('solar.request_active', {
                    val: false,
                    ack: true,
                });

                await this._releaseActiveHelperIfOwned();

                // Keine Schaltung – Grund protokollieren
                const reason = !season
                    ? 'Saison inaktiv'
                    : !active
                      ? 'Solarsteuerung aus'
                      : !isStandardMode
                        ? `Solarmodus = ${controlMode}`
                        : isExternalPriority
                          ? `Vorrang durch ${activeHelper}`
                          : mode !== 'auto'
                            ? 'Pumpenmodus != auto'
                            : 'unbekannt';
                this.adapter.log.debug(`[solarHelper] Solar control skipped (${reason})`);
            }

            // --- Kollektor-Warnung ---
            const warnActive = (await this.adapter.getStateAsync('solar.warn_active'))?.val;
            if (warnActive) {
                const warnTemp = Number((await this.adapter.getStateAsync('solar.warn_temp'))?.val) || 0;

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const speechEnabled = (await this.adapter.getStateAsync('solar.warn_speech'))?.val;

                const currentWarning = (await this.adapter.getStateAsync('solar.collector_warning'))?.val || false;

                // Neue Warnung, wenn Collector >= warnTemp
                if (collector >= warnTemp && !currentWarning) {
                    await this.adapter.setStateAsync('solar.collector_warning', {
                        val: true,
                        ack: true,
                    });
                    this.adapter.log.warn(
                        `[solarHelper] WARNING: Collector temperature ${collector}°C >= ${warnTemp}°C!`,
                    );

                    /*
                     * Deaktiviert, ersetzt durch SpeechTextHelper
                     *
                     * // Sprachausgabe bei Aktivierung
                     * if (speechEnabled) {
                     *    await this.adapter.setStateAsync('speech.last_text', {
                     *        val: `Warnung: Kollektortemperatur ${collector} Grad erreicht.`,
                     *        ack: true,
                     *     });
                     * }
                     */
                }

                // Warnung zurücksetzen, wenn Collector <= 90 % von warnTemp
                if (collector <= warnTemp * 0.9 && currentWarning) {
                    await this.adapter.setStateAsync('solar.collector_warning', {
                        val: false,
                        ack: true,
                    });
                    this.adapter.log.debug(
                        `[solarHelper] Collector warning reset: ${collector}°C <= ${warnTemp * 0.9}°C`,
                    );
                }
            }
        } catch (err) {
            this.adapter.log.warn(`[solarHelper] Error in check: ${err.message}`);
        }
    },

    async _setActiveHelperIfAllowed(helperName) {
        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';

            if (activeHelper && activeHelper !== helperName) {
                this.adapter.log.debug(
                    `[solarHelper] Active helper not changed because '${activeHelper}' currently owns the pump.`,
                );
                return;
            }

            await this.adapter.setStateAsync('pump.active_helper', { val: helperName, ack: true });
        } catch (err) {
            this.adapter.log.warn(`[solarHelper] Could not set pump.active_helper: ${err.message}`);
        }
    },

    async _releaseActiveHelperIfOwned() {
        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';

            if (activeHelper !== 'solarHelper') {
                return;
            }

            await this.adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
        } catch (err) {
            this.adapter.log.warn(`[solarHelper] Could not release pump.active_helper: ${err.message}`);
        }
    },

    cleanup() {
        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = solarHelper;

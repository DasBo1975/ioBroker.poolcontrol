'use strict';

/**
 * pumpHelper4.js
 * ----------------------------------------------------------
 * Drucksensor-Logik für Pumpenbereich
 *
 * Verarbeitet:
 *   - pump.pressure.current_bar
 *   - pump.pressure.previous_bar
 *   - pump.pressure.status_text
 *   - pump.pressure.last_update
 *
 * Liest:
 *   - Objekt-ID des Drucksensors aus jsonConfig
 *
 * Version: 1.0.0
 */

const pumpHelper4 = {
    adapter: null,
    pressureObjectId: null,

    /**
     * Initialisiert den Helper
     *
     * @param {ioBroker.Adapter} adapter – aktive Adapterinstanz
     */
    async init(adapter) {
        this.adapter = adapter;

        this.pressureObjectId = adapter.config.pressure_sensor_oid || '';
        adapter.log.info(`[pumpHelper4] Initialisierung gestartet (OID: ${this.pressureObjectId || 'nicht gesetzt'})`);

        if (!this.pressureObjectId) {
            adapter.log.info('[pumpHelper4] Kein Drucksensor in der Instanzkonfiguration angegeben.');
            return;
        }

        // Drucksensor abonnieren
        adapter.subscribeForeignStates(this.pressureObjectId);

        adapter.log.info('[pumpHelper4] Erfolgreich initialisiert');

        // Benutzerdefinierte Normaldruck-Werte einmalig laden
        this.adapter.getStateAsync('pump.pressure.normal_min_bar').then(s => {
            this.lastMin = Number(s?.val) || 0.2;
        });
        this.adapter.getStateAsync('pump.pressure.normal_max_bar').then(s => {
            this.lastMax = Number(s?.val) || 0.8;
        });
    },

    /**
     * Verarbeitet alle relevanten State-Änderungen
     *
     * @param {string} id - Objekt-ID
     * @param {ioBroker.State} state - Neuer Wert
     */
    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // ------------------------------------------
        // Manueller Reset des Lernsystems
        // ------------------------------------------
        if (id === 'poolcontrol.0.pump.pressure.learning.reset' && state.val === true) {
            const current = await this._getNumber('pump.pressure.current_bar');

            // Lernwerte zurücksetzen
            await this.adapter.setStateAsync('pump.pressure.learning.learned_min_bar', { val: current, ack: true });
            await this.adapter.setStateAsync('pump.pressure.learning.learned_max_bar', { val: current, ack: true });
            await this.adapter.setStateAsync('pump.pressure.learning.avg_bar', { val: current, ack: true });
            await this.adapter.setStateAsync('pump.pressure.learning.trend_rising', { val: 0, ack: true });
            await this.adapter.setStateAsync('pump.pressure.learning.trend_falling', { val: 0, ack: true });
            await this.adapter.setStateAsync('pump.pressure.learning.trend_stability', { val: 0, ack: true });

            // Diagnose-Text
            await this.adapter.setStateAsync('pump.pressure.status_text_diagnostic', {
                val: 'Lernsystem zurückgesetzt',
                ack: true,
            });

            // Reset-Button zurücksetzen
            await this.adapter.setStateAsync('pump.pressure.learning.reset', {
                val: false,
                ack: true,
            });

            return; // WICHTIG: nichts weiter tun
        }

        // ------------------------------------------
        // Live-Update der Min/Max-Werte
        // ------------------------------------------
        if (id === 'poolcontrol.0.pump.pressure.normal_min_bar') {
            this.lastMin = Number(state.val) || 0.2;
            this.adapter.log.debug(`[pumpHelper4] Neuer Minimaldruck übernommen: ${this.lastMin} bar`);
            return;
        }

        if (id === 'poolcontrol.0.pump.pressure.normal_max_bar') {
            this.lastMax = Number(state.val) || 0.8;
            this.adapter.log.debug(`[pumpHelper4] Neuer Maximaldruck übernommen: ${this.lastMax} bar`);
            return;
        }

        // Nicht der Drucksensor? Dann raus.
        if (id !== this.pressureObjectId) {
            return;
        }

        try {
            const newBar = Number(state.val);

            if (isNaN(newBar)) {
                this.adapter.log.warn(`[pumpHelper4] Ungültiger Druckwert empfangen: ${state.val}`);
                return;
            }

            // ------------------------------------------
            // NEU: Pumpenschalter prüfen
            // ------------------------------------------
            const pumpSwitch = await this.adapter.getStateAsync('pump.pump_switch');
            const pumpIsOn = !!pumpSwitch?.val;

            // Zeitstempel immer setzen
            const now = new Date().toISOString();

            // Wenn Pumpe AUS → Status setzen und raus
            if (!pumpIsOn) {
                await this.adapter.setStateAsync('pump.pressure.status_text', {
                    val: 'Pumpe aus – kein Filterdruck',
                    ack: true,
                });

                // trotzdem current_bar und last_update aktualisieren
                await this.adapter.setStateAsync('pump.pressure.current_bar', {
                    val: newBar,
                    ack: true,
                });

                await this.adapter.setStateAsync('pump.pressure.last_update', {
                    val: now,
                    ack: true,
                });

                return;
            }

            // Alten Wert lesen
            const previous = await this._getNumber('pump.pressure.current_bar');

            // previous_bar nur updaten, wenn alter Wert > 0
            if (previous > 0) {
                await this.adapter.setStateAsync('pump.pressure.previous_bar', {
                    val: previous,
                    ack: true,
                });
            }

            // ------------------------------------------
            // Trend-Erkennung
            // ------------------------------------------
            let rising = 0;
            let falling = 0;
            let stability = 0;

            const diff = newBar - previous;

            // Steigend
            if (diff > 0.01) {
                rising = Number(diff.toFixed(3));
            }

            // Fallend
            if (diff < -0.01) {
                falling = Number(Math.abs(diff).toFixed(3));
            }

            // Stabil
            if (Math.abs(diff) <= 0.01) {
                stability = 1;
            }

            // Werte setzen
            await this.adapter.setStateAsync('pump.pressure.learning.trend_rising', {
                val: rising,
                ack: true,
            });

            await this.adapter.setStateAsync('pump.pressure.learning.trend_falling', {
                val: falling,
                ack: true,
            });

            await this.adapter.setStateAsync('pump.pressure.learning.trend_stability', {
                val: stability,
                ack: true,
            });

            // current_bar aktualisieren
            await this.adapter.setStateAsync('pump.pressure.current_bar', {
                val: newBar,
                ack: true,
            });

            // ------------------------------------------
            // Gleitender Druckdurchschnitt
            // ------------------------------------------
            const oldAvg = await this._getNumber('pump.pressure.learning.avg_bar');
            const newAvg = oldAvg === 0 ? newBar : oldAvg * 0.9 + newBar * 0.1;

            await this.adapter.setStateAsync('pump.pressure.learning.avg_bar', {
                val: Number(newAvg.toFixed(3)),
                ack: true,
            });

            // ------------------------------------------
            // Learning MIN/MAX (autoadaptiv)
            // ------------------------------------------
            const learnedMin = await this._getNumber('pump.pressure.learning.learned_min_bar');
            const learnedMax = await this._getNumber('pump.pressure.learning.learned_max_bar');

            // Wenn noch keine Werte vorhanden
            let newLearnedMin = learnedMin || newBar;
            let newLearnedMax = learnedMax || newBar;

            // Pumpe stabil → Min/Max leicht erweitern
            if (newBar < newLearnedMin) {
                newLearnedMin = newBar;
            }

            if (newBar > newLearnedMax) {
                newLearnedMax = newBar;
            }

            await this.adapter.setStateAsync('pump.pressure.learning.learned_min_bar', {
                val: Number(newLearnedMin.toFixed(3)),
                ack: true,
            });

            await this.adapter.setStateAsync('pump.pressure.learning.learned_max_bar', {
                val: Number(newLearnedMax.toFixed(3)),
                ack: true,
            });

            // Zeitstempel schreiben
            // const now = new Date().toISOString();
            await this.adapter.setStateAsync('pump.pressure.last_update', {
                val: now,
                ack: true,
            });

            // Statustext setzen
            const text = this._getStatusText(newBar);
            await this.adapter.setStateAsync('pump.pressure.status_text', {
                val: text,
                ack: true,
            });

            // ------------------------------------------
            // Diagnose-Text (Trend + Lernen)
            // ------------------------------------------
            let diagText = '';

            if (!pumpIsOn) {
                diagText = 'Pumpe aus – keine Diagnose möglich';
            } else {
                const trendParts = [];

                if (rising > 0) {
                    trendParts.push(`steigend (+${rising} bar)`);
                }
                if (falling > 0) {
                    trendParts.push(`fallend (-${falling} bar)`);
                }
                if (stability === 1) {
                    trendParts.push('stabil');
                }

                const trendText = trendParts.length > 0 ? trendParts.join(', ') : 'kein Trend erkennbar';

                const avg = await this._getNumber('pump.pressure.learning.avg_bar');
                const learnedMin = await this._getNumber('pump.pressure.learning.learned_min_bar');
                const learnedMax = await this._getNumber('pump.pressure.learning.learned_max_bar');

                diagText =
                    `Trend: ${trendText} | ` +
                    `Durchschnitt: ${avg.toFixed(3)} bar | ` +
                    `Lernbereich: ${learnedMin.toFixed(3)}–${learnedMax.toFixed(3)} bar`;
            }

            // in State schreiben
            await this.adapter.setStateAsync('pump.pressure.status_text_diagnostic', {
                val: diagText,
                ack: true,
            });

            this.adapter.log.debug(`[pumpHelper4] Druck aktualisiert: ${newBar} bar (vorher: ${previous} bar)`);
        } catch (err) {
            this.adapter.log.warn(`[pumpHelper4] Fehler bei handleStateChange: ${err.message}`);
        }
    },

    /**
     * Gibt einen einfachen Status basierend auf dem Druck zurück.
     *
     * Berücksichtigt Benutzerwerte:
     *  - normal_min_bar
     *  - normal_max_bar
     *
     * @param {number} bar - aktueller Druck in bar
     * @returns {string} Statusmeldung
     */
    _getStatusText(bar) {
        if (isNaN(bar)) {
            return 'Ungültiger Druckwert';
        }

        const min = this.lastMin ?? 0.2;
        const max = this.lastMax ?? 0.8;

        // Zu niedrig?
        if (bar < min) {
            return `Druck zu niedrig (unter ${min} bar)`;
        }

        // Normalbereich?
        if (bar >= min && bar <= max) {
            return `Normaldruck (${min}–${max} bar)`;
        }

        // Zu hoch?
        if (bar > max) {
            return `Druck erhöht (über ${max} bar)`;
        }

        return 'Unbekannter Zustand';
    },

    /**
     * Liest einen numerischen State
     *
     * @param {string} id - Die vollständige Objekt-ID des State, dessen numerischer Wert gelesen werden soll
     */
    async _getNumber(id) {
        const state = await this.adapter.getStateAsync(id);
        const val = Number(state?.val);
        return isNaN(val) ? 0 : val;
    },

    /**
     * Cleanup bei Adapter-Unload
     */
    cleanup() {
        this.adapter?.log.debug('[pumpHelper4] Cleanup ausgeführt.');
    },
};

module.exports = pumpHelper4;

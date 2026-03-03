'use strict';

/**
 * speechTextHelper
 * - Erzeugt situationsabhängige Sprachtexte (z. B. Zeitmodus, Solar, PV, Wartung usw.)
 * - Sendet fertige Texte an speech.queue (ack: false)
 * - Beeinflusst keine Steuerlogik und keine anderen Helper
 * - Wird nach und nach um Textbausteine erweitert (Schritt-für-Schritt pro Datei)
 *
 * @module speechTextHelper
 * @version 1.0.3
 */

const speechTextHelper = {
    // @type {ioBroker.Adapter}
    adapter: null,

    /**
     * Initialisiert den Helper und abonniert relevante States.
     *
     * @param {ioBroker.Adapter} adapter - ioBroker Adapterinstanz
     */
    init(adapter) {
        this.adapter = adapter;

        // Relevante States abonnieren (Pumpenlogik + Status)
        this.adapter.subscribeStates('pump.pump_switch');
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('pump.reason');
        this.adapter.subscribeStates('pump.status'); // zentrale Statusüberwachung

        // --- NEU: Solar-Warnung überwachen ---
        this.adapter.subscribeStates('solar.collector_warning');

        // --- NEU: Solarsteuerung überwachen ---
        this.adapter.subscribeStates('speech.solar_active');

        // --- NEU: Zeitsteuerung überwachen ---
        this.adapter.subscribeStates('speech.time_active');

        // Später erweiterbar:
        // this.adapter.subscribeStates('solar.solar_control_active');
        // this.adapter.subscribeStates('control.pump.backwash_active');

        this.adapter.log.debug(
            '[speechTextHelper] Initialized (basic structure active, incl. solar warning, no further text logics yet)',
        );
    },

    /**
     * Reagiert auf State-Änderungen.
     * Hier werden nach und nach die jeweiligen Textausgaben ergänzt.
     *
     * @param {string} id - Objekt-ID des geänderten States
     * @param {ioBroker.State} state - Neuer Statewert
     */
    async handleStateChange(id, state) {
        try {
            if (!state) {
                return;
            }

            // --- Pumpenstatusänderung ---
            if (id.endsWith('pump.status')) {
                const status = String(state.val || '').toLowerCase();
                this.adapter.log.silly(`[speechTextHelper] Pump status changed: ${status}`);
                return;
            }

            // --- Pumpenereignisse ---
            if (id.endsWith('pump.pump_switch') || id.endsWith('pump.mode') || id.endsWith('pump.reason')) {
                this.adapter.log.silly(`[speechTextHelper] Pump event detected: ${id} = ${state.val}`);
                return;
            }

            // --- NEU: Solar-Warnung ---
            if (id.endsWith('solar.collector_warning')) {
                const val = !!state.val;

                if (val) {
                    // Neue Warnung aktiv
                    const collectorTemp = Number(
                        (await this.adapter.getStateAsync('temperature.collector.current'))?.val,
                    );
                    const warnTemp = Number((await this.adapter.getStateAsync('solar.warn_temp'))?.val);
                    const text = `Warnung: Kollektortemperatur ${collectorTemp} Grad erreicht (Warnschwelle ${warnTemp}°C).`;
                    await this._sendSpeech(text);
                    this.adapter.log.debug(`[speechTextHelper] Solar warning sent: ${text}`);
                } else {
                    // Warnung aufgehoben
                    const text = 'Kollektorwarnung aufgehoben.';
                    await this._sendSpeech(text);
                    this.adapter.log.debug('[speechTextHelper] Solar warning cleared.');
                }

                // ersetzt SolarHelper Textausgabe
                return;
            }

            // --- NEU: Reaktion auf Solarsteuerung ---
            if (id.endsWith('speech.solar_active')) {
                const val = !!state.val;
                // Pumpenstatus aktualisieren, damit auch im VIS korrekt sichtbar
                if (val) {
                    await this.adapter.setStateAsync('pump.status', {
                        val: 'EIN (Solarsteuerung)',
                        ack: true,
                    });
                } else {
                    await this.adapter.setStateAsync('pump.status', {
                        val: 'AUS (Solarsteuerung beendet)',
                        ack: true,
                    });
                }
                if (val) {
                    const text = 'Die Poolpumpe wurde durch die Solarsteuerung eingeschaltet.';
                    await this._sendSpeech(text);
                    this.adapter.log.debug('[speechTextHelper] Solar control activated → announcement sent.');
                } else {
                    const text = 'Solarsteuerung beendet – Poolpumpe ausgeschaltet.';
                    await this._sendSpeech(text);
                    this.adapter.log.debug('[speechTextHelper] Solar control deactivated → announcement sent.');
                }
                return;
            }

            // --- NEU: Reaktion auf Zeitsteuerung ---
            if (id.endsWith('speech.time_active')) {
                const val = !!state.val;

                // Pumpenstatus mitpflegen
                if (val) {
                    await this.adapter.setStateAsync('pump.status', {
                        val: 'EIN (Zeitsteuerung)',
                        ack: true,
                    });
                    const text = 'Die Poolpumpe wurde durch die Zeitsteuerung eingeschaltet.';
                    await this._sendSpeech(text);
                    this.adapter.log.debug('[speechTextHelper] Time control activated → announcement sent.');
                } else {
                    await this.adapter.setStateAsync('pump.status', {
                        val: 'AUS (Zeitsteuerung beendet)',
                        ack: true,
                    });
                    const text = 'Zeitsteuerung beendet – Poolpumpe ausgeschaltet.';
                    await this._sendSpeech(text);
                    this.adapter.log.debug('[speechTextHelper] Time control deactivated → announcement sent.');
                }
                return;
            }

            // Weitere Blöcke (z. B. Zeitmodus, Wartung usw.) folgen später hier
        } catch (err) {
            this.adapter.log.warn(`[speechTextHelper] Error in handleStateChange: ${err.message}`);
        }
    },

    /**
     * Sendet Text an speech.queue.
     *
     * @param {string} text - Der zu sendende Text
     */
    async _sendSpeech(text) {
        if (!text) {
            return;
        }
        try {
            await this.adapter.setStateAsync('speech.queue', { val: text, ack: false });
            this.adapter.log.debug(`[speechTextHelper] Text sent: ${text}`);
        } catch (err) {
            this.adapter.log.warn(`[speechTextHelper] Error sending to speech.queue: ${err.message}`);
        }
    },

    /**
     * Aufräumen (z. B. Timer beenden)
     */
    cleanup() {
        // Aktuell keine Ressourcen
        this.adapter.log.debug('[speechTextHelper] Cleanup executed');
    },
};

module.exports = speechTextHelper;

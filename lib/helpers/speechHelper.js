'use strict';

/**
 * speechHelper
 * - Sendet Texte an Alexa und/oder Telegram
 * - Verwendet Config (jsonConfig) + States aus speechStates.js
 */

const speechHelper = {
    adapter: null,

    init(adapter) {
        this.adapter = adapter;

        // States überwachen, die Textänderungen triggern
        this.adapter.subscribeStates('speech.start_text');
        this.adapter.subscribeStates('speech.end_text');
        this.adapter.subscribeStates('speech.texts.*');
        this.adapter.subscribeStates('pump.error'); // Fehleransagen
        this.adapter.subscribeStates('temperature.*.current'); // Temp-Trigger

        this.adapter.log.info('[speechHelper] initialisiert');
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // Globale Aktivierung prüfen
        const active = (await this.adapter.getStateAsync('speech.active'))?.val;
        if (!active) {
            return;
        }

        // Fehleransagen
        if (id.endsWith('pump.error') && state.val) {
            const includeErrors = this.adapter.config.speech_include_errors;
            if (includeErrors) {
                await this._speak('Achtung: Pumpenfehler erkannt!');
            }
            return;
        }

        // Beispiel: Pumpenstart / -stop
        if (id.endsWith('pump.pump_switch')) {
            if (state.val) {
                const txt =
                    (await this.adapter.getStateAsync('speech.start_text'))?.val || 'Die Poolpumpe wurde gestartet.';
                await this._speak(txt);
            } else {
                const txt =
                    (await this.adapter.getStateAsync('speech.end_text'))?.val || 'Die Poolpumpe wurde gestoppt.';
                await this._speak(txt);
            }
            return;
        }

        // Temperatur-Trigger: über Config-Schwelle
        if (id.includes('.temperature.') && id.endsWith('.current')) {
            const threshold = this.adapter.config.speech_temp_threshold || 0;
            const val = Number(state.val);
            if (val >= threshold && threshold > 0) {
                await this._speak(`Der Pool hat ${val} Grad erreicht.`);
            }
            return;
        }
    },

    async _speak(text) {
        try {
            if (!text) {
                return;
            }

            // Letzten Text speichern
            await this.adapter.setStateAsync('speech.last_text', {
                val: text,
                ack: true,
            });

            // Alexa-Ausgabe
            if (this.adapter.config.speech_alexa_enabled && this.adapter.config.speech_alexa_device) {
                await this.adapter.setForeignStateAsync(this.adapter.config.speech_alexa_device, text);
                this.adapter.log.info(`[speechHelper] Alexa sagt: ${text}`);
            }

            // Telegram-Ausgabe
            if (this.adapter.config.speech_telegram_enabled && this.adapter.config.speech_telegram_instance) {
                const instance = this.adapter.config.speech_telegram_instance;
                const sendState = `${instance}.communicate.sendMessage`;
                await this.adapter.setForeignStateAsync(sendState, {
                    val: text,
                    ack: false,
                });
                this.adapter.log.info(`[speechHelper] Telegram sendet: ${text}`);
            }
        } catch (err) {
            this.adapter.log.warn(`[speechHelper] Fehler beim Sprechen: ${err.message}`);
        }
    },

    cleanup() {
        // nichts nötig bisher
    },
};

module.exports = speechHelper;

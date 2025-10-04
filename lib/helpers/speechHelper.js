'use strict';

/**
 * speechHelper
 * - Sendet Texte an Alexa, Telegram und optional per E-Mail
 * - Verwendet Config (jsonConfig) + States aus speechStates.js
 */

const speechHelper = {
    adapter: null,
    lastTempNotify: {}, // Cooldown-Speicher pro Sensor
    lastPumpState: null, // interner Speicher für letzten Pumpenzustand

    init(adapter) {
        this.adapter = adapter;

        // States überwachen, die Textänderungen triggern
        this.adapter.subscribeStates('speech.start_text');
        this.adapter.subscribeStates('speech.end_text');
        this.adapter.subscribeStates('speech.texts.*');
        this.adapter.subscribeStates('pump.error'); // Fehleransagen
        this.adapter.subscribeStates('temperature.*.current'); // Temp-Trigger
        this.adapter.subscribeStates('pump.pump_switch'); // wichtig für Flankenerkennung

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

        // === Pumpenstart / -stop nur bei Zustandswechsel ===
        if (id.endsWith('pump.pump_switch')) {
            const newVal = !!state.val;

            // Nur wenn sich der Zustand wirklich geändert hat
            if (this.lastPumpState !== newVal) {
                this.lastPumpState = newVal;

                if (newVal) {
                    const txt =
                        (await this.adapter.getStateAsync('speech.start_text'))?.val ||
                        'Die Poolpumpe wurde gestartet.';
                    await this._speak(txt);
                } else {
                    const txt =
                        (await this.adapter.getStateAsync('speech.end_text'))?.val || 'Die Poolpumpe wurde gestoppt.';
                    await this._speak(txt);
                }
            } else {
                this.adapter.log.debug('[speechHelper] Ignoriere Pumpenmeldung – kein Zustandswechsel.');
            }
            return;
        }

        // Temperatur-Trigger: über Config-Schwelle
        if (id.includes('.temperature.') && id.endsWith('.current')) {
            const threshold = this.adapter.config.speech_temp_threshold || 0;
            const val = Number(state.val);
            if (val >= threshold && threshold > 0) {
                const now = Date.now();
                const last = this.lastTempNotify[id] || 0;

                // Nur einmal pro Stunde pro Sensor
                if (now - last > 60 * 60 * 1000) {
                    await this._speak(`Der Pool hat ${val} Grad erreicht.`);
                    this.lastTempNotify[id] = now;
                } else {
                    this.adapter.log.debug(`[speechHelper] Temperaturansage für ${id} unterdrückt (Cooldown aktiv).`);
                }
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
            await this.adapter.setStateAsync('speech.last_text', { val: text, ack: true });

            // Alexa-Ausgabe
            if (this.adapter.config.speech_alexa_enabled && this.adapter.config.speech_alexa_device) {
                await this.adapter.setForeignStateAsync(this.adapter.config.speech_alexa_device, text);
                this.adapter.log.info(`[speechHelper] Alexa sagt: ${text}`);
            }

            // Telegram-Ausgabe (modern über sendTo)
            if (this.adapter.config.speech_telegram_enabled && this.adapter.config.speech_telegram_instance) {
                const instance = this.adapter.config.speech_telegram_instance;
                try {
                    this.adapter.sendTo(instance, { text, parse_mode: 'Markdown' });
                    this.adapter.log.info(`[speechHelper] Telegram sendet: ${text}`);
                } catch (err) {
                    this.adapter.log.warn(
                        `[speechHelper] Telegram-Versand fehlgeschlagen (${instance}): ${err.message}`,
                    );
                }
            }

            // E-Mail-Ausgabe
            if (this.adapter.config.speech_email_enabled && this.adapter.config.speech_email_instance) {
                const instance = this.adapter.config.speech_email_instance;
                const sendState = `${instance}.mail`;

                // Existenzprüfung: nur Instanz prüfen, nicht .mail
                const obj = await this.adapter.getForeignObjectAsync(instance);
                if (!obj) {
                    this.adapter.log.error(`[speechHelper] E-Mail-Instanz nicht gefunden: ${instance}`);
                    return;
                }

                await this.adapter.setForeignStateAsync(sendState, {
                    val: {
                        to: this.adapter.config.speech_email_recipient,
                        subject: this.adapter.config.speech_email_subject || 'PoolControl Nachricht',
                        text,
                    },
                    ack: false,
                });
                this.adapter.log.info(
                    `[speechHelper] E-Mail gesendet an ${this.adapter.config.speech_email_recipient}: ${text}`,
                );
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

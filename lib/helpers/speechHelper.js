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
        this.adapter.subscribeStates('speech.last_text');
        this.adapter.subscribeStates('speech.queue'); // <<< NEU: zentrale Nachrichtenwarteschlange

        this.adapter.log.debug('[speechHelper] initialisiert');
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

        // NEU: Nachricht aus zentraler speech.queue
        if (id.endsWith('speech.queue') && state.ack === false) {
            const txt = String(state.val || '').trim();
            if (txt) {
                await this._speak(txt);
                await this.adapter.setStateAsync('speech.queue', { val: '', ack: true });
            }
            return;
        }

        // NEU: Direktnachricht von controlHelper über speech.last_text
        if (id.endsWith('speech.last_text') && state.ack === false) {
            const txt = String(state.val || '').trim();
            if (txt) {
                await this._speak(txt);
                return;
            }
        }

        // Fehleransagen
        if (id.endsWith('pump.error') && state.val) {
            const includeErrors = this.adapter.config.speech_include_errors;
            if (includeErrors) {
                await this._speak('Achtung: Pumpenfehler erkannt!');
            }
            return;
        }

        /*
         *
         * Deaktiviert, ersetzt durch speechTextHelper
         *
         * // === Pumpenstart / -stop nur bei Zustandswechsel ===
         * if (id.endsWith('pump.pump_switch')) {
         *     const newVal = !!state.val;
         *
         *     // Nur wenn sich der Zustand wirklich geändert hat
         *     if (this.lastPumpState !== newVal) {
         *         this.lastPumpState = newVal;
         *
         *         if (newVal) {
         *             const txt =
         *                 (await this.adapter.getStateAsync('speech.start_text'))?.val ||
         *                 'Die Poolpumpe wurde gestartet.';
         *             await this._speak(txt);
         *         } else {
         *             const txt =
         *                 (await this.adapter.getStateAsync('speech.end_text'))?.val || 'Die Poolpumpe wurde gestoppt.';
         *             await this._speak(txt);
         *         }
         *     } else {
         *         this.adapter.log.debug('[speechHelper] Ignoriere Pumpenmeldung – kein Zustandswechsel.');
         *     }
         *     return;
         * }
         */

        // Nur Pool-Oberflächentemperatur berücksichtigen
        if (!id.includes('temperature.surface')) {
            return;
        }

        const threshold = this.adapter.config.speech_temp_threshold || 0;
        const val = Number(state.val);

        if (val >= threshold && threshold > 0) {
            const now = Date.now();
            const lastInfo = this.lastTempNotify[id] || { time: 0, temp: 0, date: null };

            const lastDate = lastInfo.date;
            const today = new Date().toDateString();
            const tempDiff = Math.abs(val - lastInfo.temp);

            // Prüfen: neuer Tag oder Temperatur mindestens +2°C höher
            const isNewDay = lastDate !== today;
            const significantChange = tempDiff >= 2;

            if (isNewDay || significantChange) {
                await this._speak(`Der Pool hat jetzt ${val} Grad erreicht.`);
                this.lastTempNotify[id] = { time: now, temp: val, date: today };
            } else {
                this.adapter.log.debug(
                    `[speechHelper] Temperaturansage unterdrückt (tempDiff=${tempDiff.toFixed(
                        1,
                    )}°C, letzter Wert=${lastInfo.temp}°C).`,
                );
            }
        }
        return;
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
                    // NEU: Benutzerliste aus Admin lesen (Komma-getrennte Namen)
                    const rawUsers = this.adapter.config.speech_telegram_users || '';
                    const users = rawUsers
                        .split(',')
                        .map(u => u.trim())
                        .filter(Boolean);

                    // Wenn keine Benutzer angegeben → Standard: global an alle senden
                    if (users.length === 0) {
                        await this.adapter.sendToAsync(instance, { text, parse_mode: 'Markdown' });
                        this.adapter.log.info(`[speechHelper] Telegram (global): ${text}`);
                    } else {
                        // Nur an ausgewählte Benutzer senden
                        for (const user of users) {
                            await this.adapter.sendToAsync(instance, { user, text, parse_mode: 'Markdown' });
                            this.adapter.log.info(`[speechHelper] Telegram an ${user}: ${text}`);
                        }
                    }
                } catch (err) {
                    this.adapter.log.warn(
                        `[speechHelper] Telegram-Versand fehlgeschlagen (${instance}): ${err.message}`,
                    );
                }
            }

            // E-Mail-Ausgabe (modern über sendTo)
            if (this.adapter.config.speech_email_enabled && this.adapter.config.speech_email_instance) {
                const instance = this.adapter.config.speech_email_instance; // z. B. "email.0"
                try {
                    this.adapter.sendTo(instance, {
                        to: this.adapter.config.speech_email_recipient,
                        subject: this.adapter.config.speech_email_subject || 'PoolControl Nachricht',
                        text,
                    });
                    this.adapter.log.info(
                        `[speechHelper] E-Mail gesendet über ${instance} an ${this.adapter.config.speech_email_recipient}: ${text}`,
                    );
                } catch (err) {
                    this.adapter.log.warn(`[speechHelper] E-Mail-Versand fehlgeschlagen (${instance}): ${err.message}`);
                }
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

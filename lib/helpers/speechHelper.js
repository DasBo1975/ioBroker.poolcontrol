'use strict';

/**
 * speechHelper
 * - Sendet Texte an Alexa, Telegram und optional per E-Mail
 * - Verwendet Config (jsonConfig) + States aus speechStates.js
 */

const speechHelper = {
    adapter: null,
    _lastPumpOn: null,
    _lastError: null,
    _tempAbove: new Map(), // sensorKey -> bool (aktuell über Schwelle)

    init(adapter) {
        this.adapter = adapter;

        // Relevante States beobachten
        this.adapter.subscribeStates('speech.start_text');
        this.adapter.subscribeStates('speech.end_text');
        this.adapter.subscribeStates('speech.texts.*');
        this.adapter.subscribeStates('pump.error'); // Fehleransagen
        this.adapter.subscribeStates('pump.pump_switch'); // Start/Stop-Ansagen
        this.adapter.subscribeStates('temperature.*.current'); // Temp-Trigger

        this.adapter.log.info('[speechHelper] initialisiert');
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // WICHTIG: Nur auf bestätigte (ack:true) Zustandsänderungen reagieren,
        // damit "Befehle" (ack:false) aus Solar/Frost/Time nicht zu Schleifen führen.
        if (state.ack !== true) {
            return;
        }

        // Globale Aktivierung prüfen
        const active = (await this.adapter.getStateAsync('speech.active'))?.val;
        if (!active) {
            return;
        }

        // --- Pumpenstart / -stopp (flankengesteuert) ---
        if (id.endsWith('pump.pump_switch')) {
            const nowOn = !!state.val;
            if (this._lastPumpOn !== nowOn) {
                this._lastPumpOn = nowOn;
                const txt = nowOn
                    ? (await this.adapter.getStateAsync('speech.start_text'))?.val || 'Die Poolpumpe wurde gestartet.'
                    : (await this.adapter.getStateAsync('speech.end_text'))?.val || 'Die Poolpumpe wurde gestoppt.';
                await this._speak(txt);
            }
            return;
        }

        // --- Fehleransage (nur steigende Flanke) ---
        if (id.endsWith('pump.error')) {
            const errNow = !!state.val;
            if (this._lastError !== errNow) {
                this._lastError = errNow;
                if (errNow && this.adapter.config.speech_include_errors) {
                    await this._speak('Achtung: Pumpenfehler erkannt!');
                }
            }
            return;
        }

        // --- Temperatur-Trigger: nur beim Überschreiten der Schwelle ---
        if (id.includes('.temperature.') && id.endsWith('.current')) {
            const threshold = Number(this.adapter.config.speech_temp_threshold || 0);
            if (threshold <= 0) {
                return;
            }

            // sensorKey extrahieren, z. B. "surface" aus "...temperature.surface.current"
            const m = id.match(/\.temperature\.(\w+)\.current$/);
            const sensorKey = m ? m[1] : 'unknown';

            const val = Number(state.val);
            const above = Number.isFinite(val) && val >= threshold;
            const wasAbove = this._tempAbove.get(sensorKey) || false;

            // nur bei steigender Flanke (unter -> über Schwelle) ansagen
            if (above && !wasAbove) {
                await this._speak(`Der Pool hat ${val} Grad erreicht.`);
            }

            // Status merken (für nächste Flanken-Erkennung)
            this._tempAbove.set(sensorKey, above);
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

            // Telegram-Ausgabe
            if (this.adapter.config.speech_telegram_enabled && this.adapter.config.speech_telegram_instance) {
                const instance = this.adapter.config.speech_telegram_instance;
                const sendState = `${instance}.communicate.sendMessage`;
                await this.adapter.setForeignStateAsync(sendState, { val: text, ack: false });
                this.adapter.log.info(`[speechHelper] Telegram sendet: ${text}`);
            }

            // E-Mail-Ausgabe (sendTo, mit Legacy-Fallback)
            if (this.adapter.config.speech_email_enabled && this.adapter.config.speech_email_instance) {
                const instance = this.adapter.config.speech_email_instance;
                const mailObject = {
                    from: 'poolcontrol@iobroker',
                    to: this.adapter.config.speech_email_recipient,
                    subject: this.adapter.config.speech_email_subject || 'PoolControl Nachricht',
                    text,
                };

                // Legacy: existiert evtl. noch email.X.mail?
                const legacyState = `${instance}.mail`;
                const legacyExists = await this.adapter.getForeignObjectAsync(legacyState);

                if (legacyExists) {
                    await this.adapter.setForeignStateAsync(legacyState, { val: mailObject, ack: false });
                    this.adapter.log.info(`[speechHelper] E-Mail (Legacy) gesendet an ${mailObject.to}: ${text}`);
                } else {
                    // Moderne, offizielle Variante
                    this.adapter.sendTo(instance, mailObject);
                    this.adapter.log.info(`[speechHelper] E-Mail (sendTo) gesendet an ${mailObject.to}: ${text}`);
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

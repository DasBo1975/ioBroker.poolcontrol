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
    quietTime: {}, // 🆕 Cache für Alexa-Ruhezeiten

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
        this.adapter.subscribeStates('speech.queue'); // zentrale Nachrichtenwarteschlange

        // 🆕 Alexa-Ruhezeit-States abonnieren
        this.adapter.subscribeStates('speech.amazon_alexa.*');

        this.adapter.log.debug('[speechHelper] Initialized');
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        // 🆕 Wenn sich ein Alexa-Ruhezeit-State geändert hat, Werte zwischenspeichern
        if (id.startsWith('poolcontrol.0.speech.amazon_alexa.')) {
            const key = id.split('.').pop();
            this.quietTime[key] = state.val;
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
                    `[speechHelper] Temperature announcement suppressed (tempDiff=${tempDiff.toFixed(
                        1,
                    )}°C, last value=${lastInfo.temp}°C).`,
                );
            }
        }
        return;
    },

    // 🆕 Prüft, ob Alexa aktuell sprechen darf
    async _isAlexaAllowed() {
        try {
            const now = new Date();
            const currentDay = now.getDay(); // 0=So, 6=Sa
            const isWeekend = currentDay === 0 || currentDay === 6;
            const hhmm = now.toTimeString().slice(0, 5);

            // Werte aus Cache oder States holen
            const prefix = 'speech.amazon_alexa.';
            const enabledState = isWeekend ? 'quiet_time_weekend_enabled' : 'quiet_time_week_enabled';
            const startState = isWeekend ? 'quiet_time_weekend_start' : 'quiet_time_week_start';
            const endState = isWeekend ? 'quiet_time_weekend_end' : 'quiet_time_week_end';

            const enabled =
                this.quietTime[enabledState] ?? (await this.adapter.getStateAsync(prefix + enabledState))?.val ?? false;
            const start =
                this.quietTime[startState] ?? (await this.adapter.getStateAsync(prefix + startState))?.val ?? '22:00';
            const end =
                this.quietTime[endState] ?? (await this.adapter.getStateAsync(prefix + endState))?.val ?? '07:00';

            if (!enabled) {
                await this.adapter.setStateAsync(`${prefix}quiet_time_active_now`, { val: false, ack: true });
                return true;
            }

            // Zeitvergleich
            const inRange = this._isTimeInRange(hhmm, start, end);
            await this.adapter.setStateAsync(`${prefix}quiet_time_active_now`, { val: inRange, ack: true });

            if (inRange) {
                this.adapter.log.debug('[speechHelper] Alexa quiet time active – speech output blocked.');
                return false;
            }
            return true;
        } catch (err) {
            this.adapter.log.warn(`[speechHelper] Error while checking Alexa quiet time: ${err.message}`);
            return true; // im Zweifel sprechen lassen
        }
    },

    // 🆕 Hilfsfunktion zum Zeitvergleich
    _isTimeInRange(now, start, end) {
        // Umwandeln in Minuten
        const toMinutes = t => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const n = toMinutes(now);
        const s = toMinutes(start);
        const e = toMinutes(end);

        if (s < e) {
            return n >= s && n < e;
        }
        return n >= s || n < e; // über Mitternacht
    },

    async _speak(text) {
        try {
            if (!text) {
                return;
            }

            // Letzten Text speichern
            await this.adapter.setStateAsync('speech.last_text', { val: text, ack: true });

            // 🆕 Alexa-Ausgabe mit Ruhezeitprüfung
            if (this.adapter.config.speech_alexa_enabled && this.adapter.config.speech_alexa_device) {
                const allowed = await this._isAlexaAllowed();
                if (allowed) {
                    await this.adapter.setForeignStateAsync(this.adapter.config.speech_alexa_device, text);
                    this.adapter.log.info(`[speechHelper] Alexa says: ${text}`);
                } else {
                    this.adapter.log.debug('[speechHelper] Alexa muted (quiet time active).');
                }
            }

            // Telegram-Ausgabe (modern über sendTo)
            if (this.adapter.config.speech_telegram_enabled && this.adapter.config.speech_telegram_instance) {
                const instance = this.adapter.config.speech_telegram_instance;
                try {
                    const rawUsers = this.adapter.config.speech_telegram_users || '';
                    const users = rawUsers
                        .split(',')
                        .map(u => u.trim())
                        .filter(Boolean);

                    if (users.length === 0) {
                        await this.adapter.sendToAsync(instance, { text, parse_mode: 'Markdown' });
                        this.adapter.log.info(`[speechHelper] Telegram (global): ${text}`);
                    } else {
                        for (const user of users) {
                            await this.adapter.sendToAsync(instance, { user, text, parse_mode: 'Markdown' });
                            this.adapter.log.info(`[speechHelper] Telegram to ${user}: ${text}`);
                        }
                    }
                } catch (err) {
                    this.adapter.log.warn(`[speechHelper] Telegram send failed (${instance}): ${err.message}`);
                }
            }

            // E-Mail-Ausgabe (modern über sendTo)
            if (this.adapter.config.speech_email_enabled && this.adapter.config.speech_email_instance) {
                const instance = this.adapter.config.speech_email_instance;
                try {
                    this.adapter.sendTo(instance, {
                        to: this.adapter.config.speech_email_recipient,
                        subject: this.adapter.config.speech_email_subject || 'PoolControl Nachricht',
                        text,
                    });
                    this.adapter.log.info(
                        `[speechHelper] Email sent via ${instance} to ${this.adapter.config.speech_email_recipient}: ${text}`,
                    );
                } catch (err) {
                    this.adapter.log.warn(`[speechHelper] Email send failed (${instance}): ${err.message}`);
                }
            }
        } catch (err) {
            this.adapter.log.warn(`[speechHelper] Error while speaking: ${err.message}`);
        }
    },

    cleanup() {
        if (this.adapter) {
            this.adapter.log.debug('[speechHelper] Cleanup completed.');
        }
    },
};

module.exports = speechHelper;

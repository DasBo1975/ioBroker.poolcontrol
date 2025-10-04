"use strict";

/**
 * controlHelper
 * - Überwacht States im Bereich "control"
 * - Steuert manuelle Aktionen: Rückspülung, Wartungsmodus
 * - Synchronisiert mit Pumpenmodus und Sprach-/Benachrichtigungssystem
 * - Erweiterung: automatische Sprach- und Benachrichtigungs-Ausgabe bei Start/Ende
 */

let adapter;
let backwashTimer = null;

function init(a) {
    adapter = a;
    adapter.log.info("[controlHelper] initialisiert");

    // States abonnieren
    adapter.subscribeStates("control.season.active");
    adapter.subscribeStates("control.pump.backwash_start");
    adapter.subscribeStates("control.pump.maintenance_active");

    adapter.log.debug("[controlHelper] Überwachung der Control-States aktiviert");
}

async function handleStateChange(id, state) {
    try {
        if (!state || state.ack) return;

        // === SAISONSTATUS =====================================================
        if (id.endsWith("control.season.active")) {
            const newVal = !!state.val;
            adapter.log.info(`[controlHelper] Poolsaison wurde ${newVal ? "aktiviert" : "deaktiviert"}.`);
            await adapter.setStateAsync("status.season_active", { val: newVal, ack: true });
        }

        // === WARTUNGSMODUS ====================================================
        if (id.endsWith("control.pump.maintenance_active")) {
            const active = !!state.val;
            const notify = (await adapter.getStateAsync("control.pump.notifications_enabled"))?.val;

            if (active) {
                await adapter.setStateAsync("pump.mode", { val: "override", ack: true });
                await adapter.setStateAsync("pump.pump_switch", { val: false, ack: false });
                adapter.log.info("[controlHelper] Wartungsmodus aktiviert. Automatik pausiert.");

                if (notify) {
                    await sendNotification("Wartungsmodus aktiviert. Automatikfunktionen sind vorübergehend deaktiviert.");
                }
            } else {
                await adapter.setStateAsync("pump.mode", { val: "auto", ack: true });
                adapter.log.info("[controlHelper] Wartungsmodus beendet. Automatik wieder aktiv.");

                if (notify) {
                    await sendNotification("Wartungsmodus beendet. Automatikbetrieb ist wieder aktiv.");
                }
            }
        }

        // === RÜCKSPÜLUNG ======================================================
        if (id.endsWith("control.pump.backwash_start") && state.val === true) {
            const duration = (await adapter.getStateAsync("control.pump.backwash_duration"))?.val || 1;
            const notify = (await adapter.getStateAsync("control.pump.notifications_enabled"))?.val;
            const prevMode = (await adapter.getStateAsync("pump.mode"))?.val || "auto";
            const active = (await adapter.getStateAsync("control.pump.backwash_active"))?.val;

            if (active) {
                adapter.log.warn("[controlHelper] Rückspülung bereits aktiv – neuer Start abgelehnt.");
                return;
            }

            await adapter.setStateAsync("control.pump.backwash_active", { val: true, ack: true });
            await adapter.setStateAsync("pump.mode", { val: "override", ack: true });
            await adapter.setStateAsync("pump.pump_switch", { val: true, ack: false });

            const durationText = duration === 1 ? "eine Minute" : `${duration} Minuten`;
            adapter.log.info(`[controlHelper] Rückspülung gestartet (Dauer: ${duration} Minuten).`);

            if (notify) {
                await sendNotification(`Rückspülung gestartet. Dauer ${durationText}.`);
            }

            if (backwashTimer) clearTimeout(backwashTimer);
            backwashTimer = setTimeout(async () => {
                try {
                    await adapter.setStateAsync("pump.pump_switch", { val: false, ack: false });
                    await adapter.setStateAsync("pump.mode", { val: prevMode, ack: true });
                    await adapter.setStateAsync("control.pump.backwash_active", { val: false, ack: true });

                    adapter.log.info("[controlHelper] Rückspülung beendet. Automatik wieder aktiv.");

                    if (notify) {
                        await sendNotification("Rückspülung abgeschlossen. Automatikmodus wieder aktiv.");
                    }
                } catch (err) {
                    adapter.log.warn(`[controlHelper] Fehler beim Beenden der Rückspülung: ${err.message}`);
                }
            }, duration * 60 * 1000);
        }
    } catch (err) {
        adapter.log.error(`[controlHelper] Fehler bei State-Änderung: ${err.message}`);
    }
}

/**
 * Sendet Sprach-/Benachrichtigungsausgaben über alle aktiven Kanäle
 * (Alexa, Telegram, E-Mail)
 */
async function sendNotification(text) {
    if (!text) return;

    try {
        await adapter.setStateAsync("speech.last_text", { val: text, ack: true });

        // Alexa
        if (adapter.config.speech_alexa_enabled && adapter.config.speech_alexa_device) {
            await adapter.setForeignStateAsync(adapter.config.speech_alexa_device, text);
            adapter.log.info(`[controlHelper] Alexa sagt: ${text}`);
        }

        // Telegram
        if (adapter.config.speech_telegram_enabled && adapter.config.speech_telegram_instance) {
            const sendState = `${adapter.config.speech_telegram_instance}.send`;
            await adapter.setForeignStateAsync(sendState, { val: text, ack: false });
            adapter.log.info(`[controlHelper] Telegram sendet: ${text}`);
        }

        // E-Mail
        if (adapter.config.speech_email_enabled && adapter.config.speech_email_instance) {
            const sendMail = `${adapter.config.speech_email_instance}.mail`;
            await adapter.setForeignStateAsync(sendMail, {
                val: {
                    to: adapter.config.speech_email_recipient,
                    subject: adapter.config.speech_email_subject || "PoolControl Nachricht",
                    text,
                },
                ack: false,
            });
            adapter.log.info(`[controlHelper] E-Mail gesendet: ${text}`);
        }
    } catch (err) {
        adapter.log.warn(`[controlHelper] Fehler beim Senden der Benachrichtigung: ${err.message}`);
    }
}

function cleanup() {
    if (backwashTimer) {
        clearTimeout(backwashTimer);
        backwashTimer = null;
    }
}

module.exports = { init, handleStateChange, cleanup };

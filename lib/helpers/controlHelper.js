'use strict';

/**
 * controlHelper
 * - Steuert Wartungsmodus, Rückspülung, Energie-Reset, Saison
 * - Führt tägliche Umwälzprüfung (z. B. 18:00 Uhr) durch
 * - Automatisches Nachpumpen, wenn Tagesziel nicht erreicht
 * - Sendet Statusmeldungen über speech.queue
 * - Nutzt Vorrangsteuerung über pump.mode = "controlHelper"
 */

let adapter;
let backwashTimer = null;
let dailyTimer = null;
let autoPumpingInterval = null; // FIX
let previousPumpMode = null;

/**
 * Initialisiert den Control-Helper.
 *
 * @param {import('iobroker').Adapter} a - ioBroker Adapterinstanz
 */
function init(a) {
    adapter = a;
    adapter.log.info('[controlHelper] initialized');

    // States abonnieren
    adapter.subscribeStates('control.season.active');
    adapter.subscribeStates('control.pump.backwash_start');
    adapter.subscribeStates('control.pump.maintenance_active');
    adapter.subscribeStates('control.energy.reset');
    adapter.subscribeStates('control.circulation.check_time');

    // Täglichen Check planen
    _scheduleDailyCheck().catch(err =>
        adapter.log.error(`[controlHelper] error in _scheduleDailyCheck(): ${err.message}`),
    );

    adapter.log.debug('[controlHelper] monitoring of control states enabled');
}

/**
 * Plant den täglichen Umwälzungscheck neu.
 */
async function _scheduleDailyCheck() {
    try {
        if (dailyTimer) {
            adapter.clearTimeout(dailyTimer);
        }

        const timeStr = (await adapter.getStateAsync('control.circulation.check_time'))?.val || '18:00';
        const [hours, minutes] = timeStr.split(':').map(x => parseInt(x, 10));

        const now = new Date();
        const next = new Date();
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const diffMs = next - now;
        adapter.log.debug(`[controlHelper] next daily circulation check scheduled for ${next.toLocaleTimeString()}`);

        dailyTimer = adapter.setTimeout(async () => {
            await _runDailyCirculationCheck();
            await _scheduleDailyCheck();
        }, diffMs);
    } catch (err) {
        adapter.log.error(`[controlHelper] error in _scheduleDailyCheck(): ${err.message}`);
    }
}

/**
 * Führt den täglichen Umwälzungsbericht und ggf. Nachpumpen aus.
 */
async function _runDailyCirculationCheck() {
    try {
        adapter.log.debug('[controlHelper] starting daily circulation check ...');

        const seasonActive = (await adapter.getStateAsync('status.season_active'))?.val;
        const mode = (await adapter.getStateAsync('control.circulation.mode'))?.val || 'off';
        const dailyTotal = Math.round((await adapter.getStateAsync('circulation.daily_total'))?.val || 0);
        const dailyRequired = Math.round((await adapter.getStateAsync('circulation.daily_required'))?.val || 0);
        const collector = Number((await adapter.getStateAsync('temperature.collector.current'))?.val || 0);
        const pool = Number((await adapter.getStateAsync('temperature.surface.current'))?.val || 0);

        if (!seasonActive) {
            adapter.log.debug('[controlHelper] season inactive - daily check skipped.');
            return;
        }

        if (!dailyRequired || dailyRequired <= 0) {
            await _sendSpeech('Keine Zielumwälzmenge festgelegt – Tagesbericht übersprungen.');
            return;
        }

        const percent = Math.min(100, Math.round((dailyTotal / dailyRequired) * 100));
        const missing = Math.max(0, Math.round(dailyRequired - dailyTotal));
        let message = '';

        switch (mode) {
            case 'notify':
                message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Es fehlen noch ${missing} l. Bitte ggf. manuell nachpumpen.`;
                break;

            case 'manual':
                message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Es fehlen noch ${missing} l. Bitte Pumpe manuell einschalten.`;
                break;

            case 'auto':
                if (percent >= 100) {
                    message = `Tagesumwälzung abgeschlossen: ${dailyTotal} l (${percent} %). Kein Nachpumpen erforderlich.`;
                } else if (collector > pool) {
                    message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Es fehlen ${missing} l. Nachpumpen startet automatisch (Kollektor wärmer).`;
                    await _startAutoPumping(missing);
                    return;
                } else {
                    message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Kein automatisches Nachpumpen, Kollektor kälter als Pool.`;
                }
                break;

            default:
                adapter.log.debug(`[controlHelper] mode '${mode}' -> no action.`);
                return;
        }

        await _sendSpeech(message);
        await adapter.setStateAsync('control.circulation.last_report', { val: new Date().toISOString(), ack: true });
    } catch (err) {
        adapter.log.error(`[controlHelper] error during daily check: ${err.message}`);
    }
}

/**
 * Startet automatisches Nachpumpen.
 *
 * @param {number} missingLiter - Fehlende Umwälzmenge in Litern
 */
async function _startAutoPumping(missingLiter) {
    try {
        const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;

        previousPumpMode = (await adapter.getStateAsync('pump.mode'))?.val || 'auto';
        await adapter.setStateAsync('pump.mode', { val: 'controlHelper', ack: true });
        await adapter.setStateAsync('pump.active_helper', { val: 'controlHelper', ack: true });
        await adapter.setStateAsync('pump.reason', { val: 'nachpumpen', ack: true });
        await adapter.setStateAsync('pump.pump_switch', { val: true, ack: false });

        adapter.log.info(`[controlHelper] automatic pumping started (${missingLiter} l missing).`);
        if (notify) {
            await _sendSpeech(`Automatisches Nachpumpen gestartet. Es fehlen ${missingLiter} Liter.`);
        }

        if (autoPumpingInterval) {
            adapter.clearInterval(autoPumpingInterval);
            autoPumpingInterval = null;
        }

        autoPumpingInterval = adapter.setInterval(async () => {
            const total = Math.round((await adapter.getStateAsync('circulation.daily_total'))?.val || 0);
            const required = Math.round((await adapter.getStateAsync('circulation.daily_required'))?.val || 0);

            if (total >= required) {
                adapter.clearInterval(autoPumpingInterval);
                autoPumpingInterval = null;
                await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
                await adapter.setStateAsync('pump.mode', { val: previousPumpMode, ack: true });
                await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                previousPumpMode = null;

                adapter.log.info('[controlHelper] automatic pumping finished - daily target reached.');
                if (notify) {
                    await _sendSpeech('Nachpumpen abgeschlossen. Tagesziel erreicht.');
                }
            }
        }, 60 * 1000);
    } catch (err) {
        adapter.log.error(`[controlHelper] error during automatic pumping: ${err.message}`);
    }
}

/**
 * Reagiert auf Änderungen der States im Bereich control.*
 *
 * @param {string} id - Objekt-ID des geänderten States
 * @param {ioBroker.State} state - Neuer State-Wert
 */
async function handleStateChange(id, state) {
    try {
        if (!state || state.ack) {
            return;
        }

        // === SAISONSTATUS ===
        if (id.endsWith('control.season.active')) {
            const newVal = !!state.val;
            adapter.log.info(`[controlHelper] pool season ${newVal ? 'enabled' : 'disabled'}.`);
            await adapter.setStateAsync('status.season_active', { val: newVal, ack: true });
        }

        // === WARTUNGSMODUS ===
        if (id.endsWith('control.pump.maintenance_active')) {
            const active = !!state.val;
            const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;

            if (active) {
                previousPumpMode = (await adapter.getStateAsync('pump.mode'))?.val || 'auto';
                await adapter.setStateAsync('pump.mode', { val: 'controlHelper', ack: true });
                await adapter.setStateAsync('pump.reason', { val: 'wartung', ack: true });
                await adapter.setStateAsync('pump.active_helper', { val: 'controlHelper', ack: true });
                await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
                adapter.log.info('[controlHelper] maintenance mode enabled. Automation paused.');

                if (notify) {
                    await _sendSpeech('Wartungsmodus aktiviert. Automatikfunktionen deaktiviert.');
                }
            } else {
                await adapter.setStateAsync('pump.mode', { val: previousPumpMode, ack: true });
                await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                previousPumpMode = null;

                adapter.log.info('[controlHelper] maintenance mode disabled. Automation active again.');
                if (notify) {
                    await _sendSpeech('Wartungsmodus beendet. Automatikbetrieb wieder aktiv.');
                }
            }
        }

        // === RÜCKSPÜLUNG ===
        if (id.endsWith('control.pump.backwash_start') && state.val === true) {
            const duration = (await adapter.getStateAsync('control.pump.backwash_duration'))?.val || 1;
            const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
            const prevMode = (await adapter.getStateAsync('pump.mode'))?.val || 'auto';
            const active = (await adapter.getStateAsync('control.pump.backwash_active'))?.val;

            if (active) {
                adapter.log.warn('[controlHelper] backwash already active - rejecting new start.');
                return;
            }

            await adapter.setStateAsync('control.pump.backwash_active', { val: true, ack: true });
            await adapter.setStateAsync('control.pump.backwash_start', { val: false, ack: true });
            await adapter.setStateAsync('pump.mode', { val: 'controlHelper', ack: true });
            await adapter.setStateAsync('pump.active_helper', { val: 'controlHelper', ack: true });
            await adapter.setStateAsync('pump.reason', { val: 'rückspülen', ack: true });
            await adapter.setStateAsync('pump.pump_switch', { val: true, ack: false });

            const durationText = duration === 1 ? 'eine Minute' : `${duration} Minuten`;
            adapter.log.info(`[controlHelper] backwash started (${duration} minutes).`);

            if (notify) {
                await _sendSpeech(`Rückspülung gestartet. Dauer ${durationText}.`);
            }

            if (backwashTimer) {
                adapter.clearTimeout(backwashTimer);
            }
            backwashTimer = adapter.setTimeout(
                async () => {
                    try {
                        await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
                        await adapter.setStateAsync('pump.mode', { val: prevMode, ack: true });
                        await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                        await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                        await adapter.setStateAsync('control.pump.backwash_active', { val: false, ack: true });

                        adapter.log.info('[controlHelper] backwash finished. Automation active again.');
                        if (notify) {
                            await _sendSpeech('Rückspülung abgeschlossen. Automatikmodus wieder aktiv.');
                        }
                    } catch (err) {
                        adapter.log.warn(`[controlHelper] error while stopping backwash: ${err.message}`);
                    }
                },
                duration * 60 * 1000,
            );
        }

        // === ENERGIEZÄHLER RESET ===
        if (id.endsWith('control.energy.reset') && state.val === true) {
            const now = new Date();
            const timestamp = now.toLocaleString('de-DE');
            const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;

            adapter.log.info(`[controlHelper] energy meter will be fully reset (${timestamp}).`);

            const consStates = [
                'consumption.total_kwh',
                'consumption.day_kwh',
                'consumption.week_kwh',
                'consumption.month_kwh',
                'consumption.year_kwh',
                'consumption.last_total_kwh',
                'consumption.offset_kwh',
                'costs.total_eur',
                'costs.day_eur',
                'costs.week_eur',
                'costs.month_eur',
                'costs.year_eur',
            ];

            for (const sid of consStates) {
                await adapter.setStateAsync(sid, { val: 0, ack: true });
            }

            await adapter.setStateAsync('control.energy.reset', { val: false, ack: true });

            const msg = `Energiezähler und Kosten wurden am ${timestamp} vollständig zurückgesetzt.`;
            adapter.log.info('[controlHelper] energy meter and costs have been fully reset.');
            if (notify) {
                await _sendSpeech(msg);
            }
        }
    } catch (err) {
        adapter.log.error(`[controlHelper] error on state change: ${err.message}`);
    }
}

/**
 * Sendet Text an speech.queue
 *
 * @param {string} text - Nachricht, die an speech.queue gesendet werden soll
 */
async function _sendSpeech(text) {
    if (!text) {
        return;
    }
    try {
        await adapter.setStateAsync('speech.queue', { val: text, ack: false });
        adapter.log.debug(`[controlHelper] message sent to speech.queue: ${text}`);
    } catch (err) {
        adapter.log.warn(`[controlHelper] error sending to speech.queue: ${err.message}`);
    }
}

/**
 * Aufräumen
 */
function cleanup() {
    if (backwashTimer) {
        adapter.clearTimeout(backwashTimer);
        backwashTimer = null;
    }
    if (dailyTimer) {
        adapter.clearTimeout(dailyTimer);
        dailyTimer = null;
    }
    if (autoPumpingInterval) {
        adapter.clearInterval(autoPumpingInterval);
        autoPumpingInterval = null;
    }
    previousPumpMode = null;
}

module.exports = { init, handleStateChange, cleanup };

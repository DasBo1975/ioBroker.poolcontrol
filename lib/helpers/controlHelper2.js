'use strict';

/**
 * controlHelper2
 * ----------------------------------------------
 * Rückspülerinnerungs-Logik (eigenständig)
 * ----------------------------------------------
 * - täglicher Check um 12:00 Uhr (lokale Host-Zeit)
 * - prüft Intervall und letzte Rückspülung
 * - erzeugt Erinnerungen (Log + speech.queue)
 * - setzt Erinnerung automatisch zurück, wenn Rückspülung startet
 * ----------------------------------------------
 */

// NEU: Modulvariablen
let adapter;
let backwashReminderTimer = null;
let lastReminderDay = null; // verhindert doppelte tägliche Meldungen

// NEU: Initialisierung
/**
 * Initialisiert den Rückspülerinnerungs-Helper
 *
 * @param {import('iobroker').Adapter} a – ioBroker-Adapterinstanz
 */
function init(a) {
    adapter = a;
    adapter.log.info('[controlHelper2] backwash reminder initialized (daily check at 12:00).');

    // Rückspülstart abonnieren, um Erinnerung zurückzusetzen
    adapter.subscribeStates('control.pump.backwash_start');

    // Täglichen Check planen
    _scheduleBackwashReminder().catch(err =>
        adapter.log.error(`[controlHelper2] error in _scheduleBackwashReminder(): ${err.message}`),
    );
}

// NEU: Plant täglichen Timer um 12:00 Uhr lokale Zeit
async function _scheduleBackwashReminder() {
    try {
        if (backwashReminderTimer) {
            clearTimeout(backwashReminderTimer);
        }

        const now = new Date();
        const next = new Date();
        next.setHours(12, 0, 0, 0); // 12:00 Uhr lokale Zeit

        // Wenn 12:00 Uhr heute schon vorbei ist → morgen
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const diffMs = next - now;
        adapter.log.debug(`[controlHelper2] next backwash reminder check scheduled for ${next.toLocaleString()}`);

        backwashReminderTimer = setTimeout(async () => {
            await _runBackwashReminderCheck();
            await _scheduleBackwashReminder(); // neu planen
        }, diffMs);
    } catch (err) {
        adapter.log.error(`[controlHelper2] error in _scheduleBackwashReminder(): ${err.message}`);
    }
}

// NEU: Führt täglichen Erinnerungs-Check aus
async function _runBackwashReminderCheck() {
    try {
        adapter.log.debug('[controlHelper2] starting backwash reminder check ...');

        const reminderActive = (await adapter.getStateAsync('control.pump.backwash_reminder_active'))?.val;
        if (!reminderActive) {
            adapter.log.debug('[controlHelper2] backwash reminder disabled - check skipped.');
            return;
        }

        const intervalDays = Number((await adapter.getStateAsync('control.pump.backwash_interval_days'))?.val || 7);
        const lastDateStr = (await adapter.getStateAsync('control.pump.backwash_last_date'))?.val || '';

        const now = new Date();
        const todayKey = now.toISOString().split('T')[0]; // yyyy-mm-dd

        // Verhindert doppelte Erinnerungen am selben Tag
        if (lastReminderDay === todayKey) {
            adapter.log.debug('[controlHelper2] reminder already sent for today.');
            return;
        }

        let daysSince = null;
        if (lastDateStr) {
            const lastDate = new Date(lastDateStr);
            const diffMs = now - lastDate;
            daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        if (daysSince === null) {
            adapter.log.debug('[controlHelper2] no last backwash date known - no reminder.');
            return;
        }

        const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
        const speechEnabled = notify === true;

        if (daysSince >= intervalDays) {
            // Fällig oder überfällig
            await adapter.setStateAsync('control.pump.backwash_required', { val: true, ack: true });
            let text;

            if (daysSince === intervalDays) {
                text = 'Erinnerung: Rückspülung ist wieder fällig.';
            } else {
                const over = daysSince - intervalDays;
                text = `Erinnerung: Rückspülung ist seit ${over} Tag${over === 1 ? '' : 'en'} überfällig.`;
            }

            adapter.log.info('[controlHelper2] backwash reminder triggered.');
            if (speechEnabled) {
                await _sendSpeech(text);
            }

            lastReminderDay = todayKey;
        } else {
            adapter.log.debug(`[controlHelper2] backwash not due yet (${daysSince}/${intervalDays} days).`);
        }
    } catch (err) {
        adapter.log.warn(`[controlHelper2] error during reminder check: ${err.message}`);
    }
}

// NEU: Rücksetzung nach Rückspülstart
/**
 * Reagiert auf State-Änderungen (z. B. Rückspülstart).
 *
 * @param {string} id – Objekt-ID des geänderten States
 * @param {ioBroker.State} state – Neuer State-Wert
 */
async function handleStateChange(id, state) {
    try {
        if (!state || state.ack) {
            return;
        }
        if (!id.endsWith('control.pump.backwash_start') || !state.val) {
            return;
        }

        adapter.log.debug('[controlHelper2] backwash start detected - resetting reminder.');

        await adapter.setStateAsync('control.pump.backwash_required', { val: false, ack: true });
        await adapter.setStateAsync('control.pump.backwash_last_date', {
            val: new Date().toISOString(),
            ack: true,
        });

        const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
        if (notify) {
            const text = 'Rückspülerinnerung wurde zurückgesetzt. Rückspülzyklus neu gestartet.';
            adapter.log.info('[controlHelper2] backwash reminder has been reset.');
            await _sendSpeech(text);
        }
    } catch (err) {
        adapter.log.warn(`[controlHelper2] error in handleStateChange(): ${err.message}`);
    }
}

// NEU: Sprachausgabe
async function _sendSpeech(text) {
    if (!text) {
        return;
    }
    try {
        await adapter.setStateAsync('speech.queue', { val: text, ack: false });
        adapter.log.debug(`[controlHelper2] message sent to speech.queue: ${text}`);
    } catch (err) {
        adapter.log.warn(`[controlHelper2] error sending to speech.queue: ${err.message}`);
    }
}

// NEU: Aufräumen
/**
 * Stoppt den Rückspülerinnerungs-Timer und räumt Variablen auf.
 *
 * @returns {void}
 */
function cleanup() {
    if (backwashReminderTimer) {
        clearTimeout(backwashReminderTimer);
        backwashReminderTimer = null;
    }
    lastReminderDay = null;
    adapter.log.debug('[controlHelper2] cleanup done.');
}

// NEU: Exporte
module.exports = { init, handleStateChange, cleanup };

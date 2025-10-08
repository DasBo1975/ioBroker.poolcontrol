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
    adapter.log.info('[controlHelper2] Rückspülerinnerung initialisiert (täglicher Check um 12:00 Uhr).');

    // Rückspülstart abonnieren, um Erinnerung zurückzusetzen
    adapter.subscribeStates('control.pump.backwash_start');

    // Täglichen Check planen
    _scheduleBackwashReminder().catch(err =>
        adapter.log.error(`[controlHelper2] Fehler bei _scheduleBackwashReminder(): ${err.message}`),
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
        adapter.log.debug(`[controlHelper2] Nächster Rückspülerinnerungs-Check geplant für ${next.toLocaleString()}`);

        backwashReminderTimer = setTimeout(async () => {
            await _runBackwashReminderCheck();
            await _scheduleBackwashReminder(); // neu planen
        }, diffMs);
    } catch (err) {
        adapter.log.error(`[controlHelper2] Fehler bei _scheduleBackwashReminder(): ${err.message}`);
    }
}

// NEU: Führt täglichen Erinnerungs-Check aus
async function _runBackwashReminderCheck() {
    try {
        adapter.log.debug('[controlHelper2] Starte Rückspülerinnerungs-Check ...');

        const reminderActive = (await adapter.getStateAsync('control.pump.backwash_reminder_active'))?.val;
        if (!reminderActive) {
            adapter.log.debug('[controlHelper2] Rückspülerinnerung deaktiviert – Check übersprungen.');
            return;
        }

        const intervalDays = Number((await adapter.getStateAsync('control.pump.backwash_interval_days'))?.val || 7);
        const lastDateStr = (await adapter.getStateAsync('control.pump.backwash_last_date'))?.val || '';

        const now = new Date();
        const todayKey = now.toISOString().split('T')[0]; // yyyy-mm-dd

        // Verhindert doppelte Erinnerungen am selben Tag
        if (lastReminderDay === todayKey) {
            adapter.log.debug('[controlHelper2] Erinnerung für heute bereits gesendet.');
            return;
        }

        let daysSince = null;
        if (lastDateStr) {
            const lastDate = new Date(lastDateStr);
            const diffMs = now - lastDate;
            daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        if (daysSince === null) {
            adapter.log.debug('[controlHelper2] Keine letzte Rückspülung bekannt – keine Erinnerung.');
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

            adapter.log.info(`[controlHelper2] ${text}`);
            if (speechEnabled) {
                await _sendSpeech(text);
            }

            lastReminderDay = todayKey;
        } else {
            adapter.log.debug(`[controlHelper2] Rückspülung noch nicht fällig (${daysSince}/${intervalDays} Tage).`);
        }
    } catch (err) {
        adapter.log.warn(`[controlHelper2] Fehler beim Erinnerungs-Check: ${err.message}`);
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

        adapter.log.debug('[controlHelper2] Rückspülstart erkannt – Erinnerung wird zurückgesetzt.');

        await adapter.setStateAsync('control.pump.backwash_required', { val: false, ack: true });
        await adapter.setStateAsync('control.pump.backwash_last_date', {
            val: new Date().toISOString(),
            ack: true,
        });

        const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
        if (notify) {
            const text = 'Rückspülerinnerung wurde zurückgesetzt. Rückspülzyklus neu gestartet.';
            adapter.log.info(`[controlHelper2] ${text}`);
            await _sendSpeech(text);
        }
    } catch (err) {
        adapter.log.warn(`[controlHelper2] Fehler bei handleStateChange(): ${err.message}`);
    }
}

// NEU: Sprachausgabe
async function _sendSpeech(text) {
    if (!text) {
        return;
    }
    try {
        await adapter.setStateAsync('speech.queue', { val: text, ack: false });
        adapter.log.debug(`[controlHelper2] Nachricht an speech.queue: ${text}`);
    } catch (err) {
        adapter.log.warn(`[controlHelper2] Fehler beim Senden an speech.queue: ${err.message}`);
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
    adapter.log.debug('[controlHelper2] Cleanup ausgeführt.');
}

// NEU: Exporte
module.exports = { init, handleStateChange, cleanup };

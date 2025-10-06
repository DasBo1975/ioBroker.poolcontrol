'use strict';

/**
 * debugLogHelper (SystemCheck-Version)
 * - Überwacht nur einen auswählbaren Bereich (z. B. pump.*, solar.*, runtime.*)
 * - Loggt Änderungen fortlaufend in SystemCheck.debug_logs.log
 * - Kann per SystemCheck.debug_logs.clear geleert werden
 * - target_area wird automatisch erkannt (dynamisch durch States-Datei)
 */

const debugLogHelper = {
    adapter: null,
    currentTarget: 'none',
    subscribedTarget: null,
    lastChange: {},
    thresholdMs: 2000, // Mindestzeit zwischen Änderungen (ms)
    buffer: '',
    bufferTimer: null,

    /**
     * Initialisierung des Debug-Helpers.
     *
     * @param {import('iobroker').Adapter} adapter - ioBroker Adapter-Instanz
     */
    async init(adapter) {
        this.adapter = adapter;

        // --- SystemCheck-Ordner sicherstellen ---
        await this.adapter.setObjectNotExistsAsync('SystemCheck', {
            type: 'channel',
            common: { name: 'SystemCheck (Diagnose und Tools)' },
            native: {},
        });

        // States für clear und target_area überwachen
        adapter.subscribeStates('SystemCheck.debug_logs.clear');
        adapter.subscribeStates('SystemCheck.debug_logs.target_area');

        // Initialwert für target_area lesen
        const target = (await adapter.getStateAsync('SystemCheck.debug_logs.target_area'))?.val || 'none';
        this.currentTarget = target;
        if (target !== 'none') {
            this._subscribeTarget(target);
        } else {
            adapter.log.debug('[debugLogHelper] Kein Bereich ausgewählt – Logger inaktiv.');
        }

        adapter.log.debug('[debugLogHelper] Initialisierung abgeschlossen');
    },

    /**
     * Reagiert auf State-Änderungen
     *
     * @param {string} id - State-ID
     * @param {ioBroker.State} state - State-Wert
     */
    async handleStateChange(id, state) {
        if (!this.adapter || !state) {
            return;
        }

        // Umschalten des überwachten Bereichs
        if (id.endsWith('SystemCheck.debug_logs.target_area')) {
            const newTarget = state.val || 'none';
            await this._switchTarget(newTarget);
            return;
        }

        // Clear-Button
        if (id.endsWith('SystemCheck.debug_logs.clear') && state.val === true) {
            await this._clearLog();
            await this.adapter.setStateAsync('SystemCheck.debug_logs.clear', { val: false, ack: true });
            return;
        }

        // Nur loggen, wenn der Bereich aktiv ist
        if (!this.subscribedTarget || this.subscribedTarget === 'none') {
            return;
        }

        // Nur Events aus dem überwachten Bereich aufnehmen
        if (!id.includes(`.${this.subscribedTarget}.`)) {
            return;
        }

        const now = Date.now();
        const last = this.lastChange[id] || 0;
        this.lastChange[id] = now;

        if (now - last < this.thresholdMs) {
            const msg = `[${new Date().toISOString()}] ${id} änderte sich zu schnell (${now - last} ms, val=${state.val}, ack=${state.ack})\n`;
            await this._appendLog(msg);
        }
    },

    /**
     * Wechselt den aktiven Überwachungsbereich
     *
     * @param {string} newTarget - Name des neuen Bereichs (z.B. "pump", "solar", oder "none")
     */
    async _switchTarget(newTarget) {
        if (this.subscribedTarget === newTarget) {
            return;
        }
        if (this.subscribedTarget && this.subscribedTarget !== 'none') {
            this.adapter.unsubscribeStates(`${this.subscribedTarget}.*`);
            this.adapter.log.debug(`[debugLogHelper] Überwachung für Bereich "${this.subscribedTarget}" beendet.`);
        }

        this.subscribedTarget = newTarget;

        if (newTarget === 'none') {
            this.adapter.log.debug('[debugLogHelper] Kein Bereich aktiv.');
            return;
        }

        this._subscribeTarget(newTarget);
        this.adapter.log.debug(`[debugLogHelper] Überwachung für Bereich "${newTarget}" gestartet.`);
        await this._appendLog(
            `\n=== Debug-Log gestartet: Bereich "${newTarget}" @ ${new Date().toLocaleString()} ===\n`,
        );
    },

    /**
     * Abonniert States für den angegebenen Bereich
     *
     * @param {string} target - Name des zu überwachenden Bereichs
     */
    _subscribeTarget(target) {
        this.adapter.subscribeStates(`${target}.*`);
        this.subscribedTarget = target;
    },

    /**
     * Log anhängen (fortlaufend)
     *
     * @param {string} message - Text, der in das fortlaufende Log geschrieben wird
     */
    async _appendLog(message) {
        try {
            this.buffer += message;

            // Schreibe alle 5 Sekunden oder ab 2 KB
            if (this.buffer.length > 2000) {
                await this._flushBuffer();
            } else if (!this.bufferTimer) {
                this.bufferTimer = setTimeout(() => this._flushBuffer(), 5000);
            }
        } catch (err) {
            this.adapter.log.warn(`[debugLogHelper] Fehler beim Anhängen an Log: ${err.message}`);
        }
    },

    async _flushBuffer() {
        try {
            if (!this.buffer) {
                return;
            }
            const current = (await this.adapter.getStateAsync('SystemCheck.debug_logs.log'))?.val || '';
            const newVal = current + this.buffer;
            await this.adapter.setStateAsync('SystemCheck.debug_logs.log', {
                val: newVal.slice(-60000),
                ack: true,
            }); // max ~60k Zeichen
            this.buffer = '';
            this.bufferTimer = null;
        } catch (err) {
            this.adapter.log.warn(`[debugLogHelper] Fehler beim Schreiben in Log: ${err.message}`);
        }
    },

    /**
     * Löscht das Log komplett
     */
    async _clearLog() {
        try {
            await this.adapter.setStateAsync('SystemCheck.debug_logs.log', { val: '', ack: true });
            this.buffer = '';
            this.adapter.log.info('[debugLogHelper] Debug-Log gelöscht');
        } catch (err) {
            this.adapter.log.warn(`[debugLogHelper] Fehler beim Löschen des Logs: ${err.message}`);
        }
    },

    cleanup() {
        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
        }
        this.adapter.log.debug('[debugLogHelper] Cleanup ausgeführt');
    },
};

module.exports = debugLogHelper;

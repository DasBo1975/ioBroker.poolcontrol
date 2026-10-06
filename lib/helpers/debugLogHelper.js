'use strict';

const MAX_DEBUG_LOG_BYTES = 64 * 1024;

/**
 * debugLogHelper (SystemCheck-Version)
 * - Überwacht nur einen auswählbaren Bereich (z. B. pump.*, solar.*, runtime.*)
 * - Loggt Änderungen fortlaufend in SystemCheck.debug_logs.log
 * - Kann per SystemCheck.debug_logs.clear geleert werden
 * - target_area wird automatisch erkannt (dynamisch durch States-Datei)
 */

const debugLogHelper = /** @satisfies {import('../types/poolcontrol-adapter').DebugLogHelper} */ ({
    _adapter: null,
    _active: false,
    _lifecycleState: 'new',
    _lifecycleGeneration: 0,
    _pendingStateChanges: [],
    currentTarget: 'none',
    subscribedTarget: null,
    lastChange: {},
    thresholdMs: 2000, // Mindestzeit zwischen Änderungen (ms)
    buffer: '',
    bufferTimer: null,

    /**
     * Returns the initialized ioBroker adapter instance.
     *
     * @returns Initialized adapter instance.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('debugLogHelper used before init()');
        }

        return this._adapter;
    },

    /**
     * Initialisierung des Debug-Helpers.
     *
     * @param {ioBroker.Adapter} adapter - ioBroker Adapter-Instanz
     */
    async init(adapter) {
        this._adapter = adapter;
        this._active = true;
        this._lifecycleState = 'initializing';
        const generation = ++this._lifecycleGeneration;

        // --- SystemCheck-Ordner sicherstellen ---
        await this.adapter.setObjectNotExistsAsync('SystemCheck', {
            type: 'channel',
            common: { name: 'SystemCheck (Diagnose und Tools)' },
            native: {},
        });
        if (!this._isCurrentGeneration(generation)) {
            return;
        }

        // States für clear und target_area überwachen
        adapter.subscribeStates('SystemCheck.debug_logs.clear');
        adapter.subscribeStates('SystemCheck.debug_logs.target_area');

        // Initialwert für target_area lesen
        const target = (await adapter.getStateAsync('SystemCheck.debug_logs.target_area'))?.val || 'none';
        if (!this._isCurrentGeneration(generation)) {
            return;
        }
        this.currentTarget = target;
        if (target !== 'none') {
            this._subscribeTarget(target);
        } else {
            adapter.log.debug('[debugLogHelper] No area selected - logger inactive.');
        }

        adapter.log.debug('[debugLogHelper] Initialization completed');
        await this._drainPendingStateChanges(generation);
    },

    _isCurrentGeneration(generation) {
        return this._active && generation === this._lifecycleGeneration;
    },

    _shouldBufferEvent(id, state) {
        if (id.endsWith('SystemCheck.debug_logs.target_area')) {
            return false;
        }

        if (id.endsWith('SystemCheck.debug_logs.clear')) {
            return state.val === true;
        }

        return true;
    },

    async _drainPendingStateChanges(generation) {
        try {
            if (!this._isCurrentGeneration(generation)) {
                return;
            }

            this._lifecycleState = 'draining';
            while (this._isCurrentGeneration(generation) && this._pendingStateChanges.length) {
                const pending = this._pendingStateChanges.shift();
                if (pending) {
                    try {
                        await this._processStateChange(pending.id, pending.state, generation);
                    } finally {
                        pending.complete?.();
                    }
                }
            }

            if (this._isCurrentGeneration(generation)) {
                this._lifecycleState = 'active';
            }
        } catch (err) {
            if (generation === this._lifecycleGeneration) {
                this._discardPendingStateChanges();
            }
            throw err;
        }
    },

    _discardPendingStateChanges() {
        while (this._pendingStateChanges.length) {
            this._pendingStateChanges.shift()?.complete?.();
        }
    },

    /**
     * Reagiert auf State-Änderungen
     *
     * @param {string} id - State-ID
     * @param {ioBroker.State} state - State-Wert
     */
    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        if (this._lifecycleState === 'new') {
            if (this._shouldBufferEvent(id, state)) {
                this._pendingStateChanges.push({ id, state });
            }
            return;
        }

        if (!this._active || this._lifecycleState === 'stopped') {
            return;
        }

        if (this._lifecycleState === 'initializing' || this._lifecycleState === 'draining') {
            if (this._shouldBufferEvent(id, state)) {
                const completion = new Promise(resolve => {
                    this._pendingStateChanges.push({ id, state, complete: resolve });
                });
                await completion;
            }
            return;
        }

        await this._processStateChange(id, state, this._lifecycleGeneration);
    },

    async _processStateChange(id, state, generation) {
        if (!this._isCurrentGeneration(generation)) {
            return;
        }

        // Umschalten des überwachten Bereichs
        if (id.endsWith('SystemCheck.debug_logs.target_area')) {
            const newTarget = state.val || 'none';
            await this._switchTarget(newTarget, generation);
            return;
        }

        // Clear-Button
        if (id.endsWith('SystemCheck.debug_logs.clear') && state.val === true) {
            await this._clearLog(generation);
            if (!this._isCurrentGeneration(generation)) {
                return;
            }
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
            const msg = `[${new Date().toISOString()}] ${id} changed too fast (${now - last} ms, val=${state.val}, ack=${state.ack})\n`;
            await this._appendLog(msg, generation);
        }
    },

    /**
     * Wechselt den aktiven Überwachungsbereich
     *
     * @param {import('../types/poolcontrol-adapter').DebugLogTarget} newTarget - Name des neuen Bereichs
     * @param {number} generation - Aktuelle Lifecycle-Generation
     */
    async _switchTarget(newTarget, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isCurrentGeneration(generation)) {
            return;
        }
        if (this.subscribedTarget === newTarget) {
            return;
        }
        if (this.subscribedTarget && this.subscribedTarget !== 'none') {
            this.adapter.unsubscribeStates(`${this.subscribedTarget}.*`);
            this.adapter.log.debug(`[debugLogHelper] Monitoring stopped for area "${this.subscribedTarget}".`);
        }

        this.subscribedTarget = newTarget;

        if (newTarget === 'none') {
            this.adapter.log.debug('[debugLogHelper] No area active.');
            return;
        }

        this._subscribeTarget(newTarget);
        this.adapter.log.debug(`[debugLogHelper] Monitoring started for area "${newTarget}".`);
        await this._appendLog(
            `\n=== Debug log started: area "${newTarget}" @ ${new Date().toLocaleString()} ===\n`,
            generation,
        );
    },

    /**
     * Abonniert States für den angegebenen Bereich
     *
     * @param {import('../types/poolcontrol-adapter').DebugLogTarget} target - Name des zu überwachenden Bereichs
     */
    _subscribeTarget(target) {
        this.adapter.subscribeStates(`${target}.*`);
        this.subscribedTarget = target;
    },

    /**
     * Log anhängen (fortlaufend)
     *
     * @param {string} message - Text, der in das fortlaufende Log geschrieben wird
     * @param {number} generation - Aktuelle Lifecycle-Generation
     */
    async _appendLog(message, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        try {
            if (!this._isCurrentGeneration(generation)) {
                return;
            }
            this.buffer += message;

            // Schreibe alle 5 Sekunden oder ab 2 KB
            if (this.buffer.length > 2000) {
                await this._flushBuffer(generation);
            } else if (!this.bufferTimer) {
                this.bufferTimer = this.adapter.setTimeout(() => this._flushBuffer(generation), 5000);
            }
        } catch (err) {
            this._adapter?.log.warn(`[debugLogHelper] Error while appending to log: ${err.message}`);
        }
    },

    async _flushBuffer(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        try {
            if (!this._isCurrentGeneration(generation) || !this.buffer) {
                return;
            }
            const current = (await this.adapter.getStateAsync('SystemCheck.debug_logs.log'))?.val || '';
            if (!this._isCurrentGeneration(generation)) {
                return;
            }
            const newVal = current + this.buffer;
            await this.adapter.setStateAsync('SystemCheck.debug_logs.log', {
                val: this._truncateUtf8(newVal, MAX_DEBUG_LOG_BYTES),
                ack: true,
            }); // hard limit: 64 KB UTF-8
            if (!this._isCurrentGeneration(generation)) {
                return;
            }
            this.buffer = '';
            if (this.bufferTimer) {
                this.adapter.clearTimeout(this.bufferTimer);
            }
            this.bufferTimer = null;
        } catch (err) {
            this._adapter?.log.warn(`[debugLogHelper] Error while writing to log: ${err.message}`);
        }
    },

    _truncateUtf8(value, maxBytes) {
        const buffer = Buffer.from(String(value ?? ''), 'utf8');
        if (buffer.length <= maxBytes) {
            return String(value ?? '');
        }

        let start = buffer.length - maxBytes;
        while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
            start += 1;
        }
        return buffer.subarray(start).toString('utf8');
    },

    /**
     * Löscht das Log komplett
     *
     * @param {number} generation - Aktuelle Lifecycle-Generation
     */
    async _clearLog(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        try {
            if (!this._isCurrentGeneration(generation)) {
                return;
            }
            await this.adapter.setStateAsync('SystemCheck.debug_logs.log', { val: '', ack: true });
            if (!this._isCurrentGeneration(generation)) {
                return;
            }
            this.buffer = '';
            this.adapter.log.info('[debugLogHelper] Debug log cleared');
        } catch (err) {
            this._adapter?.log.warn(`[debugLogHelper] Error while clearing the log: ${err.message}`);
        }
    },

    cleanup() {
        this._active = false;
        this._lifecycleState = 'stopped';
        ++this._lifecycleGeneration;
        this._discardPendingStateChanges();

        if (this.bufferTimer) {
            this._adapter?.clearTimeout(this.bufferTimer);
            this.bufferTimer = null;
        }
        this.buffer = '';
        this._adapter?.log.debug('[debugLogHelper] Cleanup done');
    },
});

module.exports = debugLogHelper;

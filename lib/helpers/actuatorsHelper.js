'use strict';

/**
 * actuatorsHelper.js
 * ----------------------------------------------------------
 * Steuert optionale Zusatz-Aktoren:
 *  - Beleuchtung 1–3
 *  - Zusatzpumpen / Attraktionen 1–3
 *
 * Prinzip:
 *  - States existieren immer
 *  - Checkbox = Freigabe
 *  - Objekt-ID DIREKT aus jsonConfig
 *  - Kein Mapping, kein Spiegel-State
 * ----------------------------------------------------------
 */

const actuatorsHelper = {
    adapter: null,

    // aktive Timer pro Aktor
    _timers: {},

    // ======================================================
    // Init
    // ======================================================
    async init(adapter) {
        this.adapter = adapter;

        // 🔥 WICHTIG: Actuator-States abonnieren
        this.adapter.subscribeStates('actuators.*');

        // NEU: Hauptpumpe abonnieren, damit Follow-Pump-Geräte reagieren können
        this.adapter.subscribeStates('pump.pump_switch');

        // FIX: Config-Werte in interne States übernehmen

        await this._syncConfigToStates();

        // NEU: Follow-Pump-Geräte beim Start prüfen und passend setzen
        await this._updateFollowPumpDevices();

        this.adapter.log.info('[actuatorsHelper] initialized');
    },

    // ======================================================
    // Zentrale StateChange-Anbindung (aus main.js)
    // ======================================================
    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        try {
            // FIX: ID normalisieren (poolcontrol.0.x -> x)
            const relId = this._toRelId(id);

            // NEU: Follow-Pump-Geräte reagieren auch auf ack=true der internen Pumpenlogik
            if (relId === 'pump.pump_switch') {
                await this._updateFollowPumpDevices();
                return;
            }

            if (!relId.startsWith('actuators.')) {
                return;
            }

            if (state.ack) {
                return;
            }

            // NEU: Änderungen an Follow-Pump-Geräten verarbeiten
            if (relId.startsWith('actuators.follow_pump_devices.')) {
                await this._handleFollowPumpDeviceChange(relId);
                return;
            }

            if (relId.endsWith('.switch')) {
                await this._handleSwitch(relId, !!state.val);
                return;
            }

            if (relId.endsWith('.permanent')) {
                await this._handlePermanent(relId, !!state.val);
                return;
            }

            if (relId.endsWith('.runtime_minutes')) {
                await this._handleRuntimeChange(relId, state.val);
                return;
            }
        } catch (err) {
            this.adapter.log.warn(`[actuatorsHelper] error: ${err.message}`);
        }
    },

    // ======================================================
    // FIX: Config -> interne States synchronisieren
    // ======================================================
    async _syncConfigToStates() {
        const cfg = this.adapter.config || {};

        for (let i = 1; i <= 3; i++) {
            // Beleuchtung
            await this._set(`actuators.lighting.light${i}.active`, !!cfg[`light_${i}_active`]);
            await this._set(`actuators.lighting.light${i}.name`, String(cfg[`light_${i}_name`] || ''));

            if (!cfg[`light_${i}_active`]) {
                await this._set(`actuators.lighting.light${i}.status`, 'DEAKTIVIERT');
            }

            // Zusatzpumpen
            await this._set(`actuators.extrapumps.pump${i}.active`, !!cfg[`extrapump_${i}_active`]);
            await this._set(`actuators.extrapumps.pump${i}.name`, String(cfg[`extrapump_${i}_name`] || ''));

            if (!cfg[`extrapump_${i}_active`]) {
                await this._set(`actuators.extrapumps.pump${i}.status`, 'DEAKTIVIERT');
            }
        }
    },

    // ======================================================
    // Switch EIN / AUS
    // ======================================================
    async _handleSwitch(relId, value) {
        const base = relId.replace('.switch', '');
        const active = await this._get(`${base}.active`, false);

        if (!active) {
            await this._set(`${base}.switch`, false);
            await this._set(`${base}.status`, 'DEAKTIVIERT');
            await this._stopTimer(base);
            return;
        }

        if (value) {
            await this._applyForeign(base, true);
            await this._start(base);
        } else {
            await this._applyForeign(base, false);
            await this._stop(base, 'AUS');
        }
    },

    // ======================================================
    // Permanentbetrieb
    // ======================================================
    async _handlePermanent(relId, value) {
        const base = relId.replace('.permanent', '');
        const active = await this._get(`${base}.active`, false);

        if (!active) {
            await this._set(`${base}.permanent`, false);
            await this._set(`${base}.status`, 'DEAKTIVIERT');
            return;
        }

        if (value) {
            await this._stopTimer(base);
            await this._applyForeign(base, true);
            await this._set(`${base}.remaining_minutes`, 0);
            await this._set(`${base}.status`, 'EIN (Dauerbetrieb)');
        } else {
            const sw = await this._get(`${base}.switch`, false);
            await this._set(`${base}.status`, sw ? 'EIN' : 'AUS');
        }
    },

    // ======================================================
    // Laufzeit geändert
    // ======================================================
    async _handleRuntimeChange(relId, val) {
        const base = relId.replace('.runtime_minutes', '');
        const sw = await this._get(`${base}.switch`, false);
        const permanent = await this._get(`${base}.permanent`, false);

        if (!sw || permanent) {
            return;
        }

        const minutes = Number(val);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            await this._stopTimer(base);
            await this._set(`${base}.remaining_minutes`, 0);
            await this._set(`${base}.status`, 'EIN');
            return;
        }

        await this._startTimer(base, minutes);
    },

    // ======================================================
    // Start / Stop intern
    // ======================================================
    async _start(base) {
        const permanent = await this._get(`${base}.permanent`, false);
        const minutes = Number(await this._get(`${base}.runtime_minutes`, 0));

        if (permanent || !Number.isFinite(minutes) || minutes <= 0) {
            await this._set(`${base}.status`, permanent ? 'EIN (Dauerbetrieb)' : 'EIN');
            await this._set(`${base}.remaining_minutes`, 0);
            return;
        }

        await this._startTimer(base, minutes);
    },

    async _stop(base, reason) {
        await this._stopTimer(base);
        await this._set(`${base}.remaining_minutes`, 0);
        await this._set(`${base}.status`, reason || 'AUS');
    },

    // ======================================================
    // Timer-Logik
    // ======================================================
    async _startTimer(base, minutes) {
        await this._stopTimer(base);

        let remaining = Math.floor(minutes);
        await this._set(`${base}.remaining_minutes`, remaining);
        await this._set(`${base}.status`, `EIN (noch ${remaining} min)`);

        this._timers[base] = this.adapter.setInterval(async () => {
            try {
                remaining--;

                if (remaining <= 0) {
                    await this._applyForeign(base, false);
                    await this._set(`${base}.switch`, false);
                    await this._stop(base, 'AUS (Zeit abgelaufen)');
                    return;
                }

                await this._set(`${base}.remaining_minutes`, remaining);
                await this._set(`${base}.status`, `EIN (noch ${remaining} min)`);
            } catch (err) {
                this.adapter.log.debug(`[actuatorsHelper] timer error in ${base}: ${err.message}`);
            }
        }, 60 * 1000);
    },

    async _stopTimer(base) {
        if (this._timers[base]) {
            this.adapter.clearInterval(this._timers[base]);
            delete this._timers[base];
        }
    },

    // ======================================================
    // NEU: Follow-Pump-Geräte
    // ======================================================
    async _handleFollowPumpDeviceChange(relId) {
        const parts = relId.split('.');

        if (parts.length < 4) {
            return;
        }

        const base = parts.slice(0, 3).join('.');

        if (relId.endsWith('.enabled') || relId.endsWith('.target_state_id')) {
            await this._validateFollowPumpDevice(base);
            await this._syncFollowPumpDevice(base);
        }
    },

    async _validateAllFollowPumpDevices() {
        for (let i = 1; i <= 3; i++) {
            await this._validateFollowPumpDevice(`actuators.follow_pump_devices.device${i}`);
        }
    },

    async _updateFollowPumpDevices() {
        for (let i = 1; i <= 3; i++) {
            const base = `actuators.follow_pump_devices.device${i}`;

            await this._validateFollowPumpDevice(base);
            await this._syncFollowPumpDevice(base);
        }
    },

    async _validateFollowPumpDevice(base) {
        const targetId = String((await this._get(`${base}.target_state_id`, '')) || '').trim();

        if (!targetId) {
            await this._set(`${base}.target_valid`, false);
            await this._set(`${base}.target_writeable`, false);
            await this._set(`${base}.validation_text`, 'target_empty');
            return false;
        }

        // NEU: Interne PoolControl-Ziele mit Schleifen-/Nebenwirkungsgefahr blockieren
        const namespace = this.adapter?.namespace || '';

        if (
            namespace &&
            (targetId === `${namespace}.pump.pump_switch` ||
                targetId.startsWith(`${namespace}.actuators.follow_pump_devices.`))
        ) {
            await this._set(`${base}.target_valid`, false);
            await this._set(`${base}.target_writeable`, false);
            await this._set(`${base}.validation_text`, 'internal_target_not_allowed');
            return false;
        }

        try {
            const obj = await this.adapter.getForeignObjectAsync(targetId);

            if (!obj || obj.type !== 'state') {
                await this._set(`${base}.target_valid`, false);
                await this._set(`${base}.target_writeable`, false);
                await this._set(`${base}.validation_text`, 'state_not_found');
                return false;
            }

            const isBoolean = obj.common && obj.common.type === 'boolean';
            const isWriteable = obj.common && obj.common.write === true;

            await this._set(`${base}.target_valid`, isBoolean);
            await this._set(`${base}.target_writeable`, isWriteable);

            if (!isBoolean) {
                await this._set(`${base}.validation_text`, 'state_is_not_boolean');
                return false;
            }

            if (!isWriteable) {
                await this._set(`${base}.validation_text`, 'state_not_writeable');
                return false;
            }

            await this._set(`${base}.validation_text`, 'OK');
            return true;
        } catch (err) {
            await this._set(`${base}.target_valid`, false);
            await this._set(`${base}.target_writeable`, false);
            await this._set(`${base}.validation_text`, `validation_error: ${err.message}`);
            return false;
        }
    },

    async _syncFollowPumpDevice(base) {
        const enabled = await this._get(`${base}.enabled`, false);
        const targetValid = await this._get(`${base}.target_valid`, false);
        const targetWriteable = await this._get(`${base}.target_writeable`, false);
        const pumpRunning = await this._get('pump.pump_switch', false);

        if (!enabled) {
            if (targetValid && targetWriteable) {
                await this._applyFollowPumpTarget(base, false);
            }

            await this._set(`${base}.active`, false);
            await this._set(`${base}.status`, 'disabled');
            return;
        }

        if (!targetValid || !targetWriteable) {
            await this._set(`${base}.active`, false);
            await this._set(`${base}.status`, 'invalid_target');
            return;
        }

        if (pumpRunning) {
            await this._applyFollowPumpTarget(base, true);
            await this._set(`${base}.active`, true);
            await this._set(`${base}.status`, 'running_with_pump');
        } else {
            await this._applyFollowPumpTarget(base, false);
            await this._set(`${base}.active`, false);
            await this._set(`${base}.status`, 'waiting_for_pump');
        }
    },

    async _applyFollowPumpTarget(base, on) {
        const targetId = String((await this._get(`${base}.target_state_id`, '')) || '').trim();

        if (!targetId) {
            return;
        }

        try {
            await this.adapter.setForeignStateAsync(targetId, {
                val: !!on,
                ack: false,
            });

            this.adapter.log.debug(
                `[actuatorsHelper] ${base}: follow-pump target "${targetId}" -> ${on ? 'ON' : 'OFF'}`,
            );
        } catch (err) {
            this.adapter.log.warn(
                `[actuatorsHelper] ${base}: follow-pump target set failed (${targetId}): ${err.message}`,
            );
        }
    },

    // ======================================================
    // Externes Ziel schalten (aus jsonConfig)
    // ======================================================
    async _applyForeign(base, on) {
        const cfg = this.adapter.config || {};
        let objectId = '';

        // FIX: base ist jetzt garantiert relativ (actuators....)
        if (base.startsWith('actuators.lighting.light')) {
            const i = Number(base.slice(-1));
            objectId = String(cfg[`light_${i}_object`] || '').trim();
        } else if (base.startsWith('actuators.extrapumps.pump')) {
            const i = Number(base.slice(-1));
            objectId = String(cfg[`extrapump_${i}_object`] || '').trim();
        }

        if (!objectId) {
            this.adapter.log.debug(`[actuatorsHelper] ${base}: no object ID set in config -> skip`);
            return;
        }

        try {
            await this.adapter.setForeignStateAsync(objectId, {
                val: !!on,
                ack: false,
            });
            this.adapter.log.debug(`[actuatorsHelper] ${base}: foreign "${objectId}" -> ${on ? 'EIN' : 'AUS'}`);
        } catch (err) {
            this.adapter.log.warn(`[actuatorsHelper] ${base}: foreign set failed (${objectId}): ${err.message}`);
        }
    },

    // ======================================================
    // FIX: Voll-ID -> Relativ-ID (ohne "poolcontrol.0.")
    // ======================================================
    _toRelId(id) {
        const ns = this.adapter?.namespace;
        if (ns && id.startsWith(`${ns}.`)) {
            return id.substring(ns.length + 1);
        }
        return id;
    },

    // ======================================================
    // State-Helfer (immer relativ!)
    // ======================================================
    async _set(id, val) {
        try {
            await this.adapter.setStateAsync(id, { val, ack: true });
        } catch (err) {
            this.adapter.log.debug(`[actuatorsHelper] setState failed (${id}): ${err.message}`);
        }
    },

    async _get(id, fallback) {
        try {
            const s = await this.adapter.getStateAsync(id);
            return s ? s.val : fallback;
        } catch {
            return fallback;
        }
    },

    cleanup() {
        try {
            for (const base of Object.keys(this._timers)) {
                if (this._timers[base]) {
                    this.adapter.clearInterval(this._timers[base]);
                    delete this._timers[base];
                }
            }
            this.adapter.log.debug('[actuatorsHelper] cleanup done');
        } catch (err) {
            this.adapter.log.debug(`[actuatorsHelper] cleanup error: ${err.message}`);
        }
    },
};

module.exports = actuatorsHelper;

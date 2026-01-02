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
    init(adapter) {
        this.adapter = adapter;

        // 🔥 WICHTIG: Actuator-States abonnieren
        this.adapter.subscribeStates('actuators.*');

        this.adapter.log.info('[actuatorsHelper] initialisiert');
    },

    // ======================================================
    // Zentrale StateChange-Anbindung (aus main.js)
    // ======================================================
    async handleStateChange(id, state) {
        if (!state || state.ack) {
            return;
        }

        try {
            // FIX: ID normalisieren (poolcontrol.0.x -> x)
            const relId = this._toRelId(id);

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
            this.adapter.log.warn(`[actuatorsHelper] Fehler: ${err.message}`);
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

        this._timers[base] = setInterval(async () => {
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
                this.adapter.log.debug(`[actuatorsHelper] Timer-Fehler (${base}): ${err.message}`);
            }
        }, 60 * 1000);
    },

    async _stopTimer(base) {
        if (this._timers[base]) {
            clearInterval(this._timers[base]);
            delete this._timers[base];
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
            this.adapter.log.debug(`[actuatorsHelper] ${base}: keine Objekt-ID in Config gesetzt -> skip`);
            return;
        }

        try {
            await this.adapter.setForeignStateAsync(objectId, {
                val: !!on,
                ack: false,
            });
            this.adapter.log.debug(`[actuatorsHelper] ${base}: foreign "${objectId}" -> ${on ? 'EIN' : 'AUS'}`);
        } catch (err) {
            this.adapter.log.warn(
                `[actuatorsHelper] ${base}: foreign set fehlgeschlagen (${objectId}): ${err.message}`,
            );
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
            this.adapter.log.debug(`[actuatorsHelper] setState fehlgeschlagen (${id}): ${err.message}`);
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
};

module.exports = actuatorsHelper;

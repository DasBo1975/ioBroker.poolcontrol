'use strict';

/**
 * heatHelper
 * -------------------------------------------------------------
 * - Steuert Heizung/Wärmepumpe basierend auf Pooltemperatur
 * - Respektiert:
 *   - status.season_active
 *   - control.pump.maintenance_active (Vorrang / Block)
 *   - pump.mode (nur im Automatikbetrieb)
 * - Kann entweder:
 *   - eine schaltbare Steckdose (socket) oder
 *   - einen bool Steuer-State (boolean) bedienen
 * - Erzeugt zusätzlich ein internes Signal:
 *   - heat.heating_request (read-only) => kann extern ausgewertet werden
 * - Pumpen-Nachlaufzeit (min) wird berücksichtigt
 * - Ownership-Schutz: Pumpe wird nur ausgeschaltet, wenn heatHelper sie vorher selbst eingeschaltet hat
 * -------------------------------------------------------------
 */

const heatHelper = {
    adapter: null,

    // dynamische Steuer-ID (foreign)
    _heatControlForeignId: '',
    _afterrunTimer: null,
    _prerunTimer: null, // NEU: Pumpen-Vorlauf vor Heizstart

    // Ownership / Merker
    _ownsPump: false,
    _desiredHeat: null,
    _lastEval: 0,

    init(adapter) {
        this.adapter = adapter;

        // lokale States überwachen
        this.adapter.subscribeStates('heat.control_active');
        this.adapter.subscribeStates('heat.control_type');
        this.adapter.subscribeStates('heat.control_object_id');
        this.adapter.subscribeStates('heat.target_temperature');
        this.adapter.subscribeStates('heat.max_temperature');
        this.adapter.subscribeStates('heat.pump_afterrun_minutes');
        this.adapter.subscribeStates('heat.pump_prerun_minutes'); // NEU

        // Abhängigkeiten
        this.adapter.subscribeStates('status.season_active');
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('pump.pump_switch');
        this.adapter.subscribeStates('temperature.surface.current');

        // Vorrangschaltung / Wartung
        this.adapter.subscribeStates('control.pump.maintenance_active');

        // ggf. vorhandene Foreign-ID abonnieren
        this._refreshForeignSubscription().catch(err =>
            this.adapter.log.warn(`[heatHelper] Foreign-Subscription Fehler: ${err.message}`),
        );

        this._safeEvaluate('init');
        this.adapter.log.info('[heatHelper] Initialisierung abgeschlossen.');
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        try {
            // Wenn die Ziel-Objekt-ID geändert wurde: Foreign subscription anpassen
            if (id.endsWith('heat.control_object_id') || id.endsWith('heat.control_type')) {
                await this._refreshForeignSubscription();
                await this._safeEvaluate('control_target_changed');
                return;
            }

            // Alles andere: neu bewerten
            if (
                id.endsWith('heat.control_active') ||
                id.endsWith('heat.target_temperature') ||
                id.endsWith('heat.max_temperature') ||
                id.endsWith('heat.pump_afterrun_minutes') ||
                id.endsWith('status.season_active') ||
                id.endsWith('pump.mode') ||
                id.endsWith('temperature.surface.current') ||
                id.endsWith('control.pump.maintenance_active') ||
                id.endsWith('heat.pump_prerun_minutes')
            ) {
                await this._safeEvaluate('state_change');
                return;
            }

            // Wenn jemand die Pumpe extern schaltet: Ownership ggf. zurücknehmen
            if (id.endsWith('pump.pump_switch')) {
                const pumpOn = !!state.val;
                if (!pumpOn && this._ownsPump) {
                    // wenn Pumpe aus geht obwohl wir "ownen", Ownership verlieren
                    this._ownsPump = false;
                }
                await this._safeEvaluate('pump_switch_changed');
                return;
            }
        } catch (err) {
            this.adapter.log.warn(`[heatHelper] Fehler in handleStateChange: ${err.message}`);
        }
    },

    // -------------------------------------------------------------
    // Core
    // -------------------------------------------------------------
    async _evaluate(_sourceTag = '') {
        const now = Date.now();
        if (now - this._lastEval < 250) {
            return;
        }
        this._lastEval = now;

        const seasonActive = !!(await this.adapter.getStateAsync('status.season_active'))?.val;
        const maintenanceActive = !!(await this.adapter.getStateAsync('control.pump.maintenance_active'))?.val;

        const pumpMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'auto';
        const heatEnabled = !!(await this.adapter.getStateAsync('heat.control_active'))?.val;

        const poolTempRaw = (await this.adapter.getStateAsync('temperature.surface.current'))?.val;
        const poolTemp = Number(poolTempRaw);

        const targetTemp = Number((await this.adapter.getStateAsync('heat.target_temperature'))?.val ?? 26);
        const maxTemp = Number((await this.adapter.getStateAsync('heat.max_temperature'))?.val ?? 30);

        const afterrunMin = Math.max(
            0,
            Number((await this.adapter.getStateAsync('heat.pump_afterrun_minutes'))?.val ?? 0) || 0,
        );

        const controlType = (await this.adapter.getStateAsync('heat.control_type'))?.val || 'socket';
        const controlObjectId = (await this.adapter.getStateAsync('heat.control_object_id'))?.val || '';

        // --- Hard conditions / Blocker ---
        if (!seasonActive) {
            return this._applyBlockedState('season_inactive', 'Poolsaison ist inaktiv', afterrunMin);
        }

        // Vorrangschaltung: Wartung blockiert IMMER
        if (maintenanceActive) {
            return this._applyBlockedState(
                'maintenance_active',
                'Wartungsmodus aktiv (Control hat Vorrang)',
                afterrunMin,
            );
        }

        // Heizungssteuerung deaktiviert
        if (!heatEnabled) {
            return this._applyOffState('heat_disabled', 'Heizungssteuerung deaktiviert', afterrunMin);
        }

        // Pumpenmodus: nur Automatik
        if (pumpMode !== 'auto') {
            return this._applyBlockedState(
                'mode_not_auto',
                `Pumpenmodus ist '${pumpMode}' (Heizung arbeitet nur in Automatik)`,
                afterrunMin,
            );
        }

        // Sensor plausibel?
        if (!Number.isFinite(poolTemp)) {
            return this._applyBlockedState(
                'no_pool_temp',
                'Keine gültige Pooltemperatur (temperature.surface.current)',
                afterrunMin,
            );
        }

        // Sicherheitsabschaltung: MaxTemp überschritten
        if (poolTemp >= maxTemp) {
            return this._applyOffState(
                'max_temp_reached',
                `Max-Temperatur erreicht (${poolTemp.toFixed(1)} °C ≥ ${maxTemp} °C)`,
                afterrunMin,
            );
        }

        // --- Heating logic (simple hysteresis-free) ---
        // Einschalten: unter Zieltemperatur
        // Ausschalten: bei Zieltemperatur erreicht/überschritten
        const shouldHeat = poolTemp < targetTemp;

        if (shouldHeat) {
            return this._startHeating({
                reason: `Heizen: Pool ${poolTemp.toFixed(1)} °C < Ziel ${targetTemp} °C`,
                controlType,
                controlObjectId,
            });
        }

        return this._stopHeating({
            reason: `Ziel erreicht: Pool ${poolTemp.toFixed(1)} °C ≥ Ziel ${targetTemp} °C`,
            controlType,
            controlObjectId,
            afterrunMin,
        });
    },

    // -------------------------------------------------------------
    // State transitions
    // -------------------------------------------------------------
    async _startHeating({ reason, controlType, controlObjectId }) {
        if (this._desiredHeat === true) {
            // nur Status/Reason ggf. aktualisieren
            await this._setHeatStates({
                active: true,
                blocked: false,
                mode: 'heating',
                reason,
                info: `control_type=${controlType}, target=${controlObjectId || '(leer)'}`,
                heatingRequest: true,
            });
            return;
        }

        // -------------------------------------------------
        // NEU: Pumpen-Prerun vor Heizstart
        // -------------------------------------------------
        const prerunMin = Math.max(
            0,
            Number((await this.adapter.getStateAsync('heat.pump_prerun_minutes'))?.val ?? 0) || 0,
        );

        const pumpState = await this.adapter.getStateAsync('pump.pump_switch');
        const pumpIsOn = !!pumpState?.val;

        // Prerun nur, wenn:
        // - Zeit > 0
        // - Pumpe aktuell AUS
        // - kein Prerun aktiv
        if (prerunMin > 0 && !pumpIsOn && !this._prerunTimer) {
            this.adapter.log.info(`[heatHelper] Starte Pumpen-Prerun (${prerunMin} min)`);

            // Pumpe einschalten + Ownership übernehmen
            this._ownsPump = true;
            await this.adapter.setStateAsync('pump.pump_switch', { val: true, ack: false });

            // Prerun-Status setzen
            await this.adapter.setStateAsync('heat.prerun_active', { val: true, ack: true });

            const holdMs = Math.round(prerunMin * 60 * 1000);

            this._prerunTimer = setTimeout(async () => {
                this._prerunTimer = null;

                await this.adapter.setStateAsync('heat.prerun_active', { val: false, ack: true });

                // Nach Prerun erneut bewerten → Heizung darf jetzt starten
                await this._safeEvaluate('prerun_done');
            }, holdMs);

            // WICHTIG: Heizung JETZT noch NICHT einschalten
            return;
        }

        this._desiredHeat = true;

        // Nachlauf ggf. abbrechen
        if (this._afterrunTimer) {
            clearTimeout(this._afterrunTimer);
            this._afterrunTimer = null;
        }

        // Heizung einschalten (wenn ID gesetzt)
        await this._setHeatingDevice(true, controlObjectId);

        // Pumpe einschalten (ownership)
        await this._ensurePumpOn();

        await this._setHeatStates({
            active: true,
            blocked: false,
            mode: 'heating',
            reason,
            info: `Heizung EIN | control_type=${controlType}`,
            heatingRequest: true,
        });

        this.adapter.log.info(`[heatHelper] Heizung EIN (${reason})`);
    },

    async _stopHeating({ reason, controlType, controlObjectId, afterrunMin }) {
        if (this._desiredHeat === false) {
            // nur Status/Reason ggf. aktualisieren
            await this._setHeatStates({
                active: false,
                blocked: false,
                mode: 'off',
                reason,
                info: `control_type=${controlType}`,
                heatingRequest: false,
            });
            return;
        }

        this._desiredHeat = false;

        // Heizung aus
        await this._setHeatingDevice(false, controlObjectId);

        // Signal für andere Systeme
        await this._setHeatStates({
            active: false,
            blocked: false,
            mode: 'afterrun',
            reason,
            info: `Heizung AUS | Nachlauf=${afterrunMin} min | control_type=${controlType}`,
            heatingRequest: false,
        });

        // Pumpen-Nachlauf nur, wenn wir die Pumpe eingeschaltet hatten
        await this._startAfterrunIfNeeded(afterrunMin, reason);

        this.adapter.log.info(`[heatHelper] Heizung AUS (${reason})`);
    },

    async _applyBlockedState(mode, reason, afterrunMin) {
        // NEU: laufenden Prerun abbrechen
        if (this._prerunTimer) {
            clearTimeout(this._prerunTimer);
            this._prerunTimer = null;
            await this.adapter.setStateAsync('heat.prerun_active', { val: false, ack: true });
        }

        // blockiert => Heizung aus, Request false
        await this._setHeatingDevice(false, (await this.adapter.getStateAsync('heat.control_object_id'))?.val || '');

        await this._setHeatStates({
            active: false,
            blocked: true,
            mode,
            reason,
            info: 'Heizung blockiert',
            heatingRequest: false,
        });

        // Nachlauf ggf. (nur wenn wir ownen)
        await this._startAfterrunIfNeeded(afterrunMin, reason);
    },

    async _applyOffState(mode, reason, afterrunMin) {
        // NEU: laufenden Prerun abbrechen
        if (this._prerunTimer) {
            clearTimeout(this._prerunTimer);
            this._prerunTimer = null;
            await this.adapter.setStateAsync('heat.prerun_active', { val: false, ack: true });
        }

        // off => Heizung aus, Request false
        await this._setHeatingDevice(false, (await this.adapter.getStateAsync('heat.control_object_id'))?.val || '');

        await this._setHeatStates({
            active: false,
            blocked: false,
            mode,
            reason,
            info: 'Heizung AUS',
            heatingRequest: false,
        });

        await this._startAfterrunIfNeeded(afterrunMin, reason);
    },

    // -------------------------------------------------------------
    // Pump handling (ownership protected)
    // -------------------------------------------------------------
    async _ensurePumpOn() {
        try {
            const pumpState = await this.adapter.getStateAsync('pump.pump_switch');
            const isOn = !!pumpState?.val;

            if (!isOn) {
                // wir schalten sie ein => ownership true
                this._ownsPump = true;
                await this.adapter.setStateAsync('pump.pump_switch', { val: true, ack: false });
                await this.adapter.setStateAsync('heat.afterrun_active', { val: false, ack: true });
            }
        } catch (err) {
            this.adapter.log.warn(`[heatHelper] Konnte Pumpe nicht einschalten: ${err.message}`);
        }
    },

    async _startAfterrunIfNeeded(afterrunMin, reason) {
        // nur wenn wir die Pumpe vorher selbst eingeschaltet haben
        if (!this._ownsPump) {
            await this.adapter.setStateAsync('heat.afterrun_active', { val: false, ack: true });
            return;
        }

        // wenn keine Nachlaufzeit: sofort aus
        if (!afterrunMin || afterrunMin <= 0) {
            await this._stopPumpNow('no_afterrun');
            return;
        }

        // Timer neu starten
        if (this._afterrunTimer) {
            clearTimeout(this._afterrunTimer);
            this._afterrunTimer = null;
        }

        await this.adapter.setStateAsync('heat.afterrun_active', { val: true, ack: true });

        const holdMs = Math.round(afterrunMin * 60 * 1000);
        this.adapter.log.debug(`[heatHelper] Pumpen-Nachlauf gestartet: ${afterrunMin} min (${reason})`);

        this._afterrunTimer = setTimeout(async () => {
            // Wenn inzwischen wieder Heizbedarf aktiv ist -> Nachlauf abbrechen
            if (this._desiredHeat === true) {
                this.adapter.log.debug('[heatHelper] Nachlauf abgebrochen – Heizen wieder aktiv.');
                return;
            }
            await this._stopPumpNow('afterrun_done');
        }, holdMs);
    },

    async _stopPumpNow(tag) {
        try {
            await this.adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
        } catch (err) {
            this.adapter.log.warn(`[heatHelper] Konnte Pumpe nicht ausschalten: ${err.message}`);
        } finally {
            this._ownsPump = false;
            await this.adapter.setStateAsync('heat.afterrun_active', { val: false, ack: true });
            await this.adapter.setStateAsync('heat.prerun_active', { val: false, ack: true });
            this.adapter.log.info(`[heatHelper] Pumpe AUS (${tag})`);
        }
    },

    // -------------------------------------------------------------
    // Heating device control (foreign state)
    // -------------------------------------------------------------
    async _setHeatingDevice(on, foreignId) {
        const id = String(foreignId || '').trim();
        if (!id) {
            // Kein Ziel => nur internes heating_request als Signal
            return;
        }

        try {
            await this.adapter.setForeignStateAsync(id, { val: !!on, ack: false });
        } catch (err) {
            this.adapter.log.warn(`[heatHelper] Konnte Heizung nicht setzen (${id}): ${err.message}`);
        }
    },

    async _setHeatStates({ active, blocked, mode, reason, info, heatingRequest }) {
        try {
            await this.adapter.setStateAsync('heat.active', { val: !!active, ack: true });
            await this.adapter.setStateAsync('heat.blocked', { val: !!blocked, ack: true });
            await this.adapter.setStateAsync('heat.mode', { val: String(mode ?? ''), ack: true });
            await this.adapter.setStateAsync('heat.reason', { val: String(reason ?? ''), ack: true });
            await this.adapter.setStateAsync('heat.info', { val: String(info ?? ''), ack: true });
            await this.adapter.setStateAsync('heat.heating_request', { val: !!heatingRequest, ack: true });
            await this.adapter.setStateAsync('heat.last_change', { val: Date.now(), ack: true });
        } catch (err) {
            this.adapter.log.warn(`[heatHelper] Fehler beim Schreiben der Heat-States: ${err.message}`);
        }
    },

    // -------------------------------------------------------------
    // Foreign subscribe handling
    // -------------------------------------------------------------
    async _refreshForeignSubscription() {
        const id = (await this.adapter.getStateAsync('heat.control_object_id'))?.val || '';
        const nextId = String(id).trim();

        if (nextId && nextId !== this._heatControlForeignId) {
            // neue ID abonnieren
            try {
                this.adapter.subscribeForeignStates(nextId);
                this.adapter.log.info(`[heatHelper] Subscribed Foreign-Heat-Control: "${nextId}"`);
            } catch (err) {
                this.adapter.log.warn(`[heatHelper] Konnte Foreign-State nicht abonnieren (${nextId}): ${err.message}`);
            }
            this._heatControlForeignId = nextId;
        }

        if (!nextId) {
            this._heatControlForeignId = '';
        }
    },

    async _safeEvaluate(tag) {
        try {
            await this._evaluate(tag);
        } catch (err) {
            this.adapter.log.warn(`[heatHelper] Evaluate-Fehler (${tag}): ${err.message}`);
        }
    },

    cleanup() {
        if (this._afterrunTimer) {
            clearTimeout(this._afterrunTimer);
            this._afterrunTimer = null;
        }
        if (this._prerunTimer) {
            clearTimeout(this._prerunTimer);
            this._prerunTimer = null;
        }

        this._ownsPump = false;
        this._desiredHeat = null;
    },
};

module.exports = heatHelper;

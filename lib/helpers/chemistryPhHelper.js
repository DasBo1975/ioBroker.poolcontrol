'use strict';

const { I18n } = require('@iobroker/adapter-core');

/**
 * chemistryPhHelper
 * -------------------------------------------------------------
 * pH evaluation helper for PoolControl.
 *
 * Scope:
 * - Manual pH input
 * - External ioBroker state as pH input
 * - Plausibility validation
 * - Measurement location logic
 * - pH recommendation text
 * - Manual mixing run
 *
 * No automatic dosing.
 * No chemical actuator control.
 * -------------------------------------------------------------
 */

const chemistryPhHelper = {
    adapter: null,

    sourceStateId: '',
    evalTimer: null,
    mixTimer: null,
    mixEndTs: 0,
    mixStartedPump: false,
    pumpStartTs: 0,

    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        void this._loadSourceState();
        this._scheduleEvaluation('init', 250);

        this.adapter.log.debug('[chemistryPhHelper] Initialized');
    },

    async _subscribeStates() {
        const ids = [
            'chemistry.ph.enabled',
            'chemistry.ph.input.source_mode',
            'chemistry.ph.input.source_state_id',
            'chemistry.ph.input.manual_value',
            'chemistry.ph.evaluation.target_min',
            'chemistry.ph.evaluation.target_max',
            'chemistry.ph.measurement.location',
            'chemistry.ph.measurement.flow_required',
            'chemistry.ph.measurement.stabilization_time_sec',
            'chemistry.ph.mix.start',
            'chemistry.ph.mix.runtime_minutes',
            'pump.pump_switch',
            'pump.active_helper',
            'status.season_active',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[chemistryPhHelper] Own states subscribed');
    },

    async _loadSourceState() {
        const stateId = await this._readString('chemistry.ph.input.source_state_id');

        if (!stateId) {
            this.sourceStateId = '';
            return;
        }

        this.sourceStateId = stateId;

        try {
            this.adapter.subscribeForeignStates(stateId);
            this.adapter.log.debug(`[chemistryPhHelper] Subscribed foreign pH source: ${stateId}`);
        } catch (err) {
            this.adapter.log.warn(
                `[chemistryPhHelper] Could not subscribe foreign pH source "${stateId}": ${err.message}`,
            );
        }
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        try {
            if (id.endsWith('chemistry.ph.input.source_state_id') && state.ack === false) {
                await this._handleSourceStateChanged(String(state.val || ''));
                return;
            }

            if (id.endsWith('chemistry.ph.mix.start') && state.ack === false && state.val === true) {
                await this._startMixingRun();
                await this.adapter.setStateChangedAsync('chemistry.ph.mix.start', { val: false, ack: true });
                return;
            }

            if (this.sourceStateId && id === this.sourceStateId) {
                await this._handleIncomingValue('state', state.val);
                return;
            }

            if (this._isRelevantOwnState(id)) {
                this._scheduleEvaluation(`state_change:${id}`, 250);
            }
        } catch (err) {
            this.adapter.log.warn(`[chemistryPhHelper] Error in handleStateChange: ${err.message}`);
        }
    },

    _isRelevantOwnState(id) {
        const relevant = [
            'chemistry.ph.enabled',
            'chemistry.ph.input.source_mode',
            'chemistry.ph.input.manual_value',
            'chemistry.ph.evaluation.target_min',
            'chemistry.ph.evaluation.target_max',
            'chemistry.ph.measurement.location',
            'chemistry.ph.measurement.flow_required',
            'chemistry.ph.measurement.stabilization_time_sec',
            'pump.pump_switch',
            'pump.active_helper',
            'status.season_active',
        ];

        return relevant.some(stateId => id.endsWith(stateId));
    },

    async _handleSourceStateChanged(newStateId) {
        if (this.sourceStateId && this.sourceStateId !== newStateId) {
            try {
                this.adapter.unsubscribeForeignStates(this.sourceStateId);
                this.adapter.log.debug(`[chemistryPhHelper] Unsubscribed old pH source: ${this.sourceStateId}`);
            } catch (err) {
                this.adapter.log.debug(`[chemistryPhHelper] Could not unsubscribe old pH source: ${err.message}`);
            }
        }

        this.sourceStateId = newStateId;

        if (newStateId) {
            try {
                this.adapter.subscribeForeignStates(newStateId);
                await this._setBool('chemistry.ph.input.source_valid', true);
                await this._setString(
                    'chemistry.ph.input.source_status',
                    I18n.translate('pH source state configured.'),
                );
                this.adapter.log.debug(`[chemistryPhHelper] Subscribed new pH source: ${newStateId}`);
            } catch (err) {
                await this._setBool('chemistry.ph.input.source_valid', false);
                await this._setString(
                    'chemistry.ph.input.source_status',
                    I18n.translate('pH source state could not be subscribed.'),
                );
                this.adapter.log.warn(
                    `[chemistryPhHelper] Could not subscribe new pH source "${newStateId}": ${err.message}`,
                );
            }
        } else {
            await this._setBool('chemistry.ph.input.source_valid', false);
            await this._setString('chemistry.ph.input.source_status', I18n.translate('No pH source state configured.'));
        }

        this._scheduleEvaluation('source_state_changed', 250);
    },

    async _handleIncomingValue(source, rawValue) {
        const mode = await this._readString('chemistry.ph.input.source_mode');

        if (mode !== 'state') {
            return;
        }

        await this._processValue(source, rawValue, 'external_state');
    },

    _scheduleEvaluation(reason, delayMs = 250) {
        if (this.evalTimer) {
            this.adapter.clearTimeout(this.evalTimer);
            this.evalTimer = null;
        }

        this.evalTimer = this.adapter.setTimeout(() => {
            this.evalTimer = null;
            void this._evaluate(reason);
        }, delayMs);
    },

    async _evaluate(reason = '') {
        try {
            const enabled = await this._readBoolean('chemistry.ph.enabled');

            if (!enabled) {
                await this._setString('chemistry.ph.evaluation.status', 'disabled');
                await this._setString(
                    'chemistry.ph.evaluation.recommendation',
                    I18n.translate('pH evaluation is disabled.'),
                );
                await this._setBool('chemistry.ph.evaluation.action_required', false);
                await this._setBool('chemistry.ph.measurement.allowed', false);
                await this._setString('chemistry.ph.measurement.ignored_reason', 'disabled');
                await this._setString('chemistry.ph.debug.last_reason', reason || 'disabled');
                await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(new Date()));
                return;
            }

            const mode = await this._readString('chemistry.ph.input.source_mode');

            if (mode === 'disabled') {
                await this._setBool('chemistry.ph.input.source_valid', false);
                await this._setBool('chemistry.ph.input.value_valid', false);
                await this._setString('chemistry.ph.input.source_status', I18n.translate('pH input is disabled.'));
                await this._setString('chemistry.ph.evaluation.status', 'disabled');
                await this._setString(
                    'chemistry.ph.evaluation.recommendation',
                    I18n.translate('No pH input source is active.'),
                );
                await this._setBool('chemistry.ph.evaluation.action_required', false);
                await this._setBool('chemistry.ph.measurement.allowed', false);
                await this._setString('chemistry.ph.measurement.ignored_reason', 'source_disabled');
                await this._setString('chemistry.ph.debug.last_reason', reason || 'source_disabled');
                await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(new Date()));
                return;
            }

            if (mode === 'manual') {
                const manualValue = await this._readNumber('chemistry.ph.input.manual_value');
                await this._processValue('manual', manualValue, reason || 'manual_value');
                return;
            }

            if (mode === 'state') {
                const sourceStateId = await this._readString('chemistry.ph.input.source_state_id');

                if (!sourceStateId) {
                    await this._setBool('chemistry.ph.input.source_valid', false);
                    await this._setBool('chemistry.ph.input.value_valid', false);
                    await this._setString(
                        'chemistry.ph.input.source_status',
                        I18n.translate('No pH source state configured.'),
                    );
                    await this._setString('chemistry.ph.evaluation.status', 'invalid');
                    await this._setString(
                        'chemistry.ph.evaluation.recommendation',
                        I18n.translate('No valid pH source is configured.'),
                    );
                    await this._setBool('chemistry.ph.evaluation.action_required', false);
                    await this._setBool('chemistry.ph.measurement.allowed', false);
                    await this._setString('chemistry.ph.measurement.ignored_reason', 'missing_source_state');
                    await this._setString('chemistry.ph.debug.last_reason', reason || 'missing_source_state');
                    await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(new Date()));
                    return;
                }

                let sourceState = null;

                try {
                    sourceState = await this.adapter.getForeignStateAsync(sourceStateId);
                } catch (err) {
                    await this._setBool('chemistry.ph.input.source_valid', false);
                    await this._setBool('chemistry.ph.input.value_valid', false);
                    await this._setString(
                        'chemistry.ph.input.source_status',
                        I18n.translate('pH source state could not be read.'),
                    );
                    await this._setString('chemistry.ph.evaluation.status', 'invalid');
                    await this._setString(
                        'chemistry.ph.evaluation.recommendation',
                        I18n.translate('The configured pH source could not be read.'),
                    );
                    await this._setBool('chemistry.ph.evaluation.action_required', false);
                    await this._setBool('chemistry.ph.measurement.allowed', false);
                    await this._setString('chemistry.ph.measurement.ignored_reason', 'source_read_error');
                    await this._setString('chemistry.ph.debug.last_reason', `source_read_error: ${err.message}`);
                    await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(new Date()));
                    return;
                }

                if (!sourceState) {
                    await this._setBool('chemistry.ph.input.source_valid', false);
                    await this._setBool('chemistry.ph.input.value_valid', false);
                    await this._setString(
                        'chemistry.ph.input.source_status',
                        I18n.translate('pH source state does not exist.'),
                    );
                    await this._setString('chemistry.ph.evaluation.status', 'invalid');
                    await this._setString(
                        'chemistry.ph.evaluation.recommendation',
                        I18n.translate('The configured pH source state does not exist.'),
                    );
                    await this._setBool('chemistry.ph.evaluation.action_required', false);
                    await this._setBool('chemistry.ph.measurement.allowed', false);
                    await this._setString('chemistry.ph.measurement.ignored_reason', 'source_not_found');
                    await this._setString('chemistry.ph.debug.last_reason', reason || 'source_not_found');
                    await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(new Date()));
                    return;
                }

                await this._processValue('state', sourceState.val, reason || 'state_value');
                return;
            }

            await this._setString('chemistry.ph.evaluation.status', 'invalid');
            await this._setString('chemistry.ph.evaluation.recommendation', I18n.translate('Unknown pH source mode.'));
            await this._setBool('chemistry.ph.evaluation.action_required', false);
            await this._setString('chemistry.ph.measurement.ignored_reason', 'unknown_source_mode');
            await this._setString('chemistry.ph.debug.last_reason', reason || 'unknown_source_mode');
            await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(new Date()));
        } catch (err) {
            this.adapter.log.warn(`[chemistryPhHelper] Evaluation failed: ${err.message}`);
        }
    },

    async _processValue(source, rawValue, reason) {
        const now = new Date();
        const value = Number(rawValue);

        await this._setString('chemistry.ph.input.last_value_at', this._formatDateTime(now));

        if (source === 'manual') {
            await this._setBool('chemistry.ph.input.source_valid', true);
            await this._setString('chemistry.ph.input.source_status', I18n.translate('Manual pH value is used.'));
        } else {
            await this._setBool('chemistry.ph.input.source_valid', true);
            await this._setString('chemistry.ph.input.source_status', I18n.translate('External pH source is valid.'));
        }

        const valueValid = Number.isFinite(value) && value >= 0 && value <= 14;

        await this._setNumber('chemistry.ph.input.current_value', Number.isFinite(value) ? value : 0);
        await this._setBool('chemistry.ph.input.value_valid', valueValid);

        if (!valueValid) {
            await this._setString('chemistry.ph.evaluation.status', 'invalid');
            await this._setString(
                'chemistry.ph.evaluation.recommendation',
                I18n.translate('The pH value is invalid. Please check the measurement or sensor.'),
            );
            await this._setBool('chemistry.ph.evaluation.action_required', false);
            await this._setBool('chemistry.ph.measurement.allowed', false);
            await this._setString('chemistry.ph.measurement.ignored_reason', 'invalid_value');
            await this._setString('chemistry.ph.debug.last_reason', reason || 'invalid_value');
            await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(now));
            return;
        }

        const measurementAllowed = await this._checkMeasurementAllowed(now);

        if (!measurementAllowed.allowed) {
            await this._setString('chemistry.ph.evaluation.status', measurementAllowed.status);
            await this._setString('chemistry.ph.evaluation.recommendation', measurementAllowed.recommendation);
            await this._setBool('chemistry.ph.evaluation.action_required', false);
            await this._setBool('chemistry.ph.measurement.allowed', false);
            await this._setString('chemistry.ph.measurement.ignored_reason', measurementAllowed.reason);
            await this._setString('chemistry.ph.debug.last_reason', reason || measurementAllowed.reason);
            await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(now));
            return;
        }

        await this._setBool('chemistry.ph.measurement.allowed', true);
        await this._setString('chemistry.ph.measurement.ignored_reason', '');

        await this._updateHistory(value, now);
        await this._evaluateValue(value);

        await this._setString('chemistry.ph.debug.last_reason', reason || 'value_processed');
        await this._setString('chemistry.ph.debug.last_update', this._formatDateTime(now));
    },

    async _checkMeasurementAllowed(now) {
        const location = await this._readString('chemistry.ph.measurement.location');
        const flowRequired = await this._readBoolean('chemistry.ph.measurement.flow_required');
        const pumpRunning = await this._readBoolean('pump.pump_switch');

        await this._setBool('chemistry.ph.measurement.pump_running', pumpRunning);

        const needsFlow = flowRequired || location === 'measurement_cell' || location === 'pipe_section';

        if (!needsFlow || location === 'pool' || location === 'manual') {
            await this._setBool('chemistry.ph.measurement.stabilized', true);
            return { allowed: true, reason: '', status: 'ok', recommendation: '' };
        }

        if (!pumpRunning) {
            this.pumpStartTs = 0;
            await this._setBool('chemistry.ph.measurement.stabilized', false);

            return {
                allowed: false,
                reason: 'pump_off',
                status: 'waiting_for_pump',
                recommendation: I18n.translate(
                    'pH evaluation is waiting for the pool pump because the sensor is in a measurement section.',
                ),
            };
        }

        if (!this.pumpStartTs) {
            this.pumpStartTs = now.getTime();
        }

        const stabilizationSec = Math.max(0, await this._readNumber('chemistry.ph.measurement.stabilization_time_sec'));
        const elapsedSec = Math.floor((now.getTime() - this.pumpStartTs) / 1000);
        const stabilized = elapsedSec >= stabilizationSec;

        await this._setBool('chemistry.ph.measurement.stabilized', stabilized);

        if (!stabilized) {
            return {
                allowed: false,
                reason: 'stabilization_pending',
                status: 'waiting_for_stabilization',
                recommendation: I18n.translate(
                    'pH evaluation is waiting until the measurement section has stabilized after pump start.',
                ),
            };
        }

        return { allowed: true, reason: '', status: 'ok', recommendation: '' };
    },

    async _updateHistory(value, now) {
        const lastValid = await this._readNumberOrNull('chemistry.ph.input.last_valid_value');
        const lastValidAt = await this._readString('chemistry.ph.input.last_valid_value_at');

        if (lastValid !== null && lastValidAt) {
            await this._setNumber('chemistry.ph.input.previous_value', lastValid);
            await this._setString('chemistry.ph.input.previous_value_at', lastValidAt);

            const previousDate = this._parseGermanDateTime(lastValidAt);

            if (previousDate) {
                const minutes = Math.max(0, Math.round((now.getTime() - previousDate.getTime()) / 60000));
                await this._setNumber('chemistry.ph.input.minutes_since_previous_value', minutes);
            }
        }

        await this._setNumber('chemistry.ph.input.last_valid_value', value);
        await this._setString('chemistry.ph.input.last_valid_value_at', this._formatDateTime(now));
    },

    async _evaluateValue(value) {
        const min = await this._readNumber('chemistry.ph.evaluation.target_min');
        const max = await this._readNumber('chemistry.ph.evaluation.target_max');

        if (value < min) {
            await this._setString('chemistry.ph.evaluation.status', 'low');
            await this._setString(
                'chemistry.ph.evaluation.recommendation',
                I18n.translate(
                    'pH value is too low. Check whether pH plus should be added according to the product instructions. Then circulate and measure again.',
                ),
            );
            await this._setBool('chemistry.ph.evaluation.action_required', true);
            return;
        }

        if (value > max) {
            await this._setString('chemistry.ph.evaluation.status', 'high');
            await this._setString(
                'chemistry.ph.evaluation.recommendation',
                I18n.translate(
                    'pH value is too high. Check whether pH minus should be added according to the product instructions. Then circulate and measure again.',
                ),
            );
            await this._setBool('chemistry.ph.evaluation.action_required', true);
            return;
        }

        await this._setString('chemistry.ph.evaluation.status', 'ok');
        await this._setString(
            'chemistry.ph.evaluation.recommendation',
            I18n.translate('pH value is within the target range. No action is required.'),
        );
        await this._setBool('chemistry.ph.evaluation.action_required', false);
    },

    async _startMixingRun() {
        const enabled = await this._readBoolean('chemistry.ph.enabled');

        if (!enabled) {
            await this._setString(
                'chemistry.ph.mix.status',
                I18n.translate('Mixing run was not started because pH evaluation is disabled.'),
            );
            return;
        }

        const seasonActive = await this._readBoolean('status.season_active');

        if (!seasonActive) {
            await this._setString(
                'chemistry.ph.mix.status',
                I18n.translate('Mixing run was not started because the pool season is inactive.'),
            );
            return;
        }

        const runtimeMin = Math.max(0, await this._readNumber('chemistry.ph.mix.runtime_minutes'));

        if (runtimeMin <= 0) {
            await this._setString(
                'chemistry.ph.mix.status',
                I18n.translate('Mixing run was not started because no runtime is configured.'),
            );
            return;
        }

        const activeHelper = await this._readString('pump.active_helper');

        if (activeHelper && activeHelper !== 'chemistryPhHelper') {
            await this._setString(
                'chemistry.ph.mix.status',
                I18n.translate('Mixing run was not started because another helper currently controls the pump.'),
            );
            return;
        }

        const pumpRunning = await this._readBoolean('pump.pump_switch');

        this.mixStartedPump = !pumpRunning;
        this.mixEndTs = Date.now() + runtimeMin * 60000;

        await this._setBool('chemistry.ph.mix.active', true);
        await this._setBool('chemistry.ph.mix.started_by_helper', this.mixStartedPump);
        await this._setNumber('chemistry.ph.mix.remaining_minutes', runtimeMin);

        if (this.mixStartedPump) {
            await this.adapter.setStateChangedAsync('pump.active_helper', { val: 'chemistryPhHelper', ack: true });
            await this.adapter.setStateChangedAsync('pump.pump_switch', { val: true, ack: false });
        }

        await this._setString(
            'chemistry.ph.mix.status',
            I18n.translate('pH mixing run started. No chemicals are dosed automatically.'),
        );

        this._scheduleMixTick();
    },

    _scheduleMixTick() {
        if (this.mixTimer) {
            this.adapter.clearTimeout(this.mixTimer);
            this.mixTimer = null;
        }

        this.mixTimer = this.adapter.setTimeout(() => {
            void this._mixTick();
        }, 30000);
    },

    async _mixTick() {
        const active = await this._readBoolean('chemistry.ph.mix.active');

        if (!active) {
            this._clearMixTimer();
            return;
        }

        const remainingMs = this.mixEndTs - Date.now();
        const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));

        await this._setNumber('chemistry.ph.mix.remaining_minutes', remainingMin);

        if (remainingMs <= 0) {
            await this._finishMixingRun();
            return;
        }

        this._scheduleMixTick();
    },

    async _finishMixingRun() {
        this._clearMixTimer();

        await this._setBool('chemistry.ph.mix.active', false);
        await this._setNumber('chemistry.ph.mix.remaining_minutes', 0);

        if (this.mixStartedPump) {
            const activeHelper = await this._readString('pump.active_helper');

            if (!activeHelper || activeHelper === 'chemistryPhHelper') {
                await this.adapter.setStateChangedAsync('pump.pump_switch', { val: false, ack: false });
                await this.adapter.setStateChangedAsync('pump.active_helper', { val: '', ack: true });
                await this._setString(
                    'chemistry.ph.mix.status',
                    I18n.translate('pH mixing run finished. Pump was switched off by the pH helper.'),
                );
            } else {
                await this._setString(
                    'chemistry.ph.mix.status',
                    I18n.translate(
                        'pH mixing run finished. Pump was not switched off because another helper is active.',
                    ),
                );
            }
        } else {
            await this._setString(
                'chemistry.ph.mix.status',
                I18n.translate(
                    'pH mixing run finished. Pump was already running and was not switched off by the pH helper.',
                ),
            );
        }

        this.mixStartedPump = false;
        this.mixEndTs = 0;

        await this._setBool('chemistry.ph.mix.started_by_helper', false);
    },

    _clearMixTimer() {
        if (this.mixTimer) {
            this.adapter.clearTimeout(this.mixTimer);
            this.mixTimer = null;
        }
    },

    async _readString(id) {
        const state = await this.adapter.getStateAsync(id);
        return String(state?.val ?? '');
    },

    async _readNumber(id) {
        const state = await this.adapter.getStateAsync(id);
        const value = Number(state?.val);
        return Number.isFinite(value) ? value : 0;
    },

    async _readNumberOrNull(id) {
        const state = await this.adapter.getStateAsync(id);
        const value = Number(state?.val);
        return Number.isFinite(value) ? value : null;
    },

    async _readBoolean(id) {
        const state = await this.adapter.getStateAsync(id);
        return !!state?.val;
    },

    async _setString(id, value) {
        await this.adapter.setStateChangedAsync(id, { val: String(value ?? ''), ack: true });
    },

    async _setNumber(id, value) {
        const numberValue = Number(value);
        await this.adapter.setStateChangedAsync(id, { val: Number.isFinite(numberValue) ? numberValue : 0, ack: true });
    },

    async _setBool(id, value) {
        await this.adapter.setStateChangedAsync(id, { val: !!value, ack: true });
    },

    _formatDateTime(date) {
        return date.toLocaleString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    },

    _parseGermanDateTime(value) {
        const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})$/);

        if (!match) {
            return null;
        }

        const [, day, month, year, hour, minute, second] = match;
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    },

    cleanup() {
        if (this.evalTimer) {
            this.adapter.clearTimeout(this.evalTimer);
            this.evalTimer = null;
        }

        if (this.mixTimer) {
            this.adapter.clearTimeout(this.mixTimer);
            this.mixTimer = null;
        }

        this.adapter = null;
        this.sourceStateId = '';
        this.mixEndTs = 0;
        this.mixStartedPump = false;
        this.pumpStartTs = 0;
    },
};

module.exports = chemistryPhHelper;

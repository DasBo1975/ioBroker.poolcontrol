'use strict';

const { I18n } = require('@iobroker/adapter-core');
const MAX_HISTORY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_SAMPLES = 672;
const MAX_HISTORY_BYTES = 64 * 1024;
const MIN_SAMPLE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_DAILY_HISTORY_AGE_MS = 32 * 24 * 60 * 60 * 1000;
const MAX_DAILY_HISTORY_SAMPLES = 32;
const MAX_DAILY_HISTORY_BYTES = 8 * 1024;
const DAILY_REFERENCE_TOLERANCE_MS = 4 * 24 * 60 * 60 * 1000;

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

            if (id.endsWith('chemistry.ph.input.manual_value') && state.ack === false) {
                await this._processValue('manual', state.val, 'manual_value');
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
                const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
                await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX
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
                const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
                await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX
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
                    const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
                    await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX
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
                    const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
                    await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX
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
                    const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
                    await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX
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
            const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
            await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX
        } catch (err) {
            this.adapter.log.warn(`[chemistryPhHelper] Evaluation failed: ${err.message}`);
        }
    },

    async _processValue(source, rawValue, reason) {
        const now = new Date();
        const value = Number(rawValue);

        await this._setNumber('chemistry.ph.input.last_value_at', now.getTime()); // FIX: value.time uses numeric ms timestamp.

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
            await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX: value.time uses numeric ms timestamp.
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
            await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX: value.time uses numeric ms timestamp.
            return;
        }

        await this._setBool('chemistry.ph.measurement.allowed', true);
        await this._setString('chemistry.ph.measurement.ignored_reason', '');

        await this._updateLastValues(value, now);

        const history = await this._updateHistory(value, now, reason === 'manual_value');
        const trend = await this._calculateTrend(value, now, history.samples, history.dailySamples);
        const evaluation = await this._evaluateValue(value);

        await this._writeTrend(trend);
        await this._writeOutputs(value, trend, evaluation);

        await this._setString('chemistry.ph.debug.last_reason', reason || 'value_processed');
        await this._setNumber('chemistry.ph.debug.last_update', now.getTime()); // FIX: value.time uses numeric ms timestamp.
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

    async _updateLastValues(value, now) {
        const lastValid = await this._readNumberOrNull('chemistry.ph.input.last_valid_value');
        const lastValidAt = await this._readTimestampOrNull('chemistry.ph.input.last_valid_value_at'); // FIX: accept numeric ms timestamps and legacy German strings.

        if (lastValid !== null && lastValidAt) {
            await this._setNumber('chemistry.ph.input.previous_value', lastValid);
            await this._setNumber('chemistry.ph.input.previous_value_at', lastValidAt); // FIX: pass stored timestamp through unchanged.

            const minutes = Math.max(0, Math.round((now.getTime() - lastValidAt) / 60000)); // FIX: calculate from numeric ms timestamp.
            await this._setNumber('chemistry.ph.input.minutes_since_previous_value', minutes);
        }

        await this._setNumber('chemistry.ph.input.last_valid_value', value);
        await this._setNumber('chemistry.ph.input.last_valid_value_at', now.getTime()); // FIX: value.time uses numeric ms timestamp.
    },

    async _updateHistory(value, now, forceSample) {
        let samples = await this._readJsonArray('chemistry.ph.history.samples_json');
        const dailySeedSamples = samples;
        const nowTs = now.getTime();
        const minTs = nowTs - MAX_HISTORY_AGE_MS;

        samples = samples.filter(sample => sample.ts >= minTs && sample.ts <= nowTs);

        const newest = samples.length ? samples[samples.length - 1] : null;
        const newestTs = newest ? Number(newest.ts) : 0;
        const withinSampleInterval = newest && nowTs - newestTs < MIN_SAMPLE_INTERVAL_MS;
        const sameValue = newest && Number(newest.value) === value;
        const shouldStore = !newest || !withinSampleInterval || (forceSample && !sameValue);

        if (shouldStore) {
            samples.push({
                ts: nowTs,
                time: this._formatDateTime(now),
                value,
            });
        }

        samples = samples.filter(sample => sample.ts >= minTs && sample.ts <= nowTs).slice(-MAX_HISTORY_SAMPLES);

        const preparedHistory = this._prepareHistoryForWrite(samples, 'chemistry.ph.history.samples_json');
        samples = preparedHistory.samples;

        await this._setString('chemistry.ph.history.samples_json', preparedHistory.json);
        await this._setNumber('chemistry.ph.history.samples_count', samples.length);

        if (samples.length) {
            await this._setNumber(
                // FIX: history value.time states store sample timestamps, not readable strings.
                'chemistry.ph.history.oldest_sample_at',
                Number(samples[0].ts),
            );
            await this._setNumber(
                // FIX: history value.time states store sample timestamps, not readable strings.
                'chemistry.ph.history.newest_sample_at',
                Number(samples[samples.length - 1].ts),
            );
        }

        const dailySamples = await this._updateDailyHistory(dailySeedSamples, value, now, shouldStore);
        return { samples, dailySamples };
    },

    async _calculateTrend(currentValue, now, samples, dailySamples) {
        const nowTs = now.getTime();

        const ref24h = this._findReferenceSample(samples, nowTs - 24 * 60 * 60 * 1000);
        const ref7d = this._findReferenceSample(samples, nowTs - 7 * 24 * 60 * 60 * 1000);
        const ref30d = this._findReferenceSample(
            dailySamples,
            nowTs - 30 * 24 * 60 * 60 * 1000,
            DAILY_REFERENCE_TOLERANCE_MS,
        );

        const delta24h = ref24h ? currentValue - ref24h.value : 0;
        const delta7d = ref7d ? currentValue - ref7d.value : 0;
        const delta30d = ref30d ? currentValue - ref30d.value : 0;

        const direction = this._getOverallDirection(ref24h, ref7d, ref30d, delta24h, delta7d, delta30d);
        const status = this._getTrendStatus(delta24h, delta7d, delta30d, ref24h, ref7d, ref30d);

        return {
            ref24h,
            ref7d,
            ref30d,
            delta24h,
            delta7d,
            delta30d,
            direction,
            status,
        };
    },

    _findReferenceSample(samples, targetTs, toleranceMs = null) {
        if (!samples.length) {
            return null;
        }

        let best = null;
        let bestDistance = Number.MAX_SAFE_INTEGER;

        for (const sample of samples) {
            const ts = Number(sample.ts);
            const value = Number(sample.value ?? sample.last);

            if (!Number.isFinite(ts) || !Number.isFinite(value)) {
                continue;
            }

            const distance = Math.abs(ts - targetTs);

            if (distance < bestDistance) {
                bestDistance = distance;
                best = {
                    ts,
                    value,
                    time: sample.time || this._formatDateTime(new Date(ts)),
                };
            }
        }

        return toleranceMs === null || bestDistance <= toleranceMs ? best : null;
    },

    _getOverallDirection(ref24h, ref7d, ref30d, delta24h, delta7d, delta30d) {
        const available = [ref24h ? delta24h : null, ref7d ? delta7d : null, ref30d ? delta30d : null].filter(
            value => value !== null,
        );

        if (!available.length) {
            return 'not_enough_data';
        }

        const strongest = available.reduce((prev, current) => (Math.abs(current) > Math.abs(prev) ? current : prev), 0);

        if (Math.abs(strongest) < 0.05) {
            return 'stable';
        }

        return strongest > 0 ? 'rising' : 'falling';
    },

    _getTrendStatus(delta24h, delta7d, delta30d, ref24h, ref7d, ref30d) {
        if (!ref24h && !ref7d && !ref30d) {
            return 'not_enough_data';
        }

        if (delta24h > 0.2 || delta7d > 0.4 || delta30d > 0.6) {
            return 'rising_fast';
        }

        if (delta24h > 0.1 || delta7d > 0.25 || delta30d > 0.4) {
            return 'rising_noticeable';
        }

        if (delta24h > 0.05 || delta7d > 0.15 || delta30d > 0.25) {
            return 'rising_slowly';
        }

        if (delta24h < -0.05 || delta7d < -0.15 || delta30d < -0.25) {
            return 'falling';
        }

        return 'stable';
    },

    async _writeTrend(trend) {
        await this._setNumber('chemistry.ph.trend.reference_24h_value', trend.ref24h ? trend.ref24h.value : 0);
        await this._setNumber('chemistry.ph.trend.reference_24h_at', trend.ref24h ? trend.ref24h.ts : 0); // FIX
        await this._setNumber('chemistry.ph.trend.delta_24h', trend.ref24h ? trend.delta24h : 0);

        await this._setNumber('chemistry.ph.trend.reference_7d_value', trend.ref7d ? trend.ref7d.value : 0);
        await this._setNumber('chemistry.ph.trend.reference_7d_at', trend.ref7d ? trend.ref7d.ts : 0); // FIX
        await this._setNumber('chemistry.ph.trend.delta_7d', trend.ref7d ? trend.delta7d : 0);

        await this._setNumber('chemistry.ph.trend.reference_30d_value', trend.ref30d ? trend.ref30d.value : 0);
        await this._setNumber('chemistry.ph.trend.reference_30d_at', trend.ref30d ? trend.ref30d.ts : 0); // FIX
        await this._setNumber('chemistry.ph.trend.delta_30d', trend.ref30d ? trend.delta30d : 0);

        await this._setString('chemistry.ph.trend.direction', trend.direction);
        await this._setString('chemistry.ph.trend.status', trend.status);
    },

    async _writeOutputs(value, trend, evaluation) {
        const text =
            `${I18n.translate('Current pH value')}: ${value.toFixed(2)}. ` +
            `24h: ${trend.ref24h ? this._formatDelta(trend.delta24h) : I18n.translate('not enough data')}, ` +
            `7d: ${trend.ref7d ? this._formatDelta(trend.delta7d) : I18n.translate('not enough data')}, ` +
            `30d: ${trend.ref30d ? this._formatDelta(trend.delta30d) : I18n.translate('not enough data')}. ` +
            `${evaluation.recommendation}`;

        const html =
            `<div>` +
            `<b>${I18n.translate('Current pH value')}:</b> ${value.toFixed(2)}<br>` +
            `<b>24h:</b> ${trend.ref24h ? `${trend.ref24h.value.toFixed(2)} / ${this._formatDelta(trend.delta24h)}` : I18n.translate('not enough data')}<br>` +
            `<b>7d:</b> ${trend.ref7d ? `${trend.ref7d.value.toFixed(2)} / ${this._formatDelta(trend.delta7d)}` : I18n.translate('not enough data')}<br>` +
            `<b>30d:</b> ${trend.ref30d ? `${trend.ref30d.value.toFixed(2)} / ${this._formatDelta(trend.delta30d)}` : I18n.translate('not enough data')}<br>` +
            `<b>${I18n.translate('Trend status')}:</b> ${trend.status}<br>` +
            `<b>${I18n.translate('Status')}:</b> ${evaluation.status}<br>` +
            `<b>${I18n.translate('Recommendation')}:</b> ${this._escapeHtml(evaluation.recommendation)}` +
            `</div>`;

        const json = {
            current: Number(value.toFixed(2)),
            unit: 'pH',
            trend_24h: {
                reference: trend.ref24h ? Number(trend.ref24h.value.toFixed(2)) : null,
                delta: trend.ref24h ? Number(trend.delta24h.toFixed(2)) : null,
            },
            trend_7d: {
                reference: trend.ref7d ? Number(trend.ref7d.value.toFixed(2)) : null,
                delta: trend.ref7d ? Number(trend.delta7d.toFixed(2)) : null,
            },
            trend_30d: {
                reference: trend.ref30d ? Number(trend.ref30d.value.toFixed(2)) : null,
                delta: trend.ref30d ? Number(trend.delta30d.toFixed(2)) : null,
            },
            direction: trend.direction,
            trend_status: trend.status,
            status: evaluation.status,
            action_required: evaluation.actionRequired,
            recommendation: evaluation.recommendation,
        };

        await this._setString('chemistry.ph.outputs.summary_text', text);
        await this._setString('chemistry.ph.outputs.summary_html', html);
        await this._setString('chemistry.ph.outputs.summary_json', JSON.stringify(json));
    },

    async _evaluateValue(value) {
        const min = await this._readNumber('chemistry.ph.evaluation.target_min');
        const max = await this._readNumber('chemistry.ph.evaluation.target_max');

        if (value < min) {
            const recommendation = I18n.translate(
                'pH value is too low. Check whether pH plus should be added according to the product instructions. Then circulate and measure again.',
            );

            await this._setString('chemistry.ph.evaluation.status', 'low');
            await this._setString('chemistry.ph.evaluation.recommendation', recommendation);
            await this._setBool('chemistry.ph.evaluation.action_required', true);

            return {
                status: 'low',
                actionRequired: true,
                recommendation,
            };
        }

        if (value > max) {
            const recommendation = I18n.translate(
                'pH value is too high. Check whether pH minus should be added according to the product instructions. Then circulate and measure again.',
            );

            await this._setString('chemistry.ph.evaluation.status', 'high');
            await this._setString('chemistry.ph.evaluation.recommendation', recommendation);
            await this._setBool('chemistry.ph.evaluation.action_required', true);

            return {
                status: 'high',
                actionRequired: true,
                recommendation,
            };
        }

        const recommendation = I18n.translate('pH value is within the target range. No action is required.');

        await this._setString('chemistry.ph.evaluation.status', 'ok');
        await this._setString('chemistry.ph.evaluation.recommendation', recommendation);
        await this._setBool('chemistry.ph.evaluation.action_required', false);

        return {
            status: 'ok',
            actionRequired: false,
            recommendation,
        };
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

    async _readTimestampOrNull(id) {
        const state = await this.adapter.getStateAsync(id);
        const value = state?.val;
        const numberValue = Number(value);

        if (Number.isFinite(numberValue) && numberValue > 0) {
            return numberValue; // FIX: numeric value.time timestamps are used directly.
        }

        const legacyDate = this._parseGermanDateTime(value); // FIX: keep backward compatibility for old string values.
        return legacyDate ? legacyDate.getTime() : null;
    },

    async _updateDailyHistory(shortTermSamples, value, now, sampleStored) {
        const id = 'chemistry.ph.history.daily_json';
        let dailySamples = await this._readDailyJson(id);
        const nowTs = now.getTime();
        const minTs = nowTs - MAX_DAILY_HISTORY_AGE_MS;
        const initializeFromSeeds = dailySamples.length === 0;

        if (initializeFromSeeds) {
            const legacyValueState = await this.adapter.getStateAsync('chemistry.ph.trend.reference_30d_value');
            const legacyAtState = await this.adapter.getStateAsync('chemistry.ph.trend.reference_30d_at');
            const legacyValue = Number(legacyValueState?.val);
            const legacyTs = Number(legacyAtState?.val);

            if (
                Number.isFinite(legacyValue) &&
                legacyValue >= 0 &&
                legacyValue <= 14 &&
                Number.isFinite(legacyTs) &&
                legacyTs >= minTs &&
                legacyTs <= nowTs &&
                !shortTermSamples.some(sample => this._dayKey(sample.ts) === this._dayKey(legacyTs))
            ) {
                this._addDailySample(dailySamples, legacyTs, legacyValue);
            }

            for (const sample of shortTermSamples) {
                if (sample.ts >= minTs && sample.ts <= nowTs) {
                    this._addDailySample(dailySamples, sample.ts, sample.value);
                }
            }
            if (sampleStored) {
                this._addDailySample(dailySamples, nowTs, value);
            }
        } else if (sampleStored) {
            this._addDailySample(dailySamples, nowTs, value);
        }

        dailySamples = dailySamples
            .filter(sample => sample.ts >= minTs && sample.ts <= nowTs)
            .sort((a, b) => a.ts - b.ts)
            .slice(-MAX_DAILY_HISTORY_SAMPLES);

        const preparedHistory = this._prepareDailyHistoryForWrite(dailySamples, id);
        await this._setString(id, preparedHistory.json);
        return preparedHistory.samples;
    },

    _addDailySample(dailySamples, sampleTs, value) {
        const day = this._dayKey(sampleTs);
        const existing = dailySamples.find(sample => sample.day === day);

        if (!existing) {
            dailySamples.push({
                day,
                ts: this._dayStartTs(sampleTs),
                min: value,
                max: value,
                avg: value,
                last: value,
                count: 1,
            });
            return;
        }

        existing.min = Math.min(existing.min, value);
        existing.max = Math.max(existing.max, value);
        existing.avg = (existing.avg * existing.count + value) / (existing.count + 1);
        existing.last = value;
        existing.count += 1;
    },

    async _readDailyJson(id) {
        const state = await this.adapter.getStateAsync(id);
        const rawValue = state?.val;

        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return [];
        }

        if (typeof rawValue !== 'string') {
            this.adapter.log.warn(`[chemistryPhHelper] Ignoring non-string daily history state ${id}.`);
            return [];
        }

        if (Buffer.byteLength(rawValue, 'utf8') > MAX_DAILY_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryPhHelper] Ignoring oversized daily history state ${id} (> 8 KB).`);
            return [];
        }

        try {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
                return [];
            }

            const nowTs = Date.now();
            const normalized = parsed
                .map(sample => {
                    const sourceTs = Number(sample?.ts);
                    const legacyValue = Number(sample?.value);
                    const min = Number(sample?.min ?? legacyValue);
                    const max = Number(sample?.max ?? legacyValue);
                    const avg = Number(sample?.avg ?? legacyValue);
                    const last = Number(sample?.last ?? legacyValue);
                    const count = sample?.count === undefined ? 1 : Number(sample.count);

                    if (!Number.isFinite(sourceTs) || sourceTs <= 0 || sourceTs > nowTs) {
                        return null;
                    }
                    if (
                        !Number.isFinite(min) ||
                        !Number.isFinite(max) ||
                        !Number.isFinite(avg) ||
                        !Number.isFinite(last) ||
                        min < 0 ||
                        max > 14 ||
                        min > max ||
                        avg < min ||
                        avg > max ||
                        last < min ||
                        last > max
                    ) {
                        return null;
                    }
                    if (!Number.isInteger(count) || count < 1 || count > 1000000) {
                        return null;
                    }

                    return {
                        day: this._dayKey(sourceTs),
                        ts: this._dayStartTs(sourceTs),
                        min,
                        max,
                        avg,
                        last,
                        count,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.ts - b.ts);

            const byDay = new Map();
            for (const sample of normalized) {
                if (!byDay.has(sample.day)) {
                    byDay.set(sample.day, sample);
                }
            }
            return [...byDay.values()].slice(-MAX_DAILY_HISTORY_SAMPLES);
        } catch {
            return [];
        }
    },

    _prepareDailyHistoryForWrite(samples, id) {
        let limitedSamples = samples.slice(-MAX_DAILY_HISTORY_SAMPLES);
        let json = JSON.stringify(limitedSamples);
        let trimmedForSize = false;

        while (limitedSamples.length && Buffer.byteLength(json, 'utf8') > MAX_DAILY_HISTORY_BYTES) {
            limitedSamples = limitedSamples.slice(1);
            json = JSON.stringify(limitedSamples);
            trimmedForSize = true;
        }

        if (trimmedForSize) {
            this.adapter.log.warn(`[chemistryPhHelper] Daily history ${id} was trimmed to stay within 8 KB.`);
        }

        if (Buffer.byteLength(json, 'utf8') > MAX_DAILY_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryPhHelper] Daily history ${id} could not be limited; resetting it.`);
            return { samples: [], json: '[]' };
        }

        return { samples: limitedSamples, json };
    },

    _dayKey(ts) {
        const date = new Date(ts);
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return [year, month, day].join('-');
    },

    _dayStartTs(ts) {
        const date = new Date(ts);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    },

    async _readJsonArray(id) {
        const state = await this.adapter.getStateAsync(id);
        const rawValue = state?.val;

        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return [];
        }

        if (typeof rawValue !== 'string') {
            this.adapter.log.warn(`[chemistryPhHelper] Ignoring non-string history state ${id}.`);
            return [];
        }

        if (Buffer.byteLength(rawValue, 'utf8') > MAX_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryPhHelper] Ignoring oversized history state ${id} (> 64 KB).`);
            return [];
        }

        try {
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
                return [];
            }

            const nowTs = Date.now();
            return parsed
                .map(sample => {
                    const ts = Number(sample?.ts);
                    const value = Number(sample?.value);
                    if (!Number.isFinite(ts) || ts <= 0 || ts > nowTs) {
                        return null;
                    }
                    if (!Number.isFinite(value) || value < 0 || value > 14) {
                        return null;
                    }
                    return { ts, time: this._formatDateTime(new Date(ts)), value };
                })
                .filter(Boolean)
                .sort((a, b) => a.ts - b.ts)
                .slice(-MAX_HISTORY_SAMPLES);
        } catch {
            return [];
        }
    },

    _prepareHistoryForWrite(samples, id) {
        let limitedSamples = samples.slice(-MAX_HISTORY_SAMPLES);
        let json = JSON.stringify(limitedSamples);
        let trimmedForSize = false;

        while (limitedSamples.length && Buffer.byteLength(json, 'utf8') > MAX_HISTORY_BYTES) {
            limitedSamples = limitedSamples.slice(1);
            json = JSON.stringify(limitedSamples);
            trimmedForSize = true;
        }

        if (trimmedForSize) {
            this.adapter.log.warn(`[chemistryPhHelper] History ${id} was trimmed to stay within 64 KB.`);
        }

        if (Buffer.byteLength(json, 'utf8') > MAX_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryPhHelper] History ${id} could not be limited safely; resetting it.`);
            return { samples: [], json: '[]' };
        }

        return { samples: limitedSamples, json };
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

    _formatDelta(value) {
        const rounded = Number(value) || 0;
        return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
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

    _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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

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

const chemistryOrpHelper = {
    adapter: null,
    sourceStateId: '',
    evalTimer: null,
    pumpStartTs: 0,

    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        void this._loadSourceState();
        void this._updatePhReference();
        this._scheduleEvaluation('init', 500);

        this.adapter.log.debug('[chemistryOrpHelper] Initialized');
    },

    async _subscribeStates() {
        const ids = [
            'chemistry.orp.enabled',
            'chemistry.orp.input.source_mode',
            'chemistry.orp.input.source_state_id',
            'chemistry.orp.input.manual_value',
            'chemistry.orp.measurement.location',
            'chemistry.orp.measurement.flow_required',
            'chemistry.orp.measurement.stabilization_time_sec',
            'chemistry.orp.evaluation.target_min_mv',
            'chemistry.orp.evaluation.target_max_mv',
            'chemistry.ph.enabled',
            'chemistry.ph.input.current_value',
            'pump.pump_switch',
            'status.season_active',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[chemistryOrpHelper] Own states subscribed');
    },

    async _loadSourceState() {
        const stateId = await this._readString('chemistry.orp.input.source_state_id');

        if (!stateId) {
            this.sourceStateId = '';
            return;
        }

        this.sourceStateId = stateId;

        try {
            this.adapter.subscribeForeignStates(stateId);
            this.adapter.log.debug(`[chemistryOrpHelper] Subscribed foreign ORP source: ${stateId}`);
        } catch (err) {
            this.adapter.log.warn(
                `[chemistryOrpHelper] Could not subscribe foreign ORP source "${stateId}": ${err.message}`,
            );
        }
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        try {
            if (id.endsWith('chemistry.orp.input.source_state_id') && state.ack === false) {
                await this._handleSourceStateChanged(String(state.val || ''));
                return;
            }

            if (this.sourceStateId && id === this.sourceStateId) {
                await this._handleIncomingValue('state', state.val, 'external_state');
                return;
            }

            if (id.endsWith('chemistry.orp.input.manual_value') && state.ack === false) {
                await this._handleIncomingValue('manual', state.val, 'manual_value');
                return;
            }

            if (id.endsWith('chemistry.ph.enabled') || id.endsWith('chemistry.ph.input.current_value')) {
                await this._updatePhReference();
            }

            if (this._isRelevantOwnState(id)) {
                this._scheduleEvaluation(`state_change:${id}`, 500);
            }
        } catch (err) {
            this.adapter.log.warn(`[chemistryOrpHelper] Error in handleStateChange: ${err.message}`);
        }
    },

    _isRelevantOwnState(id) {
        const relevant = [
            'chemistry.orp.enabled',
            'chemistry.orp.input.source_mode',
            'chemistry.orp.measurement.location',
            'chemistry.orp.measurement.flow_required',
            'chemistry.orp.measurement.stabilization_time_sec',
            'chemistry.orp.evaluation.target_min_mv',
            'chemistry.orp.evaluation.target_max_mv',
            'chemistry.ph.enabled',
            'chemistry.ph.input.current_value',
            'pump.pump_switch',
            'status.season_active',
        ];

        return relevant.some(stateId => id.endsWith(stateId));
    },

    async _handleSourceStateChanged(newStateId) {
        if (this.sourceStateId && this.sourceStateId !== newStateId) {
            try {
                this.adapter.unsubscribeForeignStates(this.sourceStateId);
            } catch (err) {
                this.adapter.log.debug(`[chemistryOrpHelper] Could not unsubscribe old ORP source: ${err.message}`);
            }
        }

        this.sourceStateId = newStateId;

        if (!newStateId) {
            await this._setBool('chemistry.orp.input.source_valid', false);
            await this._setString(
                'chemistry.orp.input.source_status',
                I18n.translate('No ORP source state configured.'),
            );
            this._scheduleEvaluation('source_state_removed', 500);
            return;
        }

        try {
            this.adapter.subscribeForeignStates(newStateId);
            await this._setBool('chemistry.orp.input.source_valid', true);
            await this._setString('chemistry.orp.input.source_status', I18n.translate('ORP source state configured.'));
        } catch (err) {
            await this._setBool('chemistry.orp.input.source_valid', false);
            await this._setString(
                'chemistry.orp.input.source_status',
                I18n.translate('ORP source state could not be subscribed.'),
            );
            this.adapter.log.warn(
                `[chemistryOrpHelper] Could not subscribe new ORP source "${newStateId}": ${err.message}`,
            );
        }

        this._scheduleEvaluation('source_state_changed', 500);
    },

    async _handleIncomingValue(source, rawValue, reason) {
        const mode = await this._readString('chemistry.orp.input.source_mode');

        if (source === 'manual' && mode !== 'manual') {
            return;
        }

        if (source === 'state' && mode !== 'state') {
            return;
        }

        await this._processValue(source, rawValue, reason, source === 'manual');
    },

    _scheduleEvaluation(reason, delayMs = 500) {
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
        const enabled = await this._readBoolean('chemistry.orp.enabled');

        if (!enabled) {
            await this._writeDisabled(reason || 'disabled');
            return;
        }

        const mode = await this._readString('chemistry.orp.input.source_mode');

        if (mode === 'disabled') {
            await this._setBool('chemistry.orp.input.source_valid', false);
            await this._setBool('chemistry.orp.input.value_valid', false);
            await this._setString('chemistry.orp.input.source_status', I18n.translate('ORP input is disabled.'));
            await this._writeDisabled(reason || 'source_disabled');
            return;
        }

        if (mode === 'manual') {
            const manualValue = await this._readNumber('chemistry.orp.input.manual_value');
            await this._processValue('manual', manualValue, reason || 'manual_evaluation', false);
            return;
        }

        if (mode === 'state') {
            const sourceStateId = await this._readString('chemistry.orp.input.source_state_id');

            if (!sourceStateId) {
                await this._writeInvalid(I18n.translate('No valid ORP source is configured.'), 'missing_source_state');
                return;
            }

            try {
                const sourceState = await this.adapter.getForeignStateAsync(sourceStateId);

                if (!sourceState) {
                    await this._writeInvalid(
                        I18n.translate('The configured ORP source state does not exist.'),
                        'source_not_found',
                    );
                    return;
                }

                await this._processValue('state', sourceState.val, reason || 'state_evaluation', false);
            } catch (err) {
                await this._writeInvalid(
                    I18n.translate('The configured ORP source could not be read.'),
                    `source_read_error: ${err.message}`,
                );
            }

            return;
        }

        await this._writeInvalid(I18n.translate('Unknown ORP source mode.'), 'unknown_source_mode');
    },

    async _processValue(source, rawValue, reason, forceSample) {
        const now = new Date();
        const value = Number(rawValue);

        await this._setNumber('chemistry.orp.input.last_value_at', now.getTime()); // FIX: value.time uses numeric ms timestamp.

        if (source === 'manual') {
            await this._setBool('chemistry.orp.input.source_valid', true);
            await this._setString('chemistry.orp.input.source_status', I18n.translate('Manual ORP value is used.'));
        } else {
            await this._setBool('chemistry.orp.input.source_valid', true);
            await this._setString('chemistry.orp.input.source_status', I18n.translate('External ORP source is valid.'));
        }

        const valueValid = Number.isFinite(value) && value >= 0 && value <= 1200;

        await this._setNumber('chemistry.orp.input.current_value', Number.isFinite(value) ? value : 0);
        await this._setBool('chemistry.orp.input.value_valid', valueValid);

        if (!valueValid) {
            await this._writeInvalid(
                I18n.translate('The ORP value is invalid. Please check the measurement or sensor.'),
                reason || 'invalid_value',
            );
            return;
        }

        const measurementAllowed = await this._checkMeasurementAllowed(now);

        if (!measurementAllowed.allowed) {
            await this._setBool('chemistry.orp.measurement.allowed', false);
            await this._setString('chemistry.orp.measurement.ignored_reason', measurementAllowed.reason);
            await this._setString('chemistry.orp.evaluation.status', measurementAllowed.status);
            await this._setString('chemistry.orp.evaluation.level', 'info');
            await this._setString('chemistry.orp.evaluation.recommendation', measurementAllowed.recommendation);
            await this._setBool('chemistry.orp.evaluation.action_required', false);
            await this._writeOutputs(value, null, null, {
                status: measurementAllowed.status,
                level: 'info',
                actionRequired: false,
                recommendation: measurementAllowed.recommendation,
            });
            await this._setString('chemistry.orp.debug.last_reason', reason || measurementAllowed.reason);
            await this._setNumber('chemistry.orp.debug.last_update', now.getTime()); // FIX: value.time uses numeric ms timestamp.
            return;
        }

        await this._setBool('chemistry.orp.measurement.allowed', true);
        await this._setString('chemistry.orp.measurement.ignored_reason', '');

        await this._updateLastValues(value, now);

        const history = await this._updateHistory(value, now, forceSample);
        const trend = await this._calculateTrend(value, now, history.samples, history.dailySamples);
        const phReference = await this._updatePhReference();
        const evaluation = await this._evaluateOrp(value, phReference);

        await this._writeTrend(trend);
        await this._writeEvaluation(evaluation);
        await this._writeOutputs(value, phReference, trend, evaluation);

        await this._setString('chemistry.orp.debug.last_reason', reason || 'value_processed');
        await this._setNumber('chemistry.orp.debug.last_update', now.getTime()); // FIX: value.time uses numeric ms timestamp.
    },

    async _checkMeasurementAllowed(now) {
        const location = await this._readString('chemistry.orp.measurement.location');
        const flowRequired = await this._readBoolean('chemistry.orp.measurement.flow_required');
        const pumpRunning = await this._readBoolean('pump.pump_switch');

        await this._setBool('chemistry.orp.measurement.pump_running', pumpRunning);

        const needsFlow = flowRequired || location === 'measurement_cell' || location === 'pipe_section';

        if (!needsFlow || location === 'pool' || location === 'manual') {
            await this._setBool('chemistry.orp.measurement.stabilized', true);
            return { allowed: true, reason: '', status: 'ok', recommendation: '' };
        }

        if (!pumpRunning) {
            this.pumpStartTs = 0;
            await this._setBool('chemistry.orp.measurement.stabilized', false);

            return {
                allowed: false,
                reason: 'pump_off',
                status: 'waiting_for_pump',
                recommendation: I18n.translate(
                    'ORP evaluation is waiting for the pool pump because the sensor is in a measurement section.',
                ),
            };
        }

        if (!this.pumpStartTs) {
            this.pumpStartTs = now.getTime();
        }

        const stabilizationSec = Math.max(
            0,
            await this._readNumber('chemistry.orp.measurement.stabilization_time_sec'),
        );
        const elapsedSec = Math.floor((now.getTime() - this.pumpStartTs) / 1000);
        const stabilized = elapsedSec >= stabilizationSec;

        await this._setBool('chemistry.orp.measurement.stabilized', stabilized);

        if (!stabilized) {
            return {
                allowed: false,
                reason: 'stabilization_pending',
                status: 'waiting_for_stabilization',
                recommendation: I18n.translate(
                    'ORP evaluation is waiting until the measurement section has stabilized after pump start.',
                ),
            };
        }

        return { allowed: true, reason: '', status: 'ok', recommendation: '' };
    },

    async _updatePhReference() {
        const phEnabled = await this._readBoolean('chemistry.ph.enabled');
        const phValue = await this._readNumber('chemistry.ph.input.current_value');

        await this._setBool('chemistry.orp.ph_reference.enabled', phEnabled);
        await this._setNumber('chemistry.orp.ph_reference.current_value', phValue);

        let status = 'unknown';

        if (!phEnabled) {
            status = 'disabled';
        } else if (!Number.isFinite(phValue) || phValue <= 0) {
            status = 'missing';
        } else if (phValue < 6.8 || phValue > 7.8) {
            status = 'out_of_range';
        } else {
            status = 'valid';
        }

        await this._setString('chemistry.orp.ph_reference.status', status);

        return {
            enabled: phEnabled,
            value: phValue,
            status,
            usable: status === 'valid',
        };
    },

    async _updateLastValues(value, now) {
        const lastValid = await this._readNumberOrNull('chemistry.orp.input.last_valid_value');
        const lastValidAt = await this._readTimestampOrNull('chemistry.orp.input.last_valid_value_at'); // FIX: accept numeric ms timestamps and legacy German strings.

        if (lastValid !== null && lastValidAt) {
            await this._setNumber('chemistry.orp.input.previous_value', lastValid);
            await this._setNumber('chemistry.orp.input.previous_value_at', lastValidAt); // FIX: pass stored timestamp through unchanged.

            const minutes = Math.max(0, Math.round((now.getTime() - lastValidAt) / 60000)); // FIX: calculate from numeric ms timestamp.
            await this._setNumber('chemistry.orp.input.minutes_since_previous_value', minutes);
        }

        await this._setNumber('chemistry.orp.input.last_valid_value', value);
        await this._setNumber('chemistry.orp.input.last_valid_value_at', now.getTime()); // FIX: value.time uses numeric ms timestamp.
    },

    async _updateHistory(value, now, forceSample) {
        let samples = await this._readJsonArray('chemistry.orp.history.samples_json');
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

        const preparedHistory = this._prepareHistoryForWrite(samples, 'chemistry.orp.history.samples_json');
        samples = preparedHistory.samples;

        await this._setString('chemistry.orp.history.samples_json', preparedHistory.json);
        await this._setNumber('chemistry.orp.history.samples_count', samples.length);

        if (samples.length) {
            await this._setNumber(
                // FIX: history value.time states store sample timestamps, not readable strings.
                'chemistry.orp.history.oldest_sample_at',
                Number(samples[0].ts),
            );
            await this._setNumber(
                // FIX: history value.time states store sample timestamps, not readable strings.
                'chemistry.orp.history.newest_sample_at',
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
            return 'unknown';
        }

        const strongest = available.reduce((prev, current) => (Math.abs(current) > Math.abs(prev) ? current : prev), 0);

        if (Math.abs(strongest) < 20) {
            return 'stable';
        }

        return strongest > 0 ? 'rising' : 'falling';
    },

    _getTrendStatus(delta24h, delta7d, delta30d, ref24h, ref7d, ref30d) {
        if (!ref24h && !ref7d && !ref30d) {
            return 'not_enough_data';
        }

        if (delta24h < -80 || delta7d < -150 || delta30d < -250) {
            return 'falling';
        }

        if (delta24h > 80 || delta7d > 150 || delta30d > 250) {
            return 'rising_fast';
        }

        if (delta24h > 50 || delta7d > 100 || delta30d > 180) {
            return 'rising_noticeable';
        }

        if (delta24h > 20 || delta7d > 50 || delta30d > 100) {
            return 'rising_slowly';
        }

        return 'stable';
    },

    async _writeTrend(trend) {
        await this._setNumber('chemistry.orp.trend.reference_24h_value', trend.ref24h ? trend.ref24h.value : 0);
        await this._setNumber('chemistry.orp.trend.reference_24h_at', trend.ref24h ? trend.ref24h.ts : 0); // FIX
        await this._setNumber('chemistry.orp.trend.delta_24h', trend.ref24h ? trend.delta24h : 0);

        await this._setNumber('chemistry.orp.trend.reference_7d_value', trend.ref7d ? trend.ref7d.value : 0);
        await this._setNumber('chemistry.orp.trend.reference_7d_at', trend.ref7d ? trend.ref7d.ts : 0); // FIX
        await this._setNumber('chemistry.orp.trend.delta_7d', trend.ref7d ? trend.delta7d : 0);

        await this._setNumber('chemistry.orp.trend.reference_30d_value', trend.ref30d ? trend.ref30d.value : 0);
        await this._setNumber('chemistry.orp.trend.reference_30d_at', trend.ref30d ? trend.ref30d.ts : 0); // FIX
        await this._setNumber('chemistry.orp.trend.delta_30d', trend.ref30d ? trend.delta30d : 0);

        await this._setString('chemistry.orp.trend.direction', trend.direction);
        await this._setString('chemistry.orp.trend.status', trend.status);
        await this._setString(
            'chemistry.orp.trend.summary_text',
            `${I18n.translate('ORP trend')}: ${trend.status} (${trend.direction})`,
        );
    },

    async _evaluateOrp(value, phReference) {
        const min = await this._readNumber('chemistry.orp.evaluation.target_min_mv');
        const max = await this._readNumber('chemistry.orp.evaluation.target_max_mv');

        if (!phReference || !phReference.usable) {
            return {
                status: 'ph_reference_missing',
                level: 'info',
                actionRequired: false,
                recommendation: I18n.translate(
                    'ORP value is available, but pH reference is missing, disabled or outside the expected range. ORP interpretation is limited.',
                ),
            };
        }

        if (value < min) {
            return {
                status: 'low',
                level: 'warning',
                actionRequired: true,
                recommendation: I18n.translate(
                    'ORP value is low. Check pH and chlorine values manually and evaluate the water care situation.',
                ),
            };
        }

        if (value > max) {
            return {
                status: 'high',
                level: 'info',
                actionRequired: false,
                recommendation: I18n.translate(
                    'ORP value is high. Check whether the measurement is plausible and evaluate the water values together.',
                ),
            };
        }

        return {
            status: 'ok',
            level: 'none',
            actionRequired: false,
            recommendation: I18n.translate('ORP value is within the configured reference range.'),
        };
    },

    async _writeEvaluation(evaluation) {
        await this._setString('chemistry.orp.evaluation.status', evaluation.status);
        await this._setString('chemistry.orp.evaluation.level', evaluation.level);
        await this._setString('chemistry.orp.evaluation.recommendation', evaluation.recommendation);
        await this._setBool('chemistry.orp.evaluation.action_required', evaluation.actionRequired);
    },

    async _writeOutputs(value, phReference, trend, evaluation) {
        const phText = phReference
            ? `${phReference.status}${Number.isFinite(phReference.value) ? ` (${phReference.value.toFixed(2)})` : ''}`
            : I18n.translate('unknown');

        const trendText = trend
            ? `24h: ${trend.ref24h ? this._formatDelta(trend.delta24h) : I18n.translate('not enough data')}, ` +
              `7d: ${trend.ref7d ? this._formatDelta(trend.delta7d) : I18n.translate('not enough data')}, ` +
              `30d: ${trend.ref30d ? this._formatDelta(trend.delta30d) : I18n.translate('not enough data')}`
            : I18n.translate('not enough data');

        const text =
            `${I18n.translate('Current ORP value')}: ${Math.round(value)} mV. ` +
            `${I18n.translate('pH reference')}: ${phText}. ` +
            `${trendText}. ` +
            `${evaluation.recommendation}`;

        const html =
            `<div>` +
            `<b>${I18n.translate('Current ORP value')}:</b> ${Math.round(value)} mV<br>` +
            `<b>${I18n.translate('pH reference')}:</b> ${this._escapeHtml(phText)}<br>` +
            `<b>24h:</b> ${
                trend && trend.ref24h
                    ? `${Math.round(trend.ref24h.value)} mV / ${this._formatDelta(trend.delta24h)}`
                    : I18n.translate('not enough data')
            }<br>` +
            `<b>7d:</b> ${
                trend && trend.ref7d
                    ? `${Math.round(trend.ref7d.value)} mV / ${this._formatDelta(trend.delta7d)}`
                    : I18n.translate('not enough data')
            }<br>` +
            `<b>30d:</b> ${
                trend && trend.ref30d
                    ? `${Math.round(trend.ref30d.value)} mV / ${this._formatDelta(trend.delta30d)}`
                    : I18n.translate('not enough data')
            }<br>` +
            `<b>${I18n.translate('Status')}:</b> ${evaluation.status}<br>` +
            `<b>${I18n.translate('Recommendation')}:</b> ${this._escapeHtml(evaluation.recommendation)}` +
            `</div>`;

        const json = {
            current: Math.round(value),
            unit: 'mV',
            ph_reference: phReference || null,
            trend_24h: {
                reference: trend && trend.ref24h ? Math.round(trend.ref24h.value) : null,
                delta: trend && trend.ref24h ? Math.round(trend.delta24h) : null,
            },
            trend_7d: {
                reference: trend && trend.ref7d ? Math.round(trend.ref7d.value) : null,
                delta: trend && trend.ref7d ? Math.round(trend.delta7d) : null,
            },
            trend_30d: {
                reference: trend && trend.ref30d ? Math.round(trend.ref30d.value) : null,
                delta: trend && trend.ref30d ? Math.round(trend.delta30d) : null,
            },
            direction: trend ? trend.direction : 'unknown',
            trend_status: trend ? trend.status : 'unknown',
            status: evaluation.status,
            level: evaluation.level,
            action_required: evaluation.actionRequired,
            recommendation: evaluation.recommendation,
        };

        await this._setString('chemistry.orp.outputs.summary_text', text);
        await this._setString('chemistry.orp.outputs.summary_html', html);
        await this._setString('chemistry.orp.outputs.summary_json', JSON.stringify(json));
    },

    async _writeDisabled(reason) {
        await this._setBool('chemistry.orp.measurement.allowed', false);
        await this._setString('chemistry.orp.measurement.ignored_reason', reason);
        await this._setString('chemistry.orp.evaluation.status', 'disabled');
        await this._setString('chemistry.orp.evaluation.level', 'none');
        await this._setString('chemistry.orp.evaluation.recommendation', I18n.translate('ORP evaluation is disabled.'));
        await this._setBool('chemistry.orp.evaluation.action_required', false);
        await this._setString('chemistry.orp.debug.last_reason', reason);
        const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
        await this._setNumber('chemistry.orp.debug.last_update', now.getTime()); // FIX
    },

    async _writeInvalid(recommendation, reason) {
        await this._setBool('chemistry.orp.input.source_valid', false);
        await this._setBool('chemistry.orp.input.value_valid', false);
        await this._setBool('chemistry.orp.measurement.allowed', false);
        await this._setString('chemistry.orp.measurement.ignored_reason', reason);
        await this._setString('chemistry.orp.evaluation.status', 'invalid');
        await this._setString('chemistry.orp.evaluation.level', 'warning');
        await this._setString('chemistry.orp.evaluation.recommendation', recommendation);
        await this._setBool('chemistry.orp.evaluation.action_required', false);
        await this._setString('chemistry.orp.debug.last_reason', reason);
        const now = new Date(); // FIX: write value.time as numeric Unix timestamp in milliseconds.
        await this._setNumber('chemistry.orp.debug.last_update', now.getTime()); // FIX
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

    async _readBoolean(id) {
        const state = await this.adapter.getStateAsync(id);
        return !!state?.val;
    },

    async _updateDailyHistory(shortTermSamples, value, now, sampleStored) {
        const id = 'chemistry.orp.history.daily_json';
        let dailySamples = await this._readDailyJson(id);
        const nowTs = now.getTime();
        const minTs = nowTs - MAX_DAILY_HISTORY_AGE_MS;
        const initializeFromSeeds = dailySamples.length === 0;

        if (initializeFromSeeds) {
            const legacyValueState = await this.adapter.getStateAsync('chemistry.orp.trend.reference_30d_value');
            const legacyAtState = await this.adapter.getStateAsync('chemistry.orp.trend.reference_30d_at');
            const legacyValue = Number(legacyValueState?.val);
            const legacyTs = Number(legacyAtState?.val);

            if (
                Number.isFinite(legacyValue) &&
                legacyValue >= 0 &&
                legacyValue <= 1200 &&
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
            this.adapter.log.warn(`[chemistryOrpHelper] Ignoring non-string daily history state ${id}.`);
            return [];
        }

        if (Buffer.byteLength(rawValue, 'utf8') > MAX_DAILY_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryOrpHelper] Ignoring oversized daily history state ${id} (> 8 KB).`);
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
                        max > 1200 ||
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
            this.adapter.log.warn(`[chemistryOrpHelper] Daily history ${id} was trimmed to stay within 8 KB.`);
        }

        if (Buffer.byteLength(json, 'utf8') > MAX_DAILY_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryOrpHelper] Daily history ${id} could not be limited; resetting it.`);
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
            this.adapter.log.warn(`[chemistryOrpHelper] Ignoring non-string history state ${id}.`);
            return [];
        }

        if (Buffer.byteLength(rawValue, 'utf8') > MAX_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryOrpHelper] Ignoring oversized history state ${id} (> 64 KB).`);
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
                    if (!Number.isFinite(value) || value < 0 || value > 1200) {
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
            this.adapter.log.warn(`[chemistryOrpHelper] History ${id} was trimmed to stay within 64 KB.`);
        }

        if (Buffer.byteLength(json, 'utf8') > MAX_HISTORY_BYTES) {
            this.adapter.log.warn(`[chemistryOrpHelper] History ${id} could not be limited safely; resetting it.`);
            return { samples: [], json: '[]' };
        }

        return { samples: limitedSamples, json };
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
        const rounded = Math.round(Number(value) || 0);
        return `${rounded >= 0 ? '+' : ''}${rounded} mV`;
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

        this.adapter = null;
        this.sourceStateId = '';
        this.pumpStartTs = 0;
    },
};

module.exports = chemistryOrpHelper;

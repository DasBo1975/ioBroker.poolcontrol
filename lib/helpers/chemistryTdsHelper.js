'use strict';

const { I18n } = require('@iobroker/adapter-core');

const MAX_HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SAMPLE_INTERVAL_MS = 15 * 60 * 1000;

const chemistryTdsHelper = {
    adapter: null,
    sourceStateId: '',
    evalTimer: null,
    pumpStartTs: 0,

    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        void this._loadSourceState();
        this._scheduleEvaluation('init', 500);

        this.adapter.log.debug('[chemistryTdsHelper] Initialized');
    },

    async _subscribeStates() {
        const ids = [
            'chemistry.tds.enabled',
            'chemistry.tds.input.source_mode',
            'chemistry.tds.input.source_state_id',
            'chemistry.tds.input.manual_value',
            'chemistry.tds.measurement.location',
            'chemistry.tds.measurement.flow_required',
            'chemistry.tds.measurement.stabilization_time_sec',
            'chemistry.tds.reference.initial_value',
            'chemistry.tds.reference.reset_initial_reference',
            'pump.pump_switch',
            'status.season_active',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[chemistryTdsHelper] Own states subscribed');
    },

    async _loadSourceState() {
        const stateId = await this._readString('chemistry.tds.input.source_state_id');

        if (!stateId) {
            this.sourceStateId = '';
            return;
        }

        this.sourceStateId = stateId;

        try {
            this.adapter.subscribeForeignStates(stateId);
            this.adapter.log.debug(`[chemistryTdsHelper] Subscribed foreign TDS source: ${stateId}`);
        } catch (err) {
            this.adapter.log.warn(
                `[chemistryTdsHelper] Could not subscribe foreign TDS source "${stateId}": ${err.message}`,
            );
        }
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        try {
            if (id.endsWith('chemistry.tds.input.source_state_id') && state.ack === false) {
                await this._handleSourceStateChanged(String(state.val || ''));
                return;
            }

            if (
                id.endsWith('chemistry.tds.reference.reset_initial_reference') &&
                state.ack === false &&
                state.val === true
            ) {
                await this._setCurrentAsInitialReference();
                await this.adapter.setStateChangedAsync('chemistry.tds.reference.reset_initial_reference', {
                    val: false,
                    ack: true,
                });
                return;
            }

            if (this.sourceStateId && id === this.sourceStateId) {
                await this._handleIncomingValue('state', state.val, 'external_state');
                return;
            }

            if (id.endsWith('chemistry.tds.input.manual_value') && state.ack === false) {
                await this._handleIncomingValue('manual', state.val, 'manual_value');
                return;
            }

            if (this._isRelevantOwnState(id)) {
                this._scheduleEvaluation(`state_change:${id}`, 500);
            }
        } catch (err) {
            this.adapter.log.warn(`[chemistryTdsHelper] Error in handleStateChange: ${err.message}`);
        }
    },

    _isRelevantOwnState(id) {
        const relevant = [
            'chemistry.tds.enabled',
            'chemistry.tds.input.source_mode',
            'chemistry.tds.measurement.location',
            'chemistry.tds.measurement.flow_required',
            'chemistry.tds.measurement.stabilization_time_sec',
            'chemistry.tds.reference.initial_value',
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
                this.adapter.log.debug(`[chemistryTdsHelper] Could not unsubscribe old TDS source: ${err.message}`);
            }
        }

        this.sourceStateId = newStateId;

        if (!newStateId) {
            await this._setBool('chemistry.tds.input.source_valid', false);
            await this._setString(
                'chemistry.tds.input.source_status',
                I18n.translate('No TDS source state configured.'),
            );
            this._scheduleEvaluation('source_state_removed', 500);
            return;
        }

        try {
            this.adapter.subscribeForeignStates(newStateId);
            await this._setBool('chemistry.tds.input.source_valid', true);
            await this._setString('chemistry.tds.input.source_status', I18n.translate('TDS source state configured.'));
        } catch (err) {
            await this._setBool('chemistry.tds.input.source_valid', false);
            await this._setString(
                'chemistry.tds.input.source_status',
                I18n.translate('TDS source state could not be subscribed.'),
            );
            this.adapter.log.warn(
                `[chemistryTdsHelper] Could not subscribe new TDS source "${newStateId}": ${err.message}`,
            );
        }

        this._scheduleEvaluation('source_state_changed', 500);
    },

    async _handleIncomingValue(source, rawValue, reason) {
        const mode = await this._readString('chemistry.tds.input.source_mode');

        if (source === 'manual' && mode !== 'manual') {
            return;
        }

        if (source === 'state' && mode !== 'state') {
            return;
        }

        await this._processValue(source, rawValue, reason, true);
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
        const enabled = await this._readBoolean('chemistry.tds.enabled');

        if (!enabled) {
            await this._writeDisabled(reason || 'disabled');
            return;
        }

        const mode = await this._readString('chemistry.tds.input.source_mode');

        if (mode === 'disabled') {
            await this._setBool('chemistry.tds.input.source_valid', false);
            await this._setBool('chemistry.tds.input.value_valid', false);
            await this._setString('chemistry.tds.input.source_status', I18n.translate('TDS input is disabled.'));
            await this._writeDisabled(reason || 'source_disabled');
            return;
        }

        if (mode === 'manual') {
            const manualValue = await this._readNumber('chemistry.tds.input.manual_value');
            await this._processValue('manual', manualValue, reason || 'manual_evaluation', false);
            return;
        }

        if (mode === 'state') {
            const sourceStateId = await this._readString('chemistry.tds.input.source_state_id');

            if (!sourceStateId) {
                await this._writeInvalid(I18n.translate('No valid TDS source is configured.'), 'missing_source_state');
                return;
            }

            try {
                const sourceState = await this.adapter.getForeignStateAsync(sourceStateId);

                if (!sourceState) {
                    await this._writeInvalid(
                        I18n.translate('The configured TDS source state does not exist.'),
                        'source_not_found',
                    );
                    return;
                }

                await this._processValue('state', sourceState.val, reason || 'state_evaluation', false);
            } catch (err) {
                await this._writeInvalid(
                    I18n.translate('The configured TDS source could not be read.'),
                    `source_read_error: ${err.message}`,
                );
            }

            return;
        }

        await this._writeInvalid(I18n.translate('Unknown TDS source mode.'), 'unknown_source_mode');
    },

    async _processValue(source, rawValue, reason, forceSample) {
        const now = new Date();
        const value = Number(rawValue);

        await this._setString('chemistry.tds.input.last_value_at', this._formatDateTime(now));

        if (source === 'manual') {
            await this._setBool('chemistry.tds.input.source_valid', true);
            await this._setString('chemistry.tds.input.source_status', I18n.translate('Manual TDS value is used.'));
        } else {
            await this._setBool('chemistry.tds.input.source_valid', true);
            await this._setString('chemistry.tds.input.source_status', I18n.translate('External TDS source is valid.'));
        }

        const valueValid = Number.isFinite(value) && value >= 0 && value <= 10000;

        await this._setNumber('chemistry.tds.input.current_value', Number.isFinite(value) ? value : 0);
        await this._setBool('chemistry.tds.input.value_valid', valueValid);

        if (!valueValid) {
            await this._writeInvalid(
                I18n.translate('The TDS value is invalid. Please check the measurement or sensor.'),
                reason || 'invalid_value',
            );
            return;
        }

        const measurementAllowed = await this._checkMeasurementAllowed(now);

        if (!measurementAllowed.allowed) {
            await this._setBool('chemistry.tds.measurement.allowed', false);
            await this._setString('chemistry.tds.measurement.ignored_reason', measurementAllowed.reason);
            await this._setString('chemistry.tds.evaluation.overall_status', measurementAllowed.status);
            await this._setString('chemistry.tds.evaluation.recommendation', measurementAllowed.recommendation);
            await this._setBool('chemistry.tds.evaluation.action_required', false);
            await this._setString('chemistry.tds.debug.last_reason', reason || measurementAllowed.reason);
            await this._setString('chemistry.tds.debug.last_update', this._formatDateTime(now));
            return;
        }

        await this._setBool('chemistry.tds.measurement.allowed', true);
        await this._setString('chemistry.tds.measurement.ignored_reason', '');

        await this._updateLastValues(value, now);

        const history = await this._updateHistory(value, now, forceSample);
        const reference = await this._updateReference(value, now);
        const trend = await this._calculateTrend(value, now, history);
        const evaluation = await this._evaluateTds(value, reference, trend);

        await this._writeTrend(trend);
        await this._writeEvaluation(evaluation);
        await this._writeOutputs(value, reference, trend, evaluation);

        await this._setString('chemistry.tds.debug.last_reason', reason || 'value_processed');
        await this._setString('chemistry.tds.debug.last_update', this._formatDateTime(now));
    },

    async _checkMeasurementAllowed(now) {
        const location = await this._readString('chemistry.tds.measurement.location');
        const flowRequired = await this._readBoolean('chemistry.tds.measurement.flow_required');
        const pumpRunning = await this._readBoolean('pump.pump_switch');

        await this._setBool('chemistry.tds.measurement.pump_running', pumpRunning);

        const needsFlow = flowRequired || location === 'measurement_cell' || location === 'pipe_section';

        if (!needsFlow || location === 'pool' || location === 'manual') {
            await this._setBool('chemistry.tds.measurement.stabilized', true);
            return { allowed: true, reason: '', status: 'ok', recommendation: '' };
        }

        if (!pumpRunning) {
            this.pumpStartTs = 0;
            await this._setBool('chemistry.tds.measurement.stabilized', false);

            return {
                allowed: false,
                reason: 'pump_off',
                status: 'waiting_for_pump',
                recommendation: I18n.translate(
                    'TDS evaluation is waiting for the pool pump because the sensor is in a measurement section.',
                ),
            };
        }

        if (!this.pumpStartTs) {
            this.pumpStartTs = now.getTime();
        }

        const stabilizationSec = Math.max(
            0,
            await this._readNumber('chemistry.tds.measurement.stabilization_time_sec'),
        );
        const elapsedSec = Math.floor((now.getTime() - this.pumpStartTs) / 1000);
        const stabilized = elapsedSec >= stabilizationSec;

        await this._setBool('chemistry.tds.measurement.stabilized', stabilized);

        if (!stabilized) {
            return {
                allowed: false,
                reason: 'stabilization_pending',
                status: 'waiting_for_stabilization',
                recommendation: I18n.translate(
                    'TDS evaluation is waiting until the measurement section has stabilized after pump start.',
                ),
            };
        }

        return { allowed: true, reason: '', status: 'ok', recommendation: '' };
    },

    async _updateLastValues(value, now) {
        const lastValid = await this._readNumberOrNull('chemistry.tds.input.last_valid_value');
        const lastValidAt = await this._readString('chemistry.tds.input.last_valid_value_at');

        if (lastValid !== null && lastValidAt) {
            await this._setNumber('chemistry.tds.input.previous_value', lastValid);
            await this._setString('chemistry.tds.input.previous_value_at', lastValidAt);

            const previousDate = this._parseGermanDateTime(lastValidAt);

            if (previousDate) {
                const minutes = Math.max(0, Math.round((now.getTime() - previousDate.getTime()) / 60000));
                await this._setNumber('chemistry.tds.input.minutes_since_previous_value', minutes);
            }
        }

        await this._setNumber('chemistry.tds.input.last_valid_value', value);
        await this._setString('chemistry.tds.input.last_valid_value_at', this._formatDateTime(now));
    },

    async _updateHistory(value, now, forceSample) {
        let samples = await this._readJsonArray('chemistry.tds.history.samples_json');
        const nowTs = now.getTime();
        const minTs = nowTs - MAX_HISTORY_AGE_MS;

        samples = samples.filter(
            sample => sample && Number(sample.ts) >= minTs && Number.isFinite(Number(sample.value)),
        );

        const newest = samples.length ? samples[samples.length - 1] : null;
        const newestTs = newest ? Number(newest.ts) : 0;
        const shouldStore = forceSample || !newest || nowTs - newestTs >= MIN_SAMPLE_INTERVAL_MS;

        if (shouldStore) {
            samples.push({
                ts: nowTs,
                time: this._formatDateTime(now),
                value,
            });
        }

        samples = samples.filter(sample => sample && Number(sample.ts) >= minTs);

        await this._setString('chemistry.tds.history.samples_json', JSON.stringify(samples));
        await this._setNumber('chemistry.tds.history.samples_count', samples.length);

        if (samples.length) {
            await this._setString(
                'chemistry.tds.history.oldest_sample_at',
                samples[0].time || this._formatDateTime(new Date(samples[0].ts)),
            );
            await this._setString(
                'chemistry.tds.history.newest_sample_at',
                samples[samples.length - 1].time || this._formatDateTime(new Date(samples[samples.length - 1].ts)),
            );
        }

        return samples;
    },

    async _updateReference(value, now) {
        let initialValue = await this._readNumber('chemistry.tds.reference.initial_value');
        let initialSet = await this._readBoolean('chemistry.tds.reference.initial_set');

        if (!initialSet && initialValue <= 0) {
            initialValue = value;
            initialSet = true;

            await this._setNumber('chemistry.tds.reference.initial_value', initialValue);
            await this._setString('chemistry.tds.reference.initial_value_at', this._formatDateTime(now));
            await this._setBool('chemistry.tds.reference.initial_set', true);
        }

        const delta = initialSet ? value - initialValue : 0;

        await this._setNumber('chemistry.tds.reference.delta_since_initial', delta);

        return {
            initialValue,
            initialSet,
            delta,
        };
    },

    async _setCurrentAsInitialReference() {
        const currentValue = await this._readNumber('chemistry.tds.input.last_valid_value');

        if (!Number.isFinite(currentValue) || currentValue <= 0) {
            await this._setString('chemistry.tds.debug.last_reason', 'reference_reset_failed_no_valid_value');
            return;
        }

        const now = new Date();

        await this._setNumber('chemistry.tds.reference.initial_value', currentValue);
        await this._setString('chemistry.tds.reference.initial_value_at', this._formatDateTime(now));
        await this._setBool('chemistry.tds.reference.initial_set', true);
        await this._setNumber('chemistry.tds.reference.delta_since_initial', 0);
        await this._setString('chemistry.tds.debug.last_reason', 'reference_reset');
        await this._setString('chemistry.tds.debug.last_update', this._formatDateTime(now));

        this._scheduleEvaluation('reference_reset', 500);
    },

    async _calculateTrend(currentValue, now, samples) {
        const nowTs = now.getTime();

        const ref24h = this._findReferenceSample(samples, nowTs - 24 * 60 * 60 * 1000);
        const ref7d = this._findReferenceSample(samples, nowTs - 7 * 24 * 60 * 60 * 1000);
        const ref30d = this._findReferenceSample(samples, nowTs - 30 * 24 * 60 * 60 * 1000);

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

    _findReferenceSample(samples, targetTs) {
        if (!samples.length) {
            return null;
        }

        let best = null;
        let bestDistance = Number.MAX_SAFE_INTEGER;

        for (const sample of samples) {
            const ts = Number(sample.ts);
            const value = Number(sample.value);

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

        return best;
    },

    _getOverallDirection(ref24h, ref7d, ref30d, delta24h, delta7d, delta30d) {
        const available = [ref24h ? delta24h : null, ref7d ? delta7d : null, ref30d ? delta30d : null].filter(
            value => value !== null,
        );

        if (!available.length) {
            return 'not_enough_data';
        }

        const strongest = available.reduce((prev, current) => (Math.abs(current) > Math.abs(prev) ? current : prev), 0);

        if (Math.abs(strongest) < 25) {
            return 'stable';
        }

        return strongest > 0 ? 'rising' : 'falling';
    },

    _getTrendStatus(delta24h, delta7d, delta30d, ref24h, ref7d, ref30d) {
        if (!ref24h && !ref7d && !ref30d) {
            return 'not_enough_data';
        }

        if (delta24h > 100 || delta7d > 300 || delta30d > 800) {
            return 'rising_fast';
        }

        if (delta24h > 50 || delta7d > 150 || delta30d > 400) {
            return 'rising_noticeable';
        }

        if (delta24h > 25 || delta7d > 75 || delta30d > 200) {
            return 'rising_slowly';
        }

        if (delta24h < -25 || delta7d < -75 || delta30d < -200) {
            return 'falling';
        }

        return 'stable';
    },

    async _writeTrend(trend) {
        await this._setNumber('chemistry.tds.trend.reference_24h_value', trend.ref24h ? trend.ref24h.value : 0);
        await this._setString('chemistry.tds.trend.reference_24h_at', trend.ref24h ? trend.ref24h.time : '');
        await this._setNumber('chemistry.tds.trend.delta_24h', trend.ref24h ? trend.delta24h : 0);

        await this._setNumber('chemistry.tds.trend.reference_7d_value', trend.ref7d ? trend.ref7d.value : 0);
        await this._setString('chemistry.tds.trend.reference_7d_at', trend.ref7d ? trend.ref7d.time : '');
        await this._setNumber('chemistry.tds.trend.delta_7d', trend.ref7d ? trend.delta7d : 0);

        await this._setNumber('chemistry.tds.trend.reference_30d_value', trend.ref30d ? trend.ref30d.value : 0);
        await this._setString('chemistry.tds.trend.reference_30d_at', trend.ref30d ? trend.ref30d.time : '');
        await this._setNumber('chemistry.tds.trend.delta_30d', trend.ref30d ? trend.delta30d : 0);

        await this._setString('chemistry.tds.trend.direction', trend.direction);
        await this._setString('chemistry.tds.trend.status', trend.status);
    },

    async _evaluateTds(value, reference, trend) {
        let absoluteLevel = 'normal';

        if (value > 3000) {
            absoluteLevel = 'critical';
        } else if (value > 2000) {
            absoluteLevel = 'high';
        } else if (value > 1500) {
            absoluteLevel = 'elevated';
        }

        let referenceLevel = 'not_set';

        if (reference.initialSet) {
            if (reference.delta > 1500) {
                referenceLevel = 'critical';
            } else if (reference.delta > 1000) {
                referenceLevel = 'high';
            } else if (reference.delta > 500) {
                referenceLevel = 'elevated';
            } else {
                referenceLevel = 'normal';
            }
        }

        let overallStatus = 'ok';
        let actionRequired = false;
        let recommendation = I18n.translate('TDS value and trend are currently unremarkable.');

        if (absoluteLevel === 'critical' || referenceLevel === 'critical') {
            overallStatus = 'critical';
            actionRequired = true;
            recommendation = I18n.translate(
                'TDS is very high. Check water care and seriously consider a partial water change.',
            );
        } else if (absoluteLevel === 'high' || referenceLevel === 'high' || trend.status === 'rising_fast') {
            overallStatus = 'high';
            actionRequired = true;
            recommendation = I18n.translate(
                'TDS is high or rising quickly. Check water load, chemical usage and consider fresh water or a partial water change.',
            );
        } else if (
            absoluteLevel === 'elevated' ||
            referenceLevel === 'elevated' ||
            trend.status === 'rising_noticeable'
        ) {
            overallStatus = 'elevated';
            actionRequired = true;
            recommendation = I18n.translate(
                'TDS is elevated or rising noticeably. Observe the trend and check water load and chemical additions.',
            );
        } else if (trend.status === 'not_enough_data') {
            overallStatus = 'not_enough_data';
            actionRequired = false;
            recommendation = I18n.translate(
                'Not enough TDS history is available yet. Collect more valid measurements.',
            );
        } else if (trend.status === 'falling') {
            overallStatus = 'falling';
            actionRequired = false;
            recommendation = I18n.translate(
                'TDS is falling. This can be plausible after fresh water or a partial water change.',
            );
        }

        return {
            absoluteLevel,
            referenceLevel,
            overallStatus,
            actionRequired,
            recommendation,
        };
    },

    async _writeEvaluation(evaluation) {
        await this._setString('chemistry.tds.evaluation.absolute_level', evaluation.absoluteLevel);
        await this._setString('chemistry.tds.evaluation.reference_level', evaluation.referenceLevel);
        await this._setString('chemistry.tds.evaluation.overall_status', evaluation.overallStatus);
        await this._setString('chemistry.tds.evaluation.recommendation', evaluation.recommendation);
        await this._setBool('chemistry.tds.evaluation.action_required', evaluation.actionRequired);
    },

    async _writeOutputs(value, reference, trend, evaluation) {
        const text =
            `${I18n.translate('Current TDS value')}: ${Math.round(value)} ppm. ` +
            `24h: ${trend.ref24h ? this._formatDelta(trend.delta24h) : I18n.translate('not enough data')}, ` +
            `7d: ${trend.ref7d ? this._formatDelta(trend.delta7d) : I18n.translate('not enough data')}, ` +
            `30d: ${trend.ref30d ? this._formatDelta(trend.delta30d) : I18n.translate('not enough data')}. ` +
            `${evaluation.recommendation}`;

        const html =
            `<div>` +
            `<b>${I18n.translate('Current TDS value')}:</b> ${Math.round(value)} ppm<br>` +
            `<b>${I18n.translate('Initial reference')}:</b> ${reference.initialSet ? `${Math.round(reference.initialValue)} ppm` : I18n.translate('not set')}<br>` +
            `<b>${I18n.translate('Delta since reference')}:</b> ${reference.initialSet ? this._formatDelta(reference.delta) : I18n.translate('not available')}<br>` +
            `<b>24h:</b> ${trend.ref24h ? `${Math.round(trend.ref24h.value)} ppm / ${this._formatDelta(trend.delta24h)}` : I18n.translate('not enough data')}<br>` +
            `<b>7d:</b> ${trend.ref7d ? `${Math.round(trend.ref7d.value)} ppm / ${this._formatDelta(trend.delta7d)}` : I18n.translate('not enough data')}<br>` +
            `<b>30d:</b> ${trend.ref30d ? `${Math.round(trend.ref30d.value)} ppm / ${this._formatDelta(trend.delta30d)}` : I18n.translate('not enough data')}<br>` +
            `<b>${I18n.translate('Trend status')}:</b> ${trend.status}<br>` +
            `<b>${I18n.translate('Overall status')}:</b> ${evaluation.overallStatus}<br>` +
            `<b>${I18n.translate('Recommendation')}:</b> ${this._escapeHtml(evaluation.recommendation)}` +
            `</div>`;

        const json = {
            current: Math.round(value),
            unit: 'ppm',
            reference: {
                initial: reference.initialSet ? Math.round(reference.initialValue) : null,
                delta: reference.initialSet ? Math.round(reference.delta) : null,
            },
            trend_24h: {
                reference: trend.ref24h ? Math.round(trend.ref24h.value) : null,
                delta: trend.ref24h ? Math.round(trend.delta24h) : null,
            },
            trend_7d: {
                reference: trend.ref7d ? Math.round(trend.ref7d.value) : null,
                delta: trend.ref7d ? Math.round(trend.delta7d) : null,
            },
            trend_30d: {
                reference: trend.ref30d ? Math.round(trend.ref30d.value) : null,
                delta: trend.ref30d ? Math.round(trend.delta30d) : null,
            },
            direction: trend.direction,
            trend_status: trend.status,
            absolute_level: evaluation.absoluteLevel,
            reference_level: evaluation.referenceLevel,
            overall_status: evaluation.overallStatus,
            action_required: evaluation.actionRequired,
            recommendation: evaluation.recommendation,
        };

        await this._setString('chemistry.tds.outputs.summary_text', text);
        await this._setString('chemistry.tds.outputs.summary_html', html);
        await this._setString('chemistry.tds.outputs.summary_json', JSON.stringify(json));
    },

    async _writeDisabled(reason) {
        await this._setBool('chemistry.tds.measurement.allowed', false);
        await this._setString('chemistry.tds.measurement.ignored_reason', reason);
        await this._setString('chemistry.tds.evaluation.overall_status', 'disabled');
        await this._setString('chemistry.tds.evaluation.recommendation', I18n.translate('TDS evaluation is disabled.'));
        await this._setBool('chemistry.tds.evaluation.action_required', false);
        await this._setString('chemistry.tds.debug.last_reason', reason);
        await this._setString('chemistry.tds.debug.last_update', this._formatDateTime(new Date()));
    },

    async _writeInvalid(recommendation, reason) {
        await this._setBool('chemistry.tds.input.source_valid', false);
        await this._setBool('chemistry.tds.input.value_valid', false);
        await this._setBool('chemistry.tds.measurement.allowed', false);
        await this._setString('chemistry.tds.measurement.ignored_reason', reason);
        await this._setString('chemistry.tds.evaluation.overall_status', 'invalid');
        await this._setString('chemistry.tds.evaluation.recommendation', recommendation);
        await this._setBool('chemistry.tds.evaluation.action_required', false);
        await this._setString('chemistry.tds.debug.last_reason', reason);
        await this._setString('chemistry.tds.debug.last_update', this._formatDateTime(new Date()));
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

    async _readJsonArray(id) {
        const state = await this.adapter.getStateAsync(id);

        try {
            const parsed = JSON.parse(String(state?.val || '[]'));
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
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
        return `${rounded >= 0 ? '+' : ''}${rounded} ppm`;
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

module.exports = chemistryTdsHelper;

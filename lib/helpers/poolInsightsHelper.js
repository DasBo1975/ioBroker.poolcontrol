'use strict';

const { I18n } = require('@iobroker/adapter-core');

const POOL_INSIGHTS_PREFIX = 'analytics.insights.pool';
const DEFAULT_DAILY_ANALYSIS_TIME = '20:00';
const SPEECH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const poolInsightsHelper = {
    adapter: null,
    dailyTimer: null,
    running: false,

    init(adapter) {
        this.adapter = adapter;

        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.enabled`);
        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.schedule_time`);
        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.manual_trigger`);
        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.send_to_speech_queue`);

        void this._refreshSchedule();
        this.adapter.log.debug('[poolInsightsHelper] Initialized');
    },

    handleStateChange(id, state) {
        if (!state || state.ack === true) {
            return;
        }

        if (id.endsWith(`${POOL_INSIGHTS_PREFIX}.manual_trigger`) && state.val === true) {
            void this._handleManualTrigger();
            return;
        }

        if (id.endsWith(`${POOL_INSIGHTS_PREFIX}.enabled`) || id.endsWith(`${POOL_INSIGHTS_PREFIX}.schedule_time`)) {
            void this._refreshSchedule();
        }
    },

    async _handleManualTrigger() {
        try {
            await this._runAnalysis('manual', true);
        } finally {
            await this._setState(`${POOL_INSIGHTS_PREFIX}.manual_trigger`, false);
        }
    },

    async _refreshSchedule() {
        if (this.dailyTimer) {
            this.adapter.clearTimeout(this.dailyTimer);
            this.dailyTimer = null;
        }

        const enabled = await this._readBoolean(`${POOL_INSIGHTS_PREFIX}.enabled`);
        if (!enabled) {
            await this._writeDisabled('disabled');
            return;
        }

        await this._scheduleDailyAnalysis();
    },

    async _scheduleDailyAnalysis() {
        if (this.dailyTimer) {
            this.adapter.clearTimeout(this.dailyTimer);
            this.dailyTimer = null;
        }

        const scheduleTime = await this._readString(`${POOL_INSIGHTS_PREFIX}.schedule_time`);
        const { hours, minutes } = this._parseScheduleTime(scheduleTime);
        const now = new Date();
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const delay = Math.max(1000, next.getTime() - now.getTime());
        this.dailyTimer = this.adapter.setTimeout(async () => {
            this.dailyTimer = null;
            await this._runAnalysis('daily', true);
            await this._refreshSchedule();
        }, delay);

        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'scheduled');
        this.adapter.log.debug(`[poolInsightsHelper] Daily analysis scheduled for ${next.toISOString()}`);
    },

    _parseScheduleTime(value) {
        const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
        if (match) {
            return {
                hours: Number(match[1]),
                minutes: Number(match[2]),
            };
        }

        this.adapter.log.debug(
            `[poolInsightsHelper] Invalid schedule_time ${value}, using fallback ${DEFAULT_DAILY_ANALYSIS_TIME}`,
        );
        return {
            hours: 20,
            minutes: 0,
        };
    },

    async _runAnalysis(reason, allowSpeech) {
        if (this.running) {
            this.adapter.log.debug('[poolInsightsHelper] Analysis already running - skipped');
            return;
        }

        this.running = true;
        try {
            await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'running');

            const snapshot = await this._readSnapshot();
            const result = this._buildResult(snapshot, reason);

            await this._writeResult(result);

            if (allowSpeech) {
                await this._sendSpeechIfAllowed(result, reason);
            }

            this.adapter.log.debug(`[poolInsightsHelper] Analysis completed (${reason})`);
        } catch (err) {
            await this._writeError(reason, err);
            this.adapter.log.warn(`[poolInsightsHelper] Analysis failed: ${err.message}`);
        } finally {
            this.running = false;
        }
    },

    async _readSnapshot() {
        return {
            temperature: {
                surfaceCurrent: await this._readNumber('temperature.surface.current'),
                surfaceMinToday: await this._readNumber('temperature.surface.min_today'),
                surfaceMaxToday: await this._readNumber('temperature.surface.max_today'),
                surfaceSummaryJson: await this._readString(
                    'analytics.statistics.temperature.today.surface.summary_json',
                ),
            },
            pump: {
                runtimeTodaySeconds: await this._readNumber('runtime.today_seconds'),
                startCountToday: await this._readNumber('runtime.start_count_today'),
                circulationRequired: await this._readNumber('circulation.daily_required'),
                circulationRemaining: await this._readNumber('circulation.daily_remaining'),
                mode: await this._readString('pump.mode'),
                status: await this._readString('pump.status'),
                error: await this._readBoolean('pump.error'),
                activeHelper: await this._readString('pump.active_helper'),
            },
            solar: {
                ranToday: await this._readBoolean('analytics.insights.solar.results.solar_ran_today'),
                estimatedGainTodayKwh: await this._readNumber(
                    'analytics.insights.solar.results.estimated_gain_today_kwh',
                ),
                evaluationAvailable:
                    (await this._readString('analytics.insights.solar.results.summary_json')) !== '' ||
                    (await this._readString('analytics.insights.solar.results.summary_html')) !== '',
            },
            photovoltaic: {
                activeToday: await this._readBoolean('analytics.insights.photovoltaic.results.active_today'),
                startsToday: await this._readNumber('analytics.insights.photovoltaic.results.starts_today'),
                runtimeTodayMin: await this._readNumber('analytics.insights.photovoltaic.results.runtime_today_min'),
                evaluationAvailable:
                    (await this._readString('analytics.insights.photovoltaic.results.summary_json')) !== '' ||
                    (await this._readString('analytics.insights.photovoltaic.results.summary_text')) !== '',
            },
            consumption: {
                dayKwh: await this._readNumber('consumption.day_kwh'),
                dayEur: await this._readNumber('costs.day_eur'),
            },
            chemistry: {
                phAvailable: await this._hasValue('chemistry.ph.outputs.summary_text'),
                tdsAvailable: await this._hasValue('chemistry.tds.outputs.summary_text'),
                orpAvailable: await this._hasValue('chemistry.orp.outputs.summary_text'),
            },
        };
    },

    _buildResult(snapshot, reason) {
        const observations = [];
        const recommendations = [];
        let level = 'ok';

        const tempDelta = this._getTemperatureDelta(snapshot.temperature);
        if (tempDelta !== null) {
            const rounded = this._round(tempDelta, 1);
            observations.push({
                area: 'temperature',
                level: tempDelta >= 1 ? 'ok' : 'info',
                text: this._translate('pool_insights_observation_temperature_delta', { delta: rounded }),
            });

            if (tempDelta <= 0.2) {
                level = this._raiseLevel(level, 'info');
                recommendations.push(
                    this._createRecommendation(
                        'temperature',
                        'info',
                        'low_temperature_change',
                        0.7,
                        this._translate('pool_insights_recommendation_temperature_low_change'),
                        ['temperature.surface.min_today', 'temperature.surface.max_today'],
                        {
                            temperature_delta_c: rounded,
                        },
                    ),
                );
            }
        }

        if (snapshot.pump.runtimeTodaySeconds !== null) {
            const runtimeLevel = snapshot.pump.runtimeTodaySeconds > 0 ? 'ok' : 'info';
            level = this._raiseLevel(level, runtimeLevel);
            observations.push({
                area: 'pump',
                level: runtimeLevel,
                text: this._translate('pool_insights_observation_pump_runtime', {
                    runtime: this._formatRuntime(snapshot.pump.runtimeTodaySeconds),
                }),
            });
        }

        if (snapshot.pump.startCountToday !== null) {
            observations.push({
                area: 'pump',
                level: snapshot.pump.startCountToday > 12 ? 'info' : 'ok',
                text: this._translate('pool_insights_observation_pump_starts', {
                    count: snapshot.pump.startCountToday,
                }),
            });

            if (snapshot.pump.startCountToday > 12) {
                level = this._raiseLevel(level, 'info');
                recommendations.push(
                    this._createRecommendation(
                        'pump',
                        'info',
                        'many_pump_starts',
                        0.8,
                        this._translate('pool_insights_recommendation_many_pump_starts'),
                        ['runtime.start_count_today'],
                        {
                            starts_today: snapshot.pump.startCountToday,
                        },
                    ),
                );
            }
        }

        if (snapshot.pump.error === true) {
            level = 'warning';
            observations.push({
                area: 'pump',
                level: 'warning',
                text: this._translate('pool_insights_observation_pump_error'),
            });
            recommendations.push(
                this._createRecommendation(
                    'pump',
                    'warning',
                    'pump_error_active',
                    1,
                    this._translate('pool_insights_recommendation_pump_error'),
                    ['pump.error'],
                    {
                        pump_error: true,
                    },
                ),
            );
        }

        this._appendSolarObservations(snapshot.solar, observations);
        this._appendPhotovoltaicObservations(snapshot.photovoltaic, observations);

        if (snapshot.photovoltaic.startsToday !== null && snapshot.photovoltaic.startsToday > 10) {
            level = this._raiseLevel(level, 'info');
            recommendations.push(
                this._createRecommendation(
                    'photovoltaic',
                    'info',
                    'many_pv_starts',
                    0.8,
                    this._translate('pool_insights_recommendation_many_pv_starts'),
                    ['analytics.insights.photovoltaic.results.starts_today'],
                    {
                        pv_starts_today: snapshot.photovoltaic.startsToday,
                    },
                ),
            );
        }

        this._appendConsumptionObservations(snapshot.consumption, observations);
        this._appendChemistryObservations(snapshot.chemistry, observations);

        if (this._hasLimitedCoreData(snapshot)) {
            level = this._raiseLevel(level, 'info');
            observations.push({
                area: 'pool',
                level: 'info',
                text: this._translate('pool_insights_observation_not_enough_data'),
            });
        }

        if (observations.length === 0) {
            observations.push({
                area: 'pool',
                level: 'ok',
                text: this._translate('pool_insights_observation_not_enough_data'),
            });
            level = 'info';
        }

        level = observations.reduce((current, entry) => this._raiseLevel(current, entry.level), level);

        const summaryText = this._buildSummaryText(level, observations, recommendations);
        const now = new Date().toISOString();

        return {
            status: 'completed',
            level,
            summaryText,
            summaryHtml: this._buildSummaryHtml(level, observations, recommendations),
            summaryJson: {
                status: 'completed',
                level,
                reason,
                last_update: now,
                inputs: snapshot,
                observations,
                recommendations,
            },
            observations,
            recommendations,
            lastUpdate: now,
            reason,
        };
    },

    _getTemperatureDelta(temperature) {
        if (temperature.surfaceMaxToday === null || temperature.surfaceMinToday === null) {
            return null;
        }

        return Math.max(0, temperature.surfaceMaxToday - temperature.surfaceMinToday);
    },

    _appendSolarObservations(solar, observations) {
        if (solar.ranToday === true) {
            observations.push({
                area: 'solar',
                level: 'ok',
                text: this._translate('pool_insights_observation_solar_ran_today'),
            });
        } else if (solar.evaluationAvailable) {
            observations.push({
                area: 'solar',
                level: 'info',
                text: this._translate('pool_insights_observation_solar_not_ran_today'),
            });
        }

        if (solar.estimatedGainTodayKwh !== null && solar.estimatedGainTodayKwh > 0) {
            observations.push({
                area: 'solar',
                level: 'ok',
                text: this._translate('pool_insights_observation_solar_gain_today', {
                    kwh: this._round(solar.estimatedGainTodayKwh, 2),
                }),
            });
        } else if (solar.evaluationAvailable && solar.ranToday !== true) {
            observations.push({
                area: 'solar',
                level: 'info',
                text: this._translate('pool_insights_observation_solar_evaluation_available'),
            });
        }
    },

    _appendPhotovoltaicObservations(photovoltaic, observations) {
        if (photovoltaic.activeToday === true) {
            observations.push({
                area: 'photovoltaic',
                level: 'ok',
                text: this._translate('pool_insights_observation_pv_used_today'),
            });
        } else if (photovoltaic.evaluationAvailable) {
            observations.push({
                area: 'photovoltaic',
                level: 'info',
                text: this._translate('pool_insights_observation_pv_evaluation_available'),
            });
        }

        if (photovoltaic.runtimeTodayMin !== null && photovoltaic.runtimeTodayMin > 0) {
            observations.push({
                area: 'photovoltaic',
                level: 'ok',
                text: this._translate('pool_insights_observation_pv_runtime_today', {
                    minutes: this._round(photovoltaic.runtimeTodayMin, 0),
                }),
            });
        }
    },

    _appendConsumptionObservations(consumption, observations) {
        if (consumption.dayKwh !== null) {
            observations.push({
                area: 'energy',
                level: 'ok',
                text: this._translate('pool_insights_observation_consumption_today', {
                    kwh: this._round(consumption.dayKwh, 2),
                }),
            });
        }

        if (consumption.dayEur !== null) {
            observations.push({
                area: 'energy',
                level: 'ok',
                text: this._translate('pool_insights_observation_costs_today', {
                    eur: this._round(consumption.dayEur, 2),
                }),
            });
        }
    },

    _appendChemistryObservations(chemistry, observations) {
        const chemistryEvaluations = [
            {
                area: 'chemistry_ph',
                available: chemistry.phAvailable,
                key: 'pool_insights_observation_ph_evaluation_available',
            },
            {
                area: 'chemistry_tds',
                available: chemistry.tdsAvailable,
                key: 'pool_insights_observation_tds_evaluation_available',
            },
            {
                area: 'chemistry_orp',
                available: chemistry.orpAvailable,
                key: 'pool_insights_observation_orp_evaluation_available',
            },
        ];

        for (const entry of chemistryEvaluations) {
            if (!entry.available) {
                continue;
            }

            observations.push({
                area: entry.area,
                level: 'info',
                text: this._translate(entry.key),
            });
        }
    },

    _hasLimitedCoreData(snapshot) {
        return (
            this._getTemperatureDelta(snapshot.temperature) === null ||
            snapshot.pump.runtimeTodaySeconds === null ||
            snapshot.pump.startCountToday === null ||
            snapshot.consumption.dayKwh === null
        );
    },

    _buildSummaryText(level, observations, recommendations) {
        const lead = {
            ok: this._translate('pool_insights_summary_ok'),
            info: this._translate('pool_insights_summary_info'),
            warning: this._translate('pool_insights_summary_warning'),
        }[level];

        const parts = [lead || this._translate('pool_insights_summary_completed')];
        for (const entry of observations.slice(0, 4)) {
            parts.push(entry.text);
        }
        for (const entry of recommendations.slice(0, 2)) {
            parts.push(entry.text);
        }

        return parts.join(' ');
    },

    _buildSummaryHtml(level, observations, recommendations) {
        const items = observations.map(entry => `<li>${this._escapeHtml(entry.text)}</li>`).join('');
        const recommendationItems = recommendations.map(entry => `<li>${this._escapeHtml(entry.text)}</li>`).join('');

        return [
            `<div class="pool-insights pool-insights-${this._escapeHtml(level)}">`,
            `<strong>${this._escapeHtml(level)}</strong>`,
            items ? `<ul>${items}</ul>` : '',
            recommendationItems
                ? `<p>${this._translate('pool_insights_label_recommendations')}:</p><ul>${recommendationItems}</ul>`
                : '',
            '</div>',
        ].join('');
    },

    async _writeResult(result) {
        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, result.status);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.level`, result.level);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_text`, result.summaryText);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_html`, result.summaryHtml);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_json`, JSON.stringify(result.summaryJson));
        await this._setState(`${POOL_INSIGHTS_PREFIX}.observations_json`, JSON.stringify(result.observations));
        await this._setState(`${POOL_INSIGHTS_PREFIX}.recommendations_json`, JSON.stringify(result.recommendations));
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_update`, result.lastUpdate);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.debug.last_reason`, result.reason);
    },

    async _writeDisabled(reason) {
        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'disabled');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.level`, 'none');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_text`, '');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_html`, '');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_json`, '{}');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.observations_json`, '[]');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.recommendations_json`, '[]');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_update`, new Date().toISOString());
        await this._setState(`${POOL_INSIGHTS_PREFIX}.debug.last_reason`, reason);
    },

    async _writeError(reason, err) {
        const now = new Date().toISOString();
        const text = this._translate('pool_insights_error_analysis_failed');

        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'error');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.level`, 'warning');
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_text`, text);
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.summary_html`,
            `<div class="pool-insights-error">${this._escapeHtml(text)}</div>`,
        );
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.summary_json`,
            JSON.stringify({
                status: 'error',
                level: 'warning',
                reason,
                last_update: now,
                error: err?.message || 'unknown',
            }),
        );
        await this._setState(`${POOL_INSIGHTS_PREFIX}.observations_json`, '[]');
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.recommendations_json`,
            JSON.stringify([
                {
                    area: 'pool',
                    level: 'warning',
                    text: this._translate('pool_insights_error_check_log'),
                },
            ]),
        );
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_update`, now);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.debug.last_reason`, reason);
    },

    async _sendSpeechIfAllowed(result, reason) {
        const sendToSpeech = await this._readBoolean(`${POOL_INSIGHTS_PREFIX}.send_to_speech_queue`);
        if (!sendToSpeech || !result.summaryText) {
            return;
        }

        if (reason === 'daily') {
            const lastSpeechAt = await this._readString(`${POOL_INSIGHTS_PREFIX}.last_speech_at`);
            const lastSpeechTime = Date.parse(lastSpeechAt || '');
            if (Number.isFinite(lastSpeechTime) && Date.now() - lastSpeechTime < SPEECH_COOLDOWN_MS) {
                this.adapter.log.debug('[poolInsightsHelper] Automatic speech skipped due to cooldown');
                return;
            }
        }

        // Use the relative state id intentionally so multiple adapter instances write to their own speech.queue.
        await this._setState('speech.queue', result.summaryText, false);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_speech_at`, new Date().toISOString());
    },

    async _readState(id) {
        try {
            return await this.adapter.getStateAsync(id);
        } catch {
            return null;
        }
    },

    async _readString(id) {
        const state = await this._readState(id);
        if (state === null || state.val === null || state.val === undefined || state.val === '') {
            return '';
        }
        return String(state.val);
    },

    async _readNumber(id) {
        const state = await this._readState(id);
        if (state === null || state.val === null || state.val === undefined || state.val === '') {
            return null;
        }

        const value = Number(state.val);
        return Number.isFinite(value) ? value : null;
    },

    async _readBoolean(id) {
        const state = await this._readState(id);
        return state?.val === true;
    },

    async _hasValue(id) {
        return (await this._readString(id)) !== '';
    },

    async _setState(id, val, ack = true) {
        await this.adapter.setStateChangedAsync(id, { val, ack });
    },

    _createRecommendation(area, level, reason, confidence, text, sourceStates = [], evidence = {}) {
        return {
            area: String(area || ''),
            level: String(level || ''),
            reason: String(reason || ''),
            confidence: this._clampConfidence(confidence),
            text: String(text || ''),
            source_states: Array.isArray(sourceStates)
                ? sourceStates.filter(value => value !== undefined).map(value => String(value))
                : [],
            evidence: this._cleanEvidence(evidence),
        };
    },

    _clampConfidence(value) {
        const confidence = Number(value);
        if (!Number.isFinite(confidence)) {
            return 0;
        }
        return Math.min(1, Math.max(0, confidence));
    },

    _cleanEvidence(evidence) {
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
            return {};
        }

        return this._cleanObject(evidence);
    },

    _cleanObject(object) {
        const cleaned = {};
        for (const [key, value] of Object.entries(object)) {
            const cleanedValue = this._cleanValue(value);
            if (cleanedValue !== undefined) {
                cleaned[key] = cleanedValue;
            }
        }
        return cleaned;
    },

    _cleanValue(value) {
        if (value === undefined) {
            return undefined;
        }
        if (Array.isArray(value)) {
            return value.map(entry => this._cleanValue(entry)).filter(entry => entry !== undefined);
        }
        if (value !== null && typeof value === 'object') {
            return this._cleanObject(value);
        }
        return value;
    },

    _formatRuntime(seconds) {
        const totalMinutes = Math.max(0, Math.round(seconds / 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0) {
            return `${hours} h ${minutes} min`;
        }
        return `${minutes} min`;
    },

    _raiseLevel(current, candidate) {
        const order = { ok: 0, info: 1, warning: 2 };
        return order[candidate] > order[current] ? candidate : current;
    },

    _round(value, digits) {
        const factor = 10 ** digits;
        return Math.round(value * factor) / factor;
    },

    _translate(key, replacements = {}) {
        let text = I18n.translate(key);
        for (const [name, value] of Object.entries(replacements)) {
            text = text.replace(`{${name}}`, String(value));
        }
        return text;
    },

    _escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    cleanup() {
        if (this.dailyTimer) {
            this.adapter.clearTimeout(this.dailyTimer);
            this.dailyTimer = null;
        }
        this.running = false;
        this.adapter && this.adapter.log.debug('[poolInsightsHelper] Cleanup completed');
    },
};

module.exports = poolInsightsHelper;

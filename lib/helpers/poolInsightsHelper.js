'use strict';

const { I18n } = require('@iobroker/adapter-core');

const POOL_INSIGHTS_PREFIX = 'analytics.insights.pool';
const DEFAULT_DAILY_ANALYSIS_TIME = '20:00';
const SPEECH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const poolInsightsHelper = /** @satisfies {import('../types/poolcontrol-adapter').PoolInsightsHelper} */ ({
    _adapter: null,
    _active: false,
    _initialized: false,
    _lifecycleGeneration: 0,
    _initializationPromise: null,
    _pendingManualTriggers: [],
    dailyTimer: null,
    running: false,

    /**
     * Returns the initialized ioBroker adapter instance.
     *
     * @returns Initialized adapter instance.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('poolInsightsHelper used before init()');
        }

        return this._adapter;
    },

    init(adapter) {
        this._adapter = adapter;
        this._active = true;
        this._initialized = false;
        const generation = ++this._lifecycleGeneration;

        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.enabled`);
        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.schedule_time`);
        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.manual_trigger`);
        this.adapter.subscribeStates(`${POOL_INSIGHTS_PREFIX}.send_to_speech_queue`);

        const initialization = this._initialize(generation);
        this._initializationPromise = initialization;
        this._runLifecycleTask(initialization, generation, 'initialization');
        this.adapter.log.debug('[poolInsightsHelper] Initialized');
    },

    handleStateChange(id, state) {
        if (!state || state.ack === true) {
            return;
        }

        if (id.endsWith(`${POOL_INSIGHTS_PREFIX}.manual_trigger`) && state.val === true) {
            if (!this._active) {
                if (this._lifecycleGeneration === 0) {
                    this._pendingManualTriggers.push(true);
                }
                return;
            }

            if (!this._initialized) {
                this._pendingManualTriggers.push(true);
                return;
            }

            const generation = this._lifecycleGeneration;
            this._runLifecycleTask(this._handleManualTrigger(generation), generation, 'manual trigger');
            return;
        }

        if (!this._active || !this._initialized) {
            return;
        }

        if (id.endsWith(`${POOL_INSIGHTS_PREFIX}.enabled`) || id.endsWith(`${POOL_INSIGHTS_PREFIX}.schedule_time`)) {
            const generation = this._lifecycleGeneration;
            this._runLifecycleTask(this._refreshSchedule(generation), generation, 'schedule refresh');
        }
    },

    async _initialize(generation) {
        await this._refreshSchedule(generation);

        if (!this._isGenerationActive(generation)) {
            return;
        }

        this._initialized = true;
        const pendingTriggers = this._pendingManualTriggers.splice(0);
        await Promise.all(pendingTriggers.map(() => this._handleManualTrigger(generation)));
    },

    _runLifecycleTask(task, generation, context) {
        void task.catch(err => {
            if (this._isGenerationActive(generation)) {
                this.adapter.log.warn(`[poolInsightsHelper] ${context} failed: ${err.message}`);
            }
        });
    },

    _isGenerationActive(generation) {
        return this._active && generation === this._lifecycleGeneration;
    },

    async _handleManualTrigger(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        try {
            await this._runAnalysis('manual', true, generation);
        } finally {
            await this._setState(`${POOL_INSIGHTS_PREFIX}.manual_trigger`, false, true, generation);
        }
    },

    async _refreshSchedule(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        if (this.dailyTimer) {
            this.adapter.clearTimeout(this.dailyTimer);
            this.dailyTimer = null;
        }

        const enabled = await this._readBoolean(`${POOL_INSIGHTS_PREFIX}.enabled`, generation);
        if (!this._isGenerationActive(generation)) {
            return;
        }

        if (!enabled) {
            await this._writeDisabled('disabled', generation);
            return;
        }

        await this._scheduleDailyAnalysis(generation);
    },

    async _scheduleDailyAnalysis(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        if (this.dailyTimer) {
            this.adapter.clearTimeout(this.dailyTimer);
            this.dailyTimer = null;
        }

        const scheduleTime = await this._readString(`${POOL_INSIGHTS_PREFIX}.schedule_time`, generation);
        if (!this._isGenerationActive(generation)) {
            return;
        }

        const { hours, minutes } = this._parseScheduleTime(scheduleTime);
        const now = new Date();
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const delay = Math.max(1000, next.getTime() - now.getTime());
        this.dailyTimer = this.adapter.setTimeout(async () => {
            if (!this._isGenerationActive(generation)) {
                return;
            }

            this.dailyTimer = null;
            await this._runAnalysis('daily', true, generation);
            if (this._isGenerationActive(generation)) {
                await this._refreshSchedule(generation);
            }
        }, delay);

        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'scheduled', true, generation);
        if (this._isGenerationActive(generation)) {
            this.adapter.log.debug(`[poolInsightsHelper] Daily analysis scheduled for ${next.toISOString()}`);
        }
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

    async _runAnalysis(reason, allowSpeech, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

        if (this.running) {
            this.adapter.log.debug('[poolInsightsHelper] Analysis already running - skipped');
            return;
        }

        this.running = true;
        try {
            await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'running', true, generation);
            if (!this._isGenerationActive(generation)) {
                return;
            }

            const snapshot = await this._readSnapshot(generation);
            if (!this._isGenerationActive(generation)) {
                return;
            }

            const result = this._buildResult(snapshot, reason);

            await this._writeResult(result, generation);
            if (!this._isGenerationActive(generation)) {
                return;
            }

            if (allowSpeech) {
                await this._sendSpeechIfAllowed(result, reason, generation);
            }

            if (this._isGenerationActive(generation)) {
                this.adapter.log.debug(`[poolInsightsHelper] Analysis completed (${reason})`);
            }
        } catch (err) {
            if (this._isGenerationActive(generation)) {
                await this._writeError(reason, err, generation);
                if (this._isGenerationActive(generation)) {
                    this.adapter.log.warn(`[poolInsightsHelper] Analysis failed: ${err.message}`);
                }
            }
        } finally {
            if (generation === this._lifecycleGeneration) {
                this.running = false;
            }
        }
    },

    async _readSnapshot(generation) {
        return {
            temperature: {
                surfaceCurrent: await this._readNumber('temperature.surface.current', generation),
                surfaceMinToday: await this._readNumber('temperature.surface.min_today', generation),
                surfaceMaxToday: await this._readNumber('temperature.surface.max_today', generation),
                surfaceSummaryJson: await this._readString(
                    'analytics.statistics.temperature.today.surface.summary_json',
                    generation,
                ),
            },
            pump: {
                runtimeTodaySeconds: await this._readNumber('runtime.today_seconds', generation),
                startCountToday: await this._readNumber('runtime.start_count_today', generation),
                circulationRequired: await this._readNumber('circulation.daily_required', generation),
                circulationRemaining: await this._readNumber('circulation.daily_remaining', generation),
                mode: await this._readString('pump.mode', generation),
                status: await this._readString('pump.status', generation),
                error: await this._readBoolean('pump.error', generation),
                activeHelper: await this._readString('pump.active_helper', generation),
            },
            solar: {
                ranToday: await this._readBoolean('analytics.insights.solar.results.solar_ran_today', generation),
                estimatedGainTodayKwh: await this._readNumber(
                    'analytics.insights.solar.results.estimated_gain_today_kwh',
                    generation,
                ),
                evaluationAvailable:
                    (await this._readString('analytics.insights.solar.results.summary_json', generation)) !== '' ||
                    (await this._readString('analytics.insights.solar.results.summary_html', generation)) !== '',
            },
            photovoltaic: {
                activeToday: await this._readBoolean(
                    'analytics.insights.photovoltaic.results.active_today',
                    generation,
                ),
                startsToday: await this._readNumber('analytics.insights.photovoltaic.results.starts_today', generation),
                runtimeTodayMin: await this._readNumber(
                    'analytics.insights.photovoltaic.results.runtime_today_min',
                    generation,
                ),
                evaluationAvailable:
                    (await this._readString('analytics.insights.photovoltaic.results.summary_json', generation)) !==
                        '' ||
                    (await this._readString('analytics.insights.photovoltaic.results.summary_text', generation)) !== '',
            },
            consumption: {
                dayKwh: await this._readNumber('consumption.day_kwh', generation),
                dayEur: await this._readNumber('costs.day_eur', generation),
            },
            chemistry: {
                phAvailable: await this._hasValue('chemistry.ph.outputs.summary_text', generation),
                tdsAvailable: await this._hasValue('chemistry.tds.outputs.summary_text', generation),
                orpAvailable: await this._hasValue('chemistry.orp.outputs.summary_text', generation),
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

    async _writeResult(result, generation) {
        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, result.status, true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.level`, result.level, true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_text`, result.summaryText, true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_html`, result.summaryHtml, true, generation);
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.summary_json`,
            JSON.stringify(result.summaryJson),
            true,
            generation,
        );
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.observations_json`,
            JSON.stringify(result.observations),
            true,
            generation,
        );
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.recommendations_json`,
            JSON.stringify(result.recommendations),
            true,
            generation,
        );
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_update`, result.lastUpdate, true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.debug.last_reason`, result.reason, true, generation);
    },

    async _writeDisabled(reason, generation) {
        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'disabled', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.level`, 'none', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_text`, '', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_html`, '', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_json`, '{}', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.observations_json`, '[]', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.recommendations_json`, '[]', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_update`, new Date().toISOString(), true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.debug.last_reason`, reason, true, generation);
    },

    async _writeError(reason, err, generation) {
        const now = new Date().toISOString();
        const text = this._translate('pool_insights_error_analysis_failed');

        await this._setState(`${POOL_INSIGHTS_PREFIX}.status`, 'error', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.level`, 'warning', true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.summary_text`, text, true, generation);
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.summary_html`,
            `<div class="pool-insights-error">${this._escapeHtml(text)}</div>`,
            true,
            generation,
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
            true,
            generation,
        );
        await this._setState(`${POOL_INSIGHTS_PREFIX}.observations_json`, '[]', true, generation);
        await this._setState(
            `${POOL_INSIGHTS_PREFIX}.recommendations_json`,
            JSON.stringify([
                {
                    area: 'pool',
                    level: 'warning',
                    text: this._translate('pool_insights_error_check_log'),
                },
            ]),
            true,
            generation,
        );
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_update`, now, true, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.debug.last_reason`, reason, true, generation);
    },

    async _sendSpeechIfAllowed(result, reason, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        const sendToSpeech = await this._readBoolean(`${POOL_INSIGHTS_PREFIX}.send_to_speech_queue`, generation);
        if (!this._isGenerationActive(generation)) {
            return;
        }

        if (!sendToSpeech || !result.summaryText) {
            return;
        }

        if (reason === 'daily') {
            const lastSpeechAt = await this._readString(`${POOL_INSIGHTS_PREFIX}.last_speech_at`, generation);
            if (!this._isGenerationActive(generation)) {
                return;
            }

            const lastSpeechTime = Date.parse(lastSpeechAt || '');
            if (Number.isFinite(lastSpeechTime) && Date.now() - lastSpeechTime < SPEECH_COOLDOWN_MS) {
                this.adapter.log.debug('[poolInsightsHelper] Automatic speech skipped due to cooldown');
                return;
            }
        }

        // Use the relative state id intentionally so multiple adapter instances write to their own speech.queue.
        await this._setState('speech.queue', result.summaryText, false, generation);
        await this._setState(`${POOL_INSIGHTS_PREFIX}.last_speech_at`, new Date().toISOString(), true, generation);
    },

    async _readState(id, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return null;
        }

        try {
            const state = await this.adapter.getStateAsync(id);
            return this._isGenerationActive(generation) ? state : null;
        } catch {
            return null;
        }
    },

    async _readString(id, generation) {
        const state = await this._readState(id, generation);
        if (state === null || state.val === null || state.val === undefined || state.val === '') {
            return '';
        }
        return String(state.val);
    },

    async _readNumber(id, generation) {
        const state = await this._readState(id, generation);
        if (state === null || state.val === null || state.val === undefined || state.val === '') {
            return null;
        }

        const value = Number(state.val);
        return Number.isFinite(value) ? value : null;
    },

    async _readBoolean(id, generation) {
        const state = await this._readState(id, generation);
        return state?.val === true;
    },

    async _hasValue(id, generation) {
        return (await this._readString(id, generation)) !== '';
    },

    async _setState(id, val, ack = true, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }

        if (!this._isGenerationActive(generation)) {
            return;
        }

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
        const cleaned = /** @satisfies {Record<string, unknown>} */ ({});
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
        this._active = false;
        this._initialized = false;
        ++this._lifecycleGeneration;
        this._initializationPromise = null;
        this._pendingManualTriggers = [];

        if (this.dailyTimer) {
            this.adapter.clearTimeout(this.dailyTimer);
            this.dailyTimer = null;
        }
        this.running = false;
        this._adapter?.log.debug('[poolInsightsHelper] Cleanup completed');
    },
});

module.exports = poolInsightsHelper;

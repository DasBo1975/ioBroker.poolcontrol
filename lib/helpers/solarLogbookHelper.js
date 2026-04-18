'use strict';

const { I18n } = require('@iobroker/adapter-core');

/**
 * solarLogbookHelper
 * - Creates human-readable solar logbook entries for the current day
 * - Uses existing solar insights states only
 * - Writes JSON + text + HTML logbook outputs
 * - Event-based with debounce
 * - Keeps user-facing texts human-friendly
 */

const solarLogbookHelper = {
    adapter: null,
    checkTimer: null,
    resetTimer: null,

    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        this._scheduleDailyReset();
        this._scheduleCheck(0);

        this.adapter.log.debug('[solarLogbookHelper] Initialized');
    },

    handleStateChange(id, state) {
        if (!state || state.ack !== true) {
            return;
        }

        if (!this._isRelevantState(id)) {
            return;
        }

        this._scheduleCheck(250);
    },

    _scheduleCheck(delayMs = 0) {
        if (this.checkTimer) {
            this.adapter.clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }

        this.checkTimer = this.adapter.setTimeout(() => {
            this.checkTimer = null;
            void this._updateLogbook();
        }, delayMs);
    },

    _scheduleDailyReset() {
        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        const now = new Date();
        const next = new Date(now);
        next.setDate(now.getDate() + 1);
        next.setHours(0, 0, 10, 0);

        const delay = Math.max(1000, next.getTime() - now.getTime());

        this.resetTimer = this.adapter.setTimeout(async () => {
            try {
                await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.current_entry', {
                    val: '',
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.current_entry_html', {
                    val: '',
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.day_log_json', {
                    val: '[]',
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.day_log_text', {
                    val: '',
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.last_entry_time', {
                    val: '',
                    ack: true,
                });

                this.adapter.log.debug('[solarLogbookHelper] Daily reset executed');
            } catch (err) {
                this.adapter.log.warn(`[solarLogbookHelper] Daily reset failed: ${err.message}`);
            }

            this._scheduleDailyReset();
        }, delay);
    },

    async _subscribeStates() {
        const ids = [
            'analytics.insights.solar.results.solar_ran_today',
            'analytics.insights.solar.results.solar_effective_now',
            'analytics.insights.solar.results.solar_gain_state',
            'analytics.insights.solar.results.collector_temp_used',
            'analytics.insights.solar.results.pool_reference_temp_used',
            'analytics.insights.solar.results.delta_t_used',
            'analytics.insights.solar.results.outside_temp_used',
            'analytics.insights.solar.results.flow_lh_used',
            'analytics.insights.solar.results.pump_power_w_used',
            'analytics.insights.solar.results.estimated_thermal_power_w',
            'analytics.insights.solar.results.estimated_thermal_power_kw',
            'analytics.insights.solar.results.estimated_efficiency_ratio',
            'analytics.insights.solar.results.estimated_gain_today_wh',
            'analytics.insights.solar.results.estimated_gain_today_kwh',
            'analytics.insights.solar.results.active_minutes_today',
            'analytics.insights.solar.results.peak_power_today_w',

            'analytics.insights.solar.calculation.quality_level',
            'analytics.insights.solar.calculation.confidence_percent',
            'analytics.insights.solar.calculation.weather_correction_active',

            'analytics.insights.solar.inputs.used_sensors_text',

            'ai.weather.outputs.daily_summary',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[solarLogbookHelper] Relevant states subscribed');
    },

    _isRelevantState(id) {
        const ids = [
            'analytics.insights.solar.results.solar_ran_today',
            'analytics.insights.solar.results.solar_effective_now',
            'analytics.insights.solar.results.solar_gain_state',
            'analytics.insights.solar.results.collector_temp_used',
            'analytics.insights.solar.results.pool_reference_temp_used',
            'analytics.insights.solar.results.delta_t_used',
            'analytics.insights.solar.results.outside_temp_used',
            'analytics.insights.solar.results.flow_lh_used',
            'analytics.insights.solar.results.pump_power_w_used',
            'analytics.insights.solar.results.estimated_thermal_power_w',
            'analytics.insights.solar.results.estimated_thermal_power_kw',
            'analytics.insights.solar.results.estimated_efficiency_ratio',
            'analytics.insights.solar.results.estimated_gain_today_wh',
            'analytics.insights.solar.results.estimated_gain_today_kwh',
            'analytics.insights.solar.results.active_minutes_today',
            'analytics.insights.solar.results.peak_power_today_w',

            'analytics.insights.solar.calculation.quality_level',
            'analytics.insights.solar.calculation.confidence_percent',
            'analytics.insights.solar.calculation.weather_correction_active',

            'analytics.insights.solar.inputs.used_sensors_text',

            'ai.weather.outputs.daily_summary',
        ];

        return ids.some(relevantId => id === relevantId || id.endsWith(`.${relevantId}`));
    },

    async _updateLogbook() {
        try {
            const solarRanToday = await this._readBoolean('analytics.insights.solar.results.solar_ran_today');
            const solarEffectiveNow = await this._readBoolean('analytics.insights.solar.results.solar_effective_now');

            const collectorTemp = await this._readNumber('analytics.insights.solar.results.collector_temp_used');
            const poolReferenceTemp = await this._readNumber(
                'analytics.insights.solar.results.pool_reference_temp_used',
            );
            const deltaTUsed = await this._readNumber('analytics.insights.solar.results.delta_t_used');
            const outsideTemp = await this._readNumber('analytics.insights.solar.results.outside_temp_used');
            const flowLhUsed = await this._readNumber('analytics.insights.solar.results.flow_lh_used');
            const pumpPowerWUsed = await this._readNumber('analytics.insights.solar.results.pump_power_w_used');
            const thermalPowerW = await this._readNumber('analytics.insights.solar.results.estimated_thermal_power_w');
            const thermalPowerKW = await this._readNumber(
                'analytics.insights.solar.results.estimated_thermal_power_kw',
            );
            const efficiencyRatio = await this._readNumber(
                'analytics.insights.solar.results.estimated_efficiency_ratio',
            );
            const gainTodayWh = await this._readNumber('analytics.insights.solar.results.estimated_gain_today_wh');
            const gainTodayKWh = await this._readNumber('analytics.insights.solar.results.estimated_gain_today_kwh');
            const activeMinutesToday = await this._readNumber('analytics.insights.solar.results.active_minutes_today');
            const peakPowerTodayW = await this._readNumber('analytics.insights.solar.results.peak_power_today_w');

            const qualityLevel = await this._readString('analytics.insights.solar.calculation.quality_level');
            const confidencePercent = await this._readNumber('analytics.insights.solar.calculation.confidence_percent');
            const weatherCorrectionActive = await this._readBoolean(
                'analytics.insights.solar.calculation.weather_correction_active',
            );

            const usedSensorsText = await this._readString('analytics.insights.solar.inputs.used_sensors_text');
            const weatherSummary = await this._readString('ai.weather.outputs.daily_summary');

            const entry = this._buildHumanEntry({
                solarRanToday,
                solarEffectiveNow,
                collectorTemp,
                poolReferenceTemp,
                deltaTUsed,
                outsideTemp,
                flowLhUsed,
                pumpPowerWUsed,
                thermalPowerW,
                thermalPowerKW,
                efficiencyRatio,
                gainTodayWh,
                gainTodayKWh,
                activeMinutesToday,
                peakPowerTodayW,
                qualityLevel,
                confidencePercent,
                weatherCorrectionActive,
                usedSensorsText,
                weatherSummary,
            });

            const currentEntry = await this._readString('analytics.insights.solar.logbook.current_entry');

            if (currentEntry === entry.text) {
                return;
            }

            const now = new Date();
            const nowIso = now.toISOString();
            const timeLabel = this._formatTime(now);

            const newLogItem = {
                ts: nowIso,
                time: timeLabel,
                type: entry.type,
                text: entry.text,
                html: entry.html,
            };

            const dayLogJsonRaw = await this._readString('analytics.insights.solar.logbook.day_log_json');
            const dayLog = this._safeParseArray(dayLogJsonRaw);

            dayLog.push(newLogItem);

            const trimmedLog = dayLog.slice(-100);

            const dayLogText = trimmedLog.map(item => `${item.time} - ${item.text}`).join('\n');

            await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.current_entry', {
                val: entry.text,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.current_entry_html', {
                val: entry.html,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.day_log_json', {
                val: JSON.stringify(trimmedLog),
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.day_log_text', {
                val: dayLogText,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.logbook.last_entry_time', {
                val: nowIso,
                ack: true,
            });

            this.adapter.log.debug('[solarLogbookHelper] Logbook updated successfully');
        } catch (err) {
            this.adapter.log.warn(`[solarLogbookHelper] Error in update: ${err.message}`);
        }
    },

    _buildHumanEntry(data) {
        const {
            solarRanToday,
            solarEffectiveNow,
            collectorTemp,
            poolReferenceTemp,
            deltaTUsed,
            outsideTemp,
            flowLhUsed,
            pumpPowerWUsed,
            thermalPowerW,
            thermalPowerKW,
            efficiencyRatio,
            gainTodayWh,
            gainTodayKWh,
            activeMinutesToday,
            peakPowerTodayW,
            qualityLevel,
            confidencePercent,
            weatherCorrectionActive,
            usedSensorsText,
            weatherSummary,
        } = data;

        const sentences = [];
        const usedSensors = usedSensorsText || this._t('solar_log_value_unknown');
        const confidenceText = Number.isFinite(confidencePercent)
            ? this._tf('solar_log_confidence_text', this._formatNumber(confidencePercent, 0))
            : '';
        const weatherTextShort = this._extractShortWeather(weatherSummary);

        if (!solarRanToday) {
            sentences.push(this._t('solar_log_text_no_runtime_today'));

            if (weatherTextShort !== '') {
                sentences.push(this._tf('solar_log_text_weather_short', weatherTextShort));
            }

            if (confidenceText !== '') {
                sentences.push(confidenceText);
            }

            sentences.push(this._tf('solar_log_text_used_sensors', usedSensors));

            const text = sentences.join(' ');
            return {
                type: 'no_runtime_today',
                text,
                html: this._escapeHtml(text),
            };
        }

        if (solarEffectiveNow && Number.isFinite(thermalPowerKW) && thermalPowerKW > 0) {
            sentences.push(this._tf('solar_log_text_active_effective', this._formatNumber(thermalPowerKW, 2)));
        } else if (solarEffectiveNow) {
            sentences.push(this._t('solar_log_text_active_without_clear_gain'));
        } else {
            sentences.push(this._t('solar_log_text_not_active_now'));
        }

        if (Number.isFinite(gainTodayKWh) && gainTodayKWh >= 3) {
            sentences.push(this._tf('solar_log_text_good_day', this._formatNumber(gainTodayKWh, 2)));
        } else if (Number.isFinite(gainTodayKWh) && gainTodayKWh >= 1) {
            sentences.push(this._tf('solar_log_text_moderate_day', this._formatNumber(gainTodayKWh, 2)));
        } else if (Number.isFinite(gainTodayKWh) && gainTodayKWh > 0) {
            sentences.push(this._tf('solar_log_text_low_day', this._formatNumber(gainTodayKWh, 2)));
        } else {
            sentences.push(this._t('solar_log_text_no_clear_day_gain'));
        }

        if (Number.isFinite(collectorTemp) && Number.isFinite(poolReferenceTemp) && Number.isFinite(deltaTUsed)) {
            if (deltaTUsed > 0.5) {
                sentences.push(
                    this._tf(
                        'solar_log_text_temperature_positive',
                        this._formatNumber(collectorTemp, 1),
                        this._formatNumber(poolReferenceTemp, 1),
                        this._formatNumber(deltaTUsed, 1),
                    ),
                );
            } else if (deltaTUsed <= 0.5 && deltaTUsed >= -0.5) {
                sentences.push(
                    this._tf(
                        'solar_log_text_temperature_neutral',
                        this._formatNumber(collectorTemp, 1),
                        this._formatNumber(poolReferenceTemp, 1),
                    ),
                );
            } else {
                sentences.push(
                    this._tf(
                        'solar_log_text_temperature_negative',
                        this._formatNumber(collectorTemp, 1),
                        this._formatNumber(poolReferenceTemp, 1),
                    ),
                );
            }
        }

        if (Number.isFinite(flowLhUsed) && flowLhUsed > 0 && Number.isFinite(pumpPowerWUsed) && pumpPowerWUsed > 0) {
            sentences.push(
                this._tf(
                    'solar_log_text_flow_and_pump',
                    this._formatNumber(flowLhUsed, 0),
                    this._formatNumber(pumpPowerWUsed, 0),
                ),
            );
        } else if (Number.isFinite(flowLhUsed) && flowLhUsed > 0) {
            sentences.push(this._tf('solar_log_text_flow_only', this._formatNumber(flowLhUsed, 0)));
        }

        if (
            Number.isFinite(thermalPowerW) &&
            thermalPowerW > 0 &&
            Number.isFinite(peakPowerTodayW) &&
            peakPowerTodayW > 0
        ) {
            sentences.push(
                this._tf(
                    'solar_log_text_power_and_peak',
                    this._formatNumber(thermalPowerW, 0),
                    this._formatNumber(peakPowerTodayW, 0),
                ),
            );
        }

        if (Number.isFinite(efficiencyRatio) && efficiencyRatio > 0) {
            if (efficiencyRatio >= 5) {
                sentences.push(this._tf('solar_log_text_efficiency_high', this._formatNumber(efficiencyRatio, 2)));
            } else if (efficiencyRatio >= 2) {
                sentences.push(this._tf('solar_log_text_efficiency_medium', this._formatNumber(efficiencyRatio, 2)));
            } else {
                sentences.push(this._tf('solar_log_text_efficiency_low', this._formatNumber(efficiencyRatio, 2)));
            }
        }

        if (Number.isFinite(activeMinutesToday) && activeMinutesToday > 0) {
            sentences.push(this._tf('solar_log_text_active_minutes', this._formatNumber(activeMinutesToday, 0)));
        }

        if (Number.isFinite(outsideTemp)) {
            sentences.push(this._tf('solar_log_text_outside_temp', this._formatNumber(outsideTemp, 1)));
        }

        if (weatherCorrectionActive) {
            if (weatherTextShort !== '') {
                sentences.push(this._tf('solar_log_text_weather_supported_with_text', weatherTextShort));
            } else {
                sentences.push(this._t('solar_log_text_weather_supported'));
            }
        }

        if (Number.isFinite(gainTodayWh) && gainTodayWh > 0 && gainTodayWh < 1000 && Number.isFinite(gainTodayKWh)) {
            sentences.push(
                this._tf(
                    'solar_log_text_small_gain_detail',
                    this._formatNumber(gainTodayWh, 0),
                    this._formatNumber(gainTodayKWh, 2),
                ),
            );
        }

        if (qualityLevel !== '') {
            sentences.push(this._tf('solar_log_text_quality_level', qualityLevel));
        }

        if (confidenceText !== '') {
            sentences.push(confidenceText);
        }

        sentences.push(this._tf('solar_log_text_used_sensors', usedSensors));

        const text = sentences.join(' ');
        return {
            type: solarEffectiveNow ? 'active_log_entry' : 'daily_log_entry',
            text,
            html: this._escapeHtml(text),
        };
    },

    _extractShortWeather(weatherSummary) {
        if (!weatherSummary || weatherSummary.trim() === '') {
            return '';
        }

        const text = weatherSummary.replace(/\s+/g, ' ').trim();

        if (text.length <= 140) {
            return text;
        }

        return `${text.slice(0, 137)}...`;
    },

    async _readState(id) {
        try {
            return await this.adapter.getStateAsync(id);
        } catch {
            return null;
        }
    },

    async _readBoolean(id) {
        const state = await this._readState(id);

        if (!state) {
            return false;
        }

        return state.val === true;
    },

    async _readNumber(id) {
        const state = await this._readState(id);

        if (!state || state.val === null || state.val === undefined || state.val === '') {
            return null;
        }

        const value = Number(state.val);
        return Number.isFinite(value) ? value : null;
    },

    async _readString(id) {
        const state = await this._readState(id);

        if (!state || state.val === null || state.val === undefined) {
            return '';
        }

        return String(state.val);
    },

    _safeParseArray(jsonText) {
        if (!jsonText || jsonText.trim() === '') {
            return [];
        }

        try {
            const parsed = JSON.parse(jsonText);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },

    _formatNumber(value, digits = 1) {
        if (!Number.isFinite(value)) {
            return '';
        }

        return Number(value).toFixed(digits);
    },

    _formatTime(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    },

    _escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _t(key) {
        try {
            return I18n.t(key);
        } catch {
            return key;
        }
    },

    _tf(key, ...args) {
        try {
            let text = I18n.t(key);

            for (const arg of args) {
                text = text.replace('%s', String(arg));
            }

            return text;
        } catch {
            return key;
        }
    },

    cleanup() {
        if (this.checkTimer) {
            this.adapter.clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }

        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
    },
};

module.exports = solarLogbookHelper;

// i18n keys required:
// solar_log_value_unknown
// solar_log_confidence_text
// solar_log_text_no_runtime_today
// solar_log_text_weather_short
// solar_log_text_used_sensors
// solar_log_text_active_effective
// solar_log_text_active_without_clear_gain
// solar_log_text_not_active_now
// solar_log_text_good_day
// solar_log_text_moderate_day
// solar_log_text_low_day
// solar_log_text_no_clear_day_gain
// solar_log_text_temperature_positive
// solar_log_text_temperature_neutral
// solar_log_text_temperature_negative
// solar_log_text_flow_and_pump
// solar_log_text_flow_only
// solar_log_text_power_and_peak
// solar_log_text_efficiency_high
// solar_log_text_efficiency_medium
// solar_log_text_efficiency_low
// solar_log_text_active_minutes
// solar_log_text_outside_temp
// solar_log_text_weather_supported_with_text
// solar_log_text_weather_supported
// solar_log_text_small_gain_detail
// solar_log_text_quality_level

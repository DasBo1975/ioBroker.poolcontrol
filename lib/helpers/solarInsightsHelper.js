'use strict';

const { I18n } = require('@iobroker/adapter-core');

/**
 * solarInsightsHelper
 * - Analysiert verfügbare und verwendete Sensoren für analytics.insights.solar
 * - Prüft, ob Solar heute überhaupt gelaufen ist
 * - Schreibt Transparenz-, Referenz-, Leistungs- und Tagesertrags-States
 * - Arbeitet eventbasiert mit debounce per adapter.setTimeout
 */

const solarInsightsHelper = {
    adapter: null,
    checkTimer: null,
    resetTimer: null,
    lastCheckTimestamp: null,

    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        this._scheduleDailyReset();
        this._scheduleCheck(0);

        this.adapter.log.debug('[solarInsightsHelper] Initialized (event-based precheck)');
    },

    onStateChange(id, state) {
        if (!state || state.ack !== true) {
            return;
        }

        if (!this._isRelevantState(id)) {
            return;
        }

        // Tages-Latch sofort setzen, wenn Solar aktiv wird
        if ((id === 'solar.active' || id === 'solar.extended.active') && state.val === true) {
            void this.adapter.setStateChangedAsync('analytics.insights.solar.results.solar_ran_today', {
                val: true,
                ack: true,
            });
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
            void this._checkSolarInsights();
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
        next.setHours(0, 0, 5, 0);

        const delay = Math.max(1000, next.getTime() - now.getTime());

        this.resetTimer = this.adapter.setTimeout(async () => {
            try {
                await this.adapter.setStateChangedAsync('analytics.insights.solar.results.solar_ran_today', {
                    val: false,
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_gain_today_wh', {
                    val: 0,
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_gain_today_kwh', {
                    val: 0,
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.results.active_minutes_today', {
                    val: 0,
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.results.peak_power_today_w', {
                    val: 0,
                    ack: true,
                });

                this.lastCheckTimestamp = null;

                await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_update', {
                    val: new Date().toISOString(),
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_recalculation_reason', {
                    val: I18n.translate('solar_insights_reason_daily_reset'),
                    ack: true,
                });

                await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.debug_text', {
                    val: I18n.translate('solar_insights_debug_daily_reset_executed'),
                    ack: true,
                });

                this.adapter.log.debug('[solarInsightsHelper] Daily reset executed');
            } catch (err) {
                this.adapter.log.warn(`[solarInsightsHelper] Daily reset failed: ${err.message}`);
            }

            this._scheduleDailyReset();
        }, delay);
    },

    async _subscribeStates() {
        const ids = [
            'temperature.collector_temp_active',
            'temperature.surface_temp_active',
            'temperature.ground_temp_active',
            'temperature.flow_temp_active',
            'temperature.return_temp_active',
            'temperature.outside_temp_active',

            'temperature.collector.current',
            'temperature.surface.current',
            'temperature.ground.current',
            'temperature.flow.current',
            'temperature.return.current',
            'temperature.outside.current',

            'pump.live.flow_current_lh',
            'pump.live.current_power_w',
            'temperature.delta.surface_ground',

            'solar.active',
            'solar.extended.active',
            'solar.control_mode',

            'ai.weather.outputs.daily_summary',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[solarInsightsHelper] Relevant states subscribed');
    },

    _isRelevantState(id) {
        const ids = [
            'temperature.collector_temp_active',
            'temperature.surface_temp_active',
            'temperature.ground_temp_active',
            'temperature.flow_temp_active',
            'temperature.return_temp_active',
            'temperature.outside_temp_active',

            'temperature.collector.current',
            'temperature.surface.current',
            'temperature.ground.current',
            'temperature.flow.current',
            'temperature.return.current',
            'temperature.outside.current',

            'pump.live.flow_current_lh',
            'pump.live.current_power_w',
            'temperature.delta.surface_ground',

            'solar.active',
            'solar.extended.active',
            'solar.control_mode',

            'ai.weather.outputs.daily_summary',
        ];

        return ids.includes(id);
    },

    async _checkSolarInsights() {
        try {
            const collectorAvailable = await this._isSensorAvailable(
                'temperature.collector_temp_active',
                'temperature.collector.current',
            );
            const surfaceAvailable = await this._isSensorAvailable(
                'temperature.surface_temp_active',
                'temperature.surface.current',
            );
            const groundAvailable = await this._isSensorAvailable(
                'temperature.ground_temp_active',
                'temperature.ground.current',
            );
            const flowTempAvailable = await this._isSensorAvailable(
                'temperature.flow_temp_active',
                'temperature.flow.current',
            );
            const returnAvailable = await this._isSensorAvailable(
                'temperature.return_temp_active',
                'temperature.return.current',
            );
            const outsideAvailable = await this._isSensorAvailable(
                'temperature.outside_temp_active',
                'temperature.outside.current',
            );

            const collectorTemp = await this._readNumber('temperature.collector.current');
            const surfaceTemp = await this._readNumber('temperature.surface.current');
            const groundTemp = await this._readNumber('temperature.ground.current');
            const outsideTemp = await this._readNumber('temperature.outside.current');
            const currentFlowLh = await this._readNumber('pump.live.flow_current_lh');
            const pumpCurrentPowerW = await this._readNumber('pump.live.current_power_w');
            const surfaceGroundDeltaState = await this._readNumber('temperature.delta.surface_ground');
            const weatherText = await this._readString('ai.weather.outputs.daily_summary');

            const flowAvailable = flowTempAvailable || Number.isFinite(currentFlowLh);
            const weatherAvailable = weatherText !== '';

            const collectorUsed = collectorAvailable;
            const surfaceUsed = surfaceAvailable;
            const groundUsed = groundAvailable;
            const flowUsed = flowAvailable;
            const returnUsed = returnAvailable;

            // Block 7: Outside / weather now participate in evaluation logic
            const outsideUsed = outsideAvailable;
            const weatherUsed = weatherAvailable;

            const usedSensors = [];
            const availableSensors = [];

            if (collectorAvailable) {
                availableSensors.push('collector');
            }
            if (surfaceAvailable) {
                availableSensors.push('surface');
            }
            if (groundAvailable) {
                availableSensors.push('ground');
            }
            if (flowAvailable) {
                availableSensors.push('calculated_flow');
            }
            if (returnAvailable) {
                availableSensors.push('return');
            }
            if (outsideAvailable) {
                availableSensors.push('outside');
            }
            if (weatherAvailable) {
                availableSensors.push('weather');
            }

            if (collectorUsed) {
                usedSensors.push('collector');
            }
            if (surfaceUsed) {
                usedSensors.push('surface');
            }
            if (groundUsed) {
                usedSensors.push('ground');
            }
            if (flowUsed) {
                usedSensors.push('calculated_flow');
            }
            if (returnUsed) {
                usedSensors.push('return');
            }
            if (outsideUsed) {
                usedSensors.push('outside');
            }
            if (weatherUsed) {
                usedSensors.push('weather');
            }

            const solarStandardActive = await this._readBoolean('solar.active');
            const solarExtendedActive = await this._readBoolean('solar.extended.active');
            const oldSolarRanToday = await this._readBoolean('analytics.insights.solar.results.solar_ran_today');

            const solarLogicActive = solarStandardActive || solarExtendedActive;
            const solarRanToday = oldSolarRanToday || solarLogicActive;

            let poolReferenceSource = 'none';
            let poolReferenceTemp = null;

            if (surfaceAvailable && groundAvailable && Number.isFinite(surfaceTemp) && Number.isFinite(groundTemp)) {
                poolReferenceSource = 'surface_ground_average';
                poolReferenceTemp = Number(((surfaceTemp + groundTemp) / 2).toFixed(2));
            } else if (surfaceAvailable && Number.isFinite(surfaceTemp)) {
                poolReferenceSource = 'surface';
                poolReferenceTemp = surfaceTemp;
            } else if (groundAvailable && Number.isFinite(groundTemp)) {
                poolReferenceSource = 'ground';
                poolReferenceTemp = groundTemp;
            }

            let deltaTUsed = null;
            if (Number.isFinite(collectorTemp) && Number.isFinite(poolReferenceTemp)) {
                deltaTUsed = Number((collectorTemp - poolReferenceTemp).toFixed(2));
            }

            // --- Block 3: Thermische Leistung berechnen ---
            let thermalPowerW = null;
            let thermalPowerKW = null;

            if (Number.isFinite(deltaTUsed) && Number.isFinite(currentFlowLh) && currentFlowLh > 0) {
                thermalPowerW = Number((currentFlowLh * deltaTUsed * 1.16).toFixed(2));
                thermalPowerKW = Number((thermalPowerW / 1000).toFixed(3));
            }

            const solarEffectiveNow =
                solarLogicActive &&
                ((Number.isFinite(currentFlowLh) && currentFlowLh > 0) ||
                    (Number.isFinite(pumpCurrentPowerW) && pumpCurrentPowerW > 0) ||
                    (Number.isFinite(thermalPowerW) && thermalPowerW > 0));

            const flowSource = Number.isFinite(currentFlowLh) ? 'pump.live.flow_current_lh' : 'none';
            const weatherCorrectionActive = outsideUsed || weatherUsed;

            let estimatedEfficiencyRatio = null;

            if (Number.isFinite(thermalPowerW) && Number.isFinite(pumpCurrentPowerW) && pumpCurrentPowerW > 0) {
                estimatedEfficiencyRatio = Number((thermalPowerW / pumpCurrentPowerW).toFixed(2));
            }

            // --- Block 4: Tagesertrag / aktive Minuten / Peak berechnen ---
            const nowTs = Date.now();

            let estimatedGainTodayWh = await this._readNumber(
                'analytics.insights.solar.results.estimated_gain_today_wh',
            );
            let activeMinutesToday = await this._readNumber('analytics.insights.solar.results.active_minutes_today');
            let peakPowerTodayW = await this._readNumber('analytics.insights.solar.results.peak_power_today_w');

            if (!Number.isFinite(estimatedGainTodayWh)) {
                estimatedGainTodayWh = 0;
            }
            if (!Number.isFinite(activeMinutesToday)) {
                activeMinutesToday = 0;
            }
            if (!Number.isFinite(peakPowerTodayW)) {
                peakPowerTodayW = 0;
            }

            if (this.lastCheckTimestamp && solarEffectiveNow && Number.isFinite(thermalPowerW) && thermalPowerW > 0) {
                const deltaHours = (nowTs - this.lastCheckTimestamp) / 3600000;

                // Schutz gegen unrealistisch große Sprünge
                if (deltaHours > 0 && deltaHours <= 0.5) {
                    estimatedGainTodayWh = Number((estimatedGainTodayWh + thermalPowerW * deltaHours).toFixed(2));
                    activeMinutesToday = Number((activeMinutesToday + deltaHours * 60).toFixed(2));
                }
            }

            if (solarEffectiveNow && Number.isFinite(thermalPowerW) && thermalPowerW > peakPowerTodayW) {
                peakPowerTodayW = Number(thermalPowerW.toFixed(2));
            }

            const estimatedGainTodayKWh = Number((estimatedGainTodayWh / 1000).toFixed(3));

            // --- Block 5: Confidence / Qualitätsbewertung ---
            let confidencePercent = 25;

            if (
                Number.isFinite(collectorTemp) &&
                Number.isFinite(poolReferenceTemp) &&
                Number.isFinite(currentFlowLh)
            ) {
                confidencePercent = 50;
            }

            if (surfaceUsed && groundUsed) {
                confidencePercent = 70;
            }

            if (returnUsed) {
                confidencePercent = Math.max(confidencePercent, 80);
            }

            if (outsideUsed) {
                confidencePercent = Math.max(confidencePercent, 85);
            }

            if (weatherUsed) {
                confidencePercent = Math.max(confidencePercent, 90);
            }

            let surfaceGroundDelta = null;
            if (Number.isFinite(surfaceGroundDeltaState)) {
                surfaceGroundDelta = surfaceGroundDeltaState;
            } else if (Number.isFinite(surfaceTemp) && Number.isFinite(groundTemp)) {
                surfaceGroundDelta = Number((surfaceTemp - groundTemp).toFixed(2));
            }

            const summaryJson = {
                mode: 'estimated_daily_gain',
                solar_ran_today: solarRanToday,
                solar_effective_now: solarEffectiveNow,
                pool_reference_source: poolReferenceSource,
                flow_source: flowSource,
                weather_correction_active: weatherCorrectionActive,
                confidence_percent: confidencePercent,
                used_sensors: usedSensors,
                values: {
                    collector_temp_used: Number.isFinite(collectorTemp) ? collectorTemp : null,
                    pool_reference_temp_used: Number.isFinite(poolReferenceTemp) ? poolReferenceTemp : null,
                    delta_t_used: Number.isFinite(deltaTUsed) ? deltaTUsed : null,
                    surface_ground_delta: Number.isFinite(surfaceGroundDelta) ? surfaceGroundDelta : null,
                    outside_temp_used: Number.isFinite(outsideTemp) ? outsideTemp : null,
                    flow_lh_used: Number.isFinite(currentFlowLh) ? currentFlowLh : null,
                    pump_power_w_used: Number.isFinite(pumpCurrentPowerW) ? pumpCurrentPowerW : null,
                    estimated_thermal_power_w: Number.isFinite(thermalPowerW) ? thermalPowerW : null,
                    estimated_thermal_power_kw: Number.isFinite(thermalPowerKW) ? thermalPowerKW : null,
                    estimated_efficiency_ratio: Number.isFinite(estimatedEfficiencyRatio)
                        ? estimatedEfficiencyRatio
                        : null,
                    estimated_gain_today_wh: Number.isFinite(estimatedGainTodayWh) ? estimatedGainTodayWh : null,
                    estimated_gain_today_kwh: Number.isFinite(estimatedGainTodayKWh) ? estimatedGainTodayKWh : null,
                    active_minutes_today: Number.isFinite(activeMinutesToday) ? activeMinutesToday : null,
                    peak_power_today_w: Number.isFinite(peakPowerTodayW) ? peakPowerTodayW : null,
                },
                note: I18n.translate('solar_insights_summary_note_block_7'),
            };

            const summaryHtml = [
                '<div>',
                `<b>${I18n.translate('solar_insights_label_mode')}:</b> ${I18n.translate('solar_insights_mode_estimated_daily_gain')}<br>`,
                `<b>${I18n.translate('solar_insights_label_solar_ran_today')}:</b> ${solarRanToday}<br>`,
                `<b>${I18n.translate('solar_insights_label_solar_effective_now')}:</b> ${solarEffectiveNow}<br>`,
                `<b>${I18n.translate('solar_insights_label_pool_reference_source')}:</b> ${poolReferenceSource}<br>`,
                `<b>${I18n.translate('solar_insights_label_flow_source')}:</b> ${flowSource}<br>`,
                `<b>${I18n.translate('solar_insights_label_weather_correction_active')}:</b> ${weatherCorrectionActive}<br>`,
                `<b>${I18n.translate('solar_insights_label_confidence')}:</b> ${confidencePercent} %<br>`,
                `<b>${I18n.translate('solar_insights_label_used_sensors')}:</b> ${usedSensors.join(', ') || I18n.translate('solar_insights_value_none')}<br>`,
                `<b>${I18n.translate('solar_insights_label_collector')}:</b> ${Number.isFinite(collectorTemp) ? `${collectorTemp} °C` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_pool_reference')}:</b> ${Number.isFinite(poolReferenceTemp) ? `${poolReferenceTemp} °C` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_delta_t')}:</b> ${Number.isFinite(deltaTUsed) ? `${deltaTUsed} K` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_surface_ground_delta')}:</b> ${Number.isFinite(surfaceGroundDelta) ? `${surfaceGroundDelta} K` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_outside')}:</b> ${Number.isFinite(outsideTemp) ? `${outsideTemp} °C` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_flow')}:</b> ${Number.isFinite(currentFlowLh) ? `${currentFlowLh} l/h` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_pump_power')}:</b> ${Number.isFinite(pumpCurrentPowerW) ? `${pumpCurrentPowerW} W` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_thermal_power')}:</b> ${Number.isFinite(thermalPowerW) ? `${thermalPowerW} W (${thermalPowerKW} kW)` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_estimated_efficiency_ratio')}:</b> ${Number.isFinite(estimatedEfficiencyRatio) ? estimatedEfficiencyRatio : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_gain_today')}:</b> ${Number.isFinite(estimatedGainTodayWh) ? `${estimatedGainTodayWh} Wh (${estimatedGainTodayKWh} kWh)` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_active_minutes_today')}:</b> ${Number.isFinite(activeMinutesToday) ? `${activeMinutesToday} min` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_peak_power_today')}:</b> ${Number.isFinite(peakPowerTodayW) ? `${peakPowerTodayW} W` : I18n.translate('solar_insights_value_na')}<br>`,
                `<b>${I18n.translate('solar_insights_label_note')}:</b> ${I18n.translate('solar_insights_html_note_block_7')}`,
                '</div>',
            ].join('');

            // --- Inputs: available ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.collector_available', {
                val: collectorAvailable,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.surface_available', {
                val: surfaceAvailable,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.ground_available', {
                val: groundAvailable,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.flow_available', {
                val: flowAvailable,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.return_available', {
                val: returnAvailable,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.outside_available', {
                val: outsideAvailable,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.weather_available', {
                val: weatherAvailable,
                ack: true,
            });

            // --- Inputs: used ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.collector_used', {
                val: collectorUsed,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.surface_used', {
                val: surfaceUsed,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.ground_used', {
                val: groundUsed,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.flow_used', {
                val: flowUsed,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.return_used', {
                val: returnUsed,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.outside_used', {
                val: outsideUsed,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.weather_used', {
                val: weatherUsed,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.used_sensors_text', {
                val: usedSensors.join(', '),
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.inputs.used_sensors_json', {
                val: JSON.stringify({
                    available: availableSensors,
                    used: usedSensors,
                    mode: 'estimated_daily_gain',
                    block: 7,
                }),
                ack: true,
            });

            // --- Results: status ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.solar_ran_today', {
                val: solarRanToday,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.analysis_active', {
                val: true,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.solar_effective_now', {
                val: solarEffectiveNow,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.solar_gain_state', {
                val: solarRanToday
                    ? I18n.translate('solar_insights_status_estimated_daily_gain_ready')
                    : I18n.translate('solar_insights_status_no_solar_runtime_today'),
                ack: true,
            });

            // --- Results: direct values ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.collector_temp_used', {
                val: Number.isFinite(collectorTemp) ? collectorTemp : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.pool_reference_temp_used', {
                val: Number.isFinite(poolReferenceTemp) ? poolReferenceTemp : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.delta_t_used', {
                val: Number.isFinite(deltaTUsed) ? deltaTUsed : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.surface_ground_delta', {
                val: Number.isFinite(surfaceGroundDelta) ? surfaceGroundDelta : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.outside_temp_used', {
                val: Number.isFinite(outsideTemp) ? outsideTemp : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.flow_lh_used', {
                val: Number.isFinite(currentFlowLh) ? currentFlowLh : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.pump_power_w_used', {
                val: Number.isFinite(pumpCurrentPowerW) ? pumpCurrentPowerW : null,
                ack: true,
            });

            // --- Results: thermal power ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_thermal_power_w', {
                val: Number.isFinite(thermalPowerW) ? thermalPowerW : null,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_thermal_power_kw', {
                val: Number.isFinite(thermalPowerKW) ? thermalPowerKW : null,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_efficiency_ratio', {
                val: Number.isFinite(estimatedEfficiencyRatio) ? estimatedEfficiencyRatio : null,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_gain_today_wh', {
                val: Number.isFinite(estimatedGainTodayWh) ? estimatedGainTodayWh : 0,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.estimated_gain_today_kwh', {
                val: Number.isFinite(estimatedGainTodayKWh) ? estimatedGainTodayKWh : 0,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.active_minutes_today', {
                val: Number.isFinite(activeMinutesToday) ? activeMinutesToday : 0,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.peak_power_today_w', {
                val: Number.isFinite(peakPowerTodayW) ? peakPowerTodayW : 0,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.summary_json', {
                val: JSON.stringify(summaryJson),
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.results.summary_html', {
                val: summaryHtml,
                ack: true,
            });

            // --- Calculation ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.mode', {
                val: I18n.translate('solar_insights_mode_estimated_daily_gain'),
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.quality_level', {
                val:
                    confidencePercent >= 85
                        ? I18n.translate('solar_insights_quality_advanced')
                        : confidencePercent >= 70
                          ? I18n.translate('solar_insights_quality_enhanced')
                          : I18n.translate('solar_insights_quality_basic'),
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.confidence_percent', {
                val: confidencePercent,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.pool_reference_source', {
                val: poolReferenceSource,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.flow_source', {
                val: flowSource,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.weather_correction_active', {
                val: weatherCorrectionActive,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.calculation.note', {
                val: I18n.translate('solar_insights_calculation_note_block_7'),
                ack: true,
            });

            // --- Debug ---
            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_recalculation_reason', {
                val: I18n.translate('solar_insights_reason_block_7_update'),
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_valid_mode', {
                val: 'estimated_daily_gain',
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_invalid_reason', {
                val: '',
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.debug_text', {
                val: `${I18n.translate('solar_insights_debug_block_7_updated')} ${usedSensors.join(', ') || I18n.translate('solar_insights_value_none')}`,
                ack: true,
            });

            this.lastCheckTimestamp = nowTs;
            this.adapter.log.debug('[solarInsightsHelper] Block 7 updated successfully');
        } catch (err) {
            this.adapter.log.warn(`[solarInsightsHelper] Error in check: ${err.message}`);

            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_update', {
                val: new Date().toISOString(),
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.last_invalid_reason', {
                val: err.message,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('analytics.insights.solar.debug.debug_text', {
                val: `${I18n.translate('solar_insights_debug_block_7_error')} ${err.message}`,
                ack: true,
            });
        }
    },

    async _isSensorAvailable(activeId, valueId) {
        const active = await this._readBoolean(activeId);
        const value = await this._readNumber(valueId);

        return active && Number.isFinite(value);
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

module.exports = solarInsightsHelper;

// i18n keys required:
// solar_insights_summary_note_block_7
// solar_insights_label_mode
// solar_insights_label_solar_ran_today
// solar_insights_label_solar_effective_now
// solar_insights_label_pool_reference_source
// solar_insights_label_flow_source
// solar_insights_label_weather_correction_active
// solar_insights_label_confidence
// solar_insights_label_used_sensors
// solar_insights_label_collector
// solar_insights_label_pool_reference
// solar_insights_label_delta_t
// solar_insights_label_surface_ground_delta
// solar_insights_label_outside
// solar_insights_label_flow
// solar_insights_label_pump_power
// solar_insights_label_thermal_power
// solar_insights_label_estimated_efficiency_ratio
// solar_insights_label_gain_today
// solar_insights_label_active_minutes_today
// solar_insights_label_peak_power_today
// solar_insights_label_note
// solar_insights_value_none
// solar_insights_value_na
// solar_insights_reason_daily_reset
// solar_insights_debug_daily_reset_executed
// solar_insights_status_estimated_daily_gain_ready
// solar_insights_status_no_solar_runtime_today
// solar_insights_mode_estimated_daily_gain
// solar_insights_quality_advanced
// solar_insights_quality_enhanced
// solar_insights_quality_basic
// solar_insights_calculation_note_block_7
// solar_insights_reason_block_7_update
// solar_insights_debug_block_7_updated
// solar_insights_debug_block_7_error
// solar_insights_html_note_block_7

'use strict';

const { I18n } = require('@iobroker/adapter-core');

const photovoltaicInsightsHelper = {
    adapter: null,
    checkTimer: null,
    lastResultTimestamp: null,
    lastPvRuntimeActive: false,

    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        this._scheduleCheck(0);

        this.adapter.log.debug(
            '[photovoltaicInsightsHelper] Initialized (Block 1 inputs, Block 2 calculation, Block 3 results, Block 4 debug)',
        );
    },

    handleStateChange(id, state) {
        if (!state || state.ack !== true) {
            return;
        }

        if (!this._isRelevantState(id)) {
            return;
        }

        this._scheduleCheck(200);
    },

    _scheduleCheck(delayMs = 0) {
        if (this.checkTimer) {
            this.adapter.clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }

        this.checkTimer = this.adapter.setTimeout(() => {
            this.checkTimer = null;
            void this._updateInputs();
        }, delayMs);
    },

    async _subscribeStates() {
        const ids = [
            'photovoltaic.power_surplus_w',
            'photovoltaic.surplus_active',
            'pump.live.current_power_w',
            'pump.active_helper',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[photovoltaicInsightsHelper] Subscribed to input states');
    },

    _isRelevantState(id) {
        const ids = [
            'photovoltaic.power_surplus_w',
            'photovoltaic.surplus_active',
            'pump.live.current_power_w',
            'pump.active_helper',
        ];

        return ids.some(relevantId => id === relevantId || id.endsWith(`.${relevantId}`));
    },

    async _updateInputs() {
        try {
            const pvSurplusW = await this._readNumber('photovoltaic.power_surplus_w');
            const pvSurplusActive = await this._readBoolean('photovoltaic.surplus_active');

            const pumpPowerW = await this._readNumber('pump.live.current_power_w');

            await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.inputs.pv_surplus_w', {
                val: Number.isFinite(pvSurplusW) ? pvSurplusW : 0,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.inputs.pv_surplus_active', {
                val: pvSurplusActive,
                ack: true,
            });

            await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.inputs.pump_power_w', {
                val: Number.isFinite(pumpPowerW) ? pumpPowerW : 0,
                ack: true,
            });

            await this._updateCalculation();
            await this._updateResults();

            this.adapter.log.debug('[photovoltaicInsightsHelper] Inputs, calculation and results updated');
        } catch (err) {
            this.adapter.log.warn(`[photovoltaicInsightsHelper] Error updating inputs: ${err.message}`);
        }
    },

    async _updateCalculation() {
        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.calculation.mode', {
            val: I18n.translate('photovoltaic_insights_calculation_mode_daily'),
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.calculation.price_source', {
            val: I18n.translate('photovoltaic_insights_price_source_adapter_config'),
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.calculation.note', {
            val: I18n.translate('photovoltaic_insights_calculation_note_block_2'),
            ack: true,
        });
    },

    async _updateResults() {
        const now = Date.now();

        const pvSurplusActive = await this._readBoolean('photovoltaic.surplus_active');
        const pumpPowerW = await this._readNumber('pump.live.current_power_w');
        const activeHelper = await this._readString('pump.active_helper');
        const electricityPriceEurKwh = Number(this.adapter.config.energy_price_eur_kwh);

        const pvControlsPump = activeHelper === 'photovoltaicHelper';
        const pvRuntimeActive = pvSurplusActive && pvControlsPump;

        let runtimeTodayMin = await this._readNumber('analytics.insights.photovoltaic.results.runtime_today_min');
        let energyUsedTodayKwh = await this._readNumber(
            'analytics.insights.photovoltaic.results.energy_used_today_kwh',
        );
        let savingsTodayEur = await this._readNumber('analytics.insights.photovoltaic.results.savings_today_eur');
        let startsToday = await this._readNumber('analytics.insights.photovoltaic.results.starts_today');

        runtimeTodayMin = Number.isFinite(runtimeTodayMin) ? runtimeTodayMin : 0;
        energyUsedTodayKwh = Number.isFinite(energyUsedTodayKwh) ? energyUsedTodayKwh : 0;
        savingsTodayEur = Number.isFinite(savingsTodayEur) ? savingsTodayEur : 0;
        startsToday = Number.isFinite(startsToday) ? startsToday : 0;

        if (pvRuntimeActive && !this.lastPvRuntimeActive) {
            startsToday += 1;
            this.lastResultTimestamp = now;
        }

        if (pvRuntimeActive && this.lastResultTimestamp && Number.isFinite(pumpPowerW) && pumpPowerW > 0) {
            const deltaHours = (now - this.lastResultTimestamp) / 3600000;

            if (deltaHours > 0 && deltaHours <= 0.5) {
                const energyDeltaKwh = (pumpPowerW * deltaHours) / 1000;

                runtimeTodayMin = Number((runtimeTodayMin + deltaHours * 60).toFixed(2));
                energyUsedTodayKwh = Number((energyUsedTodayKwh + energyDeltaKwh).toFixed(4));

                if (Number.isFinite(electricityPriceEurKwh) && electricityPriceEurKwh > 0) {
                    savingsTodayEur = Number((savingsTodayEur + energyDeltaKwh * electricityPriceEurKwh).toFixed(2));
                }
            }
        }

        if (pvRuntimeActive) {
            this.lastResultTimestamp = now;
        } else {
            this.lastResultTimestamp = null;
        }

        this.lastPvRuntimeActive = pvRuntimeActive;

        const activeToday = runtimeTodayMin > 0 || startsToday > 0;

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.active_today', {
            val: activeToday,
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.runtime_today_min', {
            val: runtimeTodayMin,
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.energy_used_today_kwh', {
            val: energyUsedTodayKwh,
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.savings_today_eur', {
            val: savingsTodayEur,
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.starts_today', {
            val: startsToday,
            ack: true,
        });

        const summaryText = I18n.translate('photovoltaic_insights_summary_text_block_3')
            .replace('%s', runtimeTodayMin.toFixed(0))
            .replace('%s', energyUsedTodayKwh.toFixed(2))
            .replace('%s', savingsTodayEur.toFixed(2));

        const summaryJson = {
            mode: 'daily_pv_surplus_analysis',
            pv_surplus_active: pvSurplusActive,
            pv_controls_pump: pvControlsPump,
            pv_runtime_active: pvRuntimeActive,
            active_today: activeToday,
            values: {
                pv_surplus_w: await this._readNumber('photovoltaic.power_surplus_w'),
                pump_power_w: Number.isFinite(pumpPowerW) ? pumpPowerW : null,
                electricity_price_eur_kwh: Number.isFinite(electricityPriceEurKwh) ? electricityPriceEurKwh : null,
                runtime_today_min: runtimeTodayMin,
                energy_used_today_kwh: energyUsedTodayKwh,
                savings_today_eur: savingsTodayEur,
                starts_today: startsToday,
            },
            note: I18n.translate('photovoltaic_insights_calculation_note_block_2'),
        };

        const summaryHtml = [
            '<div>',
            `<b>${I18n.translate('photovoltaic_insights_label_mode')}:</b> ${I18n.translate('photovoltaic_insights_calculation_mode_daily')}<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_pv_surplus_active')}:</b> ${pvSurplusActive}<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_pv_controls_pump')}:</b> ${pvControlsPump}<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_runtime_today')}:</b> ${runtimeTodayMin.toFixed(2)} min<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_energy_used_today')}:</b> ${energyUsedTodayKwh.toFixed(4)} kWh<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_savings_today')}:</b> ${savingsTodayEur.toFixed(2)} €<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_starts_today')}:</b> ${startsToday}<br>`,
            `<b>${I18n.translate('photovoltaic_insights_label_summary')}:</b> ${summaryText}`,
            '</div>',
        ].join('');

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.summary_text', {
            val: summaryText,
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.summary_json', {
            val: JSON.stringify(summaryJson),
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.results.summary_html', {
            val: summaryHtml,
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.debug.last_update', {
            val: new Date().toISOString(),
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.debug.last_recalculation_reason', {
            val: pvRuntimeActive
                ? I18n.translate('photovoltaic_insights_debug_reason_pv_runtime_active')
                : I18n.translate('photovoltaic_insights_debug_reason_no_pv_runtime'),
            ack: true,
        });

        await this.adapter.setStateChangedAsync('analytics.insights.photovoltaic.debug.debug_text', {
            val: pvRuntimeActive
                ? I18n.translate('photovoltaic_insights_debug_text_pv_runtime_active')
                : I18n.translate('photovoltaic_insights_debug_text_no_pv_runtime'),
            ack: true,
        });
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
        return state ? state.val === true : false;
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
        return state && state.val !== undefined ? String(state.val) : '';
    },

    cleanup() {
        if (this.checkTimer) {
            this.adapter.clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = photovoltaicInsightsHelper;

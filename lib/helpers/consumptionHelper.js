'use strict';

/**
 * consumptionHelper
 * - Nutzt externen kWh-Zähler (objectId aus Config)
 * - Berechnet Periodenwerte (Tag/Woche/Monat/Jahr)
 * - Berechnet Kosten anhand Strompreis (€/kWh)
 * - Offset-Mechanismus: summiert alte Werte bei Zählerwechsel/Reset auf
 * - Erhält Tages-/Wochen-/Monats-/Jahreswerte über Neustarts
 */

const consumptionHelper = /** @satisfies {import('../types/poolcontrol-adapter').ConsumptionHelper} */ ({
    _adapter: null,
    _active: false,
    _lifecycleGeneration: 0,
    _initializationPromise: null,
    energyId: null,
    price: 0,
    baselines: {},
    resetTimer: null,
    weeklyResetTimer: null,
    monthlyResetTimer: null,
    yearlyResetTimer: null,

    lastKnownPrice: 0,
    baseTotalKwh: 0,
    baseTotalEur: 0,

    /**
     * Liefert die initialisierte oder durch resetAll gesetzte Adapterinstanz.
     *
     * @returns Verfuegbare Adapterinstanz.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('consumptionHelper used before init() or resetAll()');
        }

        return this._adapter;
    },

    init(adapter) {
        if (this._adapter && this.resetTimer) {
            this._adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        if (this._adapter && this.weeklyResetTimer) {
            this._adapter.clearTimeout(this.weeklyResetTimer);
            this.weeklyResetTimer = null;
        }
        if (this._adapter && this.monthlyResetTimer) {
            this._adapter.clearTimeout(this.monthlyResetTimer);
            this.monthlyResetTimer = null;
        }
        if (this._adapter && this.yearlyResetTimer) {
            this._adapter.clearTimeout(this.yearlyResetTimer);
            this.yearlyResetTimer = null;
        }

        this._adapter = adapter;
        this._active = true;
        const generation = ++this._lifecycleGeneration;
        this.energyId = adapter.config.external_energy_total_id || null;

        this.price = parseFloat(String(adapter.config.energy_price_eur_kwh).replace(',', '.')) || 0;
        this.lastKnownPrice = this.price;

        this.adapter.log.debug(`[consumptionHelper] energy price: ${this.price} €/kWh`);

        if (this.energyId) {
            adapter.subscribeForeignStates(this.energyId);
            adapter.log.debug(`[consumptionHelper] monitoring external kWh meter: ${this.energyId}`);
        } else {
            adapter.log.debug('[consumptionHelper] no external kWh meter configured -> consumption logic inactive.');
        }

        this._scheduleDailyReset(generation);
        const initializationPromise = Promise.all([
            this._loadCostBaselines(generation),
            this._restoreBaselinesFromStates(generation),
        ]).then(() => undefined);
        this._initializationPromise = initializationPromise;
        void initializationPromise.then(() => {
            if (this._lifecycleGeneration === generation) {
                this._initializationPromise = null;
            }
        });

        // NEU: regelmäßige Perioden-Resets
        this._scheduleWeeklyReset(generation);
        this._scheduleMonthlyReset(generation);
        this._scheduleYearlyReset(generation);
    },

    _isGenerationActive(generation) {
        return this._active && generation === this._lifecycleGeneration;
    },

    async _loadCostBaselines(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        try {
            const totalKwh = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            const totalEur = (await this.adapter.getStateAsync('costs.total_eur'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            this.baseTotalKwh = totalKwh;
            this.baseTotalEur = totalEur;
            this.adapter.log.debug(
                `[consumptionHelper] cost baseline loaded -> ${this.baseTotalEur.toFixed(
                    2,
                )} € bei ${this.baseTotalKwh.toFixed(3)} kWh`,
            );
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] error loading cost baseline: ${err.message}`);
        }
    },

    async handleStateChange(id, state) {
        if (!this._active) {
            return;
        }
        const generation = this._lifecycleGeneration;
        const initializationPromise = this._initializationPromise;
        if (initializationPromise) {
            await initializationPromise;
            return;
        }
        if (!state || id !== this.energyId) {
            return;
        }
        const totalNowRaw = Number(state.val);
        if (!Number.isFinite(totalNowRaw)) {
            return;
        }
        await this._updateConsumption(totalNowRaw, generation);
    },

    async _updateConsumption(totalNowRaw, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        try {
            const offset = (await this.adapter.getStateAsync('consumption.offset_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            const last = (await this.adapter.getStateAsync('consumption.last_total_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            let totalNow = totalNowRaw;

            // FIX: Schutz gegen Überinstallations-Fehler und unplausible Sprünge
            if (totalNowRaw < last) {
                if (offset === 0 && totalNowRaw < 10 && last > 10) {
                    this.adapter.log.warn(
                        '[consumptionHelper] reinstall protection active - meter value decreased, offset remains unchanged.',
                    );
                    totalNow = last; // kein Offset addieren
                } else {
                    this.adapter.log.warn('[consumptionHelper] meter reset detected -> adjusting offset');
                    const newOffset = offset + last;
                    await this.adapter.setStateAsync('consumption.offset_kwh', { val: newOffset, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    totalNow = newOffset + totalNowRaw;
                }
            } else {
                totalNow = offset + totalNowRaw;
            }

            await this.adapter.setStateAsync('consumption.total_kwh', { val: totalNow, ack: true });
            if (!this._isGenerationActive(generation)) {
                return;
            }

            if (Object.keys(this.baselines).length === 0) {
                await this._loadBaselines(totalNow, generation);
                if (!this._isGenerationActive(generation)) {
                    return;
                }
            }

            const values = {
                day: totalNow - (this.baselines.day ?? totalNow),
                week: totalNow - (this.baselines.week ?? totalNow),
                month: totalNow - (this.baselines.month ?? totalNow),
                year: totalNow - (this.baselines.year ?? totalNow),
            };

            // Negative Werte vermeiden
            for (const key of Object.keys(values)) {
                if (values[key] < 0) {
                    this.baselines[key] = totalNow;
                    values[key] = 0;
                }
            }

            const deltaKwh = Math.max(0, totalNow - this.baseTotalKwh);
            const deltaEur = deltaKwh * this.price;
            const totalCost = this.baseTotalEur + deltaEur;

            const dayCost = values.day * this.price;
            const weekCost = values.week * this.price;
            const monthCost = values.month * this.price;
            const yearCost = values.year * this.price;

            await this.adapter.setStateAsync('consumption.day_kwh', { val: Number(values.day.toFixed(3)), ack: true });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this.adapter.setStateAsync('consumption.week_kwh', {
                val: Number(values.week.toFixed(3)),
                ack: true,
            });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this.adapter.setStateAsync('consumption.month_kwh', {
                val: Number(values.month.toFixed(3)),
                ack: true,
            });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this.adapter.setStateAsync('consumption.year_kwh', {
                val: Number(values.year.toFixed(3)),
                ack: true,
            });
            if (!this._isGenerationActive(generation)) {
                return;
            }

            if (this.price > 0) {
                await this.adapter.setStateAsync('costs.day_eur', { val: Number(dayCost.toFixed(2)), ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                await this.adapter.setStateAsync('costs.week_eur', { val: Number(weekCost.toFixed(2)), ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                await this.adapter.setStateAsync('costs.month_eur', { val: Number(monthCost.toFixed(2)), ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                await this.adapter.setStateAsync('costs.year_eur', { val: Number(yearCost.toFixed(2)), ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                await this.adapter.setStateAsync('costs.total_eur', { val: Number(totalCost.toFixed(2)), ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
            }

            await this.adapter.setStateAsync('consumption.last_total_kwh', { val: totalNowRaw, ack: true });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this._saveBaselines(generation);
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] error during consumption update: ${err.message}`);
        }
    },

    async _loadBaselines(totalNow, generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        this.baselines = {};
        const day = (await this.adapter.getStateAsync('consumption.day_kwh'))?.val;
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const week = (await this.adapter.getStateAsync('consumption.week_kwh'))?.val;
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const month = (await this.adapter.getStateAsync('consumption.month_kwh'))?.val;
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const year = (await this.adapter.getStateAsync('consumption.year_kwh'))?.val;
        if (!this._isGenerationActive(generation)) {
            return;
        }

        this.baselines.day = totalNow - (day || 0);
        this.baselines.week = totalNow - (week || 0);
        this.baselines.month = totalNow - (month || 0);
        this.baselines.year = totalNow - (year || 0);

        this.adapter.log.debug(`[consumptionHelper] baselines loaded: ${JSON.stringify(this.baselines)}`);
    },

    async _restoreBaselinesFromStates(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        try {
            const totalNow = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            const day = (await this.adapter.getStateAsync('consumption.day_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            const week = (await this.adapter.getStateAsync('consumption.week_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            const month = (await this.adapter.getStateAsync('consumption.month_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }
            const year = (await this.adapter.getStateAsync('consumption.year_kwh'))?.val || 0;
            if (!this._isGenerationActive(generation)) {
                return;
            }

            this.baselines.day = totalNow - day;
            this.baselines.week = totalNow - week;
            this.baselines.month = totalNow - month;
            this.baselines.year = totalNow - year;

            this.adapter.log.debug('[consumptionHelper] existing consumption values restored.');
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] error restoring consumption values: ${err.message}`);
        }
    },

    async _saveBaselines(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        try {
            await this.adapter.setStateAsync('consumption.day_kwh', {
                val: (await this.adapter.getStateAsync('consumption.day_kwh'))?.val,
                ack: true,
            });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this.adapter.setStateAsync('consumption.week_kwh', {
                val: (await this.adapter.getStateAsync('consumption.week_kwh'))?.val,
                ack: true,
            });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this.adapter.setStateAsync('consumption.month_kwh', {
                val: (await this.adapter.getStateAsync('consumption.month_kwh'))?.val,
                ack: true,
            });
            if (!this._isGenerationActive(generation)) {
                return;
            }
            await this.adapter.setStateAsync('consumption.year_kwh', {
                val: (await this.adapter.getStateAsync('consumption.year_kwh'))?.val,
                ack: true,
            });
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] error saving baselines: ${err.message}`);
        }
    },

    async resetAll(adapter) {
        try {
            this._adapter = adapter;
            adapter.log.warn('[consumptionHelper] manual reset of all consumption and cost data');

            const consumptionKeys = [
                'day_kwh',
                'week_kwh',
                'month_kwh',
                'year_kwh',
                'total_kwh',
                'offset_kwh',
                'last_total_kwh',
            ];
            for (const key of consumptionKeys) {
                await adapter.setStateAsync(`consumption.${key}`, { val: 0, ack: true });
            }

            const costKeys = ['day_eur', 'week_eur', 'month_eur', 'year_eur', 'total_eur'];
            for (const key of costKeys) {
                await adapter.setStateAsync(`costs.${key}`, { val: 0, ack: true });
            }

            this.baselines = {};
            this.baseTotalKwh = 0;
            this.baseTotalEur = 0;

            adapter.log.info('[consumptionHelper] consumption and costs successfully reset to 0');
        } catch (err) {
            this.adapter.log.error(`[consumptionHelper] error during manual reset: ${err.message}`);
        }
    },

    // FIX: täglicher Reset um Mitternacht für Tagesverbrauch
    _scheduleDailyReset(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight - now;

        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        this.resetTimer = this.adapter.setTimeout(async () => {
            if (!this._isGenerationActive(generation)) {
                return;
            }
            try {
                this.adapter.log.info('[consumptionHelper] daily counter reset (midnight)');
                await this.adapter.setStateAsync('consumption.day_kwh', { val: 0, ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                await this.adapter.setStateAsync('costs.day_eur', { val: 0, ack: true });
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                const totalState = await this.adapter.getStateAsync('consumption.total_kwh');
                if (!this._isGenerationActive(generation)) {
                    return;
                }
                this.baselines.day = totalState?.val || 0;
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] error during midnight reset: ${err.message}`);
            }
            if (!this._isGenerationActive(generation)) {
                return;
            }
            this.resetTimer = null;
            this._scheduleDailyReset(generation); // Timer erneut setzen
        }, msUntilMidnight);
    },

    // ---------------------------------------------------------
    // 🔵 WÖCHENTLICHER RESET (täglicher Check um 00:05 Uhr, nur Montag)
    // ---------------------------------------------------------
    _scheduleWeeklyReset(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const now = new Date();
        const next = new Date(now);
        next.setHours(0, 5, 0, 0); // täglicher Check 00:05

        // Wenn die Zeit heute schon vorbei ist → morgen 00:05
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const delay = next - now;

        if (this.weeklyResetTimer) {
            this.adapter.clearTimeout(this.weeklyResetTimer);
            this.weeklyResetTimer = null;
        }

        this.weeklyResetTimer = this.adapter.setTimeout(async () => {
            if (!this._isGenerationActive(generation)) {
                return;
            }
            try {
                const nowCheck = new Date();

                // Nur wenn heute Montag ist (0 = Sonntag, 1 = Montag)
                if (nowCheck.getDay() === 1) {
                    this.adapter.log.info('[consumptionHelper] weekly reset (Monday 00:05)');
                    await this.adapter.setStateAsync('consumption.week_kwh', { val: 0, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    await this.adapter.setStateAsync('costs.week_eur', { val: 0, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    const totalState = await this.adapter.getStateAsync('consumption.total_kwh');
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    this.baselines.week = totalState?.val || 0;
                }
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] error during weekly reset: ${err.message}`);
            }
            if (!this._isGenerationActive(generation)) {
                return;
            }

            // Morgen wieder planen
            this.weeklyResetTimer = null;
            this._scheduleWeeklyReset(generation);
        }, delay);
    },

    // ---------------------------------------------------------
    // 🔵 MONATLICHER RESET (täglicher Check um 00:05 Uhr, nur am 1.)
    // ---------------------------------------------------------
    _scheduleMonthlyReset(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const now = new Date();
        const next = new Date(now);
        next.setHours(0, 5, 0, 0); // täglicher Check 00:05

        // Wenn die Zeit heute schon vorbei ist → morgen 00:05
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const delay = next - now;

        if (this.monthlyResetTimer) {
            this.adapter.clearTimeout(this.monthlyResetTimer);
            this.monthlyResetTimer = null;
        }

        this.monthlyResetTimer = this.adapter.setTimeout(async () => {
            if (!this._isGenerationActive(generation)) {
                return;
            }
            try {
                const nowCheck = new Date();

                // Nur am 1. des Monats
                if (nowCheck.getDate() === 1) {
                    this.adapter.log.info('[consumptionHelper] monthly reset (1st 00:05)');
                    await this.adapter.setStateAsync('consumption.month_kwh', { val: 0, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    await this.adapter.setStateAsync('costs.month_eur', { val: 0, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    const totalState = await this.adapter.getStateAsync('consumption.total_kwh');
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    this.baselines.month = totalState?.val || 0;
                }
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] error during monthly reset: ${err.message}`);
            }
            if (!this._isGenerationActive(generation)) {
                return;
            }

            // Morgen wieder planen
            this.monthlyResetTimer = null;
            this._scheduleMonthlyReset(generation);
        }, delay);
    },

    // ---------------------------------------------------------
    // 🔵 JÄHRLICHER RESET (täglicher Check um 00:10 Uhr)
    // ---------------------------------------------------------
    _scheduleYearlyReset(generation) {
        if (generation === undefined) {
            generation = this._lifecycleGeneration;
        }
        if (!this._isGenerationActive(generation)) {
            return;
        }
        const now = new Date();
        const next = new Date(now);
        next.setHours(0, 10, 0, 0); // täglicher Check 00:10 Uhr

        // Wenn Zeit für heute bereits vorbei ist → morgen um 00:10
        if (next <= now) {
            next.setDate(now.getDate() + 1);
        }

        const delay = next - now;

        if (this.yearlyResetTimer) {
            this.adapter.clearTimeout(this.yearlyResetTimer);
            this.yearlyResetTimer = null;
        }

        this.yearlyResetTimer = this.adapter.setTimeout(async () => {
            if (!this._isGenerationActive(generation)) {
                return;
            }
            try {
                const nowCheck = new Date();

                // 👉 Nur wenn wirklich 1. Januar
                if (nowCheck.getMonth() === 0 && nowCheck.getDate() === 1) {
                    this.adapter.log.info('[consumptionHelper] yearly reset (January 1st 00:10)');
                    await this.adapter.setStateAsync('consumption.year_kwh', { val: 0, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    await this.adapter.setStateAsync('costs.year_eur', { val: 0, ack: true });
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    const totalState = await this.adapter.getStateAsync('consumption.total_kwh');
                    if (!this._isGenerationActive(generation)) {
                        return;
                    }
                    this.baselines.year = totalState?.val || 0;
                }
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] error during yearly reset: ${err.message}`);
            }
            if (!this._isGenerationActive(generation)) {
                return;
            }

            // Morgen wieder prüfen
            this.yearlyResetTimer = null;
            this._scheduleYearlyReset(generation);
        }, delay);
    },

    cleanup() {
        this._active = false;
        ++this._lifecycleGeneration;
        this._initializationPromise = null;

        if (this.resetTimer) {
            this.adapter.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        if (this.weeklyResetTimer) {
            this.adapter.clearTimeout(this.weeklyResetTimer);
            this.weeklyResetTimer = null;
        }

        if (this.monthlyResetTimer) {
            this.adapter.clearTimeout(this.monthlyResetTimer);
            this.monthlyResetTimer = null;
        }

        if (this.yearlyResetTimer) {
            this.adapter.clearTimeout(this.yearlyResetTimer);
            this.yearlyResetTimer = null;
        }
    },
});

module.exports = consumptionHelper;

'use strict';

/**
 * consumptionHelper
 * - Nutzt externen kWh-Zähler (objectId aus Config)
 * - Berechnet Periodenwerte (Tag/Woche/Monat/Jahr)
 * - Berechnet Kosten anhand Strompreis (€/kWh)
 * - Offset-Mechanismus: summiert alte Werte bei Zählerwechsel/Reset auf
 * - Erhält Tages-/Wochen-/Monats-/Jahreswerte über Neustarts
 */

const consumptionHelper = {
    adapter: null,
    energyId: null,
    price: 0,
    baselines: {},
    resetTimer: null,

    lastKnownPrice: 0,
    baseTotalKwh: 0,
    baseTotalEur: 0,

    init(adapter) {
        this.adapter = adapter;
        this.energyId = adapter.config.external_energy_total_id || null;

        this.price = parseFloat(String(adapter.config.energy_price_eur_kwh).replace(',', '.')) || 0;
        this.lastKnownPrice = this.price;

        this.adapter.log.debug(`[consumptionHelper] Strompreis: ${this.price} €/kWh`);

        if (this.energyId) {
            adapter.subscribeForeignStates(this.energyId);
            adapter.log.debug(`[consumptionHelper] Überwache externen kWh-Zähler: ${this.energyId}`);
        } else {
            adapter.log.debug('[consumptionHelper] Kein externer kWh-Zähler konfiguriert → Verbrauchslogik inaktiv.');
        }

        this._scheduleDailyReset();
        this._loadCostBaselines();
        this._restoreBaselinesFromStates();

        // NEU: regelmäßige Perioden-Resets
        this._scheduleWeeklyReset();
        this._scheduleMonthlyReset();
        this._scheduleYearlyReset();
    },

    async _loadCostBaselines() {
        try {
            const totalKwh = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            const totalEur = (await this.adapter.getStateAsync('costs.total_eur'))?.val || 0;
            this.baseTotalKwh = totalKwh;
            this.baseTotalEur = totalEur;
            this.adapter.log.debug(
                `[consumptionHelper] Kosten-Basis geladen → ${this.baseTotalEur.toFixed(
                    2,
                )} € bei ${this.baseTotalKwh.toFixed(3)} kWh`,
            );
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] Fehler beim Laden der Kosten-Basis: ${err.message}`);
        }
    },

    async handleStateChange(id, state) {
        if (!state || id !== this.energyId) {
            return;
        }
        const totalNowRaw = Number(state.val);
        if (!Number.isFinite(totalNowRaw)) {
            return;
        }
        await this._updateConsumption(totalNowRaw);
    },

    async _updateConsumption(totalNowRaw) {
        try {
            const offset = (await this.adapter.getStateAsync('consumption.offset_kwh'))?.val || 0;
            const last = (await this.adapter.getStateAsync('consumption.last_total_kwh'))?.val || 0;
            let totalNow = totalNowRaw;

            // FIX: Schutz gegen Überinstallations-Fehler und unplausible Sprünge
            if (totalNowRaw < last) {
                if (offset === 0 && totalNowRaw < 10 && last > 10) {
                    this.adapter.log.warn(
                        '[consumptionHelper] Überinstallationsschutz aktiv – Zählerstand kleiner, Offset bleibt unverändert.',
                    );
                    totalNow = last; // kein Offset addieren
                } else {
                    this.adapter.log.warn('[consumptionHelper] Zähler-Reset erkannt → Offset wird angepasst');
                    const newOffset = offset + last;
                    await this.adapter.setStateAsync('consumption.offset_kwh', { val: newOffset, ack: true });
                    totalNow = newOffset + totalNowRaw;
                }
            } else {
                totalNow = offset + totalNowRaw;
            }

            await this.adapter.setStateAsync('consumption.total_kwh', { val: totalNow, ack: true });

            if (Object.keys(this.baselines).length === 0) {
                await this._loadBaselines(totalNow);
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
            await this.adapter.setStateAsync('consumption.week_kwh', {
                val: Number(values.week.toFixed(3)),
                ack: true,
            });
            await this.adapter.setStateAsync('consumption.month_kwh', {
                val: Number(values.month.toFixed(3)),
                ack: true,
            });
            await this.adapter.setStateAsync('consumption.year_kwh', {
                val: Number(values.year.toFixed(3)),
                ack: true,
            });

            if (this.price > 0) {
                await this.adapter.setStateAsync('costs.day_eur', { val: Number(dayCost.toFixed(2)), ack: true });
                await this.adapter.setStateAsync('costs.week_eur', { val: Number(weekCost.toFixed(2)), ack: true });
                await this.adapter.setStateAsync('costs.month_eur', { val: Number(monthCost.toFixed(2)), ack: true });
                await this.adapter.setStateAsync('costs.year_eur', { val: Number(yearCost.toFixed(2)), ack: true });
                await this.adapter.setStateAsync('costs.total_eur', { val: Number(totalCost.toFixed(2)), ack: true });
            }

            await this.adapter.setStateAsync('consumption.last_total_kwh', { val: totalNowRaw, ack: true });
            await this._saveBaselines();
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] Fehler bei Verbrauchsupdate: ${err.message}`);
        }
    },

    async _loadBaselines(totalNow) {
        this.baselines = {};
        const day = (await this.adapter.getStateAsync('consumption.day_kwh'))?.val;
        const week = (await this.adapter.getStateAsync('consumption.week_kwh'))?.val;
        const month = (await this.adapter.getStateAsync('consumption.month_kwh'))?.val;
        const year = (await this.adapter.getStateAsync('consumption.year_kwh'))?.val;

        this.baselines.day = totalNow - (day || 0);
        this.baselines.week = totalNow - (week || 0);
        this.baselines.month = totalNow - (month || 0);
        this.baselines.year = totalNow - (year || 0);

        this.adapter.log.debug(`[consumptionHelper] Baselines geladen: ${JSON.stringify(this.baselines)}`);
    },

    async _restoreBaselinesFromStates() {
        try {
            const totalNow = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            const day = (await this.adapter.getStateAsync('consumption.day_kwh'))?.val || 0;
            const week = (await this.adapter.getStateAsync('consumption.week_kwh'))?.val || 0;
            const month = (await this.adapter.getStateAsync('consumption.month_kwh'))?.val || 0;
            const year = (await this.adapter.getStateAsync('consumption.year_kwh'))?.val || 0;

            this.baselines.day = totalNow - day;
            this.baselines.week = totalNow - week;
            this.baselines.month = totalNow - month;
            this.baselines.year = totalNow - year;

            this.adapter.log.debug(`[consumptionHelper] Bestehende Verbrauchswerte wiederhergestellt.`);
        } catch (err) {
            this.adapter.log.warn(
                `[consumptionHelper] Fehler beim Wiederherstellen der Verbrauchsstände: ${err.message}`,
            );
        }
    },

    async _saveBaselines() {
        try {
            await this.adapter.setStateAsync('consumption.day_kwh', {
                val: (await this.adapter.getStateAsync('consumption.day_kwh'))?.val,
                ack: true,
            });
            await this.adapter.setStateAsync('consumption.week_kwh', {
                val: (await this.adapter.getStateAsync('consumption.week_kwh'))?.val,
                ack: true,
            });
            await this.adapter.setStateAsync('consumption.month_kwh', {
                val: (await this.adapter.getStateAsync('consumption.month_kwh'))?.val,
                ack: true,
            });
            await this.adapter.setStateAsync('consumption.year_kwh', {
                val: (await this.adapter.getStateAsync('consumption.year_kwh'))?.val,
                ack: true,
            });
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] Fehler beim Speichern der Baselines: ${err.message}`);
        }
    },

    async resetAll(adapter) {
        try {
            this.adapter = adapter;
            adapter.log.warn('[consumptionHelper] Manueller Reset aller Verbrauchs- und Kostendaten');

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

            adapter.log.info('[consumptionHelper] Verbrauch und Kosten erfolgreich auf 0 gesetzt');
        } catch (err) {
            this.adapter.log.error(`[consumptionHelper] Fehler beim manuellen Reset: ${err.message}`);
        }
    },

    // FIX: täglicher Reset um Mitternacht für Tagesverbrauch
    _scheduleDailyReset() {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight - now;

        this.resetTimer = setTimeout(async () => {
            try {
                this.adapter.log.info('[consumptionHelper] Tageszähler-Reset (Mitternacht)');
                await this.adapter.setStateAsync('consumption.day_kwh', { val: 0, ack: true });
                await this.adapter.setStateAsync('costs.day_eur', { val: 0, ack: true });
                this.baselines.day = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] Fehler beim Mitternachtsreset: ${err.message}`);
            }
            this._scheduleDailyReset(); // Timer erneut setzen
        }, msUntilMidnight);
    },

    // ---------------------------------------------------------
    // 🔵 WÖCHENTLICHER RESET (Montag 00:05 Uhr)
    // ---------------------------------------------------------
    _scheduleWeeklyReset() {
        const now = new Date();
        const next = new Date(now);

        // Montag = 1 (Sonntag = 0)
        const day = now.getDay();
        const daysUntilMonday = (1 - day + 7) % 7;

        next.setDate(now.getDate() + daysUntilMonday);
        next.setHours(0, 5, 0, 0);

        const delay = next - now;

        setTimeout(async () => {
            try {
                this.adapter.log.info('[consumptionHelper] Wochen-Reset (Montag 00:05)');
                await this.adapter.setStateAsync('consumption.week_kwh', { val: 0, ack: true });
                await this.adapter.setStateAsync('costs.week_eur', { val: 0, ack: true });
                this.baselines.week = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] Fehler beim Wochenreset: ${err.message}`);
            }
            this._scheduleWeeklyReset(); // erneut planen
        }, delay);
    },

    // ---------------------------------------------------------
    // 🔵 MONATLICHER RESET (1. des Monats 00:05 Uhr)
    // ---------------------------------------------------------
    _scheduleMonthlyReset() {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0, 0);
        const delay = next - now;

        setTimeout(async () => {
            try {
                this.adapter.log.info('[consumptionHelper] Monats-Reset (1. 00:05)');
                await this.adapter.setStateAsync('consumption.month_kwh', { val: 0, ack: true });
                await this.adapter.setStateAsync('costs.month_eur', { val: 0, ack: true });
                this.baselines.month = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] Fehler beim Monatsreset: ${err.message}`);
            }
            this._scheduleMonthlyReset();
        }, delay);
    },

    // ---------------------------------------------------------
    // 🔵 JÄHRLICHER RESET (1. Januar 00:10 Uhr)
    // ---------------------------------------------------------
    _scheduleYearlyReset() {
        const now = new Date();
        const next = new Date(now.getFullYear() + 1, 0, 1, 0, 10, 0, 0);
        const delay = next - now;

        setTimeout(async () => {
            try {
                this.adapter.log.info('[consumptionHelper] Jahres-Reset (1. Januar 00:10)');
                await this.adapter.setStateAsync('consumption.year_kwh', { val: 0, ack: true });
                await this.adapter.setStateAsync('costs.year_eur', { val: 0, ack: true });
                this.baselines.year = (await this.adapter.getStateAsync('consumption.total_kwh'))?.val || 0;
            } catch (err) {
                this.adapter.log.warn(`[consumptionHelper] Fehler beim Jahresreset: ${err.message}`);
            }
            this._scheduleYearlyReset();
        }, delay);
    },

    cleanup() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
    },
};

module.exports = consumptionHelper;

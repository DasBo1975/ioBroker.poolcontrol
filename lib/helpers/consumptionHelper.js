'use strict';

/**
 * consumptionHelper
 * - Nutzt externen kWh-Zähler (objectId aus Config)
 * - Berechnet Periodenwerte (Tag/Woche/Monat/Jahr)
 * - Berechnet Kosten anhand Strompreis (€/kWh)
 * - Offset-Mechanismus: summiert alte Werte bei Zählerwechsel/Reset auf
 */

const consumptionHelper = {
    adapter: null,
    energyId: null, // Objekt-ID des externen kWh-Zählers
    price: 0, // Strompreis €/kWh
    baselines: {}, // { day, week, month, year }
    resetTimer: null,

    init(adapter) {
        this.adapter = adapter;
        this.energyId = adapter.config.external_energy_total_id || null;
        this.price = adapter.config.energy_price_eur_kwh || 0;

        if (this.energyId) {
            adapter.subscribeForeignStates(this.energyId);
            adapter.log.info(`[consumptionHelper] Überwache externen kWh-Zähler: ${this.energyId}`);
        } else {
            adapter.log.info('[consumptionHelper] Kein externer kWh-Zähler konfiguriert → Verbrauchslogik inaktiv.');
        }

        // Reset-Timer für Mitternacht
        this._scheduleDailyReset();
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }
        if (id !== this.energyId) {
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
            // Offset laden
            const offset = (await this.adapter.getStateAsync('consumption.offset_kwh'))?.val || 0;
            const last = (await this.adapter.getStateAsync('consumption.last_total_kwh'))?.val || 0;

            let totalNow = totalNowRaw;

            // Prüfen: Reset oder neues Gerät?
            if (totalNowRaw < last) {
                this.adapter.log.warn('[consumptionHelper] Zähler-Reset erkannt → Offset wird angepasst');
                const newOffset = offset + last;
                await this.adapter.setStateAsync('consumption.offset_kwh', {
                    val: newOffset,
                    ack: true,
                });
                totalNow = newOffset + totalNowRaw;
            } else {
                totalNow = offset + totalNowRaw;
            }

            // Aktuellen Gesamtwert setzen
            await this.adapter.setStateAsync('consumption.total_kwh', {
                val: totalNow,
                ack: true,
            });

            // Baselines laden (falls leer)
            if (Object.keys(this.baselines).length === 0) {
                await this._loadBaselines(totalNow);
            }

            // Differenzen berechnen
            const values = {
                day: totalNow - (this.baselines.day ?? totalNow),
                week: totalNow - (this.baselines.week ?? totalNow),
                month: totalNow - (this.baselines.month ?? totalNow),
                year: totalNow - (this.baselines.year ?? totalNow),
            };

            // Negative Werte abfangen (bei Reset)
            for (const key of Object.keys(values)) {
                if (values[key] < 0) {
                    this.baselines[key] = totalNow;
                    values[key] = 0;
                }
            }

            // In States schreiben
            await this.adapter.setStateAsync('consumption.day_kwh', {
                val: Number(values.day.toFixed(3)),
                ack: true,
            });
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

            // Kosten berechnen
            if (this.price > 0) {
                await this.adapter.setStateAsync('costs.day_eur', {
                    val: Number((values.day * this.price).toFixed(2)),
                    ack: true,
                });
                await this.adapter.setStateAsync('costs.week_eur', {
                    val: Number((values.week * this.price).toFixed(2)),
                    ack: true,
                });
                await this.adapter.setStateAsync('costs.month_eur', {
                    val: Number((values.month * this.price).toFixed(2)),
                    ack: true,
                });
                await this.adapter.setStateAsync('costs.year_eur', {
                    val: Number((values.year * this.price).toFixed(2)),
                    ack: true,
                });
                await this.adapter.setStateAsync('costs.total_eur', {
                    val: Number((totalNow * this.price).toFixed(2)),
                    ack: true,
                });
            }

            // Letzten Stand des externen Zählers merken
            await this.adapter.setStateAsync('consumption.last_total_kwh', {
                val: totalNowRaw,
                ack: true,
            });
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

        this.adapter.log.info(`[consumptionHelper] Baselines geladen: ${JSON.stringify(this.baselines)}`);
    },

    _scheduleDailyReset() {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = nextMidnight - now;

        this.resetTimer = setTimeout(() => {
            this.baselines = {};
            this._scheduleDailyReset();
        }, msUntilMidnight);
    },

    cleanup() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
    },
};

module.exports = consumptionHelper;

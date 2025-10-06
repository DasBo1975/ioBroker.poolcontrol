'use strict';

/**
 * consumptionHelper
 * - Nutzt externen kWh-Zähler (objectId aus Config)
 * - Berechnet Periodenwerte (Tag/Woche/Monat/Jahr)
 * - Berechnet Kosten anhand Strompreis (€/kWh) mit additiver Logik über Neustarts
 * - Offset-Mechanismus: summiert alte Werte bei Zählerwechsel/Reset auf
 * - NEU: Erhält Tages-/Wochen-/Monats-/Jahreswerte über Neustarts (keine Datenpunkte neu!)
 */

const consumptionHelper = {
    adapter: null,
    energyId: null,
    price: 0,
    baselines: {},
    resetTimer: null,

    // interne Speicher für additive Berechnung
    lastKnownPrice: 0,
    baseTotalKwh: 0,
    baseTotalEur: 0,

    init(adapter) {
        this.adapter = adapter;
        this.energyId = adapter.config.external_energy_total_id || null;

        // Komma/Punkt tolerant interpretieren
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
        this._loadCostBaselines(); // Basiswerte laden
        this._restoreBaselinesFromStates(); // <-- NEU: Baselines aus bestehenden States wiederherstellen
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

            // Reset-Erkennung
            if (totalNowRaw < last) {
                this.adapter.log.warn('[consumptionHelper] Zähler-Reset erkannt → Offset wird angepasst');
                const newOffset = offset + last;
                await this.adapter.setStateAsync('consumption.offset_kwh', { val: newOffset, ack: true });
                totalNow = newOffset + totalNowRaw;
            } else {
                totalNow = offset + totalNowRaw;
            }

            await this.adapter.setStateAsync('consumption.total_kwh', { val: totalNow, ack: true });

            // Baselines laden (falls leer)
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

            // === Additive Kostenberechnung über Neustarts ===
            const deltaKwh = Math.max(0, totalNow - this.baseTotalKwh);
            const deltaEur = deltaKwh * this.price;
            const totalCost = this.baseTotalEur + deltaEur;

            // Tages-/Wochen-/Monats-/Jahreskosten berechnen (nur Momentansicht)
            const dayCost = values.day * this.price;
            const weekCost = values.week * this.price;
            const monthCost = values.month * this.price;
            const yearCost = values.year * this.price;

            // States schreiben
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

            // Letzten Zählerwert speichern
            await this.adapter.setStateAsync('consumption.last_total_kwh', { val: totalNowRaw, ack: true });

            // NEU: aktuelle Baselines persistent sichern
            await this._saveBaselines();
        } catch (err) {
            this.adapter.log.warn(`[consumptionHelper] Fehler bei Verbrauchsupdate: ${err.message}`);
        }
    },

    // Lädt Baselines beim Start, wenn im Speicher leer
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

    // NEU: Baselines aus States rekonstruieren (beim Adapterstart)
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

    // NEU: Aktuelle Baselines speichern (persistente Sicherung)
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

    // === NEU: Manueller Gesamreset für Verbrauch & Kosten ====================
    async resetAll(adapter) {
        try {
            this.adapter = adapter;
            adapter.log.warn('[consumptionHelper] Manueller Reset aller Verbrauchs- und Kostendaten');

            // Verbrauchswerte nullen
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

            // Kostenwerte nullen
            const costKeys = ['day_eur', 'week_eur', 'month_eur', 'year_eur', 'total_eur'];
            for (const key of costKeys) {
                await adapter.setStateAsync(`costs.${key}`, { val: 0, ack: true });
            }

            // interne Speicher ebenfalls zurücksetzen
            this.baselines = {};
            this.baseTotalKwh = 0;
            this.baseTotalEur = 0;

            adapter.log.info('[consumptionHelper] Verbrauch und Kosten erfolgreich auf 0 gesetzt');
        } catch (err) {
            this.adapter.log.error(`[consumptionHelper] Fehler beim manuellen Reset: ${err.message}`);
        }
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

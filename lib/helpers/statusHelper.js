'use strict';

/**
 * statusHelper
 * - Erstellt eine Textzusammenfassung der wichtigsten Werte
 * - Schreibt in den State: status.summary
 */

const statusHelper = {
    adapter: null,

    init(adapter) {
        this.adapter = adapter;

        // Relevante States überwachen
        this.adapter.subscribeStates('pump.status');
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('temperature.surface.current');
        this.adapter.subscribeStates('temperature.collector.current');
        this.adapter.subscribeStates('temperature.outside.current');
        this.adapter.subscribeStates('runtime.today');
        this.adapter.subscribeStates('circulation.daily_total');
        this.adapter.subscribeStates('circulation.daily_required');

        // Beim Start einmal initial befüllen
        this.updateSummary().catch(err =>
            this.adapter.log.warn(`[statusHelper] Initial-Update fehlgeschlagen: ${err.message}`),
        );

        this.adapter.log.info('[statusHelper] initialisiert');
    },

    async handleStateChange(id, state) {
        if (!state) {
            return;
        }
        // Bei relevanter Änderung Zusammenfassung neu erstellen
        await this.updateSummary();
    },

    async updateSummary() {
        try {
            // Werte laden
            const pumpStatus = (await this.adapter.getStateAsync('pump.status'))?.val || 'unbekannt';
            const pumpMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'unknown';

            const poolTemp = (await this.adapter.getStateAsync('temperature.surface.current'))?.val;
            const collectorTemp = (await this.adapter.getStateAsync('temperature.collector.current'))?.val;
            const outsideTemp = (await this.adapter.getStateAsync('temperature.outside.current'))?.val;

            const runtimeToday = (await this.adapter.getStateAsync('runtime.today'))?.val || 0;
            const dailyTotal = (await this.adapter.getStateAsync('circulation.daily_total'))?.val || 0;
            const dailyRequired = (await this.adapter.getStateAsync('circulation.daily_required'))?.val || 0;

            // Laufzeit formatieren (h + m)
            const h = Math.floor(runtimeToday / 3600);
            const m = Math.floor((runtimeToday % 3600) / 60);
            const runtimeFormatted = `${h}h ${m}m`;

            // Umwälzungsquote berechnen (%)
            let circulationPct = 0;
            if (dailyRequired > 0) {
                circulationPct = Math.round((dailyTotal / dailyRequired) * 100);
            }

            // Text bauen
            let text = `Pumpe: ${pumpStatus}`;
            if (pumpMode && pumpMode !== 'unknown') {
                text += ` (Modus: ${pumpMode})`;
            }
            if (poolTemp != null) {
                text += `. Pool: ${poolTemp.toFixed(1)} °C`;
            }
            if (collectorTemp != null) {
                text += `, Kollektor: ${collectorTemp.toFixed(1)} °C`;
            }
            if (outsideTemp != null) {
                text += `, Außentemperatur: ${outsideTemp.toFixed(1)} °C`;
            }
            text += `. Tageslaufzeit: ${runtimeFormatted} (${circulationPct}% der Soll-Umwälzung).`;

            // In State schreiben
            await this.adapter.setStateAsync('status.summary', { val: text, ack: true });
        } catch (err) {
            this.adapter.log.warn(`[statusHelper] Fehler beim Update: ${err.message}`);
        }
    },

    cleanup() {
        // aktuell nichts zu tun
    },
};

module.exports = statusHelper;

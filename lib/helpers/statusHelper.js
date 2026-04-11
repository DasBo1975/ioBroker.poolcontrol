'use strict';

/**
 * statusHelper
 * - Erstellt Text- und JSON-Zusammenfassungen
 * - Schreibt Pumpenstart/Stop-Zeiten, Zähler, Indikatoren
 * - Hält systemweite OK/Warning-Flags aktuell
 * - Führt Tagesreset um Mitternacht durch
 */

const statusHelper = {
    adapter: null,
    midnightTimer: null,
    pumpOn: null, // interner Merker für Pumpenstatus
    _lastSummaryUpdate: 0, // FIX: Zeitstempel für Throttle-Schutz

    init(adapter) {
        this.adapter = adapter;

        // Relevante States überwachen
        this.adapter.subscribeStates('pump.status');
        this.adapter.subscribeStates('pump.mode');
        this.adapter.subscribeStates('pump.pump_switch'); // wichtig für Start/Stop
        this.adapter.subscribeStates('temperature.surface.current');
        this.adapter.subscribeStates('temperature.collector.current');
        this.adapter.subscribeStates('temperature.outside.current');
        this.adapter.subscribeStates('runtime.today');
        this.adapter.subscribeStates('circulation.daily_total');
        this.adapter.subscribeStates('circulation.daily_required');

        // System-Warnungen überwachen
        this.adapter.subscribeStates('solar.collector_warning');
        this.adapter.subscribeStates('pump.error');

        // Aktuellen Pumpenstatus laden
        this.adapter
            .getStateAsync('pump.pump_switch')
            .then(s => {
                this.pumpOn = !!s?.val;
            })
            .catch(() => {
                this.pumpOn = false;
            });

        // Beim Start initiale Updates
        this.updateSummary().catch(err =>
            this.adapter.log.warn(`[statusHelper] Initial update failed: ${err.message}`),
        );
        this.updateSystemStatus().catch(err =>
            this.adapter.log.warn(`[statusHelper] Initial system status update failed: ${err.message}`),
        );

        // Mitternacht-Reset einplanen
        this.scheduleMidnightReset();

        this.adapter.log.debug('[statusHelper] initialized');
    },

    async handleStateChange(id, state) {
        if (!state || state.ack !== true) {
            return;
        }

        // Pumpenstart/-stop
        if (id.endsWith('pump.pump_switch')) {
            const nowOn = !!state.val;

            // steigende Flanke
            if (nowOn && this.pumpOn !== true) {
                await this.adapter.setStateAsync('status.pump_last_start', {
                    val: new Date().toISOString(),
                    ack: true,
                });
                const currentCount = (await this.adapter.getStateAsync('status.pump_today_count'))?.val || 0;
                await this.adapter.setStateAsync('status.pump_today_count', { val: currentCount + 1, ack: true });
                await this.adapter.setStateAsync('status.pump_was_on_today', { val: true, ack: true });
                this.pumpOn = true;
            }

            // fallende Flanke
            if (!nowOn && this.pumpOn !== false) {
                await this.adapter.setStateAsync('status.pump_last_stop', {
                    val: new Date().toISOString(),
                    ack: true,
                });
                this.pumpOn = false;
            }
        }

        // System-Warnungen
        if (id.endsWith('solar.collector_warning') || id.endsWith('pump.error')) {
            await this.updateSystemStatus();
        }

        // Allgemeines Update
        await this.updateSummary();
    },

    // FIX: Hilfsfunktion zur sicheren Formatierung
    safeValue(v, digits = 1) {
        if (v == null || isNaN(v)) {
            return '–';
        }
        return Number(v).toFixed(digits);
    },

    async updateSummary() {
        try {
            // FIX: Throttle - Mehrfachupdates innerhalb 1 Sekunde vermeiden
            if (Date.now() - this._lastSummaryUpdate < 1000) {
                this.adapter.log.debug('[statusHelper] updateSummary skipped (throttle)');
                return;
            }
            this._lastSummaryUpdate = Date.now();

            // Werte laden
            const pumpStatus = (await this.adapter.getStateAsync('pump.status'))?.val || 'unbekannt';
            const pumpMode = (await this.adapter.getStateAsync('pump.mode'))?.val || 'unknown';

            const poolTemp = (await this.adapter.getStateAsync('temperature.surface.current'))?.val;
            const collectorTemp = (await this.adapter.getStateAsync('temperature.collector.current'))?.val;
            const outsideTemp = (await this.adapter.getStateAsync('temperature.outside.current'))?.val;

            const runtimeToday = (await this.adapter.getStateAsync('runtime.today'))?.val || 0;
            const dailyTotal = (await this.adapter.getStateAsync('circulation.daily_total'))?.val || 0;
            const dailyRequired = (await this.adapter.getStateAsync('circulation.daily_required'))?.val || 0;

            // Laufzeit formatieren
            const h = Math.floor(runtimeToday / 3600);
            const m = Math.floor((runtimeToday % 3600) / 60);
            const runtimeFormatted = isNaN(h) || isNaN(m) ? '0h 00m' : `${h}h ${m}m`; // FIX: Schutz gegen NaN

            // Umwälzungsquote
            let circulationPct = 0;
            if (dailyRequired > 0) {
                circulationPct = Math.round((dailyTotal / dailyRequired) * 100);
            }
            if (isNaN(circulationPct)) {
                circulationPct = 0;
            } // FIX: NaN-Absicherung

            // Text bauen
            let text = `Pumpe: ${pumpStatus}`;
            if (pumpMode && pumpMode !== 'unknown') {
                text += ` (Modus: ${pumpMode})`;
            }

            const safe = this.safeValue.bind(this); // FIX: Kurzreferenz
            if (poolTemp != null) {
                text += `. Pool: ${safe(poolTemp)} °C`;
            }
            if (collectorTemp != null) {
                text += `, Kollektor: ${safe(collectorTemp)} °C`;
            }
            if (outsideTemp != null) {
                text += `, Außentemperatur: ${safe(outsideTemp)} °C`;
            }
            text += `. Tageslaufzeit: ${runtimeFormatted} (${circulationPct}% der Soll-Umwälzung).`;

            // FIX: Bestehende Werte zuerst lesen, damit last_summary_update nur bei echter Änderung gesetzt wird
            const currentSummary = (await this.adapter.getStateAsync('status.summary'))?.val ?? '';

            // JSON-Übersicht bauen
            const json = {
                pump: pumpStatus,
                mode: pumpMode,
                pool: poolTemp ?? null,
                collector: collectorTemp ?? null,
                outside: outsideTemp ?? null,
                runtime_today: runtimeToday ?? 0,
                runtime_formatted: runtimeFormatted,
                circulation_pct: circulationPct,
            };
            const overviewJson = JSON.stringify(json);
            const currentOverview = (await this.adapter.getStateAsync('status.overview_json'))?.val ?? '';

            const summaryChanged = currentSummary !== text;
            const overviewChanged = currentOverview !== overviewJson;

            if (summaryChanged) {
                await this.adapter.setStateAsync('status.summary', { val: text, ack: true }); // FIX
            }

            if (overviewChanged) {
                await this.adapter.setStateAsync('status.overview_json', {
                    val: overviewJson,
                    ack: true,
                }); // FIX
            }

            if (summaryChanged || overviewChanged) {
                await this.adapter.setStateAsync('status.last_summary_update', {
                    val: new Date().toISOString(),
                    ack: true,
                }); // FIX: nur bei echter Summary-/Overview-Änderung
            }
        } catch (err) {
            this.adapter.log.warn(`[statusHelper] Error while updating summary: ${err.message}`);
        }
    },

    async updateSystemStatus() {
        try {
            const pumpError = (await this.adapter.getStateAsync('pump.error'))?.val;
            const collectorWarning = (await this.adapter.getStateAsync('solar.collector_warning'))?.val;

            let warningActive = false;
            let warningText = '';

            if (pumpError) {
                warningActive = true;
                warningText += 'Pumpenfehler ';
            }
            if (collectorWarning) {
                warningActive = true;
                warningText += 'Kollektorwarnung ';
            }

            await this.adapter.setStateAsync('status.system_warning', { val: warningActive, ack: true });
            await this.adapter.setStateAsync('status.system_warning_text', { val: warningText.trim(), ack: true });
            await this.adapter.setStateAsync('status.system_ok', { val: !warningActive, ack: true });
        } catch (err) {
            this.adapter.log.warn(`[statusHelper] Error while updating system status: ${err.message}`);
        }
    },

    scheduleMidnightReset() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }

        const now = new Date();
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
        const msToMidnight = nextMidnight.getTime() - now.getTime();

        this.midnightTimer = setTimeout(async () => {
            await this.doMidnightReset();
            this.scheduleMidnightReset(); // neu einplanen
        }, msToMidnight);

        this.adapter.log.debug(`[statusHelper] Daily reset scheduled in ${Math.round(msToMidnight / 1000)}s`);
    },

    async doMidnightReset() {
        try {
            await this.adapter.setStateAsync('status.pump_today_count', { val: 0, ack: true });
            await this.adapter.setStateAsync('status.pump_was_on_today', { val: false, ack: true });
            this.adapter.log.debug('[statusHelper] Daily reset completed');
        } catch (err) {
            this.adapter.log.warn(`[statusHelper] Error during daily reset: ${err.message}`);
        }
    },

    cleanup() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
            this.midnightTimer = null;
        }
    },
};

module.exports = statusHelper;

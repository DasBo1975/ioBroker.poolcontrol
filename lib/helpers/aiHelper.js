'use strict';
/* eslint-disable jsdoc/require-param-description */
/* eslint-disable jsdoc/require-returns-description */

/**
 * aiHelper
 * --------------------------------------------------------------
 * Zentraler KI-Helper für PoolControl.
 *
 * Nutzt die States aus aiStates.js:
 *   ai.weather.switches.*
 *   ai.weather.schedule.*
 *   ai.weather.outputs.*
 *
 * Funktionen:
 *   - Liest Geodaten aus system.config (Latitude/Longitude)
 *   - Ruft Wetterdaten von Open-Meteo ab (bei Bedarf, max. 4x/Tag – je Modul)
 *   - Erzeugt Textausgaben:
 *       ai.weather.outputs.weather_advice
 *       ai.weather.outputs.daily_summary
 *       ai.weather.outputs.pool_tips
 *       ai.weather.outputs.weekend_summary
 *       ai.weather.outputs.last_message
 *   - Optional: legt Texte in speech.queue für Sprachausgabe
 *
 * Wichtige Schalter:
 *   - ai.enabled              → globaler KI-Schalter
 *   - ai.weather.switches.allow_speech         → Sprachausgabe erlaubt
 *   - ai.weather.switches.weather_advice_enabled
 *   - ai.weather.switches.daily_summary_enabled
 *   - ai.weather.switches.daily_pool_tips_enabled
 *   - ai.weather.switches.weekend_summary_enabled
 *   - ai.weather.switches.debug_mode
 *
 * Zeitsteuerung (HH:MM, lokal):
 *   - ai.weather.schedule.weather_advice_time
 *   - ai.weather.schedule.daily_summary_time
 *   - ai.weather.schedule.daily_pool_tips_time
 *   - ai.weather.schedule.weekend_summary_time
 */

const https = require('https');

const aiHelper = {
    adapter: null,
    timers: [],
    _lastScheduleValues: {}, // NEU: merkt sich letzte Zeitwerte
    _debugMode: false,

    _adapterStartedAt: Date.now(), // FIX: Zeitpunkt des Adapterstarts

    // Anti-Spam-Level (merkt sich letzte Warnungen)
    _lastPoolTipCode: null,
    _lastPoolTipWindLevel: null,
    _lastPoolTipTimestamp: 0,

    /**
     * Initialisiert den AI-Helper (Timer + Grundkonfiguration).
     *
     * @param {import('iobroker').Adapter} adapter
     */
    async init(adapter) {
        this.adapter = adapter;
        this.adapter.log.info('[aiHelper] Initialisierung gestartet');

        // Ersten Settings-Load + Timeraufbau
        await this._refreshTimers();

        this.adapter.log.info('[aiHelper] Initialisierung abgeschlossen');
    },

    /**
     * Aufräumen beim Adapter-Stop.
     */
    cleanup() {
        this._clearTimers();
        this.adapter && this.adapter.log.debug('[aiHelper] Cleanup abgeschlossen (Timer gestoppt)');
    },

    /**
     * Reagiert auf State-Änderungen (ai.switches.*, ai.schedule.*),
     * damit Schalter und Zeiten ohne Neustart wirksam werden.
     *
     * @param {string} id
     * @param {ioBroker.State | null} state
     */
    async handleStateChange(id, state) {
        if (!this.adapter) {
            return;
        }
        if (!state) {
            return;
        }

        // Änderungen vom Adapter selbst ignorieren
        if (state.from && state.from.startsWith(`system.adapter.${this.adapter.name}.`)) {
            return;
        }

        // ---------------------------------------------------------
        // FIX 1: Nur AI-States weiterverarbeiten
        // ---------------------------------------------------------
        if (!id.includes('.ai.')) {
            // Alle Nicht-AI-States ignorieren → verhindert Log-Flut
            return;
        }

        // ---------------------------------------------------------
        // FIX 2: Uhrzeitänderungen IMMER erkennen und loggen
        // ---------------------------------------------------------
        if (id.includes('.ai.weather.schedule.')) {
            const oldVal = this._lastScheduleValues[id];
            const newVal = state.val;

            this.adapter.log.info(
                `[aiHelper] Uhrzeit geändert: ${id}: ${oldVal || '(kein vorheriger Wert)'} → ${newVal}`,
            );

            // neuen Wert speichern
            this._lastScheduleValues[id] = newVal;

            // Timer neu aufbauen
            await this._refreshTimers();

            // ----------------------------------------------------------
            // NEU: Delay, damit ioBroker alle States laden kann
            // ----------------------------------------------------------
            await new Promise(res => setTimeout(res, 1500));

            // NEU: Wenn Uhrzeit heute noch in der Zukunft liegt → sofort ausführen
            try {
                const now = new Date();
                const [hourStr, minuteStr] = String(newVal).split(':');
                const hour = Number(hourStr);
                const minute = Number(minuteStr);

                if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
                    const target = new Date();
                    target.setHours(hour, minute, 0, 0);

                    // Nur wenn Zielzeit HEUTE noch bevorsteht
                    if (target > now) {
                        this.adapter.log.info(
                            `[aiHelper] Neue Uhrzeit liegt heute noch in der Zukunft → führe Modul sofort aus (${id})`,
                        );

                        if (id.endsWith('weather_advice_time')) {
                            await this._runWeatherAdvice();
                        }
                        if (id.endsWith('daily_summary_time')) {
                            await this._runDailySummary();
                        }
                        if (id.endsWith('daily_pool_tips_time')) {
                            await this._runDailyPoolTips();
                        }
                        if (id.endsWith('weekend_summary_time')) {
                            await this._runWeekendSummary();
                        }
                    }
                }
            } catch (e) {
                this.adapter.log.warn(`[aiHelper] Fehler bei Sofortausführung nach Zeitänderung: ${e.message}`);
            }

            return;
        }

        // ---------------------------------------------------------
        // FIX 3: Schalteränderungen immer melden
        // ---------------------------------------------------------
        if (id.includes('.ai.weather.switches.')) {
            this.adapter.log.info(`[aiHelper] Schalter geändert: ${id} = ${state.val} – Timer werden neu aufgebaut`);

            await this._refreshTimers();
            return;
        }
    },

    // ---------------------------------------------------------------------
    // Timer-Verwaltung
    // ---------------------------------------------------------------------

    /**
     * Bestehende Timer stoppen.
     */
    _clearTimers() {
        for (const t of this.timers) {
            clearInterval(t);
        }
        this.timers = [];
    },

    /**
     * Liest alle relevanten States und baut die Timer neu auf.
     */
    async _refreshTimers() {
        this._clearTimers();

        const aiEnabled = await this._getBool('ai.enabled', false);
        this._debugMode = await this._getBool('ai.weather.switches.debug_mode', false);

        if (!aiEnabled) {
            this.adapter.log.info('[aiHelper] KI ist deaktiviert (ai.enabled = false) – keine Timer aktiv');
            return;
        }

        this.adapter.log.info('[aiHelper] KI ist aktiv – Timer werden gesetzt');

        // --- Wetterhinweise ---
        const weatherEnabled = await this._getBool('ai.weather.switches.weather_advice_enabled', false);
        if (weatherEnabled) {
            const time = await this._getTimeOrDefault('ai.weather.schedule.weather_advice_time', '08:00');
            this._createDailyTimer(time, async () => {
                await this._runWeatherAdvice();
            });
            this.adapter.log.debug(
                `[aiHelper] Wetterhinweis-Timer gesetzt für ${time.hour}:${String(time.minute).padStart(2, '0')}`,
            );
        }

        // --- Tägliche Zusammenfassung ---
        const summaryEnabled = await this._getBool('ai.weather.switches.daily_summary_enabled', false);
        if (summaryEnabled) {
            const time = await this._getTimeOrDefault('ai.weather.schedule.daily_summary_time', '09:00');
            this._createDailyTimer(time, async () => {
                await this._runDailySummary();
            });
            this.adapter.log.debug(
                `[aiHelper] Daily-Summary-Timer gesetzt für ${time.hour}:${String(time.minute).padStart(2, '0')}`,
            );
        }

        // --- Tägliche Pool-Tipps ---
        const tipsEnabled = await this._getBool('ai.weather.switches.daily_pool_tips_enabled', false);
        if (tipsEnabled) {
            const time = await this._getTimeOrDefault('ai.weather.schedule.daily_pool_tips_time', '10:00');
            this._createDailyTimer(time, async () => {
                await this._runDailyPoolTips();
            });
            this.adapter.log.debug(
                `[aiHelper] Pool-Tipps-Timer gesetzt für ${time.hour}:${String(time.minute).padStart(2, '0')}`,
            );
        }

        // --- Wochenend-Zusammenfassung ---
        const weekendEnabled = await this._getBool('ai.weather.switches.weekend_summary_enabled', false);
        if (weekendEnabled) {
            const time = await this._getTimeOrDefault('ai.weather.schedule.weekend_summary_time', '18:00');
            this._createDailyTimer(time, async () => {
                await this._runWeekendSummary();
            });
            this.adapter.log.debug(
                `[aiHelper] Wochenend-Timer gesetzt für ${time.hour}:${String(time.minute).padStart(2, '0')}`,
            );
        }

        //--------------------------------------------------------
        // NEU: Stündlicher Wetter-Update-Timer
        //--------------------------------------------------------
        this.adapter.log.debug('[aiHelper] Stündlicher Wetter-Update-Timer wird gesetzt');

        const hourlyTimer = setInterval(
            async () => {
                try {
                    const geo = await this._loadGeoLocation();
                    if (!geo) {
                        this.adapter.log.info('[aiHelper] Wetter-Update abgebrochen – keine Geodaten verfügbar');
                        return;
                    }

                    const weather = await this._fetchWeather(geo.lat, geo.lon);
                    if (!weather) {
                        this.adapter.log.info('[aiHelper] Wetter-Update abgebrochen – keine Wetterdaten verfügbar');
                        return;
                    }

                    // WeatherAdvice aktualisieren (heutiges Wetter)
                    const weatherText = this._buildWeatherAdviceText(weather);
                    await this._writeOutput('weather_advice', weatherText);

                    // NEU: Pool-Tipps automatisch mit aktualisieren
                    const seasonActive = await this._getBool('status.season_active', false);
                    const poolTipsText = this._buildPoolTipsText(weather, seasonActive);
                    await this._writeOutput('pool_tips', poolTipsText);

                    if (this._debugMode) {
                        this.adapter.log.debug(
                            '[aiHelper] Stündliches Wetter-Update durchgeführt (Weather + Pool-Tipps)',
                        );
                    }
                } catch (err) {
                    this.adapter.log.warn(`[aiHelper] Fehler beim stündlichen Wetter-Update: ${err.message}`);
                }
            },
            60 * 60 * 1000,
        ); // 1 Stunde

        this.timers.push(hourlyTimer);
    },

    /**
     * Erzeugt einen täglichen Timer für HH:MM (lokale Zeit).
     * Prüft minütlich, ob die Zeit erreicht ist.
     *
     * @param {{hour:number,minute:number}} timeObj
     * @param {() => Promise<void>} callback
     */
    _createDailyTimer(timeObj, callback) {
        const { hour, minute } = timeObj;
        const timer = setInterval(async () => {
            const now = new Date();

            // --- FIX: Nachholen nur in den ersten 3 Minuten nach Adapterstart ---
            const diffMinutes = now.getHours() * 60 + now.getMinutes() - (hour * 60 + minute);

            const adapterUptimeMs = Date.now() - this._adapterStartedAt;
            const withinStartupWindow = adapterUptimeMs <= 3 * 60 * 1000; // 3 Minuten

            if (withinStartupWindow && diffMinutes > 0 && diffMinutes <= 2) {
                try {
                    await callback();
                    this.adapter.log.info('[aiHelper] Nachholung ausgeführt (innerhalb der ersten 3 Minuten nach Start)');
                } catch (err) {
                    this.adapter.log.warn(`[aiHelper] Fehler bei Nachholung: ${err.message}`);
                }
            }

            if (now.getHours() === hour && now.getMinutes() === minute) {
                this.adapter.log.debug(
                    `[aiHelper] Timer ausgelöst: ${hour}:${String(minute).padStart(2, '0')} → Callback wird ausgeführt`,
                ); // NEU

                try {
                    await callback();
                } catch (err) {
                    this.adapter.log.warn(`[aiHelper] Fehler im Timer-Callback: ${err.message}`);
                }
            }
        }, 60 * 1000); // jede Minute prüfen

        this.timers.push(timer);
    },

    // ---------------------------------------------------------------------
    // Hauptfunktionen – Module
    // ---------------------------------------------------------------------

    /**
     * 1) Wetterhinweise (ai.outputs.weather_advice)
     */
    async _runWeatherAdvice() {
        try {
            const geo = await this._loadGeoLocation();
            if (!geo) {
                this.adapter.log.info('[aiHelper] Wetterhinweis abgebrochen – keine Geodaten verfügbar');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!weather) {
                this.adapter.log.info('[aiHelper] Wetterhinweis abgebrochen – keine Wetterdaten');
                return;
            }

            const text = this._buildWeatherAdviceText(weather);
            await this._writeOutput('weather_advice', text);
            await this._maybeSpeak(text);

            this.adapter.log.info('[aiHelper] Neuer Wetterhinweis erzeugt');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] Fehler bei _runWeatherAdvice(): ${err.message}`);
        }
    },

    /**
     * 2) Tägliche Zusammenfassung (ai.outputs.daily_summary)
     */
    async _runDailySummary() {
        try {
            const geo = await this._loadGeoLocation();
            const weather = geo ? await this._fetchWeather(geo.lat, geo.lon) : null;

            const seasonActive = await this._getBool('status.season_active', false);
            const pumpOn = await this._getBool('pump.pump_switch', false);
            const pumpMode = await this._getString('pump.mode', 'auto');
            const surfaceTemp = await this._getNumber('temperature.surface.current', null);

            const text = this._buildDailySummaryText({
                weather,
                seasonActive,
                pumpOn,
                pumpMode,
                surfaceTemp,
            });

            await this._writeOutput('daily_summary', text);
            await this._maybeSpeak(text);

            this.adapter.log.info('[aiHelper] Neue Tageszusammenfassung erzeugt');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] Fehler bei _runDailySummary(): ${err.message}`);
        }
    },

    /**
     * 3) Tägliche Pool-Tipps (ai.outputs.pool_tips)
     */
    async _runDailyPoolTips() {
        try {
            const geo = await this._loadGeoLocation();
            const weather = geo ? await this._fetchWeather(geo.lat, geo.lon) : null;
            const seasonActive = await this._getBool('status.season_active', false);

            const text = this._buildPoolTipsText(weather, seasonActive);

            await this._writeOutput('pool_tips', text);
            await this._maybeSpeak(text);

            this.adapter.log.info('[aiHelper] Neue Pool-Tipps erzeugt');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] Fehler bei _runDailyPoolTips(): ${err.message}`);
        }
    },

    /**
     * 4) Wochenend-Zusammenfassung (ai.outputs.weekend_summary)
     */
    async _runWeekendSummary() {
        try {
            const now = new Date();
            const weekday = now.getDay(); // 0=So, 1=Mo, ..., 5=Fr, 6=Sa

            // Nur Freitag oder Samstag sinnvoll
            if (weekday !== 5 && weekday !== 6) {
                this.adapter.log.info(
                    '[aiHelper] Wochenend-Zusammenfassung übersprungen – heute ist weder Freitag noch Samstag',
                );
                return;
            }

            const geo = await this._loadGeoLocation();
            const weather = geo ? await this._fetchWeather(geo.lat, geo.lon) : null;
            const seasonActive = await this._getBool('status.season_active', false);

            const text = this._buildWeekendSummaryText(weather, seasonActive, weekday);

            await this._writeOutput('weekend_summary', text);
            await this._maybeSpeak(text);

            this.adapter.log.info('[aiHelper] Neue Wochenend-Zusammenfassung erzeugt');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] Fehler bei _runWeekendSummary(): ${err.message}`);
        }
    },

    //--------------------------------------------------------
    // NEU: Stündliches Wetter-Update als eigene Funktion
    //--------------------------------------------------------
    async _runWeatherAutoUpdate() {
        try {
            const geo = await this._loadGeoLocation();
            if (!geo) {
                this.adapter.log.info('[aiHelper] Auto-Wetterupdate abgebrochen – keine Geodaten verfügbar');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!weather) {
                this.adapter.log.info('[aiHelper] Auto-Wetterupdate abgebrochen – keine Wetterdaten verfügbar');
                return;
            }

            // WeatherAdvice aktualisieren
            const text = this._buildWeatherAdviceText(weather);
            await this._writeOutput('weather_advice', text);

            if (this._debugMode) {
                this.adapter.log.debug('[aiHelper] Auto-Wetterupdate erfolgreich durchgeführt');
            }
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] Fehler bei Auto-Wetterupdate: ${err.message}`);
        }
    },

    // ---------------------------------------------------------------------
    // Geodaten + Wetter
    // ---------------------------------------------------------------------

    /**
     * Lädt Geokoordinaten korrekt aus system.config.
     *
     * @returns {{lat:number,lon:number}|null}
     */
    async _loadGeoLocation() {
        try {
            const obj = await this.adapter.getForeignObjectAsync('system.config');
            if (!obj || !obj.common) {
                this.adapter.log.warn('[aiHelper] Konnte system.config nicht laden');
                return null;
            }

            const lat = Number(obj.common.latitude);
            const lon = Number(obj.common.longitude);

            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                this.adapter.log.warn('[aiHelper] Geodaten ungültig – bitte in Admin unter System/Standort eintragen');
                return null;
            }

            if (this._debugMode) {
                this.adapter.log.debug(`[aiHelper] Geodaten geladen: lat=${lat}, lon=${lon}`);
            }

            return { lat, lon };
        } catch (err) {
            this.adapter.log.error(`[aiHelper] Fehler beim Laden der Geodaten: ${err.message}`);
            return null;
        }
    },

    /**
     * Ruft Wetterdaten von Open-Meteo ab.
     *
     * @param {number} lat
     * @param {number} lon
     * @returns {Promise<any|null>}
     */
    async _fetchWeather(lat, lon) {
        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${encodeURIComponent(lat)}` +
            `&longitude=${encodeURIComponent(lon)}` +
            `&current=temperature_2m,wind_speed_10m` +
            `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
            `&timezone=auto`;

        if (this._debugMode) {
            this.adapter.log.debug(`[aiHelper] Rufe Wetterdaten ab: ${url}`);
        }

        return new Promise(resolve => {
            try {
                https
                    .get(url, res => {
                        let data = '';
                        res.on('data', chunk => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            try {
                                if (!data) {
                                    this.adapter.log.warn('[aiHelper] Wetterabfrage: leere Antwort erhalten');
                                    return resolve(null);
                                }
                                const json = JSON.parse(data);
                                resolve(json);
                            } catch (err) {
                                this.adapter.log.warn(`[aiHelper] Fehler beim Parsen der Wetterdaten: ${err.message}`);
                                resolve(null);
                            }
                        });
                    })
                    .on('error', err => {
                        this.adapter.log.warn(`[aiHelper] Fehler bei Wetterabfrage: ${err.message}`);
                        resolve(null);
                    });
            } catch (err) {
                this.adapter.log.warn(`[aiHelper] Unerwarteter Fehler bei Wetterabfrage: ${err.message}`);
                resolve(null);
            }
        });
    },

    // ---------------------------------------------------------------------
    // Textgeneratoren
    // ---------------------------------------------------------------------

    /**
     * Erzeugt einen gut lesbaren Wetterhinweis-Text.
     *
     * @param {any} weather
     * @returns {string}
     */
    _buildWeatherAdviceText(weather) {
        try {
            const tmax = this._safeArrayValue(weather?.daily?.temperature_2m_max, 0);
            const tmin = this._safeArrayValue(weather?.daily?.temperature_2m_min, 0);
            const code = this._safeArrayValue(weather?.daily?.weathercode, 0);
            const desc = this._describeWeatherCode(code);

            let text = 'Wetterhinweis für heute: ';

            if (tmax != null && tmin != null) {
                text += `zwischen ${tmin.toFixed(1)} °C und ${tmax.toFixed(1)} °C, `;
            } else if (tmax != null) {
                text += `bis maximal ${tmax.toFixed(1)} °C, `;
            }

            text += desc ? `${desc}.` : 'genaue Wetterlage konnte nicht bestimmt werden.';

            return text;
        } catch {
            return 'Wetterhinweis: Die aktuellen Wetterdaten konnten nicht ausgewertet werden.';
        }
    },

    /**
     * Erzeugt die Tageszusammenfassung.
     *
     * @param {{weather:any,seasonActive:boolean,pumpOn:boolean,pumpMode:string,surfaceTemp:number|null}} ctx
     * @returns {string}
     */
    _buildDailySummaryText(ctx) {
        const { weather, seasonActive, pumpOn, pumpMode, surfaceTemp } = ctx || {};

        let parts = [];

        // Saisonstatus
        if (seasonActive) {
            parts.push('Die Poolsaison ist aktuell AKTIV.');
        } else {
            parts.push('Die Poolsaison ist aktuell NICHT aktiv.');
        }

        // Pumpenstatus
        if (pumpOn) {
            parts.push(`Die Pumpe ist derzeit EIN (Modus: ${pumpMode || 'unbekannt'}).`);
        } else {
            parts.push(`Die Pumpe ist derzeit AUS (Modus: ${pumpMode || 'unbekannt'}).`);
        }

        // Temperatur
        if (surfaceTemp != null && !Number.isNaN(surfaceTemp)) {
            parts.push(`Die gemessene Wassertemperatur an der Oberfläche beträgt etwa ${surfaceTemp.toFixed(1)} °C.`);
        }

        // Wetterteil
        if (weather) {
            const tmax = this._safeArrayValue(weather?.daily?.temperature_2m_max, 0);
            const tmin = this._safeArrayValue(weather?.daily?.temperature_2m_min, 0);
            const code = this._safeArrayValue(weather?.daily?.weathercode, 0);
            const desc = this._describeWeatherCode(code);

            let w = 'Für heute sind ';
            if (tmax != null && tmin != null) {
                w += `Temperaturen zwischen ${tmin.toFixed(1)} °C und ${tmax.toFixed(1)} °C vorhergesagt`;
            } else if (tmax != null) {
                w += `Temperaturen bis etwa ${tmax.toFixed(1)} °C vorhergesagt`;
            } else {
                w += 'keine genauen Temperaturdaten verfügbar';
            }

            if (desc) {
                w += `, bei einer Wetterlage: ${desc}.`;
            } else {
                w += '.';
            }

            parts.push(w);
        } else {
            parts.push('Aktuelle Wetterdaten stehen derzeit nicht zur Verfügung.');
        }

        return parts.join(' ');
    },

    /**
     * Erzeugt tägliche Pool-Tipps abhängig von Wetter & Saison.
     *
     * @param {any} weather
     * @param {boolean} seasonActive
     * @returns {string}
     */
    _buildPoolTipsText(weather, seasonActive) {
        if (!seasonActive) {
            return 'Poolsaison ist aktuell nicht aktiv. Es sind keine speziellen Pool-Tipps notwendig.';
        }

        const tmax = this._safeArrayValue(weather?.daily?.temperature_2m_max, 0);
        const code = this._safeArrayValue(weather?.daily?.weathercode, 0);
        const desc = this._describeWeatherCode(code);

        if (tmax == null) {
            return 'Pool-Tipp: Es liegen keine Temperaturdaten vor. Bitte Poolbetrieb nach eigenem Gefühl planen.';
        }

        let text = 'Pool-Tipp für heute: ';

        //--------------------------------------------------------
        // NEU: Erweiterte Analyse für Pool-Tipps
        //--------------------------------------------------------

        // 1) Wind / Sturm
        const wind = weather?.current?.wind_speed_10m ?? null;
        if (wind != null) {
            if (wind >= 60) {
                text +=
                    '⚠️ Extrem starker Sturm erwartet! Bitte unbedingt die Abdeckung sichern und alle Gegenstände im Poolbereich fest verankern. ';
            } else if (wind >= 45) {
                text += 'Achtung: Starke Windböen treten auf. Bitte Abdeckung fixieren und lose Gegenstände sichern. ';
            } else if (wind >= 30) {
                text += 'Es wird windig – Abdeckung gut verschließen und empfindliches Zubehör schützen. ';
            }
        }

        // 2) Regen / Starkregen
        if (code != null) {
            if ([65, 82].includes(code)) {
                text += 'Kräftige Regenschauer erwartet – Abdeckung geschlossen halten. ';
            } else if ([61, 63, 80, 81].includes(code)) {
                text += 'Es wird regnerisch – Abdeckung eher geschlossen lassen. ';
            }
        }

        // 3) Gewitter / Hagel
        if (code === 95) {
            text += '⚡ Gewitterwarnung! Bitte Solarfolie sichern und Technik vor Feuchtigkeit schützen. ';
        }
        if (code === 96 || code === 99) {
            text += '⚠️ Hagelgefahr! Bitte empfindliche Geräte schützen und Poolbereich räumen. ';
        }

        // 4) Temperatur / Hitze
        if (tmax >= 28) {
            text += 'Sehr warmes Badewetter – Abdeckung tagsüber offen lassen. Chlorverbrauch steigt. ';
        } else if (tmax >= 22) {
            text += 'Angenehme Temperaturen – normaler Poolbetrieb empfohlen. ';
        } else if (tmax <= 16) {
            text += 'Kühle Temperaturen – Abdeckung geschlossen halten, um Wärmeverluste zu reduzieren. ';
        }

        // Fallback falls noch nichts geschrieben wurde
        if (text.trim() === 'Pool-Tipp für heute:') {
            text += desc ? `${desc}. ` : 'Keine besonderen Hinweise für den heutigen Tag. ';
        }

        if (tmax >= 26) {
            text += 'Es wird warm bis sehr warm – gutes Badewetter. ';
            text +=
                'Die Pumpe kann tagsüber etwas länger laufen, und die Abdeckung sollte bei Sonnenschein geöffnet werden. ';
        } else if (tmax >= 20) {
            text += 'Es wird mild bis angenehm. ';
            text += 'Eine normale Umwälzzeit reicht meist aus. Abdeckung nur bei Bedarf schließen. ';
        } else {
            text += 'Es bleibt eher kühl. ';
            text +=
                'Die Umwälzzeit kann auf das Minimum reduziert werden, und eine Abdeckung hilft, Wärmeverluste zu vermeiden. ';
        }

        if (desc && /regen|schauer|gewitter|sturm/i.test(desc)) {
            text +=
                'Achtung: Es ist mit Regen oder stärkerem Wind zu rechnen – Abdeckung bereit halten und Zubehör sichern.';
        } else if (desc && /sonnig|klar/i.test(desc)) {
            text += 'Bei sonniger Witterung steigt der Chlorverbrauch – Wasserwerte im Auge behalten.';
        }

        //--------------------------------------------------------
        // NEU: Anti-Spam-Logik
        //--------------------------------------------------------

        // // Wettercode vergleichen
        // if (code != null) {
        //     if (this._lastPoolTipCode === code) {
        //         // gleiches Wetter wie vorher → eventuell abbrechen
        //         const nowTs = Date.now();
        //         // nur jede 3 Stunden dieselbe Warnung erneut ausgeben
        //         if (nowTs - this._lastPoolTipTimestamp < 3 * 60 * 60 * 1000) {
        //             return 'Pool-Tipp: Keine neuen Hinweise – Bedingungen unverändert.';
        //         }
        //     }
        // }

        // Windlevel kategorisieren: 0 = ruhig, 1 = windig, 2 = stark, 3 = Sturm
        let windLevel = 0;
        if (wind != null) {
            if (wind >= 60) {
                windLevel = 3;
            } else if (wind >= 45) {
                windLevel = 2;
            } else if (wind >= 30) {
                windLevel = 1;
            }
        }

        // // prüfen, ob derselbe Windlevel schon gemeldet wurde
        // if (windLevel === this._lastPoolTipWindLevel) {
        //     const nowTs = Date.now();
        //     if (nowTs - this._lastPoolTipTimestamp < 3 * 60 * 60 * 1000) {
        //         return 'Pool-Tipp: Keine neuen Informationen – Wetter gleich geblieben.';
        //     }
        // }

        // Wenn wir hier sind → neuer Hinweis → Werte speichern
        this._lastPoolTipCode = code;
        this._lastPoolTipWindLevel = windLevel;
        this._lastPoolTipTimestamp = Date.now();

        return text;
    },

    /**
     * Erzeugt Wochenend-Zusammenfassung (Samstag/Sonntag).
     *
     * @param {any} weather
     * @param {boolean} seasonActive
     * @param {number} weekday JS-Tag (0=So..6=Sa)
     * @returns {string}
     */
    _buildWeekendSummaryText(weather, seasonActive, weekday) {
        if (!weather) {
            return 'Wochenendübersicht: Es stehen keine Wetterdaten zur Verfügung.';
        }

        const tmaxArr = weather?.daily?.temperature_2m_max || [];
        const tminArr = weather?.daily?.temperature_2m_min || [];
        const codeArr = weather?.daily?.weathercode || [];

        // Indizes für Samstag/Sonntag bestimmen
        let idxSat = null;
        let idxSun = null;

        if (weekday === 5) {
            // Freitag → morgen Samstag, übermorgen Sonntag
            idxSat = 1;
            idxSun = 2;
        } else if (weekday === 6) {
            // Samstag → heute Samstag, morgen Sonntag
            idxSat = 0;
            idxSun = 1;
        } else {
            // Fallback: nächste zwei Tage
            idxSat = 1;
            idxSun = 2;
        }

        const satMax = this._safeArrayValue(tmaxArr, idxSat);
        const satMin = this._safeArrayValue(tminArr, idxSat);
        const satCode = this._safeArrayValue(codeArr, idxSat);
        const satDesc = this._describeWeatherCode(satCode);

        const sunMax = this._safeArrayValue(tmaxArr, idxSun);
        const sunMin = this._safeArrayValue(tminArr, idxSun);
        const sunCode = this._safeArrayValue(codeArr, idxSun);
        const sunDesc = this._describeWeatherCode(sunCode);

        let text = 'Wochenendübersicht: ';

        text += 'Samstag: ';
        if (satMax != null && satMin != null) {
            text += `zwischen ${satMin.toFixed(1)} °C und ${satMax.toFixed(1)} °C`;
        } else if (satMax != null) {
            text += `bis etwa ${satMax.toFixed(1)} °C`;
        } else {
            text += 'keine Temperaturdaten';
        }
        if (satDesc) {
            text += `, Wetter: ${satDesc}. `;
        } else {
            text += '. ';
        }

        text += 'Sonntag: ';
        if (sunMax != null && sunMin != null) {
            text += `zwischen ${sunMin.toFixed(1)} °C und ${sunMax.toFixed(1)} °C`;
        } else if (sunMax != null) {
            text += `bis etwa ${sunMax.toFixed(1)} °C`;
        } else {
            text += 'keine Temperaturdaten';
        }
        if (sunDesc) {
            text += `, Wetter: ${sunDesc}. `;
        } else {
            text += '. ';
        }

        if (seasonActive) {
            text += 'Für das Wochenende bietet sich je nach Temperaturentwicklung ein angepasster Poolbetrieb an.';
        } else {
            text +=
                'Die Poolsaison ist aktuell nicht aktiv – das Wochenende eignet sich eher zur Planung oder Wartung.';
        }

        return text;
    },

    /**
     * Konvertiert Open-Meteo weathercode in eine deutsche Beschreibung.
     *
     * @param {number|null} code
     * @returns {string}
     */
    _describeWeatherCode(code) {
        if (code == null || Number.isNaN(code)) {
            return '';
        }

        // Quelle: Open-Meteo Wettercodes (vereinfachte Gruppierung)
        if (code === 0) {
            return 'klarer, sonniger Himmel';
        }
        if (code === 1) {
            return 'überwiegend sonnig mit wenigen Wolken';
        }
        if (code === 2) {
            return 'wechselhaft bewölkt';
        }
        if (code === 3) {
            return 'bedeckter Himmel';
        }

        if (code === 45 || code === 48) {
            return 'Nebel oder Hochnebel';
        }

        if (code === 51 || code === 53 || code === 55) {
            return 'leichter bis mäßiger Nieselregen';
        }
        if (code === 56 || code === 57) {
            return 'gefrierender Nieselregen';
        }

        if (code === 61 || code === 63 || code === 65) {
            return 'leichter bis kräftiger Regen';
        }
        if (code === 66 || code === 67) {
            return 'gefrierender Regen';
        }

        if (code === 71 || code === 73 || code === 75) {
            return 'leichter bis starker Schneefall';
        }
        if (code === 77) {
            return 'Schneekörner';
        }

        if (code === 80 || code === 81 || code === 82) {
            return 'Regenschauer';
        }
        if (code === 85 || code === 86) {
            return 'Schneeschauer';
        }

        if (code === 95) {
            return 'Gewitter';
        }
        if (code === 96 || code === 99) {
            return 'Gewitter mit Hagel';
        }

        return `Wettercode ${code}`;
    },

    // ---------------------------------------------------------------------
    // State-/Hilfsfunktionen
    // ---------------------------------------------------------------------

    /**
     * Schreibt einen AI-Output-Text.
     *
     * @param {string} id
     * @param {string} text
     */
    async _writeOutput(id, text) {
        if (!this.adapter) {
            return;
        }
        if (!text) {
            text = 'Keine Textausgabe verfügbar.';
        }

        try {
            await this.adapter.setStateAsync(`ai.weather.outputs.${id}`, { val: text, ack: true });
            await this.adapter.setStateAsync('ai.weather.outputs.last_message', { val: text, ack: true });

            if (this._debugMode) {
                this.adapter.log.debug(`[aiHelper] Output geschrieben → ai.weather.outputs.${id}: ${text}`);
            }
        } catch (err) {
            this.adapter.log.error(`[aiHelper] Fehler beim Schreiben eines Outputs (${id}): ${err.message}`);
        }
    },

    /**
     * Optional: sendet Text an speech.queue, wenn erlaubt.
     *
     * @param {string} text
     */
    async _maybeSpeak(text) {
        if (!this.adapter) {
            return;
        }
        if (!text) {
            return;
        }

        const allowSpeech = await this._getBool('ai.weather.switches.allow_speech', false);
        if (!allowSpeech) {
            if (this._debugMode) {
                this.adapter.log.debug(
                    '[aiHelper] Sprachausgabe deaktiviert (ai.weather.switches.allow_speech = false)',
                );
            }
            return;
        }

        try {
            await this.adapter.setStateAsync('speech.queue', { val: text, ack: false });
            this.adapter.log.info('[aiHelper] Text an speech.queue übergeben');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] Fehler bei Sprachausgabe: ${err.message}`);
        }
    },

    /**
     * Liest einen Bool-State.
     *
     * @param {string} id
     * @param {boolean} fallback
     * @returns {Promise<boolean>}
     */
    async _getBool(id, fallback) {
        try {
            const state = await this.adapter.getStateAsync(id);
            if (!state || state.val == null) {
                return fallback;
            }
            return !!state.val;
        } catch {
            return fallback;
        }
    },

    /**
     * Liest einen String-State.
     *
     * @param {string} id
     * @param {string} fallback
     * @returns {Promise<string>}
     */
    async _getString(id, fallback) {
        try {
            const state = await this.adapter.getStateAsync(id);
            if (!state || state.val == null) {
                return fallback;
            }
            return String(state.val);
        } catch {
            return fallback;
        }
    },

    /**
     * Liest einen Zahlen-State.
     *
     * @param {string} id
     * @param {number|null} fallback
     * @returns {Promise<number|null>}
     */
    async _getNumber(id, fallback) {
        try {
            const state = await this.adapter.getStateAsync(id);
            if (!state || state.val == null) {
                return fallback;
            }
            const num = Number(state.val);
            return Number.isNaN(num) ? fallback : num;
        } catch {
            return fallback;
        }
    },

    /**
     * Liest Zeit-String HH:MM und liefert Objekt {hour,minute}.
     *
     * @param {string} id
     * @param {string} def
     * @returns {Promise<{hour:number,minute:number}>}
     */
    async _getTimeOrDefault(id, def) {
        const str = await this._getString(id, def);

        // NEU: Log, welche Uhrzeit der Helper tatsächlich verwendet
        this.adapter.log.debug(`[aiHelper] Uhrzeit geladen: ${id} = "${str}" (Default: ${def})`);

        const match = /^(\d{1,2}):(\d{2})$/.exec(str || '');
        let hour = 0;
        let minute = 0;

        if (!match) {
            this.adapter.log.warn(`[aiHelper] Ungültiges Zeitformat in ${id}: "${str}" – verwende Default ${def}`);
            const defMatch = /^(\d{1,2}):(\d{2})$/.exec(def);
            if (defMatch) {
                hour = Number(defMatch[1]);
                minute = Number(defMatch[2]);
            }
        } else {
            hour = Math.min(Math.max(Number(match[1]), 0), 23);
            minute = Math.min(Math.max(Number(match[2]), 0), 59);
        }

        return { hour, minute };
    },

    /**
     * Sicherer Zugriff auf ein Array-Element.
     *
     * @param {Array<number>|undefined} arr
     * @param {number} idx
     * @returns {number|null}
     */
    _safeArrayValue(arr, idx) {
        if (!Array.isArray(arr)) {
            return null;
        }
        if (idx < 0 || idx >= arr.length) {
            return null;
        }
        const v = arr[idx];
        if (v == null || Number.isNaN(Number(v))) {
            return null;
        }
        return Number(v);
    },
};

module.exports = aiHelper;

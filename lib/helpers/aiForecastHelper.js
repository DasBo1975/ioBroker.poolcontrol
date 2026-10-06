'use strict';
/* eslint-disable jsdoc/require-param-description */

/**
 * aiForecastHelper
 * --------------------------------------------------------------
 * Erzeugt die „Vorhersage für morgen“.
 *
 * Nutzt folgende States:
 *   ai.weather.switches.tomorrow_forecast_enabled
 *   ai.weather.switches.allow_speech
 *   ai.weather.switches.debug_mode
 *
 *   ai.weather.schedule.tomorrow_forecast_time
 *
 *   ai.weather.outputs.tomorrow_forecast
 *
 * WICHTIG:
 *   Die Vorhersage wird NICHT in ai.weather.outputs.last_message geschrieben,
 *   damit wichtige Warnmeldungen nicht überschrieben werden.
 */

const https = require('node:https');

const aiForecastHelper = /** @satisfies {import('../types/poolcontrol-adapter').AiForecastHelper} */ ({
    _adapter: null,
    _active: false,
    _initGeneration: 0,
    _refreshGeneration: 0,
    _forecastGeneration: 0,

    timer: null,
    _debugMode: false,

    /** Initialized adapter instance. */
    get adapter() {
        if (!this._adapter) {
            throw new Error('aiForecastHelper used before init()');
        }

        return this._adapter;
    },

    /**
     * Initialisiert den Forecast-Helper.
     *
     * @param {import('../types/poolcontrol-adapter').PoolControlAdapter} adapter
     */
    async init(adapter) {
        this._adapter = adapter;
        this._active = true;
        const initGeneration = ++this._initGeneration;

        this.adapter.log.info('[aiForecastHelper] initialization started');

        this._subscribeStates();
        await this._refreshTimer();

        if (!this._active || initGeneration !== this._initGeneration) {
            return;
        }

        // ----------------------------------------------------------
        // NEU: Delay, damit ioBroker alle States laden kann
        // ----------------------------------------------------------
        await new Promise(resolve => {
            this.adapter.setTimeout(() => resolve(undefined), 1500);
        });

        if (!this._active || initGeneration !== this._initGeneration) {
            return;
        }

        // ----------------------------------------------------------
        // NEU: Sofortige Ausführung beim Adapterstart (wenn aktiviert)
        // ----------------------------------------------------------
        const aiEnabled = await this._getBool('ai.enabled', false);
        if (!this._active || initGeneration !== this._initGeneration) {
            return;
        }

        const enabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
        if (!this._active || initGeneration !== this._initGeneration) {
            return;
        }

        if (aiEnabled && enabled) {
            this.adapter.log.info('[aiForecastHelper] running one-time immediate forecast (adapter start)');
            try {
                await this._runForecast();
            } catch (err) {
                this.adapter.log.warn(`[aiForecastHelper] error during immediate forecast: ${err.message}`);
            }
        }

        if (this._active && initGeneration === this._initGeneration) {
            this.adapter.log.info('[aiForecastHelper] initialization finished');
        }
    },

    /** Subscribe to all states that control forecast execution. */
    _subscribeStates() {
        const ids = [
            'ai.enabled',
            'ai.weather.switches.tomorrow_forecast_enabled',
            'ai.weather.switches.allow_speech',
            'ai.weather.switches.debug_mode',
            'ai.weather.schedule.tomorrow_forecast_time',
        ];

        for (const id of ids) {
            if (!this._active) {
                return;
            }

            this.adapter.subscribeStates(id);
        }
    },

    /**
     * Aufräumen beim Adapter-Stop.
     */
    cleanup() {
        this._active = false;
        ++this._initGeneration;
        ++this._refreshGeneration;
        ++this._forecastGeneration;

        if (this.timer) {
            this.adapter.clearInterval(this.timer);
            this.timer = null;
        }

        this.adapter.log.debug('[aiForecastHelper] cleanup finished');
    },

    /**
     * Reagiert auf State-Änderungen an switches + schedule.
     *
     * @param id
     * @param state
     */
    async handleStateChange(id, state) {
        if (!this._active || !state) {
            return;
        }

        // Von Adapter selbst gesetzt? → ignorieren
        if (state.from && state.from.startsWith(`system.adapter.${this.adapter.name}.`)) {
            return;
        }

        const isMasterEnabled = id.endsWith('ai.enabled');
        const isForecastEnabled = id.endsWith('ai.weather.switches.tomorrow_forecast_enabled');
        const isSpeechAllowed = id.endsWith('ai.weather.switches.allow_speech');
        const isDebugMode = id.endsWith('ai.weather.switches.debug_mode');
        const isForecastTime = id.endsWith('ai.weather.schedule.tomorrow_forecast_time');

        if (!isMasterEnabled && !isForecastEnabled && !isSpeechAllowed && !isDebugMode && !isForecastTime) {
            return;
        }

        this.adapter.log.info(`[aiForecastHelper] change detected: ${id} = ${state.val}`);

        if (isSpeechAllowed) {
            return;
        }

        if (isDebugMode) {
            this._debugMode = state.val === true;
            return;
        }

        if ((isMasterEnabled || isForecastEnabled) && state.val !== true) {
            ++this._forecastGeneration;
            await this._refreshTimer();
            return;
        }

        // ----------------------------------------------------------
        // NEU: Sofortige Ausführung, wenn der Forecast aktiviert wird
        // ----------------------------------------------------------
        if (isForecastEnabled && state.val === true) {
            const aiEnabled = await this._getBool('ai.enabled', false);

            if (!this._active) {
                return;
            }

            if (aiEnabled) {
                this.adapter.log.info('[aiForecastHelper] forecast enabled -> one-time immediate run');
                try {
                    await this._runForecast();
                } catch (err) {
                    this.adapter.log.warn(`[aiForecastHelper] error during immediate run: ${err.message}`);
                }
            }
        }

        if (this._active) {
            await this._refreshTimer();
        }
    },

    // ---------------------------------------------------------------------
    // TIMER-VERWALTUNG
    // ---------------------------------------------------------------------
    async _refreshTimer() {
        const refreshGeneration = ++this._refreshGeneration;

        // alten Timer stoppen
        if (this.timer) {
            this.adapter.clearInterval(this.timer);
            this.timer = null;
        }

        if (!this._active) {
            return;
        }

        const aiEnabled = await this._getBool('ai.enabled', false);
        if (!this._active || refreshGeneration !== this._refreshGeneration) {
            return;
        }

        const enabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
        if (!this._active || refreshGeneration !== this._refreshGeneration) {
            return;
        }

        this._debugMode = await this._getBool('ai.weather.switches.debug_mode', false);
        if (!this._active || refreshGeneration !== this._refreshGeneration) {
            return;
        }

        if (!aiEnabled || !enabled) {
            this.adapter.log.info('[aiForecastHelper] forecast disabled - no timer active');
            return;
        }

        const time = await this._getTimeOrDefault('ai.weather.schedule.tomorrow_forecast_time', '19:00');
        if (!this._active || refreshGeneration !== this._refreshGeneration) {
            return;
        }

        this.adapter.log.info(
            `[aiForecastHelper] forecast timer set for ${time.hour}:${String(time.minute).padStart(2, '0')}`,
        );

        // minütlicher Check
        this.timer = this.adapter.setInterval(async () => {
            if (!this._active || refreshGeneration !== this._refreshGeneration) {
                return;
            }

            const now = new Date();
            if (now.getHours() === time.hour && now.getMinutes() === time.minute) {
                const masterEnabled = await this._getBool('ai.enabled', false);
                if (!this._active || refreshGeneration !== this._refreshGeneration || !masterEnabled) {
                    return;
                }

                const moduleEnabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
                if (!this._active || refreshGeneration !== this._refreshGeneration || !moduleEnabled) {
                    return;
                }

                try {
                    await this._runForecast();
                } catch (err) {
                    if (this._active && refreshGeneration === this._refreshGeneration) {
                        this.adapter.log.warn(`[aiForecastHelper] timer error: ${err.message}`);
                    }
                }
            }
        }, 60 * 1000);
    },

    // ---------------------------------------------------------------------
    // HAUPTFUNKTION – VORHERSAGE ERZEUGEN
    // ---------------------------------------------------------------------
    async _runForecast() {
        if (!this._active) {
            return;
        }

        const forecastGeneration = ++this._forecastGeneration;

        try {
            const aiEnabled = await this._getBool('ai.enabled', false);
            if (!this._isCurrentForecast(forecastGeneration) || !aiEnabled) {
                return;
            }

            const enabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
            if (!this._isCurrentForecast(forecastGeneration) || !enabled) {
                return;
            }

            this.adapter.log.info('[aiForecastHelper] creating forecast for tomorrow ...');

            const geo = await this._loadGeoLocation();
            if (!this._isCurrentForecast(forecastGeneration)) {
                return;
            }

            if (!geo) {
                this.adapter.log.warn('[aiForecastHelper] abort - no geo data available');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!this._isCurrentForecast(forecastGeneration)) {
                return;
            }

            if (!weather) {
                this.adapter.log.warn('[aiForecastHelper] abort - no weather data available');
                return;
            }

            const text = this._buildForecastText(weather);

            const masterStillEnabled = await this._getBool('ai.enabled', false);
            if (!this._isCurrentForecast(forecastGeneration) || !masterStillEnabled) {
                return;
            }

            const moduleStillEnabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
            if (!this._isCurrentForecast(forecastGeneration) || !moduleStillEnabled) {
                return;
            }

            await this._writeOutput('tomorrow_forecast', text);
            if (!this._isCurrentForecast(forecastGeneration)) {
                return;
            }

            await this._maybeSpeak(text, forecastGeneration);

            if (this._isCurrentForecast(forecastGeneration)) {
                this.adapter.log.info('[aiForecastHelper] forecast for tomorrow created');
            }
        } catch (err) {
            if (this._isCurrentForecast(forecastGeneration)) {
                this.adapter.log.warn(`[aiForecastHelper] error in _runForecast(): ${err.message}`);
            }
        }
    },

    /**
     * Check whether a forecast run may still publish side effects.
     *
     * @param {number} forecastGeneration
     */
    _isCurrentForecast(forecastGeneration) {
        return this._active && forecastGeneration === this._forecastGeneration;
    },

    // ---------------------------------------------------------------------
    // TEXTGENERATOR – Vorhersage für morgen (erweitert)
    // ---------------------------------------------------------------------
    _buildForecastText(weather) {
        try {
            const tmaxArr = weather?.daily?.temperature_2m_max || [];
            const tminArr = weather?.daily?.temperature_2m_min || [];
            const codeArr = weather?.daily?.weathercode || [];

            // NEU: zusätzliche Arrays für Regen & Wind
            const rainProbArr = weather?.daily?.precipitation_probability_max || []; // NEU
            const windMaxArr = weather?.daily?.wind_speed_10m_max || []; // NEU

            // Index 1 = morgen
            const tmax = this._safeValue(tmaxArr[1]);
            const tmin = this._safeValue(tminArr[1]);
            const code = this._safeValue(codeArr[1]);

            // NEU: Zusatzwerte für Regen & Wind
            const rain = this._safeValue(rainProbArr[1]); // Regenwahrscheinlichkeit in %
            const wind = this._safeValue(windMaxArr[1]); // max. Wind (km/h, laut Open-Meteo)

            const desc = this._describeWeatherCode(code);

            let text = 'Vorhersage für morgen: ';

            // --- Temperaturteil (wie bisher, nur leicht ergänzt) ---
            if (tmax != null && tmin != null) {
                text += `Temperaturen zwischen ${tmin.toFixed(1)} °C und ${tmax.toFixed(1)} °C`;
            } else if (tmax != null) {
                text += `Temperaturen bis etwa ${tmax.toFixed(1)} °C`;
            } else {
                text += 'keine Temperaturdaten verfügbar';
            }

            if (desc) {
                text += `, Wetter: ${desc}.`;
            } else {
                text += '.';
            }

            // --------------------------------------------------------
            // NEU: Regenwahrscheinlichkeit
            // --------------------------------------------------------
            if (rain != null) {
                text += ` Regenwahrscheinlichkeit: ${rain}%`;
                if (rain >= 70) {
                    text += ' – hoher Regenanteil erwartet.';
                } else if (rain >= 40) {
                    text += ' – zeitweise Schauer möglich.';
                } else {
                    text += ' – überwiegend trocken.';
                }
            }

            text += ' ';

            // --------------------------------------------------------
            // NEU: Windanalyse (stark / frisch / leicht)
            // --------------------------------------------------------
            if (wind != null) {
                let windText = '';

                if (wind >= 60) {
                    windText = 'sehr starker Wind / Sturm';
                } else if (wind >= 40) {
                    windText = 'starker Wind';
                } else if (wind >= 25) {
                    windText = 'frischer Wind';
                } else if (wind >= 10) {
                    windText = 'leichter Wind';
                } else {
                    windText = 'kaum spürbarer Wind';
                }

                text += `Wind: ${windText} (max. ${wind} km/h). `;

                // NEU: Warnung bei starkem Wind
                if (wind >= 40) {
                    text += '⚠️ Achtung: starker Wind vorhergesagt – Abdeckung und loses Zubehör sichern. ';
                }
            }

            // --------------------------------------------------------
            // NEU: Einschätzung „Solarwetter“
            // --------------------------------------------------------
            if (tmax != null) {
                if (tmax >= 26) {
                    text +=
                        'Morgen ist gutes Solarwetter – der Pool kann sich deutlich erwärmen, Abdeckung tagsüber geöffnet lassen. ';
                } else if (tmax >= 20) {
                    text +=
                        'Morgen ist moderates Solarwetter – leichte Erwärmung möglich, Abdeckung je nach Bedarf öffnen. ';
                } else {
                    text +=
                        'Nur wenig Solarwärme zu erwarten – Abdeckung möglichst geschlossen halten, um Wärmeverluste zu reduzieren. ';
                }
            }

            // --------------------------------------------------------
            // NEU: Pool-Empfehlungen für morgen
            // --------------------------------------------------------
            text += 'Pool-Empfehlungen für morgen: ';

            if (rain != null && rain >= 60) {
                text += 'Abdeckung geschlossen halten, da mit Regen zu rechnen ist. ';
            } else if (wind != null && wind >= 40) {
                text += 'Abdeckung gut sichern und empfindliche Gegenstände aus dem Poolbereich entfernen. ';
            } else if (tmax != null && tmax >= 25) {
                text += 'Gutes Badewetter – Pumpe tagsüber ausreichend laufen lassen und Abdeckung geöffnet halten. ';
            } else {
                text += 'Normale Poolnutzung möglich, Einstellungen können unverändert bleiben. ';
            }

            return text.trim();
        } catch {
            return 'Vorhersage: Wetterdaten konnten nicht ausgewertet werden.';
        }
    },

    // ---------------------------------------------------------------------
    // WETTER & GEO
    // ---------------------------------------------------------------------
    async _loadGeoLocation() {
        try {
            const obj = await this.adapter.getForeignObjectAsync('system.config');
            if (!obj || !obj.common) {
                return null;
            }

            const lat = Number(obj.common.latitude);
            const lon = Number(obj.common.longitude);

            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                return null;
            }

            if (this._debugMode) {
                this.adapter.log.debug(`[aiForecastHelper] Geolocation data: lat=${lat}, lon=${lon}`);
            }

            return { lat, lon };
        } catch {
            return null;
        }
    },

    async _fetchWeather(lat, lon) {
        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,wind_speed_10m` +
            // NEU: zusätzliche Daily-Parameter für Regenwahrscheinlichkeit & max. Wind
            `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,wind_speed_10m_max` +
            `&timezone=auto`;

        if (this._debugMode) {
            this.adapter.log.debug(`[aiForecastHelper] request: ${url}`);
        }

        return new Promise(resolve => {
            try {
                https
                    .get(url, res => {
                        let data = '';
                        res.on('data', chunk => (data += chunk));
                        res.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch {
                                resolve(null);
                            }
                        });
                    })
                    .on('error', () => resolve(null));
            } catch {
                resolve(null);
            }
        });
    },

    // ---------------------------------------------------------------------
    // AUSGABE
    // ---------------------------------------------------------------------
    async _writeOutput(id, text) {
        try {
            await this.adapter.setStateAsync(`ai.weather.outputs.${id}`, { val: text, ack: true });

            if (this._debugMode) {
                this.adapter.log.debug(`[aiForecastHelper] output written: ai.weather.outputs.${id}`);
            }
        } catch (err) {
            this.adapter.log.error(`[aiForecastHelper] error writing output (${id}): ${err.message}`);
        }
    },

    async _maybeSpeak(text, forecastGeneration) {
        if (!this._isCurrentForecast(forecastGeneration)) {
            return;
        }

        const allowed = await this._getBool('ai.weather.switches.allow_speech', false);
        if (!this._isCurrentForecast(forecastGeneration) || !allowed) {
            return;
        }

        const aiEnabled = await this._getBool('ai.enabled', false);
        if (!this._isCurrentForecast(forecastGeneration) || !aiEnabled) {
            return;
        }

        const enabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
        if (!this._isCurrentForecast(forecastGeneration) || !enabled) {
            return;
        }

        try {
            await this.adapter.setStateAsync('speech.queue', { val: text, ack: false });
            this.adapter.log.info('[aiForecastHelper] speech output started');
        } catch (err) {
            this.adapter.log.warn(`[aiForecastHelper] speech output error: ${err.message}`);
        }
    },

    // ---------------------------------------------------------------------
    // HILFSFUNKTIONEN
    // ---------------------------------------------------------------------
    _safeValue(v) {
        if (v == null) {
            return null;
        }
        const num = Number(v);
        return Number.isNaN(num) ? null : num;
    },

    _describeWeatherCode(code) {
        if (code == null) {
            return '';
        }

        const map = {
            0: 'klarer Himmel',
            1: 'überwiegend klar',
            2: 'teilweise bewölkt',
            3: 'bedeckt',

            45: 'Nebel',
            48: 'Nebel mit Reifansatz',

            51: 'leichter Sprühregen',
            53: 'mäßiger Sprühregen',
            55: 'starker Sprühregen',
            56: 'leichter gefrierender Sprühregen',
            57: 'starker gefrierender Sprühregen',

            61: 'leichter Regen',
            63: 'mäßiger Regen',
            65: 'starker Regen',
            66: 'leichter gefrierender Regen',
            67: 'starker gefrierender Regen',

            71: 'leichter Schneefall',
            73: 'mäßiger Schneefall',
            75: 'starker Schneefall',
            77: 'Schneegriesel',

            80: 'leichte Regenschauer',
            81: 'mäßige Regenschauer',
            82: 'starke Regenschauer',
            85: 'leichte Schneeschauer',
            86: 'starke Schneeschauer',

            95: 'Gewitter',
            96: 'Gewitter mit Hagel',
            99: 'starkes Gewitter mit Hagel',
        };

        return map[code] || `Wettercode ${code}`;
    },

    async _getBool(id, fallback) {
        try {
            const st = await this.adapter.getStateAsync(id);
            return st && st.val != null ? !!st.val : fallback;
        } catch {
            return fallback;
        }
    },

    async _getTimeOrDefault(id, def) {
        const state = await this.adapter.getStateAsync(id);
        const str = state?.val ?? def;

        const m = /^(\d{1,2}):(\d{2})$/.exec(String(str));
        if (!m) {
            const defM = /^(\d{1,2}):(\d{2})$/.exec(def);
            return { hour: Number(defM[1]), minute: Number(defM[2]) };
        }

        return {
            hour: Math.min(Math.max(Number(m[1]), 0), 23),
            minute: Math.min(Math.max(Number(m[2]), 0), 59),
        };
    },
});

module.exports = aiForecastHelper;

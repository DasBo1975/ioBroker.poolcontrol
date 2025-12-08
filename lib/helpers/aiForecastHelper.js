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

const https = require('https');

const aiForecastHelper = {
    adapter: null,
    timer: null,
    _debugMode: false,

    /**
     * Initialisiert den Forecast-Helper.
     *
     * @param {import('iobroker').Adapter} adapter
     */
    async init(adapter) {
        this.adapter = adapter;
        this.adapter.log.info('[aiForecastHelper] Initialisierung gestartet');

        await this._refreshTimer();

        // ----------------------------------------------------------
        // NEU: Sofortige Ausführung beim Adapterstart (wenn aktiviert)
        // ----------------------------------------------------------
        const enabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
        if (enabled) {
            this.adapter.log.info('[aiForecastHelper] Starte einmalige Sofort-Vorhersage (Adapterstart)');
            try {
                await this._runForecast();
            } catch (err) {
                this.adapter.log.warn(`[aiForecastHelper] Fehler bei Sofort-Vorhersage: ${err.message}`);
            }
        }

        this.adapter.log.info('[aiForecastHelper] Initialisierung abgeschlossen');
    },

    /**
     * Aufräumen beim Adapter-Stop.
     */
    cleanup() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.adapter && this.adapter.log.debug('[aiForecastHelper] Cleanup abgeschlossen');
    },

    /**
     * Reagiert auf State-Änderungen an switches + schedule.
     *
     * @param id
     * @param state
     */
    async handleStateChange(id, state) {
        if (!state || !this.adapter) {
            return;
        }

        // Von Adapter selbst gesetzt? → ignorieren
        if (state.from && state.from.startsWith(`system.adapter.${this.adapter.name}.`)) {
            return;
        }

        // Nur Ai-Weather-spezifische Änderungen beachten
        if (!id.includes('ai.weather.switches.') && !id.includes('ai.weather.schedule.')) {
            return;
        }

        // ----------------------------------------------------------
        // NEU: Sofortige Ausführung, wenn der Forecast aktiviert wird
        // ----------------------------------------------------------
        if (id.endsWith('ai.weather.switches.tomorrow_forecast_enabled') && state.val === true) {
            this.adapter.log.info('[aiForecastHelper] Forecast aktiviert → einmalige sofortige Ausführung');
            try {
                await this._runForecast();
            } catch (err) {
                this.adapter.log.warn(`[aiForecastHelper] Fehler bei Sofort-Ausführung: ${err.message}`);
            }
        }

        this.adapter.log.info(`[aiForecastHelper] Änderung erkannt: ${id} = ${state.val}`);
        await this._refreshTimer();
    },

    // ---------------------------------------------------------------------
    // TIMER-VERWALTUNG
    // ---------------------------------------------------------------------
    async _refreshTimer() {
        // alten Timer stoppen
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        const enabled = await this._getBool('ai.weather.switches.tomorrow_forecast_enabled', false);
        this._debugMode = await this._getBool('ai.weather.switches.debug_mode', false);

        if (!enabled) {
            this.adapter.log.info('[aiForecastHelper] Forecast deaktiviert – kein Timer aktiv');
            return;
        }

        const time = await this._getTimeOrDefault('ai.weather.schedule.tomorrow_forecast_time', '19:00');

        this.adapter.log.info(
            `[aiForecastHelper] Forecast-Timer gesetzt für ${time.hour}:${String(time.minute).padStart(2, '0')}`,
        );

        // minütlicher Check
        this.timer = setInterval(async () => {
            const now = new Date();
            if (now.getHours() === time.hour && now.getMinutes() === time.minute) {
                try {
                    await this._runForecast();
                } catch (err) {
                    this.adapter.log.warn(`[aiForecastHelper] Fehler im Timer: ${err.message}`);
                }
            }
        }, 60 * 1000);
    },

    // ---------------------------------------------------------------------
    // HAUPTFUNKTION – VORHERSAGE ERZEUGEN
    // ---------------------------------------------------------------------
    async _runForecast() {
        try {
            this.adapter.log.info('[aiForecastHelper] Erzeuge Vorhersage für morgen ...');

            const geo = await this._loadGeoLocation();
            if (!geo) {
                this.adapter.log.warn('[aiForecastHelper] Abbruch – keine Geodaten verfügbar');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!weather) {
                this.adapter.log.warn('[aiForecastHelper] Abbruch – keine Wetterdaten');
                return;
            }

            const text = this._buildForecastText(weather);

            await this._writeOutput('tomorrow_forecast', text);
            await this._maybeSpeak(text);

            this.adapter.log.info('[aiForecastHelper] Vorhersage für morgen erzeugt');
        } catch (err) {
            this.adapter.log.warn(`[aiForecastHelper] Fehler bei _runForecast(): ${err.message}`);
        }
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
                this.adapter.log.debug(`[aiForecastHelper] Geodaten: lat=${lat}, lon=${lon}`);
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
            this.adapter.log.debug(`[aiForecastHelper] Abruf: ${url}`);
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
                this.adapter.log.debug(`[aiForecastHelper] Output geschrieben: ai.weather.outputs.${id}`);
            }
        } catch (err) {
            this.adapter.log.error(`[aiForecastHelper] Fehler beim Schreiben eines Outputs (${id}): ${err.message}`);
        }
    },

    async _maybeSpeak(text) {
        const allowed = await this._getBool('ai.weather.switches.allow_speech', false);
        if (!allowed) {
            return;
        }

        try {
            await this.adapter.setStateAsync('speech.queue', { val: text, ack: false });
            this.adapter.log.info('[aiForecastHelper] Sprachausgabe gestartet');
        } catch (err) {
            this.adapter.log.warn(`[aiForecastHelper] Fehler bei Sprachausgabe: ${err.message}`);
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
            1: 'überwiegend sonnig',
            2: 'wechselhaft bewölkt',
            3: 'bedeckt',
            45: 'Nebel',
            48: 'Hochnebel',
            51: 'leichter Nieselregen',
            53: 'mäßiger Nieselregen',
            55: 'starker Nieselregen',
            61: 'leichter Regen',
            63: 'mäßiger Regen',
            65: 'starker Regen',
            80: 'Regenschauer',
            81: 'kräftige Schauer',
            82: 'Starkschauer',
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
};

module.exports = aiForecastHelper;

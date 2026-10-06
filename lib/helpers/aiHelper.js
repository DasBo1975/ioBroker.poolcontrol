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

const https = require('node:https');

const CATCHUP_TARGETS_STATE_ID = 'ai.weather.runtime.catchup_targets_json';

const AI_SUBSCRIPTION_IDS = [
    'ai.enabled',
    'ai.weather.switches.weather_advice_enabled',
    'ai.weather.switches.daily_summary_enabled',
    'ai.weather.switches.daily_pool_tips_enabled',
    'ai.weather.switches.weekend_summary_enabled',
    'ai.weather.switches.debug_mode',
    'ai.weather.switches.allow_speech',
    'ai.weather.schedule.weather_advice_time',
    'ai.weather.schedule.daily_summary_time',
    'ai.weather.schedule.daily_pool_tips_time',
    'ai.weather.schedule.weekend_summary_time',
];

const aiHelper = /** @satisfies {import('../types/poolcontrol-adapter').AiHelper} */ ({
    _adapter: null,
    _active: false,
    _lifecycleGeneration: 0,
    _refreshGeneration: 0,
    _moduleGenerations: {
        weatherAdvice: 0,
        dailySummary: 0,
        poolTips: 0,
        weekendSummary: 0,
        hourly: 0,
    },
    _scheduleGenerations: {
        weatherAdvice: 0,
        dailySummary: 0,
        poolTips: 0,
        weekendSummary: 0,
    },
    _outputGenerations: {
        weather_advice: 0,
        daily_summary: 0,
        pool_tips: 0,
        weekend_summary: 0,
    },
    _lastMessageGeneration: 0,
    _speechGeneration: 0,
    _catchupTargets: {},
    _masterEnabled: false,
    _debugGeneration: 0,
    _moduleEnabled: {
        weatherAdvice: false,
        dailySummary: false,
        poolTips: false,
        weekendSummary: false,
    },
    timers: [],
    _lastScheduleValues: {}, // NEU: merkt sich letzte Zeitwerte
    _debugMode: false,

    _adapterStartedAt: Date.now(), // FIX: Zeitpunkt des Adapterstarts

    // Anti-Spam-Level (merkt sich letzte Warnungen)
    _lastPoolTipCode: null,
    _lastPoolTipWindLevel: null,
    _lastPoolTipTimestamp: 0,

    /** Initialized adapter instance retained for pending asynchronous work. */
    get adapter() {
        if (!this._adapter) {
            throw new Error('aiHelper used before init()');
        }

        return this._adapter;
    },

    /**
     * Initialisiert den AI-Helper (Timer + Grundkonfiguration).
     *
     * @param {import('../types/poolcontrol-adapter').PoolControlAdapter} adapter
     */
    async init(adapter) {
        this._adapter = adapter;
        this._active = true;
        ++this._lifecycleGeneration;
        this._adapterStartedAt = Date.now();
        this.adapter.log.info('[aiHelper] initialization started');

        this._subscribeStates();
        await this._loadCatchupTargets();
        if (!this._active) {
            return;
        }

        await this._refreshTimers();

        if (this._active) {
            this.adapter.log.info('[aiHelper] initialization finished');
        }
    },

    /** Subscribe to the eleven states that control aiHelper. */
    _subscribeStates() {
        for (const id of AI_SUBSCRIPTION_IDS) {
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
        ++this._lifecycleGeneration;
        ++this._refreshGeneration;
        this._invalidateAllWork();
        this._clearTimers();
        this.adapter.log.debug('[aiHelper] cleanup finished (timers stopped)');
    },

    /**
     * Reagiert auf State-Änderungen (ai.switches.*, ai.schedule.*),
     * damit Schalter und Zeiten ohne Neustart wirksam werden.
     *
     * @param {string} id
     * @param {ioBroker.State | null} state
     */
    async handleStateChange(id, state) {
        if (!this._active || !state) {
            return;
        }

        // Änderungen vom Adapter selbst ignorieren
        if (state.from && state.from.startsWith(`system.adapter.${this.adapter.name}.`)) {
            return;
        }

        const module = this._moduleFromStateId(id);
        const isMaster = id.endsWith('ai.enabled');
        const isDebug = id.endsWith('ai.weather.switches.debug_mode');
        const isSpeech = id.endsWith('ai.weather.switches.allow_speech');
        const isSchedule = id.includes('.ai.weather.schedule.') && module !== null;
        const isModuleSwitch = id.includes('.ai.weather.switches.') && module !== null;

        if (!isMaster && !isDebug && !isSpeech && !isSchedule && !isModuleSwitch) {
            return;
        }

        if (isDebug) {
            ++this._debugGeneration;
            this._debugMode = state.val === true;
            return;
        }

        if (isSpeech) {
            ++this._speechGeneration;
            return;
        }

        if (isMaster) {
            this._masterEnabled = state.val === true;
            this.adapter.log.info(`[aiHelper] master changed: ${id} = ${state.val} - rebuilding timers`);

            if (!this._masterEnabled) {
                ++this._lifecycleGeneration;
                this._invalidateAllWork();
            }

            await this._refreshTimers();
            return;
        }

        if (isModuleSwitch && module) {
            this._moduleEnabled[module] = state.val === true;
            ++this._moduleGenerations[module];
            this.adapter.log.info(`[aiHelper] switch changed: ${id} = ${state.val} - rebuilding timers`);
            await this._refreshTimers();
            return;
        }

        if (isSchedule && module) {
            const oldVal = this._lastScheduleValues[id];
            const newVal = state.val;
            const lifecycleGeneration = this._lifecycleGeneration;
            const scheduleGeneration = ++this._scheduleGenerations[module];
            const moduleGeneration = this._moduleGenerations[module];

            this.adapter.log.info(`[aiHelper] time changed: ${id}: ${oldVal || '(no previous value)'} -> ${newVal}`);
            this._lastScheduleValues[id] = newVal;
            await this._refreshTimers();

            await new Promise(resolve => {
                this.adapter.setTimeout(() => resolve(undefined), 1500);
            });

            if (!this._isScheduleChangeCurrent(module, lifecycleGeneration, scheduleGeneration, moduleGeneration)) {
                return;
            }

            const aiEnabled = await this._getBool('ai.enabled', false);
            if (
                !aiEnabled ||
                !this._isScheduleChangeCurrent(module, lifecycleGeneration, scheduleGeneration, moduleGeneration)
            ) {
                return;
            }

            const moduleEnabled = await this._getBool(this._moduleSwitchId(module), false);
            if (
                !moduleEnabled ||
                !this._isScheduleChangeCurrent(module, lifecycleGeneration, scheduleGeneration, moduleGeneration)
            ) {
                return;
            }

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
                            `[aiHelper] new time is still in the future today -> running module immediately (${id})`,
                        );
                        await this._runModule(module);
                    }
                }
            } catch (e) {
                this.adapter.log.warn(`[aiHelper] error during immediate run after time change: ${e.message}`);
            }

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
            this.adapter.clearInterval(t);
        }
        this.timers = [];
    },

    /** Invalidate all pending module, output, last-message, and speech work. */
    _invalidateAllWork() {
        ++this._moduleGenerations.weatherAdvice;
        ++this._moduleGenerations.dailySummary;
        ++this._moduleGenerations.poolTips;
        ++this._moduleGenerations.weekendSummary;
        ++this._moduleGenerations.hourly;
        ++this._scheduleGenerations.weatherAdvice;
        ++this._scheduleGenerations.dailySummary;
        ++this._scheduleGenerations.poolTips;
        ++this._scheduleGenerations.weekendSummary;
        ++this._outputGenerations.weather_advice;
        ++this._outputGenerations.daily_summary;
        ++this._outputGenerations.pool_tips;
        ++this._outputGenerations.weekend_summary;
        ++this._lastMessageGeneration;
        ++this._speechGeneration;
    },

    /**
     * Check whether a timer refresh may still install timers.
     *
     * @param lifecycleGeneration
     * @param refreshGeneration
     */
    _isRefreshCurrent(lifecycleGeneration, refreshGeneration) {
        return (
            this._active &&
            lifecycleGeneration === this._lifecycleGeneration &&
            refreshGeneration === this._refreshGeneration
        );
    },

    /**
     * Liest alle relevanten States und baut die Timer neu auf.
     */
    async _refreshTimers() {
        const lifecycleGeneration = this._lifecycleGeneration;
        const refreshGeneration = ++this._refreshGeneration;
        this._clearTimers();

        const aiEnabled = await this._getBool('ai.enabled', false);
        if (!this._isRefreshCurrent(lifecycleGeneration, refreshGeneration)) {
            return;
        }
        this._masterEnabled = aiEnabled;

        const debugGeneration = this._debugGeneration;
        const debugMode = await this._getBool('ai.weather.switches.debug_mode', false);
        if (!this._isRefreshCurrent(lifecycleGeneration, refreshGeneration)) {
            return;
        }
        if (debugGeneration === this._debugGeneration) {
            this._debugMode = debugMode;
        }

        if (!aiEnabled) {
            this.adapter.log.info('[aiHelper] AI is disabled (ai.enabled = false) - no timers active');
            return;
        }

        this.adapter.log.info('[aiHelper] AI is enabled - setting timers');

        if (
            !(await this._configureDailyTimer(
                'weatherAdvice',
                'ai.weather.schedule.weather_advice_time',
                '08:00',
                lifecycleGeneration,
                refreshGeneration,
            ))
        ) {
            return;
        }

        if (
            !(await this._configureDailyTimer(
                'dailySummary',
                'ai.weather.schedule.daily_summary_time',
                '09:00',
                lifecycleGeneration,
                refreshGeneration,
            ))
        ) {
            return;
        }

        if (
            !(await this._configureDailyTimer(
                'poolTips',
                'ai.weather.schedule.daily_pool_tips_time',
                '10:00',
                lifecycleGeneration,
                refreshGeneration,
            ))
        ) {
            return;
        }

        if (
            !(await this._configureDailyTimer(
                'weekendSummary',
                'ai.weather.schedule.weekend_summary_time',
                '18:00',
                lifecycleGeneration,
                refreshGeneration,
            ))
        ) {
            return;
        }

        if (!this._isRefreshCurrent(lifecycleGeneration, refreshGeneration) || !this._masterEnabled) {
            return;
        }

        this.adapter.log.debug('[aiHelper] setting hourly weather update timer');

        const hourlyTimer = this.adapter.setInterval(
            async () => {
                if (this._isRefreshCurrent(lifecycleGeneration, refreshGeneration) && this._masterEnabled) {
                    await this._runHourlyUpdate();
                }
            },
            60 * 60 * 1000,
        ); // 1 Stunde

        this.timers.push(hourlyTimer);
    },

    /**
     * Load one regular module configuration and install its daily timer when enabled.
     *
     * @param module
     * @param scheduleId
     * @param defaultTime
     * @param lifecycleGeneration
     * @param refreshGeneration
     */
    async _configureDailyTimer(module, scheduleId, defaultTime, lifecycleGeneration, refreshGeneration) {
        const enabled = await this._getBool(this._moduleSwitchId(module), false);
        if (!this._isRefreshCurrent(lifecycleGeneration, refreshGeneration)) {
            return false;
        }
        this._moduleEnabled[module] = enabled;

        if (!enabled) {
            return true;
        }

        const time = await this._getTimeOrDefault(scheduleId, defaultTime);
        if (!this._isRefreshCurrent(lifecycleGeneration, refreshGeneration)) {
            return false;
        }

        this._createDailyTimer(module, time, lifecycleGeneration, refreshGeneration);
        this.adapter.log.debug(
            `[aiHelper] ${module} timer set for ${time.hour}:${String(time.minute).padStart(2, '0')}`,
        );
        return true;
    },

    /**
     * Erzeugt einen täglichen Timer für HH:MM (lokale Zeit).
     * Prüft minütlich, ob die Zeit erreicht ist.
     *
     * @param {import('../types/poolcontrol-adapter').AiRegularModule} module
     * @param {import('../types/poolcontrol-adapter').AiTime} timeObj
     * @param {number} lifecycleGeneration
     * @param {number} refreshGeneration
     */
    _createDailyTimer(module, timeObj, lifecycleGeneration, refreshGeneration) {
        const { hour, minute } = timeObj;
        const moduleGeneration = this._moduleGenerations[module];
        const scheduleGeneration = this._scheduleGenerations[module];
        const timer = this.adapter.setInterval(async () => {
            if (
                !this._isTimerCurrent(
                    module,
                    lifecycleGeneration,
                    refreshGeneration,
                    moduleGeneration,
                    scheduleGeneration,
                )
            ) {
                return;
            }

            const now = new Date();
            const diffMinutes = now.getHours() * 60 + now.getMinutes() - (hour * 60 + minute);
            const adapterUptimeMs = Date.now() - this._adapterStartedAt;
            const isNormalExecution = diffMinutes === 0;
            const isCatchup = adapterUptimeMs <= 3 * 60 * 1000 && diffMinutes > 0 && diffMinutes <= 2;

            if (!isNormalExecution && !isCatchup) {
                return;
            }

            const targetKey = this._buildTargetKey(now, timeObj);
            const timerContext = {
                module,
                lifecycleGeneration,
                refreshGeneration,
                moduleGeneration,
                scheduleGeneration,
            };
            const claimed = await this._claimScheduledTarget(module, targetKey, timerContext);
            if (!claimed) {
                return;
            }

            try {
                if (isCatchup) {
                    this.adapter.log.info('[aiHelper] catch-up executed (within the first 3 minutes after start)');
                } else {
                    this.adapter.log.debug(
                        `[aiHelper] timer triggered: ${hour}:${String(minute).padStart(2, '0')} -> running callback`,
                    );
                }

                await this._runModule(module);
            } catch (err) {
                if (isCatchup) {
                    this.adapter.log.warn(`[aiHelper] catch-up error: ${err.message}`);
                } else {
                    this.adapter.log.warn(`[aiHelper] timer callback error: ${err.message}`);
                }
            }
        }, 60 * 1000); // jede Minute prüfen

        this.timers.push(timer);
    },

    /**
     * Check whether a daily timer callback still belongs to the active configuration.
     *
     * @param module
     * @param lifecycleGeneration
     * @param refreshGeneration
     * @param moduleGeneration
     * @param scheduleGeneration
     */
    _isTimerCurrent(module, lifecycleGeneration, refreshGeneration, moduleGeneration, scheduleGeneration) {
        return (
            this._isRefreshCurrent(lifecycleGeneration, refreshGeneration) &&
            this._masterEnabled &&
            this._moduleEnabled[module] &&
            moduleGeneration === this._moduleGenerations[module] &&
            scheduleGeneration === this._scheduleGenerations[module]
        );
    },

    /**
     * Build the local per-day target key used by normal and catch-up execution.
     *
     * @param now
     * @param timeObj
     */
    _buildTargetKey(now, timeObj) {
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(timeObj.hour).padStart(2, '0');
        const minute = String(timeObj.minute).padStart(2, '0');
        return `${year}-${month}-${day}@${hour}:${minute}`;
    },

    /** Load the restart-safe catch-up target map. */
    async _loadCatchupTargets() {
        try {
            const state = await this.adapter.getStateAsync(CATCHUP_TARGETS_STATE_ID);
            if (!this._active || typeof state?.val !== 'string') {
                return;
            }

            const parsed = JSON.parse(state.val);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return;
            }

            const targets = {
                weatherAdvice: Array.isArray(parsed.weatherAdvice)
                    ? parsed.weatherAdvice.filter(target => typeof target === 'string')
                    : undefined,
                dailySummary: Array.isArray(parsed.dailySummary)
                    ? parsed.dailySummary.filter(target => typeof target === 'string')
                    : undefined,
                poolTips: Array.isArray(parsed.poolTips)
                    ? parsed.poolTips.filter(target => typeof target === 'string')
                    : undefined,
                weekendSummary: Array.isArray(parsed.weekendSummary)
                    ? parsed.weekendSummary.filter(target => typeof target === 'string')
                    : undefined,
            };
            this._catchupTargets = targets;
        } catch {
            this._catchupTargets = {};
        }
    },

    /**
     * Persistently claim a normal or catch-up target before its module is executed.
     *
     * @param module
     * @param targetKey
     * @param timerContext
     */
    async _claimScheduledTarget(module, targetKey, timerContext) {
        if (
            !this._isTimerCurrent(
                module,
                timerContext.lifecycleGeneration,
                timerContext.refreshGeneration,
                timerContext.moduleGeneration,
                timerContext.scheduleGeneration,
            )
        ) {
            return false;
        }

        const previousTargets = this._catchupTargets[module] || [];
        if (previousTargets.includes(targetKey)) {
            return false;
        }

        const targetDay = targetKey.slice(0, 10);
        this._catchupTargets[module] = previousTargets
            .filter(previousTarget => previousTarget.startsWith(`${targetDay}@`))
            .concat(targetKey);

        try {
            await this.adapter.setStateAsync(CATCHUP_TARGETS_STATE_ID, {
                val: JSON.stringify(this._catchupTargets),
                ack: true,
            });
        } catch (err) {
            if (previousTargets.length === 0) {
                delete this._catchupTargets[module];
            } else {
                this._catchupTargets[module] = previousTargets;
            }
            this.adapter.log.warn(`[aiHelper] could not persist scheduled target: ${err.message}`);
            return false;
        }

        return this._isTimerCurrent(
            module,
            timerContext.lifecycleGeneration,
            timerContext.refreshGeneration,
            timerContext.moduleGeneration,
            timerContext.scheduleGeneration,
        );
    },

    /**
     * Resolve a regular aiHelper module from one of its switch or schedule state ids.
     *
     * @param id
     */
    _moduleFromStateId(id) {
        if (id.endsWith('weather_advice_enabled') || id.endsWith('weather_advice_time')) {
            return 'weatherAdvice';
        }
        if (id.endsWith('daily_summary_enabled') || id.endsWith('daily_summary_time')) {
            return 'dailySummary';
        }
        if (id.endsWith('daily_pool_tips_enabled') || id.endsWith('daily_pool_tips_time')) {
            return 'poolTips';
        }
        if (id.endsWith('weekend_summary_enabled') || id.endsWith('weekend_summary_time')) {
            return 'weekendSummary';
        }
        return null;
    },

    /**
     * Return the enable-state id for a regular module.
     *
     * @param module
     */
    _moduleSwitchId(module) {
        if (module === 'weatherAdvice') {
            return 'ai.weather.switches.weather_advice_enabled';
        }
        if (module === 'dailySummary') {
            return 'ai.weather.switches.daily_summary_enabled';
        }
        if (module === 'poolTips') {
            return 'ai.weather.switches.daily_pool_tips_enabled';
        }
        return 'ai.weather.switches.weekend_summary_enabled';
    },

    /**
     * Check authorization after the delayed schedule-change continuation.
     *
     * @param module
     * @param lifecycleGeneration
     * @param scheduleGeneration
     * @param moduleGeneration
     */
    _isScheduleChangeCurrent(module, lifecycleGeneration, scheduleGeneration, moduleGeneration) {
        return (
            this._active &&
            this._masterEnabled &&
            this._moduleEnabled[module] &&
            lifecycleGeneration === this._lifecycleGeneration &&
            scheduleGeneration === this._scheduleGenerations[module] &&
            moduleGeneration === this._moduleGenerations[module]
        );
    },

    /**
     * Execute the selected regular module without coupling unrelated modules.
     *
     * @param module
     */
    async _runModule(module) {
        if (module === 'weatherAdvice') {
            await this._runWeatherAdvice();
        } else if (module === 'dailySummary') {
            await this._runDailySummary();
        } else if (module === 'poolTips') {
            await this._runDailyPoolTips();
        } else {
            await this._runWeekendSummary();
        }
    },

    /**
     * Claim latest-started ownership for one output.
     *
     * @param module
     * @param output
     */
    _beginRun(module, output) {
        if (!this._active || !this._masterEnabled) {
            return null;
        }
        if (module !== 'hourly' && !this._moduleEnabled[module]) {
            return null;
        }

        return {
            module,
            output,
            lifecycleGeneration: this._lifecycleGeneration,
            moduleGeneration: this._moduleGenerations[module],
            outputGeneration: ++this._outputGenerations[output],
        };
    },

    /**
     * Check whether a run still owns its output and remains authorized.
     *
     * @param runContext
     */
    _isRunAuthorized(runContext) {
        return (
            this._active &&
            this._masterEnabled &&
            runContext.lifecycleGeneration === this._lifecycleGeneration &&
            runContext.moduleGeneration === this._moduleGenerations[runContext.module] &&
            runContext.outputGeneration === this._outputGenerations[runContext.output] &&
            (runContext.module === 'hourly' || this._moduleEnabled[runContext.module])
        );
    },

    // ---------------------------------------------------------------------
    // Hauptfunktionen – Module
    // ---------------------------------------------------------------------

    /**
     * 1) Wetterhinweise (ai.outputs.weather_advice)
     */
    async _runWeatherAdvice() {
        const runContext = this._beginRun('weatherAdvice', 'weather_advice');
        if (!runContext) {
            return;
        }

        try {
            const geo = await this._loadGeoLocation();
            if (!geo) {
                this.adapter.log.info('[aiHelper] weather advice aborted - no geo data available');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!weather) {
                this.adapter.log.info('[aiHelper] weather advice aborted - no weather data available');
                return;
            }

            const text = this._buildWeatherAdviceText(weather);
            const published = await this._writeOutput('weather_advice', text, runContext);
            if (published) {
                await this._maybeSpeak(text, runContext);
            }

            this.adapter.log.info('[aiHelper] new weather advice created');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] error in _runWeatherAdvice(): ${err.message}`);
        }
    },

    /**
     * 2) Tägliche Zusammenfassung (ai.outputs.daily_summary)
     */
    async _runDailySummary() {
        const runContext = this._beginRun('dailySummary', 'daily_summary');
        if (!runContext) {
            return;
        }

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

            const published = await this._writeOutput('daily_summary', text, runContext);
            if (published) {
                await this._maybeSpeak(text, runContext);
            }

            this.adapter.log.info('[aiHelper] new daily summary created');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] error in _runDailySummary(): ${err.message}`);
        }
    },

    /**
     * 3) Tägliche Pool-Tipps (ai.outputs.pool_tips)
     */
    async _runDailyPoolTips() {
        const runContext = this._beginRun('poolTips', 'pool_tips');
        if (!runContext) {
            return;
        }

        try {
            const geo = await this._loadGeoLocation();
            const weather = geo ? await this._fetchWeather(geo.lat, geo.lon) : null;
            const seasonActive = await this._getBool('status.season_active', false);

            const text = this._buildPoolTipsText(weather, seasonActive);

            const published = await this._writeOutput('pool_tips', text, runContext);
            if (published) {
                await this._maybeSpeak(text, runContext);
            }

            this.adapter.log.info('[aiHelper] new pool tips created');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] error in _runDailyPoolTips(): ${err.message}`);
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
                this.adapter.log.info('[aiHelper] weekend summary skipped - today is neither Friday nor Saturday');
                return;
            }

            const runContext = this._beginRun('weekendSummary', 'weekend_summary');
            if (!runContext) {
                return;
            }

            const geo = await this._loadGeoLocation();
            const weather = geo ? await this._fetchWeather(geo.lat, geo.lon) : null;
            const seasonActive = await this._getBool('status.season_active', false);

            const text = this._buildWeekendSummaryText(weather, seasonActive, weekday);

            const published = await this._writeOutput('weekend_summary', text, runContext);
            if (published) {
                await this._maybeSpeak(text, runContext);
            }

            this.adapter.log.info('[aiHelper] new weekend summary created');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] error in _runWeekendSummary(): ${err.message}`);
        }
    },

    /** Run the historical hourly snapshot update for weather advice and pool tips. */
    async _runHourlyUpdate() {
        const weatherContext = this._beginRun('hourly', 'weather_advice');
        const poolTipsContext = this._beginRun('hourly', 'pool_tips');
        if (!weatherContext || !poolTipsContext) {
            return;
        }

        try {
            const geo = await this._loadGeoLocation();
            if (!geo) {
                this.adapter.log.info('[aiHelper] weather update aborted - no geo data available');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!weather) {
                this.adapter.log.info('[aiHelper] weather update aborted - no weather data available');
                return;
            }

            const weatherText = this._buildWeatherAdviceText(weather);
            await this._writeOutput('weather_advice', weatherText, weatherContext);

            const seasonActive = await this._getBool('status.season_active', false);
            const poolTipsText = this._buildPoolTipsText(weather, seasonActive);
            await this._writeOutput('pool_tips', poolTipsText, poolTipsContext);

            if (this._debugMode && (this._isRunAuthorized(weatherContext) || this._isRunAuthorized(poolTipsContext))) {
                this.adapter.log.debug('[aiHelper] hourly weather update completed (weather + pool tips)');
            }
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] error during hourly weather update: ${err.message}`);
        }
    },

    //--------------------------------------------------------
    // NEU: Stündliches Wetter-Update als eigene Funktion
    //--------------------------------------------------------
    async _runWeatherAutoUpdate() {
        const runContext = this._beginRun('hourly', 'weather_advice');
        if (!runContext) {
            return;
        }

        try {
            const geo = await this._loadGeoLocation();
            if (!geo) {
                this.adapter.log.info('[aiHelper] auto weather update aborted - no geo data available');
                return;
            }

            const weather = await this._fetchWeather(geo.lat, geo.lon);
            if (!weather) {
                this.adapter.log.info('[aiHelper] auto weather update aborted - no weather data available');
                return;
            }

            // WeatherAdvice aktualisieren
            const text = this._buildWeatherAdviceText(weather);
            await this._writeOutput('weather_advice', text, runContext);

            if (this._debugMode) {
                this.adapter.log.debug('[aiHelper] auto weather update completed successfully');
            }
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] error during auto weather update: ${err.message}`);
        }
    },

    // ---------------------------------------------------------------------
    // Geodaten + Wetter
    // ---------------------------------------------------------------------

    /**
     * Lädt Geokoordinaten korrekt aus system.config.
     *
     * @returns {Promise<{lat:number,lon:number}|null>}
     */
    async _loadGeoLocation() {
        try {
            const obj = await this.adapter.getForeignObjectAsync('system.config');
            if (!obj || !obj.common) {
                this.adapter.log.warn('[aiHelper] could not load system.config');
                return null;
            }

            const lat = Number(obj.common.latitude);
            const lon = Number(obj.common.longitude);

            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                this.adapter.log.warn('[aiHelper] invalid geo data - please set it in Admin under System/Location');
                return null;
            }

            if (this._debugMode) {
                this.adapter.log.debug(`[aiHelper] geo data loaded: lat=${lat}, lon=${lon}`);
            }

            return { lat, lon };
        } catch (err) {
            this.adapter.log.error(`[aiHelper] error loading geo data: ${err.message}`);
            return null;
        }
    },

    /**
     * Ruft Wetterdaten von Open-Meteo ab.
     *
     * @param {number} lat
     * @param {number} lon
     * @returns {Promise<import('../types/poolcontrol-adapter').AiWeather|null>}
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
            this.adapter.log.debug(`[aiHelper] fetching weather data: ${url}`);
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
                                    this.adapter.log.warn('[aiHelper] weather request: received empty response');
                                    return resolve(null);
                                }
                                const json = JSON.parse(data);
                                resolve(json);
                            } catch (err) {
                                this.adapter.log.warn(`[aiHelper] error parsing weather data: ${err.message}`);
                                resolve(null);
                            }
                        });
                    })
                    .on('error', err => {
                        this.adapter.log.warn(`[aiHelper] weather request error: ${err.message}`);
                        resolve(null);
                    });
            } catch (err) {
                this.adapter.log.warn(`[aiHelper] unexpected weather request error: ${err.message}`);
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
     * @param {import('../types/poolcontrol-adapter').AiWeather|null} weather
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
     * @param {import('../types/poolcontrol-adapter').AiDailySummaryContext} ctx
     * @returns {string}
     */
    _buildDailySummaryText(ctx) {
        const { weather, seasonActive, pumpOn, pumpMode, surfaceTemp } = ctx || {};

        const parts = [seasonActive ? 'Die Poolsaison ist aktuell AKTIV.' : 'Die Poolsaison ist aktuell NICHT aktiv.'];

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
     * @param {import('../types/poolcontrol-adapter').AiWeather|null} weather
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
     * @param {import('../types/poolcontrol-adapter').AiWeather|null} weather
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
        let idxSat = 1;
        let idxSun = 2;

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
     * @param {import('../types/poolcontrol-adapter').AiOutputId} id
     * @param {string} text
     * @param {import('../types/poolcontrol-adapter').AiRunContext} runContext
     * @returns {Promise<boolean>}
     */
    async _writeOutput(id, text, runContext) {
        if (!text) {
            text = 'Keine Textausgabe verfügbar.';
        }

        if (!this._isRunAuthorized(runContext)) {
            return false;
        }

        try {
            await this.adapter.setStateAsync(`ai.weather.outputs.${id}`, { val: text, ack: true });
        } catch (err) {
            this.adapter.log.error(`[aiHelper] error writing output (${id}): ${err.message}`);
            return false;
        }

        if (!this._isRunAuthorized(runContext)) {
            return false;
        }

        const lastMessageGeneration = ++this._lastMessageGeneration;
        if (this._isRunAuthorized(runContext) && lastMessageGeneration === this._lastMessageGeneration) {
            try {
                await this.adapter.setStateAsync('ai.weather.outputs.last_message', { val: text, ack: true });
            } catch (err) {
                this.adapter.log.error(`[aiHelper] error writing output (${id}): ${err.message}`);
            }
        }

        if (!this._isRunAuthorized(runContext)) {
            return false;
        }

        if (this._debugMode) {
            this.adapter.log.debug(`[aiHelper] output written -> ai.weather.outputs.${id}: ${text}`);
        }
        return true;
    },

    /**
     * Optional: sendet Text an speech.queue, wenn erlaubt.
     *
     * @param {string} text
     * @param {import('../types/poolcontrol-adapter').AiRunContext} runContext
     */
    async _maybeSpeak(text, runContext) {
        if (!text || !this._isRunAuthorized(runContext)) {
            return;
        }

        const speechGeneration = this._speechGeneration;
        const allowSpeech = await this._getBool('ai.weather.switches.allow_speech', false);
        if (!allowSpeech || speechGeneration !== this._speechGeneration || !this._isRunAuthorized(runContext)) {
            if (this._debugMode) {
                this.adapter.log.debug('[aiHelper] speech output disabled (ai.weather.switches.allow_speech = false)');
            }
            return;
        }

        try {
            if (speechGeneration !== this._speechGeneration || !this._isRunAuthorized(runContext)) {
                return;
            }
            await this.adapter.setStateAsync('speech.queue', { val: text, ack: false });
            this.adapter.log.info('[aiHelper] text sent to speech.queue');
        } catch (err) {
            this.adapter.log.warn(`[aiHelper] speech output error: ${err.message}`);
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
        this.adapter.log.debug(`[aiHelper] time loaded: ${id} = "${str}" (default: ${def})`);

        const match = /^(\d{1,2}):(\d{2})$/.exec(str || '');
        let hour = 0;
        let minute = 0;

        if (!match) {
            this.adapter.log.warn(`[aiHelper] invalid time format in ${id}: "${str}" - using default ${def}`);
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
});

module.exports = aiHelper;

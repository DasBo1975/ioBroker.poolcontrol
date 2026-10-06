/**
 * ioBroker adapter instance with a helper-specific config subset.
 */
export type PoolControlAdapter<Config extends object = object> = ioBroker.Adapter & {
    /** Adapter configuration augmented by helper-specific fields when present. */
    config: ioBroker.AdapterConfig & Partial<Config>;
};

/** Configuration fields used to initialize general PoolControl states. */
export interface GeneralStateConfig {
    /** Display name of the pool. */
    pool_name: string;

    /** Pool volume in liters. */
    pool_size: number;

    /** Initial minimum number of daily pool circulations. */
    min_circulation_per_day: number;
}

/** Adapter instance used while creating general PoolControl states. */
export type GeneralStateAdapter = PoolControlAdapter<GeneralStateConfig>;

/** Configuration fields used to initialize pump states. */
export interface PumpStateConfig {
    /** Rated maximum pump power in watts. */
    pump_max_watt: number;

    /** Rated pump flow in liters per hour. */
    pump_power_lph: number;

    /** Whether frost protection is initially enabled. */
    frost_protection_active: boolean;

    /** Initial frost protection temperature in degrees Celsius. */
    frost_protection_temp: number;

    /** Whether safety functions are initially enabled in manual mode. */
    manual_safety_enabled: boolean;
}

/** Adapter instance used while creating pump states. */
export type PumpStateAdapter = PoolControlAdapter<PumpStateConfig>;

/** Configuration fields used by the primary pump helper. */
export interface PumpHelperConfig {
    /** Foreign state id used to switch the physical pump. */
    pump_switch?: string;

    /** Foreign state id containing the measured pump power. */
    pump_current_power_id?: string;
}

/** Adapter instance used by the primary pump helper. */
export type PumpHelperAdapter = PoolControlAdapter<PumpHelperConfig>;

/** Configuration fields used to initialize solar states. */
export interface SolarStateConfig {
    /** Whether solar control is initially enabled. */
    solar_control_active: boolean;

    /** Whether solar hysteresis is initially enabled. */
    solar_hysteresis_active: boolean;

    /** Initial solar switch-on temperature in degrees Celsius. */
    solar_temp_on: number;

    /** Initial solar switch-off temperature in degrees Celsius. */
    solar_temp_off: number;

    /** Whether collector temperature warnings are initially enabled. */
    solar_collector_warn_active: boolean;

    /** Initial collector warning temperature in degrees Celsius. */
    solar_collector_warn_temp: number;

    /** Whether collector warnings initially trigger speech output. */
    solar_collector_warn_speech: boolean;
}

/** Adapter instance used while creating solar states. */
export type SolarStateAdapter = PoolControlAdapter<SolarStateConfig>;

/** Configuration fields used to initialize heating states. */
export interface HeatStateConfig {
    /** Whether automatic heating control is initially enabled. */
    heat_control_active: boolean;

    /** Configured heating actuator mode. */
    heat_control_type: 'socket' | 'boolean';

    /** Foreign object id used to control the heating actuator. */
    heat_control_object_id: string;

    /** Initial pool target temperature in degrees Celsius. */
    heat_temp_target: number;

    /** Initial maximum pool temperature in degrees Celsius. */
    heat_temp_max: number;
}

/** Adapter instance used while creating heating states. */
export type HeatStateAdapter = PoolControlAdapter<HeatStateConfig>;

/** Configuration fields used to initialize speech states. */
export interface SpeechStateConfig {
    /** Whether speech output is initially enabled. */
    speech_active: boolean;
}

/** Adapter instance used while creating speech states. */
export type SpeechStateAdapter = PoolControlAdapter<SpeechStateConfig>;

/** Configuration fields used by the speech output helper. */
export interface SpeechHelperConfig {
    /** Whether pump errors should trigger speech output. */
    speech_include_errors: boolean;

    /** Pool temperature threshold for announcements in degrees Celsius. */
    speech_temp_threshold: number;

    /** Whether Alexa speech output is enabled. */
    speech_alexa_enabled: boolean;

    /** Foreign Alexa device state id used for speech output. */
    speech_alexa_device: string;

    /** Whether Telegram speech output is enabled. */
    speech_telegram_enabled: boolean;

    /** Telegram adapter instance receiving speech messages. */
    speech_telegram_instance: string;

    /** Comma-separated Telegram recipients, or an empty string for all users. */
    speech_telegram_users: string;

    /** Whether email speech output is enabled. */
    speech_email_enabled: boolean;

    /** Email adapter instance receiving speech messages. */
    speech_email_instance: string;

    /** Recipient address for speech emails. */
    speech_email_recipient: string;

    /** Subject used for speech emails. */
    speech_email_subject: string;
}

/** Adapter instance used by the speech output helper. */
export type SpeechHelperAdapter = PoolControlAdapter<SpeechHelperConfig>;

/** Configuration fields used by the consumption helper. */
export interface ConsumptionHelperConfig {
    /** Foreign state id containing the cumulative energy meter value. */
    external_energy_total_id: string;

    /** Electricity price in euros per kilowatt-hour. */
    energy_price_eur_kwh: number | string;
}

/** Adapter instance used by the consumption helper. */
export type ConsumptionHelperAdapter = PoolControlAdapter<ConsumptionHelperConfig>;

/** Configuration fields used by the runtime helper. */
export interface RuntimeHelperConfig {
    /** Configured minimum daily pool circulation factor. */
    min_circulation_per_day: number;
}

/** Adapter instance used by the runtime helper. */
export type RuntimeHelperAdapter = PoolControlAdapter<RuntimeHelperConfig>;

/** Configuration fields used to initialize status states. */
export interface StatusStateConfig {
    /** Whether the pool season is initially active. */
    season_active: boolean;
}

/** Adapter instance used while creating status states. */
export type StatusStateAdapter = PoolControlAdapter<StatusStateConfig>;

/**
 * Configuration fields used by the photovoltaic helper.
 */
export interface PhotovoltaicConfig {
    /** Foreign state id containing the current PV generation in watts. */
    power_generated_id?: string;

    /** Foreign state id containing the current house consumption in watts. */
    power_house_id?: string;

    /** Fallback surplus threshold in watts if the runtime state is not available. */
    threshold_w?: number | string;
}

/**
 * Adapter instance as used by the photovoltaic helper.
 */
export type PhotovoltaicAdapter = PoolControlAdapter<PhotovoltaicConfig>;

/** Configuration fields used by photovoltaic insight calculations. */
export interface PhotovoltaicInsightsConfig {
    /** Electricity price in euros per kilowatt-hour. */
    energy_price_eur_kwh: number;
}

/** Adapter instance used by the photovoltaic insights helper. */
export type PhotovoltaicInsightsAdapter = PoolControlAdapter<PhotovoltaicInsightsConfig>;

/**
 * Runtime shape of the frost protection scheduler helper.
 */
export interface FrostHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper currently accepts evaluations and actuator work. */
    _active: boolean;

    /** Active periodic frost check, or null while the scheduler is stopped. */
    checkTimer: ReturnType<PoolControlAdapter['setInterval']> | null;

    /** Pump mode that was active before frost protection took ownership. */
    _prevModeBeforeFrost: ioBroker.StateValue;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Start periodic frost checks with an initialized adapter. */
    init(adapter: PoolControlAdapter): void;

    /** Replace the active interval and immediately run one frost check. */
    _scheduleCheck(): void;

    /** Re-evaluate frost safety when a policy state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Evaluate temperatures and update frost-related pump states. */
    _checkFrost(): Promise<void>;

    /** Stop and release a frost-owned pump request without touching foreign ownership. */
    _stopFrostIfOwned(reason: string): Promise<void>;

    /** Stop the periodic frost check. */
    cleanup(): void;
}

/**
 * Runtime shape of the time control scheduler helper.
 */
export interface TimeHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active periodic time-window check, or null while the scheduler is stopped. */
    checkTimer: ReturnType<PoolControlAdapter['setInterval']> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Start periodic time-window checks with an initialized adapter. */
    init(adapter: PoolControlAdapter): void;

    /** Replace the active interval and immediately check all configured windows. */
    _scheduleCheck(): void;

    /** Evaluate configured time windows and update pump ownership and state. */
    _checkWindows(): Promise<void>;

    /** Check whether a time lies within a configured start/end range. */
    _inTimeRange(now: string, start: ioBroker.StateValue | undefined, end: ioBroker.StateValue | undefined): boolean;

    /** Convert a configured HH:MM value into minutes after midnight. */
    _timeToMinutes(value: ioBroker.StateValue | undefined): number | null;

    /** Stop the periodic time-window check. */
    cleanup(): void;
}

/** Runtime shape of the standard solar scheduler helper. */
export interface SolarHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active periodic solar check, or null while the scheduler is stopped. */
    checkTimer: ReturnType<PoolControlAdapter['setInterval']> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Start periodic standard-solar checks with an initialized adapter. */
    init(adapter: PoolControlAdapter): void;

    /** Replace the active interval and immediately run one solar check. */
    _scheduleCheck(): void;

    /** Evaluate standard solar conditions and update pump ownership. */
    _checkSolar(): Promise<void>;

    /** Claim pump ownership unless another helper currently owns it. */
    _setActiveHelperIfAllowed(helperName: string): Promise<void>;

    /** Release pump ownership if it is still held by this helper. */
    _releaseActiveHelperIfOwned(): Promise<void>;

    /** Stop the periodic standard-solar check. */
    cleanup(): void;
}

/** Runtime shape of the extended solar scheduler helper. */
export interface SolarExtendedHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active periodic extended-solar check, or null while the scheduler is stopped. */
    checkTimer: ReturnType<PoolControlAdapter['setInterval']> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Start periodic extended-solar checks with an initialized adapter. */
    init(adapter: PoolControlAdapter): void;

    /** Replace the active interval and immediately run one extended-solar check. */
    _scheduleCheck(): void;

    /** Evaluate extended solar conditions and update actor and status states. */
    _checkSolarExtended(): Promise<void>;

    /** Claim pump ownership unless another helper currently owns it. */
    _setActiveHelperIfAllowed(helperName: string): Promise<void>;

    /** Release pump ownership if it is still held by this helper. */
    _releaseActiveHelperIfOwned(): Promise<void>;

    /** Stop the periodic extended-solar check. */
    cleanup(): void;
}

/** Runtime shape of the daily temperature statistics helper. */
export interface StatisticsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active daily reset timeout, or null while no reset is scheduled. */
    midnightTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** State id storing the local day currently represented by persisted daily statistics. */
    periodStateId: string;

    /** Temperature sensors included in daily statistics. */
    sensors: Array<{ id: string; name: string }>;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize statistics states, subscriptions, listeners and reset scheduling. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Reset all daily statistics values for one sensor. */
    _resetSingleSensor(sensorId: string): Promise<void>;

    /** Create missing daily statistics objects and initialize their states. */
    _createTemperatureStatistics(): Promise<void>;

    /** Subscribe to current values for sensors considered active by this helper. */
    _subscribeActiveSensors(): Promise<void>;

    /** Process one current temperature state value. */
    _processTemperatureChange(sensorId: string, newValue: ioBroker.StateValue): Promise<void>;

    /** Update the combined JSON and HTML summaries. */
    _updateOverallSummary(): Promise<void>;

    /** Ensure persisted daily statistics belong to the current local day. */
    _ensureDailyPeriod(): Promise<void>;

    /** Replace the active timeout with the next midnight reset. */
    _scheduleMidnightReset(): Promise<void>;

    /** Reset the daily statistics for all configured sensors. */
    _resetDailyTemperatureStats(): Promise<void>;

    /** Recreate missing daily statistics structures without replacing existing objects. */
    _verifyStructure(): Promise<void>;

    /** Return a local YYYY-MM-DD calendar key. */
    _getLocalDayKey(date?: Date): string;

    /** Return a local date-time label for reset metadata. */
    _formatLocalDateTime(date?: Date): string;

    /** Stop the scheduled daily reset timeout. */
    cleanup(): void;
}

/** Runtime shape of the weekly temperature statistics helper. */
export interface StatisticsWeekHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active weekly reset timeout, or null while no reset is scheduled. */
    weekResetTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Whether the weekly reset is currently running. */
    isResetting: boolean;

    /** State id storing the local week currently represented by persisted weekly statistics. */
    periodStateId: string;

    /** Temperature sensors included in weekly statistics. */
    sensors: Array<{ id: string; name: string }>;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize weekly statistics states, subscriptions and reset scheduling. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Create missing weekly statistics objects and initialize their states. */
    _createTemperatureStatistics(): Promise<void>;

    /** Subscribe to current values for sensors considered active by this helper. */
    _subscribeActiveSensors(): Promise<void>;

    /** Process one current temperature state value. */
    _processTemperatureChange(sensorId: string, newValue: ioBroker.StateValue): Promise<void>;

    /** Update the combined weekly JSON and HTML summaries. */
    _updateOverallSummary(): Promise<void>;

    /** Ensure persisted weekly statistics belong to the current local Monday-Sunday week. */
    _checkWeekPeriod(): Promise<void>;

    /** Replace the active timeout with the next weekly reset. */
    _scheduleWeekReset(): Promise<void>;

    /** Reset weekly statistics for all configured sensors. */
    _resetWeeklyTemperatureStats(): Promise<void>;

    /** Recreate missing weekly statistics structures without replacing existing objects. */
    _verifyStructure(): Promise<void>;

    /** Return the formatted date range for the current statistics week. */
    _getCurrentWeekRange(date?: Date): string;

    /** Return the local Monday date key for the current statistics week. */
    _getCurrentWeekPeriodKey(date?: Date): string;

    /** Return the local Monday date object for a date's statistics week. */
    _getWeekStartDate(date?: Date): Date;

    /** Return a local YYYY-MM-DD calendar key. */
    _getLocalDayKey(date?: Date): string;

    /** Return a local date-time label for reset metadata. */
    _formatLocalDateTime(date?: Date): string;

    /** Stop the scheduled weekly reset timeout. */
    cleanup(): void;
}

/** Runtime shape of the monthly temperature statistics helper. */
export interface StatisticsMonthHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active monthly period-check timeout, or null while no check is scheduled. */
    monthResetTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Whether a monthly reset is currently running. */
    isResetting: boolean;

    /** Whether a monthly period check is currently running. */
    isPeriodCheckRunning: boolean;

    /** State id storing the last successfully processed monthly period. */
    periodStateId: string;

    /** Maximum delay between monthly period checks in milliseconds. */
    maxCheckIntervalMs: number;

    /** Temperature sensors included in monthly statistics. */
    sensors: Array<{ id: string; name: string }>;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize monthly statistics states, subscriptions and period checking. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Create missing monthly statistics objects and initialize their states. */
    _createTemperatureStatistics(): Promise<void>;

    /** Subscribe to current values for sensors considered active by this helper. */
    _subscribeActiveSensors(): Promise<void>;

    /** Process one current temperature state value. */
    _processTemperatureChange(sensorId: string, newValue: ioBroker.StateValue): Promise<void>;

    /** Update the combined monthly JSON and HTML summaries. */
    _updateOverallSummary(): Promise<void>;

    /** Check whether a new monthly period requires a reset. */
    _checkMonthPeriod(): Promise<void>;

    /** Replace the active timeout with the next monthly period check. */
    _scheduleMonthReset(): Promise<void>;

    /** Reset monthly statistics and report whether the reset completed. */
    _resetMonthlyTemperatureStats(): Promise<boolean>;

    /** Recreate missing monthly statistics structures without replacing existing objects. */
    _verifyStructure(): Promise<void>;

    /** Return the localized label for the current month. */
    _getCurrentMonthLabel(): string;

    /** Return the local monthly period key. */
    _getCurrentPeriodKey(date?: Date): string;

    /** Return a local YYYY-MM-DD calendar key. */
    _getLocalDayKey(date?: Date): string;

    /** Return a local date-time label for reset metadata. */
    _formatLocalDateTime(date?: Date): string;

    /** Stop the scheduled monthly period-check timeout. */
    cleanup(): void;
}

/** Known temperature sensor names used by the central producer helper. */
export type TemperatureSensorKey = 'collector' | 'outside' | 'surface' | 'ground' | 'flow' | 'return';

/** Configured foreign state ids for the enabled temperature sensors. */
export type TemperatureSensorMap = Partial<Record<TemperatureSensorKey, string>>;

/** Configuration fields used to select active temperature sensors. */
export interface TemperatureConfig {
    /** Whether the collector temperature sensor is enabled. */
    collector_temp_active: boolean;

    /** Configured foreign state id for the collector temperature. */
    collector_temp_sensor: string;

    /** Whether the outside temperature sensor is enabled. */
    outside_temp_active: boolean;

    /** Configured foreign state id for the outside temperature. */
    outside_temp_sensor: string;

    /** Whether the surface temperature sensor is enabled. */
    surface_temp_active: boolean;

    /** Configured foreign state id for the surface temperature. */
    surface_temp_sensor: string;

    /** Whether the ground temperature sensor is enabled. */
    ground_temp_active: boolean;

    /** Configured foreign state id for the ground temperature. */
    ground_temp_sensor: string;

    /** Whether the flow temperature sensor is enabled. */
    flow_temp_active: boolean;

    /** Configured foreign state id for the flow temperature. */
    flow_temp_sensor: string;

    /** Whether the return temperature sensor is enabled. */
    return_temp_active: boolean;

    /** Configured foreign state id for the return temperature. */
    return_temp_sensor: string;
}

/** Adapter instance used by the temperature producer helper. */
export type TemperatureAdapter = PoolControlAdapter<TemperatureConfig>;

/** Daily minimum and maximum values tracked for one temperature sensor. */
export interface TemperatureMinMax {
    /** Lowest temperature recorded for the current day. */
    min: number;

    /** Highest temperature recorded for the current day. */
    max: number;
}

/** Timestamped temperature value retained for hourly delta calculations. */
export interface TemperatureHistoryEntry {
    /** Timestamp when the temperature reading was recorded. */
    ts: number;

    /** Recorded temperature reading. */
    val: number;
}

/** Runtime shape of the central temperature producer helper. */
export interface TemperatureHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: TemperatureAdapter | null;

    /** Whether the current lifecycle generation accepts work. */
    _active: boolean;

    /** Monotonic generation used to invalidate stale asynchronous work. */
    _lifecycleGeneration: number;

    /** Current authoritative startup work, or null after startup settles. */
    _initializationPromise: Promise<void> | null;

    /** State id storing the local day currently represented by persisted min/max states. */
    periodStateId: string;

    /** All supported local temperature sensor keys. */
    allSensorKeys: TemperatureSensorKey[];

    /** Configured foreign state ids keyed by temperature sensor name. */
    sensors: TemperatureSensorMap;

    /** Latest numeric readings keyed by temperature sensor name. */
    values: Partial<Record<string, number>>;

    /** Daily minimum and maximum readings keyed by temperature sensor name. */
    minMax: Partial<Record<string, TemperatureMinMax>>;

    /** Recent readings used for hourly deltas, keyed by temperature sensor name. */
    history: Partial<Record<string, TemperatureHistoryEntry[]>>;

    /** Active daily reset timeout, or null while no reset is scheduled. */
    resetTimer: ReturnType<TemperatureAdapter['setTimeout']> | null;

    /** Active sensor diagnostic interval, or null while diagnostics are stopped. */
    diagnosticTimer: ReturnType<TemperatureAdapter['setInterval']> | null;

    /** Last recovery attempt timestamp keyed by temperature sensor name. */
    recoveryLastRun: Partial<Record<string, number>>;

    /** Initialized adapter instance. */
    readonly adapter: TemperatureAdapter;

    /** Initialize sensor subscriptions, initial reads and maintenance timers. */
    init(adapter: TemperatureAdapter): void;

    /** Check whether asynchronous work still belongs to the active lifecycle. */
    _isGenerationActive(generation: number): boolean;

    /** Collect configured and active foreign temperature sensor ids. */
    _collectActiveSensors(adapter: TemperatureAdapter): TemperatureSensorMap;

    /** Process one subscribed foreign temperature state update. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Process one validated state update for a concrete lifecycle generation. */
    _processStateChange(id: string, state: ioBroker.State | null | undefined, generation: number): Promise<void>;

    /** Write the latest numeric value for one temperature sensor. */
    _setCurrentValue(key: string, value: number, generation?: number): Promise<void>;

    /** Update freshness and source diagnostics for one valid sensor reading. */
    _updateSensorDiagnostics(
        key: string,
        value: number,
        state: ioBroker.State | null | undefined,
        status: string,
        generation?: number,
    ): Promise<void>;

    /** Write a temperature difference when both operands are available. */
    _maybeWriteDelta(stateId: string, a: number | undefined, b: number | undefined, generation?: number): Promise<void>;

    /** Update the daily minimum and maximum for one sensor. */
    _updateMinMax(key: string, value: number, generation?: number): Promise<void>;

    /** Retain a reading and update its hourly delta when a reference exists. */
    _updateHistoryAndDelta(key: string, value: number, generation?: number): Promise<void>;

    /** Replace the active timeout with the next daily reset. */
    _scheduleDailyReset(generation?: number): void;

    /** Start periodic sensor freshness diagnostics. */
    _scheduleSensorDiagnostics(generation?: number): void;

    /** Retry reading a stale foreign sensor subject to the recovery cooldown. */
    _tryRecoverSensorValue(key: string, minutesSince: number, generation?: number): Promise<void>;

    /** Ensure persisted min/max states belong to the current local day. */
    _ensureMinMaxPeriod(generation?: number): Promise<void>;

    /** Clear daily min/max and hourly delta states for active sensors. */
    _resetMinMax(generation?: number): Promise<void>;

    /** Restore persisted daily min/max values during startup. */
    _restoreMinMaxFromStates(generation?: number): Promise<void>;

    /** Return a local YYYY-MM-DD calendar key. */
    _getLocalDayKey(date?: Date): string;

    /** Stop the reset and diagnostic timers. */
    cleanup(): void;
}

/** Values used to build one human-readable solar logbook entry. */
export interface SolarLogbookEntryData {
    /** Whether solar heating has run during the current day. */
    solarRanToday: boolean;
    /** Whether solar heating is currently effective. */
    solarEffectiveNow: boolean;
    /** Collector temperature, or null when unavailable. */
    collectorTemp: number | null;
    /** Pool reference temperature, or null when unavailable. */
    poolReferenceTemp: number | null;
    /** Temperature difference used by solar insights, or null when unavailable. */
    deltaTUsed: number | null;
    /** Outside temperature, or null when unavailable. */
    outsideTemp: number | null;
    /** Flow used by solar insights, or null when unavailable. */
    flowLhUsed: number | null;
    /** Pump power used by solar insights, or null when unavailable. */
    pumpPowerWUsed: number | null;
    /** Estimated thermal power in watts, or null when unavailable. */
    thermalPowerW: number | null;
    /** Estimated thermal power in kilowatts, or null when unavailable. */
    thermalPowerKW: number | null;
    /** Estimated efficiency ratio, or null when unavailable. */
    efficiencyRatio: number | null;
    /** Estimated daily gain in watt-hours, or null when unavailable. */
    gainTodayWh: number | null;
    /** Estimated daily gain in kilowatt-hours, or null when unavailable. */
    gainTodayKWh: number | null;
    /** Solar-active minutes today, or null when unavailable. */
    activeMinutesToday: number | null;
    /** Peak thermal power today, or null when unavailable. */
    peakPowerTodayW: number | null;
    /** Current solar insight quality label. */
    qualityLevel: string;
    /** Current insight confidence percentage, or null when unavailable. */
    confidencePercent: number | null;
    /** Whether weather correction is currently active. */
    weatherCorrectionActive: boolean;
    /** Human-readable list of sensors used by solar insights. */
    usedSensorsText: string;
    /** Human-readable weather summary. */
    weatherSummary: string;
}

/** Human-readable solar logbook entry before timestamping. */
export interface SolarLogbookEntry {
    /** Semantic entry category used for log throttling. */
    type: string;
    /** Plain-text logbook message. */
    text: string;
    /** HTML-formatted logbook message. */
    html: string;
}

/** Persisted solar logbook item. */
export interface SolarLogbookItem extends SolarLogbookEntry {
    /** ISO timestamp of the logbook item. */
    ts: string;
    /** Local HH:MM label of the logbook item. */
    time: string;
}

/** Runtime shape of the optional actuator control helper. */
export interface ActuatorsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether new actuator work is accepted in the current lifecycle. */
    _active: boolean;

    /** Active runtime intervals keyed by relative actuator base id. */
    _timers: Partial<Record<string, ReturnType<PoolControlAdapter['setInterval']>>>;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions, configuration states, and pump-following devices. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Process local actuator and pump state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Copy configured actuator availability and names to local states. */
    _syncConfigToStates(): Promise<void>;

    /** Apply a requested actuator switch state. */
    _handleSwitch(relativeId: string, value: boolean): Promise<void>;

    /** Apply a requested permanent-operation state. */
    _handlePermanent(relativeId: string, value: boolean): Promise<void>;

    /** Restart or stop runtime tracking after a runtime-state change. */
    _handleRuntimeChange(relativeId: string, value: ioBroker.StateValue): Promise<void>;

    /** Complete the existing actuator start sequence. */
    _start(base: string): Promise<void>;

    /** Stop runtime tracking and update actuator status. */
    _stop(base: string, reason: string): Promise<void>;

    /** Start the minute-based runtime interval for an actuator. */
    _startTimer(base: string, minutes: number): Promise<void>;

    /** Stop the active runtime interval for an actuator. */
    _stopTimer(base: string): Promise<void>;

    /** Process configuration changes for a pump-following device. */
    _handleFollowPumpDeviceChange(relativeId: string): Promise<void>;

    /** Validate every configured pump-following device. */
    _validateAllFollowPumpDevices(): Promise<void>;

    /** Validate and synchronize every pump-following device. */
    _updateFollowPumpDevices(): Promise<void>;

    /** Validate one pump-following target state. */
    _validateFollowPumpDevice(base: string): Promise<boolean>;

    /** Synchronize one pump-following device with the main pump. */
    _syncFollowPumpDevice(base: string): Promise<void>;

    /** Write a boolean state to one validated pump-following target. */
    _applyFollowPumpTarget(base: string, on: boolean): Promise<void>;

    /** Write the requested state to a configured external actuator. */
    _applyForeign(base: string, on: boolean): Promise<void>;

    /** Convert a namespaced state id to its relative PoolControl id. */
    _toRelId(id: string): string;

    /** Write a local actuator state with acknowledgement. */
    _set(id: string, value: ioBroker.StateValue): Promise<void>;

    /** Read a local state using the supplied fallback when unavailable. */
    _get(id: string, fallback: ioBroker.StateValue): Promise<ioBroker.StateValue>;

    /** Stop all active actuator runtime intervals. */
    cleanup(): void;
}

/** Existing truthy target values accepted by the debug log helper. */
export type DebugLogTarget = string | number | true;

/** One observed debug-log event retained until helper initialization is complete. */
export interface DebugLogPendingStateChange extends BufferedStateChange {
    /** Resolve an in-init handler call after processing or lifecycle cancellation. */
    complete?: (value: void | PromiseLike<void>) => void;
}

/** Runtime shape of the state-change debug log helper. */
export interface DebugLogHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept events or continue asynchronous work. */
    _active: boolean;

    /** Current lifecycle phase used to order observed debug-log events. */
    _lifecycleState: BufferedLifecycleState;

    /** Generation invalidating old initialization and flush continuations. */
    _lifecycleGeneration: number;

    /** Observed commands and log events waiting for initialization to finish. */
    _pendingStateChanges: DebugLogPendingStateChange[];

    /** Currently selected target area. */
    currentTarget: DebugLogTarget;

    /** Currently subscribed target area, or null before selection. */
    subscribedTarget: DebugLogTarget | null;

    /** Most recent change timestamp keyed by full state id. */
    lastChange: Record<string, number>;

    /** Minimum interval between ordinary changes before logging. */
    thresholdMs: number;

    /** Pending debug log text waiting to be flushed. */
    buffer: string;

    /** Active delayed buffer flush, or null while none is scheduled. */
    bufferTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize debug log states, subscriptions, and the selected target. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Check whether work belongs to the currently active lifecycle. */
    _isCurrentGeneration(generation: number): boolean;

    /** Decide whether an observed event must survive the initialization barrier. */
    _shouldBufferEvent(id: string, state: ioBroker.State): boolean;

    /** Replay retained commands and log events in observation order. */
    _drainPendingStateChanges(generation: number): Promise<void>;

    /** Resolve and discard retained events without processing them. */
    _discardPendingStateChanges(): void;

    /** Process target selection, clear requests, and monitored state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Process one active or buffered debug-log state change. */
    _processStateChange(id: string, state: ioBroker.State, generation: number): Promise<void>;

    /** Switch the monitored target and update subscriptions. */
    _switchTarget(newTarget: DebugLogTarget, generation?: number): Promise<void>;

    /** Subscribe to the supplied target area. */
    _subscribeTarget(target: DebugLogTarget): void;

    /** Add text to the pending debug log buffer. */
    _appendLog(message: string, generation?: number): Promise<void>;

    /** Persist and clear the pending debug log buffer. */
    _flushBuffer(generation?: number): Promise<void>;

    /** Keep the UTF-8 tail of a value within the supplied byte limit. */
    _truncateUtf8(value: unknown, maxBytes: number): string;

    /** Clear the persisted and pending debug log content. */
    _clearLog(generation?: number): Promise<void>;

    /** Cancel the pending buffer flush during cleanup. */
    cleanup(): void;
}

/** Runtime shape of the solar logbook producer helper. */
export interface SolarLogbookHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper currently accepts events and scheduled work. */
    _active: boolean;

    /** Lifecycle generation used to invalidate old async and timer continuations. */
    _lifecycleGeneration: number;

    /** Active deferred logbook update, or null while none is scheduled. */
    checkTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Active daily reset timeout, or null while none is scheduled. */
    resetTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions and logbook scheduling. */
    init(adapter: PoolControlAdapter): void;

    /** Schedule an update for acknowledged relevant state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): void;

    /** Debounce or schedule the next logbook update. */
    _scheduleCheck(delayMs?: number): void;

    /** Replace the active timeout with the next daily reset. */
    _scheduleDailyReset(): void;

    /** Subscribe to all solar logbook input states. */
    _subscribeStates(generation?: number): Promise<void>;

    /** Check whether a state id is a solar logbook input. */
    _isRelevantState(id: string): boolean;

    /** Build and persist the current solar logbook output. */
    _updateLogbook(generation?: number): Promise<void>;

    /** Check whether an async continuation still belongs to the active lifecycle. */
    _isCurrentGeneration(generation: number): boolean;

    /** Build one human-readable logbook entry from solar insight values. */
    _buildHumanEntry(data: SolarLogbookEntryData): SolarLogbookEntry;

    /** Decide whether an entry should be appended to the daily history. */
    _shouldAppendLogEntry(lastLogItem: SolarLogbookItem | null, entry: SolarLogbookEntry, now: Date): boolean;

    /** Enforce entry-count and byte-size limits for the daily history. */
    _limitDayLogByBytes(entries: SolarLogbookItem[]): {
        entries: SolarLogbookItem[];
        json: string;
        text: string;
    };

    /** Format persisted logbook items as readable lines. */
    _buildDayLogText(dayLog: SolarLogbookItem[]): string;

    /** Normalize and shorten the optional weather summary. */
    _extractShortWeather(weatherSummary: string): string;

    /** Read a local state, returning null when unavailable. */
    _readState(id: string): Promise<ioBroker.State | null | undefined>;

    /** Read a state using the existing strict boolean semantics. */
    _readBoolean(id: string): Promise<boolean>;

    /** Read a finite numeric state value, or null when unavailable or invalid. */
    _readNumber(id: string): Promise<number | null>;

    /** Read a state as a string using the existing conversion semantics. */
    _readString(id: string): Promise<string>;

    /** Parse a persisted daily log array, falling back to an empty array. */
    _safeParseArray(jsonText: string): SolarLogbookItem[];

    /** Format a finite numeric value with the requested precision. */
    _formatNumber(value: number | null, digits?: number): string;

    /** Format a date as a local HH:MM label. */
    _formatTime(date: Date): string;

    /** Escape text for inclusion in the HTML logbook output. */
    _escapeHtml(text: string): string;

    /** Stop deferred updates and the daily reset. */
    cleanup(): void;
}

/** Runtime shape of the solar insights producer helper. */
export interface SolarInsightsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept events or continue asynchronous work. */
    _active: boolean;

    /** Whether subscriptions completed and normal event handling is active. */
    _initialized: boolean;

    /** Generation invalidating old initialization, check, and reset continuations. */
    _lifecycleGeneration: number;

    /** Whether an observed activation edge must set the daily solar latch after initialization. */
    _pendingSolarActivation: boolean;

    /** Active deferred insight check, or null while none is scheduled. */
    checkTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Active daily reset timeout, or null while none is scheduled. */
    resetTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Timestamp of the previous insight check, or null before the first check. */
    lastCheckTimestamp: number | null;

    /** Whether solar control was active during the previous check. */
    lastSolarLogicActive: boolean;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions and insight scheduling. */
    init(adapter: PoolControlAdapter): void;

    /** Finish subscriptions and consume an observed pre-init activation edge. */
    _completeInitialization(subscriptions: Promise<void>, generation: number): Promise<void>;

    /** Check whether work belongs to the currently active lifecycle generation. */
    _isCurrentGeneration(generation: number): boolean;

    /** Persist an observed solar activation for the current day. */
    _markSolarRanToday(generation: number): Promise<void>;

    /** Schedule recalculation for acknowledged relevant state changes. */
    onStateChange(id: string, state: ioBroker.State | null | undefined): void;

    /** Debounce or schedule the next solar insight check. */
    _scheduleCheck(delayMs?: number, generation?: number): void;

    /** Replace the active timeout with the next daily reset. */
    _scheduleDailyReset(generation?: number): void;

    /** Subscribe to all solar insight input states. */
    _subscribeStates(generation?: number): Promise<void>;

    /** Check whether a state id is a solar insight input. */
    _isRelevantState(id: string): boolean;

    /** Match local and fully qualified ioBroker state ids. */
    _matchesStateId(id: string, stateId: string): boolean;

    /** Calculate and write the current solar insights. */
    _checkSolarInsights(generation?: number): Promise<void>;

    /** Check whether a configured sensor currently provides a numeric value. */
    _isSensorAvailable(activeId: string, valueId: string, generation?: number): Promise<boolean>;

    /** Read a local state, returning null when unavailable. */
    _readState(id: string, generation?: number): Promise<ioBroker.State | null | undefined>;

    /** Read a state using the existing strict boolean semantics. */
    _readBoolean(id: string, generation?: number): Promise<boolean>;

    /** Read a finite numeric state value, or null when unavailable or invalid. */
    _readNumber(id: string, generation?: number): Promise<number | null>;

    /** Read a state as a string using the existing conversion semantics. */
    _readString(id: string, generation?: number): Promise<string>;

    /** Write a state only while the originating lifecycle generation remains active. */
    _writeState(id: string, state: { val: ioBroker.StateValue; ack: boolean }, generation: number): Promise<void>;

    /** Stop deferred checks and the daily reset. */
    cleanup(): void;
}

/** Runtime shape of the photovoltaic insights producer helper. */
export interface PhotovoltaicInsightsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PhotovoltaicInsightsAdapter | null;

    /** Active deferred insight update, or null while none is scheduled. */
    checkTimer: ReturnType<PhotovoltaicInsightsAdapter['setTimeout']> | null;

    /** Active daily reset timeout, or null while none is scheduled. */
    resetTimer: ReturnType<PhotovoltaicInsightsAdapter['setTimeout']> | null;

    /** Timestamp of the previous result update, or null outside PV runtime. */
    lastResultTimestamp: number | null;

    /** Whether PV-controlled pump runtime was active during the previous update. */
    lastPvRuntimeActive: boolean;

    /** Initialized adapter instance. */
    readonly adapter: PhotovoltaicInsightsAdapter;

    /** Initialize subscriptions and insight update scheduling. */
    init(adapter: PhotovoltaicInsightsAdapter): void;

    /** Schedule recalculation for acknowledged relevant state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): void;

    /** Replace the active timeout with the next daily reset. */
    _scheduleDailyReset(): void;

    /** Debounce or schedule the next insight update. */
    _scheduleCheck(delayMs?: number): void;

    /** Subscribe to all photovoltaic insight input states. */
    _subscribeStates(): Promise<void>;

    /** Check whether a state id is an insight input. */
    _isRelevantState(id: string): boolean;

    /** Refresh mirrored inputs and derived insight output. */
    _updateInputs(): Promise<void>;

    /** Refresh calculation metadata. */
    _updateCalculation(): Promise<void>;

    /** Calculate and write photovoltaic insight results. */
    _updateResults(): Promise<void>;

    /** Read a local state, returning null when unavailable. */
    _readState(id: string): Promise<ioBroker.State | null | undefined>;

    /** Read a state using the existing strict boolean semantics. */
    _readBoolean(id: string): Promise<boolean>;

    /** Read a finite numeric state value, or null when unavailable or invalid. */
    _readNumber(id: string): Promise<number | null>;

    /** Read a state as a string using the existing conversion semantics. */
    _readString(id: string): Promise<string>;

    /** Stop deferred updates and the daily reset. */
    cleanup(): void;
}

/** Severity used by pool insight observations and recommendations. */
export type PoolInsightLevel = string;

/** One human-readable observation in a pool insight result. */
export interface PoolInsightObservation {
    /** Functional area that produced the observation. */
    area: string;

    /** Severity assigned to the observation. */
    level: PoolInsightLevel;

    /** Localized observation text. */
    text: string;
}

/** One actionable recommendation in a pool insight result. */
export interface PoolInsightRecommendation {
    /** Functional area addressed by the recommendation. */
    area: string;

    /** Normalized recommendation severity. */
    level: string;

    /** Localized recommendation text. */
    text: string;
    /** Stable reason identifier for the recommendation. */
    reason: string;

    /** Confidence value between zero and one. */
    confidence: number;

    /** State ids used as evidence for the recommendation. */
    source_states: string[];

    /** Cleaned evidence values attached to the recommendation. */
    evidence: Record<string, unknown>;
}

/** Temperature values used by the pool insight analysis. */
export interface PoolInsightTemperatureSnapshot {
    /** Current surface temperature, or null when unavailable. */
    surfaceCurrent: number | null;

    /** Daily minimum surface temperature, or null when unavailable. */
    surfaceMinToday: number | null;

    /** Daily maximum surface temperature, or null when unavailable. */
    surfaceMaxToday: number | null;

    /** Persisted daily surface summary JSON text. */
    surfaceSummaryJson: string;
}

/** Pump values used by the pool insight analysis. */
export interface PoolInsightPumpSnapshot {
    /** Pump runtime today in seconds, or null when unavailable. */
    runtimeTodaySeconds: number | null;

    /** Pump start count today, or null when unavailable. */
    startCountToday: number | null;

    /** Required daily circulation, or null when unavailable. */
    circulationRequired: number | null;

    /** Remaining daily circulation, or null when unavailable. */
    circulationRemaining: number | null;

    /** Current pump mode text. */
    mode: string;

    /** Current pump status text. */
    status: string;

    /** Whether a pump error is active. */
    error: boolean;

    /** Current pump ownership helper. */
    activeHelper: string;
}

/** Solar values used by the pool insight analysis. */
export interface PoolInsightSolarSnapshot {
    /** Whether solar heating ran today. */
    ranToday: boolean;

    /** Estimated solar gain today, or null when unavailable. */
    estimatedGainTodayKwh: number | null;

    /** Whether a solar evaluation is available. */
    evaluationAvailable: boolean;
}

/** Photovoltaic values used by the pool insight analysis. */
export interface PoolInsightPhotovoltaicSnapshot {
    /** Whether photovoltaic pump operation was active today. */
    activeToday: boolean;

    /** Photovoltaic pump starts today, or null when unavailable. */
    startsToday: number | null;

    /** Photovoltaic pump runtime today, or null when unavailable. */
    runtimeTodayMin: number | null;

    /** Whether a photovoltaic evaluation is available. */
    evaluationAvailable: boolean;
}

/** Consumption values used by the pool insight analysis. */
export interface PoolInsightConsumptionSnapshot {
    /** Energy consumed today, or null when unavailable. */
    dayKwh: number | null;

    /** Energy cost today, or null when unavailable. */
    dayEur: number | null;
}

/** Chemistry evaluation availability used by pool insights. */
export interface PoolInsightChemistrySnapshot {
    /** Whether a pH evaluation is available. */
    phAvailable: boolean;

    /** Whether a TDS evaluation is available. */
    tdsAvailable: boolean;

    /** Whether an ORP evaluation is available. */
    orpAvailable: boolean;
}

/** Complete input snapshot for one pool insight analysis. */
export interface PoolInsightsSnapshot {
    /** Temperature inputs. */
    temperature: PoolInsightTemperatureSnapshot;

    /** Pump inputs. */
    pump: PoolInsightPumpSnapshot;

    /** Solar inputs. */
    solar: PoolInsightSolarSnapshot;

    /** Photovoltaic inputs. */
    photovoltaic: PoolInsightPhotovoltaicSnapshot;

    /** Consumption inputs. */
    consumption: PoolInsightConsumptionSnapshot;

    /** Chemistry inputs. */
    chemistry: PoolInsightChemistrySnapshot;
}

/** Result produced by one pool insight analysis. */
export interface PoolInsightsResult {
    /** Completion status written to the status state. */
    status: string;

    /** Highest severity found during analysis. */
    level: PoolInsightLevel;

    /** Plain-text analysis summary. */
    summaryText: string;

    /** HTML analysis summary. */
    summaryHtml: string;

    /** Structured summary payload. */
    summaryJson: Record<string, unknown>;

    /** Observations included in the result. */
    observations: PoolInsightObservation[];

    /** Recommendations included in the result. */
    recommendations: PoolInsightRecommendation[];

    /** ISO timestamp of the result. */
    lastUpdate: string;

    /** Trigger reason for the analysis. */
    reason: string;
}

/** Parsed daily analysis time. */
export interface PoolInsightScheduleTime {
    /** Hour of day. */
    hours: number;

    /** Minute of hour. */
    minutes: number;
}

/** Runtime shape of the rule-based overall pool insight helper. */
export interface PoolInsightsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the current lifecycle accepts work. */
    _active: boolean;

    /** Whether the current initialization barrier has completed. */
    _initialized: boolean;

    /** Generation used to invalidate stale lifecycle continuations. */
    _lifecycleGeneration: number;

    /** Current initialization barrier, or null outside initialization. */
    _initializationPromise: Promise<void> | null;

    /** Manual trigger events observed before initialization completes. */
    _pendingManualTriggers: true[];

    /** Active daily analysis timeout, or null while none is scheduled. */
    dailyTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Whether an analysis is currently running. */
    running: boolean;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions and refresh daily scheduling. */
    init(adapter: PoolControlAdapter): void;

    /** Process manual trigger and schedule configuration changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): void;

    /** Refresh scheduling and replay observed manual triggers for one generation. */
    _initialize(generation: number): Promise<void>;

    /** Observe a fire-and-forget lifecycle task and log active-generation failures. */
    _runLifecycleTask(task: Promise<void>, generation: number, context: string): void;

    /** Check whether a generation may still perform work. */
    _isGenerationActive(generation: number): boolean;

    /** Run a manual analysis and reset its trigger state. */
    _handleManualTrigger(generation?: number): Promise<void>;

    /** Clear and refresh the active daily schedule. */
    _refreshSchedule(generation?: number): Promise<void>;

    /** Schedule the next daily analysis timeout. */
    _scheduleDailyAnalysis(generation?: number): Promise<void>;

    /** Parse an HH:mm schedule with the existing fallback. */
    _parseScheduleTime(value: string): PoolInsightScheduleTime;

    /** Run one analysis unless another analysis is active. */
    _runAnalysis(reason: string, allowSpeech: boolean, generation?: number): Promise<void>;

    /** Read all inputs for one analysis. */
    _readSnapshot(generation?: number): Promise<PoolInsightsSnapshot>;

    /** Build the complete analysis result. */
    _buildResult(snapshot: PoolInsightsSnapshot, reason: string): PoolInsightsResult;

    /** Calculate the daily surface temperature delta. */
    _getTemperatureDelta(temperature: PoolInsightTemperatureSnapshot): number | null;

    /** Append observations derived from solar inputs. */
    _appendSolarObservations(solar: PoolInsightSolarSnapshot, observations: PoolInsightObservation[]): void;

    /** Append observations derived from photovoltaic inputs. */
    _appendPhotovoltaicObservations(
        photovoltaic: PoolInsightPhotovoltaicSnapshot,
        observations: PoolInsightObservation[],
    ): void;

    /** Append observations derived from consumption inputs. */
    _appendConsumptionObservations(
        consumption: PoolInsightConsumptionSnapshot,
        observations: PoolInsightObservation[],
    ): void;

    /** Append observations for available chemistry evaluations. */
    _appendChemistryObservations(chemistry: PoolInsightChemistrySnapshot, observations: PoolInsightObservation[]): void;

    /** Check whether essential analysis inputs are unavailable. */
    _hasLimitedCoreData(snapshot: PoolInsightsSnapshot): boolean;

    /** Build the plain-text summary. */
    _buildSummaryText(
        level: string,
        observations: PoolInsightObservation[],
        recommendations: PoolInsightRecommendation[],
    ): string;

    /** Build the HTML summary. */
    _buildSummaryHtml(
        level: string,
        observations: PoolInsightObservation[],
        recommendations: PoolInsightRecommendation[],
    ): string;

    /** Write a completed analysis result. */
    _writeResult(result: PoolInsightsResult, generation?: number): Promise<void>;

    /** Write the disabled result state. */
    _writeDisabled(reason: string, generation?: number): Promise<void>;

    /** Write an analysis error result. */
    _writeError(reason: string, error: { message?: string } | null | undefined, generation?: number): Promise<void>;

    /** Optionally enqueue the summary for speech output. */
    _sendSpeechIfAllowed(result: PoolInsightsResult, reason: string, generation?: number): Promise<void>;

    /** Read a local state, returning null when unavailable. */
    _readState(id: string, generation?: number): Promise<ioBroker.State | null | undefined>;

    /** Read a state as a string using the existing conversion semantics. */
    _readString(id: string, generation?: number): Promise<string>;

    /** Read a finite numeric state value, or null when unavailable. */
    _readNumber(id: string, generation?: number): Promise<number | null>;

    /** Read a state using the existing strict boolean semantics. */
    _readBoolean(id: string, generation?: number): Promise<boolean>;

    /** Check whether a string state currently has a value. */
    _hasValue(id: string, generation?: number): Promise<boolean>;

    /** Write a state only when its value changes. */
    _setState(id: string, value: ioBroker.StateValue, ack?: boolean, generation?: number): Promise<void>;

    /** Build one normalized recommendation. */
    _createRecommendation(
        area: string,
        level: string,
        reason: string,
        confidence: unknown,
        text: string,
        sourceStates?: string[],
        evidence?: Record<string, unknown>,
    ): PoolInsightRecommendation;

    /** Clamp recommendation confidence to the valid range. */
    _clampConfidence(value: unknown): number;

    /** Normalize recommendation evidence to a plain object. */
    _cleanEvidence(evidence: unknown): Record<string, unknown>;

    /** Recursively clean a plain object. */
    _cleanObject(object: object): Record<string, unknown>;

    /** Recursively clean one evidence value. */
    _cleanValue(value: unknown): unknown;

    /** Format runtime seconds as a readable duration. */
    _formatRuntime(seconds: number): string;

    /** Raise a severity to the higher candidate level. */
    _raiseLevel(current: string, candidate: string): string;

    /** Round a number to the requested decimal places. */
    _round(value: number, digits: number): number;

    /** Translate a key and apply placeholder values. */
    _translate(key: string, replacements?: Record<string, unknown>): string;

    /** Escape text for safe inclusion in HTML output. */
    _escapeHtml(text: unknown): string;

    /** Clear the daily timeout and reset the running marker. */
    cleanup(): void;
}

/** Percentage mapping for derived pump speed recommendations. */
export interface PumpSpeedMapping {
    /** Percentage recommended for frost protection. */
    frost: number;

    /** Percentage recommended for low-speed operation. */
    low: number;

    /** Percentage recommended for normal operation. */
    normal: number;

    /** Percentage recommended for high-speed operation. */
    high: number;

    /** Percentage recommended for boost operation. */
    boost: number;
}

/** Runtime shape of the passive pump speed recommendation helper. */
export interface PumpSpeedHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the current lifecycle may process events and asynchronous continuations. */
    _active: boolean;

    /** Generation used to invalidate asynchronous work from earlier lifecycles. */
    _lifecycleGeneration: number;

    /** Initialization barrier while mapping and initial states are loaded. */
    _initializationPromise: Promise<void> | null;

    /** Cached user-defined percentage mapping for each speed state. */
    mapping: PumpSpeedMapping;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions, mapping, and the initial recommendation. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Complete subscriptions, mapping load, and the initial recommendation. */
    _initialize(generation: number): Promise<void>;

    /** Process pump, mode, backwash, and mapping state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Reload all percentage mapping states. */
    _reloadMapping(generation?: number): Promise<void>;

    /** Derive and write the current pump speed recommendation. */
    _recalculate(generation?: number): Promise<void>;

    /** Write consistent state, mode, and percentage outputs. */
    _setOutputs(stateValue: string, percentValue: number, generation?: number): Promise<void>;

    /** Read and clamp one percentage mapping state. */
    _getPercent(id: string): Promise<number>;

    /** Clamp and round a value to the valid percentage range. */
    _clampPercent(value: number): number;

    /** Check whether an asynchronous continuation still belongs to the active lifecycle. */
    _isGenerationActive(generation: number): boolean;

    /** Log completion of adapter unload cleanup. */
    cleanup(): void;
}

/** Runtime shape of the pump live-value calculation helper. */
export interface PumpHelper2 {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the current lifecycle may process events and asynchronous continuations. */
    _active: boolean;

    /** Generation used to invalidate asynchronous work from earlier lifecycles. */
    _lifecycleGeneration: number;

    /** Initialization barrier while initial live values are calculated. */
    _initializationPromise: Promise<void> | null;

    /** Most recent positive calculated flow value. */
    lastKnownFlow: number;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions and calculate initial live values. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Complete subscriptions and the authoritative initial calculation. */
    _initialize(generation: number): Promise<void>;

    /** Process pump power and pump switch state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Calculate and write the current derived pump live values. */
    _updateLiveValues(generation?: number): Promise<void>;

    /** Read a state using the existing numeric conversion and zero fallback. */
    _getNumber(id: string): Promise<number>;

    /** Write a numeric state only when its value has changed. */
    _setIfChanged(id: string, newVal: number, generation?: number): Promise<void>;

    /** Check whether an asynchronous continuation still belongs to the active lifecycle. */
    _isGenerationActive(generation: number): boolean;

    /** Log completion of adapter unload cleanup. */
    cleanup(): void;
}

/** Numeric samples collected during one pump learning session. */
export interface PumpLearningSessionValues {
    /** Valid pump-power samples collected during the current session. */
    power: number[];

    /** Valid pump-flow samples collected during the current session. */
    flow: number[];
}

/** Runtime shape of the pump learning and analysis helper. */
export interface PumpHelper3 {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Numeric power and flow samples for the active pump session. */
    currentSessionValues: PumpLearningSessionValues;

    /** Timestamp of the most recent learning status write. */
    _lastLearningWrite: number;

    /** Most recently written learning status text. */
    _lastLearningStatus: string;

    /** Timestamp of the most recent deviation write. */
    _lastDevWrite: number;

    /** Most recently written power deviation. */
    _lastDevPower: number;

    /** Most recently written flow deviation. */
    _lastDevFlow: number;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize pump-learning subscriptions. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Process pump, live measurement and learning-reset state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Add a valid numeric sample to the active learning session. */
    _pushValue(type: keyof PumpLearningSessionValues, value: ioBroker.StateValue): void;

    /** Finalize the active learning cycle and persist updated averages. */
    _finalizeLearningCycle(): Promise<void>;

    /** Calculate and persist current deviations and status text. */
    _updateDeviationAndStatus(): Promise<void>;

    /** Build the translated status text for current deviations. */
    _getStatusText(devPower: number, devFlow: number): Promise<string>;

    /** Reset all persisted and in-memory learning values. */
    _resetLearningValues(): Promise<void>;

    /** Calculate the arithmetic mean of numeric samples. */
    _average(arr: number[]): number;

    /** Read a state using the existing numeric conversion and zero fallback. */
    _getNumber(id: string): Promise<number>;

    /** Clear in-memory learning samples during adapter unload. */
    cleanup(): void;
}

/** Configuration fields used by the pump pressure helper. */
export interface PumpHelper4Config {
    /** Foreign state id containing the measured filter pressure. */
    pressure_sensor_id?: string;
}

/** Adapter instance used by the pump pressure helper. */
export type PumpHelper4Adapter = PoolControlAdapter<PumpHelper4Config>;

/** Runtime shape of the pump pressure and pressure-learning helper. */
export interface PumpHelper4 {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PumpHelper4Adapter | null;

    /** Configured foreign pressure sensor id, or null before initialization. */
    pressureObjectId: string | null;

    /** Most recently loaded user-defined normal minimum pressure. */
    lastMin?: number;

    /** Most recently loaded user-defined normal maximum pressure. */
    lastMax?: number;

    /** Initialized adapter instance. */
    readonly adapter: PumpHelper4Adapter;

    /** Initialize pressure sensor and local pressure-state subscriptions. */
    init(adapter: PumpHelper4Adapter): Promise<void>;

    /** Process pressure sensor, threshold, and learning-reset state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Build the pressure status text using the current user thresholds. */
    _getStatusText(bar: number): string;

    /** Read a state using the existing numeric conversion and zero fallback. */
    _getNumber(id: string): Promise<number>;

    /** Log completion of adapter unload cleanup. */
    cleanup(): void;
}

/** Runtime shape of the primary pump synchronization and safety helper. */
export interface PumpHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PumpHelperAdapter | null;

    /** Foreign id of the physical pump switch, or null when unconfigured. */
    deviceId: string | null;

    /** Foreign id of the pump power measurement, or null when unconfigured. */
    currentPowerId: string | null;

    /** Timestamp of the most recent pump start, or null before a start. */
    _lastPumpStart: number | null;

    /** Timestamp of the most recent pump stop, or null before a stop. */
    _lastPumpStop: number | null;

    /** Initialized adapter instance. */
    readonly adapter: PumpHelperAdapter;

    /** Initialize subscriptions, mirrors, and the derived pump status. */
    init(adapter: PumpHelperAdapter): void;

    /** Parse a numeric measurement using the existing tolerant semantics. */
    _parseNumber(value: unknown): number;

    /** Process pump, power, and physical switch state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Update the derived textual pump status. */
    _updateStatus(): Promise<void>;

    /** Evaluate pump power and overload safety conditions. */
    _checkErrorConditions(): Promise<void>;

    /** Release helper resources. */
    cleanup(): void;
}

/** Runtime shape of the system status summary helper. */
export interface StatusHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the current lifecycle may start or continue status work. */
    _active: boolean;

    /** Current lifecycle phase used to order observed pump events. */
    _lifecycleState: BufferedLifecycleState;

    /** Generation that invalidates old timer and initialization continuations. */
    _lifecycleGeneration: number;

    /** Observed pump events waiting for initialization to finish. */
    _pendingPumpEvents: BufferedStateChange[];

    /** Initialization barrier for initial reads, outputs, and pump event replay. */
    _initPromise: Promise<void> | null;

    /** Active midnight reset timeout, or null while no reset is scheduled. */
    midnightTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Last observed pump state, or null before the initial state is known. */
    pumpOn: boolean | null;

    /** Timestamp of the most recent summary update attempt. */
    _lastSummaryUpdate: number;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions, status output, and the midnight reset. */
    init(adapter: PoolControlAdapter): void;

    /** Read the persisted pump state used when no pump event was observed. */
    _readInitialPumpState(): Promise<boolean>;

    /** Finish initialization and replay observed pump events in order. */
    _completeInitialization(
        initialPumpState: Promise<boolean>,
        initialSummary: Promise<void>,
        initialSystemStatus: Promise<void>,
        generation: number,
    ): Promise<void>;

    /** Process acknowledged state changes relevant to status output. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Return whether work may continue in the current lifecycle. */
    _canRun(): boolean;

    /** Process one active or buffered status state change. */
    _processStateChange(id: string, state: ioBroker.State): Promise<void>;

    /** Format a state value for human-readable status output. */
    safeValue(value: ioBroker.StateValue | undefined, digits?: number): string;

    /** Update the textual and JSON status summaries. */
    updateSummary(): Promise<void>;

    /** Update aggregate warning and OK indicators. */
    updateSystemStatus(): Promise<void>;

    /** Replace the active timeout with the next midnight reset. */
    scheduleMidnightReset(generation?: number): void;

    /** Reset daily pump status counters. */
    doMidnightReset(): Promise<void>;

    /** Stop the scheduled midnight reset. */
    cleanup(): void;
}

/** Runtime shape of the adapter information producer helper. */
export interface InfoHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Active daily greeting update timeout, or null while no update is scheduled. */
    dailyTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize info states and schedule daily greeting updates. */
    init(adapter: PoolControlAdapter): void;

    /** Write the adapter version from io-package metadata. */
    _updateAdapterVersion(): void;

    /** Write the seasonal developer greeting for the current date. */
    _updateDeveloperGreeting(): void;

    /** Compute Gregorian Easter Sunday for the supplied year. */
    _computeEaster(year: number): Date;

    /** Replace the active timeout with the next daily greeting update. */
    _startDailyTimer(): void;

    /** Stop the scheduled daily greeting update. */
    cleanup(): void;
}

/** Runtime shape of the startup migration helper. */
export interface MigrationHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Run all migration routines in their defined order. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Correct the write permission of the speech queue when required. */
    _fixSpeechQueue(): Promise<void>;

    /** Add persistence metadata to the solar warning state when required. */
    _fixSolarWarnActivePersist(): Promise<void>;

    /** Add the PV automatic option to the pump mode metadata when required. */
    _fixPumpModeStates(): Promise<void>;

    /** Migrate legacy Chemistry timestamp object metadata and supported values. */
    _fixChemistryTimestampStates(): Promise<void>;

    /** Remove obsolete weekly and monthly reset button states and objects. */
    _removeInvalidResetButtons(): Promise<void>;
}

/** Runtime shape of the heating control helper. */
export interface HeatHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the current lifecycle generation accepts work. */
    _active: boolean;

    /** Monotonic generation used to invalidate stale asynchronous work. */
    _lifecycleGeneration: number;

    /** Current initial subscription and evaluation work, or null after startup. */
    _initializationPromise: Promise<void> | null;

    /** Currently subscribed foreign heating control state id. */
    _heatControlForeignId: string;

    /** Active pump afterrun timeout, or null while no afterrun is pending. */
    _afterrunTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Active pump prerun timeout, or null while no prerun is pending. */
    _prerunTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Whether the heating helper currently owns the pump. */
    _ownsPump: boolean;

    /** Desired heating state, or null before evaluation or after cleanup. */
    _desiredHeat: boolean | null;

    /** Timestamp of the last heating evaluation. */
    _lastEval: number;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions and perform the first heating evaluation. */
    init(adapter: PoolControlAdapter): void;

    /** Check whether asynchronous work still belongs to the active lifecycle. */
    _isGenerationActive(generation: number): boolean;

    /** React to relevant local state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Evaluate heating demand, blockers, limits and pump requirements. */
    _evaluate(_sourceTag?: string, generation?: number): Promise<void>;

    /** Start heating for the supplied control target and reason. */
    _startHeating(options: {
        reason: string;
        controlType: ioBroker.StateValue;
        controlObjectId: ioBroker.StateValue;
        generation?: number;
    }): Promise<void>;

    /** Stop heating and apply the configured pump afterrun. */
    _stopHeating(options: {
        reason: string;
        controlType: ioBroker.StateValue;
        controlObjectId: ioBroker.StateValue;
        afterrunMin: number;
        generation?: number;
    }): Promise<void>;

    /** Apply a blocked heating state and any required pump afterrun. */
    _applyBlockedState(mode: string, reason: string, afterrunMin: number, generation?: number): Promise<void>;

    /** Apply an inactive heating state and any required pump afterrun. */
    _applyOffState(mode: string, reason: string, afterrunMin: number, generation?: number): Promise<void>;

    /** Ensure the circulation pump is running and track ownership. */
    _ensurePumpOn(generation?: number): Promise<void>;

    /** Start pump afterrun when the helper owns the pump. */
    _startAfterrunIfNeeded(afterrunMin: number, reason: string, generation?: number): Promise<void>;

    /** Stop a helper-owned pump immediately. */
    _stopPumpNow(tag: string, generation?: number): Promise<void>;

    /** Write the requested state to the configured foreign heating actuator. */
    _setHeatingDevice(on: boolean, foreignId: ioBroker.StateValue | undefined, generation?: number): Promise<void>;

    /** Update the public heating status and request states. */
    _setHeatStates(
        options: {
            active: boolean;
            blocked: boolean;
            mode: string;
            reason: string;
            info: string;
            heatingRequest: boolean;
        },
        generation?: number,
    ): Promise<void>;

    /** Subscribe to the currently configured foreign heating actuator. */
    _refreshForeignSubscription(generation?: number): Promise<void>;

    /** Evaluate heating while containing and logging errors. */
    _safeEvaluate(tag: string, generation?: number): Promise<void>;

    /** Clear active timers and reset volatile ownership state. */
    cleanup(): void;
}

/** Lifecycle phases used by helpers that replay observed pre-init events. */
export type BufferedLifecycleState = 'new' | 'initializing' | 'draining' | 'active' | 'stopped';

/** One observed state change retained until helper initialization is complete. */
export interface BufferedStateChange {
    /** Full state id received from the adapter router. */
    id: string;

    /** State snapshot supplied with the observed event. */
    state: ioBroker.State;
}

/** Runtime shape of the situational speech text producer helper. */
export interface SpeechTextHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Current lifecycle phase used to order observed message events. */
    _lifecycleState: BufferedLifecycleState;

    /** Observed message events waiting for initialization to finish. */
    _pendingStateChanges: BufferedStateChange[];

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize state subscriptions for speech text triggers. */
    init(adapter: PoolControlAdapter): void;

    /** Process buffered message events in observation order. */
    _drainPendingStateChanges(): Promise<void>;

    /** React to subscribed state changes and generate situational speech text. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Return whether a state id can produce speech or a related status write. */
    _isMessageEvent(id: string): boolean;

    /** Return whether message processing may continue in the current lifecycle. */
    _canProcessMessages(): boolean;

    /** Process one message-relevant state change. */
    _processStateChange(id: string, state: ioBroker.State): Promise<void>;

    /** Check whether a speech source is enabled and outside its cooldown. */
    _canSendFromSource(source: string): Promise<boolean>;

    /** Send speech text for one source and update its last-sent timestamp. */
    _sendSpeechFromSource(source: string, text: string, canSpeak: boolean): Promise<boolean>;

    /** Write one text to the central speech queue. */
    _sendSpeech(text: string): Promise<void>;

    /** Complete helper cleanup without managed resources. */
    cleanup(): void;
}

/** Last temperature announcement tracked for one subscribed sensor state. */
export interface SpeechTemperatureNotification {
    /** Timestamp of the last announcement. */
    time: number;

    /** Temperature used by the last announcement. */
    temp: number;

    /** Local calendar date of the last announcement, or null before one was sent. */
    date: string | null;
}

/** Runtime shape of the speech output consumer helper. */
export interface SpeechHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: SpeechHelperAdapter | null;

    /** Last temperature announcement details indexed by subscribed state id. */
    lastTempNotify: Record<string, SpeechTemperatureNotification>;

    /** Last observed pump state; currently null until pump-state tracking is used. */
    lastPumpState: null;

    /** Cached Alexa quiet-time state values indexed by their relative state name. */
    quietTime: Record<string, ioBroker.StateValue>;

    /** Initialized adapter instance. */
    readonly adapter: SpeechHelperAdapter;

    /** Initialize subscriptions for speech output and queue processing. */
    init(adapter: SpeechHelperAdapter): void;

    /** React to speech, pump, temperature, and quiet-time state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Check whether Alexa output is currently allowed by the configured quiet time. */
    _isAlexaAllowed(): Promise<boolean>;

    /** Check whether a time lies within a configured quiet-time range. */
    _isTimeInRange(now: string, start: string, end: string): boolean;

    /** Deliver one text through all enabled speech output channels. */
    _speak(text: string): Promise<void>;

    /** Complete helper cleanup without managed resources. */
    cleanup(): void;
}

/** Runtime shape of the consumption and cost tracking helper. */
export interface ConsumptionHelper {
    /** Adapter supplied by init or the independent resetAll entry point. */
    _adapter: ConsumptionHelperAdapter | null;

    /** Whether the current lifecycle generation accepts work. */
    _active: boolean;

    /** Monotonic generation used to invalidate stale asynchronous work. */
    _lifecycleGeneration: number;

    /** Current baseline startup work, or null after startup settles. */
    _initializationPromise: Promise<void> | null;

    /** Configured foreign cumulative energy state id, or null when inactive. */
    energyId: string | null;

    /** Current electricity price in euros per kilowatt-hour. */
    price: number;

    /** Period baselines restored or calculated for active counters. */
    baselines: Partial<Record<'day' | 'week' | 'month' | 'year', number>>;

    /** Active daily reset timeout, or null while unscheduled. */
    resetTimer: ReturnType<ConsumptionHelperAdapter['setTimeout']> | null;

    /** Active weekly reset-check timeout, or null while unscheduled. */
    weeklyResetTimer: ReturnType<ConsumptionHelperAdapter['setTimeout']> | null;

    /** Active monthly reset-check timeout, or null while unscheduled. */
    monthlyResetTimer: ReturnType<ConsumptionHelperAdapter['setTimeout']> | null;

    /** Active yearly reset-check timeout, or null while unscheduled. */
    yearlyResetTimer: ReturnType<ConsumptionHelperAdapter['setTimeout']> | null;

    /** Most recently initialized electricity price. */
    lastKnownPrice: number;

    /** Total-energy baseline used for additive cost calculation. */
    baseTotalKwh: number;

    /** Total-cost baseline used for additive cost calculation. */
    baseTotalEur: number;

    /** Adapter currently used by scheduled and event-driven operations. */
    readonly adapter: ConsumptionHelperAdapter;

    /** Initialize consumption tracking and schedule all period resets. */
    init(adapter: ConsumptionHelperAdapter): void;

    /** Check whether asynchronous work still belongs to the active lifecycle. */
    _isGenerationActive(generation: number): boolean;

    /** Restore additive total-energy and total-cost baselines. */
    _loadCostBaselines(generation?: number): Promise<void>;

    /** Process changes from the configured foreign cumulative energy state. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Recalculate and persist consumption and cost values. */
    _updateConsumption(totalNowRaw: number, generation?: number): Promise<void>;

    /** Derive period baselines from persisted counter values. */
    _loadBaselines(totalNow: number, generation?: number): Promise<void>;

    /** Restore period baselines from persisted consumption states. */
    _restoreBaselinesFromStates(generation?: number): Promise<void>;

    /** Rewrite persisted period counters after an update. */
    _saveBaselines(generation?: number): Promise<void>;

    /** Reset all consumption and cost data using the independently supplied adapter. */
    resetAll(adapter: ConsumptionHelperAdapter): Promise<void>;

    /** Schedule the next daily counter reset. */
    _scheduleDailyReset(generation?: number): void;

    /** Schedule the next weekly reset check. */
    _scheduleWeeklyReset(generation?: number): void;

    /** Schedule the next monthly reset check. */
    _scheduleMonthlyReset(generation?: number): void;

    /** Schedule the next yearly reset check. */
    _scheduleYearlyReset(generation?: number): void;

    /** Clear all active period reset timers. */
    cleanup(): void;
}

/** Runtime shape of the pump runtime and circulation tracking helper. */
export interface RuntimeHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: RuntimeHelperAdapter | null;

    /** Whether an active pump runtime session is being tracked. */
    isRunning: boolean;

    /** Timestamp when the active pump session started, or null while stopped. */
    lastOn: number | null;

    /** Accumulated total pump runtime in seconds. */
    runtimeTotal: number;

    /** Accumulated pump runtime for the current day in seconds. */
    runtimeToday: number;

    /** Accumulated pump runtime for the current season in seconds. */
    runtimeSeason: number;

    /** Number of pump starts counted for the current day. */
    startCountToday: number;

    /** Startup restore delay timeout, or null after restore starts. */
    restoreTimer: ReturnType<RuntimeHelperAdapter['setTimeout']> | null;

    /** Scheduled daily reset timeout, or null while unscheduled. */
    resetTimer: ReturnType<RuntimeHelperAdapter['setTimeout']> | null;

    /** Active live-update interval, or null while the pump is stopped. */
    liveTimer: ReturnType<RuntimeHelperAdapter['setInterval']> | null;

    /** Active pump-state synchronization interval, or null while stopped. */
    syncTimer: ReturnType<RuntimeHelperAdapter['setInterval']> | null;

    /** Daily circulation total observed by the previous plausibility check. */
    lastPlausibilityDailyTotal: number | null;

    /** Timestamp of the previous plausibility check, or null before the first check. */
    lastPlausibilityCheckTs: number | null;

    /** Ungerundeter integrierter Tageswert fuer die heutige Umwaelzmenge. */
    circulationDailyTotal: number;

    /** Zuletzt bekannter Flow, der fuer das vergangene Intervall gilt. */
    previousFlowLh: number | null;

    /** Zeitanker des zuletzt abgeschlossenen Umwaelzintervalls. */
    previousTimestamp: number | null;

    /** Initialized adapter instance. */
    readonly adapter: RuntimeHelperAdapter;

    /** Initialize subscriptions, restore persisted runtimes, and start schedulers. */
    init(adapter: RuntimeHelperAdapter): Promise<void>;

    /** Restore persisted runtime counters and a currently active pump session. */
    _restoreFromStates(): Promise<void>;

    /** React to pump and circulation-related state changes. */
    handleStateChange(
        id: string,
        state:
            | {
                  val: ioBroker.StateValue;
                  ack?: boolean;
              }
            | null
            | undefined,
    ): Promise<void>;

    /** Persist current runtime and circulation values. */
    _updateStates(): Promise<void>;

    /** Normalize the configured minimum circulation factor. */
    _normalizeMinCirculation(value: ioBroker.StateValue | undefined): number | null;

    /** Read and, when required, restore the minimum circulation factor. */
    _readMinCirculation(): Promise<number>;

    /** Recalculate and persist current circulation targets. */
    _updateCirculationTargets(): Promise<{
        dailyRequired: number;
        oldTotal: number;
        remainingFromCurrentTotal: number;
    }>;

    /** Initialize the circulation integration anchor without reconstructing downtime. */
    _initializeCirculationAnchor(nowTs: number): Promise<void>;

    /** Integrate circulation volume up to the given timestamp using the previous flow. */
    _integrateCirculationUntil(nowTs: number, liveFlowLh: number): Promise<number>;

    /** Check whether a timestamp belongs to the same local calendar day as the reference. */
    _isSameLocalDay(timestamp: number | undefined, referenceTs?: number): boolean;

    /** Apply the optional temperature-dependent circulation factor. */
    _calculateEffectiveMinCirculation(baseFactor: number): Promise<{
        effectiveFactor: number;
        active: boolean;
        reason: string;
    }>;

    /** Evaluate and persist circulation plausibility diagnostics. */
    _updateCirculationPlausibility(options: {
        dailyTotal: number;
        oldTotal: number;
        liveFlowLh: number;
        dailyRequired: number;
        effectiveToday: number;
        currentSessionSeconds: number;
    }): Promise<void>;

    /** Format a runtime in seconds for display states. */
    _formatTime(seconds: number): string;

    /** Restore one runtime from numeric seconds or a legacy formatted value. */
    _restoreRuntimeValue(
        secondsRaw: ioBroker.StateValue | undefined,
        formattedRaw: ioBroker.StateValue | undefined,
        stateName: string,
    ): number;

    /** Read whether the pool season is currently active. */
    _isSeasonActive(): Promise<boolean>;

    /** Parse a formatted runtime value into seconds. */
    _parseFormattedTimeToSeconds(value: ioBroker.StateValue | undefined): number;

    /** Schedule the next daily runtime and circulation reset. */
    _scheduleDailyReset(): void;

    /** Start periodic live runtime updates. */
    _startLiveTimer(): void;

    /** Stop periodic live runtime updates. */
    _stopLiveTimer(): void;

    /** Start periodic pump-state synchronization. */
    _startSyncTimer(): void;

    /** Recover a missed pump-start state change. */
    _syncPumpRuntimeState(): Promise<void>;

    /** Clear all managed runtime timers. */
    cleanup(): void;
}

/**
 * Runtime shape of the photovoltaic object-literal helper.
 */
export interface PhotovoltaicHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PhotovoltaicAdapter | null;

    /** Whether the helper currently accepts events and asynchronous work. */
    _active: boolean;

    /** Current initial recalculation, or null after startup settles. */
    _initializationPromise: Promise<void> | null;

    /** Configured foreign PV generation state id, or null before init. */
    genId: string | null;

    /** Configured foreign house consumption state id, or null before init. */
    houseId: string | null;

    /** Active pump afterrun timer, or null while no afterrun is pending. */
    afterrunTimer: ReturnType<PhotovoltaicAdapter['setTimeout']> | null;

    /** Active recalculation debounce timer, or null while no debounce is pending. */
    recalcDebounceTimer: ReturnType<PhotovoltaicAdapter['setTimeout']> | null;

    /** Timestamp until which the PV helper keeps the pump in afterrun mode. */
    _pvPumpHoldUntil: number;

    /** Desired pump state tracked by PV logic; null means no current PV decision. */
    _desiredPump: boolean | null;

    /** Timestamp of the last surplus recalculation. */
    _lastCalc: number;

    /** Whether a recalculation loop is currently running. */
    _recalcRunning: boolean;

    /** Whether another recalculation was requested while one is running. */
    _recalcPending: boolean;

    /** Reason tag for the pending recalculation request. */
    _recalcPendingTag: string;

    /** Sequence number captured for the pending recalculation request. */
    _recalcPendingSeq: number;

    /** Monotonic request sequence used to ignore stale recalculation results. */
    _recalcRequestSeq: number;

    /** Debounce duration for foreign PV/house state updates in milliseconds. */
    _recalcDebounceMs: number;

    /** Initialized adapter instance. */
    readonly adapter: PhotovoltaicAdapter;

    /** Initialize subscriptions and PV configuration. */
    init(adapter: PhotovoltaicAdapter): void;

    /** React to relevant ioBroker state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Recalculate PV surplus and pump decision state. */
    _recalc(_sourceTag?: string, runSeq?: number | null): Promise<void>;

    /** Check whether the circulation control helper currently owns the pump. */
    _isControlHelperPriorityActive(runSeq?: number | null): Promise<boolean>;

    /** Check whether solar-overheat safety may request the pump in the current operating state. */
    _isSolarSafetyAllowed(
        seasonActive: boolean,
        pumpMode: ioBroker.StateValue,
        runSeq?: number | null,
    ): Promise<boolean>;

    /** Check whether an async recalculation still belongs to the latest request. */
    _isLatestRecalc(runSeq: number | null | undefined): boolean;

    /** Start the pump for PV surplus if the recalculation request is still current. */
    _maybeStartPump(reason: string, runSeq?: number | null): Promise<void>;

    /** Stop the pump immediately or afterrun depending on the current PV decision. */
    _maybeStopPump(immediate: boolean, afterrunMin: number, tag: string, runSeq?: number | null): Promise<void>;

    /** Write the pump switch command state. */
    _setPumpSwitch(on: boolean, runSeq?: number | null): Promise<void>;

    /** Claim the active helper state if no other helper currently owns the pump. */
    _setActiveHelperIfAllowed(helperName: string, runSeq?: number | null): Promise<boolean>;

    /** Release the active helper state if it is still owned by the PV helper. */
    _releaseActiveHelperIfOwned(runSeq?: number | null): Promise<void>;

    /** Write a numeric acked state. */
    _updateNumberState(
        id: string,
        val: number | string | boolean | null | undefined,
        runSeq?: number | null,
    ): Promise<void>;

    /** Write a boolean acked state. */
    _updateBoolState(id: string, val: unknown, runSeq?: number | null): Promise<void>;

    /** Write a string acked state. */
    _updateStringState(id: string, val: unknown, runSeq?: number | null): Promise<void>;

    /** Queue and run a recalculation while preserving stale-result protection. */
    _safeRecalc(tag: string): Promise<void>;

    /** Schedule a debounced recalculation after a foreign state update. */
    _scheduleRecalc(tag: string): void;

    /** Clear timers and reset volatile PV helper runtime state. */
    cleanup(): void;
}

/** Regular scheduled modules owned by aiHelper. */
export type AiRegularModule = 'weatherAdvice' | 'dailySummary' | 'poolTips' | 'weekendSummary';

/** All independently executing aiHelper modules. */
export type AiModule = AiRegularModule | 'hourly';

/** Output states written by aiHelper. */
export type AiOutputId = 'weather_advice' | 'daily_summary' | 'pool_tips' | 'weekend_summary';

/** Parsed local execution time. */
export interface AiTime {
    /** Local execution hour. */
    hour: number;

    /** Local execution minute. */
    minute: number;
}

/** Daily values consumed from the Open-Meteo response by aiHelper. */
export interface AiDailyWeather {
    /** Daily maximum temperatures. */
    temperature_2m_max?: number[];

    /** Daily minimum temperatures. */
    temperature_2m_min?: number[];

    /** Daily weather condition codes. */
    weathercode?: number[];
}

/** Current values consumed from the Open-Meteo response by aiHelper. */
export interface AiCurrentWeather {
    /** Current wind speed in kilometers per hour. */
    wind_speed_10m?: number | null;
}

/** Open-Meteo response subset consumed by aiHelper. */
export interface AiWeather {
    /** Current weather values when supplied by the remote API. */
    current?: AiCurrentWeather;

    /** Daily weather values when supplied by the remote API. */
    daily?: AiDailyWeather;
}

/** Values used to build the daily AI summary. */
export interface AiDailySummaryContext {
    /** Current Open-Meteo response, or null when unavailable. */
    weather: AiWeather | null;

    /** Whether the pool season is active. */
    seasonActive: boolean;

    /** Whether the pool pump is running. */
    pumpOn: boolean;

    /** Current pump mode. */
    pumpMode: string;

    /** Current surface temperature, or null when unavailable. */
    surfaceTemp: number | null;
}

/** Generation token for one aiHelper output-producing run. */
export interface AiRunContext {
    /** Module that started the run. */
    module: AiModule;

    /** Output claimed by the run. */
    output: AiOutputId;

    /** Lifecycle generation captured when the run started. */
    lifecycleGeneration: number;

    /** Module generation captured when the run started. */
    moduleGeneration: number;

    /** Latest-started generation claimed for the output. */
    outputGeneration: number;
}

/** Generation token captured by a configured daily timer. */
export interface AiTimerContext {
    /** Scheduled module owned by the timer. */
    module: AiRegularModule;

    /** Lifecycle generation captured when the timer was created. */
    lifecycleGeneration: number;

    /** Refresh generation captured when the timer was created. */
    refreshGeneration: number;

    /** Module generation captured when the timer was created. */
    moduleGeneration: number;

    /** Schedule generation captured when the timer was created. */
    scheduleGeneration: number;
}

/** Restart-safe target keys claimed on the current local day by regular module. */
export type AiCatchupTargets = Partial<Record<AiRegularModule, string[]>>;

/** Runtime shape of the main weather AI helper. */
export interface AiHelper {
    /** Adapter instance after init, null before initialization. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept new work. */
    _active: boolean;

    /** Generation invalidating pending work across lifecycle boundaries. */
    _lifecycleGeneration: number;

    /** Generation allowing only the latest timer refresh to install timers. */
    _refreshGeneration: number;

    /** Independent authorization generations for all modules. */
    _moduleGenerations: Record<AiModule, number>;

    /** Independent schedule generations for regular modules. */
    _scheduleGenerations: Record<AiRegularModule, number>;

    /** Latest-started writer generations for each output. */
    _outputGenerations: Record<AiOutputId, number>;

    /** Generation selecting the latest successfully updated module output for last_message. */
    _lastMessageGeneration: number;

    /** Generation invalidating pending speech authorization. */
    _speechGeneration: number;

    /** Restart-safe latest target keys by regular module. */
    _catchupTargets: AiCatchupTargets;

    /** Cached live value of the global AI master. */
    _masterEnabled: boolean;

    /** Generation preventing an older refresh read from overwriting a live debug change. */
    _debugGeneration: number;

    /** Cached live enable values of the regular modules. */
    _moduleEnabled: Record<AiRegularModule, boolean>;

    /** All active minute and hourly interval handles. */
    timers: Array<ReturnType<PoolControlAdapter['setInterval']>>;

    /** Last observed schedule values used for change logging. */
    _lastScheduleValues: Record<string, ioBroker.StateValue | undefined>;

    /** Cached debug switch. */
    _debugMode: boolean;

    /** Timestamp at which the current helper lifecycle started. */
    _adapterStartedAt: number;

    /** Last weather code recorded by the dormant anti-spam bookkeeping. */
    _lastPoolTipCode: number | null;

    /** Last wind level recorded by the dormant anti-spam bookkeeping. */
    _lastPoolTipWindLevel: number | null;

    /** Timestamp recorded by the dormant anti-spam bookkeeping. */
    _lastPoolTipTimestamp: number;

    /** Initialized adapter instance retained after cleanup. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions, persistent catch-up targets, and timers. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Subscribe to exactly the eleven aiHelper control states. */
    _subscribeStates(): void;

    /** Stop accepting work, invalidate continuations, and clear all timers. */
    cleanup(): void;

    /** Process live master, module, debug, speech, and schedule changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Clear every tracked interval. */
    _clearTimers(): void;

    /** Invalidate all pending module side effects. */
    _invalidateAllWork(): void;

    /** Check whether a timer refresh is still current. */
    _isRefreshCurrent(lifecycleGeneration: number, refreshGeneration: number): boolean;

    /** Rebuild daily and hourly timers from current states. */
    _refreshTimers(): Promise<void>;

    /** Load and configure one regular daily module timer. */
    _configureDailyTimer(
        module: AiRegularModule,
        scheduleId: string,
        defaultTime: string,
        lifecycleGeneration: number,
        refreshGeneration: number,
    ): Promise<boolean>;

    /** Create a guarded minute-check interval for a regular module. */
    _createDailyTimer(
        module: AiRegularModule,
        timeObj: AiTime,
        lifecycleGeneration: number,
        refreshGeneration: number,
    ): void;

    /** Check whether a configured daily timer remains authorized. */
    _isTimerCurrent(
        module: AiRegularModule,
        lifecycleGeneration: number,
        refreshGeneration: number,
        moduleGeneration: number,
        scheduleGeneration: number,
    ): boolean;

    /** Build a local date and target-time key. */
    _buildTargetKey(now: Date, timeObj: AiTime): string;

    /** Restore persistent catch-up target keys. */
    _loadCatchupTargets(): Promise<void>;

    /** Persistently claim one normal or catch-up target. */
    _claimScheduledTarget(module: AiRegularModule, targetKey: string, timerContext: AiTimerContext): Promise<boolean>;

    /** Resolve a regular module from one of its control state ids. */
    _moduleFromStateId(id: string): AiRegularModule | null;

    /** Return the enable-state id for a regular module. */
    _moduleSwitchId(module: AiRegularModule): string;

    /** Check authorization of a delayed schedule-change continuation. */
    _isScheduleChangeCurrent(
        module: AiRegularModule,
        lifecycleGeneration: number,
        scheduleGeneration: number,
        moduleGeneration: number,
    ): boolean;

    /** Execute one selected regular module. */
    _runModule(module: AiRegularModule): Promise<void>;

    /** Claim latest-started ownership of one output. */
    _beginRun(module: AiModule, output: AiOutputId): AiRunContext | null;

    /** Check lifecycle, master, module, and output ownership of a run. */
    _isRunAuthorized(runContext: AiRunContext): boolean;

    /** Generate the regular weather advice. */
    _runWeatherAdvice(): Promise<void>;

    /** Generate the regular daily summary. */
    _runDailySummary(): Promise<void>;

    /** Generate the regular daily pool tips. */
    _runDailyPoolTips(): Promise<void>;

    /** Generate the regular weekend summary. */
    _runWeekendSummary(): Promise<void>;

    /** Refresh weather advice and pool tips under the global master only. */
    _runHourlyUpdate(): Promise<void>;

    /** Preserve the existing unused automatic weather-update entry point. */
    _runWeatherAutoUpdate(): Promise<void>;

    /** Load configured system coordinates. */
    _loadGeoLocation(): Promise<{ lat: number; lon: number } | null>;

    /** Fetch the Open-Meteo response used by aiHelper. */
    _fetchWeather(lat: number, lon: number): Promise<AiWeather | null>;

    /** Build the current weather advice text. */
    _buildWeatherAdviceText(weather: AiWeather | null): string;

    /** Build the current daily summary text. */
    _buildDailySummaryText(context: AiDailySummaryContext): string;

    /** Build the current pool tips text. */
    _buildPoolTipsText(weather: AiWeather | null, seasonActive: boolean): string;

    /** Build the weekend summary text. */
    _buildWeekendSummaryText(weather: AiWeather | null, seasonActive: boolean, weekday: number): string;

    /** Convert an Open-Meteo weather code to German text. */
    _describeWeatherCode(code: number | null): string;

    /** Publish one module output and its authorized last-message mirror. */
    _writeOutput(id: AiOutputId, text: string, runContext: AiRunContext): Promise<boolean>;

    /** Queue authorized speech for a successfully published regular run. */
    _maybeSpeak(text: string, runContext: AiRunContext): Promise<void>;

    /** Read a boolean own state with fallback. */
    _getBool(id: string, fallback: boolean): Promise<boolean>;

    /** Read a string own state with fallback. */
    _getString(id: string, fallback: string): Promise<string>;

    /** Read a numeric own state with fallback. */
    _getNumber(id: string, fallback: number | null): Promise<number | null>;

    /** Parse an HH:mm state value or a validated default. */
    _getTimeOrDefault(id: string, defaultValue: string): Promise<AiTime>;

    /** Read a finite numeric array value. */
    _safeArrayValue(arr: number[] | undefined, index: number): number | null;
}

/** Daily values consumed from the Open-Meteo forecast response. */
export interface AiForecastDailyWeather {
    /** Daily maximum temperatures. */
    temperature_2m_max?: unknown[];

    /** Daily minimum temperatures. */
    temperature_2m_min?: unknown[];

    /** Daily weather condition codes. */
    weathercode?: unknown[];

    /** Daily maximum precipitation probabilities. */
    precipitation_probability_max?: unknown[];

    /** Daily maximum wind speeds. */
    wind_speed_10m_max?: unknown[];
}

/** Open-Meteo response subset consumed by the forecast helper. */
export interface AiForecastWeather {
    /** Daily forecast values when supplied by the remote API. */
    daily?: AiForecastDailyWeather;
}

/** Parsed daily forecast execution time. */
export interface AiForecastTime {
    /** Local execution hour. */
    hour: number;

    /** Local execution minute. */
    minute: number;
}

/** Runtime shape of the tomorrow forecast helper. */
export interface AiForecastHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept new work and create timers. */
    _active: boolean;

    /** Generation used to invalidate stale initialization continuations. */
    _initGeneration: number;

    /** Generation used to invalidate stale timer refreshes and callbacks. */
    _refreshGeneration: number;

    /** Generation used to enforce latest-started forecast publication. */
    _forecastGeneration: number;

    /** Active minute-check interval, or null when forecasting is disabled. */
    timer: ReturnType<PoolControlAdapter['setInterval']> | null;

    /** Cached debug switch used for request logging. */
    _debugMode: boolean;

    /** Initialized adapter instance retained for pending asynchronous work. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions, timer state and the delayed startup forecast. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Subscribe to all forecast control states. */
    _subscribeStates(): void;

    /** Stop accepting work, invalidate pending continuations and clear the interval. */
    cleanup(): void;

    /** React to forecast master, module, speech, debug and schedule changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Rebuild the minute-check interval from the current persisted settings. */
    _refreshTimer(): Promise<void>;

    /** Generate and publish a forecast when master and module switches permit it. */
    _runForecast(): Promise<void>;

    /** Check whether a forecast run is still the current active run. */
    _isCurrentForecast(forecastGeneration: number): boolean;

    /** Build the German tomorrow forecast text from an Open-Meteo response. */
    _buildForecastText(weather: AiForecastWeather): string;

    /** Load configured system coordinates. */
    _loadGeoLocation(): Promise<{ lat: number; lon: number } | null>;

    /** Fetch forecast data from Open-Meteo. */
    _fetchWeather(lat: number, lon: number): Promise<AiForecastWeather | null>;

    /** Write a forecast output state. */
    _writeOutput(id: string, text: string): Promise<void>;

    /** Queue speech when the run and all relevant switches still permit it. */
    _maybeSpeak(text: string, forecastGeneration: number): Promise<void>;

    /** Convert an external weather value to a finite number or null. */
    _safeValue(value: unknown): number | null;

    /** Convert an Open-Meteo weather code to readable German text. */
    _describeWeatherCode(code: number | null): string;

    /** Read a boolean own state with a fallback. */
    _getBool(id: string, fallback: boolean): Promise<boolean>;

    /** Parse an HH:mm state value or a validated default. */
    _getTimeOrDefault(id: string, defaultValue: string): Promise<AiForecastTime>;
}

/** Runtime shape of the informational chemistry help helper. */
export interface AiChemistryHelpHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the current lifecycle may process events and asynchronous continuations. */
    _active: boolean;

    /** Generation used to invalidate asynchronous work from earlier lifecycles. */
    _lifecycleGeneration: number;

    /** Initialization barrier while the current issue is loaded. */
    _initializationPromise: Promise<void> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize the chemistry help subscription and current issue state. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Complete the subscription and authoritative initial issue read. */
    _initialize(generation: number): Promise<void>;

    /** Log completion of the helper cleanup lifecycle. */
    cleanup(): void;

    /** React to chemistry help issue state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Write the help text and timestamp for a selected issue. */
    _processIssue(issue: string, generation?: number): Promise<void>;

    /** Build the informational help text for a selected issue. */
    _getHelpText(issue: string): string;

    /** Write a state only when its value has changed. */
    _setStateIfChanged(id: string, value: string | number | boolean, generation?: number): Promise<void>;

    /** Check whether an asynchronous continuation still belongs to the active lifecycle. */
    _isGenerationActive(generation: number): boolean;
}

/** Runtime shape of the chemistry calculator tools helper. */
export interface ChemistryToolsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Current lifecycle phase used to order observed calculator commands. */
    _lifecycleState: BufferedLifecycleState;

    /** Observed calculator commands waiting for initialization to finish. */
    _pendingStateChanges: BufferedStateChange[];

    /** Initialization barrier for subscriptions, prefill, and command replay. */
    _initPromise: Promise<void> | null;

    /** Initialized adapter instance. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions and prefill calculator input values. */
    init(adapter: PoolControlAdapter): void;

    /** Finish initialization and replay observed commands in order. */
    _completeInitialization(subscriptions: Promise<void>, prefill: Promise<void>): Promise<void>;

    /** Subscribe to calculator inputs and trigger states. */
    _subscribeStates(): Promise<void>;

    /** React to calculator and source state changes. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Return whether an event is one of the three calculator commands. */
    _isCalculatorCommand(id: string, state: ioBroker.State): boolean;

    /** Process one active or buffered calculator state change. */
    _processStateChange(id: string, state: ioBroker.State): Promise<void>;

    /** Prefill empty calculator fields from current pool values. */
    _prefillCalculatorValues(): Promise<void>;

    /** Calculate and write the pH Plus result. */
    _calculatePhPlus(): Promise<void>;

    /** Calculate and write the pH Minus result. */
    _calculatePhMinus(): Promise<void>;

    /** Calculate and write the salt result. */
    _calculateSalt(): Promise<void>;

    /** Validate pH calculator input values. */
    _validateInputs(input: {
        type: 'plus' | 'minus';
        poolVolume: number;
        currentPh: number;
        targetPh: number;
        dosageFactor: number;
    }): { valid: boolean; error: string };

    /** Calculate the required pH product amount in grams. */
    _calculateAmountGrams(currentPh: number, targetPh: number, poolVolume: number, dosageFactor: number): number;

    /** Write a valid pH calculator result. */
    _writeValidResult(base: string, grams: number, resultText: string): Promise<void>;

    /** Write an invalid pH calculator result. */
    _writeInvalidResult(base: string, errorText: string): Promise<void>;

    /** Write a valid salt calculator result. */
    _writeValidSaltResult(base: string, kg: number, resultText: string): Promise<void>;

    /** Write an invalid salt calculator result. */
    _writeInvalidSaltResult(base: string, errorText: string): Promise<void>;

    /** Prefill a numeric state when it has no positive value. */
    _prefillNumberIfEmpty(id: string, newValue: number): Promise<void>;

    /** Read and normalize a numeric calculator state. */
    _readNumber(id: string): Promise<number>;

    /** Write an acknowledged string state when changed. */
    _setString(id: string, value: string): Promise<void>;

    /** Write an acknowledged numeric state when changed. */
    _setNumber(id: string, value: number): Promise<void>;

    /** Write an acknowledged boolean state when changed. */
    _setBool(id: string, value: boolean): Promise<void>;

    /** Complete cleanup while retaining the adapter for pending asynchronous work. */
    cleanup(): void;
}

/** Validated short-term pH history sample. */
export interface ChemistryPhHistorySample {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Formatted local sample time. */
    time: string;

    /** Measured pH value. */
    value: number;
}

/** Validated daily pH history sample. */
export interface ChemistryPhDailyHistorySample {
    /** Local calendar day key. */
    day: string;

    /** Unix timestamp for the start of the local day. */
    ts: number;

    /** Minimum pH value for the day. */
    min: number;

    /** Maximum pH value for the day. */
    max: number;

    /** Average pH value for the day. */
    avg: number;

    /** Most recent pH value for the day. */
    last: number;

    /** Number of values represented by the sample. */
    count: number;
}

/** Sample shape accepted while finding a pH trend reference. */
export interface ChemistryPhReferenceSource {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Short-term history value when present. */
    value?: number;

    /** Daily history value when present. */
    last?: number;

    /** Formatted local sample time when present. */
    time?: string;
}

/** Normalized pH trend reference. */
export interface ChemistryPhReferenceSample {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Reference pH value. */
    value: number;

    /** Formatted local reference time. */
    time: string;
}

/** Result of the pH measurement availability check. */
export interface ChemistryPhMeasurementResult {
    /** Whether the current measurement may be evaluated. */
    allowed: boolean;

    /** Machine-readable reason when evaluation is not allowed. */
    reason: string;

    /** Machine-readable evaluation status. */
    status: string;

    /** User-facing recommendation. */
    recommendation: string;
}

/** Result of evaluating a valid pH value. */
export interface ChemistryPhEvaluation {
    /** Machine-readable pH status. */
    status: string;

    /** Whether user action is recommended. */
    actionRequired: boolean;

    /** User-facing recommendation. */
    recommendation: string;
}

/** Calculated pH trend and its available reference samples. */
export interface ChemistryPhTrend {
    /** Nearest 24-hour reference sample. */
    ref24h: ChemistryPhReferenceSample | null;

    /** Nearest seven-day reference sample. */
    ref7d: ChemistryPhReferenceSample | null;

    /** Nearest 30-day reference sample. */
    ref30d: ChemistryPhReferenceSample | null;

    /** Difference from the 24-hour reference. */
    delta24h: number;

    /** Difference from the seven-day reference. */
    delta7d: number;

    /** Difference from the 30-day reference. */
    delta30d: number;

    /** Overall trend direction. */
    direction: string;

    /** Detailed trend status. */
    status: string;
}

/** Runtime shape of the pH evaluation and process-bound mixing helper. */
export interface ChemistryPhHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept new work and schedule timers. */
    _active: boolean;

    /** Generation used to invalidate stale source loading requests. */
    _sourceRequestId: number;

    /** Shared startup barrier while persisted mixing state is normalized. */
    _initializationPromise: Promise<void> | null;

    /** Currently subscribed foreign pH source state id. */
    sourceStateId: string;

    /** Pending evaluation timeout, or null when no evaluation is scheduled. */
    evalTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Pending mixing timeout, or null when no mixing tick is scheduled. */
    mixTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Unix timestamp at which the current process-bound mixing run ends. */
    mixEndTs: number;

    /** Whether the current mixing run started the pump. */
    mixStartedPump: boolean;

    /** Unix timestamp at which pump stabilization began. */
    pumpStartTs: number;

    /** Initialized adapter instance retained for pending asynchronous work. */
    readonly adapter: PoolControlAdapter;

    /** Initialize subscriptions after normalizing persisted mixing state. */
    init(adapter: PoolControlAdapter): Promise<void>;

    /** Normalize an incomplete process-bound mixing run from a previous process. */
    _normalizePersistedMixState(): Promise<void>;

    /** Subscribe to own pH, pump, and season states. */
    _subscribeStates(): Promise<void>;

    /** Load and subscribe the configured foreign pH source. */
    _loadSourceState(): Promise<void>;

    /** Process a routed state change after the startup barrier. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Check whether an own state change requires reevaluation. */
    _isRelevantOwnState(id: string): boolean;

    /** Replace the configured foreign pH source subscription. */
    _handleSourceStateChanged(newStateId: string): Promise<void>;

    /** Process an incoming foreign pH value when state mode is active. */
    _handleIncomingValue(source: string, rawValue: ioBroker.StateValue): Promise<void>;

    /** Schedule a delayed pH evaluation. */
    _scheduleEvaluation(reason: string, delayMs?: number): void;

    /** Evaluate the currently configured pH source. */
    _evaluate(reason?: string): Promise<void>;

    /** Validate and process a manual or external pH value. */
    _processValue(source: string, rawValue: ioBroker.StateValue, reason: string): Promise<void>;

    /** Check whether current flow and stabilization conditions allow evaluation. */
    _checkMeasurementAllowed(now: Date): Promise<ChemistryPhMeasurementResult>;

    /** Shift current and previous valid pH values. */
    _updateLastValues(value: number, now: Date): Promise<void>;

    /** Update short-term and daily pH history. */
    _updateHistory(
        value: number,
        now: Date,
        forceSample: boolean,
    ): Promise<{ samples: ChemistryPhHistorySample[]; dailySamples: ChemistryPhDailyHistorySample[] }>;

    /** Calculate pH trend references and deltas. */
    _calculateTrend(
        currentValue: number,
        now: Date,
        samples: ChemistryPhHistorySample[],
        dailySamples: ChemistryPhDailyHistorySample[],
    ): Promise<ChemistryPhTrend>;

    /** Find the history sample nearest a target timestamp. */
    _findReferenceSample(
        samples: ChemistryPhReferenceSource[],
        targetTs: number,
        toleranceMs?: number | null,
    ): ChemistryPhReferenceSample | null;

    /** Determine the overall pH trend direction. */
    _getOverallDirection(
        ref24h: ChemistryPhReferenceSample | null,
        ref7d: ChemistryPhReferenceSample | null,
        ref30d: ChemistryPhReferenceSample | null,
        delta24h: number,
        delta7d: number,
        delta30d: number,
    ): string;

    /** Determine the detailed pH trend status. */
    _getTrendStatus(
        delta24h: number,
        delta7d: number,
        delta30d: number,
        ref24h: ChemistryPhReferenceSample | null,
        ref7d: ChemistryPhReferenceSample | null,
        ref30d: ChemistryPhReferenceSample | null,
    ): string;

    /** Write calculated pH trend states. */
    _writeTrend(trend: ChemistryPhTrend): Promise<void>;

    /** Write human-readable and structured pH outputs. */
    _writeOutputs(value: number, trend: ChemistryPhTrend, evaluation: ChemistryPhEvaluation): Promise<void>;

    /** Evaluate a valid pH value against configured limits. */
    _evaluateValue(value: number): Promise<ChemistryPhEvaluation>;

    /** Start a process-bound manual pH mixing run. */
    _startMixingRun(): Promise<void>;

    /** Schedule the next mixing run update. */
    _scheduleMixTick(): void;

    /** Update the current mixing run and finish or reschedule it. */
    _mixTick(): Promise<void>;

    /** Finish the current mixing run while preserving pump ownership. */
    _finishMixingRun(): Promise<void>;

    /** Clear the pending mixing timeout. */
    _clearMixTimer(): void;

    /** Read a state as a normalized string. */
    _readString(id: string): Promise<string>;

    /** Read a state as a normalized number. */
    _readNumber(id: string): Promise<number>;

    /** Read a state as a number or null. */
    _readNumberOrNull(id: string): Promise<number | null>;

    /** Read a numeric or legacy-formatted timestamp. */
    _readTimestampOrNull(id: string): Promise<number | null>;

    /** Update bounded daily pH history. */
    _updateDailyHistory(
        shortTermSamples: ChemistryPhHistorySample[],
        value: number,
        now: Date,
        sampleStored: boolean,
    ): Promise<ChemistryPhDailyHistorySample[]>;

    /** Add a value to its daily aggregate. */
    _addDailySample(dailySamples: ChemistryPhDailyHistorySample[], sampleTs: number, value: number): void;

    /** Read and validate daily pH history JSON. */
    _readDailyJson(id: string): Promise<ChemistryPhDailyHistorySample[]>;

    /** Limit daily pH history by sample count and encoded size. */
    _prepareDailyHistoryForWrite(
        samples: ChemistryPhDailyHistorySample[],
        id: string,
    ): { samples: ChemistryPhDailyHistorySample[]; json: string };

    /** Build the local calendar day key for a timestamp. */
    _dayKey(ts: number): string;

    /** Build the local start-of-day timestamp. */
    _dayStartTs(ts: number): number;

    /** Read and validate short-term pH history JSON. */
    _readJsonArray(id: string): Promise<ChemistryPhHistorySample[]>;

    /** Limit short-term pH history by sample count and encoded size. */
    _prepareHistoryForWrite(
        samples: ChemistryPhHistorySample[],
        id: string,
    ): { samples: ChemistryPhHistorySample[]; json: string };

    /** Read a state as a normalized boolean. */
    _readBoolean(id: string): Promise<boolean>;

    /** Write an acknowledged string state when changed. */
    _setString(id: string, value: unknown): Promise<void>;

    /** Write an acknowledged numeric state when changed. */
    _setNumber(id: string, value: unknown): Promise<void>;

    /** Write an acknowledged boolean state when changed. */
    _setBool(id: string, value: unknown): Promise<void>;

    /** Format a signed pH delta. */
    _formatDelta(value: number): string;

    /** Format a date for the persisted history display field. */
    _formatDateTime(date: Date): string;

    /** Parse a legacy German date-time value. */
    _parseGermanDateTime(value: ioBroker.StateValue | undefined): Date | null;

    /** Escape a value for safe inclusion in pH summary HTML. */
    _escapeHtml(value: unknown): string;

    /** Stop timers and reject new work while retaining the adapter. */
    cleanup(): void;
}

/** Validated short-term ORP history sample. */
export interface ChemistryOrpHistorySample {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Formatted local sample time. */
    time: string;

    /** Measured ORP value in millivolts. */
    value: number;
}

/** Validated daily ORP history sample. */
export interface ChemistryOrpDailyHistorySample {
    /** Local calendar day key. */
    day: string;

    /** Unix timestamp for the start of the local day. */
    ts: number;

    /** Minimum ORP value for the day. */
    min: number;

    /** Maximum ORP value for the day. */
    max: number;

    /** Average ORP value for the day. */
    avg: number;

    /** Most recent ORP value for the day. */
    last: number;

    /** Number of values represented by the sample. */
    count: number;
}

/** Sample shape accepted while finding an ORP trend reference. */
export interface ChemistryOrpReferenceSource {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Short-term history value when present. */
    value?: number;

    /** Daily history value when present. */
    last?: number;

    /** Formatted local sample time when present. */
    time?: string;
}

/** Normalized ORP trend reference. */
export interface ChemistryOrpReferenceSample {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Reference ORP value in millivolts. */
    value: number;

    /** Formatted local reference time. */
    time: string;
}

/** Result of the ORP measurement availability check. */
export interface ChemistryOrpMeasurementResult {
    /** Whether the current measurement may be evaluated. */
    allowed: boolean;

    /** Machine-readable reason when evaluation is not allowed. */
    reason: string;

    /** Machine-readable evaluation status. */
    status: string;

    /** User-facing recommendation. */
    recommendation: string;
}

/** Current pH context used while interpreting an ORP value. */
export interface ChemistryOrpPhReference {
    /** Whether pH evaluation is enabled. */
    enabled: boolean;

    /** Current pH reference value. */
    value: number;

    /** Machine-readable pH reference status. */
    status: string;

    /** Whether the pH reference may be used for ORP interpretation. */
    usable: boolean;
}

/** Result of evaluating a valid ORP value. */
export interface ChemistryOrpEvaluation {
    /** Machine-readable ORP status. */
    status: string;

    /** Evaluation severity level. */
    level: string;

    /** Whether user action is recommended. */
    actionRequired: boolean;

    /** User-facing recommendation. */
    recommendation: string;
}

/** Calculated ORP trend and its available reference samples. */
export interface ChemistryOrpTrend {
    /** Nearest 24-hour reference sample. */
    ref24h: ChemistryOrpReferenceSample | null;

    /** Nearest seven-day reference sample. */
    ref7d: ChemistryOrpReferenceSample | null;

    /** Nearest 30-day reference sample. */
    ref30d: ChemistryOrpReferenceSample | null;

    /** Difference from the 24-hour reference. */
    delta24h: number;

    /** Difference from the seven-day reference. */
    delta7d: number;

    /** Difference from the 30-day reference. */
    delta30d: number;

    /** Overall trend direction. */
    direction: string;

    /** Detailed trend status. */
    status: string;
}

/** Runtime shape of the ORP evaluation helper. */
export interface ChemistryOrpHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept new work and schedule timers. */
    _active: boolean;

    /** Generation used to invalidate stale source loading requests. */
    _sourceRequestId: number;

    /** Currently subscribed foreign ORP source state id. */
    sourceStateId: string;

    /** Pending evaluation timeout, or null when no evaluation is scheduled. */
    evalTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Unix timestamp at which pump stabilization began. */
    pumpStartTs: number;

    /** Initialized adapter instance retained for pending asynchronous work. */
    readonly adapter: PoolControlAdapter;

    /** Initialize ORP subscriptions, source loading and evaluation. */
    init(adapter: PoolControlAdapter): void;

    /** Subscribe to own ORP, pH, pump and season states. */
    _subscribeStates(): Promise<void>;

    /** Load and subscribe the configured foreign ORP source. */
    _loadSourceState(): Promise<void>;

    /** Process a routed state change while the helper is active. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Check whether an own state change requires reevaluation. */
    _isRelevantOwnState(id: string): boolean;

    /** Replace the configured foreign ORP source subscription. */
    _handleSourceStateChanged(newStateId: string): Promise<void>;

    /** Process an incoming ORP value when its source mode is active. */
    _handleIncomingValue(source: string, rawValue: ioBroker.StateValue, reason: string): Promise<void>;

    /** Schedule a delayed ORP evaluation. */
    _scheduleEvaluation(reason: string, delayMs?: number): void;

    /** Evaluate the currently configured ORP source. */
    _evaluate(reason?: string): Promise<void>;

    /** Validate and process a manual or external ORP value. */
    _processValue(source: string, rawValue: ioBroker.StateValue, reason: string, forceSample: boolean): Promise<void>;

    /** Check whether current flow and stabilization conditions allow evaluation. */
    _checkMeasurementAllowed(now: Date): Promise<ChemistryOrpMeasurementResult>;

    /** Update the pH reference used for ORP interpretation. */
    _updatePhReference(): Promise<ChemistryOrpPhReference>;

    /** Shift current and previous valid ORP values. */
    _updateLastValues(value: number, now: Date): Promise<void>;

    /** Update short-term and daily ORP history. */
    _updateHistory(
        value: number,
        now: Date,
        forceSample: boolean,
    ): Promise<{ samples: ChemistryOrpHistorySample[]; dailySamples: ChemistryOrpDailyHistorySample[] }>;

    /** Calculate ORP trend references and deltas. */
    _calculateTrend(
        currentValue: number,
        now: Date,
        samples: ChemistryOrpHistorySample[],
        dailySamples: ChemistryOrpDailyHistorySample[],
    ): Promise<ChemistryOrpTrend>;

    /** Find the history sample nearest a target timestamp. */
    _findReferenceSample(
        samples: ChemistryOrpReferenceSource[],
        targetTs: number,
        toleranceMs?: number | null,
    ): ChemistryOrpReferenceSample | null;

    /** Determine the overall ORP trend direction. */
    _getOverallDirection(
        ref24h: ChemistryOrpReferenceSample | null,
        ref7d: ChemistryOrpReferenceSample | null,
        ref30d: ChemistryOrpReferenceSample | null,
        delta24h: number,
        delta7d: number,
        delta30d: number,
    ): string;

    /** Determine the detailed ORP trend status. */
    _getTrendStatus(
        delta24h: number,
        delta7d: number,
        delta30d: number,
        ref24h: ChemistryOrpReferenceSample | null,
        ref7d: ChemistryOrpReferenceSample | null,
        ref30d: ChemistryOrpReferenceSample | null,
    ): string;

    /** Write calculated ORP trend states. */
    _writeTrend(trend: ChemistryOrpTrend): Promise<void>;

    /** Evaluate a valid ORP value using its pH context. */
    _evaluateOrp(value: number, phReference: ChemistryOrpPhReference | null): Promise<ChemistryOrpEvaluation>;

    /** Write ORP evaluation states. */
    _writeEvaluation(evaluation: ChemistryOrpEvaluation): Promise<void>;

    /** Write human-readable and structured ORP outputs. */
    _writeOutputs(
        value: number,
        phReference: ChemistryOrpPhReference | null,
        trend: ChemistryOrpTrend | null,
        evaluation: ChemistryOrpEvaluation,
    ): Promise<void>;

    /** Write the disabled ORP state. */
    _writeDisabled(reason: string): Promise<void>;

    /** Write an invalid ORP state. */
    _writeInvalid(recommendation: string, reason: string): Promise<void>;

    /** Read a state as a normalized string. */
    _readString(id: string): Promise<string>;

    /** Read a state as a normalized number. */
    _readNumber(id: string): Promise<number>;

    /** Read a state as a number or null. */
    _readNumberOrNull(id: string): Promise<number | null>;

    /** Read a numeric or legacy-formatted timestamp. */
    _readTimestampOrNull(id: string): Promise<number | null>;

    /** Read a state as a normalized boolean. */
    _readBoolean(id: string): Promise<boolean>;

    /** Update bounded daily ORP history. */
    _updateDailyHistory(
        shortTermSamples: ChemistryOrpHistorySample[],
        value: number,
        now: Date,
        sampleStored: boolean,
    ): Promise<ChemistryOrpDailyHistorySample[]>;

    /** Add a value to its daily aggregate. */
    _addDailySample(dailySamples: ChemistryOrpDailyHistorySample[], sampleTs: number, value: number): void;

    /** Read and validate daily ORP history JSON. */
    _readDailyJson(id: string): Promise<ChemistryOrpDailyHistorySample[]>;

    /** Limit daily ORP history by sample count and encoded size. */
    _prepareDailyHistoryForWrite(
        samples: ChemistryOrpDailyHistorySample[],
        id: string,
    ): { samples: ChemistryOrpDailyHistorySample[]; json: string };

    /** Build the local calendar day key for a timestamp. */
    _dayKey(ts: number): string;

    /** Build the local start-of-day timestamp. */
    _dayStartTs(ts: number): number;

    /** Read and validate short-term ORP history JSON. */
    _readJsonArray(id: string): Promise<ChemistryOrpHistorySample[]>;

    /** Limit short-term ORP history by sample count and encoded size. */
    _prepareHistoryForWrite(
        samples: ChemistryOrpHistorySample[],
        id: string,
    ): { samples: ChemistryOrpHistorySample[]; json: string };

    /** Write an acknowledged string state when changed. */
    _setString(id: string, value: unknown): Promise<void>;

    /** Write an acknowledged numeric state when changed. */
    _setNumber(id: string, value: unknown): Promise<void>;

    /** Write an acknowledged boolean state when changed. */
    _setBool(id: string, value: unknown): Promise<void>;

    /** Format a signed ORP delta. */
    _formatDelta(value: number): string;

    /** Format a date for the persisted history display field. */
    _formatDateTime(date: Date): string;

    /** Parse a legacy German date-time value. */
    _parseGermanDateTime(value: ioBroker.StateValue | undefined): Date | null;

    /** Escape a value for safe inclusion in ORP summary HTML. */
    _escapeHtml(value: unknown): string;

    /** Stop new work and timers while retaining the adapter. */
    cleanup(): void;
}

/** Validated short-term TDS history sample. */
export interface ChemistryTdsHistorySample {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Formatted local sample time. */
    time: string;

    /** Measured TDS value in parts per million. */
    value: number;
}

/** Validated daily TDS history sample. */
export interface ChemistryTdsDailyHistorySample {
    /** Local calendar day key. */
    day: string;

    /** Unix timestamp for the start of the local day. */
    ts: number;

    /** Minimum TDS value for the day. */
    min: number;

    /** Maximum TDS value for the day. */
    max: number;

    /** Average TDS value for the day. */
    avg: number;

    /** Most recent TDS value for the day. */
    last: number;

    /** Number of values represented by the sample. */
    count: number;
}

/** Sample shape accepted while finding a TDS trend reference. */
export interface ChemistryTdsReferenceSource {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Short-term history value when present. */
    value?: number;

    /** Daily history value when present. */
    last?: number;

    /** Formatted local sample time when present. */
    time?: string;
}

/** Normalized TDS trend reference. */
export interface ChemistryTdsReferenceSample {
    /** Unix timestamp in milliseconds. */
    ts: number;

    /** Reference TDS value in parts per million. */
    value: number;

    /** Formatted local reference time. */
    time: string;
}

/** Result of the TDS measurement availability check. */
export interface ChemistryTdsMeasurementResult {
    /** Whether the current measurement may be evaluated. */
    allowed: boolean;

    /** Machine-readable reason when evaluation is not allowed. */
    reason: string;

    /** Machine-readable evaluation status. */
    status: string;

    /** User-facing recommendation. */
    recommendation: string;
}

/** Current persistent TDS reference and calculated difference. */
export interface ChemistryTdsReferenceResult {
    /** Initial reference value in parts per million. */
    initialValue: number;

    /** Whether the initial reference is marked as set. */
    initialSet: boolean;

    /** Difference from the initial reference. */
    delta: number;
}

/** Result of evaluating a valid TDS value. */
export interface ChemistryTdsEvaluation {
    /** Classification of the absolute TDS value. */
    absoluteLevel: string;

    /** Classification relative to the initial reference. */
    referenceLevel: string;

    /** Combined TDS evaluation status. */
    overallStatus: string;

    /** Whether user action is recommended. */
    actionRequired: boolean;

    /** User-facing recommendation. */
    recommendation: string;
}

/** Calculated TDS trend and its available reference samples. */
export interface ChemistryTdsTrend {
    /** Nearest 24-hour reference sample. */
    ref24h: ChemistryTdsReferenceSample | null;

    /** Nearest seven-day reference sample. */
    ref7d: ChemistryTdsReferenceSample | null;

    /** Nearest 30-day reference sample. */
    ref30d: ChemistryTdsReferenceSample | null;

    /** Difference from the 24-hour reference. */
    delta24h: number;

    /** Difference from the seven-day reference. */
    delta7d: number;

    /** Difference from the 30-day reference. */
    delta30d: number;

    /** Overall trend direction. */
    direction: string;

    /** Detailed trend status. */
    status: string;
}

/** Runtime shape of the TDS evaluation helper. */
export interface ChemistryTdsHelper {
    /** Adapter instance after init, null before the helper is initialized. */
    _adapter: PoolControlAdapter | null;

    /** Whether the helper may accept new work and schedule timers. */
    _active: boolean;

    /** Generation used to invalidate stale source loading requests. */
    _sourceRequestId: number;

    /** Currently subscribed foreign TDS source state id. */
    sourceStateId: string;

    /** Pending evaluation timeout, or null when no evaluation is scheduled. */
    evalTimer: ReturnType<PoolControlAdapter['setTimeout']> | null;

    /** Unix timestamp at which pump stabilization began. */
    pumpStartTs: number;

    /** Initialized adapter instance retained for pending asynchronous work. */
    readonly adapter: PoolControlAdapter;

    /** Initialize TDS subscriptions, source loading and evaluation. */
    init(adapter: PoolControlAdapter): void;

    /** Subscribe to own TDS, pump and season states. */
    _subscribeStates(): Promise<void>;

    /** Load and subscribe the configured foreign TDS source. */
    _loadSourceState(): Promise<void>;

    /** Process a routed state change while the helper is active. */
    handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void>;

    /** Check whether an own state change requires reevaluation. */
    _isRelevantOwnState(id: string): boolean;

    /** Replace the configured foreign TDS source subscription. */
    _handleSourceStateChanged(newStateId: string): Promise<void>;

    /** Process an incoming TDS value when its source mode is active. */
    _handleIncomingValue(source: string, rawValue: ioBroker.StateValue, reason: string): Promise<void>;

    /** Schedule a delayed TDS evaluation. */
    _scheduleEvaluation(reason: string, delayMs?: number): void;

    /** Evaluate the currently configured TDS source. */
    _evaluate(reason?: string): Promise<void>;

    /** Validate and process a manual or external TDS value. */
    _processValue(source: string, rawValue: ioBroker.StateValue, reason: string, forceSample: boolean): Promise<void>;

    /** Check whether current flow and stabilization conditions allow evaluation. */
    _checkMeasurementAllowed(now: Date): Promise<ChemistryTdsMeasurementResult>;

    /** Shift current and previous valid TDS values. */
    _updateLastValues(value: number, now: Date): Promise<void>;

    /** Update short-term and daily TDS history. */
    _updateHistory(
        value: number,
        now: Date,
        forceSample: boolean,
    ): Promise<{ samples: ChemistryTdsHistorySample[]; dailySamples: ChemistryTdsDailyHistorySample[] }>;

    /** Update the persistent initial TDS reference. */
    _updateReference(value: number, now: Date): Promise<ChemistryTdsReferenceResult>;

    /** Set the latest valid TDS value as initial reference. */
    _setCurrentAsInitialReference(): Promise<void>;

    /** Calculate TDS trend references and deltas. */
    _calculateTrend(
        currentValue: number,
        now: Date,
        samples: ChemistryTdsHistorySample[],
        dailySamples: ChemistryTdsDailyHistorySample[],
    ): Promise<ChemistryTdsTrend>;

    /** Find the history sample nearest a target timestamp. */
    _findReferenceSample(
        samples: ChemistryTdsReferenceSource[],
        targetTs: number,
        toleranceMs?: number | null,
    ): ChemistryTdsReferenceSample | null;

    /** Determine the overall TDS trend direction. */
    _getOverallDirection(
        ref24h: ChemistryTdsReferenceSample | null,
        ref7d: ChemistryTdsReferenceSample | null,
        ref30d: ChemistryTdsReferenceSample | null,
        delta24h: number,
        delta7d: number,
        delta30d: number,
    ): string;

    /** Determine the detailed TDS trend status. */
    _getTrendStatus(
        delta24h: number,
        delta7d: number,
        delta30d: number,
        ref24h: ChemistryTdsReferenceSample | null,
        ref7d: ChemistryTdsReferenceSample | null,
        ref30d: ChemistryTdsReferenceSample | null,
    ): string;

    /** Write calculated TDS trend states. */
    _writeTrend(trend: ChemistryTdsTrend): Promise<void>;

    /** Evaluate a valid TDS value using its reference and trend. */
    _evaluateTds(
        value: number,
        reference: ChemistryTdsReferenceResult,
        trend: ChemistryTdsTrend,
    ): Promise<ChemistryTdsEvaluation>;

    /** Write TDS evaluation states. */
    _writeEvaluation(evaluation: ChemistryTdsEvaluation): Promise<void>;

    /** Write human-readable and structured TDS outputs. */
    _writeOutputs(
        value: number,
        reference: ChemistryTdsReferenceResult,
        trend: ChemistryTdsTrend,
        evaluation: ChemistryTdsEvaluation,
    ): Promise<void>;

    /** Write the disabled TDS state. */
    _writeDisabled(reason: string): Promise<void>;

    /** Write an invalid TDS state. */
    _writeInvalid(recommendation: string, reason: string): Promise<void>;

    /** Read a state as a normalized string. */
    _readString(id: string): Promise<string>;

    /** Read a state as a normalized number. */
    _readNumber(id: string): Promise<number>;

    /** Read a state as a number or null. */
    _readNumberOrNull(id: string): Promise<number | null>;

    /** Read a numeric or legacy-formatted timestamp. */
    _readTimestampOrNull(id: string): Promise<number | null>;

    /** Read a state as a normalized boolean. */
    _readBoolean(id: string): Promise<boolean>;

    /** Update bounded daily TDS history. */
    _updateDailyHistory(
        shortTermSamples: ChemistryTdsHistorySample[],
        value: number,
        now: Date,
        sampleStored: boolean,
    ): Promise<ChemistryTdsDailyHistorySample[]>;

    /** Add a value to its daily aggregate. */
    _addDailySample(dailySamples: ChemistryTdsDailyHistorySample[], sampleTs: number, value: number): void;

    /** Read and validate daily TDS history JSON. */
    _readDailyJson(id: string): Promise<ChemistryTdsDailyHistorySample[]>;

    /** Limit daily TDS history by sample count and encoded size. */
    _prepareDailyHistoryForWrite(
        samples: ChemistryTdsDailyHistorySample[],
        id: string,
    ): { samples: ChemistryTdsDailyHistorySample[]; json: string };

    /** Build the local calendar day key for a timestamp. */
    _dayKey(ts: number): string;

    /** Build the local start-of-day timestamp. */
    _dayStartTs(ts: number): number;

    /** Read and validate short-term TDS history JSON. */
    _readJsonArray(id: string): Promise<ChemistryTdsHistorySample[]>;

    /** Limit short-term TDS history by sample count and encoded size. */
    _prepareHistoryForWrite(
        samples: ChemistryTdsHistorySample[],
        id: string,
    ): { samples: ChemistryTdsHistorySample[]; json: string };

    /** Write an acknowledged string state when changed. */
    _setString(id: string, value: unknown): Promise<void>;

    /** Write an acknowledged numeric state when changed. */
    _setNumber(id: string, value: unknown): Promise<void>;

    /** Write an acknowledged boolean state when changed. */
    _setBool(id: string, value: unknown): Promise<void>;

    /** Format a signed TDS delta. */
    _formatDelta(value: number): string;

    /** Format a date for the persisted history display field. */
    _formatDateTime(date: Date): string;

    /** Parse a legacy German date-time value. */
    _parseGermanDateTime(value: ioBroker.StateValue | undefined): Date | null;

    /** Escape a value for safe inclusion in TDS summary HTML. */
    _escapeHtml(value: unknown): string;

    /** Stop new work and timers while retaining the adapter. */
    cleanup(): void;
}

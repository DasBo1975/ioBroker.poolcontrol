'use strict';

/**
 * controlHelper
 * - Steuert Wartungsmodus, Rückspülung, Energie-Reset, Saison
 * - Führt tägliche Umwälzprüfung (z. B. 18:00 Uhr) durch
 * - Automatisches Nachpumpen, wenn Tagesziel nicht erreicht
 * - Sendet Statusmeldungen über speech.queue
 * - Nutzt Vorrangsteuerung über pump.mode = "controlHelper"
 */

let adapter;
let backwashTimer = null;
let dailyTimer = null;
let autoPumpingInterval = null; // FIX
let previousMaintenancePumpMode = null;
let previousAutoPumpingPumpMode = null;
let autoCirculationInProgress = false;
let active = false;
let initialized = false;
let drainingEvents = false;
let acceptsPreInitEvents = true;
let lifecycleGeneration = 0;
const pendingControlEvents = [];

const MAINTENANCE_RESTORE_STATE = 'control.pump.maintenance_restore_mode';
const VALID_USER_PUMP_MODES = new Set(['auto', 'auto_pv', 'manual', 'off', 'time']);

/**
 * Initialisiert den Control-Helper.
 *
 * @param {ioBroker.Adapter} a - ioBroker Adapterinstanz
 */
function init(a) {
    adapter = a;
    active = true;
    initialized = false;
    drainingEvents = false;
    acceptsPreInitEvents = true;
    const generation = ++lifecycleGeneration;
    adapter.log.info('[controlHelper] initialized');

    // States abonnieren
    adapter.subscribeStates('control.season.active');
    adapter.subscribeStates('control.pump.backwash_start');
    adapter.subscribeStates('control.pump.maintenance_active');
    adapter.subscribeStates('control.energy.reset');
    adapter.subscribeStates('control.circulation.check_time');

    // Täglichen Check planen
    const dailyCheck = _scheduleDailyCheck(generation);
    const maintenanceRestore = _recoverMaintenanceRestoreAfterRestart(generation);
    void _completeInitialization(dailyCheck, maintenanceRestore, generation);

    adapter.log.debug('[controlHelper] monitoring of control states enabled');
}

function _isActiveGeneration(generation) {
    return active && generation === lifecycleGeneration;
}

function _isBufferedEvent(id, state) {
    if (!state || state.ack) {
        return false;
    }

    return (
        id.endsWith('control.season.active') ||
        id.endsWith('control.pump.maintenance_active') ||
        (id.endsWith('control.pump.backwash_start') && state.val === true) ||
        (id.endsWith('control.energy.reset') && state.val === true)
    );
}

async function _completeInitialization(dailyCheck, maintenanceRestore, generation) {
    try {
        await Promise.all([dailyCheck, maintenanceRestore]);
        if (!_isActiveGeneration(generation)) {
            return;
        }

        drainingEvents = true;
        while (_isActiveGeneration(generation) && pendingControlEvents.length) {
            const pending = pendingControlEvents.shift();
            if (pending) {
                try {
                    await _processStateChange(pending.id, pending.state, generation);
                } finally {
                    pending.complete?.();
                }
            }
        }

        if (_isActiveGeneration(generation)) {
            drainingEvents = false;
            initialized = true;
        }
    } catch (err) {
        adapter?.log.warn(`[controlHelper] initialization failed: ${err.message}`);
        if (generation === lifecycleGeneration) {
            _discardPendingControlEvents();
        }
    }
}

function _discardPendingControlEvents() {
    while (pendingControlEvents.length) {
        pendingControlEvents.shift()?.complete?.();
    }
}

function _isValidUserPumpMode(mode) {
    return typeof mode === 'string' && VALID_USER_PUMP_MODES.has(mode);
}

function _getSafeRestoreMode(mode, context) {
    if (_isValidUserPumpMode(mode)) {
        return mode;
    }

    adapter.log.warn(
        `[controlHelper] invalid pump mode restore value for ${context}: ${String(mode)}. Falling back to off.`,
    );
    return 'off';
}

async function _readValidPumpModeOrFallback(context) {
    const mode = (await adapter.getStateAsync('pump.mode'))?.val;
    return _getSafeRestoreMode(mode, context);
}

async function _resolveRestoreMode(candidate, context) {
    if (_isValidUserPumpMode(candidate)) {
        return candidate;
    }

    const currentMode = (await adapter.getStateAsync('pump.mode'))?.val;
    if (_isValidUserPumpMode(currentMode)) {
        adapter.log.warn(
            `[controlHelper] missing pump mode restore value for ${context}. Keeping current user mode ${currentMode}.`,
        );
        return currentMode;
    }

    return _getSafeRestoreMode(candidate, context);
}

async function _readStoredMaintenanceRestoreMode() {
    return (await adapter.getStateAsync(MAINTENANCE_RESTORE_STATE))?.val;
}

async function _storeMaintenanceRestoreMode(mode) {
    if (!_isValidUserPumpMode(mode)) {
        adapter.log.warn(
            `[controlHelper] refused to store invalid maintenance restore mode: ${String(mode)}. Storing off.`,
        );
        mode = 'off';
    }

    await adapter.setStateAsync(MAINTENANCE_RESTORE_STATE, { val: mode, ack: true });
}

async function _clearMaintenanceRestoreMode() {
    await adapter.setStateAsync(MAINTENANCE_RESTORE_STATE, { val: '', ack: true });
}

async function _recoverMaintenanceRestoreAfterRestart(generation = lifecycleGeneration) {
    const storedMode = await _readStoredMaintenanceRestoreMode();
    if (!_isActiveGeneration(generation)) {
        return;
    }
    if (!_isValidUserPumpMode(storedMode)) {
        return;
    }

    const pumpMode = (await adapter.getStateAsync('pump.mode'))?.val;
    if (!_isActiveGeneration(generation)) {
        return;
    }
    const maintenanceActive = !!(await adapter.getStateAsync('control.pump.maintenance_active'))?.val;
    if (!_isActiveGeneration(generation)) {
        return;
    }

    if (pumpMode !== 'controlHelper') {
        return;
    }

    if (maintenanceActive) {
        previousMaintenancePumpMode = storedMode;
        adapter.log.info('[controlHelper] restored maintenance return mode after adapter restart.');
        return;
    }

    await adapter.setStateAsync('pump.mode', { val: storedMode, ack: true });
    if (!_isActiveGeneration(generation)) {
        return;
    }
    await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
    if (!_isActiveGeneration(generation)) {
        return;
    }
    await adapter.setStateAsync('pump.reason', { val: '', ack: true });
    if (!_isActiveGeneration(generation)) {
        return;
    }
    await _clearMaintenanceRestoreMode();
    previousMaintenancePumpMode = null;
    adapter.log.info('[controlHelper] restored pump mode after interrupted maintenance state.');
}

/**
 * Plant den täglichen Umwälzungscheck neu.
 *
 * @param {number} generation Aktuelle Lifecycle-Generation
 */
async function _scheduleDailyCheck(generation = lifecycleGeneration) {
    try {
        if (!_isActiveGeneration(generation)) {
            return;
        }

        if (dailyTimer) {
            adapter.clearTimeout(dailyTimer);
        }

        const timeStr = (await adapter.getStateAsync('control.circulation.check_time'))?.val || '18:00';
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const [hours, minutes] = timeStr.split(':').map(x => parseInt(x, 10));

        const now = new Date();
        const next = new Date();
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const diffMs = next - now;
        adapter.log.debug(`[controlHelper] next daily circulation check scheduled for ${next.toLocaleTimeString()}`);

        dailyTimer = adapter.setTimeout(async () => {
            if (!_isActiveGeneration(generation)) {
                return;
            }
            await _runDailyCirculationCheck(generation);
            if (_isActiveGeneration(generation)) {
                await _scheduleDailyCheck(generation);
            }
        }, diffMs);
    } catch (err) {
        adapter?.log.error(`[controlHelper] error in _scheduleDailyCheck(): ${err.message}`);
    }
}

/**
 * Führt den täglichen Umwälzungsbericht und ggf. Nachpumpen aus.
 *
 * @param {number} generation Aktuelle Lifecycle-Generation
 */
async function _runDailyCirculationCheck(generation = lifecycleGeneration) {
    try {
        if (!_isActiveGeneration(generation)) {
            return;
        }
        adapter.log.debug('[controlHelper] starting daily circulation check ...');

        const seasonActive = (await adapter.getStateAsync('status.season_active'))?.val;
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const mode = (await adapter.getStateAsync('control.circulation.mode'))?.val || 'off';
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const maintenanceActive = !!(await adapter.getStateAsync('control.pump.maintenance_active'))?.val;
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const solarControlActive = (await adapter.getStateAsync('solar.solar_control_active'))?.val === true;
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const dailyTotal = Math.round((await adapter.getStateAsync('circulation.daily_total'))?.val || 0);
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const dailyRequired = Math.round((await adapter.getStateAsync('circulation.daily_required'))?.val || 0);
        if (!_isActiveGeneration(generation)) {
            return;
        }

        // FIX: Treat missing, empty or non-numeric temperature values as invalid instead of silently using 0.
        const readOptionalNumber = async stateId => {
            const value = (await adapter.getStateAsync(stateId))?.val;
            if (value === null || value === undefined || value === '') {
                return null;
            }

            const numberValue = Number(value);
            return Number.isFinite(numberValue) ? numberValue : null;
        };

        const collector = await readOptionalNumber('temperature.collector.current');
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const pool = await readOptionalNumber('temperature.surface.current');
        if (!_isActiveGeneration(generation)) {
            return;
        }

        if (!seasonActive) {
            adapter.log.debug('[controlHelper] season inactive - daily check skipped.');
            return;
        }

        if (maintenanceActive) {
            adapter.log.debug('[controlHelper] maintenance active - daily circulation check skipped.');
            return;
        }

        if (!dailyRequired || dailyRequired <= 0) {
            await _sendSpeech('Keine Zielumwälzmenge festgelegt – Tagesbericht übersprungen.', generation);
            return;
        }

        const percent = Math.min(100, Math.round((dailyTotal / dailyRequired) * 100));
        const missing = Math.max(0, Math.round(dailyRequired - dailyTotal));
        let message = '';

        switch (mode) {
            case 'notify':
                message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Es fehlen noch ${missing} l. Bitte ggf. manuell nachpumpen.`;
                break;

            case 'manual':
                message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Es fehlen noch ${missing} l. Bitte Pumpe manuell einschalten.`;
                break;

            case 'auto':
                if (percent >= 100) {
                    message = `Tagesumwälzung abgeschlossen: ${dailyTotal} l (${percent} %). Kein Nachpumpen erforderlich.`;
                } else {
                    if (solarControlActive && collector !== null && pool !== null && collector <= pool) {
                        // FIX: Block automatic follow-up pumping only when solar control is active and both temperatures are valid but the collector is not warmer than the pool.
                        adapter.log.debug(
                            `[controlHelper] automatic pumping blocked by active solar temperature check: collector (${collector}°C) is not warmer than pool (${pool}°C).`,
                        );
                        message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Kein automatisches Nachpumpen, da die Solarsteuerung aktiv ist und der Kollektor nicht wärmer als der Pool ist.`;
                        await _sendSpeech(message, generation);
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }
                        await adapter.setStateAsync('control.circulation.last_report', {
                            val: new Date().toISOString(),
                            ack: true,
                        });
                        return;
                    }

                    // FIX: Missing or partially available temperatures do not block automatic follow-up pumping.
                    message = `Heutige Umwälzung: ${dailyTotal} l (${percent} %). Automatisches Nachpumpen wird gestartet.`;
                    await _sendSpeech(message, generation);
                    if (!_isActiveGeneration(generation)) {
                        return;
                    }
                    await adapter.setStateAsync('control.circulation.last_report', {
                        val: new Date().toISOString(),
                        ack: true,
                    });
                    if (!_isActiveGeneration(generation)) {
                        return;
                    }
                    await _startAutoPumping(missing, generation);
                    return;
                }
                break;

            default:
                adapter.log.debug(`[controlHelper] mode '${mode}' -> no action.`);
                return;
        }

        await _sendSpeech(message, generation);
        if (!_isActiveGeneration(generation)) {
            return;
        }
        await adapter.setStateAsync('control.circulation.last_report', { val: new Date().toISOString(), ack: true });
    } catch (err) {
        adapter?.log.error(`[controlHelper] error during daily check: ${err.message}`);
    }
}

async function _isAutoPumpingStillRunning(generation = lifecycleGeneration) {
    const activeHelper = (await adapter.getStateAsync('pump.active_helper'))?.val || '';
    if (!_isActiveGeneration(generation)) {
        return false;
    }
    const pumpSwitch = !!(await adapter.getStateAsync('pump.pump_switch'))?.val;

    return _isActiveGeneration(generation) && activeHelper === 'controlHelper' && pumpSwitch === true;
}

/**
 * Startet automatisches Nachpumpen.
 *
 * @param {number} missingLiter Fehlende Umwälzmenge in Litern
 * @param {number} generation Aktuelle Lifecycle-Generation
 */
async function _startAutoPumping(missingLiter, generation = lifecycleGeneration) {
    try {
        if (!_isActiveGeneration(generation)) {
            return;
        }
        const maintenanceActive = !!(await adapter.getStateAsync('control.pump.maintenance_active'))?.val;
        if (!_isActiveGeneration(generation)) {
            return;
        }
        if (maintenanceActive) {
            adapter.log.warn('[controlHelper] automatic pumping not started because maintenance mode is active.');
            return;
        }

        if (autoCirculationInProgress || autoPumpingInterval) {
            adapter.log.warn('[controlHelper] automatic pumping not started because it is already running.');
            return;
        }

        const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
        if (!_isActiveGeneration(generation)) {
            return;
        }

        previousAutoPumpingPumpMode = await _readValidPumpModeOrFallback('automatic pumping start');
        if (!_isActiveGeneration(generation)) {
            return;
        }
        await adapter.setStateAsync('pump.mode', { val: 'controlHelper', ack: true });
        if (!_isActiveGeneration(generation)) {
            return;
        }
        await adapter.setStateAsync('pump.active_helper', { val: 'controlHelper', ack: true });
        if (!_isActiveGeneration(generation)) {
            return;
        }
        await adapter.setStateAsync('pump.reason', { val: 'nachpumpen', ack: true });
        if (!_isActiveGeneration(generation)) {
            return;
        }
        await adapter.setStateAsync('pump.pump_switch', { val: true, ack: false });
        if (!_isActiveGeneration(generation)) {
            return;
        }
        autoCirculationInProgress = true;

        adapter.log.info(`[controlHelper] automatic pumping started (${missingLiter} l missing).`);
        if (notify) {
            await _sendSpeech(`Automatisches Nachpumpen gestartet. Es fehlen ${missingLiter} Liter.`, generation);
            if (!_isActiveGeneration(generation)) {
                return;
            }
        }

        if (autoPumpingInterval) {
            adapter.clearInterval(autoPumpingInterval);
            autoPumpingInterval = null;
        }

        autoPumpingInterval = adapter.setInterval(async () => {
            if (!_isActiveGeneration(generation)) {
                return;
            }
            const total = Math.round((await adapter.getStateAsync('circulation.daily_total'))?.val || 0);
            if (!_isActiveGeneration(generation)) {
                return;
            }
            const required = Math.round((await adapter.getStateAsync('circulation.daily_required'))?.val || 0);
            if (!_isActiveGeneration(generation)) {
                return;
            }

            const stillRunning = await _isAutoPumpingStillRunning(generation);
            if (!_isActiveGeneration(generation)) {
                return;
            }
            if (!stillRunning) {
                adapter.clearInterval(autoPumpingInterval);
                autoPumpingInterval = null;

                adapter.log.warn(
                    '[controlHelper] automatic pumping aborted because pump control was lost or pump_switch is no longer true.',
                );

                await adapter.setStateAsync('pump.mode', {
                    val: _getSafeRestoreMode(previousAutoPumpingPumpMode, 'automatic pumping abort'),
                    ack: true,
                });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                previousAutoPumpingPumpMode = null;
                autoCirculationInProgress = false;
                return;
            }

            if (total >= required) {
                adapter.clearInterval(autoPumpingInterval);
                autoPumpingInterval = null;
                await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.mode', {
                    val: _getSafeRestoreMode(previousAutoPumpingPumpMode, 'automatic pumping finish'),
                    ack: true,
                });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                previousAutoPumpingPumpMode = null;
                autoCirculationInProgress = false;

                adapter.log.info('[controlHelper] automatic pumping finished - daily target reached.');
                if (notify) {
                    await _sendSpeech('Nachpumpen abgeschlossen. Tagesziel erreicht.', generation);
                }
            }
        }, 60 * 1000);
    } catch (err) {
        adapter?.log.error(`[controlHelper] error during automatic pumping: ${err.message}`);
    }
}

async function _stopAutoPumpingForMaintenance(generation = lifecycleGeneration) {
    if (!_isActiveGeneration(generation)) {
        return null;
    }
    if (!autoCirculationInProgress && !autoPumpingInterval) {
        return null;
    }

    const restoreMode = _getSafeRestoreMode(previousAutoPumpingPumpMode, 'maintenance takeover');

    if (autoPumpingInterval) {
        adapter.clearInterval(autoPumpingInterval);
        autoPumpingInterval = null;
    }

    autoCirculationInProgress = false;
    previousAutoPumpingPumpMode = null;
    await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
    if (!_isActiveGeneration(generation)) {
        return null;
    }
    adapter.log.info('[controlHelper] automatic pumping stopped because maintenance mode started.');

    return restoreMode;
}

/**
 * Reagiert auf Änderungen der States im Bereich control.*
 *
 * @param {string} id - Objekt-ID des geänderten States
 * @param {ioBroker.State} state - Neuer State-Wert
 */
async function handleStateChange(id, state) {
    if (!state || state.ack) {
        return;
    }

    if (_isBufferedEvent(id, state)) {
        if (!active) {
            if (acceptsPreInitEvents) {
                pendingControlEvents.push({ id, state });
            }
            return;
        }

        if (!initialized || drainingEvents) {
            await new Promise(resolve => {
                pendingControlEvents.push({ id, state, complete: resolve });
            });
            return;
        }
    }

    if (!active || !initialized) {
        return;
    }

    await _processStateChange(id, state, lifecycleGeneration);
}

async function _processStateChange(id, state, generation) {
    try {
        if (!_isActiveGeneration(generation)) {
            return;
        }

        // === SAISONSTATUS ===
        if (id.endsWith('control.season.active')) {
            const newVal = !!state.val;
            adapter.log.info(`[controlHelper] pool season ${newVal ? 'enabled' : 'disabled'}.`);
            await adapter.setStateAsync('status.season_active', { val: newVal, ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }
        }

        // === WARTUNGSMODUS ===
        if (id.endsWith('control.pump.maintenance_active')) {
            const active = !!state.val;
            const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
            if (!_isActiveGeneration(generation)) {
                return;
            }

            if (active) {
                previousMaintenancePumpMode = await _stopAutoPumpingForMaintenance(generation);
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                if (!previousMaintenancePumpMode) {
                    const storedMode = await _readStoredMaintenanceRestoreMode();
                    if (!_isActiveGeneration(generation)) {
                        return;
                    }
                    const currentMode = (await adapter.getStateAsync('pump.mode'))?.val;
                    if (!_isActiveGeneration(generation)) {
                        return;
                    }
                    previousMaintenancePumpMode =
                        currentMode === 'controlHelper' && _isValidUserPumpMode(storedMode)
                            ? storedMode
                            : await _readValidPumpModeOrFallback('maintenance start');
                    if (!_isActiveGeneration(generation)) {
                        return;
                    }
                }
                await _storeMaintenanceRestoreMode(previousMaintenancePumpMode);
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.mode', { val: 'controlHelper', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.reason', { val: 'wartung', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.active_helper', { val: 'controlHelper', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                adapter.log.info('[controlHelper] maintenance mode enabled. Automation paused.');

                if (notify) {
                    await _sendSpeech('Wartungsmodus aktiviert. Automatikfunktionen deaktiviert.', generation);
                }
            } else {
                const storedMode = await _readStoredMaintenanceRestoreMode();
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                const restoreMode = await _resolveRestoreMode(
                    previousMaintenancePumpMode || storedMode,
                    'maintenance finish',
                );
                if (!_isActiveGeneration(generation)) {
                    return;
                }

                await adapter.setStateAsync('pump.mode', { val: restoreMode, ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
                previousMaintenancePumpMode = null;
                await _clearMaintenanceRestoreMode();
                if (!_isActiveGeneration(generation)) {
                    return;
                }

                adapter.log.info('[controlHelper] maintenance mode disabled. Automation active again.');
                if (notify) {
                    await _sendSpeech('Wartungsmodus beendet. Automatikbetrieb wieder aktiv.', generation);
                }
            }
        }

        // === RÜCKSPÜLUNG ===
        if (id.endsWith('control.pump.backwash_start') && state.val === true) {
            const duration = (await adapter.getStateAsync('control.pump.backwash_duration'))?.val || 1;
            if (!_isActiveGeneration(generation)) {
                return;
            }
            const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
            if (!_isActiveGeneration(generation)) {
                return;
            }
            const prevMode = await _readValidPumpModeOrFallback('backwash start');
            if (!_isActiveGeneration(generation)) {
                return;
            }
            const active = (await adapter.getStateAsync('control.pump.backwash_active'))?.val;
            if (!_isActiveGeneration(generation)) {
                return;
            }

            if (active) {
                adapter.log.warn('[controlHelper] backwash already active - rejecting new start.');
                return;
            }

            await adapter.setStateAsync('control.pump.backwash_active', { val: true, ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }
            await adapter.setStateAsync('control.pump.backwash_start', { val: false, ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }
            await adapter.setStateAsync('pump.mode', { val: 'controlHelper', ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }
            await adapter.setStateAsync('pump.active_helper', { val: 'controlHelper', ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }
            await adapter.setStateAsync('pump.reason', { val: 'rückspülen', ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }
            await adapter.setStateAsync('pump.pump_switch', { val: true, ack: false });
            if (!_isActiveGeneration(generation)) {
                return;
            }

            const durationText = duration === 1 ? 'eine Minute' : `${duration} Minuten`;
            adapter.log.info(`[controlHelper] backwash started (${duration} minutes).`);

            if (notify) {
                await _sendSpeech(`Rückspülung gestartet. Dauer ${durationText}.`, generation);
                if (!_isActiveGeneration(generation)) {
                    return;
                }
            }

            if (backwashTimer) {
                adapter.clearTimeout(backwashTimer);
            }
            backwashTimer = adapter.setTimeout(
                async () => {
                    try {
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }
                        await adapter.setStateAsync('pump.pump_switch', { val: false, ack: false });
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }
                        await adapter.setStateAsync('pump.mode', {
                            val: _getSafeRestoreMode(prevMode, 'backwash finish'),
                            ack: true,
                        });
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }
                        await adapter.setStateAsync('pump.active_helper', { val: '', ack: true });
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }
                        await adapter.setStateAsync('pump.reason', { val: '', ack: true });
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }
                        await adapter.setStateAsync('control.pump.backwash_active', { val: false, ack: true });
                        if (!_isActiveGeneration(generation)) {
                            return;
                        }

                        adapter.log.info('[controlHelper] backwash finished. Automation active again.');
                        if (notify) {
                            await _sendSpeech('Rückspülung abgeschlossen. Automatikmodus wieder aktiv.', generation);
                        }
                    } catch (err) {
                        adapter?.log.warn(`[controlHelper] error while stopping backwash: ${err.message}`);
                    }
                },
                duration * 60 * 1000,
            );
        }

        // === ENERGIEZÄHLER RESET ===
        if (id.endsWith('control.energy.reset') && state.val === true) {
            const now = new Date();
            const timestamp = now.toLocaleString('de-DE');
            const notify = (await adapter.getStateAsync('control.pump.notifications_enabled'))?.val;
            if (!_isActiveGeneration(generation)) {
                return;
            }

            adapter.log.info(`[controlHelper] energy meter will be fully reset (${timestamp}).`);

            const consStates = [
                'consumption.total_kwh',
                'consumption.day_kwh',
                'consumption.week_kwh',
                'consumption.month_kwh',
                'consumption.year_kwh',
                'consumption.last_total_kwh',
                'consumption.offset_kwh',
                'costs.total_eur',
                'costs.day_eur',
                'costs.week_eur',
                'costs.month_eur',
                'costs.year_eur',
            ];

            for (const sid of consStates) {
                await adapter.setStateAsync(sid, { val: 0, ack: true });
                if (!_isActiveGeneration(generation)) {
                    return;
                }
            }

            await adapter.setStateAsync('control.energy.reset', { val: false, ack: true });
            if (!_isActiveGeneration(generation)) {
                return;
            }

            const msg = `Energiezähler und Kosten wurden am ${timestamp} vollständig zurückgesetzt.`;
            adapter.log.info('[controlHelper] energy meter and costs have been fully reset.');
            if (notify) {
                await _sendSpeech(msg, generation);
            }
        }
    } catch (err) {
        adapter?.log.error(`[controlHelper] error on state change: ${err.message}`);
    }
}

/**
 * Sendet Text an speech.queue
 *
 * @param {string} text - Nachricht, die an speech.queue gesendet werden soll
 * @param {number} generation Aktuelle Lifecycle-Generation
 */
async function _sendSpeech(text, generation = lifecycleGeneration) {
    if (!text || !_isActiveGeneration(generation)) {
        return;
    }
    try {
        await adapter.setStateAsync('speech.queue', { val: text, ack: false });
        if (_isActiveGeneration(generation)) {
            adapter.log.debug(`[controlHelper] message sent to speech.queue: ${text}`);
        }
    } catch (err) {
        adapter?.log.warn(`[controlHelper] error sending to speech.queue: ${err.message}`);
    }
}

/**
 * Aufräumen
 */
function cleanup() {
    active = false;
    initialized = false;
    drainingEvents = false;
    acceptsPreInitEvents = false;
    ++lifecycleGeneration;
    _discardPendingControlEvents();

    if (backwashTimer) {
        adapter?.clearTimeout(backwashTimer);
        backwashTimer = null;
    }
    if (dailyTimer) {
        adapter?.clearTimeout(dailyTimer);
        dailyTimer = null;
    }
    if (autoPumpingInterval) {
        adapter?.clearInterval(autoPumpingInterval);
        autoPumpingInterval = null;
    }
    previousMaintenancePumpMode = null;
    previousAutoPumpingPumpMode = null;
    autoCirculationInProgress = false;
}

module.exports = { init, handleStateChange, cleanup };

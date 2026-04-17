'use strict';

const { I18n } = require('@iobroker/adapter-core');

/**
 * solarExtendedHelper
 * - Prüft die Temperaturdifferenz zwischen Kollektor und Pooltemperatur
 * - Nutzt States aus solarExtendedStates.js und temperatureStates.js
 * - Bewertet nur die logische Anforderung und Status-/Info-States
 * - Schaltet den externen Aktor gemäß Konfiguration
 * - Berücksichtigt Invertierung und Aktorstatus
 */

const solarExtendedHelper = {
    adapter: null,
    checkTimer: null,

    init(adapter) {
        this.adapter = adapter;

        // Minütlicher Check
        this._scheduleCheck();

        this.adapter.log.debug('[solarExtendedHelper] Initialized (check every 60s)');
    },

    _scheduleCheck() {
        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
        }

        this.checkTimer = this.adapter.setInterval(() => this._checkSolarExtended(), 60 * 1000);

        // Beim Start sofort prüfen
        void this._checkSolarExtended();
    },

    async _checkSolarExtended() {
        try {
            const activeHelper = (await this.adapter.getStateAsync('pump.active_helper'))?.val || '';
            const seasonActive = (await this.adapter.getStateAsync('status.season_active'))?.val;
            const masterActive = (await this.adapter.getStateAsync('solar.solar_control_active'))?.val;
            const controlMode = (await this.adapter.getStateAsync('solar.control_mode'))?.val || 'standard';
            const pumpMode = (await this.adapter.getStateAsync('pump.mode'))?.val;

            const deltaOn = Number((await this.adapter.getStateAsync('solar.extended.delta_on'))?.val);
            const deltaOff = Number((await this.adapter.getStateAsync('solar.extended.delta_off'))?.val);
            const maxTemperature = Number((await this.adapter.getStateAsync('solar.extended.max_temperature'))?.val);
            const poolTemperatureSource = (await this.adapter.getStateAsync('solar.extended.pool_temperature_source'))
                ?.val;
            const controlObjectId = (await this.adapter.getStateAsync('solar.extended.control_object_id'))?.val || '';
            const controlType = (await this.adapter.getStateAsync('solar.extended.control_type'))?.val || '';
            const controlInverted = (await this.adapter.getStateAsync('solar.extended.control_inverted'))?.val === true;

            const oldEnabledByMaster = (await this.adapter.getStateAsync('solar.extended.enabled_by_master'))?.val;
            const oldRequestActive = (await this.adapter.getStateAsync('solar.extended.request_active'))?.val === true;
            const oldActive = (await this.adapter.getStateAsync('solar.extended.active'))?.val;
            const oldBlocked = (await this.adapter.getStateAsync('solar.extended.blocked'))?.val;
            const oldBlockedBy = (await this.adapter.getStateAsync('solar.extended.blocked_by'))?.val;
            const oldPriorityStatus = (await this.adapter.getStateAsync('solar.extended.priority_status'))?.val;
            const oldConfigOk = (await this.adapter.getStateAsync('solar.extended.config_ok'))?.val;
            const oldActorState = (await this.adapter.getStateAsync('solar.extended.actor_state'))?.val;
            const oldReason = (await this.adapter.getStateAsync('solar.extended.reason'))?.val;
            const oldInfo = (await this.adapter.getStateAsync('solar.extended.info'))?.val;

            const enabledByMaster = masterActive === true;
            const isExtendedMode = controlMode === 'extended';
            const isControlPriority = activeHelper === 'controlHelper';
            const isTimePriority = activeHelper === 'timeHelper';
            const actorConfigOk = controlObjectId !== '' && (controlType === 'boolean' || controlType === 'socket');

            let configOk = false;
            let requestActive = false;
            let active = false;
            let blocked = false;
            let blockedBy = '';
            let priorityStatus = '';
            let reason = '';
            let info = '';
            let actorState = false;
            let actorWriteValue = false;

            if (
                Number.isFinite(deltaOn) &&
                Number.isFinite(deltaOff) &&
                Number.isFinite(maxTemperature) &&
                deltaOn >= deltaOff &&
                maxTemperature > 0 &&
                (poolTemperatureSource === 'surface' || poolTemperatureSource === 'ground') &&
                actorConfigOk
            ) {
                configOk = true;
            }

            if (!configOk) {
                blocked = true;
                blockedBy = 'invalid_config';
                priorityStatus = I18n.translate('extended blocked by invalid config');
                reason = I18n.translate('Extended solar configuration invalid');
                info = I18n.translate('Solar Extended configuration invalid');
            } else if (isControlPriority) {
                blocked = true;
                blockedBy = 'controlHelper';
                priorityStatus = I18n.translate('extended blocked by controlHelper');
                reason = I18n.translate('Priority blocked by controlHelper');
                info = I18n.translate('Solar Extended blocked by controlHelper');
            } else if (isTimePriority) {
                blocked = true;
                blockedBy = 'timeHelper';
                priorityStatus = I18n.translate('extended blocked by timeHelper');
                reason = I18n.translate('Priority blocked by timeHelper');
                info = I18n.translate('Solar Extended blocked by timeHelper');
            } else if (!enabledByMaster) {
                blocked = true;
                blockedBy = 'master_disabled';
                priorityStatus = I18n.translate('extended blocked by master');
                reason = I18n.translate('Solar master disabled');
                info = I18n.translate('Solar Extended disabled by main solar switch');
            } else if (!isExtendedMode) {
                blocked = true;
                blockedBy = 'mode_standard';
                priorityStatus = I18n.translate('extended blocked by standard mode');
                reason = I18n.translate('Solar control mode is %s', controlMode);
                info = I18n.translate('Solar Extended inactive because standard solar mode is selected');
            } else if (!seasonActive) {
                blocked = true;
                blockedBy = 'season_inactive';
                priorityStatus = I18n.translate('extended blocked by inactive season');
                reason = I18n.translate('Season inactive');
                info = I18n.translate('Solar Extended inactive because the season is disabled');
            } else if (pumpMode !== 'auto') {
                blocked = true;
                blockedBy = 'pump_mode_not_auto';
                priorityStatus = I18n.translate('extended blocked by pump mode');
                reason = I18n.translate('Pump mode is %s', pumpMode);
                info = I18n.translate('Solar Extended inactive because pump mode is not auto');
            } else {
                const collector = Number((await this.adapter.getStateAsync('temperature.collector.current'))?.val);
                const poolStateId =
                    poolTemperatureSource === 'ground' ? 'temperature.ground.current' : 'temperature.surface.current';
                const pool = Number((await this.adapter.getStateAsync(poolStateId))?.val);

                if (!Number.isFinite(collector) || !Number.isFinite(pool)) {
                    requestActive = false;
                    active = false;
                    priorityStatus = I18n.translate('extended waiting for temperatures');
                    reason = I18n.translate('No valid temperature values available');
                    info = I18n.translate('Solar Extended waiting for valid temperature values');
                    this.adapter.log.debug('[solarExtendedHelper] No valid temperatures available');
                } else {
                    const delta = collector - pool;

                    requestActive = oldRequestActive;

                    if (delta >= deltaOn && pool < maxTemperature) {
                        requestActive = true;
                    } else if (delta <= deltaOff || pool >= maxTemperature) {
                        requestActive = false;
                    }

                    if (pool >= maxTemperature) {
                        reason = I18n.translate('Pool temperature >= max temperature (%s >= %s)', pool, maxTemperature);
                        info = I18n.translate('Solar Extended inactive because maximum pool temperature is reached');
                    } else if (requestActive) {
                        reason = I18n.translate('Collector delta >= delta_on (%s >= %s)', delta.toFixed(2), deltaOn);
                        info = I18n.translate('Solar Extended requests heating from collector surplus');
                    } else {
                        reason = I18n.translate('Collector delta <= delta_off (%s <= %s)', delta.toFixed(2), deltaOff);
                        info = I18n.translate('Solar Extended currently has no temperature request');
                    }

                    this.adapter.log.debug(
                        `[solarExtendedHelper] Extended solar ${requestActive ? 'ON' : 'OFF'} (Collector=${collector}°C, Pool=${pool}°C, Delta=${delta.toFixed(2)}°C, Source=${poolTemperatureSource})`,
                    );
                }
            }

            actorWriteValue = requestActive;
            if (controlInverted) {
                actorWriteValue = !actorWriteValue;
            }

            // FIX:
            // Definiert den AUS-Zustand des externen Aktors abhängig von der Invertierung.
            const actorOffValue = controlInverted ? true : false;

            if (actorConfigOk) {
                try {
                    // FIX:
                    // Der externe Aktor darf nur dann aktiv sein,
                    // wenn Solar Extended tatsächlich selbst aktiv ist.
                    // Bei Blockierung durch controlHelper/timeHelper
                    // oder ohne eigene Anforderung wird der Aktor deaktiviert.
                    const effectiveActorValue = !blocked ? actorWriteValue : actorOffValue;

                    await this.adapter.setForeignStateAsync(controlObjectId, effectiveActorValue, false);
                    actorState = effectiveActorValue;

                    if (!blocked) {
                        active = requestActive;
                        if (priorityStatus === '') {
                            priorityStatus = requestActive
                                ? I18n.translate('extended active')
                                : I18n.translate('extended inactive');
                        }
                    } else {
                        active = false;
                    }
                } catch (err) {
                    blocked = true;
                    blockedBy = 'actor_write_error';
                    priorityStatus = I18n.translate('extended blocked by actor write error');
                    reason = I18n.translate('Actor write failed: %s', err.message);
                    info = I18n.translate('Solar Extended could not write to the external actuator');
                    actorState = false;
                    active = false;
                    this.adapter.log.warn(`[solarExtendedHelper] Error writing actor state: ${err.message}`);
                }
            } else {
                actorState = false;
                active = false;
            }

            const speechSolarActive = requestActive && !blocked;
            const oldSpeechSolarActive = (await this.adapter.getStateAsync('speech.solar_active'))?.val;
            if (oldSpeechSolarActive !== speechSolarActive) {
                await this.adapter.setStateChangedAsync('speech.solar_active', {
                    val: speechSolarActive,
                    ack: true,
                });
            }

            // FIX:
            // Den zentralen Pumpenschalter nur dann schreiben,
            // wenn Solar Extended überhaupt der zuständige Solarmodus ist
            // und keine höhere Fremdpriorität aktiv ist.
            if (isExtendedMode && !isControlPriority && !isTimePriority) {
                await this.adapter.setStateChangedAsync('pump.pump_switch', {
                    val: speechSolarActive,
                    ack: false,
                });
            }

            await this.adapter.setStateChangedAsync('solar.extended.enabled_by_master', {
                val: enabledByMaster,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.request_active', {
                val: requestActive,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.active', {
                val: active,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.blocked', {
                val: blocked,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.blocked_by', {
                val: blockedBy,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.priority_status', {
                val: priorityStatus,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.config_ok', {
                val: configOk,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.actor_state', {
                val: actorState,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.reason', {
                val: reason,
                ack: true,
            });
            await this.adapter.setStateChangedAsync('solar.extended.info', {
                val: info,
                ack: true,
            });

            const statusChanged =
                oldEnabledByMaster !== enabledByMaster ||
                oldRequestActive !== requestActive ||
                oldActive !== active ||
                oldBlocked !== blocked ||
                oldBlockedBy !== blockedBy ||
                oldPriorityStatus !== priorityStatus ||
                oldConfigOk !== configOk ||
                oldActorState !== actorState ||
                oldReason !== reason ||
                oldInfo !== info;

            if (statusChanged) {
                await this.adapter.setStateChangedAsync('solar.extended.last_change', {
                    val: Date.now(),
                    ack: true,
                });
            }

            if (blocked) {
                this.adapter.log.debug(`[solarExtendedHelper] Extended solar skipped (${blockedBy || 'blocked'})`);
            }
        } catch (err) {
            this.adapter.log.warn(`[solarExtendedHelper] Error in check: ${err.message}`);
        }
    },

    cleanup() {
        if (this.checkTimer) {
            this.adapter.clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    },
};

module.exports = solarExtendedHelper;

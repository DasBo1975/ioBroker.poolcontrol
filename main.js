'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

const utils = require('@iobroker/adapter-core');
const { I18n } = require('@iobroker/adapter-core');
const temperatureHelper = require('./lib/helpers/temperatureHelper');
const timeHelper = require('./lib/helpers/timeHelper');
const runtimeHelper = require('./lib/helpers/runtimeHelper');
const statisticsHelper = require('./lib/helpers/statisticsHelper');
const statisticsHelperWeek = require('./lib/helpers/statisticsHelperWeek');
const statisticsHelperMonth = require('./lib/helpers/statisticsHelperMonth');
const pumpHelper = require('./lib/helpers/pumpHelper');
const pumpHelper2 = require('./lib/helpers/pumpHelper2');
const pumpHelper3 = require('./lib/helpers/pumpHelper3');
const pumpHelper4 = require('./lib/helpers/pumpHelper4');
const pumpSpeedHelper = require('./lib/helpers/pumpSpeedHelper'); // NEU
const speechHelper = require('./lib/helpers/speechHelper');
const consumptionHelper = require('./lib/helpers/consumptionHelper');
const solarHelper = require('./lib/helpers/solarHelper');
const frostHelper = require('./lib/helpers/frostHelper');
const statusHelper = require('./lib/helpers/statusHelper');
const photovoltaicHelper = require('./lib/helpers/photovoltaicHelper');
const aiHelper = require('./lib/helpers/aiHelper');
const aiForecastHelper = require('./lib/helpers/aiForecastHelper');
const aiChemistryHelpHelper = require('./lib/helpers/aiChemistryHelpHelper');
const controlHelper = require('./lib/helpers/controlHelper');
const controlHelper2 = require('./lib/helpers/controlHelper2');
const debugLogHelper = require('./lib/helpers/debugLogHelper');
const speechTextHelper = require('./lib/helpers/speechTextHelper');
const migrationHelper = require('./lib/helpers/migrationHelper');
const infoHelper = require('./lib/helpers/infoHelper');
const heatHelper = require('./lib/helpers/heatHelper');
const actuatorsHelper = require('./lib/helpers/actuatorsHelper'); // NEU
const { createTemperatureStates } = require('./lib/stateDefinitions/temperatureStates');
const { createPumpStates } = require('./lib/stateDefinitions/pumpStates');
const { createPumpStates2 } = require('./lib/stateDefinitions/pumpStates2');
const { createPumpStates3 } = require('./lib/stateDefinitions/pumpStates3');
const { createPumpStates4 } = require('./lib/stateDefinitions/pumpStates4');
const { createPumpSpeedStates } = require('./lib/stateDefinitions/pumpSpeedStates'); // NEU
const { createSolarStates } = require('./lib/stateDefinitions/solarStates');
const { createPhotovoltaicStates } = require('./lib/stateDefinitions/photovoltaicStates');
const { createGeneralStates } = require('./lib/stateDefinitions/generalStates');
const { createTimeStates } = require('./lib/stateDefinitions/timeStates');
const { createRuntimeStates } = require('./lib/stateDefinitions/runtimeStates');
const { createStatisticsStates } = require('./lib/stateDefinitions/statisticsStates');
const { createSpeechStates } = require('./lib/stateDefinitions/speechStates');
const { createConsumptionStates } = require('./lib/stateDefinitions/consumptionStates');
const { createStatusStates } = require('./lib/stateDefinitions/statusStates');
const { createControlStates } = require('./lib/stateDefinitions/controlStates');
const { createDebugLogStates } = require('./lib/stateDefinitions/debugLogStates');
const { createInfoStates } = require('./lib/stateDefinitions/infoStates');
const { createAiStates } = require('./lib/stateDefinitions/aiStates'); // NEU: KI-States
const { createAiChemistryHelpStates } = require('./lib/stateDefinitions/aiChemistryHelpStates'); // NEU: KI-Chemie-Hilfe
const { createHeatStates } = require('./lib/stateDefinitions/heatStates');
const { createActuatorsStates } = require('./lib/stateDefinitions/actuatorsStates');

class Poolcontrol extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'poolcontrol',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    // FIX: Determine whether an own state is writable (command-like). Cached for performance.
    async _isWritableOwnState(id) {
        this._ackWritableCache = this._ackWritableCache || new Map();

        if (this._ackWritableCache.has(id)) {
            return this._ackWritableCache.get(id);
        }

        try {
            const obj = await this.getObjectAsync(id);
            const isWritable = !!obj?.common?.write;
            this._ackWritableCache.set(id, isWritable);
            return isWritable;
        } catch {
            // If we cannot read the object, play safe: do NOT filter it out.
            this._ackWritableCache.set(id, false);
            return false;
        }
    }

    async onReady() {
        this.log.info('Adapter started');

        // NEU: i18n initialisieren
        await I18n.init(__dirname, this);

        // --- Allgemeine Einstellungen ---
        await createGeneralStates(this);

        // --- Pumpe ---
        await createPumpStates(this);
        await createPumpStates2(this);
        await createPumpStates3(this);
        await createPumpStates4(this);
        await createPumpSpeedStates(this); // NEU: Pumpen-Leistungsempfehlung

        // --- Temperaturverwaltung ---
        await createTemperatureStates(this);

        // --- Solarverwaltung ---
        await createSolarStates(this);

        // --- Heizung / Wärmepumpe ---
        await createHeatStates(this);

        // --- Photovoltaik ---
        await createPhotovoltaicStates(this);

        // --- Zeitsteuerung ---
        await createTimeStates(this);

        // --- Laufzeitsteuerung ---
        await createRuntimeStates(this);

        // Statistik-States (Temperaturen)
        await createStatisticsStates(this);

        // --- Sprachausgaben ---
        await createSpeechStates(this);

        // --- Verbrauch & Kosten ---
        await createConsumptionStates(this);

        // --- Statusübersicht ---
        await createStatusStates(this);

        // --- Control States ---
        await createControlStates(this);

        // --- DebugLog States ---
        await createDebugLogStates(this);

        // --- Info States ---
        await createInfoStates(this);

        // --- AI States ---
        await createAiStates(this); // NEU: KI-States anlegen
        await createAiChemistryHelpStates(this); // NEU: KI-Chemie-Hilfe-States

        // --- Zusatz-Aktoren (Beleuchtung & Zusatzpumpen) ---
        await createActuatorsStates(this);

        // --- Migration Helper zuletzt starten ---
        await migrationHelper.init(this);

        // --- Helper starten ---
        temperatureHelper.init(this);
        timeHelper.init(this);
        runtimeHelper.init(this);
        statisticsHelper.init(this);
        statisticsHelperWeek.init(this);
        statisticsHelperMonth.init(this);
        pumpHelper.init(this);
        pumpHelper2.init(this);
        pumpHelper3.init(this);
        pumpHelper4.init(this);
        pumpSpeedHelper.init(this); // NEU
        speechHelper.init(this);
        consumptionHelper.init(this);
        solarHelper.init(this);
        heatHelper.init(this); // ← NEU
        photovoltaicHelper.init(this);
        aiHelper.init(this);
        aiForecastHelper.init(this);
        aiChemistryHelpHelper.init(this);
        frostHelper.init(this);
        statusHelper.init(this);
        infoHelper.init(this);
        controlHelper.init(this);
        controlHelper2.init(this);
        debugLogHelper.init(this);
        speechTextHelper.init(this);
        actuatorsHelper.init(this); // NEU
    }

    onUnload(callback) {
        try {
            if (temperatureHelper.cleanup) {
                temperatureHelper.cleanup();
            }
            if (timeHelper.cleanup) {
                timeHelper.cleanup();
            }
            if (runtimeHelper.cleanup) {
                runtimeHelper.cleanup();
            }
            if (statisticsHelper.cleanup) {
                statisticsHelper.cleanup();
            }
            if (pumpHelper.cleanup) {
                pumpHelper.cleanup();
            }
            if (pumpHelper2.cleanup) {
                pumpHelper2.cleanup();
            }
            if (pumpHelper3.cleanup) {
                pumpHelper3.cleanup();
            }
            if (pumpHelper4.cleanup) {
                pumpHelper4.cleanup();
            }
            if (pumpSpeedHelper.cleanup) {
                pumpSpeedHelper.cleanup(); // NEU
            }
            if (speechHelper.cleanup) {
                speechHelper.cleanup();
            }
            if (consumptionHelper.cleanup) {
                consumptionHelper.cleanup();
            }
            if (solarHelper.cleanup) {
                solarHelper.cleanup();
            }
            if (frostHelper.cleanup) {
                frostHelper.cleanup();
            }
            if (statusHelper.cleanup) {
                statusHelper.cleanup();
            }
            if (controlHelper.cleanup) {
                controlHelper.cleanup();
            }
            if (controlHelper2.cleanup) {
                controlHelper2.cleanup();
            }
            if (heatHelper.cleanup) {
                heatHelper.cleanup();
            }
            if (actuatorsHelper.cleanup) {
                actuatorsHelper.cleanup(); // NEU
            }
            if (speechTextHelper.cleanup) {
                speechTextHelper.cleanup();
            }
            if (aiHelper.cleanup) {
                aiHelper.cleanup();
            }
            if (aiForecastHelper.cleanup) {
                aiForecastHelper.cleanup();
            }
            if (aiChemistryHelpHelper.cleanup) {
                aiChemistryHelpHelper.cleanup();
            }
            if (infoHelper.cleanup) {
                infoHelper.cleanup();
            }
        } catch (e) {
            this.log.warn(`[onUnload] Error during cleanup: ${e.message}`);
        } finally {
            callback();
        }
    }

    async onStateChange(id, state) {
        if (state) {
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            this.log.debug(`state ${id} deleted`);
        }

        // FIX: ignore deleted states completely
        if (!state) {
            return;
        }

        const isOwnState = id.startsWith(`${this.namespace}.`);

        // ACK handling guard (own states)
        // - ignore ack=true for OWN writeable states (commands)
        // - still allow ack=true for read-only OWN states (status/live values)
        if (isOwnState && state.ack === true) {
            const isWritable = await this._isWritableOwnState(id);
            if (isWritable) {
                return;
            }
        }

        // Saisonstatus manuell ändern (z.B. über VIS)
        if (id.endsWith('status.season_active') && state && state.ack === false) {
            this.log.info(`[main] Season status changed: ${state.val}`);
            await this.setStateAsync('status.season_active', { val: state.val, ack: true });
            return; // danach keine Helper mehr aufrufen
        }

        try {
            temperatureHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[temperatureHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            runtimeHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[runtimeHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            pumpHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            pumpHelper2.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper2] Error in handleStateChange: ${e.message}`);
        }
        try {
            pumpHelper3.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper3] Error in handleStateChange: ${e.message}`);
        }

        try {
            pumpHelper4.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper4] Error in handleStateChange: ${e.message}`);
        }

        try {
            pumpSpeedHelper.handleStateChange(id, state); // NEU
        } catch (e) {
            this.log.warn(`[pumpSpeedHelper] Error in handleStateChange: ${e.message}`);
        }

        try {
            speechHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[speechHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            consumptionHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[consumptionHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            photovoltaicHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[photovoltaicHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            heatHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[heatHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            actuatorsHelper.handleStateChange(id, state); // NEU
        } catch (e) {
            this.log.warn(`[actuatorsHelper] Error in handleStateChange: ${e.message}`);
        }
        // --- AI-Helper ---
        try {
            aiHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[main] Error in aiHelper.handleStateChange: ${e.message}`);
        }
        try {
            aiForecastHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[main] Error in aiForecastHelper.handleStateChange: ${e.message}`);
        }
        try {
            aiChemistryHelpHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[main] Error in aiChemistryHelpHelper.handleStateChange: ${e.message}`);
        }
        try {
            statusHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[statusHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            speechTextHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[speechTextHelper] Error in handleStateChange: ${e.message}`);
        }
        if (id.includes('control.')) {
            controlHelper.handleStateChange(id, state);
        }
        if (id.includes('control.')) {
            controlHelper2.handleStateChange(id, state);
        }

        // --- Photovoltaik-Parameter ---
        if (id.endsWith('photovoltaic.afterrun_min')) {
            this.log.debug(`[onStateChange] PV after-run time changed to ${state.val} Minuten`);
            this.config.pv_afterrun_min = Number(state.val);
        }

        if (id.endsWith('photovoltaic.ignore_on_circulation')) {
            this.log.debug(`[onStateChange] Ignore PV logic on circulation = ${state.val}`);
            this.config.pv_ignore_on_circulation = !!state.val;
        }

        await debugLogHelper.handleStateChange(id, state);
    }
}

if (require.main !== module) {
    module.exports = options => new Poolcontrol(options);
} else {
    new Poolcontrol();
}

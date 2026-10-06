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
const solarExtendedHelper = require('./lib/helpers/solarExtendedHelper'); // NEU
const frostHelper = require('./lib/helpers/frostHelper');
const statusHelper = require('./lib/helpers/statusHelper');
const photovoltaicHelper = require('./lib/helpers/photovoltaicHelper');
const photovoltaicInsightsHelper = require('./lib/helpers/photovoltaicInsightsHelper');
const aiHelper = require('./lib/helpers/aiHelper');
const aiForecastHelper = require('./lib/helpers/aiForecastHelper');
const aiChemistryHelpHelper = require('./lib/helpers/aiChemistryHelpHelper');
const chemistryPhHelper = require('./lib/helpers/chemistryPhHelper');
const chemistryTdsHelper = require('./lib/helpers/chemistryTdsHelper');
const chemistryOrpHelper = require('./lib/helpers/chemistryOrpHelper');
const chemistryToolsHelper = require('./lib/helpers/chemistryToolsHelper'); // NEU
const controlHelper = require('./lib/helpers/controlHelper');
const controlHelper2 = require('./lib/helpers/controlHelper2');
const debugLogHelper = require('./lib/helpers/debugLogHelper');
const speechTextHelper = require('./lib/helpers/speechTextHelper');
const migrationHelper = require('./lib/helpers/migrationHelper');
const infoHelper = require('./lib/helpers/infoHelper');
const heatHelper = require('./lib/helpers/heatHelper');
const actuatorsHelper = require('./lib/helpers/actuatorsHelper'); // NEU
const solarInsightsHelper = require('./lib/helpers/solarInsightsHelper');
const solarLogbookHelper = require('./lib/helpers/solarLogbookHelper'); // NEU
const poolInsightsHelper = require('./lib/helpers/poolInsightsHelper');
const { createTemperatureStates } = require('./lib/stateDefinitions/temperatureStates');
const { createPumpStates } = require('./lib/stateDefinitions/pumpStates');
const { createPumpStates2 } = require('./lib/stateDefinitions/pumpStates2');
const { createPumpStates3 } = require('./lib/stateDefinitions/pumpStates3');
const { createPumpStates4 } = require('./lib/stateDefinitions/pumpStates4');
const { createPumpSpeedStates } = require('./lib/stateDefinitions/pumpSpeedStates'); // NEU
const { createSolarStates } = require('./lib/stateDefinitions/solarStates');
const { createSolarExtendedStates } = require('./lib/stateDefinitions/solarExtendedStates'); // NEU
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
const { createChemistryPhStates } = require('./lib/stateDefinitions/chemistryPhStates');
const { createChemistryTdsStates } = require('./lib/stateDefinitions/chemistryTdsStates');
const { createChemistryOrpStates } = require('./lib/stateDefinitions/chemistryOrpStates');
const { createChemistryToolsStates } = require('./lib/stateDefinitions/chemistryToolsStates'); // NEU: Chemie-Werkzeuge
const { createHeatStates } = require('./lib/stateDefinitions/heatStates');
const { createActuatorsStates } = require('./lib/stateDefinitions/actuatorsStates');
const { createSolarInsightsStates } = require('./lib/stateDefinitions/solarInsightsStates');
const { createPhotovoltaicInsightsStates } = require('./lib/stateDefinitions/photovoltaicInsightsStates');
const { createPoolInsightsStates } = require('./lib/stateDefinitions/poolInsightsStates');

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

    /**
     * Starts a helper handler immediately and observes synchronous and asynchronous failures.
     *
     * @param {string} helperName - Name used in error logs.
     * @param {string} id - State ID being dispatched.
     * @param {() => void | Promise<void>} callback - Helper handler invocation.
     */
    _dispatchStateChange(helperName, id, callback) {
        try {
            const result = callback();
            if (result && typeof result.then === 'function') {
                void Promise.resolve(result).catch(error => this._logStateChangeError(helperName, id, error));
            }
        } catch (error) {
            this._logStateChangeError(helperName, id, error);
        }
    }

    /**
     * Logs a helper dispatch failure without allowing logging failures to escape.
     *
     * @param {string} helperName - Name of the failed helper.
     * @param {string} id - State ID being dispatched.
     * @param {unknown} error - Thrown or rejected value.
     */
    _logStateChangeError(helperName, id, error) {
        let details = 'Unknown error';

        try {
            details = error instanceof Error ? error.stack || error.message : String(error);
        } catch {
            details = 'Unprintable error';
        }

        try {
            this.log.warn(`[${helperName}] Error in handleStateChange for ${id}: ${details}`);
        } catch {
            // A logger failure must not create a second unhandled error.
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
        await createSolarExtendedStates(this); // NEU

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

        // --- Solar Insights / Analyse ---
        await createSolarInsightsStates(this);

        // --- Photovoltaic Insights / Analyse ---
        await createPhotovoltaicInsightsStates(this);

        // --- Pool Insights / Gesamtanalyse ---
        await createPoolInsightsStates(this);

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

        // --- Chemistry / pH evaluation ---
        await createChemistryPhStates(this);

        // --- Chemistry / TDS evaluation ---
        await createChemistryTdsStates(this);

        // --- Chemistry / ORP evaluation ---
        await createChemistryOrpStates(this);

        // --- Chemistry / tools ---
        await createChemistryToolsStates(this);

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
        solarExtendedHelper.init(this); // NEU
        heatHelper.init(this); // ← NEU
        photovoltaicHelper.init(this);
        photovoltaicInsightsHelper.init(this);
        aiHelper.init(this);
        aiForecastHelper.init(this);
        aiChemistryHelpHelper.init(this);
        await chemistryPhHelper.init(this);
        chemistryTdsHelper.init(this);
        chemistryOrpHelper.init(this);
        chemistryToolsHelper.init(this); // NEU
        frostHelper.init(this);
        statusHelper.init(this);
        infoHelper.init(this);
        controlHelper.init(this);
        controlHelper2.init(this);
        debugLogHelper.init(this);
        speechTextHelper.init(this);
        actuatorsHelper.init(this); // NEU
        solarInsightsHelper.init(this);
        solarLogbookHelper.init(this); // NEU
        poolInsightsHelper.init(this);
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
            if (statisticsHelperWeek.cleanup) {
                statisticsHelperWeek.cleanup();
            }
            if (statisticsHelperMonth.cleanup) {
                statisticsHelperMonth.cleanup();
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
            if (solarExtendedHelper.cleanup) {
                solarExtendedHelper.cleanup();
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
            if (debugLogHelper.cleanup) {
                debugLogHelper.cleanup();
            }
            if (heatHelper.cleanup) {
                heatHelper.cleanup();
            }
            if (actuatorsHelper.cleanup) {
                actuatorsHelper.cleanup(); // NEU
            }
            if (solarLogbookHelper.cleanup) {
                solarLogbookHelper.cleanup(); // NEU
            }
            if (poolInsightsHelper.cleanup) {
                poolInsightsHelper.cleanup();
            }
            if (speechTextHelper.cleanup) {
                speechTextHelper.cleanup();
            }
            if (solarInsightsHelper.cleanup) {
                solarInsightsHelper.cleanup();
            }
            if (aiHelper.cleanup) {
                aiHelper.cleanup();
            }
            if (aiForecastHelper.cleanup) {
                aiForecastHelper.cleanup();
            }
            if (photovoltaicHelper.cleanup) {
                photovoltaicHelper.cleanup();
            }
            if (photovoltaicInsightsHelper.cleanup) {
                photovoltaicInsightsHelper.cleanup();
            }
            if (chemistryPhHelper.cleanup) {
                chemistryPhHelper.cleanup();
            }
            if (chemistryTdsHelper.cleanup) {
                chemistryTdsHelper.cleanup();
            }
            if (chemistryOrpHelper.cleanup) {
                chemistryOrpHelper.cleanup();
            }
            if (chemistryToolsHelper.cleanup) {
                chemistryToolsHelper.cleanup();
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
            const isSeasonState = id.endsWith('status.season_active');
            if (isWritable && !isSeasonState) {
                return;
            }
        }

        // Saisonstatus manuell ändern (z.B. über VIS)
        if (id.endsWith('status.season_active') && state && state.ack === false) {
            this.log.info(`[main] Season status changed: ${state.val}`);
            await this.setStateAsync('status.season_active', { val: state.val, ack: true });
            return; // danach keine Helper mehr aufrufen
        }

        this._dispatchStateChange('temperatureHelper', id, () => temperatureHelper.handleStateChange(id, state));
        this._dispatchStateChange('runtimeHelper', id, () => runtimeHelper.handleStateChange(id, state));
        this._dispatchStateChange('pumpHelper', id, () => pumpHelper.handleStateChange(id, state));
        this._dispatchStateChange('pumpHelper2', id, () => pumpHelper2.handleStateChange(id, state));
        this._dispatchStateChange('pumpHelper3', id, () => pumpHelper3.handleStateChange(id, state));
        this._dispatchStateChange('pumpHelper4', id, () => pumpHelper4.handleStateChange(id, state));
        this._dispatchStateChange('pumpSpeedHelper', id, () => pumpSpeedHelper.handleStateChange(id, state));
        this._dispatchStateChange('speechHelper', id, () => speechHelper.handleStateChange(id, state));
        this._dispatchStateChange('consumptionHelper', id, () => consumptionHelper.handleStateChange(id, state));
        try {
            await frostHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[frostHelper] Error in handleStateChange: ${e.message}`);
        }
        this._dispatchStateChange('photovoltaicHelper', id, () => photovoltaicHelper.handleStateChange(id, state));
        this._dispatchStateChange('photovoltaicInsightsHelper', id, () =>
            photovoltaicInsightsHelper.handleStateChange(id, state),
        );
        this._dispatchStateChange('heatHelper', id, () => heatHelper.handleStateChange(id, state));
        this._dispatchStateChange('actuatorsHelper', id, () => actuatorsHelper.handleStateChange(id, state));
        // --- AI-Helper ---
        this._dispatchStateChange('aiHelper', id, () => aiHelper.handleStateChange(id, state));
        this._dispatchStateChange('aiForecastHelper', id, () => aiForecastHelper.handleStateChange(id, state));
        this._dispatchStateChange('aiChemistryHelpHelper', id, () =>
            aiChemistryHelpHelper.handleStateChange(id, state),
        );
        try {
            await chemistryPhHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[chemistryPhHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            await chemistryTdsHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[chemistryTdsHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            await chemistryOrpHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[chemistryOrpHelper] Error in handleStateChange: ${e.message}`);
        }
        try {
            await chemistryToolsHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[chemistryToolsHelper] Error in handleStateChange: ${e.message}`);
        }
        this._dispatchStateChange('statusHelper', id, () => statusHelper.handleStateChange(id, state));
        this._dispatchStateChange('speechTextHelper', id, () => speechTextHelper.handleStateChange(id, state));
        this._dispatchStateChange('solarLogbookHelper', id, () => solarLogbookHelper.handleStateChange(id, state));
        this._dispatchStateChange('solarInsightsHelper', id, () => solarInsightsHelper.onStateChange(id, state));
        this._dispatchStateChange('poolInsightsHelper', id, () => poolInsightsHelper.handleStateChange(id, state));
        if (id.includes('control.')) {
            this._dispatchStateChange('controlHelper', id, () => controlHelper.handleStateChange(id, state));
        }
        if (id.includes('control.')) {
            this._dispatchStateChange('controlHelper2', id, () => controlHelper2.handleStateChange(id, state));
        }

        // --- Photovoltaik-Parameter ---
        if (id.endsWith('photovoltaic.afterrun_min')) {
            this.log.debug(`[onStateChange] PV after-run time changed to ${state.val} Minuten`);
        }

        if (id.endsWith('photovoltaic.ignore_on_circulation')) {
            this.log.debug(`[onStateChange] Ignore PV logic on circulation = ${state.val}`);
        }

        try {
            await debugLogHelper.handleStateChange(id, state);
        } catch (error) {
            this._logStateChangeError('debugLogHelper', id, error);
        }
    }
}

if (require.main !== module) {
    module.exports = options => new Poolcontrol(options);
} else {
    new Poolcontrol();
}

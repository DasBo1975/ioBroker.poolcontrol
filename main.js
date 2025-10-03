'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

const utils = require('@iobroker/adapter-core');
const temperatureHelper = require('./lib/helpers/temperatureHelper');
const timeHelper = require('./lib/helpers/timeHelper');
const runtimeHelper = require('./lib/helpers/runtimeHelper');
const pumpHelper = require('./lib/helpers/pumpHelper');
const speechHelper = require('./lib/helpers/speechHelper');
const consumptionHelper = require('./lib/helpers/consumptionHelper');
const solarHelper = require('./lib/helpers/solarHelper');
const frostHelper = require('./lib/helpers/frostHelper');
const statusHelper = require('./lib/helpers/statusHelper');
const { createTemperatureStates } = require('./lib/stateDefinitions/temperatureStates');
const { createPumpStates } = require('./lib/stateDefinitions/pumpStates');
const { createSolarStates } = require('./lib/stateDefinitions/solarStates');
const { createGeneralStates } = require('./lib/stateDefinitions/generalStates');
const { createTimeStates } = require('./lib/stateDefinitions/timeStates');
const { createRuntimeStates } = require('./lib/stateDefinitions/runtimeStates');
const { createSpeechStates } = require('./lib/stateDefinitions/speechStates');
const { createConsumptionStates } = require('./lib/stateDefinitions/consumptionStates');
const { createStatusStates } = require('./lib/stateDefinitions/statusStates');

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

    async onReady() {
        this.log.info('Adapter gestartet');

        // --- Allgemeine Einstellungen ---
        await createGeneralStates(this);

        // --- Pumpe ---
        await createPumpStates(this);

        // --- Temperaturverwaltung ---
        await createTemperatureStates(this);

        // --- Solarverwaltung ---
        await createSolarStates(this);

        // --- Zeitsteuerung ---
        await createTimeStates(this);

        // --- Laufzeitsteuerung ---
        await createRuntimeStates(this);

        // --- Sprachausgaben ---
        await createSpeechStates(this);

        // --- Verbrauch & Kosten ---
        await createConsumptionStates(this);

        // --- Statusübersicht ---
        await createStatusStates(this);
		
        // Saisonstatus aus Config übernehmen
        await this.setStateAsync('status.season_active', {
            val: this.config.season_active,
            ack: true,
        });

        // --- Helper starten ---
        temperatureHelper.init(this);
        timeHelper.init(this);
        runtimeHelper.init(this);
        pumpHelper.init(this);
        speechHelper.init(this);
        consumptionHelper.init(this);
        solarHelper.init(this);
        frostHelper.init(this);
        statusHelper.init(this);
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
            if (pumpHelper.cleanup) {
                pumpHelper.cleanup();
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
        } catch (e) {
            this.log.warn(`[onUnload] Fehler beim Cleanup: ${e.message}`);
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

        // Saisonstatus manuell ändern (z.B. über VIS)
        if (id.endsWith('status.season_active') && state && state.ack === false) {
            this.log.info(`[main] Saisonstatus geändert: ${state.val}`);
            await this.setStateAsync('status.season_active', { val: state.val, ack: true });
            return; // danach keine Helper mehr aufrufen
        }

        try {
            temperatureHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[temperatureHelper] Fehler in handleStateChange: ${e.message}`);
        }
        try {
            runtimeHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[runtimeHelper] Fehler in handleStateChange: ${e.message}`);
        }
        try {
            pumpHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper] Fehler in handleStateChange: ${e.message}`);
        }
        try {
            speechHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[speechHelper] Fehler in handleStateChange: ${e.message}`);
        }
        try {
            consumptionHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[consumptionHelper] Fehler in handleStateChange: ${e.message}`);
        }
        try {
            statusHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[statusHelper] Fehler in handleStateChange: ${e.message}`);
        }
    }
}

if (require.main !== module) {
    module.exports = options => new Poolcontrol(options);
} else {
    new Poolcontrol();
}

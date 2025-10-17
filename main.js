'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

const utils = require('@iobroker/adapter-core');
const temperatureHelper = require('./lib/helpers/temperatureHelper');
const timeHelper = require('./lib/helpers/timeHelper');
const runtimeHelper = require('./lib/helpers/runtimeHelper');
const pumpHelper = require('./lib/helpers/pumpHelper');
const pumpHelper2 = require('./lib/helpers/pumpHelper2');
const pumpHelper3 = require('./lib/helpers/pumpHelper3');
const speechHelper = require('./lib/helpers/speechHelper');
const consumptionHelper = require('./lib/helpers/consumptionHelper');
const solarHelper = require('./lib/helpers/solarHelper');
const frostHelper = require('./lib/helpers/frostHelper');
const statusHelper = require('./lib/helpers/statusHelper');
const controlHelper = require('./lib/helpers/controlHelper');
const controlHelper2 = require('./lib/helpers/controlHelper2');
const debugLogHelper = require('./lib/helpers/debugLogHelper');
const speechTextHelper = require('./lib/helpers/speechTextHelper');
const migrationHelper = require('./lib/helpers/migrationHelper');
const { HardwareHelper } = require('./lib/helpers/hardwareHelper'); // NEU: Hardware-Box-Erkennung
const { createTemperatureStates } = require('./lib/stateDefinitions/temperatureStates');
const { createPumpStates } = require('./lib/stateDefinitions/pumpStates');
const { createPumpStates2 } = require('./lib/stateDefinitions/pumpStates2');
const { createPumpStates3 } = require('./lib/stateDefinitions/pumpStates3');
const { createSolarStates } = require('./lib/stateDefinitions/solarStates');
const { createGeneralStates } = require('./lib/stateDefinitions/generalStates');
const { createTimeStates } = require('./lib/stateDefinitions/timeStates');
const { createRuntimeStates } = require('./lib/stateDefinitions/runtimeStates');
const { createSpeechStates } = require('./lib/stateDefinitions/speechStates');
const { createConsumptionStates } = require('./lib/stateDefinitions/consumptionStates');
const { createStatusStates } = require('./lib/stateDefinitions/statusStates');
const { createControlStates } = require('./lib/stateDefinitions/controlStates');
const { createDebugLogStates } = require('./lib/stateDefinitions/debugLogStates');
const { createHardwareStates } = require('./lib/stateDefinitions/hardwareStates');

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
        await createPumpStates2(this);
        await createPumpStates3(this);

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

        // NEU: Kurze Verzögerung, bis Config vollständig geladen ist
        await new Promise(resolve => setTimeout(resolve, 200));

        // TempBox-Checkbox aus Config übernehmen (Synchronisierung)
        await this.setStateAsync('hardware.tempbox.settings.enabled', {
            val: this.config.use_tempbox,
            ack: true,
        });

        // TasterBox-Checkbox aus Config übernehmen (Synchronisierung)
        await this.setStateAsync('hardware.tasterbox.settings.enabled', {
            val: this.config.use_tasterbox,
            ack: true,
        });

        // --- Control States ---
        await createControlStates(this);

        // --- DebugLog Staets ---
        await createDebugLogStates(this);

        // --- Migration Helper zuletzt starten ---
        await migrationHelper.init(this);

        // --- Hardware States ---
        await createHardwareStates(this);

        // NEU: HardwareHelper starten
        this.hardwareHelper = new HardwareHelper(this);
        await this.hardwareHelper.init();

        // --- Helper starten ---
        temperatureHelper.init(this);
        timeHelper.init(this);
        runtimeHelper.init(this);
        pumpHelper.init(this);
        pumpHelper2.init(this);
        pumpHelper3.init(this);
        speechHelper.init(this);
        consumptionHelper.init(this);
        solarHelper.init(this);
        frostHelper.init(this);
        statusHelper.init(this);
        controlHelper.init(this);
        controlHelper2.init(this);
        debugLogHelper.init(this);
        speechTextHelper.init(this);
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
            if (pumpHelper2.cleanup) {
                pumpHelper2.cleanup();
            }
            if (pumpHelper3.cleanup) {
                pumpHelper3.cleanup();
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
            if (speechTextHelper.cleanup) {
                speechTextHelper.cleanup();
            }
            if (this.hardwareHelper) {
                this.hardwareHelper.cleanup(); // NEU: Timer & Scan stoppen
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

        // TempBox Statusänderung manuell (z. B. aus VIS oder Instanz)
        if (id.endsWith('hardware.tempbox.settings.enabled') && state && state.ack === false) {
            this.log.info(`[main] TempBox aktiviert/deaktiviert: ${state.val}`);
            await this.setStateAsync('hardware.tempbox.settings.enabled', { val: state.val, ack: true });
            return;
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
            pumpHelper2.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper2] Fehler in handleStateChange: ${e.message}`);
        }
        try {
            pumpHelper3.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[pumpHelper3] Fehler in handleStateChange: ${e.message}`);
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
        try {
            speechTextHelper.handleStateChange(id, state);
        } catch (e) {
            this.log.warn(`[speechTextHelper] Fehler in handleStateChange: ${e.message}`);
        }
        if (id.includes('control.')) {
            controlHelper.handleStateChange(id, state);
        }
        if (id.includes('control.')) {
            controlHelper2.handleStateChange(id, state);
        }

        await debugLogHelper.handleStateChange(id, state);
    }
}

if (require.main !== module) {
    module.exports = options => new Poolcontrol(options);
} else {
    new Poolcontrol();
}

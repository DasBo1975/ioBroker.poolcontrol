'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const FROST_HELPER_PATH = require.resolve('../../lib/helpers/frostHelper');
const PHOTOVOLTAIC_HELPER_PATH = require.resolve('../../lib/helpers/photovoltaicHelper');
const PUMP_HELPER_PATH = require.resolve('../../lib/helpers/pumpHelper');
const SOLAR_HELPER_PATH = require.resolve('../../lib/helpers/solarHelper');
const CONTROL_HELPER_PATH = require.resolve('../../lib/helpers/controlHelper');

const PUMP_SWITCH_ID = 'pump.pump_switch';
const PUMP_MODE_ID = 'pump.mode';
const PUMP_OWNER_ID = 'pump.active_helper';
const MANUAL_SAFETY_ID = 'pump.manual_safety_enabled';
const MAINTENANCE_ID = 'control.pump.maintenance_active';
const SEASON_ID = 'status.season_active';
const FROST_ENABLED_ID = 'pump.frost_protection_active';
const COLLECTOR_WARNING_ID = 'solar.collector_warning';
const PHYSICAL_PUMP_ID = 'test.0.pump';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/** @typedef {Map<string, FakeState>} FakeStateStore */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setStateChangedAsync' | 'setForeignStateAsync'} method Write method.
 * @property {string} id State ID.
 * @property {FakeState} state Written state.
 */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer ID.
 * @property {() => unknown} callback Registered callback.
 * @property {number} delay Requested delay.
 */

/**
 * @typedef {object} LoadedFrostHelper
 * @property {object | null} _adapter Adapter instance.
 * @property {boolean} _active Lifecycle state.
 * @property {ioBroker.StateValue} _prevModeBeforeFrost Previous user mode.
 * @property {() => Promise<void>} _checkFrost Run one frost check.
 * @property {(id: string, state: FakeState) => Promise<void>} handleStateChange Handle a policy change.
 */

/**
 * @typedef {object} LoadedPhotovoltaicHelper
 * @property {object | null} _adapter Adapter instance.
 * @property {boolean} _active Lifecycle state.
 * @property {boolean | null} _desiredPump Desired pump state.
 * @property {number} _recalcRequestSeq Recalculation sequence.
 * @property {boolean} _recalcPending Pending recalculation marker.
 * @property {(tag?: string, sequence?: number) => Promise<void>} _recalc Run one recalculation.
 */

/**
 * @typedef {object} LoadedPumpHelper
 * @property {object | null} _adapter Adapter instance.
 * @property {string | null} deviceId Physical pump state ID.
 * @property {string | null} currentPowerId Pump power state ID.
 * @property {number | null} _lastPumpStart Last start timestamp.
 * @property {number | null} _lastPumpStop Last stop timestamp.
 * @property {(id: string, state: FakeState) => Promise<void>} handleStateChange Handle a pump command.
 */

/**
 * @typedef {object} LoadedSolarHelper
 * @property {object | null} _adapter Adapter instance.
 * @property {() => Promise<void>} _checkSolar Run one standard-solar check.
 */

/**
 * @param {string} modulePath Module path.
 * @returns {unknown} Fresh CommonJS module instance.
 */
function loadFresh(modulePath) {
    delete require.cache[modulePath];
    return require(modulePath);
}

/** @returns {FakeStateStore} Standard pump safety state store. */
function createStateStore() {
    return new Map(
        Object.entries({
            [SEASON_ID]: { val: true },
            [PUMP_MODE_ID]: { val: 'auto' },
            [PUMP_OWNER_ID]: { val: '' },
            [PUMP_SWITCH_ID]: { val: false },
            [MANUAL_SAFETY_ID]: { val: true },
            [MAINTENANCE_ID]: { val: false },
            [FROST_ENABLED_ID]: { val: true },
            'pump.frost_protection_temp': { val: 2 },
            'temperature.outside.current': { val: 1 },
            'speech.frost_active': { val: false },
            [COLLECTOR_WARNING_ID]: { val: false },
            'photovoltaic.power_generated_w': { val: 2000 },
            'photovoltaic.power_house_w': { val: 200 },
            'photovoltaic.threshold_w': { val: 100 },
            'photovoltaic.afterrun_min': { val: 0 },
            'photovoltaic.ignore_on_circulation': { val: false },
            'photovoltaic.power_surplus_w': { val: 0 },
            'photovoltaic.surplus_active': { val: false },
            'photovoltaic.status_text': { val: '' },
            'pump.pump_max_watt': { val: 500 },
            'pump.current_power': { val: 500 },
            'pump.error': { val: false },
            'pump.startup_power_check_timeout_sec': { val: 5 },
            'solar.solar_control_active': { val: true },
            'solar.control_mode': { val: 'standard' },
            'solar.temp_on': { val: 30 },
            'solar.temp_off': { val: 25 },
            'solar.hysteresis_active': { val: false },
            'solar.request_active': { val: false },
            'solar.warn_active': { val: true },
            'solar.warn_temp': { val: 70 },
            'solar.warn_speech': { val: false },
            'speech.solar_active': { val: false },
            'temperature.collector.current': { val: 40 },
            'temperature.surface.current': { val: 25 },
            'control.circulation.check_time': { val: '18:00' },
            'control.pump.notifications_enabled': { val: false },
            'control.pump.maintenance_restore_mode': { val: '' },
            [PHYSICAL_PUMP_ID]: { val: false },
        }),
    );
}

/**
 * @param {FakeStateStore} [stateStore] Initial state store.
 */
function createAdapter(stateStore = createStateStore()) {
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {Map<number, FakeTimer>} */
    const intervals = new Map();
    /** @type {Map<number, FakeTimer>} */
    const timeouts = new Map();
    let timerSequence = 0;

    /**
     * @param {FakeWrite['method']} method Write method.
     * @param {string} id State ID.
     * @param {FakeState} state Written state.
     */
    function recordWrite(method, id, state) {
        const write = { method, id, state: { ...state } };
        writes.push(write);
        stateStore.set(id, write.state);
    }

    const adapter = {
        namespace: 'poolcontrol.0',
        config: { pump_switch: PHYSICAL_PUMP_ID },
        log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        subscribeForeignStates() {
            return undefined;
        },
        async getStateAsync(id) {
            return stateStore.get(id);
        },
        async getForeignStateAsync(id) {
            return stateStore.get(id);
        },
        async setStateAsync(id, state) {
            recordWrite('setStateAsync', id, state);
        },
        async setStateChangedAsync(id, state) {
            if (stateStore.get(id)?.val !== state.val) {
                recordWrite('setStateChangedAsync', id, state);
            }
        },
        async setForeignStateAsync(id, state) {
            recordWrite('setForeignStateAsync', id, state);
        },
        setInterval(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            intervals.set(timer.id, timer);
            return timer;
        },
        clearInterval(timer) {
            intervals.delete(timer.id);
        },
        setTimeout(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            timeouts.set(timer.id, timer);
            return timer;
        },
        clearTimeout(timer) {
            timeouts.delete(timer.id);
        },
    };

    return {
        adapter,
        stateStore,
        writes,
        subscriptions,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
        set(id, val) {
            stateStore.set(id, { val });
        },
    };
}

/**
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter context.
 * @returns {LoadedPumpHelper} Prepared physical pump helper.
 */
function preparePumpHelper(fake) {
    const helper = /** @type {LoadedPumpHelper} */ (loadFresh(PUMP_HELPER_PATH));
    helper._adapter = fake.adapter;
    helper.deviceId = PHYSICAL_PUMP_ID;
    helper.currentPowerId = null;
    helper._lastPumpStart = null;
    helper._lastPumpStop = null;
    return helper;
}

/**
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter context.
 * @returns {LoadedFrostHelper} Prepared frost helper.
 */
function prepareFrostHelper(fake) {
    const helper = /** @type {LoadedFrostHelper} */ (loadFresh(FROST_HELPER_PATH));
    helper._adapter = fake.adapter;
    helper._active = true;
    helper._prevModeBeforeFrost = null;
    return helper;
}

/**
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter context.
 * @returns {LoadedPhotovoltaicHelper} Prepared photovoltaic helper.
 */
function preparePhotovoltaicHelper(fake) {
    const helper = /** @type {LoadedPhotovoltaicHelper} */ (loadFresh(PHOTOVOLTAIC_HELPER_PATH));
    helper._adapter = fake.adapter;
    helper._active = true;
    helper._desiredPump = null;
    helper._recalcRequestSeq = 0;
    helper._recalcPending = false;
    return helper;
}

/**
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter context.
 */
async function forwardPumpCommand(fake) {
    const pumpState = fake.stateStore.get(PUMP_SWITCH_ID);
    if (!pumpState) {
        throw new Error('Missing pump switch state');
    }
    await preparePumpHelper(fake).handleStateChange(`poolcontrol.0.${PUMP_SWITCH_ID}`, pumpState);
}

/**
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter context.
 */
function expectNoPumpRequest(fake) {
    expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('');
    expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
    expect(fake.writesFor(PHYSICAL_PUMP_ID)).to.have.length(0);
}

describe('Pump safety policy', () => {
    it('allows enabled frost protection to start logically and physically while the season is inactive', async () => {
        const fake = createAdapter();
        fake.set(SEASON_ID, false);

        await prepareFrostHelper(fake)._checkFrost();
        await forwardPumpCommand(fake);

        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('frostHelper');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(true);
        expect(fake.stateStore.get(PHYSICAL_PUMP_ID)?.val).to.equal(true);
    });

    it('does not start frost protection while its own switch is disabled', async () => {
        const fake = createAdapter();
        fake.set(SEASON_ID, false);
        fake.set(FROST_ENABLED_ID, false);

        await prepareFrostHelper(fake)._checkFrost();

        expectNoPumpRequest(fake);
    });

    it('keeps off as a hard block for frost while the season is inactive', async () => {
        const fake = createAdapter();
        fake.set(SEASON_ID, false);
        fake.set(PUMP_MODE_ID, 'off');

        await prepareFrostHelper(fake)._checkFrost();

        expectNoPumpRequest(fake);
    });

    it('allows frost in manual mode when manual safety is enabled', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'manual');

        await prepareFrostHelper(fake)._checkFrost();
        await forwardPumpCommand(fake);

        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('frostHelper');
        expect(fake.stateStore.get(PHYSICAL_PUMP_ID)?.val).to.equal(true);
    });

    it('blocks frost in manual mode when manual safety is disabled', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'manual');
        fake.set(MANUAL_SAFETY_ID, false);

        await prepareFrostHelper(fake)._checkFrost();

        expectNoPumpRequest(fake);
    });

    it('keeps off as a hard block for frost while the season is active', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'off');

        await prepareFrostHelper(fake)._checkFrost();

        expectNoPumpRequest(fake);
    });

    it('keeps collector warning active without a PV pump request while the season is inactive', async () => {
        const fake = createAdapter();
        fake.set(SEASON_ID, false);
        fake.set(COLLECTOR_WARNING_ID, true);

        await preparePhotovoltaicHelper(fake)._recalc('test');

        expect(fake.stateStore.get(COLLECTOR_WARNING_ID)?.val).to.equal(true);
        expectNoPumpRequest(fake);
    });

    it('allows solar-overheat safety in auto mode during the active season', async () => {
        const fake = createAdapter();
        fake.set(COLLECTOR_WARNING_ID, true);

        await preparePhotovoltaicHelper(fake)._recalc('test');
        await forwardPumpCommand(fake);

        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('photovoltaicHelper');
        expect(fake.stateStore.get(PHYSICAL_PUMP_ID)?.val).to.equal(true);
    });

    it('allows solar-overheat safety in manual mode when manual safety is enabled', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'manual');
        fake.set(COLLECTOR_WARNING_ID, true);

        await preparePhotovoltaicHelper(fake)._recalc('test');

        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('photovoltaicHelper');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(true);
    });

    it('blocks solar-overheat safety in manual mode when manual safety is disabled', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'manual');
        fake.set(MANUAL_SAFETY_ID, false);
        fake.set(COLLECTOR_WARNING_ID, true);

        await preparePhotovoltaicHelper(fake)._recalc('test');

        expectNoPumpRequest(fake);
    });

    it('keeps off as a hard block for solar-overheat safety', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'off');
        fake.set(COLLECTOR_WARNING_ID, true);

        await preparePhotovoltaicHelper(fake)._recalc('test');

        expectNoPumpRequest(fake);
    });

    it('blocks frost during maintenance', async () => {
        const fake = createAdapter();
        fake.set(MAINTENANCE_ID, true);

        await prepareFrostHelper(fake)._checkFrost();

        expectNoPumpRequest(fake);
    });

    it('blocks solar-overheat safety during maintenance', async () => {
        const fake = createAdapter();
        fake.set(MAINTENANCE_ID, true);
        fake.set(COLLECTOR_WARNING_ID, true);

        await preparePhotovoltaicHelper(fake)._recalc('test');

        expectNoPumpRequest(fake);
    });

    it('stops and releases an owned solar-overheat request when the season becomes inactive', async () => {
        const fake = createAdapter();
        fake.set(COLLECTOR_WARNING_ID, true);
        const helper = preparePhotovoltaicHelper(fake);

        await helper._recalc('start');
        fake.set(SEASON_ID, false);
        await helper._recalc('season-off');
        await forwardPumpCommand(fake);

        expect(fake.stateStore.get(COLLECTOR_WARNING_ID)?.val).to.equal(true);
        expectNoPumpRequest(fake);
        expect(fake.stateStore.get(PHYSICAL_PUMP_ID)?.val).to.equal(false);
    });

    it('keeps an active frost request running when only the season becomes inactive', async () => {
        const fake = createAdapter();
        const helper = prepareFrostHelper(fake);

        await helper._checkFrost();
        await forwardPumpCommand(fake);
        fake.set(SEASON_ID, false);
        await helper.handleStateChange(`poolcontrol.0.${SEASON_ID}`, { val: false, ack: true });

        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('frostHelper');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(true);
        expect(fake.stateStore.get(PHYSICAL_PUMP_ID)?.val).to.equal(true);
    });

    it('stops owned frost and solar safety requests when mode changes to off', async () => {
        const frostFake = createAdapter();
        const frostHelper = prepareFrostHelper(frostFake);
        await frostHelper._checkFrost();
        frostFake.set(PUMP_MODE_ID, 'off');
        await frostHelper.handleStateChange(`poolcontrol.0.${PUMP_MODE_ID}`, { val: 'off', ack: false });

        const solarFake = createAdapter();
        solarFake.set(COLLECTOR_WARNING_ID, true);
        const photovoltaicHelper = preparePhotovoltaicHelper(solarFake);
        await photovoltaicHelper._recalc('start');
        solarFake.set(PUMP_MODE_ID, 'off');
        await photovoltaicHelper._recalc('off');

        expect(frostFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('');
        expect(frostFake.stateStore.get(PUMP_MODE_ID)?.val).to.equal('off');
        expect(frostFake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
        expect(solarFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('');
        expect(solarFake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
    });

    it('stops owned frost and solar safety when manual safety is disabled live', async () => {
        const frostFake = createAdapter();
        frostFake.set(PUMP_MODE_ID, 'manual');
        const frostHelper = prepareFrostHelper(frostFake);
        await frostHelper._checkFrost();
        frostFake.set(MANUAL_SAFETY_ID, false);
        await frostHelper.handleStateChange(`poolcontrol.0.${MANUAL_SAFETY_ID}`, { val: false, ack: false });

        const solarFake = createAdapter();
        solarFake.set(PUMP_MODE_ID, 'manual');
        solarFake.set(COLLECTOR_WARNING_ID, true);
        const photovoltaicHelper = preparePhotovoltaicHelper(solarFake);
        await photovoltaicHelper._recalc('start');
        solarFake.set(MANUAL_SAFETY_ID, false);
        await photovoltaicHelper._recalc('manual-safety-off');

        expect(frostFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('');
        expect(frostFake.stateStore.get(PUMP_MODE_ID)?.val).to.equal('manual');
        expect(frostFake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
        expect(solarFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('');
        expect(solarFake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
    });

    it('never overwrites or releases foreign ownership', async () => {
        const frostFake = createAdapter();
        frostFake.set(PUMP_OWNER_ID, 'timeHelper');
        await prepareFrostHelper(frostFake)._checkFrost();

        const solarFake = createAdapter();
        solarFake.set(PUMP_OWNER_ID, 'solarHelper');
        solarFake.set(COLLECTOR_WARNING_ID, true);
        await preparePhotovoltaicHelper(solarFake)._recalc('test');

        expect(frostFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('timeHelper');
        expect(frostFake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
        expect(solarFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('solarHelper');
        expect(solarFake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
    });

    it('preserves normal frost hysteresis and restores the prior mode', async () => {
        const fake = createAdapter();
        const helper = prepareFrostHelper(fake);

        await helper._checkFrost();
        fake.set('temperature.outside.current', 4);
        await helper._checkFrost();

        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('');
        expect(fake.stateStore.get(PUMP_MODE_ID)?.val).to.equal('auto');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
    });

    it('allows frost and solar-overheat safety in time mode when no helper owns the pump', async () => {
        const frostFake = createAdapter();
        frostFake.set(PUMP_MODE_ID, 'time');
        await prepareFrostHelper(frostFake)._checkFrost();

        const solarFake = createAdapter();
        solarFake.set(PUMP_MODE_ID, 'time');
        solarFake.set(COLLECTOR_WARNING_ID, true);
        await preparePhotovoltaicHelper(solarFake)._recalc('test');

        expect(frostFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('frostHelper');
        expect(solarFake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('photovoltaicHelper');
    });

    it('preserves the normal standard-solar path', async () => {
        const fake = createAdapter();
        const helper = /** @type {LoadedSolarHelper} */ (loadFresh(SOLAR_HELPER_PATH));
        helper._adapter = fake.adapter;

        await helper._checkSolar();

        expect(fake.stateStore.get('solar.request_active')?.val).to.equal(true);
        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('solarHelper');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(true);
    });

    it('preserves the normal PV-surplus path in auto_pv mode', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'auto_pv');

        await preparePhotovoltaicHelper(fake)._recalc('pv-surplus');

        expect(fake.stateStore.get('photovoltaic.surplus_active')?.val).to.equal(true);
        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('photovoltaicHelper');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(true);
    });

    it('preserves the existing maintenance takeover behavior', async () => {
        const fake = createAdapter();
        fake.set(PUMP_MODE_ID, 'manual');
        fake.set(PUMP_SWITCH_ID, true);
        const controlHelper =
            /** @type {{init(adapter: object): void, handleStateChange(id: string, state: FakeState): Promise<void>, cleanup(): void}} */ (
                loadFresh(CONTROL_HELPER_PATH)
            );
        controlHelper.init(fake.adapter);
        fake.set(MAINTENANCE_ID, true);

        await controlHelper.handleStateChange(`poolcontrol.0.${MAINTENANCE_ID}`, { val: true, ack: false });

        expect(fake.stateStore.get(PUMP_MODE_ID)?.val).to.equal('controlHelper');
        expect(fake.stateStore.get(PUMP_OWNER_ID)?.val).to.equal('controlHelper');
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(false);
        expect(fake.stateStore.get('control.pump.maintenance_restore_mode')?.val).to.equal('manual');
        controlHelper.cleanup();
    });
});

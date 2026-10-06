'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const PUMP_STATES_PATH = require.resolve('../../lib/stateDefinitions/pumpStates');
const STATUS_STATES_PATH = require.resolve('../../lib/stateDefinitions/statusStates');
const SPEECH_STATES_PATH = require.resolve('../../lib/stateDefinitions/speechStates');
const FROST_HELPER_PATH = require.resolve('../../lib/helpers/frostHelper');

const FROST_ACTIVE_ID = 'pump.frost_protection_active';
const FROST_TEMP_ID = 'pump.frost_protection_temp';
const PUMP_SWITCH_ID = 'pump.pump_switch';
const SEASON_ACTIVE_ID = 'status.season_active';
const SPEECH_LAST_SENT_ID = 'speech.sources.solar.last_sent';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/** @typedef {FakeState | null} StoredState */
/** @typedef {Map<string, StoredState>} FakeStateStore */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setStateChangedAsync'} method Adapter write method.
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
 * @typedef {object} FakeAdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [config] Adapter configuration.
 * @property {FakeStateStore} [stateStore] Initial or shared state store.
 */

/** @typedef {(adapter: object) => Promise<void>} StateCreator */

/**
 * @typedef {object} LoadedFrostHelper
 * @property {(adapter: object) => void} init Initialize frost checks.
 * @property {() => void} cleanup Stop frost checks.
 */

/**
 * @param {string} modulePath Required StateDefinition module.
 * @param {string} exportName Exported creator name.
 * @returns {StateCreator} State creator with a test-local adapter boundary.
 */
function loadStateCreator(modulePath, exportName) {
    delete require.cache[modulePath];
    return /** @type {StateCreator} */ (require(modulePath)[exportName]);
}

/** @returns {LoadedFrostHelper} Fresh frostHelper singleton. */
function loadFreshFrostHelper() {
    delete require.cache[FROST_HELPER_PATH];
    return /** @type {LoadedFrostHelper} */ (require(FROST_HELPER_PATH));
}

/**
 * @param {FakeAdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ config = {}, stateStore = new Map() } = {}) {
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {Map<number, FakeTimer>} */
    const intervals = new Map();
    let timerSequence = 0;

    /**
     * @param {FakeWrite['method']} method Adapter write method.
     * @param {string} id State ID.
     * @param {FakeState} state Written state.
     */
    function recordWrite(method, id, state) {
        const write = { method, id, state: { ...state } };
        writes.push(write);
        stateStore.set(id, write.state);
    }

    const adapter = {
        config,
        log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
        async getObjectAsync() {
            return null;
        },
        async setObjectNotExistsAsync() {
            return undefined;
        },
        async extendObjectAsync() {
            return undefined;
        },
        async getStateAsync(id) {
            return stateStore.get(id);
        },
        async setStateAsync(id, state) {
            recordWrite('setStateAsync', id, state);
        },
        async setStateChangedAsync(id, state) {
            recordWrite('setStateChangedAsync', id, state);
        },
        subscribeStates() {
            return undefined;
        },
        setInterval(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            intervals.set(timer.id, timer);
            return timer;
        },
        clearInterval(timer) {
            intervals.delete(timer.id);
        },
    };

    return {
        adapter,
        stateStore,
        writes,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
        clearWrites() {
            writes.length = 0;
        },
        activeIntervals() {
            return [...intervals.values()];
        },
    };
}

async function nextTurn() {
    await new Promise(resolve => setImmediate(resolve));
}

/**
 * @param {() => boolean} predicate Completion predicate.
 * @param {string} description Wait description.
 */
async function waitFor(predicate, description) {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) {
            return;
        }
        await nextTurn();
    }
    throw new Error(`Timed out waiting for ${description}`);
}

/** @returns {Record<string, ioBroker.StateValue>} Minimal pump StateDefinition configuration. */
function pumpConfig() {
    return {
        pump_max_watt: 900,
        pump_power_lph: 12_000,
        frost_protection_active: true,
        frost_protection_temp: 2,
        manual_safety_enabled: true,
    };
}

describe('StateDefinition initialization and frost persistence', () => {
    it('initializes status.season_active when getStateAsync returns undefined', async () => {
        const fake = createAdapter({ config: { season_active: true } });
        const createStatusStates = loadStateCreator(STATUS_STATES_PATH, 'createStatusStates');

        await createStatusStates(fake.adapter);

        expect(fake.writesFor(SEASON_ACTIVE_ID).map(write => write.state.val)).to.deep.equal([true]);
    });

    it('initializes status.season_active when getStateAsync returns null', async () => {
        const stateStore = new Map([[SEASON_ACTIVE_ID, null]]);
        const fake = createAdapter({ config: { season_active: true }, stateStore });
        const createStatusStates = loadStateCreator(STATUS_STATES_PATH, 'createStatusStates');

        await createStatusStates(fake.adapter);

        expect(fake.writesFor(SEASON_ACTIVE_ID).map(write => write.state.val)).to.deep.equal([true]);
    });

    it('preserves the valid boolean false in status.season_active', async () => {
        const stateStore = new Map([[SEASON_ACTIVE_ID, { val: false }]]);
        const fake = createAdapter({ config: { season_active: true }, stateStore });
        const createStatusStates = loadStateCreator(STATUS_STATES_PATH, 'createStatusStates');

        await createStatusStates(fake.adapter);

        expect(fake.writesFor(SEASON_ACTIVE_ID)).to.have.length(0);
        expect(fake.stateStore.get(SEASON_ACTIVE_ID)?.val).to.equal(false);
    });

    it('preserves the valid number zero in pump.frost_protection_temp', async () => {
        const stateStore = new Map([[FROST_TEMP_ID, { val: 0 }]]);
        const fake = createAdapter({ config: pumpConfig(), stateStore });
        const createPumpStates = loadStateCreator(PUMP_STATES_PATH, 'createPumpStates');

        await createPumpStates(fake.adapter);

        expect(fake.writesFor(FROST_TEMP_ID)).to.have.length(0);
        expect(fake.stateStore.get(FROST_TEMP_ID)?.val).to.equal(0);
    });

    it('preserves the valid empty last_sent string', async () => {
        const stateStore = new Map([[SPEECH_LAST_SENT_ID, { val: '' }]]);
        const fake = createAdapter({ config: { speech_active: true }, stateStore });
        const createSpeechStates = loadStateCreator(SPEECH_STATES_PATH, 'createSpeechStates');

        await createSpeechStates(fake.adapter);

        expect(fake.writesFor(SPEECH_LAST_SENT_ID)).to.have.length(0);
        expect(fake.stateStore.get(SPEECH_LAST_SENT_ID)?.val).to.equal('');
    });

    it('initializes a missing frost threshold from adapter configuration', async () => {
        const fake = createAdapter({ config: pumpConfig() });
        const createPumpStates = loadStateCreator(PUMP_STATES_PATH, 'createPumpStates');

        await createPumpStates(fake.adapter);

        expect(fake.writesFor(FROST_TEMP_ID).map(write => write.state.val)).to.deep.equal([2]);
        expect(fake.stateStore.get(FROST_TEMP_ID)?.val).to.equal(2);
    });

    it('keeps a persisted frost threshold authoritative and uses it in the frost smoke path', async () => {
        const stateStore = new Map([
            [FROST_ACTIVE_ID, { val: true }],
            [FROST_TEMP_ID, { val: 5 }],
            ['pump.mode', { val: 'auto' }],
            ['pump.manual_safety_enabled', { val: true }],
            ['pump.startup_power_check_timeout_sec', { val: 5 }],
            ['temperature.outside.current', { val: 4 }],
            ['speech.frost_active', { val: false }],
        ]);
        const fake = createAdapter({ config: pumpConfig(), stateStore });
        const createPumpStates = loadStateCreator(PUMP_STATES_PATH, 'createPumpStates');

        await createPumpStates(fake.adapter);
        expect(fake.writesFor(FROST_TEMP_ID)).to.have.length(0);
        expect(fake.stateStore.get(FROST_TEMP_ID)?.val).to.equal(5);

        fake.clearWrites();
        const frostHelper = loadFreshFrostHelper();
        frostHelper.init(fake.adapter);
        await waitFor(
            () => fake.writesFor(PUMP_SWITCH_ID).some(write => write.state.val === true),
            'frostHelper to activate the pump from the persisted threshold',
        );

        expect(fake.stateStore.get(FROST_TEMP_ID)?.val).to.equal(5);
        expect(fake.stateStore.get(PUMP_SWITCH_ID)?.val).to.equal(true);
        expect(fake.activeIntervals()).to.have.length(1);
        frostHelper.cleanup();
    });
});

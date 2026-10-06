'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const path = require('node:path');
const { expect } = require('chai');
const { I18n } = require('@iobroker/adapter-core');

const TOOLS_PATH = require.resolve('../../lib/helpers/chemistryToolsHelper');
const PH_PATH = require.resolve('../../lib/helpers/chemistryPhHelper');
const ORP_PATH = require.resolve('../../lib/helpers/chemistryOrpHelper');
const TDS_PATH = require.resolve('../../lib/helpers/chemistryTdsHelper');

const PUMP_SWITCH_ID = 'pump.pump_switch';
const PUMP_OWNER_ID = 'pump.active_helper';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value exposed to a helper.
 * @property {number} [ts] Optional source timestamp.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/** @typedef {Partial<Record<string, FakeState>>} FakeInitialStates */
/** @typedef {(id: string) => FakeState | undefined | Promise<FakeState | undefined>} FakeStateProvider */
/** @typedef {(write: FakeWrite) => void} FakeWriteObserver */

/**
 * @typedef {object} LoadedHelper
 * @property {(adapter: object) => void | Promise<void>} init Initialize the helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle a state event.
 * @property {() => void} cleanup Stop the helper.
 */

/**
 * @typedef {object} FakeAdapterOptions
 * @property {FakeInitialStates} [states] Initial own-state values.
 * @property {FakeStateProvider} [getState] Optional controlled own-state reader.
 * @property {FakeWriteObserver} [onWrite] Optional observer for completed state writes.
 */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setStateChangedAsync'} method Adapter write method.
 * @property {string} id State ID.
 * @property {FakeState} state Written state value.
 */

/**
 * @typedef {object} FakeRead
 * @property {'own' | 'foreign'} scope Read scope.
 * @property {string} id State ID.
 */

/**
 * @typedef {object} FakeSubscription
 * @property {'subscribe' | 'unsubscribe'} action Subscription action.
 * @property {'own' | 'foreign'} scope Subscription scope.
 * @property {string} id State ID.
 */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer ID.
 * @property {() => unknown} callback Registered callback.
 * @property {number} delay Requested delay.
 */

/**
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

/**
 * @template T
 * @returns {Deferred<T>} Controlled promise and resolver.
 */
function createDeferred() {
    /** @type {Deferred<T>['resolve']} */
    let resolvePromise = () => undefined;
    /** @type {Promise<T>} */
    const promise = new Promise(resolve => {
        resolvePromise = resolve;
    });

    return { promise, resolve: resolvePromise };
}

/**
 * @param {string} modulePath Module path resolved by require.
 * @returns {LoadedHelper} Fresh CommonJS helper singleton.
 */
function loadFreshHelper(modulePath) {
    delete require.cache[modulePath];
    return /** @type {LoadedHelper} */ (require(modulePath));
}

/**
 * @param {FakeAdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ states = {}, getState, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {FakeRead[]} */
    const reads = [];
    /** @type {FakeSubscription[]} */
    const subscriptions = [];
    /** @type {Map<number, FakeTimer>} */
    const timers = new Map();
    /** @type {FakeTimer[]} */
    const timerCreations = [];
    let timerSequence = 0;

    /**
     * @param {FakeWrite['method']} method Adapter write method.
     * @param {string} id State ID.
     * @param {FakeState} state State value.
     */
    function recordWrite(method, id, state) {
        const storedState = { ...state };
        const write = { method, id, state: storedState };
        writes.push(write);
        stateStore.set(id, storedState);
        onWrite?.(write);
    }

    const adapter = {
        namespace: 'poolcontrol.0',
        config: {},
        log: {
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        async getStateAsync(id) {
            reads.push({ scope: 'own', id });
            if (getState) {
                const overridden = await getState(id);
                if (overridden !== undefined) {
                    return overridden;
                }
            }
            return stateStore.get(id);
        },
        async getForeignStateAsync(id) {
            reads.push({ scope: 'foreign', id });
            return undefined;
        },
        async setStateAsync(id, state) {
            recordWrite('setStateAsync', id, state);
        },
        async setStateChangedAsync(id, state) {
            recordWrite('setStateChangedAsync', id, state);
        },
        async subscribeStatesAsync(id) {
            subscriptions.push({ action: 'subscribe', scope: 'own', id });
        },
        subscribeStates(id) {
            subscriptions.push({ action: 'subscribe', scope: 'own', id });
        },
        async subscribeForeignStatesAsync(id) {
            subscriptions.push({ action: 'subscribe', scope: 'foreign', id });
        },
        subscribeForeignStates(id) {
            subscriptions.push({ action: 'subscribe', scope: 'foreign', id });
        },
        async unsubscribeForeignStatesAsync(id) {
            subscriptions.push({ action: 'unsubscribe', scope: 'foreign', id });
        },
        unsubscribeForeignStates(id) {
            subscriptions.push({ action: 'unsubscribe', scope: 'foreign', id });
        },
        setTimeout(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            timers.set(timer.id, timer);
            timerCreations.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            timers.delete(timer.id);
        },
    };

    return {
        adapter,
        reads,
        writes,
        subscriptions,
        timerCreations,
        value(id) {
            return stateStore.get(id)?.val;
        },
        state(id) {
            return stateStore.get(id);
        },
        setOwnValue(id, value) {
            stateStore.set(id, { val: value });
        },
        foreignSubscriptions() {
            return subscriptions
                .filter(entry => entry.action === 'subscribe' && entry.scope === 'foreign')
                .map(entry => entry.id);
        },
        writesSince(index) {
            return writes.slice(index);
        },
        activeTimerCount() {
            return timers.size;
        },
        requireTimerCreatedSince(index) {
            const timer = timerCreations.slice(index).find(entry => timers.has(entry.id));
            if (!timer) {
                throw new Error(`No active timer was created since index ${index}`);
            }
            return timer;
        },
        runTimer(timer) {
            if (!timers.delete(timer.id)) {
                throw new Error(`Timer ${timer.id} is not active`);
            }
            return timer.callback();
        },
    };
}

async function nextTurn() {
    await new Promise(resolve => setImmediate(resolve));
}

async function settle() {
    await nextTurn();
    await nextTurn();
}

async function waitFor(predicate, description) {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) {
            return;
        }
        await nextTurn();
    }

    throw new Error(`Timed out waiting for ${description}`);
}

function expectNoPumpOrActuatorWrites(writes) {
    const forbidden = writes.filter(
        write =>
            write.id === PUMP_SWITCH_ID ||
            write.id === PUMP_OWNER_ID ||
            /(?:dosing|actuator|chlorinator)/i.test(write.id),
    );
    expect(forbidden).to.deep.equal([]);
}

function cleanPhStates(overrides = {}) {
    return {
        'chemistry.ph.mix.active': { val: false },
        'chemistry.ph.mix.started_by_helper': { val: false },
        'chemistry.ph.mix.remaining_minutes': { val: 0 },
        'chemistry.ph.input.source_state_id': { val: '' },
        ...overrides,
    };
}

describe('Chemistry lifecycle contracts', () => {
    before(async () => {
        await I18n.init(path.resolve(__dirname, '../../lib'), 'en');
    });

    describe('chemistryToolsHelper', () => {
        it('lets a delayed prefill finish after cleanup without losing the adapter', async () => {
            /** @type {Deferred<FakeState>} */
            const poolRead = createDeferred();
            /** @type {Deferred<FakeWrite>} */
            const finalPrefillWrite = createDeferred();
            const finalPrefillId = 'chemistry.tools.ph_minus_calculator.02_current_ph';
            const fake = createAdapter({
                states: { 'chemistry.ph.input.current_value': { val: 7.2 } },
                getState: id => (id === 'general.pool_size' ? poolRead.promise : undefined),
                onWrite: write => {
                    if (write.id === finalPrefillId && write.state.val === 7.2) {
                        finalPrefillWrite.resolve(write);
                    }
                },
            });
            const helper = loadFreshHelper(TOOLS_PATH);

            helper.init(fake.adapter);
            await waitFor(
                () => fake.reads.some(read => read.id === 'general.pool_size'),
                'the delayed ChemistryTools prefill read',
            );
            helper.cleanup();
            poolRead.resolve({ val: 20000 });

            await finalPrefillWrite.promise;
            expect(fake.value(finalPrefillId)).to.equal(7.2);
            expect(fake.value('chemistry.tools.ph_plus_calculator.01_pool_volume_l')).to.equal(20000);
        });

        it('calculates one normal pH Plus result', async () => {
            const base = 'chemistry.tools.ph_plus_calculator';
            const fake = createAdapter({
                states: {
                    'general.pool_size': { val: 0 },
                    'chemistry.ph.input.current_value': { val: 0 },
                    [`${base}.01_pool_volume_l`]: { val: 20000 },
                    [`${base}.02_current_ph`]: { val: 7.0 },
                    [`${base}.03_target_ph`]: { val: 7.3 },
                    [`${base}.04_grams_per_10000l_01ph`]: { val: 100 },
                },
            });
            const helper = loadFreshHelper(TOOLS_PATH);

            helper.init(fake.adapter);
            await settle();
            await helper.handleStateChange(`${base}.05_calculate`, { val: true, ack: false });

            expect(fake.value(`${base}.10_result_grams`)).to.equal(600);
            expect(fake.value(`${base}.12_valid`)).to.equal(true);
            expect(fake.state(`${base}.05_calculate`)).to.deep.include({ val: false, ack: true });
            helper.cleanup();
        });
    });

    describe('chemistryPhHelper', () => {
        it('keeps a newer source authoritative when the startup source read finishes late', async () => {
            /** @type {Deferred<FakeState>} */
            const oldSourceRead = createDeferred();
            const sourceId = 'chemistry.ph.input.source_state_id';
            const fake = createAdapter({
                states: cleanPhStates(),
                getState: id => (id === sourceId ? oldSourceRead.promise : undefined),
            });
            const helper = loadFreshHelper(PH_PATH);

            await helper.init(fake.adapter);
            await waitFor(() => fake.reads.some(read => read.id === sourceId), 'the delayed pH source read');
            await helper.handleStateChange(sourceId, { val: 'sensor.ph.new', ack: false });
            oldSourceRead.resolve({ val: 'sensor.ph.old' });
            await settle();

            expect(fake.foreignSubscriptions()).to.include('sensor.ph.new');
            expect(fake.foreignSubscriptions()).not.to.include('sensor.ph.old');
            helper.cleanup();
        });

        it('normalizes an orphaned mixing run without touching pump control', async () => {
            const fake = createAdapter({
                states: cleanPhStates({
                    'chemistry.ph.mix.active': { val: true },
                    'chemistry.ph.mix.started_by_helper': { val: true },
                    'chemistry.ph.mix.remaining_minutes': { val: 4 },
                }),
            });
            const helper = loadFreshHelper(PH_PATH);

            await helper.init(fake.adapter);

            expect(fake.value('chemistry.ph.mix.active')).to.equal(false);
            expect(fake.value('chemistry.ph.mix.remaining_minutes')).to.equal(0);
            expect(fake.value('chemistry.ph.mix.started_by_helper')).to.equal(false);
            expect(fake.value('chemistry.ph.mix.status')).to.be.a('string').and.not.equal('');
            expectNoPumpOrActuatorWrites(fake.writes);
            helper.cleanup();
        });

        it('does not stop a pump or clear ownership taken by another helper', async () => {
            const originalNow = Date.now;
            let now = 1000000;
            Date.now = () => now;
            const fake = createAdapter({
                states: cleanPhStates({
                    'chemistry.ph.enabled': { val: true },
                    'status.season_active': { val: true },
                    'chemistry.ph.mix.runtime_minutes': { val: 1 },
                    [PUMP_SWITCH_ID]: { val: false },
                    [PUMP_OWNER_ID]: { val: '' },
                }),
            });
            const helper = loadFreshHelper(PH_PATH);

            try {
                await helper.init(fake.adapter);
                const timerCreationStart = fake.timerCreations.length;
                await helper.handleStateChange('chemistry.ph.mix.start', { val: true, ack: false });
                const mixTimer = fake.requireTimerCreatedSince(timerCreationStart);
                fake.setOwnValue(PUMP_OWNER_ID, 'solarHelper');
                const finishWriteStart = fake.writes.length;
                now += 61000;
                fake.runTimer(mixTimer);

                await waitFor(() => fake.value('chemistry.ph.mix.started_by_helper') === false, 'the pH mixing finish');
                expectNoPumpOrActuatorWrites(fake.writesSince(finishWriteStart));
                expect(fake.value(PUMP_OWNER_ID)).to.equal('solarHelper');
                expect(fake.value(PUMP_SWITCH_ID)).to.equal(true);
            } finally {
                Date.now = originalNow;
                helper.cleanup();
            }
        });

        it('does not schedule another mixing timer after cleanup', async () => {
            /** @type {Deferred<FakeState>} */
            const activeRead = createDeferred();
            let delayActiveRead = false;
            const fake = createAdapter({
                states: cleanPhStates({
                    'chemistry.ph.enabled': { val: true },
                    'status.season_active': { val: true },
                    'chemistry.ph.mix.runtime_minutes': { val: 1 },
                    [PUMP_SWITCH_ID]: { val: true },
                    [PUMP_OWNER_ID]: { val: '' },
                }),
                getState: id => (delayActiveRead && id === 'chemistry.ph.mix.active' ? activeRead.promise : undefined),
            });
            const helper = loadFreshHelper(PH_PATH);

            await helper.init(fake.adapter);
            const timerCreationStart = fake.timerCreations.length;
            await helper.handleStateChange('chemistry.ph.mix.start', { val: true, ack: false });
            const mixTimer = fake.requireTimerCreatedSince(timerCreationStart);
            delayActiveRead = true;
            const priorActiveReads = fake.reads.filter(read => read.id === 'chemistry.ph.mix.active').length;
            fake.runTimer(mixTimer);
            await waitFor(
                () => fake.reads.filter(read => read.id === 'chemistry.ph.mix.active').length > priorActiveReads,
                'the running pH mixing tick',
            );

            helper.cleanup();
            const timerCreationsAfterCleanup = fake.timerCreations.length;
            activeRead.resolve({ val: true });
            await settle();

            expect(fake.activeTimerCount()).to.equal(0);
            expect(fake.timerCreations).to.have.length(timerCreationsAfterCleanup);
        });

        it('processes one normal manual pH value', async () => {
            const fake = createAdapter({
                states: cleanPhStates({
                    'chemistry.ph.measurement.location': { val: 'manual' },
                    'chemistry.ph.evaluation.target_min': { val: 7.0 },
                    'chemistry.ph.evaluation.target_max': { val: 7.4 },
                }),
            });
            const helper = loadFreshHelper(PH_PATH);

            await helper.init(fake.adapter);
            await helper.handleStateChange('chemistry.ph.input.manual_value', { val: 7.2, ack: false });

            expect(fake.value('chemistry.ph.input.current_value')).to.equal(7.2);
            expect(fake.value('chemistry.ph.outputs.summary_json')).to.be.a('string');
            helper.cleanup();
        });
    });

    describe('chemistryOrpHelper', () => {
        it('keeps a newer source authoritative when the startup source read finishes late', async () => {
            /** @type {Deferred<FakeState>} */
            const oldSourceRead = createDeferred();
            const sourceId = 'chemistry.orp.input.source_state_id';
            const fake = createAdapter({
                getState: id => (id === sourceId ? oldSourceRead.promise : undefined),
            });
            const helper = loadFreshHelper(ORP_PATH);

            helper.init(fake.adapter);
            await waitFor(() => fake.reads.some(read => read.id === sourceId), 'the delayed ORP source read');
            await helper.handleStateChange(sourceId, { val: 'sensor.orp.new', ack: false });
            oldSourceRead.resolve({ val: 'sensor.orp.old' });
            await settle();

            expect(fake.foreignSubscriptions()).to.include('sensor.orp.new');
            expect(fake.foreignSubscriptions()).not.to.include('sensor.orp.old');
            helper.cleanup();
        });

        it('processes one normal value without pump or actuator writes', async () => {
            const fake = createAdapter({
                states: {
                    'chemistry.orp.input.source_mode': { val: 'manual' },
                    'chemistry.orp.measurement.location': { val: 'manual' },
                    'chemistry.orp.evaluation.target_min_mv': { val: 650 },
                    'chemistry.orp.evaluation.target_max_mv': { val: 800 },
                    'chemistry.ph.enabled': { val: true },
                    'chemistry.ph.input.current_value': { val: 7.2 },
                },
            });
            const helper = loadFreshHelper(ORP_PATH);

            helper.init(fake.adapter);
            await settle();
            await helper.handleStateChange('chemistry.orp.input.manual_value', { val: 720, ack: false });

            expect(fake.value('chemistry.orp.input.current_value')).to.equal(720);
            expect(fake.value('chemistry.orp.outputs.summary_json')).to.be.a('string');
            expectNoPumpOrActuatorWrites(fake.writes);
            helper.cleanup();
        });
    });

    describe('chemistryTdsHelper', () => {
        it('keeps a newer source authoritative when the startup source read finishes late', async () => {
            /** @type {Deferred<FakeState>} */
            const oldSourceRead = createDeferred();
            const sourceId = 'chemistry.tds.input.source_state_id';
            const fake = createAdapter({
                getState: id => (id === sourceId ? oldSourceRead.promise : undefined),
            });
            const helper = loadFreshHelper(TDS_PATH);

            helper.init(fake.adapter);
            await waitFor(() => fake.reads.some(read => read.id === sourceId), 'the delayed TDS source read');
            await helper.handleStateChange(sourceId, { val: 'sensor.tds.new', ack: false });
            oldSourceRead.resolve({ val: 'sensor.tds.old' });
            await settle();

            expect(fake.foreignSubscriptions()).to.include('sensor.tds.new');
            expect(fake.foreignSubscriptions()).not.to.include('sensor.tds.old');
            helper.cleanup();
        });

        it('processes one normal value without pump or actuator writes', async () => {
            const fake = createAdapter({
                states: {
                    'chemistry.tds.input.source_mode': { val: 'manual' },
                    'chemistry.tds.measurement.location': { val: 'manual' },
                },
            });
            const helper = loadFreshHelper(TDS_PATH);

            helper.init(fake.adapter);
            await settle();
            await helper.handleStateChange('chemistry.tds.input.manual_value', { val: 1200, ack: false });

            expect(fake.value('chemistry.tds.input.current_value')).to.equal(1200);
            expect(fake.value('chemistry.tds.outputs.summary_json')).to.be.a('string');
            expectNoPumpOrActuatorWrites(fake.writes);
            helper.cleanup();
        });

        it('finishes an accepted reference reset after cleanup without scheduling another evaluation', async () => {
            /** @type {Deferred<FakeState>} */
            const currentValueRead = createDeferred();
            let delayCurrentValueRead = false;
            const currentValueId = 'chemistry.tds.input.last_valid_value';
            const resetId = 'chemistry.tds.reference.reset_initial_reference';
            const fake = createAdapter({
                getState: id => (delayCurrentValueRead && id === currentValueId ? currentValueRead.promise : undefined),
            });
            const helper = loadFreshHelper(TDS_PATH);

            helper.init(fake.adapter);
            await settle();
            delayCurrentValueRead = true;
            const acceptedReset = helper.handleStateChange(resetId, { val: true, ack: false });
            await waitFor(
                () => fake.reads.some(read => read.id === currentValueId),
                'the accepted TDS reference reset read',
            );
            helper.cleanup();
            const timerCreationsAfterCleanup = fake.timerCreations.length;
            currentValueRead.resolve({ val: 1200 });
            await acceptedReset;

            expect(fake.value('chemistry.tds.reference.initial_value')).to.equal(1200);
            expect(fake.value('chemistry.tds.reference.delta_since_initial')).to.equal(0);
            expect(fake.state(resetId)).to.deep.include({ val: false, ack: true });
            expect(fake.activeTimerCount()).to.equal(0);
            expect(fake.timerCreations).to.have.length(timerCreationsAfterCleanup);
        });
    });
});

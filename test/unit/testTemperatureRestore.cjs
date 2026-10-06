'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const HELPER_PATH = require.resolve('../../lib/helpers/temperatureHelper');
const SENSOR_ID = 'test.temperature.collector';
const MIN_ID = 'temperature.collector.min_today';
const MAX_ID = 'temperature.collector.max_today';
const STATUS_ID = 'temperature.collector.source_status';
const PERIOD_ID = 'temperature.daily_minmax_period';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value exposed to the helper.
 * @property {number} [ts] Optional source timestamp.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/** @typedef {(id: string) => FakeState | Promise<FakeState>} FakeForeignStateProvider */
/** @typedef {(id: string) => FakeState | undefined | Promise<FakeState | undefined>} FakeStateProvider */
/** @typedef {Partial<Record<string, FakeState>>} FakeInitialStates */

/**
 * @typedef {object} FakeAdapterOptions
 * @property {FakeInitialStates} [states] Initial own-state values.
 * @property {FakeState | FakeForeignStateProvider} [foreignState] Foreign state or controlled provider.
 * @property {FakeStateProvider} [getState] Optional own-state read override.
 */

/**
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

function loadFreshHelper() {
    delete require.cache[HELPER_PATH];
    return require(HELPER_PATH);
}

/**
 * @template T
 * @returns {Deferred<T>} Controlled promise and its resolver.
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
 * @param {FakeAdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ states = {}, foreignState = { val: 15, ts: Date.now() }, getState } = {}) {
    const stateStore = new Map(Object.entries(states));
    const writes = [];
    const reads = [];
    const timers = new Map();
    let timerSequence = 0;

    const adapter = {
        config: {
            collector_temp_active: true,
            collector_temp_sensor: SENSOR_ID,
        },
        log: {
            debug: () => undefined,
            warn: () => undefined,
        },
        subscribeForeignStates: () => undefined,
        async getStateAsync(id) {
            reads.push({ type: 'state', id });
            if (getState) {
                const overridden = await getState(id);
                if (overridden !== undefined) {
                    return overridden;
                }
            }
            return stateStore.get(id);
        },
        async getForeignStateAsync(id) {
            reads.push({ type: 'foreign', id });
            return typeof foreignState === 'function' ? foreignState(id) : foreignState;
        },
        async setStateAsync(id, state) {
            const storedState = { ...state };
            writes.push({ id, state: storedState });
            stateStore.set(id, storedState);
        },
        setTimeout(callback, delay) {
            const handle = { id: ++timerSequence, callback, delay, type: 'timeout' };
            timers.set(handle.id, handle);
            return handle;
        },
        clearTimeout(handle) {
            timers.delete(handle.id);
        },
        setInterval(callback, delay) {
            const handle = { id: ++timerSequence, callback, delay, type: 'interval' };
            timers.set(handle.id, handle);
            return handle;
        },
        clearInterval(handle) {
            timers.delete(handle.id);
        },
    };

    return {
        adapter,
        reads,
        writes,
        states: stateStore,
        value(id) {
            return stateStore.get(id)?.val;
        },
        minMaxWrites() {
            return writes
                .filter(write => write.id === MIN_ID || write.id === MAX_ID)
                .map(write => ({ id: write.id, val: write.state.val }));
        },
    };
}

async function nextTurn() {
    await new Promise(resolve => setImmediate(resolve));
}

async function waitFor(predicate, description) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) {
            return;
        }
        await nextTurn();
    }

    throw new Error(`Timed out waiting for ${description}`);
}

async function waitForStartup(fake) {
    await waitFor(
        () => fake.writes.some(write => write.id === STATUS_ID && write.state.val === 'ok'),
        'the initial temperature value',
    );
    await nextTurn();
}

function startHelper(fake) {
    const helper = loadFreshHelper();
    helper.init(fake.adapter);
    return helper;
}

function expectMinMax(fake, min, max) {
    expect(fake.value(MIN_ID)).to.equal(min);
    expect(fake.value(MAX_ID)).to.equal(max);
}

function todayKey() {
    const date = new Date();
    return [
        String(date.getFullYear()),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

describe('temperatureHelper daily min/max restore', () => {
    const startupCases = [
        {
            name: 'A: keeps a complete persisted pair for an in-range initial value',
            states: { [PERIOD_ID]: { val: todayKey() }, [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            initialValue: 15,
            expected: [10, 20],
        },
        {
            name: 'B: rejects a null persisted pair',
            states: { [MIN_ID]: { val: null }, [MAX_ID]: { val: null } },
            initialValue: 15,
            expected: [15, 15],
        },
        {
            name: 'C: rejects a persisted minimum without a maximum',
            states: { [MIN_ID]: { val: 10 } },
            initialValue: 15,
            expected: [15, 15],
        },
        {
            name: 'D: rejects a persisted maximum without a minimum',
            states: { [MAX_ID]: { val: 20 } },
            initialValue: 15,
            expected: [15, 15],
        },
        {
            name: 'E: initializes a missing persisted pair',
            states: {},
            initialValue: 15,
            expected: [15, 15],
        },
        {
            name: 'G: lowers a complete restored minimum',
            states: { [PERIOD_ID]: { val: todayKey() }, [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            initialValue: 5,
            expected: [5, 20],
        },
        {
            name: 'H: raises a complete restored maximum',
            states: { [PERIOD_ID]: { val: todayKey() }, [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            initialValue: 25,
            expected: [10, 25],
        },
    ];

    for (const testCase of startupCases) {
        it(testCase.name, async () => {
            const fake = createAdapter({
                states: testCase.states,
                foreignState: { val: testCase.initialValue, ts: Date.now() },
            });
            const helper = startHelper(fake);

            await waitForStartup(fake);

            expectMinMax(fake, testCase.expected[0], testCase.expected[1]);
            helper.cleanup();
        });
    }

    it('F: initializes null reset values after a fresh module restart', async () => {
        const firstFake = createAdapter({
            states: { [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            foreignState: { val: 15, ts: Date.now() },
        });
        const firstHelper = startHelper(firstFake);
        await waitForStartup(firstFake);
        firstHelper.cleanup();

        const restartedFake = createAdapter({
            states: { [MIN_ID]: { val: null }, [MAX_ID]: { val: null } },
            foreignState: { val: 15, ts: Date.now() },
        });
        const restartedHelper = startHelper(restartedFake);

        await waitForStartup(restartedFake);

        expectMinMax(restartedFake, 15, 15);
        restartedHelper.cleanup();
    });

    it('waits for delayed restore reads before applying the foreign initial value', async () => {
        /** @type {Deferred<FakeState>} */
        const minRead = createDeferred();
        const fake = createAdapter({
            states: { [PERIOD_ID]: { val: todayKey() }, [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            foreignState: { val: 25, ts: Date.now() },
            getState: id => (id === MIN_ID ? minRead.promise : undefined),
        });
        const helper = startHelper(fake);

        await nextTurn();
        expect(fake.reads.some(read => read.type === 'foreign')).to.equal(false);
        expect(fake.minMaxWrites()).to.deep.equal([]);

        minRead.resolve({ val: 10 });
        await waitForStartup(fake);

        expectMinMax(fake, 10, 25);
        expect(fake.minMaxWrites()).to.deep.equal([{ id: MAX_ID, val: 25 }]);
        helper.cleanup();
    });

    it('keeps restored values while the foreign initial read is delayed', async () => {
        /** @type {Deferred<FakeState>} */
        const foreignRead = createDeferred();
        const fake = createAdapter({
            states: { [PERIOD_ID]: { val: todayKey() }, [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            foreignState: () => foreignRead.promise,
        });
        const helper = startHelper(fake);

        await waitFor(() => fake.reads.some(read => read.type === 'foreign'), 'the delayed foreign read');
        expectMinMax(fake, 10, 20);
        expect(fake.minMaxWrites()).to.deep.equal([]);

        foreignRead.resolve({ val: 25, ts: Date.now() });
        await waitForStartup(fake);

        expectMinMax(fake, 10, 25);
        expect(fake.minMaxWrites()).to.deep.equal([{ id: MAX_ID, val: 25 }]);
        helper.cleanup();
    });

    it('continues updating the restored pair on a later sensor event', async () => {
        const fake = createAdapter({
            states: { [PERIOD_ID]: { val: todayKey() }, [MIN_ID]: { val: 10 }, [MAX_ID]: { val: 20 } },
            foreignState: { val: 15, ts: Date.now() },
        });
        const helper = startHelper(fake);
        await waitForStartup(fake);

        await helper.handleStateChange(SENSOR_ID, { val: 25, ts: Date.now(), ack: true });

        expectMinMax(fake, 10, 25);
        expect(fake.minMaxWrites()).to.deep.equal([{ id: MAX_ID, val: 25 }]);
        helper.cleanup();
    });

    it('does not restore legacy min/max values without a daily period marker', async () => {
        const fake = createAdapter({
            states: { [MIN_ID]: { val: 4 }, [MAX_ID]: { val: 30 } },
            foreignState: { val: 15, ts: Date.now() },
        });
        const helper = startHelper(fake);
        await waitForStartup(fake);

        expectMinMax(fake, 15, 15);
        expect(fake.value(PERIOD_ID)).to.equal(todayKey());
        helper.cleanup();
    });
});

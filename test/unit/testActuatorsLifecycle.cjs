'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const HELPER_PATH = require.resolve('../../lib/helpers/actuatorsHelper');
const PUMP_SWITCH_ID = 'pump.pump_switch';
const LIGHT_BASE = 'actuators.lighting.light1';
const FOLLOW_BASE = 'actuators.follow_pump_devices.device1';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setForeignStateAsync'} method Write method.
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
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

/**
 * @typedef {object} LoadedHelper
 * @property {boolean} _active Lifecycle state.
 * @property {(adapter: object) => Promise<void>} init Initialize the helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle an event.
 * @property {() => void} cleanup Stop the helper.
 */

/**
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial local states.
 * @property {Record<string, object>} [objects] Available foreign state objects.
 * @property {Record<string, unknown>} [config] Adapter configuration.
 * @property {(write: FakeWrite) => void | Promise<void>} [onWrite] Controlled write continuation.
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

/** @returns {LoadedHelper} Fresh helper singleton. */
function loadFreshHelper() {
    delete require.cache[HELPER_PATH];
    return /** @type {LoadedHelper} */ (require(HELPER_PATH));
}

/**
 * @param {AdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ states = {}, objects = {}, config = {}, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    const objectStore = new Map(Object.entries(objects));
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {Map<number, FakeTimer>} */
    const intervals = new Map();
    /** @type {FakeTimer[]} */
    const intervalCreations = [];
    let timerSequence = 0;

    /**
     * @param {FakeWrite['method']} method Write method.
     * @param {string} id State ID.
     * @param {FakeState} state Written state.
     */
    async function recordWrite(method, id, state) {
        const write = { method, id, state: { ...state } };
        writes.push(write);
        if (method === 'setStateAsync') {
            stateStore.set(id, state.val);
        }
        await onWrite?.(write);
    }

    const adapter = {
        namespace: 'poolcontrol.0',
        config,
        log: { debug: () => undefined, info: () => undefined, warn: () => undefined },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async getForeignObjectAsync(id) {
            return objectStore.get(id) || null;
        },
        async setStateAsync(id, state) {
            await recordWrite('setStateAsync', id, state);
        },
        async setForeignStateAsync(id, state) {
            await recordWrite('setForeignStateAsync', id, state);
        },
        setInterval(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            intervals.set(timer.id, timer);
            intervalCreations.push(timer);
            return timer;
        },
        clearInterval(timer) {
            intervals.delete(timer.id);
        },
    };

    return {
        adapter,
        writes,
        subscriptions,
        intervalCreations,
        activeIntervals: () => [...intervals.values()],
        writesFor: id => writes.filter(write => write.id === id),
    };
}

describe('actuatorsHelper lifecycle regression', () => {
    it('ignores an event before init without writes or timers', async () => {
        const helper = loadFreshHelper();
        const env = createAdapter();

        await expect(helper.handleStateChange('poolcontrol.0.status.season_active', { val: true, ack: true })).to.be
            .fulfilled;
        expect(env.writes).to.be.empty;
        expect(env.intervalCreations).to.be.empty;
    });

    it('ignores multiple events before init', async () => {
        const helper = loadFreshHelper();

        await Promise.all([
            helper.handleStateChange('poolcontrol.0.status.season_active', { val: true, ack: true }),
            helper.handleStateChange('poolcontrol.0.pump.pump_switch', { val: true, ack: true }),
            helper.handleStateChange('poolcontrol.0.actuators.lighting.light1.switch', { val: true, ack: false }),
        ]);
    });

    it('keeps the normal init subscriptions and initialization', async () => {
        const helper = loadFreshHelper();
        const env = createAdapter();

        await helper.init(env.adapter);

        expect(env.subscriptions).to.deep.equal(['actuators.*', PUMP_SWITCH_ID]);
        expect(env.writes).to.have.length(33);
        expect(helper._active).to.equal(true);
    });

    it('processes a normal actuator event after init', async () => {
        const helper = loadFreshHelper();
        const env = createAdapter({
            states: { [`${LIGHT_BASE}.runtime_minutes`]: 0 },
            config: { light_1_active: true, light_1_object: 'test.0.light' },
        });
        await helper.init(env.adapter);
        const writesBefore = env.writes.length;

        await helper.handleStateChange(`poolcontrol.0.${LIGHT_BASE}.switch`, { val: true, ack: false });

        expect(env.writes.slice(writesBefore)).to.deep.include({
            method: 'setForeignStateAsync',
            id: 'test.0.light',
            state: { val: true, ack: false },
        });
        expect(env.writesFor(`${LIGHT_BASE}.status`).at(-1)?.state.val).to.equal('EIN');
    });

    it('keeps event processing available while async init is in flight', async () => {
        const firstWrite = createDeferred();
        let writeCount = 0;
        const helper = loadFreshHelper();
        const env = createAdapter({
            onWrite: async () => {
                writeCount++;
                if (writeCount === 1) {
                    await firstWrite.promise;
                }
            },
        });

        const initPromise = helper.init(env.adapter);
        while (writeCount === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }

        await helper.handleStateChange('poolcontrol.0.status.season_active', { val: true, ack: true });
        expect(helper._active).to.equal(true);
        firstWrite.resolve(undefined);
        await initPromise;
    });

    it('clears active intervals during cleanup after init', async () => {
        const helper = loadFreshHelper();
        const env = createAdapter({
            states: { [`${LIGHT_BASE}.runtime_minutes`]: 2 },
            config: { light_1_active: true, light_1_object: 'test.0.light' },
        });
        await helper.init(env.adapter);
        await helper.handleStateChange(`poolcontrol.0.${LIGHT_BASE}.switch`, { val: true, ack: false });
        expect(env.activeIntervals()).to.have.length(1);

        helper.cleanup();

        expect(env.activeIntervals()).to.be.empty;
        expect(helper._active).to.equal(false);
    });

    it('ignores events after cleanup without writes or new timers', async () => {
        const helper = loadFreshHelper();
        const env = createAdapter({
            states: { [`${LIGHT_BASE}.runtime_minutes`]: 2 },
            config: { light_1_active: true, light_1_object: 'test.0.light' },
        });
        await helper.init(env.adapter);
        helper.cleanup();
        const writesBefore = env.writes.length;
        const timersBefore = env.intervalCreations.length;

        await helper.handleStateChange(`poolcontrol.0.${LIGHT_BASE}.switch`, { val: true, ack: false });

        expect(env.writes).to.have.length(writesBefore);
        expect(env.intervalCreations).to.have.length(timersBefore);
    });

    it('allows cleanup before init without throwing', () => {
        const helper = loadFreshHelper();

        expect(() => helper.cleanup()).not.to.throw();
        expect(helper._active).to.equal(false);
    });

    it('does not start new writes or timers when cleanup interrupts init', async () => {
        const firstWrite = createDeferred();
        let writeCount = 0;
        const helper = loadFreshHelper();
        const env = createAdapter({
            onWrite: async () => {
                writeCount++;
                if (writeCount === 1) {
                    await firstWrite.promise;
                }
            },
        });
        const initPromise = helper.init(env.adapter);
        while (writeCount === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }

        helper.cleanup();
        firstWrite.resolve(undefined);
        await initPromise;

        expect(env.writes).to.have.length(1);
        expect(env.intervalCreations).to.be.empty;
        expect(helper._active).to.equal(false);
    });

    it('authoritatively reads the pump state during init after discarding an early event', async () => {
        const helper = loadFreshHelper();
        await helper.handleStateChange('poolcontrol.0.pump.pump_switch', { val: false, ack: true });
        const env = createAdapter({
            states: {
                [PUMP_SWITCH_ID]: true,
                [`${FOLLOW_BASE}.enabled`]: true,
                [`${FOLLOW_BASE}.target_state_id`]: 'test.0.follow',
            },
            objects: {
                'test.0.follow': { type: 'state', common: { type: 'boolean', write: true } },
            },
        });

        await helper.init(env.adapter);

        expect(env.writesFor('test.0.follow').at(-1)?.state).to.deep.equal({ val: true, ack: false });
        expect(env.writesFor(`${FOLLOW_BASE}.status`).at(-1)?.state.val).to.equal('running_with_pump');
    });
});

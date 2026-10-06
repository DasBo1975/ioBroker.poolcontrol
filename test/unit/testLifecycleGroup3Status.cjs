'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const STATUS_PATH = require.resolve('../../lib/helpers/statusHelper');
const PUMP_EVENT_ID = 'poolcontrol.0.pump.pump_switch';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Acknowledgement flag.
 */

/**
 * @typedef {object} FakeWrite
 * @property {string} id State id.
 * @property {FakeState} state Written state.
 */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer id.
 * @property {() => unknown} callback Timer callback.
 * @property {number} delay Timer delay.
 */

/**
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

/**
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial state values.
 * @property {(id: string) => void | Promise<void>} [onRead] Read hook.
 */

/**
 * @typedef {object} LoadedStatusHelper
 * @property {boolean} _active Lifecycle activity.
 * @property {Promise<void> | null} _initPromise Initialization barrier.
 * @property {boolean | null} pumpOn Last pump state.
 * @property {FakeTimer | null} midnightTimer Midnight reset timer.
 * @property {Array<{id: string, state: FakeState}>} _pendingPumpEvents Buffered pump events.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => void} cleanup Stop helper.
 */

/**
 * @template T
 * @returns {Deferred<T>} Controlled promise.
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

/** @returns {LoadedStatusHelper} Fresh status helper singleton. */
function loadStatus() {
    delete require.cache[STATUS_PATH];
    return /** @type {LoadedStatusHelper} */ (require(STATUS_PATH));
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, onRead } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {Map<number, FakeTimer>} */
    const timers = new Map();
    /** @type {FakeTimer[]} */
    const timerCreations = [];
    let timerSequence = 0;

    const adapter = {
        log: {
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateAsync(id, state) {
            const stored = { ...state };
            writes.push({ id, state: stored });
            stateStore.set(id, stored.val);
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
        stateStore,
        writes,
        reads,
        subscriptions,
        timers,
        timerCreations,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
    };
}

/**
 * @param {boolean} pumpOn Initial pump state.
 * @returns {Record<string, ioBroker.StateValue>} Normal status state set.
 */
function statusStates(pumpOn) {
    return {
        'pump.pump_switch': pumpOn,
        'pump.status': pumpOn ? 'EIN' : 'AUS',
        'pump.mode': 'auto',
        'temperature.surface.current': 25.2,
        'temperature.collector.current': 34.8,
        'temperature.outside.current': 22.4,
        'runtime.today': 3660,
        'circulation.daily_total': 8,
        'circulation.daily_required': 10,
        'status.summary': '',
        'status.overview_json': '',
        'pump.error': false,
        'solar.collector_warning': false,
        'status.pump_today_count': 2,
    };
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

describe('statusHelper lifecycle regression', () => {
    it('ignores a foreign event before init without throwing or writing', async () => {
        const helper = loadStatus();
        await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 25, ack: true });
        expect(helper._pendingPumpEvents).to.have.length(0);
    });

    it('retains an observed pump event before init', async () => {
        const helper = loadStatus();
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        const env = createAdapter({ states: statusStates(true) });
        helper.init(env.adapter);
        await helper._initPromise;
        expect(env.writesFor('status.pump_last_start')).to.have.length(1);
        expect(env.writesFor('status.pump_today_count')).to.have.length(1);
        expect(helper.pumpOn).to.equal(true);
    });

    it('replays multiple pump events observed during init in FIFO order', async () => {
        const initialRead = createDeferred();
        let blockInitialPumpRead = true;
        const env = createAdapter({
            states: statusStates(false),
            onRead: async id => {
                if (id === 'pump.pump_switch' && blockInitialPumpRead) {
                    blockInitialPumpRead = false;
                    await initialRead.promise;
                }
            },
        });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        await helper.handleStateChange(PUMP_EVENT_ID, { val: false, ack: true });
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        initialRead.resolve(undefined);
        await helper._initPromise;
        const edgeWrites = env.writes
            .filter(write => write.id === 'status.pump_last_start' || write.id === 'status.pump_last_stop')
            .map(write => write.id);
        expect(edgeWrites).to.deep.equal(['status.pump_last_start', 'status.pump_last_stop', 'status.pump_last_start']);
        expect(helper.pumpOn).to.equal(true);
    });

    it('does not process one buffered pump event twice', async () => {
        const helper = loadStatus();
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        const env = createAdapter({ states: statusStates(true) });
        helper.init(env.adapter);
        await helper._initPromise;
        await settle();
        expect(env.writesFor('status.pump_last_start')).to.have.length(1);
        expect(helper._pendingPumpEvents).to.have.length(0);
    });

    it('uses an initial pump-off state without inventing an edge', async () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        expect(helper.pumpOn).to.equal(false);
        expect(env.writesFor('status.pump_last_start')).to.have.length(0);
        expect(env.writesFor('status.pump_last_stop')).to.have.length(0);
    });

    it('uses an initial pump-on state without inventing an edge', async () => {
        const env = createAdapter({ states: statusStates(true) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        expect(helper.pumpOn).to.equal(true);
        expect(env.writesFor('status.pump_last_start')).to.have.length(0);
        expect(env.writesFor('status.pump_last_stop')).to.have.length(0);
    });

    it('preserves the normal pump-off to pump-on writes', async () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        const writeIndex = env.writes.length;
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        expect(env.writes.slice(writeIndex).map(write => write.id)).to.deep.equal([
            'status.pump_last_start',
            'status.pump_today_count',
            'status.pump_was_on_today',
        ]);
    });

    it('preserves the normal pump-on to pump-off write', async () => {
        const env = createAdapter({ states: statusStates(true) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        const writeIndex = env.writes.length;
        await helper.handleStateChange(PUMP_EVENT_ID, { val: false, ack: true });
        expect(env.writes.slice(writeIndex).map(write => write.id)).to.deep.equal(['status.pump_last_stop']);
    });

    it('increments the normal daily pump counter once', async () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        expect(env.writesFor('status.pump_today_count')[0]?.state.val).to.equal(3);
        expect(env.writesFor('status.pump_was_on_today')[0]?.state.val).to.equal(true);
    });

    it('preserves normal runtime and status summary values', async () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        const summary = String(env.stateStore.get('status.summary'));
        const overview = JSON.parse(String(env.stateStore.get('status.overview_json')));
        expect(summary).to.include('Tageslaufzeit: 1h 1m (80% der Soll-Umwälzung).');
        expect(overview).to.include({ runtime_today: 3660, runtime_formatted: '1h 1m', circulation_pct: 80 });
    });

    it('clears the midnight timer and deactivates during cleanup', async () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        expect(env.timers.size).to.equal(1);
        helper.cleanup();
        expect(helper._active).to.equal(false);
        expect(helper.midnightTimer).to.equal(null);
        expect(env.timers.size).to.equal(0);
    });

    it('ignores events after cleanup without reads, writes or timers', async () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        helper.cleanup();
        const readCount = env.reads.length;
        const writeCount = env.writes.length;
        const timerCount = env.timerCreations.length;
        await helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        expect(env.reads).to.have.length(readCount);
        expect(env.writes).to.have.length(writeCount);
        expect(env.timerCreations).to.have.length(timerCount);
    });

    it('stops an in-flight pump event after cleanup before later writes', async () => {
        const countRead = createDeferred();
        let blockCountRead = false;
        const env = createAdapter({
            states: statusStates(false),
            onRead: async id => {
                if (id === 'status.pump_today_count' && blockCountRead) {
                    await countRead.promise;
                }
            },
        });
        const helper = loadStatus();
        helper.init(env.adapter);
        await helper._initPromise;
        blockCountRead = true;
        const handling = helper.handleStateChange(PUMP_EVENT_ID, { val: true, ack: true });
        await settle();
        helper.cleanup();
        countRead.resolve(undefined);
        await handling;
        expect(env.writesFor('status.pump_last_start')).to.have.length(1);
        expect(env.writesFor('status.pump_today_count')).to.have.length(0);
        expect(env.writesFor('status.pump_was_on_today')).to.have.length(0);
    });

    it('allows cleanup to be called repeatedly without new work', () => {
        const env = createAdapter({ states: statusStates(false) });
        const helper = loadStatus();
        helper.init(env.adapter);
        helper.cleanup();
        helper.cleanup();
        expect(helper._active).to.equal(false);
        expect(env.timers.size).to.equal(0);
    });
});

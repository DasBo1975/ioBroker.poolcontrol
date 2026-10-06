'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');

const HELPER_PATH = require.resolve('../../lib/helpers/debugLogHelper');
const MAIN_PATH = path.resolve(__dirname, '../../main.js');
const TARGET_ID = 'poolcontrol.0.SystemCheck.debug_logs.target_area';
const CLEAR_ID = 'poolcontrol.0.SystemCheck.debug_logs.clear';
const LOG_ID = 'SystemCheck.debug_logs.log';

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
 * @property {Record<string, ioBroker.StateValue>} [states] Initial values.
 * @property {(id: string) => void | Promise<void>} [onRead] Read hook.
 * @property {() => void | Promise<void>} [onObject] Object creation hook.
 * @property {(id: string) => void} [onUnsubscribe] Unsubscribe hook.
 */

/**
 * @typedef {object} LoadedDebugLogHelper
 * @property {string} buffer Pending log text.
 * @property {Record<string, number>} lastChange Last event timestamps.
 * @property {(adapter: object) => Promise<void>} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => Promise<void>} _flushBuffer Flush pending text.
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

/** @returns {LoadedDebugLogHelper} Fresh helper singleton. */
function loadHelper() {
    delete require.cache[HELPER_PATH];
    return /** @type {LoadedDebugLogHelper} */ (require(HELPER_PATH));
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, onRead, onObject, onUnsubscribe } = {}) {
    const stateStore = new Map(
        Object.entries({
            'SystemCheck.debug_logs.target_area': 'pump',
            'SystemCheck.debug_logs.log': 'existing\n',
            ...states,
        }),
    );
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {string[]} */
    const unsubscriptions = [];
    /** @type {Array<Array<unknown>>} */
    const trace = [];
    /** @type {Map<number, FakeTimer>} */
    const timers = new Map();
    let timerSequence = 0;

    const adapter = {
        log: {
            debug: message => trace.push(['log.debug', message]),
            info: message => trace.push(['log.info', message]),
            warn: message => trace.push(['log.warn', message]),
        },
        async setObjectNotExistsAsync(id) {
            trace.push(['object', id]);
            await onObject?.();
        },
        subscribeStates(id) {
            subscriptions.push(id);
            trace.push(['subscribe', id]);
        },
        unsubscribeStates(id) {
            onUnsubscribe?.(id);
            unsubscriptions.push(id);
            trace.push(['unsubscribe', id]);
        },
        async getStateAsync(id) {
            reads.push(id);
            trace.push(['read', id]);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateAsync(id, state) {
            const stored = { ...state };
            writes.push({ id, state: stored });
            trace.push(['write', id, stored.val]);
            stateStore.set(id, stored.val);
        },
        setTimeout(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            timers.set(timer.id, timer);
            trace.push(['setTimeout', timer.id]);
            return timer;
        },
        clearTimeout(timer) {
            timers.delete(timer.id);
            trace.push(['clearTimeout', timer.id]);
        },
    };

    return {
        adapter,
        stateStore,
        writes,
        reads,
        subscriptions,
        unsubscriptions,
        trace,
        timers,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
    };
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

async function emitRapidPair(helper, id = 'poolcontrol.0.pump.pump_switch') {
    await helper.handleStateChange(id, { val: true, ack: false });
    await helper.handleStateChange(id, { val: false, ack: false });
}

describe('debugLogHelper lifecycle regression', () => {
    it('handles a foreign event before init safely', async () => {
        const helper = loadHelper();
        await helper.handleStateChange('foreign.0.unrelated', { val: true, ack: false });
    });

    it('compensates a pre-init target event through the authoritative init read', async () => {
        const helper = loadHelper();
        await helper.handleStateChange(TARGET_ID, { val: 'solar', ack: false });
        const env = createAdapter({ states: { 'SystemCheck.debug_logs.target_area': 'solar' } });
        await helper.init(env.adapter);
        expect(env.reads).to.include('SystemCheck.debug_logs.target_area');
        expect(env.subscriptions).to.include('solar.*');
        expect(env.subscriptions).not.to.include('pump.*');
    });

    it('replays a pre-init log event after the target is known', async () => {
        const helper = loadHelper();
        await emitRapidPair(helper);
        const env = createAdapter();
        await helper.init(env.adapter);
        expect(helper.buffer).to.include('pump.pump_switch changed too fast');
        expect(env.timers.size).to.equal(1);
    });

    it('waits for an in-init log event to be processed', async () => {
        const gate = createDeferred();
        const env = createAdapter({ onObject: () => gate.promise });
        const helper = loadHelper();
        const initializing = helper.init(env.adapter);
        const first = helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'auto', ack: false });
        let completed = false;
        const second = helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'manual', ack: false }).then(() => {
            completed = true;
        });
        await settle();
        expect(completed).to.equal(false);
        gate.resolve(undefined);
        await Promise.all([initializing, first, second]);
        expect(helper.buffer).to.include('pump.mode changed too fast');
    });

    it('replays multiple log events in FIFO order', async () => {
        const helper = loadHelper();
        await helper.handleStateChange('poolcontrol.0.pump.first', { val: 1, ack: false });
        await helper.handleStateChange('poolcontrol.0.pump.first', { val: 2, ack: false });
        await helper.handleStateChange('poolcontrol.0.pump.second', { val: 1, ack: false });
        await helper.handleStateChange('poolcontrol.0.pump.second', { val: 2, ack: false });
        await helper.init(createAdapter().adapter);
        expect(helper.buffer.indexOf('pump.first')).to.be.lessThan(helper.buffer.indexOf('pump.second'));
    });

    it('executes a pre-init clear command exactly once and acknowledges it', async () => {
        const helper = loadHelper();
        await helper.handleStateChange(CLEAR_ID, { val: true, ack: false });
        const env = createAdapter();
        await helper.init(env.adapter);
        expect(env.writesFor(LOG_ID)).to.have.length(1);
        expect(env.writesFor('SystemCheck.debug_logs.clear')).to.deep.equal([
            { id: 'SystemCheck.debug_logs.clear', state: { val: false, ack: true } },
        ]);
    });

    it('preserves FIFO order for log event then clear', async () => {
        const helper = loadHelper();
        await emitRapidPair(helper);
        await helper.handleStateChange(CLEAR_ID, { val: true, ack: false });
        const env = createAdapter();
        await helper.init(env.adapter);
        const timerIndex = env.trace.findIndex(entry => entry[0] === 'setTimeout');
        const clearIndex = env.trace.findIndex(entry => entry[0] === 'write' && entry[1] === LOG_ID);
        expect(timerIndex).to.be.lessThan(clearIndex);
        expect(helper.buffer).to.equal('');
    });

    it('preserves FIFO order for clear then log event', async () => {
        const helper = loadHelper();
        await helper.handleStateChange(CLEAR_ID, { val: true, ack: false });
        await emitRapidPair(helper);
        const env = createAdapter();
        await helper.init(env.adapter);
        const clearIndex = env.trace.findIndex(entry => entry[0] === 'write' && entry[1] === LOG_ID);
        const timerIndex = env.trace.findIndex(entry => entry[0] === 'setTimeout');
        expect(clearIndex).to.be.lessThan(timerIndex);
        expect(helper.buffer).to.include('pump.pump_switch changed too fast');
    });

    it('does not process replayed events twice after init', async () => {
        const helper = loadHelper();
        await emitRapidPair(helper);
        const env = createAdapter();
        await helper.init(env.adapter);
        const buffer = helper.buffer;
        const timerCount = env.trace.filter(entry => entry[0] === 'setTimeout').length;
        await settle();
        expect(helper.buffer).to.equal(buffer);
        expect(env.trace.filter(entry => entry[0] === 'setTimeout')).to.have.length(timerCount);
    });

    it('does not reinterpret a persisted clear=true value as a command', async () => {
        const env = createAdapter({ states: { 'SystemCheck.debug_logs.clear': true } });
        await loadHelper().init(env.adapter);
        expect(env.writesFor(LOG_ID)).to.have.length(0);
        expect(env.writesFor('SystemCheck.debug_logs.clear')).to.have.length(0);
    });

    it('preserves the normal filtered log path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        await helper.init(env.adapter);
        await helper.handleStateChange('poolcontrol.0.solar.request_active', { val: true, ack: false });
        await emitRapidPair(helper);
        expect(helper.buffer).to.include('pump.pump_switch changed too fast');
        expect(helper.buffer).not.to.include('solar.request_active');
        expect(env.timers.size).to.equal(1);
    });

    it('preserves the normal flush path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        await helper.init(env.adapter);
        await emitRapidPair(helper);
        const timer = [...env.timers.values()][0];
        expect(timer).to.exist;
        if (!timer) {
            throw new Error('Missing flush timer');
        }
        await timer.callback();
        expect(env.writesFor(LOG_ID)).to.have.length(1);
        expect(env.writesFor(LOG_ID)[0]?.state.val).to.include('existing\n');
        expect(env.writesFor(LOG_ID)[0]?.state.val).to.include('pump.pump_switch changed too fast');
        expect(helper.buffer).to.equal('');
    });

    it('preserves the normal clear path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        await helper.init(env.adapter);
        await emitRapidPair(helper);
        await helper.handleStateChange(CLEAR_ID, { val: true, ack: false });
        expect(env.writesFor(LOG_ID)[0]?.state).to.deep.equal({ val: '', ack: true });
        expect(env.writesFor('SystemCheck.debug_logs.clear')[0]?.state).to.deep.equal({ val: false, ack: true });
        expect(helper.buffer).to.equal('');
    });

    it('clears buffered pre-init events during cleanup', async () => {
        const helper = loadHelper();
        await emitRapidPair(helper);
        helper.cleanup();
        const env = createAdapter();
        await helper.init(env.adapter);
        expect(helper.buffer).to.equal('');
        expect(env.timers.size).to.equal(0);
    });

    it('ignores events after cleanup', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        await helper.init(env.adapter);
        helper.cleanup();
        const traceCount = env.trace.length;
        await emitRapidPair(helper);
        await helper.handleStateChange(CLEAR_ID, { val: true, ack: false });
        expect(env.trace).to.have.length(traceCount);
    });

    it('prevents an old flush from writing after cleanup', async () => {
        const gate = createDeferred();
        let blockLogRead = false;
        const env = createAdapter({
            onRead: async id => {
                if (id === LOG_ID && blockLogRead) {
                    await gate.promise;
                }
            },
        });
        const helper = loadHelper();
        await helper.init(env.adapter);
        await emitRapidPair(helper);
        blockLogRead = true;
        const flushing = helper._flushBuffer();
        await settle();
        helper.cleanup();
        gate.resolve(undefined);
        await flushing;
        expect(env.writesFor(LOG_ID)).to.have.length(0);
    });

    it('prevents an old flush from writing into a new lifecycle generation', async () => {
        const gate = createDeferred();
        let blockLogRead = false;
        const first = createAdapter({
            onRead: async id => {
                if (id === LOG_ID && blockLogRead) {
                    await gate.promise;
                }
            },
        });
        const helper = loadHelper();
        await helper.init(first.adapter);
        await emitRapidPair(helper);
        blockLogRead = true;
        const flushing = helper._flushBuffer();
        await settle();
        helper.cleanup();

        const second = createAdapter({ states: { 'SystemCheck.debug_logs.target_area': 'solar' } });
        await helper.init(second.adapter);
        gate.resolve(undefined);
        await flushing;
        expect(first.writesFor(LOG_ID)).to.have.length(0);
        expect(second.writesFor(LOG_ID)).to.have.length(0);
    });

    it('does not schedule new timers when an old callback runs after cleanup', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        await helper.init(env.adapter);
        await emitRapidPair(helper);
        const timer = [...env.timers.values()][0];
        expect(timer).to.exist;
        if (!timer) {
            throw new Error('Missing flush timer');
        }
        helper.cleanup();
        const timerCreations = env.trace.filter(entry => entry[0] === 'setTimeout').length;
        await timer.callback();
        expect(env.trace.filter(entry => entry[0] === 'setTimeout')).to.have.length(timerCreations);
        expect(env.writesFor(LOG_ID)).to.have.length(0);
    });

    it('keeps active lifecycle errors observable to the awaited router', async () => {
        const env = createAdapter({
            onUnsubscribe: () => {
                throw new Error('unsubscribe failed');
            },
        });
        const helper = loadHelper();
        await helper.init(env.adapter);
        /** @type {Error | null} */
        let observedError = null;
        try {
            await helper.handleStateChange(TARGET_ID, { val: 'solar', ack: false });
        } catch (err) {
            if (err instanceof Error) {
                observedError = err;
            }
        }

        expect(observedError).to.be.instanceOf(Error);
        expect(observedError?.message).to.equal('unsubscribe failed');
    });

    it('keeps the central unload cleanup call for debugLogHelper', () => {
        const source = fs.readFileSync(MAIN_PATH, 'utf8');
        const unload = source.slice(source.indexOf('onUnload(callback)'), source.indexOf('async onStateChange'));
        expect(unload).to.include('debugLogHelper.cleanup();');
    });
});

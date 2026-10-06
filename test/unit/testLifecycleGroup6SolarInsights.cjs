'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const path = require('node:path');
const { expect } = require('chai');
const { I18n } = require('@iobroker/adapter-core');

const HELPER_PATH = require.resolve('../../lib/helpers/solarInsightsHelper');
const SOLAR_RAN_TODAY = 'analytics.insights.solar.results.solar_ran_today';

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
 * @property {(reason?: unknown) => void} reject Promise rejecter.
 */

/**
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial state values.
 * @property {(id: string) => void | Promise<void>} [onSubscribe] Subscription hook.
 * @property {(id: string) => void | Promise<void>} [onRead] Read hook.
 * @property {(id: string) => void | Promise<void>} [onWrite] Write hook.
 */

/**
 * @typedef {object} LoadedSolarInsightsHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {boolean} _initialized Initialization completion flag.
 * @property {boolean} _pendingSolarActivation Pending observed activation latch.
 * @property {number | null} lastCheckTimestamp Previous check timestamp.
 * @property {boolean} lastSolarLogicActive Previous solar activity state.
 * @property {FakeTimer | null} checkTimer Active check timer.
 * @property {FakeTimer | null} resetTimer Active reset timer.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => void} onStateChange Handle state event.
 * @property {() => Promise<void>} _checkSolarInsights Run one insight check.
 * @property {() => void} cleanup Stop helper.
 */

/**
 * @template T
 * @returns {Deferred<T>} Controlled promise.
 */
function createDeferred() {
    /** @type {Deferred<T>['resolve']} */
    let resolvePromise = () => undefined;
    /** @type {Deferred<T>['reject']} */
    let rejectPromise = () => undefined;
    /** @type {Promise<T>} */
    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    return { promise, resolve: resolvePromise, reject: rejectPromise };
}

/** @returns {LoadedSolarInsightsHelper} Fresh helper singleton. */
function loadHelper() {
    delete require.cache[HELPER_PATH];
    return /** @type {LoadedSolarInsightsHelper} */ (require(HELPER_PATH));
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, onSubscribe, onRead, onWrite } = {}) {
    const stateStore = new Map(
        Object.entries({
            'temperature.collector_temp_active': true,
            'temperature.surface_temp_active': true,
            'temperature.ground_temp_active': true,
            'temperature.flow_temp_active': true,
            'temperature.return_temp_active': true,
            'temperature.outside_temp_active': true,
            'temperature.collector.current': 42,
            'temperature.surface.current': 24,
            'temperature.ground.current': 22,
            'temperature.flow.current': 25,
            'temperature.return.current': 29,
            'temperature.outside.current': 20,
            'pump.live.flow_current_lh': 5000,
            'pump.live.current_power_w': 450,
            'temperature.delta.surface_ground': 2,
            'solar.request_active': false,
            'solar.extended.active': false,
            'solar.control_mode': 'auto',
            'ai.weather.outputs.daily_summary': 'clear',
            [SOLAR_RAN_TODAY]: false,
            'analytics.insights.solar.results.estimated_gain_today_wh': 0,
            'analytics.insights.solar.results.estimated_gain_today_kwh': 0,
            'analytics.insights.solar.results.active_minutes_today': 0,
            'analytics.insights.solar.results.peak_power_today_w': 0,
            ...states,
        }),
    );
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {Array<Array<unknown>>} */
    const trace = [];
    /** @type {Map<number, FakeTimer>} */
    const timers = new Map();
    let timerSequence = 0;

    const adapter = {
        log: {
            debug: message => trace.push(['log.debug', message]),
            warn: message => trace.push(['log.warn', message]),
        },
        async subscribeStatesAsync(id) {
            subscriptions.push(id);
            trace.push(['subscribe', id]);
            await onSubscribe?.(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            trace.push(['read', id]);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateChangedAsync(id, state) {
            await onWrite?.(id);
            const stored = { ...state };
            writes.push({ id, state: stored });
            trace.push(['write', id, stored.val]);
            stateStore.set(id, stored.val);
        },
        setTimeout(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            timers.set(timer.id, timer);
            trace.push(['setTimeout', timer.id, delay]);
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
        trace,
        timers,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
    };
}

async function settle() {
    for (let index = 0; index < 4; index += 1) {
        await new Promise(resolve => setImmediate(resolve));
    }
}

/**
 * @param {() => void | Promise<void>} action Action expected not to leak a rejection.
 * @returns {Promise<unknown[]>} Unhandled rejection reasons observed while running the action.
 */
async function captureUnhandledRejections(action) {
    /** @type {unknown[]} */
    const reasons = [];
    /** @param {unknown} reason Unhandled rejection reason. */
    const listener = reason => reasons.push(reason);
    process.on('unhandledRejection', listener);

    try {
        await action();
        await settle();
        return reasons;
    } finally {
        process.removeListener('unhandledRejection', listener);
    }
}

async function runCheckTimer(env) {
    const timer = [...env.timers.values()].find(candidate => candidate.delay <= 250);
    expect(timer).not.to.equal(undefined);
    if (!timer) {
        throw new Error('Expected a solar insight check timer');
    }
    env.timers.delete(timer.id);
    await timer.callback();
    await settle();
}

describe('solarInsightsHelper lifecycle regression', () => {
    before(async () => {
        await I18n.init(path.resolve(__dirname, '../../lib'), 'en');
    });

    it('handles a foreign event before init safely', () => {
        const helper = loadHelper();
        helper.onStateChange('foreign.0.unrelated', { val: true, ack: true });
        expect(helper._pendingSolarActivation).to.equal(false);
    });

    it('compensates a pre-init measurement event through the initial check', async () => {
        const helper = loadHelper();
        helper.onStateChange('poolcontrol.0.temperature.collector.current', { val: 51, ack: true });
        const env = createAdapter({ states: { 'temperature.collector.current': 51 } });
        helper.init(env.adapter);
        await settle();
        await runCheckTimer(env);
        expect(env.writesFor('analytics.insights.solar.results.collector_temp_used').at(-1)?.state.val).to.equal(51);
    });

    it('retains an observed request_active true event during init', async () => {
        const gate = createDeferred();
        const env = createAdapter({ onSubscribe: () => gate.promise });
        const helper = loadHelper();
        helper.init(env.adapter);
        helper.onStateChange('poolcontrol.0.solar.request_active', { val: true, ack: true });
        expect(env.writesFor(SOLAR_RAN_TODAY)).to.have.length(0);
        gate.resolve(undefined);
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY).map(write => write.state.val)).to.deep.equal([true]);
    });

    it('retains an observed extended.active true event during init', async () => {
        const gate = createDeferred();
        const env = createAdapter({ onSubscribe: () => gate.promise });
        const helper = loadHelper();
        helper.init(env.adapter);
        helper.onStateChange('poolcontrol.0.solar.extended.active', { val: true, ack: true });
        gate.resolve(undefined);
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY).map(write => write.state.val)).to.deep.equal([true]);
    });

    it('does not invent an activation event from a persisted true state', async () => {
        const gate = createDeferred();
        const env = createAdapter({ states: { 'solar.request_active': true }, onSubscribe: () => gate.promise });
        const helper = loadHelper();
        helper.init(env.adapter);
        gate.resolve(undefined);
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY)).to.have.length(0);
        await runCheckTimer(env);
        expect(env.writesFor(SOLAR_RAN_TODAY).at(-1)?.state.val).to.equal(true);
    });

    it('consumes one observed pre-init activation only once', async () => {
        const helper = loadHelper();
        helper.onStateChange('poolcontrol.0.solar.request_active', { val: true, ack: true });
        const env = createAdapter();
        helper.init(env.adapter);
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY).map(write => write.state.val)).to.deep.equal([true]);
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY)).to.have.length(1);
    });

    it('preserves the normal initial check', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        expect(env.subscriptions).to.have.length(19);
        expect(env.timers.size).to.equal(2);
        await runCheckTimer(env);
        expect(env.writesFor('analytics.insights.solar.results.summary_json')).to.have.length(1);
        expect(env.writesFor('analytics.insights.solar.results.analysis_active').at(-1)?.state.val).to.equal(true);
    });

    it('preserves the normal measurement event path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        await runCheckTimer(env);
        env.stateStore.set('temperature.collector.current', 48);
        helper.onStateChange('poolcontrol.0.temperature.collector.current', { val: 48, ack: true });
        await runCheckTimer(env);
        expect(env.writesFor('analytics.insights.solar.results.collector_temp_used').at(-1)?.state.val).to.equal(48);
    });

    it('preserves the normal request_active activation path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        await runCheckTimer(env);
        const previousWrites = env.writesFor(SOLAR_RAN_TODAY).length;
        env.stateStore.set('solar.request_active', true);
        helper.onStateChange('poolcontrol.0.solar.request_active', { val: true, ack: true });
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY)).to.have.length(previousWrites + 1);
        expect(env.writesFor(SOLAR_RAN_TODAY).at(-1)?.state.val).to.equal(true);
        await runCheckTimer(env);
        expect(env.writesFor('analytics.insights.solar.results.solar_effective_now').at(-1)?.state.val).to.equal(true);
    });

    it('preserves the normal extended.active activation path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        await runCheckTimer(env);
        const previousWrites = env.writesFor(SOLAR_RAN_TODAY).length;
        env.stateStore.set('solar.extended.active', true);
        helper.onStateChange('poolcontrol.0.solar.extended.active', { val: true, ack: true });
        await settle();
        expect(env.writesFor(SOLAR_RAN_TODAY)).to.have.length(previousWrites + 1);
        await runCheckTimer(env);
        expect(env.writesFor('analytics.insights.solar.results.solar_effective_now').at(-1)?.state.val).to.equal(true);
    });

    it('preserves the daily reset and internal latch state', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        await runCheckTimer(env);
        helper.lastCheckTimestamp = 1234;
        helper.lastSolarLogicActive = true;
        const reset = [...env.timers.values()].find(timer => timer.delay > 250);
        expect(reset).not.to.equal(undefined);
        if (!reset) {
            throw new Error('Expected daily reset timer');
        }
        env.timers.delete(reset.id);
        await reset.callback();
        expect(env.stateStore.get(SOLAR_RAN_TODAY)).to.equal(false);
        expect(env.stateStore.get('analytics.insights.solar.results.active_minutes_today')).to.equal(0);
        expect(helper.lastCheckTimestamp).to.equal(null);
        expect(helper.lastSolarLogicActive).to.equal(false);
        expect([...env.timers.values()].some(timer => timer.delay > 250)).to.equal(true);
    });

    it('clears timers and a pending activation during cleanup', async () => {
        const gate = createDeferred();
        const env = createAdapter({ onSubscribe: () => gate.promise });
        const helper = loadHelper();
        helper.init(env.adapter);
        helper.onStateChange('poolcontrol.0.solar.request_active', { val: true, ack: true });
        helper.cleanup();
        expect(helper._pendingSolarActivation).to.equal(false);
        expect(env.timers.size).to.equal(0);
        gate.resolve(undefined);
        await settle();
        expect(env.writes).to.have.length(0);
    });

    it('ignores events after cleanup', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        helper.cleanup();
        const traceLength = env.trace.length;
        helper.onStateChange('poolcontrol.0.solar.request_active', { val: true, ack: true });
        expect(env.trace).to.have.length(traceLength);
    });

    it('stops an in-flight insight check after cleanup before later writes', async () => {
        const entered = createDeferred();
        const release = createDeferred();
        let blockReads = false;
        const env = createAdapter({
            onRead: async () => {
                if (blockReads) {
                    entered.resolve(undefined);
                    await release.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        await runCheckTimer(env);
        blockReads = true;
        const check = helper._checkSolarInsights();
        await entered.promise;
        const writesBeforeCleanup = env.writes.length;
        helper.cleanup();
        release.resolve(undefined);
        await check;
        expect(env.writes).to.have.length(writesBeforeCleanup);
    });

    it('does not reschedule the daily reset after cleanup', async () => {
        const entered = createDeferred();
        const release = createDeferred();
        let blockWrite = true;
        const env = createAdapter({
            onWrite: async () => {
                if (blockWrite) {
                    blockWrite = false;
                    entered.resolve(undefined);
                    await release.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        const reset = [...env.timers.values()].find(timer => timer.delay > 250);
        expect(reset).not.to.equal(undefined);
        if (!reset) {
            throw new Error('Expected daily reset timer');
        }
        const resetting = Promise.resolve(reset.callback());
        await entered.promise;
        helper.cleanup();
        const timerCreations = env.trace.filter(entry => entry[0] === 'setTimeout').length;
        release.resolve(undefined);
        await resetting;
        expect(env.trace.filter(entry => entry[0] === 'setTimeout')).to.have.length(timerCreations);
        expect(env.timers.size).to.equal(0);
    });

    it('prevents an old generation from reading or writing through a re-init', async () => {
        const entered = createDeferred();
        const release = createDeferred();
        let blockReads = false;
        const first = createAdapter({
            onRead: async () => {
                if (blockReads) {
                    entered.resolve(undefined);
                    await release.promise;
                }
            },
        });
        const second = createAdapter();
        const helper = loadHelper();
        helper.init(first.adapter);
        await settle();
        await runCheckTimer(first);
        blockReads = true;
        const oldCheck = helper._checkSolarInsights();
        await entered.promise;
        helper.cleanup();
        helper.init(second.adapter);
        await settle();
        const secondReads = second.reads.length;
        const secondWrites = second.writes.length;
        release.resolve(undefined);
        await oldCheck;
        expect(second.reads).to.have.length(secondReads);
        expect(second.writes).to.have.length(secondWrites);
    });

    it('observes a detached initialization rejection exactly once', async () => {
        const gate = createDeferred();
        const env = createAdapter({ onSubscribe: () => gate.promise });
        const helper = loadHelper();
        helper.init(env.adapter);
        helper.cleanup();
        const writesAfterCleanup = env.writes.length;
        const timersAfterCleanup = env.timers.size;

        const unhandled = await captureUnhandledRejections(async () => {
            gate.reject(new Error('initialization rejection sentinel'));
        });
        const warnings = env.trace.filter(
            entry => entry[0] === 'log.warn' && String(entry[1]).includes('Detached initialization failed'),
        );

        expect(unhandled).to.have.length(0);
        expect(warnings).to.have.length(1);
        expect(String(warnings[0]?.[1])).to.include('initialization rejection sentinel');
        expect(env.writes).to.have.length(writesAfterCleanup);
        expect(env.timers.size).to.equal(timersAfterCleanup);
    });

    it('observes a detached activation-latch rejection without changing its parallelism', async () => {
        const gate = createDeferred();
        let rejectLatchWrite = false;
        const env = createAdapter({
            onWrite: id => (rejectLatchWrite && id === SOLAR_RAN_TODAY ? gate.promise : undefined),
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        rejectLatchWrite = true;

        const result = helper.onStateChange('poolcontrol.0.solar.request_active', { val: true, ack: true });
        expect(result).to.equal(undefined);
        expect([...env.timers.values()].some(timer => timer.delay === 250)).to.equal(true);
        helper.cleanup();
        const writesAfterCleanup = env.writes.length;
        const timersAfterCleanup = env.timers.size;

        const unhandled = await captureUnhandledRejections(async () => {
            gate.reject(new Error('activation latch rejection sentinel'));
        });
        const warnings = env.trace.filter(
            entry => entry[0] === 'log.warn' && String(entry[1]).includes('Detached solar activation latch failed'),
        );

        expect(unhandled).to.have.length(0);
        expect(warnings).to.have.length(1);
        expect(String(warnings[0]?.[1])).to.include('activation latch rejection sentinel');
        expect(env.writes).to.have.length(writesAfterCleanup);
        expect(env.timers.size).to.equal(timersAfterCleanup);
    });

    it('observes a detached recovery-write rejection without retrying the check', async () => {
        let rejectCheckWrites = false;
        /** @type {string[]} */
        const writeAttempts = [];
        const env = createAdapter({
            onWrite: id => {
                if (!rejectCheckWrites) {
                    return;
                }
                writeAttempts.push(id);
                if (id === 'analytics.insights.solar.inputs.collector_available') {
                    throw new Error('primary check rejection sentinel');
                }
                if (id === 'analytics.insights.solar.debug.last_update') {
                    throw new Error('recovery write rejection sentinel');
                }
            },
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        await settle();
        rejectCheckWrites = true;
        const timer = [...env.timers.values()].find(candidate => candidate.delay === 0);
        expect(timer).not.to.equal(undefined);
        if (!timer) {
            throw new Error('Expected initial insight check timer');
        }
        env.timers.delete(timer.id);

        const unhandled = await captureUnhandledRejections(() => {
            const result = timer.callback();
            expect(result).to.equal(undefined);
        });
        const primaryWarnings = env.trace.filter(
            entry => entry[0] === 'log.warn' && String(entry[1]).includes('primary check rejection sentinel'),
        );
        const recoveryWarnings = env.trace.filter(
            entry => entry[0] === 'log.warn' && String(entry[1]).includes('Detached insight check failed'),
        );

        expect(unhandled).to.have.length(0);
        expect(primaryWarnings).to.have.length(1);
        expect(recoveryWarnings).to.have.length(1);
        expect(String(recoveryWarnings[0]?.[1])).to.include('recovery write rejection sentinel');
        expect(writeAttempts).to.deep.equal([
            'analytics.insights.solar.inputs.collector_available',
            'analytics.insights.solar.debug.last_update',
        ]);
    });
});

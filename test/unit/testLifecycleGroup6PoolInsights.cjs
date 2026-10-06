'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const path = require('node:path');
const { expect } = require('chai');
const { I18n } = require('@iobroker/adapter-core');

const HELPER_PATH = require.resolve('../../lib/helpers/poolInsightsHelper');
const PREFIX = 'analytics.insights.pool';
const MANUAL_TRIGGER_ID = `${PREFIX}.manual_trigger`;

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
 * @property {(id: string) => void | Promise<void>} [onWrite] Write hook.
 */

/**
 * @typedef {object} LoadedPoolInsightsHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {boolean} _initialized Initialization completion flag.
 * @property {number} _lifecycleGeneration Current lifecycle generation.
 * @property {Promise<void> | null} _initializationPromise Initialization barrier.
 * @property {true[]} _pendingManualTriggers Pending observed manual triggers.
 * @property {boolean} running Analysis reentrancy flag.
 * @property {FakeTimer | null} dailyTimer Active daily timer.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => void} handleStateChange Handle event.
 * @property {(reason: string, allowSpeech: boolean, generation?: number) => Promise<void>} _runAnalysis Run analysis.
 * @property {() => Promise<unknown>} _readSnapshot Read analysis inputs.
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

/** @returns {LoadedPoolInsightsHelper} Fresh helper singleton. */
function loadHelper() {
    delete require.cache[HELPER_PATH];
    return /** @type {LoadedPoolInsightsHelper} */ (require(HELPER_PATH));
}

/** @returns {Record<string, ioBroker.StateValue>} Normal PoolInsights input state set. */
function normalStates() {
    return {
        [`${PREFIX}.enabled`]: true,
        [`${PREFIX}.schedule_time`]: '20:00',
        [`${PREFIX}.send_to_speech_queue`]: true,
        [`${PREFIX}.last_speech_at`]: '',
        [MANUAL_TRIGGER_ID]: false,
        'temperature.surface.current': 26,
        'temperature.surface.min_today': 24,
        'temperature.surface.max_today': 27,
        'analytics.statistics.temperature.today.surface.summary_json': '{}',
        'runtime.today_seconds': 7200,
        'runtime.start_count_today': 4,
        'circulation.daily_required': 2,
        'circulation.daily_remaining': 1,
        'pump.mode': 'auto',
        'pump.status': 'on',
        'pump.error': false,
        'pump.active_helper': 'controlHelper',
        'analytics.insights.solar.results.solar_ran_today': true,
        'analytics.insights.solar.results.estimated_gain_today_kwh': 3.5,
        'analytics.insights.solar.results.summary_json': '{}',
        'analytics.insights.solar.results.summary_html': '',
        'analytics.insights.photovoltaic.results.active_today': true,
        'analytics.insights.photovoltaic.results.starts_today': 2,
        'analytics.insights.photovoltaic.results.runtime_today_min': 60,
        'analytics.insights.photovoltaic.results.summary_json': '{}',
        'analytics.insights.photovoltaic.results.summary_text': '',
        'consumption.day_kwh': 5,
        'costs.day_eur': 2,
        'chemistry.ph.outputs.summary_text': 'pH ok',
        'chemistry.tds.outputs.summary_text': 'TDS ok',
        'chemistry.orp.outputs.summary_text': 'ORP ok',
    };
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, onRead, onWrite } = {}) {
    const stateStore = new Map(Object.entries({ ...normalStates(), ...states }));
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
        subscribeStates(id) {
            subscriptions.push(id);
            trace.push(['subscribe', id]);
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
            trace.push(['write', id, stored.val, stored.ack]);
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
    for (let index = 0; index < 5; index += 1) {
        await new Promise(resolve => setImmediate(resolve));
    }
}

/**
 * @param {LoadedPoolInsightsHelper} helper Helper under test.
 */
async function waitForInitialization(helper) {
    const initialization = helper._initializationPromise;
    expect(initialization).not.to.equal(null);
    if (!initialization) {
        throw new Error('Expected PoolInsights initialization promise');
    }
    await initialization;
    await settle();
}

/**
 * @param {ReturnType<typeof createAdapter>} env Fake adapter environment.
 * @returns {FakeTimer} Current daily timer.
 */
function getDailyTimer(env) {
    const timer = [...env.timers.values()].at(-1);
    expect(timer).not.to.equal(undefined);
    if (!timer) {
        throw new Error('Expected PoolInsights daily timer');
    }
    return timer;
}

describe('poolInsightsHelper lifecycle regression', () => {
    before(async () => {
        await I18n.init(path.resolve(__dirname, '../../lib'), 'en');
    });

    it('handles a foreign event before init safely', () => {
        const helper = loadHelper();
        helper.handleStateChange('foreign.0.unrelated', { val: true, ack: false });
        expect(helper._pendingManualTriggers).to.have.length(0);
    });

    it('compensates a persistent schedule event through the authoritative init read', async () => {
        const helper = loadHelper();
        helper.handleStateChange(`poolcontrol.0.${PREFIX}.schedule_time`, { val: '21:15', ack: false });
        const env = createAdapter({ states: { [`${PREFIX}.schedule_time`]: '21:15' } });
        helper.init(env.adapter);
        await waitForInitialization(helper);
        expect(env.reads).to.include(`${PREFIX}.schedule_time`);
        expect(env.timers).to.have.length(1);
    });

    it('replays a manual trigger observed before init', async () => {
        const helper = loadHelper();
        helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
        const env = createAdapter();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        expect(env.writesFor(`${PREFIX}.summary_json`)).to.have.length(1);
        expect(env.writesFor(MANUAL_TRIGGER_ID)).to.deep.equal([
            { id: MANUAL_TRIGGER_ID, state: { val: false, ack: true } },
        ]);
    });

    it('replays a manual trigger observed during init', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            onRead: async id => {
                if (id === `${PREFIX}.enabled` && !blocked) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
        expect(env.writesFor(MANUAL_TRIGGER_ID)).to.have.length(0);
        gate.resolve(undefined);
        await waitForInitialization(helper);
        expect(env.writesFor(MANUAL_TRIGGER_ID)).to.have.length(1);
    });

    it('preserves coalescing for multiple overlapping manual triggers', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            onRead: async id => {
                if (id === `${PREFIX}.enabled` && !blocked) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        for (let index = 0; index < 3; index += 1) {
            helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
        }
        gate.resolve(undefined);
        await waitForInitialization(helper);
        expect(env.writesFor(`${PREFIX}.summary_json`)).to.have.length(1);
        expect(env.writesFor(MANUAL_TRIGGER_ID)).to.have.length(3);
    });

    it('does not reinterpret a persisted true trigger as a command', async () => {
        const env = createAdapter({ states: { [MANUAL_TRIGGER_ID]: true } });
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        expect(env.writesFor(MANUAL_TRIGGER_ID)).to.have.length(0);
        expect(env.writesFor(`${PREFIX}.summary_json`)).to.have.length(0);
    });

    it('does not process a replayed trigger twice', async () => {
        const helper = loadHelper();
        helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
        const env = createAdapter();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        await settle();
        expect(env.writesFor(MANUAL_TRIGGER_ID)).to.have.length(1);
    });

    it('preserves the normal initialization and schedule path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        expect(env.subscriptions).to.deep.equal([
            `${PREFIX}.enabled`,
            `${PREFIX}.schedule_time`,
            MANUAL_TRIGGER_ID,
            `${PREFIX}.send_to_speech_queue`,
        ]);
        expect(env.writesFor(`${PREFIX}.status`).at(-1)?.state.val).to.equal('scheduled');
        expect(env.timers).to.have.length(1);
    });

    it('preserves the normal automatic analysis and reschedule path', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        const timer = getDailyTimer(env);
        env.timers.delete(timer.id);
        await timer.callback();
        expect(JSON.parse(String(env.stateStore.get(`${PREFIX}.summary_json`))).reason).to.equal('daily');
        expect(env.writesFor('speech.queue')).to.have.length(1);
        expect(env.timers).to.have.length(1);
    });

    it('preserves the normal manual analysis outputs and acknowledgement', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
        await settle();
        expect(JSON.parse(String(env.stateStore.get(`${PREFIX}.summary_json`))).reason).to.equal('manual');
        expect(env.writesFor(`${PREFIX}.summary_html`)).to.have.length(1);
        expect(env.writesFor('speech.queue')).to.have.length(1);
        expect(env.writesFor(MANUAL_TRIGGER_ID).at(-1)?.state).to.deep.equal({ val: false, ack: true });
    });

    it('does not create an unhandled rejection from a fire-and-forget manual trigger', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        const unhandled = [];
        const listener = reason => unhandled.push(reason);
        process.on('unhandledRejection', listener);
        try {
            env.adapter.setStateChangedAsync = async () => {
                throw new Error('write failed');
            };
            helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
            await settle();
            expect(unhandled).to.have.length(0);
            expect(
                env.trace.some(entry => entry[0] === 'log.warn' && String(entry[1]).includes('write failed')),
            ).to.equal(true);
        } finally {
            process.removeListener('unhandledRejection', listener);
        }
    });

    it('keeps a genuine analysis error visible', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        helper._readSnapshot = async () => {
            throw new Error('snapshot failed');
        };
        await helper._runAnalysis('manual', false);
        expect(env.writesFor(`${PREFIX}.status`).at(-1)?.state.val).to.equal('error');
        expect(
            env.trace.some(entry => entry[0] === 'log.warn' && String(entry[1]).includes('snapshot failed')),
        ).to.equal(true);
    });

    it('clears the daily schedule during cleanup', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        helper.cleanup();
        expect(env.timers).to.have.length(0);
        expect(helper.dailyTimer).to.equal(null);
    });

    it('ignores events and triggers after cleanup', async () => {
        const env = createAdapter();
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        helper.cleanup();
        const traceLength = env.trace.length;
        helper.handleStateChange(`poolcontrol.0.${MANUAL_TRIGGER_ID}`, { val: true, ack: false });
        helper.handleStateChange(`poolcontrol.0.${PREFIX}.schedule_time`, { val: '21:00', ack: false });
        await settle();
        expect(env.trace).to.have.length(traceLength);
        expect(helper._pendingManualTriggers).to.have.length(0);
    });

    it('does not publish further outputs from an analysis after cleanup', async () => {
        const entered = createDeferred();
        const release = createDeferred();
        let blockSnapshot = false;
        const env = createAdapter({
            onRead: async id => {
                if (blockSnapshot && id === 'temperature.surface.current') {
                    entered.resolve(undefined);
                    await release.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(env.adapter);
        await waitForInitialization(helper);
        blockSnapshot = true;
        const analysis = helper._runAnalysis('manual', true);
        await entered.promise;
        const writeCount = env.writes.length;
        helper.cleanup();
        release.resolve(undefined);
        await analysis;
        expect(env.writes).to.have.length(writeCount);
    });

    it('prevents an old analysis from publishing into a re-init lifecycle', async () => {
        const entered = createDeferred();
        const release = createDeferred();
        let blockSnapshot = false;
        const oldEnv = createAdapter({
            onRead: async id => {
                if (blockSnapshot && id === 'temperature.surface.current') {
                    entered.resolve(undefined);
                    await release.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(oldEnv.adapter);
        await waitForInitialization(helper);
        blockSnapshot = true;
        const oldAnalysis = helper._runAnalysis('manual', true);
        await entered.promise;
        helper.cleanup();
        const newEnv = createAdapter();
        helper.init(newEnv.adapter);
        await waitForInitialization(helper);
        const oldWriteCount = oldEnv.writes.length;
        release.resolve(undefined);
        await oldAnalysis;
        expect(oldEnv.writes).to.have.length(oldWriteCount);
        expect(newEnv.writesFor(`${PREFIX}.summary_json`)).to.have.length(0);
    });

    it('does not let an old initialization schedule a timer after re-init', async () => {
        const entered = createDeferred();
        const release = createDeferred();
        let blocked = false;
        const oldEnv = createAdapter({
            onRead: async id => {
                if (id === `${PREFIX}.enabled` && !blocked) {
                    blocked = true;
                    entered.resolve(undefined);
                    await release.promise;
                }
            },
        });
        const helper = loadHelper();
        helper.init(oldEnv.adapter);
        await entered.promise;
        helper.cleanup();
        const newEnv = createAdapter();
        helper.init(newEnv.adapter);
        await waitForInitialization(helper);
        release.resolve(undefined);
        await settle();
        expect(oldEnv.timers).to.have.length(0);
        expect(newEnv.timers).to.have.length(1);
    });

    it('does not let an old timer callback reschedule after re-init', async () => {
        const oldEnv = createAdapter();
        const helper = loadHelper();
        helper.init(oldEnv.adapter);
        await waitForInitialization(helper);
        const oldTimer = getDailyTimer(oldEnv);
        helper.cleanup();
        const newEnv = createAdapter();
        helper.init(newEnv.adapter);
        await waitForInitialization(helper);
        await oldTimer.callback();
        expect(oldEnv.writesFor(`${PREFIX}.summary_json`)).to.have.length(0);
        expect(oldEnv.timers).to.have.length(0);
        expect(newEnv.timers).to.have.length(1);
    });
});

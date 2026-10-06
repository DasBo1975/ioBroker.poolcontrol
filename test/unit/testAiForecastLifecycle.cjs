'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { EventEmitter } = require('node:events');
const https = require('node:https');
const { expect } = require('chai');

const HELPER_PATH = require.resolve('../../lib/helpers/aiForecastHelper');
const MASTER_ID = 'ai.enabled';
const MODULE_ID = 'ai.weather.switches.tomorrow_forecast_enabled';
const SPEECH_ID = 'ai.weather.switches.allow_speech';
const DEBUG_ID = 'ai.weather.switches.debug_mode';
const TIME_ID = 'ai.weather.schedule.tomorrow_forecast_time';
const OUTPUT_ID = 'ai.weather.outputs.tomorrow_forecast';
const SPEECH_QUEUE_ID = 'speech.queue';

const EXPECTED_SUBSCRIPTIONS = [MASTER_ID, MODULE_ID, SPEECH_ID, DEBUG_ID, TIME_ID];

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 * @property {string} [from] Optional state origin.
 */

/** @typedef {Partial<Record<string, FakeState>>} FakeInitialStates */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setStateChangedAsync'} method Adapter write method.
 * @property {string} id State ID.
 * @property {FakeState} state Written state.
 */

/** @typedef {(id: string) => FakeState | undefined | Promise<FakeState | undefined>} FakeStateProvider */
/** @typedef {(write: FakeWrite) => void | Promise<void>} FakeWriteObserver */

/**
 * @typedef {object} FakeAdapterOptions
 * @property {FakeInitialStates} [states] Initial own states.
 * @property {FakeStateProvider} [getState] Optional controlled own-state reader.
 * @property {FakeWriteObserver} [onWrite] Optional controlled write continuation.
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
 * @property {(adapter: object) => Promise<void>} init Initialize the helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle an event.
 * @property {() => void} cleanup Stop the helper.
 */

/**
 * @typedef {object} PendingRequest
 * @property {(weather: object) => void} respond Deliver a JSON weather response.
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
 * @param {FakeAdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ states = {}, getState, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {string[]} */
    const debugLogs = [];
    /** @type {Map<number, FakeTimer>} */
    const intervals = new Map();
    /** @type {Map<number, FakeTimer>} */
    const timeouts = new Map();
    /** @type {FakeTimer[]} */
    const intervalCreations = [];
    let timerSequence = 0;

    /**
     * @param {FakeWrite['method']} method Adapter write method.
     * @param {string} id State ID.
     * @param {FakeState} state Written state.
     */
    async function recordWrite(method, id, state) {
        const write = { method, id, state: { ...state } };
        writes.push(write);
        stateStore.set(id, write.state);
        await onWrite?.(write);
    }

    const adapter = {
        name: 'poolcontrol',
        namespace: 'poolcontrol.0',
        config: {},
        log: {
            debug: message => debugLogs.push(String(message)),
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        async getStateAsync(id) {
            if (getState) {
                const overridden = await getState(id);
                if (overridden !== undefined) {
                    return overridden;
                }
            }
            return stateStore.get(id);
        },
        async getForeignObjectAsync() {
            return { common: { latitude: 52.52, longitude: 13.405 } };
        },
        async setStateAsync(id, state) {
            await recordWrite('setStateAsync', id, state);
        },
        async setStateChangedAsync(id, state) {
            await recordWrite('setStateChangedAsync', id, state);
        },
        subscribeStates(id) {
            subscriptions.push(id);
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
        writes,
        subscriptions,
        debugLogs,
        intervalCreations,
        setOwnValue(id, value) {
            stateStore.set(id, { val: value });
        },
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
        activeIntervals() {
            return [...intervals.values()];
        },
        activeTimeouts() {
            return [...timeouts.values()];
        },
        async runInterval(timer) {
            if (!intervals.has(timer.id)) {
                throw new Error(`Interval ${timer.id} is not active`);
            }
            await timer.callback();
        },
        async runTimeout(timer) {
            if (!timeouts.delete(timer.id)) {
                throw new Error(`Timeout ${timer.id} is not active`);
            }
            await timer.callback();
        },
    };
}

/**
 * Install a controlled replacement for node:https.get.
 */
function installHttpsMock() {
    const originalGet = https.get;
    /** @type {PendingRequest[]} */
    const requests = [];

    /**
     * @param {string | URL | import('node:https').RequestOptions} _url Request URL or options.
     * @param {import('node:https').RequestOptions | ((response: import('node:http').IncomingMessage) => void)} [optionsOrCallback] Options or response callback.
     * @param {(response: import('node:http').IncomingMessage) => void} [callback] Response callback.
     * @returns {import('node:http').ClientRequest} Controlled request emitter.
     */
    function mockGet(_url, optionsOrCallback, callback) {
        const responseCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
        const requestEmitter = new EventEmitter();

        requests.push({
            respond(weather) {
                const responseEmitter = new EventEmitter();
                responseCallback?.(
                    /** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */ (responseEmitter)),
                );
                responseEmitter.emit('data', JSON.stringify(weather));
                responseEmitter.emit('end');
            },
        });

        return /** @type {import('node:http').ClientRequest} */ (/** @type {unknown} */ (requestEmitter));
    }

    https.get = mockGet;

    return {
        requests,
        restore() {
            https.get = originalGet;
        },
    };
}

/** @returns {FakeInitialStates} Standard disabled forecast configuration. */
function baseStates() {
    return {
        [MASTER_ID]: { val: true },
        [MODULE_ID]: { val: false },
        [SPEECH_ID]: { val: false },
        [DEBUG_ID]: { val: false },
        [TIME_ID]: { val: '19:00' },
    };
}

/**
 * @param {number} tomorrowMax Distinct tomorrow maximum.
 * @returns {object} Plausible Open-Meteo response.
 */
function weatherResponse(tomorrowMax) {
    return {
        daily: {
            temperature_2m_max: [20, tomorrowMax],
            temperature_2m_min: [10, 12],
            weathercode: [1, 2],
            precipitation_probability_max: [5, 20],
            wind_speed_10m_max: [8, 14],
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

/**
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter controls.
 */
async function completeStartupDelay(fake) {
    await waitFor(() => fake.activeTimeouts().length === 1, 'the startup delay');
    await fake.runTimeout(fake.activeTimeouts()[0]);
}

/**
 * @param {LoadedHelper} helper Forecast helper.
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter controls.
 */
async function initializeDisabled(helper, fake) {
    const initPromise = helper.init(fake.adapter);
    await completeStartupDelay(fake);
    await initPromise;
}

/**
 * @param {LoadedHelper} helper Forecast helper.
 * @param {ReturnType<typeof createAdapter>} fake Fake adapter controls.
 * @param {string} id State ID.
 * @param {ioBroker.StateValue} value New value.
 */
async function changeState(helper, fake, id, value) {
    fake.setOwnValue(id, value);
    await helper.handleStateChange(id, { val: value, ack: false });
}

describe('aiForecastHelper lifecycle contracts', () => {
    /** @type {ReturnType<typeof installHttpsMock>} */
    let http;

    beforeEach(() => {
        http = installHttpsMock();
    });

    afterEach(() => {
        http.restore();
    });

    it('subscribes to exactly the five forecast control states', async () => {
        const fake = createAdapter({ states: baseStates() });
        const helper = loadFreshHelper();

        await initializeDisabled(helper, fake);

        expect(fake.subscriptions).to.deep.equal(EXPECTED_SUBSCRIPTIONS);
        helper.cleanup();
    });

    it('honors the master switch and enables only the timer when the master becomes active', async () => {
        const states = baseStates();
        states[MASTER_ID] = { val: false };
        states[MODULE_ID] = { val: true };
        const fake = createAdapter({ states });
        const helper = loadFreshHelper();

        await initializeDisabled(helper, fake);

        expect(fake.activeIntervals()).to.have.length(0);
        expect(http.requests).to.have.length(0);
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);

        await changeState(helper, fake, MASTER_ID, true);

        expect(fake.activeIntervals()).to.have.length(1);
        expect(http.requests).to.have.length(0);
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);
        helper.cleanup();
    });

    it('activates and deactivates the forecast module live while invalidating an old request', async () => {
        const fake = createAdapter({ states: baseStates() });
        const helper = loadFreshHelper();
        await initializeDisabled(helper, fake);

        fake.setOwnValue(MODULE_ID, true);
        const activation = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 1, 'the activation forecast request');
        http.requests[0].respond(weatherResponse(27));
        await activation;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        expect(fake.activeIntervals()).to.have.length(1);

        const staleRun = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 2, 'the stale forecast request');
        await changeState(helper, fake, MODULE_ID, false);

        expect(fake.activeIntervals()).to.have.length(0);
        http.requests[1].respond(weatherResponse(31));
        await staleRun;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        helper.cleanup();
    });

    it('replaces the active timer when the configured forecast time changes', async () => {
        const states = baseStates();
        states[MODULE_ID] = { val: true };
        const fake = createAdapter({ states });
        const helper = loadFreshHelper();
        const initPromise = helper.init(fake.adapter);

        await waitFor(() => fake.activeIntervals().length === 1, 'the initial forecast timer');
        const initialTimer = fake.activeIntervals()[0];
        await changeState(helper, fake, TIME_ID, '20:15');

        expect(fake.activeIntervals()).to.have.length(1);
        expect(fake.activeIntervals()[0].id).not.to.equal(initialTimer.id);

        helper.cleanup();
        await completeStartupDelay(fake);
        await initPromise;
        expect(http.requests).to.have.length(0);
    });

    it('applies debug mode live without refreshing timers or publishing a forecast', async () => {
        const now = new Date();
        const states = baseStates();
        states[MODULE_ID] = { val: true };
        states[TIME_ID] = {
            val: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        };
        const fake = createAdapter({ states });
        const helper = loadFreshHelper();
        const initPromise = helper.init(fake.adapter);

        await waitFor(() => fake.activeIntervals().length === 1, 'the debug test timer');
        const timer = fake.activeIntervals()[0];
        const timerCreations = fake.intervalCreations.length;
        await changeState(helper, fake, DEBUG_ID, true);

        expect(fake.activeIntervals()[0].id).to.equal(timer.id);
        expect(fake.intervalCreations).to.have.length(timerCreations);
        expect(http.requests).to.have.length(0);
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);

        const debugCount = fake.debugLogs.length;
        const intervalRun = fake.runInterval(timer);
        await waitFor(() => http.requests.length === 1, 'the debug-enabled interval request');
        expect(fake.debugLogs.length).to.be.greaterThan(debugCount);

        helper.cleanup();
        http.requests[0].respond(weatherResponse(24));
        await intervalRun;
        await completeStartupDelay(fake);
        await initPromise;
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);
    });

    it('does not refresh timers for allow_speech and uses its live value on the next forecast', async () => {
        const fake = createAdapter({ states: baseStates() });
        const helper = loadFreshHelper();
        await initializeDisabled(helper, fake);

        fake.setOwnValue(MODULE_ID, true);
        const silentRun = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 1, 'the silent forecast request');
        http.requests[0].respond(weatherResponse(25));
        await silentRun;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        const timer = fake.activeIntervals()[0];
        const timerCreations = fake.intervalCreations.length;

        await changeState(helper, fake, SPEECH_ID, true);

        expect(fake.activeIntervals()[0].id).to.equal(timer.id);
        expect(fake.intervalCreations).to.have.length(timerCreations);

        const spokenRun = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 2, 'the spoken forecast request');
        http.requests[1].respond(weatherResponse(29));
        await spokenRun;

        const outputs = fake.writesFor(OUTPUT_ID);
        const speechWrites = fake.writesFor(SPEECH_QUEUE_ID);
        expect(outputs).to.have.length(2);
        expect(speechWrites).to.have.length(1);
        expect(speechWrites[0].state.val).to.equal(outputs[1].state.val);
        helper.cleanup();
    });

    it('publishes only B when B responds before the earlier forecast A', async () => {
        const fake = createAdapter({ states: baseStates() });
        const helper = loadFreshHelper();
        await initializeDisabled(helper, fake);
        fake.setOwnValue(MODULE_ID, true);

        const runA = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 1, 'forecast request A');
        const runB = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 2, 'forecast request B');

        http.requests[1].respond(weatherResponse(30));
        await runB;
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        const winningOutput = fake.writesFor(OUTPUT_ID)[0].state.val;

        http.requests[0].respond(weatherResponse(18));
        await runA;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        expect(fake.writesFor(OUTPUT_ID)[0].state.val).to.equal(winningOutput);
        helper.cleanup();
    });

    it('suppresses A when A responds first after forecast B has already started', async () => {
        const fake = createAdapter({ states: baseStates() });
        const helper = loadFreshHelper();
        await initializeDisabled(helper, fake);
        fake.setOwnValue(MODULE_ID, true);

        const runA = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 1, 'forecast request A');
        const runB = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 2, 'forecast request B');

        http.requests[0].respond(weatherResponse(18));
        await runA;
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);

        http.requests[1].respond(weatherResponse(30));
        await runB;
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        helper.cleanup();
    });

    it('does not publish after cleanup while an HTTPS request is still running', async () => {
        const fake = createAdapter({ states: baseStates() });
        const helper = loadFreshHelper();
        await initializeDisabled(helper, fake);
        fake.setOwnValue(MODULE_ID, true);

        const run = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 1, 'the cleanup forecast request');
        helper.cleanup();
        http.requests[0].respond(weatherResponse(26));
        await run;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        expect(fake.activeIntervals()).to.have.length(0);
    });

    it('keeps an output completed before cleanup while suppressing later speech', async () => {
        /** @type {Deferred<void>} */
        const outputContinuation = createDeferred();
        let holdOutput = false;
        const fake = createAdapter({
            states: baseStates(),
            onWrite: write => (holdOutput && write.id === OUTPUT_ID ? outputContinuation.promise : undefined),
        });
        const helper = loadFreshHelper();
        await initializeDisabled(helper, fake);
        fake.setOwnValue(MODULE_ID, true);
        fake.setOwnValue(SPEECH_ID, true);
        holdOutput = true;

        const run = helper.handleStateChange(MODULE_ID, { val: true, ack: false });
        await waitFor(() => http.requests.length === 1, 'the output-boundary forecast request');
        http.requests[0].respond(weatherResponse(28));
        await waitFor(() => fake.writesFor(OUTPUT_ID).length === 1, 'the completed forecast output write');

        helper.cleanup();
        outputContinuation.resolve(undefined);
        await run;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        expect(fake.activeIntervals()).to.have.length(0);
    });

    it('runs the normal startup forecast only after the controlled startup delay', async () => {
        const states = baseStates();
        states[MODULE_ID] = { val: true };
        const fake = createAdapter({ states });
        const helper = loadFreshHelper();
        const initPromise = helper.init(fake.adapter);

        await waitFor(() => fake.activeTimeouts().length === 1, 'the normal startup delay');
        expect(fake.activeIntervals()).to.have.length(1);
        expect(http.requests).to.have.length(0);

        const delayRun = fake.runTimeout(fake.activeTimeouts()[0]);
        await delayRun;
        await waitFor(() => http.requests.length === 1, 'the startup forecast request');
        http.requests[0].respond(weatherResponse(27));
        await initPromise;

        expect(fake.writesFor(OUTPUT_ID)).to.have.length(1);
        expect(String(fake.writesFor(OUTPUT_ID)[0].state.val)).not.to.equal('');
        expect(fake.activeIntervals()).to.have.length(1);
        helper.cleanup();
    });

    it('allows the startup delay to finish after cleanup without starting later work', async () => {
        const states = baseStates();
        states[MODULE_ID] = { val: true };
        const fake = createAdapter({ states });
        const helper = loadFreshHelper();
        const initPromise = helper.init(fake.adapter);

        await waitFor(() => fake.activeTimeouts().length === 1, 'the cleanup startup delay');
        expect(fake.activeIntervals()).to.have.length(1);
        helper.cleanup();
        await fake.runTimeout(fake.activeTimeouts()[0]);
        await initPromise;

        expect(http.requests).to.have.length(0);
        expect(fake.writesFor(OUTPUT_ID)).to.have.length(0);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        expect(fake.activeIntervals()).to.have.length(0);
        expect(fake.activeTimeouts()).to.have.length(0);
    });
});

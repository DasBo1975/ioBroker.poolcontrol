'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { EventEmitter } = require('node:events');
const https = require('node:https');
const { expect } = require('chai');

const HELPER_PATH = require.resolve('../../lib/helpers/aiHelper');
const MASTER_ID = 'ai.enabled';
const WEATHER_SWITCH_ID = 'ai.weather.switches.weather_advice_enabled';
const SUMMARY_SWITCH_ID = 'ai.weather.switches.daily_summary_enabled';
const TIPS_SWITCH_ID = 'ai.weather.switches.daily_pool_tips_enabled';
const WEEKEND_SWITCH_ID = 'ai.weather.switches.weekend_summary_enabled';
const DEBUG_ID = 'ai.weather.switches.debug_mode';
const SPEECH_SWITCH_ID = 'ai.weather.switches.allow_speech';
const WEATHER_TIME_ID = 'ai.weather.schedule.weather_advice_time';
const SUMMARY_TIME_ID = 'ai.weather.schedule.daily_summary_time';
const TIPS_TIME_ID = 'ai.weather.schedule.daily_pool_tips_time';
const WEEKEND_TIME_ID = 'ai.weather.schedule.weekend_summary_time';
const CATCHUP_ID = 'ai.weather.runtime.catchup_targets_json';
const WEATHER_OUTPUT_ID = 'ai.weather.outputs.weather_advice';
const SUMMARY_OUTPUT_ID = 'ai.weather.outputs.daily_summary';
const TIPS_OUTPUT_ID = 'ai.weather.outputs.pool_tips';
const LAST_MESSAGE_ID = 'ai.weather.outputs.last_message';
const SPEECH_QUEUE_ID = 'speech.queue';

const EXPECTED_SUBSCRIPTIONS = [
    MASTER_ID,
    WEATHER_SWITCH_ID,
    SUMMARY_SWITCH_ID,
    TIPS_SWITCH_ID,
    WEEKEND_SWITCH_ID,
    DEBUG_ID,
    SPEECH_SWITCH_ID,
    WEATHER_TIME_ID,
    SUMMARY_TIME_ID,
    TIPS_TIME_ID,
    WEEKEND_TIME_ID,
];

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 * @property {string} [from] Optional state origin.
 */

/** @typedef {Map<string, FakeState>} FakeStateStore */

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
 * @property {FakeStateStore} [stateStore] Shared state store.
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

/** @returns {FakeStateStore} Standard enabled aiHelper configuration. */
function createStateStore() {
    return new Map(
        Object.entries({
            [MASTER_ID]: { val: true },
            [WEATHER_SWITCH_ID]: { val: true },
            [SUMMARY_SWITCH_ID]: { val: true },
            [TIPS_SWITCH_ID]: { val: true },
            [WEEKEND_SWITCH_ID]: { val: true },
            [DEBUG_ID]: { val: false },
            [SPEECH_SWITCH_ID]: { val: true },
            [WEATHER_TIME_ID]: { val: '08:00' },
            [SUMMARY_TIME_ID]: { val: '09:00' },
            [TIPS_TIME_ID]: { val: '10:00' },
            [WEEKEND_TIME_ID]: { val: '18:00' },
            [CATCHUP_ID]: { val: '{}' },
            'status.season_active': { val: true },
            'pump.pump_switch': { val: true },
            'pump.mode': { val: 'auto' },
            'temperature.surface.current': { val: 24 },
        }),
    );
}

/**
 * @param {FakeAdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ stateStore = createStateStore(), getState, onWrite } = {}) {
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
        log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            const controlled = await getState?.(id);
            return controlled === undefined ? stateStore.get(id) : controlled;
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
        setValue(id, value) {
            stateStore.set(id, { val: value });
        },
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
        activeIntervals(delay) {
            const active = [...intervals.values()];
            return delay === undefined ? active : active.filter(timer => timer.delay === delay);
        },
        activeTimeouts(delay) {
            const active = [...timeouts.values()];
            return delay === undefined ? active : active.filter(timer => timer.delay === delay);
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

/** Install a controlled replacement for node:https.get. */
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
    return { requests, restore: () => (https.get = originalGet) };
}

/**
 * @param {number} maximum Distinct daily maximum.
 * @param {number} [wind] Current wind speed.
 */
function weatherResponse(maximum, wind = 12) {
    return {
        current: { wind_speed_10m: wind },
        daily: {
            temperature_2m_max: [maximum, maximum + 1, maximum + 2],
            temperature_2m_min: [maximum - 8, maximum - 7, maximum - 6],
            weathercode: [1, 1, 1],
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
 * @param {LoadedHelper} helper Helper singleton.
 * @param {ReturnType<typeof createAdapter>} fake Fake controls.
 * @param {string} id State ID.
 * @param {ioBroker.StateValue} value New value.
 */
async function changeState(helper, fake, id, value) {
    fake.setValue(id, value);
    await helper.handleStateChange(`poolcontrol.0.${id}`, { val: value, ack: false, from: 'system.adapter.admin.0' });
}

/**
 * @param {number} initialTimestamp Initial fake timestamp.
 * @param {(clock: {set(timestamp: number): void}) => Promise<void>} callback Controlled-clock work.
 */
async function withClock(initialTimestamp, callback) {
    const RealDate = Date;
    let currentTimestamp = initialTimestamp;
    const ControlledDate = new Proxy(RealDate, {
        apply() {
            return new RealDate(currentTimestamp).toString();
        },
        construct(target, args, newTarget) {
            return Reflect.construct(target, args.length ? args : [currentTimestamp], newTarget);
        },
        get(target, property, receiver) {
            return property === 'now' ? () => currentTimestamp : Reflect.get(target, property, receiver);
        },
    });
    global.Date = ControlledDate;
    try {
        await callback({ set: timestamp => (currentTimestamp = timestamp) });
    } finally {
        global.Date = RealDate;
    }
}

/**
 * Start all active minute timers without waiting for their asynchronous work.
 *
 * @param {ReturnType<typeof createAdapter>} fake Fake controls.
 */
function startMinuteTimers(fake) {
    return fake.activeIntervals(60_000).map(timer => Promise.resolve(timer.callback()));
}

/**
 * Complete one weather-producing timer execution.
 *
 * @param {ReturnType<typeof createAdapter>} fake Fake controls.
 * @param {ReturnType<typeof installHttpsMock>} http HTTPS controls.
 * @param {number} maximum Distinct weather value.
 */
async function runScheduledWeather(fake, http, maximum) {
    const requestBase = http.requests.length;
    const runs = startMinuteTimers(fake);
    await waitFor(() => http.requests.length > requestBase, 'a scheduled weather request');
    const request = http.requests[requestBase];
    if (!request) {
        throw new Error('Scheduled weather request was not registered');
    }
    request.respond(weatherResponse(maximum));
    await Promise.all(runs);
}

describe('aiHelper lifecycle contracts', () => {
    /** @type {ReturnType<typeof installHttpsMock>} */
    let http;

    beforeEach(() => {
        http = installHttpsMock();
    });

    afterEach(() => {
        http.restore();
    });

    it('subscribes to exactly the eleven aiHelper control states', async () => {
        const fake = createAdapter();
        const helper = loadFreshHelper();
        await helper.init(fake.adapter);

        expect(fake.subscriptions).to.deep.equal(EXPECTED_SUBSCRIPTIONS);
        expect(fake.subscriptions.some(id => id.includes('tomorrow_forecast'))).to.equal(false);
        helper.cleanup();
    });

    it('honors ai.enabled live, invalidates running work, and rebuilds without an immediate run', async () => {
        const store = createStateStore();
        store.set(MASTER_ID, { val: false });
        const fake = createAdapter({ stateStore: store });
        const helper = loadFreshHelper();
        await helper.init(fake.adapter);

        expect(fake.activeIntervals()).to.have.length(0);
        expect(http.requests).to.have.length(0);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);

        await changeState(helper, fake, MASTER_ID, true);
        expect(fake.activeIntervals()).to.have.length(5);
        expect(http.requests).to.have.length(0);

        await withClock(new Date(2026, 5, 5, 8, 0).getTime(), async () => {
            const runs = startMinuteTimers(fake);
            await waitFor(() => http.requests.length === 1, 'the in-flight weather request');
            await changeState(helper, fake, MASTER_ID, false);
            expect(fake.activeIntervals()).to.have.length(0);
            http.requests[0].respond(weatherResponse(26));
            await Promise.all(runs);
        });

        expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(0);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        helper.cleanup();
    });

    it('lets only the newest timer refresh install timers in both completion orderings', async () => {
        for (const oldCompletesFirst of [false, true]) {
            const oldMaster = createDeferred();
            const newMaster = createDeferred();
            let masterReads = 0;
            const fake = createAdapter({
                getState: id => {
                    if (id !== MASTER_ID) {
                        return undefined;
                    }
                    masterReads++;
                    if (masterReads === 2) {
                        return oldMaster.promise;
                    }
                    if (masterReads === 3) {
                        return newMaster.promise;
                    }
                    return undefined;
                },
            });
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);

            const oldRefresh = changeState(helper, fake, SUMMARY_SWITCH_ID, false);
            await waitFor(() => masterReads === 2, 'the old refresh master read');
            const newRefresh = changeState(helper, fake, SUMMARY_SWITCH_ID, true);
            await waitFor(() => masterReads === 3, 'the new refresh master read');

            if (oldCompletesFirst) {
                oldMaster.resolve({ val: true });
                await oldRefresh;
                newMaster.resolve({ val: true });
            } else {
                newMaster.resolve({ val: true });
                await newRefresh;
                oldMaster.resolve({ val: true });
            }
            await Promise.all([oldRefresh, newRefresh]);

            expect(fake.activeIntervals()).to.have.length(5);
            helper.cleanup();
        }
    });

    it('suppresses an older delayed schedule change after a newer one', async () => {
        await withClock(new Date(2026, 5, 5, 12, 0).getTime(), async () => {
            const fake = createAdapter();
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);

            const oldChange = changeState(helper, fake, WEATHER_TIME_ID, '13:00');
            await waitFor(() => fake.activeTimeouts(1500).length === 1, 'the old schedule delay');
            const newChange = changeState(helper, fake, WEATHER_TIME_ID, '14:00');
            await waitFor(() => fake.activeTimeouts(1500).length === 2, 'the new schedule delay');

            const delays = fake.activeTimeouts(1500);
            await fake.runTimeout(delays[0]);
            await fake.runTimeout(delays[1]);
            const changesCompleted = Promise.all([oldChange, newChange]);
            await waitFor(() => http.requests.length === 1, 'the newest schedule immediate run');
            expect(http.requests).to.have.length(1);
            http.requests[0].respond(weatherResponse(30));
            await changesCompleted;
            helper.cleanup();
        });
    });

    it('suppresses delayed schedule work after cleanup, master-off, or module-off', async () => {
        for (const invalidation of ['cleanup', 'master', 'module']) {
            await withClock(new Date(2026, 5, 5, 12, 0).getTime(), async () => {
                const fake = createAdapter();
                const helper = loadFreshHelper();
                await helper.init(fake.adapter);
                const pending = changeState(helper, fake, WEATHER_TIME_ID, '13:00');
                await waitFor(() => fake.activeTimeouts(1500).length === 1, `${invalidation} schedule delay`);

                if (invalidation === 'cleanup') {
                    helper.cleanup();
                } else if (invalidation === 'master') {
                    await changeState(helper, fake, MASTER_ID, false);
                } else {
                    await changeState(helper, fake, WEATHER_SWITCH_ID, false);
                }

                await fake.runTimeout(fake.activeTimeouts(1500)[0]);
                await pending;
                expect(http.requests).to.have.length(0);
                if (invalidation !== 'cleanup') {
                    helper.cleanup();
                }
            });
        }
    });

    it('claims 08:00 once, catches up at +1/+2 once, and never catches up at +3', async () => {
        const base = new Date(2026, 5, 5, 8, 0).getTime();

        await withClock(base - 30_000, async clock => {
            const fake = createAdapter();
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);
            clock.set(base);
            await runScheduledWeather(fake, http, 25);
            await Promise.all(startMinuteTimers(fake));
            expect(http.requests).to.have.length(1);
            const persisted = JSON.parse(String(fake.stateStore.get(CATCHUP_ID)?.val));
            expect(persisted.weatherAdvice).to.deep.equal(['2026-06-05@08:00']);
            helper.cleanup();
        });

        for (const offsetMinutes of [1, 2]) {
            await withClock(base + 30_000, async clock => {
                const fake = createAdapter();
                const helper = loadFreshHelper();
                await helper.init(fake.adapter);
                const requestCount = http.requests.length;
                clock.set(base + offsetMinutes * 60_000);
                const runs = startMinuteTimers(fake);
                await waitFor(() => http.requests.length === requestCount + 1, `the +${offsetMinutes} catch-up`);
                const request = http.requests[requestCount];
                if (!request) {
                    throw new Error(`Catch-up request +${offsetMinutes} was not registered`);
                }
                request.respond(weatherResponse(25 + offsetMinutes));
                await Promise.all(runs);
                await Promise.all(startMinuteTimers(fake));
                expect(http.requests).to.have.length(requestCount + 1);
                helper.cleanup();
            });
        }

        await withClock(base + 30_000, async clock => {
            const fake = createAdapter();
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);
            const requestCount = http.requests.length;
            clock.set(base + 3 * 60_000);
            await Promise.all(startMinuteTimers(fake));
            expect(http.requests).to.have.length(requestCount);
            helper.cleanup();
        });
    });

    it('persists a +1 catch-up across a fresh module load and suppresses it at +2', async () => {
        const base = new Date(2026, 5, 5, 8, 0).getTime();
        const sharedStore = createStateStore();

        await withClock(base + 30_000, async clock => {
            const firstFake = createAdapter({ stateStore: sharedStore });
            const firstHelper = loadFreshHelper();
            await firstHelper.init(firstFake.adapter);
            clock.set(base + 60_000);
            await runScheduledWeather(firstFake, http, 27);
            firstHelper.cleanup();

            clock.set(base + 90_000);
            const secondFake = createAdapter({ stateStore: sharedStore });
            const secondHelper = loadFreshHelper();
            await secondHelper.init(secondFake.adapter);
            const requestCount = http.requests.length;
            clock.set(base + 120_000);
            await Promise.all(startMinuteTimers(secondFake));

            expect(http.requests).to.have.length(requestCount);
            expect(String(sharedStore.get(CATCHUP_ID)?.val)).to.include('2026-06-05@08:00');
            secondHelper.cleanup();
        });
    });

    it('keeps the latest-started weather_advice producer authoritative in both completion orders', async () => {
        for (const newerCompletesFirst of [true, false]) {
            await withClock(new Date(2026, 5, 5, 8, 0).getTime(), async () => {
                const fake = createAdapter();
                const helper = loadFreshHelper();
                await helper.init(fake.adapter);

                const requestBase = http.requests.length;
                const regularRuns = startMinuteTimers(fake);
                await waitFor(() => http.requests.length >= requestBase + 1, 'the regular weather request');
                const hourly = fake.activeIntervals(3_600_000)[0];
                const hourlyRun = Promise.resolve(hourly.callback());
                await waitFor(() => http.requests.length >= requestBase + 2, 'the hourly weather request');
                const older = http.requests[requestBase];
                const newer = http.requests[requestBase + 1];

                if (newerCompletesFirst) {
                    newer.respond(weatherResponse(31));
                    await hourlyRun;
                    older.respond(weatherResponse(21));
                } else {
                    older.respond(weatherResponse(21));
                    await nextTurn();
                    expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(0);
                    newer.respond(weatherResponse(31));
                }
                await Promise.all(regularRuns);
                await hourlyRun;

                expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(1);
                expect(String(fake.writesFor(WEATHER_OUTPUT_ID)[0].state.val)).to.include('31.0');
                helper.cleanup();
            });
        }
    });

    it('uses the same latest-started ownership for the shared pool_tips output', async () => {
        await withClock(new Date(2026, 5, 5, 10, 0).getTime(), async () => {
            const fake = createAdapter();
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);

            const regularRuns = startMinuteTimers(fake);
            await waitFor(() => http.requests.length === 1, 'the regular pool-tips request');
            const hourlyRun = Promise.resolve(fake.activeIntervals(3_600_000)[0].callback());
            await waitFor(() => http.requests.length === 2, 'the hourly pool-tips request');
            http.requests[1].respond(weatherResponse(32));
            await hourlyRun;
            http.requests[0].respond(weatherResponse(18));
            await Promise.all(regularRuns);

            expect(fake.writesFor(TIPS_OUTPUT_ID)).to.have.length(1);
            expect(String(fake.writesFor(TIPS_OUTPUT_ID)[0].state.val)).to.include('warm bis sehr warm');
            helper.cleanup();
        });
    });

    it('allows different regular modules to publish in parallel and mirrors the last successful output', async () => {
        await withClock(new Date(2026, 5, 5, 8, 0).getTime(), async clock => {
            const fake = createAdapter();
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);

            const weatherRuns = startMinuteTimers(fake);
            await waitFor(() => http.requests.length === 1, 'the weather-advice request');
            clock.set(new Date(2026, 5, 5, 9, 0).getTime());
            const summaryRuns = startMinuteTimers(fake);
            await waitFor(() => http.requests.length === 2, 'the daily-summary request');

            http.requests[0].respond(weatherResponse(24));
            await Promise.all(weatherRuns);
            http.requests[1].respond(weatherResponse(29));
            await Promise.all(summaryRuns);

            expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(1);
            expect(fake.writesFor(SUMMARY_OUTPUT_ID)).to.have.length(1);
            expect(fake.stateStore.get(LAST_MESSAGE_ID)?.val).to.equal(fake.stateStore.get(SUMMARY_OUTPUT_ID)?.val);
            helper.cleanup();
        });
    });

    it('suppresses speech for stale, superseded, cleanup, master-off, and disabled continuations', async () => {
        for (const mode of ['stale', 'superseded', 'cleanup', 'master', 'disabled']) {
            await withClock(new Date(2026, 5, 5, 8, 0).getTime(), async () => {
                const requestBase = http.requests.length;
                /** @type {ReturnType<typeof createAdapter> | undefined} */
                let fake;
                /** @type {LoadedHelper | undefined} */
                let helper;
                /** @type {Promise<unknown> | undefined} */
                let supersedingRun;
                fake = createAdapter({
                    onWrite: async write => {
                        if (write.id !== LAST_MESSAGE_ID || mode === 'stale') {
                            return;
                        }
                        if (mode === 'superseded') {
                            supersedingRun = Promise.resolve(fake?.activeIntervals(3_600_000)[0].callback());
                            await waitFor(
                                () => http.requests.length >= requestBase + 2,
                                'the superseding hourly request',
                            );
                        } else if (mode === 'cleanup') {
                            helper?.cleanup();
                        } else if (mode === 'master') {
                            await changeState(
                                /** @type {LoadedHelper} */ (helper),
                                /** @type {ReturnType<typeof createAdapter>} */ (fake),
                                MASTER_ID,
                                false,
                            );
                        }
                    },
                });
                helper = loadFreshHelper();
                if (mode === 'disabled') {
                    fake.setValue(SPEECH_SWITCH_ID, false);
                }
                await helper.init(fake.adapter);

                const regularRuns = startMinuteTimers(fake);
                await waitFor(() => http.requests.length >= requestBase + 1, `${mode} regular request`);
                const regularRequest = http.requests[requestBase];

                if (mode === 'stale') {
                    const hourlyRun = Promise.resolve(fake.activeIntervals(3_600_000)[0].callback());
                    await waitFor(() => http.requests.length >= requestBase + 2, 'the newer hourly request');
                    regularRequest.respond(weatherResponse(20));
                    await Promise.all(regularRuns);
                    expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(0);
                    http.requests[requestBase + 1].respond(weatherResponse(30));
                    await hourlyRun;
                } else {
                    regularRequest.respond(weatherResponse(26));
                    await Promise.all(regularRuns);
                    expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(1);
                }

                expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
                if (mode === 'superseded') {
                    http.requests[requestBase + 1].respond(weatherResponse(32));
                    await supersedingRun;
                    expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
                }
                if (mode !== 'cleanup' && mode !== 'master') {
                    helper.cleanup();
                }
            });
        }
    });

    it('updates both hourly snapshots under the master regardless of regular module switches and never speaks', async () => {
        const store = createStateStore();
        store.set(WEATHER_SWITCH_ID, { val: false });
        store.set(TIPS_SWITCH_ID, { val: false });
        const fake = createAdapter({ stateStore: store });
        const helper = loadFreshHelper();
        await helper.init(fake.adapter);

        expect(fake.activeIntervals(3_600_000)).to.have.length(1);
        const run = Promise.resolve(fake.activeIntervals(3_600_000)[0].callback());
        await waitFor(() => http.requests.length === 1, 'the hourly request');
        http.requests[0].respond(weatherResponse(28));
        await run;

        expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(1);
        expect(fake.writesFor(TIPS_OUTPUT_ID)).to.have.length(1);
        expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(0);
        helper.cleanup();
    });

    it('completes the normal weather-advice path with output, last_message, and allowed speech', async () => {
        await withClock(new Date(2026, 5, 5, 8, 0).getTime(), async () => {
            const fake = createAdapter();
            const helper = loadFreshHelper();
            await helper.init(fake.adapter);

            await runScheduledWeather(fake, http, 27);

            expect(fake.writesFor(WEATHER_OUTPUT_ID)).to.have.length(1);
            expect(fake.writesFor(LAST_MESSAGE_ID)).to.have.length(1);
            expect(fake.stateStore.get(LAST_MESSAGE_ID)?.val).to.equal(fake.stateStore.get(WEATHER_OUTPUT_ID)?.val);
            expect(fake.writesFor(SPEECH_QUEUE_ID)).to.have.length(1);
            helper.cleanup();
        });
    });
});

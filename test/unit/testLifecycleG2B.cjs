'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const TEMPERATURE_PATH = require.resolve('../../lib/helpers/temperatureHelper');
const CONSUMPTION_PATH = require.resolve('../../lib/helpers/consumptionHelper');
const SENSOR_ID = 'test.temperature.collector';

/**
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {number} [ts] Source timestamp.
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
 * @property {'timeout' | 'interval'} kind Timer kind.
 * @property {() => void | Promise<void>} callback Timer callback.
 * @property {number} delay Delay in milliseconds.
 */

/**
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial own states.
 * @property {Record<string, FakeState | null>} [foreignStates] Initial foreign states.
 * @property {Record<string, ioBroker.StateValue>} [config] Adapter configuration.
 * @property {(id: string) => void | Promise<void>} [onRead] Own-state read hook.
 * @property {(id: string) => void | Promise<void>} [onForeignRead] Foreign-state read hook.
 * @property {(id: string) => void | Promise<void>} [onWrite] State write hook.
 */

/**
 * @typedef {object} LoadedTemperatureHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {number} _lifecycleGeneration Current lifecycle generation.
 * @property {Promise<void> | null} _initializationPromise Initialization barrier.
 * @property {Record<string, number>} values Current sensor values.
 * @property {Record<string, {min: number, max: number}>} minMax Daily limits.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => void} cleanup Stop helper.
 */

/**
 * @typedef {object} LoadedConsumptionHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {number} _lifecycleGeneration Current lifecycle generation.
 * @property {Promise<void> | null} _initializationPromise Initialization barrier.
 * @property {Record<string, number>} baselines Period baselines.
 * @property {number} baseTotalKwh Total energy baseline.
 * @property {number} baseTotalEur Total cost baseline.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {(adapter: object) => Promise<void>} resetAll Reset counters independently.
 * @property {() => void} cleanup Stop helper.
 */

/** @returns {Deferred<void>} Controlled void promise. */
function createDeferred() {
    /** @type {Deferred<void>['resolve']} */
    let resolvePromise = () => undefined;
    /** @type {Promise<void>} */
    const promise = new Promise(resolve => {
        resolvePromise = resolve;
    });
    return { promise, resolve: resolvePromise };
}

/** @returns {LoadedTemperatureHelper} Fresh temperature helper singleton. */
function loadTemperatureHelper() {
    delete require.cache[TEMPERATURE_PATH];
    return /** @type {LoadedTemperatureHelper} */ (require(TEMPERATURE_PATH));
}

/** @returns {LoadedConsumptionHelper} Fresh consumption helper singleton. */
function loadConsumptionHelper() {
    delete require.cache[CONSUMPTION_PATH];
    return /** @type {LoadedConsumptionHelper} */ (require(CONSUMPTION_PATH));
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, foreignStates = {}, config = {}, onRead, onForeignRead, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    const foreignStore = new Map(Object.entries(foreignStates));
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {FakeTimer[]} */
    const timers = [];
    /** @type {number[]} */
    const clears = [];
    let nextTimerId = 1;

    const adapter = {
        config,
        log: {
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        subscribeForeignStates(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async getForeignStateAsync(id) {
            reads.push(`foreign:${id}`);
            await onForeignRead?.(id);
            return foreignStore.get(id) ?? null;
        },
        async setStateAsync(id, state) {
            await onWrite?.(id);
            const stored = { ...state };
            writes.push({ id, state: stored });
            stateStore.set(id, stored.val);
        },
        setTimeout(callback, delay) {
            /** @type {FakeTimer} */
            const timer = { id: nextTimerId++, kind: 'timeout', callback, delay };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            clears.push(timer.id);
        },
        setInterval(callback, delay) {
            /** @type {FakeTimer} */
            const timer = { id: nextTimerId++, kind: 'interval', callback, delay };
            timers.push(timer);
            return timer;
        },
        clearInterval(timer) {
            clears.push(timer.id);
        },
    };

    return { adapter, stateStore, foreignStore, subscriptions, reads, writes, timers, clears };
}

/** @returns {Record<string, ioBroker.StateValue>} Temperature adapter config. */
function temperatureConfig() {
    return {
        collector_temp_active: true,
        collector_temp_sensor: SENSOR_ID,
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Persisted temperature states. */
function temperatureStates() {
    const now = new Date();
    const period = localDayKey(now);

    return {
        'temperature.daily_minmax_period': period,
        'temperature.collector.min_today': 10,
        'temperature.collector.max_today': 20,
    };
}

/**
 * @param {Date} date Date to format.
 * @returns {string} Local calendar day key.
 */
function localDayKey(date) {
    return [
        String(date.getFullYear()),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

/** @returns {Record<string, ioBroker.StateValue>} Consumption adapter config. */
function consumptionConfig() {
    return {
        external_energy_total_id: 'test.energy.total',
        energy_price_eur_kwh: '0.30',
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Persisted consumption states. */
function consumptionStates() {
    return {
        'consumption.total_kwh': 100,
        'costs.total_eur': 30,
        'consumption.day_kwh': 2,
        'consumption.week_kwh': 5,
        'consumption.month_kwh': 10,
        'consumption.year_kwh': 20,
        'consumption.offset_kwh': 0,
        'consumption.last_total_kwh': 100,
    };
}

/** @param {{_initializationPromise: Promise<void> | null}} helper Helper with startup barrier. */
async function finishInitialization(helper) {
    const initializationPromise = helper._initializationPromise;
    if (initializationPromise) {
        await initializationPromise;
    }
}

/**
 * @param {string} iso Fixed timestamp.
 * @returns {{set: (isoValue: string) => void, restore: () => void}} Fake clock controller.
 */
function installFakeDate(iso) {
    const RealDate = Date;
    let fixedTimestamp = new RealDate(iso).getTime();
    const ControlledDate = new Proxy(RealDate, {
        apply() {
            return new RealDate(fixedTimestamp).toString();
        },
        construct(target, args, newTarget) {
            return Reflect.construct(target, args.length ? args : [fixedTimestamp], newTarget);
        },
        get(target, property, receiver) {
            return property === 'now' ? () => fixedTimestamp : Reflect.get(target, property, receiver);
        },
    });

    global.Date = ControlledDate;

    return {
        set(isoValue) {
            fixedTimestamp = new RealDate(isoValue).getTime();
        },
        restore() {
            global.Date = RealDate;
        },
    };
}

describe('Lifecycle G2-B', () => {
    describe('temperatureHelper', () => {
        it('ignores an event before init safely', async () => {
            const helper = loadTemperatureHelper();
            await helper.handleStateChange(SENSOR_ID, { val: 12, ts: Date.now() });
            expect(helper._active).to.equal(false);
        });

        it('compensates a pre-init level through the authoritative foreign read', async () => {
            const helper = loadTemperatureHelper();
            const context = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(helper.values.collector).to.equal(15);
            expect(context.writes.find(write => write.id === 'temperature.collector.current')?.state.val).to.equal(15);
        });

        it('does not process an event ahead of an in-flight startup read', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadTemperatureHelper();
            const context = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
                onRead: async id => {
                    if (id === 'temperature.collector.min_today') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await entered.promise;
            const event = helper.handleStateChange(SENSOR_ID, { val: 25, ts: Date.now() });
            expect(context.writes).to.have.length(0);
            gate.resolve();
            await Promise.all([finishInitialization(helper), event]);
            expect(helper.values.collector).to.equal(15);
        });

        it('keeps the normal sensor and min/max path', async () => {
            const helper = loadTemperatureHelper();
            const context = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            await helper.handleStateChange(SENSOR_ID, { val: 25, ts: Date.now() });
            expect(helper.minMax.collector).to.deep.equal({ min: 10, max: 25 });
            expect(context.writes.map(write => write.id)).to.include('temperature.collector.max_today');
        });

        it('restores a complete persisted min/max pair unchanged', async () => {
            const helper = loadTemperatureHelper();
            const context = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(helper.minMax.collector).to.deep.equal({ min: 10, max: 20 });
            expect(context.reads.slice(0, 3)).to.deep.equal([
                'temperature.daily_minmax_period',
                'temperature.collector.min_today',
                'temperature.collector.max_today',
            ]);
        });

        it('performs the normal daily reset and schedules the next one', async () => {
            const clock = installFakeDate('2026-10-05T10:00:00+02:00');
            try {
                const helper = loadTemperatureHelper();
                const context = createAdapter({
                    config: temperatureConfig(),
                    states: temperatureStates(),
                    foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
                });
                helper.init(context.adapter);
                await finishInitialization(helper);
                expect(
                    context.writes.some(write => write.id === 'temperature.daily_minmax_period'),
                    'init should not require a catch-up reset',
                ).to.equal(false);
                context.writes.length = 0;
                const reset = context.timers.find(timer => timer.kind === 'timeout');
                expect(reset).to.exist;
                if (!reset) {
                    throw new Error('Daily reset timer missing');
                }
                const timeoutCountBefore = context.timers.filter(timer => timer.kind === 'timeout').length;
                clock.set('2026-10-06T00:01:00+02:00');
                await reset.callback();
                expect(context.writes.map(write => write.id)).to.deep.equal([
                    'temperature.collector.min_today',
                    'temperature.collector.max_today',
                    'temperature.collector.delta_per_hour',
                    'temperature.outside.min_today',
                    'temperature.outside.max_today',
                    'temperature.outside.delta_per_hour',
                    'temperature.surface.min_today',
                    'temperature.surface.max_today',
                    'temperature.surface.delta_per_hour',
                    'temperature.ground.min_today',
                    'temperature.ground.max_today',
                    'temperature.ground.delta_per_hour',
                    'temperature.flow.min_today',
                    'temperature.flow.max_today',
                    'temperature.flow.delta_per_hour',
                    'temperature.return.min_today',
                    'temperature.return.max_today',
                    'temperature.return.delta_per_hour',
                    'temperature.daily_minmax_period',
                ]);
                expect(context.stateStore.get('temperature.daily_minmax_period')).to.equal('2026-10-06');
                expect(context.timers.filter(timer => timer.kind === 'timeout')).to.have.length(timeoutCountBefore + 1);
            } finally {
                clock.restore();
            }
        });

        it('stops an in-flight daily reset after cleanup', async () => {
            const clock = installFakeDate('2026-10-05T10:00:00+02:00');
            try {
                const gate = createDeferred();
                const entered = createDeferred();
                let blockWrites = false;
                const helper = loadTemperatureHelper();
                const context = createAdapter({
                    config: temperatureConfig(),
                    states: temperatureStates(),
                    foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
                    onWrite: async id => {
                        if (blockWrites && id === 'temperature.collector.min_today') {
                            entered.resolve();
                            await gate.promise;
                        }
                    },
                });
                helper.init(context.adapter);
                await finishInitialization(helper);
                context.writes.length = 0;
                const reset = context.timers.find(timer => timer.kind === 'timeout');
                if (!reset) {
                    throw new Error('Daily reset timer missing');
                }
                const timeoutCountBefore = context.timers.filter(timer => timer.kind === 'timeout').length;
                clock.set('2026-10-06T00:01:00+02:00');
                blockWrites = true;
                const resetRun = reset.callback();
                await entered.promise;
                helper.cleanup();
                gate.resolve();
                await resetRun;
                expect(context.writes.map(write => write.id)).to.deep.equal(['temperature.collector.min_today']);
                expect(context.stateStore.get('temperature.daily_minmax_period')).to.equal('2026-10-05');
                expect(context.timers.filter(timer => timer.kind === 'timeout')).to.have.length(timeoutCountBefore);
            } finally {
                clock.restore();
            }
        });

        it('stops an in-flight diagnostic read after cleanup', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            let blockRead = false;
            const helper = loadTemperatureHelper();
            const context = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
                onRead: async id => {
                    if (blockRead && id === 'temperature.collector.last_valid_value_at') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            blockRead = true;
            const diagnostic = context.timers.find(timer => timer.kind === 'interval');
            if (!diagnostic) {
                throw new Error('Diagnostic timer missing');
            }
            const diagnosticRun = diagnostic.callback();
            await entered.promise;
            helper.cleanup();
            gate.resolve();
            await diagnosticRun;
            expect(context.writes).to.have.length(0);
        });

        it('ignores events after cleanup', async () => {
            const helper = loadTemperatureHelper();
            const context = createAdapter({ config: temperatureConfig() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            helper.cleanup();
            const activity = context.reads.length + context.writes.length;
            await helper.handleStateChange(SENSOR_ID, { val: 25, ts: Date.now() });
            expect(context.reads.length + context.writes.length).to.equal(activity);
        });

        it('invalidates old startup work across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadTemperatureHelper();
            const oldContext = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 15, ts: Date.now() } },
                onRead: async id => {
                    if (id === 'temperature.collector.min_today') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(oldContext.adapter);
            const oldInitialization = helper._initializationPromise;
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({
                config: temperatureConfig(),
                states: temperatureStates(),
                foreignStates: { [SENSOR_ID]: { val: 22, ts: Date.now() } },
            });
            helper.init(newContext.adapter);
            const newInitialization = helper._initializationPromise;
            gate.resolve();
            await Promise.all([oldInitialization, newInitialization]);
            expect(oldContext.writes).to.have.length(0);
            expect(helper.values.collector).to.equal(22);
            expect(oldContext.clears).to.have.length(2);
        });
    });

    describe('consumptionHelper', () => {
        it('ignores an event before init safely', async () => {
            const helper = loadConsumptionHelper();
            await helper.handleStateChange('test.energy.total', { val: 105 });
            expect(helper._active).to.equal(false);
        });

        it('restores persisted period and cost baselines', async () => {
            const helper = loadConsumptionHelper();
            const context = createAdapter({ config: consumptionConfig(), states: consumptionStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(helper.baselines).to.deep.equal({ day: 98, week: 95, month: 90, year: 80 });
            expect(helper.baseTotalKwh).to.equal(100);
            expect(helper.baseTotalEur).to.equal(30);
        });

        it('keeps the normal cumulative meter calculation', async () => {
            const helper = loadConsumptionHelper();
            const context = createAdapter({ config: consumptionConfig(), states: consumptionStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            await helper.handleStateChange('test.energy.total', { val: 105 });
            expect(context.stateStore.get('consumption.total_kwh')).to.equal(105);
            expect(context.stateStore.get('consumption.day_kwh')).to.equal(7);
            expect(context.stateStore.get('costs.total_eur')).to.equal(31.5);
            expect(context.stateStore.get('consumption.last_total_kwh')).to.equal(105);
        });

        it('runs all four period timers and reschedules them', async () => {
            const RealDate = Date;
            const fixedNow = new RealDate('2029-01-01T00:00:00.000+01:00').getTime();
            const FixedDate = new Proxy(RealDate, {
                apply() {
                    return new RealDate(fixedNow).toString();
                },
                construct(target, args, newTarget) {
                    return Reflect.construct(target, args.length ? args : [fixedNow], newTarget);
                },
                get(target, property, receiver) {
                    return property === 'now' ? () => fixedNow : Reflect.get(target, property, receiver);
                },
            });
            global.Date = FixedDate;
            try {
                const helper = loadConsumptionHelper();
                const context = createAdapter({ config: consumptionConfig(), states: consumptionStates() });
                helper.init(context.adapter);
                await finishInitialization(helper);
                const initialTimers = context.timers.slice(0, 4);
                context.writes.length = 0;
                for (const timer of initialTimers) {
                    await timer.callback();
                }
                expect(context.writes.map(write => write.id)).to.include.members([
                    'consumption.day_kwh',
                    'consumption.week_kwh',
                    'consumption.month_kwh',
                    'consumption.year_kwh',
                    'costs.day_eur',
                    'costs.week_eur',
                    'costs.month_eur',
                    'costs.year_eur',
                ]);
                expect(context.timers).to.have.length(8);
            } finally {
                global.Date = RealDate;
            }
        });

        it('clears all four timers during cleanup', async () => {
            const helper = loadConsumptionHelper();
            const context = createAdapter({ config: consumptionConfig(), states: consumptionStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            helper.cleanup();
            expect(context.clears).to.deep.equal([1, 2, 3, 4]);
        });

        it('does not let an old recursive timer reschedule after cleanup', async () => {
            const helper = loadConsumptionHelper();
            const context = createAdapter({ config: consumptionConfig(), states: consumptionStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            const dailyTimer = context.timers[0];
            helper.cleanup();
            await dailyTimer.callback();
            expect(context.timers).to.have.length(4);
            expect(context.writes).to.have.length(0);
        });

        it('stops an in-flight consumption update after cleanup', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            let blockRead = false;
            const helper = loadConsumptionHelper();
            const context = createAdapter({
                config: consumptionConfig(),
                states: consumptionStates(),
                onRead: async id => {
                    if (blockRead && id === 'consumption.offset_kwh') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            blockRead = true;
            const event = helper.handleStateChange('test.energy.total', { val: 105 });
            await entered.promise;
            helper.cleanup();
            gate.resolve();
            await event;
            expect(context.writes).to.have.length(0);
        });

        it('ignores events after cleanup', async () => {
            const helper = loadConsumptionHelper();
            const context = createAdapter({ config: consumptionConfig(), states: consumptionStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            helper.cleanup();
            const activity = context.reads.length + context.writes.length;
            await helper.handleStateChange('test.energy.total', { val: 105 });
            expect(context.reads.length + context.writes.length).to.equal(activity);
        });

        it('invalidates old baseline restoration across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadConsumptionHelper();
            const oldContext = createAdapter({
                config: consumptionConfig(),
                states: consumptionStates(),
                onRead: async id => {
                    if (id === 'consumption.total_kwh') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(oldContext.adapter);
            const oldInitialization = helper._initializationPromise;
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({
                config: consumptionConfig(),
                states: {
                    ...consumptionStates(),
                    'consumption.total_kwh': 200,
                    'costs.total_eur': 60,
                },
            });
            helper.init(newContext.adapter);
            const newInitialization = helper._initializationPromise;
            gate.resolve();
            await Promise.all([oldInitialization, newInitialization]);
            expect(helper.baseTotalKwh).to.equal(200);
            expect(helper.baseTotalEur).to.equal(60);
            expect(oldContext.clears).to.deep.equal([1, 2, 3, 4]);
        });

        it('keeps resetAll lifecycle-independent and writes the same zero set', async () => {
            const helper = loadConsumptionHelper();
            const context = createAdapter();
            await helper.resetAll(context.adapter);
            expect(context.writes.map(write => [write.id, write.state.val])).to.deep.equal([
                ['consumption.day_kwh', 0],
                ['consumption.week_kwh', 0],
                ['consumption.month_kwh', 0],
                ['consumption.year_kwh', 0],
                ['consumption.total_kwh', 0],
                ['consumption.offset_kwh', 0],
                ['consumption.last_total_kwh', 0],
                ['costs.day_eur', 0],
                ['costs.week_eur', 0],
                ['costs.month_eur', 0],
                ['costs.year_eur', 0],
                ['costs.total_eur', 0],
            ]);
            expect(helper._active).to.equal(false);
            expect(helper.baselines).to.deep.equal({});
        });
    });
});

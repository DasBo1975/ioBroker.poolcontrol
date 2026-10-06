'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const path = require('node:path');
const { expect } = require('chai');
const { I18n } = require('@iobroker/adapter-core');

const FROST_PATH = require.resolve('../../lib/helpers/frostHelper');
const LOGBOOK_PATH = require.resolve('../../lib/helpers/solarLogbookHelper');
const OWNER_ID = 'pump.active_helper';
const MODE_ID = 'pump.mode';
const PUMP_ID = 'pump.pump_switch';
const LOGBOOK_BASE = 'analytics.insights.solar.logbook';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setStateChangedAsync'} method Write method.
 * @property {string} id State ID.
 * @property {FakeState} state Written state.
 */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer ID.
 * @property {'interval' | 'timeout'} kind Timer kind.
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
 * @typedef {object} LoadedFrostHelper
 * @property {boolean} _active Lifecycle state.
 * @property {FakeTimer | null} checkTimer Active interval.
 * @property {(adapter: object) => void} init Initialize the helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle an event.
 * @property {() => Promise<void>} _checkFrost Run a frost evaluation.
 * @property {() => void} cleanup Stop the helper.
 */

/**
 * @typedef {object} LoadedLogbookHelper
 * @property {boolean} _active Lifecycle state.
 * @property {number} _lifecycleGeneration Lifecycle generation.
 * @property {FakeTimer | null} checkTimer Active check timeout.
 * @property {FakeTimer | null} resetTimer Active reset timeout.
 * @property {(adapter: object) => void} init Initialize the helper.
 * @property {(id: string, state: FakeState | null | undefined) => void} handleStateChange Handle an event.
 * @property {(generation?: number) => Promise<void>} _updateLogbook Update the logbook.
 * @property {() => void} cleanup Stop the helper.
 */

/**
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial states.
 * @property {(id: string) => void | Promise<void>} [onRead] Controlled read continuation.
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

/** @returns {LoadedFrostHelper} Fresh frost helper singleton. */
function loadFrost() {
    delete require.cache[FROST_PATH];
    return /** @type {LoadedFrostHelper} */ (require(FROST_PATH));
}

/** @returns {LoadedLogbookHelper} Fresh solar logbook helper singleton. */
function loadLogbook() {
    delete require.cache[LOGBOOK_PATH];
    return /** @type {LoadedLogbookHelper} */ (require(LOGBOOK_PATH));
}

/** @returns {Record<string, ioBroker.StateValue>} Normal frost state set. */
function frostStates() {
    return {
        [OWNER_ID]: '',
        [MODE_ID]: 'auto',
        [PUMP_ID]: false,
        'control.pump.maintenance_active': false,
        'pump.manual_safety_enabled': true,
        'pump.frost_protection_active': true,
        'pump.frost_protection_temp': 2,
        'temperature.outside.current': 1,
        'speech.frost_active': false,
        'status.season_active': true,
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Normal solar logbook state set. */
function logbookStates() {
    return {
        'analytics.insights.solar.results.solar_ran_today': true,
        'analytics.insights.solar.results.solar_effective_now': true,
        'analytics.insights.solar.results.collector_temp_used': 35,
        'analytics.insights.solar.results.pool_reference_temp_used': 25,
        'analytics.insights.solar.results.delta_t_used': 10,
        'analytics.insights.solar.results.outside_temp_used': 23,
        'analytics.insights.solar.results.flow_lh_used': 8000,
        'analytics.insights.solar.results.pump_power_w_used': 500,
        'analytics.insights.solar.results.estimated_thermal_power_w': 4200,
        'analytics.insights.solar.results.estimated_thermal_power_kw': 4.2,
        'analytics.insights.solar.results.estimated_efficiency_ratio': 8.4,
        'analytics.insights.solar.results.estimated_gain_today_wh': 3500,
        'analytics.insights.solar.results.estimated_gain_today_kwh': 3.5,
        'analytics.insights.solar.results.active_minutes_today': 45,
        'analytics.insights.solar.results.peak_power_today_w': 5000,
        'analytics.insights.solar.calculation.quality_level': 'good',
        'analytics.insights.solar.calculation.confidence_percent': 90,
        'analytics.insights.solar.calculation.weather_correction_active': true,
        'analytics.insights.solar.inputs.used_sensors_text': 'collector, pool',
        'ai.weather.outputs.daily_summary': 'Sunny and warm.',
        [`${LOGBOOK_BASE}.current_entry`]: '',
        [`${LOGBOOK_BASE}.current_entry_html`]: '',
        [`${LOGBOOK_BASE}.day_log_json`]: '[]',
        [`${LOGBOOK_BASE}.day_log_text`]: '',
        [`${LOGBOOK_BASE}.last_entry_time`]: '',
    };
}

/**
 * @param {AdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({ states = {}, onRead, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {Map<number, FakeTimer>} */
    const intervals = new Map();
    /** @type {Map<number, FakeTimer>} */
    const timeouts = new Map();
    /** @type {FakeTimer[]} */
    const timerCreations = [];
    let timerSequence = 0;

    /**
     * @param {FakeTimer['kind']} kind Timer kind.
     * @param {FakeTimer['callback']} callback Timer callback.
     * @param {number} delay Timer delay.
     * @returns {FakeTimer} Registered timer.
     */
    function addTimer(kind, callback, delay) {
        const timer = { id: ++timerSequence, kind, callback, delay };
        timerCreations.push(timer);
        (kind === 'interval' ? intervals : timeouts).set(timer.id, timer);
        return timer;
    }

    /**
     * @param {FakeWrite['method']} method Write method.
     * @param {string} id State ID.
     * @param {FakeState} state Written state.
     */
    async function recordWrite(method, id, state) {
        if (method === 'setStateChangedAsync' && stateStore.get(id) === state.val) {
            return;
        }
        const write = { method, id, state: { ...state } };
        writes.push(write);
        stateStore.set(id, state.val);
        await onWrite?.(write);
    }

    const adapter = {
        log: { debug: () => undefined, info: () => undefined, warn: () => undefined },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async subscribeStatesAsync(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateAsync(id, state) {
            await recordWrite('setStateAsync', id, state);
        },
        async setStateChangedAsync(id, state) {
            await recordWrite('setStateChangedAsync', id, state);
        },
        setInterval(callback, delay) {
            return addTimer('interval', callback, delay);
        },
        clearInterval(timer) {
            intervals.delete(timer.id);
        },
        setTimeout(callback, delay) {
            return addTimer('timeout', callback, delay);
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
        intervals,
        timeouts,
        timerCreations,
        set(id, value) {
            stateStore.set(id, value);
        },
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
    };
}

/** Wait for already-resolved async continuations without a real delay. */
async function flushAsync() {
    await new Promise(resolve => setImmediate(resolve));
}

/**
 * @param {ReturnType<typeof createAdapter>} env Fake adapter context.
 * @param {number} delay Timer delay to execute.
 */
async function runTimeout(env, delay) {
    const timer = [...env.timeouts.values()].find(candidate => candidate.delay === delay);
    expect(timer, `missing timeout with delay ${delay}`).to.exist;
    if (!timer) {
        throw new Error(`Missing timeout with delay ${delay}`);
    }
    env.timeouts.delete(timer.id);
    await timer.callback();
    await flushAsync();
}

describe('Lifecycle audit group 1', () => {
    before(async () => {
        await I18n.init(path.resolve(__dirname, '../../lib'), 'en');
    });

    it('ignores a frost event before init without writes or timers', async () => {
        const helper = loadFrost();
        await helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'auto', ack: true });
        expect(helper._active).to.equal(false);
    });

    it('ignores multiple frost events before init', async () => {
        const helper = loadFrost();
        await Promise.all([
            helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'auto', ack: true }),
            helper.handleStateChange('poolcontrol.0.status.season_active', { val: false, ack: true }),
            helper.handleStateChange('poolcontrol.0.pump.frost_protection_active', { val: true, ack: true }),
        ]);
    });

    it('keeps frost init subscriptions, interval and immediate evaluation', async () => {
        const helper = loadFrost();
        const env = createAdapter({ states: frostStates() });
        helper.init(env.adapter);
        await flushAsync();

        expect(env.subscriptions).to.deep.equal([
            'pump.frost_protection_active',
            'pump.mode',
            'pump.manual_safety_enabled',
            'control.pump.maintenance_active',
            'status.season_active',
        ]);
        expect([...env.intervals.values()].map(timer => timer.delay)).to.deep.equal([60000]);
        expect(env.stateStore.get(OWNER_ID)).to.equal('frostHelper');
        expect(env.stateStore.get(MODE_ID)).to.equal('frostHelper');
        expect(env.stateStore.get(PUMP_ID)).to.equal(true);
    });

    it('processes a normal frost recovery event after init', async () => {
        const helper = loadFrost();
        const env = createAdapter({ states: frostStates() });
        helper.init(env.adapter);
        await flushAsync();
        env.set('temperature.outside.current', 4);

        await helper.handleStateChange('poolcontrol.0.status.season_active', { val: true, ack: true });

        expect(env.stateStore.get(OWNER_ID)).to.equal('');
        expect(env.stateStore.get(MODE_ID)).to.equal('auto');
        expect(env.stateStore.get(PUMP_ID)).to.equal(false);
    });

    it('preserves the frost safety policy for season, off, maintenance and manual mode', async () => {
        const allowed = createAdapter({ states: { ...frostStates(), 'status.season_active': false } });
        const allowedHelper = loadFrost();
        allowedHelper.init(allowed.adapter);
        await flushAsync();
        expect(allowed.stateStore.get(PUMP_ID)).to.equal(true);

        /** @type {Array<Record<string, ioBroker.StateValue>>} */
        const blockedScenarios = [
            { [MODE_ID]: 'off' },
            { 'control.pump.maintenance_active': true },
            { [MODE_ID]: 'manual', 'pump.manual_safety_enabled': false },
        ];

        for (const overrides of blockedScenarios) {
            const env = createAdapter({ states: { ...frostStates(), ...overrides } });
            const helper = loadFrost();
            helper.init(env.adapter);
            await flushAsync();
            expect(env.stateStore.get(PUMP_ID)).to.equal(false);
        }
    });

    it('clears the frost interval during cleanup', async () => {
        const helper = loadFrost();
        const env = createAdapter({ states: { ...frostStates(), 'pump.frost_protection_active': false } });
        helper.init(env.adapter);
        await flushAsync();
        helper.cleanup();
        expect(env.intervals).to.be.empty;
        expect(helper.checkTimer).to.equal(null);
    });

    it('ignores frost events after cleanup', async () => {
        const helper = loadFrost();
        const env = createAdapter({ states: { ...frostStates(), 'pump.frost_protection_active': false } });
        helper.init(env.adapter);
        await flushAsync();
        helper.cleanup();
        const writesBefore = env.writes.length;
        const timersBefore = env.timerCreations.length;
        await helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'auto', ack: true });
        expect(env.writes).to.have.length(writesBefore);
        expect(env.timerCreations).to.have.length(timersBefore);
    });

    it('stops an in-flight frost evaluation after cleanup before actuator writes', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            states: frostStates(),
            onRead: async id => {
                if (!blocked && id === OWNER_ID) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadFrost();
        helper.init(env.adapter);
        await flushAsync();
        helper.cleanup();
        gate.resolve(undefined);
        await flushAsync();
        expect(env.writes).to.be.empty;
    });

    it('does not run a queued frost interval callback after cleanup', async () => {
        const helper = loadFrost();
        const env = createAdapter({ states: { ...frostStates(), 'pump.frost_protection_active': false } });
        helper.init(env.adapter);
        await flushAsync();
        const callback = [...env.intervals.values()][0].callback;
        helper.cleanup();
        const writesBefore = env.writes.length;
        await callback();
        expect(env.writes).to.have.length(writesBefore);
        expect(env.timerCreations).to.have.length(1);
    });

    it('never replaces foreign frost ownership', async () => {
        const helper = loadFrost();
        const env = createAdapter({ states: { ...frostStates(), [OWNER_ID]: 'heatHelper' } });
        helper.init(env.adapter);
        await flushAsync();
        expect(env.stateStore.get(OWNER_ID)).to.equal('heatHelper');
        expect(env.stateStore.get(PUMP_ID)).to.equal(false);
    });

    it('ignores a solar logbook event before init', () => {
        const helper = loadLogbook();
        expect(() =>
            helper.handleStateChange('poolcontrol.0.analytics.insights.solar.results.solar_ran_today', {
                val: true,
                ack: true,
            }),
        ).not.to.throw();
    });

    it('ignores multiple solar logbook events before init', () => {
        const helper = loadLogbook();
        helper.handleStateChange('poolcontrol.0.analytics.insights.solar.results.solar_ran_today', {
            val: true,
            ack: true,
        });
        helper.handleStateChange('poolcontrol.0.ai.weather.outputs.daily_summary', { val: 'Sunny', ack: true });
        expect(helper._active).to.equal(false);
    });

    it('performs the complete initial solar logbook update', async () => {
        const helper = loadLogbook();
        const env = createAdapter({ states: logbookStates() });
        helper.init(env.adapter);
        await flushAsync();
        await runTimeout(env, 0);

        expect(env.subscriptions).to.have.length(21);
        expect(env.writesFor(`${LOGBOOK_BASE}.current_entry`).at(-1)?.state.val).to.include('4.20 kW');
        expect(JSON.parse(String(env.stateStore.get(`${LOGBOOK_BASE}.day_log_json`)))).to.have.length(1);
    });

    it('processes a normal solar logbook event through the debounce timer', async () => {
        const helper = loadLogbook();
        const env = createAdapter({ states: logbookStates() });
        helper.init(env.adapter);
        await flushAsync();
        await runTimeout(env, 0);
        env.set('analytics.insights.solar.results.solar_effective_now', false);
        helper.handleStateChange('poolcontrol.0.analytics.insights.solar.results.solar_effective_now', {
            val: false,
            ack: true,
        });
        await runTimeout(env, 250);
        expect(env.stateStore.get(`${LOGBOOK_BASE}.current_entry`)).to.include('not actively contributing');
    });

    it('clears both solar logbook timers during cleanup', async () => {
        const helper = loadLogbook();
        const env = createAdapter({ states: logbookStates() });
        helper.init(env.adapter);
        await flushAsync();
        helper.cleanup();
        expect(env.timeouts).to.be.empty;
        expect(helper.checkTimer).to.equal(null);
        expect(helper.resetTimer).to.equal(null);
    });

    it('ignores solar logbook events after cleanup', async () => {
        const helper = loadLogbook();
        const env = createAdapter({ states: logbookStates() });
        helper.init(env.adapter);
        await flushAsync();
        helper.cleanup();
        const timersBefore = env.timerCreations.length;
        helper.handleStateChange('poolcontrol.0.analytics.insights.solar.results.solar_ran_today', {
            val: true,
            ack: true,
        });
        expect(env.timerCreations).to.have.length(timersBefore);
    });

    it('stops an in-flight solar logbook update after cleanup before writes', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            states: logbookStates(),
            onRead: async () => {
                if (!blocked) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadLogbook();
        helper.init(env.adapter);
        const update = helper._updateLogbook(helper._lifecycleGeneration);
        await flushAsync();
        helper.cleanup();
        gate.resolve(undefined);
        await update;
        expect(env.writes).to.be.empty;
    });

    it('does not reschedule a queued solar daily reset after cleanup', async () => {
        const helper = loadLogbook();
        const env = createAdapter({ states: logbookStates() });
        helper.init(env.adapter);
        await flushAsync();
        const reset = [...env.timeouts.values()].find(timer => timer.delay > 1000);
        expect(reset).to.exist;
        if (!reset) {
            throw new Error('Missing daily reset timeout');
        }
        helper.cleanup();
        const creationsBefore = env.timerCreations.length;
        await reset.callback();
        expect(env.timerCreations).to.have.length(creationsBefore);
        expect(env.writes).to.be.empty;
    });

    it('compensates a discarded pre-init logbook event with the persisted initial state', async () => {
        const helper = loadLogbook();
        helper.handleStateChange('poolcontrol.0.analytics.insights.solar.results.solar_effective_now', {
            val: true,
            ack: true,
        });
        const env = createAdapter({ states: logbookStates() });
        helper.init(env.adapter);
        await flushAsync();
        await runTimeout(env, 0);
        expect(env.stateStore.get(`${LOGBOOK_BASE}.current_entry`)).to.include('working effectively');
        expect(JSON.parse(String(env.stateStore.get(`${LOGBOOK_BASE}.day_log_json`)))).to.have.length(1);
    });
});

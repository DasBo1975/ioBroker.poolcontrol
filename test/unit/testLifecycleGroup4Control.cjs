'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const CONTROL_PATH = require.resolve('../../lib/helpers/controlHelper');
const BACKWASH_ID = 'poolcontrol.0.control.pump.backwash_start';
const ENERGY_RESET_ID = 'poolcontrol.0.control.energy.reset';
const MAINTENANCE_ID = 'poolcontrol.0.control.pump.maintenance_active';
const SEASON_ID = 'poolcontrol.0.control.season.active';

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
 * @typedef {object} LoadedControlHelper
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

/** @returns {LoadedControlHelper} Fresh control helper singleton. */
function loadControl() {
    delete require.cache[CONTROL_PATH];
    return /** @type {LoadedControlHelper} */ (require(CONTROL_PATH));
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
    const timeouts = new Map();
    /** @type {Map<number, FakeTimer>} */
    const intervals = new Map();
    /** @type {FakeTimer[]} */
    const timerCreations = [];
    let timerSequence = 0;

    /**
     * @param {'timeout' | 'interval'} kind Timer kind.
     * @param {() => unknown} callback Timer callback.
     * @param {number} delay Timer delay.
     * @returns {FakeTimer} Registered timer.
     */
    function addTimer(kind, callback, delay) {
        const timer = { id: ++timerSequence, callback, delay };
        (kind === 'timeout' ? timeouts : intervals).set(timer.id, timer);
        timerCreations.push(timer);
        return timer;
    }

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
            return addTimer('timeout', callback, delay);
        },
        clearTimeout(timer) {
            timeouts.delete(timer.id);
        },
        setInterval(callback, delay) {
            return addTimer('interval', callback, delay);
        },
        clearInterval(timer) {
            intervals.delete(timer.id);
        },
    };

    return {
        adapter,
        stateStore,
        writes,
        reads,
        subscriptions,
        timeouts,
        intervals,
        timerCreations,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Normal control state set. */
function controlStates() {
    return {
        'control.circulation.check_time': '18:00',
        'control.pump.maintenance_restore_mode': '',
        'control.pump.maintenance_active': false,
        'control.pump.notifications_enabled': true,
        'control.pump.backwash_duration': 2,
        'control.pump.backwash_active': false,
        'pump.mode': 'auto',
        'pump.active_helper': '',
        'pump.pump_switch': false,
        'status.season_active': true,
        'control.circulation.mode': 'auto',
        'solar.solar_control_active': false,
        'circulation.daily_total': 800,
        'circulation.daily_required': 1000,
        'temperature.collector.current': 30,
        'temperature.surface.current': 25,
    };
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

describe('controlHelper lifecycle regression', () => {
    it('ignores a foreign event before init safely', async () => {
        const helper = loadControl();
        await helper.handleStateChange('poolcontrol.0.control.unknown', { val: true, ack: false });
    });

    it('uses the init read for a normal check-time state', async () => {
        const helper = loadControl();
        await helper.handleStateChange('poolcontrol.0.control.circulation.check_time', {
            val: '09:30',
            ack: false,
        });
        const env = createAdapter({ states: { ...controlStates(), 'control.circulation.check_time': '09:30' } });
        helper.init(env.adapter);
        await settle();
        expect(env.reads[0]).to.equal('control.circulation.check_time');
        expect(env.timeouts.size).to.equal(1);
    });

    it('processes a pre-init command exactly once', async () => {
        const helper = loadControl();
        await helper.handleStateChange(BACKWASH_ID, { val: true, ack: false });
        const env = createAdapter({ states: controlStates() });
        helper.init(env.adapter);
        await settle();
        expect(env.writesFor('control.pump.backwash_start')).to.have.length(1);
        expect(env.writesFor('control.pump.backwash_active')).to.have.length(1);
    });

    it('replays multiple observed events in FIFO order', async () => {
        const helper = loadControl();
        await helper.handleStateChange(SEASON_ID, { val: false, ack: false });
        await helper.handleStateChange(ENERGY_RESET_ID, { val: true, ack: false });
        await helper.handleStateChange(SEASON_ID, { val: true, ack: false });
        const env = createAdapter({ states: controlStates() });
        helper.init(env.adapter);
        await settle();
        const order = env.writes
            .filter(write => write.id === 'status.season_active' || write.id === 'control.energy.reset')
            .map(write => [write.id, write.state.val]);
        expect(order).to.deep.equal([
            ['status.season_active', false],
            ['control.energy.reset', false],
            ['status.season_active', true],
        ]);
    });

    it('processes a command observed during async init exactly once', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            states: controlStates(),
            onRead: async id => {
                if (id === 'control.circulation.check_time' && !blocked) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadControl();
        helper.init(env.adapter);
        let completed = false;
        const handling = helper.handleStateChange(ENERGY_RESET_ID, { val: true, ack: false }).then(() => {
            completed = true;
        });
        await settle();
        expect(completed).to.equal(false);
        gate.resolve(undefined);
        await handling;
        expect(env.writesFor('control.energy.reset')).to.have.length(1);
    });

    it('completes an in-init maintenance event only after the ownership takeover', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            states: {
                ...controlStates(),
                'pump.mode': 'manual',
                'pump.pump_switch': true,
                'control.pump.maintenance_active': true,
            },
            onRead: async id => {
                if (id === 'control.circulation.check_time' && !blocked) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadControl();
        helper.init(env.adapter);
        let completed = false;
        const handling = helper.handleStateChange(MAINTENANCE_ID, { val: true, ack: false }).then(() => {
            completed = true;
        });
        await settle();
        expect(completed).to.equal(false);

        gate.resolve(undefined);
        await handling;
        expect(env.stateStore.get('pump.mode')).to.equal('controlHelper');
        expect(env.stateStore.get('pump.active_helper')).to.equal('controlHelper');
        expect(env.stateStore.get('control.pump.maintenance_restore_mode')).to.equal('manual');
        expect(env.stateStore.get('control.pump.maintenance_active')).to.equal(true);
        expect(env.writesFor('pump.mode')).to.have.length(1);
        expect(env.writesFor('pump.active_helper')).to.have.length(1);
        expect(env.writesFor('control.pump.maintenance_restore_mode')).to.have.length(1);

        const writeCount = env.writes.length;
        await settle();
        expect(env.writes).to.have.length(writeCount);
    });

    it('resolves a queued completion during cleanup without processing the event', async () => {
        const gate = createDeferred();
        let blocked = false;
        const env = createAdapter({
            states: {
                ...controlStates(),
                'pump.mode': 'manual',
                'pump.pump_switch': true,
                'control.pump.maintenance_active': true,
            },
            onRead: async id => {
                if (id === 'control.circulation.check_time' && !blocked) {
                    blocked = true;
                    await gate.promise;
                }
            },
        });
        const helper = loadControl();
        helper.init(env.adapter);
        const handling = helper.handleStateChange(MAINTENANCE_ID, { val: true, ack: false });
        await settle();

        helper.cleanup();
        await handling;
        const writeCount = env.writes.length;
        const timerCount = env.timerCreations.length;
        gate.resolve(undefined);
        await settle();

        expect(env.writes).to.have.length(writeCount);
        expect(env.timerCreations).to.have.length(timerCount);
        expect(env.stateStore.get('pump.mode')).to.equal('manual');
        expect(env.stateStore.get('pump.active_helper')).to.equal('');
        expect(env.stateStore.get('pump.pump_switch')).to.equal(true);
    });

    it('does not duplicate a replayed command after init', async () => {
        const helper = loadControl();
        await helper.handleStateChange(ENERGY_RESET_ID, { val: true, ack: false });
        const env = createAdapter({ states: controlStates() });
        helper.init(env.adapter);
        await settle();
        await settle();
        expect(env.writesFor('control.energy.reset')).to.have.length(1);
    });

    it('does not reinterpret persisted true command states', async () => {
        const env = createAdapter({
            states: {
                ...controlStates(),
                'control.pump.backwash_start': true,
                'control.energy.reset': true,
            },
        });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        expect(env.writesFor('control.pump.backwash_start')).to.have.length(0);
        expect(env.writesFor('control.energy.reset')).to.have.length(0);
    });

    it('preserves the normal season path', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(SEASON_ID, { val: false, ack: false });
        expect(env.writesFor('status.season_active')[0]?.state).to.deep.equal({ val: false, ack: true });
    });

    it('preserves normal maintenance activation', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(MAINTENANCE_ID, { val: true, ack: false });
        expect(env.writes.map(write => write.id).slice(-6)).to.deep.equal([
            'control.pump.maintenance_restore_mode',
            'pump.mode',
            'pump.reason',
            'pump.active_helper',
            'pump.pump_switch',
            'speech.queue',
        ]);
    });

    it('preserves normal maintenance deactivation', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(MAINTENANCE_ID, { val: true, ack: false });
        await helper.handleStateChange(MAINTENANCE_ID, { val: false, ack: false });
        expect(env.writes.map(write => write.id).slice(-5)).to.deep.equal([
            'pump.mode',
            'pump.active_helper',
            'pump.reason',
            'control.pump.maintenance_restore_mode',
            'speech.queue',
        ]);
    });

    it('preserves maintenance restore after restart', async () => {
        const env = createAdapter({
            states: {
                ...controlStates(),
                'control.pump.maintenance_restore_mode': 'auto_pv',
                'pump.mode': 'controlHelper',
                'pump.active_helper': 'controlHelper',
            },
        });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        expect(env.writes.map(write => [write.id, write.state.val])).to.deep.equal([
            ['pump.mode', 'auto_pv'],
            ['pump.active_helper', ''],
            ['pump.reason', ''],
            ['control.pump.maintenance_restore_mode', ''],
        ]);
    });

    it('preserves backwash and energy reset command acknowledgements', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(BACKWASH_ID, { val: true, ack: false });
        await helper.handleStateChange(ENERGY_RESET_ID, { val: true, ack: false });
        expect(env.writesFor('control.pump.backwash_start')[0]?.state).to.deep.equal({ val: false, ack: true });
        expect(env.writesFor('control.energy.reset')[0]?.state).to.deep.equal({ val: false, ack: true });
    });

    it('preserves the normal daily circulation and auto-pumping path', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        const dailyTimer = [...env.timeouts.values()][0];
        expect(dailyTimer).to.exist;
        if (!dailyTimer) {
            throw new Error('Missing daily timer');
        }
        env.timeouts.delete(dailyTimer.id);
        await dailyTimer.callback();
        expect(env.writesFor('control.circulation.last_report')).to.have.length(1);
        expect(env.writesFor('pump.pump_switch')[0]?.state.val).to.equal(true);
        expect(env.intervals.size).to.equal(1);
    });

    it('preserves normal control ownership writes', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(BACKWASH_ID, { val: true, ack: false });
        expect(env.writesFor('pump.mode')[0]?.state.val).to.equal('controlHelper');
        expect(env.writesFor('pump.active_helper')[0]?.state.val).to.equal('controlHelper');
        expect(env.writesFor('pump.reason')[0]?.state.val).to.equal('rückspülen');
    });

    it('protects foreign ownership from an invalidated backwash timer', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(BACKWASH_ID, { val: true, ack: false });
        const backwashTimer = [...env.timeouts.values()].find(timer => timer.delay === 120000);
        expect(backwashTimer).to.exist;
        if (!backwashTimer) {
            throw new Error('Missing backwash timer');
        }
        helper.cleanup();
        env.stateStore.set('pump.active_helper', 'foreignHelper');
        const writeCount = env.writes.length;
        await backwashTimer.callback();
        expect(env.writes).to.have.length(writeCount);
        expect(env.stateStore.get('pump.active_helper')).to.equal('foreignHelper');
    });

    it('clears all active helper timers during cleanup', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        await helper.handleStateChange(BACKWASH_ID, { val: true, ack: false });
        expect(env.timeouts.size).to.equal(2);
        helper.cleanup();
        expect(env.timeouts.size).to.equal(0);
        expect(env.intervals.size).to.equal(0);
    });

    it('ignores events after cleanup', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        helper.cleanup();
        const readCount = env.reads.length;
        const writeCount = env.writes.length;
        const timerCount = env.timerCreations.length;
        await helper.handleStateChange(BACKWASH_ID, { val: true, ack: false });
        expect(env.reads).to.have.length(readCount);
        expect(env.writes).to.have.length(writeCount);
        expect(env.timerCreations).to.have.length(timerCount);
    });

    it('does not run an old daily timer after cleanup', async () => {
        const env = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        const dailyTimer = [...env.timeouts.values()][0];
        expect(dailyTimer).to.exist;
        if (!dailyTimer) {
            throw new Error('Missing daily timer');
        }
        helper.cleanup();
        const readCount = env.reads.length;
        await dailyTimer.callback();
        expect(env.reads).to.have.length(readCount);
        expect(env.timerCreations).to.have.length(1);
    });

    it('stops an in-flight maintenance event before actuator writes after cleanup', async () => {
        const gate = createDeferred();
        let blockNotificationRead = false;
        const env = createAdapter({
            states: controlStates(),
            onRead: async id => {
                if (id === 'control.pump.notifications_enabled' && blockNotificationRead) {
                    await gate.promise;
                }
            },
        });
        const helper = loadControl();
        helper.init(env.adapter);
        await settle();
        blockNotificationRead = true;
        const handling = helper.handleStateChange(MAINTENANCE_ID, { val: true, ack: false });
        await settle();
        helper.cleanup();
        gate.resolve(undefined);
        await handling;
        expect(env.writesFor('pump.mode')).to.have.length(0);
        expect(env.writesFor('pump.active_helper')).to.have.length(0);
        expect(env.writesFor('pump.pump_switch')).to.have.length(0);
    });

    it('keeps an old generation from affecting a re-init', async () => {
        const first = createAdapter({ states: controlStates() });
        const helper = loadControl();
        helper.init(first.adapter);
        await settle();
        const oldTimer = [...first.timeouts.values()][0];
        expect(oldTimer).to.exist;
        if (!oldTimer) {
            throw new Error('Missing old daily timer');
        }
        helper.cleanup();

        const second = createAdapter({ states: controlStates() });
        helper.init(second.adapter);
        await settle();
        const secondReadCount = second.reads.length;
        const secondTimerCount = second.timerCreations.length;
        await oldTimer.callback();
        expect(second.reads).to.have.length(secondReadCount);
        expect(second.timerCreations).to.have.length(secondTimerCount);
        expect(second.timeouts.size).to.equal(1);
    });
});

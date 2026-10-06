'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const RUNTIME_HELPER_PATH = require.resolve('../../lib/helpers/runtimeHelper');

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Acknowledgement flag.
 * @property {number} [ts] State timestamp.
 */

/**
 * @typedef {object} FakeWrite
 * @property {string} id State id.
 * @property {FakeState} state Written state.
 */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer id.
 * @property {() => void | Promise<void>} callback Timer callback.
 * @property {number} delay Timer delay.
 */

function loadRuntimeHelper() {
    delete require.cache[RUNTIME_HELPER_PATH];
    return require(RUNTIME_HELPER_PATH);
}

/**
 * @param {string} iso Fixed timestamp.
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
        get timestamp() {
            return fixedTimestamp;
        },
        restore() {
            global.Date = RealDate;
        },
    };
}

/**
 * @param {Record<string, ioBroker.StateValue | FakeState>} [initialStates] Initial states.
 */
function createAdapter(initialStates = {}) {
    /** @type {Map<string, FakeState>} */
    const stateStore = new Map();
    for (const [id, value] of Object.entries(initialStates)) {
        if (value && typeof value === 'object' && 'val' in value) {
            stateStore.set(id, /** @type {FakeState} */ ({ ...value }));
        } else {
            stateStore.set(id, { val: /** @type {ioBroker.StateValue} */ (value), ts: Date.now(), ack: true });
        }
    }

    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {FakeTimer[]} */
    const timers = [];
    /** @type {string[]} */
    const warnings = [];
    let nextTimerId = 1;

    const adapter = {
        config: {
            min_circulation_per_day: 1,
        },
        log: {
            debug: () => undefined,
            info: () => undefined,
            warn: message => warnings.push(String(message)),
            error: message => warnings.push(String(message)),
        },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            const state = stateStore.get(id);
            return state ? { ...state } : null;
        },
        async setStateAsync(id, state) {
            const stored = { ...state, ts: Date.now() };
            writes.push({ id, state: stored });
            stateStore.set(id, stored);
        },
        async setStateChangedAsync(id, state) {
            const stored = { ...state, ts: Date.now() };
            writes.push({ id, state: stored });
            stateStore.set(id, stored);
        },
        setTimeout(callback, delay) {
            const timer = { id: nextTimerId++, callback, delay };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            const index = timers.findIndex(entry => entry.id === timer.id);
            if (index >= 0) {
                timers.splice(index, 1);
            }
        },
        setInterval(callback, delay) {
            const timer = { id: nextTimerId++, callback, delay };
            timers.push(timer);
            return timer;
        },
        clearInterval(timer) {
            const index = timers.findIndex(entry => entry.id === timer.id);
            if (index >= 0) {
                timers.splice(index, 1);
            }
        },
    };

    return { adapter, stateStore, writes, reads, subscriptions, timers, warnings };
}

/**
 * @param {Record<string, ioBroker.StateValue | FakeState>} [overrides] State overrides.
 */
function runtimeStates(overrides = {}) {
    return {
        'runtime.total_seconds': 0,
        'runtime.today_seconds': 0,
        'runtime.season_total_seconds': 0,
        'runtime.total': '0h 0m 0s',
        'runtime.today': '0h 0m 0s',
        'runtime.season_total': '0h 0m 0s',
        'runtime.start_count_today': 0,
        'pump.pump_switch': true,
        'pump.live.flow_current_lh': 4000,
        'pump.pump_power_lph': 6000,
        'status.season_active': true,
        'status.season_active_current': true,
        'general.pool_size': 10000,
        'general.min_circulation_per_day': 1,
        'control.circulation.temperature_factor.enabled': false,
        'circulation.daily_total': 0,
        'circulation.daily_required': 10000,
        'circulation.daily_remaining': 10000,
        ...overrides,
    };
}

function writeValues(context, id) {
    return context.writes.filter(write => write.id === id).map(write => write.state.val);
}

function lastStateValue(context, id) {
    return context.stateStore.get(id)?.val;
}

function createRunningHelper(context, startIso, flowLh = 4000, total = 0) {
    const helper = loadRuntimeHelper();
    helper._adapter = context.adapter;
    helper.isRunning = true;
    helper.lastOn = Date.now();
    helper.runtimeToday = 0;
    helper.runtimeTotal = 0;
    helper.runtimeSeason = 0;
    helper.startCountToday = 0;
    helper.circulationDailyTotal = total;
    helper.previousFlowLh = flowLh;
    helper.previousTimestamp = new Date(startIso).getTime();
    context.stateStore.set('pump.live.flow_current_lh', { val: flowLh, ts: Date.now(), ack: true });
    return helper;
}

describe('runtimeHelper circulation daily_total integration', () => {
    it('keeps constant-flow calculation equivalent to the old formula', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = createRunningHelper(context, '2026-10-05T09:00:00+02:00', 5000);

            clock.set('2026-10-05T09:30:00+02:00');
            await helper._updateStates();

            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(2500);
            expect(lastStateValue(context, 'circulation.daily_remaining')).to.equal(7500);
        } finally {
            clock.restore();
        }
    });

    it('uses the previous flow for a rising flow interval', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = createRunningHelper(context, '2026-10-05T09:00:00+02:00', 4000);

            clock.set('2026-10-05T10:00:00+02:00');
            context.stateStore.set('pump.live.flow_current_lh', { val: 5000, ts: Date.now(), ack: true });
            await helper._updateStates();

            clock.set('2026-10-05T11:00:00+02:00');
            await helper._updateStates();

            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(9000);
        } finally {
            clock.restore();
        }
    });

    it('uses the previous flow for a sinking flow interval', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates({ 'pump.live.flow_current_lh': 5000 }));
            const helper = createRunningHelper(context, '2026-10-05T09:00:00+02:00', 5000);

            clock.set('2026-10-05T10:00:00+02:00');
            context.stateStore.set('pump.live.flow_current_lh', { val: 4000, ts: Date.now(), ack: true });
            await helper._updateStates();

            clock.set('2026-10-05T11:00:00+02:00');
            await helper._updateStates();

            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(9000);
        } finally {
            clock.restore();
        }
    });

    it('handles multiple flow changes without retrospectively revaluing the day', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = createRunningHelper(context, '2026-10-05T09:00:00+02:00', 3000);

            clock.set('2026-10-05T09:30:00+02:00');
            context.stateStore.set('pump.live.flow_current_lh', { val: 6000, ts: Date.now(), ack: true });
            await helper._updateStates();

            clock.set('2026-10-05T10:00:00+02:00');
            context.stateStore.set('pump.live.flow_current_lh', { val: 4500, ts: Date.now(), ack: true });
            await helper._updateStates();

            clock.set('2026-10-05T10:20:00+02:00');
            await helper._updateStates();

            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(6000);
        } finally {
            clock.restore();
        }
    });

    it('starts integration on pump-on without reconstructing earlier time', async () => {
        const clock = installFakeDate('2026-10-05T12:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates({ 'pump.pump_switch': false }));
            const helper = loadRuntimeHelper();
            helper._adapter = context.adapter;

            await helper.handleStateChange('pump.pump_switch', { val: true, ack: true });
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(0);

            clock.set('2026-10-05T12:10:00+02:00');
            await helper._updateStates();
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(667);
        } finally {
            clock.restore();
        }
    });

    it('closes the last interval on pump-off and does not grow while off', async () => {
        const clock = installFakeDate('2026-10-05T13:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = createRunningHelper(context, '2026-10-05T13:00:00+02:00', 3600);

            clock.set('2026-10-05T13:10:00+02:00');
            await helper.handleStateChange('pump.pump_switch', { val: false, ack: true });
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(600);

            clock.set('2026-10-05T13:40:00+02:00');
            await helper._updateStates();
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(600);
        } finally {
            clock.restore();
        }
    });

    it('keeps a same-day restart value and does not fill downtime', async () => {
        const clock = installFakeDate('2026-10-05T16:00:00+02:00');
        try {
            const todayTs = new Date('2026-10-05T15:55:00+02:00').getTime();
            const context = createAdapter(
                runtimeStates({
                    'runtime.today_seconds': 7200,
                    'circulation.daily_total': { val: 18000, ts: todayTs, ack: true },
                }),
            );
            const helper = loadRuntimeHelper();
            helper._adapter = context.adapter;

            await helper._restoreFromStates();
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(18000);
            expect(writeValues(context, 'circulation.daily_total')).to.deep.equal([]);

            clock.set('2026-10-05T17:00:00+02:00');
            await helper._updateStates();
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(22000);
        } finally {
            clock.restore();
        }
    });

    it('uses the same transition rule for an upgrade-day value', async () => {
        const clock = installFakeDate('2026-10-05T16:00:00+02:00');
        try {
            const context = createAdapter(
                runtimeStates({
                    'runtime.today_seconds': 7200,
                    'circulation.daily_total': {
                        val: 18000,
                        ts: new Date('2026-10-05T15:59:00+02:00').getTime(),
                        ack: true,
                    },
                }),
            );
            const helper = loadRuntimeHelper();
            helper._adapter = context.adapter;

            await helper._restoreFromStates();
            clock.set('2026-10-05T16:30:00+02:00');
            await helper._updateStates();

            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(20000);
        } finally {
            clock.restore();
        }
    });

    it('starts at zero when the persisted total belongs to a previous local day', async () => {
        const clock = installFakeDate('2026-10-06T00:10:00+02:00');
        try {
            const context = createAdapter(
                runtimeStates({
                    'circulation.daily_total': {
                        val: 18000,
                        ts: new Date('2026-10-05T23:50:00+02:00').getTime(),
                        ack: true,
                    },
                }),
            );
            const helper = loadRuntimeHelper();
            helper._adapter = context.adapter;

            await helper._restoreFromStates();
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(0);

            clock.set('2026-10-06T00:20:00+02:00');
            await helper._updateStates();
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(667);
        } finally {
            clock.restore();
        }
    });

    it('reads daily_total with ts before any restore write to daily_total', async () => {
        const clock = installFakeDate('2026-10-06T00:10:00+02:00');
        try {
            const context = createAdapter(
                runtimeStates({
                    'circulation.daily_total': {
                        val: 18000,
                        ts: new Date('2026-10-05T23:50:00+02:00').getTime(),
                        ack: true,
                    },
                }),
            );
            const helper = loadRuntimeHelper();
            helper._adapter = context.adapter;

            await helper._restoreFromStates();

            const readIndex = context.reads.indexOf('circulation.daily_total');
            const writeIndex = context.writes.findIndex(write => write.id === 'circulation.daily_total');
            expect(readIndex).to.be.at.least(0);
            expect(writeIndex).to.be.at.least(0);
            expect(readIndex).to.be.lessThan(writeIndex);
        } finally {
            clock.restore();
        }
    });

    it('splits a running pump at local midnight', async () => {
        const clock = installFakeDate('2026-10-05T23:50:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = createRunningHelper(context, '2026-10-05T23:50:00+02:00', 4000, 1000);

            helper._scheduleDailyReset();
            expect(context.timers).to.have.length(1);

            clock.set('2026-10-06T00:10:00+02:00');
            await context.timers[0].callback();

            expect(writeValues(context, 'circulation.daily_total')).to.include(0);
            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(667);
            expect(helper.previousTimestamp).to.equal(new Date('2026-10-06T00:10:00+02:00').getTime());
        } finally {
            clock.restore();
        }
    });

    it('keeps sub-liter intervals in the internal accumulator to avoid rounding drift', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates({ 'pump.live.flow_current_lh': 360 }));
            const helper = createRunningHelper(context, '2026-10-05T09:00:00+02:00', 360);

            for (let second = 1; second <= 10; second++) {
                clock.set(`2026-10-05T09:00:${String(second).padStart(2, '0')}+02:00`);
                await helper._updateStates();
            }

            expect(lastStateValue(context, 'circulation.daily_total')).to.equal(1);
            expect(helper.circulationDailyTotal).to.be.closeTo(1, 0.000001);
        } finally {
            clock.restore();
        }
    });

    it('does not create a plausibility warning for normal variable flow', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = createRunningHelper(context, '2026-10-05T09:00:00+02:00', 4000);

            clock.set('2026-10-05T09:10:00+02:00');
            context.stateStore.set('pump.live.flow_current_lh', { val: 4500, ts: Date.now(), ack: true });
            await helper._updateStates();

            expect(lastStateValue(context, 'circulation.plausibility.30_jump_warning')).to.equal(false);
            expect(context.warnings).to.deep.equal([]);
        } finally {
            clock.restore();
        }
    });

    it('still detects an actual implausible daily_total jump', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates({ 'pump.pump_power_lph': 4000 }));
            const helper = loadRuntimeHelper();
            helper._adapter = context.adapter;
            helper.lastPlausibilityDailyTotal = 0;
            helper.lastPlausibilityCheckTs = Date.now();

            clock.set('2026-10-05T09:00:10+02:00');
            await helper._updateCirculationPlausibility({
                dailyTotal: 10000,
                oldTotal: 0,
                liveFlowLh: 4000,
                dailyRequired: 10000,
                effectiveToday: 10,
                currentSessionSeconds: 10,
            });

            expect(lastStateValue(context, 'circulation.plausibility.30_jump_warning')).to.equal(true);
        } finally {
            clock.restore();
        }
    });

    it('subscribes to live flow changes without adding new states', async () => {
        const clock = installFakeDate('2026-10-05T09:00:00+02:00');
        try {
            const context = createAdapter(runtimeStates());
            const helper = loadRuntimeHelper();

            const initPromise = helper.init(context.adapter);
            expect(context.timers).to.have.length(1);
            await context.timers[0].callback();
            await initPromise;

            expect(context.subscriptions).to.include('pump.live.flow_current_lh');
        } finally {
            clock.restore();
        }
    });
});

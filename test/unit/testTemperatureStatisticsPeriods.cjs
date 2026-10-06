'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const TODAY_PATH = require.resolve('../../lib/helpers/statisticsHelper');
const WEEK_PATH = require.resolve('../../lib/helpers/statisticsHelperWeek');
const MONTH_PATH = require.resolve('../../lib/helpers/statisticsHelperMonth');
const TEMPERATURE_PATH = require.resolve('../../lib/helpers/temperatureHelper');

const SENSORS = ['outside', 'ground', 'surface', 'flow', 'return', 'collector'];

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Acknowledgement flag.
 * @property {number} [ts] Source timestamp.
 */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer id.
 * @property {() => void | Promise<void>} callback Timer callback.
 * @property {number} delay Timer delay.
 */

function loadFresh(path) {
    delete require.cache[path];
    return require(path);
}

/**
 * @param {Record<string, ioBroker.StateValue>} [states] Initial states.
 * @param {Record<string, ioBroker.StateValue>} [config] Adapter config.
 */
function createAdapter(states = {}, config = {}) {
    const stateStore = new Map(Object.entries(states));
    const objects = new Set();
    const writes = [];
    const subscriptions = [];
    const listeners = [];
    /** @type {FakeTimer[]} */
    const timers = [];
    let nextTimerId = 1;

    const adapter = {
        config,
        log: {
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        async setObjectNotExistsAsync(id) {
            objects.add(id);
        },
        async getObjectAsync(id) {
            return objects.has(id) ? { _id: id } : null;
        },
        async getStateAsync(id) {
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateAsync(id, state) {
            const stored = { ...state };
            writes.push({ id, state: stored });
            stateStore.set(id, stored.val);
        },
        async setStateChangedAsync(id, state) {
            const stored = { ...state };
            writes.push({ id, state: stored });
            stateStore.set(id, stored.val);
        },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        subscribeForeignStates(id) {
            subscriptions.push(`foreign:${id}`);
        },
        async getForeignStateAsync(id) {
            return stateStore.has(`foreign:${id}`) ? { val: stateStore.get(`foreign:${id}`), ts: Date.now() } : null;
        },
        on(event, callback) {
            listeners.push({ event, callback });
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

    return { adapter, stateStore, writes, subscriptions, listeners, timers };
}

function statisticsStates(period, markerId, markerValue) {
    const states = markerId ? { [markerId]: markerValue } : {};
    for (const sensor of SENSORS) {
        const base = `analytics.statistics.temperature.${period}.${sensor}`;
        states[`${base}.temp_min`] = 4;
        states[`${base}.temp_max`] = 30;
        states[`${base}.temp_min_time`] = '12.06. 04:20';
        states[`${base}.temp_max_time`] = '18.08. 15:40';
        states[`${base}.temp_avg`] = 20;
        states[`${base}.data_points_count`] = 124374;
        states[`${base}.last_update`] = 'legacy';
        states[`${base}.summary_json`] = JSON.stringify({
            temp_min: 4,
            temp_max: 30,
            temp_min_time: '12.06. 04:20',
            temp_max_time: '18.08. 15:40',
            temp_avg: 20,
            data_points_count: 124374,
        });
        states[`${base}.summary_html`] = '<div>legacy</div>';
        states[`temperature.${sensor}_temp_active`] = false;
    }
    return states;
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
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
        restore() {
            global.Date = RealDate;
        },
    };
}

describe('temperature statistics period contracts', () => {
    it('keeps today statistics sample-based and counts identical measurements', async () => {
        const clock = installFakeDate('2026-10-05T10:00:00+02:00');
        try {
            const helper = loadFresh(TODAY_PATH);
            const env = createAdapter({
                'analytics.statistics.temperature.today.last_processed_day': '2026-10-05',
                'temperature.surface_temp_active': true,
            });
            await helper.init(env.adapter);

            for (const value of [10, 10, 10, 10, 10, 11]) {
                await helper._processTemperatureChange('surface', value);
            }

            expect(env.stateStore.get('analytics.statistics.temperature.today.surface.data_points_count')).to.equal(6);
            expect(env.stateStore.get('analytics.statistics.temperature.today.surface.temp_avg')).to.equal(10.2);
            expect(env.stateStore.get('analytics.statistics.temperature.today.surface.temp_min')).to.equal(10);
            expect(env.stateStore.get('analytics.statistics.temperature.today.surface.temp_max')).to.equal(11);
            const summary = JSON.parse(
                String(env.stateStore.get('analytics.statistics.temperature.today.surface.summary_json')),
            );
            expect(summary.date).to.equal('2026-10-05');
        } finally {
            clock.restore();
        }
    });

    it('cleans legacy today values without relying on active sensor states', async () => {
        const clock = installFakeDate('2026-10-05T00:10:00+02:00');
        try {
            const helper = loadFresh(TODAY_PATH);
            const env = createAdapter(statisticsStates('today'));
            await helper.init(env.adapter);

            for (const sensor of SENSORS) {
                const base = `analytics.statistics.temperature.today.${sensor}`;
                expect(env.stateStore.get(`${base}.temp_min`)).to.equal(null);
                expect(env.stateStore.get(`${base}.temp_max`)).to.equal(null);
                expect(env.stateStore.get(`${base}.temp_avg`)).to.equal(null);
                expect(env.stateStore.get(`${base}.data_points_count`)).to.equal(0);
                expect(env.stateStore.get(`${base}.temp_min_time`)).to.equal('');
                expect(env.stateStore.get(`${base}.temp_max_time`)).to.equal('');
            }
            expect(env.stateStore.get('analytics.statistics.temperature.today.last_processed_day')).to.equal(
                '2026-10-05',
            );
        } finally {
            clock.restore();
        }
    });

    it('catches up today statistics after downtime over local midnight', async () => {
        const clock = installFakeDate('2026-10-05T23:59:00+02:00');
        try {
            const helper = loadFresh(TODAY_PATH);
            const env = createAdapter(
                statisticsStates('today', 'analytics.statistics.temperature.today.last_processed_day', '2026-10-05'),
            );
            await helper.init(env.adapter);
            clock.set('2026-10-06T00:01:00+02:00');
            await env.timers.at(-1)?.callback();

            expect(env.stateStore.get('analytics.statistics.temperature.today.last_processed_day')).to.equal(
                '2026-10-06',
            );
            expect(env.stateStore.get('analytics.statistics.temperature.today.surface.data_points_count')).to.equal(0);
        } finally {
            clock.restore();
        }
    });

    it('keeps Sunday in the current Monday-Sunday week', async () => {
        const clock = installFakeDate('2026-10-11T12:00:00+02:00');
        try {
            const helper = loadFresh(WEEK_PATH);
            const env = createAdapter(
                statisticsStates('week', 'analytics.statistics.temperature.week.last_processed_period', '2026-10-05'),
            );
            await helper.init(env.adapter);

            expect(env.stateStore.get('analytics.statistics.temperature.week.surface.data_points_count')).to.equal(
                124374,
            );
            expect(helper._getCurrentWeekRange()).to.equal('05.10.2026 – 11.10.2026');
        } finally {
            clock.restore();
        }
    });

    it('starts a new week on Monday and resets inactive sensors too', async () => {
        const clock = installFakeDate('2026-10-12T00:10:00+02:00');
        try {
            const helper = loadFresh(WEEK_PATH);
            const env = createAdapter(
                statisticsStates('week', 'analytics.statistics.temperature.week.last_processed_period', '2026-10-05'),
            );
            await helper.init(env.adapter);

            expect(env.stateStore.get('analytics.statistics.temperature.week.last_processed_period')).to.equal(
                '2026-10-12',
            );
            for (const sensor of SENSORS) {
                expect(
                    env.stateStore.get(`analytics.statistics.temperature.week.${sensor}.data_points_count`),
                ).to.equal(0);
            }
        } finally {
            clock.restore();
        }
    });

    it('cleans legacy monthly values before marking the current month processed', async () => {
        const clock = installFakeDate('2026-10-05T00:10:00+02:00');
        try {
            const helper = loadFresh(MONTH_PATH);
            const env = createAdapter(statisticsStates('month'));
            await helper.init(env.adapter);

            expect(env.stateStore.get('analytics.statistics.temperature.month.last_processed_period')).to.equal(
                '2026-10',
            );
            for (const sensor of SENSORS) {
                const base = `analytics.statistics.temperature.month.${sensor}`;
                expect(env.stateStore.get(`${base}.data_points_count`)).to.equal(0);
                expect(env.stateStore.get(`${base}.temp_min_time`)).to.equal('');
                expect(env.stateStore.get(`${base}.temp_max_time`)).to.equal('');
            }
        } finally {
            clock.restore();
        }
    });

    it('resets stale monthly values across a local month boundary', async () => {
        const clock = installFakeDate('2026-11-01T00:10:00+01:00');
        try {
            const helper = loadFresh(MONTH_PATH);
            const env = createAdapter(
                statisticsStates('month', 'analytics.statistics.temperature.month.last_processed_period', '2026-10'),
            );
            await helper.init(env.adapter);

            expect(env.stateStore.get('analytics.statistics.temperature.month.last_processed_period')).to.equal(
                '2026-11',
            );
            expect(env.stateStore.get('analytics.statistics.temperature.month.surface.data_points_count')).to.equal(0);
        } finally {
            clock.restore();
        }
    });

    it('keeps temperature min/max restore on the same day and rejects stale or legacy periods', async () => {
        const clock = installFakeDate('2026-10-05T10:00:00+02:00');
        try {
            const helper = loadFresh(TEMPERATURE_PATH);
            const sameDay = createAdapter(
                {
                    'temperature.daily_minmax_period': '2026-10-05',
                    'temperature.surface.min_today': 20,
                    'temperature.surface.max_today': 26,
                    'foreign:test.surface': 24,
                },
                {
                    surface_temp_active: true,
                    surface_temp_sensor: 'test.surface',
                },
            );
            helper.init(sameDay.adapter);
            await settle();
            expect(sameDay.stateStore.get('temperature.surface.min_today')).to.equal(20);
            expect(sameDay.stateStore.get('temperature.surface.max_today')).to.equal(26);
            helper.cleanup();

            const nextHelper = loadFresh(TEMPERATURE_PATH);
            const nextDay = createAdapter(
                {
                    'temperature.daily_minmax_period': '2026-10-04',
                    'temperature.surface.min_today': 2,
                    'temperature.surface.max_today': 30,
                    'foreign:test.surface': 24,
                },
                {
                    surface_temp_active: true,
                    surface_temp_sensor: 'test.surface',
                },
            );
            nextHelper.init(nextDay.adapter);
            await settle();
            expect(nextDay.stateStore.get('temperature.surface.min_today')).to.equal(24);
            expect(nextDay.stateStore.get('temperature.surface.max_today')).to.equal(24);
            expect(nextDay.stateStore.get('temperature.daily_minmax_period')).to.equal('2026-10-05');
            nextHelper.cleanup();

            const legacyHelper = loadFresh(TEMPERATURE_PATH);
            const legacy = createAdapter(
                {
                    'temperature.surface.min_today': 2,
                    'temperature.surface.max_today': 30,
                    'foreign:test.surface': 24,
                },
                {
                    surface_temp_active: true,
                    surface_temp_sensor: 'test.surface',
                },
            );
            legacyHelper.init(legacy.adapter);
            await settle();
            expect(legacy.stateStore.get('temperature.surface.min_today')).to.equal(24);
            expect(legacy.stateStore.get('temperature.surface.max_today')).to.equal(24);
            legacyHelper.cleanup();
        } finally {
            clock.restore();
        }
    });

    it('provides PoolInsights with current-day surface min/max after temperature restart cleanup', async () => {
        const clock = installFakeDate('2026-10-05T10:00:00+02:00');
        try {
            const helper = loadFresh(TEMPERATURE_PATH);
            const env = createAdapter(
                {
                    'temperature.daily_minmax_period': '2026-10-04',
                    'temperature.surface.min_today': 2,
                    'temperature.surface.max_today': 30,
                    'foreign:test.surface': 24,
                },
                {
                    surface_temp_active: true,
                    surface_temp_sensor: 'test.surface',
                },
            );
            helper.init(env.adapter);
            await settle();

            expect(env.stateStore.get('temperature.surface.min_today')).to.equal(24);
            expect(env.stateStore.get('temperature.surface.max_today')).to.equal(24);
            helper.cleanup();
        } finally {
            clock.restore();
        }
    });
});

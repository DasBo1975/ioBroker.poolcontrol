'use strict';

const { EventEmitter } = require('node:events');
const { expect } = require('chai');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

const MAIN_PATH = require.resolve('../../main.js');
const STATE_ID = 'external.0.control.trigger';
const STATE = { val: true, ack: false };

const HELPER_NAMES = [
    'temperatureHelper',
    'timeHelper',
    'runtimeHelper',
    'statisticsHelper',
    'statisticsHelperWeek',
    'statisticsHelperMonth',
    'pumpHelper',
    'pumpHelper2',
    'pumpHelper3',
    'pumpHelper4',
    'pumpSpeedHelper',
    'speechHelper',
    'consumptionHelper',
    'solarHelper',
    'solarExtendedHelper',
    'frostHelper',
    'statusHelper',
    'photovoltaicHelper',
    'photovoltaicInsightsHelper',
    'aiHelper',
    'aiForecastHelper',
    'aiChemistryHelpHelper',
    'chemistryPhHelper',
    'chemistryTdsHelper',
    'chemistryOrpHelper',
    'chemistryToolsHelper',
    'controlHelper',
    'controlHelper2',
    'debugLogHelper',
    'speechTextHelper',
    'migrationHelper',
    'infoHelper',
    'heatHelper',
    'actuatorsHelper',
    'solarInsightsHelper',
    'solarLogbookHelper',
    'poolInsightsHelper',
];

const ROUTED_HELPERS = [
    'temperatureHelper',
    'runtimeHelper',
    'pumpHelper',
    'pumpHelper2',
    'pumpHelper3',
    'pumpHelper4',
    'pumpSpeedHelper',
    'speechHelper',
    'consumptionHelper',
    'frostHelper',
    'photovoltaicHelper',
    'photovoltaicInsightsHelper',
    'heatHelper',
    'actuatorsHelper',
    'aiHelper',
    'aiForecastHelper',
    'aiChemistryHelpHelper',
    'chemistryPhHelper',
    'chemistryTdsHelper',
    'chemistryOrpHelper',
    'chemistryToolsHelper',
    'statusHelper',
    'speechTextHelper',
    'solarLogbookHelper',
    'solarInsightsHelper',
    'poolInsightsHelper',
    'controlHelper',
    'controlHelper2',
    'debugLogHelper',
];

const FIRE_AND_FORGET_HELPERS = ROUTED_HELPERS.filter(
    name =>
        ![
            'frostHelper',
            'chemistryPhHelper',
            'chemistryTdsHelper',
            'chemistryOrpHelper',
            'chemistryToolsHelper',
            'debugLogHelper',
        ].includes(name),
);

/**
 * @template T
 * @returns {{promise: Promise<T>, resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: unknown) => void}} Controlled promise.
 */
function createDeferred() {
    /** @param {T | PromiseLike<T>} value Deferred resolution value. */
    let resolvePromise = value => {
        void value;
    };
    /** @param {unknown} [reason] Deferred rejection reason. */
    let rejectPromise = reason => {
        void reason;
    };
    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    return { promise, resolve: resolvePromise, reject: rejectPromise };
}

/** Waits for promise-rejection bookkeeping without a timed sleep. */
async function settle() {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

/**
 * @param {Record<string, () => void | Promise<void>>} [behaviors] Per-helper behavior.
 */
function createEnvironment(behaviors = {}) {
    const starts = [];
    const warnings = [];
    const calls = {};
    const stubs = {};

    for (const name of HELPER_NAMES) {
        const helper = { init() {}, cleanup() {} };
        if (ROUTED_HELPERS.includes(name)) {
            const method = name === 'solarInsightsHelper' ? 'onStateChange' : 'handleStateChange';
            helper[method] = () => {
                starts.push(name);
                calls[name] = (calls[name] || 0) + 1;
                return behaviors[name]?.();
            };
        }
        stubs[`./lib/helpers/${name}`] = helper;
    }

    class FakeAdapter extends EventEmitter {
        constructor(options) {
            super();
            this.namespace = 'poolcontrol.0';
            this.config = {};
            this.options = options;
            this.log = {
                debug() {},
                info() {},
                warn: message => warnings.push(String(message)),
                error() {},
            };
        }
    }

    stubs['@iobroker/adapter-core'] = {
        Adapter: FakeAdapter,
        I18n: { translate: value => value },
    };

    const createAdapter = proxyquire(MAIN_PATH, stubs);
    const adapter = createAdapter({});

    return {
        adapter,
        starts,
        warnings,
        calls,
        dispatch: () => adapter.onStateChange(STATE_ID, STATE),
    };
}

describe('main state router defense-in-depth', () => {
    it('leaves void and resolved handlers without additional effects', async () => {
        const env = createEnvironment({
            temperatureHelper: () => undefined,
            runtimeHelper: () => Promise.resolve(),
        });

        await env.dispatch();
        await settle();
        expect(env.warnings).to.have.length(0);
        expect(env.calls.temperatureHelper).to.equal(1);
        expect(env.calls.runtimeHelper).to.equal(1);
    });

    it('preserves the complete start order of all 29 routed handlers', async () => {
        const env = createEnvironment();
        await env.dispatch();
        expect(env.starts).to.deep.equal(ROUTED_HELPERS);
        expect(FIRE_AND_FORGET_HELPERS).to.have.length(23);
    });

    it('logs a synchronous throw once and continues with later handlers', async () => {
        const env = createEnvironment({
            temperatureHelper: () => {
                throw new Error('sync failure');
            },
        });

        await env.dispatch();
        expect(env.calls.runtimeHelper).to.equal(1);
        expect(env.warnings).to.have.length(1);
        expect(env.warnings[0]).to.include('temperatureHelper');
        expect(env.warnings[0]).to.include(STATE_ID);
        expect(env.warnings[0]).to.include('sync failure');
    });

    it('observes an immediate rejection without blocking the next handler', async () => {
        const unhandled = [];
        const listener = reason => unhandled.push(reason);
        process.on('unhandledRejection', listener);
        try {
            const env = createEnvironment({
                temperatureHelper: () => Promise.reject(new Error('immediate failure')),
            });
            await env.dispatch();
            await settle();
            expect(env.calls.runtimeHelper).to.equal(1);
            expect(env.warnings).to.have.length(1);
            expect(env.warnings[0]).to.include('immediate failure');
            expect(unhandled).to.have.length(0);
        } finally {
            process.removeListener('unhandledRejection', listener);
        }
    });

    it('observes a deferred rejection without a timed sleep', async () => {
        const deferred = createDeferred();
        const unhandled = [];
        const listener = reason => unhandled.push(reason);
        process.on('unhandledRejection', listener);
        try {
            const env = createEnvironment({ temperatureHelper: () => deferred.promise });
            await env.dispatch();
            deferred.reject(new Error('deferred failure'));
            await settle();
            expect(env.warnings).to.have.length(1);
            expect(env.warnings[0]).to.include('deferred failure');
            expect(unhandled).to.have.length(0);
        } finally {
            process.removeListener('unhandledRejection', listener);
        }
    });

    it('does not let an unresolved fire-and-forget handler block later handlers', async () => {
        const deferred = createDeferred();
        const env = createEnvironment({ temperatureHelper: () => deferred.promise });
        await env.dispatch();
        expect(env.calls.runtimeHelper).to.equal(1);
        expect(env.calls.debugLogHelper).to.equal(1);
    });

    it('keeps frost as an awaited boundary', async () => {
        const deferred = createDeferred();
        const env = createEnvironment({ frostHelper: () => deferred.promise });
        let completed = false;
        const dispatch = env.dispatch().then(() => {
            completed = true;
        });

        expect(env.calls.frostHelper).to.equal(1);
        expect(env.calls.photovoltaicHelper).to.equal(undefined);
        expect(completed).to.equal(false);
        deferred.resolve(undefined);
        await dispatch;
        expect(env.calls.photovoltaicHelper).to.equal(1);
    });

    it('keeps every Chemistry handler as an awaited boundary', async () => {
        const ph = createDeferred();
        const tds = createDeferred();
        const orp = createDeferred();
        const tools = createDeferred();
        const env = createEnvironment({
            chemistryPhHelper: () => ph.promise,
            chemistryTdsHelper: () => tds.promise,
            chemistryOrpHelper: () => orp.promise,
            chemistryToolsHelper: () => tools.promise,
        });
        const dispatch = env.dispatch();

        await Promise.resolve();
        expect(env.calls.chemistryPhHelper).to.equal(1);
        expect(env.calls.chemistryTdsHelper).to.equal(undefined);
        ph.resolve(undefined);
        await Promise.resolve();
        expect(env.calls.chemistryTdsHelper).to.equal(1);
        tds.resolve(undefined);
        await Promise.resolve();
        expect(env.calls.chemistryOrpHelper).to.equal(1);
        orp.resolve(undefined);
        await Promise.resolve();
        expect(env.calls.chemistryToolsHelper).to.equal(1);
        expect(env.calls.statusHelper).to.equal(undefined);
        tools.resolve(undefined);
        await dispatch;
        expect(env.calls.statusHelper).to.equal(1);
    });

    it('keeps a successful debugLog handler awaited', async () => {
        const deferred = createDeferred();
        const debugLogCalled = createDeferred();
        const env = createEnvironment({
            debugLogHelper: () => {
                debugLogCalled.resolve(undefined);
                return deferred.promise;
            },
        });
        let completed = false;
        const dispatch = env.dispatch().then(() => {
            completed = true;
        });

        await debugLogCalled.promise;
        expect(env.calls.debugLogHelper).to.equal(1);
        expect(completed).to.equal(false);
        deferred.resolve(undefined);
        await dispatch;
        expect(completed).to.equal(true);
        expect(env.warnings).to.have.length(0);
    });

    it('catches a debugLog rejection centrally while preserving await completion', async () => {
        const unhandled = [];
        const listener = reason => unhandled.push(reason);
        process.on('unhandledRejection', listener);
        try {
            const env = createEnvironment({
                debugLogHelper: () => Promise.reject(new Error('debug failure')),
            });
            await env.dispatch();
            await settle();
            expect(env.warnings).to.have.length(1);
            expect(env.warnings[0]).to.include('debugLogHelper');
            expect(env.warnings[0]).to.include(STATE_ID);
            expect(env.warnings[0]).to.include('debug failure');
            expect(unhandled).to.have.length(0);
        } finally {
            process.removeListener('unhandledRejection', listener);
        }
    });

    it('logs a non-Error rejection safely', async () => {
        const env = createEnvironment({ temperatureHelper: () => Promise.reject('string failure') });
        await env.dispatch();
        await settle();
        expect(env.warnings).to.have.length(1);
        expect(env.warnings[0]).to.include('string failure');
    });

    it('does not retry or double-log a failed handler', async () => {
        const env = createEnvironment({
            temperatureHelper: () => Promise.reject(new Error('single failure')),
        });
        await env.dispatch();
        await settle();
        expect(env.calls.temperatureHelper).to.equal(1);
        expect(env.warnings).to.have.length(1);
    });
});

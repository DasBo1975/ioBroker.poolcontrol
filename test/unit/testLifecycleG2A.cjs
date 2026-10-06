'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const path = require('node:path');
const { expect } = require('chai');
const { I18n } = require('@iobroker/adapter-core');

const PUMP2_PATH = require.resolve('../../lib/helpers/pumpHelper2');
const PUMP_SPEED_PATH = require.resolve('../../lib/helpers/pumpSpeedHelper');
const AI_CHEMISTRY_PATH = require.resolve('../../lib/helpers/aiChemistryHelpHelper');

/**
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

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
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial state values.
 * @property {(id: string) => void | Promise<void>} [onRead] Read hook.
 * @property {(id: string) => void | Promise<void>} [onWrite] Write hook.
 */

/**
 * @typedef {object} LoadedLifecycleHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {number} _lifecycleGeneration Current lifecycle generation.
 * @property {Promise<void> | null} _initializationPromise Initialization barrier.
 * @property {(adapter: object) => Promise<void>} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => void} cleanup Stop helper.
 */

/**
 * @returns {Deferred<void>} Controlled promise.
 */
function createDeferred() {
    /** @type {Deferred<void>['resolve']} */
    let resolvePromise = () => undefined;
    /** @type {Promise<void>} */
    const promise = new Promise(resolve => {
        resolvePromise = resolve;
    });
    return { promise, resolve: resolvePromise };
}

/**
 * @param {string} helperPath Module path.
 * @returns {LoadedLifecycleHelper} Fresh helper singleton.
 */
function loadHelper(helperPath) {
    delete require.cache[helperPath];
    return /** @type {LoadedLifecycleHelper} */ (require(helperPath));
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, onRead, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {FakeWrite[]} */
    const writes = [];

    const adapter = {
        log: {
            info: () => undefined,
            debug: () => undefined,
            warn: () => undefined,
        },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async getObjectAsync(id) {
            reads.push(`object:${id}`);
            await onRead?.(`object:${id}`);
            return null;
        },
        async setStateAsync(id, state) {
            await onWrite?.(id);
            const stored = { ...state };
            writes.push({ id, state: stored });
            stateStore.set(id, stored.val);
        },
        async setStateChangedAsync(id, state) {
            await onWrite?.(id);
            const stored = { ...state };
            writes.push({ id, state: stored });
            stateStore.set(id, stored.val);
        },
    };

    return { adapter, stateStore, subscriptions, reads, writes };
}

/** @returns {Record<string, ioBroker.StateValue>} Normal Pump2 states. */
function pump2States() {
    return {
        'pump.current_power': 500,
        'pump.pump_max_watt': 1000,
        'pump.pump_power_lph': 10000,
        'pump.pump_switch': true,
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Normal PumpSpeed states. */
function pumpSpeedStates() {
    return {
        'pump.pump_switch': true,
        'pump.mode': 'auto',
        'control.pump.backwash_active': false,
        'pump.speed.config.percent.frost': 20,
        'pump.speed.config.percent.low': 30,
        'pump.speed.config.percent.normal': 50,
        'pump.speed.config.percent.high': 75,
        'pump.speed.config.percent.boost': 100,
    };
}

describe('Lifecycle G2-A', () => {
    before(async () => {
        await I18n.init(path.resolve(__dirname, '../..'), 'en');
    });

    describe('pumpHelper2', () => {
        it('ignores an event before init safely', async () => {
            const helper = loadHelper(PUMP2_PATH);
            await helper.handleStateChange('poolcontrol.0.pump.current_power', { val: 500, ack: true });
            expect(helper._active).to.equal(false);
        });

        it('compensates an earlier level event through the authoritative init read', async () => {
            const helper = loadHelper(PUMP2_PATH);
            const context = createAdapter({ states: pump2States() });
            await helper.init(context.adapter);
            expect(context.writes.map(write => [write.id, write.state.val])).to.deep.equal([
                ['pump.live.current_power_w', 500],
                ['pump.live.flow_current_lh', 5000],
                ['pump.live.flow_percent', 50],
            ]);
        });

        it('does not process an init-level event ahead of the init read', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHelper(PUMP2_PATH);
            const context = createAdapter({
                states: pump2States(),
                onRead: async id => {
                    if (id === 'pump.current_power') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            const initialization = helper.init(context.adapter);
            await entered.promise;
            const event = helper.handleStateChange('poolcontrol.0.pump.current_power', { val: 500, ack: true });
            expect(context.writes).to.have.length(0);
            gate.resolve();
            await Promise.all([initialization, event]);
            expect(context.writes).to.have.length(3);
        });

        it('keeps the normal event calculation path', async () => {
            const helper = loadHelper(PUMP2_PATH);
            const context = createAdapter({ states: pump2States() });
            await helper.init(context.adapter);
            context.writes.length = 0;
            context.stateStore.set('pump.current_power', 750);
            await helper.handleStateChange('poolcontrol.0.pump.current_power', { val: 750, ack: true });
            expect(context.writes.map(write => write.state.val)).to.deep.equal([750, 7500, 75]);
        });

        it('ignores events after cleanup', async () => {
            const helper = loadHelper(PUMP2_PATH);
            const context = createAdapter({ states: pump2States() });
            await helper.init(context.adapter);
            helper.cleanup();
            const activity = context.reads.length + context.writes.length;
            await helper.handleStateChange('poolcontrol.0.pump.current_power', { val: 750, ack: true });
            expect(context.reads.length + context.writes.length).to.equal(activity);
        });

        it('invalidates an old init generation across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHelper(PUMP2_PATH);
            const oldContext = createAdapter({
                states: pump2States(),
                onRead: async id => {
                    if (id === 'pump.current_power') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            const oldInit = helper.init(oldContext.adapter);
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({ states: { ...pump2States(), 'pump.current_power': 800 } });
            const newInit = helper.init(newContext.adapter);
            gate.resolve();
            await Promise.all([oldInit, newInit]);
            expect(oldContext.writes).to.have.length(0);
            expect(newContext.writes.map(write => write.state.val)).to.deep.equal([800, 8000, 80]);
        });
    });

    describe('pumpSpeedHelper', () => {
        it('ignores an event before init safely', async () => {
            const helper = loadHelper(PUMP_SPEED_PATH);
            await helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'auto', ack: true });
            expect(helper._active).to.equal(false);
        });

        it('reads mapping and pump states authoritatively during init', async () => {
            const helper = loadHelper(PUMP_SPEED_PATH);
            const context = createAdapter({ states: pumpSpeedStates() });
            await helper.init(context.adapter);
            expect(context.reads).to.deep.equal([
                'pump.speed.config.percent.frost',
                'pump.speed.config.percent.low',
                'pump.speed.config.percent.normal',
                'pump.speed.config.percent.high',
                'pump.speed.config.percent.boost',
                'pump.pump_switch',
                'control.pump.backwash_active',
                'pump.mode',
            ]);
            expect(context.writes.map(write => write.state.val)).to.deep.equal(['normal', 'normal', 50]);
        });

        it('does not process an init-level event ahead of initialization', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHelper(PUMP_SPEED_PATH);
            const context = createAdapter({
                states: pumpSpeedStates(),
                onRead: async id => {
                    if (id === 'pump.speed.config.percent.frost') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            const initialization = helper.init(context.adapter);
            await entered.promise;
            const event = helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'auto', ack: true });
            expect(context.writes).to.have.length(0);
            gate.resolve();
            await Promise.all([initialization, event]);
            expect(context.writes).to.have.length(3);
        });

        it('keeps the normal recalculation output path', async () => {
            const helper = loadHelper(PUMP_SPEED_PATH);
            const context = createAdapter({ states: pumpSpeedStates() });
            await helper.init(context.adapter);
            context.writes.length = 0;
            context.stateStore.set('control.pump.backwash_active', true);
            await helper.handleStateChange('poolcontrol.0.control.pump.backwash_active', { val: true, ack: true });
            expect(context.writes.map(write => write.state.val)).to.deep.equal(['boost', 'boost', 100]);
        });

        it('ignores events after cleanup', async () => {
            const helper = loadHelper(PUMP_SPEED_PATH);
            const context = createAdapter({ states: pumpSpeedStates() });
            await helper.init(context.adapter);
            helper.cleanup();
            const activity = context.reads.length + context.writes.length;
            await helper.handleStateChange('poolcontrol.0.pump.mode', { val: 'frostHelper', ack: true });
            expect(context.reads.length + context.writes.length).to.equal(activity);
        });

        it('invalidates an old init generation across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHelper(PUMP_SPEED_PATH);
            const oldContext = createAdapter({
                states: pumpSpeedStates(),
                onRead: async id => {
                    if (id === 'pump.speed.config.percent.frost') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            const oldInit = helper.init(oldContext.adapter);
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({
                states: { ...pumpSpeedStates(), 'pump.speed.config.percent.normal': 60 },
            });
            const newInit = helper.init(newContext.adapter);
            gate.resolve();
            await Promise.all([oldInit, newInit]);
            expect(oldContext.writes).to.have.length(0);
            expect(newContext.writes.map(write => write.state.val)).to.deep.equal(['normal', 'normal', 60]);
        });
    });

    describe('aiChemistryHelpHelper', () => {
        it('ignores an event before init without invoking the adapter getter', async () => {
            const helper = loadHelper(AI_CHEMISTRY_PATH);
            await helper.handleStateChange('poolcontrol.0.ai.chemistry_help.issue', { val: 'ph_low', ack: false });
            expect(helper._active).to.equal(false);
        });

        it('compensates an earlier level event through the authoritative issue read', async () => {
            const helper = loadHelper(AI_CHEMISTRY_PATH);
            const context = createAdapter({ states: { 'ai.chemistry_help.issue': 'ph_low' } });
            await helper.init(context.adapter);
            expect(context.writes.map(write => write.id)).to.deep.equal([
                'ai.chemistry_help.help_text',
                'ai.chemistry_help.last_issue_time',
            ]);
        });

        it('does not process an init-level event ahead of the issue read', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHelper(AI_CHEMISTRY_PATH);
            const context = createAdapter({
                states: { 'ai.chemistry_help.issue': 'ph_low' },
                onRead: async id => {
                    if (id === 'ai.chemistry_help.issue') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            const initialization = helper.init(context.adapter);
            await entered.promise;
            const event = helper.handleStateChange('poolcontrol.0.ai.chemistry_help.issue', {
                val: 'chlor_high',
                ack: false,
            });
            expect(context.writes).to.have.length(0);
            gate.resolve();
            await Promise.all([initialization, event]);
            expect(context.writes).to.have.length(2);
        });

        it('keeps the normal text and timestamp output path', async () => {
            const helper = loadHelper(AI_CHEMISTRY_PATH);
            const context = createAdapter({ states: { 'ai.chemistry_help.issue': 'none' } });
            await helper.init(context.adapter);
            context.writes.length = 0;
            await helper.handleStateChange('poolcontrol.0.ai.chemistry_help.issue', {
                val: 'chlor_high',
                ack: false,
            });
            expect(context.writes.map(write => write.id)).to.deep.equal([
                'ai.chemistry_help.help_text',
                'ai.chemistry_help.last_issue_time',
            ]);
            expect(context.writes[0].state.val).to.include('Chlorine level is too high');
        });

        it('prevents a later timestamp publish after cleanup', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            let blockWrite = false;
            const helper = loadHelper(AI_CHEMISTRY_PATH);
            const context = createAdapter({
                states: { 'ai.chemistry_help.issue': 'none' },
                onWrite: async id => {
                    if (blockWrite && id === 'ai.chemistry_help.help_text') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            await helper.init(context.adapter);
            context.writes.length = 0;
            blockWrite = true;
            const event = helper.handleStateChange('poolcontrol.0.ai.chemistry_help.issue', {
                val: 'chlor_high',
                ack: false,
            });
            await entered.promise;
            helper.cleanup();
            gate.resolve();
            await event;
            expect(context.writes.map(write => write.id)).to.deep.equal(['ai.chemistry_help.help_text']);
        });

        it('invalidates an old init generation across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHelper(AI_CHEMISTRY_PATH);
            const oldContext = createAdapter({
                states: { 'ai.chemistry_help.issue': 'ph_low' },
                onRead: async id => {
                    if (id === 'ai.chemistry_help.issue') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            const oldInit = helper.init(oldContext.adapter);
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({ states: { 'ai.chemistry_help.issue': 'chlor_high' } });
            const newInit = helper.init(newContext.adapter);
            gate.resolve();
            await Promise.all([oldInit, newInit]);
            expect(oldContext.writes).to.have.length(0);
            expect(newContext.writes.map(write => write.id)).to.deep.equal([
                'ai.chemistry_help.help_text',
                'ai.chemistry_help.last_issue_time',
            ]);
        });
    });
});

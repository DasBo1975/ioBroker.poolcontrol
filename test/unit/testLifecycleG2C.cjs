'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const HEAT_PATH = require.resolve('../../lib/helpers/heatHelper');
const PV_PATH = require.resolve('../../lib/helpers/photovoltaicHelper');

/**
 * @template T
 * @typedef {object} Deferred
 * @property {Promise<T>} promise Controlled promise.
 * @property {(value: T | PromiseLike<T>) => void} resolve Promise resolver.
 */

/** @typedef {{val: ioBroker.StateValue, ack?: boolean}} FakeState */
/** @typedef {{id: string, state: FakeState, foreign: boolean}} FakeWrite */
/** @typedef {{level: 'debug' | 'info' | 'warn' | 'error', message: string}} FakeLog */

/**
 * @typedef {object} FakeTimer
 * @property {number} id Timer id.
 * @property {'timeout'} kind Timer kind.
 * @property {() => void | Promise<void>} callback Timer callback.
 * @property {number} delay Timer delay.
 * @property {boolean} cleared Whether the timer was cleared.
 */

/**
 * @typedef {object} AdapterOptions
 * @property {Record<string, ioBroker.StateValue>} [states] Initial state values.
 * @property {Record<string, ioBroker.StateValue>} [config] Adapter configuration.
 * @property {(id: string) => void | Promise<void>} [onRead] Read hook.
 * @property {(id: string) => void | Promise<void>} [onWrite] Write hook.
 */

/**
 * @typedef {object} LoadedHeatHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {number} _lifecycleGeneration Current lifecycle generation.
 * @property {Promise<void> | null} _initializationPromise Initialization barrier.
 * @property {boolean} _ownsPump Pump ownership marker.
 * @property {boolean | null} _desiredHeat Desired heating state.
 * @property {number} _lastEval Last evaluation timestamp.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => void} cleanup Stop helper.
 */

/**
 * @typedef {object} LoadedPvHelper
 * @property {boolean} _active Lifecycle activity flag.
 * @property {Promise<void> | null} _initializationPromise Initialization barrier.
 * @property {number} _recalcRequestSeq Current request sequence.
 * @property {boolean | null} _desiredPump Desired pump state.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {(tag: string) => Promise<void>} _safeRecalc Run one serialized recalculation.
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

/** @returns {LoadedHeatHelper} Fresh heat helper singleton. */
function loadHeatHelper() {
    delete require.cache[HEAT_PATH];
    return /** @type {LoadedHeatHelper} */ (require(HEAT_PATH));
}

/** @returns {LoadedPvHelper} Fresh photovoltaic helper singleton. */
function loadPvHelper() {
    delete require.cache[PV_PATH];
    return /** @type {LoadedPvHelper} */ (require(PV_PATH));
}

/** @param {AdapterOptions} [options] Fake adapter options. */
function createAdapter({ states = {}, config = {}, onRead, onWrite } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {string[]} */
    const foreignSubscriptions = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {FakeTimer[]} */
    const timers = [];
    /** @type {number[]} */
    const clears = [];
    /** @type {FakeLog[]} */
    const logs = [];
    let nextTimerId = 1;

    const adapter = {
        config,
        log: {
            debug: message => logs.push({ level: 'debug', message: String(message) }),
            info: message => logs.push({ level: 'info', message: String(message) }),
            warn: message => logs.push({ level: 'warn', message: String(message) }),
            error: message => logs.push({ level: 'error', message: String(message) }),
        },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        subscribeForeignStates(id) {
            foreignSubscriptions.push(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async getForeignStateAsync(id) {
            reads.push(`foreign:${id}`);
            await onRead?.(`foreign:${id}`);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateAsync(id, state) {
            await onWrite?.(id);
            const stored = { ...state };
            writes.push({ id, state: stored, foreign: false });
            stateStore.set(id, stored.val);
        },
        async setForeignStateAsync(id, state) {
            await onWrite?.(`foreign:${id}`);
            const stored = { ...state };
            writes.push({ id, state: stored, foreign: true });
            stateStore.set(id, stored.val);
        },
        setTimeout(callback, delay) {
            /** @type {FakeTimer} */
            const timer = { id: nextTimerId++, kind: 'timeout', callback, delay, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            timer.cleared = true;
            clears.push(timer.id);
        },
    };
    return { adapter, stateStore, subscriptions, foreignSubscriptions, reads, writes, timers, clears, logs };
}

/** @returns {Record<string, ioBroker.StateValue>} Normal heat states. */
function heatStates() {
    return {
        'status.season_active': true,
        'control.pump.maintenance_active': false,
        'pump.mode': 'auto',
        'pump.pump_switch': false,
        'heat.control_active': true,
        'temperature.surface.current': 20,
        'heat.target_temperature': 26,
        'heat.max_temperature': 30,
        'heat.pump_afterrun_minutes': 2,
        'heat.pump_prerun_minutes': 0,
        'heat.control_type': 'socket',
        'heat.control_object_id': 'foreign.heat',
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Normal photovoltaic states. */
function pvStates() {
    return {
        'status.season_active': true,
        'pump.mode': 'auto_pv',
        'pump.pump_max_watt': 500,
        'pump.current_power': 500,
        'pump.pump_switch': false,
        'pump.active_helper': '',
        'pump.manual_safety_enabled': false,
        'control.pump.maintenance_active': false,
        'solar.collector_warning': false,
        'photovoltaic.power_generated_w': 1500,
        'photovoltaic.power_house_w': 100,
        'photovoltaic.power_surplus_w': 0,
        'photovoltaic.surplus_active': false,
        'photovoltaic.status_text': '',
        'photovoltaic.threshold_w': 200,
        'photovoltaic.afterrun_min': 2,
        'photovoltaic.ignore_on_circulation': false,
    };
}

/** @param {{_initializationPromise: Promise<void> | null}} helper Helper with startup barrier. */
async function finishInitialization(helper) {
    const initializationPromise = helper._initializationPromise;
    if (initializationPromise) {
        await initializationPromise;
    }
}

/** @param {LoadedHeatHelper} helper Heat helper to make immediately evaluable. */
function allowHeatEvaluation(helper) {
    helper._lastEval = 0;
}

describe('Lifecycle G2-C', () => {
    describe('heatHelper', () => {
        it('ignores an event before init safely', async () => {
            const helper = loadHeatHelper();
            await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 20 });
            expect(helper._active).to.equal(false);
        });

        it('compensates a pre-init level through the initial evaluation', async () => {
            const helper = loadHeatHelper();
            const context = createAdapter({ states: heatStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(context.stateStore.get('heat.active')).to.equal(true);
            expect(context.stateStore.get('foreign.heat')).to.equal(true);
        });

        it('does not process an event ahead of an in-flight initial evaluation', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHeatHelper();
            const context = createAdapter({
                states: heatStates(),
                onRead: async id => {
                    if (id === 'status.season_active') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await entered.promise;
            const event = helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 25 });
            expect(context.writes).to.have.length(0);
            gate.resolve();
            await Promise.all([finishInitialization(helper), event]);
            expect(context.stateStore.get('heat.active')).to.equal(true);
        });

        it('preserves the normal heating start path', async () => {
            const helper = loadHeatHelper();
            const context = createAdapter({ states: heatStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(context.writes.map(write => [write.id, write.state.val])).to.include.deep.members([
                ['foreign.heat', true],
                ['pump.pump_switch', true],
                ['heat.heating_request', true],
            ]);
        });

        it('preserves the normal heating stop path', async () => {
            const helper = loadHeatHelper();
            const context = createAdapter({ states: heatStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            context.stateStore.set('temperature.surface.current', 27);
            allowHeatEvaluation(helper);
            await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 27 });
            expect(context.writes.map(write => [write.id, write.state.val])).to.include.deep.members([
                ['foreign.heat', false],
                ['heat.heating_request', false],
                ['heat.afterrun_active', true],
            ]);
        });

        it('preserves pump prerun before heating', async () => {
            const helper = loadHeatHelper();
            const states = { ...heatStates(), 'heat.pump_prerun_minutes': 1 };
            const context = createAdapter({ states });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(context.stateStore.get('foreign.heat')).to.equal(undefined);
            const prerun = context.timers.find(timer => timer.delay === 60000);
            if (!prerun) {
                throw new Error('Prerun timer missing');
            }
            allowHeatEvaluation(helper);
            await prerun.callback();
            expect(context.stateStore.get('foreign.heat')).to.equal(true);
        });

        it('preserves pump afterrun completion', async () => {
            const helper = loadHeatHelper();
            const context = createAdapter({ states: heatStates() });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.stateStore.set('temperature.surface.current', 27);
            allowHeatEvaluation(helper);
            await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 27 });
            const afterrun = context.timers.find(timer => timer.delay === 120000);
            if (!afterrun) {
                throw new Error('Afterrun timer missing');
            }
            await afterrun.callback();
            expect(context.stateStore.get('pump.pump_switch')).to.equal(false);
            expect(context.stateStore.get('heat.afterrun_active')).to.equal(false);
        });

        it('stops afterrun cleanup writes when cleanup interrupts the pump-off write', async () => {
            const pumpWriteEntered = createDeferred();
            const releasePumpWrite = createDeferred();
            let blockPumpOff = false;
            const helper = loadHeatHelper();
            const context = createAdapter({
                states: heatStates(),
                onWrite: async id => {
                    if (blockPumpOff && id === 'pump.pump_switch') {
                        pumpWriteEntered.resolve();
                        await releasePumpWrite.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.stateStore.set('temperature.surface.current', 27);
            allowHeatEvaluation(helper);
            await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 27 });
            const afterrun = context.timers.find(timer => timer.delay === 120000);
            if (!afterrun) {
                throw new Error('Afterrun timer missing');
            }
            context.writes.length = 0;
            context.logs.length = 0;
            blockPumpOff = true;

            const completion = afterrun.callback();
            await pumpWriteEntered.promise;
            helper.cleanup();
            releasePumpWrite.resolve();
            await completion;

            expect(context.writes.some(write => write.id === 'pump.pump_switch' && write.state.val === false)).to.equal(
                true,
            );
            expect(context.writes.some(write => write.id === 'heat.afterrun_active')).to.equal(false);
            expect(context.writes.some(write => write.id === 'heat.prerun_active')).to.equal(false);
            expect(context.writes.some(write => write.foreign)).to.equal(false);
            expect(context.logs.some(log => log.level === 'info' && log.message.includes('Pump OFF'))).to.equal(false);
            expect(helper._ownsPump).to.equal(false);
        });

        it('does not mask an uncaught sentinel error when cleanup invalidates the generation', async () => {
            const sentinel = new Error('sentinel logging failure');
            let rejectPumpOff = false;
            const helper = loadHeatHelper();
            const context = createAdapter({
                states: heatStates(),
                onWrite: id => {
                    if (rejectPumpOff && id === 'pump.pump_switch') {
                        throw new Error('pump write failure');
                    }
                },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.stateStore.set('temperature.surface.current', 27);
            allowHeatEvaluation(helper);
            await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 27 });
            const afterrun = context.timers.find(timer => timer.delay === 120000);
            if (!afterrun) {
                throw new Error('Afterrun timer missing');
            }
            context.writes.length = 0;
            rejectPumpOff = true;
            context.adapter.log.warn = () => {
                helper.cleanup();
                throw sentinel;
            };

            let observedError;
            try {
                await afterrun.callback();
            } catch (err) {
                observedError = err;
            }

            expect(observedError).to.equal(sentinel);
            expect(context.writes).to.have.length(0);
            expect(helper._active).to.equal(false);
        });

        it('does not stop a pump it did not start', async () => {
            const helper = loadHeatHelper();
            const states = { ...heatStates(), 'pump.pump_switch': true };
            const context = createAdapter({ states });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            context.stateStore.set('temperature.surface.current', 27);
            allowHeatEvaluation(helper);
            await helper.handleStateChange('poolcontrol.0.temperature.surface.current', { val: 27 });
            expect(context.writes.some(write => write.id === 'pump.pump_switch' && write.state.val === false)).to.equal(
                false,
            );
        });

        it('prevents actuator work when cleanup interrupts a read', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHeatHelper();
            const context = createAdapter({
                states: heatStates(),
                onRead: async id => {
                    if (id === 'status.season_active') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await entered.promise;
            helper.cleanup();
            gate.resolve();
            await finishInitialization(helper);
            expect(context.writes).to.have.length(0);
        });

        it('does not execute an old timer after cleanup', async () => {
            const helper = loadHeatHelper();
            const states = { ...heatStates(), 'heat.pump_prerun_minutes': 1 };
            const context = createAdapter({ states });
            helper.init(context.adapter);
            await finishInitialization(helper);
            const prerun = context.timers.find(timer => timer.delay === 60000);
            if (!prerun) {
                throw new Error('Prerun timer missing');
            }
            context.writes.length = 0;
            helper.cleanup();
            await prerun.callback();
            expect(context.writes).to.have.length(0);
        });

        it('invalidates an old evaluation across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadHeatHelper();
            const oldContext = createAdapter({
                states: heatStates(),
                onRead: async id => {
                    if (id === 'status.season_active') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(oldContext.adapter);
            const oldInitialization = helper._initializationPromise;
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({ states: heatStates() });
            helper.init(newContext.adapter);
            const newInitialization = helper._initializationPromise;
            gate.resolve();
            await Promise.all([oldInitialization, newInitialization]);
            expect(oldContext.writes).to.have.length(0);
            expect(newContext.stateStore.get('foreign.heat')).to.equal(true);
        });
    });

    describe('photovoltaicHelper', () => {
        const pvConfig = { power_generated_id: 'foreign.pv', power_house_id: 'foreign.house', threshold_w: 200 };

        it('ignores an event before init safely', async () => {
            const helper = loadPvHelper();
            await helper.handleStateChange('foreign.pv', { val: 1500 });
            expect(helper._active).to.equal(false);
        });

        it('compensates pre-init levels through the initial recalculation', async () => {
            const helper = loadPvHelper();
            const context = createAdapter({ states: pvStates(), config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(context.stateStore.get('pump.active_helper')).to.equal('photovoltaicHelper');
            expect(context.stateStore.get('pump.pump_switch')).to.equal(true);
        });

        it('does not process an event ahead of an in-flight initial recalculation', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadPvHelper();
            const context = createAdapter({
                states: pvStates(),
                config: pvConfig,
                onRead: async id => {
                    if (id === 'status.season_active') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await entered.promise;
            const event = helper.handleStateChange('foreign.pv', { val: 1800 });
            expect(context.writes).to.have.length(0);
            gate.resolve();
            await Promise.all([finishInitialization(helper), event]);
            expect(context.stateStore.get('pump.pump_switch')).to.equal(true);
        });

        it('preserves the normal PV pump start path', async () => {
            const helper = loadPvHelper();
            const context = createAdapter({ states: pvStates(), config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(context.writes.map(write => [write.id, write.state.val])).to.include.deep.members([
                ['pump.active_helper', 'photovoltaicHelper'],
                ['pump.pump_switch', true],
            ]);
        });

        it('preserves solar-overheat safety after full initialization', async () => {
            const helper = loadPvHelper();
            const states = { ...pvStates(), 'pump.mode': 'auto', 'solar.collector_warning': false };
            const context = createAdapter({ states, config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(helper._active).to.equal(true);
            context.writes.length = 0;
            context.stateStore.set('solar.collector_warning', true);

            await helper.handleStateChange('poolcontrol.0.solar.collector_warning', { val: true, ack: true });

            expect(context.stateStore.get('pump.active_helper')).to.equal('photovoltaicHelper');
            expect(context.stateStore.get('pump.pump_switch')).to.equal(true);
            expect(
                context.writes.filter(
                    write => write.id === 'pump.active_helper' && write.state.val === 'photovoltaicHelper',
                ),
            ).to.have.length(1);
            expect(
                context.writes.filter(write => write.id === 'pump.pump_switch' && write.state.val === true),
            ).to.have.length(1);
        });

        it('preserves the normal immediate PV stop path', async () => {
            const helper = loadPvHelper();
            const states = { ...pvStates(), 'photovoltaic.afterrun_min': 0 };
            const context = createAdapter({ states, config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            context.stateStore.set('photovoltaic.power_generated_w', 100);
            await helper._safeRecalc('low');
            expect(context.writes.map(write => [write.id, write.state.val])).to.include.deep.members([
                ['pump.pump_switch', false],
                ['pump.active_helper', ''],
            ]);
        });

        it('preserves the active-helper no-op guard', async () => {
            const helper = loadPvHelper();
            const states = { ...pvStates(), 'pump.active_helper': 'photovoltaicHelper' };
            const context = createAdapter({ states, config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(
                context.writes.some(
                    write => write.id === 'pump.active_helper' && write.state.val === 'photovoltaicHelper',
                ),
            ).to.equal(false);
        });

        it('protects foreign pump ownership', async () => {
            const helper = loadPvHelper();
            const states = { ...pvStates(), 'pump.active_helper': 'controlHelper' };
            const context = createAdapter({ states, config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            expect(context.stateStore.get('pump.active_helper')).to.equal('controlHelper');
            expect(context.writes.some(write => write.id === 'pump.pump_switch')).to.equal(false);
        });

        it('preserves foreign-value debounce', async () => {
            const helper = loadPvHelper();
            const states = { ...pvStates(), 'photovoltaic.power_generated_w': 0 };
            const context = createAdapter({ states, config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            await helper.handleStateChange('foreign.pv', { val: 1600 });
            const debounce = context.timers.find(timer => timer.delay === 150);
            if (!debounce) {
                throw new Error('Debounce timer missing');
            }
            await debounce.callback();
            await new Promise(resolve => setImmediate(resolve));
            expect(context.stateStore.get('pump.pump_switch')).to.equal(true);
        });

        it('preserves PV afterrun', async () => {
            const helper = loadPvHelper();
            const context = createAdapter({ states: pvStates(), config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.stateStore.set('photovoltaic.power_generated_w', 100);
            await helper._safeRecalc('low');
            const afterrun = context.timers.find(timer => timer.delay === 120000);
            expect(afterrun).to.exist;
            expect(context.stateStore.get('pump.pump_switch')).to.equal(true);
        });

        it('cancels afterrun when surplus returns', async () => {
            const helper = loadPvHelper();
            const context = createAdapter({ states: pvStates(), config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.stateStore.set('photovoltaic.power_generated_w', 100);
            await helper._safeRecalc('low');
            const afterrun = context.timers.find(timer => timer.delay === 120000);
            if (!afterrun) {
                throw new Error('Afterrun timer missing');
            }
            context.stateStore.set('photovoltaic.power_generated_w', 1500);
            await helper._safeRecalc('return');
            expect(afterrun.cleared).to.equal(true);
            expect(context.stateStore.get('pump.pump_switch')).to.equal(true);
        });

        it('prevents pump work when cleanup interrupts a recalculation', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            let blockRead = false;
            const helper = loadPvHelper();
            const context = createAdapter({
                states: pvStates(),
                config: pvConfig,
                onRead: async id => {
                    if (blockRead && id === 'status.season_active') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.writes.length = 0;
            blockRead = true;
            const recalc = helper._safeRecalc('blocked');
            await entered.promise;
            helper.cleanup();
            gate.resolve();
            await recalc;
            expect(context.writes).to.have.length(0);
        });

        it('does not execute an old afterrun after cleanup', async () => {
            const helper = loadPvHelper();
            const context = createAdapter({ states: pvStates(), config: pvConfig });
            helper.init(context.adapter);
            await finishInitialization(helper);
            context.stateStore.set('photovoltaic.power_generated_w', 100);
            await helper._safeRecalc('low');
            const afterrun = context.timers.find(timer => timer.delay === 120000);
            if (!afterrun) {
                throw new Error('Afterrun timer missing');
            }
            context.writes.length = 0;
            helper.cleanup();
            await afterrun.callback();
            expect(context.writes).to.have.length(0);
        });

        it('invalidates an old recalculation across re-init', async () => {
            const gate = createDeferred();
            const entered = createDeferred();
            const helper = loadPvHelper();
            const oldContext = createAdapter({
                states: pvStates(),
                config: pvConfig,
                onRead: async id => {
                    if (id === 'status.season_active') {
                        entered.resolve();
                        await gate.promise;
                    }
                },
            });
            helper.init(oldContext.adapter);
            const oldInitialization = helper._initializationPromise;
            await entered.promise;
            helper.cleanup();
            const newContext = createAdapter({ states: pvStates(), config: pvConfig });
            helper.init(newContext.adapter);
            const newInitialization = helper._initializationPromise;
            gate.resolve();
            await Promise.all([oldInitialization, newInitialization]);
            expect(oldContext.writes).to.have.length(0);
            expect(newContext.stateStore.get('pump.pump_switch')).to.equal(true);
        });
    });
});

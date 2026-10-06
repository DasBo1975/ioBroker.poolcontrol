'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const path = require('node:path');
const { expect } = require('chai');
const { I18n } = require('@iobroker/adapter-core');

const CHEMISTRY_PATH = require.resolve('../../lib/helpers/chemistryToolsHelper');
const SPEECH_PATH = require.resolve('../../lib/helpers/speechTextHelper');
const CONTROL_PATH = require.resolve('../../lib/helpers/controlHelper2');

const PH_PLUS_COMMAND = 'poolcontrol.0.chemistry.tools.ph_plus_calculator.05_calculate';
const PH_MINUS_COMMAND = 'poolcontrol.0.chemistry.tools.ph_minus_calculator.05_calculate';
const SALT_COMMAND = 'poolcontrol.0.chemistry.tools.salt_calculator.04_calculate';
const BACKWASH_COMMAND = 'poolcontrol.0.control.pump.backwash_start';

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Acknowledgement flag.
 */

/**
 * @typedef {object} FakeWrite
 * @property {'setStateAsync' | 'setStateChangedAsync'} method Write method.
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
 * @property {(id: string) => void | Promise<void>} [onSubscribe] Subscription hook.
 */

/**
 * @typedef {object} LoadedChemistryHelper
 * @property {Promise<void> | null} _initPromise Initialization barrier.
 * @property {Array<{id: string, state: FakeState}>} _pendingStateChanges Pending commands.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => void} cleanup Stop helper.
 */

/**
 * @typedef {object} LoadedSpeechHelper
 * @property {Array<{id: string, state: FakeState}>} _pendingStateChanges Pending messages.
 * @property {(adapter: object) => void} init Initialize helper.
 * @property {(id: string, state: FakeState | null | undefined) => Promise<void>} handleStateChange Handle event.
 * @property {() => void} cleanup Stop helper.
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

/** @returns {LoadedChemistryHelper} Fresh chemistry tools helper. */
function loadChemistry() {
    delete require.cache[CHEMISTRY_PATH];
    return /** @type {LoadedChemistryHelper} */ (require(CHEMISTRY_PATH));
}

/** @returns {LoadedSpeechHelper} Fresh speech text helper. */
function loadSpeech() {
    delete require.cache[SPEECH_PATH];
    return /** @type {LoadedSpeechHelper} */ (require(SPEECH_PATH));
}

/** @returns {LoadedControlHelper} Fresh control helper. */
function loadControl() {
    delete require.cache[CONTROL_PATH];
    return /** @type {LoadedControlHelper} */ (require(CONTROL_PATH));
}

/**
 * @param {AdapterOptions} [options] Fake adapter options.
 */
function createAdapter({ states = {}, onRead, onSubscribe } = {}) {
    const stateStore = new Map(Object.entries(states));
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const reads = [];
    /** @type {string[]} */
    const subscriptions = [];
    /** @type {string[]} */
    const warnings = [];
    /** @type {Map<number, FakeTimer>} */
    const timers = new Map();
    /** @type {FakeTimer[]} */
    const timerCreations = [];
    let timerSequence = 0;

    /**
     * @param {FakeWrite['method']} method Write method.
     * @param {string} id State id.
     * @param {FakeState} state Written state.
     */
    function recordWrite(method, id, state) {
        const stored = { ...state };
        writes.push({ method, id, state: stored });
        stateStore.set(id, stored.val);
    }

    const adapter = {
        log: {
            silly: () => undefined,
            debug: () => undefined,
            info: () => undefined,
            warn: message => warnings.push(String(message)),
            error: message => warnings.push(String(message)),
        },
        subscribeStates(id) {
            subscriptions.push(id);
        },
        async subscribeStatesAsync(id) {
            subscriptions.push(id);
            await onSubscribe?.(id);
        },
        async getStateAsync(id) {
            reads.push(id);
            await onRead?.(id);
            return stateStore.has(id) ? { val: stateStore.get(id) } : null;
        },
        async setStateAsync(id, state) {
            recordWrite('setStateAsync', id, state);
        },
        async setStateChangedAsync(id, state) {
            recordWrite('setStateChangedAsync', id, state);
        },
        setTimeout(callback, delay) {
            const timer = { id: ++timerSequence, callback, delay };
            timers.set(timer.id, timer);
            timerCreations.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            timers.delete(timer.id);
        },
    };

    return {
        adapter,
        stateStore,
        writes,
        reads,
        subscriptions,
        warnings,
        timers,
        timerCreations,
        writesFor(id) {
            return writes.filter(write => write.id === id);
        },
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Valid calculator values. */
function chemistryStates() {
    return {
        'general.pool_size': 30000,
        'chemistry.ph.input.current_value': 7.2,
        'chemistry.tools.ph_plus_calculator.01_pool_volume_l': 30000,
        'chemistry.tools.ph_plus_calculator.02_current_ph': 7.2,
        'chemistry.tools.ph_plus_calculator.03_target_ph': 7.4,
        'chemistry.tools.ph_plus_calculator.04_grams_per_10000l_01ph': 100,
        'chemistry.tools.ph_minus_calculator.01_pool_volume_l': 30000,
        'chemistry.tools.ph_minus_calculator.02_current_ph': 7.4,
        'chemistry.tools.ph_minus_calculator.03_target_ph': 7.2,
        'chemistry.tools.ph_minus_calculator.04_grams_per_10000l_01ph': 100,
        'chemistry.tools.salt_calculator.01_pool_volume_l': 30000,
        'chemistry.tools.salt_calculator.02_current_salt_ppm': 1000,
        'chemistry.tools.salt_calculator.03_target_salt_ppm': 2000,
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Enabled speech source values. */
function speechStates() {
    return {
        'solar.warn_speech': true,
        'temperature.collector.current': 78,
        'solar.warn_temp': 75,
        'speech.sources.solar.enabled': true,
        'speech.sources.solar.cooldown_minutes': 0,
        'speech.sources.time.enabled': true,
        'speech.sources.time.cooldown_minutes': 0,
    };
}

/** @returns {Record<string, ioBroker.StateValue>} Enabled reminder values. */
function controlStates() {
    return {
        'control.pump.notifications_enabled': true,
        'control.pump.backwash_reminder_active': true,
        'control.pump.backwash_interval_days': 7,
        'control.pump.backwash_last_date': new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    };
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

describe('Lifecycle audit group 2', () => {
    before(async () => {
        await I18n.init(path.resolve(__dirname, '../../lib'), 'en');
    });

    describe('chemistryToolsHelper', () => {
        it('ignores a normal state event before init without throwing', async () => {
            const helper = loadChemistry();
            await helper.handleStateChange('poolcontrol.0.general.pool_size', { val: 30000, ack: false });
            expect(helper._pendingStateChanges).to.have.length(0);
        });

        it('compensates a pre-init source state event through init prefill', async () => {
            const helper = loadChemistry();
            await helper.handleStateChange('poolcontrol.0.general.pool_size', { val: 30000, ack: false });
            const env = createAdapter({
                states: {
                    ...chemistryStates(),
                    'chemistry.tools.ph_plus_calculator.01_pool_volume_l': 0,
                    'chemistry.tools.ph_minus_calculator.01_pool_volume_l': 0,
                    'chemistry.tools.salt_calculator.01_pool_volume_l': 0,
                },
            });
            helper.init(env.adapter);
            await helper._initPromise;
            expect(env.stateStore.get('chemistry.tools.ph_plus_calculator.01_pool_volume_l')).to.equal(30000);
            expect(env.stateStore.get('chemistry.tools.ph_minus_calculator.01_pool_volume_l')).to.equal(30000);
            expect(env.stateStore.get('chemistry.tools.salt_calculator.01_pool_volume_l')).to.equal(30000);
        });

        it('replays one observed pre-init command exactly once', async () => {
            const helper = loadChemistry();
            await helper.handleStateChange(PH_PLUS_COMMAND, { val: true, ack: false });
            const env = createAdapter({ states: chemistryStates() });
            helper.init(env.adapter);
            await helper._initPromise;
            expect(env.writesFor('chemistry.tools.ph_plus_calculator.10_result_grams')).to.have.length(1);
            expect(env.writesFor('chemistry.tools.ph_plus_calculator.05_calculate')).to.have.length(1);
        });

        it('replays multiple observed commands in FIFO order', async () => {
            const helper = loadChemistry();
            await helper.handleStateChange(PH_PLUS_COMMAND, { val: true, ack: false });
            await helper.handleStateChange(PH_MINUS_COMMAND, { val: true, ack: false });
            await helper.handleStateChange(SALT_COMMAND, { val: true, ack: false });
            const env = createAdapter({ states: chemistryStates() });
            helper.init(env.adapter);
            await helper._initPromise;
            const acknowledgements = env.writes
                .filter(write => write.state.val === false && write.state.ack === true)
                .map(write => write.id);
            expect(acknowledgements).to.deep.equal([
                'chemistry.tools.ph_plus_calculator.05_calculate',
                'chemistry.tools.ph_minus_calculator.05_calculate',
                'chemistry.tools.salt_calculator.04_calculate',
            ]);
        });

        it('replays a command observed during async init exactly once', async () => {
            const gate = createDeferred();
            let blocked = false;
            const env = createAdapter({
                states: chemistryStates(),
                onSubscribe: async () => {
                    if (!blocked) {
                        blocked = true;
                        await gate.promise;
                    }
                },
            });
            const helper = loadChemistry();
            helper.init(env.adapter);
            await helper.handleStateChange(PH_PLUS_COMMAND, { val: true, ack: false });
            gate.resolve(undefined);
            await helper._initPromise;
            expect(env.writesFor('chemistry.tools.ph_plus_calculator.05_calculate')).to.have.length(1);
        });

        it('preserves the normal calculator result and acknowledgement', async () => {
            const env = createAdapter({ states: chemistryStates() });
            const helper = loadChemistry();
            helper.init(env.adapter);
            await helper._initPromise;
            await helper.handleStateChange(PH_PLUS_COMMAND, { val: true, ack: false });
            expect(env.writesFor('chemistry.tools.ph_plus_calculator.10_result_grams')[0]?.state.val).to.equal(600);
            expect(env.writesFor('chemistry.tools.ph_plus_calculator.05_calculate')[0]?.state).to.deep.equal({
                val: false,
                ack: true,
            });
        });

        it('clears buffered commands during cleanup', async () => {
            const helper = loadChemistry();
            await helper.handleStateChange(PH_PLUS_COMMAND, { val: true, ack: false });
            helper.cleanup();
            expect(helper._pendingStateChanges).to.have.length(0);
        });

        it('ignores commands after cleanup', async () => {
            const env = createAdapter({ states: chemistryStates() });
            const helper = loadChemistry();
            helper.init(env.adapter);
            await helper._initPromise;
            helper.cleanup();
            const writeCount = env.writes.length;
            await helper.handleStateChange(PH_PLUS_COMMAND, { val: true, ack: false });
            expect(env.writes).to.have.length(writeCount);
        });
    });

    describe('speechTextHelper', () => {
        it('buffers a message-relevant event before init', async () => {
            const helper = loadSpeech();
            await helper.handleStateChange('poolcontrol.0.speech.solar_active', { val: true, ack: true });
            expect(helper._pendingStateChanges).to.have.length(1);
        });

        it('keeps multiple pre-init messages in FIFO output order', async () => {
            const helper = loadSpeech();
            await helper.handleStateChange('poolcontrol.0.speech.solar_active', { val: true, ack: true });
            await helper.handleStateChange('poolcontrol.0.speech.time_active', { val: false, ack: true });
            const env = createAdapter({ states: speechStates() });
            helper.init(env.adapter);
            await settle();
            expect(env.writesFor('speech.queue').map(write => write.state.val)).to.deep.equal([
                'Die Poolpumpe wurde durch die Solarsteuerung eingeschaltet.',
                'Zeitsteuerung beendet – Poolpumpe ausgeschaltet.',
            ]);
        });

        it('outputs one buffered warning exactly once after init', async () => {
            const helper = loadSpeech();
            await helper.handleStateChange('poolcontrol.0.solar.collector_warning', { val: true, ack: true });
            const env = createAdapter({ states: speechStates() });
            helper.init(env.adapter);
            await settle();
            expect(env.writesFor('speech.queue')).to.have.length(1);
        });

        it('does not duplicate a replayed message', async () => {
            const helper = loadSpeech();
            await helper.handleStateChange('poolcontrol.0.speech.time_active', { val: true, ack: true });
            const env = createAdapter({ states: speechStates() });
            helper.init(env.adapter);
            await settle();
            await settle();
            expect(env.writesFor('speech.queue')).to.have.length(1);
        });

        it('preserves normal solar status and speech writes', async () => {
            const env = createAdapter({ states: speechStates() });
            const helper = loadSpeech();
            helper.init(env.adapter);
            await helper.handleStateChange('poolcontrol.0.speech.solar_active', { val: true, ack: true });
            expect(env.writes.map(write => [write.id, write.state.val])).to.deep.equal([
                ['pump.status', 'EIN (Solarsteuerung)'],
                ['speech.queue', 'Die Poolpumpe wurde durch die Solarsteuerung eingeschaltet.'],
                ['speech.sources.solar.last_sent', env.writes[2].state.val],
            ]);
        });

        it('clears buffered messages during cleanup', async () => {
            const helper = loadSpeech();
            await helper.handleStateChange('poolcontrol.0.speech.solar_active', { val: true, ack: true });
            helper.cleanup();
            expect(helper._pendingStateChanges).to.have.length(0);
        });

        it('does not output an in-flight message after cleanup', async () => {
            const gate = createDeferred();
            const env = createAdapter({
                states: speechStates(),
                onRead: async id => {
                    if (id === 'speech.sources.solar.enabled') {
                        await gate.promise;
                    }
                },
            });
            const helper = loadSpeech();
            helper.init(env.adapter);
            const handling = helper.handleStateChange('poolcontrol.0.speech.solar_active', { val: true, ack: true });
            helper.cleanup();
            gate.resolve(undefined);
            await handling;
            expect(env.writes).to.have.length(0);
        });

        it('logs an event error without triggering the adapter getter again', async () => {
            const env = createAdapter({
                states: speechStates(),
                onRead: () => {
                    throw new Error('controlled read failure');
                },
            });
            const helper = loadSpeech();
            helper.init(env.adapter);
            await helper.handleStateChange('poolcontrol.0.speech.solar_active', { val: true, ack: true });
            expect(env.warnings).to.have.length(1);
            expect(env.warnings[0]).to.include('controlled read failure');
        });
    });

    describe('controlHelper2', () => {
        it('processes one observed pre-init backwash command exactly once', async () => {
            const helper = loadControl();
            await helper.handleStateChange(BACKWASH_COMMAND, { val: true, ack: false });
            const env = createAdapter({ states: controlStates() });
            helper.init(env.adapter);
            await settle();
            expect(env.writesFor('control.pump.backwash_required')).to.have.length(1);
            expect(env.writesFor('control.pump.backwash_last_date')).to.have.length(1);
        });

        it('processes multiple observed pre-init commands serially and exactly once', async () => {
            const helper = loadControl();
            await helper.handleStateChange(BACKWASH_COMMAND, { val: true, ack: false });
            await helper.handleStateChange(BACKWASH_COMMAND, { val: true, ack: false });
            const env = createAdapter({ states: controlStates() });
            helper.init(env.adapter);
            await settle();
            expect(env.writesFor('control.pump.backwash_required')).to.have.length(2);
            expect(env.writesFor('control.pump.backwash_last_date')).to.have.length(2);
        });

        it('does not reinterpret a persisted true button during init', async () => {
            const env = createAdapter({ states: { ...controlStates(), 'control.pump.backwash_start': true } });
            const helper = loadControl();
            helper.init(env.adapter);
            await settle();
            expect(env.writes).to.have.length(0);
        });

        it('preserves the normal backwash reset writes and message', async () => {
            const env = createAdapter({ states: controlStates() });
            const helper = loadControl();
            helper.init(env.adapter);
            await helper.handleStateChange(BACKWASH_COMMAND, { val: true, ack: false });
            expect(env.writes.map(write => write.id)).to.deep.equal([
                'control.pump.backwash_required',
                'control.pump.backwash_last_date',
                'speech.queue',
            ]);
        });

        it('preserves the normal reminder timer check and rescheduling', async () => {
            const env = createAdapter({ states: controlStates() });
            const helper = loadControl();
            helper.init(env.adapter);
            const timer = env.timerCreations[0];
            expect(timer).to.exist;
            if (!timer) {
                throw new Error('Missing reminder timer');
            }
            env.timers.delete(timer.id);
            await timer.callback();
            expect(env.writesFor('control.pump.backwash_required')[0]?.state.val).to.equal(true);
            expect(env.writesFor('speech.queue')).to.have.length(1);
            expect(env.timerCreations).to.have.length(2);
        });

        it('clears the reminder timer during cleanup', () => {
            const env = createAdapter({ states: controlStates() });
            const helper = loadControl();
            helper.init(env.adapter);
            expect(env.timers).to.have.length(1);
            helper.cleanup();
            expect(env.timers).to.have.length(0);
        });

        it('does not let an old timer callback schedule after cleanup', async () => {
            const env = createAdapter({ states: controlStates() });
            const helper = loadControl();
            helper.init(env.adapter);
            const timer = env.timerCreations[0];
            expect(timer).to.exist;
            if (!timer) {
                throw new Error('Missing reminder timer');
            }
            helper.cleanup();
            await timer.callback();
            expect(env.timerCreations).to.have.length(1);
            expect(env.writes).to.have.length(0);
        });

        it('ignores a backwash command after cleanup', async () => {
            const env = createAdapter({ states: controlStates() });
            const helper = loadControl();
            helper.init(env.adapter);
            helper.cleanup();
            await helper.handleStateChange(BACKWASH_COMMAND, { val: true, ack: false });
            expect(env.writes).to.have.length(0);
        });
    });
});

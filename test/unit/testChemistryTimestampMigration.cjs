'use strict';

/* eslint-disable jsdoc/check-tag-names -- Test-only JSDoc types are consumed by TypeScript checkJs. */

const { expect } = require('chai');

const MIGRATION_HELPER_PATH = require.resolve('../../lib/helpers/migrationHelper');

const TIMESTAMP_IDS = [
    'chemistry.ph.input.last_value_at',
    'chemistry.ph.input.previous_value_at',
    'chemistry.ph.input.last_valid_value_at',
    'chemistry.ph.history.oldest_sample_at',
    'chemistry.ph.history.newest_sample_at',
    'chemistry.ph.trend.reference_24h_at',
    'chemistry.ph.trend.reference_7d_at',
    'chemistry.ph.trend.reference_30d_at',
    'chemistry.ph.debug.last_update',
    'chemistry.orp.input.last_value_at',
    'chemistry.orp.input.previous_value_at',
    'chemistry.orp.input.last_valid_value_at',
    'chemistry.orp.history.oldest_sample_at',
    'chemistry.orp.history.newest_sample_at',
    'chemistry.orp.trend.reference_24h_at',
    'chemistry.orp.trend.reference_7d_at',
    'chemistry.orp.trend.reference_30d_at',
    'chemistry.orp.debug.last_update',
    'chemistry.tds.input.last_value_at',
    'chemistry.tds.input.previous_value_at',
    'chemistry.tds.input.last_valid_value_at',
    'chemistry.tds.history.oldest_sample_at',
    'chemistry.tds.history.newest_sample_at',
    'chemistry.tds.trend.reference_24h_at',
    'chemistry.tds.trend.reference_7d_at',
    'chemistry.tds.trend.reference_30d_at',
    'chemistry.tds.debug.last_update',
    'chemistry.tds.reference.initial_value_at',
];

const PRIMARY_ID = TIMESTAMP_IDS[0];
const SECONDARY_ID = TIMESTAMP_IDS[1];

/**
 * @typedef {object} FakeObject
 * @property {'state'} type Object type.
 * @property {Record<string, unknown>} common Common object metadata.
 * @property {Record<string, unknown>} native Native object metadata.
 */

/**
 * @typedef {object} FakeState
 * @property {ioBroker.StateValue} val State value.
 * @property {boolean} [ack] Optional acknowledgement flag.
 */

/**
 * @typedef {object} FakeExtend
 * @property {string} id State ID.
 * @property {{common: Record<string, unknown>}} update Object update.
 */

/**
 * @typedef {object} FakeWrite
 * @property {string} id State ID.
 * @property {FakeState} state Written state.
 */

/**
 * @typedef {object} ReadBarrier
 * @property {Promise<void>} entered Resolves when the read starts.
 * @property {() => void} markEntered Marks the read as started.
 * @property {Promise<void>} release Waits until the read may continue.
 * @property {() => void} allowRead Allows the read to continue.
 */

/**
 * @typedef {object} FakeAdapterOptions
 * @property {Map<string, FakeObject>} [objects] Initial objects.
 * @property {Map<string, FakeState | null>} [states] Initial states.
 * @property {Set<string>} [failingObjectReads] Object reads that should fail.
 * @property {Map<string, ReadBarrier>} [readBarriers] Controlled object reads.
 */

/**
 * @typedef {object} LoadedMigrationHelper
 * @property {(adapter: object) => Promise<void>} init Run all migrations.
 */

/** @returns {LoadedMigrationHelper} Fresh migrationHelper singleton. */
function loadFreshMigrationHelper() {
    delete require.cache[MIGRATION_HELPER_PATH];
    return /** @type {LoadedMigrationHelper} */ (require(MIGRATION_HELPER_PATH));
}

/** @returns {FakeObject} Confirmed pre-v1.3.18 timestamp object. */
function legacyObject() {
    return {
        type: 'state',
        common: { type: 'string', role: 'value.time', def: '', read: true, write: false, persist: true },
        native: {},
    };
}

/** @returns {FakeObject} Current timestamp object. */
function currentObject() {
    return {
        type: 'state',
        common: { type: 'number', role: 'value.time', def: 0, read: true, write: false, persist: true },
        native: {},
    };
}

/** @returns {ReadBarrier} A manually released object-read barrier. */
function createReadBarrier() {
    /** @type {() => void} */
    let markEntered = () => undefined;
    /** @type {() => void} */
    let allowRead = () => undefined;
    /** @type {Promise<void>} */
    const entered = new Promise(resolve => {
        markEntered = () => resolve();
    });
    /** @type {Promise<void>} */
    const release = new Promise(resolve => {
        allowRead = () => resolve();
    });
    return { entered, markEntered, release, allowRead };
}

/**
 * @param {FakeAdapterOptions} [options] Fake adapter inputs.
 */
function createAdapter({
    objects = new Map(),
    states = new Map(),
    failingObjectReads = new Set(),
    readBarriers = new Map(),
} = {}) {
    /** @type {string[]} */
    const objectReads = [];
    /** @type {FakeExtend[]} */
    const extendsLog = [];
    /** @type {FakeWrite[]} */
    const writes = [];
    /** @type {string[]} */
    const warnings = [];

    const adapter = {
        log: {
            debug: () => undefined,
            info: () => undefined,
            warn: message => warnings.push(String(message)),
            error: () => undefined,
        },
        async getObjectAsync(id) {
            objectReads.push(id);
            const barrier = readBarriers.get(id);
            if (barrier) {
                barrier.markEntered();
                await barrier.release;
            }
            if (failingObjectReads.has(id)) {
                throw new Error(`controlled object read failure for ${id}`);
            }
            return objects.get(id) ?? null;
        },
        async getStateAsync(id) {
            return states.get(id);
        },
        async extendObjectAsync(id, update) {
            extendsLog.push({ id, update });
            const object = objects.get(id);
            if (object) {
                object.common = { ...object.common, ...update.common };
            }
        },
        async setStateChangedAsync(id, state) {
            const write = { id, state: { ...state } };
            writes.push(write);
            states.set(id, write.state);
        },
        async getAdapterObjectsAsync() {
            return {};
        },
        async delStateAsync() {
            return undefined;
        },
        async delObjectAsync() {
            return undefined;
        },
    };

    return {
        adapter,
        objects,
        states,
        objectReads,
        extendsLog,
        writes,
        warnings,
        clearMutations() {
            extendsLog.length = 0;
            writes.length = 0;
        },
    };
}

/**
 * @param {ioBroker.StateValue} value Initial state value.
 */
async function migrateLegacyValue(value) {
    const objects = new Map([[PRIMARY_ID, legacyObject()]]);
    const states = new Map([[PRIMARY_ID, { val: value }]]);
    const fake = createAdapter({ objects, states });
    const helper = loadFreshMigrationHelper();
    await helper.init(fake.adapter);
    return fake;
}

describe('Chemistry timestamp migration', () => {
    it('converts a valid German legacy timestamp with comma', async () => {
        const fake = await migrateLegacyValue('11.05.2026, 19:20:03');
        const expected = new Date(2026, 4, 11, 19, 20, 3).getTime();

        expect(fake.objects.get(PRIMARY_ID)?.common).to.include({ type: 'number', def: 0 });
        expect(fake.writes).to.deep.equal([{ id: PRIMARY_ID, state: { val: expected, ack: true } }]);
    });

    it('converts the valid German legacy timestamp without comma', async () => {
        const fake = await migrateLegacyValue('11.05.2026 19:20:03');
        const expected = new Date(2026, 4, 11, 19, 20, 3).getTime();

        expect(fake.writes[0]?.state).to.deep.equal({ val: expected, ack: true });
    });

    it('converts an empty string to zero', async () => {
        const fake = await migrateLegacyValue('');
        expect(fake.writes[0]?.state).to.deep.equal({ val: 0, ack: true });
    });

    it('converts null to zero', async () => {
        const objects = new Map([[PRIMARY_ID, legacyObject()]]);
        const states = new Map([[PRIMARY_ID, null]]);
        const fake = createAdapter({ objects, states });
        await loadFreshMigrationHelper().init(fake.adapter);

        expect(fake.writes[0]?.state).to.deep.equal({ val: 0, ack: true });
    });

    it('converts a missing state or undefined value to zero', async () => {
        const objects = new Map([[PRIMARY_ID, legacyObject()]]);
        const fake = createAdapter({ objects });
        await loadFreshMigrationHelper().init(fake.adapter);

        expect(fake.writes[0]?.state).to.deep.equal({ val: 0, ack: true });
    });

    it('preserves a finite number without a state write', async () => {
        const fake = await migrateLegacyValue(1710000000000);

        expect(fake.objects.get(PRIMARY_ID)?.common).to.include({ type: 'number', def: 0 });
        expect(fake.writes).to.have.length(0);
        expect(fake.states.get(PRIMARY_ID)?.val).to.equal(1710000000000);
    });

    it('skips an already current number value.time object entirely', async () => {
        const objects = new Map([[PRIMARY_ID, currentObject()]]);
        const states = new Map([[PRIMARY_ID, { val: 1710000000000 }]]);
        const fake = createAdapter({ objects, states });
        await loadFreshMigrationHelper().init(fake.adapter);

        expect(fake.extendsLog).to.have.length(0);
        expect(fake.writes).to.have.length(0);
    });

    it('preserves an unknown string and warns', async () => {
        const fake = await migrateLegacyValue('unknown timestamp');

        expect(fake.states.get(PRIMARY_ID)?.val).to.equal('unknown timestamp');
        expect(fake.writes).to.have.length(0);
        expect(fake.warnings.some(message => message.includes(PRIMARY_ID))).to.equal(true);
    });

    it('does not interpret a numeric string', async () => {
        const fake = await migrateLegacyValue('1710000000000');

        expect(fake.states.get(PRIMARY_ID)?.val).to.equal('1710000000000');
        expect(fake.writes).to.have.length(0);
        expect(fake.warnings.some(message => message.includes(PRIMARY_ID))).to.equal(true);
    });

    it('does not interpret an ISO string', async () => {
        const value = '2026-05-11T19:20:03.000Z';
        const fake = await migrateLegacyValue(value);

        expect(fake.states.get(PRIMARY_ID)?.val).to.equal(value);
        expect(fake.writes).to.have.length(0);
        expect(fake.warnings.some(message => message.includes(PRIMARY_ID))).to.equal(true);
    });

    it('rejects an invalid German calendar date', async () => {
        const value = '31.02.2026, 19:20:03';
        const fake = await migrateLegacyValue(value);

        expect(fake.states.get(PRIMARY_ID)?.val).to.equal(value);
        expect(fake.writes).to.have.length(0);
        expect(fake.warnings.some(message => message.includes(PRIMARY_ID))).to.equal(true);
    });

    it('skips objects with an unexpected role or type and warns', async () => {
        const unexpectedRole = legacyObject();
        unexpectedRole.common.role = 'text';
        const unexpectedType = legacyObject();
        unexpectedType.common.type = 'boolean';
        const objects = new Map([
            [PRIMARY_ID, unexpectedRole],
            [SECONDARY_ID, unexpectedType],
        ]);
        const fake = createAdapter({ objects });
        await loadFreshMigrationHelper().init(fake.adapter);

        expect(fake.extendsLog).to.have.length(0);
        expect(fake.writes).to.have.length(0);
        expect(fake.warnings.some(message => message.includes(PRIMARY_ID))).to.equal(true);
        expect(fake.warnings.some(message => message.includes(SECONDARY_ID))).to.equal(true);
    });

    it('checks exactly the 28 confirmed allowlist IDs without duplicates', async () => {
        const objects = new Map(TIMESTAMP_IDS.map(id => [id, currentObject()]));
        const fake = createAdapter({ objects });
        await loadFreshMigrationHelper().init(fake.adapter);
        const chemistryReads = fake.objectReads.filter(id => id.startsWith('chemistry.'));

        expect(TIMESTAMP_IDS).to.have.length(28);
        expect(new Set(TIMESTAMP_IDS).size).to.equal(28);
        expect(chemistryReads).to.deep.equal(TIMESTAMP_IDS);
    });

    it('is mutation-free on the second migration run', async () => {
        const objects = new Map([[PRIMARY_ID, legacyObject()]]);
        const states = new Map([[PRIMARY_ID, { val: '11.05.2026, 19:20:03' }]]);
        const fake = createAdapter({ objects, states });
        const helper = loadFreshMigrationHelper();
        await helper.init(fake.adapter);
        fake.clearMutations();

        await helper.init(fake.adapter);

        expect(fake.extendsLog).to.have.length(0);
        expect(fake.writes).to.have.length(0);
    });

    it('continues with remaining IDs after one object read fails', async () => {
        const objects = new Map([
            [PRIMARY_ID, legacyObject()],
            [SECONDARY_ID, legacyObject()],
        ]);
        const states = new Map([[SECONDARY_ID, { val: '' }]]);
        const fake = createAdapter({ objects, states, failingObjectReads: new Set([PRIMARY_ID]) });
        await loadFreshMigrationHelper().init(fake.adapter);

        expect(fake.objects.get(SECONDARY_ID)?.common).to.include({ type: 'number', def: 0 });
        expect(fake.writes).to.deep.equal([{ id: SECONDARY_ID, state: { val: 0, ack: true } }]);
        expect(fake.warnings.some(message => message.includes(PRIMARY_ID))).to.equal(true);
    });

    it('awaits the Chemistry timestamp migration inside init', async () => {
        const barrier = createReadBarrier();
        const objects = new Map([[PRIMARY_ID, legacyObject()]]);
        const fake = createAdapter({ objects, readBarriers: new Map([[PRIMARY_ID, barrier]]) });
        const helper = loadFreshMigrationHelper();
        let initFinished = false;

        const initPromise = helper.init(fake.adapter).then(() => {
            initFinished = true;
        });
        await barrier.entered;
        expect(initFinished).to.equal(false);

        barrier.allowRead();
        await initPromise;
        expect(initFinished).to.equal(true);
        expect(fake.objects.get(PRIMARY_ID)?.common.type).to.equal('number');
    });
});

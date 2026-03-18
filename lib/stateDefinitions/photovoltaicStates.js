'use strict';

/**
 * createPhotovoltaicStates(adapter)
 * -------------------------------------------------------------
 * Legt alle States für den Photovoltaik-Bereich an.
 * - persistente States
 * - überinstallationsgeschützt (keine Überschreibung vorhandener Werte)
 * - konsistent im Stil der übrigen State-Dateien
 * -------------------------------------------------------------
 */

/**
 * @param {object} adapter - ioBroker Adapterinstanz
 * @returns {Promise<void>}
 */
async function createPhotovoltaicStates(adapter) {
    adapter.log.debug('[createPhotovoltaicStates] Initialization started.');

    // --- Photovoltaik-Hauptordner ---
    await adapter.setObjectNotExistsAsync('photovoltaic', {
        type: 'channel',
        common: { name: 'Photovoltaics (Surplus Detection)' },
        native: {},
    });

    // --- State-Liste ---
    const states = [
        {
            id: 'power_generated_w',
            name: 'PV generation power (W)',
            desc: 'Current generated power of the PV system in watts',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'power_house_w',
            name: 'House consumption (W)',
            desc: 'Current power consumption of the house in watts',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'power_surplus_w',
            name: 'PV surplus power (W)',
            desc: 'Calculated surplus between PV generation and house consumption',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'surplus_active',
            name: 'PV surplus active',
            desc: 'Indicates whether a PV surplus is currently present (true/false)',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            def: false,
        },
        {
            id: 'afterrun_min',
            name: 'After-run time (minutes)',
            desc: 'Duration the pump continues to run after PV surplus ends',
            type: 'number',
            role: 'level',
            unit: 'min',
            read: true,
            write: true,
            def: 2,
        },
        {
            id: 'ignore_on_circulation',
            name: 'Ignore PV when circulation target is reached',
            desc: 'If enabled, PV control is disabled once daily circulation target is met',
            type: 'boolean',
            role: 'switch.enable',
            read: true,
            write: true,
            def: false,
        },
        {
            id: 'threshold_w',
            name: 'PV surplus threshold (W)',
            desc: 'Watt threshold at which a surplus is detected',
            type: 'number',
            role: 'value',
            unit: 'W',
            read: true,
            write: false,
            def: 200,
        },
        {
            id: 'status_text',
            name: 'Status message (text)',
            desc: 'Plain text status of PV detection (e.g. surplus active)',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        {
            id: 'last_update',
            name: 'Last update',
            desc: 'Timestamp of the last PV value calculation',
            type: 'string',
            role: 'date',
            read: true,
            write: false,
            def: '',
        },
    ];

    // --- States anlegen ---
    for (const s of states) {
        const id = `photovoltaic.${s.id}`;

        await adapter.setObjectNotExistsAsync(id, {
            type: 'state',
            common: {
                name: s.name,
                desc: s.desc,
                type: s.type,
                role: s.role,
                read: s.read,
                write: s.write,
                def: s.def,
                unit: s.unit || '',
                persist: true,
            },
            native: {},
        });

        // Überinstallationsschutz
        const existing = await adapter.getStateAsync(id);
        if (existing === null || existing === undefined) {
            await adapter.setStateAsync(id, { val: s.def, ack: true });
            adapter.log.debug(`[createPhotovoltaicStates] New state '${id}' initialized with default value ${s.def}.`);
        } else {
            adapter.log.debug(`[createPhotovoltaicStates] State '${id}' already exists - keeping existing value.`);
        }
    }

    adapter.log.info('[createPhotovoltaicStates] Initialization completed.');
}

module.exports = { createPhotovoltaicStates };

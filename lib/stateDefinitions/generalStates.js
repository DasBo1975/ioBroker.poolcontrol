'use strict';

/**
 * Legt alle States für die allgemeinen Einstellungen an:
 * - pool_name
 * - pool_size
 * - min_circulation_per_day
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createGeneralStates(adapter) {
    // Channel: Allgemein
    await adapter.setObjectNotExistsAsync('general', {
        type: 'channel',
        common: {
            name: {
                en: 'General settings',
                de: 'Allgemeine Einstellungen',
            },
        },
        native: {},
    });

    // Poolname
    await adapter.setObjectNotExistsAsync('general.pool_name', {
        type: 'state',
        common: {
            name: {
                en: 'Name of your pool',
                de: 'Name Ihres Pools',
            },
            desc: {
                en: 'Configured name of the pool',
                de: 'Konfigurierter Name des Pools',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('general.pool_name', {
        val: adapter.config.pool_name,
        ack: true,
    });

    // Minimale Umwälzung pro Tag
    await adapter.setObjectNotExistsAsync('general.min_circulation_per_day', {
        type: 'state',
        common: {
            name: {
                en: 'Min. circulation per day',
                de: 'Min. Umwaelzung pro Tag',
            },
            desc: {
                en: 'Configured minimum circulation count per day',
                de: 'Konfigurierte minimale Umwaelzung pro Tag',
            },
            type: 'number',
            role: 'value',
            unit: 'x',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('general.min_circulation_per_day', {
        val: adapter.config.min_circulation_per_day,
        ack: true,
    });

    // Poolgröße (Liter)
    await adapter.setObjectNotExistsAsync('general.pool_size', {
        type: 'state',
        common: {
            name: {
                en: 'Size of your pool in liters',
                de: 'Groesse Ihres Pools in Litern',
            },
            desc: {
                en: 'Configured pool size in liters',
                de: 'Konfigurierte Poolgroesse in Litern',
            },
            type: 'number',
            role: 'value',
            unit: 'l',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('general.pool_size', {
        val: adapter.config.pool_size,
        ack: true,
    });
}

module.exports = {
    createGeneralStates,
};

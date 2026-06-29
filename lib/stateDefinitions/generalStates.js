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
                en: 'Effective minimum circulation count per day. The admin value is used only as an initial value if this state is empty or invalid.',
                de: 'Wirksame minimale Umwaelzung pro Tag. Der Admin-Wert wird nur als Initialwert verwendet, wenn dieser State leer oder ungueltig ist.',
            },
            type: 'number',
            role: 'value',
            unit: 'x',
            read: true,
            write: true,
            min: 0.5,
            max: 3,
            step: 0.5,
            persist: true,
        },
        native: {},
    });
    await adapter.extendObjectAsync('general.min_circulation_per_day', {
        common: {
            write: true,
            min: 0.5,
            max: 3,
            step: 0.5,
            persist: true,
        },
    });

    const normalizeMinCirculation = value => {
        const num = Number(value);
        return Number.isFinite(num) && num >= 0.5 && num <= 3 ? num : null;
    };
    const configMinCirculation = normalizeMinCirculation(adapter.config.min_circulation_per_day) ?? 1;
    const existingMinCirculation = normalizeMinCirculation(
        (await adapter.getStateAsync('general.min_circulation_per_day'))?.val,
    );

    if (existingMinCirculation === null) {
        await adapter.setStateAsync('general.min_circulation_per_day', {
            val: configMinCirculation,
            ack: true,
        });
    }

    await adapter.setObjectNotExistsAsync('general.min_circulation_effective_per_day', {
        type: 'state',
        common: {
            name: {
                en: 'Effective minimum circulation per day',
                de: 'Wirksame minimale Umwaelzung pro Tag',
            },
            desc: {
                en: 'Currently effective circulation factor including the optional temperature-dependent addition',
                de: 'Aktuell wirksamer Umwaelzfaktor inklusive der optionalen temperaturabhaengigen Erhoehung',
            },
            type: 'number',
            role: 'value',
            unit: 'x',
            read: true,
            write: false,
            def: configMinCirculation,
            min: 0.5,
            max: 3,
            step: 0.1,
            persist: true,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('general.min_circulation_effective_reason', {
        type: 'state',
        common: {
            name: {
                en: 'Reason for effective minimum circulation',
                de: 'Grund fuer wirksame minimale Umwaelzung',
            },
            desc: {
                en: 'Technical reason for the currently effective circulation factor',
                de: 'Technischer Grund fuer den aktuell wirksamen Umwaelzfaktor',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: 'base',
        },
        native: {},
    });

    const existingEffectiveMinCirculation = await adapter.getStateAsync('general.min_circulation_effective_per_day');
    if (
        existingEffectiveMinCirculation === null ||
        existingEffectiveMinCirculation.val === null ||
        existingEffectiveMinCirculation.val === undefined
    ) {
        await adapter.setStateAsync('general.min_circulation_effective_per_day', {
            val: existingMinCirculation ?? configMinCirculation,
            ack: true,
        });
    }

    const existingEffectiveReason = await adapter.getStateAsync('general.min_circulation_effective_reason');
    if (
        existingEffectiveReason === null ||
        existingEffectiveReason.val === null ||
        existingEffectiveReason.val === undefined
    ) {
        await adapter.setStateAsync('general.min_circulation_effective_reason', { val: 'base', ack: true });
    }

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

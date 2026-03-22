'use strict';

/**
 * Legt alle States für Laufzeit- und Umwälzwerte an:
 * - runtime.total
 * - runtime.today
 * - runtime.start_count_today
 * - runtime.current_session
 * - runtime.season_total
 * - circulation.daily_total
 * - circulation.daily_required
 * - circulation.daily_remaining
 *
 * States sind persistent - behalten Werte über Neustart
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createRuntimeStates(adapter) {
    // --- Kanal runtime ---
    await adapter.setObjectNotExistsAsync('runtime', {
        type: 'channel',
        common: {
            name: {
                en: 'Pump runtime',
                de: 'Pumpenlaufzeit',
            },
        },
        native: {},
    });

    // Gesamtlaufzeit (formatiert)
    await adapter.setObjectNotExistsAsync('runtime.total', {
        type: 'state',
        common: {
            name: {
                en: 'Total runtime (formatted)',
                de: 'Gesamtlaufzeit (formatiert)',
            },
            desc: {
                en: 'Formatted total runtime of the pump',
                de: 'Formatierte Gesamtlaufzeit der Pumpe',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingTotal = await adapter.getStateAsync('runtime.total');
    if (!existingTotal || existingTotal.val === null || existingTotal.val === undefined) {
        await adapter.setStateAsync('runtime.total', { val: '0h 0m 0s', ack: true }); // FIX: Nur setzen, wenn leer
    }

    // Tageslaufzeit (formatiert)
    await adapter.setObjectNotExistsAsync('runtime.today', {
        type: 'state',
        common: {
            name: {
                en: 'Today runtime (formatted)',
                de: 'Heutige Laufzeit (formatiert)',
            },
            desc: {
                en: 'Formatted runtime of the pump for today',
                de: 'Formatierte Laufzeit der Pumpe fuer heute',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingToday = await adapter.getStateAsync('runtime.today');
    if (!existingToday || existingToday.val === null || existingToday.val === undefined) {
        await adapter.setStateAsync('runtime.today', { val: '0h 0m 0s', ack: true }); // FIX
    }

    // -------------------------------------------------------------------------
    // NEU: Pumpenstarts heute
    await adapter.setObjectNotExistsAsync('runtime.start_count_today', {
        type: 'state',
        common: {
            name: {
                en: 'Pump starts today',
                de: 'Pumpenstarts heute',
            },
            desc: {
                en: 'Number of pump starts counted today',
                de: 'Anzahl der heute gezaehlten Pumpenstarts',
            },
            type: 'number',
            role: 'value',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingStartCount = await adapter.getStateAsync('runtime.start_count_today');
    if (!existingStartCount || existingStartCount.val === null || existingStartCount.val === undefined) {
        await adapter.setStateAsync('runtime.start_count_today', { val: 0, ack: true }); // FIX
    }

    // NEU: Aktuelle Laufzeit (seit Einschalten)
    await adapter.setObjectNotExistsAsync('runtime.current_session', {
        type: 'state',
        common: {
            name: {
                en: 'Current runtime (since switched on)',
                de: 'Aktuelle Laufzeit (seit Einschalten)',
            },
            desc: {
                en: 'Current runtime since the pump was switched on',
                de: 'Aktuelle Laufzeit seit dem Einschalten der Pumpe',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingCurrent = await adapter.getStateAsync('runtime.current_session');
    if (!existingCurrent || existingCurrent.val === null || existingCurrent.val === undefined) {
        await adapter.setStateAsync('runtime.current_session', { val: '0h 0m 0s', ack: true }); // FIX
    }

    // NEU: Gesamtlaufzeit der aktuellen Saison (formatiert)
    await adapter.setObjectNotExistsAsync('runtime.season_total', {
        type: 'state',
        common: {
            name: {
                en: 'Total runtime current season (formatted)',
                de: 'Gesamtlaufzeit aktuelle Saison (formatiert)',
            },
            desc: {
                en: 'Total runtime of the pump for the current season',
                de: 'Gesamtlaufzeit der Pumpe fuer die aktuelle Saison',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingSeason = await adapter.getStateAsync('runtime.season_total');
    if (!existingSeason || existingSeason.val === null || existingSeason.val === undefined) {
        await adapter.setStateAsync('runtime.season_total', { val: '0h 0m 0s', ack: true }); // FIX
    }

    // -------------------------------------------------------------------------
    // --- Kanal circulation ---
    await adapter.setObjectNotExistsAsync('circulation', {
        type: 'channel',
        common: {
            name: {
                en: 'Circulation',
                de: 'Umwaelzung',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('circulation.daily_total', {
        type: 'state',
        common: {
            name: {
                en: 'Daily circulation volume',
                de: 'Taegliches Umwaelzvolumen',
            },
            desc: {
                en: 'Circulation volume accumulated today',
                de: 'Heutiges Gesamtumwaelzvolumen',
            },
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('circulation.daily_required', {
        type: 'state',
        common: {
            name: {
                en: 'Required daily circulation volume',
                de: 'Erforderliches taegliches Umwaelzvolumen',
            },
            desc: {
                en: 'Required circulation volume for the current day',
                de: 'Erforderliches Umwaelzvolumen fuer den aktuellen Tag',
            },
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('circulation.daily_required', {
        val: 0,
        ack: true,
    });

    await adapter.setObjectNotExistsAsync('circulation.daily_remaining', {
        type: 'state',
        common: {
            name: {
                en: 'Remaining circulation volume today',
                de: 'Verbleibendes Umwaelzvolumen heute',
            },
            desc: {
                en: 'Remaining circulation volume still needed for today',
                de: 'Verbleibendes Umwaelzvolumen, das heute noch benoetigt wird',
            },
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
}

module.exports = {
    createRuntimeStates,
};

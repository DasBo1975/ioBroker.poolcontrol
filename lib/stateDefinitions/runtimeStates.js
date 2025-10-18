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
        common: { name: 'Pumpenlaufzeit' },
        native: {},
    });

    // Gesamtlaufzeit (formatiert)
    await adapter.setObjectNotExistsAsync('runtime.total', {
        type: 'state',
        common: {
            name: 'Gesamtlaufzeit (formatiert)',
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
            name: 'Tageslaufzeit (formatiert)',
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
            name: 'Pumpenstarts heute',
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
            name: 'Aktuelle Laufzeit (seit Einschalten)',
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
            name: 'Gesamtlaufzeit aktuelle Saison (formatiert)',
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
        common: { name: 'Umwälzung' },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('circulation.daily_total', {
        type: 'state',
        common: {
            name: 'Tägliche Umwälzmenge',
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
            name: 'Erforderliche tägliche Umwälzmenge',
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
            name: 'Verbleibende Umwälzmenge heute',
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

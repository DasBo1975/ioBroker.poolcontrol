'use strict';

/**
 * Legt alle States für Laufzeit- und Umwälzwerte an:
 * - runtime.total
 * - runtime.total_seconds
 * - runtime.today
 * - runtime.today_seconds
 * - runtime.start_count_today
 * - runtime.current_session
 * - runtime.current_session_seconds
 * - runtime.season_total
 * - runtime.season_total_seconds
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

    // FIX: Gesamtlaufzeit als robuster Rohwert in Sekunden
    await adapter.setObjectNotExistsAsync('runtime.total_seconds', {
        type: 'state',
        common: {
            name: {
                en: 'Total runtime (seconds)',
                de: 'Gesamtlaufzeit (Sekunden)',
            },
            desc: {
                en: 'Total pump runtime as raw value in seconds',
                de: 'Gesamtlaufzeit der Pumpe als Rohwert in Sekunden',
            },
            type: 'number',
            role: 'value',
            unit: 's',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingTotalSeconds = await adapter.getStateAsync('runtime.total_seconds');
    if (!existingTotalSeconds || existingTotalSeconds.val === null || existingTotalSeconds.val === undefined) {
        await adapter.setStateAsync('runtime.total_seconds', { val: 0, ack: true });
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

    // FIX: Tageslaufzeit als robuster Rohwert in Sekunden
    await adapter.setObjectNotExistsAsync('runtime.today_seconds', {
        type: 'state',
        common: {
            name: {
                en: 'Today runtime (seconds)',
                de: 'Heutige Laufzeit (Sekunden)',
            },
            desc: {
                en: 'Pump runtime for today as raw value in seconds',
                de: 'Heutige Laufzeit der Pumpe als Rohwert in Sekunden',
            },
            type: 'number',
            role: 'value',
            unit: 's',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingTodaySeconds = await adapter.getStateAsync('runtime.today_seconds');
    if (!existingTodaySeconds || existingTodaySeconds.val === null || existingTodaySeconds.val === undefined) {
        await adapter.setStateAsync('runtime.today_seconds', { val: 0, ack: true });
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

    // FIX: Aktuelle Session als robuster Rohwert in Sekunden
    await adapter.setObjectNotExistsAsync('runtime.current_session_seconds', {
        type: 'state',
        common: {
            name: {
                en: 'Current runtime (seconds)',
                de: 'Aktuelle Laufzeit (Sekunden)',
            },
            desc: {
                en: 'Current pump runtime since switch-on as raw value in seconds',
                de: 'Aktuelle Laufzeit seit dem Einschalten der Pumpe als Rohwert in Sekunden',
            },
            type: 'number',
            role: 'value',
            unit: 's',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingCurrentSeconds = await adapter.getStateAsync('runtime.current_session_seconds');
    if (!existingCurrentSeconds || existingCurrentSeconds.val === null || existingCurrentSeconds.val === undefined) {
        await adapter.setStateAsync('runtime.current_session_seconds', { val: 0, ack: true });
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

    // FIX: Saisonlaufzeit als robuster Rohwert in Sekunden
    await adapter.setObjectNotExistsAsync('runtime.season_total_seconds', {
        type: 'state',
        common: {
            name: {
                en: 'Season runtime (seconds)',
                de: 'Saisonlaufzeit (Sekunden)',
            },
            desc: {
                en: 'Pump runtime for the current season as raw value in seconds',
                de: 'Laufzeit der Pumpe fuer die aktuelle Saison als Rohwert in Sekunden',
            },
            type: 'number',
            role: 'value',
            unit: 's',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingSeasonSeconds = await adapter.getStateAsync('runtime.season_total_seconds');
    if (!existingSeasonSeconds || existingSeasonSeconds.val === null || existingSeasonSeconds.val === undefined) {
        await adapter.setStateAsync('runtime.season_total_seconds', { val: 0, ack: true });
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

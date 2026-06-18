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
 * - circulation.plausibility.*
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

    // -------------------------------------------------------------------------
    // --- Plausibility check for circulation calculation ---
    await adapter.setObjectNotExistsAsync('circulation.plausibility', {
        type: 'channel',
        common: {
            name: {
                en: 'Plausibility check for circulation calculation',
                de: 'Plausibilitätsprüfung der Umwälzberechnung',
            },
        },
        native: {},
    });

    const plausibilityStates = [
        {
            id: '000_enabled',
            type: 'boolean',
            role: 'switch',
            write: true,
            def: true,
            name: { en: 'Enable plausibility check', de: 'Plausibilitätsprüfung aktivieren' },
            desc: {
                en: 'Enables or disables the circulation plausibility check.',
                de: 'Aktiviert oder deaktiviert die Plausibilitätsprüfung der Umwälzberechnung.',
            },
        },
        {
            id: '00_status',
            type: 'string',
            role: 'text',
            def: 'unchecked',
            name: { en: 'Plausibility check status', de: 'Status der Plausibilitätsprüfung' },
            desc: {
                en: 'Current status of the circulation plausibility check',
                de: 'Aktueller Status der Plausibilitätsprüfung für die Umwälzberechnung',
            },
        },
        {
            id: '01_level',
            type: 'string',
            role: 'text',
            def: 'info',
            states: { ok: 'ok', info: 'info', warning: 'warning' },
            name: { en: 'Plausibility check level', de: 'Bewertungsstufe der Plausibilitätsprüfung' },
            desc: {
                en: 'Severity level of the circulation plausibility check',
                de: 'Bewertungsstufe der Plausibilitätsprüfung für die Umwälzberechnung',
            },
        },
        {
            id: '02_message_key',
            type: 'string',
            role: 'text',
            def: 'circulation_plausibility_initializing',
            name: { en: 'Plausibility message key', de: 'Meldungsschlüssel der Plausibilitätsprüfung' },
            desc: {
                en: 'Technical message key for the current plausibility result',
                de: 'Technischer Meldungsschlüssel für das aktuelle Plausibilitätsergebnis',
            },
        },
        {
            id: '03_last_update',
            type: 'string',
            role: 'date',
            def: '',
            name: { en: 'Last plausibility check', de: 'Letzte Plausibilitätsprüfung' },
            desc: {
                en: 'Timestamp of the last circulation plausibility check',
                de: 'Zeitpunkt der letzten Plausibilitätsprüfung der Umwälzberechnung',
            },
        },
        {
            id: '10_power_warning',
            type: 'boolean',
            role: 'indicator',
            def: false,
            name: { en: 'Power warning', de: 'Warnung bei Pumpenleistung' },
            desc: {
                en: 'Indicates that the current pump power is implausibly high compared to the configured maximum power',
                de: 'Zeigt an, dass die aktuelle Pumpenleistung im Verhältnis zur konfigurierten Maximalleistung unplausibel hoch ist',
            },
        },
        {
            id: '11_power_value_w',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            def: 0,
            name: { en: 'Measured pump power', de: 'Gemessene Pumpenleistung' },
            desc: {
                en: 'Pump power value used during the last plausibility warning or check',
                de: 'Pumpenleistungswert, der bei der letzten Plausibilitätswarnung oder Prüfung verwendet wurde',
            },
        },
        {
            id: '12_power_limit_w',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            def: 0,
            name: { en: 'Pump power warning limit', de: 'Warngrenze der Pumpenleistung' },
            desc: {
                en: 'Calculated warning limit for the pump power',
                de: 'Berechnete Warngrenze für die Pumpenleistung',
            },
        },
        {
            id: '13_power_warning_at',
            type: 'string',
            role: 'date',
            def: '',
            name: { en: 'Power warning timestamp', de: 'Zeitpunkt der Pumpenleistungswarnung' },
            desc: {
                en: 'Timestamp of the last pump power plausibility warning',
                de: 'Zeitpunkt der letzten Plausibilitätswarnung zur Pumpenleistung',
            },
        },
        {
            id: '20_flow_warning',
            type: 'boolean',
            role: 'indicator',
            def: false,
            name: { en: 'Flow warning', de: 'Warnung bei Durchfluss' },
            desc: {
                en: 'Indicates that the calculated flow rate is implausibly high compared to the configured nominal flow',
                de: 'Zeigt an, dass der berechnete Durchfluss im Verhältnis zur konfigurierten Nennförderleistung unplausibel hoch ist',
            },
        },
        {
            id: '21_flow_value_lh',
            type: 'number',
            role: 'value',
            unit: 'l/h',
            def: 0,
            name: { en: 'Calculated flow rate', de: 'Berechneter Durchfluss' },
            desc: {
                en: 'Flow rate value used during the last plausibility warning or check',
                de: 'Durchflusswert, der bei der letzten Plausibilitätswarnung oder Prüfung verwendet wurde',
            },
        },
        {
            id: '22_flow_limit_lh',
            type: 'number',
            role: 'value',
            unit: 'l/h',
            def: 0,
            name: { en: 'Flow warning limit', de: 'Warngrenze des Durchflusses' },
            desc: {
                en: 'Calculated warning limit for the flow rate',
                de: 'Berechnete Warngrenze für den Durchfluss',
            },
        },
        {
            id: '23_flow_warning_at',
            type: 'string',
            role: 'date',
            def: '',
            name: { en: 'Flow warning timestamp', de: 'Zeitpunkt der Durchflusswarnung' },
            desc: {
                en: 'Timestamp of the last flow plausibility warning',
                de: 'Zeitpunkt der letzten Plausibilitätswarnung zum Durchfluss',
            },
        },
        {
            id: '24_flow_available',
            type: 'boolean',
            role: 'indicator',
            def: false,
            name: { en: 'Flow value available', de: 'Durchflusswert verfügbar' },
            desc: {
                en: 'Indicates whether a valid live flow value was available for the circulation calculation',
                de: 'Zeigt an, ob ein gültiger Live-Durchflusswert für die Umwälzberechnung verfügbar war',
            },
        },
        {
            id: '30_jump_warning',
            type: 'boolean',
            role: 'indicator',
            def: false,
            name: { en: 'Daily circulation jump warning', de: 'Warnung bei Sprung der Tagesumwälzung' },
            desc: {
                en: 'Indicates that the daily circulation volume increased faster than physically plausible',
                de: 'Zeigt an, dass das Tagesumwälzvolumen schneller gestiegen ist als physikalisch plausibel',
            },
        },
        {
            id: '31_jump_value_liters',
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            def: 0,
            name: { en: 'Daily circulation volume jump', de: 'Sprung des Tagesumwälzvolumens' },
            desc: {
                en: 'Detected increase of the daily circulation volume since the previous plausibility check',
                de: 'Erkannter Anstieg des Tagesumwälzvolumens seit der vorherigen Plausibilitätsprüfung',
            },
        },
        {
            id: '32_jump_limit_liters',
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            def: 0,
            name: { en: 'Maximum plausible volume increase', de: 'Maximal plausibler Volumenzuwachs' },
            desc: {
                en: 'Maximum plausible circulation volume increase for the elapsed time',
                de: 'Maximal plausibler Umwälzvolumen-Zuwachs für die vergangene Zeit',
            },
        },
        {
            id: '33_jump_warning_at',
            type: 'string',
            role: 'date',
            def: '',
            name: { en: 'Daily circulation jump warning timestamp', de: 'Zeitpunkt der Sprungwarnung' },
            desc: {
                en: 'Timestamp of the last implausible daily circulation jump warning',
                de: 'Zeitpunkt der letzten Warnung wegen eines unplausiblen Sprungs der Tagesumwälzung',
            },
        },
        {
            id: '40_last_daily_total',
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            def: 0,
            name: { en: 'Previous daily circulation volume', de: 'Vorheriges Tagesumwälzvolumen' },
            desc: {
                en: 'Daily circulation volume used as previous value for the plausibility check',
                de: 'Tagesumwälzvolumen, das als vorheriger Wert für die Plausibilitätsprüfung verwendet wurde',
            },
        },
        {
            id: '41_current_daily_total',
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            def: 0,
            name: { en: 'Current daily circulation volume', de: 'Aktuelles Tagesumwälzvolumen' },
            desc: {
                en: 'Current daily circulation volume used for the plausibility check',
                de: 'Aktuelles Tagesumwälzvolumen, das für die Plausibilitätsprüfung verwendet wurde',
            },
        },
        {
            id: '42_delta_liters',
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            def: 0,
            name: { en: 'Daily circulation volume change', de: 'Änderung des Tagesumwälzvolumens' },
            desc: {
                en: 'Difference between current and previous daily circulation volume',
                de: 'Differenz zwischen aktuellem und vorherigem Tagesumwälzvolumen',
            },
        },
        {
            id: '43_elapsed_seconds',
            type: 'number',
            role: 'value',
            unit: 's',
            def: 0,
            name: { en: 'Elapsed time since previous check', de: 'Zeit seit vorheriger Prüfung' },
            desc: {
                en: 'Elapsed time since the previous circulation plausibility check',
                de: 'Vergangene Zeit seit der vorherigen Plausibilitätsprüfung der Umwälzberechnung',
            },
        },
        {
            id: '44_max_plausible_delta_liters',
            type: 'number',
            role: 'value.volume',
            unit: 'l',
            def: 0,
            name: { en: 'Maximum plausible change', de: 'Maximal plausible Änderung' },
            desc: {
                en: 'Maximum plausible daily circulation volume change for the elapsed time',
                de: 'Maximal plausible Änderung des Tagesumwälzvolumens für die vergangene Zeit',
            },
        },
    ];

    for (const state of plausibilityStates) {
        const id = `circulation.plausibility.${state.id}`;
        await adapter.setObjectNotExistsAsync(id, {
            type: 'state',
            common: {
                name: state.name,
                desc: state.desc,
                type: state.type,
                role: state.role,
                read: true,
                write: state.write === true,
                persist: true,
                def: state.def,
                ...(state.unit ? { unit: state.unit } : {}),
                ...(state.states ? { states: state.states } : {}),
            },
            native: {},
        });

        const existing = await adapter.getStateAsync(id);
        if (!existing || existing.val === null || existing.val === undefined) {
            await adapter.setStateAsync(id, { val: state.def, ack: true });
        }
    }
}

module.exports = {
    createRuntimeStates,
};

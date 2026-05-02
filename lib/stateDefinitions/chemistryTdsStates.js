'use strict';

/**
 * chemistryTdsStates.js
 * -------------------------------------------------------------
 * States for the TDS evaluation area.
 *
 * Scope:
 *  - TDS input via manual value or external ioBroker state
 *  - Measurement location handling
 *  - Reference value
 *  - 24h / 7d / 30d trend structure
 *  - Text / HTML / JSON outputs
 *
 * No automatic dosing.
 * No pump control.
 * -------------------------------------------------------------
 */

async function createChannel(adapter, id, name) {
    await adapter.setObjectNotExistsAsync(id, {
        type: 'channel',
        common: { name },
        native: {},
    });
}

async function createState(adapter, id, common) {
    await adapter.setObjectNotExistsAsync(id, {
        type: 'state',
        common,
        native: {},
    });
}

/**
 * @param {import('iobroker').Adapter} adapter - ioBroker adapter instance
 */
async function createChemistryTdsStates(adapter) {
    adapter.log.debug('[chemistryTdsStates] Initialization started');

    await createChannel(adapter, 'chemistry', {
        en: 'Chemistry',
        de: 'Chemie',
    });

    await createChannel(adapter, 'chemistry.tds', {
        en: 'TDS evaluation',
        de: 'TDS-Auswertung',
    });

    await createState(adapter, 'chemistry.tds.enabled', {
        name: {
            en: 'Enable TDS evaluation',
            de: 'TDS-Auswertung aktivieren',
        },
        desc: {
            en: 'Enables the TDS evaluation. No automatic control is performed.',
            de: 'Aktiviert die TDS-Auswertung. Es erfolgt keine automatische Steuerung.',
        },
        type: 'boolean',
        role: 'switch',
        read: true,
        write: true,
        def: false,
        persist: true,
    });

    // -------------------------------------------------------------
    // Input
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.input', {
        en: 'Input',
        de: 'Eingang',
    });

    await createState(adapter, 'chemistry.tds.input.source_mode', {
        name: {
            en: 'Source mode',
            de: 'Quellenmodus',
        },
        desc: {
            en: 'Defines how the TDS value is provided.',
            de: 'Legt fest, wie der TDS-Wert bereitgestellt wird.',
        },
        type: 'string',
        role: 'level',
        read: true,
        write: true,
        def: 'disabled',
        states: {
            disabled: 'disabled',
            manual: 'manual',
            state: 'state',
        },
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.source_state_id', {
        name: {
            en: 'Source state ID',
            de: 'Quell-Datenpunkt',
        },
        desc: {
            en: 'External ioBroker state ID that provides the TDS value.',
            de: 'Externer ioBroker-Datenpunkt, der den TDS-Wert liefert.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: true,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.manual_value', {
        name: {
            en: 'Manual TDS value',
            de: 'Manueller TDS-Wert',
        },
        desc: {
            en: 'Manually entered TDS value in ppm.',
            de: 'Manuell eingetragener TDS-Wert in ppm.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: true,
        def: 0,
        min: 0,
        unit: 'ppm',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.current_value', {
        name: {
            en: 'Current TDS value',
            de: 'Aktueller TDS-Wert',
        },
        desc: {
            en: 'Current TDS value received or used by PoolControl.',
            de: 'Aktueller von PoolControl empfangener oder verwendeter TDS-Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        unit: 'ppm',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.source_valid', {
        name: {
            en: 'Source valid',
            de: 'Quelle gültig',
        },
        desc: {
            en: 'Shows whether the configured TDS source exists and can be used.',
            de: 'Zeigt an, ob die konfigurierte TDS-Quelle existiert und genutzt werden kann.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.value_valid', {
        name: {
            en: 'Value valid',
            de: 'Wert gültig',
        },
        desc: {
            en: 'Shows whether the current TDS value is plausible.',
            de: 'Zeigt an, ob der aktuelle TDS-Wert plausibel ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.source_status', {
        name: {
            en: 'Source status',
            de: 'Quellenstatus',
        },
        desc: {
            en: 'Readable status of the TDS input source.',
            de: 'Lesbarer Status der TDS-Eingangsquelle.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.last_value_at', {
        name: {
            en: 'Last value time',
            de: 'Zeitpunkt des letzten Werts',
        },
        desc: {
            en: 'Readable date and time when the last TDS value was received.',
            de: 'Lesbares Datum und Uhrzeit, wann der letzte TDS-Wert empfangen wurde.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.last_valid_value', {
        name: {
            en: 'Last valid TDS value',
            de: 'Letzter gültiger TDS-Wert',
        },
        desc: {
            en: 'Last valid and plausible TDS value.',
            de: 'Letzter gültiger und plausibler TDS-Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        unit: 'ppm',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.last_valid_value_at', {
        name: {
            en: 'Last valid value time',
            de: 'Zeitpunkt des letzten gültigen Werts',
        },
        desc: {
            en: 'Readable date and time of the last valid TDS value.',
            de: 'Lesbares Datum und Uhrzeit des letzten gültigen TDS-Werts.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.previous_value', {
        name: {
            en: 'Previous valid TDS value',
            de: 'Vorheriger gültiger TDS-Wert',
        },
        desc: {
            en: 'Valid TDS value before the latest valid value.',
            de: 'Gültiger TDS-Wert vor dem letzten gültigen Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        unit: 'ppm',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.previous_value_at', {
        name: {
            en: 'Previous valid value time',
            de: 'Zeitpunkt des vorherigen gültigen Werts',
        },
        desc: {
            en: 'Readable date and time of the previous valid TDS value.',
            de: 'Lesbares Datum und Uhrzeit des vorherigen gültigen TDS-Werts.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.input.minutes_since_previous_value', {
        name: {
            en: 'Minutes since previous value',
            de: 'Minuten seit vorherigem Wert',
        },
        desc: {
            en: 'Time difference between the last two valid TDS values.',
            de: 'Zeitdifferenz zwischen den letzten beiden gültigen TDS-Werten.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'min',
        persist: true,
    });

    // -------------------------------------------------------------
    // Measurement
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.measurement', {
        en: 'Measurement',
        de: 'Messung',
    });

    await createState(adapter, 'chemistry.tds.measurement.location', {
        name: {
            en: 'Measurement location',
            de: 'Messort',
        },
        desc: {
            en: 'Defines where the TDS value is measured.',
            de: 'Legt fest, wo der TDS-Wert gemessen wird.',
        },
        type: 'string',
        role: 'level',
        read: true,
        write: true,
        def: 'manual',
        states: {
            manual: 'manual',
            pool: 'pool',
            measurement_cell: 'measurement_cell',
            pipe_section: 'pipe_section',
        },
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.measurement.flow_required', {
        name: {
            en: 'Flow required',
            de: 'Durchfluss erforderlich',
        },
        desc: {
            en: 'If enabled, values are only evaluated when the pool pump is running.',
            de: 'Wenn aktiv, werden Werte nur bei laufender Poolpumpe ausgewertet.',
        },
        type: 'boolean',
        role: 'switch',
        read: true,
        write: true,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.measurement.stabilization_time_sec', {
        name: {
            en: 'Stabilization time',
            de: 'Stabilisierungszeit',
        },
        desc: {
            en: 'Delay after pump start before values from a measurement section are evaluated.',
            de: 'Wartezeit nach Pumpenstart, bevor Werte aus einer Messstrecke ausgewertet werden.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 120,
        min: 0,
        unit: 's',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.measurement.pump_running', {
        name: {
            en: 'Pump running',
            de: 'Pumpe läuft',
        },
        desc: {
            en: 'Shows whether the pool pump is currently detected as running.',
            de: 'Zeigt an, ob die Poolpumpe aktuell als laufend erkannt wird.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.measurement.stabilized', {
        name: {
            en: 'Measurement stabilized',
            de: 'Messung stabilisiert',
        },
        desc: {
            en: 'Shows whether the stabilization time after pump start has elapsed.',
            de: 'Zeigt an, ob die Stabilisierungszeit nach Pumpenstart abgelaufen ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.measurement.allowed', {
        name: {
            en: 'Measurement allowed',
            de: 'Messung erlaubt',
        },
        desc: {
            en: 'Shows whether TDS values are currently allowed to be evaluated.',
            de: 'Zeigt an, ob TDS-Werte aktuell ausgewertet werden dürfen.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.measurement.ignored_reason', {
        name: {
            en: 'Ignored reason',
            de: 'Ignorierter Grund',
        },
        desc: {
            en: 'Reason why the current TDS value is not evaluated.',
            de: 'Grund, warum der aktuelle TDS-Wert nicht ausgewertet wird.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // Reference
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.reference', {
        en: 'Reference',
        de: 'Referenz',
    });

    await createState(adapter, 'chemistry.tds.reference.initial_value', {
        name: {
            en: 'Initial reference value',
            de: 'Initialer Referenzwert',
        },
        desc: {
            en: 'Reference TDS value after fresh water, refill or manually selected start point.',
            de: 'TDS-Referenzwert nach Frischwasser, Neubefüllung oder bewusst gesetztem Startpunkt.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: true,
        def: 0,
        min: 0,
        unit: 'ppm',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.reference.initial_value_at', {
        name: {
            en: 'Initial reference time',
            de: 'Zeitpunkt des Referenzwerts',
        },
        desc: {
            en: 'Readable date and time when the initial reference value was set.',
            de: 'Lesbares Datum und Uhrzeit, wann der Referenzwert gesetzt wurde.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.reference.initial_set', {
        name: {
            en: 'Initial reference set',
            de: 'Referenzwert gesetzt',
        },
        desc: {
            en: 'Shows whether an initial reference value is available.',
            de: 'Zeigt an, ob ein initialer Referenzwert vorhanden ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.reference.reset_initial_reference', {
        name: {
            en: 'Set current value as reference',
            de: 'Aktuellen Wert als Referenz setzen',
        },
        desc: {
            en: 'Sets the current valid TDS value as new initial reference value.',
            de: 'Setzt den aktuellen gültigen TDS-Wert als neuen initialen Referenzwert.',
        },
        type: 'boolean',
        role: 'button',
        read: true,
        write: true,
        def: false,
    });

    await createState(adapter, 'chemistry.tds.reference.delta_since_initial', {
        name: {
            en: 'Delta since initial reference',
            de: 'Differenz seit Referenzwert',
        },
        desc: {
            en: 'Difference between current TDS value and initial reference value.',
            de: 'Differenz zwischen aktuellem TDS-Wert und initialem Referenzwert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'ppm',
        persist: true,
    });

    // -------------------------------------------------------------
    // Trend
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.trend', {
        en: 'Trend',
        de: 'Trend',
    });

    const trendStates = [
        ['reference_24h_value', '24h reference value', '24h-Referenzwert'],
        ['reference_7d_value', '7 day reference value', '7-Tage-Referenzwert'],
        ['reference_30d_value', '30 day reference value', '30-Tage-Referenzwert'],
        ['delta_24h', '24h delta', '24h-Differenz'],
        ['delta_7d', '7 day delta', '7-Tage-Differenz'],
        ['delta_30d', '30 day delta', '30-Tage-Differenz'],
    ];

    for (const [stateId, enName, deName] of trendStates) {
        await createState(adapter, `chemistry.tds.trend.${stateId}`, {
            name: {
                en: enName,
                de: deName,
            },
            type: 'number',
            role: 'value',
            read: true,
            write: false,
            def: 0,
            unit: 'ppm',
            persist: true,
        });
    }

    const trendTimeStates = [
        ['reference_24h_at', '24h reference time', 'Zeitpunkt des 24h-Referenzwerts'],
        ['reference_7d_at', '7 day reference time', 'Zeitpunkt des 7-Tage-Referenzwerts'],
        ['reference_30d_at', '30 day reference time', 'Zeitpunkt des 30-Tage-Referenzwerts'],
    ];

    for (const [stateId, enName, deName] of trendTimeStates) {
        await createState(adapter, `chemistry.tds.trend.${stateId}`, {
            name: {
                en: enName,
                de: deName,
            },
            type: 'string',
            role: 'value.time',
            read: true,
            write: false,
            def: '',
            persist: true,
        });
    }

    await createState(adapter, 'chemistry.tds.trend.direction', {
        name: {
            en: 'Trend direction',
            de: 'Trendrichtung',
        },
        desc: {
            en: 'Overall trend direction: stable, rising, falling or not enough data.',
            de: 'Gesamte Trendrichtung: stabil, steigend, fallend oder noch nicht genug Daten.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'not_enough_data',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.trend.status', {
        name: {
            en: 'Trend status',
            de: 'Trendstatus',
        },
        desc: {
            en: 'Readable status of the TDS trend development.',
            de: 'Lesbarer Status der TDS-Trendentwicklung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'not_enough_data',
        persist: true,
    });

    // -------------------------------------------------------------
    // Evaluation
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.evaluation', {
        en: 'Evaluation',
        de: 'Auswertung',
    });

    await createState(adapter, 'chemistry.tds.evaluation.absolute_level', {
        name: {
            en: 'Absolute level',
            de: 'Absolutwert-Einstufung',
        },
        desc: {
            en: 'Classification of the current absolute TDS value.',
            de: 'Einordnung des aktuellen absoluten TDS-Werts.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.evaluation.reference_level', {
        name: {
            en: 'Reference level',
            de: 'Referenz-Einstufung',
        },
        desc: {
            en: 'Classification of the delta since the initial reference value.',
            de: 'Einordnung der Differenz seit dem initialen Referenzwert.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.evaluation.overall_status', {
        name: {
            en: 'Overall status',
            de: 'Gesamtstatus',
        },
        desc: {
            en: 'Overall TDS evaluation status.',
            de: 'Gesamtstatus der TDS-Auswertung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'disabled',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.evaluation.recommendation', {
        name: {
            en: 'Recommendation',
            de: 'Empfehlung',
        },
        desc: {
            en: 'Readable recommendation for the user. No automatic control.',
            de: 'Lesbare Empfehlung für den Nutzer. Keine automatische Steuerung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.evaluation.action_required', {
        name: {
            en: 'Action required',
            de: 'Handlung erforderlich',
        },
        desc: {
            en: 'Shows whether user action is recommended.',
            de: 'Zeigt an, ob eine Handlung durch den Nutzer empfohlen wird.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    // -------------------------------------------------------------
    // History
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.history', {
        en: 'History',
        de: 'Historie',
    });

    await createState(adapter, 'chemistry.tds.history.samples_json', {
        name: {
            en: 'Samples JSON',
            de: 'Messwerte JSON',
        },
        desc: {
            en: 'Internal JSON list of valid TDS samples for up to 30 days.',
            de: 'Interne JSON-Liste gültiger TDS-Messpunkte für bis zu 30 Tage.',
        },
        type: 'string',
        role: 'json',
        read: true,
        write: false,
        def: '[]',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.history.samples_count', {
        name: {
            en: 'Samples count',
            de: 'Anzahl Messwerte',
        },
        desc: {
            en: 'Number of stored valid TDS samples.',
            de: 'Anzahl gespeicherter gültiger TDS-Messpunkte.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.history.oldest_sample_at', {
        name: {
            en: 'Oldest sample time',
            de: 'Ältester Messwert',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.history.newest_sample_at', {
        name: {
            en: 'Newest sample time',
            de: 'Neuester Messwert',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.outputs', {
        en: 'Outputs',
        de: 'Ausgaben',
    });

    await createState(adapter, 'chemistry.tds.outputs.summary_text', {
        name: {
            en: 'Summary text',
            de: 'Zusammenfassung Text',
        },
        desc: {
            en: 'Readable TDS summary text.',
            de: 'Lesbare TDS-Zusammenfassung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.outputs.summary_html', {
        name: {
            en: 'Summary HTML',
            de: 'Zusammenfassung HTML',
        },
        desc: {
            en: 'HTML summary for VIS or widgets.',
            de: 'HTML-Zusammenfassung für VIS oder Widgets.',
        },
        type: 'string',
        role: 'html',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.outputs.summary_json', {
        name: {
            en: 'Summary JSON',
            de: 'Zusammenfassung JSON',
        },
        desc: {
            en: 'Structured TDS summary as JSON.',
            de: 'Strukturierte TDS-Zusammenfassung als JSON.',
        },
        type: 'string',
        role: 'json',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // Debug
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tds.debug', {
        en: 'Debug',
        de: 'Debug',
    });

    await createState(adapter, 'chemistry.tds.debug.last_update', {
        name: {
            en: 'Last update',
            de: 'Letzte Aktualisierung',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tds.debug.last_reason', {
        name: {
            en: 'Last reason',
            de: 'Letzter Grund',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    adapter.log.debug('[chemistryTdsStates] Initialization completed');
}

module.exports = {
    createChemistryTdsStates,
};

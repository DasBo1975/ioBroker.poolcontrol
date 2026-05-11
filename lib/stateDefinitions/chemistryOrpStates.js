'use strict';

/**
 * chemistryOrpStates.js
 * -------------------------------------------------------------
 * States for the ORP / Redox evaluation area.
 *
 * Scope:
 *  - ORP input via manual value or external ioBroker state
 *  - Measurement location handling
 *  - pH reference display from existing pH evaluation states
 *  - ORP evaluation and recommendation states
 *  - Text, HTML and JSON output states
 *
 * No automatic dosing.
 * No automatic chlorine control.
 * No automatic pump or actuator control based on ORP.
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
async function createChemistryOrpStates(adapter) {
    adapter.log.debug('[chemistryOrpStates] Initialization started');

    await createChannel(adapter, 'chemistry', {
        en: 'Chemistry',
        de: 'Chemie',
    });

    await createChannel(adapter, 'chemistry.orp', {
        en: 'ORP / Redox evaluation',
        de: 'ORP-/Redox-Auswertung',
    });

    await createState(adapter, 'chemistry.orp.enabled', {
        name: {
            en: 'Enable ORP / Redox evaluation',
            de: 'ORP-/Redox-Auswertung aktivieren',
        },
        desc: {
            en: 'Enables the ORP / Redox evaluation. No automatic dosing or chlorine control is performed.',
            de: 'Aktiviert die ORP-/Redox-Auswertung. Es erfolgt keine automatische Dosierung oder Chlorsteuerung.',
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
    await createChannel(adapter, 'chemistry.orp.input', {
        en: 'Input',
        de: 'Eingang',
    });

    await createState(adapter, 'chemistry.orp.input.source_mode', {
        name: {
            en: 'Source mode',
            de: 'Quellenmodus',
        },
        desc: {
            en: 'Defines how the ORP / Redox value is provided.',
            de: 'Legt fest, wie der ORP-/Redox-Wert bereitgestellt wird.',
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

    await createState(adapter, 'chemistry.orp.input.source_state_id', {
        name: {
            en: 'Source state ID',
            de: 'Quell-Datenpunkt',
        },
        desc: {
            en: 'External ioBroker state ID that provides the ORP / Redox value in mV.',
            de: 'Externer ioBroker-Datenpunkt, der den ORP-/Redox-Wert in mV liefert.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: true,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.manual_value', {
        name: {
            en: 'Manual ORP value',
            de: 'Manueller ORP-Wert',
        },
        desc: {
            en: 'Manually entered ORP / Redox value in millivolts.',
            de: 'Manuell eingetragener ORP-/Redox-Wert in Millivolt.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: true,
        def: 650,
        min: 0,
        max: 1200,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.current_value', {
        name: {
            en: 'Current ORP value',
            de: 'Aktueller ORP-Wert',
        },
        desc: {
            en: 'Current ORP / Redox value used or received by PoolControl.',
            de: 'Aktueller von PoolControl verwendeter oder empfangener ORP-/Redox-Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        max: 1200,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.source_valid', {
        name: {
            en: 'Source valid',
            de: 'Quelle gültig',
        },
        desc: {
            en: 'Shows whether the configured ORP source exists and can be used.',
            de: 'Zeigt an, ob die konfigurierte ORP-Quelle existiert und genutzt werden kann.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.value_valid', {
        name: {
            en: 'Value valid',
            de: 'Wert gültig',
        },
        desc: {
            en: 'Shows whether the current ORP value is plausible.',
            de: 'Zeigt an, ob der aktuelle ORP-Wert plausibel ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.source_status', {
        name: {
            en: 'Source status',
            de: 'Quellenstatus',
        },
        desc: {
            en: 'Readable status of the ORP input source.',
            de: 'Lesbarer Status der ORP-Eingangsquelle.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.last_value_at', {
        name: {
            en: 'Last value time',
            de: 'Zeitpunkt des letzten Werts',
        },
        desc: {
            en: 'Readable date and time when the last ORP value was received.',
            de: 'Lesbares Datum und Uhrzeit, wann der letzte ORP-Wert empfangen wurde.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.last_valid_value', {
        name: {
            en: 'Last valid ORP value',
            de: 'Letzter gültiger ORP-Wert',
        },
        desc: {
            en: 'Last valid and plausible ORP value.',
            de: 'Letzter gültiger und plausibler ORP-Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        max: 1200,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.last_valid_value_at', {
        name: {
            en: 'Last valid value time',
            de: 'Zeitpunkt des letzten gültigen Werts',
        },
        desc: {
            en: 'Readable date and time of the last valid ORP value.',
            de: 'Lesbares Datum und Uhrzeit des letzten gültigen ORP-Werts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.previous_value', {
        name: {
            en: 'Previous valid ORP value',
            de: 'Vorheriger gültiger ORP-Wert',
        },
        desc: {
            en: 'Valid ORP value before the latest valid value.',
            de: 'Gültiger ORP-Wert vor dem letzten gültigen Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        max: 1200,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.previous_value_at', {
        name: {
            en: 'Previous valid value time',
            de: 'Zeitpunkt des vorherigen gültigen Werts',
        },
        desc: {
            en: 'Readable date and time of the previous valid ORP value.',
            de: 'Lesbares Datum und Uhrzeit des vorherigen gültigen ORP-Werts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.input.minutes_since_previous_value', {
        name: {
            en: 'Minutes since previous value',
            de: 'Minuten seit vorherigem Wert',
        },
        desc: {
            en: 'Time difference between the last two valid ORP values.',
            de: 'Zeitdifferenz zwischen den letzten beiden gültigen ORP-Werten.',
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
    // pH reference
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.orp.ph_reference', {
        en: 'pH reference',
        de: 'pH-Referenz',
    });

    await createState(adapter, 'chemistry.orp.ph_reference.enabled', {
        name: {
            en: 'pH evaluation enabled',
            de: 'pH-Auswertung aktiv',
        },
        desc: {
            en: 'Read-only reference showing whether the existing pH evaluation is enabled.',
            de: 'Schreibgeschützte Referenz, ob die bestehende pH-Auswertung aktiv ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.ph_reference.current_value', {
        name: {
            en: 'Current pH reference value',
            de: 'Aktueller pH-Referenzwert',
        },
        desc: {
            en: 'Read-only reference value from chemistry.ph.input.current_value.',
            de: 'Schreibgeschützter Referenzwert aus chemistry.ph.input.current_value.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.ph_reference.status', {
        name: {
            en: 'pH reference status',
            de: 'pH-Referenzstatus',
        },
        desc: {
            en: 'Shows whether the pH reference can be used for ORP interpretation.',
            de: 'Zeigt an, ob die pH-Referenz für die ORP-Einordnung nutzbar ist.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'unknown',
        states: {
            unknown: 'unknown',
            disabled: 'disabled',
            missing: 'missing',
            out_of_range: 'out_of_range',
            valid: 'valid',
        },
        persist: true,
    });

    // -------------------------------------------------------------
    // Measurement
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.orp.measurement', {
        en: 'Measurement',
        de: 'Messung',
    });

    await createState(adapter, 'chemistry.orp.measurement.location', {
        name: {
            en: 'Measurement location',
            de: 'Messort',
        },
        desc: {
            en: 'Defines where the ORP value is measured.',
            de: 'Legt fest, wo der ORP-Wert gemessen wird.',
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

    await createState(adapter, 'chemistry.orp.measurement.flow_required', {
        name: {
            en: 'Flow required',
            de: 'Durchfluss erforderlich',
        },
        desc: {
            en: 'If enabled, ORP values are only evaluated when the pool pump is running.',
            de: 'Wenn aktiv, werden ORP-Werte nur bei laufender Poolpumpe ausgewertet.',
        },
        type: 'boolean',
        role: 'switch',
        read: true,
        write: true,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.measurement.stabilization_time_sec', {
        name: {
            en: 'Stabilization time',
            de: 'Stabilisierungszeit',
        },
        desc: {
            en: 'Delay after pump start before ORP values from a measurement section are evaluated.',
            de: 'Wartezeit nach Pumpenstart, bevor ORP-Werte aus einer Messstrecke ausgewertet werden.',
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

    await createState(adapter, 'chemistry.orp.measurement.pump_running', {
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

    await createState(adapter, 'chemistry.orp.measurement.stabilized', {
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

    await createState(adapter, 'chemistry.orp.measurement.allowed', {
        name: {
            en: 'Measurement allowed',
            de: 'Messung erlaubt',
        },
        desc: {
            en: 'Shows whether ORP values are currently allowed to be evaluated.',
            de: 'Zeigt an, ob ORP-Werte aktuell ausgewertet werden dürfen.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.measurement.ignored_reason', {
        name: {
            en: 'Ignored reason',
            de: 'Ignorierter Grund',
        },
        desc: {
            en: 'Reason why the current ORP value is not evaluated.',
            de: 'Grund, warum der aktuelle ORP-Wert nicht ausgewertet wird.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // Evaluation
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.orp.evaluation', {
        en: 'Evaluation',
        de: 'Auswertung',
    });

    await createState(adapter, 'chemistry.orp.evaluation.target_min_mv', {
        name: {
            en: 'Target minimum',
            de: 'Zielwert Minimum',
        },
        desc: {
            en: 'Lower ORP reference limit in millivolts. This is only used for cautious evaluation hints.',
            de: 'Untere ORP-Referenzgrenze in Millivolt. Diese wird nur für vorsichtige Bewertungshinweise genutzt.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 650,
        min: 0,
        max: 1200,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.evaluation.target_max_mv', {
        name: {
            en: 'Target maximum',
            de: 'Zielwert Maximum',
        },
        desc: {
            en: 'Upper ORP reference limit in millivolts. This is only used for cautious evaluation hints.',
            de: 'Obere ORP-Referenzgrenze in Millivolt. Diese wird nur für vorsichtige Bewertungshinweise genutzt.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 800,
        min: 0,
        max: 1200,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.evaluation.status', {
        name: {
            en: 'ORP status',
            de: 'ORP-Status',
        },
        desc: {
            en: 'Compact ORP evaluation status.',
            de: 'Kompakter Status der ORP-Auswertung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'disabled',
        states: {
            disabled: 'disabled',
            invalid: 'invalid',
            waiting_for_pump: 'waiting_for_pump',
            waiting_for_stabilization: 'waiting_for_stabilization',
            ph_reference_missing: 'ph_reference_missing',
            low: 'low',
            ok: 'ok',
            high: 'high',
            observe: 'observe',
        },
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.evaluation.level', {
        name: {
            en: 'Evaluation level',
            de: 'Bewertungsstufe',
        },
        desc: {
            en: 'Severity level of the current ORP evaluation.',
            de: 'Schweregrad der aktuellen ORP-Auswertung.',
        },
        type: 'string',
        role: 'level',
        read: true,
        write: false,
        def: 'none',
        states: {
            none: 'none',
            info: 'info',
            warning: 'warning',
            critical: 'critical',
        },
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.evaluation.recommendation', {
        name: {
            en: 'Recommendation',
            de: 'Empfehlung',
        },
        desc: {
            en: 'Readable recommendation for the user. No automatic dosing or chlorine control.',
            de: 'Lesbare Empfehlung für den Nutzer. Keine automatische Dosierung oder Chlorsteuerung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.evaluation.action_required', {
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
    // Trend
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.orp.trend', {
        en: 'Trend',
        de: 'Trend',
    });

    await createState(adapter, 'chemistry.orp.trend.reference_24h_value', {
        name: {
            en: '24h reference value',
            de: '24h-Referenzwert',
        },
        desc: {
            en: 'ORP comparison value from about 24 hours ago.',
            de: 'ORP-Vergleichswert von etwa vor 24 Stunden.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.reference_24h_at', {
        name: {
            en: '24h reference time',
            de: 'Zeitpunkt des 24h-Referenzwerts',
        },
        desc: {
            en: 'Readable timestamp of the 24h ORP reference value.',
            de: 'Lesbarer Zeitstempel des 24h-ORP-Referenzwerts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.delta_24h', {
        name: {
            en: '24h ORP change',
            de: '24h-ORP-Änderung',
        },
        desc: {
            en: 'Difference between the current ORP value and the comparison value from about 24 hours ago.',
            de: 'Differenz zwischen aktuellem ORP-Wert und Vergleichswert von etwa vor 24 Stunden.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.reference_7d_value', {
        name: {
            en: '7 day reference value',
            de: '7-Tage-Referenzwert',
        },
        desc: {
            en: 'ORP comparison value from about 7 days ago.',
            de: 'ORP-Vergleichswert von etwa vor 7 Tagen.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.reference_7d_at', {
        name: {
            en: '7 day reference time',
            de: 'Zeitpunkt des 7-Tage-Referenzwerts',
        },
        desc: {
            en: 'Readable timestamp of the 7 day ORP reference value.',
            de: 'Lesbarer Zeitstempel des 7-Tage-ORP-Referenzwerts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.delta_7d', {
        name: {
            en: '7 day ORP change',
            de: '7-Tage-ORP-Änderung',
        },
        desc: {
            en: 'Difference between the current ORP value and the comparison value from about 7 days ago.',
            de: 'Differenz zwischen aktuellem ORP-Wert und Vergleichswert von etwa vor 7 Tagen.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.reference_30d_value', {
        name: {
            en: '30 day reference value',
            de: '30-Tage-Referenzwert',
        },
        desc: {
            en: 'ORP comparison value from about 30 days ago.',
            de: 'ORP-Vergleichswert von etwa vor 30 Tagen.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.reference_30d_at', {
        name: {
            en: '30 day reference time',
            de: 'Zeitpunkt des 30-Tage-Referenzwerts',
        },
        desc: {
            en: 'Readable timestamp of the 30 day ORP reference value.',
            de: 'Lesbarer Zeitstempel des 30-Tage-ORP-Referenzwerts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.delta_30d', {
        name: {
            en: '30 day ORP change',
            de: '30-Tage-ORP-Änderung',
        },
        desc: {
            en: 'Difference between the current ORP value and the comparison value from about 30 days ago.',
            de: 'Differenz zwischen aktuellem ORP-Wert und Vergleichswert von etwa vor 30 Tagen.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'mV',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.direction', {
        name: {
            en: 'Trend direction',
            de: 'Trendrichtung',
        },
        desc: {
            en: 'Current ORP trend direction.',
            de: 'Aktuelle ORP-Trendrichtung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'unknown',
        states: {
            unknown: 'unknown',
            stable: 'stable',
            rising: 'rising',
            falling: 'falling',
        },
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.status', {
        name: {
            en: 'Trend status',
            de: 'Trendstatus',
        },
        desc: {
            en: 'Readable status of the ORP trend evaluation.',
            de: 'Lesbarer Status der ORP-Trendauswertung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'unknown',
        states: {
            unknown: 'unknown',
            not_enough_data: 'not_enough_data',
            stable: 'stable',
            rising_slowly: 'rising_slowly',
            rising_noticeable: 'rising_noticeable',
            rising_fast: 'rising_fast',
            falling: 'falling',
        },
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.trend.summary_text', {
        name: {
            en: 'Trend summary',
            de: 'Trendzusammenfassung',
        },
        desc: {
            en: 'Readable summary of the ORP trend.',
            de: 'Lesbare Zusammenfassung des ORP-Trends.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // History
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.orp.history', {
        en: 'History',
        de: 'Historie',
    });

    await createState(adapter, 'chemistry.orp.history.samples_json', {
        name: {
            en: 'ORP history samples',
            de: 'ORP-Historienwerte',
        },
        desc: {
            en: 'Internal list of valid ORP measurement samples for trend calculation.',
            de: 'Interne Liste gültiger ORP-Messwerte für die Trendberechnung.',
        },
        type: 'string',
        role: 'json',
        read: true,
        write: false,
        def: '[]',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.history.samples_count', {
        name: {
            en: 'ORP sample count',
            de: 'ORP-Anzahl Messwerte',
        },
        desc: {
            en: 'Number of stored ORP history samples.',
            de: 'Anzahl gespeicherter ORP-Historienwerte.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.history.oldest_sample_at', {
        name: {
            en: 'Oldest ORP sample time',
            de: 'Ältester ORP-Messwertzeitpunkt',
        },
        desc: {
            en: 'Readable timestamp of the oldest stored ORP sample.',
            de: 'Lesbarer Zeitstempel des ältesten gespeicherten ORP-Messwerts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.history.newest_sample_at', {
        name: {
            en: 'Newest ORP sample time',
            de: 'Neuester ORP-Messwertzeitpunkt',
        },
        desc: {
            en: 'Readable timestamp of the newest stored ORP sample.',
            de: 'Lesbarer Zeitstempel des neuesten gespeicherten ORP-Messwerts.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    // -------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.orp.outputs', {
        en: 'Outputs',
        de: 'Ausgaben',
    });

    await createState(adapter, 'chemistry.orp.outputs.summary_text', {
        name: {
            en: 'Summary text',
            de: 'Zusammenfassung Text',
        },
        desc: {
            en: 'Readable ORP summary text for object tree, VIS or other outputs.',
            de: 'Lesbare ORP-Zusammenfassung für Objektbaum, VIS oder andere Ausgaben.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.outputs.summary_html', {
        name: {
            en: 'Summary HTML',
            de: 'Zusammenfassung HTML',
        },
        desc: {
            en: 'HTML summary of the ORP evaluation for VIS or widgets.',
            de: 'HTML-Zusammenfassung der ORP-Auswertung für VIS oder Widgets.',
        },
        type: 'string',
        role: 'html',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.outputs.summary_json', {
        name: {
            en: 'Summary JSON',
            de: 'Zusammenfassung JSON',
        },
        desc: {
            en: 'Structured JSON summary of the ORP evaluation for further processing.',
            de: 'Strukturierte JSON-Zusammenfassung der ORP-Auswertung zur Weiterverarbeitung.',
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
    await createChannel(adapter, 'chemistry.orp.debug', {
        en: 'Debug',
        de: 'Debug',
    });

    await createState(adapter, 'chemistry.orp.debug.last_update', {
        name: {
            en: 'Last update',
            de: 'Letzte Aktualisierung',
        },
        desc: {
            en: 'Readable timestamp of the last ORP evaluation update.',
            de: 'Lesbarer Zeitstempel der letzten ORP-Auswertung.',
        },
        type: 'number', // FIX: ioBroker value.time states must store Unix timestamps in milliseconds.
        role: 'value.time',
        read: true,
        write: false,
        def: 0, // FIX: numeric timestamp default for value.time.
        persist: true,
    });

    await createState(adapter, 'chemistry.orp.debug.last_reason', {
        name: {
            en: 'Last reason',
            de: 'Letzter Grund',
        },
        desc: {
            en: 'Reason for the last ORP evaluation update.',
            de: 'Grund der letzten ORP-Auswertung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    adapter.log.debug('[chemistryOrpStates] Initialization completed');
}

module.exports = {
    createChemistryOrpStates,
};

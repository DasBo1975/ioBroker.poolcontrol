'use strict';

/**
 * chemistryPhStates.js
 * -------------------------------------------------------------
 * States for the pH evaluation area.
 *
 * Scope:
 *  - pH input via manual value or external ioBroker state
 *  - Measurement location handling
 *  - Evaluation and recommendation states
 *  - Optional manual mixing run states
 *
 * No automatic dosing.
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
async function createChemistryPhStates(adapter) {
    adapter.log.debug('[chemistryPhStates] Initialization started');

    await createChannel(adapter, 'chemistry', {
        en: 'Chemistry',
        de: 'Chemie',
    });

    await createChannel(adapter, 'chemistry.ph', {
        en: 'pH evaluation',
        de: 'pH-Auswertung',
    });

    await createState(adapter, 'chemistry.ph.enabled', {
        name: {
            en: 'Enable pH evaluation',
            de: 'pH-Auswertung aktivieren',
        },
        desc: {
            en: 'Enables the pH evaluation. No automatic dosing is performed.',
            de: 'Aktiviert die pH-Auswertung. Es erfolgt keine automatische Dosierung.',
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
    await createChannel(adapter, 'chemistry.ph.input', {
        en: 'Input',
        de: 'Eingang',
    });

    await createState(adapter, 'chemistry.ph.input.source_mode', {
        name: {
            en: 'Source mode',
            de: 'Quellenmodus',
        },
        desc: {
            en: 'Defines how the pH value is provided.',
            de: 'Legt fest, wie der pH-Wert bereitgestellt wird.',
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

    await createState(adapter, 'chemistry.ph.input.source_state_id', {
        name: {
            en: 'Source state ID',
            de: 'Quell-Datenpunkt',
        },
        desc: {
            en: 'External ioBroker state ID that provides the pH value.',
            de: 'Externer ioBroker-Datenpunkt, der den pH-Wert liefert.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: true,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.manual_value', {
        name: {
            en: 'Manual pH value',
            de: 'Manueller pH-Wert',
        },
        desc: {
            en: 'Manually entered pH value.',
            de: 'Manuell eingetragener pH-Wert.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: true,
        def: 7.2,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.current_value', {
        name: {
            en: 'Current pH value',
            de: 'Aktueller pH-Wert',
        },
        desc: {
            en: 'Current pH value used or received by PoolControl.',
            de: 'Aktueller von PoolControl verwendeter oder empfangener pH-Wert.',
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

    await createState(adapter, 'chemistry.ph.input.source_valid', {
        name: {
            en: 'Source valid',
            de: 'Quelle gültig',
        },
        desc: {
            en: 'Shows whether the configured source exists and can be used.',
            de: 'Zeigt an, ob die konfigurierte Quelle existiert und genutzt werden kann.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.value_valid', {
        name: {
            en: 'Value valid',
            de: 'Wert gültig',
        },
        desc: {
            en: 'Shows whether the current pH value is plausible.',
            de: 'Zeigt an, ob der aktuelle pH-Wert plausibel ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.source_status', {
        name: {
            en: 'Source status',
            de: 'Quellenstatus',
        },
        desc: {
            en: 'Readable status of the pH input source.',
            de: 'Lesbarer Status der pH-Eingangsquelle.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.last_value_at', {
        name: {
            en: 'Last value time',
            de: 'Zeitpunkt des letzten Werts',
        },
        desc: {
            en: 'Readable date and time when the last pH value was received.',
            de: 'Lesbares Datum und Uhrzeit, wann der letzte pH-Wert empfangen wurde.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.last_valid_value', {
        name: {
            en: 'Last valid pH value',
            de: 'Letzter gültiger pH-Wert',
        },
        desc: {
            en: 'Last valid and plausible pH value.',
            de: 'Letzter gültiger und plausibler pH-Wert.',
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

    await createState(adapter, 'chemistry.ph.input.last_valid_value_at', {
        name: {
            en: 'Last valid value time',
            de: 'Zeitpunkt des letzten gültigen Werts',
        },
        desc: {
            en: 'Readable date and time of the last valid pH value.',
            de: 'Lesbares Datum und Uhrzeit des letzten gültigen pH-Werts.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.previous_value', {
        name: {
            en: 'Previous valid pH value',
            de: 'Vorheriger gültiger pH-Wert',
        },
        desc: {
            en: 'Valid pH value before the latest valid value.',
            de: 'Gültiger pH-Wert vor dem letzten gültigen Wert.',
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

    await createState(adapter, 'chemistry.ph.input.previous_value_at', {
        name: {
            en: 'Previous valid value time',
            de: 'Zeitpunkt des vorherigen gültigen Werts',
        },
        desc: {
            en: 'Readable date and time of the previous valid pH value.',
            de: 'Lesbares Datum und Uhrzeit des vorherigen gültigen pH-Werts.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.input.minutes_since_previous_value', {
        name: {
            en: 'Minutes since previous value',
            de: 'Minuten seit vorherigem Wert',
        },
        desc: {
            en: 'Time difference between the last two valid pH values.',
            de: 'Zeitdifferenz zwischen den letzten beiden gültigen pH-Werten.',
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
    // Evaluation
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.ph.evaluation', {
        en: 'Evaluation',
        de: 'Auswertung',
    });

    await createState(adapter, 'chemistry.ph.evaluation.target_min', {
        name: {
            en: 'Target minimum',
            de: 'Zielwert Minimum',
        },
        desc: {
            en: 'Lower limit of the desired pH range.',
            de: 'Untere Grenze des gewünschten pH-Bereichs.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 7.0,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.evaluation.target_max', {
        name: {
            en: 'Target maximum',
            de: 'Zielwert Maximum',
        },
        desc: {
            en: 'Upper limit of the desired pH range.',
            de: 'Obere Grenze des gewünschten pH-Bereichs.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 7.4,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.evaluation.status', {
        name: {
            en: 'pH status',
            de: 'pH-Status',
        },
        desc: {
            en: 'Compact pH evaluation status.',
            de: 'Kompakter Status der pH-Auswertung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: 'disabled',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.evaluation.recommendation', {
        name: {
            en: 'Recommendation',
            de: 'Empfehlung',
        },
        desc: {
            en: 'Readable recommendation for the user. No automatic dosing.',
            de: 'Lesbare Empfehlung für den Nutzer. Keine automatische Dosierung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.evaluation.action_required', {
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
    // Measurement
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.ph.measurement', {
        en: 'Measurement',
        de: 'Messung',
    });

    await createState(adapter, 'chemistry.ph.measurement.location', {
        name: {
            en: 'Measurement location',
            de: 'Messort',
        },
        desc: {
            en: 'Defines where the pH value is measured.',
            de: 'Legt fest, wo der pH-Wert gemessen wird.',
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

    await createState(adapter, 'chemistry.ph.measurement.flow_required', {
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

    await createState(adapter, 'chemistry.ph.measurement.stabilization_time_sec', {
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

    await createState(adapter, 'chemistry.ph.measurement.allowed', {
        name: {
            en: 'Measurement allowed',
            de: 'Messung erlaubt',
        },
        desc: {
            en: 'Shows whether pH values are currently allowed to be evaluated.',
            de: 'Zeigt an, ob pH-Werte aktuell ausgewertet werden dürfen.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.measurement.pump_running', {
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

    await createState(adapter, 'chemistry.ph.measurement.stabilized', {
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

    await createState(adapter, 'chemistry.ph.measurement.ignored_reason', {
        name: {
            en: 'Ignored reason',
            de: 'Ignorierter Grund',
        },
        desc: {
            en: 'Reason why the current pH value is not evaluated.',
            de: 'Grund, warum der aktuelle pH-Wert nicht ausgewertet wird.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // Mix
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.ph.mix', {
        en: 'Mixing run',
        de: 'Mischlauf',
    });

    await createState(adapter, 'chemistry.ph.mix.runtime_minutes', {
        name: {
            en: 'Mixing runtime',
            de: 'Mischlaufzeit',
        },
        desc: {
            en: 'Runtime in minutes for a manual mixing run after chemical correction.',
            de: 'Laufzeit in Minuten für einen manuellen Mischlauf nach einer Chemiekorrektur.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 60,
        min: 0,
        unit: 'min',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.mix.start', {
        name: {
            en: 'Start mixing run',
            de: 'Mischlauf starten',
        },
        desc: {
            en: 'Starts a manual mixing run. This does not dose chemicals.',
            de: 'Startet einen manuellen Mischlauf. Es wird keine Chemie dosiert.',
        },
        type: 'boolean',
        role: 'button',
        read: true,
        write: true,
        def: false,
    });

    await createState(adapter, 'chemistry.ph.mix.active', {
        name: {
            en: 'Mixing run active',
            de: 'Mischlauf aktiv',
        },
        desc: {
            en: 'Shows whether a pH mixing run is currently active.',
            de: 'Zeigt an, ob aktuell ein pH-Mischlauf aktiv ist.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.mix.remaining_minutes', {
        name: {
            en: 'Remaining mixing runtime',
            de: 'Verbleibende Mischlaufzeit',
        },
        desc: {
            en: 'Remaining runtime of the current pH mixing run.',
            de: 'Verbleibende Laufzeit des aktuellen pH-Mischlaufs.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        unit: 'min',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.mix.started_by_helper', {
        name: {
            en: 'Pump started by pH helper',
            de: 'Pumpe durch pH-Helper gestartet',
        },
        desc: {
            en: 'Shows whether the pH helper started the pump for the current mixing run.',
            de: 'Zeigt an, ob der pH-Helper die Pumpe für den aktuellen Mischlauf gestartet hat.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.mix.status', {
        name: {
            en: 'Mixing status',
            de: 'Mischlaufstatus',
        },
        desc: {
            en: 'Readable status of the pH mixing run.',
            de: 'Lesbarer Status des pH-Mischlaufs.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    // -------------------------------------------------------------
    // Debug
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.ph.debug', {
        en: 'Debug',
        de: 'Debug',
    });

    await createState(adapter, 'chemistry.ph.debug.last_update', {
        name: {
            en: 'Last update',
            de: 'Letzte Aktualisierung',
        },
        desc: {
            en: 'Readable timestamp of the last pH evaluation update.',
            de: 'Lesbarer Zeitstempel der letzten pH-Auswertung.',
        },
        type: 'string',
        role: 'value.time',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.ph.debug.last_reason', {
        name: {
            en: 'Last reason',
            de: 'Letzter Grund',
        },
        desc: {
            en: 'Reason for the last pH evaluation update.',
            de: 'Grund der letzten pH-Auswertung.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    adapter.log.debug('[chemistryPhStates] Initialization completed');
}

module.exports = {
    createChemistryPhStates,
};

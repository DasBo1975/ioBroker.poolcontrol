'use strict';

/**
 * chemistryToolsStates.js
 * -------------------------------------------------------------
 * States for chemistry helper tools.
 *
 * Scope:
 *  - pH Plus calculator
 *  - pH Minus calculator
 *  - Prepared structure for future chemistry calculators
 *
 * No automatic dosing.
 * No automatic chemical control.
 * No automatic pump or actuator control based on calculator results.
 * Calculations are only performed after the user presses the calculate button.
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
async function createChemistryToolsStates(adapter) {
    adapter.log.debug('[chemistryToolsStates] Initialization started');

    await createChannel(adapter, 'chemistry', {
        en: 'Chemistry',
        de: 'Chemie',
    });

    await createChannel(adapter, 'chemistry.tools', {
        en: 'Chemistry tools',
        de: 'Chemie-Werkzeuge',
    });

    // -------------------------------------------------------------
    // pH Plus calculator
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tools.ph_plus_calculator', {
        en: 'pH Plus calculator',
        de: 'pH-Plus-Rechner',
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.01_pool_volume_l', {
        name: {
            en: 'Pool volume',
            de: 'Poolvolumen',
        },
        desc: {
            en: 'Pool water volume used for the pH Plus calculation. This value can be prefilled from PoolControl but may be overwritten manually.',
            de: 'Pool-Wasservolumen für die pH-Plus-Berechnung. Der Wert kann von PoolControl vorbelegt, aber manuell überschrieben werden.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 0,
        min: 0,
        unit: 'l',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.02_current_ph', {
        name: {
            en: 'Current pH value',
            de: 'Aktueller pH-Wert',
        },
        desc: {
            en: 'Current pH value used for the pH Plus calculation. This value can be prefilled from PoolControl but may be overwritten manually.',
            de: 'Aktueller pH-Wert für die pH-Plus-Berechnung. Der Wert kann von PoolControl vorbelegt, aber manuell überschrieben werden.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: true,
        def: 7.0,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.03_target_ph', {
        name: {
            en: 'Target pH value',
            de: 'Ziel-pH-Wert',
        },
        desc: {
            en: 'Target pH value for the pH Plus calculation. For pH Plus, this value must be higher than the current pH value.',
            de: 'Ziel-pH-Wert für die pH-Plus-Berechnung. Bei pH Plus muss dieser Wert höher als der aktuelle pH-Wert sein.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 7.2,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.04_grams_per_10000l_01ph', {
        name: {
            en: 'Dosage factor',
            de: 'Dosierfaktor',
        },
        desc: {
            en: 'Amount of pH Plus in grams required to raise the pH value by 0.1 in 10,000 liters of pool water. Default value follows common manufacturer information.',
            de: 'Menge pH Plus in Gramm, um den pH-Wert bei 10.000 Litern Poolwasser um 0,1 zu erhöhen. Der Standardwert orientiert sich an üblichen Herstellerangaben.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 100,
        min: 0,
        unit: 'g',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.05_calculate', {
        name: {
            en: 'Calculate pH Plus amount',
            de: 'pH-Plus-Menge berechnen',
        },
        desc: {
            en: 'Starts the pH Plus calculation. The result is calculated only when this button is pressed.',
            de: 'Startet die pH-Plus-Berechnung. Das Ergebnis wird nur berechnet, wenn dieser Button gedrückt wird.',
        },
        type: 'boolean',
        role: 'button',
        read: true,
        write: true,
        def: false,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.10_result_grams', {
        name: {
            en: 'Calculated pH Plus amount',
            de: 'Berechnete pH-Plus-Menge',
        },
        desc: {
            en: 'Calculated amount of pH Plus in grams. This is an orientation value, not an automatic dosing recommendation.',
            de: 'Berechnete Menge pH Plus in Gramm. Dies ist ein Orientierungswert, keine automatische Dosierempfehlung.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        unit: 'g',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.11_result_text', {
        name: {
            en: 'pH Plus result text',
            de: 'pH-Plus-Ergebnistext',
        },
        desc: {
            en: 'Readable result text for the pH Plus calculation, including safety notes.',
            de: 'Lesbarer Ergebnistext der pH-Plus-Berechnung inklusive Sicherheitshinweisen.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.12_valid', {
        name: {
            en: 'pH Plus calculation valid',
            de: 'pH-Plus-Berechnung gültig',
        },
        desc: {
            en: 'Shows whether the last pH Plus calculation used valid input values.',
            de: 'Zeigt an, ob die letzte pH-Plus-Berechnung gültige Eingabewerte verwendet hat.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.13_last_error', {
        name: {
            en: 'pH Plus last error',
            de: 'pH-Plus letzter Fehler',
        },
        desc: {
            en: 'Last validation or calculation error of the pH Plus calculator.',
            de: 'Letzter Prüf- oder Berechnungsfehler des pH-Plus-Rechners.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_plus_calculator.14_last_calculated_at', {
        name: {
            en: 'pH Plus last calculation time',
            de: 'pH-Plus letzte Berechnung',
        },
        desc: {
            en: 'Timestamp of the last pH Plus calculation.',
            de: 'Zeitpunkt der letzten pH-Plus-Berechnung.',
        },
        type: 'number',
        role: 'value.time',
        read: true,
        write: false,
        def: 0,
        persist: true,
    });

    // -------------------------------------------------------------
    // pH Minus calculator
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tools.ph_minus_calculator', {
        en: 'pH Minus calculator',
        de: 'pH-Minus-Rechner',
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.01_pool_volume_l', {
        name: {
            en: 'Pool volume',
            de: 'Poolvolumen',
        },
        desc: {
            en: 'Pool water volume used for the pH Minus calculation. This value can be prefilled from PoolControl but may be overwritten manually.',
            de: 'Pool-Wasservolumen für die pH-Minus-Berechnung. Der Wert kann von PoolControl vorbelegt, aber manuell überschrieben werden.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 0,
        min: 0,
        unit: 'l',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.02_current_ph', {
        name: {
            en: 'Current pH value',
            de: 'Aktueller pH-Wert',
        },
        desc: {
            en: 'Current pH value used for the pH Minus calculation. This value can be prefilled from PoolControl but may be overwritten manually.',
            de: 'Aktueller pH-Wert für die pH-Minus-Berechnung. Der Wert kann von PoolControl vorbelegt, aber manuell überschrieben werden.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: true,
        def: 7.4,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.03_target_ph', {
        name: {
            en: 'Target pH value',
            de: 'Ziel-pH-Wert',
        },
        desc: {
            en: 'Target pH value for the pH Minus calculation. For pH Minus, this value must be lower than the current pH value.',
            de: 'Ziel-pH-Wert für die pH-Minus-Berechnung. Bei pH Minus muss dieser Wert niedriger als der aktuelle pH-Wert sein.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 7.2,
        min: 0,
        max: 14,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.04_grams_per_10000l_01ph', {
        name: {
            en: 'Dosage factor',
            de: 'Dosierfaktor',
        },
        desc: {
            en: 'Amount of pH Minus in grams required to lower the pH value by 0.1 in 10,000 liters of pool water. Default value follows common manufacturer information.',
            de: 'Menge pH Minus in Gramm, um den pH-Wert bei 10.000 Litern Poolwasser um 0,1 zu senken. Der Standardwert orientiert sich an üblichen Herstellerangaben.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 100,
        min: 0,
        unit: 'g',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.05_calculate', {
        name: {
            en: 'Calculate pH Minus amount',
            de: 'pH-Minus-Menge berechnen',
        },
        desc: {
            en: 'Starts the pH Minus calculation. The result is calculated only when this button is pressed.',
            de: 'Startet die pH-Minus-Berechnung. Das Ergebnis wird nur berechnet, wenn dieser Button gedrückt wird.',
        },
        type: 'boolean',
        role: 'button',
        read: true,
        write: true,
        def: false,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.10_result_grams', {
        name: {
            en: 'Calculated pH Minus amount',
            de: 'Berechnete pH-Minus-Menge',
        },
        desc: {
            en: 'Calculated amount of pH Minus in grams. This is an orientation value, not an automatic dosing recommendation.',
            de: 'Berechnete Menge pH Minus in Gramm. Dies ist ein Orientierungswert, keine automatische Dosierempfehlung.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        unit: 'g',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.11_result_text', {
        name: {
            en: 'pH Minus result text',
            de: 'pH-Minus-Ergebnistext',
        },
        desc: {
            en: 'Readable result text for the pH Minus calculation, including safety notes.',
            de: 'Lesbarer Ergebnistext der pH-Minus-Berechnung inklusive Sicherheitshinweisen.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.12_valid', {
        name: {
            en: 'pH Minus calculation valid',
            de: 'pH-Minus-Berechnung gültig',
        },
        desc: {
            en: 'Shows whether the last pH Minus calculation used valid input values.',
            de: 'Zeigt an, ob die letzte pH-Minus-Berechnung gültige Eingabewerte verwendet hat.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.13_last_error', {
        name: {
            en: 'pH Minus last error',
            de: 'pH-Minus letzter Fehler',
        },
        desc: {
            en: 'Last validation or calculation error of the pH Minus calculator.',
            de: 'Letzter Prüf- oder Berechnungsfehler des pH-Minus-Rechners.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.ph_minus_calculator.14_last_calculated_at', {
        name: {
            en: 'pH Minus last calculation time',
            de: 'pH-Minus letzte Berechnung',
        },
        desc: {
            en: 'Timestamp of the last pH Minus calculation.',
            de: 'Zeitpunkt der letzten pH-Minus-Berechnung.',
        },
        type: 'number',
        role: 'value.time',
        read: true,
        write: false,
        def: 0,
        persist: true,
    });

    // -------------------------------------------------------------
    // Salt calculator
    // -------------------------------------------------------------
    await createChannel(adapter, 'chemistry.tools.salt_calculator', {
        en: 'Salt calculator',
        de: 'Salz-Rechner',
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.01_pool_volume_l', {
        name: {
            en: 'Pool volume',
            de: 'Poolvolumen',
        },
        desc: {
            en: 'Pool water volume used for the salt calculation. This value can be prefilled from PoolControl but may be overwritten manually.',
            de: 'Pool-Wasservolumen für die Salzberechnung. Der Wert kann von PoolControl vorbelegt, aber manuell überschrieben werden.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 0,
        min: 0,
        unit: 'l',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.02_current_salt_ppm', {
        name: {
            en: 'Current salt concentration',
            de: 'Aktuelle Salzkonzentration',
        },
        desc: {
            en: 'Current salt concentration in the pool water in ppm.',
            de: 'Aktuelle Salzkonzentration im Poolwasser in ppm.',
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

    await createState(adapter, 'chemistry.tools.salt_calculator.03_target_salt_ppm', {
        name: {
            en: 'Target salt concentration',
            de: 'Ziel-Salzkonzentration',
        },
        desc: {
            en: 'Target salt concentration for the pool water in ppm.',
            de: 'Gewünschte Ziel-Salzkonzentration für das Poolwasser in ppm.',
        },
        type: 'number',
        role: 'level',
        read: true,
        write: true,
        def: 4000,
        min: 0,
        unit: 'ppm',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.04_calculate', {
        name: {
            en: 'Calculate salt amount',
            de: 'Salzmenge berechnen',
        },
        desc: {
            en: 'Starts the salt calculation. The result is calculated only when this button is pressed.',
            de: 'Startet die Salzberechnung. Das Ergebnis wird nur berechnet, wenn dieser Button gedrückt wird.',
        },
        type: 'boolean',
        role: 'button',
        read: true,
        write: true,
        def: false,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.10_result_kg', {
        name: {
            en: 'Calculated salt amount',
            de: 'Berechnete Salzmenge',
        },
        desc: {
            en: 'Calculated amount of salt in kilograms. This is an orientation value for raising the salt concentration.',
            de: 'Berechnete Salzmenge in Kilogramm. Dies ist ein Orientierungswert zur Erhöhung der Salzkonzentration.',
        },
        type: 'number',
        role: 'value',
        read: true,
        write: false,
        def: 0,
        min: 0,
        unit: 'kg',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.11_result_text', {
        name: {
            en: 'Salt result text',
            de: 'Salz-Ergebnistext',
        },
        desc: {
            en: 'Readable result text for the salt calculation, including safety notes.',
            de: 'Lesbarer Ergebnistext der Salzberechnung inklusive Hinweisen.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.12_valid', {
        name: {
            en: 'Salt calculation valid',
            de: 'Salzberechnung gültig',
        },
        desc: {
            en: 'Shows whether the last salt calculation used valid input values.',
            de: 'Zeigt an, ob die letzte Salzberechnung gültige Eingabewerte verwendet hat.',
        },
        type: 'boolean',
        role: 'indicator',
        read: true,
        write: false,
        def: false,
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.13_last_error', {
        name: {
            en: 'Salt last error',
            de: 'Salz letzter Fehler',
        },
        desc: {
            en: 'Last validation or calculation error of the salt calculator.',
            de: 'Letzter Prüf- oder Berechnungsfehler des Salz-Rechners.',
        },
        type: 'string',
        role: 'text',
        read: true,
        write: false,
        def: '',
        persist: true,
    });

    await createState(adapter, 'chemistry.tools.salt_calculator.14_last_calculated_at', {
        name: {
            en: 'Salt last calculation time',
            de: 'Salz letzte Berechnung',
        },
        desc: {
            en: 'Timestamp of the last salt calculation.',
            de: 'Zeitpunkt der letzten Salzberechnung.',
        },
        type: 'number',
        role: 'value.time',
        read: true,
        write: false,
        def: 0,
        persist: true,
    });

    adapter.log.debug('[chemistryToolsStates] Initialization completed');
}

module.exports = {
    createChemistryToolsStates,
};

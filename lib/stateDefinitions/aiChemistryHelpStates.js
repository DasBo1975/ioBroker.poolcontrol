'use strict';

/**
 * aiChemistryHelpStates.js
 * ----------------------------------------------------------
 * Legt die States für die KI-Chemie-Hilfe an.
 *
 * Zweck:
 *  - Manuelle Auswahl eines beobachteten Pool-Problems
 *  - Ausgabe eines erklärenden Hilfetextes (ohne Dosierung)
 *
 * Struktur:
 *   ai.chemistry_help.*
 *
 * Hinweis:
 *  - Reine Informationsfunktion
 *  - Keine Steuerung, keine Automatik, keine Sprachausgabe
 * ----------------------------------------------------------
 */

/**
 * Erstellt alle States für die AI-Chemie-Hilfe.
 *
 * @param {import('iobroker').Adapter} adapter - ioBroker Adapterinstanz
 */
async function createAiChemistryHelpStates(adapter) {
    adapter.log.debug('[aiChemistryHelpStates] Initialisierung gestartet');

    // ----------------------------------------------------------
    // Channel: ai.chemistry_help
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help', {
        type: 'channel',
        common: {
            name: 'Chemie-Hilfe (Erklärungen & Ursachen)',
        },
        native: {},
    });

    // ----------------------------------------------------------
    // Auswahl des Problems (manuell)
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help.issue', {
        type: 'state',
        common: {
            name: 'Chemie-Hilfe: Problem auswählen',
            desc: 'Manuelle Auswahl eines beobachteten Pool-Problems zur Anzeige allgemeiner Erklärungen.',
            type: 'string',
            role: 'value',
            read: true,
            write: true,
            def: 'none',
            states: {
                none: 'Kein Problem ausgewählt',

                // pH-Wert
                ph_low: 'pH-Wert ist zu niedrig',
                ph_high: 'pH-Wert ist zu hoch',

                // Chlor / Desinfektion
                chlor_low: 'Chlorwert ist zu niedrig',
                chlor_high: 'Chlorwert ist zu hoch',
                chlor_no_effect: 'Chlor steigt trotz Zugabe nicht',
                chlor_smell: 'Starker Chlorgeruch trotz Messwert',

                // Wasserbild / Optik
                water_green: 'Wasser ist grün',
                water_cloudy: 'Wasser ist trüb / grau / milchig',
                algae_visible: 'Algen an Wänden oder Boden sichtbar',
                foam_on_surface: 'Schaumbildung auf der Wasseroberfläche',

                // Badegefühl / Stabilität
                skin_eye_irritation: 'Haut- oder Augenreizungen beim Baden',
                values_unstable: 'Wasserwerte sind häufig instabil',

                // Unsicherheit
                unknown_problem: 'Problem unklar / nicht eindeutig',
            },
        },
        native: {},
    });

    // ----------------------------------------------------------
    // Erklärungstext (wird später vom Helper gefüllt)
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help.help_text', {
        type: 'state',
        common: {
            name: 'Chemie-Hilfe: Erklärung',
            desc: 'Erklärender Text zu Ursachen und allgemeinen Lösungsansätzen (keine Dosierung, keine Steuerung).',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        native: {},
    });

    // ----------------------------------------------------------
    // Zeitpunkt der letzten Auswahl
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help.last_issue_time', {
        type: 'state',
        common: {
            name: 'Chemie-Hilfe: Letzte Auswahl',
            desc: 'Zeitpunkt der letzten Auswahl eines Chemie-Hilfe-Problems.',
            type: 'number',
            role: 'value.time',
            read: true,
            write: false,
            def: 0,
        },
        native: {},
    });

    adapter.log.debug('[aiChemistryHelpStates] Initialisierung abgeschlossen');
}

module.exports = {
    createAiChemistryHelpStates,
};

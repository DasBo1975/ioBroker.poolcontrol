'use strict';

const { I18n } = require('@iobroker/adapter-core');

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
    // FIX: Logs must be English (mcm requirement)
    adapter.log.debug('[aiChemistryHelpStates] Initialization started');

    const issueStates = {
        none: I18n.translate('No issue selected'),

        // pH
        ph_low: I18n.translate('pH is too low'),
        ph_high: I18n.translate('pH is too high'),

        // Chlorine / disinfection
        chlor_low: I18n.translate('Chlorine is too low'),
        chlor_high: I18n.translate('Chlorine is too high'),
        chlor_no_effect: I18n.translate('Chlorine does not rise despite dosing'),
        chlor_smell: I18n.translate('Strong chlorine smell despite reading'),

        // Water appearance
        water_green: I18n.translate('Water is green'),
        water_cloudy: I18n.translate('Water is cloudy / gray / milky'),
        algae_visible: I18n.translate('Algae visible on walls or floor'),
        foam_on_surface: I18n.translate('Foam on the water surface'),

        // Swim feel / stability
        skin_eye_irritation: I18n.translate('Skin or eye irritation when swimming'),
        values_unstable: I18n.translate('Water values are often unstable'),

        // Uncertainty
        unknown_problem: I18n.translate('Issue unclear / not specific'),
    };

    // ----------------------------------------------------------
    // Channel: ai.chemistry_help
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help', {
        type: 'channel',
        common: {
            name: {
                en: 'Chemistry help (explanations & causes)',
                de: 'Chemie-Hilfe (Erklärungen & Ursachen)',
            },
        },
        native: {},
    });

    // ----------------------------------------------------------
    // Auswahl des Problems (manuell)
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help.issue', {
        type: 'state',
        common: {
            name: {
                en: 'Chemistry help: select issue',
                de: 'Chemie-Hilfe: Problem auswählen',
            },
            desc: {
                en: 'Manual selection of an observed pool issue to display general explanations.',
                de: 'Manuelle Auswahl eines beobachteten Poolproblems zur Anzeige allgemeiner Erklärungen.',
            },
            type: 'string',
            role: 'level',
            read: true,
            write: true,
            def: 'none',
            states: issueStates,
        },
        native: {},
    });

    // ----------------------------------------------------------
    // Erklärungstext (wird später vom Helper gefüllt)
    // ----------------------------------------------------------
    await adapter.setObjectNotExistsAsync('ai.chemistry_help.help_text', {
        type: 'state',
        common: {
            name: {
                en: 'Chemistry help: explanation',
                de: 'Chemie-Hilfe: Erklärung',
            },
            desc: {
                en: 'Explanatory text about causes and general approaches (no dosing, no control).',
                de: 'Erklärender Text zu Ursachen und allgemeinen Ansätzen (keine Dosierung, keine Steuerung).',
            },
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
            name: {
                en: 'Chemistry help: last selection',
                de: 'Chemie-Hilfe: letzte Auswahl',
            },
            desc: {
                en: 'Timestamp of the last selected chemistry help issue.',
                de: 'Zeitstempel des zuletzt ausgewählten Chemie-Hilfe-Problems.',
            },
            type: 'number',
            role: 'value.time',
            read: true,
            write: false,
            def: 0,
        },
        native: {},
    });

    // FIX: Logs must be English (mcm requirement)
    adapter.log.debug('[aiChemistryHelpStates] Initialization completed');
}

module.exports = {
    createAiChemistryHelpStates,
};

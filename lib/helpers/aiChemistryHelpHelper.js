'use strict';

const { I18n } = require('@iobroker/adapter-core');

/* eslint-disable jsdoc/require-param-description */
/* eslint-disable jsdoc/require-returns-description */

/**
 * aiChemistryHelpHelper
 * --------------------------------------------------------------
 * KI-Chemie-Hilfe für PoolControl (rein informativ).
 *
 * Nutzt die States aus aiChemistryHelpStates.js:
 *   ai.chemistry_help.issue
 *   ai.chemistry_help.help_text
 *   ai.chemistry_help.last_issue_time
 *
 * Prinzip:
 *  - User wählt ein beobachtetes Problem (issue)
 *  - Helper schreibt einen erklärenden Text (help_text)
 *
 * WICHTIG:
 *  - Keine Dosierungen
 *  - Keine Produktempfehlungen
 *  - Keine Steuerung / Automatik
 *  - Keine Sprachausgabe (speech.queue bleibt unberührt)
 *
 * Inhalte:
 *  - Allgemeine Ursachen
 *  - Wichtige Zusammenhänge (pH ↔ Chlor ↔ Filterung)
 *  - Übliche Lösungsrichtungen (schrittweise, messen, zirkulieren)
 */

const aiChemistryHelpHelper = {
    adapter: null,

    /**
     * Initialisiert den Helper.
     *
     * @param {import('iobroker').Adapter} adapter
     */
    async init(adapter) {
        this.adapter = adapter;
        this.adapter.log.info('[aiChemistryHelpHelper] initialization started');

        // NEU: auf Auswahländerungen reagieren
        this.adapter.subscribeStates('ai.chemistry_help.issue');

        // NEU: beim Start aktuellen Auswahlwert übernehmen (wenn vorhanden)
        try {
            const st = await this.adapter.getStateAsync('ai.chemistry_help.issue');
            if (st && st.val !== null && st.val !== undefined) {
                await this._processIssue(String(st.val));
            }
        } catch (e) {
            this.adapter.log.debug(`[aiChemistryHelpHelper] init: could not read issue: ${e.message}`);
        }

        this.adapter.log.info('[aiChemistryHelpHelper] initialization finished');
    },

    /**
     * Aufräumen beim Adapter-Stop.
     */
    cleanup() {
        // aktuell keine Timer / Intervalle
        this.adapter && this.adapter.log.debug('[aiChemistryHelpHelper] cleanup finished');
    },

    /**
     * Reagiert auf State-Änderungen.
     *
     * @param {string} id
     * @param {ioBroker.State | null} state
     */
    async handleStateChange(id, state) {
        if (!this.adapter) {
            return;
        }
        if (!state) {
            return;
        }

        // Eigene Rückschreibungen ignorieren (Loop-Schutz)
        if (
            state.ack === true &&
            (id.endsWith('.ai.chemistry_help.help_text') || id.endsWith('.ai.chemistry_help.last_issue_time'))
        ) {
            return;
        }

        // Nur unser relevanter Datenpunkt
        if (!id.includes('.ai.chemistry_help.issue')) {
            return;
        }

        let issue = 'none';

        // Enum-Auswahl: Index → String auflösen
        if (typeof state.val === 'number') {
            try {
                const obj = await this.adapter.getObjectAsync(id);
                if (obj?.common?.states) {
                    issue = obj.common.states[state.val] || 'none';
                }
            } catch (e) {
                this.adapter.log.debug(`[aiChemistryHelpHelper] could not resolve enum text: ${e.message}`);
            }
        } else {
            issue = String(state.val || 'none');
        }
        this.adapter.log.debug(`[aiChemistryHelpHelper] selection changed: ${issue}`);

        await this._processIssue(issue);
    },

    // ---------------------------------------------------------------------
    // Core
    // ---------------------------------------------------------------------

    /**
     * Schreibt Text + Timestamp für das gewählte Problem.
     *
     * @param {string} issue
     */
    async _processIssue(issue) {
        const normalized = (issue || 'none').trim();

        // "none" oder leer → Text leeren
        if (!normalized || normalized === 'none') {
            await this._setStateIfChanged('ai.chemistry_help.help_text', '');
            await this._setStateIfChanged('ai.chemistry_help.last_issue_time', Date.now());
            return;
        }

        const text = this._getHelpText(normalized);

        await this.adapter.setStateAsync('ai.chemistry_help.help_text', {
            val: text,
            ack: true,
        });
        await this.adapter.setStateAsync('ai.chemistry_help.last_issue_time', {
            val: Date.now(),
            ack: true,
        });
    },

    /**
     * Liefert den finalen Hilfetext (Deutsch) für ein Problem.
     *
     * @param {string} issue
     * @returns {string}
     */
    _getHelpText(issue) {
        const commonFooter =
            `\n\n${I18n.t('Important:')}\n` +
            `• ${I18n.t('Always proceed step by step: measure first → correct in small steps → let the water circulate → measure again.')}\n` +
            `• ${I18n.t('Always follow the product instructions (concentration and pool volume may differ).')}\n` +
            `• ${I18n.t('If you are unsure, correct more slowly rather than forcing it.')}\n`;

        const map = {
            // ----------------------------------------------------------
            // pH
            // ----------------------------------------------------------
            ph_low:
                `${I18n.t('Problem: pH value is too low (water is too acidic).')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('A pH value that is too low can attack materials (metals / built-in parts) more strongly and can increase irritation during bathing. It can also make the overall water balance unstable.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('A lot of rainwater / fresh water (can acidify the water)')}\n` +
                `• ${I18n.t('Low alkalinity (buffer missing → pH drops faster)')}\n` +
                `• ${I18n.t('Frequent corrections / backwashing / water changes')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Raise the pH gradually with a pH increaser / pH plus product.')}\n` +
                `• ${I18n.t('If the pH keeps dropping again, also check total alkalinity / the buffer, otherwise every pH correction will only hold for a short time.')}\n${
                    commonFooter
                }`,

            ph_high:
                `${I18n.t('Problem: pH value is too high (water is too alkaline).')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('If the pH value is too high, chlorine / disinfection often works less effectively and cloudiness / precipitation (for example lime) can occur more easily. Eyes and skin may also become irritated.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('Strong outgassing / a lot of bubbling (CO₂ escapes → pH rises)')}\n` +
                `• ${I18n.t('Hard water / high alkalinity')}\n` +
                `• ${I18n.t('Some pools / materials can initially push the pH upward')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Lower the pH in small steps with a pH reducer / pH minus product.')}\n` +
                `• ${I18n.t('If the pH repeatedly rises again, also consider alkalinity / water hardness, because this strongly affects stability.')}\n${
                    commonFooter
                }`,

            // ----------------------------------------------------------
            // Chlor
            // ----------------------------------------------------------
            chlor_low:
                `${I18n.t('Problem: Chlorine level is too low.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('Too little effective chlorine can allow germs and algae to multiply more easily. Often the first signs are tired-looking water: less clarity, more odor, and deposits forming faster.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('A lot of sun / UV exposure (chlorine breaks down faster)')}\n` +
                `• ${I18n.t('High bathing load (sweat / organic matter consumes chlorine)')}\n` +
                `• ${I18n.t('Unfavorable pH value (chlorine works less effectively)')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Bring disinfection back into a normal range and check the pH in parallel.')}\n` +
                `• ${I18n.t('If chlorine keeps dropping permanently, also check causes such as organic load, filter condition, and circulation.')}\n${
                    commonFooter
                }`,

            chlor_high:
                `${I18n.t('Problem: Chlorine level is too high.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('A chlorine level that is too high can irritate eyes and skin, cause strong odor, and put more stress on materials and covers. In this situation, adding even more chemicals is almost never the right direction.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('Too much chlorine added / shock treatment too high')}\n` +
                `• ${I18n.t('Too little natural breakdown (cover on + little sun)')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Do not add more chlorine.')}\n` +
                `• ${I18n.t('Let time do the work (sun / UV reduces chlorine) and keep the water circulating well.')}\n` +
                `• ${I18n.t('Only evaluate further corrections (for example pH) once chlorine is back in a normal range.')}\n${
                    commonFooter
                }`,

            chlor_no_effect:
                `${I18n.t('Problem: Chlorine level does not rise despite dosing.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('This often happens when the water has a high chlorine demand: the added chlorine is consumed immediately before a stable free chlorine level can remain measurable.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('High organic load (dirt, biofilm, heavy use)')}\n` +
                `• ${I18n.t('Early / invisible algae growth')}\n` +
                `• ${I18n.t('Strongly incorrect pH value (effectiveness reduced)')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('First check the basic values (pH, filter / circulation, visual inspection for deposits).')}\n` +
                `• ${I18n.t('Get the water clean again (clean / backwash the filter, brush the pool), so chlorine is not only being consumed immediately.')}\n` +
                `• ${I18n.t('If no effect can be measured permanently, there is often an oxidative demand present (chlorine is immediately bound / broken down) – then only consistent reduction of the causes and measuring again will help.')}\n${
                    commonFooter
                }`,

            chlor_smell:
                `${I18n.t('Problem: Strong chlorine smell despite the measured value.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('The typical indoor pool smell often does not come from too much good chlorine, but from bound chlorine compounds (chloramines). These are formed when chlorine combines with nitrogen / organic matter from sweat and similar contamination.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('High bathing load / organic input')}\n` +
                `• ${I18n.t('Too little fresh water / breakdown / filter care')}\n` +
                `• ${I18n.t('Poor ventilation (for indoor pools) increases the perceived smell')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('The goal is to reduce bound contamination: good circulation / filtration, pool cleaning, and possibly a fresh water share.')}\n` +
                `• ${I18n.t('Also check the pH in parallel, because an incorrect pH further reduces disinfection performance.')}\n${commonFooter}`,

            // ----------------------------------------------------------
            // Wasserbild / Optik
            // ----------------------------------------------------------
            water_green:
                `${I18n.t('Problem: Water is green.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('Green water is very often a sign of algae growth (often caused by too little effective chlorine and / or poor circulation).')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('Free chlorine too low or already consumed')}\n` +
                `• ${I18n.t('pH too high → chlorine works much less effectively')}\n` +
                `• ${I18n.t('Insufficient filter / circulation or dirty filter')}\n` +
                `• ${I18n.t('High temperature + sun (algae growth is encouraged)')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Check the water values (especially pH and chlorine) and improve circulation / filter condition.')}\n` +
                `• ${I18n.t('Brush / vacuum the pool thoroughly so deposits do not survive.')}\n` +
                `• ${I18n.t('Then let the filter run patiently until the water becomes clear again.')}\n${commonFooter}`,

            water_cloudy:
                `${I18n.t('Problem: Water is cloudy / gray / milky.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('Cloudy water is often caused by fine suspended particles or chemical imbalances (for example pH / alkalinity / lime) that the filter cannot handle well.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('Dirty filter / filter runtime too short')}\n` +
                `• ${I18n.t('pH / alkalinity outside the stable range')}\n` +
                `• ${I18n.t('High water hardness (lime) – especially together with high pH')}\n` +
                `• ${I18n.t('Too little disinfection → biological cloudiness is possible')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Check the filter condition (cleaning / backwashing) and ensure sufficient circulation.')}\n` +
                `• ${I18n.t('Check the basic values pH / chlorine and stabilize them.')}\n` +
                `• ${I18n.t('If the cloudiness looks mineral (milky / white), also consider water hardness / balance.')}\n${
                    commonFooter
                }`,

            algae_visible:
                `${I18n.t('Problem: Algae visible on walls or floor.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('Visible algae are a clear sign that disinfection / circulation was not sufficient or that local dead zones are forming (corners / pipes).')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('Chlorine too low or already consumed')}\n` +
                `• ${I18n.t('pH too high (chlorine works less effectively)')}\n` +
                `• ${I18n.t('Too little brushing / pool care, poor circulation')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Mechanics first: brush / vacuum consistently, maintain the filter.')}\n` +
                `• ${I18n.t('Then stabilize the values (pH / chlorine) and improve circulation.')}\n` +
                `• ${I18n.t('The goal is to remove algae not only chemically, but also mechanically.')}\n${commonFooter}`,

            foam_on_surface:
                `${I18n.t('Problem: Foam on the water surface.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('Foam is often caused by surfactants / organic matter (sunscreen, body care products, cleaning residues), some algaecides / polymers, or also air in the system. It is usually not a chlorine problem, but rather a substances-in-the-water problem.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('A lot of lotions / oils in the water, high organic load')}\n` +
                `• ${I18n.t('Certain anti-algae products can promote foam')}\n` +
                `• ${I18n.t('Air entering the system (small leaks) → foam appears stronger')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Skim off the surface, keep the filter clean, and reduce organic input.')}\n` +
                `• ${I18n.t('Keep an eye on pH / chlorine as well (stable values help break down organic matter faster).')}\n` +
                `• ${I18n.t('If foam remains permanently, systematically narrow down the source (products / contamination / technology).')}\n${
                    commonFooter
                }`,

            // ----------------------------------------------------------
            // Badegefühl / Stabilität
            // ----------------------------------------------------------
            skin_eye_irritation:
                `${I18n.t('Problem: Skin or eye irritation while swimming.')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('Irritation can have several causes: pH that is too high or very low, too high a disinfectant concentration, or bound chlorine compounds (chloramines) caused by organic contamination.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('pH outside the comfortable range')}\n` +
                `• ${I18n.t('Chlorine clearly too high')}\n` +
                `• ${I18n.t('Chlorine smell / chloramines caused by strong organic input')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('Measure first (pH and chlorine) and bring the values back into a normal range.')}\n` +
                `• ${I18n.t('Keep the pool / filter clean so that organic contamination does not turn into bound compounds.')}\n` +
                `• ${I18n.t('If irritation is strong, pause swimming until the water values are stable.')}\n${commonFooter}`,

            values_unstable:
                `${I18n.t('Problem: Water values are often unstable (change quickly).')}\n\n` +
                `${I18n.t('What this means:')}\n` +
                `${I18n.t('If pH / chlorine fluctuate strongly all the time, the water often lacks stability: the buffer (alkalinity) is too low / too high, the load changes frequently, or circulation / filtration is not constant enough.')}\n\n` +
                `${I18n.t('Common causes:')}\n` +
                `• ${I18n.t('Total alkalinity too low → pH jumps / tips over quickly')}\n` +
                `• ${I18n.t('Many small corrections without enough circulation time')}\n` +
                `• ${I18n.t('Poor filter condition / filter times too short')}\n` +
                `• ${I18n.t('Strong external influences (rain, heat, heavy use)')}\n\n` +
                `${I18n.t('Typical corrective direction:')}\n` +
                `• ${I18n.t('First get the basics stable (buffer / filter / regularity), then only fine-tune.')}\n` +
                `• ${I18n.t('Always correct in small steps and allow enough time for mixing.')}\n${commonFooter}`,

            unknown_problem:
                `${I18n.t('Problem: It is unclear what exactly is wrong.')}\n\n` +
                `${I18n.t('Procedure (minimal and sensible):')}\n` +
                `1) ${I18n.t('Visual check: Green? Cloudy? Deposits? Foam?')}\n` +
                `2) ${I18n.t('Two measured values are enough for the start: pH + free chlorine.')}\n` +
                `3) ${I18n.t('Check the technology: Is circulation running? Is the filter clean? Is backwashing needed?')}\n\n` +
                `${I18n.t('Typical rule of thumb:')}\n` +
                `• ${I18n.t('Visual problems (green / cloudy) are very often a combination of disinfection + pH + filtration.')}\n` +
                `• ${I18n.t('Odor / irritation is often not too much chlorine, but incorrectly bound / organically loaded water.')}\n${
                    commonFooter
                }`,
        };

        if (map[issue]) {
            return map[issue];
        }

        // Fallback
        return (
            `${I18n.t('Note: This problem is not known yet.')}\n\n` +
            `${I18n.t('Please select one of the existing items or use "Issue unclear / not specific".')}\n${
                commonFooter
            }`
        );
    },

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Setzt einen State nur dann, wenn sich der Wert wirklich ändert.
     * Verhindert unnötige State-Writes und mögliche Loop-Effekte.
     *
     * @param {string} id
     * @param {string|number|boolean} value
     */
    async _setStateIfChanged(id, value) {
        try {
            const current = await this.adapter.getStateAsync(id);
            const curVal = current ? current.val : undefined;

            // String/Number/Bool robust vergleichen
            if (String(curVal ?? '') === String(value ?? '')) {
                return;
            }

            await this.adapter.setStateAsync(id, { val: value, ack: true });
        } catch (e) {
            this.adapter.log.debug(`[aiChemistryHelpHelper] _setStateIfChanged error (${id}): ${e.message}`);
        }
    },
};

module.exports = aiChemistryHelpHelper;

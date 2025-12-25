'use strict';
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
        this.adapter.log.info('[aiChemistryHelpHelper] Initialisierung gestartet');

        // NEU: auf Auswahländerungen reagieren
        this.adapter.subscribeStates('ai.chemistry_help.issue');

        // NEU: beim Start aktuellen Auswahlwert übernehmen (wenn vorhanden)
        try {
            const st = await this.adapter.getStateAsync('ai.chemistry_help.issue');
            if (st && st.val !== null && st.val !== undefined) {
                await this._processIssue(String(st.val));
            }
        } catch (e) {
            this.adapter.log.debug(`[aiChemistryHelpHelper] Init: Konnte issue nicht lesen: ${e.message}`);
        }

        this.adapter.log.info('[aiChemistryHelpHelper] Initialisierung abgeschlossen');
    },

    /**
     * Aufräumen beim Adapter-Stop.
     */
    cleanup() {
        // aktuell keine Timer / Intervalle
        this.adapter && this.adapter.log.debug('[aiChemistryHelpHelper] Cleanup abgeschlossen');
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
            (id.endsWith('.ai.chemistry_help.help_text') ||
             id.endsWith('.ai.chemistry_help.last_issue_time'))
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
                this.adapter.log.debug(
                    `[aiChemistryHelpHelper] Konnte Enum-Text nicht auflösen: ${e.message}`,
                );
            }
        } else {
            issue = String(state.val || 'none');
        }
        this.adapter.log.debug(`[aiChemistryHelpHelper] Auswahl geändert: ${issue}`);

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
            '\n\nWichtig:\n' +
            '• Immer schrittweise vorgehen: erst messen → klein korrigieren → umwälzen lassen → erneut messen.\n' +
            '• Angaben auf dem Produkt beachten (Konzentration/Beckenvolumen unterscheiden sich).\n' +
            '• Wenn du unsicher bist: lieber langsamer korrigieren als „mit Gewalt“.\n';

        const map = {
            // ----------------------------------------------------------
            // pH
            // ----------------------------------------------------------
            ph_low:
                `Problem: pH-Wert ist zu niedrig (Wasser ist „zu sauer“).\n\n` +
                `Was das bedeutet:\n` +
                `Ein zu niedriger pH-Wert kann Material (Metalle/Einbauteile) stärker angreifen und Badereizungen begünstigen. Außerdem kann die Wasserbalance insgesamt instabil werden.\n\n` +
                `Häufige Ursachen:\n` +
                `• Viel Regen-/Frischwasser (kann das Wasser „ansäuern“)\n` +
                `• Niedrige Alkalinität (Puffer fehlt → pH fällt schneller)\n` +
                `• Häufige Korrekturen/Backwash/Wasserwechsel\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• pH mit einem „pH-Plus“/pH-Heber schrittweise anheben.\n` +
                `• Wenn der pH ständig wieder fällt: Totalalkalinität/„Puffer“ mit prüfen, weil sonst jede pH-Korrektur nur kurz hält.\n${
                    commonFooter
                }`,

            ph_high:
                `Problem: pH-Wert ist zu hoch (Wasser ist „zu basisch“).\n\n` +
                `Was das bedeutet:\n` +
                `Bei zu hohem pH-Wert arbeitet Chlor/Desinfektion oft schlechter, und es kann leichter zu Trübungen/Ausfällungen kommen (z. B. Kalk). Außerdem können Augen/Haut gereizt sein.\n\n` +
                `Häufige Ursachen:\n` +
                `• Starkes „Ausgasen“/viel Sprudel (CO₂ entweicht → pH steigt)\n` +
                `• Hartes Wasser / hohe Alkalinität\n` +
                `• Manche Becken/Materialien können anfangs pH nach oben ziehen\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• pH mit „pH-Minus“/pH-Senker in kleinen Schritten senken.\n` +
                `• Bei wiederkehrend hohem pH: Alkalinität/Wasserhärte mit betrachten, weil das die Stabilität stark beeinflusst.\n${
                    commonFooter
                }`,

            // ----------------------------------------------------------
            // Chlor
            // ----------------------------------------------------------
            chlor_low:
                `Problem: Chlorwert ist zu niedrig.\n\n` +
                `Was das bedeutet:\n` +
                `Zu wenig wirksames Chlor kann dazu führen, dass sich Keime/Algen leichter vermehren. Häufig sieht man dann zuerst „müdes“ Wasser: weniger klar, mehr Geruch, schneller Belag.\n\n` +
                `Häufige Ursachen:\n` +
                `• Viel Sonne/UV (Chlor wird schneller abgebaut)\n` +
                `• Hohe Badebelastung (Schweiß/Organik „verbraucht“ Chlor)\n` +
                `• pH-Wert ungünstig (Chlor wirkt schlechter)\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Desinfektion wieder in einen normalen Bereich bringen und parallel pH kontrollieren.\n` +
                `• Wenn Chlor dauerhaft „wegbricht“: Ursachen wie organische Belastung/Filterzustand/Umwälzung mit prüfen.\n${
                    commonFooter
                }`,

            chlor_high:
                `Problem: Chlorwert ist zu hoch.\n\n` +
                `Was das bedeutet:\n` +
                `Zu hoher Chlorwert kann Augen/Haut reizen, starken Geruch verursachen und Material/Abdeckungen stärker belasten. In diesem Zustand ist „mehr Chemie“ fast nie die richtige Richtung.\n\n` +
                `Häufige Ursachen:\n` +
                `• Zu viel nachdosiert / Schockbehandlung zu hoch\n` +
                `• Zu wenig Abbau (Abdeckung drauf + wenig Sonne)\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Keine weitere Chlorzugabe.\n` +
                `• Zeit wirken lassen (Sonne/UV baut Chlor ab) und gut umwälzen.\n` +
                `• Erst wenn Chlor wieder im normalen Bereich ist, weitere Korrekturen (z. B. pH) sinnvoll bewerten.\n${
                    commonFooter
                }`,

            chlor_no_effect:
                `Problem: „Chlor steigt trotz Zugabe nicht“.\n\n` +
                `Was das bedeutet:\n` +
                `Das passiert häufig, wenn das Wasser eine hohe „Chlornachfrage“ hat: Das zugegebene Chlor wird sofort verbraucht, bevor ein stabiler freier Chlorwert messbar bleibt.\n\n` +
                `Häufige Ursachen:\n` +
                `• Hohe organische Belastung (Schmutz, Biofilm, starke Nutzung)\n` +
                `• Beginnender/unsichtbarer Algenbefall\n` +
                `• Stark falscher pH-Wert (Wirkung eingeschränkt)\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Erst Grundwerte prüfen (pH, Filter/Umwälzung, Sichtprüfung auf Beläge).\n` +
                `• Wasser „sauber bekommen“ (Filter reinigen/rückspülen, Becken bürsten), damit Chlor nicht nur „verbraucht“ wird.\n` +
                `• Wenn dauerhaft keine Wirkung messbar ist, liegt oft ein „oxidativer Bedarf“ vor (Chlor wird sofort gebunden/abgebaut) – dann hilft nur konsequent Ursachen reduzieren und danach erneut messen.\n${
                    commonFooter
                }`,

            chlor_smell:
                `Problem: Starker „Chlorgeruch“ trotz Messwert.\n\n` +
                `Was das bedeutet:\n` +
                `Der typische „Hallenbad-Geruch“ kommt oft nicht von „zu viel gutem Chlor“, sondern von gebundenen Chlorverbindungen (Chloramine). Diese entstehen, wenn Chlor sich mit Stickstoff-/Organik aus Schweiß/Urinfrachten verbindet.\n\n` +
                `Häufige Ursachen:\n` +
                `• Hohe Badebelastung / organische Einträge\n` +
                `• Zu wenig Frischwasser/Abbau/Filterpflege\n` +
                `• Schlechte Lüftung (bei Indoor-Pools) verstärkt die Wahrnehmung\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Ziel ist, gebundene Belastung zu reduzieren: gute Umwälzung/Filtration, Beckenreinigung, ggf. Frischwasseranteil.\n` +
                `• Parallel pH prüfen, weil falscher pH die Desinfektion zusätzlich verschlechtert.\n${commonFooter}`,

            // ----------------------------------------------------------
            // Wasserbild / Optik
            // ----------------------------------------------------------
            water_green:
                `Problem: Wasser ist grün.\n\n` +
                `Was das bedeutet:\n` +
                `Grünes Wasser ist sehr häufig ein Hinweis auf Algenwachstum (oft ausgelöst durch zu wenig wirksames Chlor und/oder schlechte Umwälzung).\n\n` +
                `Häufige Ursachen:\n` +
                `• Freies Chlor zu niedrig oder „verbraucht“\n` +
                `• pH zu hoch → Chlor wirkt deutlich schlechter\n` +
                `• Filter/Umwälzung unzureichend oder Filter verschmutzt\n` +
                `• Hohe Temperatur + Sonne (Algenwachstum wird begünstigt)\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Wasserwerte prüfen (insb. pH und Chlor) und Umwälzung/Filterzustand verbessern.\n` +
                `• Becken gründlich bürsten/absaugen, damit Beläge nicht „überleben“.\n` +
                `• Danach geduldig filtern lassen, bis das Wasser wieder klar wird.\n${commonFooter}`,

            water_cloudy:
                `Problem: Wasser ist trüb / grau / milchig.\n\n` +
                `Was das bedeutet:\n` +
                `Trübes Wasser entsteht oft durch feine Schwebstoffe oder chemische Ungleichgewichte (z. B. pH/Alkalinität/Kalk), die der Filter nicht gut „packt“.\n\n` +
                `Häufige Ursachen:\n` +
                `• Filter verschmutzt/zu kurze Filterlaufzeit\n` +
                `• pH/Alkalinität außerhalb des stabilen Bereichs\n` +
                `• Hohe Wasserhärte (Kalk) – besonders in Kombination mit hohem pH\n` +
                `• Zu wenig Desinfektion → biologische Trübung möglich\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Filterzustand prüfen (Reinigung/Rückspülen) und ausreichend umwälzen.\n` +
                `• Grundwerte pH/Chlor prüfen und stabilisieren.\n` +
                `• Wenn die Trübung „mineralisch“ wirkt (milchig/weiß): Wasserhärte/Balance mit betrachten.\n${
                    commonFooter
                }`,

            algae_visible:
                `Problem: Algen an Wänden oder Boden sichtbar.\n\n` +
                `Was das bedeutet:\n` +
                `Sichtbare Algen sind ein klares Zeichen, dass die Desinfektion/Umwälzung nicht ausreichend war oder lokal tote Zonen entstehen (Ecken/Leitungen).\n\n` +
                `Häufige Ursachen:\n` +
                `• Chlor zu niedrig oder „verbraucht“\n` +
                `• pH zu hoch (Chlor wirkt schlechter)\n` +
                `• Zu wenig Bürsten/Beckenpflege, schlechte Zirkulation\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Mechanik zuerst: konsequent bürsten/absaugen, Filterpflege.\n` +
                `• Werte (pH/Chlor) danach stabilisieren und Umwälzung verbessern.\n` +
                `• Ziel ist, Algen nicht nur „chemisch“, sondern auch mechanisch zu entfernen.\n${commonFooter}`,

            foam_on_surface:
                `Problem: Schaumbildung auf der Wasseroberfläche.\n\n` +
                `Was das bedeutet:\n` +
                `Schaum entsteht oft durch Tenside/Organik (Sonnencreme, Körperpflege, Reinigungsreste), manche Algenmittel/Polymere oder auch Luft im System. Es ist meist kein „Chlor-Problem“, sondern ein „Stoffe-im-Wasser“-Problem.\n\n` +
                `Häufige Ursachen:\n` +
                `• Viele Lotionen/Öle im Wasser, hohe organische Belastung\n` +
                `• Bestimmte algenhemmende Mittel können Schaum begünstigen\n` +
                `• Luft zieht ins System (kleine Undichtigkeiten) → Schaum wirkt stärker\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Oberfläche abschöpfen, Filter sauber halten, organische Einträge reduzieren.\n` +
                `• pH/Chlor im Blick behalten (stabile Werte helfen, Organik schneller abzubauen).\n` +
                `• Wenn Schaum dauerhaft bleibt: Quelle (Produkte/Einträge/Technik) systematisch eingrenzen.\n${
                    commonFooter
                }`,

            // ----------------------------------------------------------
            // Badegefühl / Stabilität
            // ----------------------------------------------------------
            skin_eye_irritation:
                `Problem: Haut- oder Augenreizungen beim Baden.\n\n` +
                `Was das bedeutet:\n` +
                `Reizungen können verschiedene Ursachen haben: zu hoher oder sehr niedriger pH, zu hohe Desinfektionskonzentration, oder gebundene Chlorverbindungen (Chloramine) bei organischer Belastung.\n\n` +
                `Häufige Ursachen:\n` +
                `• pH außerhalb des Wohlfühlbereichs\n` +
                `• Chlor deutlich zu hoch\n` +
                `• „Chlorgeruch“/Chloramine durch starke organische Einträge\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Zuerst messen (pH & Chlor) und Werte wieder in einen normalen Bereich bringen.\n` +
                `• Becken/Filter sauber halten, damit organische Belastung nicht in „gebundene“ Formen kippt.\n` +
                `• Bei starken Beschwerden: Baden pausieren, bis Wasserwerte stabil sind.\n${commonFooter}`,

            values_unstable:
                `Problem: Wasserwerte sind häufig instabil (kippen schnell).\n\n` +
                `Was das bedeutet:\n` +
                `Wenn pH/Chlor ständig stark schwanken, fehlt oft „Stabilität“ im Wasser: Puffer (Alkalinität) zu niedrig/zu hoch, wechselnde Belastung, oder die Umwälzung/Filtration ist nicht konstant genug.\n\n` +
                `Häufige Ursachen:\n` +
                `• Totalalkalinität zu niedrig → pH springt/kippt schnell\n` +
                `• Viele kleine Korrekturen ohne ausreichende Umwälzzeit\n` +
                `• Filterzustand schlecht / zu kurze Filterzeiten\n` +
                `• Starke externe Einflüsse (Regen, Hitze, hohe Nutzung)\n\n` +
                `Übliche Lösungsrichtung:\n` +
                `• Einmal „Basis“ stabil bekommen (Puffer/Filter/Regelmäßigkeit), dann erst fein korrigieren.\n` +
                `• Korrigieren immer in kleinen Schritten und mit Zeit zum Durchmischen.\n${commonFooter}`,

            unknown_problem:
                `Problem: Unklar, was genau los ist.\n\n` +
                `Vorgehen (minimal & sinnvoll):\n` +
                `1) Sichtcheck: Grün? Trüb? Beläge? Schaum?\n` +
                `2) Zwei Messwerte reichen für den Start: pH + freies Chlor.\n` +
                `3) Technik prüfen: Läuft die Umwälzung? Filter sauber? Rückspülen nötig?\n\n` +
                `Typische Faustregel:\n` +
                `• Optik-Probleme (grün/trüb) sind sehr oft eine Kombination aus Desinfektion + pH + Filterung.\n` +
                `• „Geruch/Reizung“ ist oft nicht „zu viel Chlor“, sondern „falsch gebunden/organisch belastet“.\n${
                    commonFooter
                }`,
        };

        if (map[issue]) {
            return map[issue];
        }

        // Fallback
        return (
            `Hinweis: Dieses Problem ist (noch) nicht bekannt.\n\n` +
            `Bitte wähle einen der vorhandenen Punkte aus oder nutze „Problem unklar / nicht eindeutig“.\n${
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
            this.adapter.log.debug(`[aiChemistryHelpHelper] _setStateIfChanged Fehler (${id}): ${e.message}`);
        }
    },
};

module.exports = aiChemistryHelpHelper;

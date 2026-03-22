'use strict';

/**
 * Legt alle States für Sprachausgaben an:
 * - speech.active
 * - speech.last_text
 * - speech.queue
 * - speech.start_text, speech.end_text
 * - speech.texts.[sensor] (Temperaturtexte)
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createSpeechStates(adapter) {
    // Root-Kanal
    await adapter.setObjectNotExistsAsync('speech', {
        type: 'channel',
        common: {
            name: {
                en: 'Speech outputs',
                de: 'Sprachausgaben',
            },
        },
        native: {},
    });

    // Sprachausgaben global aktiv (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('speech.active', {
        type: 'state',
        common: {
            name: {
                en: 'Enable speech outputs',
                de: 'Sprachausgaben aktivieren',
            },
            desc: {
                en: 'Enables or disables all speech outputs globally',
                de: 'Aktiviert oder deaktiviert alle Sprachausgaben global',
            },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });

    // Prüfen, ob bereits ein persistierter Wert existiert
    const existingSpeechActive = await adapter.getStateAsync('speech.active');
    if (existingSpeechActive === null || existingSpeechActive.val === null || existingSpeechActive.val === undefined) {
        await adapter.setStateAsync('speech.active', {
            val: adapter.config.speech_active ?? false,
            ack: true,
        });
    }

    // Letzter gesprochener Text
    await adapter.setObjectNotExistsAsync('speech.last_text', {
        type: 'state',
        common: {
            name: {
                en: 'Last spoken text',
                de: 'Zuletzt gesprochener Text',
            },
            desc: {
                en: 'Stores the last spoken output text',
                de: 'Speichert den zuletzt gesprochenen Ausgabetext',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('speech.last_text', { val: '', ack: true });

    // Interner Nachrichtenpuffer für Sprach-Trigger
    await adapter.setObjectNotExistsAsync('speech.queue', {
        type: 'state',
        common: {
            name: {
                en: 'Internal speech message queue',
                de: 'Interne Sprachnachrichten-Warteschlange',
            },
            desc: {
                en: 'Used as a handoff point for text messages from other modules (not writable by the user).',
                de: 'Wird als Uebergabepunkt fuer Textnachrichten aus anderen Modulen verwendet (nicht durch den Benutzer beschreibbar).',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false, // kein externes Schreiben erlaubt
        },
        native: {},
    });
    await adapter.setStateAsync('speech.queue', { val: '', ack: true });

    // Start-/Endtexte
    await adapter.setObjectNotExistsAsync('speech.start_text', {
        type: 'state',
        common: {
            name: {
                en: 'Start text',
                de: 'Starttext',
            },
            desc: {
                en: 'Speech text used when the pool pump starts',
                de: 'Sprachausgabetext, der beim Start der Poolpumpe verwendet wird',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('speech.start_text', {
        val: 'Die Poolpumpe wurde gestartet.',
        ack: true,
    });

    await adapter.setObjectNotExistsAsync('speech.end_text', {
        type: 'state',
        common: {
            name: {
                en: 'End text',
                de: 'Endtext',
            },
            desc: {
                en: 'Speech text used when the pool pump stops',
                de: 'Sprachausgabetext, der beim Stoppen der Poolpumpe verwendet wird',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('speech.end_text', {
        val: 'Die Poolpumpe wurde gestoppt.',
        ack: true,
    });

    // ------------------------------------------------------------------
    // 🆕 Amazon Alexa – Ruhezeiten
    // ------------------------------------------------------------------

    await adapter.setObjectNotExistsAsync('speech.amazon_alexa', {
        type: 'channel',
        common: {
            name: {
                en: 'Amazon Alexa (speech output)',
                de: 'Amazon Alexa (Sprachausgabe)',
            },
        },
        native: {},
    });

    const alexaStates = [
        {
            id: 'quiet_time_week_enabled',
            name: {
                en: 'Quiet time (Mon-Fri) enabled',
                de: 'Ruhezeit (Mo-Fr) aktiviert',
            },
            desc: {
                en: 'Enables quiet time for weekdays from Monday to Friday',
                de: 'Aktiviert die Ruhezeit fuer Werktage von Montag bis Freitag',
            },
            type: 'boolean',
            role: 'switch',
            def: false,
        },
        {
            id: 'quiet_time_week_start',
            name: {
                en: 'Quiet time (Mon-Fri) start time (HH:MM)',
                de: 'Ruhezeit (Mo-Fr) Startzeit (HH:MM)',
            },
            desc: {
                en: 'Start time of the weekday quiet time in HH:MM format',
                de: 'Startzeit der Werktag-Ruhezeit im Format HH:MM',
            },
            type: 'string',
            role: 'level',
            def: '22:00',
        },
        {
            id: 'quiet_time_week_end',
            name: {
                en: 'Quiet time (Mon-Fri) end time (HH:MM)',
                de: 'Ruhezeit (Mo-Fr) Endzeit (HH:MM)',
            },
            desc: {
                en: 'End time of the weekday quiet time in HH:MM format',
                de: 'Endzeit der Werktag-Ruhezeit im Format HH:MM',
            },
            type: 'string',
            role: 'level',
            def: '07:00',
        },
        {
            id: 'quiet_time_weekend_enabled',
            name: {
                en: 'Quiet time (Sat-Sun) enabled',
                de: 'Ruhezeit (Sa-So) aktiviert',
            },
            desc: {
                en: 'Enables quiet time for weekends from Saturday to Sunday',
                de: 'Aktiviert die Ruhezeit fuer Wochenenden von Samstag bis Sonntag',
            },
            type: 'boolean',
            role: 'switch',
            def: false,
        },
        {
            id: 'quiet_time_weekend_start',
            name: {
                en: 'Quiet time (Sat-Sun) start time (HH:MM)',
                de: 'Ruhezeit (Sa-So) Startzeit (HH:MM)',
            },
            desc: {
                en: 'Start time of the weekend quiet time in HH:MM format',
                de: 'Startzeit der Wochenend-Ruhezeit im Format HH:MM',
            },
            type: 'string',
            role: 'level',
            def: '22:00',
        },
        {
            id: 'quiet_time_weekend_end',
            name: {
                en: 'Quiet time (Sat-Sun) end time (HH:MM)',
                de: 'Ruhezeit (Sa-So) Endzeit (HH:MM)',
            },
            desc: {
                en: 'End time of the weekend quiet time in HH:MM format',
                de: 'Endzeit der Wochenend-Ruhezeit im Format HH:MM',
            },
            type: 'string',
            role: 'level',
            def: '08:00',
        },
        {
            id: 'quiet_time_active_now',
            name: {
                en: 'Alexa muted now (quiet time active)',
                de: 'Alexa aktuell stumm (Ruhezeit aktiv)',
            },
            desc: {
                en: 'Shows whether Alexa output is currently muted because quiet time is active',
                de: 'Zeigt an, ob die Alexa-Ausgabe aktuell stumm ist, weil die Ruhezeit aktiv ist',
            },
            type: 'boolean',
            role: 'indicator',
            def: false,
            write: false,
        },
    ];

    for (const s of alexaStates) {
        const fullId = `speech.amazon_alexa.${s.id}`;
        await adapter.setObjectNotExistsAsync(fullId, {
            type: 'state',
            common: {
                name: s.name,
                desc: s.desc,
                type: s.type,
                role: s.role,
                read: true,
                write: Boolean(s.write !== false), // Standard: true
                def: s.def,
                persist: true,
            },
            native: {},
        });

        const current = await adapter.getStateAsync(fullId);
        if (!current || current.val === null || current.val === undefined) {
            await adapter.setStateAsync(fullId, { val: s.def, ack: true });
        }
    }

    adapter.log.debug('[speechStates] Amazon Alexa quiet-time states checked and created.');

    // versteckte Dateien

    await adapter.setObjectNotExistsAsync('speech.solar_active', {
        type: 'state',
        common: {
            name: {
                en: 'Solar control active',
                de: 'Solarsteuerung aktiv',
            },
            desc: {
                en: 'Indicator for active solar control speech context',
                de: 'Indikator fuer aktiven Solarsteuerungs-Sprachkontext',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            hidden: true, // unsichtbar im Admin
            dontShow: true,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('speech.time_active', {
        type: 'state',
        common: {
            name: {
                en: 'Time control active',
                de: 'Zeitsteuerung aktiv',
            },
            desc: {
                en: 'Indicator for active time control speech context',
                de: 'Indikator fuer aktiven Zeitsteuerungs-Sprachkontext',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            hidden: true, // unsichtbar im Admin
            dontShow: true,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('speech.frost_active', {
        type: 'state',
        common: {
            name: {
                en: 'Frost protection active',
                de: 'Frostschutz aktiv',
            },
            desc: {
                en: 'Indicator for active frost protection speech context',
                de: 'Indikator fuer aktiven Frostschutz-Sprachkontext',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            hidden: true, // unsichtbar im Admin
            dontShow: true,
        },
        native: {},
    });

    // --- Sicherstellen, dass bestehende Installationen nachträglich korrigiert werden ---
    const hiddenStates = ['speech.solar_active', 'speech.time_active', 'speech.frost_active'];
    for (const id of hiddenStates) {
        try {
            await adapter.extendObjectAsync(id, {
                common: {
                    hidden: true,
                    dontShow: true,
                    write: false,
                },
            });
        } catch (err) {
            adapter.log.warn(`[speechStates] Could not set hidden flags for ${id}: ${err.message}`);
        }
    }
    adapter.log.debug('[speechStates] Hidden flags for Solar/Time/Frost checked and updated');
}

module.exports = {
    createSpeechStates,
};

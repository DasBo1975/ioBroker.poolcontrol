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
        common: { name: { de: 'Sprachausgaben', en: 'Speech outputs' } },
        native: {},
    });

    // Sprachausgaben global aktiv (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('speech.active', {
        type: 'state',
        common: {
            name: { de: 'Sprachausgaben aktiv', en: 'Enable speech outputs' },
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
            name: { de: 'Zuletzt gesprochener Text', en: 'Last spoken text' },
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
            name: { de: 'Interne Sprach-Nachrichtenwarteschlange', en: 'Internal speech message queue' },
            desc: {
                de: 'Dient als Übergabepunkt für Textmeldungen aus anderen Modulen (nicht vom Benutzer beschreibbar)',
                en: 'Used as a handoff point for text messages from other modules (not writable by the user).',
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
            name: { de: 'Starttext', en: 'Start text' },
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
            name: { de: 'Endtext', en: 'End text' },
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
        common: { name: { de: 'Amazon Alexa (Sprachausgabe)', en: 'Amazon Alexa (speech output)' } },
        native: {},
    });

    const alexaStates = [
        {
            id: 'quiet_time_week_enabled',
            name: { de: 'Ruhezeit (Mo–Fr) aktiv', en: 'Quiet time (Mon–Fri) enabled' },
            type: 'boolean',
            role: 'switch',
            def: false,
        },
        {
            id: 'quiet_time_week_start',
            name: { de: 'Ruhezeit (Mo–Fr) Startzeit (HH:MM)', en: 'Quiet time (Mon–Fri) start time (HH:MM)' },
            type: 'string',
            role: 'level',
            def: '22:00',
        },
        {
            id: 'quiet_time_week_end',
            name: { de: 'Ruhezeit (Mo–Fr) Endzeit (HH:MM)', en: 'Quiet time (Mon–Fri) end time (HH:MM)' },
            type: 'string',
            role: 'level',
            def: '07:00',
        },
        {
            id: 'quiet_time_weekend_enabled',
            name: { de: 'Ruhezeit (Sa–So) aktiv', en: 'Quiet time (Sat–Sun) enabled' },
            type: 'boolean',
            role: 'switch',
            def: false,
        },
        {
            id: 'quiet_time_weekend_start',
            name: { de: 'Ruhezeit (Sa–So) Startzeit (HH:MM)', en: 'Quiet time (Sat–Sun) start time (HH:MM)' },
            type: 'string',
            role: 'level',
            def: '22:00',
        },
        {
            id: 'quiet_time_weekend_end',
            name: { de: 'Ruhezeit (Sa–So) Endzeit (HH:MM)', en: 'Quiet time (Sat–Sun) end time (HH:MM)' },
            type: 'string',
            role: 'level',
            def: '08:00',
        },
        {
            id: 'quiet_time_active_now',
            name: { de: 'Alexa derzeit stumm (Ruhezeit aktiv)', en: 'Alexa muted now (quiet time active)' },
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
            name: { de: 'Solarsteuerung aktiv', en: 'Solar control active' },
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
            name: { de: 'Zeitsteuerung aktiv', en: 'Time control active' },
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
            name: { de: 'Frostschutz aktiv', en: 'Frost protection active' },
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

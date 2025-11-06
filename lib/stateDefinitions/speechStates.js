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
        common: { name: 'Sprachausgaben' },
        native: {},
    });

    // Sprachausgaben global aktiv (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('speech.active', {
        type: 'state',
        common: {
            name: 'Sprachausgaben aktiv',
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
            name: 'Zuletzt gesprochener Text',
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
            name: 'Interne Sprach-Nachrichtenwarteschlange',
            desc: 'Dient als Übergabepunkt für Textmeldungen aus anderen Modulen (nicht vom Benutzer beschreibbar)',
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
            name: 'Starttext',
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
            name: 'Endtext',
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
        common: { name: 'Amazon Alexa (Sprachausgabe)' },
        native: {},
    });

    const alexaStates = [
        {
            id: 'quiet_time_week_enabled',
            name: 'Ruhezeit (Mo–Fr) aktiv',
            type: 'boolean',
            role: 'switch',
            def: false,
        },
        {
            id: 'quiet_time_week_start',
            name: 'Ruhezeit (Mo–Fr) Startzeit (HH:MM)',
            type: 'string',
            role: 'value.time',
            def: '22:00',
        },
        {
            id: 'quiet_time_week_end',
            name: 'Ruhezeit (Mo–Fr) Endzeit (HH:MM)',
            type: 'string',
            role: 'value.time',
            def: '07:00',
        },
        {
            id: 'quiet_time_weekend_enabled',
            name: 'Ruhezeit (Sa–So) aktiv',
            type: 'boolean',
            role: 'switch',
            def: false,
        },
        {
            id: 'quiet_time_weekend_start',
            name: 'Ruhezeit (Sa–So) Startzeit (HH:MM)',
            type: 'string',
            role: 'value.time',
            def: '22:00',
        },
        {
            id: 'quiet_time_weekend_end',
            name: 'Ruhezeit (Sa–So) Endzeit (HH:MM)',
            type: 'string',
            role: 'value.time',
            def: '08:00',
        },
        {
            id: 'quiet_time_active_now',
            name: 'Alexa derzeit stumm (Ruhezeit aktiv)',
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

    adapter.log.debug('[speechStates] Amazon Alexa – Ruhezeit-States geprüft und angelegt.');

    // versteckte Dateien

    await adapter.setObjectNotExistsAsync('speech.solar_active', {
        type: 'state',
        common: {
            name: 'Solarsteuerung aktiv',
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
            name: 'Zeitsteuerung aktiv',
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
            name: 'Frostschutz aktiv',
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
            adapter.log.warn(`[speechStates] Konnte hidden-Flag für ${id} nicht setzen: ${err.message}`);
        }
    }
    adapter.log.debug('[speechStates] Hidden-Flags für Solar/Time/Frost geprüft und aktualisiert');
}

module.exports = {
    createSpeechStates,
};

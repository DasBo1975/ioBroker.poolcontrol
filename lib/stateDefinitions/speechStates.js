'use strict';

/**
 * Legt alle States für Sprachausgaben an:
 * - speech.active
 * - speech.last_text
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

    // Sprachausgaben global aktiv
    await adapter.setObjectNotExistsAsync('speech.active', {
        type: 'state',
        common: {
            name: 'Sprachausgaben aktiv',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('speech.active', {
        val: adapter.config.speech_active ?? false,
        ack: true,
    });

    // Letzter gesprochener Text
    await adapter.setObjectNotExistsAsync('speech.last_text', {
        type: 'state',
        common: {
            name: 'Zuletzt gesprochener Text',
            type: 'string',
            role: 'text',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('speech.last_text', { val: '', ack: true });

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
}

module.exports = {
    createSpeechStates,
};

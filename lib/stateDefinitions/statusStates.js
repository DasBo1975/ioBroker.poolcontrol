'use strict';

/**
 * Legt alle States für Status-Übersichten an:
 * - status.summary (string, Textzusammenfassung)
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createStatusStates(adapter) {
    // Root-Kanal "status"
    await adapter.setObjectNotExistsAsync('status', {
        type: 'channel',
        common: { name: 'Statusübersicht' },
        native: {},
    });

    // Zusammenfassung als Text
    await adapter.setObjectNotExistsAsync('status.summary', {
        type: 'state',
        common: {
            name: 'Zusammenfassung als Text',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            // bewusst kein persist: true, da nur Live-Daten
        },
        native: {},
    });

    // Initial leer setzen
    await adapter.setStateAsync('status.summary', { val: '', ack: true });
}

module.exports = {
    createStatusStates,
};

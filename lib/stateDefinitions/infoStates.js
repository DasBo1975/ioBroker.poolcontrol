'use strict';

/**
 * infoStates.js
 * ----------------------------------------------------------
 * Legt allgemeine Informations-States an:
 *  - info.developer_greeting
 *  - info.adapter_version
 *
 * Struktur:
 *   info.*
 * ----------------------------------------------------------
 */

/**
 * Erstellt alle States im Bereich info.
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapterinstanz
 */
async function createInfoStates(adapter) {
    // Hauptordner: info
    await adapter.setObjectNotExistsAsync('info', {
        type: 'channel',
        common: {
            name: 'Informationen (PoolControl Systeminfos)',
        },
        native: {},
    });

    // Entwickler-Grußtext
    await adapter.setObjectNotExistsAsync('info.developer_greeting', {
        type: 'state',
        common: {
            name: 'Entwickler-Grußtext',
            desc: 'Saisonale Grüße und Informationen vom PoolControl-Entwickler',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        native: {},
    });

    // Adapterversion
    await adapter.setObjectNotExistsAsync('info.adapter_version', {
        type: 'state',
        common: {
            name: 'Installierte Adapterversion',
            desc: 'Aktuell installierte Version von PoolControl',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        native: {},
    });
}

module.exports = {
    createInfoStates,
};

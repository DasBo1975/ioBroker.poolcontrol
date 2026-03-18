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
            name: 'Information (PoolControl system info)',
        },
        native: {},
    });

    // Entwickler-Grußtext
    await adapter.setObjectNotExistsAsync('info.developer_greeting', {
        type: 'state',
        common: {
            name: 'Developer greeting',
            desc: 'Seasonal greetings and information from the PoolControl developer',
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
            name: 'Installed adapter version',
            desc: 'Currently installed version of PoolControl',
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

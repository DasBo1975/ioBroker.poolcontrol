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
            name: { de: 'Informationen (PoolControl Systeminfos)', en: 'Information (PoolControl system info)' },
        },
        native: {},
    });

    // Entwickler-Grußtext
    await adapter.setObjectNotExistsAsync('info.developer_greeting', {
        type: 'state',
        common: {
            name: { de: 'Entwickler-Grußtext', en: 'Developer greeting' },
            desc: {
                de: 'Saisonale Grüße und Informationen vom PoolControl-Entwickler',
                en: 'Seasonal greetings and information from the PoolControl developer',
            },
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
            name: { de: 'Installierte Adapterversion', en: 'Installed adapter version' },
            desc: {
                de: 'Aktuell installierte Version von PoolControl',
                en: 'Currently installed version of PoolControl',
            },
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

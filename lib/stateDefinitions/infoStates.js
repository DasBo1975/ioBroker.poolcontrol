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
            name: {
                en: 'Information (PoolControl system info)',
                de: 'Informationen (PoolControl-Systeminfos)',
            },
        },
        native: {},
    });

    // Entwickler-Grußtext
    await adapter.setObjectNotExistsAsync('info.developer_greeting', {
        type: 'state',
        common: {
            name: {
                en: 'Developer greeting',
                de: 'Entwicklergruss',
            },
            desc: {
                en: 'Seasonal greetings and information from the PoolControl developer',
                de: 'Saisonale Gruesse und Informationen vom PoolControl-Entwickler',
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
            name: {
                en: 'Installed adapter version',
                de: 'Installierte Adapterversion',
            },
            desc: {
                en: 'Currently installed version of PoolControl',
                de: 'Aktuell installierte Version von PoolControl',
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

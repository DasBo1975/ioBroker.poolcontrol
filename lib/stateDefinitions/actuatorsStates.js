'use strict';

/**
 * actuatorsStates.js
 * ----------------------------------------------------------
 * Legt optionale Zusatz-Aktoren an:
 *  - Beleuchtung 1–3
 *  - Zusatzpumpen / Attraktionen 1–3
 *
 * Struktur:
 *   actuators.*
 *
 * WICHTIG:
 * Die tatsächliche Anlage der States erfolgt nur,
 * wenn die jeweilige Checkbox in der Instanz aktiv ist.
 * ----------------------------------------------------------
 */

/**
 * Erstellt alle States im Bereich Zusatz-Aktoren.
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapterinstanz
 */
async function createActuatorsStates(adapter) {
    // ======================================================
    // Hauptordner
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators', {
        type: 'channel',
        common: {
            name: { de: 'Zusatz-Aktoren', en: 'Additional actuators' },
        },
        native: {},
    });

    // ======================================================
    // Beleuchtung
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators.lighting', {
        type: 'channel',
        common: {
            name: { de: 'Beleuchtung', en: 'Lighting' },
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.lighting.light${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: { de: `Beleuchtung ${i}`, en: `Lighting ${i}` },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.switch`, {
            type: 'state',
            common: {
                name: { de: 'Schalten (Ein/Aus)', en: 'Switch (On/Off)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        // NEU: Aktiv-Status aus Instanz-Config
        await adapter.setObjectNotExistsAsync(`${base}.active`, {
            type: 'state',
            common: {
                name: { de: 'Aktiv', en: 'Active' },
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Frei vergebener Name aus Instanz-Config
        await adapter.setObjectNotExistsAsync(`${base}.name`, {
            type: 'state',
            common: {
                name: { de: 'Name', en: 'Name' },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Dauerbetrieb
        await adapter.setObjectNotExistsAsync(`${base}.permanent`, {
            type: 'state',
            common: {
                name: { de: 'Dauerbetrieb', en: 'Continuous operation' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Laufzeitvorgabe in Minuten
        await adapter.setObjectNotExistsAsync(`${base}.runtime_minutes`, {
            type: 'state',
            common: {
                name: { de: 'Laufzeit (Minuten)', en: 'Runtime (minutes)' },
                type: 'number',
                role: 'value',
                read: true,
                write: true,
                def: 0,
                unit: 'min',
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Restlaufzeit (Anzeige)
        await adapter.setObjectNotExistsAsync(`${base}.remaining_minutes`, {
            type: 'state',
            common: {
                name: { de: 'Restlaufzeit', en: 'Remaining runtime' },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
                unit: 'min',
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.status`, {
            type: 'state',
            common: {
                name: { de: 'Status', en: 'Status' },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });
    }

    // ======================================================
    // Zusatzpumpen / Attraktionen
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators.extrapumps', {
        type: 'channel',
        common: {
            name: { de: 'Zusatzpumpen & Attraktionen', en: 'Auxiliary pumps & attractions' },
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.extrapumps.pump${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: { de: `Zusatzpumpe / Attraktion ${i}`, en: `Auxiliary pump / attraction ${i}` },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.switch`, {
            type: 'state',
            common: {
                name: { de: 'Schalten (Ein/Aus)', en: 'Switch (On/Off)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        // NEU: Aktiv-Status aus Instanz-Config
        await adapter.setObjectNotExistsAsync(`${base}.active`, {
            type: 'state',
            common: {
                name: { de: 'Aktiv', en: 'Active' },
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Frei vergebener Name aus Instanz-Config
        await adapter.setObjectNotExistsAsync(`${base}.name`, {
            type: 'state',
            common: {
                name: { de: 'Name', en: 'Name' },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Dauerbetrieb
        await adapter.setObjectNotExistsAsync(`${base}.permanent`, {
            type: 'state',
            common: {
                name: { de: 'Dauerbetrieb', en: 'Continuous operation' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Laufzeitvorgabe in Minuten
        await adapter.setObjectNotExistsAsync(`${base}.runtime_minutes`, {
            type: 'state',
            common: {
                name: { de: 'Laufzeit (Minuten)', en: 'Runtime (minutes)' },
                type: 'number',
                role: 'value',
                read: true,
                write: true,
                def: 0,
                unit: 'min',
                persist: true, // ✅ HIER
            },
            native: {},
        });

        // NEU: Restlaufzeit (Anzeige)
        await adapter.setObjectNotExistsAsync(`${base}.remaining_minutes`, {
            type: 'state',
            common: {
                name: { de: 'Restlaufzeit', en: 'Remaining runtime' },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                def: 0,
                unit: 'min',
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.status`, {
            type: 'state',
            common: {
                name: { de: 'Status', en: 'Status' },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });
    }
}

module.exports = {
    createActuatorsStates,
};

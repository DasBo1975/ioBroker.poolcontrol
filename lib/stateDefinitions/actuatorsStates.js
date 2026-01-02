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
            name: 'Zusatz-Aktoren',
        },
        native: {},
    });

    // ======================================================
    // Beleuchtung
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators.lighting', {
        type: 'channel',
        common: {
            name: 'Beleuchtung',
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.lighting.light${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: `Beleuchtung ${i}`,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.switch`, {
            type: 'state',
            common: {
                name: 'Schalten (Ein/Aus)',
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
                name: 'Aktiv',
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
                name: 'Name',
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
                name: 'Dauerbetrieb',
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
                name: 'Laufzeit (Minuten)',
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
                name: 'Restlaufzeit',
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
                name: 'Status',
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
            name: 'Zusatzpumpen & Attraktionen',
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.extrapumps.pump${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: `Zusatzpumpe / Attraktion ${i}`,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.switch`, {
            type: 'state',
            common: {
                name: 'Schalten (Ein/Aus)',
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
                name: 'Aktiv',
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
                name: 'Name',
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
                name: 'Dauerbetrieb',
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
                name: 'Laufzeit (Minuten)',
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
                name: 'Restlaufzeit',
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
                name: 'Status',
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

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
            name: {
                en: 'Additional actuators',
                de: 'Zusatz-Aktoren',
            },
        },
        native: {},
    });

    // ======================================================
    // Beleuchtung
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators.lighting', {
        type: 'channel',
        common: {
            name: {
                en: 'Lighting',
                de: 'Beleuchtung',
            },
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.lighting.light${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: {
                    en: `Lighting ${i}`,
                    de: `Beleuchtung ${i}`,
                },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.switch`, {
            type: 'state',
            common: {
                name: {
                    en: 'Switch (On/Off)',
                    de: 'Schalter (Ein/Aus)',
                },
                desc: {
                    en: 'Switch state for actuator on/off control',
                    de: 'Schaltzustand für die Ein-/Aus-Steuerung des Aktors',
                },
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
                name: {
                    en: 'Active',
                    de: 'Aktiv',
                },
                desc: {
                    en: 'Shows whether this actuator is enabled in the instance configuration',
                    de: 'Zeigt an, ob dieser Aktor in der Instanzkonfiguration aktiviert ist',
                },
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
                name: {
                    en: 'Name',
                    de: 'Name',
                },
                desc: {
                    en: 'Custom name from the instance configuration for this actuator',
                    de: 'Frei vergebener Name aus der Instanzkonfiguration für diesen Aktor',
                },
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
                name: {
                    en: 'Continuous operation',
                    de: 'Dauerbetrieb',
                },
                desc: {
                    en: 'Enables continuous operation for this actuator',
                    de: 'Aktiviert den Dauerbetrieb für diesen Aktor',
                },
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
                name: {
                    en: 'Runtime (minutes)',
                    de: 'Laufzeit (Minuten)',
                },
                desc: {
                    en: 'Configured runtime in minutes for this actuator',
                    de: 'Eingestellte Laufzeit in Minuten für diesen Aktor',
                },
                type: 'number',
                role: 'level',
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
                name: {
                    en: 'Remaining runtime',
                    de: 'Verbleibende Laufzeit',
                },
                desc: {
                    en: 'Remaining runtime in minutes for this actuator',
                    de: 'Verbleibende Laufzeit dieses Aktors in Minuten',
                },
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
                name: {
                    en: 'Status',
                    de: 'Status',
                },
                desc: {
                    en: 'Current status text of this actuator',
                    de: 'Aktueller Statustext dieses Aktors',
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

    // ======================================================
    // Zusatzpumpen / Attraktionen
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators.extrapumps', {
        type: 'channel',
        common: {
            name: {
                en: 'Auxiliary pumps & attractions',
                de: 'Zusatzpumpen & Attraktionen',
            },
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.extrapumps.pump${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: {
                    en: `Auxiliary pump / attraction ${i}`,
                    de: `Zusatzpumpe / Attraktion ${i}`,
                },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.switch`, {
            type: 'state',
            common: {
                name: {
                    en: 'Switch (On/Off)',
                    de: 'Schalter (Ein/Aus)',
                },
                desc: {
                    en: 'Switch state for actuator on/off control',
                    de: 'Schaltzustand für die Ein-/Aus-Steuerung des Aktors',
                },
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
                name: {
                    en: 'Active',
                    de: 'Aktiv',
                },
                desc: {
                    en: 'Shows whether this actuator is enabled in the instance configuration',
                    de: 'Zeigt an, ob dieser Aktor in der Instanzkonfiguration aktiviert ist',
                },
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
                name: {
                    en: 'Name',
                    de: 'Name',
                },
                desc: {
                    en: 'Custom name from the instance configuration for this actuator',
                    de: 'Frei vergebener Name aus der Instanzkonfiguration für diesen Aktor',
                },
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
                name: {
                    en: 'Continuous operation',
                    de: 'Dauerbetrieb',
                },
                desc: {
                    en: 'Enables continuous operation for this actuator',
                    de: 'Aktiviert den Dauerbetrieb für diesen Aktor',
                },
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
                name: {
                    en: 'Runtime (minutes)',
                    de: 'Laufzeit (Minuten)',
                },
                desc: {
                    en: 'Configured runtime in minutes for this actuator',
                    de: 'Eingestellte Laufzeit in Minuten für diesen Aktor',
                },
                type: 'number',
                role: 'level',
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
                name: {
                    en: 'Remaining runtime',
                    de: 'Verbleibende Laufzeit',
                },
                desc: {
                    en: 'Remaining runtime in minutes for this actuator',
                    de: 'Verbleibende Laufzeit dieses Aktors in Minuten',
                },
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
                name: {
                    en: 'Status',
                    de: 'Status',
                },
                desc: {
                    en: 'Current status text of this actuator',
                    de: 'Aktueller Statustext dieses Aktors',
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
}

module.exports = {
    createActuatorsStates,
};

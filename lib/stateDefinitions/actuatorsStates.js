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

    // ======================================================
    // Follow-Pump Geräte
    // ======================================================
    await adapter.setObjectNotExistsAsync('actuators.follow_pump_devices', {
        type: 'channel',
        common: {
            name: {
                en: 'Follow-pump devices',
                de: 'Geräte mit Pumpenlauf',
            },
        },
        native: {},
    });

    for (let i = 1; i <= 3; i++) {
        const base = `actuators.follow_pump_devices.device${i}`;

        await adapter.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: {
                name: {
                    en: `Follow-pump device ${i}`,
                    de: `Gerät mit Pumpenlauf ${i}`,
                },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.enabled`, {
            type: 'state',
            common: {
                name: {
                    en: 'Enabled',
                    de: 'Aktiviert',
                },
                desc: {
                    en: 'Enables this follow-pump device. If enabled, the configured target state is switched on when the main pump is running and switched off when the main pump stops.',
                    de: 'Aktiviert dieses Gerät mit Pumpenlauf. Wenn aktiviert, wird der eingetragene Ziel-Datenpunkt eingeschaltet, sobald die Hauptpumpe läuft, und ausgeschaltet, sobald die Hauptpumpe stoppt.',
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.name`, {
            type: 'state',
            common: {
                name: {
                    en: 'Name',
                    de: 'Name',
                },
                desc: {
                    en: 'Custom display name for this follow-pump device, for example UV lamp, water feature or auxiliary filter.',
                    de: 'Frei vergebener Anzeigename für dieses Gerät mit Pumpenlauf, zum Beispiel UV-Lampe, Wasserspiel oder Zusatzfilter.',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
                persist: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.target_state_id`, {
            type: 'state',
            common: {
                name: {
                    en: 'Target state ID',
                    de: 'Ziel-Datenpunkt',
                },
                desc: {
                    en: 'ioBroker state ID of the device that should follow the main pump. The target state must exist, must be writable and must be of type boolean.',
                    de: 'ioBroker-Datenpunkt des Geräts, das dem Lauf der Hauptpumpe folgen soll. Der Ziel-Datenpunkt muss existieren, beschreibbar sein und den Typ boolean haben.',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '',
                persist: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.target_valid`, {
            type: 'state',
            common: {
                name: {
                    en: 'Target valid',
                    de: 'Ziel gültig',
                },
                desc: {
                    en: 'Shows whether the configured target state exists and is of type boolean.',
                    de: 'Zeigt an, ob der eingetragene Ziel-Datenpunkt existiert und vom Typ boolean ist.',
                },
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.target_writeable`, {
            type: 'state',
            common: {
                name: {
                    en: 'Target writable',
                    de: 'Ziel beschreibbar',
                },
                desc: {
                    en: 'Shows whether the configured target state can be written by PoolControl.',
                    de: 'Zeigt an, ob der eingetragene Ziel-Datenpunkt von PoolControl beschrieben werden kann.',
                },
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.validation_text`, {
            type: 'state',
            common: {
                name: {
                    en: 'Validation text',
                    de: 'Prüfmeldung',
                },
                desc: {
                    en: 'Readable validation result for the configured target state, for example OK, target empty, state not found, state is not boolean or state is not writable.',
                    de: 'Lesbare Prüfausgabe für den eingetragenen Ziel-Datenpunkt, zum Beispiel OK, Ziel leer, Datenpunkt nicht gefunden, Datenpunkt ist nicht boolean oder Datenpunkt ist nicht beschreibbar.',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`${base}.active`, {
            type: 'state',
            common: {
                name: {
                    en: 'Active with pump',
                    de: 'Mit Pumpe aktiv',
                },
                desc: {
                    en: 'Shows whether this follow-pump device is currently switched on by PoolControl because the main pump is running.',
                    de: 'Zeigt an, ob dieses Gerät aktuell von PoolControl eingeschaltet wurde, weil die Hauptpumpe läuft.',
                },
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
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
                    en: 'Current status of this follow-pump device, for example disabled, waiting_for_pump, running_with_pump or invalid_target.',
                    de: 'Aktueller Status dieses Geräts mit Pumpenlauf, zum Beispiel deaktiviert, wartet auf Pumpenlauf, läuft mit Pumpe oder ungültiger Ziel-Datenpunkt.',
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

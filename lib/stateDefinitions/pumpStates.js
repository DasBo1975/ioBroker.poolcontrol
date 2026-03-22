'use strict';

/**
 * Legt alle States für die Pumpenverwaltung an:
 * - pump.pump_max_watt, pump.pump_power_lph
 * - pump.frost_protection_active, pump.frost_protection_temp
 * - pump.pump_switch (JETZT: boolean Schalter)
 * - pump.mode (auto/manual/off/time)
 * - pump.manual_safety_enabled
 * - pump.status, pump.error
 * - pump.current_power
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createPumpStates(adapter) {
    // Channel: Pumpe
    await adapter.setObjectNotExistsAsync('pump', {
        type: 'channel',
        common: {
            name: {
                en: 'Pump',
                de: 'Pumpe',
            },
        },
        native: {},
    });

    // Max. Pumpenleistung (W)
    await adapter.setObjectNotExistsAsync('pump.pump_max_watt', {
        type: 'state',
        common: {
            name: {
                en: 'Max. pump power',
                de: 'Max. Pumpenleistung',
            },
            desc: {
                en: 'Configured maximum pump power in watts',
                de: 'Konfigurierte maximale Pumpenleistung in Watt',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.pump_max_watt', {
        val: adapter.config.pump_max_watt,
        ack: true,
    });

    // Pumpenleistung (l/h)
    await adapter.setObjectNotExistsAsync('pump.pump_power_lph', {
        type: 'state',
        common: {
            name: {
                en: 'Pump capacity (l/h)',
                de: 'Pumpenleistung (l/h)',
            },
            desc: {
                en: 'Configured pump capacity in liters per hour',
                de: 'Konfigurierte Pumpenleistung in Litern pro Stunde',
            },
            type: 'number',
            role: 'value.flow',
            unit: 'l/h',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.pump_power_lph', {
        val: adapter.config.pump_power_lph,
        ack: true,
    });

    // Frostschutz aktiv
    await adapter.setObjectNotExistsAsync('pump.frost_protection_active', {
        type: 'state',
        common: {
            name: {
                en: 'Frost protection active',
                de: 'Frostschutz aktiv',
            },
            desc: {
                en: 'Enables or disables frost protection for the pump',
                de: 'Aktiviert oder deaktiviert den Frostschutz fuer die Pumpe',
            },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.frost_protection_active', {
        val: adapter.config.frost_protection_active,
        ack: true,
    });

    // Frostschutz-Temperatur
    await adapter.setObjectNotExistsAsync('pump.frost_protection_temp', {
        type: 'state',
        common: {
            name: {
                en: 'Frost protection temperature',
                de: 'Frostschutztemperatur',
            },
            desc: {
                en: 'Temperature threshold for activating frost protection',
                de: 'Temperaturschwelle fuer die Aktivierung des Frostschutzes',
            },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.frost_protection_temp', {
        val: adapter.config.frost_protection_temp,
        ack: true,
    });

    // **Zentraler Pumpen-Schalter (boolean)**
    await adapter.setObjectNotExistsAsync('pump.pump_switch', {
        type: 'state',
        common: {
            name: {
                en: 'Pump ON/OFF',
                de: 'Pumpe EIN/AUS',
            },
            desc: {
                en: 'Central on/off switch for the pump',
                de: 'Zentraler Ein-/Aus-Schalter fuer die Pumpe',
            },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.pump_switch', { val: false, ack: true });

    // Pumpenmodus (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('pump.mode', {
        type: 'state',
        common: {
            name: {
                en: 'Pump mode',
                de: 'Pumpenmodus',
            },
            desc: {
                en: 'Current operating mode of the pump',
                de: 'Aktueller Betriebsmodus der Pumpe',
            },
            type: 'string',
            role: 'state',
            read: true,
            write: true,
            persist: true, // NEU: dauerhaft speichern
            states: {
                auto: 'Automatik',
                auto_pv: 'Automatik (PV)',
                manual: 'Manuell',
                off: 'Aus',
                time: 'Zeit',
            },
        },
        native: {},
    });

    // Prüfen, ob bereits ein Wert vorhanden ist
    const existingPumpMode = await adapter.getStateAsync('pump.mode');
    if (existingPumpMode === null || existingPumpMode.val === null || existingPumpMode.val === undefined) {
        await adapter.setStateAsync('pump.mode', { val: 'auto', ack: true });
    }

    // Sicherheitslogik im manuellen Modus (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('pump.manual_safety_enabled', {
        type: 'state',
        common: {
            name: {
                en: "Safety functions enabled in 'Manual' mode",
                de: "Sicherheitsfunktionen im Modus 'Manuell' aktiviert",
            },
            desc: {
                en: 'Defines whether safety functions remain active in manual mode',
                de: 'Legt fest, ob Sicherheitsfunktionen im manuellen Modus aktiv bleiben',
            },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // NEU: dauerhaft speichern
        },
        native: {},
    });

    // Prüfen, ob bereits ein persistierter Wert vorhanden ist
    const existingSafety = await adapter.getStateAsync('pump.manual_safety_enabled');
    if (existingSafety === null || existingSafety.val === null || existingSafety.val === undefined) {
        await adapter.setStateAsync('pump.manual_safety_enabled', {
            val: adapter.config.manual_safety_enabled ?? true,
            ack: true,
        });
    }

    // Pumpenstatus (Text)
    await adapter.setObjectNotExistsAsync('pump.status', {
        type: 'state',
        common: {
            name: {
                en: 'Pump status',
                de: 'Pumpenstatus',
            },
            desc: {
                en: 'Current status text of the pump',
                de: 'Aktueller Statustext der Pumpe',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.status', { val: 'AUS', ack: true });

    // Aktiver Helfer (Vorrangsteuerung)
    await adapter.setObjectNotExistsAsync('pump.active_helper', {
        type: 'state',
        common: {
            name: {
                en: 'Active helper (priority control)',
                de: 'Aktiver Helper (Prioritaetssteuerung)',
            },
            desc: {
                en: 'Shows which helper currently has priority control of the pump (e.g. Control, Solar, Frost, Time, Heating ...)',
                de: 'Zeigt an, welcher Helper aktuell die Prioritaetssteuerung der Pumpe hat (z. B. Control, Solar, Frost, Time, Heating ...)',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false, // Nur intern schreibbar
            hidden: false, // Sichtbar, damit Nutzer den aktiven Helper sehen kann
        },
        native: {},
    });
    await adapter.setStateAsync('pump.active_helper', {
        val: '',
        ack: true,
    });

    // Pumpenfehler (bool)
    await adapter.setObjectNotExistsAsync('pump.error', {
        type: 'state',
        common: {
            name: {
                en: 'Pump error',
                de: 'Pumpenfehler',
            },
            desc: {
                en: 'Indicates whether a pump error is currently present',
                de: 'Zeigt an, ob aktuell ein Pumpenfehler vorliegt',
            },
            type: 'boolean',
            role: 'indicator.error',
            read: true,
            write: true, // manuell quittierbar
        },
        native: {},
    });
    await adapter.setStateAsync('pump.error', { val: false, ack: true });

    // Aktuelle Leistung der Pumpe (W)
    await adapter.setObjectNotExistsAsync('pump.current_power', {
        type: 'state',
        common: {
            name: {
                en: 'Current pump power (W)',
                de: 'Aktuelle Pumpenleistung (W)',
            },
            desc: {
                en: 'Current measured or calculated pump power in watts',
                de: 'Aktuell gemessene oder berechnete Pumpenleistung in Watt',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.current_power', { val: 0, ack: true });

    await adapter.setObjectNotExistsAsync('pump.reason', {
        type: 'state',
        common: {
            name: {
                en: 'Reason for current pump status',
                de: 'Grund fuer aktuellen Pumpenstatus',
            },
            desc: {
                en: 'Used internally to store the reason for the current pump status (e.g. backwash, maintenance, additional pumping)',
                de: 'Wird intern verwendet, um den Grund fuer den aktuellen Pumpenstatus zu speichern (z. B. Rueckspuelung, Wartung, zusaetzliches Pumpen)',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('pump.reason', { val: '', ack: true });
}

module.exports = {
    createPumpStates,
};

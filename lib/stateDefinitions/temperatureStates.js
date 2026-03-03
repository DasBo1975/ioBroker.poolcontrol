'use strict';

/**
 * Temperature States – vollständig gemäß jsonConfig (Temperaturverwaltung)
 *
 * Für jeden Sensor (surface, ground, flow, return, collector, outside):
 *  - temperature.<sensor>_temp_active    (boolean, write: true)   -> Ja/Nein (aus UI)
 *  - temperature.<sensor>_temp_sensor    (string,  write: false)  -> Objekt-ID (aus UI)
 *  - temperature.<sensor>.current        (number, °C)
 *  - temperature.<sensor>.min_today      (number, °C)
 *  - temperature.<sensor>.max_today      (number, °C)
 *  - temperature.<sensor>.delta_per_hour (number, °C/h)
 *
 * Zusätzlich:
 *  - temperature.delta.collector_outside
 *  - temperature.delta.surface_ground
 *  - temperature.delta.flow_return
 *
 * States mit Persistenz - bleiben erhalten bei Neustart
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createTemperatureStates(adapter) {
    // Root-Kanal (robustheitshalber explizit anlegen)
    await adapter.setObjectNotExistsAsync('temperature', {
        type: 'channel',
        common: {
            name: { de: 'Temperaturverwaltung', en: 'Temperature management' },
        },
        native: {},
    });

    // Kanal für Deltas
    await adapter.setObjectNotExistsAsync('temperature.delta', {
        type: 'channel',
        common: {
            name: { de: 'Temperatur-Differenzen', en: 'Temperature deltas' },
        },
        native: {},
    });

    // Hilfsfunktion: Mirror-States (Active + Sensor-ID) + Messkanal anlegen
    async function createSensorSet(sensorKey, label) {
        // 1) Mirror-States der Instanz-Config
        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}_temp_active`, {
            type: 'state',
            common: {
                name: { de: `Sensor ${label} verwenden`, en: `Use sensor ${label}` },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true, // Ja/Nein per State toggelbar
            },
            native: {},
        });
        await adapter.setStateAsync(`temperature.${sensorKey}_temp_active`, {
            val: !!adapter.config[`${sensorKey}_temp_active`],
            ack: true,
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}_temp_sensor`, {
            type: 'state',
            common: {
                name: { de: `Objekt-ID Sensor ${label}`, en: `Object ID sensor ${label}` },
                type: 'string',
                role: 'text',
                read: true,
                write: false, // nur Spiegel der Config
            },
            native: {},
        });
        await adapter.setStateAsync(`temperature.${sensorKey}_temp_sensor`, {
            val: adapter.config[`${sensorKey}_temp_sensor`] || '',
            ack: true,
        });

        // 2) Messkanal + Werte-States
        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}`, {
            type: 'channel',
            common: {
                name: { de: `Sensor ${label}`, en: `Sensor ${label}` },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}.current`, {
            type: 'state',
            common: {
                name: { de: `Aktueller Wert Sensor ${label}`, en: `Current value sensor ${label}` },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
                read: true,
                write: false,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}.min_today`, {
            type: 'state',
            common: {
                name: { de: `Tagesminimum Sensor ${label}`, en: `Daily minimum sensor ${label}` },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
                read: true,
                write: false,
                persist: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}.max_today`, {
            type: 'state',
            common: {
                name: { de: `Tagesmaximum Sensor ${label}`, en: `Daily maximum sensor ${label}` },
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
                read: true,
                write: false,
                persist: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}.delta_per_hour`, {
            type: 'state',
            common: {
                name: { de: `Veränderung pro Stunde Sensor ${label}`, en: `Change per hour sensor ${label}` },
                type: 'number',
                role: 'value.temperature',
                unit: '°C/h',
                read: true,
                write: false,
            },
            native: {},
        });
    }

    // Reihenfolge wie in der Instanz-Config (jsonConfig)
    await createSensorSet('surface', 'Oberfläche');
    await createSensorSet('ground', 'Grund');
    await createSensorSet('flow', 'Vorlauf');
    await createSensorSet('return', 'Rücklauf');
    await createSensorSet('collector', 'Kollektor');
    await createSensorSet('outside', 'Außentemperatur');

    // Deltas zwischen Sensoren
    await adapter.setObjectNotExistsAsync('temperature.delta.collector_outside', {
        type: 'state',
        common: {
            name: { de: 'Differenz Kollektor - Luft', en: 'Delta collector - air' },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('temperature.delta.surface_ground', {
        type: 'state',
        common: {
            name: { de: 'Differenz Oberfläche - Grund', en: 'Delta surface - ground' },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: false,
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('temperature.delta.flow_return', {
        type: 'state',
        common: {
            name: { de: 'Differenz Vorlauf - Rücklauf', en: 'Delta flow - return' },
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: false,
        },
        native: {},
    });
}

module.exports = {
    createTemperatureStates,
};

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
        common: { name: 'Temperaturverwaltung' },
        native: {},
    });

    // Kanal für Deltas
    await adapter.setObjectNotExistsAsync('temperature.delta', {
        type: 'channel',
        common: { name: 'Temperatur-Differenzen' },
        native: {},
    });

    // Hilfsfunktion: Mirror-States (Active + Sensor-ID) + Messkanal anlegen
    async function createSensorSet(sensorKey, label) {
        // 1) Mirror-States der Instanz-Config
        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}_temp_active`, {
            type: 'state',
            common: {
                name: `Sensor ${label} verwenden`,
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
                name: `Objekt-ID Sensor ${label}`,
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
            common: { name: `Sensor ${label}` },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}.current`, {
            type: 'state',
            common: {
                name: `Aktueller Wert Sensor ${label}`,
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
                name: `Tagesminimum Sensor ${label}`,
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
                name: `Tagesmaximum Sensor ${label}`,
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
                name: `Veränderung pro Stunde Sensor ${label}`,
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
            name: 'Differenz Kollektor - Luft',
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
            name: 'Differenz Oberfläche - Grund',
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
            name: 'Differenz Vorlauf - Rücklauf',
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

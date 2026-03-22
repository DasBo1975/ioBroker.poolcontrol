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
    const sensorLabels = {
        surface: {
            en: 'Surface',
            de: 'Oberflaeche',
        },
        ground: {
            en: 'Ground',
            de: 'Grund',
        },
        flow: {
            en: 'Flow',
            de: 'Vorlauf',
        },
        return: {
            en: 'Return',
            de: 'Ruecklauf',
        },
        collector: {
            en: 'Collector',
            de: 'Kollektor',
        },
        outside: {
            en: 'Outside temperature',
            de: 'Aussentemperatur',
        },
    };

    // Root-Kanal (robustheitshalber explizit anlegen)
    await adapter.setObjectNotExistsAsync('temperature', {
        type: 'channel',
        common: {
            name: {
                en: 'Temperature management',
                de: 'Temperaturverwaltung',
            },
        },
        native: {},
    });

    // Kanal für Deltas
    await adapter.setObjectNotExistsAsync('temperature.delta', {
        type: 'channel',
        common: {
            name: {
                en: 'Temperature deltas',
                de: 'Temperaturdeltas',
            },
        },
        native: {},
    });

    // Hilfsfunktion: Mirror-States (Active + Sensor-ID) + Messkanal anlegen
    async function createSensorSet(sensorKey, label) {
        // 1) Mirror-States der Instanz-Config
        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}_temp_active`, {
            type: 'state',
            common: {
                name: {
                    en: `Use sensor ${label.en}`,
                    de: `Sensor ${label.de} verwenden`,
                },
                desc: {
                    en: `Enables or disables the ${label.en} sensor from the instance configuration`,
                    de: `Aktiviert oder deaktiviert den Sensor ${label.de} aus der Instanzkonfiguration`,
                },
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
                name: {
                    en: `Object ID sensor ${label.en}`,
                    de: `Objekt-ID Sensor ${label.de}`,
                },
                desc: {
                    en: `Configured object ID of the ${label.en} sensor`,
                    de: `Konfigurierte Objekt-ID des Sensors ${label.de}`,
                },
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
                name: {
                    en: `Sensor ${label.en}`,
                    de: `Sensor ${label.de}`,
                },
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync(`temperature.${sensorKey}.current`, {
            type: 'state',
            common: {
                name: {
                    en: `Current value sensor ${label.en}`,
                    de: `Aktueller Wert Sensor ${label.de}`,
                },
                desc: {
                    en: `Current measured temperature value of the ${label.en} sensor`,
                    de: `Aktuell gemessener Temperaturwert des Sensors ${label.de}`,
                },
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
                name: {
                    en: `Daily minimum sensor ${label.en}`,
                    de: `Tagesminimum Sensor ${label.de}`,
                },
                desc: {
                    en: `Lowest temperature recorded today for the ${label.en} sensor`,
                    de: `Niedrigste heute erfasste Temperatur des Sensors ${label.de}`,
                },
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
                name: {
                    en: `Daily maximum sensor ${label.en}`,
                    de: `Tagesmaximum Sensor ${label.de}`,
                },
                desc: {
                    en: `Highest temperature recorded today for the ${label.en} sensor`,
                    de: `Hoechste heute erfasste Temperatur des Sensors ${label.de}`,
                },
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
                name: {
                    en: `Change per hour sensor ${label.en}`,
                    de: `Aenderung pro Stunde Sensor ${label.de}`,
                },
                desc: {
                    en: `Hourly temperature change of the ${label.en} sensor`,
                    de: `Stuendliche Temperaturveraenderung des Sensors ${label.de}`,
                },
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
    await createSensorSet('surface', sensorLabels.surface);
    await createSensorSet('ground', sensorLabels.ground);
    await createSensorSet('flow', sensorLabels.flow);
    await createSensorSet('return', sensorLabels.return);
    await createSensorSet('collector', sensorLabels.collector);
    await createSensorSet('outside', sensorLabels.outside);

    // Deltas zwischen Sensoren
    await adapter.setObjectNotExistsAsync('temperature.delta.collector_outside', {
        type: 'state',
        common: {
            name: {
                en: 'Delta collector - air',
                de: 'Delta Kollektor - Luft',
            },
            desc: {
                en: 'Temperature difference between collector and outside air',
                de: 'Temperaturdifferenz zwischen Kollektor und Aussenluft',
            },
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
            name: {
                en: 'Delta surface - ground',
                de: 'Delta Oberflaeche - Grund',
            },
            desc: {
                en: 'Temperature difference between pool surface and ground',
                de: 'Temperaturdifferenz zwischen Pooloberflaeche und Grund',
            },
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
            name: {
                en: 'Delta flow - return',
                de: 'Delta Vorlauf - Ruecklauf',
            },
            desc: {
                en: 'Temperature difference between flow and return',
                de: 'Temperaturdifferenz zwischen Vorlauf und Ruecklauf',
            },
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

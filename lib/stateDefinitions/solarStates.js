'use strict';

/**
 * Legt alle States für die Solarverwaltung an:
 * - solar.solar_control_active
 * - solar.hysteresis_active
 * - solar.temp_on (Einschaltgrenze)
 * - solar.temp_off (Ausschaltgrenze)
 * - solar.collector_warning (Warnung aktiv)
 * - solar.warn_active (Warnlogik aktivieren/deaktivieren)
 * - solar.warn_temp (Warnschwelle °C)
 * - solar.warn_speech (Sprachausgabe bei Warnung)
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createSolarStates(adapter) {
    // Solarsteuerung aktiv
    await adapter.setObjectNotExistsAsync('solar.solar_control_active', {
        type: 'state',
        common: {
            name: 'Solarsteuerung aktivieren',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.solar_control_active', {
        val: adapter.config.solar_control_active,
        ack: true,
    });

    // Hysterese aktiv
    await adapter.setObjectNotExistsAsync('solar.hysteresis_active', {
        type: 'state',
        common: {
            name: 'Regelung mit Hysterese verwenden',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.hysteresis_active', {
        val: adapter.config.solar_hysteresis_active,
        ack: true,
    });

    // Einschaltgrenze
    await adapter.setObjectNotExistsAsync('solar.temp_on', {
        type: 'state',
        common: {
            name: 'Kollektortemperatur Einschaltgrenze (°C)',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.temp_on', {
        val: adapter.config.solar_temp_on,
        ack: true,
    });

    // Ausschaltgrenze
    await adapter.setObjectNotExistsAsync('solar.temp_off', {
        type: 'state',
        common: {
            name: 'Kollektortemperatur Ausschaltgrenze (°C)',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.temp_off', {
        val: adapter.config.solar_temp_off,
        ack: true,
    });

    // Warnung Kollektortemperatur aktiv
    await adapter.setObjectNotExistsAsync('solar.collector_warning', {
        type: 'state',
        common: {
            name: 'Kollektortemperatur-Warnung aktiv',
            type: 'boolean',
            role: 'indicator.error',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.collector_warning', {
        val: false,
        ack: true,
    });

    // NEU: Warnlogik aktivieren (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.warn_active', {
        type: 'state',
        common: {
            name: 'Warnung Kollektortemperatur aktivieren',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });

    // Prüfen, ob bereits ein persistierter Wert existiert
    const existingWarnActive = await adapter.getStateAsync('solar.warn_active');
    if (existingWarnActive === null || existingWarnActive.val === null || existingWarnActive.val === undefined) {
        // Nur bei erstmaligem Anlegen auf false setzen
        await adapter.setStateAsync('solar.warn_active', { val: false, ack: true });
    }

    // NEU: Warnschwelle (°C)
    await adapter.setObjectNotExistsAsync('solar.warn_temp', {
        type: 'state',
        common: {
            name: 'Warnschwelle Kollektortemperatur (°C)',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.warn_temp', { val: 80, ack: true });

    // NEU: Sprachausgabe bei Warnung
    await adapter.setObjectNotExistsAsync('solar.warn_speech', {
        type: 'state',
        common: {
            name: 'Sprachausgabe bei Warnung aktivieren',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        },
        native: {},
    });
    await adapter.setStateAsync('solar.warn_speech', { val: true, ack: true });
}

module.exports = {
    createSolarStates,
};

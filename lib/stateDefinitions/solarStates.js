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
    // Channel: Solar
    await adapter.setObjectNotExistsAsync('solar', {
        type: 'channel',
        common: {
            name: 'Solar',
        },
        native: {},
    });

    // Solarsteuerung aktiv (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.solar_control_active', {
        type: 'state',
        common: {
            name: 'Enable solar control',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });
    const existingSolarActive = await adapter.getStateAsync('solar.solar_control_active');
    if (existingSolarActive === null || existingSolarActive.val === null || existingSolarActive.val === undefined) {
        await adapter.setStateAsync('solar.solar_control_active', {
            val: adapter.config.solar_control_active,
            ack: true,
        });
    }

    // Hysterese aktiv (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.hysteresis_active', {
        type: 'state',
        common: {
            name: 'Use hysteresis control',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });
    const existingHyst = await adapter.getStateAsync('solar.hysteresis_active');
    if (existingHyst === null || existingHyst.val === null || existingHyst.val === undefined) {
        await adapter.setStateAsync('solar.hysteresis_active', {
            val: adapter.config.solar_hysteresis_active,
            ack: true,
        });
    }

    // Einschaltgrenze (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.temp_on', {
        type: 'state',
        common: {
            name: 'Collector temperature ON threshold (°C)',
            type: 'number',
            role: 'level',
            unit: '°C',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });
    const existingTempOn = await adapter.getStateAsync('solar.temp_on');
    if (existingTempOn === null || existingTempOn.val === null || existingTempOn.val === undefined) {
        await adapter.setStateAsync('solar.temp_on', {
            val: adapter.config.solar_temp_on,
            ack: true,
        });
    }

    // Ausschaltgrenze (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.temp_off', {
        type: 'state',
        common: {
            name: 'Collector temperature OFF threshold (°C)',
            type: 'number',
            role: 'level',
            unit: '°C',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });
    const existingTempOff = await adapter.getStateAsync('solar.temp_off');
    if (existingTempOff === null || existingTempOff.val === null || existingTempOff.val === undefined) {
        await adapter.setStateAsync('solar.temp_off', {
            val: adapter.config.solar_temp_off,
            ack: true,
        });
    }

    // Warnung Kollektortemperatur aktiv
    await adapter.setObjectNotExistsAsync('solar.collector_warning', {
        type: 'state',
        common: {
            name: 'Collector temperature warning active',
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
            name: 'Enable collector temperature warning',
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

    // NEU: Warnschwelle (°C, mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.warn_temp', {
        type: 'state',
        common: {
            name: 'Collector temperature warning threshold (°C)',
            type: 'number',
            role: 'level',
            unit: '°C',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });
    const existingWarnTemp = await adapter.getStateAsync('solar.warn_temp');
    if (existingWarnTemp === null || existingWarnTemp.val === null || existingWarnTemp.val === undefined) {
        await adapter.setStateAsync('solar.warn_temp', { val: 80, ack: true });
    }

    // NEU: Sprachausgabe bei Warnung (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('solar.warn_speech', {
        type: 'state',
        common: {
            name: 'Enable speech output for warnings',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });
    const existingWarnSpeech = await adapter.getStateAsync('solar.warn_speech');
    if (existingWarnSpeech === null || existingWarnSpeech.val === null || existingWarnSpeech.val === undefined) {
        await adapter.setStateAsync('solar.warn_speech', { val: true, ack: true });
    }
}

module.exports = {
    createSolarStates,
};

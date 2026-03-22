'use strict';

/**
 * createPhotovoltaicStates(adapter)
 * -------------------------------------------------------------
 * Legt alle States für den Photovoltaik-Bereich an.
 * - persistente States
 * - überinstallationsgeschützt (keine Überschreibung vorhandener Werte)
 * - konsistent im Stil der übrigen State-Dateien
 * -------------------------------------------------------------
 */

/**
 * @param {object} adapter - ioBroker Adapterinstanz
 * @returns {Promise<void>}
 */
async function createPhotovoltaicStates(adapter) {
    adapter.log.debug('[createPhotovoltaicStates] Initialization started.');

    // --- Photovoltaik-Hauptordner ---
    await adapter.setObjectNotExistsAsync('photovoltaic', {
        type: 'channel',
        common: {
            name: {
                en: 'Photovoltaics (Surplus Detection)',
                de: 'Photovoltaik (Ueberschusserkennung)',
            },
        },
        native: {},
    });

    // --- State-Liste ---
    const states = [
        {
            id: 'power_generated_w',
            name: {
                en: 'PV generation power (W)',
                de: 'PV-Erzeugungsleistung (W)',
            },
            desc: {
                en: 'Current generated power of the PV system in watts',
                de: 'Aktuell erzeugte Leistung der PV-Anlage in Watt',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'power_house_w',
            name: {
                en: 'House consumption (W)',
                de: 'Hausverbrauch (W)',
            },
            desc: {
                en: 'Current power consumption of the house in watts',
                de: 'Aktueller Stromverbrauch des Hauses in Watt',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'power_surplus_w',
            name: {
                en: 'PV surplus power (W)',
                de: 'PV-Ueberschussleistung (W)',
            },
            desc: {
                en: 'Calculated surplus between PV generation and house consumption',
                de: 'Berechneter Ueberschuss zwischen PV-Erzeugung und Hausverbrauch',
            },
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'surplus_active',
            name: {
                en: 'PV surplus active',
                de: 'PV-Ueberschuss aktiv',
            },
            desc: {
                en: 'Indicates whether a PV surplus is currently present (true/false)',
                de: 'Zeigt an, ob aktuell ein PV-Ueberschuss vorhanden ist (true/false)',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            def: false,
        },
        {
            id: 'afterrun_min',
            name: {
                en: 'After-run time (minutes)',
                de: 'Nachlaufzeit (Minuten)',
            },
            desc: {
                en: 'Duration the pump continues to run after PV surplus ends',
                de: 'Dauer, die die Pumpe nach Ende des PV-Ueberschusses weiterlaeuft',
            },
            type: 'number',
            role: 'level',
            unit: 'min',
            read: true,
            write: true,
            def: 2,
        },
        {
            id: 'ignore_on_circulation',
            name: {
                en: 'Ignore PV when circulation target is reached',
                de: 'PV ignorieren, wenn Umwaelzziel erreicht ist',
            },
            desc: {
                en: 'If enabled, PV control is disabled once daily circulation target is met',
                de: 'Wenn aktiviert, wird die PV-Steuerung deaktiviert, sobald das taegliche Umwaelzziel erreicht ist',
            },
            type: 'boolean',
            role: 'switch.enable',
            read: true,
            write: true,
            def: false,
        },
        {
            id: 'threshold_w',
            name: {
                en: 'PV surplus threshold (W)',
                de: 'PV-Ueberschuss-Schwelle (W)',
            },
            desc: {
                en: 'Watt threshold at which a surplus is detected',
                de: 'Watt-Schwelle, ab der ein Ueberschuss erkannt wird',
            },
            type: 'number',
            role: 'value',
            unit: 'W',
            read: true,
            write: false,
            def: 200,
        },
        {
            id: 'status_text',
            name: {
                en: 'Status message',
                de: 'Statusmeldung',
            },
            desc: {
                en: 'Plain text status of PV detection (e.g. surplus active)',
                de: 'Klartext-Status der PV-Erkennung (z. B. Ueberschuss aktiv)',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        {
            id: 'last_update',
            name: {
                en: 'Last update',
                de: 'Letzte Aktualisierung',
            },
            desc: {
                en: 'Timestamp of the last PV value calculation',
                de: 'Zeitstempel der letzten PV-Wertberechnung',
            },
            type: 'string',
            role: 'date',
            read: true,
            write: false,
            def: '',
        },
    ];

    // --- States anlegen ---
    for (const s of states) {
        const id = `photovoltaic.${s.id}`;

        await adapter.setObjectNotExistsAsync(id, {
            type: 'state',
            common: {
                name: s.name,
                desc: s.desc,
                type: s.type,
                role: s.role,
                read: s.read,
                write: s.write,
                def: s.def,
                unit: s.unit || '',
                persist: true,
            },
            native: {},
        });

        // Überinstallationsschutz
        const existing = await adapter.getStateAsync(id);
        if (existing === null || existing === undefined) {
            await adapter.setStateAsync(id, { val: s.def, ack: true });
            adapter.log.debug(`[createPhotovoltaicStates] New state '${id}' initialized with default value ${s.def}.`);
        } else {
            adapter.log.debug(`[createPhotovoltaicStates] State '${id}' already exists - keeping existing value.`);
        }
    }

    adapter.log.info('[createPhotovoltaicStates] Initialization completed.');
}

module.exports = { createPhotovoltaicStates };

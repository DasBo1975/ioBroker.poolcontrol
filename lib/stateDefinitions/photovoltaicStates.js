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
        common: { name: 'Photovoltaik (Überschusserkennung)' },
        native: {},
    });

    // --- State-Liste ---
    const states = [
        {
            id: 'power_generated_w',
            name: { de: 'PV-Erzeugungsleistung (W)', en: 'PV generation power (W)' },
            desc: {
                de: 'Aktuell erzeugte Leistung der PV-Anlage in Watt',
                en: 'Current generated power of the PV system in watts',
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
            name: { de: 'Hausverbrauch (W)', en: 'House consumption (W)' },
            desc: {
                de: 'Aktueller Stromverbrauch des Hauses in Watt',
                en: 'Current power consumption of the house in watts',
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
            name: { de: 'PV-Überschussleistung (W)', en: 'PV surplus power (W)' },
            desc: {
                de: 'Berechneter Überschuss zwischen PV-Erzeugung und Hausverbrauch',
                en: 'Calculated surplus between PV generation and house consumption',
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
            name: { de: 'PV-Überschuss aktiv', en: 'PV surplus active' },
            desc: {
                de: 'Zeigt an, ob aktuell ein PV-Überschuss vorliegt (true/false)',
                en: 'Indicates whether a PV surplus is currently present (true/false)',
            },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            def: false,
        },
        {
            id: 'afterrun_min',
            name: { de: 'Nachlaufzeit (Minuten)', en: 'After-run time (minutes)' },
            desc: {
                de: 'Dauer, wie lange die Pumpe nach Ende des PV-Überschusses weiterläuft',
                en: 'Duration the pump continues to run after PV surplus ends',
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
                de: 'PV ignorieren, wenn Umwälzmenge erreicht',
                en: 'Ignore PV when circulation target is reached',
            },
            desc: {
                de: 'Wenn aktiviert, wird PV-Steuerung deaktiviert, sobald Tagesumwälzung erfüllt ist',
                en: 'If enabled, PV control is disabled once daily circulation target is met',
            },
            type: 'boolean',
            role: 'switch.enable',
            read: true,
            write: true,
            def: false,
        },
        {
            id: 'threshold_w',
            name: { de: 'Schwellwert für PV-Überschuss (W)', en: 'PV surplus threshold (W)' },
            desc: {
                de: 'Watt-Schwelle, ab der ein Überschuss erkannt wird',
                en: 'Watt threshold at which a surplus is detected',
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
            name: { de: 'Statusmeldung (Text)', en: 'Status message (text)' },
            desc: {
                de: 'Klartextstatus der PV-Erkennung (z. B. Überschuss aktiv)',
                en: 'Plain text status of PV detection (e.g. surplus active)',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        {
            id: 'last_update',
            name: { de: 'Letzte Aktualisierung', en: 'Last update' },
            desc: {
                de: 'Zeitstempel der letzten Berechnung der PV-Werte',
                en: 'Timestamp of the last PV value calculation',
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

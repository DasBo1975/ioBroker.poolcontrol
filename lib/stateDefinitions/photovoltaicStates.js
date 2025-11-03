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
    adapter.log.debug('[createPhotovoltaicStates] Initialisierung gestartet.');

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
            name: 'PV-Erzeugungsleistung (W)',
            desc: 'Aktuell erzeugte Leistung der PV-Anlage in Watt',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'power_house_w',
            name: 'Hausverbrauch (W)',
            desc: 'Aktueller Stromverbrauch des Hauses in Watt',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'power_surplus_w',
            name: 'PV-Überschussleistung (W)',
            desc: 'Berechneter Überschuss zwischen PV-Erzeugung und Hausverbrauch',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            def: 0,
        },
        {
            id: 'surplus_active',
            name: 'PV-Überschuss aktiv',
            desc: 'Zeigt an, ob aktuell ein PV-Überschuss vorliegt (true/false)',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            def: false,
        },
        {
            id: 'afterrun_min',
            name: 'Nachlaufzeit (Minuten)',
            desc: 'Dauer, wie lange die Pumpe nach Ende des PV-Überschusses weiterläuft',
            type: 'number',
            role: 'level',
            unit: 'min',
            read: true,
            write: true,
            def: 2,
        },
        {
            id: 'ignore_on_circulation',
            name: 'PV ignorieren, wenn Umwälzmenge erreicht',
            desc: 'Wenn aktiviert, wird PV-Steuerung deaktiviert, sobald Tagesumwälzung erfüllt ist',
            type: 'boolean',
            role: 'switch.enable',
            read: true,
            write: true,
            def: false,
        },
        {
            id: 'threshold_w',
            name: 'Schwellwert für PV-Überschuss (W)',
            desc: 'Watt-Schwelle, ab der ein Überschuss erkannt wird',
            type: 'number',
            role: 'value',
            unit: 'W',
            read: true,
            write: false,
            def: 200,
        },
        {
            id: 'status_text',
            name: 'Statusmeldung (Text)',
            desc: 'Klartextstatus der PV-Erkennung (z. B. Überschuss aktiv)',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            def: '',
        },
        {
            id: 'last_update',
            name: 'Letzte Aktualisierung',
            desc: 'Zeitstempel der letzten Berechnung der PV-Werte',
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
            adapter.log.debug(
                `[createPhotovoltaicStates] Neuer State '${id}' initialisiert mit Default-Wert ${s.def}.`,
            );
        } else {
            adapter.log.debug(`[createPhotovoltaicStates] State '${id}' bereits vorhanden – Wert bleibt erhalten.`);
        }
    }

    adapter.log.info('[createPhotovoltaicStates] Initialisierung abgeschlossen.');
}

module.exports = { createPhotovoltaicStates };

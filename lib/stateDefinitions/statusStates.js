'use strict';

/**
 * Legt alle States für Status-Übersichten an:
 * - status.summary (string, Textzusammenfassung)
 * - status.overview_json (string, JSON-Zusammenfassung)
 * - status.last_summary_update (string, Zeitstempel)
 * - status.pump_last_start (string, Zeitstempel)
 * - status.pump_last_stop (string, Zeitstempel)
 * - status.pump_was_on_today (boolean)
 * - status.pump_today_count (number)
 * - status.system_ok (boolean)
 * - status.system_warning (boolean)
 * - status.system_warning_text (string)
 * - status.season_active (boolean)
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createStatusStates(adapter) {
    // Root-Kanal "status"
    await adapter.setObjectNotExistsAsync('status', {
        type: 'channel',
        common: {
            name: { de: 'Statusübersicht', en: 'Status overview' },
        },
        native: {},
    });

    // Zusammenfassung als Text
    await adapter.setObjectNotExistsAsync('status.summary', {
        type: 'state',
        common: {
            name: { de: 'Zusammenfassung als Text', en: 'Summary as text' },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            // bewusst kein persist: true, da nur Live-Daten
        },
        native: {},
    });
    await adapter.setStateAsync('status.summary', { val: '', ack: true });

    // JSON-Zusammenfassung
    await adapter.setObjectNotExistsAsync('status.overview_json', {
        type: 'state',
        common: {
            name: { de: 'Übersicht als JSON', en: 'Overview as JSON' },
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('status.overview_json', { val: '{}', ack: true });

    // Letzte Aktualisierung der Summary
    await adapter.setObjectNotExistsAsync('status.last_summary_update', {
        type: 'state',
        common: {
            name: { de: 'Letzte Aktualisierung der Zusammenfassung', en: 'Last summary update' },
            type: 'string',
            role: 'date',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('status.last_summary_update', { val: '', ack: true });

    // Pumpen-Status: letzter Start
    await adapter.setObjectNotExistsAsync('status.pump_last_start', {
        type: 'state',
        common: {
            name: { de: 'Letzter Pumpenstart', en: 'Last pump start' },
            type: 'string',
            role: 'date',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('status.pump_last_start', { val: '', ack: true });

    // Pumpen-Status: letzter Stopp
    await adapter.setObjectNotExistsAsync('status.pump_last_stop', {
        type: 'state',
        common: {
            name: { de: 'Letztes Pumpenende', en: 'Last pump stop' },
            type: 'string',
            role: 'date',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('status.pump_last_stop', { val: '', ack: true });

    // Pumpen-Status: heute eingeschaltet
    await adapter.setObjectNotExistsAsync('status.pump_was_on_today', {
        type: 'state',
        common: {
            name: { de: 'Pumpe war heute eingeschaltet', en: 'Pump was on today' },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('status.pump_was_on_today', { val: false, ack: true });

    // Pumpen-Status: Anzahl Starts heute
    await adapter.setObjectNotExistsAsync('status.pump_today_count', {
        type: 'state',
        common: {
            name: { de: 'Pumpenstarts heute', en: 'Pump starts today' },
            type: 'number',
            role: 'value',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    await adapter.setStateAsync('status.pump_today_count', { val: 0, ack: true });

    // Systemstatus: OK
    await adapter.setObjectNotExistsAsync('status.system_ok', {
        type: 'state',
        common: {
            name: { de: 'System OK', en: 'System OK' },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('status.system_ok', { val: true, ack: true });

    // Systemstatus: Warnung aktiv
    await adapter.setObjectNotExistsAsync('status.system_warning', {
        type: 'state',
        common: {
            name: { de: 'System-Warnung aktiv', en: 'System warning active' },
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('status.system_warning', { val: false, ack: true });

    // Systemstatus: Warnungstext
    await adapter.setObjectNotExistsAsync('status.system_warning_text', {
        type: 'state',
        common: {
            name: { de: 'Beschreibung der Systemwarnung', en: 'System warning description' },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync('status.system_warning_text', { val: '', ack: true });

    // Saisonstatus (mit Persist-Schutz)
    await adapter.setObjectNotExistsAsync('status.season_active', {
        type: 'state',
        common: {
            name: { de: 'Poolsaison aktiv', en: 'Pool season active' },
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            persist: true, // dauerhaft speichern
        },
        native: {},
    });

    // Prüfen, ob bereits ein persistierter Wert existiert
    const existingSeasonActive = await adapter.getStateAsync('status.season_active');
    if (existingSeasonActive === null || existingSeasonActive.val === null || existingSeasonActive.val === undefined) {
        await adapter.setStateAsync('status.season_active', { val: false, ack: true });
    }
}

module.exports = {
    createStatusStates,
};

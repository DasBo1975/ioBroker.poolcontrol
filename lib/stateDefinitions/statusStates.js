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
            name: {
                en: 'Status overview',
                de: 'Statusuebersicht',
            },
        },
        native: {},
    });

    // Zusammenfassung als Text
    await adapter.setObjectNotExistsAsync('status.summary', {
        type: 'state',
        common: {
            name: {
                en: 'Summary',
                de: 'Zusammenfassung',
            },
            desc: {
                en: 'Text summary of the current system status',
                de: 'Textzusammenfassung des aktuellen Systemstatus',
            },
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
            name: {
                en: 'Overview as JSON',
                de: 'Uebersicht als JSON',
            },
            desc: {
                en: 'JSON summary of the current system status',
                de: 'JSON-Zusammenfassung des aktuellen Systemstatus',
            },
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
            name: {
                en: 'Last summary update',
                de: 'Letzte Aktualisierung der Zusammenfassung',
            },
            desc: {
                en: 'Timestamp of the last status summary update',
                de: 'Zeitstempel der letzten Aktualisierung der Statuszusammenfassung',
            },
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
            name: {
                en: 'Last pump start',
                de: 'Letzter Pumpenstart',
            },
            desc: {
                en: 'Timestamp of the last pump start',
                de: 'Zeitstempel des letzten Pumpenstarts',
            },
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
            name: {
                en: 'Last pump stop',
                de: 'Letzter Pumpenstopp',
            },
            desc: {
                en: 'Timestamp of the last pump stop',
                de: 'Zeitstempel des letzten Pumpenstopps',
            },
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
            name: {
                en: 'Pump was on today',
                de: 'Pumpe war heute an',
            },
            desc: {
                en: 'Indicates whether the pump has been active today',
                de: 'Zeigt an, ob die Pumpe heute aktiv war',
            },
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
            name: {
                en: 'Pump starts today',
                de: 'Pumpenstarts heute',
            },
            desc: {
                en: 'Number of pump starts counted today',
                de: 'Anzahl der heute gezaehlten Pumpenstarts',
            },
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
            name: {
                en: 'System OK',
                de: 'System OK',
            },
            desc: {
                en: 'Indicates whether the system status is currently OK',
                de: 'Zeigt an, ob der Systemstatus aktuell in Ordnung ist',
            },
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
            name: {
                en: 'System warning active',
                de: 'Systemwarnung aktiv',
            },
            desc: {
                en: 'Indicates whether a system warning is currently active',
                de: 'Zeigt an, ob aktuell eine Systemwarnung aktiv ist',
            },
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
            name: {
                en: 'System warning description',
                de: 'Beschreibung der Systemwarnung',
            },
            desc: {
                en: 'Text description of the current system warning',
                de: 'Textbeschreibung der aktuellen Systemwarnung',
            },
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
            name: {
                en: 'Pool season active',
                de: 'Poolsaison aktiv',
            },
            desc: {
                en: 'Enables or disables the active pool season state',
                de: 'Aktiviert oder deaktiviert den Status der aktiven Poolsaison',
            },
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

/**
 * =============================================================
 * Pump Speed States
 * =============================================================
 *
 * Dieser Bereich stellt eine **Leistungsempfehlung** für die
 * Hauptpumpe bereit.
 *
 * WICHTIG:
 * - Diese States steuern KEINE Hardware
 * - Diese States schalten die Pumpe NICHT ein oder aus
 * - Es findet KEINE Drehzahlregelung im Adapter statt
 *
 * Der Bereich `pump.speed` ist eine **reine Ableitung**
 * aus bereits vorhandenen Pumpen-States wie z. B.:
 * - pump.pump_switch
 * - pump.reason
 * - pump.mode
 * - pump.active_helper
 *
 * Ziel:
 * - Bereitstellung eines EINDEUTIGEN internen Leistungszustands
 * - Mehrere Ausgaben (semantisch + technisch) aus DIESEM Zustand
 * - Frei nutzbar für Blockly, Shelly, Frequenzumrichter etc.
 *
 * Es gibt:
 * - genau EINEN internen Zustand
 * - KEINE doppelte Status- oder Reason-Logik
 * - KEIN enable/disable-Schalter (immer aktiv, rein passiv)
 *
 * =============================================================
 */

'use strict';

/**
 * Create pump speed recommendation states
 *
 * @param {object} adapter ioBroker adapter instance
 */
async function createPumpSpeedStates(adapter) {
    /**
     * -------------------------------------------------------------
     * Channel: pump.speed
     * -------------------------------------------------------------
     * Übergeordneter Kanal für alle Datenpunkte zur
     * Leistungsempfehlung der Hauptpumpe.
     */
    await adapter.setObjectNotExistsAsync('pump.speed', {
        type: 'channel',
        common: {
            name: {
                en: 'Pump power recommendation',
                de: 'Leistungsempfehlung für die Pumpe',
            },
        },
        native: {},
    });

    /**
     * -------------------------------------------------------------
     * Interner Kernzustand
     * -------------------------------------------------------------
     *
     * pump.speed.state
     *
     * ZENTRALER interner Zustand, aus dem alle weiteren
     * Ausgaben abgeleitet werden.
     *
     * Dieser State wird:
     * - ausschließlich vom späteren Helper gesetzt
     * - NICHT vom User beschrieben
     *
     * Typische Werte:
     * - off
     * - frost
     * - low
     * - normal
     * - high
     * - boost
     */
    await adapter.setObjectNotExistsAsync('pump.speed.state', {
        type: 'state',
        common: {
            name: {
                en: 'Internal power state',
                de: 'Interner Leistungszustand',
            },
            desc: {
                en: 'Central internal state from which all pump speed recommendations are derived',
                de: 'Zentraler interner Zustand, aus dem alle Pumpenleistungsempfehlungen abgeleitet werden',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });

    /**
     * -------------------------------------------------------------
     * Semantische Ausgabe
     * -------------------------------------------------------------
     *
     * pump.speed.mode
     *
     * Menschlich lesbare Darstellung des aktuellen
     * Leistungszustands.
     *
     * Inhaltlich identisch zu pump.speed.state,
     * dient jedoch explizit für:
     * - Visualisierung
     * - Debugging
     * - Logik in Blockly / Skripten
     */
    await adapter.setObjectNotExistsAsync('pump.speed.mode', {
        type: 'state',
        common: {
            name: {
                en: 'Recommended pump mode',
                de: 'Empfohlener Pumpenmodus',
            },
            desc: {
                en: 'Human-readable representation of the current recommended pump power state',
                de: 'Klartextdarstellung des aktuell empfohlenen Leistungszustands der Pumpe',
            },
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        },
        native: {},
    });

    /**
     * -------------------------------------------------------------
     * Technische Ausgabe (Prozentwert)
     * -------------------------------------------------------------
     *
     * pump.speed.percent
     *
     * Prozentuale Leistungsempfehlung (0–100 %),
     * abgeleitet aus:
     * - pump.speed.state
     * - User-Mapping unter pump.speed.config.percent.*
     *
     * WICHTIG:
     * - Dieser State ist REIN INFORMATORISCH
     * - Er darf KEINE Hardware direkt steuern
     * - write = false ist ABSICHTLICH
     */
    await adapter.setObjectNotExistsAsync('pump.speed.percent', {
        type: 'state',
        common: {
            name: {
                en: 'Recommended pump power (%)',
                de: 'Empfohlene Pumpenleistung (%)',
            },
            desc: {
                en: 'Recommended pump power as a percentage derived from the internal state and percent mapping',
                de: 'Empfohlene Pumpenleistung als Prozentwert, abgeleitet aus internem Zustand und Prozent-Mapping',
            },
            type: 'number',
            role: 'value',
            unit: '%',
            read: true,
            write: false,
        },
        native: {},
    });

    /**
     * -------------------------------------------------------------
     * Konfiguration: Prozent-Mapping
     * -------------------------------------------------------------
     *
     * In diesem Bereich definiert der User,
     * wie die einzelnen Leistungszustände
     * in Prozent interpretiert werden sollen.
     *
     * Diese Werte beeinflussen NUR die Ausgabe
     * von pump.speed.percent – NICHT den Zustand
     * der Pumpe selbst.
     */

    await adapter.setObjectNotExistsAsync('pump.speed.config', {
        type: 'channel',
        common: {
            name: {
                en: 'Configuration',
                de: 'Konfiguration',
            },
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('pump.speed.config.percent', {
        type: 'channel',
        common: {
            name: {
                en: 'Percent mapping',
                de: 'Prozentzuordnung',
            },
        },
        native: {},
    });

    /**
     * Frostschutz
     */
    await adapter.setObjectNotExistsAsync('pump.speed.config.percent.frost', {
        type: 'state',
        common: {
            name: {
                en: 'Frost protection (%)',
                de: 'Frostschutz (%)',
            },
            desc: {
                en: 'Configured percentage value for frost protection mode',
                de: 'Konfigurierter Prozentwert fuer den Frostschutzmodus',
            },
            type: 'number',
            role: 'level',
            unit: '%',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    /**
     * Niedrige Leistung
     */
    await adapter.setObjectNotExistsAsync('pump.speed.config.percent.low', {
        type: 'state',
        common: {
            name: {
                en: 'Low power (%)',
                de: 'Niedrige Leistung (%)',
            },
            desc: {
                en: 'Configured percentage value for low power mode',
                de: 'Konfigurierter Prozentwert fuer den Modus „niedrige Leistung“',
            },
            type: 'number',
            role: 'level',
            unit: '%',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    /**
     * Normalbetrieb
     */
    await adapter.setObjectNotExistsAsync('pump.speed.config.percent.normal', {
        type: 'state',
        common: {
            name: {
                en: 'Normal operation (%)',
                de: 'Normalbetrieb (%)',
            },
            desc: {
                en: 'Configured percentage value for normal operation mode',
                de: 'Konfigurierter Prozentwert fuer den Normalbetrieb',
            },
            type: 'number',
            role: 'level',
            unit: '%',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    /**
     * Hohe Leistung
     */
    await adapter.setObjectNotExistsAsync('pump.speed.config.percent.high', {
        type: 'state',
        common: {
            name: {
                en: 'High power (%)',
                de: 'Hohe Leistung (%)',
            },
            desc: {
                en: 'Configured percentage value for high power mode',
                de: 'Konfigurierter Prozentwert fuer den Modus „hohe Leistung“',
            },
            type: 'number',
            role: 'level',
            unit: '%',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });

    /**
     * Boost / Wartung / Rückspülen
     */
    await adapter.setObjectNotExistsAsync('pump.speed.config.percent.boost', {
        type: 'state',
        common: {
            name: {
                en: 'Boost / maintenance (%)',
                de: 'Boost / Wartung (%)',
            },
            desc: {
                en: 'Configured percentage value for boost or maintenance mode',
                de: 'Konfigurierter Prozentwert fuer den Boost- oder Wartungsmodus',
            },
            type: 'number',
            role: 'level',
            unit: '%',
            read: true,
            write: true,
            persist: true,
        },
        native: {},
    });
}

module.exports = {
    createPumpSpeedStates,
};

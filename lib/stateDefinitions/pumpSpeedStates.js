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
            name: 'Pumpen-Leistungsempfehlung',
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
            name: 'Interner Leistungszustand (intern)',
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
            name: 'Empfohlener Pumpenmodus',
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
            name: 'Empfohlene Pumpenleistung',
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
            name: 'Konfiguration',
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync('pump.speed.config.percent', {
        type: 'channel',
        common: {
            name: 'Prozent-Mapping',
        },
        native: {},
    });

    /**
     * Frostschutz
     */
    await adapter.setObjectNotExistsAsync('pump.speed.config.percent.frost', {
        type: 'state',
        common: {
            name: 'Frostschutz (%)',
            type: 'number',
            role: 'value',
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
            name: 'Niedrige Leistung (%)',
            type: 'number',
            role: 'value',
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
            name: 'Normalbetrieb (%)',
            type: 'number',
            role: 'value',
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
            name: 'Hohe Leistung (%)',
            type: 'number',
            role: 'value',
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
            name: 'Boost / Wartung (%)',
            type: 'number',
            role: 'value',
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

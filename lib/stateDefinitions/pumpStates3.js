'use strict';

/**
 * pumpStates3.js
 * ----------------------------------------------------------
 * Legt die States für den Lern- und Analysebereich der Pumpe an.
 *
 * Ordner: pump.learning
 * Zweck: Speicherung von Durchschnitts- und Normalwerten
 *        zur Erkennung des typischen Pumpenverhaltens.
 *
 * Wird durch pumpHelper3.js verwaltet.
 * Alle Werte sind persistent (persist: true).
 * ----------------------------------------------------------
 * Version: 1.0.1
 */

/**
 * Erstellt die Lernfeld-States für Pumpenanalyse.
 *
 * @param {import('iobroker').Adapter} adapter – Aktive ioBroker Adapterinstanz
 */
async function createPumpStates3(adapter) {
    // ------------------------------------------------------
    // Root-Kanal: pump.learning
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning', {
        type: 'channel',
        common: {
            name: 'Pumpen-Lernwerte (Analyse & Normalbereich)',
        },
        native: {},
    });

    // ------------------------------------------------------
    // Durchschnittliche Leistungsaufnahme (W)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.learned_avg_power_w', {
        type: 'state',
        common: {
            name: 'Erlernter Durchschnitt der Leistungsaufnahme',
            desc: 'Durchschnittliche Leistungsaufnahme der Pumpe über alle Lernzyklen (W)',
            type: 'number',
            role: 'value.power',
            unit: 'W',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingPower = await adapter.getStateAsync('pump.learning.learned_avg_power_w');
    if (existingPower === null || existingPower.val === null || existingPower.val === undefined) {
        await adapter.setStateAsync('pump.learning.learned_avg_power_w', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Durchschnittlicher Durchfluss (L/h)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.learned_avg_flow_lh', {
        type: 'state',
        common: {
            name: 'Erlernter Durchschnitt des Durchflusses',
            desc: 'Durchschnittlicher reeller Durchfluss über alle Lernzyklen (L/h)',
            type: 'number',
            role: 'value.flow',
            unit: 'l/h',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingFlow = await adapter.getStateAsync('pump.learning.learned_avg_flow_lh');
    if (existingFlow === null || existingFlow.val === null || existingFlow.val === undefined) {
        await adapter.setStateAsync('pump.learning.learned_avg_flow_lh', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Normalbereich Leistung – Untere / Obere Grenze
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.normal_range_power_low', {
        type: 'state',
        common: {
            name: 'Leistungs-Normalbereich (untere Grenze)',
            desc: 'Untergrenze des normalen Leistungsbereichs (W)',
            type: 'number',
            role: 'value.min',
            unit: 'W',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingPowerLow = await adapter.getStateAsync('pump.learning.normal_range_power_low');
    if (existingPowerLow === null || existingPowerLow.val === null || existingPowerLow.val === undefined) {
        await adapter.setStateAsync('pump.learning.normal_range_power_low', { val: 0, ack: true });
    }

    await adapter.setObjectNotExistsAsync('pump.learning.normal_range_power_high', {
        type: 'state',
        common: {
            name: 'Leistungs-Normalbereich (obere Grenze)',
            desc: 'Obergrenze des normalen Leistungsbereichs (W)',
            type: 'number',
            role: 'value.max',
            unit: 'W',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingPowerHigh = await adapter.getStateAsync('pump.learning.normal_range_power_high');
    if (existingPowerHigh === null || existingPowerHigh.val === null || existingPowerHigh.val === undefined) {
        await adapter.setStateAsync('pump.learning.normal_range_power_high', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Normalbereich Durchfluss – Untere / Obere Grenze
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.normal_range_flow_low', {
        type: 'state',
        common: {
            name: 'Durchfluss-Normalbereich (untere Grenze)',
            desc: 'Untergrenze des normalen Durchflussbereichs (L/h)',
            type: 'number',
            role: 'value.min',
            unit: 'l/h',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingFlowLow = await adapter.getStateAsync('pump.learning.normal_range_flow_low');
    if (existingFlowLow === null || existingFlowLow.val === null || existingFlowLow.val === undefined) {
        await adapter.setStateAsync('pump.learning.normal_range_flow_low', { val: 0, ack: true });
    }

    await adapter.setObjectNotExistsAsync('pump.learning.normal_range_flow_high', {
        type: 'state',
        common: {
            name: 'Durchfluss-Normalbereich (obere Grenze)',
            desc: 'Obergrenze des normalen Durchflussbereichs (L/h)',
            type: 'number',
            role: 'value.max',
            unit: 'l/h',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingFlowHigh = await adapter.getStateAsync('pump.learning.normal_range_flow_high');
    if (existingFlowHigh === null || existingFlowHigh.val === null || existingFlowHigh.val === undefined) {
        await adapter.setStateAsync('pump.learning.normal_range_flow_high', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Abweichungen (Prozent)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.deviation_power_percent', {
        type: 'state',
        common: {
            name: 'Leistungsabweichung (%)',
            desc: 'Aktuelle Abweichung der Leistungsaufnahme vom Durchschnittswert',
            type: 'number',
            role: 'value.percent',
            unit: '%',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingDevPower = await adapter.getStateAsync('pump.learning.deviation_power_percent');
    if (existingDevPower === null || existingDevPower.val === null || existingDevPower.val === undefined) {
        await adapter.setStateAsync('pump.learning.deviation_power_percent', { val: 0, ack: true });
    }

    await adapter.setObjectNotExistsAsync('pump.learning.deviation_flow_percent', {
        type: 'state',
        common: {
            name: 'Durchflussabweichung (%)',
            desc: 'Aktuelle Abweichung des Durchflusses vom Durchschnittswert',
            type: 'number',
            role: 'value.percent',
            unit: '%',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingDevFlow = await adapter.getStateAsync('pump.learning.deviation_flow_percent');
    if (existingDevFlow === null || existingDevFlow.val === null || existingDevFlow.val === undefined) {
        await adapter.setStateAsync('pump.learning.deviation_flow_percent', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Textbewertung (Status)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.status_text', {
        type: 'state',
        common: {
            name: 'Statusbewertung',
            desc: 'Textbasierte Bewertung des aktuellen Pumpenverhaltens (z. B. "im Normalbereich", "auffällig niedrig")',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingStatus = await adapter.getStateAsync('pump.learning.status_text');
    if (existingStatus === null || existingStatus.val === null || existingStatus.val === undefined) {
        await adapter.setStateAsync('pump.learning.status_text', { val: '', ack: true });
    }

    // ------------------------------------------------------
    // Anzahl Lernzyklen
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.learning_cycles_total', {
        type: 'state',
        common: {
            name: 'Gesamtzahl der Lernzyklen',
            desc: 'Anzahl der Pumpenläufe, die in die Lernberechnung eingeflossen sind',
            type: 'number',
            role: 'value',
            read: true,
            write: false,
            persist: true,
        },
        native: {},
    });
    const existingCycles = await adapter.getStateAsync('pump.learning.learning_cycles_total');
    if (existingCycles === null || existingCycles.val === null || existingCycles.val === undefined) {
        await adapter.setStateAsync('pump.learning.learning_cycles_total', { val: 0, ack: true });
    }

    // ------------------------------------------------------
    // Log-Eintrag
    // ------------------------------------------------------
    adapter.log.debug('[pumpStates3] Lern-States erstellt oder geprüft.');
}

module.exports = {
    createPumpStates3,
};

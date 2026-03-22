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
            name: {
                en: 'Pump learning values (analysis & normal range)',
                de: 'Pumpen-Lernwerte (Analyse & Normalbereich)',
            },
        },
        native: {},
    });

    // ------------------------------------------------------
    // Durchschnittliche Leistungsaufnahme (W)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.learned_avg_power_w', {
        type: 'state',
        common: {
            name: {
                en: 'Learned average power consumption',
                de: 'Gelernte durchschnittliche Leistungsaufnahme',
            },
            desc: {
                en: 'Average pump power consumption across all learning cycles (W)',
                de: 'Durchschnittliche Pumpenleistungsaufnahme ueber alle Lernzyklen hinweg (W)',
            },
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
            name: {
                en: 'Learned average flow',
                de: 'Gelernter durchschnittlicher Durchfluss',
            },
            desc: {
                en: 'Average actual flow across all learning cycles (L/h)',
                de: 'Durchschnittlicher realer Durchfluss ueber alle Lernzyklen hinweg (L/h)',
            },
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
            name: {
                en: 'Power normal range (lower limit)',
                de: 'Normalbereich Leistung (untere Grenze)',
            },
            desc: {
                en: 'Lower limit of the normal power range (W)',
                de: 'Untere Grenze des normalen Leistungsbereichs (W)',
            },
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
            name: {
                en: 'Power normal range (upper limit)',
                de: 'Normalbereich Leistung (obere Grenze)',
            },
            desc: {
                en: 'Upper limit of the normal power range (W)',
                de: 'Obere Grenze des normalen Leistungsbereichs (W)',
            },
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
            name: {
                en: 'Flow normal range (lower limit)',
                de: 'Normalbereich Durchfluss (untere Grenze)',
            },
            desc: {
                en: 'Lower limit of the normal flow range (L/h)',
                de: 'Untere Grenze des normalen Durchflussbereichs (L/h)',
            },
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
            name: {
                en: 'Flow normal range (upper limit)',
                de: 'Normalbereich Durchfluss (obere Grenze)',
            },
            desc: {
                en: 'Upper limit of the normal flow range (L/h)',
                de: 'Obere Grenze des normalen Durchflussbereichs (L/h)',
            },
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
            name: {
                en: 'Power deviation (%)',
                de: 'Leistungsabweichung (%)',
            },
            desc: {
                en: 'Current deviation of power consumption from the average value',
                de: 'Aktuelle Abweichung der Leistungsaufnahme vom Durchschnittswert',
            },
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
            name: {
                en: 'Flow deviation (%)',
                de: 'Durchflussabweichung (%)',
            },
            desc: {
                en: 'Current deviation of flow from the average value',
                de: 'Aktuelle Abweichung des Durchflusses vom Durchschnittswert',
            },
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
    // Toleranzbereich für Normalbereichserkennung (%)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.tolerance_percent', {
        type: 'state',
        common: {
            name: {
                en: 'Tolerance for normal range detection (%)',
                de: 'Toleranz fuer Normalbereichserkennung (%)',
            },
            desc: {
                en: 'Deviation still considered normal before a warning is triggered',
                de: 'Abweichung, die noch als normal gilt, bevor eine Warnung ausgeloest wird',
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
    const existingTolerance = await adapter.getStateAsync('pump.learning.tolerance_percent');
    if (existingTolerance === null || existingTolerance.val === null || existingTolerance.val === undefined) {
        await adapter.setStateAsync('pump.learning.tolerance_percent', { val: 20, ack: true });
    }

    // ------------------------------------------------------
    // Textbewertung (Status)
    // ------------------------------------------------------
    await adapter.setObjectNotExistsAsync('pump.learning.status_text', {
        type: 'state',
        common: {
            name: {
                en: 'Status assessment',
                de: 'Statusbewertung',
            },
            desc: {
                en: 'Text-based assessment of the current pump behavior (e.g. "within normal range", "noticeably low")',
                de: 'Textbasierte Bewertung des aktuellen Pumpenverhaltens (z. B. "im Normalbereich", "auffaellig niedrig")',
            },
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
            name: {
                en: 'Total number of learning cycles',
                de: 'Gesamtanzahl der Lernzyklen',
            },
            desc: {
                en: 'Number of pump runs included in the learning calculation',
                de: 'Anzahl der Pumpenlaeufe, die in die Lernberechnung einbezogen wurden',
            },
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
    adapter.log.debug('[pumpStates3] Learning states created or verified.');
}

module.exports = {
    createPumpStates3,
};

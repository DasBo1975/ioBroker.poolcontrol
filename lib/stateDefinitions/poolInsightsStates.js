'use strict';

/**
 * poolInsightsStates.js
 * ---------------------
 * Creates states for analytics.insights.pool.
 *
 * Scope:
 * - Rule-based overall pool insights
 * - Read-only analysis output
 * - Optional handoff to speech.queue handled by the helper
 * - No automatic control, no dosing, no pump or actuator switching
 */

async function createChannel(adapter, id, name) {
    await adapter.setObjectNotExistsAsync(id, {
        type: 'channel',
        common: { name },
        native: {},
    });
}

async function createState(adapter, id, common) {
    await adapter.setObjectNotExistsAsync(id, {
        type: 'state',
        common,
        native: {},
    });

    if (!Object.prototype.hasOwnProperty.call(common, 'def')) {
        return;
    }

    const existing = await adapter.getStateAsync(id);
    if (!existing || existing.val === null || existing.val === undefined) {
        await adapter.setStateAsync(id, { val: common.def, ack: true });
    }
}

/**
 * @param {import('iobroker').Adapter} adapter - ioBroker adapter instance
 * @returns {Promise<void>}
 */
async function createPoolInsightsStates(adapter) {
    adapter.log.debug('[poolInsightsStates] Initialization started');

    await createChannel(adapter, 'analytics', {
        en: 'Analytics & insights (statistics, history, reports)',
        de: 'Analysen & Statistiken (Verlauf, Berichte)',
    });

    await createChannel(adapter, 'analytics.insights', {
        en: 'Insights & analysis',
        de: 'Erkenntnisse & Analysen',
    });

    await createChannel(adapter, 'analytics.insights.pool', {
        en: 'Pool insights (overall analysis)',
        de: 'Pool Insights (Gesamtanalyse)',
    });

    await createChannel(adapter, 'analytics.insights.pool.debug', {
        en: 'Debug',
        de: 'Debug',
    });

    const states = [
        {
            id: 'analytics.insights.pool.enabled',
            common: {
                name: {
                    en: 'Enable pool insights',
                    de: 'Pool Insights aktivieren',
                },
                desc: {
                    en: 'Enables the rule-based overall pool analysis. No automatic control is performed.',
                    de: 'Aktiviert die regelbasierte Pool-Gesamtanalyse. Es erfolgt keine automatische Steuerung.',
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true,
            },
        },
        {
            id: 'analytics.insights.pool.schedule_time',
            common: {
                name: {
                    en: 'Daily pool insights analysis time',
                    de: 'Uhrzeit der täglichen Pool-Insights-Analyse',
                },
                desc: {
                    en: 'Time for the daily automatic pool insights analysis in HH:mm format.',
                    de: 'Uhrzeit für die tägliche automatische Pool-Insights-Analyse im Format HH:mm.',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '20:00',
                persist: true,
            },
        },
        {
            id: 'analytics.insights.pool.manual_trigger',
            common: {
                name: {
                    en: 'Run pool insights now',
                    de: 'Pool Insights jetzt ausführen',
                },
                desc: {
                    en: 'Starts a manual pool insights analysis and is reset afterwards.',
                    de: 'Startet eine manuelle Pool-Insights-Analyse und wird danach zurückgesetzt.',
                },
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: false,
            },
        },
        {
            id: 'analytics.insights.pool.send_to_speech_queue',
            common: {
                name: {
                    en: 'Send summary to speech queue',
                    de: 'Zusammenfassung an Speech Queue senden',
                },
                desc: {
                    en: 'Allows pool insights to optionally write the summary to speech.queue.',
                    de: 'Erlaubt Pool Insights optional, die Zusammenfassung an speech.queue zu schreiben.',
                },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                persist: true,
            },
        },
        {
            id: 'analytics.insights.pool.status',
            common: {
                name: {
                    en: 'Status',
                    de: 'Status',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'disabled',
                states: {
                    disabled: 'disabled',
                    idle: 'idle',
                    scheduled: 'scheduled',
                    running: 'running',
                    completed: 'completed',
                    error: 'error',
                },
            },
        },
        {
            id: 'analytics.insights.pool.level',
            common: {
                name: {
                    en: 'Level',
                    de: 'Stufe',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'none',
                states: {
                    none: 'none',
                    ok: 'ok',
                    info: 'info',
                    warning: 'warning',
                },
            },
        },
        {
            id: 'analytics.insights.pool.summary_text',
            common: {
                name: {
                    en: 'Summary text',
                    de: 'Zusammenfassungstext',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
        },
        {
            id: 'analytics.insights.pool.summary_html',
            common: {
                name: {
                    en: 'Summary HTML',
                    de: 'Zusammenfassung HTML',
                },
                type: 'string',
                role: 'html',
                read: true,
                write: false,
                def: '',
            },
        },
        {
            id: 'analytics.insights.pool.summary_json',
            common: {
                name: {
                    en: 'Summary JSON',
                    de: 'Zusammenfassung JSON',
                },
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '{}',
            },
        },
        {
            id: 'analytics.insights.pool.observations_json',
            common: {
                name: {
                    en: 'Observations JSON',
                    de: 'Beobachtungen JSON',
                },
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '[]',
            },
        },
        {
            id: 'analytics.insights.pool.recommendations_json',
            common: {
                name: {
                    en: 'Recommendations JSON',
                    de: 'Empfehlungen JSON',
                },
                type: 'string',
                role: 'json',
                read: true,
                write: false,
                def: '[]',
            },
        },
        {
            id: 'analytics.insights.pool.last_update',
            common: {
                name: {
                    en: 'Last update',
                    de: 'Letzte Aktualisierung',
                },
                type: 'string',
                role: 'date',
                read: true,
                write: false,
                def: '',
            },
        },
        {
            id: 'analytics.insights.pool.last_speech_at',
            common: {
                name: {
                    en: 'Last speech output',
                    de: 'Letzte Sprachausgabe',
                },
                type: 'string',
                role: 'date',
                read: true,
                write: false,
                def: '',
            },
        },
        {
            id: 'analytics.insights.pool.debug.last_reason',
            common: {
                name: {
                    en: 'Last analysis reason',
                    de: 'Letzter Analysegrund',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: '',
            },
        },
    ];

    for (const state of states) {
        await createState(adapter, state.id, state.common);
    }

    adapter.log.debug('[poolInsightsStates] Initialization completed');
}

module.exports = {
    createPoolInsightsStates,
};

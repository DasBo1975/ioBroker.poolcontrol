'use strict';

/**
 * migrationHelper
 * --------------------------------------------------
 * Führt nachträgliche Struktur- oder State-Anpassungen
 * für bestehende Installationen durch.
 *
 * - Wird beim Adapterstart einmalig ausgeführt.
 * - Korrigiert veraltete Definitionen (z. B. Schreibrechte, persist-Flags, etc.)
 *
 * Version: 1.0.3
 */

const CHEMISTRY_TIMESTAMP_STATE_IDS = Object.freeze([
    'chemistry.ph.input.last_value_at',
    'chemistry.ph.input.previous_value_at',
    'chemistry.ph.input.last_valid_value_at',
    'chemistry.ph.history.oldest_sample_at',
    'chemistry.ph.history.newest_sample_at',
    'chemistry.ph.trend.reference_24h_at',
    'chemistry.ph.trend.reference_7d_at',
    'chemistry.ph.trend.reference_30d_at',
    'chemistry.ph.debug.last_update',
    'chemistry.orp.input.last_value_at',
    'chemistry.orp.input.previous_value_at',
    'chemistry.orp.input.last_valid_value_at',
    'chemistry.orp.history.oldest_sample_at',
    'chemistry.orp.history.newest_sample_at',
    'chemistry.orp.trend.reference_24h_at',
    'chemistry.orp.trend.reference_7d_at',
    'chemistry.orp.trend.reference_30d_at',
    'chemistry.orp.debug.last_update',
    'chemistry.tds.input.last_value_at',
    'chemistry.tds.input.previous_value_at',
    'chemistry.tds.input.last_valid_value_at',
    'chemistry.tds.history.oldest_sample_at',
    'chemistry.tds.history.newest_sample_at',
    'chemistry.tds.trend.reference_24h_at',
    'chemistry.tds.trend.reference_7d_at',
    'chemistry.tds.trend.reference_30d_at',
    'chemistry.tds.debug.last_update',
    'chemistry.tds.reference.initial_value_at',
]);

/**
 * Parse the exact local date format written by PoolControl before v1.3.18.
 *
 * @param {string} value - Legacy timestamp value.
 * @returns {number | null} Unix timestamp in milliseconds, or null when invalid.
 */
function parseLegacyChemistryTimestamp(value) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
        return null;
    }

    const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const date = new Date(year, month - 1, day, hour, minute, second);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute ||
        date.getSeconds() !== second
    ) {
        return null;
    }

    return date.getTime();
}

const migrationHelper = /** @satisfies {import('../types/poolcontrol-adapter').MigrationHelper} */ ({
    _adapter: null,

    /**
     * Liefert die initialisierte ioBroker-Adapterinstanz.
     *
     * @returns Initialisierte Adapterinstanz.
     */
    get adapter() {
        if (!this._adapter) {
            throw new Error('migrationHelper used before init()');
        }

        return this._adapter;
    },

    /**
     * Initialisiert den Migration-Helper.
     * Wird einmalig beim Adapterstart aufgerufen.
     *
     * @param {ioBroker.Adapter} adapter - Die aktive Adapterinstanz
     */
    async init(adapter) {
        this._adapter = adapter;
        this.adapter.log.info('[migrationHelper] Starting migration check ...');

        try {
            // ------------------------------------------------------
            // Hier alle Migrationsroutinen nacheinander aufrufen
            // ------------------------------------------------------
            await this._fixSpeechQueue();
            await this._fixSolarWarnActivePersist();
            await this._fixPumpModeStates(); // NEU: PV-Automatik hinzufügen
            await this._fixChemistryTimestampStates();
            await this._removeInvalidResetButtons(); // NEU: Entfernt Week/Month-Reset-Buttons

            this.adapter.log.debug('[migrationHelper] Migration checks completed.');
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Error during migration check: ${err.message}`);
        }

        this.adapter.log.info('[migrationHelper] Migration helper finished.');
    },

    // ------------------------------------------------------
    // Migration: Schreibrecht für speech.queue korrigieren
    // ------------------------------------------------------
    async _fixSpeechQueue() {
        const id = 'speech.queue';
        try {
            const obj = await this.adapter.getObjectAsync(id);
            if (!obj) {
                return;
            }

            const isReadOnly = obj.common?.write === false;
            if (isReadOnly) {
                this.adapter.log.info(`[migrationHelper] Updating write permission for ${id} → write:true`);
                await this.adapter.extendObjectAsync(id, {
                    common: {
                        write: true,
                        desc: 'Nur intern durch den Adapter beschreibbar (nicht manuell ändern!)',
                    },
                });
            }
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Error while checking ${id}: ${err.message}`);
        }
    },

    // ------------------------------------------------------
    // Migration: persist-Flag für solar.warn_active ergänzen
    // ------------------------------------------------------
    async _fixSolarWarnActivePersist() {
        const id = 'solar.warn_active';
        try {
            const obj = await this.adapter.getObjectAsync(id);
            if (!obj) {
                return;
            }

            const hasPersist = obj.common?.persist === true;
            if (!hasPersist) {
                this.adapter.log.info(`[migrationHelper] Adding persist:true for ${id}`);
                await this.adapter.extendObjectAsync(id, {
                    common: {
                        persist: true,
                        desc: `${obj.common?.desc || ''} (automatisch per Migration persistiert)`,
                    },
                });
            }
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Error while checking ${id}: ${err.message}`);
        }
    },

    // ------------------------------------------------------
    // Migration: Ergänze neuen Pumpenmodus "Automatik (PV)"
    // ------------------------------------------------------
    async _fixPumpModeStates() {
        const id = 'pump.mode';
        try {
            const obj = await this.adapter.getObjectAsync(id);
            if (!obj) {
                return;
            }

            const states = obj.common?.states || {};
            if (!states.auto_pv) {
                states.auto_pv = 'Automatik (PV)';
                this.adapter.log.info('[migrationHelper] Adding new mode "Automatic (PV)" to pump.mode');
                await this.adapter.extendObjectAsync(id, { common: { states } });
            }
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Error while checking ${id}: ${err.message}`);
        }
    },

    // ------------------------------------------------------
    // Migration: Chemistry-Zeitstempel aus v1.3.17 und aelter
    // ------------------------------------------------------
    async _fixChemistryTimestampStates() {
        for (const id of CHEMISTRY_TIMESTAMP_STATE_IDS) {
            try {
                const obj = await this.adapter.getObjectAsync(id);

                if (!obj) {
                    this.adapter.log.debug(
                        `[migrationHelper] Chemistry timestamp state ${id} does not exist; skipping.`,
                    );
                    continue;
                }

                const type = obj.common?.type;
                const role = obj.common?.role;

                if (type === 'number' && role === 'value.time') {
                    continue;
                }

                if (type !== 'string' || role !== 'value.time') {
                    this.adapter.log.warn(
                        `[migrationHelper] Chemistry timestamp state ${id} has unexpected type/role (${type}/${role}); skipping.`,
                    );
                    continue;
                }

                const state = await this.adapter.getStateAsync(id);
                const value = state?.val;
                let valueToWrite;
                let unknownValue = false;

                if (typeof value === 'number' && Number.isFinite(value)) {
                    // The current producer may already have written a numeric value under the legacy object.
                } else if (value === '' || value === null || value === undefined) {
                    valueToWrite = 0;
                } else if (typeof value === 'string') {
                    const parsedValue = parseLegacyChemistryTimestamp(value);
                    if (parsedValue === null) {
                        unknownValue = true;
                    } else {
                        valueToWrite = parsedValue;
                    }
                } else {
                    unknownValue = true;
                }

                await this.adapter.extendObjectAsync(id, {
                    common: {
                        type: 'number',
                        def: 0,
                    },
                });

                if (valueToWrite !== undefined) {
                    await this.adapter.setStateChangedAsync(id, { val: valueToWrite, ack: true });
                } else if (unknownValue) {
                    this.adapter.log.warn(
                        `[migrationHelper] Preserving unknown legacy Chemistry timestamp value for ${id}.`,
                    );
                }

                this.adapter.log.info(`[migrationHelper] Updated Chemistry timestamp metadata for ${id}.`);
            } catch (err) {
                this.adapter.log.warn(
                    `[migrationHelper] Error while migrating Chemistry timestamp ${id}: ${err.message}`,
                );
            }
        }
    },

    // FIX: Entferne versehentlich angelegte Reset-Buttons aus Wochen- und Monatsstatistik
    async _removeInvalidResetButtons() {
        try {
            const allObjs = await this.adapter.getAdapterObjectsAsync();
            const keys = Object.keys(allObjs);
            let removed = 0;

            for (const id of keys) {
                if (
                    (id.startsWith('analytics.statistics.temperature.week.') ||
                        id.startsWith('analytics.statistics.temperature.month.')) &&
                    id.endsWith('.reset_today')
                ) {
                    try {
                        // Erst Statewert entfernen
                        await this.adapter.delStateAsync(id);
                    } catch {
                        this.adapter.log.debug(`[migrationHelper] No state value found for ${id} (skipping).`);
                    }

                    // Danach Objekt löschen (auch wenn persist=true)
                    try {
                        await this.adapter.delObjectAsync(id, { recursive: false });
                        this.adapter.log.info(`[migrationHelper] Removed obsolete reset button: ${id}`);
                        removed++;
                    } catch (err) {
                        this.adapter.log.warn(`[migrationHelper] Could not delete ${id}: ${err.message}`);
                    }
                }
            }

            if (removed === 0) {
                this.adapter.log.debug('[migrationHelper] No old reset buttons found.');
            } else {
                this.adapter.log.info(`[migrationHelper] Removed ${removed} old reset buttons in total.`);
            }
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Error while removing old reset buttons: ${err.message}`);
        }
    },
});

module.exports = migrationHelper;

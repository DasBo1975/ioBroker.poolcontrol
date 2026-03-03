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

const migrationHelper = {
    adapter: null,

    /**
     * Initialisiert den Migration-Helper.
     * Wird einmalig beim Adapterstart aufgerufen.
     *
     * @param {ioBroker.Adapter} adapter - Die aktive Adapterinstanz
     */
    async init(adapter) {
        this.adapter = adapter;
        this.adapter.log.info('[migrationHelper] Starting migration check ...');

        try {
            // ------------------------------------------------------
            // Hier alle Migrationsroutinen nacheinander aufrufen
            // ------------------------------------------------------
            await this._fixSpeechQueue();
            await this._fixSolarWarnActivePersist();
            await this._fixPumpModeStates(); // NEU: PV-Automatik hinzufügen
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
};

module.exports = migrationHelper;

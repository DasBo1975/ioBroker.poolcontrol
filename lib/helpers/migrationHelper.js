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
 * Version: 1.0.1
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
        this.adapter.log.info('[migrationHelper] Starte Migration-Check ...');

        try {
            // ------------------------------------------------------
            // Hier alle Migrationsroutinen nacheinander aufrufen
            // ------------------------------------------------------
            await this._fixSpeechQueue();
            await this._fixSolarWarnActivePersist();

            // Weitere Routinen folgen hier später:
            // await this._ensurePumpReason();
            // await this._cleanupOldStates();

            this.adapter.log.debug('[migrationHelper] Migration-Checks abgeschlossen.');
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Fehler beim Migration-Check: ${err.message}`);
        }

        this.adapter.log.info('[migrationHelper] Migration-Helper beendet.');
    },

    // ------------------------------------------------------
    // Migration: Schreibrecht für speech.queue korrigieren
    // ------------------------------------------------------

    /**
     * Prüft und korrigiert den State "speech.queue", falls er noch write:false gesetzt hat.
     * Dadurch verschwinden Warnungen beim Schreiben (Read-only state ... written without ack).
     */
    async _fixSpeechQueue() {
        const id = 'speech.queue';
        try {
            const obj = await this.adapter.getObjectAsync(id);
            if (!obj) {
                this.adapter.log.debug(`[migrationHelper] ${id} existiert nicht – keine Anpassung nötig.`);
                return;
            }

            const isReadOnly = obj.common?.write === false;
            if (isReadOnly) {
                this.adapter.log.info(`[migrationHelper] Aktualisiere Schreibrecht für ${id} → write:true`);
                await this.adapter.extendObjectAsync(id, {
                    common: {
                        write: true,
                        desc: 'Nur intern durch den Adapter beschreibbar (nicht manuell ändern!)',
                    },
                });
            } else {
                this.adapter.log.debug(`[migrationHelper] ${id} ist bereits korrekt konfiguriert.`);
            }
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Fehler bei Prüfung von ${id}: ${err.message}`);
        }
    },

    // ------------------------------------------------------
    // Migration: persist-Flag für solar.warn_active ergänzen
    // ------------------------------------------------------

    /**
     * Ergänzt persist:true bei solar.warn_active,
     * damit die Einstellung (Warnfunktion aktivieren/deaktivieren)
     * nach einem Neustart erhalten bleibt.
     */
    async _fixSolarWarnActivePersist() {
        const id = 'solar.warn_active';
        try {
            const obj = await this.adapter.getObjectAsync(id);
            if (!obj) {
                this.adapter.log.debug(`[migrationHelper] ${id} existiert nicht – keine Anpassung nötig.`);
                return;
            }

            const hasPersist = obj.common?.persist === true;
            if (!hasPersist) {
                this.adapter.log.info(`[migrationHelper] Ergänze persist:true für ${id}`);
                await this.adapter.extendObjectAsync(id, {
                    common: {
                        persist: true,
                        desc: `${obj.common?.desc || ''} (automatisch per Migration persistiert)`,
                    },
                });
            } else {
                this.adapter.log.debug(`[migrationHelper] ${id} ist bereits mit persist:true versehen.`);
            }
        } catch (err) {
            this.adapter.log.warn(`[migrationHelper] Fehler bei Prüfung von ${id}: ${err.message}`);
        }
    },
};

module.exports = migrationHelper;

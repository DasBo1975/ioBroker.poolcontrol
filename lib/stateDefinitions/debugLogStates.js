'use strict';

/**
 * Legt alle States für den Diagnosebereich an:
 * - SystemCheck.debug_logs.target_area   → überwachten Bereich auswählen
 * - SystemCheck.debug_logs.log           → fortlaufendes Log (Text)
 * - SystemCheck.debug_logs.clear         → löscht das Log
 *
 * @param {import('iobroker').Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createDebugLogStates(adapter) {
    try {
        // Oberordner SystemCheck (alphabetisch ganz unten)
        await adapter.setObjectNotExistsAsync('SystemCheck', {
            type: 'channel',
            common: {
                name: 'SystemCheck (Diagnose und Tools)',
                desc: 'Enthält interne Diagnose- und Protokollierungsfunktionen des Adapters.',
            },
            native: {},
        });

        // Unterkanal für Debug-Logs
        await adapter.setObjectNotExistsAsync('SystemCheck.debug_logs', {
            type: 'channel',
            common: {
                name: 'Debug-Logs (Test & Diagnose)',
                desc: 'Protokolliert auffällige oder häufige Zustandsänderungen innerhalb der Instanz.',
            },
            native: {},
        });

        // --- Dynamischer Scan aller Objekte der Instanz ---
        const objects = await adapter.getObjectListAsync({
            startkey: `${adapter.namespace}.`,
            endkey: `${adapter.namespace}.\u9999`,
        });

        const areas = new Set();

        for (const row of objects.rows) {
            const idParts = row.id.split('.');
            // Beispiel: poolcontrol.0.control.backwash.active
            if (idParts.length >= 3) {
                const base = idParts[2];
                const sub = idParts[3];

                // Nur Bereiche, keine States
                // (also keine Objekte mit mehr als 4 Punkten oder zz_)
                if (!base.startsWith('zz_')) {
                    // Hauptbereiche immer aufnehmen
                    areas.add(base);

                    // Unterbereiche nur, wenn sie selbst wieder Unterpunkte haben
                    // -> prüft, ob es States gibt, die mit base.sub beginnen
                    const hasSubEntries = objects.rows.some(r =>
                        r.id.startsWith(`${adapter.namespace}.${base}.${sub}.`),
                    );
                    if (hasSubEntries && sub && !sub.startsWith('zz_')) {
                        areas.add(`${base}.${sub}`);
                    }
                }
            }
        }

        // Alphabetisch sortieren und "none" hinzufügen
        const availableAreas = ['none', ...Array.from(areas).sort()];

        // Bereichsauswahl (target_area)
        await adapter.setObjectNotExistsAsync('SystemCheck.debug_logs.target_area', {
            type: 'state',
            common: {
                name: 'Überwachungsbereich',
                desc: 'Wähle, welcher Bereich der Instanz überwacht werden soll (z. B. pump, solar, control.backwash).',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                states: availableAreas.reduce((obj, v) => ((obj[v] = v), obj), {}),
                def: 'none',
            },
            native: {},
        });
        await adapter.setStateAsync('SystemCheck.debug_logs.target_area', { val: 'none', ack: true });

        // Fortlaufendes Log
        await adapter.setObjectNotExistsAsync('SystemCheck.debug_logs.log', {
            type: 'state',
            common: {
                name: 'Debug-Logtext',
                desc: 'Fortlaufendes Protokoll des ausgewählten Bereichs.',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
            },
            native: {},
        });
        await adapter.setStateAsync('SystemCheck.debug_logs.log', { val: '', ack: true });

        // Clear-Button
        await adapter.setObjectNotExistsAsync('SystemCheck.debug_logs.clear', {
            type: 'state',
            common: {
                name: 'Log löschen',
                desc: 'Löscht das fortlaufende Log im Kanal SystemCheck.debug_logs.',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await adapter.setStateAsync('SystemCheck.debug_logs.clear', { val: false, ack: true });

        adapter.log.debug(`[debugLogStates] Debug-Log-States erfolgreich angelegt`);
        adapter.log.debug(`[debugLogStates] Verfügbare Bereiche: ${availableAreas.join(', ')}`);
    } catch (err) {
        adapter.log.error(`[debugLogStates] Fehler beim Erstellen der States: ${err.message}`);
    }
}

module.exports = { createDebugLogStates };

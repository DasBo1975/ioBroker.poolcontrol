'use strict';

/**
 * hardwareHelper.js
 * -------------------------------------------------------------
 * Zuständig für die Verwaltung externer ESPHome-Boxen (TempBox, TasterBox usw.)
 * - Reagiert nur auf aktivierte Checkboxen aus der Instanz-Config
 * - Sucht im ioBroker-Objektbaum unter esphome.0.* nach erkannten Boxen
 * - Führt Handshake durch (z. B. PC-TB-01 → AD-PC-TB-01-OK)
 * - Pflegt States unter hardware.*, inkl. Status- und Sammelmeldungen
 * - Überprüft 2× täglich die Verbindung und bei Adapterstart sofort
 * -------------------------------------------------------------
 */

const CHECK_INTERVAL_HOURS = 12; // alle 12 Stunden automatische Prüfung

const BOX_TYPES = {
    tempbox: { code: 'PC-TB-', label: 'Temperatur-Box (ESP32)' },
    tasterbox: { code: 'PC-BT-', label: 'Taster-Box (ESP32)' },
    // später: pressurebox (PC-PB-), levelbox (PC-LB-) usw.
};

/**
 * @file hardwareHelper.js
 * @description
 * Verwaltet externe ESPHome-Boxen (z. B. TempBox, TasterBox).
 * Reagiert auf aktivierte Checkboxen in der Instanz-Konfiguration,
 * sucht im ioBroker nach den Boxen, führt den Handshake durch
 * und aktualisiert regelmäßig den Status.
 */

/**
 * @file hardwareHelper.js
 * @description
 * Verwaltet externe ESPHome-Boxen (TempBox, TasterBox usw.).
 * Reagiert auf aktivierte Checkboxen aus der Instanz-Konfiguration,
 * sucht im ioBroker nach den Boxen, führt den Handshake durch
 * und aktualisiert regelmäßig den Status.
 */
class HardwareHelper {
    /**
     * Erstellt eine neue HardwareHelper-Instanz.
     *
     * @param {ioBroker.Adapter} adapter - Aktive ioBroker-Adapterinstanz
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.activeBoxes = {};
        this.scanTimer = null;
    }

    /**
     * Initialisiert den HardwareHelper.
     * Prüft aktivierte Boxen und startet ggf. die Boxensuche.
     *
     * @returns {Promise<void>}
     */
    async init() {
        const { adapter } = this;

        adapter.log.info('[hardwareHelper] Initialisierung gestartet.');

        // Prüfe aktivierte Boxen aus der Instanz-Konfiguration
        this.activeBoxes.tempbox = adapter.config.use_tempbox || false;
        this.activeBoxes.tasterbox = adapter.config.use_tasterbox || false;

        // Wenn keine Box aktiv → Helper bleibt inaktiv
        if (!this.activeBoxes.tempbox && !this.activeBoxes.tasterbox) {
            adapter.log.info('[hardwareHelper] Keine aktiven Boxen – Helper bleibt inaktiv.');
            await adapter.setStateAsync('hardware.text_message', { val: 'Keine aktiven Boxen', ack: true });
            return;
        }

        // Initialer Startscan bei Adapterstart
        await this._performFullScan();

        // Zyklische Wiederholungsprüfung (alle 12h)
        const intervalMs = CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
        this.scanTimer = setInterval(() => {
            this._performFullScan();
        }, intervalMs);

        adapter.log.info(`[hardwareHelper] Regelmäßige Prüfung alle ${CHECK_INTERVAL_HOURS} Stunden aktiviert.`);
    }

    /**
     * Führt eine vollständige Prüfung aller aktivierten Boxen durch
     */
    async _performFullScan() {
        const { adapter } = this;

        adapter.log.debug('[hardwareHelper] Starte vollständigen Hardware-Scan...');
        await adapter.setStateAsync('hardware.scan_running', { val: true, ack: true });
        await adapter.setStateAsync('hardware.last_scan', { val: new Date().toISOString(), ack: true });

        let messageParts = [];

        for (const [boxId, isEnabled] of Object.entries(this.activeBoxes)) {
            if (isEnabled) {
                const success = await this._searchAndHandshake(boxId);
                messageParts.push(`${BOX_TYPES[boxId].label}: ${success ? '✅ verbunden' : '⚠️ nicht gefunden'}`);
            } else {
                // Box deaktiviert
                await adapter.setStateAsync(`hardware.${boxId}.handshake.state`, { val: 'disabled', ack: true });
                await adapter.setStateAsync(`hardware.${boxId}.status.connected`, { val: false, ack: true });
                messageParts.push(`${BOX_TYPES[boxId].label}: ❌ deaktiviert`);
            }
        }

        const textMessage = messageParts.join('  |  ');
        await adapter.setStateAsync('hardware.text_message', { val: textMessage, ack: true });

        adapter.log.info(`[hardwareHelper] Scan abgeschlossen → ${textMessage}`);
        await adapter.setStateAsync('hardware.scan_running', { val: false, ack: true });
    }

    /**
     * Sucht nach einer bestimmten Box in esphome.0.* und führt Handshake aus
     *
     * @param {string} boxId - interne Kennung, z.B. "tempbox"
     * @returns {Promise<boolean>} true, wenn erfolgreich gefunden
     */
    async _searchAndHandshake(boxId) {
        const { adapter } = this;
        const code = BOX_TYPES[boxId].code;

        adapter.log.debug(`[hardwareHelper] Suche nach ${BOX_TYPES[boxId].label} (${code}) ...`);

        try {
            const objects = await adapter.getObjectViewAsync('system', 'state', {
                startkey: 'esphome.0.',
                endkey: 'esphome.0.\u9999',
            });

            let foundState = null;
            let foundBase = null;

            // Durchsuche alle States im ESPHome-Adapter
            for (const obj of objects.rows) {
                if (!obj?.id?.includes('state')) {
                    continue;
                }
                const state = await adapter.getStateAsync(obj.id);
                if (!state || typeof state.val !== 'string') {
                    continue;
                }

                if (state.val.startsWith(code)) {
                    foundState = obj.id;
                    const parts = obj.id.split('.');
                    foundBase = `${parts[0]}.${parts[1]}.${parts[2]}`;
                    break;
                }
            }

            if (!foundState || !foundBase) {
                adapter.log.debug(`[hardwareHelper] ${BOX_TYPES[boxId].label} nicht gefunden.`);
                await adapter.setStateAsync(`hardware.${boxId}.handshake.state`, { val: 'error', ack: true });
                await adapter.setStateAsync(`hardware.${boxId}.status.connected`, { val: false, ack: true });
                return false;
            }

            // Handshake erkannt → antworten
            const handshakeValue = await adapter.getStateAsync(foundState);
            const confirm = `AD-${handshakeValue.val}-OK`;

            let confirmPath = foundState.replace(/\.state$/, '.handshake_confirm');

            // FIX: Automatische Suche nach Handshake-Bestätigung-State (namensbasiert)
            let confirmObj = await adapter.getObjectAsync(confirmPath);
            if (!confirmObj) {
                const alt = objects.rows.find(
                    o =>
                        o.id.startsWith(foundBase) &&
                        o.id.includes('TextSensor') &&
                        o.value?.common?.name?.toLowerCase().includes('handshake-best'),
                );
                if (alt) {
                    confirmPath = alt.id;
                    confirmObj = await adapter.getObjectAsync(confirmPath);
                    adapter.log.debug(`[hardwareHelper] Alternativen Handshake-State gefunden: ${confirmPath}`);
                }
            }

            if (confirmObj) {
                await adapter.setStateAsync(confirmPath, { val: confirm, ack: true });
                adapter.log.info(
                    `[hardwareHelper] ${BOX_TYPES[boxId].label}: Handshake bestätigt unter ${confirmPath}`,
                );
            } else {
                adapter.log.warn(`[hardwareHelper] ${BOX_TYPES[boxId].label}: Kein Handshake-State gefunden.`);
            }

            // Status aktualisieren
            await adapter.setStateAsync(`hardware.${boxId}.source_path`, { val: foundBase, ack: true });
            await adapter.setStateAsync(`hardware.${boxId}.handshake.request`, { val: handshakeValue.val, ack: true });
            await adapter.setStateAsync(`hardware.${boxId}.handshake.confirm`, { val: confirm, ack: true });
            await adapter.setStateAsync(`hardware.${boxId}.handshake.state`, { val: 'ok', ack: true });
            await adapter.setStateAsync(`hardware.${boxId}.status.connected`, { val: true, ack: true });
            await adapter.setStateAsync(`hardware.${boxId}.status.last_seen`, {
                val: new Date().toISOString(),
                ack: true,
            });

            // Geräteübersicht aufbauen (alle Sensoren/TextSensoren)
            const deviceMap = objects.rows
                .filter(r => r.id.startsWith(foundBase))
                .map(r => ({ id: r.id, name: r.value?.common?.name || 'unbekannt' }));
            await adapter.setStateAsync(`hardware.${boxId}.device_map`, {
                val: JSON.stringify(deviceMap, null, 2),
                ack: true,
            });

            adapter.log.info(`[hardwareHelper] ${BOX_TYPES[boxId].label} erfolgreich erkannt unter ${foundBase}.`);
            return true;
        } catch (err) {
            adapter.log.error(`[hardwareHelper] Fehler bei der Suche nach ${BOX_TYPES[boxId].label}: ${err.message}`);
            return false;
        }
    }

    /**
     * Stoppt alle laufenden Timer (z.B. beim Adapter-Stop)
     */
    stop() {
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
        this.adapter.log.debug('[hardwareHelper] Gestoppt.');
    }
}

module.exports = {
    HardwareHelper,
};

'use strict';

/**
 * Hardware-Helper – Temperatur-Box (ESP32)
 * Verwaltet Handshake, Verbindung, Status-Überwachung und Device-Map-Aufbau
 */

class HardwareHelper {
    constructor(adapter) {
        this.adapter = adapter;
        this.activeBoxes = { tempbox: true }; // nur TempBox
    }

    async init() {
        const { adapter } = this;
        adapter.log.info('[hardwareHelper] Initialisierung gestartet.');

        await this._performFullScan();

        // regelmäßige Prüfung alle 12 h
        this._scheduleRegularScan();
    }

    _scheduleRegularScan() {
        const { adapter } = this;
        setInterval(
            async () => {
                adapter.log.info('[hardwareHelper] Starte regelmäßigen 12-h-Scan.');
                await this._performFullScan();
            },
            12 * 60 * 60 * 1000,
        );
        adapter.log.info('[hardwareHelper] Regelmäßige Prüfung alle 12 Stunden aktiviert.');
    }

    async _performFullScan() {
        const { adapter } = this;
        let textMessage = '';

        // nur TempBox prüfen
        const ok = await this._searchAndHandshake('tempbox');
        textMessage += `Temperatur-Box (ESP32): ${ok ? '✅ verbunden' : '⚠️ nicht gefunden'} | `;

        adapter.log.info(`[hardwareHelper] Scan abgeschlossen → ${textMessage}`);
        await adapter.setStateAsync('hardware.text_message', { val: textMessage, ack: true });
        await adapter.setStateAsync('hardware.scan_running', { val: false, ack: true });
    }

    /**
     * sucht nach der Temperatur-Box und führt Handshake aus
     *
     * @param {string} boxId - interne Kennung, z. B. "tempbox"
     * @returns {Promise<boolean>} true, wenn erfolgreich gefunden
     */
    async _searchAndHandshake(boxId) {
        const { adapter } = this;
        const BOX_TYPES = {
            tempbox: { label: 'Temperatur-Box (ESP32)', code: 'PC-TB-' },
        };
        const code = BOX_TYPES[boxId].code;

        // Pfad aus Instanz-Config lesen
        let manualPath = adapter.config.tempbox_statepath || '';

        if (manualPath) {
            adapter.log.info(
                `[hardwareHelper] Verwende Pfad aus Instanzkonfiguration für ${BOX_TYPES[boxId].label}: ${manualPath}`,
            );

            // eventbasierte Reaktion auf den angegebenen Pfad
            adapter.subscribeForeignStates(manualPath);

            adapter.on('stateChange', async (id, state) => {
                if (id === manualPath && state && typeof state.val === 'string' && state.val.startsWith(code)) {
                    const handshakeValue = state.val;
                    const parts = manualPath.split('.');
                    const foundBase = `${parts[0]}.${parts[1]}.${parts[2]}`;
                    const confirm = `AD-${handshakeValue}-OK`;

                    await adapter.setStateAsync(`hardware.${boxId}.source_path`, { val: foundBase, ack: true });
                    await adapter.setStateAsync(`hardware.${boxId}.handshake.request`, {
                        val: handshakeValue,
                        ack: true,
                    });
                    await adapter.setStateAsync(`hardware.${boxId}.handshake.confirm`, { val: confirm, ack: true });
                    await adapter.setStateAsync(`hardware.${boxId}.handshake.state`, { val: 'ok', ack: true });
                    await adapter.setStateAsync(`hardware.${boxId}.status.connected`, { val: true, ack: true });
                    await adapter.setStateAsync(`hardware.${boxId}.status.last_seen`, {
                        val: new Date().toISOString(),
                        ack: true,
                    });

                    adapter.log.info(`[hardwareHelper] ${BOX_TYPES[boxId].label} erkannt (eventbasiert über Pfad).`);

                    // NEU: Device-Map dynamisch über source_path aufbauen
                    try {
                        const objects = await adapter.getObjectListAsync({
                            startkey: `${foundBase}.`,
                            endkey: `${foundBase}.\u9999`,
                        });

                        const deviceMap = {};
                        for (const row of objects.rows) {
                            const id2 = row.id;
                            const name = row.value?.common?.name || '';
                            if (name.includes('Box-ID')) {
                                deviceMap.box_id_path = id2;
                            } else if (name.includes('Handshake-Bestätigung')) {
                                deviceMap.confirm_path = id2;
                            } else if (name.includes('Verbindung')) {
                                deviceMap.status_poolcontrol_path = id2;
                            } else if (name.includes('Box-Version')) {
                                deviceMap.fw_path = id2;
                            } else if (name.includes('Sensorsystem')) {
                                deviceMap.status_sensors_path = id2;
                            }
                        }

                        await adapter.setStateAsync(`hardware.${boxId}.device_map`, {
                            val: JSON.stringify(deviceMap, null, 2),
                            ack: true,
                        });

                        adapter.log.info(
                            `[hardwareHelper] Device-Map für ${BOX_TYPES[boxId].label} erstellt (${Object.keys(deviceMap).length} Einträge).`,
                        );
                    } catch (err) {
                        adapter.log.warn(
                            `[hardwareHelper] Fehler beim Aufbau der Device-Map für ${BOX_TYPES[boxId].label}: ${err.message}`,
                        );
                    }
                    // NEU-Ende
                }
            });

            return true;
        }

        // Fallback-Suche, falls kein Pfad definiert
        adapter.log.debug(`[hardwareHelper] Suche nach ${BOX_TYPES[boxId].label} (${code}) ...`);
        try {
            const objects = await adapter.getObjectListAsync({
                startkey: 'esphome.0.',
                endkey: 'esphome.0.\u9999',
            });

            for (const obj of objects.rows) {
                const id = obj?.id || '';
                const name = obj?.value?.common?.name || '';
                if (id.endsWith('.state') && typeof name === 'string' && name.includes(code)) {
                    adapter.log.info(`[hardwareHelper] ${BOX_TYPES[boxId].label} automatisch erkannt unter ${id}`);
                    return true;
                }
            }
        } catch (err) {
            adapter.log.warn(`[hardwareHelper] Fehler bei der automatischen Suche: ${err.message}`);
        }
        return false;
    }
}

module.exports = new HardwareHelper();

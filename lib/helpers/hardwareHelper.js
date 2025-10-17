'use strict';

/**
 * Hardware-Helper – Temperatur-Box (ESP32)
 * Verwaltet Handshake, Verbindung, Status-Überwachung und Device-Map-Aufbau
 */

/**
 * HardwareHelper – verwaltet die Kommunikation mit der Temperatur-Box.
 * Verantwortlich für:
 *  - Handshake-Erkennung (PC-TB-xx)
 *  - Status-Verwaltung (connected, last_seen)
 *  - Device-Map-Aufbau (Box-Pfad, Firmware, Sensorstatus)
 */
class HardwareHelper {
    /**
     * Erstellt den HardwareHelper für die TempBox.
     *
     * @param {ioBroker.Adapter} adapter - Instanz des Adapters.
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.activeBoxes = { tempbox: true }; // nur TempBox
    }

    /**
     * Initialisiert den Helper und startet den ersten Scan.
     *
     */
    async init() {
        const { adapter } = this;
        adapter.log.info('[hardwareHelper] Initialisierung gestartet.');

        // ------------------------------------------------------
        // NEU: prüfen, ob die TempBox-Checkbox aktiv ist
        // ------------------------------------------------------
        try {
            const en = await adapter.getStateAsync('hardware.tempbox.settings.enabled');
            const enabled = !!en?.val;
            if (!enabled) {
                adapter.log.info('[hardwareHelper] TempBox ist deaktiviert – kein Scan oder Timer gestartet.');
                return; // <-- bricht die Initialisierung hier sauber ab
            }
        } catch (err) {
            adapter.log.warn(`[hardwareHelper] Konnte Aktivierungsstatus nicht prüfen: ${err.message}`);
            return; // <-- bricht ebenfalls ab, falls der State noch nicht existiert
        }

        // NEU: Auf Änderungen der Aktivierungs-Checkbox reagieren
        try {
            adapter.subscribeStates('hardware.tempbox.settings.enabled'); // NEU
            adapter.on('stateChange', async (id, state) => {
                // NEU
                if (!state) {
                    return;
                } // NEU
                if (
                    id === 'poolcontrol.0.hardware.tempbox.settings.enabled' ||
                    id.endsWith('hardware.tempbox.settings.enabled')
                ) {
                    // NEU
                    const enabled = !!state.val; // NEU
                    if (!enabled) {
                        // NEU
                        await this._setBlueLed(false); // NEU
                        await adapter.setStateAsync('hardware.tempbox.status.connected', { val: false, ack: true }); // NEU
                        await adapter.setStateAsync('hardware.tempbox.handshake.state', { val: 'disabled', ack: true }); // NEU
                        adapter.log.info('[hardwareHelper] TempBox deaktiviert – Status-LED (blau) ausgeschaltet.'); // NEU
                        await adapter.setStateAsync('hardware.text_message', {
                            val: 'Temperatur-Box (ESP32): ❌ deaktiviert | ',
                            ack: true,
                        }); // NEU
                    } else {
                        // NEU
                        adapter.log.info('[hardwareHelper] TempBox aktiviert – starte Handshake-Suche.'); // NEU
                        await this._performFullScan(); // NEU
                    } // NEU
                } // NEU
            }); // NEU
        } catch (err) {
            // NEU
            adapter.log.warn(`[hardwareHelper] Konnte Checkbox-Listener nicht setzen: ${err.message}`); // NEU
        } // NEU

        await this._performFullScan();

        // regelmäßige Prüfung alle 12 h
        this._scheduleRegularScan();
    }

    /**
     * Plant die regelmäßige Überprüfung der Hardware (alle 12 Stunden)
     *
     */
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

    /**
     * Führt einen vollständigen Hardware-Scan durch (aktuell nur TempBox).
     *
     */
    async _performFullScan() {
        const { adapter } = this;
        let textMessage = '';

        // NEU: Erst prüfen, ob die Box per Checkbox aktiviert ist
        try {
            const en = await adapter.getStateAsync('hardware.tempbox.settings.enabled'); // NEU
            const enabled = !!en?.val; // NEU
            if (!enabled) {
                // NEU
                await this._setBlueLed(false); // NEU
                await adapter.setStateAsync('hardware.tempbox.status.connected', { val: false, ack: true }); // NEU
                await adapter.setStateAsync('hardware.tempbox.handshake.state', { val: 'disabled', ack: true }); // NEU
                textMessage += 'Temperatur-Box (ESP32): ❌ deaktiviert | '; // NEU
                adapter.log.info(`[hardwareHelper] Scan abgeschlossen → ${textMessage}`); // NEU
                await adapter.setStateAsync('hardware.text_message', { val: textMessage, ack: true }); // NEU
                await adapter.setStateAsync('hardware.scan_running', { val: false, ack: true }); // NEU
                return; // NEU
            }
        } catch (err) {
            // NEU
            adapter.log.warn(
                `[hardwareHelper] Fehler beim Prüfen von hardware.tempbox.settings.enabled: ${err.message}`,
            ); // NEU
        } // NEU

        // nur TempBox prüfen
        const ok = await this._searchAndHandshake('tempbox');
        textMessage += `Temperatur-Box (ESP32): ${ok ? '✅ verbunden' : '⚠️ nicht gefunden'} | `;

        // NEU: Blaue LED anhand des Ergebnisses setzen
        try {
            await this._setBlueLed(ok);
            adapter.log.info(
                `[hardwareHelper] Status-LED (blau) ${ok ? 'eingeschaltet – Verbindung aktiv' : 'ausgeschaltet – keine Verbindung'}.`,
            );
            if (!ok) {
                await adapter.setStateAsync('hardware.tempbox.status.connected', { val: false, ack: true });
                await adapter.setStateAsync('hardware.tempbox.handshake.state', { val: 'searching', ack: true });
            }
        } catch (err) {
            adapter.log.warn(`[hardwareHelper] Fehler beim Setzen der Status-LED (blau): ${err.message}`);
        }
        // NEU-Ende

        adapter.log.info(`[hardwareHelper] Scan abgeschlossen → ${textMessage}`);
        await adapter.setStateAsync('hardware.text_message', { val: textMessage, ack: true });
        await adapter.setStateAsync('hardware.scan_running', { val: false, ack: true });
    }

    /**
     * Sucht die Temperatur-Box und führt den Handshake durch.
     *
     * @param {string} boxId - Interne Kennung, z. B. "tempbox"
     * @returns {Promise<boolean>} - true, wenn erfolgreich verbunden
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

                    if (!foundBase) {
                        adapter.log.warn(
                            `[hardwareHelper] Kein gültiger Basis-Pfad für ${BOX_TYPES[boxId].label} – Device-Map übersprungen.`,
                        );
                        return;
                    }

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
                            } // ✅ diese Klammer trennt den LED-Code vom Sensorsystem-Block!

                            // ------------------------------------------------------
                            // NEU: LED-Erkennung (Grün, Blau, Rot – korrigiert auf .state)
                            // ------------------------------------------------------
                            const baseId = id2.replace(/\.white$|\.brightness$/i, '');
                            if (name.includes('LED Grün')) {
                                deviceMap.led_green_path = `${baseId}.state`;
                            } else if (name.includes('LED Blau')) {
                                deviceMap.led_blue_path = `${baseId}.state`;
                            } else if (name.includes('LED Rot')) {
                                deviceMap.led_red_path = `${baseId}.state`;
                            }
                        }

                        await adapter.setStateAsync(`hardware.${boxId}.device_map`, {
                            val: JSON.stringify(deviceMap, null, 2),
                            ack: true,
                        });

                        adapter.log.info(
                            `[hardwareHelper] Device-Map für ${BOX_TYPES[boxId].label} erstellt (${Object.keys(deviceMap).length} Einträge).`,
                        );

                        // NEU: Blaue LED sofort nach erfolgreichem Handshake einschalten
                        try {
                            if (deviceMap.led_blue_path) {
                                await adapter.setForeignStateAsync(deviceMap.led_blue_path, { val: true, ack: true });
                                adapter.log.info(
                                    `[hardwareHelper] Status-LED (blau) eingeschaltet – Verbindung aktiv.`,
                                );
                            }
                        } catch (err) {
                            adapter.log.warn(`[hardwareHelper] Fehler beim Einschalten der blauen LED: ${err.message}`);
                        }
                        // NEU-Ende
                    } catch (err) {
                        adapter.log.warn(
                            `[hardwareHelper] Fehler beim Aufbau der Device-Map für ${BOX_TYPES[boxId].label}: ${err.message}`,
                        );
                    }

                    // ------------------------------------------------------
                    // NEU: Handshake-Bestätigung an ESPHome senden
                    // ------------------------------------------------------
                    try {
                        const mapState = await adapter.getStateAsync(`hardware.${boxId}.device_map`);
                        if (mapState && mapState.val) {
                            const map = JSON.parse(mapState.val);
                            const confirmPath = map.confirm_path;

                            if (confirmPath) {
                                const confirmValue = `AD-${handshakeValue}-OK`;
                                await adapter.setForeignStateAsync(confirmPath, { val: confirmValue, ack: true });

                                await adapter.setStateAsync(`hardware.${boxId}.handshake.confirm`, {
                                    val: confirmValue,
                                    ack: true,
                                });
                                await adapter.setStateAsync(`hardware.${boxId}.handshake.state`, {
                                    val: 'ok',
                                    ack: true,
                                });

                                adapter.log.info(
                                    `[hardwareHelper] Handshake-Bestätigung an ESPHome gesendet (${confirmPath} ← ${confirmValue}).`,
                                );
                            } else {
                                adapter.log.warn(
                                    `[hardwareHelper] Kein confirm_path in Device-Map für ${BOX_TYPES[boxId].label} gefunden.`,
                                );
                            }
                        }
                    } catch (err) {
                        adapter.log.warn(
                            `[hardwareHelper] Fehler beim Senden der Handshake-Bestätigung: ${err.message}`,
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

    /**
     * Führt Aufräumarbeiten beim Adapter-Unload durch.
     * (z. B. Stoppen von Timern oder Entfernen von Listenern)
     */
    cleanup() {
        const { adapter } = this;
        adapter.log.debug('[hardwareHelper] Cleanup ausgeführt (Timer & Listener gestoppt).');
        // Später kann hier z. B. clearInterval() ergänzt werden, wenn Timer aktiv sind
    }

    /**
     * Setzt die blaue LED anhand des Verbindungsstatus.
     *
     * @param {boolean} on - true = LED ein, false = LED aus
     */
    async _setBlueLed(on) {
        const { adapter } = this; // NEU
        try {
            // NEU
            const mapState = await adapter.getStateAsync('hardware.tempbox.device_map'); // NEU
            const deviceMap = mapState?.val ? JSON.parse(mapState.val) : {}; // NEU
            const bluePath = deviceMap?.led_blue_path; // NEU
            if (bluePath) {
                // NEU
                await adapter.setForeignStateAsync(bluePath, { val: !!on, ack: true }); // NEU
            } // NEU
        } catch (err) {
            // NEU
            adapter.log.warn(`[hardwareHelper] _setBlueLed fehlgeschlagen: ${err.message}`); // NEU
        } // NEU
    } // NEU
}

module.exports = {
    HardwareHelper,
};

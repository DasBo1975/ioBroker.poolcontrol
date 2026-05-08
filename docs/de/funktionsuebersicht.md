# PoolControl – Funktionsübersicht

## 1. Was ist PoolControl?

PoolControl ist ein ioBroker-Adapter zur Steuerung und Überwachung einer privaten Poolanlage. Der Adapter verbindet Pumpensteuerung, Temperaturauswertung, Solarsteuerung, Photovoltaik-Überschussbetrieb, Heizungssteuerung, Laufzeit- und Verbrauchsauswertungen sowie Text- und Sprachausgaben in einer gemeinsamen Objektstruktur.

Der Adapter ist modular aufgebaut. Beim Start werden zuerst die Datenpunkte angelegt und danach die einzelnen Helper-Module gestartet. Die zentrale Pumpenschaltung erfolgt über `pump.pump_switch`; eine konfigurierte reale Steckdose wird durch den Pumpen-Helper damit synchronisiert.

Die vorhandenen Datenpunkte sind für ioBroker-Objektbaum, VIS, Blockly und andere Adapter nutzbar. PoolControl stellt zahlreiche strukturierte Text-, JSON- und HTML-Datenpunkte bereit, die direkt in VIS, Blockly oder anderen Visualisierungssystemen genutzt werden können.

## 2. Hauptfunktionen

PoolControl deckt folgende Hauptbereiche ab:

- Pumpensteuerung mit Automatik-, Zeit-, manuellen, PV- und Systemmodi
- Prioritäts- und Ownership-Logik über `pump.active_helper`
- Temperaturverwaltung für bis zu sechs Sensorrollen
- Standard-Solarsteuerung und erweiterte Solarsteuerung
- Photovoltaik-Überschusssteuerung der Pumpe
- Heizungs- bzw. Wärmepumpensteuerung
- Frostschutz
- Laufzeit-, Umwälz-, Verbrauchs- und Kostenberechnung
- Tages-, Wochen- und Monatsstatistiken für Temperaturen
- Solar Insights und Photovoltaic Insights unter `analytics.insights.*`
- zentrale Text- und Sprachausgabe über eine gemeinsame Queue-Struktur
- Diagnosebereich `SystemCheck.debug_logs`
- pH- und TDS-Auswertung ohne automatische Dosierung
- optionale Zusatzaktoren für Beleuchtung und Zusatzpumpen

## 3. Pumpensteuerung

Die Pumpe ist der zentrale Aktor des Adapters. Der interne Schaltzustand liegt in `pump.pump_switch`. Wenn in der Admin-Konfiguration eine echte Steckdose hinterlegt ist, spiegelt `pumpHelper` diesen internen Zustand auf den externen ioBroker-Datenpunkt und übernimmt umgekehrt Änderungen der Steckdose zurück in den PoolControl-Status.

Unterstützte bzw. im Code verwendete Pumpenmodi sind:

- `auto`: normaler Automatikbetrieb, unter anderem für Solar und Heizung relevant
- `auto_pv`: PV-Überschussbetrieb
- `manual`: manueller Betrieb
- `time`: Zeitsteuerung
- `off`: aus
- `controlHelper`: interne Steuerung für Wartung, Rückspülung und Nachpumpen
- `timeHelper`, `frostHelper`, `heatHelper`, `speechTextHelper`: interne Status-/Hilfsmodi, die von Helpern gesetzt oder ausgewertet werden

Die Prioritätsverwaltung erfolgt über `pump.active_helper`. Dort steht, welcher Helper die Pumpe aktuell besitzt oder vorrangig steuert. Im Code sichtbar sind insbesondere:

- `controlHelper` für Wartung, Rückspülung und Nachpumpen
- `timeHelper` für aktive Zeitfenster
- `solarHelper` für Standard-Solarbetrieb
- `solarExtendedHelper` für erweiterten Solarbetrieb
- `photovoltaicHelper` für PV-Überschussbetrieb
- `frostHelper` für Frostschutz
- `heatHelper` für Heizungsbetrieb

Mehrere Helper prüfen diesen Wert, bevor sie die Pumpe schalten. Dadurch wird verhindert, dass beispielsweise Solar oder PV eine laufende Wartung oder Zeitsteuerung überschreibt.

Zur Sicherheitslogik gehören:

- Spiegelung der aktuellen Pumpenleistung nach `pump.current_power`
- Fehlerstatus `pump.error`
- Statusausgabe `pump.status`
- Überlastprüfung anhand `pump.pump_max_watt`
- Erkennung von Leistung trotz ausgeschalteter Pumpe bzw. fehlender Leistung bei eingeschalteter Pumpe
- kurze Kulanzzeiten nach Start und Stopp, damit Einschalt- und Ausschaltflanken nicht sofort als Fehler gewertet werden
- optionaler Sicherheitsbetrieb im manuellen Modus über `pump.manual_safety_enabled`

Ergänzend gibt es Live- und Lernbereiche:

- `pump.live.*` für aktuelle Leistung, aktuellen Durchfluss, Durchflussprozent und letzten Durchflusswert
- `pump.learning.*` für gelernte Leistungs- und Durchflussbereiche, Abweichungen und Toleranz
- `pump.pressure.*` für Drucksensorik, Trend, Lernwerte und Diagnose
- `pump.speed.*` für Empfehlungen bzw. Zustände einer variablen Pumpenleistung

## 4. Zeitsteuerung

Die Zeitsteuerung liegt unter `timecontrol.*`. Es gibt drei Zeitfenster (`time1`, `time2`, `time3`) mit:

- Aktiv-Schalter
- Startzeit
- Endzeit
- Wochentagsauswahl

Der `timeHelper` prüft jede Minute, ob eines der aktiven Zeitfenster für den aktuellen Wochentag gültig ist. Die Zeitsteuerung schaltet nur, wenn `pump.mode = time` gesetzt ist.

Wenn ein Zeitfenster aktiv ist, setzt der Helper `pump.active_helper` auf `timeHelper`, aktualisiert `speech.time_active` und schaltet `pump.pump_switch`. Endet das Zeitfenster oder wird der Pumpenmodus verlassen, gibt der Helper die Priorität wieder frei.

## 5. Solarsteuerung

Die Standard-Solarsteuerung liegt unter `solar.*` und wird durch `solarHelper` ausgeführt. Sie arbeitet im Modus `solar.control_mode = standard`.

Wichtige Datenpunkte sind:

- `solar.solar_control_active`: Hauptschalter der Solarsteuerung
- `solar.control_mode`: Auswahl zwischen Standard- und Extended-Modus
- `solar.temp_on`: Einschaltgrenze
- `solar.temp_off`: Ausschaltgrenze
- `solar.hysteresis_active`: vorbereitete Hysterese-Option
- `solar.request_active`: interne Solar-Anforderung
- `solar.collector_warning`: Kollektor-Warnstatus
- `solar.warn_active`, `solar.warn_temp`, `solar.warn_speech`: Warnlogik

Die Standardlogik vergleicht Kollektortemperatur und Pool-Oberflächentemperatur. Die Pumpe wird angefordert, wenn der Kollektor warm genug ist und die Differenz positiv ist. Sie wird nicht angefordert, wenn die Ausschalttemperatur unterschritten wird oder keine positive Differenz besteht.

Die Steuerung ist nur aktiv, wenn:

- die Poolsaison aktiv ist
- Solar aktiviert ist
- `pump.mode = auto` ist
- der Solarmodus `standard` ist
- kein höherer Vorrang durch `controlHelper` oder `timeHelper` besteht

Die Kollektorwarnung setzt `solar.collector_warning`, wenn die Warntemperatur erreicht wird. Sie wird automatisch zurückgesetzt, wenn der Kollektor auf 90 Prozent des Warnwerts oder darunter fällt.

## 6. Photovoltaik- und PV-Überschussfunktionen

Die PV-Funktion liegt unter `photovoltaic.*` und wird durch `photovoltaicHelper` ausgeführt. Sie liest zwei externe Datenpunkte aus der Admin-Konfiguration:

- PV-Erzeugungsleistung
- Hausverbrauch

Daraus berechnet der Adapter:

- `photovoltaic.power_generated_w`
- `photovoltaic.power_house_w`
- `photovoltaic.power_surplus_w`
- `photovoltaic.surplus_active`
- `photovoltaic.status_text`
- `photovoltaic.last_update`

Die Einschaltlogik verwendet den berechneten Überschuss. Ein PV-Überschuss gilt als aktiv, wenn:

`PV-Erzeugung - Hausverbrauch >= pump.pump_max_watt + photovoltaic.threshold_w`

Die Pumpe wird nur geschaltet, wenn:

- die Saison aktiv ist
- `pump.mode = auto_pv` ist
- der PV-Überschuss ausreicht
- die optionale Umwälzblockade nicht greift

Mit `photovoltaic.afterrun_min` kann ein Nachlauf nach Ende des Überschusses eingestellt werden. `photovoltaic.ignore_on_circulation` kann PV-Steuerung beenden bzw. verhindern, wenn das tägliche Umwälzziel bereits erreicht ist.

Eine Besonderheit ist die Sicherheitsübersteuerung bei Solar-Überhitzung: Wenn `solar.collector_warning` aktiv ist, kann der PV-Helper die Pumpe unabhängig vom PV-Überschuss einschalten, um den Kollektor zu schützen.

## 7. Temperatur- und Sensorfunktionen

Die Temperaturverwaltung verarbeitet bis zu sechs Sensorrollen:

- `collector`: Kollektor
- `outside`: Außentemperatur
- `surface`: Pool-Oberfläche
- `ground`: Pool-Grund
- `flow`: Vorlauf
- `return`: Rücklauf

Die Sensoren werden in der Admin-Konfiguration aktiviert und mit externen ioBroker-Objekt-IDs verbunden. `temperatureHelper` liest die Fremdwerte ein und schreibt sie in die eigenen Datenpunkte unter `temperature.<sensor>.current`.

Zusätzlich werden berechnet:

- Tagesminimum und Tagesmaximum je Sensor
- Änderung pro Stunde (`delta_per_hour`)
- `temperature.delta.collector_outside`
- `temperature.delta.surface_ground`
- `temperature.delta.flow_return`

Diese Werte werden von mehreren Bereichen genutzt, unter anderem Solar, Solar Insights, Heizung, Frostschutz, Statistik und Textausgaben.

## 8. Heizungs- und Wärmefunktionen

Die Heizungssteuerung liegt unter `heat.*` und wird durch `heatHelper` ausgeführt. Laut README befindet sich diese Funktion in einer Testphase; im Code ist die Steuerlogik jedoch vorhanden.

Die Heizung kann einen externen Schaltaktor oder einen booleschen Steuerdatenpunkt bedienen. Wichtige Einstellungen und Zustände sind:

- `heat.control_active`: Heizungssteuerung aktiv
- `heat.control_type`: Art des externen Zieles
- `heat.control_object_id`: externer Steuerdatenpunkt
- `heat.target_temperature`: Zieltemperatur
- `heat.max_temperature`: maximale Sicherheitstemperatur
- `heat.pump_prerun_minutes`: Pumpenvorlauf vor Heizstart
- `heat.pump_afterrun_minutes`: Pumpennachlauf nach Heizende
- `heat.heating_request`: internes Anforderungssignal
- `heat.active`, `heat.blocked`, `heat.mode`, `heat.reason`, `heat.info`

Die Steuerung arbeitet nur, wenn:

- die Poolsaison aktiv ist
- kein Wartungsmodus aktiv ist
- die Heizungssteuerung eingeschaltet ist
- `pump.mode = auto` ist
- eine gültige Oberflächentemperatur vorhanden ist
- die Maximaltemperatur nicht erreicht ist

Der Helper schaltet die Pumpe bei Bedarf ein und merkt sich intern, ob er sie selbst eingeschaltet hat. Beim Abschalten wird die Pumpe nur dann durch den Heizungs-Helper ausgeschaltet, wenn er sie vorher selbst übernommen hatte. Das reduziert Konflikte mit anderen Betriebsarten.

## 9. Statistik-, Trend- und Insights-Bereiche

### `analytics.statistics.*`

Der Statistikbereich wertet Temperaturdaten aus. Für die aktiven Sensoren werden Tageswerte unter `analytics.statistics.temperature.today.*` geführt:

- Minimum
- Maximum
- Durchschnitt
- Zeitpunkte von Minimum und Maximum
- Anzahl Messpunkte
- JSON- und HTML-Zusammenfassungen
- manuelle Tagesrücksetzung je Sensor

Zusätzlich gibt es Wochen- und Monatshelfer:

- `statisticsHelperWeek` schreibt unter `analytics.statistics.temperature.week.*`
- `statisticsHelperMonth` schreibt unter `analytics.statistics.temperature.month.*`

Beide Bereiche erzeugen ebenfalls strukturierte Zusammenfassungen für einzelne Sensoren und Gesamtausgaben.

### Solar Insights

Solar Insights liegen unter `analytics.insights.solar.*`. Der Bereich dient der Analyse, nicht der Steuerung.

Die Struktur ist:

- `analytics.insights.solar.inputs.*`
- `analytics.insights.solar.calculation.*`
- `analytics.insights.solar.results.*`
- `analytics.insights.solar.logbook.*`
- `analytics.insights.solar.debug.*`

Der Code beschreibt Solar Insights ausdrücklich als Schätzung. Berücksichtigt werden je nach Verfügbarkeit Kollektor, Poolreferenz, Vorlauf, Rücklauf, Außentemperatur, Durchfluss und Wetterdaten. Berechnet bzw. ausgegeben werden unter anderem:

- verwendete und verfügbare Sensoren
- Qualitätsstufe und Vertrauenswert
- Pool-Referenzquelle
- Durchflussquelle
- thermische Leistung
- geschätzter Tagesgewinn
- geschätztes Effizienzverhältnis
- aktive Minuten heute
- Spitzenleistung heute
- JSON-, HTML- und Textausgaben
- Debug-Gründe und letzte Aktualisierung

Die Solar-Logbuchfunktion schreibt aktuelle Einträge, Tageslog als JSON/Text und HTML-Einträge unter `analytics.insights.solar.logbook.*`.

### Photovoltaic Insights

Photovoltaic Insights liegen unter `analytics.insights.photovoltaic.*`. Der Bereich analysiert PV-Überschusslaufzeiten und ist ebenfalls keine eigene Steuerlogik.

Erfasst werden unter anderem:

- PV-Überschussleistung
- ob PV-Überschuss aktiv ist
- Pumpenleistung
- ob der PV-Helper die Pumpe besitzt
- Laufzeit heute
- Energieverbrauch im PV-Betrieb
- geschätzte Einsparung anhand des Strompreises
- Startanzahl heute
- Zusammenfassung als Text, JSON und HTML
- Debugtexte und Gründe

Die Laufzeit wird nur gezählt, wenn PV-Überschuss aktiv ist und `photovoltaicHelper` die Pumpe besitzt. Nachlaufzeiten werden nach Codekommentaren nicht als PV-Überschusslaufzeit gezählt.

### COP- und Effizienzfunktionen

Im Code sind Effizienz- und Schätzwerte besonders im Solar-Insights-Bereich sichtbar, etwa thermische Leistung, geschätzter Tagesgewinn und geschätztes Effizienzverhältnis. Eine eigenständige, vollständig getrennte COP-Steuerung für Wärmepumpen ist nicht eindeutig aus dem Code ableitbar.

## 10. Sprach- und Textausgaben

Die zentrale Ausgabe läuft über `speech.queue`. Viele Helper schreiben Meldungen in diese Queue; `speechHelper` verarbeitet sie weiter.
Die zentrale Queue-Struktur verhindert konkurrierende oder doppelte Meldungssysteme. Neue Sprach- und Textausgaben sollen bewusst zentral über `speech.queue` laufen.

Wichtige Datenpunkte sind:

- `speech.active`: globale Aktivierung
- `speech.queue`: zentrale Nachrichtenwarteschlange
- `speech.last_text`: letzter ausgegebener Text
- `speech.start_text`, `speech.end_text`: Pumpentexte
- `speech.solar_active`, `speech.time_active`, `speech.frost_active`: interne Kontextsignale
- `speech.amazon_alexa.*`: Alexa-Ruhezeiten und Status

Der Helper kann je nach Konfiguration ausgeben über:

- Alexa, über einen konfigurierten Fremddatenpunkt
- Telegram, über `sendTo`
- E-Mail, über `sendTo`

Für Alexa gibt es Ruhezeiten für Woche und Wochenende. Während aktiver Ruhezeit wird die Alexa-Ausgabe blockiert, andere Ausgabekanäle sind davon nicht automatisch betroffen.

Textoutputs existieren vor allem als lesbare States in den jeweiligen Bereichen, zum Beispiel Status-, Debug-, AI-, Chemistry-, Solar-Insights-, PV-Insights-, JSON- und HTML-Ausgaben. Ein eigener Objektkanal mit dem Namen `textoutputs` ist nicht eindeutig aus dem Code ableitbar.

## 11. Chemie-, pH- und TDS-Bereiche

Die Chemiebereiche sind vorhanden und werden beim Adapterstart angelegt. Die Bereiche dienen aktuell der Analyse, Bewertung und Trendbeobachtung von Wasserwerten. Sie dienen der Auswertung und Empfehlung, nicht der automatischen Dosierung.

### pH-Auswertung

Der Bereich `chemistry.ph.*` unterstützt:

- Aktivierung der pH-Auswertung
- manuellen pH-Wert
- externen ioBroker-Datenpunkt als pH-Quelle
- Plausibilitätsprüfung
- Quellstatus
- Messortlogik
- Verlauf des letzten und vorherigen gültigen Werts
- Bewertung und Empfehlungstexte
- optionalen manuellen Mischlauf

Der Code stellt ausdrücklich klar: keine automatische Dosierung und keine chemische Aktorsteuerung.

### TDS-Auswertung

Der Bereich `chemistry.tds.*` unterstützt:

- Aktivierung der TDS-Auswertung
- manuellen TDS-Wert in ppm
- externen ioBroker-Datenpunkt als Quelle
- Plausibilitätsprüfung
- Messortlogik
- Referenzwert
- Historie
- Trends über 24 Stunden, 7 Tage und 30 Tage
- Bewertung anhand absolutem Wert, Referenzabweichung und Trend
- Text-, JSON- und HTML-Zusammenfassungen

Auch hier ist im Code festgehalten: keine automatische Steuerung, keine automatische Dosierung und keine Pumpensteuerung.

Die ältere Entwicklungsnotiz nennt außerdem pH-/ORP-Integration und Dosierlogik als Planung. Der aktuell vorhandene Code enthält pH und TDS als Auswertebereiche ohne Dosierung. ORP ist als vollständig implementierter Bereich nicht eindeutig aus dem Code ableitbar.

## 12. Hardware-, MQTT- und ESP32-Integration

Die vorhandene Implementierung bindet externe Hardware überwiegend über frei konfigurierbare ioBroker-Objekt-IDs ein:

- Pumpensteckdose
- aktuelle Pumpenleistung
- Temperatursensoren
- Drucksensor
- PV-Erzeugung
- Hausverbrauch
- Heizungsaktor
- Solar-Extended-Aktor
- Beleuchtung und Zusatzpumpen

Eine Drucksensor-Integration ist implementiert. Der Admin-Hinweis nennt ausdrücklich externe Sensoren und eine PoolControl PressureBox. `pump.pressure.*` enthält aktuellen Druck, vorherigen Druck, Normalbereich, Lernwerte, Trendwerte, Diagnose und Reset.

MQTT-/ESP32-Integration ist in den Entwicklungsnotizen als `mqttNodeHelper.js` für externe PoolControl-Nodes genannt. Eine entsprechende Helper-Datei ist im aktuellen Projektstand nicht vorhanden. Daher ist dieser Bereich als Vorbereitung bzw. Planung zu bewerten.

Vorbereitete bzw. geplante Hardwareboxen:

- PressureBox: im Konfigurationshinweis und Druckbereich erkennbar unterstützt bzw. vorbereitet
- TempBox, LevelBox und weitere Sensorboxen: in README/Entwicklungsnotizen als geplante Erweiterungen erwähnt
- AquaBox: Nicht eindeutig aus dem Code ableitbar

## 13. VIS-, HTML- und Widget-Bereiche

Der Adapter erzeugt viele Datenpunkte, die direkt in VIS, VIS2, Blockly oder Dashboards verwendet werden können. Dazu gehören Status-, Laufzeit-, Temperatur-, Statistik-, Chemie-, Solar- und PV-Ausgaben.

HTML-Ausgaben sind in mehreren Analysebereichen vorhanden:

- Temperaturstatistiken
- Solar Insights
- Solar Logbook
- Photovoltaic Insights
- TDS-Auswertung

JSON-Ausgaben sind ebenfalls vorhanden, vor allem für:

- Statusübersichten
- Statistikzusammenfassungen
- Solar Insights
- Photovoltaic Insights
- TDS-Auswertung

Der Schwerpunkt liegt aktuell auf der Bereitstellung strukturierter Datenpunkte, HTML-Ausgaben und JSON-Zusammenfassungen zur freien Nutzung in VIS, Blockly oder anderen Dashboardsystemen.

## 14. Diagnose- und Debugfunktionen

Der zentrale Diagnosebereich heißt `SystemCheck.debug_logs.*`.

Er bietet:

- Auswahl eines Zielbereichs über `SystemCheck.debug_logs.target_area`
- fortlaufendes Log unter `SystemCheck.debug_logs.log`
- Löschfunktion über `SystemCheck.debug_logs.clear`
- Überwachung auf sehr schnelle Zustandsänderungen
- Begrenzung des Logumfangs auf die letzten etwa 60.000 Zeichen

Zusätzlich existieren viele bereichsspezifische Status- und Debugdatenpunkte, zum Beispiel:

- `status.summary`
- `status.overview_json`
- `status.system_ok`
- `status.system_warning`
- `status.system_warning_text`
- `pump.status`
- `pump.error`
- `solar.extended.reason`
- `solar.extended.info`
- `analytics.insights.solar.debug.*`
- `analytics.insights.photovoltaic.debug.*`

Der Adapter besitzt außerdem einen `migrationHelper`, der beim Start zuletzt vor den Helpern ausgeführt wird und Struktur-/Update-Anpassungen vorbereitet. Details seiner konkreten Migrationen sind in dieser Übersicht nicht einzeln ausgewertet.

## 15. Export- und Analysefunktionen

Implementiert sind vor allem interne Analyseausgaben:

- JSON-Zusammenfassungen
- HTML-Zusammenfassungen
- Textzusammenfassungen
- Tages-, Wochen- und Monatsstatistiken
- Solar- und PV-Insights
- TDS-Trendauswertung
- Statusübersicht als JSON

Ein direkter CSV- oder Excel-Export ist in README und Entwicklungsnotizen als geplante Erweiterung genannt. Eine fertige CSV-Exportfunktion ist im aktuellen Code nicht eindeutig aus dem Code ableitbar.

## 16. Voraussetzungen und typische Nutzung

Technische Voraussetzungen laut Projektdateien:

- Node.js `>= 22`
- ioBroker js-controller `>= 6.0.11`
- ioBroker Admin `>= 7.6.20`
- Adapter läuft als JavaScript/Node.js-Daemon
- überwiegend helper- und ereignisbasierte Verarbeitung

Typische Einrichtung:

- Poolgröße und Mindestumwälzung in den allgemeinen Einstellungen setzen
- Pumpensteckdose und optional Leistungsdatenpunkt konfigurieren
- Temperatursensoren aktivieren und Objekt-IDs zuordnen
- gewünschten Pumpenmodus wählen
- Solar, PV, Zeitsteuerung, Heizung und Frostschutz nach Bedarf aktivieren
- Speech-Ausgaben nur aktivieren, wenn Alexa/Telegram/E-Mail korrekt konfiguriert sind
- Analysebereiche in VIS oder Dashboards über JSON-/HTML-/Textstates einbinden

## 17. Wichtige Hinweise und Grenzen des Systems

- Der Adapter kann reale Hardware schalten. Die sichere elektrische und hydraulische Installation liegt außerhalb des Codes und muss vom Betreiber gewährleistet werden.
- Chemie pH und TDS sind Auswertungs- und Empfehlungssysteme. Es findet keine automatische Dosierung statt.
- Solar Insights und Photovoltaic Insights sind Analysebereiche. Sie ersetzen keine geeichten Energiezähler.
- Solar-Insights-Werte sind im Code als Schätzungen angelegt und hängen stark von Sensorqualität, Durchflusswerten und verfügbaren Temperaturdaten ab.
- PV-Insights zählen nur den PV-Überschussbetrieb, wenn `photovoltaicHelper` die Pumpe besitzt.
- Eigene VIS-Widgets, CSV/Excel-Export und MQTT-/ESP32-Nodes sind als Planung oder Vorbereitung erkennbar, aber im aktuellen Code nicht als fertige Module vorhanden.
- Bei Funktionen, die externe Objekt-IDs verwenden, hängt das Verhalten von korrekt gesetzten ioBroker-Datenpunkten und passenden Rollen/Werten ab.

## 18. Zusammenfassung für neue Benutzer

PoolControl ist ein modularer Pooladapter, der die Pumpe als zentrales Element verwaltet und darum herum Solar, PV, Zeitsteuerung, Frostschutz, Heizung, Sensorik, Statistik und Meldungen organisiert.

Für den Einstieg reichen meist:

- Pumpensteckdose konfigurieren
- Poolgröße und Umwälzziel setzen
- mindestens einen Pooltemperatursensor einrichten
- gewünschten Pumpenmodus wählen
- danach Solar, PV, Heizung, Speech und Analysen schrittweise aktivieren

Die wichtigsten Zustände für den Alltag sind `pump.status`, `pump.pump_switch`, `pump.mode`, `pump.active_helper`, `status.summary`, `circulation.daily_remaining`, `solar.request_active`, `photovoltaic.surplus_active` und die Ausgaben unter `analytics.*`.

Vorbereitete oder geplante Bereiche sind im Projekt sichtbar, sollten aber nicht mit vollständig fertigen Funktionen verwechselt werden. Besonders MQTT/ESP32-Nodes, eigene VIS-Widgets und CSV/Excel-Export sind nach aktuellem Codebestand als Planung bzw. Vorbereitung einzuordnen.

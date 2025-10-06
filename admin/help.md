# PoolControl – Hilfe & Dokumentation

Diese Hilfedatei erklärt die Konfigurationsmöglichkeiten und Datenpunkte des Adapters **ioBroker.poolcontrol**.  
Sie können über die Instanzkonfiguration oder direkt über die erzeugten Objekte im ioBroker-Objektbaum genutzt werden.

---

## 1. Einleitung
Der PoolControl-Adapter ermöglicht die automatische Steuerung und Überwachung einer Poolanlage.  
Funktionen:
- Pumpensteuerung (Automatik, Manuell, Zeitmodus)  
- Temperaturverwaltung (Sensoren, Min/Max, Differenzen)  
- Solarsteuerung mit Hysterese und Warnungen  
- Laufzeit- und Umwälzberechnung  
- Verbrauchs- und Kostenberechnung  
- Fehlerüberwachung (z. B. Überlast, keine Leistung)  
- Sprachausgaben (Alexa, Telegram)  
- Statusübersicht mit Pumpenstatistik und Systemindikatoren  

---

## 2. Allgemeine Einstellungen
**Tab: „Allgemeine Einstellungen“**
- **general.pool_name** → Name des Pools (nur Anzeige).  
- **general.pool_size** → Größe des Pools in Litern (wichtig für Berechnung der Umwälzung).  
- **general.min_circulation_per_day** → Faktor, wie oft das gesamte Poolvolumen pro Tag umgewälzt werden soll.  
- **status.season_active** → Bool, ob die Poolsaison aktiv ist (wird später für historische Berechnungen genutzt).  
  Wenn aktiv: Der Adapter führt alle automatischen Funktionen wie Pumpensteuerung, Solarregelung und Statistiken normal aus.  
  Wenn inaktiv: Automatische Logiken (z. B. Pumpenautomatik, Solarsteuerung) sind deaktiviert.  
  Der Frostschutz bleibt jedoch **immer aktiv**, auch außerhalb der Saison.  
  Der Status kann sowohl über die Instanzkonfiguration als auch direkt im Objektbaum oder über VIS/Blockly geändert werden.
  
---

## 3. Pumpe
**Tab: „Pumpe“**
- **pump.pump_switch** → zentraler Schalter EIN/AUS.  
  *Wichtig: Dieser Datenpunkt steuert die reale Steckdose und ist die Grundlage für Laufzeit- und Umwälzberechnungen.*  
- **pump.mode** → Betriebsmodus (`auto`, `manual`, `time`, `off`).  
  *Wichtig: Legt fest, ob die Pumpe durch Solar-/Frostlogik, Zeitsteuerung oder manuell gesteuert wird.*  
- **pump.status** → Textstatus („AUS“, „EIN (manuell)“, „FEHLER“).  
- **pump.error** → zeigt Fehlerstatus an (true/false). Muss manuell zurückgesetzt werden.  
- **pump.current_power** → aktuelle Leistungsaufnahme (W).  
  *Wichtig: Grundlage für Fehlererkennung (Trockenlauf, Überlast).*  

**Fehlerfälle:**  
- **EIN ohne Leistung** (<5 W) → Fehler (Trockenlauf).  
- **AUS mit Leistung** (>10 W) → Fehler.  
- **Überlast** → Leistungsaufnahme > Maximalwert → Notabschaltung + `mode = off`.  

---

## 4. Temperaturverwaltung
**Tab: „Temperaturverwaltung“**
- Bis zu 6 Sensoren: Oberfläche, Grund, Vorlauf, Rücklauf, Kollektor, Außentemperatur.  
- Für jeden Sensor: „verwenden“ (bool) + Objekt-ID.  

**Datenpunkte:**  
- `temperature.[sensor].current` → aktueller Wert (°C).  
- `temperature.[sensor].min_today` / `max_today` → Tages-Min/Max (°C, persistent).  
- `temperature.[sensor].delta_per_hour` → Änderung pro Stunde (°C/h).  
- `temperature.delta.collector_outside` → Kollektor – Außentemperatur.  
- `temperature.delta.surface_ground` → Oberfläche – Grund.  
- `temperature.delta.flow_return` → Vorlauf – Rücklauf.  

*Wichtig: Die Temperaturwerte sind Basis für Solarsteuerung, Frostschutz und Statusübersicht.*  

---

## 5. Solarverwaltung
**Tab: „Solarverwaltung“**  
- **solar.solar_control_active** → Solarsteuerung aktivieren/deaktivieren.  
- **solar.hysteresis_active** → Hysterese aktiv (verhindert ständiges Ein/Aus).  
- **solar.temp_on / temp_off** → Einschalt- und Ausschaltgrenzen (°C).  
- **solar.collector_warning** → zeigt an, ob aktuell eine Übertemperatur-Warnung aktiv ist.  
- **solar.warn_active / solar.warn_temp / solar.warn_speech** → Steuerung der Warnlogik.  

*Wichtig: Die Solarlogik entscheidet direkt, ob `pump.pump_switch = true` gesetzt wird.*  

---

## 6. Zeitsteuerung
**Tab: „Zeitsteuerung“**  
- Bis zu 3 Zeitfenster (Startzeit, Endzeit, Wochentage).  
- Nur aktiv, wenn `pump.mode = time`.  

**Datenpunkte:**  
- `timecontrol.time1_active` → Zeitfenster 1 aktiv  
- `timecontrol.time1_start` / `timecontrol.time1_end` → Start- und Endzeit (HH:MM)  
- `timecontrol.time1_day_mon..sun` → Wochentage für Zeitfenster gültig  

---

## 7. Laufzeit & Umwälzung
**Datenpunkte:**  
- `runtime.total` → Gesamtlaufzeit der Pumpe (s).  
- `runtime.today` → Laufzeit heute (s).  
- `runtime.formatted` → Formatierte Anzeige („Xh Ym“).  
- `circulation.daily_total` → heute bereits umgewälzte Wassermenge (Liter).  
- `circulation.daily_required` → erforderliche Umwälzmenge pro Tag (abhängig von Poolgröße & Faktor).  
- `circulation.daily_remaining` → Restmenge bis Soll-Umwälzung.  

*Wichtig: Diese Werte zeigen, ob die tägliche Mindestumwälzung erreicht ist.*  

---

## 8. Verbrauch & Kosten
**Tab: „Verbrauch & Kosten“**  
- **consumption.total_kwh** → Gesamtverbrauch (kWh).  
- **consumption.day_kwh / week_kwh / month_kwh / year_kwh** → Verbrauchswerte je Zeitraum.  
- **costs.total_eur / day_eur / week_eur / month_eur / year_eur** → Kosten in Euro (basierend auf konfiguriertem Strompreis).  

*Wichtig: Hilft beim Monitoring des Energieverbrauchs und zur Kostenabschätzung.*  

---

## 9. Sprachausgaben
**Tab: „Sprachausgaben“**  
- **speech.active** → Hauptschalter für Sprachausgaben.  
- **speech.start_text / speech.end_text** → Texte für Pumpenstart/-stopp.  
- **speech.last_text** → zuletzt gesprochener Text.  
- **speech.texts.[sensor]** → optionale Textausgaben für Sensorwerte.  
- **E-Mail-Ausgabe**  
  - Aktivierbar über die Instanzkonfiguration (`speech_email_enabled`).  
  - Konfigurierbar:  
    - **speech_email_instance** → E-Mail-Adapter-Instanz (z. B. `email.0`)  
    - **speech_email_recipient** → Empfänger-Adresse  
    - **speech_email_subject** → Betreffzeile der E-Mail  
  - Bei jeder Sprachausgabe (Pumpenstart, Stopp, Fehler, Temperaturwarnung usw.) wird zusätzlich eine E-Mail an den konfigurierten Empfänger verschickt.  
  - Praktisch für Nutzer, die keine Alexa/Telegram-Anbindung verwenden, aber trotzdem Benachrichtigungen erhalten möchten.  

*Wichtig: Ermöglicht direkte Benachrichtigungen über Pumpen- und Temperaturereignisse.*  

---

## 10. Statusübersicht
Ab Version 0.0.10 gibt es einen eigenen Bereich `status.*`:  
- **status.summary** → Textzusammenfassung (Pumpe, Modus, Temperaturen, Laufzeit, Umwälzung).  
- **status.overview_json** → maschinenlesbare JSON-Zusammenfassung.  
- **status.last_summary_update** → Zeitpunkt der letzten Aktualisierung.  
- **status.pump_last_start / pump_last_stop** → Zeitpunkt letzter Start/Stop.  
- **status.pump_was_on_today** → Bool, ob die Pumpe heute eingeschaltet war.  
- **status.pump_today_count** → Anzahl der Starts heute.  
- **status.system_ok** → Bool, ob das System fehlerfrei läuft.  
- **status.system_warning / system_warning_text** → aktive Systemwarnung.  
- **status.season_active** → Bool, ob die Poolsaison aktiv ist.
  Dieser Wert spiegelt den Saisonstatus wider und beeinflusst die Logik des Adapters:  
  - true = Poolsaison aktiv → Pumpen- und Solarsteuerung arbeiten normal.  
  - false = Poolsaison inaktiv → Automatikfunktionen sind deaktiviert, nur Frostschutz bleibt erhalten.  
  Der Wert ist schaltbar und kann auch direkt in VIS oder per Skript geändert werden.

*Wichtig: Diese States geben eine zentrale Übersicht für Visualisierung (z. B. in VIS/vis2 Widgets).*  

---

## 11. Fehlermeldungen & Quittierung
- Fehler setzen den Datenpunkt `pump.error = true` und Status auf „FEHLER“.  
- Bei Überlast wird die Pumpe **automatisch abgeschaltet** (`pump.mode = off`).  
- **Quittierung:** Nutzer muss `pump.error` manuell wieder auf `false` setzen, bevor der Modus erneut geändert werden kann.  

---

## 12. SystemCheck – Diagnose und Debug-Logs

Der Bereich **SystemCheck** dient zur internen Analyse und Diagnose des PoolControl-Adapters.  
Hier können Entwickler und erfahrene Anwender gezielt prüfen, wie sich bestimmte Werte im laufenden Betrieb verändern.

---

## 13. Steuerung (Controlhelper) im Objektbereich poolcontrol.control

  Der Bereich Steuerung (ControlHelper) umfasst alle automatischen und manuellen Sonderfunktionen,
  die direkt in den Poolbetrieb eingreifen – etwa Wartungsmodus, Rückspülung, Energie-Reset
  und die tägliche Umwälzungsprüfung mit Nachpumpfunktion.

  Diese Logik wird intern durch die Datei controlHelper.js gesteuert.
  Sie sorgt dafür, dass alle Aktionen zeitlich korrekt ausgeführt und automatisch wieder beendet werden.

  🧰 Wartungsmodus

  Der Wartungsmodus wird über den Datenpunkt
  control.pump.maintenance_active aktiviert oder deaktiviert.

  Wenn aktiviert, schaltet der Adapter:

  die Pumpe aus,

  den Modus auf „controlHelper“,

  und pausiert alle Automatikfunktionen (Solar, Zeitsteuerung, Nachpumpen).

  Wenn deaktiviert, wird der vorherige Pumpenmodus automatisch wiederhergestellt
  (meist auto oder time).

  Optional werden Sprachausgaben oder Benachrichtigungen gesendet, wenn diese aktiviert sind.
  So bleibt der Wartungsbetrieb sauber vom Automatikmodus getrennt.

  🔁 Rückspülung

  Die Rückspülung wird über den Datenpunkt
  control.pump.backwash_start ausgelöst.

  Ablauf:

  Nach dem Start wird der Button sofort wieder auf false gesetzt (Impulsfunktion).

  Der Status control.pump.backwash_active zeigt während der Laufzeit an, dass die Rückspülung läuft.

  Die Laufzeit wird über control.pump.backwash_duration (in Minuten) festgelegt.

  Nach Ablauf der Zeit:

  Pumpe wird automatisch ausgeschaltet,

  der vorherige Pumpenmodus wird wiederhergestellt,

  der Status backwash_active geht auf false.

  Bei aktivierten Benachrichtigungen wird zusätzlich eine Meldung oder Sprachausgabe ausgegeben
  (z. B. „Rückspülung abgeschlossen. Automatikmodus wieder aktiv.“).

  ⚡ Energie-Reset

  Der Datenpunkt control.energy.reset setzt alle Verbrauchs- und Kostenwerte auf 0.
  Beim Auslösen:

  werden alle zugehörigen States (consumption.*, costs.*) zurückgesetzt,

  der Schalter wird danach automatisch wieder auf false gesetzt,

  und optional wird eine Benachrichtigung mit Zeitstempel gesendet
  (z. B. „Energiezähler wurde am 06.10.2025 vollständig zurückgesetzt“).

  Diese Funktion ist hilfreich, wenn die Messsteckdose gewechselt oder ein neuer Strompreis gesetzt wurde.

 💧 Tägliche Umwälzprüfung & Nachpumpen

  Der ControlHelper überprüft einmal täglich, ob die Soll-Umwälzmenge erreicht wurde.
  Die Uhrzeit für diesen Check ist über control.circulation.check_time frei einstellbar (Standard: 18:00 Uhr).

  Der Modus der Umwälzprüfung (control.circulation.mode) bestimmt das Verhalten:

  Modus	Beschreibung
  notify	Nur Tagesbericht, keine Aktion.
  manual	Bericht mit Hinweis, dass die Pumpe manuell eingeschaltet werden soll.
  auto		Automatisches Nachpumpen bis zur Zielmenge, wenn der Kollektor wärmer als der Pool ist.

  Bei aktivem Automatikmodus schaltet der Adapter:

  pump.mode auf controlHelper,

  pump.reason auf nachpumpen,

  startet die Pumpe,

  und beendet den Vorgang automatisch, sobald die Zielmenge erreicht ist.

  Auch hier werden optionale Benachrichtigungen oder Sprachausgaben ausgegeben,
  damit der Nutzer über den Status informiert bleibt.

### 🧩 Debug-Logs
Über den Kanal `SystemCheck.debug_logs` kann ein einzelner Bereich der Instanz (z. B. *pump*, *solar*, *runtime*, *temperature*, *control* usw.) überwacht werden.  
Dazu stehen folgende Datenpunkte zur Verfügung:

| Datenpunkt | Beschreibung |
|-------------|--------------|
| **target_area** | Auswahl, welcher Bereich überwacht werden soll. Nur ein Bereich kann gleichzeitig aktiv sein. |
| **log** | Fortlaufendes Textprotokoll der erfassten Änderungen und Zeitabstände. |
| **clear** | Löscht den Inhalt des Logs vollständig. |

---

### ⚙️ Funktionsweise
Nach der Auswahl eines Bereichs beginnt der Adapter automatisch damit, auffällige Änderungen (z. B. zu schnelle Statuswechsel oder häufige Wertupdates) aufzuzeichnen.  
Das Log kann anschließend direkt im Textfeld eingesehen oder kopiert werden.

Dieses Werkzeug dient in erster Linie zur Fehlersuche und Optimierung.  
Im Normalbetrieb sollte die Überwachung deaktiviert bleiben, um Systemressourcen zu schonen.

---

### 🧠 Hinweis
Der Bereich *SystemCheck* wird in zukünftigen Versionen um weitere Diagnosefunktionen erweitert,  
z. B. automatische Plausibilitätsprüfungen oder Exportfunktionen für Supportzwecke.



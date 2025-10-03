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


# PoolControl – Hilfe & Dokumentation

Diese Hilfedatei erklärt die Konfigurationsmöglichkeiten und Datenpunkte des Adapters **ioBroker.poolcontrol**.  
Sie können über die Instanzkonfiguration oder direkt über die erzeugten Objekte im ioBroker-Objektbaum genutzt werden.

---

## 1. Einleitung
Der PoolControl-Adapter ermöglicht die automatische Steuerung und Überwachung einer Poolanlage.  
Funktionen:
- Pumpensteuerung (Automatik, Manuell, Zeitmodus)  
- Temperaturverwaltung (Sensoren, Min/Max, Differenzen)  
- Solarsteuerung mit Hysterese  
- Laufzeit- und Umwälzberechnung  
- Fehlerüberwachung (z. B. Überlast, keine Leistung)  

---

## 2. Allgemeine Einstellungen
**Tab: „Allgemeine Einstellungen“**
- **Name des Pools** → Freitext, dient nur zur Anzeige.  
- **Poolgröße (Liter)** → wichtig für Umwälzberechnungen.  
- **Min. Umwälzung pro Tag** → Faktor, wie oft das gesamte Poolvolumen pro Tag umgewälzt werden soll.  

---

## 3. Pumpe
**Tab: „Pumpe“**
- **Max. Leistung (Watt)** → Grenze für die Fehlererkennung „Überlast“.  
- **Pumpenleistung (l/h)** → Grundlage für die Umwälzberechnung.  
- **Frostschutz aktivieren & Temperatur** → automatische Pumpensteuerung bei Frost.  
- **Objekt-ID schaltbare Steckdose Pumpe** → hier die Steckdose auswählen, über die die Pumpe geschaltet wird.  
- **Objekt-ID aktuelle Leistung (W)** → Leistungsmessung der Pumpe (z. B. aus Messsteckdose).  

**Besondere Datenpunkte:**  
- `pump.mode` → Betriebsmodus (`auto`, `manual`, `time`, `off`).  
- `pump.error` → zeigt Fehlerstatus an (true/false), kann manuell quittiert werden.  
- `pump.status` → lesbarer Status („AUS“, „EIN (manuell)“, „FEHLER“).  
- `pump.current_power` → aktuelle Leistungsaufnahme.  

**Fehlerfälle:**  
- **EIN ohne Leistung** → Pumpe eingeschaltet, aber <5 W → Fehler.  
- **AUS mit Leistung** → Pumpe ausgeschaltet, aber >10 W → Fehler.  
- **Überlast** → Leistungsaufnahme > Maximalwert → Notabschaltung + `mode = off`.  

---

## 4. Temperaturverwaltung
**Tab: „Temperaturverwaltung“**
- Bis zu 6 Sensoren (Oberfläche, Grund, Vorlauf, Rücklauf, Kollektor, Außentemperatur).  
- Für jeden Sensor: „verwenden“ + Objekt-ID.  

**Datenpunkte:**  
- `temperature.[sensor].current` → aktueller Wert.  
- `temperature.[sensor].min_today` / `max_today` → Tages-Min/Max.  
- `temperature.[sensor].delta_per_hour` → Änderung pro Stunde.  
- `temperature.delta.*` → Differenzen (Kollektor–Luft, Oberfläche–Grund, Vorlauf–Rücklauf).  

---

## 5. Solarverwaltung
**Tab: „Solarverwaltung“**  
- **Solarsteuerung aktivieren** → schaltet den Logikblock ein/aus.  
- **Hysterese aktivieren** → verhindert häufiges Ein-/Ausschalten.  
- **Kollektortemperatur EIN/AUS-Grenze** → definiert Schwellwerte für Zuschaltung.  
- **Kollektortemperatur-Warnung aktivieren** → überwacht die Kollektortemperatur.  
- **Warnschwelle Kollektortemperatur (°C)** → ab dieser Temperatur wird eine Warnung ausgelöst.  
- **Bei Warnung Sprachausgabe/Benachrichtigung** → löst zusätzlich eine Meldung über Alexa/Telegram aus.  

**Datenpunkte:**  
- `solar.collector_warning` → zeigt an, ob aktuell eine Warnung aktiv ist.  

**Hinweise:**  
- Die Warnung wird automatisch zurückgesetzt, sobald die Temperatur **10 % unter die eingestellte Schwelle** fällt.  

---

## 6. Zeitsteuerung
**Tab: „Zeitsteuerung“**
- Bis zu 3 Zeitfenster (Startzeit, Endzeit, Wochentage).  
- Nur aktiv, wenn `pump.mode = time`.  

---

## 7. Laufzeit & Umwälzung
**Datenpunkte (automatisch):**  
- `runtime.total` → Gesamtlaufzeit der Pumpe.  
- `runtime.today` → Laufzeit heute.  
- `runtime.formatted` → Formatierte Anzeige („Xh Ym“).  
- `circulation.daily_total` → heute bereits umgewälzte Wassermenge.  
- `circulation.daily_remaining` → Restmenge bis zum Tagesziel.  

---

## 8. Fehlermeldungen & Quittierung
- Fehler setzen den Datenpunkt `pump.error = true` und Status auf „FEHLER“.  
- Bei Überlast wird die Pumpe **automatisch abgeschaltet** und `pump.mode = off`.  
- **Quittierung:** Nutzer muss `pump.error` manuell wieder auf `false` setzen, bevor der Modus erneut geändert werden kann.  

---

## 9. Sprachausgaben
**Tab: „Sprachausgaben“**
- **Sprachausgaben aktivieren** → Hauptschalter für alle Ansagen.
- **Alexa-Ausgabe aktivieren** → Auswahl des Geräts, Lautstärke und Stimme (weiblich/männlich).
- **Telegram-Ausgabe aktivieren** → Auswahl der Telegram-Instanz für Textnachrichten.
- **Temperaturschwelle (°C)** → ab dieser Temperatur wird eine Ansage erzeugt.
- **Fehlermeldungen ansagen** → entscheidet, ob Pumpenfehler auch gesprochen/gesendet werden.

**Datenpunkte:**
- `speech.active` → Schalter für globale Aktivierung.
- `speech.start_text` / `speech.end_text` → frei definierbare Texte beim Pumpenstart/-stopp.
- `speech.texts.[sensor]` → optionale Texte für einzelne Sensoren.
- `speech.last_text` → zeigt den zuletzt gesprochenen/gesendeten Text.

**Hinweise:**
- Alexa-Ausgabe erfolgt über den Datenpunkt `.speak` des ausgewählten Echo-Geräts.
- Telegram-Ausgabe erfolgt als Nachricht an die konfigurierte Instanz.

---

## 10. Verbrauch & Kosten
**Tab: „Verbrauch & Kosten“**
- **Verbrauchs- und Kostenberechnung aktivieren** → Schaltet den Bereich ein.
- **Objekt-ID externer kWh-Zähler** → Messsteckdose oder anderes Gerät mit kWh-Gesamtzähler.
- **Strompreis (€ / kWh)** → Grundlage für Kostenberechnung.

**Datenpunkte:**
- `consumption.total_kwh` → Gesamtverbrauch laut Zähler.
- `consumption.day_kwh`, `week_kwh`, `month_kwh`, `year_kwh` → Verbrauch je Periode.
- `costs.total_eur`, `day_eur`, `week_eur`, `month_eur`, `year_eur` → Kostenberechnung anhand Strompreis.

**Hinweise:**
- Für die Verbrauchs- und Kostenberechnung ist ein externer kWh-Zähler erforderlich (z. B. Messsteckdose).
- Ohne kWh-Zähler erfolgt keine Berechnung.
- Baselines (Startwerte) werden automatisch gesetzt und täglich zu Mitternacht zurückgestellt.

---

## 10 A. Hinweise zur Verbrauchslogik

- **Gesamtwerte (`consumption.total_kwh`, `costs.total_eur`)**  
  Diese Werte sind absolute Summen. Sie steigen kontinuierlich an und enthalten auch einen internen Offset, falls der externe Zähler zurückgesetzt oder die Messsteckdose gewechselt wird. Dadurch gehen Gesamtwerte nicht verloren.

- **Periodenwerte (`day_kwh`, `week_kwh`, `month_kwh`, `year_kwh` und die Kosten-Pendants)**  
  Diese Werte zeigen den Verbrauch innerhalb der aktuellen Periode.  
  - `day_*` beginnt jeden Tag um Mitternacht neu bei 0.  
  - `week_*` beginnt jeden Montag neu bei 0.  
  - `month_*` beginnt am 1. des Monats neu bei 0.  
  - `year_*` beginnt am 1. Januar neu bei 0.  

- **Neustarts & Stromausfälle**  
  Alle Werte bleiben bei einem Neustart des Adapters oder bei einem Stromausfall erhalten, da sie in der ioBroker-Datenbank gespeichert werden. Nach Wiederanlauf werden sie korrekt weitergeführt.

---

## 11. Frostschutz
**Tab: „Pumpe“**  
- **Frostschutz aktivieren** → schaltet die Frostschutz-Logik ein.  
- **Frostschutz-Temperatur (°C)** → Grenzwert, ab dem die Pumpe bei Frost eingeschaltet wird.  

**Funktionsweise:**  
- Der Frostschutz ist **nur aktiv im Modus `auto`**.  
- Wenn die Außentemperatur **≤ eingestellter Wert**, schaltet der Adapter die Pumpe automatisch EIN.  
- Wenn die Außentemperatur wieder **≥ (Grenzwert + 1 °C)** liegt, schaltet der Adapter die Pumpe automatisch AUS (Hysterese).  
- Damit wird ein Einfrieren von Leitungen und Pumpe bei Frost verhindert.  

**Datenpunkte:**  
- `pump.frost_protection_active` → Schalter, ob Frostschutz aktiv ist.  
- `pump.frost_protection_temp` → Grenzwert für Frostschutz in °C.  

---

## 12. Tipps zur Steuerung
- Über Datenpunkte kann die Pumpe direkt geschaltet oder der Modus geändert werden.  
- Automatisierungen (z. B. Solar, Zeit) greifen nur, wenn der passende Modus aktiv ist.  
- Sicherheitsfunktionen (Frostschutz, Überlast) sind unabhängig vom Modus wirksam.  

---

## 13. Weitere Hinweise
- Alle Datenpunkte sind im Objektbaum unter `poolcontrol.*` zu finden.  
- Erweiterte Funktionen (Wartung) sind in Planung und werden in zukünftigen Versionen ergänzt.  

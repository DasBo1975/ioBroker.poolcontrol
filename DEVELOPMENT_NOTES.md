# DEVELOPMENT_NOTES.md  
## ioBroker.poolcontrol – Entwicklungsnotizen (Stand: Oktober 2025)

---

### 🧩 Architekturüberblick

Der Adapter **PoolControl** ist modular aufgebaut und verwendet eine klar strukturierte Trennung zwischen **Helper-** und **State-Modulen**.  
Jede Datei erfüllt eine bestimmte Aufgabe, um Wartung, Erweiterbarkeit und Stabilität zu gewährleisten.

---

## 📁 HELPER-MODULE (lib/helpers)

### System- und Steuerungslogik
- **main.js** → zentrale Initialisierung des Adapters, Helper-Verwaltung, State-Überwachung
- **controlHelper.js** → Rückspülung, Wartungsmodus, Saisonstart/-ende, Automatiksteuerung
- **controlHelper2.js** → erweiterte Automatik- und Chemie-Logiken (Vorbereitung zukünftiger Versionen)
- **migrationHelper.js** → Strukturprüfungen und automatische Anpassung älterer States bei Updates
- **statusHelper.js** → Statusauswertung, JSON-/Textausgabe, Tagesreset, OK-/Warn-/Error-Flags

### Sensorik & Umwelt
- **temperatureHelper.js** → Temperaturverarbeitung (Collector, Surface, Outside)
- **solarHelper.js** → Solarlogik, Differenzregelung, Aktivierungsbedingungen
- **frostHelper.js** → Frostschutzlogik (Temperaturabhängig, Pumpenschutz)
- **consumptionHelper.js** → Verbrauchs- und Kostenberechnung (z. B. Energie, Laufzeit, Wasser)

### Laufzeit, Pumpen & Zeitsteuerung
- **runtimeHelper.js** → Tages- und Gesamtlaufzeiten, Reset um Mitternacht
- **pumpHelper.js** → Pumpenstatus, Steuerung, Zähler und Schutzlogik
- **timeHelper.js** → Zeitfunktionen, Tageswechsel, Scheduler-Logik

### Sprache & Benachrichtigung
- **speechHelper.js** → Verwaltung der Sprachmeldungen und Queue
- **speechTextHelper.js** → Textvorlagen, Sprachstrings (Mehrsprachigkeit vorbereitet)
- **debugLogHelper.js** → erweiterte Debug-Ausgaben mit Klassennamen und Kategorien

---

## 📁 STATE-MODULE (lib/states)

### Steuerung und Systemstatus
- **controlStates.js** → Steuerdatenpunkte für Rückspülung, Wartung, Saison, Automatik
- **statusStates.js** → Übersicht, JSON-/Textausgaben, Fehlerflags, Systemstatus
- **systemStates.js** *(in Vorbereitung)* → interne Flags, Debug-States, Steuerhilfen

### Sensorwerte und Umgebung
- **temperatureStates.js** → Temperaturwerte (Collector, Surface, Outside)
- **solarStates.js** → Solarstatus, Kollektorparameter, Warn-Temperaturen
- **frostStates.js** *(geplant)* → Frostschutz-Indikatoren und Schwellenwerte
- **pressureStates.js** *(geplant)* → Drucksensor (0–10 bar / 150 PSI), Filterüberwachung
- **levelStates.js** *(geplant)* → Wasserstandssensorik (Ultraschall / Bewegung)

### Pumpen und Laufzeiten
- **pumpStates.js** → Pumpenstatus, Modus, Steuerindikatoren
- **runtimeStates.js** → Laufzeiten heute, gesamt, Saison, Resetsteuerung
- **consumptionStates.js** → Energieverbrauch, Wasserverbrauch, Kosten
- **timeStates.js** → Zeit-Trigger, Mitternachts-Reset, Prüfintervalle

### Sprache & Diagnose
- **speechStates.js** → Sprachmeldungen, Queue, Textstatus
- **debugLogStates.js** → Debug-Flags, Logfilter, interner LogLevel
- **generalStates.js** → allgemeine Grund-States, Meta-Informationen, Version, Init-Zeitpunkt

---

## 🔄 Datenfluss / Logikübersicht

1. **Temperaturmessung** → `temperatureHelper` liest Sensorwerte und berechnet Differenzen  
2. **Solarsteuerung** → `solarHelper` prüft Temperaturdifferenz und aktiviert ggf. Pumpe  
3. **Pumpenlogik** → `pumpHelper` schaltet, überwacht und zählt Laufzeiten  
4. **Runtime-Verarbeitung** → `runtimeHelper` summiert Zeiten, führt Tagesreset durch  
5. **Frostschutz** → `frostHelper` aktiviert Pumpenbetrieb unter Grenztemperatur  
6. **Rückspülung / Wartung** → `controlHelper` verwaltet Prozesse und Zustände  
7. **Statusauswertung** → `statusHelper` schreibt Text- und JSON-Zusammenfassungen  
8. **Sprachsystem** → `speechHelper` + `speechTextHelper` erstellen Meldungen  
9. **Verbrauchsauswertung** → `consumptionHelper` berechnet Wasser, Energie, Kosten  
10. **Debug & Fehlerausgabe** → `debugLogHelper` sorgt für konsistente Logmeldungen  

---

## 🧠 Geplante Module (Phase 0.3.0 → 0.6.0)

| Helper | Aufgabe |
|--------|----------|
| `pressureHelper.js` | Integration eines externen Drucksensors (0.5–4.5 V) |
| `levelHelper.js` | Wasserstands- und Bewegungserkennung (Ultraschall) |
| `chemistryHelper.js` | pH- & ORP-Messung, Dosierlogik mit Mischzeiten |
| `statisticsHelper.js` | Verlaufsauswertung, Trends, historische Daten |
| `errorHelper.js` | Zentrale Fehlererkennung und -speicherung |
| `mqttNodeHelper.js` | Kommunikation mit externen PoolControl-Nodes (ESP32) |

---

## ⚙️ Fehler- und Warnhandling

Zentralisierung aller Fehlerzustände über `statusHelper`:
```
status.error_code      → numerischer Fehlerwert
status.error_text      → lesbare Beschreibung
status.warning_active  → bool
status.ok              → bool (true = System i.O.)
```
Beispiele:
- TEMP_SENSOR_OFFLINE  
- PRESSURE_SENSOR_OUT_OF_RANGE  
- PH_SENSOR_ERROR  
- MISSING_STATE  

Fehler werden im `overview_json` angezeigt und optional über Sprache/Telegram gemeldet.

---

## 💬 Sprachsystem

Alle Ausgaben erfolgen über `speech.queue`.  
Beispielstruktur:
```json
{
  "timestamp": 1696849800000,
  "source": "controlHelper",
  "text": "Rückspülung abgeschlossen – Automatikbetrieb wieder aktiv."
}
```

---

## 📊 Historie & Statistik (Planung)

- Speicherung wichtiger Messgrößen (Druck, pH, Temperatur, ORP, Laufzeiten)  
- Trendanalyse („+0.2 bar in 7 Tagen → Rückspülen empfohlen“)  
- JSON-Ausgabe: `statistics.json`  
- Exportoption (CSV / VIS-Integration)  

---

## 🧾 Offene Aufgaben / TODOs

- [ ] Fehler-Manager (`errorHelper`)  
- [ ] pH-/ORP-Integration (`chemistryHelper`)  
- [ ] Level-/Bewegungserkennung (`levelHelper`)  
- [ ] Integration Drucksensor (`pressureHelper`)  
- [ ] Historie- / Trendmodul (`statisticsHelper`)  
- [ ] Sprachsystem um Automatikphasen erweitern  
- [ ] Wiki um Sensorik & Chemie ergänzen  
- [ ] Admin-Konfig Tabs „Sensoren“ & „Erweitert“ hinzufügen  

---

## 👤 Autor / Projektleitung

**Entwicklung & Projektkoordination:**  
D. Bertin *(DasBo1975)*  

**Mitwirkung & Tests:**  
Community (sigi234, looxer01, claus1993 u. a.)  

**Lizenz:** MIT  
**Projekt:** https://github.com/DasBo1975/ioBroker.poolcontrol

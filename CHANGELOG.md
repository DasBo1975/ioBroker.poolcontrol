# Changelog – ioBroker.poolcontrol

Alle nennenswerten Änderungen dieses Projekts werden in dieser Datei dokumentiert.  
Die Versionsnummern folgen dem Schema **MAJOR.MINOR.PATCH**.

---

### 0.3.0 (2025-10-12)
**Neu:** Intelligentes Pumpen-Monitoring & Lernsystem

- Reelle Durchflussberechnung auf Basis der tatsächlichen Leistungsaufnahme.  
- Neuer Bereich **`pump.live`** für aktuelle Echtzeitwerte (Leistung, Durchfluss, Prozentleistung).  
- Die tägliche Umwälzberechnung nutzt jetzt den realen Durchflusswert.  
- Neuer Bereich **`pump.learning`**:
  - Automatisches Lernen der durchschnittlichen Leistungs- und Durchflusswerte.  
  - Dynamische Ermittlung des Normalbereichs (±15 %).  
  - Berechnung der Abweichungen in Prozent und textbasierte Bewertung.  
  - Lernwerte werden persistent gespeichert (bleiben über Neustarts erhalten).  
- Vollständig eventbasiert – keine Timer, keine Polling-Zyklen.  

> Mit dieser Version beginnt die lernfähige Phase des PoolControl-Adapters:  
> Die Pumpe erkennt nun selbstständig, ob sie sich im Normalbereich befindet.


---

## [0.2.2] – 2025-10-08
**Neu:**
- Neuer Bereich **Control** mit manueller Steuerung (Rückspülung, Wartung, Saison)
- Sprach- und Logmeldungen für Rückspülprozesse
- Statusmeldungen erweitert (Pumpen-, Solar-, Systemstatus)
- Kleine Layout-Korrekturen in `statusHelper`
- Vorbereitung auf Chemistry- und Sensor-Erweiterung

**Verbessert:**
- Stabilität der Pumpenlogik bei Moduswechsel
- Bessere Behandlung von ACK-Flags im Speech-System
- Erste Wiki-Struktur auf GitHub angelegt

---

## [0.2.1] – 2025-09-??
**Neu:**
- Erweiterung der Sprachsteuerung (`speechHelper`, `speechTextHelper`)
- JSON-Zusammenfassung im Statusbereich
- Verbesserte Fehler- und Warnmeldungen

**Behoben:**
- Doppelte Sprachmeldungen unter bestimmten Bedingungen
- Kleinere Log-Formatierungsfehler

---

## [0.2.0] – 2025-08-??
**Neu:**
- Einführung der modularen Helper-Struktur  
  (`temperatureHelper`, `runtimeHelper`, `solarHelper`, `frostHelper`)
- Neuer `statusHelper` für zentrale Statusauswertung
- Integration des `speechHelper`-Systems (Sprach-Queue)
- Erster automatischer Tages-Reset
- Überarbeitung der State-Definitionen (JSONConfig)

---

## [0.1.0] – 2025-07-??
**Erste funktionsfähige Version**
- Basis-Adapterstruktur erstellt
- Pumpensteuerung (Ein/Aus)
- Grundlegende Temperaturmessung (Collector/Surface)
- Erste Status- und Log-Meldungen
- Setup-Test erfolgreich im Entwicklungs-System

---

## [0.0.1] – Initial Commit
- Projektstruktur angelegt
- io-package.json und package.json erstellt
- Adapter-Grundgerüst generiert (nach adapter-react-v5)

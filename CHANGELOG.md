# Changelog – ioBroker.poolcontrol

Alle nennenswerten Änderungen dieses Projekts werden in dieser Datei dokumentiert.  
Die Versionsnummern folgen dem Schema **MAJOR.MINOR.PATCH**.

---

## [0.3.0] – in Entwicklung
**Geplant:**
- Vollständige Helper-Struktur abgeschlossen (`controlHelper`, `statusHelper`, `speechHelper`, `solarHelper`, `pumpHelper`, `runtimeHelper`, usw.)
- Rückspülsteuerung fertiggestellt mit automatischer Sprachmeldung
- Neue Statusmeldungen im Bereich Control
- Überarbeitung des `speechTextHelper` (ACK-Fix)
- MigrationHelper ergänzt (automatische Anpassung veralteter States)
- Vorbereitung auf Drucksensor-Integration (`pressureHelper`)
- Beginn GitHub-Wiki mit Datenpunkt-Dokumentation
- Vorbereitung zukünftiger Sensorik (Level, pH, ORP)

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

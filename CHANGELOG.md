# Changelog – ioBroker.poolcontrol

Alle nennenswerten Änderungen dieses Projekts werden in dieser Datei dokumentiert.  
Die Versionsnummern folgen dem Schema **MAJOR.MINOR.PATCH**.

---

## v0.7.4 (2025-12-03)
- Fix Bug in Controlhelper. Persistenter Schutz bei control.circulation.mode

---

## v0.7.0 (2025-11-29)
- Einführung eines neuen Drucksensor-Systems unter `pump.pressure.*`
- Unterstützung externer Drucksensor-ObjektID (bar-Wert aus ioBroker)
- Trenderkennung (steigend/fallend/stabil) und gleitender Druckdurchschnitt
- Selbstlernende Min-/Max-Druckwerte mit manuellem Reset-State
- Neuer Diagnose-Text (`status_text_diagnostic`) mit erweiterten Analyseinformationen
- Erweiterte Pumpenüberwachung ohne automatische Steuerlogik (rein informativ)

---

## v0.6.2 (2025-11-07)
- Überarbeitung der Instanzübersicht mit neuen Header-Strukturen für klarere Bedienung
- Neues Startseitenbild „Egon im Blaumann“ in der Admin-Oberfläche integriert
- Erweiterung des Sprachsystems um konfigurierbare Alexa-Ausgabezeiten
- Anpassungen und Aufräumarbeiten in jsonConfig, speechHelper und speechStates

---

## v0.6.0 (2025-11-03)
- Einführung der vollständigen Photovoltaik-Steuerung mit automatischer Pumpenlogik  
  (neuer Pumpenmodus `Automatik (PV)` unter `pump.mode`)
- Adapter reagiert auf PV-Überschuss basierend auf konfigurierbarer Hausverbrauchs- und Erzeugungsleistung
- Einschaltlogik: Pumpe EIN bei Überschuss ≥ (Nennleistung + Schwellwert)
- Berücksichtigung von Saisonstatus, Nachlaufzeit und optionalem „Umwälzung erreicht“-Schutz
- Automatische Migration ergänzt neuen Modus `auto_pv` in bestehenden Installationen
- Verbesserte interne Logik, Persistenz und Debug-Protokollierung

---

## v0.5.5 (2025-11-01)
- Endlosschleife in Statistik Woche und Monat behoben

---

## v0.5.3 (2025-10-30)
- Telegram-Benutzerwahl hinzugefügt

---

## v0.5.2 (2025-10-30)
- Erweitertes Helper-Vorrangssystem: Konflikte zwischen Zeit- und Solarsteuerung behoben
- Frostschutz pausiert während Zeitfenster. Nun stabiles Pumpenverhalten und Verbesserte
  Koordination zwischen den Helpern

---

## v0.5.0 (2025-10-28)
- Erweiterung der Temperaturstatistik um Wochen- und Monatsauswertung  
  (`analytics.statistics.temperature.week` / `.month`)
- Eigenständige, eventbasierte Helper für Woche und Monat
- Persistente Datenpunkte mit automatischen JSON- und HTML-Zusammenfassungen
- Vorbereitung für zukünftige Erweiterungen (Saison- und Jahresstatistik)


---


### **0.4.0 (26.10.2025)**

**Neue Funktionen**
- Einführung des neuen Statistik-Systems unter `analytics.statistics.temperature.today`
- Automatische Erfassung von **Min-, Max- und Durchschnittswerten** aller aktiven Temperatursensoren
- Pro Sensor: JSON- und HTML-Zusammenfassungen mit laufender Aktualisierung
- Gesamtausgabe aller Sensoren (Tabelle) unter  
  `analytics.statistics.temperature.today.outputs.summary_all_html`
- Vollständig **persistente Datenpunkte** mit Überinstallationsschutz
- **Automatischer Mitternachts-Reset** zur Tagesrücksetzung inkl. Zeitstempel
- Vorbereitung für zukünftige Wochen-, Monats- und Saisonstatistiken

**Verbesserungen**
- Einheitliche Struktur durch neuen Hauptordner `analytics`
- Keine dauerhaften Loops oder Timerbelastungen – reine Eventverarbeitung
- Verbesserte Performance und Speicherstabilität
- Überarbeitete Initialisierung aller Statistik-States beim Start

**Hinweis**
Diese Version bildet die stabile Basis für alle folgenden Statistik- und Analysefunktionen  
(z. B. Wochen- und Monatsstatistik, Historien- und Effizienz-Auswertungen).


---


### 0.3.1 (2025-10-18)
- FrostHelper stabilisiert:
  - Feste Hysterese von +2 °C (bisher +1 °C)
  - Ganzzahl-Rundung eingeführt zur Vermeidung von Schaltflattern um 3 °C
  - Keine Änderungen an States oder Konfiguration erforderlich


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

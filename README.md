# ioBroker.poolcontrol

![Test and Release](https://github.com/DasBo1975/ioBroker.poolcontrol/actions/workflows/test-and-release.yml/badge.svg)
![npm](https://img.shields.io/npm/v/iobroker.poolcontrol?color=blue)
![Downloads](https://img.shields.io/npm/dm/iobroker.poolcontrol)
![Installs](https://iobroker.live/badges/poolcontrol-installed.svg)
![Stable](https://iobroker.live/badges/poolcontrol-stable.svg)
[![License](https://img.shields.io/github/license/DasBo1975/ioBroker.poolcontrol?cacheSeconds=3600)](https://github.com/DasBo1975/ioBroker.poolcontrol/blob/main/LICENSE)

---

## Beschreibung

Der Adapter **ioBroker.poolcontrol** dient zur Steuerung und Überwachung von Poolanlagen.  
Er ermöglicht die Automatisierung von Pumpen-, Temperatur- und Solarsteuerung sowie die Verbrauchsauswertung.

---

## Funktionen

- **Pumpensteuerung**
  - Betriebsmodi: Automatik, Manuell, Zeitsteuerung, Aus
  - Fehlererkennung (kein Stromverbrauch, Leistung trotz „AUS“, Überlast)
  - Sicherheitsfunktionen (Frostschutz, Überhitzungsschutz)

- **Temperaturverwaltung**
  - Bis zu 6 Sensoren (Oberfläche, Grund, Vorlauf, Rücklauf, Kollektor, Außentemperatur)
  - Tages-Minimum / -Maximum
  - Änderung pro Stunde
  - Differenzen (z. B. Kollektor – Luft, Oberfläche – Grund, Vorlauf – Rücklauf)

- **Solarsteuerung**
  - Ein-/Ausschaltgrenzen mit Hysterese
  - Kollektor-Warnung (mit automatischer Rücksetzung bei 10 % unter der Schwelle)
  - Optionale Sprachausgabe bei Warnung

- **Zeitsteuerung**
  - Bis zu 3 frei konfigurierbare Zeitfenster pro Woche

- **Laufzeit & Umwälzung**
  - Zählt Laufzeiten (heute, gesamt)
  - Berechnet tägliche Umwälzung und Restmenge

- **Verbrauch & Kosten**
  - Auswertung eines externen kWh-Zählers
  - Tages-, Wochen-, Monats- und Jahresverbrauch
  - Berechnung der Stromkosten anhand konfigurierbarem Preis  

  **Hinweis:**  
  Details zum Verhalten der Verbrauchs- und Kostenwerte (z. B. bei Neustarts oder beim Wechsel des Stromzählers) finden Sie in der Datei [help.md](./help.md).

- **Sprachausgaben**
  - Ausgabe über Alexa oder Telegram
  - Ansagen bei Pumpenstart/-stopp, Fehlern oder Temperaturschwellen

- **SystemCheck (Diagnosebereich)**
  Ab Version **0.2.0** enthält der Adapter einen neuen Diagnosebereich **SystemCheck**.  
  Er bietet interne Debug-Logs, mit denen bestimmte Teilbereiche (z. B. Pumpen-, Solar- oder Temperatursteuerung) gezielt überwacht werden können.

  *Funktionen:*
  - Auswahl des zu überwachenden Bereichs
  - Fortlaufendes Log der letzten Änderungen
  - Manuelles Löschen des Logs möglich

  Dieser Bereich dient ausschließlich der Analyse und Fehlerdiagnose.  
  Im normalen Betrieb sollte die Überwachung deaktiviert bleiben.

---

## Installation

1. Adapter über ioBroker Admin installieren.  
2. Instanz anlegen.  
3. Konfiguration im Admin-Tab vornehmen: Pumpenleistung, Sensoren, Solar, Sprachausgaben usw.

---

## Konfiguration

Die Konfiguration erfolgt über Tabs im Admin-Interface:
- **Allgemein** → Poolname, Poolgröße, minimale Umwälzung  
- **Pumpe** → Pumpenleistung, Leistungsgrenzen, Sicherheitsfunktionen  
- **Temperaturen** → Auswahl und Objekt-IDs der Sensoren  
- **Solarverwaltung** → Ein-/Ausschaltgrenzen, Hysterese, Warnschwelle  
- **Zeitsteuerung** → Zeitfenster für Pumpenbetrieb  
- **Sprachausgaben** → Aktivierung, Alexa/Telegram-Anbindung  
- **Verbrauch & Kosten** → externer kWh-Zähler, Strompreis  

---

## Geplante Erweiterungen

- Rückspülerinnerung (Intervall in Tagen, Erinnerung über State)  
- Wartung Kesseldruck (maximaler Druck, Warnung bei Überschreitung)  
- Weitere Komfortfunktionen nach Praxistests  
- Kesseldruck-Wartung / Drucksensor-Warnung
- PV-Überschuss-Steuerung (für z.B. Pumpe oder Wärmepumpe)
- Zweite Pumpe (z.B. Wärmetauscher)
- Statistikbereich 
- Eigene Widgets für VIS/VIS2
- Erweiterung Wärmepumpen-/Heizlogik
- Steuerung von Poolbeleuchtung
- Steuerung von Poolrobotern
- Steuerung von elektrischen Ventilen 
- Steuerung von Gegenstromanlagen

---

## Hinweis

Der Adapter befindet sich aktuell in der Entwicklung.  
Funktionen können sich ändern – bitte regelmäßig den Changelog beachten.

---

## Dokumentation
- [help.md (ausführliche Beschreibung und Hinweise)](./help.md)

---

## Changelog
### **WORK IN PROGRESS**

## v0.5.5 (2025-11-01)
- Endlosschleife in Statistik Woche und Monat behoben

## v0.5.3 (2025-10-30)
- Telegram-Benutzerwahl hinzugefügt

## v0.5.2 (2025-10-30)
- Erweitertes Helper-Vorrangssystem: Konflikte zwischen Zeit- und Solarsteuerung behoben
- Frostschutz pausiert während Zeitfenster. Nun stabiles Pumpenverhalten und Verbesserte
  Koordination zwischen den Helpern

## v0.5.0 (2025-10-28)
- Erweiterung der Temperaturstatistik um Wochen- und Monatsauswertung  
  (`analytics.statistics.temperature.week` / `.month`)
- Eigenständige, eventbasierte Helper für Woche und Monat
- Persistente Datenpunkte mit automatischen JSON- und HTML-Zusammenfassungen
- Vorbereitung für zukünftige Erweiterungen (Saison- und Jahresstatistik)


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

### 0.3.0 (12.10.2025)
**Neu:** Intelligentes Pumpen-Monitoring & Lernsystem

- Hinzugefügt: **Reelle Durchflussberechnung** auf Basis der tatsächlichen Leistungsaufnahme.  
- Neuer Bereich **`pump.live`** zur Live-Überwachung von Leistung, Durchfluss und prozentualer Auslastung.  
- Die **tägliche Umwälzberechnung** verwendet nun den realen Durchflusswert anstelle eines Fixwerts.  
- Neuer Lernbereich **`pump.learning`**:
  - Lernt automatisch die durchschnittlichen Leistungs- und Durchflusswerte.  
  - Bestimmt daraus einen dynamischen **Normalbereich (± 15 %)**.  
  - Berechnet prozentuale Abweichungen und erstellt **textbasierte Statusmeldungen**.  
  - Alle Lernwerte werden **persistent** gespeichert und bleiben auch nach Neustart erhalten.  
- Vollständig **ereignisgesteuerte Logik** ohne zusätzliche Timer oder Polling-Zyklen.  

> Mit dieser Version beginnt die lernfähige Phase des PoolControl-Adapters:  
> Deine Pumpe weiß jetzt selbst, was für sie „normal“ ist.


*(ältere Versionen siehe [io-package.json](./io-package.json))*  

---

## Support
- [ioBroker Forum](https://forum.iobroker.net/)  
- [GitHub Issues](https://github.com/DasBo1975/ioBroker.poolcontrol/issues)

---

## Unterstützung der Adapterentwicklung
Wenn Ihnen **ioBroker.poolcontrol** gefällt, denken Sie bitte über eine Spende nach:  
➡️ [Unterstützen via PayPal](https://www.paypal.com/donate?business=dirk.bertin@t-online.de)

---

## Haftungsausschluss
Die Nutzung des Adapters erfolgt **auf eigene Gefahr**.  
Der Entwickler übernimmt **keine Haftung** für Schäden, die durch die Installation, Nutzung oder Fehlfunktionen entstehen.  
Dies gilt insbesondere bei direkter Ansteuerung von elektrischen Geräten (z. B. Poolpumpen).  
Der Nutzer ist für die **sichere Installation und den Betrieb seiner Hardware** verantwortlich.

---

## License
Copyright (c) 2025 DasBo1975 <dasbo1975@outlook.de>  

MIT License

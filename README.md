# ioBroker.poolcontrol

![Test and Release](https://github.com/DasBo1975/iobroker.poolcontrol/actions/workflows/test-and-release.yml/badge.svg)
![npm](https://img.shields.io/npm/v/iobroker.poolcontrol?color=blue)
![Downloads](https://img.shields.io/npm/dm/iobroker.poolcontrol)
![Installs](https://iobroker.live/badges/poolcontrol-installed.svg)
![Stable](https://iobroker.live/badges/poolcontrol-stable.svg)
[![License](https://img.shields.io/github/license/DasBo1975/ioBroker.poolcontrol?cacheSeconds=3600)](https://github.com/DasBo1975/ioBroker.poolcontrol/blob/main/LICENSE)

Der Adapter **ioBroker.poolcontrol** dient zur Steuerung und Überwachung von Poolanlagen.  
Er ermöglicht die Automatisierung von Pumpen, Temperatur- und Solarsteuerung sowie Verbrauchsauswertung.  

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
  - Optional Sprachausgabe bei Warnung

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

---

## Installation

1. Adapter über ioBroker Admin installieren.  
2. Instanz anlegen.  
3. Konfiguration im Admin-Tab vornehmen: Pumpenleistung, Sensoren, Solar, Sprachausgaben, etc.  

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

---

## Hinweis

Der Adapter befindet sich aktuell in der Entwicklung.  
Funktionen können sich ändern, bitte regelmäßig den Changelog beachten.  

---

## Dokumentation
- [Help.md (ausführliche Beschreibung und Hinweise)](./help.md)

---

## Changelog
Auszug, vollständige Liste siehe `io-package.json`:

### 0.1.2
- Verbesserung: Beim Adapterstart werden nun die letzten bekannten Temperaturwerte aller aktiven Sensoren (z. B. Oberfläche, Kollektor, Außentemperatur usw.) automatisch übernommen.  
- Dadurch werden auch Sensoren korrekt angezeigt, die ihren Messwert nur selten aktualisieren (z. B. Homematic oder stromsparende Funk-Sensoren).  
- Keine Änderung am Verhalten der restlichen Logik, reine Komfort- und Stabilitätsverbesserung.

### 0.1.1
- Fehlerbehebung: Endlosschleife zwischen `pump_switch` und externer Steckdose (`deviceId`) behoben, die bei bestimmten Smart-Steckdosen (z. B. Shelly, Tasmota, FritzDECT) auftreten konnte.  
- Verbesserte Stabilität im `pumpHelper` durch interne Rückkopplungsprüfung.  
- Keine Änderungen an bestehenden Konfigurationen erforderlich.

### 0.1.0
- Sprachausgabe über **E-Mail** hinzugefügt (konfigurierbar: Instanz, Empfänger, Betreff).
- Erweiterung der Instanz-Konfiguration im Tab „Sprachausgaben“.
  **Bugfixes**
- Kleinere Korrekturen und Optimierungen in der Dokumentation (`help.md`).
- Logging in `speechHelper` verbessert.

### 0.0.10

Statusübersicht
Ab Version 0.0.10 gibt es einen eigenen Bereich `status.*` mit folgenden Datenpunkten:

- **status.summary** → Textübersicht (Pumpe, Modus, Temperaturen, Laufzeit, Umwälzung)
- **status.overview_json** → Übersicht als JSON (maschinenlesbar)
- **status.last_summary_update** → Zeitpunkt der letzten Aktualisierung
- **status.pump_last_start** → Letzter Pumpenstart (Zeitstempel)
- **status.pump_last_stop** → Letztes Pumpenende (Zeitstempel)
- **status.pump_was_on_today** → Boolean, ob die Pumpe heute lief
- **status.pump_today_count** → Anzahl der Starts heute (Reset um Mitternacht)
- **status.system_ok** → Boolean, ob das System fehlerfrei läuft
- **status.system_warning** → Boolean, wenn eine Warnung aktiv ist
- **status.system_warning_text** → Beschreibung der aktiven Warnung
- **status.season_active** → Anzeige, ob die Poolsaison aktiv ist

Diese Datenpunkte sind besonders für **VIS/vis2, Alexa- oder Telegram-Ausgaben** gedacht, da sie eine schnelle Übersicht über den aktuellen Poolstatus bieten.


### 0.0.9
- Laufzeit-, Umwälz-, Verbrauch-/Kosten- und Temperatur-Min/Max-States sind jetzt persistent  
  (Werte bleiben nach Adapter-Neustart oder Stromausfall erhalten)

### 0.0.8
- Hilfetab in der Instanzkonfiguration hinzugefügt (mit Link zur GitHub-Dokumentation)

### 0.0.7
- Help-Datei (`help.md`) und erste README-Version hinzugefügt

### 0.0.1
- initial release

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
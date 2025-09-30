# ioBroker.poolcontrol

![Test and Release](https://github.com/DasBo1975/iobroker.poolcontrol/actions/workflows/test-and-release.yml/badge.svg)

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

### 0.0.7
- Help-Datei (`help.md`) und erste README-Version hinzugefügt

### 0.0.6
- Verbrauchs- und Kostenberechnung mit externem kWh-Zähler

### 0.0.5
- Sprachausgabe über Alexa und Telegram

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

## LICENSE
[MIT](./LICENSE) License  
Copyright (c) 2025 DasBo1975

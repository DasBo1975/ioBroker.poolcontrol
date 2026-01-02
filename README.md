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
  - Betriebsmodi: Automatik, Automatik (PV), Manuell, Zeitsteuerung, Aus
  - Automatik (PV) steuert die Pumpe abhängig vom Photovoltaik-Überschuss
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

- **Heizungs- / Wärmepumpensteuerung (neu, Testphase)**
  - Automatische Steuerung von Heizstab oder Wärmepumpe auf Basis der Pooltemperatur
  - Zieltemperatur und maximale Sicherheitstemperatur konfigurierbar
  - Aktiv nur bei:
    - aktiver Poolsaison
    - Pumpenmodus **Automatik**
    - nicht aktivem Wartungsmodus
  - Vorranglogik:
    - Wartungsmodus blockiert die Heizungssteuerung vollständig
    - Heizung greift nicht in manuelle oder zeitgesteuerte Pumpenmodi ein
  - Pumpen-Nachlaufzeit nach Heizende konfigurierbar
  - Ownership-Schutz:
    - Die Pumpe wird nur dann ausgeschaltet, wenn sie zuvor vom heatHelper selbst eingeschaltet wurde
  - Unterstützt:
    - schaltbare Steckdosen **oder**
    - boolesche Steuer-States externer Heizungen
  - Interner Status- und Diagnosebereich unter `heat.*`
  - Rein steuernd, **keine Chemie- oder Solarlogik**
  
  **Hinweis:**  
  Diese Funktion befindet sich aktuell in einer **Testphase**.  
  Die Logik ist vollständig implementiert, sollte aber zunächst nur mit interessierten Test-Usern eingesetzt werden.

- **Photovoltaiksteuerung (seit v0.6.0)**
  - Automatische Pumpensteuerung auf Basis von PV-Erzeugung und Hausverbrauchs
  - Einschaltlogik: Überschuss ≥ (Pumpen-Nennleistung + Sicherheitsaufschlag)
  - Optionaler Nachlauf bei Wolkenphasen
  - Ignorieren bei erreichter Tagesumwälzung
  - Konfiguration über zwei Fremd-Objekt-IDs (power_generated_id, power_house_id)
  - Neuer Pumpenmodus „Automatik (PV)

- **Zeitsteuerung**
  - Bis zu 3 frei konfigurierbare Zeitfenster pro Woche

- **Laufzeit & Umwälzung**
  - Zählt Laufzeiten (heute, gesamt)
  - Berechnet tägliche Umwälzung und Restmenge
  - Rückspülerinnerung mit konfigurierbarem Intervall (z. B. alle 7 Tage)
  - Anzeige der letzten Rückspülung inkl. Datum
  - Automatische Rücksetzung nach erfolgter Rückspülung
  - PV-Modus berücksichtigt Umwälzstatus (z. B. „Ignoriere bei Umwälzung erreicht“)

- **Verbrauch & Kosten**
  - Auswertung eines externen kWh-Zählers
  - Tages-, Wochen-, Monats- und Jahresverbrauch
  - Berechnung der Stromkosten anhand konfigurierbarem Preis  

  **Hinweis:**  
  Details zum Verhalten der Verbrauchs- und Kostenwerte (z. B. bei Neustarts oder beim Wechsel des Stromzählers) finden Sie in der Datei 
  [help.md](https://github.com/DasBo1975/ioBroker.poolcontrol/blob/main/admin/help.md)


- **Statistiksystem**
  - Bereich `analytics.statistics.*` mit Tages-, Wochen- und Monatswerten
  - Automatische Berechnung von Min-, Max-, Durchschnitts- und Laufzeitwerten
  - Vollständig persistente Datenpunkte (Überinstallationsschutz)
  - HTML- und JSON-Zusammenfassungen pro Sensor und Gesamtübersicht

- **Drucksensor-Integration (seit v0.7.x)**
  - Echtzeit-Filterdruckmessung
  - Trendanalyse: steigend / fallend / stabil
  - Gleitender lernender Durchschnitt (avg_bar)
  - Selbstlernende Min-/Max-Druckwerte
  - Diagnosetext + letzte Aktualisierung
  - Keine automatische Steuerung – rein informativ
  - Normaldruckbereich durch Benutzer einstellbar

- **KI-System (ab v0.8.0)**
  - Module: Wetterhinweise (Open-Meteo), Pooltipps, Tageszusammenfassung, Wochenendbericht
  - Automatische Textausgaben mit optionaler Sprachausgabe
  - Stündliche Wetter-Updates zur laufenden Aktualisierung
  - Anti-Spam-System zur Vermeidung doppelter Hinweise
  
    - **Vorhersage für morgen (aiForecastHelper, ab v0.8.0)**
    - Erstellt automatisch eine tägliche Wetterprognose für den Folgetag
    - Analyse von Temperatur, Wetterlage, Regenwahrscheinlichkeit und Windstärke
    - Erzeugt Pool-Empfehlungen für den nächsten Tag (z. B. Abdeckung schließen, wenig Solarwärme zu erwarten)
    - Läuft vollständig eventbasiert und benötigt nur die Open-Meteo-Daten aus den ioBroker-Geodaten
    - Separate Schalter unter `ai.weather.switches.*` zum Aktivieren/Deaktivieren einzelner Prognosefunktionen
    - Ergebnisse werden unter `ai.weather.outputs.forecast_text` gespeichert

      - **Chemie-Hilfe (aiChemistryHelpHelper, ab v0.8.x)**
    - Interaktive, rein informative KI-Hilfe zur Wasserchemie
    - Auswahl typischer Poolprobleme über ein Auswahlfeld (z. B. pH zu hoch/niedrig, Chlor wirkt nicht, Wasser grün/trüb)
    - Ausgabe verständlicher Ursachen- und Lösungsbeschreibungen als Text
    - Keine automatische Dosierung
    - Keine Produktempfehlungen
    - Keine Steuerung von Geräten
    - Keine Sprachausgabe (rein visuelle Information)
    - Ziel: Ursachen verstehen und strukturiert vorgehen (messen → korrigieren → filtern → erneut messen)
    - Datenpunkte unter `ai.chemistry_help.*`

  
- **Info-System (seit v0.7.x)**
  - Informationssystem des Adapters
  - Saisonale Grüße (Weihnachten, Silvester, Neujahr, Ostern)
  - Anzeige der installierten Adapterversion
   
- **Sprachausgaben**
  - Ausgabe über Alexa oder Telegram
  - Ansagen bei Pumpenstart/-stopp, Fehlern oder Temperaturschwellen

- **SystemCheck (Diagnosebereich)**
  - Interner Diagnosebereich für Debug- und Überwachungsfunktionen
  - Auswahl des zu überwachenden Bereichs (z. B. Pumpe, Solar, Temperatur)
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

- Erweiterte PV- und Solar-Effizienzanalyse (COP-Berechnung, Tagesnutzen, Wetterintegration)
- Statistik-Exportfunktion (CSV/Excel)
- Diagnostic-Helper zur automatischen Systemprüfung
- Eigene Widgets für VIS/VIS2 (grafische Pool- und Solarvisualisierung)
- Steuerung von Poolbeleuchtung, Ventilen und Gegenstromanlagen
- Integration zusätzlicher Sensorboxen (z. B. TempBox, PressureBox, LevelBox)
- KI- und Sprach-Assistenten-Erweiterung (Pool-Tagesbericht, Tipps, Sprachbefehle)


---

## Hinweis

Der Adapter befindet sich in aktiver Weiterentwicklung.
Neue Funktionen werden regelmäßig ergänzt – bitte den Changelog beachten.

---

## Dokumentation
- [help.md (ausführliche Beschreibung und Hinweise)](./help.md)

---

## Changelog
### **WORK IN PROGRESS**

## v1.0.0 Zusatz-Aktoren (Beleuchtung & Zusatzpumpen) (02.01.2026)
  - Steuerung optionaler Pool-Aktoren:
    - Poolbeleuchtung (bis zu 3 Kanäle)
    - Zusatzpumpen / Attraktionen (bis zu 3 Kanäle)
  - Vollständige Konfiguration über die Admin-Oberfläche:
    - Aktivierung pro Aktor über Checkbox
    - Hinterlegung einer **externen Objekt-ID**
      (z. B. schaltbare Steckdose oder boolescher Steuer-State)
  - Unterstützte Betriebsarten:
    - Ein / Aus
    - Zeitbetrieb (Laufzeit in Minuten)
    - Dauerbetrieb
  - Interne Status- und Steuer-States:
    - aktueller Betriebszustand
    - verbleibende Restlaufzeit
    - Schaltstatus und Betriebsmodus
  - Klare Systemtrennung:
    - Zusatz-Aktoren beeinflussen **keine**
      Pumpen-, Solar-, Heizungs- oder KI-Logik
    - Rein optionale Erweiterung des Systems


## v0.9.0 (WORK IN PROGRESS)
- Einführung der Heizungs- / Wärmepumpensteuerung (`heatHelper`)
- Automatische Heizanforderung basierend auf Pooltemperatur
- Ziel- und Maximaltemperatur konfigurierbar
- Unterstützung von:
  - schaltbaren Steckdosen
  - booleschen Steuer-States
- Pumpen-Nachlaufzeit nach Heizende
- Vorrangsystem:
  - Wartungsmodus blockiert Heizungssteuerung
  - Aktiv nur im Automatikmodus
  - Berücksichtigung des Saisonstatus
- Ownership-Schutz für Pumpensteuerung
- Neuer interner State `heat.heating_request` für externe Auswertung


## v0.8.2 (2025-12-25)
- Neues KI-Modul **Chemie-Hilfe** (`aiChemistryHelpHelper`)
- Rein informatives Hilfesystem zur Poolwasserchemie
- Auswahl typischer Poolprobleme (z. B. pH zu hoch/niedrig, Chlor wirkt nicht, Wasser grün/trüb)
- Verständliche Ursachen- und Lösungshinweise als Textausgabe
- Keine automatische Dosierung
- Keine Produktempfehlungen
- Keine Geräte- oder Pumpensteuerung
- Keine Sprachausgabe (rein visuelle Information)
- Neue Datenpunkte unter `ai.chemistry_help.*`


## v0.8.0 (2025-12-08)
- Module: Wetterhinweise (Open-Meteo), Pooltipps, Tageszusammenfassung, Wochenendbericht
- Automatische Textausgaben mit optionaler Sprachausgabe
- Stündliche Wetter-Updates zur laufenden Aktualisierung
- Anti-Spam-System zur Vermeidung doppelter Hinweise
- Neues KI-Vorhersagesystem `aiForecastHelper` integriert
- Erstellt täglich eine automatische „Vorhersage für morgen“ mit:
  - Temperaturspanne
  - Wetterlage (Beschreibung)
  - Regenwahrscheinlichkeit
  - Windanalyse (leicht / frisch / stark)
  - Pool-Empfehlungen für den Folgetag
- Neue Schalter, Zeitpläne und Ausgaben unter `ai.weather.*`
- Sofortige initiale Ausführung nach Instanzstart hinzugefügt
- Erweiterung der Admin-Übersicht unter „Hilfe & Info“ um wichtige KI-Hinweise
- Verbesserte interne Struktur des KI-Systems (aiHelper + aiForecastHelper)


## v0.7.4 (2025-12-03)
- Fix Bug in Controlhelper. Persistenter Schutz bei control.circulation.mode


## v0.7.0 (2025-11-29)
- Einführung eines neuen Drucksensor-Systems unter `pump.pressure.*`
- Unterstützung externer Drucksensor-ObjektID (bar-Wert aus ioBroker)
- Trenderkennung (steigend/fallend/stabil) und gleitender Druckdurchschnitt
- Selbstlernende Min-/Max-Druckwerte mit manuellem Reset-State
- Neuer Diagnose-Text (`status_text_diagnostic`) mit erweiterten Analyseinformationen
- Erweiterte Pumpenüberwachung ohne automatische Steuerlogik (rein informativ)


## v0.6.2 (2025-11-07)
- Überarbeitung der Instanzübersicht mit neuen Header-Strukturen für klarere Bedienung
- Neues Startseitenbild „Egon im Blaumann“ in der Admin-Oberfläche integriert
- Erweiterung des Sprachsystems um konfigurierbare Alexa-Ausgabezeiten
- Anpassungen und Aufräumarbeiten in jsonConfig, speechHelper und speechStates


## v0.6.0 (2025-11-03)
- Einführung der vollständigen Photovoltaik-Steuerung mit automatischer Pumpenlogik  
  (neuer Pumpenmodus `Automatik (PV)` unter `pump.mode`)
- Adapter reagiert auf PV-Überschuss basierend auf konfigurierbarer Hausverbrauchs- und Erzeugungsleistung
- Einschaltlogik: Pumpe EIN bei Überschuss ≥ (Nennleistung + Schwellwert)
- Berücksichtigung von Saisonstatus, Nachlaufzeit und optionalem „Umwälzung erreicht“-Schutz
- Automatische Migration ergänzt neuen Modus `auto_pv` in bestehenden Installationen
- Verbesserte interne Logik, Persistenz und Debug-Protokollierung

## v0.5.5 (2025-11-01)
- Endlosschleife in Statistik Woche und Monat behoben

## v0.5.3 (2025-10-30)
- Telegram-Benutzerwahl hinzugefügt

## v0.5.2 (2025-10-30)

## v0.5.0 (2025-10-28)

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

## Lizenz & Rechtliches

PoolControl ist ein von D. Bertin (DasBo1975) entwickeltes Open-Source-Projekt.
- Der Name PoolControl sowie das zugehörige Logo sind Eigenentwicklungen und dürfen
  im Rahmen der Open-Source-Veröffentlichung (Adapter, GitHub-Repository, Wiki, Dokumentation,
  Visualisierungen) frei verwendet werden.

- Eine kommerzielle Nutzung, Weitergabe oder Veröffentlichung in abgewandelter Form
 (insbesondere als Teil eines kommerziellen Produkts oder Dienstes) bedarf der ausdrücklichen Zustimmung des Autors.

- Alle entwickelten Sensor‑, Hardware‑ und Gehäusekonstruktionen
 (z. B. Temperatur‑, Druck‑, Pegel‑, Elektronik‑ oder Steuerboxen) inklusive Entwürfen, Schaltplänen,
 3D‑Modellen und Innenaufbauten unterliegen dem Urheberrecht von D. Bertin (DasBo1975).

- Veröffentlichung, Nachbau zum Zweck des Weiterverkaufs oder kommerzielle Nutzung dieser
  Hardware‑Designs ist nur mit schriftlicher Genehmigung des Autors gestattet.

Der Software‑Quellcode dieses Projekts steht unter der MIT License. Details siehe LICENSE.

---

## License
Copyright (c) 2025–2026 D. Bertin (DasBo1975) <dasbo1975@outlook.de>  

MIT License

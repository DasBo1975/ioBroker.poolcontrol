# Analytics – Temperaturstatistik

Der Bereich `analytics.statistics.temperature.*` enthält die vollständige
statistische Auswertung aller **aktiven Temperatursensoren** im PoolControl-Adapter.

Dieser Bereich dient **ausschließlich der Analyse und Auswertung**.
Er nimmt **keine Steuerung** vor und beeinflusst **keine Logik** anderer Helper.

Alle Statistik-Datenpunkte sind **persistent** und bleiben auch bei
Neustarts, Updates oder Überinstallationen erhalten.

---

## Grundprinzip

- Es werden **nur aktive Sensoren** berücksichtigt
- Jeder Zeitraum (Tag, Woche, Monat) wird **eigenständig** ausgewertet
- Die Berechnung erfolgt **eventbasiert**, nicht per Dauertimer
- Mitternacht erfolgt ein **automatischer Tageswechsel**

---

## Strukturübersicht

analytics.statistics.temperature
├── today
├── week
├── month


Jeder dieser Bereiche besitzt die **gleiche logische Struktur**.

---

## statistics.temperature.today

Tagesbezogene Statistik der Temperaturen (0:00 – 23:59 Uhr).

### Typische Inhalte

- Minimum-Temperatur
- Maximum-Temperatur
- Durchschnittstemperatur
- Letzter gemessener Wert
- Temperaturänderung (Delta)
- Zeitstempel der letzten Aktualisierung

Der Tagesbereich wird **automatisch um Mitternacht zurückgesetzt**.

---

## statistics.temperature.week

Wochenstatistik (Montag bis Sonntag).

### Eigenschaften

- Aggregiert die Tageswerte
- Kein Reset bei Neustart
- Fortschreibend über die laufende Woche
- Automatischer Wechsel zur neuen Woche

Geeignet zur Erkennung von:
- Abkühlungs- oder Erwärmungstrends
- Wetterabhängiger Schwankungen

---

## statistics.temperature.month

Monatliche Statistik (Kalendermonat).

### Eigenschaften

- Aggregiert alle Tageswerte des Monats
- Persistente Speicherung
- Automatischer Monatswechsel
- Grundlage für saisonale Vergleiche

---

## Sensorbezogene Auswertung

Innerhalb jedes Zeitraums werden die Werte **sensorbezogen** geführt.

Beispiele:
- Oberflächentemperatur
- Grundtemperatur
- Kollektortemperatur
- Außentemperatur
- Vorlauf / Rücklauf

Nicht vorhandene oder deaktivierte Sensoren werden **automatisch ignoriert**.

---

## Output-Bereiche (Zusammenfassungen)

Zusätzlich zu Einzelwerten erzeugt der Statistikbereich
automatisch **zusammenfassende Ausgaben**, z. B.:

- JSON-Zusammenfassungen (maschinenlesbar)
- HTML-Zusammenfassungen (Visualisierung)
- Gesamtauswertung aller Sensoren

Diese Outputs werden z. B. von:
- Visualisierungen
- Textausgaben
- KI-Modulen

weiterverwendet.

---

## Wichtige Hinweise

- Der Statistikbereich ist **rein informativ**
- Es erfolgt **keine automatische Steuerung**
- Änderungen an Sensoren wirken sich **sofort** auf die Statistik aus
- Alte Werte bleiben erhalten, neue Sensoren starten leer

---

## Ziel des Statistiksystems

Der Statistikbereich bildet die **Grundlage für Analyse, Diagnose
und zukünftige Erweiterungen**, z. B.:

- Trend-Erkennung
- Effizienz-Auswertung
- KI-Analysen
- Exportfunktionen (CSV / Excel)

Er ist bewusst **modular, erweiterbar und zukunftssicher** aufgebaut.

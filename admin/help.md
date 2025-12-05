<!-- PoolControl Help File – maintained manually. Do NOT remove this header. -->

# PoolControl – Hilfe & Dokumentation

Willkommen zur Hilfe-Datei des Adapters **ioBroker.poolcontrol**.  
Diese Dokumentation erklärt alle Einstellungen, Datenpunkte und automatischen Funktionen des Adapters in einer Mischung aus verständlichen Erklärungen und technischen Details.

---

# 📚 Inhaltsverzeichnis

1. [Einleitung & Grundprinzipien](#einleitung--grundprinzipien)  
2. [Überblick – Was macht der Adapter?](#überblick--was-macht-der-adapter)  
3. [Admin-Konfiguration (Tabs)](#admin-konfiguration-tabs)  
   - [3.1 Allgemeine Einstellungen](#31-allgemeine-einstellungen)  
   - [3.2 Pumpe](#32-pumpe)  
   - [3.3 Temperaturverwaltung](#33-temperaturverwaltung)  
   - [3.4 Solarverwaltung](#34-solarverwaltung)  
   - [3.5 Photovoltaik (PV)](#35-photovoltaik-pv)  
   - [3.6 KI-System (AI)](#36-ki-system-ai)  
   - [3.7 Sprachausgaben](#37-sprachausgaben)  
   - [3.8 Zeitsteuerung](#38-zeitsteuerung)  
   - [3.9 Debug & SystemCheck](#39-debug--systemcheck)  
4. [Objektbaum – Datenpunkte erklärt](#objektbaum--datenpunkte-erklärt)  
   - pump.*  
   - pump.pressure.*  
   - temperature.*  
   - solar.*  
   - photovoltaic.*  
   - runtime.*  
   - circulation.*  
   - consumption.*  
   - control.*  
   - status.*  
   - info.*  
   - ai.*  
   - systemcheck.*  
5. [Automatische Logiken & Helfer](#automatische-logiken--helfer)  
6. [Fehlererkennung & Warnungen](#fehlererkennung--warnungen)  
7. [Sprachausgaben & Benachrichtigungen](#sprachausgaben--benachrichtigungen)  
8. [FAQ & Tipps](#faq--tipps)

---

# 1. Einleitung & Grundprinzipien

Der PoolControl-Adapter automatisiert und überwacht Ihre gesamte Pooltechnik:

- Pumpensteuerung  
- Temperaturverwaltung  
- Solarreglung  
- Photovoltaik-Unterstützung  
- Drucksensoranalyse  
- Verbrauchs- und Kostenerfassung  
- Status- und Diagnosefunktionen  
- KI-basierte Wetter- und Poolhinweise  
- Rückspülung, Wartungsmodus und Nachpumpen  

Alle Datenpunkte werden im Objektbaum strukturiert angelegt und stehen VIS, Blockly und anderen Adaptern zur Verfügung.

---

# 2. Überblick – Was macht der Adapter?

### ✔ Pumpe vollautomatisch steuern  
Solar, PV, Frost, Zeitmodus, Wartung, Rückspülen, Nachpumpen.

### ✔ Temperaturen auswerten  
Bis zu 6 Sensoren mit Min-/Maxwerten und Differenzen.

### ✔ Solarsteuerung mit Hysterese  
Automatisches Einschalten/Ausschalten der Pumpe.

### ✔ Photovoltaik-Modus  
Die Pumpe läuft bei PV-Überschuss.

### ✔ Drucksensor-Integration  
Trend, Lernwerte, Normalbereich, Diagnose.

### ✔ KI-System (AI)  
Tägliche Zusammenfassungen, Wetterhinweise, Pooltipps, Wochenendberichte.

### ✔ Verbrauch & Kosten  
Automatische Tages-, Wochen-, Monats- und Jahresstatistik.

### ✔ Statussystem  
Zentrale Übersicht zur Visualisierung.

---

# 3. Admin-Konfiguration (Tabs)

Die Konfiguration erfolgt über mehrere Tabs in der Instanz.

---

## 3.1 Allgemeine Einstellungen

**Poolname**  
Reiner Anzeigetext.

**Poolgröße (Liter)**  
Wird für Umwälzberechnung genutzt.

**Mindest-Umwälzfaktor pro Tag**  
Beispiel: 2 bedeutet, dass das gesamte Poolvolumen zweimal pro Tag umgewälzt werden soll.

**Saison aktiv**  
Wichtig für Automatikfunktionen:  
- **true**: Alle Automatiken aktiv  
- **false**: Automatik aus, nur Frostschutz bleibt an

Der tatsächliche Zustand liegt im Objektbaum unter `status.season_active`.

---

## 3.2 Pumpe

**Ein-/Ausschalten:**  
→ `pump.pump_switch`  

**Modus:**  
→ `pump.mode`  

Mögliche Werte:  
- `auto`  
- `manual`  
- `time`  
- `off`  
- `controlHelper` (automatisch vom Adapter gesetzt)  
- `pv` (Photovoltaik-Modus)

**Weitere Einstellungen:**  
- Maximalleistung (Watt)  
- Maximaldurchfluss (l/h)  
- Objekt-ID der Steckdose  
- Frostschutz aktiv + Temperaturwert  

---

## 3.3 Temperaturverwaltung

Bis zu 6 Sensoren:

- Oberfläche  
- Grund  
- Vorlauf  
- Rücklauf  
- Kollektor  
- Außentemperatur  

Für jeden Sensor:

- Checkbox „verwenden“  
- Objekt-ID auswählen  

Temperaturwerte werden für:

- Solarsteuerung  
- Frostschutz  
- Diagnosen  
- AI-Texte  
genutzt.

---

## 3.4 Solarverwaltung

Einstellungen:

- Solarsteuerung aktivieren  
- Hysterese aktivieren  
- Einschaltgrenze (`temp_on`)  
- Ausschaltgrenze (`temp_off`)  
- Solarwarnungen aktivieren  

Die Solarsteuerung arbeitet nur im Modus **auto**.

---

## 3.5 Photovoltaik (PV)

Einstellungen:

- PV-Automatik aktiv  
- Objekt-ID der aktuellen PV-Leistung  
- Einschaltgrenze (z. B. 150 W Überschuss)

Wenn aktiv:

- Pumpenmodus zeigt „Automatik (PV)“  
- Pumpe läuft bei PV-Überschuss  
- Schaltet bei Unterschreitung automatisch ab  

---

## 3.6 KI-System (AI)

Das AI-System erzeugt täglich automatisch:

- Wetterhinweise  
- Tageszusammenfassungen  
- Pooltipps  
- Wochenendberichte  

### **Schalter (ai.switches.)**

| Datenpunkt | Bedeutung |
|------------|-----------|
| ai.switches.enabled | Hauptschalter |
| ai.switches.allow_speech | Ausgaben zusätzlich in `speech.queue` |
| ai.switches.daily_summary_enabled | tägliche Zusammenfassung |
| ai.switches.daily_pool_tips_enabled | Pool-Tipps |
| ai.switches.weather_advice_enabled | Wetterhinweise |
| ai.switches.weekend_summary_enabled | Wochenendbericht |
| ai.switches.debug_mode | zusätzliche Logeinträge |

### **Zeitpläne (ai.schedule.)**

- daily_summary_time  
- daily_pool_tips_time  
- weather_advice_time  
- weekend_summary_time  

Alle Werte im Format HH:MM.

### **Ausgaben (ai.outputs.)**

Hier erscheinen Texte, die VIS oder andere Adapter nutzen können.

Das AI-System benötigt Geodaten aus **system.config**.

---

## 3.7 Sprachausgaben

- Speech aktivieren  
- Texte für Pumpenstart/-stopp  
- letzte Sprachausgabe  
- Optional: E-Mail-Benachrichtigung aktivieren  
- Alle Ausgaben werden über **speech.queue** ausgegeben  

---

## 3.8 Zeitsteuerung

Bis zu **drei Zeitfenster**:

- Startzeit  
- Endzeit  
- Wochentage  

Nur aktiv, wenn `pump.mode = time`.

---

## 3.9 Debug & SystemCheck

Der Bereich `systemcheck.debug_logs` bietet:

- Auswahl eines Zielbereichs (pump, solar, runtime, control usw.)  
- Fortlaufendes Log  
- Löschen des Logs  

Dies dient zur Diagnose, sollte aber im Normalbetrieb deaktiviert bleiben.

---

# 4. Objektbaum – Datenpunkte erklärt

### Die wichtigsten Hauptbereiche:

- `pump.*`  
- `pump.pressure.*`  
- `temperature.*`  
- `solar.*`  
- `photovoltaic.*`  
- `runtime.*`  
- `circulation.*`  
- `consumption.*`  
- `control.*`  
- `status.*`  
- `info.*`  
- `ai.*`  
- `systemcheck.*`

Die Struktur ist im Objektbaum selbsterklärend gestaltet.  
Alle States besitzen sprechende Namen und Beschreibungen.

---

# 5. Automatische Logiken & Helfer

Der Adapter enthält verschiedene Helper-Dateien, die bestimmte Aufgaben übernehmen.

### **PumpHelper**
Steuert Grundfunktionen der Pumpe.

### **PumpHelper4 (Drucksensor)**
Verarbeitet:
- aktuellen Druck  
- Vorwert  
- Trend (steigend/fallend/stabil)  
- Lernsystem für Min/Max  
- Diagnose-Text  

### **SolarHelper**
Steuert Solarbetrieb inklusive Hysterese.

### **PhotovoltaicHelper**
Automatische Pumpensteuerung basierend auf PV-Überschuss.

### **FrostHelper**
Schaltet die Pumpe unter der eingestellten Temperatur automatisch ein.

### **RuntimeHelper**
Berechnet Laufzeit und Umwälzung.

### **ConsumptionHelper**
Tages-, Wochen-, Monats- und Jahresverbrauch.

### **ControlHelper**
Funktionen:
- Rückspülung  
- Wartungsmodus  
- Nachpumpen (Umwälzprüfung)  
- Benachrichtigungen  

### **InfoHelper**
- Adapterversion  
- saisonale Grüße incl. Osterberechnung  

### **AI-Helper**
- Wetterabruf (Open-Meteo)  
- Texterzeugung  
- Zeitpläne  
- Anti-Spam-Logik  

### **DebugLogHelper**
- Echtzeitüberwachung bestimmter Bereiche  

---

# 6. Fehlererkennung & Warnungen

Der Adapter erkennt automatisch:

- Trockenlauf  
- Überlast  
- Leistung trotz AUS  
- Druckabweichungen  
- Solarwarnungen  
- Rückspülerinnerungen  

Fehler werden in `pump.error` und `pump.status` angezeigt.

---

# 7. Sprachausgaben & Benachrichtigungen

Alle Sprachausgaben werden über `speech.queue` ausgegeben.  
Je nach Konfiguration können zusätzlich E-Mails gesendet werden.

---

# 8. FAQ & Tipps

**1. Warum passiert nichts, obwohl AI aktiv ist?**  
→ Prüfen Sie, ob system.config Latitude/Longitude gesetzt enthält.

**2. Warum schaltet die Pumpe nicht trotz Solar?**  
→ Modus muss **auto** sein.

**3. Warum läuft PV nicht?**  
→ Grenzwert prüfen → PV muss über diesem Wert liegen.

**4. Warum zeigt der Drucksensor 0 bar?**  
→ Prüfen Sie die Objekt-ID in der Admin-Konfiguration.

---

**Ende der Datei**

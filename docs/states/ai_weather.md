# AI Weather – Wetterbezogene KI-Funktionen

Dieser Bereich enthält alle wetterbezogenen KI-Funktionen von PoolControl.  
Die KI erzeugt hier **reine Textausgaben** auf Basis von Wetterdaten (z. B. Open-Meteo) und internen Pool-Zuständen.  
Es findet **keine automatische Steuerung** statt.

![AI Weather Datenpunkte](https://github.com/DasBo1975/ioBroker.poolcontrol/blob/main/docs/states/images/ai_weather.png)

---

## 📁 weather

Oberordner für alle wetterbezogenen KI-Funktionen.

---

## 📁 weather.outputs  
**KI-Ausgaben (Wetter-Texte)**

In diesem Bereich schreibt die KI ihre erzeugten Wettertexte ab.  
Alle States sind **read-only** und werden ausschließlich vom KI-System beschrieben.

### `daily_summary`
- **Typ:** text  
- **Beschreibung:**  
  Tägliche Wetter-Zusammenfassung mit Poolbezug (z. B. Einschätzung der Poolsaison oder Wetterlage).

### `last_message`
- **Typ:** text  
- **Beschreibung:**  
  Letzte von der Wetter-KI erzeugte Meldung (unabhängig vom Typ).

### `pool_tips`
- **Typ:** text  
- **Beschreibung:**  
  Konkrete Pool-Tipps auf Basis des aktuellen Wetters.

### `tomorrow_forecast`
- **Typ:** text  
- **Beschreibung:**  
  Wetterbasierte Vorhersage für den nächsten Tag mit Pool-Empfehlung.

### `weather_advice`
- **Typ:** text  
- **Beschreibung:**  
  Allgemeine Wetterhinweise (z. B. Regen, Wind, Temperaturentwicklung).

### `weekend_summary`
- **Typ:** text  
- **Beschreibung:**  
  Zusammenfassung und Einschätzung des kommenden Wochenendes.

---

## 📁 weather.schedule  
**Zeitpläne (Weather-KI)**

Hier werden die Uhrzeiten festgelegt, zu denen die einzelnen Wetter-KI-Texte erzeugt werden.

### `daily_pool_tips_time`
- **Typ:** text  
- **Beschreibung:**  
  Uhrzeit für die täglichen Pool-Tipps.

### `daily_summary_time`
- **Typ:** text  
- **Beschreibung:**  
  Uhrzeit für die tägliche Wetter-Zusammenfassung.

### `tomorrow_forecast_time`
- **Typ:** text  
- **Beschreibung:**  
  Uhrzeit für die Erstellung der Vorhersage für morgen.

### `weather_advice_time`
- **Typ:** text  
- **Beschreibung:**  
  Uhrzeit für allgemeine Wetterhinweise.

### `weekend_summary_time`
- **Typ:** text  
- **Beschreibung:**  
  Uhrzeit für die Wochenend-Zusammenfassung.

---

## 📁 weather.switches  
**Schalter (Weather-KI)**

Einzelne Aktivierungs-Schalter für jede Wetter-KI-Funktion.

### `allow_speech`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert die Sprachausgabe der Wetter-KI (z. B. Alexa, Telegram).

### `daily_pool_tips_enabled`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert oder deaktiviert die täglichen Pool-Tipps.

### `daily_summary_enabled`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert oder deaktiviert die tägliche Wetter-Zusammenfassung.

### `debug_mode`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert zusätzliche Debug-Ausgaben für die Wetter-KI.

### `tomorrow_forecast_enabled`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert oder deaktiviert die Vorhersage für morgen.

### `weather_advice_enabled`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert oder deaktiviert allgemeine Wetterhinweise.

### `weekend_summary_enabled`
- **Typ:** switch  
- **Beschreibung:**  
  Aktiviert oder deaktiviert die Wochenend-Zusammenfassung.

---

## `weather.enabled`
- **Typ:** switch  
- **Beschreibung:**  
  Globaler Hauptschalter für **alle** wetterbezogenen KI-Funktionen.  
  Ist dieser Schalter deaktiviert, werden keine Wetter-KI-Texte erzeugt.

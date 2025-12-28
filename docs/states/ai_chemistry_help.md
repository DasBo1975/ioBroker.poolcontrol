# Chemie-Hilfe (AI) – Datenpunkte

Dieser Bereich beschreibt die Datenpunkte unter  
`ai.chemistry_help.*`

Die Chemie-Hilfe ist **rein informativ** und dient ausschließlich dazu,
dem Nutzer **verständliche Erklärungen zu typischen Poolwasser-Problemen**
bereitzustellen.

Es findet **keine automatische Messung**, **keine Dosierung** und
**keine Steuerung von Geräten** statt.

---

## Übersicht der Datenpunkte

![Chemie-Hilfe Datenpunkte](https://github.com/DasBo1975/ioBroker.poolcontrol/blob/main/docs/states/images/ai_chemistry_help.png)

---

## Datenpunkte im Detail

### `ai.chemistry_help`
**Typ:** Channel  
**Beschreibung:**  
Übergeordneter Kanal für alle Datenpunkte der Chemie-Hilfe.

---

### `ai.chemistry_help.issue`
**Typ:** `state` (value / Auswahlfeld)  
**Rolle:** **Eingabe durch den Nutzer**

- Der Nutzer wählt hier **manuell** ein beobachtetes Poolproblem aus
- Standardwert: `none`
- Dieser State ist der **Auslöser** für die Chemie-Hilfe

**Hinweis:**  
Ohne Auswahl in diesem Datenpunkt erfolgt **keine Textausgabe**.

---

### `ai.chemistry_help.help_text`
**Typ:** `state` (text)  
**Rolle:** **Ausgabe-State**

- Enthält den erklärenden Text zur ausgewählten Problematik
- Wird automatisch vom Chemie-Hilfe-Helper beschrieben
- Read-only für den Nutzer

Der Text erklärt:
- mögliche Ursachen
- typische Zusammenhänge
- sinnvolle nächste Schritte (messen → bewerten → handeln)

Es werden **keine konkreten Dosiermengen**, **keine Produktempfehlungen**
und **keine automatischen Aktionen** ausgegeben.

---

### `ai.chemistry_help.last_issue_time`
**Typ:** `state` (value.time)  
**Rolle:** **Zeitstempel**

- Speichert den Zeitpunkt der letzten Auswahl in `issue`
- Wird automatisch gesetzt

Dieser Datenpunkt dient:
- der Nachvollziehbarkeit
- Debug-Zwecken
- internen Schutzmechanismen (z. B. Mehrfachauswahl-Erkennung)

---

## Technische Einordnung

- Die Chemie-Hilfe arbeitet **ereignisbasiert**
- Sie reagiert **ausschließlich** auf Änderungen von `ai.chemistry_help.issue`
- Es besteht **keine Abhängigkeit** zu Sensoren, Pumpen oder Heizungen

Der Bereich ist bewusst so umgesetzt, dass er:
- unabhängig vom restlichen System funktioniert
- keine sicherheitskritischen Aktionen ausführt
- auch ohne zusätzliche Hardware genutzt werden kann

---

## Zusammenfassung

Die Chemie-Hilfe beantwortet die Frage:

> *„Was bedeutet das, was ich gerade im Pool beobachte?“*

Nicht mehr – und nicht weniger.

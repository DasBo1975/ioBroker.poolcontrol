# Umwälzung (circulation)

Der Bereich **Umwälzung** stellt die tägliche Wassermenge dar, die durch die Poolpumpe tatsächlich umgewälzt wurde bzw. noch umgewälzt werden soll.

Er dient ausschließlich der **Anzeige und Auswertung** und trifft selbst **keine Schaltentscheidungen**.

![Umwälzung – Datenpunkte](https://github.com/DasBo1975/ioBroker.poolcontrol/blob/main/docs/states/images/circulation.png)

---

## Übersicht der Datenpunkte

### `circulation.daily_required`
**Erforderliche tägliche Umwälzmenge**

- Gibt an, wie viel Wasser pro Tag mindestens umgewälzt werden soll
- Einheit: Liter (`value.volume`)
- Der Wert ergibt sich aus:
  - Poolvolumen
  - konfigurierter Mindest-Umwälzung
- Dieser Wert ist die **Sollgröße** für den aktuellen Tag

---

### `circulation.daily_total`
**Tatsächlich umgewälzte Wassermenge (heute)**

- Zeigt an, wie viel Wasser heute bereits umgewälzt wurde
- Einheit: Liter (`value.volume`)
- Der Wert steigt während des Pumpenbetriebs kontinuierlich an
- Wird automatisch um Mitternacht zurückgesetzt

---

### `circulation.daily_remaining`
**Verbleibende Umwälzmenge (heute)**

- Gibt an, wie viel Wasser heute noch umgewälzt werden muss, um das Tagesziel zu erreichen
- Einheit: Liter (`value.volume`)
- Berechnung:
  
daily_required – daily_total


- Sinkt während des Pumpenbetriebs
- Kann auf `0` fallen, wenn die erforderliche Umwälzung erreicht wurde

---

## Hinweise

- Die Datenpunkte sind **rein informativ**
- Sie werden von anderen Modulen (z. B. Zeit-, PV- oder Automatiklogik) zur Bewertung herangezogen
- Es erfolgt **keine direkte Pumpensteuerung** über diesen Bereich
- Alle Werte werden täglich automatisch zurückgesetzt

---

## Typische Verwendung

- Anzeige des aktuellen Umwälzfortschritts
- Kontrolle, ob die tägliche Mindestumwälzung erreicht wurde
- Grundlage für intelligente Steuerlogiken (z. B. PV-Überschuss, Zeitsteuerung)

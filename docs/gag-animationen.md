# Gag-Animationen

Kleine, dezente Animationen die bei besonderen Momenten ausgeloest werden. Nicht nervig, sondern ein Schmunzler. Dauer max. 2-3 Sekunden, nicht blockierend.

## Ideen

### Spieltag-Momente
- **Erstes Bild des Abends** — Das Profilbild des Accounts kegelt die kegel um (9 oder Kranz = 8)
- **Alle anwesend** — Kurzes Konfetti wenn alle Mitglieder als anwesend markiert sind, ("Vollzählig!" erscheint! Leiser Jubel ertönt. Problem: Wie feststellen? Alle sind zu Beginn auf "anwesend". event wäre evtl. 1 spiel - alle teilgenommen?
- **Letzter traegt ein** — Schlussgong / Vorhang-Animation wenn der letzte Spieler seinen Wert bekommt

### Pudel (Gutter Balls)
- **Erster Pudel** — Kegelfigur kippt traurig um
- **3. Pudel in Folge** — Kleine Traene / Regenwolke ueber dem Namen
- **Pudel-Koenig des Abends** — Krone (verkehrt herum) erscheint neben dem Namen

### Gute Leistungen
- **9er** — Kurzes Aufleuchten / Stern-Funkeln in der Zelle
- **Kranz** — Goldener Kranz-Rahmen blinkt kurz auf
- **Neuer persoenlicher Rekord** — Kleines Feuerwerk in der Zelle

### Monte / Seitenwetten
- **Monte-Gewinner** — Muenzen-Regen-Animation (2-3 Sek.)
- **Alle ausgestiegen** — Tumbleweed rollt durch die Monte-Spalte

### Abrechnung / Finanzen
- **Abrechnung abgeschlossen** — Stempel-Animation "BEZAHLT"
- **Kassenstand negativ** — Roter Alarm-Blink (dezent)
- **Kassenstand > 100 EUR** — Sparschwein huepft kurz

### Meilensteine
- **Runder Spieltag (10., 50., 100. etc.)** — Jubilaeum-Banner fliegt kurz ein
- **Mitglied spielt zum 1. Mal** — Willkommens-Wink (Waving Hand)
- **1 Jahr im Verein** — Kleiner Geburtstagskuchen neben dem Namen

---

## Umsetzung (technisch)
- CSS-Animationen + kleine SVG/Emoji-Overlays
- Trigger via JS nach Auto-Save Response (Backend liefert Event-Typ mit)
- `localStorage`-Flag damit jeder Gag nur 1x pro Spieltag/Moment feuert
- Global abschaltbar in Einstellungen (Toggle "Animationen aus")

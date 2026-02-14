# KC Schaf Zeilsheim - Vereinsportal

## Features

### Kegelkladde
- Spieltage anlegen, bearbeiten, abrechnen und loeschen
- Spieltag-Navigation (Vor/Zurueck/Dropdown)
- Anwesenheit per Schaf-Icon umschalten
- Strichlisten fuer 9er, Kranz, Triclops und Pudel (mit +/- Buttons)
- Strafen als Freitext-Betrag
- Nebenwetten/Spiele: V+A, Monte, Aussteigen, 6-Tage (feste Spalten)
- Dynamische Freitext-Spielspalten pro Spieltag (Custom Games)
- Automatische Kostenberechnung (Beitrag + Strafen + Pudel + 9er/Kranz/Triclops-Umlage + Spiele + Uebertrag)
- Auto-Save per AJAX (kein Formular-Submit noetig)
- Uebertrag vom Vorspieltag wird automatisch berechnet
- Abrechnung mit Gezahlt/Rest-Spalten
- Vorschau-Tabelle fuer naechsten Spieltag

### Mitglieder
- Mitglieder anlegen und verwalten (Name, Rolle, Gast-Status)
- Verschluesselte Kontaktdaten (Adresse, E-Mail, Telefon)
- Reihenfolge der Mitglieder per Drag-and-Drop sortierbar

### Rekorde & Kurioses
- Ranglisten und Kurioses-Eintraege verwalten
- Inline-Bearbeitung direkt in der Tabelle

### Statistiken
- Uebersichtskarten (Spieltage, Anwesenheit, Pudel, 9er etc.)
- Leaderboards fuer verschiedene Kategorien

### Allgemein
- Login-geschuetzte Webseite (nicht oeffentlich zugaenglich)
- Rollen: `admin` (Bearbeitung) und `user` (Nur-Lesen)
- Responsive Design (Desktop-Tabelle + Mobile-Karten)
- Toast-Benachrichtigungen
- Keyboard-Shortcuts (Ctrl+S zum Speichern, Escape zum Schliessen)

## Tech-Stack
- **Backend:** Node.js, Express, EJS
- **Datenbank:** SQLite (better-sqlite3, WAL-Modus)
- **Auth:** bcryptjs, express-session, CSRF-Token
- **Verschluesselung:** AES-256-GCM fuer Profildaten

## Sicherheit
- Passwort-Hashing mit `bcryptjs`
- Session-Cookies (`httpOnly`, `sameSite=lax`, `secure` in Produktion)
- Rate-Limiting auf Login
- CSRF-Schutz auf allen POST-Endpunkten
- Profildaten (Adresse, Mail, Telefone) verschluesselt gespeichert (AES-256-GCM)

## Projektstruktur
```
index.js              # Express-App Setup und Middleware
models/db.js          # SQLite-Schema, Migrations, Hilfsfunktionen
routes/
  auth.js             # Login, Logout, Setup, Profil
  kegelkladde.js      # Spieltage, Anwesenheit, Custom Games
  members.js          # Mitgliederverwaltung
  records.js          # Rekorde und Kurioses
  statistics.js       # Statistik-Auswertungen
views/                # EJS-Templates
public/               # CSS, Client-JS, Bilder
middleware/auth.js    # Auth-Middleware (requireAuth, requireAdmin, CSRF)
```

## Start
1. Abhaengigkeiten installieren:
   ```
   npm install
   ```
2. Umgebungsvariablen setzen (PowerShell Beispiel):
   ```powershell
   $env:SESSION_SECRET="<zufaelliger-langer-wert>"
   $env:FIELD_ENCRYPTION_KEY="<32-byte-key-base64>"
   ```
3. Starten:
   ```
   npm start
   ```
4. Beim ersten Aufruf `http://localhost:3000/setup` den ersten Admin anlegen.

## Hinweise
- Ohne gesetztes `FIELD_ENCRYPTION_KEY` wird ein Fallback aus `SESSION_SECRET` genutzt (fuer lokale Entwicklung ok, in Produktion explizit setzen).
- DB-Datei liegt in `data/kegelkladde.db` (wird automatisch angelegt).
- Maskottchen-Bild wird aus `public/sheep.jpg` geladen.
- Migrations laufen automatisch beim Start (neue Spalten/Tabellen werden angelegt).
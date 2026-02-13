# KC Schaf Zeilsheim - Vereinsportal

## Features
- Login-geschuetzte Webseite (nicht oeffentlich zugaenglich)
- Rollen: `admin` und `user`
- Bereiche: `Kegelkladde`, `Mitglieder`, `Ranglisten`, `Kurioses`
- Admin-Funktionen:
  - Spieltage anlegen
  - Anwesenheit/Triclops pflegen
  - Reihenfolge der Mitglieder-Spalten speichern
  - Mitglieder anlegen (inkl. Rolle)
  - Ranglisten/Kurioses-Eintraege pflegen
- Mobile-First UI mit animierten Uebergaengen

## Sicherheit
- Passwort-Hashing mit `bcryptjs`
- Session-Cookies (`httpOnly`, `sameSite=lax`, `secure` in Produktion)
- Rate-Limiting auf Login
- CSRF-Schutz auf POST-Formularen
- Optionale Profildaten (Adresse, Mail, Telefone) verschluesselt gespeichert (AES-256-GCM)

## Start
1. Abhaengigkeiten installieren:
   - `npm install`
2. Umgebungsvariablen setzen (PowerShell Beispiel):
   - `$env:SESSION_SECRET="<zufaelliger-langer-wert>"`
   - `$env:FIELD_ENCRYPTION_KEY="<32-byte-key-base64>"`
3. Starten:
   - `npm start`
4. Beim ersten Aufruf `http://localhost:3000/setup` den ersten Admin anlegen.

## Hinweise
- Ohne gesetztes `FIELD_ENCRYPTION_KEY` wird ein Fallback aus `SESSION_SECRET` genutzt (fuer lokale Entwicklung ok, in Produktion explizit setzen).
- DB-Datei liegt in `data/kegelkladde.db`.
- Maskottchen-Bild wird aus `public/sheep.jpg` geladen.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

German-language bowling club portal ("Kegelkladde") for KC Schaf Zeilsheim. Tracks game days (Spieltage), player attendance, scores, finances, and statistics. All UI text is German.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server with auto-reload (node --watch)
npm start            # Production server
```

No build step, no test suite. Server runs on `http://localhost:3000`. First-time setup at `/setup` to create the admin account.

**Environment variables:** `SESSION_SECRET`, `FIELD_ENCRYPTION_KEY` (32-byte base64), `NODE_ENV`, `PORT` (default 3000).

## Architecture

**Stack:** Node.js 20 + Express + EJS templates + SQLite (better-sqlite3, WAL mode) + vanilla JS frontend.

### Backend (server-side rendered)

- `index.js` — Express app setup, middleware chain, route mounting
- `models/db.js` — SQLite schema, auto-migrations on startup, all DB queries as exported functions, AES-256-GCM field encryption
- `routes/` — Feature-based route modules:
  - `kegelkladde.js` — Main scorecard: game days, attendance, cost calculations, auto-save endpoints
  - `ranglisten.js` — Rankings (Monte, 9er, Kranz, Pudel leaderboards)
  - `statistics.js` — Aggregated stats dashboard
  - `members.js` — Member CRUD, drag-drop ordering, encrypted profile fields
  - `records.js` — Records & "Kurioses" entries
  - `admin.js` — Expenses, initial values, Kassenstand
  - `auth.js` — Login/logout/setup/profile
- `middleware/auth.js` — `requireAuth`, `requireAdmin`, CSRF token generation, flash messages
- `utils/helpers.js` — `sanitize()`, `formatEuro()`, `formatDate()`

### Frontend

- `public/app.js` — Single large file with all client-side logic: auto-save (debounced 400-600ms), compact cell editing, tab navigation (column-first), row-level edit locking, mobile card view, modals, toasts
- `public/style.css` — Full CSS with custom properties, responsive breakpoint at 900px
- `views/` — EJS templates with `partials/top.ejs` and `partials/bottom.ejs` shared layout

### Data Flow

Most editing uses AJAX auto-save (no form submissions). The main kegelkladde page sends individual field changes via fetch to POST endpoints, which update SQLite directly. Cost columns are recalculated client-side on every input change.

## Key Domain Concepts

- **Spieltag** — A game day session; navigated via prev/next/dropdown
- **Anwesenheit** — Attendance toggle per player per game day
- **Pudel/9er/Kranz/Triclops** — Scoring categories tracked as tally marks (+/- buttons)
- **Monte/Aussteigen/6-Tage** — Side betting games with their own ranking systems
- **Beitrag** — Fixed per-game contribution (4.00 EUR)
- **Uebertrag** — Carry-over balance from previous game day
- **Custom Games** — Dynamic free-text game columns per game day
- **Abrechnung** — Settlement: marks game day as finalized (Gezahlt/Rest columns)

## Conventions

- Database columns: `snake_case`. JavaScript variables: `camelCase`.
- Two roles: `admin` (full edit), `user` (read-only). Enforced via `requireAdmin` middleware.
- CSRF token required on all POST requests (generated in middleware, passed via hidden form fields or `X-CSRF-Token` header).
- Sensitive profile fields encrypted with AES-256-GCM in the database.
- All DB migrations run automatically on startup — add new columns/tables in `models/db.js` migration section.

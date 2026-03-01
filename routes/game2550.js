const express = require("express");
const { db } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");

const router = express.Router();

// Zonenstrafe berechnen: Zone [N, N+5] kostet N/100 EUR
function getZonePenalty(cumulative) {
  if (cumulative <= 0) return 0;
  const zoneStart = Math.floor(cumulative / 25) * 25;
  if (zoneStart > 0 && cumulative <= zoneStart + 5) {
    return Math.min(zoneStart / 100, 2.00);
  }
  return 0;
}

// Pudelstrafe: naechste Zone
function getPudelPenalty(cumulative) {
  const nextZone = (Math.floor(cumulative / 25) + 1) * 25;
  return Math.min(nextZone / 100, 2.00);
}

// Spielstand laden
router.get("/kegelkladde/2550/state", requireAuth, (req, res) => {
  const gamedayId = Number(req.query.gamedayId);
  if (!Number.isInteger(gamedayId)) return res.status(400).json({ error: "Ungueltige Parameter." });

  const row = db.prepare("SELECT * FROM game_2550 WHERE gameday_id = ?").get(gamedayId);
  if (!row) return res.json({ started: false });

  const playerOrder = JSON.parse(row.player_order);
  const throws = JSON.parse(row.throws);

  // Spieler-Namen laden
  const players = [];
  for (const pid of playerOrder) {
    const u = db.prepare("SELECT id, first_name, last_name FROM users WHERE id = ?").get(pid);
    players.push(u ? { id: u.id, name: u.first_name } : { id: pid, name: `Spieler ${pid}` });
  }

  // Aktuellen Stand berechnen
  const state = computeState(playerOrder, throws);

  res.json({
    started: true,
    finished: !!row.finished,
    players,
    throws,
    ...state
  });
});

// Spielstand berechnen aus throws-Array
function computeState(playerOrder, throws) {
  let cumulative = 0;
  const penalties = {}; // playerId -> total EUR
  for (const pid of playerOrder) penalties[pid] = 0;

  let currentPlayerIndex = 0;
  let pudelRepeat = false;

  for (const t of throws) {
    if (t.isPudel) {
      penalties[t.playerId] = (penalties[t.playerId] || 0) + t.penalty;
      pudelRepeat = true;
      // cumulative bleibt gleich, gleicher Spieler nochmal
    } else {
      cumulative += t.value;
      const penalty = getZonePenalty(cumulative);
      // penalty wurde beim Erstellen gesetzt, wir nutzen den gespeicherten Wert
      penalties[t.playerId] = (penalties[t.playerId] || 0) + t.penalty;
      pudelRepeat = false;
      currentPlayerIndex = (playerOrder.indexOf(t.playerId) + 1) % playerOrder.length;
    }
  }

  // Wenn letzter Wurf ein Pudel war, gleicher Spieler
  if (throws.length > 0 && throws[throws.length - 1].isPudel) {
    currentPlayerIndex = playerOrder.indexOf(throws[throws.length - 1].playerId);
  }

  const finished = cumulative >= 206;
  const currentPlayerId = finished ? null : playerOrder[currentPlayerIndex];

  return { cumulative, penalties, currentPlayerId, currentPlayerIndex, finished };
}

// Spiel starten: Anwesende mischen
router.post("/kegelkladde/2550/start", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number(req.body.gamedayId);
  if (!Number.isInteger(gamedayId)) return res.status(400).json({ error: "Ungueltige Parameter." });

  const day = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!day || day.settled !== 1) return res.status(400).json({ error: "Spieltag nicht im Status 'Gut Holz!'." });

  // Pruefen ob schon gestartet
  const existing = db.prepare("SELECT gameday_id FROM game_2550 WHERE gameday_id = ?").get(gamedayId);
  if (existing) return res.status(400).json({ error: "Spiel bereits gestartet." });

  // Anwesende Spieler holen
  const presentRows = db.prepare(
    "SELECT a.user_id FROM attendance a WHERE a.gameday_id = ? AND a.present = 1"
  ).all(gamedayId);

  if (presentRows.length < 2) return res.status(400).json({ error: "Mindestens 2 anwesende Spieler noetig." });

  // Zufaellige Reihenfolge (Fisher-Yates)
  const ids = presentRows.map(r => r.user_id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  db.prepare(
    "INSERT INTO game_2550 (gameday_id, player_order, throws, finished) VALUES (?, ?, '[]', 0)"
  ).run(gamedayId, JSON.stringify(ids));

  // Spieler-Namen laden
  const players = ids.map(pid => {
    const u = db.prepare("SELECT id, first_name FROM users WHERE id = ?").get(pid);
    return u ? { id: u.id, name: u.first_name } : { id: pid, name: `Spieler ${pid}` };
  });

  res.json({ ok: true, players, playerOrder: ids });
});

// Wurf eintragen
router.post("/kegelkladde/2550/throw", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number(req.body.gamedayId);
  const value = req.body.value; // 0-9, 12, oder "pudel"

  if (!Number.isInteger(gamedayId)) return res.status(400).json({ error: "Ungueltige Parameter." });

  const row = db.prepare("SELECT * FROM game_2550 WHERE gameday_id = ?").get(gamedayId);
  if (!row) return res.status(400).json({ error: "Spiel nicht gestartet." });
  if (row.finished) return res.status(400).json({ error: "Spiel bereits beendet." });

  const playerOrder = JSON.parse(row.player_order);
  const throws = JSON.parse(row.throws);
  const state = computeState(playerOrder, throws);

  const playerId = state.currentPlayerId;
  const isPudel = value === "pudel";

  let throwObj;
  if (isPudel) {
    const penalty = getPudelPenalty(state.cumulative);
    throwObj = {
      playerId,
      value: 0,
      cumulative: state.cumulative,
      penalty,
      isPudel: true
    };
  } else {
    const numValue = Number(value);
    if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12].includes(numValue)) {
      return res.status(400).json({ error: "Ungueltiger Wurfwert." });
    }
    const newCumulative = state.cumulative + numValue;
    const penalty = getZonePenalty(newCumulative);
    throwObj = {
      playerId,
      value: numValue,
      cumulative: newCumulative,
      penalty,
      isPudel: false
    };
  }

  throws.push(throwObj);

  // Pruefen ob Spiel beendet
  const newState = computeState(playerOrder, throws);
  const finished = newState.finished ? 1 : 0;

  db.prepare("UPDATE game_2550 SET throws = ?, finished = ? WHERE gameday_id = ?")
    .run(JSON.stringify(throws), finished, gamedayId);

  // Spieler-Namen laden
  const players = playerOrder.map(pid => {
    const u = db.prepare("SELECT id, first_name FROM users WHERE id = ?").get(pid);
    return u ? { id: u.id, name: u.first_name } : { id: pid, name: `Spieler ${pid}` };
  });

  res.json({
    ok: true,
    started: true,
    finished: !!finished,
    players,
    throws,
    ...newState
  });
});

// Letzten Wurf rueckgaengig machen
router.post("/kegelkladde/2550/undo", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number(req.body.gamedayId);
  if (!Number.isInteger(gamedayId)) return res.status(400).json({ error: "Ungueltige Parameter." });

  const row = db.prepare("SELECT * FROM game_2550 WHERE gameday_id = ?").get(gamedayId);
  if (!row) return res.status(400).json({ error: "Spiel nicht gestartet." });

  const playerOrder = JSON.parse(row.player_order);
  const throws = JSON.parse(row.throws);

  if (throws.length === 0) return res.status(400).json({ error: "Kein Wurf zum Rueckgaengig machen." });

  throws.pop();
  const newState = computeState(playerOrder, throws);

  db.prepare("UPDATE game_2550 SET throws = ?, finished = 0 WHERE gameday_id = ?")
    .run(JSON.stringify(throws), gamedayId);

  const players = playerOrder.map(pid => {
    const u = db.prepare("SELECT id, first_name FROM users WHERE id = ?").get(pid);
    return u ? { id: u.id, name: u.first_name } : { id: pid, name: `Spieler ${pid}` };
  });

  res.json({
    ok: true,
    started: true,
    finished: false,
    players,
    throws,
    ...newState
  });
});

// Betraege uebernehmen → attendance.spiel_2550
router.post("/kegelkladde/2550/save", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number(req.body.gamedayId);
  if (!Number.isInteger(gamedayId)) return res.status(400).json({ error: "Ungueltige Parameter." });

  const row = db.prepare("SELECT * FROM game_2550 WHERE gameday_id = ?").get(gamedayId);
  if (!row) return res.status(400).json({ error: "Spiel nicht gestartet." });

  const playerOrder = JSON.parse(row.player_order);
  const throws = JSON.parse(row.throws);
  const state = computeState(playerOrder, throws);

  const update = db.prepare("UPDATE attendance SET spiel_2550 = ? WHERE gameday_id = ? AND user_id = ?");
  const trx = db.transaction(() => {
    for (const pid of playerOrder) {
      const amount = Math.round((state.penalties[pid] || 0) * 100) / 100;
      update.run(amount, gamedayId, pid);
    }
  });
  trx();

  res.json({ ok: true, penalties: state.penalties });
});

// Spielstand loeschen + Spalte nullen
router.post("/kegelkladde/2550/reset", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number(req.body.gamedayId);
  if (!Number.isInteger(gamedayId)) return res.status(400).json({ error: "Ungueltige Parameter." });

  db.prepare("DELETE FROM game_2550 WHERE gameday_id = ?").run(gamedayId);
  db.prepare("UPDATE attendance SET spiel_2550 = 0 WHERE gameday_id = ?").run(gamedayId);

  res.json({ ok: true });
});

module.exports = router;

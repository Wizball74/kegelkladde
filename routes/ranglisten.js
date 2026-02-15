const express = require("express");
const { db, getOrderedMembers, withDisplayNames } = require("../models/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const MONTE_POINTS = [10, 6, 4, 3, 2, 1]; // Platz 1-6
const MONTE_CUTOFF = 2.0; // >= 2,00 € = keine Punkte

router.get("/ranglisten", requireAuth, (req, res) => {
  const members = withDisplayNames(getOrderedMembers());
  const gamedays = db
    .prepare("SELECT id, match_date, note, settled FROM gamedays ORDER BY match_date ASC, id ASC")
    .all();

  // Ausgewählter Spieltag zur Hervorhebung
  const selectedId = Number.parseInt(req.query.gamedayId, 10);
  const selectedGameday = gamedays.find((g) => g.id === selectedId) || gamedays[gamedays.length - 1] || null;

  // Monte + Medaillen pro Mitglied initialisieren
  const monteMap = new Map();
  const medaillenMap = new Map();

  members.forEach((m) => {
    monteMap.set(m.id, { total: 0, perGameday: [] });
    medaillenMap.set(m.id, { gold: 0, silver: 0, total: 0, perGameday: [] });
  });

  // Anfangswerte laden
  const initials = db.prepare(
    "SELECT user_id, initial_monte_points, initial_medaillen_gold, initial_medaillen_silver FROM member_initial_values"
  ).all();
  initials.forEach((iv) => {
    const mt = monteMap.get(iv.user_id);
    if (mt) mt.total += iv.initial_monte_points || 0;
    const md = medaillenMap.get(iv.user_id);
    if (md) {
      md.gold += iv.initial_medaillen_gold || 0;
      md.silver += iv.initial_medaillen_silver || 0;
      md.total += (iv.initial_medaillen_gold || 0) * 2 + (iv.initial_medaillen_silver || 0);
    }
  });

  // Alle Spieltage durchgehen
  gamedays.forEach((gd) => {
    computeMonteForGameday(gd.id, monteMap);
    computeMedaillenForGameday(gd.id, medaillenMap);
  });

  // Sortierte Rankings erstellen
  const monteRanking = members
    .map((m) => ({ ...m, ...monteMap.get(m.id) }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  const medaillenRanking = members
    .map((m) => ({ ...m, ...medaillenMap.get(m.id) }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total || b.gold - a.gold);

  // Datum-Format für Anzeige
  const formatDateDE = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };

  res.render("ranglisten", {
    gamedays,
    selectedGameday,
    monteRanking,
    medaillenRanking,
    formatDateDE
  });
});

function computeMonteForGameday(gamedayId, monteMap) {
  const rows = db.prepare(
    `SELECT user_id, monte, monte_extra, monte_tiebreak
     FROM attendance
     WHERE gameday_id = ? AND present = 1
     ORDER BY monte ASC, monte_tiebreak ASC`
  ).all(gamedayId);

  // Wurde Monte gespielt? (mindestens ein Spieler mit monte > 0)
  const played = rows.some((r) => r.monte > 0);
  if (!played) return;

  // Spieler mit >= 2,00 € ausfiltern
  const eligible = rows.filter((r) => r.monte < MONTE_CUTOFF);

  eligible.forEach((row, i) => {
    const placePts = i < MONTE_POINTS.length ? MONTE_POINTS[i] : 0;
    const extraPt = row.monte_extra ? 1 : 0;
    const pts = placePts + extraPt;

    if (pts > 0) {
      const entry = monteMap.get(row.user_id);
      if (entry) {
        entry.total += pts;
        entry.perGameday.push({ gamedayId, points: pts });
      }
    }
  });

  // Extrapunkt für nicht-eligible Spieler (falls jemand >= 2,00 den EP hat)
  rows.forEach((row) => {
    if (row.monte >= MONTE_CUTOFF && row.monte_extra) {
      const entry = monteMap.get(row.user_id);
      if (entry) {
        entry.total += 1;
        entry.perGameday.push({ gamedayId, points: 1 });
      }
    }
  });
}

function computeMedaillenForGameday(gamedayId, medaillenMap) {
  const rows = db.prepare(
    `SELECT user_id, aussteigen, aussteigen_tiebreak
     FROM attendance
     WHERE gameday_id = ? AND present = 1
     ORDER BY aussteigen ASC, aussteigen_tiebreak ASC`
  ).all(gamedayId);

  // Wurde Aussteigen gespielt? (mindestens ein Spieler mit aussteigen > 0)
  const played = rows.some((r) => r.aussteigen > 0);
  if (!played) return;

  // Gold-Kandidaten: aussteigen = 0,00 (Sieger zahlt nichts)
  const goldCandidates = rows.filter((r) => Math.abs(r.aussteigen) < 0.001);
  // Silber-Kandidaten: aussteigen = 0,10
  const silverCandidates = rows.filter((r) => Math.abs(r.aussteigen - 0.10) < 0.001);

  // Gold vergeben
  if (goldCandidates.length >= 1) {
    const winner = goldCandidates[0]; // nach tiebreak sortiert
    const entry = medaillenMap.get(winner.user_id);
    if (entry) {
      entry.gold++;
      entry.total += 2;
      entry.perGameday.push({ gamedayId, type: "gold", points: 2 });
    }
  }

  // Silber vergeben
  if (goldCandidates.length >= 2) {
    // Mehrere mit 0,00 → zweiter bekommt Silber
    const second = goldCandidates[1];
    const entry = medaillenMap.get(second.user_id);
    if (entry) {
      entry.silver++;
      entry.total += 1;
      entry.perGameday.push({ gamedayId, type: "silver", points: 1 });
    }
  } else if (goldCandidates.length === 1 && silverCandidates.length >= 1) {
    // Genau ein Gold → erster Silber-Kandidat bekommt Silber
    const second = silverCandidates[0];
    const entry = medaillenMap.get(second.user_id);
    if (entry) {
      entry.silver++;
      entry.total += 1;
      entry.perGameday.push({ gamedayId, type: "silver", points: 1 });
    }
  }
}

module.exports = router;

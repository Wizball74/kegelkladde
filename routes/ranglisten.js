const express = require("express");
const { db, getOrderedMembers, withDisplayNames } = require("../models/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const MONTE_POINTS = [10, 6, 4, 3, 2, 1]; // Platz 1-6
const MONTE_CUTOFF = 2.0; // >= 2,00 € = keine Punkte
const MONTE_WIN_THRESHOLD = 100;
const MEDAILLEN_WIN_THRESHOLD = 41;

const upsertRoundWin = db.prepare(`
  INSERT INTO round_wins (type, round_number, winner_user_id, winning_gameday_id, winning_score, standings_json)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(type, round_number) DO UPDATE SET
    winner_user_id = excluded.winner_user_id,
    winning_gameday_id = excluded.winning_gameday_id,
    winning_score = excluded.winning_score,
    standings_json = excluded.standings_json
`);

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
    monteMap.set(m.id, { total: 0, wins: 0, perGameday: [], carryover: 0 });
    medaillenMap.set(m.id, { medals: 0, total: 0, wins: 0, perGameday: [], carryover: 0 });
  });

  // Anfangswerte laden
  const initials = db.prepare(
    "SELECT user_id, initial_monte_points, initial_medaillen_points, initial_monte_siege, initial_medaillen_siege FROM member_initial_values"
  ).all();
  initials.forEach((iv) => {
    const mt = monteMap.get(iv.user_id);
    if (mt) {
      mt.total += iv.initial_monte_points || 0;
      mt.carryover = iv.initial_monte_points || 0;
      mt.wins += iv.initial_monte_siege || 0;
    }
    const md = medaillenMap.get(iv.user_id);
    if (md) {
      const pts = iv.initial_medaillen_points || 0;
      md.total += pts;
      md.carryover = pts;
      md.wins += iv.initial_medaillen_siege || 0;
    }
  });

  // Runden-Zähler: Starte mit Anzahl der Vor-System-Siege als Offset
  const initialMonteSiege = db.prepare(
    "SELECT COALESCE(SUM(initial_monte_siege), 0) as total FROM member_initial_values"
  ).get().total;
  const initialMedaillenSiege = db.prepare(
    "SELECT COALESCE(SUM(initial_medaillen_siege), 0) as total FROM member_initial_values"
  ).get().total;

  let monteRoundNumber = initialMonteSiege;
  let medaillenRoundNumber = initialMedaillenSiege;

  // Alle Spieltage durchgehen
  gamedays.forEach((gd) => {
    computeMonteForGameday(gd.id, monteMap);

    // Monte: Schwellwert prüfen
    let monteWinner = null;
    let monteMax = 0;
    for (const [userId, entry] of monteMap) {
      if (entry.total >= MONTE_WIN_THRESHOLD && entry.total > monteMax) {
        monteMax = entry.total;
        monteWinner = userId;
      }
    }
    if (monteWinner) {
      monteRoundNumber++;
      // Standings-Snapshot bauen
      const standings = [];
      for (const [userId, entry] of monteMap) {
        if (entry.total > 0) {
          const m = members.find((mm) => mm.id === userId);
          standings.push({
            userId,
            name: m ? m.display_name : String(userId),
            total: entry.total
          });
        }
      }
      standings.sort((a, b) => b.total - a.total);

      upsertRoundWin.run(
        "monte",
        monteRoundNumber,
        monteWinner,
        gd.id,
        monteMax,
        JSON.stringify(standings)
      );

      monteMap.get(monteWinner).wins++;
      for (const [, entry] of monteMap) {
        entry.total = 0;
        entry.perGameday = [];
        entry.carryover = 0;
      }
    }

    computeMedaillenForGameday(gd.id, medaillenMap);

    // Medaillen: Schwellwert prüfen
    let medaillenWinner = null;
    let medaillenMax = 0;
    for (const [userId, entry] of medaillenMap) {
      if (entry.total >= MEDAILLEN_WIN_THRESHOLD && entry.total > medaillenMax) {
        medaillenMax = entry.total;
        medaillenWinner = userId;
      }
    }
    if (medaillenWinner) {
      medaillenRoundNumber++;
      // Standings-Snapshot bauen
      const standings = [];
      for (const [userId, entry] of medaillenMap) {
        if (entry.total > 0) {
          const m = members.find((mm) => mm.id === userId);
          standings.push({
            userId,
            name: m ? m.display_name : String(userId),
            total: entry.total,
            medals: entry.medals
          });
        }
      }
      standings.sort((a, b) => b.total - a.total || b.medals - a.medals);

      upsertRoundWin.run(
        "medaillen",
        medaillenRoundNumber,
        medaillenWinner,
        gd.id,
        medaillenMax,
        JSON.stringify(standings)
      );

      medaillenMap.get(medaillenWinner).wins++;
      for (const [, entry] of medaillenMap) {
        entry.total = 0;
        entry.medals = 0;
        entry.carryover = 0;
        entry.perGameday = [];
      }
    }
  });

  // Spieltage der aktuellen Monte-Runde sammeln
  const monteGamedayIds = new Set();
  for (const [, entry] of monteMap) {
    entry.perGameday.forEach((pg) => monteGamedayIds.add(pg.gamedayId));
  }
  const monteGamedays = gamedays.filter((gd) => monteGamedayIds.has(gd.id));
  const hasMonteCarryover = [...monteMap.values()].some((e) => e.carryover > 0);

  // Spieltage der aktuellen Medaillen-Runde sammeln
  const medaillenGamedayIds = new Set();
  for (const [, entry] of medaillenMap) {
    entry.perGameday.forEach((pg) => medaillenGamedayIds.add(pg.gamedayId));
  }
  const medaillenGamedays = gamedays.filter((gd) => medaillenGamedayIds.has(gd.id));

  // Sortierte Rankings erstellen
  const monteRanking = members
    .map((m) => ({ ...m, ...monteMap.get(m.id) }))
    .filter((m) => m.wins > 0 || m.total > 0)
    .sort((a, b) => b.total - a.total || b.wins - a.wins);

  const medaillenRanking = members
    .map((m) => ({ ...m, ...medaillenMap.get(m.id) }))
    .filter((m) => m.wins > 0 || m.total > 0)
    .sort((a, b) => b.total - a.total || b.medals - a.medals || b.wins - a.wins);

  // Rundenverlauf laden
  const monteHistory = db.prepare(`
    SELECT rw.round_number, rw.winning_score, rw.standings_json, rw.detected_at,
           u.first_name, u.last_name, g.match_date
    FROM round_wins rw
    JOIN users u ON u.id = rw.winner_user_id
    JOIN gamedays g ON g.id = rw.winning_gameday_id
    WHERE rw.type = 'monte'
    ORDER BY rw.round_number DESC
  `).all();

  const medaillenHistory = db.prepare(`
    SELECT rw.round_number, rw.winning_score, rw.standings_json, rw.detected_at,
           u.first_name, u.last_name, g.match_date
    FROM round_wins rw
    JOIN users u ON u.id = rw.winner_user_id
    JOIN gamedays g ON g.id = rw.winning_gameday_id
    WHERE rw.type = 'medaillen'
    ORDER BY rw.round_number DESC
  `).all();

  // Celebration: Session-basiert, nur neue Siege seit letztem Besuch
  if (!req.session.seenRoundWins) {
    req.session.seenRoundWins = { monte: 0, medaillen: 0 };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const celebrateItems = [];

  const recentWins = db.prepare(`
    SELECT rw.type, rw.round_number, rw.winning_score, rw.detected_at,
           u.first_name, u.last_name
    FROM round_wins rw
    JOIN users u ON u.id = rw.winner_user_id
    WHERE rw.detected_at >= ?
    ORDER BY rw.round_number ASC
  `).all(sevenDaysAgo);

  for (const win of recentWins) {
    const seenKey = win.type;
    if (win.round_number > (req.session.seenRoundWins[seenKey] || 0)) {
      celebrateItems.push({
        type: win.type,
        round: win.round_number,
        winner: win.first_name,
        score: win.winning_score
      });
      req.session.seenRoundWins[seenKey] = Math.max(
        req.session.seenRoundWins[seenKey] || 0,
        win.round_number
      );
    }
  }

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
    monteGamedays,
    medaillenGamedays,
    hasMonteCarryover,
    monteHistory,
    medaillenHistory,
    celebrateItems,
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

  // Gold vergeben (Sieger: 0,00 € → 2 Pkt.)
  if (goldCandidates.length >= 1) {
    const winner = goldCandidates[0]; // nach tiebreak sortiert
    const entry = medaillenMap.get(winner.user_id);
    if (entry) {
      entry.medals++;
      entry.total += 2;
      entry.perGameday.push({ gamedayId, points: 2 });
    }
  }

  // Silber vergeben (Zweiter: 0,10 € → 1 Pkt.)
  if (goldCandidates.length >= 2) {
    // Mehrere mit 0,00 → zweiter bekommt Silber
    const second = goldCandidates[1];
    const entry = medaillenMap.get(second.user_id);
    if (entry) {
      entry.medals++;
      entry.total += 1;
      entry.perGameday.push({ gamedayId, points: 1 });
    }
  } else if (goldCandidates.length === 1 && silverCandidates.length >= 1) {
    // Genau ein Gold → erster Silber-Kandidat bekommt Silber
    const second = silverCandidates[0];
    const entry = medaillenMap.get(second.user_id);
    if (entry) {
      entry.medals++;
      entry.total += 1;
      entry.perGameday.push({ gamedayId, points: 1 });
    }
  }
}

module.exports = router;

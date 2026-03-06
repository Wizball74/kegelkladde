const express = require("express");
const { db, addDeadSheep, getDeadSheep, getDeadSheepById, deleteDeadSheep, getGraveyardStats } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");

const router = express.Router();

// Sheep Graveyard API
router.post("/api/sheep-graveyard", requireAuth, (req, res) => {
  const { ownerId, ownerName, letter, traits, sizeMultiplier, ageMs, deathCause } = req.body;
  if (!traits || typeof traits !== 'object') return res.status(400).json({ error: 'Missing traits' });
  try {
    addDeadSheep({ ownerId, ownerName, letter, traits, sizeMultiplier, ageMs, deathCause });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Einzelnes Schaf löschen (Owner: eigene, Admin: alle)
router.delete("/api/sheep-graveyard/:id", requireAuth, verifyCsrf, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Ungültige ID" });
  const sheep = getDeadSheepById(id);
  if (!sheep) return res.status(404).json({ error: "Schaf nicht gefunden" });
  const isAdmin = req.session.role === "admin";
  const isOwner = sheep.owner_id && sheep.owner_id === String(req.session.userId);
  if (!isAdmin && !isOwner) return res.status(403).json({ error: "Keine Berechtigung" });
  deleteDeadSheep(id);
  res.json({ ok: true });
});

router.get("/statistik", requireAuth, (req, res) => {
  // Total gamedays
  const totalGamedays = db.prepare("SELECT COUNT(*) as count FROM gamedays").get().count;
  const settledGamedays = db.prepare("SELECT COUNT(*) as count FROM gamedays WHERE settled = 3").get().count;

  // Total payments
  const totalPaid = db.prepare("SELECT COALESCE(SUM(paid), 0) as total FROM attendance").get().total;
  const totalPenalties = db.prepare("SELECT COALESCE(SUM(penalties), 0) as total FROM attendance").get().total;

  // Member count
  const memberCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_guest = 0").get().count;
  const guestCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_guest = 1").get().count;

  // Top attendance (most present)
  const topAttendance = db.prepare(`
    SELECT u.first_name, u.last_name, COUNT(*) as games
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.present = 1
    GROUP BY a.user_id
    ORDER BY games DESC
    LIMIT 5
  `).all();

  // Top payments
  const topPayers = db.prepare(`
    SELECT u.first_name, u.last_name, COALESCE(SUM(a.paid), 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Top alle9 (inkl. Anfangswerte)
  const topAlle9 = db.prepare(`
    SELECT u.first_name, u.last_name,
      COALESCE(SUM(a.alle9), 0) + COALESCE(iv.initial_alle9, 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN member_initial_values iv ON iv.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Top kranz (inkl. Anfangswerte)
  const topKranz = db.prepare(`
    SELECT u.first_name, u.last_name,
      COALESCE(SUM(a.kranz), 0) + COALESCE(iv.initial_kranz, 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN member_initial_values iv ON iv.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Most pudel
  const mostPudel = db.prepare(`
    SELECT u.first_name, u.last_name, COALESCE(SUM(a.pudel), 0) as total
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 5
  `).all();

  // Recent gamedays
  const recentGamedays = db.prepare(`
    SELECT id, match_date, note, settled
    FROM gamedays
    ORDER BY match_date DESC
    LIMIT 5
  `).all();

  // Monthly summary (current year)
  const currentYear = new Date().getFullYear();
  const monthlySummary = db.prepare(`
    SELECT
      strftime('%m', g.match_date) as month,
      COUNT(DISTINCT g.id) as gamedays,
      COALESCE(SUM(a.contribution), 0) as contributions,
      COALESCE(SUM(a.penalties), 0) as penalties
    FROM gamedays g
    LEFT JOIN attendance a ON g.id = a.gameday_id AND a.present = 1
    WHERE strftime('%Y', g.match_date) = ?
    GROUP BY strftime('%m', g.match_date)
    ORDER BY month
  `).all(String(currentYear));

  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const formattedMonthlySummary = monthlySummary.map(m => ({
    ...m,
    monthName: monthNames[parseInt(m.month, 10) - 1]
  }));

  // Per-member 9er stats (inkl. Anfangswerte)
  const neunerStats = db.prepare(`
    SELECT u.first_name, u.last_name,
      COALESCE(SUM(a.alle9), 0) + COALESCE(iv.initial_alle9, 0) as total,
      COALESCE(iv.initial_alle9, 0) as carryover,
      COUNT(*) as games,
      ROUND(CAST(COALESCE(SUM(a.alle9), 0) AS REAL) / COUNT(*), 2) as avg
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN member_initial_values iv ON iv.user_id = u.id
    WHERE a.present = 1
    GROUP BY a.user_id
    ORDER BY total DESC
  `).all();

  // Per-member Kranz stats (inkl. Anfangswerte)
  const kraenzeStats = db.prepare(`
    SELECT u.first_name, u.last_name,
      COALESCE(SUM(a.kranz), 0) + COALESCE(iv.initial_kranz, 0) as total,
      COALESCE(iv.initial_kranz, 0) as carryover,
      COUNT(*) as games,
      ROUND(CAST(COALESCE(SUM(a.kranz), 0) AS REAL) / COUNT(*), 2) as avg
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN member_initial_values iv ON iv.user_id = u.id
    WHERE a.present = 1
    GROUP BY a.user_id
    ORDER BY total DESC
  `).all();

  // Max-Werte für Bar-Skalierung
  const maxNeuner = neunerStats.length > 0 ? neunerStats[0].total : 0;
  const maxKraenze = kraenzeStats.length > 0 ? kraenzeStats[0].total : 0;

  // Dickstes Schaf: Spieler mit meisten 9er+Kränze kombiniert
  const dickstesSchaf = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.avatar,
      COALESCE(SUM(a.alle9), 0) + COALESCE(iv.initial_alle9, 0) as total_neuner,
      COALESCE(SUM(a.kranz), 0) + COALESCE(iv.initial_kranz, 0) as total_kraenze,
      (COALESCE(SUM(a.alle9), 0) + COALESCE(iv.initial_alle9, 0) +
       COALESCE(SUM(a.kranz), 0) + COALESCE(iv.initial_kranz, 0)) as combined
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN member_initial_values iv ON iv.user_id = u.id
    WHERE a.present = 1
    GROUP BY a.user_id
    HAVING combined > 0
    ORDER BY combined DESC
    LIMIT 1
  `).get() || null;

  // throw_log Daten vorhanden?
  const hasThrowLogData = db.prepare("SELECT COUNT(*) as count FROM throw_log").get().count > 0;

  // Sheep Graveyard — nach Besitzer gruppiert
  const deadSheep = getDeadSheep(200);
  const graveyardStats = getGraveyardStats();
  const sheepByOwner = {};
  for (const sheep of deadSheep) {
    if (!sheep.owner_name) continue;
    const key = sheep.owner_name;
    if (!sheepByOwner[key]) sheepByOwner[key] = {
      name: key, sheep: [],
      stats: { total: 0, evicted: 0, thrown: 0, dismissed: 0, departed: 0, stuck: 0 }
    };
    sheepByOwner[key].sheep.push(sheep);
    sheepByOwner[key].stats.total++;
    if (sheep.death_cause === 'eviction') sheepByOwner[key].stats.evicted++;
    else if (sheep.death_cause === 'thrown') sheepByOwner[key].stats.thrown++;
    else if (sheep.death_cause === 'dismissed') sheepByOwner[key].stats.dismissed++;
    else if (sheep.death_cause === 'departed') sheepByOwner[key].stats.departed++;
    else if (sheep.death_cause === 'stuck') sheepByOwner[key].stats.stuck++;
  }
  const stalls = Object.values(sheepByOwner).sort((a, b) => b.stats.total - a.stats.total);

  // Display-Namen: Vorname, bei Doppel-Vornamen + Nachname-Initial
  function addDisplayNames(...lists) {
    // Alle Vornamen sammeln, um Duplikate zu erkennen
    const allNames = [];
    for (const list of lists) {
      if (!list) continue;
      const arr = Array.isArray(list) ? list : [list];
      for (const item of arr) {
        if (item && item.first_name) allNames.push(item);
      }
    }
    const firstNameCounts = {};
    for (const item of allNames) {
      firstNameCounts[item.first_name] = (firstNameCounts[item.first_name] || 0) + 1;
    }
    for (const item of allNames) {
      if (firstNameCounts[item.first_name] > 1 && item.last_name) {
        item.display_name = item.first_name + ' ' + item.last_name.charAt(0) + '.';
      } else {
        item.display_name = item.first_name;
      }
    }
  }
  addDisplayNames(topAttendance, topPayers, topAlle9, topKranz, mostPudel,
    neunerStats, kraenzeStats, dickstesSchaf);

  res.render("statistics", {
    totalGamedays,
    settledGamedays,
    totalPaid,
    totalPenalties,
    memberCount,
    guestCount,
    topAttendance,
    topPayers,
    topAlle9,
    topKranz,
    mostPudel,
    recentGamedays,
    monthlySummary: formattedMonthlySummary,
    currentYear,
    neunerStats,
    kraenzeStats,
    maxNeuner,
    maxKraenze,
    dickstesSchaf,
    hasThrowLogData,
    deadSheep,
    graveyardStats,
    stalls
  });
});

// API: Wurf-Analyse mit Filtern
const GAME_TYPE_LABELS = { va: "V+A", monte: "Monte", aussteigen: "Aussteigen", sechs_tage: "6-Tage", spiel_2550: "25 / 50" };
const ALL_GAME_TYPES = Object.keys(GAME_TYPE_LABELS);

router.get("/statistik/wurf-analyse", requireAuth, (req, res) => {
  // Filter parsen
  const gameTypes = req.query.gameTypes
    ? req.query.gameTypes.split(",").filter(t => ALL_GAME_TYPES.includes(t))
    : ALL_GAME_TYPES;
  const dateFrom = req.query.dateFrom || null;
  const dateTo = req.query.dateTo || null;

  if (gameTypes.length === 0) {
    return res.json({ totalPinsPerPlayer: [], pinDistribution: [], throwAvgByGameday: [], availableGameTypes: [], gamedayDates: [] });
  }

  // Verfügbare Spieltypen + Spieltag-Daten für Filter-UI
  const availableGameTypes = db.prepare("SELECT DISTINCT game_type FROM throw_log ORDER BY game_type").all().map(r => ({
    key: r.game_type,
    label: GAME_TYPE_LABELS[r.game_type] || r.game_type
  }));
  const gamedayDates = db.prepare(
    "SELECT DISTINCT g.id, g.match_date FROM throw_log tl JOIN gamedays g ON tl.gameday_id = g.id ORDER BY g.match_date"
  ).all();

  // WHERE-Klausel bauen
  const placeholders = gameTypes.map(() => "?").join(",");
  let whereExtra = `AND tl.game_type IN (${placeholders})`;
  // Nur Würfe "in die Vollen" (9 Pins): Abräumen ausschließen, außer Alle-9
  whereExtra += ` AND (tl.phase IS NULL OR tl.phase != 'abraeumen' OR tl.marker = 'alle9')`;
  const params = [...gameTypes];

  if (dateFrom) {
    whereExtra += " AND g.match_date >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    whereExtra += " AND g.match_date <= ?";
    params.push(dateTo);
  }

  // Gesamt gefallene Pins pro Spieler
  const totalPinsPerPlayer = db.prepare(`
    SELECT tl.user_id, u.first_name, u.last_name,
      SUM(tl.throw_value) as total_pins,
      COUNT(tl.id) as total_throws,
      ROUND(AVG(tl.throw_value * 1.0), 2) as avg_throw
    FROM throw_log tl
    JOIN users u ON tl.user_id = u.id
    JOIN gamedays g ON tl.gameday_id = g.id
    WHERE 1=1 ${whereExtra}
    GROUP BY tl.user_id
    ORDER BY total_pins DESC
  `).all(...params);

  // Pin-Verteilung
  const rawPinDist = db.prepare(`
    SELECT tl.user_id, u.first_name, u.last_name, tl.throw_value, COUNT(*) as count
    FROM throw_log tl
    JOIN users u ON tl.user_id = u.id
    JOIN gamedays g ON tl.gameday_id = g.id
    WHERE 1=1 ${whereExtra}
    GROUP BY tl.user_id, tl.throw_value
    ORDER BY tl.user_id, tl.throw_value
  `).all(...params);

  const pinMap = new Map();
  for (const row of rawPinDist) {
    if (!pinMap.has(row.user_id)) {
      pinMap.set(row.user_id, {
        user_id: row.user_id, first_name: row.first_name, last_name: row.last_name,
        distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], totalThrows: 0
      });
    }
    const entry = pinMap.get(row.user_id);
    if (row.throw_value >= 0 && row.throw_value <= 9) {
      entry.distribution[row.throw_value] = row.count;
      entry.totalThrows += row.count;
    }
  }
  const pinDistribution = Array.from(pinMap.values()).sort((a, b) => b.totalThrows - a.totalThrows);

  // Wurf-Schnitt pro Spieltag
  const rawThrowAvg = db.prepare(`
    SELECT tl.gameday_id, g.match_date, tl.user_id, u.first_name, u.last_name,
      ROUND(AVG(tl.throw_value * 1.0), 2) as avg_throw,
      COUNT(tl.id) as throw_count,
      SUM(tl.throw_value) as total_pins
    FROM throw_log tl
    JOIN users u ON tl.user_id = u.id
    JOIN gamedays g ON tl.gameday_id = g.id
    WHERE 1=1 ${whereExtra}
    GROUP BY tl.gameday_id, tl.user_id
    ORDER BY g.match_date DESC, avg_throw DESC
  `).all(...params);

  const gdMap = new Map();
  for (const row of rawThrowAvg) {
    if (!gdMap.has(row.gameday_id)) {
      gdMap.set(row.gameday_id, { gameday_id: row.gameday_id, match_date: row.match_date, players: [] });
    }
    gdMap.get(row.gameday_id).players.push({
      first_name: row.first_name, last_name: row.last_name,
      avg_throw: row.avg_throw, throw_count: row.throw_count, total_pins: row.total_pins
    });
  }
  const throwAvgByGameday = Array.from(gdMap.values());

  // display_name Logik
  const allItems = [...totalPinsPerPlayer, ...pinDistribution, ...throwAvgByGameday.flatMap(gd => gd.players)];
  const firstNameCounts = {};
  for (const item of allItems) {
    if (item.first_name) firstNameCounts[item.first_name] = (firstNameCounts[item.first_name] || 0) + 1;
  }
  for (const item of allItems) {
    if (!item.first_name) continue;
    item.display_name = firstNameCounts[item.first_name] > 1 && item.last_name
      ? item.first_name + " " + item.last_name.charAt(0) + "."
      : item.first_name;
  }

  res.json({ totalPinsPerPlayer, pinDistribution, throwAvgByGameday, availableGameTypes, gamedayDates });
});

module.exports = router;

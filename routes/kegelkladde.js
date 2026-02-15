const express = require("express");
const { db, getOrderedMembers, withDisplayNames, logAudit } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");
const { sanitize } = require("../utils/helpers");

const router = express.Router();
const DEFAULT_CONTRIBUTION_EUR = 4.0;

// In-memory edit locks: key "gamedayId_memberId" → { userId, firstName, lockedAt }
const editLocks = new Map();
const LOCK_TTL_MS = 15000;

function cleanExpiredLocks() {
  const now = Date.now();
  for (const [key, lock] of editLocks) {
    if (now - lock.lockedAt > LOCK_TTL_MS) editLocks.delete(key);
  }
}

router.get("/", requireAuth, (req, res) => {
  res.redirect("/kegelkladde");
});

router.get("/kegelkladde", requireAuth, (req, res) => {
  const members = withDisplayNames(getOrderedMembers());
  const gamedays = db
    .prepare(
      `SELECT id, match_date, note, settled
       FROM gamedays
       ORDER BY match_date ASC, id ASC`
    )
    .all();

  // Nächsten Spieltag berechnen (letztes Datum + 14 Tage, oder 2026-02-20)
  let nextDate;
  if (gamedays.length > 0) {
    const lastDate = new Date(gamedays[gamedays.length - 1].match_date);
    lastDate.setDate(lastDate.getDate() + 14);
    nextDate = lastDate.toISOString().slice(0, 10);
  } else {
    nextDate = "2026-02-20";
  }

  const gamedayIdParam = req.query.gamedayId;
  const isNext = gamedayIdParam === "next";
  const requestedDayId = Number.parseInt(gamedayIdParam, 10);

  let selectedGameday = null;
  if (isNext) {
    selectedGameday = null; // "Nächster Spieltag"-Ansicht
  } else if (Number.isInteger(requestedDayId)) {
    selectedGameday = gamedays.find((g) => g.id === requestedDayId) || gamedays[gamedays.length - 1] || null;
  } else {
    selectedGameday = gamedays[gamedays.length - 1] || null;
  }

  const attendanceRows = selectedGameday
    ? db
      .prepare(
        `SELECT gameday_id, user_id, present, triclops, penalties, contribution, alle9, kranz, pudel, carryover, paid, va, monte, aussteigen, sechs_tage
         FROM attendance
         WHERE gameday_id = ?`
      )
      .all(selectedGameday.id)
    : [];

  const attendanceMap = new Map();
  for (const row of attendanceRows) {
    attendanceMap.set(row.user_id, row);
  }

  // Custom games for this gameday
  const customGames = selectedGameday
    ? db.prepare("SELECT id, name, sort_order FROM custom_games WHERE gameday_id = ? ORDER BY sort_order, id").all(selectedGameday.id)
    : [];

  const customGameValues = new Map();
  if (selectedGameday && customGames.length > 0) {
    const vals = db.prepare("SELECT user_id, custom_game_id, amount FROM custom_game_values WHERE gameday_id = ?").all(selectedGameday.id);
    for (const v of vals) {
      customGameValues.set(`${v.user_id}_${v.custom_game_id}`, v.amount);
    }
  }

  res.render("kegelkladde", {
    members,
    gamedays,
    selectedGameday,
    attendanceMap,
    hasGamedays: gamedays.length > 0,
    nextDate,
    isNext,
    customGames,
    customGameValues
  });
});

router.post("/kegelkladde/gamedays", requireAuth, verifyCsrf, (req, res) => {
  const matchDate = sanitize(req.body.matchDate, 10);
  const note = sanitize(req.body.note, 120);

  if (!matchDate) {
    req.session.flash = { type: "error", message: "Bitte Datum angeben." };
    return res.redirect("/kegelkladde");
  }

  const result = db
    .prepare("INSERT INTO gamedays (match_date, note, settled, created_by) VALUES (?, ?, 1, ?)")
    .run(matchDate, note || null, req.session.userId);

  const members = getOrderedMembers();

  // Vorherigen Spieltag ermitteln für Übertrag
  const prevDay = db.prepare(
    `SELECT id FROM gamedays WHERE match_date < ? ORDER BY match_date DESC, id DESC LIMIT 1`
  ).get(matchDate);

  const prevRestMap = new Map();
  if (prevDay) {
    const prevRows = db.prepare(
      `SELECT user_id, present, contribution, penalties, pudel, alle9, kranz, triclops, carryover, paid, va, monte, aussteigen, sechs_tage
       FROM attendance WHERE gameday_id = ?`
    ).all(prevDay.id);

    // Totals for 9er/Kranz/Triclops cost calculation
    let totalAlle9 = 0, totalKranz = 0, totalTriclops = 0;
    for (const r of prevRows) {
      if (r.present) {
        totalAlle9 += r.alle9;
        totalKranz += r.kranz;
        totalTriclops += r.triclops;
      }
    }

    // Custom game values for previous gameday
    const prevCustomGames = db.prepare("SELECT id FROM custom_games WHERE gameday_id = ?").all(prevDay.id);
    const prevCustomVals = new Map();
    if (prevCustomGames.length > 0) {
      const cvRows = db.prepare("SELECT user_id, amount FROM custom_game_values WHERE gameday_id = ?").all(prevDay.id);
      for (const cv of cvRows) {
        prevCustomVals.set(cv.user_id, (prevCustomVals.get(cv.user_id) || 0) + cv.amount);
      }
    }

    for (const r of prevRows) {
      let toPay;
      if (r.present) {
        const pudelCost = r.pudel * 0.10;
        const alle9Cost = (totalAlle9 - r.alle9) * 0.10;
        const kranzCost = (totalKranz - r.kranz) * 0.10;
        const triclopsCost = (totalTriclops - r.triclops) * 0.10;
        const gameCosts = (r.va || 0) + (r.monte || 0) + (r.aussteigen || 0) + (r.sechs_tage || 0) + (prevCustomVals.get(r.user_id) || 0);
        toPay = r.contribution + r.penalties + pudelCost + alle9Cost + kranzCost + triclopsCost + gameCosts + (r.carryover || 0);
      } else {
        toPay = (r.contribution || 0) + (r.penalties || 0) + (r.carryover || 0);
      }
      const rest = Math.round((toPay - (r.paid || 0)) * 100) / 100;
      if (rest !== 0) prevRestMap.set(r.user_id, rest);
    }
  }

  const insertAttendance = db.prepare(
    "INSERT OR IGNORE INTO attendance (gameday_id, user_id, present, triclops, penalties, contribution, alle9, kranz, pudel, carryover, paid) VALUES (?, ?, 1, 0, 0, ?, 0, 0, 0, ?, 0)"
  );

  const trx = db.transaction(() => {
    for (const m of members) {
      const carryover = prevRestMap.get(m.id) || 0;
      insertAttendance.run(result.lastInsertRowid, m.id, DEFAULT_CONTRIBUTION_EUR, carryover);
    }
  });
  trx();

  logAudit(req.session.userId, "GAMEDAY_CREATE", "gameday", result.lastInsertRowid, { matchDate, note });
  req.session.flash = { type: "success", message: `Spieltag ${matchDate} angelegt.` };

  res.redirect("/kegelkladde");
});

router.post("/kegelkladde/attendance", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }

  const dayExists = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!dayExists) {
    return res.redirect("/kegelkladde");
  }
  if (dayExists.settled > 1) {
    req.session.flash = { type: "error", message: "Spieltag kann nicht mehr bearbeitet werden." };
    return res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
  }

  const members = getOrderedMembers();
  const upsert = db.prepare(
    `INSERT INTO attendance (gameday_id, user_id, present, triclops, penalties, contribution, alle9, kranz, pudel, carryover, paid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(gameday_id, user_id)
     DO UPDATE SET
       present = excluded.present,
       triclops = excluded.triclops,
       penalties = excluded.penalties,
       contribution = excluded.contribution,
       alle9 = excluded.alle9,
       kranz = excluded.kranz,
       pudel = excluded.pudel,
       carryover = excluded.carryover,
       paid = excluded.paid`
  );

  const trx = db.transaction(() => {
    for (const m of members) {
      const present = req.body[`present_${m.id}`] ? 1 : 0;
      const triclops = Math.max(0, Math.min(99, Number.parseInt(req.body[`triclops_${m.id}`], 10) || 0));
      const penalties = Math.max(0, Math.min(999, Math.round((Number.parseFloat(req.body[`penalties_${m.id}`]) || 0) * 100) / 100));
      const roundedContribution = DEFAULT_CONTRIBUTION_EUR;
      const alle9 = Math.max(0, Math.min(999, Number.parseInt(req.body[`alle9_${m.id}`], 10) || 0));
      const kranz = Math.max(0, Math.min(999, Number.parseInt(req.body[`kranz_${m.id}`], 10) || 0));
      const pudel = Math.max(0, Math.min(999, Number.parseInt(req.body[`pudel_${m.id}`], 10) || 0));
      const carryover = Math.round((Number.parseFloat(req.body[`carryover_${m.id}`]) || 0) * 100) / 100;
      const paid = Math.max(0, Math.round((Number.parseFloat(req.body[`paid_${m.id}`]) || 0) * 100) / 100);
      upsert.run(gamedayId, m.id, present, triclops, penalties, roundedContribution, alle9, kranz, pudel, carryover, paid);
    }
  });
  trx();

  logAudit(req.session.userId, "ATTENDANCE_UPDATE", "gameday", gamedayId);
  req.session.flash = { type: "success", message: "Kladde gespeichert." };

  res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
});

router.post("/kegelkladde/attendance-auto", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  const memberId = Number.parseInt(req.body.memberId, 10);

  if (!Number.isInteger(gamedayId) || !Number.isInteger(memberId)) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  const dayExists = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!dayExists) {
    return res.status(404).json({ error: "Spieltag nicht gefunden." });
  }
  if (dayExists.settled >= 3) {
    return res.status(400).json({ error: "Spieltag ist archiviert." });
  }

  // Status 0-1: marks editable, Status 2: only paid editable
  if (dayExists.settled <= 1) {
    const present = req.body.present ? 1 : 0;
    const triclops = Math.max(0, Math.min(99, Number.parseInt(req.body.triclops, 10) || 0));
    const penalties = Math.max(0, Math.min(999, Math.round((Number.parseFloat(req.body.penalties) || 0) * 100) / 100));
    const alle9 = Math.max(0, Math.min(999, Number.parseInt(req.body.alle9, 10) || 0));
    const kranz = Math.max(0, Math.min(999, Number.parseInt(req.body.kranz, 10) || 0));
    const pudel = Math.max(0, Math.min(999, Number.parseInt(req.body.pudel, 10) || 0));
    const va = Math.max(0, Math.round((Number.parseFloat(req.body.va) || 0) * 100) / 100);
    const monte = Math.max(0, Math.round((Number.parseFloat(req.body.monte) || 0) * 100) / 100);
    const aussteigen = Math.max(0, Math.round((Number.parseFloat(req.body.aussteigen) || 0) * 100) / 100);
    const sechs_tage = Math.max(0, Math.round((Number.parseFloat(req.body.sechs_tage) || 0) * 100) / 100);

    db.prepare(
      `UPDATE attendance SET present = ?, triclops = ?, penalties = ?, alle9 = ?, kranz = ?, pudel = ?, va = ?, monte = ?, aussteigen = ?, sechs_tage = ?
       WHERE gameday_id = ? AND user_id = ?`
    ).run(present, triclops, penalties, alle9, kranz, pudel, va, monte, aussteigen, sechs_tage, gamedayId, memberId);
  } else if (dayExists.settled === 2) {
    const paid = Math.max(0, Math.round((Number.parseFloat(req.body.paid) || 0) * 100) / 100);
    db.prepare("UPDATE attendance SET paid = ? WHERE gameday_id = ? AND user_id = ?").run(paid, gamedayId, memberId);
  }

  res.json({ ok: true });
});

// Status: 0=Noch nicht begonnen, 1=Gut Holz!, 2=Abrechnung, 3=Archiv
const STATUS_LABELS = ["Noch nicht begonnen", "Gut Holz!", "Abrechnung", "Archiv"];

router.post("/kegelkladde/advance-status", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }
  const day = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!day || day.settled >= 3) {
    req.session.flash = { type: "error", message: "Status kann nicht weiter erhöht werden." };
    return res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
  }
  const newStatus = day.settled + 1;
  db.prepare("UPDATE gamedays SET settled = ? WHERE id = ?").run(newStatus, gamedayId);

  logAudit(req.session.userId, "GAMEDAY_STATUS_ADVANCE", "gameday", gamedayId, { from: day.settled, to: newStatus });
  req.session.flash = { type: "success", message: `Status: ${STATUS_LABELS[newStatus]}` };

  res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
});

router.post("/kegelkladde/revert-status", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }
  const day = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!day || day.settled <= 0) {
    req.session.flash = { type: "error", message: "Status kann nicht weiter zurückgesetzt werden." };
    return res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
  }
  const newStatus = day.settled - 1;
  db.prepare("UPDATE gamedays SET settled = ? WHERE id = ?").run(newStatus, gamedayId);

  logAudit(req.session.userId, "GAMEDAY_STATUS_REVERT", "gameday", gamedayId, { from: day.settled, to: newStatus });
  req.session.flash = { type: "success", message: `Status: ${STATUS_LABELS[newStatus]}` };

  res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
});

router.post("/kegelkladde/delete", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }

  const gameday = db.prepare("SELECT match_date FROM gamedays WHERE id = ?").get(gamedayId);
  if (!gameday) {
    return res.redirect("/kegelkladde");
  }

  db.prepare("DELETE FROM custom_game_values WHERE gameday_id = ?").run(gamedayId);
  db.prepare("DELETE FROM custom_games WHERE gameday_id = ?").run(gamedayId);
  db.prepare("DELETE FROM attendance WHERE gameday_id = ?").run(gamedayId);
  db.prepare("DELETE FROM gamedays WHERE id = ?").run(gamedayId);

  logAudit(req.session.userId, "GAMEDAY_DELETE", "gameday", gamedayId, { matchDate: gameday.match_date });
  req.session.flash = { type: "success", message: `Spieltag ${gameday.match_date} gelöscht.` };

  res.redirect("/kegelkladde");
});

router.post("/kegelkladde/custom-game", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  const name = sanitize(req.body.name, 30);

  if (!Number.isInteger(gamedayId) || !name) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  const dayExists = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!dayExists) {
    return res.status(404).json({ error: "Spieltag nicht gefunden." });
  }
  if (dayExists.settled > 1) {
    return res.status(400).json({ error: "Spieltag ist bereits in Abrechnung oder archiviert." });
  }

  const maxOrder = db.prepare("SELECT MAX(sort_order) as mx FROM custom_games WHERE gameday_id = ?").get(gamedayId);
  const sortOrder = (maxOrder?.mx || 0) + 1;

  const result = db.prepare("INSERT INTO custom_games (gameday_id, name, sort_order) VALUES (?, ?, ?)").run(gamedayId, name, sortOrder);
  const gameId = result.lastInsertRowid;

  // Initialize values for all members
  const members = getOrderedMembers();
  const insertVal = db.prepare("INSERT OR IGNORE INTO custom_game_values (gameday_id, user_id, custom_game_id, amount) VALUES (?, ?, ?, 0)");
  const trx = db.transaction(() => {
    for (const m of members) {
      insertVal.run(gamedayId, m.id, gameId);
    }
  });
  trx();

  res.json({ ok: true, id: Number(gameId), name, sortOrder });
});

router.post("/kegelkladde/custom-game-value", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  const memberId = Number.parseInt(req.body.memberId, 10);
  const customGameId = Number.parseInt(req.body.customGameId, 10);
  const amount = Math.max(0, Math.round((Number.parseFloat(req.body.amount) || 0) * 100) / 100);

  if (!Number.isInteger(gamedayId) || !Number.isInteger(memberId) || !Number.isInteger(customGameId)) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  const dayExists = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!dayExists) {
    return res.status(404).json({ error: "Spieltag nicht gefunden." });
  }
  if (dayExists.settled > 1) {
    return res.status(400).json({ error: "Spieltag ist bereits in Abrechnung oder archiviert." });
  }

  db.prepare(
    `INSERT INTO custom_game_values (gameday_id, user_id, custom_game_id, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(gameday_id, user_id, custom_game_id) DO UPDATE SET amount = excluded.amount`
  ).run(gamedayId, memberId, customGameId, amount);

  res.json({ ok: true });
});

router.post("/kegelkladde/member-order", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const currentIds = new Set(getOrderedMembers().map((m) => m.id));
  const proposed = String(req.body.memberOrder || "")
    .split(",")
    .map((x) => Number.parseInt(x, 10))
    .filter((x) => Number.isInteger(x));

  const uniqueValid = [];
  const seen = new Set();
  for (const id of proposed) {
    if (!seen.has(id) && currentIds.has(id)) {
      seen.add(id);
      uniqueValid.push(id);
    }
  }

  db.prepare(
    `INSERT INTO member_order (id, order_json) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET order_json = excluded.order_json`
  ).run(JSON.stringify(uniqueValid));

  req.session.flash = { type: "success", message: "Reihenfolge gespeichert." };
  res.redirect("/members");
});

// --- Edit-Lock Endpoints ---

router.post("/kegelkladde/lock-row", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  const memberId = Number.parseInt(req.body.memberId, 10);
  if (!Number.isInteger(gamedayId) || !Number.isInteger(memberId)) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  cleanExpiredLocks();

  const key = `${gamedayId}_${memberId}`;
  const existing = editLocks.get(key);
  // Only allow setting/renewing if no lock or own lock
  if (!existing || existing.userId === req.session.userId) {
    editLocks.set(key, {
      userId: req.session.userId,
      firstName: req.session.user.firstName,
      lockedAt: Date.now()
    });
  }

  // Return all locks for this gameday (excluding requester's own)
  const locks = [];
  for (const [k, lock] of editLocks) {
    if (k.startsWith(gamedayId + "_") && lock.userId !== req.session.userId) {
      const mId = Number.parseInt(k.split("_")[1], 10);
      locks.push({ memberId: mId, firstName: lock.firstName });
    }
  }
  res.json({ ok: true, locks });
});

router.post("/kegelkladde/unlock-row", requireAuth, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  const memberId = Number.parseInt(req.body.memberId, 10);
  if (!Number.isInteger(gamedayId) || !Number.isInteger(memberId)) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  const key = `${gamedayId}_${memberId}`;
  const existing = editLocks.get(key);
  if (existing && existing.userId === req.session.userId) {
    editLocks.delete(key);
  }

  res.json({ ok: true });
});

router.get("/kegelkladde/locks", requireAuth, (req, res) => {
  const gamedayId = Number.parseInt(req.query.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  cleanExpiredLocks();

  const locks = [];
  for (const [k, lock] of editLocks) {
    if (k.startsWith(gamedayId + "_") && lock.userId !== req.session.userId) {
      const mId = Number.parseInt(k.split("_")[1], 10);
      locks.push({ memberId: mId, firstName: lock.firstName });
    }
  }
  res.json({ locks });
});

module.exports = router;

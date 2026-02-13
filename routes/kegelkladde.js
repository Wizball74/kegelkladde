const express = require("express");
const { db, getOrderedMembers, withDisplayNames, logAudit } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");
const { sanitize } = require("../utils/helpers");

const router = express.Router();
const DEFAULT_CONTRIBUTION_EUR = 4.0;

router.get("/", requireAuth, (req, res) => {
  res.redirect("/kegelkladde");
});

router.get("/kegelkladde", requireAuth, (req, res) => {
  const members = withDisplayNames(getOrderedMembers());
  const gamedays = db
    .prepare(
      `SELECT id, match_date, note, settled
       FROM gamedays
       ORDER BY match_date DESC, id DESC`
    )
    .all();

  const requestedDayId = Number.parseInt(req.query.gamedayId, 10);
  const selectedGameday = Number.isInteger(requestedDayId)
    ? gamedays.find((g) => g.id === requestedDayId) || gamedays[0]
    : gamedays[0];

  const attendanceRows = selectedGameday
    ? db
      .prepare(
        `SELECT gameday_id, user_id, present, triclops, penalties, contribution, alle9, kranz, pudel
         FROM attendance
         WHERE gameday_id = ?`
      )
      .all(selectedGameday.id)
    : [];

  const attendanceMap = new Map();
  for (const row of attendanceRows) {
    attendanceMap.set(row.user_id, row);
  }

  res.render("kegelkladde", {
    members,
    gamedays,
    selectedGameday,
    attendanceMap,
    hasGamedays: gamedays.length > 0
  });
});

router.post("/kegelkladde/gamedays", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const matchDate = sanitize(req.body.matchDate, 10);
  const note = sanitize(req.body.note, 120);

  if (!matchDate) {
    req.session.flash = { type: "error", message: "Bitte Datum angeben." };
    return res.redirect("/kegelkladde");
  }

  const result = db
    .prepare("INSERT INTO gamedays (match_date, note, created_by) VALUES (?, ?, ?)")
    .run(matchDate, note || null, req.session.userId);

  const members = getOrderedMembers();
  const insertAttendance = db.prepare(
    "INSERT OR IGNORE INTO attendance (gameday_id, user_id, present, triclops, penalties, contribution, alle9, kranz, pudel) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)"
  );

  const trx = db.transaction(() => {
    for (const m of members) {
      insertAttendance.run(result.lastInsertRowid, m.id);
    }
  });
  trx();

  logAudit(req.session.userId, "GAMEDAY_CREATE", "gameday", result.lastInsertRowid, { matchDate, note });
  req.session.flash = { type: "success", message: `Spieltag ${matchDate} angelegt.` };

  res.redirect("/kegelkladde");
});

router.post("/kegelkladde/attendance", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }

  const dayExists = db.prepare("SELECT id, settled FROM gamedays WHERE id = ?").get(gamedayId);
  if (!dayExists) {
    return res.redirect("/kegelkladde");
  }
  if (dayExists.settled) {
    req.session.flash = { type: "error", message: "Spieltag ist bereits abgerechnet." };
    return res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
  }

  const members = getOrderedMembers();
  const upsert = db.prepare(
    `INSERT INTO attendance (gameday_id, user_id, present, triclops, penalties, contribution, alle9, kranz, pudel)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(gameday_id, user_id)
     DO UPDATE SET
       present = excluded.present,
       triclops = excluded.triclops,
       penalties = excluded.penalties,
       contribution = excluded.contribution,
       alle9 = excluded.alle9,
       kranz = excluded.kranz,
       pudel = excluded.pudel`
  );

  const trx = db.transaction(() => {
    for (const m of members) {
      const present = req.body[`present_${m.id}`] ? 1 : 0;
      const triclops = Math.max(0, Math.min(99, Number.parseInt(req.body[`triclops_${m.id}`], 10) || 0));
      const penalties = Math.max(0, Math.min(999, Number.parseInt(req.body[`penalties_${m.id}`], 10) || 0));
      const contributionRaw = Number.parseFloat(String(req.body[`contribution_${m.id}`] || "").replace(",", "."));
      const contribution = present
        ? (
          Number.isFinite(contributionRaw) && contributionRaw > 0
            ? contributionRaw
            : DEFAULT_CONTRIBUTION_EUR
        )
        : 0;
      const roundedContribution = Math.max(0, Math.min(9999, Math.round(contribution * 100) / 100));
      const alle9 = Math.max(0, Math.min(999, Number.parseInt(req.body[`alle9_${m.id}`], 10) || 0));
      const kranz = Math.max(0, Math.min(999, Number.parseInt(req.body[`kranz_${m.id}`], 10) || 0));
      const pudel = Math.max(0, Math.min(999, Number.parseInt(req.body[`pudel_${m.id}`], 10) || 0));
      upsert.run(gamedayId, m.id, present, triclops, penalties, roundedContribution, alle9, kranz, pudel);
    }
  });
  trx();

  logAudit(req.session.userId, "ATTENDANCE_UPDATE", "gameday", gamedayId);
  req.session.flash = { type: "success", message: "Kladde gespeichert." };

  res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
});

router.post("/kegelkladde/settle", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }
  db.prepare("UPDATE gamedays SET settled = 1 WHERE id = ?").run(gamedayId);

  logAudit(req.session.userId, "GAMEDAY_SETTLE", "gameday", gamedayId);
  req.session.flash = { type: "success", message: "Spieltag abgerechnet und gesperrt." };

  res.redirect(`/kegelkladde?gamedayId=${gamedayId}`);
});

router.post("/kegelkladde/unsettle", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const gamedayId = Number.parseInt(req.body.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.redirect("/kegelkladde");
  }
  db.prepare("UPDATE gamedays SET settled = 0 WHERE id = ?").run(gamedayId);

  logAudit(req.session.userId, "GAMEDAY_UNSETTLE", "gameday", gamedayId);
  req.session.flash = { type: "success", message: "Spieltag wieder geöffnet." };

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

  db.prepare("DELETE FROM attendance WHERE gameday_id = ?").run(gamedayId);
  db.prepare("DELETE FROM gamedays WHERE id = ?").run(gamedayId);

  logAudit(req.session.userId, "GAMEDAY_DELETE", "gameday", gamedayId, { matchDate: gameday.match_date });
  req.session.flash = { type: "success", message: `Spieltag ${gameday.match_date} gelöscht.` };

  res.redirect("/kegelkladde");
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
  res.redirect("/kegelkladde");
});

module.exports = router;

const express = require("express");
const { db, logAudit } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");
const { sanitize } = require("../utils/helpers");

const router = express.Router();

// Kombinierte Seite: Rekorde + Kurioses mit Tabs
router.get("/rekorde", requireAuth, (req, res) => {
  const rekorde = db
    .prepare(
      `SELECT id, title, holder
       FROM records
       WHERE section = 'rangliste'
       ORDER BY id DESC`
    )
    .all();

  const kurioses = db
    .prepare(
      `SELECT id, title, holder
       FROM records
       WHERE section = 'kurioses'
       ORDER BY id DESC`
    )
    .all();

  res.render("records", { rekorde, kurioses });
});

// Alte URLs auf neue kombinierte Seite umleiten
router.get("/ranglisten-alt", requireAuth, (req, res) => res.redirect("/rekorde"));
router.get("/kurioses", requireAuth, (req, res) => res.redirect("/rekorde"));

router.post("/records/add", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const section = req.body.section === "kurioses" ? "kurioses" : "rangliste";
  const record = sanitize(req.body.record, 120);
  const holder = sanitize(req.body.holder, 120);

  if (!record || !holder) {
    req.session.flash = { type: "error", message: "Rekord und Rekordhalter erforderlich." };
    return res.redirect("/rekorde");
  }

  const result = db.prepare(
    `INSERT INTO records (section, title, holder, created_by)
     VALUES (?, ?, ?, ?)`
  ).run(section, record, holder, req.session.userId);

  logAudit(req.session.userId, "RECORD_ADD", "record", result.lastInsertRowid, { section, record, holder });
  req.session.flash = { type: "success", message: "Eintrag hinzugefügt." };

  res.redirect("/rekorde");
});

router.post("/records/edit", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const recordId = Number.parseInt(req.body.recordId, 10);

  if (!Number.isInteger(recordId)) {
    req.session.flash = { type: "error", message: "Ungültige Rekord-ID." };
    return res.redirect("/rekorde");
  }

  const record = sanitize(req.body.record, 120);
  const holder = sanitize(req.body.holder, 120);

  if (!record || !holder) {
    req.session.flash = { type: "error", message: "Rekord und Rekordhalter erforderlich." };
    return res.redirect("/rekorde");
  }

  const existing = db.prepare("SELECT id FROM records WHERE id = ?").get(recordId);
  if (existing) {
    db.prepare("UPDATE records SET title = ?, holder = ? WHERE id = ?").run(record, holder, recordId);
    logAudit(req.session.userId, "RECORD_EDIT", "record", recordId, { record, holder });
    req.session.flash = { type: "success", message: "Eintrag aktualisiert." };
  }

  res.redirect("/rekorde");
});

router.post("/records/delete", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const recordId = Number.parseInt(req.body.recordId, 10);

  if (!Number.isInteger(recordId)) {
    req.session.flash = { type: "error", message: "Ungültige Rekord-ID." };
    return res.redirect("/rekorde");
  }

  const record = db.prepare("SELECT title FROM records WHERE id = ?").get(recordId);
  if (record) {
    db.prepare("DELETE FROM records WHERE id = ?").run(recordId);
    logAudit(req.session.userId, "RECORD_DELETE", "record", recordId, { title: record.title });
    req.session.flash = { type: "success", message: "Eintrag gelöscht." };
  }

  res.redirect("/rekorde");
});

module.exports = router;

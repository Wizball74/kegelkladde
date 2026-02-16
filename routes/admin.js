const express = require("express");
const { db, getOrderedMembers, withDisplayNames, logAudit, getKassenstand, getKassenstandForGameday } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");
const { sanitize, formatEuro } = require("../utils/helpers");

const router = express.Router();

// Admin-Seite rendern
router.get("/admin", requireAuth, requireAdmin, (req, res) => {
  const kassenstand = getKassenstand();
  const startRow = db.prepare("SELECT value FROM settings WHERE key = 'kassenstand_start'").get();
  const kassenstandStart = Number(startRow?.value || 0);

  const expenses = db.prepare(
    "SELECT e.*, u.first_name FROM expenses e JOIN users u ON e.created_by = u.id ORDER BY e.expense_date DESC"
  ).all();

  const members = withDisplayNames(getOrderedMembers());

  // Anfangswerte laden
  const initialRows = db.prepare("SELECT * FROM member_initial_values").all();
  const initialMap = new Map();
  for (const row of initialRows) {
    initialMap.set(row.user_id, row);
  }

  res.render("admin", {
    kassenstand,
    kassenstandStart,
    expenses,
    members,
    initialMap,
    formatEuro
  });
});

// Startwert Kassenstand setzen
router.post("/admin/kassenstand", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const value = Math.round((Number.parseFloat(req.body.kassenstandStart) || 0) * 100) / 100;

  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('kassenstand_start', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(value));

  logAudit(req.session.userId, "KASSENSTAND_START_SET", "settings", null, { value });
  req.session.flash = { type: "success", message: `Startwert auf ${formatEuro(value)} € gesetzt.` };
  res.redirect("/admin");
});

// Ausgabe hinzufuegen
router.post("/admin/expenses", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const amount = Math.round((Number.parseFloat(req.body.amount) || 0) * 100) / 100;
  const description = sanitize(req.body.description, 200);
  const expenseDate = sanitize(req.body.expense_date, 10);

  if (amount <= 0 || !description || !expenseDate) {
    req.session.flash = { type: "error", message: "Bitte alle Felder ausfüllen." };
    return res.redirect("/admin");
  }

  db.prepare(
    "INSERT INTO expenses (amount, description, expense_date, created_by) VALUES (?, ?, ?, ?)"
  ).run(amount, description, expenseDate, req.session.userId);

  logAudit(req.session.userId, "EXPENSE_CREATE", "expense", null, { amount, description, expenseDate });
  req.session.flash = { type: "success", message: `Ausgabe ${formatEuro(amount)} € hinzugefügt.` };
  res.redirect("/admin");
});

// Ausgabe bearbeiten
router.post("/admin/expenses/edit", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const id = Number.parseInt(req.body.expenseId, 10);
  const amount = Math.round((Number.parseFloat(req.body.amount) || 0) * 100) / 100;
  const description = sanitize(req.body.description, 200);
  const expenseDate = sanitize(req.body.expense_date, 10);

  if (!Number.isInteger(id) || amount <= 0 || !description || !expenseDate) {
    req.session.flash = { type: "error", message: "Ungültige Daten." };
    return res.redirect("/admin");
  }

  db.prepare(
    "UPDATE expenses SET amount = ?, description = ?, expense_date = ? WHERE id = ?"
  ).run(amount, description, expenseDate, id);

  logAudit(req.session.userId, "EXPENSE_EDIT", "expense", id, { amount, description, expenseDate });
  req.session.flash = { type: "success", message: "Ausgabe aktualisiert." };
  res.redirect("/admin");
});

// Ausgabe loeschen
router.post("/admin/expenses/delete", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const id = Number.parseInt(req.body.expenseId, 10);
  if (!Number.isInteger(id)) {
    req.session.flash = { type: "error", message: "Ungültige ID." };
    return res.redirect("/admin");
  }

  const expense = db.prepare("SELECT amount, description FROM expenses WHERE id = ?").get(id);
  if (!expense) {
    req.session.flash = { type: "error", message: "Ausgabe nicht gefunden." };
    return res.redirect("/admin");
  }

  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);

  logAudit(req.session.userId, "EXPENSE_DELETE", "expense", id, { amount: expense.amount, description: expense.description });
  req.session.flash = { type: "success", message: "Ausgabe gelöscht." };
  res.redirect("/admin");
});

// Anfangswerte pro Mitglied speichern
router.post("/admin/initial-values", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const members = getOrderedMembers();
  const upsert = db.prepare(
    `INSERT INTO member_initial_values (user_id, initial_alle9, initial_kranz, initial_carryover, initial_monte_points, initial_medaillen_points, initial_monte_siege, initial_medaillen_siege)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       initial_alle9 = excluded.initial_alle9,
       initial_kranz = excluded.initial_kranz,
       initial_carryover = excluded.initial_carryover,
       initial_monte_points = excluded.initial_monte_points,
       initial_medaillen_points = excluded.initial_medaillen_points,
       initial_monte_siege = excluded.initial_monte_siege,
       initial_medaillen_siege = excluded.initial_medaillen_siege`
  );

  const trx = db.transaction(() => {
    for (const m of members) {
      const alle9 = Math.max(0, Number.parseInt(req.body[`initial_alle9_${m.id}`], 10) || 0);
      const kranz = Math.max(0, Number.parseInt(req.body[`initial_kranz_${m.id}`], 10) || 0);
      const carryover = Math.round((Number.parseFloat(req.body[`initial_carryover_${m.id}`]) || 0) * 100) / 100;
      const montePoints = Math.max(0, Number.parseInt(req.body[`initial_monte_points_${m.id}`], 10) || 0);
      const medaillenPoints = Math.max(0, Number.parseInt(req.body[`initial_medaillen_points_${m.id}`], 10) || 0);
      const monteSiege = Math.max(0, Number.parseInt(req.body[`initial_monte_siege_${m.id}`], 10) || 0);
      const medaillenSiege = Math.max(0, Number.parseInt(req.body[`initial_medaillen_siege_${m.id}`], 10) || 0);
      upsert.run(m.id, alle9, kranz, carryover, montePoints, medaillenPoints, monteSiege, medaillenSiege);
    }
  });
  trx();

  logAudit(req.session.userId, "INITIAL_VALUES_UPDATE", "member_initial_values", null);
  req.session.flash = { type: "success", message: "Anfangswerte gespeichert." };
  res.redirect("/admin");
});

// API: Kassenstand als JSON (Spieltag-bezogen)
router.get("/api/kassenstand", requireAuth, (req, res) => {
  const gamedayId = Number.parseInt(req.query.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.status(400).json({ error: "gamedayId fehlt." });
  }
  res.json(getKassenstandForGameday(gamedayId));
});

module.exports = router;

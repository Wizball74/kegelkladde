const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db, getOrderedMembers, withDisplayNames, logAudit, getKassenstand, getKassenstandForGameday, getRecentAuditLog, getUsersWithLastLogin, createBackup, rotateBackups, listBackups, listBackupGamedays, restoreGamedays, backupDir } = require("../models/db");
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

  const auditLog = getRecentAuditLog(50);
  const usersLastLogin = getUsersWithLastLogin();

  const gagRow = db.prepare("SELECT value FROM settings WHERE key = 'gag_animations'").get();
  const gagAnimations = gagRow ? gagRow.value : "1";

  const sheepRow = db.prepare("SELECT value FROM settings WHERE key = 'flying_sheep'").get();
  const flyingSheep = sheepRow ? sheepRow.value : "1";

  const backups = listBackups();

  res.render("admin", {
    kassenstand,
    kassenstandStart,
    expenses,
    members,
    initialMap,
    formatEuro,
    auditLog,
    usersLastLogin,
    gagAnimations,
    flyingSheep,
    backups
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

// Gag-Animationen an/aus
router.post("/admin/toggle-gags", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const current = db.prepare("SELECT value FROM settings WHERE key = 'gag_animations'").get();
  const newVal = (current && current.value === "1") ? "0" : "1";

  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('gag_animations', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(newVal);

  logAudit(req.session.userId, "GAG_ANIMATIONS_TOGGLE", "settings", null, { enabled: newVal === "1" });
  req.session.flash = { type: "success", message: newVal === "1" ? "Gag-Animationen aktiviert." : "Gag-Animationen deaktiviert." };
  res.redirect("/admin");
});

// Flying Sheep an/aus
router.post("/admin/toggle-sheep", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const current = db.prepare("SELECT value FROM settings WHERE key = 'flying_sheep'").get();
  const newVal = (current && current.value === "1") ? "0" : "1";

  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('flying_sheep', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(newVal);

  logAudit(req.session.userId, "FLYING_SHEEP_TOGGLE", "settings", null, { enabled: newVal === "1" });
  req.session.flash = { type: "success", message: newVal === "1" ? "Flying Sheep aktiviert." : "Flying Sheep deaktiviert." };
  res.redirect("/admin");
});

// --- Backup-Endpoints ---

// Manuelles Backup erstellen
router.post("/admin/backup/create", requireAuth, requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const userName = req.session.user ? req.session.user.firstName : "Admin";
    await createBackup(`Manuell (${userName})`);
    rotateBackups(10);
    logAudit(req.session.userId, "BACKUP_CREATE", "backup", null);
    req.session.flash = { type: "success", message: "Sicherung erstellt." };
  } catch (err) {
    console.error("[Backup] Fehler:", err.message);
    req.session.flash = { type: "error", message: "Sicherung fehlgeschlagen: " + err.message };
  }
  res.redirect("/admin#sicherung");
});

// Backup herunterladen
router.get("/admin/backup/download/:filename", requireAuth, requireAdmin, (req, res) => {
  const filename = req.params.filename;
  if (!/^kegelkladde_\d{4}-\d{2}-\d{2}_\d{6}\.db$/.test(filename)) {
    return res.status(400).send("Ungültiger Dateiname.");
  }
  const filePath = path.join(backupDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Backup nicht gefunden.");
  }
  res.download(filePath, filename);
});

// Backup löschen
router.post("/admin/backup/delete", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const filename = String(req.body.filename || "");
  if (!/^kegelkladde_\d{4}-\d{2}-\d{2}_\d{6}\.db$/.test(filename)) {
    req.session.flash = { type: "error", message: "Ungültiger Dateiname." };
    return res.redirect("/admin#sicherung");
  }
  const filePath = path.join(backupDir, filename);
  if (!fs.existsSync(filePath)) {
    req.session.flash = { type: "error", message: "Backup nicht gefunden." };
    return res.redirect("/admin#sicherung");
  }
  fs.unlinkSync(filePath);
  const metaFile = filePath + ".meta.json";
  if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
  logAudit(req.session.userId, "BACKUP_DELETE", "backup", null, { filename });
  req.session.flash = { type: "success", message: "Sicherung gelöscht." };
  res.redirect("/admin#sicherung");
});

// Spieltage eines Backups auflisten (JSON für Modal)
router.get("/admin/backup/gamedays/:filename", requireAuth, requireAdmin, (req, res) => {
  const filename = req.params.filename;
  if (!/^kegelkladde_\d{4}-\d{2}-\d{2}_\d{6}\.db$/.test(filename)) {
    return res.status(400).json({ error: "Ungültiger Dateiname." });
  }
  try {
    const gamedays = listBackupGamedays(filename);
    res.json({ gamedays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ausgewählte Spieltage aus Backup wiederherstellen
router.post("/admin/backup/restore", requireAuth, requireAdmin, verifyCsrf, async (req, res) => {
  const filename = String(req.body.filename || "");
  if (!/^kegelkladde_\d{4}-\d{2}-\d{2}_\d{6}\.db$/.test(filename)) {
    return res.status(400).json({ error: "Ungültiger Dateiname." });
  }

  const raw = req.body.gamedayIds;
  let gamedayIds;
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw || "[]");
    gamedayIds = arr.map(Number).filter(Number.isInteger);
  } catch {
    return res.status(400).json({ error: "Ungültige Spieltag-IDs." });
  }

  if (gamedayIds.length === 0) {
    return res.status(400).json({ error: "Keine Spieltage ausgewählt." });
  }

  try {
    const userName = req.session.user ? req.session.user.firstName : "Admin";
    await createBackup(`Vor Wiederherstellung (${userName})`);
    rotateBackups(10);

    const result = restoreGamedays(filename, gamedayIds);
    logAudit(req.session.userId, "BACKUP_RESTORE", "backup", null, { filename, gamedayIds, restoredCount: result.restoredCount });
    res.json({ ok: true, message: `${result.restoredCount} Spieltag(e) wiederhergestellt.` });
  } catch (err) {
    console.error("[Backup] Restore fehlgeschlagen:", err.message);
    res.status(500).json({ error: "Wiederherstellung fehlgeschlagen: " + err.message });
  }
});

// ═══ Schaf-Umkleide ═══

router.get("/admin/umkleide", requireAuth, requireAdmin, (req, res) => {
  const configRow = db.prepare("SELECT value FROM settings WHERE key = 'sheep_accessory_config'").get();
  let sheepConfig = {};
  try { sheepConfig = configRow ? JSON.parse(configRow.value) : {}; } catch (e) { /* ignore */ }
  res.render("umkleide", { sheepConfig });
});

router.post("/admin/umkleide/save", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const config = req.body.config;
  if (!config || typeof config !== "object") {
    return res.status(400).json({ error: "Ungültige Konfiguration." });
  }
  const jsonStr = JSON.stringify(config);
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('sheep_accessory_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(jsonStr);
  logAudit(req.session.userId, "SHEEP_CONFIG_UPDATE", "settings", null, { configKeys: Object.keys(config) });
  res.json({ ok: true, message: "Accessoire-Konfiguration gespeichert." });
});

router.post("/admin/umkleide/reset", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  // Custom-Spritesheets vom Filesystem löschen
  const configRow = db.prepare("SELECT value FROM settings WHERE key = 'sheep_accessory_config'").get();
  if (configRow) {
    try {
      const cfg = JSON.parse(configRow.value);
      for (const cat of ["spriteHat", "spriteGlasses", "spriteStache"]) {
        if (cfg[cat] && cfg[cat].customSheet) {
          const filename = path.basename(cfg[cat].customSheet);
          const filepath = path.join(spriteUploadDir, filename);
          fs.unlink(filepath, (err) => { if (err) console.warn("unlink failed:", filepath, err.message); });
        }
      }
    } catch (e) { /* ignore */ }
  }
  db.prepare("DELETE FROM settings WHERE key = 'sheep_accessory_config'").run();
  logAudit(req.session.userId, "SHEEP_CONFIG_RESET", "settings", null, {});
  res.json({ ok: true, message: "Auf Standardwerte zurückgesetzt." });
});

// ═══ Spritesheet-Upload ═══

const spriteUploadDir = path.join(__dirname, "..", "data", "uploads", "spritesheets");
if (!fs.existsSync(spriteUploadDir)) {
  fs.mkdirSync(spriteUploadDir, { recursive: true });
}

const spriteStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, spriteUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

const spriteUpload = multer({
  storage: spriteStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

router.post("/admin/umkleide/upload-sprite", requireAuth, requireAdmin, spriteUpload.single("spritesheet"), verifyCsrf, (req, res) => {
  const validCats = ["spriteHat", "spriteGlasses", "spriteStache"];
  const category = req.body.category;
  if (!validCats.includes(category)) {
    if (req.file) fs.unlink(req.file.path, (err) => { if (err) console.warn("unlink failed:", req.file.path, err.message); });
    return res.status(400).json({ error: "Ungültige Kategorie." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Keine Datei hochgeladen." });
  }

  const url = "/uploads/spritesheets/" + req.file.filename;

  // Config laden, customSheet setzen, altes Sheet löschen
  const configRow = db.prepare("SELECT value FROM settings WHERE key = 'sheep_accessory_config'").get();
  let cfg = {};
  try { cfg = configRow ? JSON.parse(configRow.value) : {}; } catch (e) { /* ignore */ }

  if (!cfg[category]) cfg[category] = {};

  // Altes Custom-Sheet löschen
  if (cfg[category].customSheet) {
    const oldFile = path.basename(cfg[category].customSheet);
    const oldPath = path.join(spriteUploadDir, oldFile);
    fs.unlink(oldPath, (err) => { if (err) console.warn("unlink failed:", oldPath, err.message); });
  }

  cfg[category].customSheet = url;
  const jsonStr = JSON.stringify(cfg);
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('sheep_accessory_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(jsonStr);

  logAudit(req.session.userId, "SPRITE_UPLOAD", "settings", null, { category, filename: req.file.filename });
  res.json({ ok: true, url, message: "Spritesheet hochgeladen." });
});

router.post("/admin/umkleide/remove-sprite", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const validCats = ["spriteHat", "spriteGlasses", "spriteStache"];
  const category = req.body.category;
  if (!validCats.includes(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie." });
  }

  const configRow = db.prepare("SELECT value FROM settings WHERE key = 'sheep_accessory_config'").get();
  let cfg = {};
  try { cfg = configRow ? JSON.parse(configRow.value) : {}; } catch (e) { /* ignore */ }

  if (cfg[category] && cfg[category].customSheet) {
    const oldFile = path.basename(cfg[category].customSheet);
    const oldPath = path.join(spriteUploadDir, oldFile);
    fs.unlink(oldPath, (err) => { if (err) console.warn("unlink failed:", oldPath, err.message); });
    delete cfg[category].customSheet;

    const jsonStr = JSON.stringify(cfg);
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('sheep_accessory_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(jsonStr);
  }

  logAudit(req.session.userId, "SPRITE_REMOVE", "settings", null, { category });
  res.json({ ok: true, message: "Standard-Spritesheet wiederhergestellt." });
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

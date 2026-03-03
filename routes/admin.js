const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db, getOrderedMembers, withDisplayNames, logAudit, getKassenstand, getKassenstandForGameday, getRecentAuditLog, getUsersWithLastLogin, createBackup, rotateBackups, listBackups, listBackupGamedays, restoreGamedays, backupDir, getEpicMilestonesConfig } = require("../models/db");
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
  try {
    const config = req.body.config;
    if (!config || typeof config !== "object") {
      return res.status(400).json({ error: "Ungültige Konfiguration." });
    }
    const jsonStr = JSON.stringify(config);
    console.log("[Umkleide] Config-Größe:", (jsonStr.length / 1024).toFixed(1) + " KB");
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('sheep_accessory_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(jsonStr);
    logAudit(req.session.userId, "SHEEP_CONFIG_UPDATE", "settings", null, { configKeys: Object.keys(config) });
    res.json({ ok: true, message: "Accessoire-Konfiguration gespeichert." });
  } catch (err) {
    console.error("[Umkleide] Save-Fehler:", err.message);
    res.status(500).json({ error: "Speichern fehlgeschlagen: " + err.message });
  }
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

// ═══ Einzel-Sprite-Upload ═══

const DEFAULT_SLOT_COUNTS = { spriteHat: 25, spriteGlasses: 32, spriteStache: 12, spriteBody: 0, spriteTail: 0 };

const spriteSlotDir = path.join(__dirname, "..", "data", "uploads", "sprites");
if (!fs.existsSync(spriteSlotDir)) {
  fs.mkdirSync(spriteSlotDir, { recursive: true });
}

const spriteSlotStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cat = req.body.category || "unknown";
    const catDir = path.join(spriteSlotDir, cat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    cb(null, catDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cat = req.body.category || "slot";
    const idx = req.body.slotIndex || "0";
    const uniqueName = `${cat}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

const spriteSlotUpload = multer({
  storage: spriteSlotStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

function loadSheepConfig() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'sheep_accessory_config'").get();
  try { return row ? JSON.parse(row.value) : {}; } catch (e) { return {}; }
}

function saveSheepConfig(cfg) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('sheep_accessory_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(JSON.stringify(cfg));
}

function deleteSpriteFile(url) {
  if (!url) return;
  const filename = path.basename(url);
  const category = url.split("/").slice(-2, -1)[0]; // e.g. "spriteHat"
  const filePath = path.join(spriteSlotDir, category, filename);
  fs.unlink(filePath, (err) => { if (err && err.code !== "ENOENT") console.warn("unlink failed:", filePath, err.message); });
}

// Upload Einzel-Sprite für einen Slot
router.post("/admin/umkleide/upload-slot-sprite", requireAuth, requireAdmin, spriteSlotUpload.single("sprite"), verifyCsrf, (req, res) => {
  const validCats = ["spriteHat", "spriteGlasses", "spriteStache", "spriteBody", "spriteTail"];
  const category = req.body.category;
  const slotIndex = parseInt(req.body.slotIndex, 10);
  if (!validCats.includes(category) || !Number.isInteger(slotIndex) || slotIndex < 0) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Ungültige Parameter." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Keine Datei hochgeladen." });
  }

  const url = `/uploads/sprites/${category}/${req.file.filename}`;
  const defaultCount = DEFAULT_SLOT_COUNTS[category] || 0;
  const cfg = loadSheepConfig();
  if (!cfg[category]) cfg[category] = {};
  if (!cfg[category].items) cfg[category].items = {};
  if (!cfg[category].customSlots) cfg[category].customSlots = [];

  if (slotIndex < defaultCount) {
    // Default-Slot: customImage ersetzen
    if (!cfg[category].items[slotIndex]) cfg[category].items[slotIndex] = { dY: 0, dX: 0, dS: 1 };
    // Altes Bild löschen
    deleteSpriteFile(cfg[category].items[slotIndex].customImage);
    cfg[category].items[slotIndex].customImage = url;
  } else {
    // Custom-Slot
    const csIdx = slotIndex - defaultCount;
    if (csIdx < 0 || csIdx >= cfg[category].customSlots.length) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Slot existiert nicht." });
    }
    deleteSpriteFile(cfg[category].customSlots[csIdx].image);
    cfg[category].customSlots[csIdx].image = url;
  }

  saveSheepConfig(cfg);
  logAudit(req.session.userId, "SLOT_SPRITE_UPLOAD", "settings", null, { category, slotIndex, filename: req.file.filename });
  res.json({ ok: true, url, message: "Sprite hochgeladen." });
});

// Neuen Custom-Slot hinzufügen
router.post("/admin/umkleide/add-slot", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const validCats = ["spriteHat", "spriteGlasses", "spriteStache", "spriteBody", "spriteTail"];
  const category = req.body.category;
  if (!validCats.includes(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie." });
  }

  const defaultCount = DEFAULT_SLOT_COUNTS[category] || 0;
  const cfg = loadSheepConfig();
  if (!cfg[category]) cfg[category] = {};
  if (!cfg[category].customSlots) cfg[category].customSlots = [];

  cfg[category].customSlots.push({ image: null, dY: 0, dX: 0, dS: 1 });
  const newSlotIndex = defaultCount + cfg[category].customSlots.length - 1;

  saveSheepConfig(cfg);
  logAudit(req.session.userId, "SLOT_ADD", "settings", null, { category, slotIndex: newSlotIndex });
  res.json({ ok: true, slotIndex: newSlotIndex, message: "Slot hinzugefügt." });
});

// Custom-Slot entfernen
router.post("/admin/umkleide/remove-slot", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const validCats = ["spriteHat", "spriteGlasses", "spriteStache", "spriteBody", "spriteTail"];
  const category = req.body.category;
  const slotIndex = parseInt(req.body.slotIndex, 10);
  if (!validCats.includes(category) || !Number.isInteger(slotIndex)) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  const defaultCount = DEFAULT_SLOT_COUNTS[category] || 0;
  if (slotIndex < defaultCount) {
    return res.status(400).json({ error: "Standard-Slots können nicht entfernt werden." });
  }

  const cfg = loadSheepConfig();
  if (!cfg[category]) cfg[category] = {};
  if (!cfg[category].customSlots) cfg[category].customSlots = [];

  const csIdx = slotIndex - defaultCount;
  if (csIdx < 0 || csIdx >= cfg[category].customSlots.length) {
    return res.status(400).json({ error: "Slot existiert nicht." });
  }

  // Bild löschen
  deleteSpriteFile(cfg[category].customSlots[csIdx].image);
  cfg[category].customSlots.splice(csIdx, 1);

  saveSheepConfig(cfg);
  logAudit(req.session.userId, "SLOT_REMOVE", "settings", null, { category, slotIndex });
  res.json({ ok: true, message: "Slot entfernt." });
});

// Custom-Image von Default-Slot entfernen (zurück zu Spritesheet)
router.post("/admin/umkleide/remove-slot-sprite", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const validCats = ["spriteHat", "spriteGlasses", "spriteStache", "spriteBody", "spriteTail"];
  const category = req.body.category;
  const slotIndex = parseInt(req.body.slotIndex, 10);
  if (!validCats.includes(category) || !Number.isInteger(slotIndex) || slotIndex < 0) {
    return res.status(400).json({ error: "Ungültige Parameter." });
  }

  const defaultCount = DEFAULT_SLOT_COUNTS[category] || 0;
  if (slotIndex >= defaultCount) {
    return res.status(400).json({ error: "Nutze remove-slot für Custom-Slots." });
  }

  const cfg = loadSheepConfig();
  if (cfg[category] && cfg[category].items && cfg[category].items[slotIndex]) {
    deleteSpriteFile(cfg[category].items[slotIndex].customImage);
    delete cfg[category].items[slotIndex].customImage;
    saveSheepConfig(cfg);
  }

  logAudit(req.session.userId, "SLOT_SPRITE_REMOVE", "settings", null, { category, slotIndex });
  res.json({ ok: true, message: "Standard-Sprite wiederhergestellt." });
});

// API: Kassenstand als JSON (Spieltag-bezogen)
router.get("/api/kassenstand", requireAuth, (req, res) => {
  const gamedayId = Number.parseInt(req.query.gamedayId, 10);
  if (!Number.isInteger(gamedayId)) {
    return res.status(400).json({ error: "gamedayId fehlt." });
  }
  res.json(getKassenstandForGameday(gamedayId));
});

// Epic-Meilenstein-Config lesen
router.get("/admin/umkleide/epic-milestones", requireAuth, requireAdmin, (req, res) => {
  res.json(getEpicMilestonesConfig());
});

// Epic-Meilenstein-Config speichern
router.post("/admin/umkleide/epic-milestones", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const milestones = req.body.milestones;
  if (!Array.isArray(milestones)) {
    return res.status(400).json({ error: "milestones muss ein Array sein." });
  }
  const validTypes = ["alle9", "kranz"];
  const validRewards = ["body", "tail"];
  const cleaned = milestones.filter(
    (m) => validTypes.includes(m.type) && validRewards.includes(m.reward) && Number.isInteger(m.count) && m.count > 0
  );
  const value = JSON.stringify({ milestones: cleaned });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('epic_milestones_config', ?)").run(value);
  res.json({ ok: true });
});

module.exports = router;

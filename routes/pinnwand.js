const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db, logAudit } = require("../models/db");
const { requireAuth, verifyCsrf } = require("../middleware/auth");
const { sanitize } = require("../utils/helpers");

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "..", "data", "uploads", "pinnwand");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Nur JPG, PNG, GIF und WebP erlaubt."));
    }
  }
});

// GET /pinnwand
router.get("/pinnwand", requireAuth, (req, res) => {
  const messages = db.prepare(
    `SELECT p.id, p.user_id, p.message, p.color, p.image_path, p.created_at,
            p.pos_x, p.pos_y, p.rotation, p.card_style,
            u.first_name, u.last_name
     FROM pin_messages p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC`
  ).all();

  // Build display names — disambiguate by unique user_id per first_name
  const firstNameUsers = new Map();
  for (const m of messages) {
    if (!firstNameUsers.has(m.first_name)) firstNameUsers.set(m.first_name, new Set());
    firstNameUsers.get(m.first_name).add(m.user_id);
  }
  for (const m of messages) {
    const needsLast = firstNameUsers.get(m.first_name).size > 1;
    m.display_name = needsLast && m.last_name ? `${m.first_name} ${m.last_name[0]}` : m.first_name;
  }

  res.render("pinnwand", { messages });
});

// POST /pinnwand/add — multer must run before verifyCsrf (multipart body not parsed until multer runs)
router.post("/pinnwand/add", requireAuth, upload.single("image"), verifyCsrf, (req, res) => {
  const message = sanitize(req.body.message, 1000);
  if (!message) {
    if (req.file) fs.unlink(req.file.path, () => {});
    req.session.flash = { type: "error", message: "Nachricht darf nicht leer sein." };
    return res.redirect("/pinnwand");
  }

  const allowedColors = ["#fff9c4", "#c8e6c9", "#bbdefb", "#f8bbd0", "#e1bee7", "#ffe0b2"];
  const color = allowedColors.includes(req.body.color) ? req.body.color : "#fff9c4";
  const imagePath = req.file ? req.file.filename : null;

  const result = db.prepare(
    `INSERT INTO pin_messages (user_id, message, color, image_path) VALUES (?, ?, ?, ?)`
  ).run(req.session.userId, message, color, imagePath);

  logAudit(req.session.userId, "PIN_ADD", "pin_message", result.lastInsertRowid);
  req.session.flash = { type: "success", message: "Nachricht hinzugefügt." };
  res.redirect("/pinnwand");
});

// POST /pinnwand/delete
router.post("/pinnwand/delete", requireAuth, verifyCsrf, (req, res) => {
  const pinId = Number.parseInt(req.body.pinId, 10);
  if (!Number.isInteger(pinId)) {
    req.session.flash = { type: "error", message: "Ungültige ID." };
    return res.redirect("/pinnwand");
  }

  const pin = db.prepare("SELECT id, user_id, image_path FROM pin_messages WHERE id = ?").get(pinId);
  if (!pin) {
    req.session.flash = { type: "error", message: "Nachricht nicht gefunden." };
    return res.redirect("/pinnwand");
  }

  // Only owner or admin can delete
  if (pin.user_id !== req.session.userId && req.session.role !== "admin") {
    req.session.flash = { type: "error", message: "Keine Berechtigung." };
    return res.redirect("/pinnwand");
  }

  // Delete image file if exists
  if (pin.image_path) {
    const filePath = path.join(uploadDir, pin.image_path);
    fs.unlink(filePath, () => {});
  }

  db.prepare("DELETE FROM pin_messages WHERE id = ?").run(pinId);
  logAudit(req.session.userId, "PIN_DELETE", "pin_message", pinId);
  req.session.flash = { type: "success", message: "Nachricht gelöscht." };
  res.redirect("/pinnwand");
});

// POST /pinnwand/position — AJAX save position + rotation
router.post("/pinnwand/position", requireAuth, verifyCsrf, (req, res) => {
  const pinId = Number.parseInt(req.body.pinId, 10);
  const posX = Number.parseFloat(req.body.posX);
  const posY = Number.parseFloat(req.body.posY);
  const rotation = Number.parseFloat(req.body.rotation);

  if (!Number.isInteger(pinId) || Number.isNaN(posX) || Number.isNaN(posY) || Number.isNaN(rotation)) {
    return res.status(400).json({ ok: false, error: "Ungültige Werte." });
  }

  const pin = db.prepare("SELECT id, user_id FROM pin_messages WHERE id = ?").get(pinId);
  if (!pin) {
    return res.status(404).json({ ok: false, error: "Nachricht nicht gefunden." });
  }

  // Only the owner can move their own card
  if (pin.user_id !== req.session.userId) {
    return res.status(403).json({ ok: false, error: "Nur eigene Karten verschieben." });
  }

  db.prepare("UPDATE pin_messages SET pos_x = ?, pos_y = ?, rotation = ? WHERE id = ?").run(posX, posY, rotation, pinId);
  res.json({ ok: true });
});

// POST /pinnwand/style — AJAX save card style
const ALLOWED_STYLES = ['', 'polaroid', 'vintage', 'neon', 'doodle', 'frame', 'dark', 'glass', 'wobble', 'elegant', 'retro', 'tape', 'shadow'];
router.post("/pinnwand/style", requireAuth, verifyCsrf, (req, res) => {
  const pinId = Number.parseInt(req.body.pinId, 10);
  const style = String(req.body.style || '');

  if (!Number.isInteger(pinId) || !ALLOWED_STYLES.includes(style)) {
    return res.status(400).json({ ok: false, error: "Ungültige Werte." });
  }

  const pin = db.prepare("SELECT id, user_id FROM pin_messages WHERE id = ?").get(pinId);
  if (!pin) {
    return res.status(404).json({ ok: false, error: "Nachricht nicht gefunden." });
  }

  if (pin.user_id !== req.session.userId) {
    return res.status(403).json({ ok: false, error: "Nur eigene Karten stylen." });
  }

  db.prepare("UPDATE pin_messages SET card_style = ? WHERE id = ?").run(style, pinId);
  res.json({ ok: true });
});

module.exports = router;

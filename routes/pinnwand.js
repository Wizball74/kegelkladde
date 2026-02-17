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
            u.first_name, u.last_name
     FROM pin_messages p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC`
  ).all();

  // Build display names
  const firstNameCount = new Map();
  for (const m of messages) {
    firstNameCount.set(m.first_name, (firstNameCount.get(m.first_name) || 0) + 1);
  }
  for (const m of messages) {
    const needsLast = firstNameCount.get(m.first_name) > 1;
    m.display_name = needsLast && m.last_name ? `${m.first_name} ${m.last_name[0]}.` : m.first_name;
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

module.exports = router;

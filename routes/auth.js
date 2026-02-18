const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { db, logAudit } = require("../models/db");
const { verifyCsrf } = require("../middleware/auth");
const { sanitize } = require("../utils/helpers");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Zu viele Login-Versuche. Bitte spaeter erneut versuchen.",
  validate: { xForwardedForHeader: false }
});

router.get("/setup", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return res.redirect("/login");
  res.render("setup", { error: null });
});

router.post("/setup/create", verifyCsrf, async (req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return res.redirect("/login");

  const username = sanitize(req.body.username, 40);
  const password = String(req.body.password || "");
  const firstName = sanitize(req.body.firstName, 60);
  const lastName = sanitize(req.body.lastName, 60);

  if (!username || password.length < 8 || !firstName) {
    return res.render("setup", { error: "Bitte alle Pflichtfelder korrekt ausfuellen (Passwort min. 8 Zeichen)." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    `INSERT INTO users (username, password_hash, role, first_name, last_name)
     VALUES (?, ?, 'admin', ?, ?)`
  ).run(username, passwordHash, firstName, lastName);

  logAudit(result.lastInsertRowid, "SETUP_COMPLETE", "user", result.lastInsertRowid, { username });

  res.redirect("/login");
});

router.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/kegelkladde");
  res.render("login", { error: null });
});

router.post("/login", loginLimiter, verifyCsrf, async (req, res) => {
  const username = sanitize(req.body.username, 40);
  const password = String(req.body.password || "");

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) {
    return res.render("login", { error: "Ungueltige Zugangsdaten." });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.render("login", { error: "Ungueltige Zugangsdaten." });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.user = {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role
  };

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  logAudit(user.id, "LOGIN", "user", user.id);

  req.session.flash = { type: "success", message: `Willkommen, ${user.first_name}!` };
  res.redirect("/kegelkladde");
});

router.post("/logout", verifyCsrf, (req, res) => {
  const userId = req.session.userId;
  if (userId) {
    logAudit(userId, "LOGOUT", "user", userId);
  }
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;

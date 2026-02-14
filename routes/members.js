const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db, encrypt, decrypt, logAudit, getOrderedMembers, withDisplayNames } = require("../models/db");
const { requireAuth, requireAdmin, verifyCsrf } = require("../middleware/auth");
const { sanitize, parsePhones } = require("../utils/helpers");

const router = express.Router();

router.get("/members", requireAuth, (req, res) => {
  const members = db
    .prepare("SELECT id, username, role, is_guest, first_name, last_name, address_enc, email_enc, phones_enc FROM users ORDER BY lower(first_name), lower(last_name)")
    .all()
    .map((m) => ({
      ...m,
      address: decrypt(m.address_enc),
      email: decrypt(m.email_enc),
      phones: JSON.parse(decrypt(m.phones_enc) || "[]")
    }));

  const current = members.find((m) => m.id === req.session.userId);
  const requestedEditId = Number.parseInt(req.query.editUserId, 10);
  const editableMember = req.session.role === "admin"
    ? (
      Number.isInteger(requestedEditId)
        ? members.find((m) => m.id === requestedEditId) || members[0]
        : members[0]
    )
    : null;
  const editError = sanitize(req.query.editError, 140);

  const orderedMembers = withDisplayNames(getOrderedMembers());

  res.render("members", {
    members,
    orderedMembers,
    current,
    error: null,
    editableMember,
    editError
  });
});

router.post("/members/profile", requireAuth, verifyCsrf, (req, res) => {
  const firstName = sanitize(req.body.firstName, 60);
  const lastName = sanitize(req.body.lastName, 60);
  const address = sanitize(req.body.address, 200);
  const email = sanitize(req.body.email, 120);
  const phones = parsePhones(req.body.phones);

  if (!firstName) {
    req.session.flash = { type: "error", message: "Vorname ist erforderlich." };
    return res.redirect("/members");
  }

  db.prepare(
    `UPDATE users
     SET first_name = ?,
         last_name = ?,
         address_enc = ?,
         email_enc = ?,
         phones_enc = ?
     WHERE id = ?`
  ).run(
    firstName,
    lastName,
    encrypt(address),
    encrypt(email),
    encrypt(JSON.stringify(phones)),
    req.session.userId
  );

  req.session.user.firstName = firstName;
  req.session.user.lastName = lastName;

  logAudit(req.session.userId, "PROFILE_UPDATE", "user", req.session.userId);
  req.session.flash = { type: "success", message: "Profil gespeichert." };

  res.redirect("/members");
});

router.post("/members/change-password", requireAuth, verifyCsrf, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (newPassword.length < 8) {
    req.session.flash = { type: "error", message: "Neues Passwort muss mindestens 8 Zeichen haben." };
    return res.redirect("/members");
  }

  if (newPassword !== confirmPassword) {
    req.session.flash = { type: "error", message: "Passwörter stimmen nicht überein." };
    return res.redirect("/members");
  }

  const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.session.userId);
  const ok = await bcrypt.compare(currentPassword, user.password_hash);

  if (!ok) {
    req.session.flash = { type: "error", message: "Aktuelles Passwort ist falsch." };
    return res.redirect("/members");
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, req.session.userId);

  logAudit(req.session.userId, "PASSWORD_CHANGE", "user", req.session.userId);
  req.session.flash = { type: "success", message: "Passwort geändert." };

  res.redirect("/members");
});

router.post("/members/admin-update", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const memberId = Number.parseInt(req.body.memberId, 10);
  if (!Number.isInteger(memberId)) {
    return res.redirect("/members?editError=ungueltige+Mitglieds-ID");
  }

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(memberId);
  if (!existing) {
    return res.redirect("/members?editError=Mitglied+nicht+gefunden");
  }

  const username = sanitize(req.body.username, 40);
  const role = req.body.role === "admin" ? "admin" : "user";
  const firstName = sanitize(req.body.firstName, 60);
  const lastName = sanitize(req.body.lastName, 60);
  const address = sanitize(req.body.address, 200);
  const email = sanitize(req.body.email, 120);
  const phones = parsePhones(req.body.phones);

  if (!username || !firstName) {
    return res.redirect(`/members?editUserId=${memberId}&editError=Benutzername+und+Vorname+sind+Pflicht`);
  }

  const duplicate = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, memberId);
  if (duplicate) {
    return res.redirect(`/members?editUserId=${memberId}&editError=Benutzername+bereits+vergeben`);
  }

  db.prepare(
    `UPDATE users
     SET username = ?,
         role = ?,
         first_name = ?,
         last_name = ?,
         address_enc = ?,
         email_enc = ?,
         phones_enc = ?
     WHERE id = ?`
  ).run(
    username,
    role,
    firstName,
    lastName,
    encrypt(address),
    encrypt(email),
    encrypt(JSON.stringify(phones)),
    memberId
  );

  if (req.session.userId === memberId) {
    req.session.role = role;
    req.session.user.username = username;
    req.session.user.firstName = firstName;
    req.session.user.lastName = lastName;
    req.session.user.role = role;
  }

  logAudit(req.session.userId, "MEMBER_UPDATE", "user", memberId, { username, role });
  req.session.flash = { type: "success", message: "Mitglied aktualisiert." };

  res.redirect(`/members?editUserId=${memberId}`);
});

router.post("/members/reset-password", requireAuth, requireAdmin, verifyCsrf, async (req, res) => {
  const memberId = Number.parseInt(req.body.memberId, 10);
  const newPassword = String(req.body.newPassword || "");

  if (!Number.isInteger(memberId)) {
    req.session.flash = { type: "error", message: "Ungültige Mitglieds-ID." };
    return res.redirect("/members");
  }

  if (newPassword.length < 8) {
    req.session.flash = { type: "error", message: "Passwort muss mindestens 8 Zeichen haben." };
    return res.redirect(`/members?editUserId=${memberId}`);
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, memberId);

  logAudit(req.session.userId, "PASSWORD_RESET", "user", memberId);
  req.session.flash = { type: "success", message: "Passwort zurückgesetzt." };

  res.redirect(`/members?editUserId=${memberId}`);
});

router.post("/members/create", requireAuth, requireAdmin, verifyCsrf, async (req, res) => {
  const username = sanitize(req.body.username, 40);
  const password = String(req.body.password || "");
  const firstName = sanitize(req.body.firstName, 60);
  const lastName = sanitize(req.body.lastName, 60);
  const role = req.body.role === "admin" ? "admin" : "user";

  if (!username || password.length < 8 || !firstName) {
    req.session.flash = { type: "error", message: "Benutzername, Passwort (min. 8 Zeichen) und Vorname erforderlich." };
    return res.redirect("/members");
  }

  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    req.session.flash = { type: "error", message: "Benutzername bereits vergeben." };
    return res.redirect("/members");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    `INSERT INTO users (username, password_hash, role, is_guest, first_name, last_name)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run(username, passwordHash, role, firstName, lastName);

  logAudit(req.session.userId, "MEMBER_CREATE", "user", result.lastInsertRowid, { username, role });
  req.session.flash = { type: "success", message: `Mitglied ${firstName} angelegt.` };

  res.redirect("/members");
});

router.post("/members/create-guest", requireAuth, requireAdmin, verifyCsrf, async (req, res) => {
  const firstName = sanitize(req.body.firstName, 60);
  const lastName = sanitize(req.body.lastName, 60) || "Gast";

  if (!firstName) {
    req.session.flash = { type: "error", message: "Vorname erforderlich." };
    return res.redirect("/members");
  }

  const guestUsername = `gast_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const guestSecret = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(guestSecret, 12);

  const result = db.prepare(
    `INSERT INTO users (username, password_hash, role, is_guest, first_name, last_name)
     VALUES (?, ?, 'user', 1, ?, ?)`
  ).run(guestUsername, passwordHash, firstName, lastName);

  logAudit(req.session.userId, "GUEST_CREATE", "user", result.lastInsertRowid, { firstName, lastName });
  req.session.flash = { type: "success", message: `Gast ${firstName} hinzugefügt.` };

  res.redirect("/members");
});

router.post("/members/delete", requireAuth, requireAdmin, verifyCsrf, (req, res) => {
  const memberId = Number.parseInt(req.body.memberId, 10);

  if (!Number.isInteger(memberId)) {
    req.session.flash = { type: "error", message: "Ungültige Mitglieds-ID." };
    return res.redirect("/members");
  }

  if (memberId === req.session.userId) {
    req.session.flash = { type: "error", message: "Du kannst dich nicht selbst löschen." };
    return res.redirect("/members");
  }

  const member = db.prepare("SELECT first_name, last_name FROM users WHERE id = ?").get(memberId);
  if (!member) {
    req.session.flash = { type: "error", message: "Mitglied nicht gefunden." };
    return res.redirect("/members");
  }

  db.prepare("DELETE FROM attendance WHERE user_id = ?").run(memberId);
  db.prepare("DELETE FROM users WHERE id = ?").run(memberId);

  logAudit(req.session.userId, "MEMBER_DELETE", "user", memberId, { firstName: member.first_name, lastName: member.last_name });
  req.session.flash = { type: "success", message: `Mitglied ${member.first_name} gelöscht.` };

  res.redirect("/members");
});

module.exports = router;

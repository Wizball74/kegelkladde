const crypto = require("crypto");
const { db } = require("../models/db");

function ensureSessionCsrf(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
}

function verifyCsrf(req, res, next) {
  ensureSessionCsrf(req);
  const token = req.body.csrfToken || req.headers["x-csrf-token"];
  if (token !== req.session.csrfToken) {
    return res.status(403).send("CSRF-Token ungueltig.");
  }
  next();
}

function requireInitialized(req, res, next) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count === 0 && req.path !== "/setup" && req.path !== "/setup/create") {
    return res.redirect("/setup");
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.role !== "admin") {
    req.session.flash = { type: "error", message: "Nur Admin erlaubt." };
    return res.status(403).redirect("back");
  }
  next();
}

function flashMiddleware(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

function setLocals(req, res, next) {
  ensureSessionCsrf(req);
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.currentUser = req.session.user || null;
  res.locals.isAdmin = req.session.role === "admin";
  res.locals.currentPath = req.path;
  next();
}

module.exports = {
  ensureSessionCsrf,
  verifyCsrf,
  requireInitialized,
  requireAuth,
  requireAdmin,
  flashMiddleware,
  setLocals
};

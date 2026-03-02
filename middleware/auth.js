const crypto = require("crypto");
const { db } = require("../models/db");
const appVersion = require("../package.json").version;

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
  // Track last access: update once per session (flag prevents repeated writes)
  if (!req.session._accessLogged) {
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(req.session.userId);
    req.session._accessLogged = true;
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
  res.locals.v = appVersion;
  const sheepRow = db.prepare("SELECT value FROM settings WHERE key = 'flying_sheep'").get();
  res.locals.sheepEnabled = sheepRow ? sheepRow.value === "1" : true;
  const sheepCfgRow = db.prepare("SELECT value FROM settings WHERE key = 'sheep_accessory_config'").get();
  res.locals.sheepConfig = sheepCfgRow ? sheepCfgRow.value : null;

  res.locals.renderAvatar = function(user, cssClass, attendance) {
    const mode = user.avatar_mode || user.avatarMode || 'sheep';
    const fn = user.first_name || user.firstName || '';
    const ln = user.last_name || user.lastName || '';
    const initials = (fn[0] || '').toUpperCase() + (ln[0] || '').toUpperCase();
    if (mode === 'upload' && user.avatar) {
      return `<img src="/uploads/avatars/${user.avatar}" alt="" class="${cssClass}" />`;
    }
    if (mode === 'sheep') {
      const src = (attendance && attendance.random_avatar)
        ? `/img/avatarsheeps/${attendance.random_avatar}`
        : '/img/sheep.png';
      return `<img src="${src}" alt="" class="${cssClass}" />`;
    }
    return `<span class="${cssClass} ${cssClass}-initials">${initials}</span>`;
  };

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

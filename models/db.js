const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Seed: Fehlende Uploads aus seed/ ins Volume kopieren
const seedUploads = path.join(__dirname, "..", "seed", "uploads");
if (fs.existsSync(seedUploads)) {
  const copyRecursive = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) copyRecursive(s, d);
      else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
    }
  };
  copyRecursive(seedUploads, path.join(dataDir, "uploads"));
  console.log("Seed-Uploads ins Volume kopiert.");
}

const db = new Database(path.join(dataDir, "kegelkladde.db"));
db.pragma("journal_mode = WAL");

// Schema creation
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    is_guest INTEGER NOT NULL DEFAULT 0,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    address_enc TEXT,
    email_enc TEXT,
    phones_enc TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS member_order (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    order_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gamedays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_date TEXT NOT NULL,
    note TEXT,
    settled INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    gameday_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    present INTEGER NOT NULL DEFAULT 0,
    triclops INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(gameday_id, user_id),
    FOREIGN KEY(gameday_id) REFERENCES gamedays(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL CHECK(section IN ('rangliste', 'kurioses')),
    title TEXT NOT NULL,
    holder TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Migrations
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("is_guest")) {
  db.exec("ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0");
}

const gamedayColumns = db.prepare("PRAGMA table_info(gamedays)").all().map((c) => c.name);
if (!gamedayColumns.includes("settled")) {
  db.exec("ALTER TABLE gamedays ADD COLUMN settled INTEGER NOT NULL DEFAULT 0");
}
if (!gamedayColumns.includes("lane_cost")) {
  db.exec("ALTER TABLE gamedays ADD COLUMN lane_cost REAL NOT NULL DEFAULT 0");
}

// Migration tracking
db.exec(`CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

// Migrate binary settled (0/1) to 4-state status (0=Noch nicht begonnen, 1=Gut Holz!, 2=Abrechnung, 3=Archiv)
const statusMigration = db.prepare("SELECT 1 FROM migrations WHERE name = 'settled_to_4state'").get();
if (!statusMigration) {
  db.exec("UPDATE gamedays SET settled = 3 WHERE settled = 1");
  db.exec("UPDATE gamedays SET settled = 1 WHERE settled = 0");
  db.prepare("INSERT INTO migrations (name) VALUES ('settled_to_4state')").run();
}

const attendanceColumns = db.prepare("PRAGMA table_info(attendance)").all().map((c) => c.name);
if (!attendanceColumns.includes("penalties")) {
  db.exec("ALTER TABLE attendance ADD COLUMN penalties INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("contribution")) {
  db.exec("ALTER TABLE attendance ADD COLUMN contribution REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("alle9")) {
  db.exec("ALTER TABLE attendance ADD COLUMN alle9 INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("kranz")) {
  db.exec("ALTER TABLE attendance ADD COLUMN kranz INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("pudel")) {
  db.exec("ALTER TABLE attendance ADD COLUMN pudel INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("carryover")) {
  db.exec("ALTER TABLE attendance ADD COLUMN carryover REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("paid")) {
  db.exec("ALTER TABLE attendance ADD COLUMN paid REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("va")) {
  db.exec("ALTER TABLE attendance ADD COLUMN va REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("monte")) {
  db.exec("ALTER TABLE attendance ADD COLUMN monte REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("aussteigen")) {
  db.exec("ALTER TABLE attendance ADD COLUMN aussteigen REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("sechs_tage")) {
  db.exec("ALTER TABLE attendance ADD COLUMN sechs_tage REAL NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("monte_extra")) {
  db.exec("ALTER TABLE attendance ADD COLUMN monte_extra INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("monte_tiebreak")) {
  db.exec("ALTER TABLE attendance ADD COLUMN monte_tiebreak INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("aussteigen_tiebreak")) {
  db.exec("ALTER TABLE attendance ADD COLUMN aussteigen_tiebreak INTEGER NOT NULL DEFAULT 0");
}
if (!attendanceColumns.includes("struck_games")) {
  db.exec("ALTER TABLE attendance ADD COLUMN struck_games TEXT");
}

// Custom games tables
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameday_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(gameday_id) REFERENCES gamedays(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_game_values (
    gameday_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    custom_game_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(gameday_id, user_id, custom_game_id),
    FOREIGN KEY(gameday_id) REFERENCES gamedays(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(custom_game_id) REFERENCES custom_games(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS member_initial_values (
    user_id INTEGER PRIMARY KEY,
    initial_alle9 INTEGER NOT NULL DEFAULT 0,
    initial_kranz INTEGER NOT NULL DEFAULT 0,
    initial_carryover REAL NOT NULL DEFAULT 0,
    initial_monte_points INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gameday_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameday_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('cost', 'income')),
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(gameday_id) REFERENCES gamedays(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS round_wins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('monte', 'medaillen')),
    round_number INTEGER NOT NULL,
    winner_user_id INTEGER NOT NULL,
    winning_gameday_id INTEGER NOT NULL,
    winning_score INTEGER NOT NULL,
    standings_json TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(winner_user_id) REFERENCES users(id),
    FOREIGN KEY(winning_gameday_id) REFERENCES gamedays(id),
    UNIQUE(type, round_number)
  );

  CREATE TABLE IF NOT EXISTS pin_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#fff9c4',
    image_path TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration: alte gameday_costs Tabelle entfernen falls vorhanden
db.exec("DROP TABLE IF EXISTS gameday_costs");

// Migration: member_initial_values neue Spalten
const mivColumns = db.prepare("PRAGMA table_info(member_initial_values)").all().map((c) => c.name);
if (!mivColumns.includes("initial_monte_points")) {
  db.exec("ALTER TABLE member_initial_values ADD COLUMN initial_monte_points INTEGER NOT NULL DEFAULT 0");
}
if (!mivColumns.includes("initial_monte_siege")) {
  db.exec("ALTER TABLE member_initial_values ADD COLUMN initial_monte_siege INTEGER NOT NULL DEFAULT 0");
}
if (!mivColumns.includes("initial_medaillen_siege")) {
  db.exec("ALTER TABLE member_initial_values ADD COLUMN initial_medaillen_siege INTEGER NOT NULL DEFAULT 0");
}
if (!mivColumns.includes("initial_medaillen_points")) {
  db.exec("ALTER TABLE member_initial_values ADD COLUMN initial_medaillen_points INTEGER NOT NULL DEFAULT 0");
}

// Migration: pin_messages position + rotation columns
const pinColumns = db.prepare("PRAGMA table_info(pin_messages)").all().map((c) => c.name);
if (!pinColumns.includes("pos_x")) {
  db.exec("ALTER TABLE pin_messages ADD COLUMN pos_x REAL");
}
if (!pinColumns.includes("pos_y")) {
  db.exec("ALTER TABLE pin_messages ADD COLUMN pos_y REAL");
}
if (!pinColumns.includes("rotation")) {
  db.exec("ALTER TABLE pin_messages ADD COLUMN rotation REAL NOT NULL DEFAULT 0");
}
if (!pinColumns.includes("card_style")) {
  db.exec("ALTER TABLE pin_messages ADD COLUMN card_style TEXT NOT NULL DEFAULT ''");
}

// Migration: last_login_at auf users
if (!userColumns.includes("last_login_at")) {
  db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
}

// Create indexes for performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_gamedays_match_date ON gamedays(match_date DESC);
  CREATE INDEX IF NOT EXISTS idx_attendance_gameday ON attendance(gameday_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
  CREATE INDEX IF NOT EXISTS idx_records_section ON records(section);
  CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
  CREATE INDEX IF NOT EXISTS idx_round_wins_type_round ON round_wins(type, round_number DESC);
  CREATE INDEX IF NOT EXISTS idx_pin_messages_created ON pin_messages(created_at DESC);
`);

// Encryption functions
function getEncryptionKey() {
  if (process.env.FIELD_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
    }
    return key;
  }
  const fallback = process.env.SESSION_SECRET || "dev-only-fallback-change-me";
  return crypto.createHash("sha256").update(fallback).digest();
}

const encKey = getEncryptionKey();

function encrypt(text) {
  if (!text || !text.trim()) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(payload) {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encKey,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}

// Member helper functions
function getOrderedMembers() {
  const members = db
    .prepare("SELECT id, first_name, last_name, role, is_guest FROM users ORDER BY lower(first_name), lower(last_name)")
    .all();

  const orderRow = db.prepare("SELECT order_json FROM member_order WHERE id = 1").get();
  if (!orderRow) return members;

  let order = [];
  try {
    order = JSON.parse(orderRow.order_json);
  } catch {
    return members;
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const ordered = [];

  for (const id of order) {
    const member = memberMap.get(Number(id));
    if (member) {
      ordered.push(member);
      memberMap.delete(Number(id));
    }
  }

  for (const member of memberMap.values()) {
    ordered.push(member);
  }

  return ordered;
}

function withDisplayNames(members) {
  const firstNameCount = new Map();
  for (const m of members) {
    firstNameCount.set(m.first_name, (firstNameCount.get(m.first_name) || 0) + 1);
  }
  return members.map((m) => {
    const needsLastInitial = firstNameCount.get(m.first_name) > 1;
    const lastInitial = m.last_name ? `${m.last_name[0]}.` : "";
    return {
      ...m,
      display_name: needsLastInitial && lastInitial ? `${m.first_name} ${lastInitial}` : m.first_name
    };
  });
}

// Audit logging
function logAudit(userId, action, targetType = null, targetId = null, details = null) {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`
    ).run(userId, action, targetType, targetId, details ? JSON.stringify(details) : null);
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

// Kassenstand berechnen
function getKassenstand() {
  const details = getKassenstandDetails();
  return details.kassenstand;
}

function getKassenstandDetails() {
  const startRow = db.prepare("SELECT value FROM settings WHERE key = 'kassenstand_start'").get();
  const start = Number(startRow?.value || 0);
  const totalPaid = db.prepare("SELECT COALESCE(SUM(paid), 0) as total FROM attendance").get().total;
  const totalIncome = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM gameday_entries WHERE type = 'income'").get().total;
  const totalCosts = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM gameday_entries WHERE type = 'cost'").get().total;
  const totalExpenses = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses").get().total;
  const kassenstand = Math.round((start + totalPaid + totalIncome - totalCosts - totalExpenses) * 100) / 100;
  return { start, totalPaid, totalIncome, totalCosts, totalExpenses, kassenstand };
}

// Kassenstand-Aufstellung für einen bestimmten Spieltag
function getKassenstandForGameday(gamedayId) {
  const details = getKassenstandDetails();
  const gamedayPaid = db.prepare("SELECT COALESCE(SUM(paid), 0) as total FROM attendance WHERE gameday_id = ?").get(gamedayId).total;
  const gamedayIncome = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM gameday_entries WHERE gameday_id = ? AND type = 'income'").get(gamedayId).total;
  const gamedayCostTotal = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM gameday_entries WHERE gameday_id = ? AND type = 'cost'").get(gamedayId).total;
  const previousKassenstand = Math.round((details.kassenstand - gamedayPaid - gamedayIncome + gamedayCostTotal) * 100) / 100;
  const incomeItems = db.prepare("SELECT id, name, amount FROM gameday_entries WHERE gameday_id = ? AND type = 'income' ORDER BY sort_order, id").all(gamedayId);
  const costItems = db.prepare("SELECT id, name, amount FROM gameday_entries WHERE gameday_id = ? AND type = 'cost' ORDER BY sort_order, id").all(gamedayId);
  return {
    previousKassenstand,
    gamedayPaid,
    gamedayIncome,
    gamedayCostTotal,
    incomeItems,
    costItems,
    kassenstand: details.kassenstand
  };
}

function getRecentAuditLog(limit = 50) {
  return db.prepare(
    `SELECT a.*, u.first_name, u.last_name
     FROM audit_log a
     JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC
     LIMIT ?`
  ).all(limit);
}

function getUsersWithLastLogin() {
  return db.prepare(
    `SELECT id, username, first_name, last_name, role, last_login_at, created_at
     FROM users
     WHERE is_guest = 0
     ORDER BY last_login_at DESC`
  ).all();
}

module.exports = {
  db,
  encrypt,
  decrypt,
  getOrderedMembers,
  withDisplayNames,
  logAudit,
  getKassenstand,
  getKassenstandDetails,
  getKassenstandForGameday,
  getRecentAuditLog,
  getUsersWithLastLogin
};

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
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

// Create indexes for performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_gamedays_match_date ON gamedays(match_date DESC);
  CREATE INDEX IF NOT EXISTS idx_attendance_gameday ON attendance(gameday_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
  CREATE INDEX IF NOT EXISTS idx_records_section ON records(section);
  CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
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

module.exports = {
  db,
  encrypt,
  decrypt,
  getOrderedMembers,
  withDisplayNames,
  logAudit
};

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const file = process.env.DB_PATH || path.join(dataDir, "ledger.db");

let db;
try {
  // Fast native driver. It is an *optional* dependency, so a failed install doesn't block you.
  const Database = require("better-sqlite3");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (nativeErr) {
  // Fallback: SQLite built into Node.js 22.5+ (no install, no compiling).
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    console.error("\nNo SQLite driver is available.\nFix: install Node.js 22 LTS or newer (https://nodejs.org), then run `npm install` again.\n");
    throw nativeErr;
  }
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db = {
    prepare: (sql) => raw.prepare(sql),
    exec: (sql) => raw.exec(sql),
    transaction: (fn) => (...args) => {
      raw.exec("BEGIN");
      try { const out = fn(...args); raw.exec("COMMIT"); return out; }
      catch (e) { raw.exec("ROLLBACK"); throw e; }
    },
  };
}

db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

// Upgrade databases created by earlier versions (existing accounts count as verified).
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
for (const [col, def] of [["first_name", "TEXT"], ["last_name", "TEXT"], ["verified", "INTEGER NOT NULL DEFAULT 1"]]) {
  if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
}

module.exports = db;

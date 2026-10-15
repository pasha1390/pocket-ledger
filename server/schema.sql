CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  first_name    TEXT,
  last_name     TEXT,
  password_hash TEXT,
  google_sub    TEXT UNIQUE,
  verified      INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('income','expense')),
  title      TEXT NOT NULL,
  amount     REAL NOT NULL CHECK (amount > 0),
  currency   TEXT NOT NULL CHECK (currency IN ('USD','TMN')),
  tag        TEXT NOT NULL,
  date       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cur     TEXT NOT NULL DEFAULT 'USD' CHECK (cur IN ('USD','TMN')),
  rate    REAL NOT NULL DEFAULT 100000 CHECK (rate > 0),
  budget  REAL NOT NULL DEFAULT 0 CHECK (budget >= 0),
  theme   TEXT NOT NULL DEFAULT '' CHECK (theme IN ('','light','dark'))
);

-- Small per-user JSON store: category budgets, recurring items, goals, preferences.
CREATE TABLE IF NOT EXISTS kv (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  k       TEXT NOT NULL,
  v       TEXT NOT NULL,
  PRIMARY KEY (user_id, k)
);

-- One-time email codes (stored hashed): "register" verifies a new email, "login" is the sign-in code.
CREATE TABLE IF NOT EXISTS codes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('register','login')),
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, purpose)
);

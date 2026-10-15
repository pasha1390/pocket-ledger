// One-time email codes: random 6 digits, stored only as an HMAC hash, expire after 10 minutes,
// locked after 5 wrong tries, and can be re-sent at most every 30 seconds.
const crypto = require("crypto");
const db = require("./db");
const SECRET = require("./secret");

const TTL = 10 * 60 * 1000, COOLDOWN = 30 * 1000, MAX_TRIES = 5;
const get = db.prepare("SELECT * FROM codes WHERE user_id = ? AND purpose = ?");
const put = db.prepare(`INSERT INTO codes (user_id, purpose, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, ?, 0, ?)
  ON CONFLICT(user_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`);
const del = db.prepare("DELETE FROM codes WHERE user_id = ? AND purpose = ?");
const bump = db.prepare("UPDATE codes SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?");

const hash = (uid, purpose, code) => crypto.createHmac("sha256", SECRET).update(`${uid}:${purpose}:${code}`).digest("hex");

function hasPending(uid, purpose) { return !!get.get(uid, purpose); }

function cooldownLeft(uid, purpose) {
  const r = get.get(uid, purpose);
  return r ? Math.max(0, Math.ceil((r.sent_at + COOLDOWN - Date.now()) / 1000)) : 0;
}

function createCode(uid, purpose) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  put.run(uid, purpose, hash(uid, purpose, code), Date.now() + TTL, Date.now());
  return code;
}

function checkCode(uid, purpose, input) {
  const r = get.get(uid, purpose);
  if (!r) return { ok: false, error: "No code is waiting. Please request a new one." };
  if (r.expires_at < Date.now()) { del.run(uid, purpose); return { ok: false, error: "That code has expired. Request a new one." }; }
  if (r.attempts >= MAX_TRIES) return { ok: false, error: "Too many wrong tries. Request a new code." };
  const given = Buffer.from(hash(uid, purpose, String(input).trim())), want = Buffer.from(r.code_hash);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    bump.run(uid, purpose);
    const left = MAX_TRIES - r.attempts - 1;
    return { ok: false, error: `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` };
  }
  del.run(uid, purpose);
  return { ok: true };
}

module.exports = { createCode, checkCode, cooldownLeft, hasPending };

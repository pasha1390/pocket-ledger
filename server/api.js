const express = require("express");
const rateLimit = require("express-rate-limit");
const { sendMail, exportEmail } = require("./mailer");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();
router.use(requireAuth);

const CURRENCIES = ["USD", "TMN"];

// Validate and normalise one transaction. Returns null if invalid.
function clean(b) {
  if (!b || typeof b !== "object") return null;
  const kind = b.kind === "income" || b.kind === "expense" ? b.kind : null;
  const amount = Number(b.amount);
  const currency = CURRENCIES.includes(b.currency) ? b.currency : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? String(b.date) : null;
  let title = String(b.title || "").trim().slice(0, 120);
  let tag = String(b.tag || "").trim().slice(0, 40);
  if (kind === "income") { title = title || "Income"; tag = tag || "Income"; }
  if (!kind || !(amount > 0) || amount > 1e15 || !currency || !date || !title || !tag) return null;
  return { kind, title, amount, currency, tag, date };
}

const COLS = "id, kind, title, amount, currency, tag, date";
const list = db.prepare(`SELECT ${COLS} FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC`);
const insert = db.prepare("INSERT INTO transactions (user_id, kind, title, amount, currency, tag, date) VALUES (@user_id, @kind, @title, @amount, @currency, @tag, @date)");
const update = db.prepare("UPDATE transactions SET kind = @kind, title = @title, amount = @amount, currency = @currency, tag = @tag, date = @date WHERE id = @id AND user_id = @user_id");
const removeOne = db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?");
const removeAll = db.prepare("DELETE FROM transactions WHERE user_id = ?");
const getSettings = db.prepare("SELECT cur, rate, budget, theme FROM settings WHERE user_id = ?");
const putSettings = db.prepare(`INSERT INTO settings (user_id, cur, rate, budget, theme) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET cur = excluded.cur, rate = excluded.rate, budget = excluded.budget, theme = excluded.theme`);

router.get("/transactions", (req, res) => res.json(list.all(req.user.id)));

router.post("/transactions", (req, res) => {
  const t = clean(req.body);
  if (!t) return res.status(400).json({ error: "Please check the amount, date, title and tag." });
  const info = insert.run({ ...t, user_id: req.user.id });
  res.status(201).json({ id: Number(info.lastInsertRowid), ...t });
});

// Used once, to move a guest's browser data into a brand-new account.
router.post("/transactions/bulk", (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 5000) : [];
  let count = 0;
  db.transaction(() => {
    for (const raw of items) {
      const t = clean(raw);
      if (t) { insert.run({ ...t, user_id: req.user.id }); count++; }
    }
  })();
  res.status(201).json({ imported: count });
});

router.put("/transactions/:id", (req, res) => {
  const t = clean(req.body);
  if (!t) return res.status(400).json({ error: "Please check the amount, date, title and tag." });
  const id = Number(req.params.id);
  const info = update.run({ ...t, id, user_id: req.user.id });
  if (!info.changes) return res.status(404).json({ error: "Transaction not found." });
  res.json({ id, ...t });
});

router.delete("/transactions/:id", (req, res) => {
  const info = removeOne.run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: "Transaction not found." });
  res.json({ ok: true });
});

router.delete("/transactions", (req, res) => {
  removeAll.run(req.user.id);
  res.json({ ok: true });
});

router.get("/settings", (req, res) => {
  res.json(getSettings.get(req.user.id) || { cur: "USD", rate: 100000, budget: 0, theme: "" });
});

router.put("/settings", (req, res) => {
  const b = req.body || {};
  const cur = CURRENCIES.includes(b.cur) ? b.cur : "USD";
  const rate = Number(b.rate);
  const budget = Number(b.budget) || 0;
  const theme = ["", "light", "dark"].includes(b.theme) ? b.theme : "";
  if (!(rate > 0) || rate > 1e12 || budget < 0 || budget > 1e15) return res.status(400).json({ error: "Invalid settings." });
  putSettings.run(req.user.id, cur, rate, budget, theme);
  res.json({ cur, rate, budget, theme });
});

// Small JSON store for budgets, recurring items, goals and preferences.
const KV_KEYS = ["budgets", "recur", "goals", "prefs"];
const kvAll = db.prepare("SELECT k, v FROM kv WHERE user_id = ?");
const kvPut = db.prepare("INSERT INTO kv (user_id, k, v) VALUES (?, ?, ?) ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v");

router.get("/kv", (req, res) => {
  const out = {};
  for (const row of kvAll.all(req.user.id)) {
    try { out[row.k] = JSON.parse(row.v); } catch { /* ignore bad row */ }
  }
  res.json(out);
});

router.put("/kv/:key", (req, res) => {
  if (!KV_KEYS.includes(req.params.key)) return res.status(400).json({ error: "Unknown key." });
  const text = JSON.stringify(req.body && req.body.value !== undefined ? req.body.value : null);
  if (text.length > 200000) return res.status(413).json({ error: "That is too much data." });
  kvPut.run(req.user.id, req.params.key, text);
  res.json({ ok: true });
});

// Email an export to the signed-in user (always to their own address).
const exportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many exports by email. Try again later." } });
router.post("/export/email", exportLimiter, async (req, res, next) => {
  try {
    const { format, content, filename } = req.body || {};
    if (!["csv", "json"].includes(format)) return res.status(400).json({ error: "Unknown format." });
    if (typeof content !== "string" || !content || content.length > 1500000) return res.status(400).json({ error: "The file is empty or too large to email." });
    const name = typeof filename === "string" && /^[\w.-]{1,80}$/.test(filename) ? filename : `pocket-ledger.${format}`;
    const first = req.user.first_name || req.user.name;
    const r = await sendMail({
      to: req.user.email,
      ...exportEmail(first, name, format),
      attachments: [{ filename: name, content, contentType: format === "csv" ? "text/csv; charset=utf-8" : "application/json" }],
    });
    res.json({ ok: true, sent: !!r.sent, dev: !!r.dev, to: req.user.email });
  } catch (e) {
    console.error("Export email failed:", e.message);
    res.status(502).json({ error: "We couldn't send the email. Check the SMTP settings on the server." });
  }
});

module.exports = router;

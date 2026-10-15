const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require("google-auth-library");
const db = require("./db");
const SECRET = require("./secret");
const { createCode, checkCode, cooldownLeft, hasPending } = require("./codes");
const { sendMail, codeEmail } = require("./mailer");

const COOKIE = "pl_token";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const gclient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}' .-]{1,50}$/u;
const cleanName = (s) => String(s || "").trim().replace(/\s+/g, " ");
const cleanEmail = (s) => String(s || "").trim().toLowerCase();

const findByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const findByGoogle = db.prepare("SELECT * FROM users WHERE google_sub = ?");
const findById = db.prepare("SELECT id, email, name, first_name, last_name FROM users WHERE id = ?");
const insertUser = db.prepare("INSERT INTO users (email, name, first_name, last_name, password_hash, google_sub, verified) VALUES (?, ?, ?, ?, ?, ?, ?)");
const resetUnverified = db.prepare("UPDATE users SET name = ?, first_name = ?, last_name = ?, password_hash = ? WHERE id = ?");
const markVerified = db.prepare("UPDATE users SET verified = 1 WHERE id = ?");
const linkGoogle = db.prepare("UPDATE users SET google_sub = ?, verified = 1, first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?) WHERE id = ?");

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, firstName: u.first_name || "", lastName: u.last_name || "" });

function issue(res, user) {
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const { uid } = jwt.verify(token, SECRET);
    const user = findById.get(uid);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

// Creates a fresh code and emails it.
async function sendCode(userId, email, firstName, purpose) {
  const code = createCode(userId, purpose);
  try {
    await sendMail({ to: email, ...codeEmail(firstName, code, purpose) });
  } catch (e) {
    console.error("Email failed:", e.message);
    const err = new Error("We couldn't send the email. Check the SMTP settings on the server.");
    err.status = 502;
    throw err;
  }
}

const router = express.Router();

// Step 1 of sign-up: store the account as unverified and email a code.
router.post("/register", limiter, wrap(async (req, res) => {
  const first = cleanName(req.body.firstName), last = cleanName(req.body.lastName);
  const email = cleanEmail(req.body.email), password = String(req.body.password || "");
  if (!NAME_RE.test(first) || !NAME_RE.test(last)) return res.status(400).json({ error: "Please enter your first name and last name." });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: "Password must be 8 to 200 characters." });

  const full = `${first} ${last}`, hash = await bcrypt.hash(password, 10);
  let user = findByEmail.get(email);
  if (user) {
    if (!user.password_hash) return res.status(409).json({ error: "That email uses Google sign-in. Use the Google button." });
    if (user.verified) return res.status(409).json({ error: "That email is already registered. Try signing in." });
    resetUnverified.run(full, first, last, hash, user.id); // never verified: let them start over
  } else {
    user = { id: Number(insertUser.run(email, full, first, last, hash, null, 0).lastInsertRowid) };
  }
  await sendCode(user.id, email, first, "register");
  res.status(201).json({ verify: "register", email });
}));

// Step 1 of sign-in: password OK -> email a code. The session is only issued after the code is entered.
router.post("/login", limiter, wrap(async (req, res) => {
  const email = cleanEmail(req.body.email), password = String(req.body.password || "");
  const user = findByEmail.get(email);
  const ok = user && user.password_hash && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: "Wrong email or password. (Accounts made with Google must use the Google button.)" });
  const purpose = user.verified ? "login" : "register";
  if (!cooldownLeft(user.id, purpose)) await sendCode(user.id, email, user.first_name || user.name, purpose);
  res.json({ verify: purpose, email });
}));

// Step 2: the code from the email.
router.post("/verify", limiter, wrap(async (req, res) => {
  const email = cleanEmail(req.body.email), purpose = req.body.purpose === "register" ? "register" : "login";
  const code = String(req.body.code || "").replace(/\s/g, "");
  const user = findByEmail.get(email);
  if (!user || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit code from your email." });
  const r = checkCode(user.id, purpose, code);
  if (!r.ok) return res.status(400).json({ error: r.error });
  if (purpose === "register") markVerified.run(user.id);
  issue(res, user);
  res.json({ user: publicUser(findById.get(user.id)) });
}));

router.post("/resend", limiter, wrap(async (req, res) => {
  const email = cleanEmail(req.body.email), purpose = req.body.purpose === "register" ? "register" : "login";
  const user = findByEmail.get(email);
  if (!user || !hasPending(user.id, purpose)) return res.status(400).json({ error: "Please sign in again to get a new code." });
  const wait = cooldownLeft(user.id, purpose);
  if (wait) return res.status(429).json({ error: `Please wait ${wait}s before asking for another code.` });
  await sendCode(user.id, email, user.first_name || user.name, purpose);
  res.json({ ok: true });
}));

// Google already verified the email, so no extra code is needed.
router.post("/google", limiter, wrap(async (req, res) => {
  if (!gclient) return res.status(503).json({ error: "Google sign-in is not configured on this server." });
  let p;
  try {
    p = (await gclient.verifyIdToken({ idToken: String(req.body.credential || ""), audience: GOOGLE_CLIENT_ID })).getPayload();
  } catch {
    return res.status(401).json({ error: "Google sign-in failed. Please try again." });
  }
  if (!p || !p.email || !p.email_verified) return res.status(401).json({ error: "Your Google email address is not verified." });
  const email = p.email.toLowerCase();
  const first = cleanName(p.given_name) || cleanName(p.name).split(" ")[0] || email.split("@")[0];
  const last = cleanName(p.family_name) || cleanName(p.name).split(" ").slice(1).join(" ");
  const full = cleanName(p.name) || `${first} ${last}`.trim();

  let user = findByGoogle.get(p.sub) || findByEmail.get(email);
  if (!user) user = { id: Number(insertUser.run(email, full, first, last, null, p.sub, 1).lastInsertRowid) };
  else if (!user.google_sub) linkGoogle.run(p.sub, first, last, user.id);
  issue(res, user);
  res.json({ user: publicUser(findById.get(user.id)) });
}));

router.post("/logout", (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = { router, requireAuth };

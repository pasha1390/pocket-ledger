"use strict";
/* Pocket Ledger - core: state, API, formatting, router, menu, modals */

const COLORS = ["#c9a24a", "#2f9e6e", "#4c86c6", "#c4485a", "#8398c4", "#a8873a", "#34b0b0", "#9a6cc0", "#d08a3c", "#7d8da3"];
const tc = g => { let h = 0; for (const c of g) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % 10]; };

// ---------- State ----------
// Guests are saved in this browser; signed-in users are saved on the server.
const K = "pocket-ledger-guest";
const freshDefaults = () => ({ cur: "USD", rate: 100000, theme: "", budgets: { overall: null, tags: {} }, recur: [], goals: [], prefs: { persian: false } });
let S = Object.assign({ tx: [] }, freshDefaults());
try { const r = localStorage.getItem(K); if (r) S = Object.assign(S, JSON.parse(r)); } catch (e) {}
function fixS() {
  S.tx = Array.isArray(S.tx) ? S.tx : [];
  if (!S.budgets || typeof S.budgets !== "object") S.budgets = { overall: null, tags: {} };
  if (!S.budgets.tags) S.budgets.tags = {};
  if (typeof S.budget === "number" && S.budget > 0 && !S.budgets.overall) S.budgets.overall = { a: S.budget, c: S.cur };
  delete S.budget;
  S.recur = Array.isArray(S.recur) ? S.recur : [];
  S.goals = Array.isArray(S.goals) ? S.goals : [];
  S.prefs = S.prefs && typeof S.prefs === "object" ? S.prefs : { persian: false };
  if (S.cur !== "USD" && S.cur !== "TMN") S.cur = "USD";
  if (!(S.rate > 0)) S.rate = 100000;
}
fixS();

// ---------- Small helpers ----------
const $ = id => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const d0 = new Date();
const today = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
const month = () => $("month").value || today.slice(0, 7);
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (ds, n) => { const [y, m, d] = ds.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
// "scope" is what every page shows: one day (YYYY-MM-DD) or a whole month (YYYY-MM).
const dayVal = () => $("day").value;
const isDay = () => !!dayVal();
const scope = () => (isDay() ? `${month()}-${dayVal()}` : month());
const longDate = ds => { const [y, m, d] = ds.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); };
const monthLong = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en", { month: "long", year: "numeric" }); };
const scopeLabel = () => (isDay() ? longDate(scope()) : monthLong(month()));
const scopeShort = () => (isDay() ? new Date(scope() + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : monthName(month()));
function buildDays() {
  const m = month(), n = daysIn(m), cur = $("day").value, [y, mo] = m.split("-").map(Number);
  let h = '<option value="">All days</option>';
  for (let i = 1; i <= n; i++) h += `<option value="${pad(i)}">${i} · ${new Date(y, mo - 1, i).toLocaleString("en", { weekday: "short" })}</option>`;
  $("day").innerHTML = h; $("day").value = cur && +cur <= n ? cur : "";
}
function scopeChanged() { $("date").value = isDay() ? scope() : today; render(); }
function setScope(ds) {   // a date string, or null for the whole month
  if (ds) { $("month").value = ds.slice(0, 7); buildDays(); $("day").value = ds.slice(8, 10); } else $("day").value = "";
  scopeChanged();
}
function stepDay(n) { if (isDay()) setScope(addDays(scope(), n)); }
function drawScope() {
  $("scope").innerHTML = isDay()
    ? `<button id="dprev" aria-label="Previous day">‹</button><b>${esc(scopeLabel())}</b><button id="dnext" aria-label="Next day">›</button><button id="dall">Whole month</button>`
    : `<b>${esc(scopeLabel())}</b><span>· whole month. Pick a day above, or tap one in the calendar.</span>`;
}
const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthName = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en", { month: "short" }) + " " + y; };
const daysIn = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const parseAmt = v => parseFloat(String(v).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[,٬\s]/g, ""));

// ---------- Money ----------
const conv = (a, c) => (c === S.cur ? a : S.cur === "TMN" ? a * S.rate : a / S.rate);   // amount in c -> display currency
const cv = t => conv(t.a, t.c);
const digits = s => (S.prefs.persian ? String(s).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]).replace(/,/g, "٬").replace(/\./g, "٫") : String(s));
const fmtC = (n, c) => {
  const neg = n < 0 ? "−" : ""; n = Math.abs(n);
  return digits(c === "USD" ? neg + "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : neg + Math.round(n).toLocaleString("en-US") + " TMN");
};
const fmt = n => fmtC(n, S.cur);
const compact = n => digits(new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n));
const inMonth = m => S.tx.filter(t => t.d.startsWith(m));
const sumBy = (a, k) => a.filter(t => t.k === k).reduce((s, t) => s + cv(t), 0);
const tagTotals = a => { const o = {}; a.filter(t => t.k === "expense").forEach(t => (o[t.g] = (o[t.g] || 0) + cv(t))); return o; };
const topTags = a => Object.entries(tagTotals(a)).sort((x, y) => y[1] - x[1]);

// Adds thousands separators while typing, keeping the caret in place.
function commaInput(el) {
  el.addEventListener("input", () => {
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos).replace(/[^\d.]/g, "").length;
    let v = el.value.replace(/[^\d.]/g, "");
    const i = v.indexOf(".");
    if (i > -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
    let [n, d] = v.split(".");
    n = n.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const f = n + (d !== undefined ? "." + d : "");
    el.value = f;
    let k = 0, c = 0;
    while (c < before && k < f.length) { if (f[k] !== ",") c++; k++; }
    el.setSelectionRange(k, k);
  });
}
const money = n => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// ---------- Animation helpers ----------
function tween(el, to) {
  const from = +el.dataset.v || 0; el.dataset.v = to;
  if (RM || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function f(t) { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0);
}
function burst(em, x, y) {
  if (RM) return;
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("span"); s.textContent = em[i % em.length];
    s.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:${16 + Math.random() * 16}px;pointer-events:none;z-index:40;font-weight:700;color:${COLORS[i % 10]}`;
    document.body.appendChild(s);
    const dx = (Math.random() - .5) * 340, dy = -90 - Math.random() * 220, rot = Math.random() * 720 - 360;
    s.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)`, opacity: 1, offset: .55 }, { transform: `translate(${dx * 1.1}px,${dy + 280}px) rotate(${rot * 1.5}deg)`, opacity: 0 }], { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => s.remove();
  }
}
function flash(m) {
  const t = $("toast"); t.textContent = m; t.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => (t.hidden = true), 3400);
}

// ---------- API ----------
let user = null, cfg = { googleClientId: "" };
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d;
}
const toLocal = t => ({ id: t.id, k: t.kind, t: t.title, a: t.amount, c: t.currency, g: t.tag, d: t.date });
const toApi = t => ({ kind: t.k, title: t.t, amount: t.a, currency: t.c, tag: t.g, date: t.d });

// ---------- Persistence ----------
function persistGuest() { if (user) return; try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) {} }
let _st;
function saveSettings() {
  if (!user) return persistGuest();
  clearTimeout(_st);
  _st = setTimeout(() => api("PUT", "/api/settings", { cur: S.cur, rate: S.rate, budget: 0, theme: S.theme }).catch(() => {}), 400);
}
function saveKV(key) {
  const v = { budgets: S.budgets, recur: S.recur, goals: S.goals, prefs: S.prefs }[key];
  if (!user) return persistGuest();
  return api("PUT", "/api/kv/" + key, { value: v }).catch(e => flash(e.message));
}
async function addTx(t) {
  if (user) t.id = (await api("POST", "/api/transactions", toApi(t))).id;
  else t.id = Date.now() + Math.floor(Math.random() * 1000);
  S.tx.push(t); persistGuest(); return t;
}
async function updateTx(id, patch) {
  const t = S.tx.find(x => x.id === id); if (!t) return;
  if (user) await api("PUT", "/api/transactions/" + id, toApi({ ...t, ...patch }));
  Object.assign(t, patch); persistGuest();
}
async function deleteTx(id) {
  if (user) await api("DELETE", "/api/transactions/" + id);
  S.tx = S.tx.filter(t => t.id !== id); persistGuest();
}

// ---------- Theme ----------
function applyTheme() { const de = document.documentElement; if (S.theme) de.dataset.theme = S.theme; else delete de.dataset.theme; }
const isDark = () => (S.theme ? S.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

// ---------- Modals ----------
const show = id => { $(id).hidden = false; };
const hide = id => { $(id).hidden = true; };

// ---------- Menu (the three lines) ----------
function openDrawer() {
  $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false");
  $("scrim").hidden = false; $("burger").setAttribute("aria-expanded", "true");
}
function closeDrawer() {
  $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true");
  $("scrim").hidden = true; $("burger").setAttribute("aria-expanded", "false");
}

// ---------- Router ----------
const VIEWS = ["dashboard", "transactions", "reports", "budgets", "recurring", "goals", "data", "settings"];
let view = "dashboard";
function route() {
  const h = (location.hash || "").replace(/^#\//, "");
  view = VIEWS.includes(h) ? h : "dashboard";
  $$(".view").forEach(v => (v.hidden = v.id !== "v-" + view));
  $$("#drawer a[data-v]").forEach(a => a.classList.toggle("on", a.dataset.v === view));
  closeDrawer(); render(); window.scrollTo(0, 0);
}
function render() {
  syncChrome();
  ({ dashboard: rDash, transactions: rTx, reports: rReports, budgets: rBudgets, recurring: rRecur, goals: rGoals, data: rData, settings: rSettings })[view]();
}
function syncChrome() {
  $$("#cur button").forEach(b => b.classList.toggle("on", b.dataset.c === S.cur));
  const used = [...new Set(S.tx.filter(t => t.k === "expense").map(t => t.g))].sort();
  const base = ["Food", "Transport", "Rent", "Bills", "Shopping", "Health", "Fun"].filter(x => !used.includes(x));
  $("tags").innerHTML = base.concat(used).map(g => `<option value="${esc(g)}">`).join("");
  showUser(); drawScope(); drawBankCard(); quickTags();
}

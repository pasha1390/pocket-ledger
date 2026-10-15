"use strict";
/* Settings page, accounts (email + Google), data loading */

const msg = (t, err) => { $("amsg").textContent = t; $("amsg").classList.toggle("err", !!err); };

function showUser() {
  $("dwho").textContent = user ? "Signed in as " + user.email : "Guest · saved in this browser";
  $("dsign").hidden = !!user; $("dout").hidden = !user;
}

async function loadAll() {
  const [s, t, kv] = await Promise.all([api("GET", "/api/settings"), api("GET", "/api/transactions"), api("GET", "/api/kv")]);
  S.cur = s.cur; S.rate = s.rate; S.theme = s.theme || S.theme;
  S.tx = t.map(toLocal);
  S.budgets = kv.budgets || { overall: null, tags: {} };
  S.recur = kv.recur || []; S.goals = kv.goals || []; S.prefs = kv.prefs || { persian: false };
  if (!S.budgets.overall && s.budget > 0) S.budgets.overall = { a: s.budget, c: s.cur };
  fixS(); applyTheme();
}

async function onLogin(u) {
  user = u;
  try { // a brand-new account inherits whatever the guest had in this browser
    const have = await api("GET", "/api/transactions");
    if (!have.length && S.tx.length) {
      await api("POST", "/api/transactions/bulk", { items: S.tx.map(toApi) });
      await api("PUT", "/api/settings", { cur: S.cur, rate: S.rate, budget: 0, theme: S.theme });
      await Promise.all(["budgets", "recur", "goals", "prefs"].map(saveKV));
    }
    localStorage.removeItem(K);
  } catch (e) {}
  await loadAll(); await applyRecurring();
  hide("am"); ["ap", "cp", "vcode"].forEach(i => ($(i).value = "")); msg(""); render();
}

async function logout() {
  try { await api("POST", "/api/auth/logout"); } catch (e) {}
  user = null;
  S = Object.assign({ tx: [] }, freshDefaults(), { theme: S.theme });
  try { localStorage.removeItem(K); } catch (e) {}
  closeDrawer(); render(); flash("Signed out");
}

let pending = null, cdTimer = null;

function authTab(t) {
  $$("#atabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  $("af").hidden = t !== "in"; $("cf").hidden = t !== "up"; $("vf").hidden = true;
  $("atabs").hidden = false; $("gwrap").hidden = !cfg.googleClientId;
  $("at").textContent = t === "in" ? "Welcome back" : "Open an account"; msg("");
}
function openAuth() { closeDrawer(); authTab("in"); show("am"); $("ae").focus(); }

// Step 2 (both for sign-up and sign-in): the 6-digit code from the email.
function startVerify(d) {
  pending = { email: d.email, purpose: d.verify };
  $("af").hidden = $("cf").hidden = $("atabs").hidden = $("gwrap").hidden = true; $("vf").hidden = false;
  $("at").textContent = "Check your email";
  $("vtext").textContent = d.verify === "register"
    ? `We emailed a 6-digit code to ${d.email}. Enter it to verify your email and finish creating your account.`
    : `For your security we emailed a 6-digit sign-in code to ${d.email}.`;
  $("vcode").value = ""; msg(d.demoCode ? `Preview only: your code is ${d.demoCode}` : ""); cooldown(30); $("vcode").focus();
}
function cooldown(s) {
  clearInterval(cdTimer); const b = $("vresend"); b.disabled = true;
  const tick = () => { if (s <= 0) { clearInterval(cdTimer); b.disabled = false; b.textContent = "Resend code"; } else b.textContent = `Resend in ${s--}s`; };
  tick(); cdTimer = setInterval(tick, 1000);
}

function initGoogle() {
  if (initGoogle.done || !cfg.googleClientId || !window.google || !google.accounts) return;
  initGoogle.done = true;
  google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: async r => {
      msg("Signing in…");
      try { const d = await api("POST", "/api/auth/google", { credential: r.credential }); await onLogin(d.user); }
      catch (err) { msg(err.message); }
    },
  });
  google.accounts.id.renderButton($("gbtn"), { theme: "outline", size: "large", text: "continue_with", width: 300 });
}
window.onGoogleLibraryLoad = initGoogle;

// ---------- Settings page ----------
function rSettings() {
  $("rate").value = money(S.rate);
  $("theme2").value = S.theme; $("nums").value = S.prefs.persian ? "fa" : "en";
  $("acctbox").innerHTML = user
    ? `<p><b>${esc(((user.firstName || "") + " " + (user.lastName || "")).trim() || user.name)}</b><br><span class="muted">${esc(user.email)}</span></p><button id="sout">Log out</button>`
    : `<p class="muted">You are using Pocket Ledger as a guest. Your data stays in this browser. Sign in to keep it on the server and use it on any device.</p><button id="ssign" class="p">Sign in or create account</button>`;
}

async function seedDemo() {
  const ym = today.slice(0, 7), day = +today.slice(8, 10), d = n => `${ym}-${pad(Math.min(n, day))}`;
  const x = (k, t, a, g, n) => ({ k, t, a, c: "USD", g, d: d(n) });
  const items = [x("income", "Salary", 3200, "Income", 1), x("expense", "Rent", 900, "Rent", 1), x("expense", "Metro card", 25, "Transport", 2), x("expense", "Groceries", 86.4, "Food", 3), x("expense", "Internet bill", 30, "Bills", 4), x("expense", "Dinner out", 38, "Food", 5), x("expense", "Headphones", 79, "Shopping", 6), x("expense", "Gym", 45, "Health", 6), x("expense", "Concert tickets", 120, "Fun", 7), x("expense", "Coffee beans", 18.5, "Food", 8), x("expense", "Taxi", 14, "Transport", 8)];
  try {
    if (user) { await api("POST", "/api/transactions/bulk", { items: items.map(toApi) }); await loadAll(); }
    else items.forEach((t, i) => S.tx.push({ id: Date.now() + i, ...t }));
    if (!S.budgets.overall) { S.budgets.overall = { a: 2000, c: "USD" }; await saveKV("budgets"); }
    persistGuest(); $("month").value = ym; render(); flash("Sample data added");
  } catch (err) { flash(err.message); }
}

function initAccount() {
  $("dsign").onclick = openAuth; $("dout").onclick = logout;
  $("aclose").onclick = () => hide("am");
  $$("#atabs button").forEach(b => (b.onclick = () => authTab(b.dataset.tab)));
  $("af").onsubmit = async e => {
    e.preventDefault(); msg("Checking…");
    try { startVerify(await api("POST", "/api/auth/login", { email: $("ae").value.trim(), password: $("ap").value })); } catch (err) { msg(err.message, true); }
  };
  $("cf").onsubmit = async e => {
    e.preventDefault(); msg("Creating your account…");
    try { startVerify(await api("POST", "/api/auth/register", { firstName: $("cfn").value, lastName: $("cln").value, email: $("ce").value.trim(), password: $("cp").value })); } catch (err) { msg(err.message, true); }
  };
  $("vf").onsubmit = async e => {
    e.preventDefault(); msg("Verifying…");
    try { const d = await api("POST", "/api/auth/verify", { email: pending.email, purpose: pending.purpose, code: $("vcode").value }); await onLogin(d.user); }
    catch (err) { msg(err.message, true); const v = $("vcode"); v.classList.remove("shake"); void v.offsetWidth; v.classList.add("shake"); }
  };
  $("vresend").onclick = async () => {
    try { const d = await api("POST", "/api/auth/resend", { email: pending.email, purpose: pending.purpose }); msg(d.demoCode ? `Preview only: your new code is ${d.demoCode}` : "A new code is on its way."); cooldown(30); }
    catch (err) { msg(err.message, true); }
  };
  $("vback").onclick = () => authTab(pending && pending.purpose === "register" ? "up" : "in");

  $("acctbox").onclick = e => { if (e.target.closest("#sout")) logout(); else if (e.target.closest("#ssign")) openAuth(); };
  $("rate").onchange = () => { const v = parseAmt($("rate").value); if (v > 0) { S.rate = v; saveSettings(); } render(); };
  $("theme2").onchange = () => { S.theme = $("theme2").value; applyTheme(); saveSettings(); render(); };
  $("nums").onchange = () => { S.prefs.persian = $("nums").value === "fa"; saveKV("prefs"); render(); };
  $("demo").onclick = seedDemo;
  $("reset").onclick = () => { show("rc"); $("rno").focus(); };
  $("rno").onclick = () => hide("rc");
  $("ryes").onclick = async () => {
    try {
      if (user) await api("DELETE", "/api/transactions");
      S.tx = []; S.budgets = { overall: null, tags: {} }; S.recur = []; S.goals = [];
      await Promise.all(["budgets", "recur", "goals"].map(saveKV));
      persistGuest(); hide("rc"); render(); flash("All data deleted");
    } catch (err) { flash(err.message); }
  };
}

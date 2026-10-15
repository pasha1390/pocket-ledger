"use strict";
/* Start-up: wire the shell, then load data */

function initShell() {
  $("burger").onclick = openDrawer; $("dclose").onclick = closeDrawer; $("scrim").onclick = closeDrawer;
  $$("#drawer a").forEach(a => a.addEventListener("click", closeDrawer));
  $$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.hidden = true; }));
  addEventListener("keydown", e => { if (e.key === "Escape") { $$(".modal").forEach(m => (m.hidden = true)); closeDrawer(); } });
  addEventListener("hashchange", route);

  $("month").value = today.slice(0, 7); buildDays();
  $("month").onchange = () => { buildDays(); scopeChanged(); };
  $("day").onchange = scopeChanged;
  $$("#drawer a").forEach((a, i) => a.style.setProperty("--i", i));
  $("cur").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.cur = b.dataset.c; $("ccy").value = S.cur; saveSettings(); render(); };
  $("theme").onclick = () => { S.theme = isDark() ? "light" : "dark"; applyTheme(); saveSettings(); };
  $$("[data-money]").forEach(commaInput);
}

(async () => {
  initShell(); initDash(); initPlan(); initData(); initAccount();
  applyTheme(); $("ccy").value = S.cur; route();                       // show something right away (guest data)
  try { cfg = await api("GET", "/api/config"); } catch (e) {}
  $("gwrap").hidden = !cfg.googleClientId; initGoogle();
  try { const me = await api("GET", "/api/auth/me"); user = me.user; await loadAll(); $("ccy").value = S.cur; } catch (e) {}
  await applyRecurring();
  route();
})();

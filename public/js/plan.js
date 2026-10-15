"use strict";
/* Reports, Budgets, Recurring, Goals */

// ---------- Reports ----------
const niceStep = x => { const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

function trendItems() {
  if (isDay()) return [-6, -5, -4, -3, -2, -1, 0].map(n => { const k = addDays(scope(), n); return { key: k, label: new Date(k + "T00:00:00").toLocaleString("en", { weekday: "short" }) }; });
  return [-5, -4, -3, -2, -1, 0].map(n => { const k = addMonths(month(), n); return { key: k, label: monthName(k).split(" ")[0] }; });
}

function trendSVG(items) {
  const W = 600, H = 230, pl = 46, pb = 30, pt = 12, ph = H - pb - pt, pw = W - pl - 8;
  const data = items.map(it => { const a = inMonth(it.key); return { ...it, i: sumBy(a, "income"), e: sumBy(a, "expense") }; });
  const max = Math.max(1, ...data.flatMap(d => [d.i, d.e])), step = niceStep(max / 4), top = step * 4;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending over time">`;
  for (let k = 0; k <= 4; k++) {
    const y = pt + ph - ph * k / 4;
    s += `<line class="gl" x1="${pl}" x2="${W - 8}" y1="${y}" y2="${y}"/><text class="ax" x="${pl - 6}" y="${y + 4}" text-anchor="end">${compact(step * k)}</text>`;
  }
  const bw = pw / items.length;
  data.forEach((d, i) => {
    const x = pl + i * bw, w = bw * .28, hi = ph * d.i / top, he = ph * d.e / top;
    s += `<rect class="bi" style="animation-delay:${i * .07}s" x="${x + bw * .17}" y="${pt + ph - hi}" width="${w}" height="${hi}" rx="3"><title>${d.key} income: ${fmt(d.i)}</title></rect>`;
    s += `<rect class="be" style="animation-delay:${i * .07 + .03}s" x="${x + bw * .5}" y="${pt + ph - he}" width="${w}" height="${he}" rx="3"><title>${d.key} spent: ${fmt(d.e)}</title></rect>`;
    s += `<text class="ax" x="${x + bw / 2}" y="${H - 9}" text-anchor="middle">${d.label}</text>`;
  });
  return s + "</svg>";
}

function rReports() {
  const sc = scope(), day = isDay(), a = inMonth(sc), inc = sumBy(a, "income"), exp = sumBy(a, "expense");
  const now = month() === today.slice(0, 7), days = now ? +today.slice(8, 10) : daysIn(month());
  const big = a.filter(t => t.k === "expense").sort((x, y) => cv(y) - cv(x))[0];
  const stat = (l, v, s, c) => `<div class="card"><span>${l}</span><b class="${c || ""}">${v}</b><small>${s || "&nbsp;"}</small></div>`;
  const toDate = sumBy(S.tx.filter(t => t.d.startsWith(month()) && t.d <= sc), "expense");
  $("rstats").innerHTML =
    stat("Savings rate", inc ? digits(Math.round((inc - exp) / inc * 100)) + "%" : "—", inc ? `${fmt(inc - exp)} kept` : "No income yet", inc - exp >= 0 ? "inc" : "exp") +
    (day ? stat("Month so far", fmt(toDate), `spent up to ${digits(+sc.slice(8, 10))} ${monthName(month()).split(" ")[0]}`)
         : stat("Avg. daily spend", fmt(exp / days), `over ${digits(days)} days`)) +
    stat("Biggest expense", big ? fmt(cv(big)) : "—", big ? esc(big.t) : "") +
    stat("Transactions", digits(a.length), scopeShort());
  $("trendTitle").textContent = day ? "Last 7 days" : "Last 6 months";
  $("trend").innerHTML = trendSVG(trendItems());
  const tops = topTags(a).slice(0, 6);
  $("tops").innerHTML = tops.length ? tops.map(([g, v], i) => { const p = Math.round(v / exp * 100); return `<div class="trow"><span><i class="dot" style="background:${COLORS[i % 10]}"></i>${esc(g)}</span><b>${fmt(v)} · ${digits(p)}%</b><div class="tbar"><i style="width:${p}%;background:${COLORS[i % 10]}"></i></div></div>`; }).join("") : '<div class="empty">No spending in this period.</div>';
}

// ---------- Budgets ----------
function rBudgets() {
  const m = month(), a = inMonth(m), exp = sumBy(a, "expense"), o = S.budgets.overall;
  drawBudget($("pb2"), $("bt2"), exp); $("bnote").hidden = !isDay();
  $("bud").value = o ? money(o.a) : ""; $("budc").value = o ? o.c : S.cur; $("budclear").hidden = !o;
  $("tbc").value = S.cur;
  const tt = tagTotals(a), entries = Object.entries(S.budgets.tags);
  $("tblist").innerHTML = entries.length ? entries.map(([g, b]) => {
    const lim = conv(b.a, b.c), sp = tt[g] || 0, p = Math.min(100, sp / lim * 100), over = sp > lim;
    return `<div class="trow"><span><i class="dot" style="background:${tc(g)}"></i>${esc(g)}</span><span><b class="${over ? "exp" : ""}">${fmt(sp)}</b> / ${fmt(lim)} <button class="x" data-del="${esc(g)}" aria-label="Remove">✕</button></span><div class="tbar"><i style="width:${p}%;background:${over ? "var(--exp)" : tc(g)}"></i></div></div>`;
  }).join("") : '<div class="empty">No tag budgets yet. Add one above, for example Food.</div>';
}

// ---------- Recurring ----------
function rRecur() {
  $("rlist").innerHTML = S.recur.length ? S.recur.map(r => `<div class="tx"><div><b>${esc(r.t)}</b><span class="tag" style="--c:${tc(r.g)}">${esc(r.g)}</span><small>Every month on day ${digits(r.day)} · next ${monthName(r.next)}</small></div><div class="amt"><b class="${r.k === "income" ? "inc" : "exp"}">${r.k === "income" ? "+" : "−"}${fmtC(r.a, r.c)}</b></div><div class="acts"><button class="x" data-rdel="${r.id}" aria-label="Delete">✕</button></div></div>`).join("") : '<div class="empty">No recurring items yet.</div>';
}

async function applyRecurring() {
  const ym = today.slice(0, 7); let made = 0, changed = false;
  for (const r of S.recur) {
    let guard = 0;
    while (r.next <= ym && guard++ < 60) {
      const d = `${r.next}-${pad(Math.min(r.day, daysIn(r.next)))}`;
      if (d > today) break;
      try { await addTx({ k: r.k, t: r.t, a: r.a, c: r.c, g: r.g, d }); } catch (e) { flash(e.message); return; }
      made++; r.next = addMonths(r.next, 1); changed = true;
    }
  }
  if (changed) await saveKV("recur");
  if (made) flash(`Added ${made} recurring transaction${made === 1 ? "" : "s"}`);
}

// ---------- Goals ----------
function rGoals() {
  $("glist").innerHTML = S.goals.length ? S.goals.map(g => {
    const p = Math.min(100, g.saved / g.target * 100);
    return `<div class="card goal"><div class="bar between"><b>${esc(g.name)}</b><button class="x" data-gdel="${g.id}" aria-label="Delete goal">✕</button></div><div class="muted">${fmtC(g.saved, g.c)} of ${fmtC(g.target, g.c)} · ${digits(Math.round(p))}%</div><div class="prog"><i style="width:${p}%"></i></div><div class="inline"><input data-money data-gin="${g.id}" inputmode="decimal" placeholder="Add money"><button data-gadd="${g.id}">Add</button></div>${g.saved >= g.target ? '<div class="muted">Goal reached ✓</div>' : ""}</div>`;
  }).join("") : '<div class="empty">No goals yet. Create one above.</div>';
  $$("#glist [data-money]").forEach(commaInput);
}

function initPlan() {
  $("printbtn").onclick = () => window.print();

  $("bf").onsubmit = e => {
    e.preventDefault(); const a = parseAmt($("bud").value); if (!(a > 0)) return;
    S.budgets.overall = { a, c: $("budc").value }; saveKV("budgets"); render(); flash("Budget saved");
  };
  $("budclear").onclick = () => { S.budgets.overall = null; saveKV("budgets"); render(); };
  $("tbf").onsubmit = e => {
    e.preventDefault(); const a = parseAmt($("tbamt").value), g = $("tbtag").value.trim(); if (!(a > 0) || !g) return;
    S.budgets.tags[g] = { a, c: $("tbc").value }; $("tbtag").value = ""; $("tbamt").value = ""; saveKV("budgets"); render();
  };
  $("tblist").onclick = e => { const b = e.target.closest("[data-del]"); if (!b) return; delete S.budgets.tags[b.dataset.del]; saveKV("budgets"); render(); };

  $("rf").onsubmit = async e => {
    e.preventDefault();
    const a = parseAmt($("ra").value), day = Math.min(31, Math.max(1, parseInt($("rd").value, 10) || 1)), k = $("rk").value;
    if (!(a > 0)) return;
    S.recur.push({ id: Date.now(), k, t: $("rt").value.trim(), a, c: $("rcur").value, g: $("rg").value.trim() || (k === "income" ? "Income" : "Other"), day, next: today.slice(0, 7) });
    $("rt").value = ""; $("ra").value = ""; $("rg").value = ""; $("rd").value = "";
    await saveKV("recur"); await applyRecurring(); render();
  };
  $("rlist").onclick = e => { const b = e.target.closest("[data-rdel]"); if (!b) return; S.recur = S.recur.filter(r => String(r.id) !== b.dataset.rdel); saveKV("recur"); render(); };

  $("gf").onsubmit = e => {
    e.preventDefault(); const t = parseAmt($("gtarget").value); if (!(t > 0)) return;
    S.goals.push({ id: Date.now(), name: $("gname").value.trim(), target: t, c: $("gc").value, saved: 0 });
    $("gname").value = ""; $("gtarget").value = ""; saveKV("goals"); render();
  };
  $("glist").onclick = e => {
    const del = e.target.closest("[data-gdel]");
    if (del) { S.goals = S.goals.filter(g => String(g.id) !== del.dataset.gdel); saveKV("goals"); return render(); }
    const add = e.target.closest("[data-gadd]"); if (!add) return;
    const g = S.goals.find(x => String(x.id) === add.dataset.gadd), v = parseAmt($(`glist`).querySelector(`[data-gin="${add.dataset.gadd}"]`).value);
    if (!g || !(v > 0)) return;
    const was = g.saved >= g.target; g.saved += v; saveKV("goals"); render();
    if (!was && g.saved >= g.target) { const r = add.getBoundingClientRect(); burst(["✦", "✧", "◆", "●"], r.left, r.top); flash("Goal reached!"); }
  };
}

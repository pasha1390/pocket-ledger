"use strict";
/* Dashboard + Transactions pages, add/edit/delete */

let type = "expense", newId = null, editing = null;

function rowHTML(t) {
  const orig = t.c !== S.cur ? `<small>${fmtC(t.a, t.c)}</small>` : "";
  return `<div class="tx${t.id === newId ? " pop" : ""}" data-id="${t.id}"><div><b>${esc(t.t)}</b><span class="tag" style="--c:${tc(t.g)}">${esc(t.g)}</span><small>${t.d}</small></div><div class="amt"><b class="${t.k === "income" ? "inc" : "exp"}">${t.k === "income" ? "+" : "−"}${fmt(cv(t))}</b>${orig}</div><div class="acts"><button class="x" data-act="edit" aria-label="Edit">✎</button><button class="x" data-act="del" aria-label="Delete">✕</button></div></div>`;
}
const rowsOrEmpty = (arr, msg) => (arr.length ? arr.map(rowHTML).join("") : `<div class="empty">${msg}</div>`);

function drawBudget(pb, bt, monthSpent, dayExp) {
  const o = S.budgets.overall, lim = o ? conv(o.a, o.c) : 0;
  const p = lim ? Math.min(100, monthSpent / lim * 100) : 0;
  pb.style.width = p + "%"; pb.className = p >= 100 ? "over" : "";
  if (!lim) { bt.textContent = "No monthly budget yet. Set one in Budgets."; return; }
  bt.textContent = `Month: ${fmt(monthSpent)} of ${fmt(lim)} used` + (monthSpent > lim ? " (over budget)" : "")
    + (dayExp != null ? ` · This day: ${fmt(dayExp)} of ${fmt(lim / daysIn(month()))} daily allowance` : "");
}

function donut(rows, exp) {
  let svg = "", a0 = -Math.PI / 2;
  if (!rows.length) svg = '<circle cx="85" cy="85" r="60" fill="none" stroke="var(--soft)" stroke-width="28"/>';
  rows.forEach(([g, v], i) => {
    const f = v / exp;
    if (f >= .999) { svg += `<circle class="arc" pathLength="1" cx="85" cy="85" r="60" fill="none" stroke="${COLORS[0]}" stroke-width="28"/>`; return; }
    const a1 = a0 + f * 2 * Math.PI, x = a => 85 + 60 * Math.cos(a), y = a => 85 + 60 * Math.sin(a);
    svg += `<path class="arc" pathLength="1" style="animation-delay:${i * .12}s" d="M${x(a0)} ${y(a0)}A60 60 0 ${f > .5 ? 1 : 0} 1 ${x(a1)} ${y(a1)}" fill="none" stroke="${COLORS[i % 10]}" stroke-width="28"><title>${esc(g)}</title></path>`;
    a0 = a1;
  });
  const cn = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(exp);
  svg += `<text x="85" y="80" text-anchor="middle" class="pl">SPENT</text><text x="85" y="101" text-anchor="middle" class="pv">${digits(S.cur === "USD" ? "$" + cn : cn + " " + S.cur)}</text>`;
  $("pie").innerHTML = svg;
  $("leg").innerHTML = rows.length ? rows.map(([g, v], i) => `<div><span><i class="dot" style="background:${COLORS[i % 10]}"></i>${esc(g)}</span><span>${digits(Math.round(v / exp * 100))}% · ${fmt(v)}</span></div>`).join("") : '<div class="empty">No spending this month yet.</div>';
}

function insightTiles() {
  const sc = scope(), day = isDay(), a = inMonth(sc), exp = sumBy(a, "expense"), inc = sumBy(a, "income"), t = [];
  const prev = sumBy(inMonth(day ? addDays(sc, -1) : addMonths(month(), -1)), "expense");
  if (prev > 0) { const p = (exp - prev) / prev * 100; t.push([day ? "Vs previous day" : "Vs last month", `${p > 0 ? "+" : ""}${digits(Math.round(p))}%`, p > 0 ? "You are spending more" : "You are spending less", p > 0 ? "exp" : "inc"]); }
  const top = topTags(a)[0];
  if (top) t.push(["Top category", esc(top[0]), `${fmt(top[1])} · ${digits(Math.round(top[1] / exp * 100))}% of spending`]);
  if (day) {
    const o = S.budgets.overall;
    if (o) { const left = conv(o.a, o.c) / daysIn(month()) - exp; t.push(["Daily allowance", fmt(Math.abs(left)), left >= 0 ? "left to spend today" : "over this day's allowance", left >= 0 ? "inc" : "exp"]); }
  } else if (exp > 0) {
    const now = month() === today.slice(0, 7), days = now ? +today.slice(8, 10) : daysIn(month()), avg = exp / days;
    t.push(["Daily average", fmt(avg), now ? `Projected ${fmt(avg * daysIn(month()))} by month end` : `over ${digits(days)} days`]);
  }
  if (inc > 0) t.push(["Savings rate", `${digits(Math.round((inc - exp) / inc * 100))}%`, `${fmt(inc - exp)} kept`, inc - exp >= 0 ? "inc" : "exp"]);
  const big = a.filter(x => x.k === "expense").sort((x, y) => cv(y) - cv(x))[0];
  if (big) t.push(["Biggest expense", fmt(cv(big)), esc(big.t)]);
  const m = month(), nowM = today.slice(0, 7);   // days with no spending, and the current streak
  if (m <= nowM) {
    const last = m === nowM ? +today.slice(8, 10) : daysIn(m);
    const spent = new Set(inMonth(m).filter(x => x.k === "expense").map(x => +x.d.slice(8, 10)));
    let free = 0; for (let d = 1; d <= last; d++) if (!spent.has(d)) free++;
    let streak = 0; for (let d = last; d >= 1 && !spent.has(d); d--) streak++;
    t.push(["No-spend days", `${digits(free)} of ${digits(last)}`, streak ? `Current streak: ${digits(streak)} day${streak === 1 ? "" : "s"}` : "A streak starts when you skip a day"]);
  }
  return t;
}

function drawCal() {
  const m = month(), [y, mo] = m.split("-").map(Number), n = daysIn(m), first = new Date(y, mo - 1, 1).getDay();
  const spent = {}, inc = {};
  inMonth(m).forEach(t => { const d = +t.d.slice(8, 10); if (t.k === "expense") spent[d] = (spent[d] || 0) + cv(t); else inc[d] = 1; });
  const max = Math.max(1, ...Object.values(spent));
  let h = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(w => `<div class="wd">${w}</div>`).join("");
  for (let i = 0; i < first; i++) h += '<span class="blank"></span>';
  for (let d = 1; d <= n; d++) {
    const ds = `${m}-${pad(d)}`, v = spent[d] || 0, cls = (ds === scope() ? "sel " : "") + (ds === today ? "now" : "");
    h += `<button type="button" class="${cls}" data-d="${ds}" style="--i:${(v / max).toFixed(2)};--n:${d}" title="${monthName(m).split(" ")[0]} ${d}: ${v ? fmt(v) + " spent" : "no spending"}"><span>${digits(d)}</span><i class="di ${inc[d] ? "" : "off"}"></i></button>`;
  }
  $("cal").innerHTML = h;
}

function drawBankCard() {
  const nm = user ? (((user.firstName || "") + " " + (user.lastName || "")).trim() || user.name) : "";
  $("bcName").textContent = (nm || "Guest").toUpperCase();
  $("bcNum").textContent = "•••• •••• •••• " + (user ? String(1000 + (user.id * 7919) % 9000) : "0000");
}

function quickTags() {
  const cnt = {}; S.tx.filter(t => t.k === "expense").forEach(t => (cnt[t.g] = (cnt[t.g] || 0) + 1));
  let tags = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 6);
  if (tags.length < 4) tags = [...new Set([...tags, "Food", "Transport", "Bills", "Shopping"])].slice(0, 6);
  $("qtags").innerHTML = tags.map(g => `<button type="button" data-qt="${esc(g)}" style="--c:${tc(g)}">${esc(g)}</button>`).join("");
  $("qtags").hidden = type === "income";
}

function rDash() {
  const a = inMonth(scope()), inc = sumBy(a, "income"), exp = sumBy(a, "expense");
  tween($("sBal"), sumBy(S.tx, "income") - sumBy(S.tx, "expense"));
  $("sBal").className = sumBy(S.tx, "income") - sumBy(S.tx, "expense") < 0 ? "exp" : "inc";
  tween($("sInc"), inc); tween($("sExp"), exp);
  $("lblInc").textContent = "Income · " + scopeShort(); $("lblExp").textContent = "Spent · " + scopeShort();
  donut(topTags(a), exp);
  drawBudget($("pb"), $("bt"), sumBy(inMonth(month()), "expense"), isDay() ? exp : null);
  drawCal();
  const tiles = insightTiles();
  $("ins").innerHTML = tiles.length ? tiles.map((x, i) => `<div class="tile" style="animation-delay:${i * .06}s"><small>${x[0]}</small><b class="${x[3] || ""}">${x[1]}</b><small>${x[2]}</small></div>`).join("") : '<div class="empty">Add a few transactions to see insights here.</div>';
  $("recent").innerHTML = rowsOrEmpty([...a].sort((x, y) => y.d.localeCompare(x.d) || y.id - x.id).slice(0, 6), isDay() ? "Nothing on this day yet." : "Nothing here yet. Add your first transaction above.");
  newId = null;
}

function rTx() {
  const m = month(), all = $("fall").checked, q = $("q").value.trim().toLowerCase(), ft = $("ftag").value, ty = $("ftype").value, so = $("fsort").value || "newest";
  const tags = [...new Set(S.tx.map(t => t.g))].sort();
  $("ftag").innerHTML = '<option value="">All tags</option>' + tags.map(g => `<option${g === ft ? " selected" : ""}>${esc(g)}</option>`).join("");
  let a = all ? S.tx : inMonth(scope());
  if (q) a = a.filter(t => (t.t + " " + t.g).toLowerCase().includes(q));
  if (ft) a = a.filter(t => t.g === ft);
  if (ty) a = a.filter(t => t.k === ty);
  const by = { newest: (x, y) => y.d.localeCompare(x.d) || y.id - x.id, oldest: (x, y) => x.d.localeCompare(y.d) || x.id - y.id, largest: (x, y) => cv(y) - cv(x), smallest: (x, y) => cv(x) - cv(y) }[so];
  a = [...a].sort(by);
  $("tcount").textContent = digits(`${a.length} transaction${a.length === 1 ? "" : "s"}`) + ` · income ${fmt(sumBy(a, "income"))} · spent ${fmt(sumBy(a, "expense"))}`;
  $("list").innerHTML = rowsOrEmpty(a.slice(0, 300), "No transactions match.") + (a.length > 300 ? '<div class="empty">Showing the first 300. Narrow the filters to see more.</div>' : "");
}

async function rowAction(e) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const row = b.closest(".tx"), id = Number(row.dataset.id);
  if (b.dataset.act === "edit") return openEdit(id);
  const go = async () => { try { await deleteTx(id); } catch (err) { flash(err.message); } render(); };
  if (RM) return go();
  row.classList.add("out"); setTimeout(go, 300);
}

function openEdit(id) {
  const t = S.tx.find(x => x.id === id); if (!t) return;
  editing = t; const inc = t.k === "income";
  $("etitle").value = t.t; $("etag").value = t.g; $("eamt").value = money(t.a); $("eccy").value = t.c; $("edate").value = t.d;
  [$("etitle"), $("etag")].forEach(i => { i.style.display = inc ? "none" : ""; i.required = !inc; });
  show("em"); $("eamt").focus();
}

function checkBudgets(t) {
  if (t.k !== "expense" || !t.d.startsWith(month())) return;
  const a = inMonth(month()), o = S.budgets.overall;
  if (o) { const lim = conv(o.a, o.c), sp = sumBy(a, "expense"), before = sp - cv(t); if (before < lim && sp >= lim) flash("You have passed your monthly budget"); }
  const tb = S.budgets.tags[t.g];
  if (tb) { const lim = conv(tb.a, tb.c), sp = tagTotals(a)[t.g] || 0, before = sp - cv(t); if (before < lim && sp >= lim) flash(`${t.g} budget reached`); }
}

function initDash() {
  $("date").value = today;
  $("type").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    type = b.dataset.t; const inc = type === "income";
    $$("#type button").forEach(x => x.classList.toggle("on", x === b));
    ["title", "tag"].forEach(i => { $(i).style.display = inc ? "none" : ""; $(i).required = !inc; });
    $("qtags").hidden = inc;
  };
  $("qtags").onclick = e => { const b = e.target.closest("[data-qt]"); if (!b) return; $("tag").value = b.dataset.qt; $("amount").focus(); };
  $("cal").onclick = e => { const b = e.target.closest("[data-d]"); if (b) setScope(b.dataset.d === scope() ? null : b.dataset.d); };
  $("scope").onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.id === "dprev") stepDay(-1); else if (b.id === "dnext") stepDay(1); else if (b.id === "dall") setScope(null); };
  $("todaybtn").onclick = () => setScope(today);
  $("f").onsubmit = async e => {
    e.preventDefault();
    const amt = parseAmt($("amount").value);
    if (!(amt > 0)) { $("amount").focus(); return; }
    const inc = type === "income";
    const t = { k: type, t: inc ? "Income" : $("title").value.trim(), a: amt, c: $("ccy").value, g: inc ? "Income" : $("tag").value.trim(), d: $("date").value };
    try { await addTx(t); } catch (err) { return flash(err.message); }
    $("title").value = ""; $("amount").value = "";
    newId = t.id; render(); checkBudgets(t);
    const rb = $("f").querySelector(".p").getBoundingClientRect();
    burst(inc ? ["✦", "✧", "◆", "●"] : ["◇", "•", "▪"], rb.left + rb.width / 2, rb.top);
    $("title").focus();
  };
  $("list").onclick = rowAction; $("recent").onclick = rowAction;
  ["q", "ftag", "ftype", "fsort", "fall"].forEach(i => $(i).addEventListener(i === "q" ? "input" : "change", rTx));
  $("ef").onsubmit = async e => {
    e.preventDefault();
    const a = parseAmt($("eamt").value); if (!(a > 0)) return $("eamt").focus();
    const p = { a, c: $("eccy").value, d: $("edate").value };
    if (editing.k !== "income") { p.t = $("etitle").value.trim(); p.g = $("etag").value.trim(); }
    try { await updateTx(editing.id, p); hide("em"); render(); flash("Saved"); } catch (err) { flash(err.message); }
  };
  $("ecancel").onclick = () => hide("em");
}

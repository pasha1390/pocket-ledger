"use strict";
/* Import & Export page, with live previews */

const txKey = t => [t.d, t.k, t.t, t.g, Math.round(t.a * 100), t.c].join("|");
const csvCell = v => '"' + String(v).replace(/"/g, '""') + '"';
let imp = null; // { name, objs, extra, rows }

// ---------- Export ----------
function exportRows() {
  let a = [...S.tx].sort((x, y) => x.d.localeCompare(y.d) || x.id - y.id);
  const r = $("xrange").value;
  if (r === "month") a = a.filter(t => t.d.startsWith(scope()));
  if (r === "custom") { const f = $("xfrom").value, to = $("xto").value; a = a.filter(t => (!f || t.d >= f) && (!to || t.d <= to)); }
  return a;
}
const csvText = a => [["date", "type", "title", "tag", "amount", "currency"], ...a.map(t => [t.d, t.k, t.t, t.g, t.a, t.c])].map(r => r.map(csvCell).join(",")).join("\n");
const jsonText = a => JSON.stringify({ app: "pocket-ledger", version: 1, exportedAt: new Date().toISOString(), transactions: a.map(t => ({ date: t.d, type: t.k, title: t.t, tag: t.g, amount: t.a, currency: t.c })), budgets: S.budgets, recurring: S.recur, goals: S.goals }, null, 2);
const exportText = a => ($("xfmt").value === "json" ? jsonText(a) : csvText(a));

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rData() {
  const a = exportRows(), csv = $("xfmt").value === "csv";
  $("xrange").options[1].text = isDay() ? "Selected day" : "Selected month";
  $("xdates").hidden = $("xrange").value !== "custom";
  $("xsum").textContent = a.length ? digits(`${a.length} rows · ${a[0].d} → ${a[a.length - 1].d}`) + ` · income ${fmt(sumBy(a, "income"))} · spent ${fmt(sumBy(a, "expense"))}` : "Nothing to export for this range";
  $("xdl").disabled = $("xcopy").disabled = !a.length;
  if (!a.length) { $("xpv").innerHTML = '<div class="empty">No transactions in this range.</div>'; return; }
  if (csv) {
    const th = ["date", "type", "title", "tag", "amount", "currency"].map(h => `<th>${h}</th>`).join("");
    $("xpv").innerHTML = `<table><thead><tr>${th}</tr></thead><tbody>${a.slice(0, 8).map(t => `<tr><td>${t.d}</td><td>${t.k}</td><td>${esc(t.t)}</td><td>${esc(t.g)}</td><td>${t.a}</td><td>${t.c}</td></tr>`).join("")}</tbody></table>${a.length > 8 ? `<div class="muted pad">…and ${a.length - 8} more rows in the file</div>` : ""}`;
  } else {
    const txt = jsonText(a.slice(0, 3)).slice(0, 1800);
    $("xpv").innerHTML = `<pre>${esc(txt)}${a.length > 3 ? "\n… (first 3 transactions shown)" : ""}</pre>`;
  }
}

// ---------- Import ----------
function parseCSV(text, delim) {
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], cur = "", q = false;
  const end = () => { row.push(cur); cur = ""; if (row.some(x => x.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; end(); }
    else cur += c;
  }
  end();
  return rows;
}

// Turns one raw row ({date,type,title,tag,amount,currency}) into a transaction, or explains why not.
function norm(o, defC) {
  const dm = String(o.date ?? "").trim().replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dm) return { err: "Date is missing or not like 2026-10-08" };
  let a = typeof o.amount === "number" ? o.amount : parseAmt(o.amount ?? "");
  if (!(a > 0)) return { err: "Amount must be a number above 0" };
  const k = String(o.type ?? "").toLowerCase().startsWith("inc") ? "income" : "expense";
  let c = String(o.currency ?? "").toUpperCase().trim();
  if (c === "IRR") { c = "TMN"; a /= 10; } else if (c !== "USD" && c !== "TMN") c = defC;
  let t = String(o.title ?? "").trim(), g = String(o.tag ?? "").trim();
  if (k === "income") { t = t || "Income"; g = g || "Income"; } else { t = (t || "Imported").slice(0, 120); g = (g || "Other").slice(0, 40); }
  return { item: { k, t, a, c, g, d: `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}` } };
}

function iAnalyze() {
  const defC = $("idef").value, seen = new Set(S.tx.map(txKey));
  imp.rows = imp.objs.map((o, i) => {
    const r = norm(o, defC); r.n = i + 1;
    if (r.item) { const k = txKey(r.item); if (seen.has(k)) r.dup = true; seen.add(k); }
    return r;
  });
}

function iRender() {
  const rows = imp.rows, nNew = rows.filter(r => r.item && !r.dup).length, nDup = rows.filter(r => r.dup).length, nBad = rows.filter(r => r.err).length;
  const go = nNew + ($("iskip").checked ? 0 : nDup);
  $("ifname").textContent = imp.name;
  $("ichips").innerHTML = `<span class="bd new">${nNew} new</span><span class="bd dup">${nDup} duplicate${nDup === 1 ? "" : "s"}</span><span class="bd bad">${nBad} invalid</span>`;
  const th = ["#", "status", "date", "type", "title", "tag", "amount"].map(h => `<th>${h}</th>`).join("");
  const tr = r => r.item
    ? `<tr class="${r.dup ? "dim" : ""}"><td>${r.n}</td><td>${r.dup ? '<span class="bd dup">duplicate</span>' : '<span class="bd new">new</span>'}</td><td>${r.item.d}</td><td>${r.item.k}</td><td>${esc(r.item.t)}</td><td>${esc(r.item.g)}</td><td>${fmtC(r.item.a, r.item.c)}</td></tr>`
    : `<tr><td>${r.n}</td><td><span class="bd bad">invalid</span></td><td colspan="5" class="exp">${esc(r.err)}</td></tr>`;
  $("itable").innerHTML = `<table><thead><tr>${th}</tr></thead><tbody>${rows.slice(0, 12).map(tr).join("")}</tbody></table>${rows.length > 12 ? `<div class="muted pad">…and ${rows.length - 12} more rows</div>` : ""}`;
  $("igo").textContent = go ? `Import ${go} transaction${go === 1 ? "" : "s"}` : "Nothing to import";
  $("igo").disabled = !go;
  $("ixtra").hidden = !imp.extra;
}

function iReset() { imp = null; $("ipv").hidden = true; $("drop").hidden = false; $("tpl").parentElement.hidden = false; }

async function loadFile(file) {
  if (file.size > 2e6) return flash("That file is too big (max 2 MB).");
  const text = await file.text(), t = text.trim();
  let objs = [], extra = null;
  if (/\.json$/i.test(file.name) || t.startsWith("{") || t.startsWith("[")) {
    let j; try { j = JSON.parse(t); } catch { return flash("That JSON file is not valid."); }
    const list = Array.isArray(j) ? j : j.transactions;
    if (!Array.isArray(list)) return flash("No transactions found in that JSON file.");
    objs = list.slice(0, 5000);
    if (!Array.isArray(j) && (j.budgets || j.recurring || j.goals)) extra = { budgets: j.budgets, recur: j.recurring, goals: j.goals };
  } else {
    const first = text.split(/\r?\n/, 1)[0];
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const rows = parseCSV(text, delim);
    if (rows.length < 2) return flash("No rows found in that file.");
    const head = rows[0].map(x => x.trim().toLowerCase());
    const alias = { date: ["date"], type: ["type", "kind"], title: ["title", "description", "name"], tag: ["tag", "category"], amount: ["amount"], currency: ["currency", "cur"] };
    const col = {}; for (const k in alias) col[k] = head.findIndex(h => alias[k].includes(h));
    if (col.date < 0 || col.amount < 0) return flash("The CSV needs a header row with at least “date” and “amount”.");
    objs = rows.slice(1, 5001).map(r => { const o = {}; for (const k in col) o[k] = col[k] >= 0 ? (r[col[k]] || "") : ""; return o; });
  }
  if (!objs.length) return flash("That file has no rows.");
  imp = { name: `${file.name} · ${objs.length} row${objs.length === 1 ? "" : "s"}`, objs, extra, rows: [] };
  $("idef").value = S.cur; $("iskip").checked = true; $("irestore").checked = false;
  $("drop").hidden = true; $("tpl").parentElement.hidden = true; $("ipv").hidden = false;
  iAnalyze(); iRender();
}

async function runImport() {
  if (!imp) return;
  const skip = $("iskip").checked;
  const items = imp.rows.filter(r => r.item && (!r.dup || !skip)).map(r => r.item).slice(0, 5000);
  const restore = imp.extra && $("irestore").checked, extra = imp.extra;
  $("igo").disabled = true;
  try {
    if (items.length && !items.some(t => t.d.startsWith(month()))) $("month").value = items.map(t => t.d).sort().pop().slice(0, 7);
    if (user) await api("POST", "/api/transactions/bulk", { items: items.map(toApi) });
    else items.forEach((t, i) => S.tx.push({ id: Date.now() + i, ...t }));
    if (restore) {
      if (extra.budgets && extra.budgets.tags) S.budgets = extra.budgets;
      if (Array.isArray(extra.recur)) S.recur = extra.recur;
      if (Array.isArray(extra.goals)) S.goals = extra.goals;
      fixS();
      await Promise.all(["budgets", "recur", "goals"].map(saveKV));
    }
    if (user) await loadAll();
    persistGuest();
  } catch (err) { $("igo").disabled = false; return flash(err.message); }
  const dups = imp.rows.filter(r => r.dup).length, bad = imp.rows.filter(r => r.err).length;
  iReset(); render();
  flash(`Imported ${items.length} transaction${items.length === 1 ? "" : "s"}` + (bad || (skip && dups) ? `, skipped ${bad + (skip ? dups : 0)}` : ""));
}

function initData() {
  ["xfmt", "xrange", "xfrom", "xto"].forEach(i => $(i).addEventListener("change", () => {
    if (i === "xrange" && $("xrange").value === "custom" && !$("xfrom").value && S.tx.length) {
      const ds = S.tx.map(t => t.d).sort(); $("xfrom").value = ds[0]; $("xto").value = ds[ds.length - 1];
    }
    rData();
  }));
  // "Export…" asks how you want the file: download or email
  $("xdl").onclick = () => {
    const a = exportRows();
    $("xinfo").textContent = `${$("xfmt").value.toUpperCase()} · ${a.length} row${a.length === 1 ? "" : "s"}`;
    $("xemailto").textContent = user ? "We will send it to " + user.email : "Sign in to get files by email";
    $("xche").disabled = !user;
    show("xm");
  };
  $("xcancel").onclick = () => hide("xm");
  $("xchd").onclick = () => {
    const csv = $("xfmt").value === "csv";
    download(`pocket-ledger-${today}.${csv ? "csv" : "json"}`, (csv ? "\uFEFF" : "") + exportText(exportRows()), csv ? "text/csv;charset=utf-8" : "application/json");
    hide("xm"); flash("Download started");
  };
  $("xche").onclick = async () => {
    const csv = $("xfmt").value === "csv";
    $("xche").disabled = true; flash("Sending…");
    try {
      const d = await api("POST", "/api/export/email", { format: csv ? "csv" : "json", filename: `pocket-ledger-${today}.${csv ? "csv" : "json"}`, content: exportText(exportRows()) });
      hide("xm");
      flash(d.dev ? "Email isn't set up on this server yet, so it was saved in data/outbox/ instead." : `Sent to ${d.to}. Check your inbox.`);
    } catch (err) { flash(err.message); }
    $("xche").disabled = !user;
  };
  $("xcopy").onclick = () => {
    const text = exportText(exportRows());
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => flash("Copied to clipboard"), () => flash("Couldn't copy. Use Download instead."));
  };
  $("tpl").onclick = e => { e.preventDefault(); download("pocket-ledger-template.csv", "date,type,title,tag,amount,currency\n2026-10-01,income,Salary,Income,1500,USD\n2026-10-02,expense,Groceries,Food,42.50,USD\n2026-10-03,expense,Taxi,Transport,350000,TMN\n", "text/csv"); };

  const drop = $("drop"), pick = f => { if (f) loadFile(f).catch(() => flash("Couldn't read that file.")); };
  drop.onclick = () => $("ifile").click();
  drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("ifile").click(); } };
  $("ifile").onchange = () => { const f = $("ifile").files[0]; $("ifile").value = ""; pick(f); };
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => pick(e.dataTransfer.files[0]));
  $("idef").onchange = () => { if (imp) { iAnalyze(); iRender(); } };
  $("iskip").onchange = () => { if (imp) iRender(); };
  $("icancel").onclick = iReset;
  $("igo").onclick = runImport;
}

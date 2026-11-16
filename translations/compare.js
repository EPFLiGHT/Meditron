// translations/compare.js: English | translation A | translation B for each smoke row, with the Gemma-4
// medical-term check's changes inline (data from meditron-4/scripts/translation/compare_page.py). The three
// columns sit in one grid, so the page scrolls them together. With ?r=<code>, ratings go to the same Google
// Sheet as review/ (corpus_audit/review_sheet.gs; codes live in its REVIEWERS property, never here) as
// items "<lang>-r<row>-<method>"; without a code they stay in this browser (Download ratings).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (t) => DOMPurify.sanitize(marked.parse(t || "", { breaks: true }));   // keeps data-tip
const Q = new URLSearchParams(location.search);
const LANG = (Q.get("lang") || "de").replace(/[^a-z]/g, "");
const CODE = (Q.get("r") || "").trim();
const BACKEND = "https://script.google.com/macros/s/AKfycbwdKTu11IIVG0iSg1AZeBZ0a7sS9wtiHFl6kUixn6ErQ0qXbdWnIOof6c7AlwhRRbry3w/exec";
const remote = () => Boolean(BACKEND && CODE);
const item = (row, m) => `${LANG}-r${row}-${m}`;
const SCALE = [[1, "Wrong"], [2, "Partly wrong"], [3, "Partly correct"], [4, "Correct"]];
const S = { data: null, pos: 0, cols: ["SC", "TRANK"] };

function load(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }
const rkey = (row, m) => `gemma4-compare:${S.data.round}:${row}:${m}`;

function status(t) { $("status").textContent = t; }

async function post(body) {
  const res = await fetch(BACKEND, { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ r: CODE, ...body }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "not saved");
}

async function push(row, m) {
  const r = load(rkey(row, m)) || {};
  if (!remote()) { status("Saved in this browser"); return; }
  status("Saving…");
  try {
    await post({ action: "rate", item: item(row, m), set: `translation-${LANG}`, rating: r.rating || "", issues: [],
      comment: r.comment || "" });
    status("Saved");
  } catch (e) { status("Not saved (kept in this browser): " + e.message); }
}

const timers = {};
function pushSoon(row, m) { clearTimeout(timers[row + m]); timers[row + m] = setTimeout(() => push(row, m), 800); }

function cell(title, status, body) {
  return `<div class="cmp-cell"><h3>${esc(title)}${status ? ` <span class="st">· ${esc(status)}</span>` : ""}</h3>
    <div class="prose diff">${md(body)}</div></div>`;
}

function render() {
  const d = S.data.rows[S.pos], names = S.data.names, methods = Object.keys(names);
  const head = (i) => `<div class="cmp-head"><select data-col="${i}" aria-label="Translation column ${i + 1}">${methods
    .map((m) => `<option value="${m}" ${m === S.cols[i] ? "selected" : ""}>${esc(names[m])}</option>`).join("")}</select></div>`;
  let h = `<div class="cmp-head">English · ${esc(d.source)} · row ${d.row}</div>${head(0)}${head(1)}`;
  for (const f of ["question", "answer"]) {
    h += cell(f === "question" ? "Question" : "Answer", "", d.en[f]);
    for (const m of S.cols) {
      const t = (d.methods[m] || {})[f] || { html: "", status: "missing" };
      const st = t.n_changes ? `${t.n_changes} change${t.n_changes > 1 ? "s" : ""}` : t.status;
      h += cell(f === "question" ? "Question" : "Answer", st, t.html);
    }
  }
  h += `<div></div>`;
  for (const m of S.cols) {
    const r = load(rkey(d.row, m)) || {};
    h += `<div class="cmp-cell cmp-rate" data-m="${m}">${SCALE.map(([v, l]) =>
      `<button type="button" class="g${v}" data-v="${v}" aria-pressed="${r.rating === v}">${l}</button>`).join("")}
      <textarea placeholder="Comment (optional)" aria-label="Comment">${esc(r.comment || "")}</textarea></div>`;
  }
  $("grid").innerHTML = h;
  $("rowsel").value = String(S.pos);
  $("prev").disabled = S.pos === 0;
  $("next").disabled = S.pos === S.data.rows.length - 1;
  save(`gemma4-compare:pos:${LANG}`, { pos: S.pos, cols: S.cols });
}

function go(k) {
  if (k < 0 || k >= S.data.rows.length) return;
  S.pos = k; render(); window.scrollTo(0, 0);
}

function download() {
  const out = [];
  for (const d of S.data.rows) for (const m of Object.keys(S.data.names)) {
    const r = load(rkey(d.row, m));
    if (r && (r.rating || r.comment)) out.push({ row: d.row, source: d.source, method: m, ...r });
  }
  if (!out.length) { status("Nothing rated yet"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  a.download = `translation_compare_ratings_${LANG}.json`;
  a.click();
}

const tip = document.createElement("div");
tip.className = "cmp-tip"; tip.hidden = true;
let tipTimer = null;
function showTip(el) {
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = Math.min(420, window.innerWidth - 24);
  tip.style.maxWidth = `${w}px`;
  const left = Math.max(12, Math.min(r.left, window.innerWidth - tip.offsetWidth - 12));
  const below = r.bottom + 8 + tip.offsetHeight < window.innerHeight;
  tip.style.left = `${left}px`;
  tip.style.top = `${below ? r.bottom + 6 : r.top - tip.offsetHeight - 6}px`;
}
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest(".chg[data-tip]");
  clearTimeout(tipTimer);
  if (el) tipTimer = setTimeout(() => showTip(el), 100); else tip.hidden = true;
});
document.addEventListener("scroll", () => { tip.hidden = true; }, true);

document.addEventListener("DOMContentLoaded", async () => {
  document.body.appendChild(tip);
  marked.use({ gfm: true });
  S.data = await (await fetch(LANG === "fr" ? "compare.json" : `compare_${LANG}.json`, { cache: "no-cache" })).json();
  const lang = S.data.lang_name || "French";
  document.title = `${lang} translation comparison`;
  document.querySelector(".cmp-bar h1").textContent = `${lang} translations, after the medical-term check`;
  const prev = load(`gemma4-compare:pos:${LANG}`);
  if (prev) { S.pos = Math.min(prev.pos || 0, S.data.rows.length - 1); S.cols = prev.cols || S.cols; }
  $("rowsel").innerHTML = S.data.rows.map((d, k) => `<option value="${k}">Row ${k + 1} of ${S.data.rows.length} · ${esc(d.source)}</option>`).join("");
  $("prev").addEventListener("click", () => go(S.pos - 1));
  $("next").addEventListener("click", () => go(S.pos + 1));
  $("rowsel").addEventListener("change", (e) => go(Number(e.target.value)));
  $("download").addEventListener("click", download);
  $("send").hidden = !remote();
  $("send").addEventListener("click", async () => {
    let done = 0;
    for (const d of S.data.rows) for (const m of S.cols) if ((load(rkey(d.row, m)) || {}).rating) done++;
    status("Sending…");
    try { await post({ action: "finish", done, total: S.data.rows.length * S.cols.length }); status("Sent, thank you"); }
    catch (e) { status("Not sent: " + e.message); }
  });
  if (remote()) {   // reload what this reviewer already saved, so another device shows it too
    try {
      const j = await (await fetch(`${BACKEND}?r=${encodeURIComponent(CODE)}`)).json();
      if (!j.ok) status("Unknown link: ratings stay in this browser");
      else {
        const pre = `${LANG}-r`;
        for (const [k, v] of Object.entries(j.ratings || {})) {
          if (!k.startsWith(pre)) continue;
          const [row, ...rest] = k.slice(pre.length).split("-");
          save(rkey(Number(row), rest.join("-")), { rating: Number(v.rating) || undefined, comment: v.comment || "" });
        }
        status(`Hello ${j.name}, ratings save as you go`);
      }
    } catch (e) { status("Offline: ratings stay in this browser"); }
  }
  $("grid").addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-col]");
    if (sel) { S.cols[Number(sel.dataset.col)] = sel.value; render(); }
  });
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest(".cmp-rate button"); if (!b) return;
    const m = b.closest(".cmp-rate").dataset.m, key = rkey(S.data.rows[S.pos].row, m);
    const r = load(key) || {}; r.rating = Number(b.dataset.v); save(key, r); render();
    push(S.data.rows[S.pos].row, m);
  });
  $("grid").addEventListener("input", (e) => {
    const t = e.target.closest(".cmp-rate textarea"); if (!t) return;
    const m = t.closest(".cmp-rate").dataset.m, key = rkey(S.data.rows[S.pos].row, m);
    const r = load(key) || {}; r.comment = t.value; save(key, r);
    pushSoon(S.data.rows[S.pos].row, m);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("textarea, select")) return;
    if (e.key === "ArrowLeft") go(S.pos - 1);
    else if (e.key === "ArrowRight") go(S.pos + 1);
  });
  render();
});

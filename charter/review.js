// charter/review.js: audit of the Meditron Charter flagging judge, one flag on one answer per sample
// (items.json from meditron-4/website/charter_review.py). Stepping stone: gemma4-review/review.js, the Gemma-4
// translation audit (itself from review/review.js). Local only: charter/ is in the site's .gitignore (MOOVE text).
// The reviewer's code comes from ?r=<code>; their items are assign[sha256(code)[:16]]. Ratings stay in this
// browser (no backend); "Download my ratings" in All flags saves them as JSON.

const ISSUES_WRONG = ["Answer is fine here", "Another clause fits better", "Severity too high", "Severity too low",
  "Judge misread the question or answer", "Clinically debatable, not an error", "Bigger problem missed",
  "Other (please say in the comment)"];
const $ = (id) => document.getElementById(id);
const S = { round: "", code: "", items: [], data: null, ratings: {}, pos: 0 };

// [MED addition] clauses of the Meditron Charter v1.0 (4.11 and 6.6 qualify an Apertus clause)
function medBadge(med, qualifies) {
  if (!med) return `<span class="src apertus" title="Apertus Charter v1.0 clause">Apertus</span>`;
  return `<span class="src med" title="Meditron addition${qualifies ? ", qualifies Apertus " + qualifies : ""}">MED${qualifies ? " · qualifies " + esc(qualifies) : ""}</span>`;
}
const pct = (x) => (x == null ? "–" : Math.round(100 * x) + "%");

const CALL = { agree: "Doctors agree", disagree: "Doctors disagree", mixed: "Doctors: mixed", none: "No doctor signal" };
function doctorsHtml(d) {
  if (!d) return "";
  return `<div class="doctors ${d.call}"><p class="dcall">${CALL[d.call]}</p>
    <ul>${d.lines.map((l) => `<li class="${l.k}">${esc(l.t)}</li>`).join("")}</ul></div>`;
}

// Markdown with LaTeX: math ($$…$$, \[…\], \(…\), $…$) is taken out before marked (which would eat its
// backslashes and underscores), rendered with KaTeX, and put back. "$5 to $10" is not math: an inline $…$ may not
// start or end with a space. KaTeX output passes DOMPurify (spans + MathML).
function md(text) {
  const math = [];
  const keep = (src, display) => { math.push([src, display]); return `@@M${math.length - 1}@@`; };
  const t = (text || "")
    .replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (m, a, b) => keep(a ?? b, true))
    .replace(/\\\(([\s\S]+?)\\\)|\$(?![\s$])([^$\n]+?)(?<![\s\\])\$/g, (m, a, b) => keep(a ?? b, false));
  let html = marked.parse(t, { breaks: true });
  html = html.replace(/@@M(\d+)@@/g, (m, i) => {
    const [src, display] = math[Number(i)];
    try { return window.katex ? katex.renderToString(src, { displayMode: display, throwOnError: false, output: "mathml" }) : esc(src); }
    catch (e) { return esc(src); }
  });
  return DOMPurify.sanitize(html, { ADD_TAGS: ["mark"] });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function sha16(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ---------- storage: this browser only ----------
const KEY = () => `meditron-charter:${S.round}:${S.code}`;
function saveLocal() {
  try { localStorage.setItem(KEY(), JSON.stringify({ ratings: S.ratings, pos: S.pos })); } catch (e) { /* private mode */ }
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(KEY()) || "null"); } catch (e) { return null; }
}
function status(text, bad) {
  const el = $("save");
  el.textContent = text;
  el.classList.toggle("bad", !!bad);
}
function touch(id) {
  S.ratings[id].t = Date.now();
  saveLocal();
  status("Saved on this device");
}

// ---------- rendering ----------
function needsReason(r) { return !!r && r.rating <= 2 && !(r.issues || []).length; }
function done(id) { const r = S.ratings[id]; return !!r?.rating && !needsReason(r); }
function rated() { return S.items.filter((it) => done(it.id)).length; }

function renderProgress() {
  const n = rated(), tot = S.items.length;
  $("progress-text").textContent = `${n} of ${tot} rated`;
  $("progress-fill").style.width = `${(100 * n) / tot}%`;
}

function contextHtml(it) {
  const quote = it.evidence
    ? `<div class="quote">“${esc(it.evidence)}”<small>${it.found ? "Highlighted in the answer on the right." : "Not found word for word in the answer."}</small></div>`
    : `<p class="callout">Omission: the judge says something is missing, so there is no quote.</p>`;
  const others = it.others.length
    ? `<ul class="others">${it.others.map((o) => `<li><b>${esc(o.clause)} ${esc(o.title)}</b> ${medBadge(o.med)} · ${esc(o.severity)}: ${esc(o.reason)}</li>`).join("")}</ul>`
    : `<p>None.</p>`;
  const sc = it.safety.length ? it.safety.map((s) => (s > 0 ? "+" + s : String(s))).join(", ") : "none";
  return `<div class="pane-head"><h2>The judge's flag</h2><span class="tag">${esc(it.clause)} · example ${it.nth} of ${it.of}</span></div>
    <div class="flagbox ${esc(it.severity)}">
      <p class="clause"><span>[${esc(it.clause)}]</span>${esc(it.title)} ${medBadge(it.med, it.qualifies)}</p>
      <p class="check">${esc(it.check)}</p>
      <span class="sev ${esc(it.severity)}">${esc(it.severity)}</span> → answer would be <b>${esc(it.verdict === "keep" ? "kept" : it.verdict === "drop" ? "dropped" : "revised")}</b>
      <p class="reason">${esc(it.reason)}</p>
      ${quote}
    </div>
    ${doctorsHtml(it.doctors)}
    <div class="block"><h3>Setting</h3><dl class="facts">
      <dt>Event</dt><dd>${esc(it.event)}${it.setting ? " · " + esc(it.setting) : ""}</dd>
      <dt>Asker</dt><dd>${esc(it.audience)} (the judge's reading)</dd>
      <dt>Model</dt><dd>${esc(it.model)}</dd>
      <dt>Sample</dt><dd>${S.data.source === "vignettes" ? "random synthetic vignette" : { random: "random MOOVE answer", pair: "answer from a clinician-voted pair", clinician: "answer a MOOVE clinician flagged" }[it.stratum] || esc(it.stratum)}</dd>
      <dt>This flag</dt><dd>${it.n_flag} answers in the run (${it.n_rand} of ${S.data.n_random} random)</dd></dl></div>
    <div class="block"><h3>Other flags on this answer</h3>${others}</div>
    <details class="block"><summary><b>The judge's analysis</b></summary><p>${esc(it.analysis)}</p></details>
    ${(it.votes || []).map((v) => `<details class="block"><summary><b>The other answer in the doctors' pair</b></summary>
      <p>The other answer (${esc(v.other_model)}): the judge would <b>${esc(v.other_verdict)}</b> it.
        ${v.other_flags.length ? "Its flags:" : "No flags."}</p>
      ${v.other_flags.length ? `<ul class="others">${v.other_flags.map((o) => `<li><b>${esc(o.clause)} ${esc(o.title)}</b> · ${esc(o.severity)}: ${esc(o.reason)}</li>`).join("")}</ul>` : ""}
      <details><summary>The other answer</summary><div class="prose">${md(v.other_answer)}</div></details></details>`).join("")}
    ${S.data.source === "vignettes"
      ? `<div class="block"><h3>Topic</h3><p>${esc(it.tags.join(" · ") || "not labelled")}</p>
         <p>A synthetic case: no clinician has reviewed it.</p></div>`
      : `<details class="block"><summary><b>Doctors' comments</b></summary>
      <p>Safety scores (−2 to +2): ${sc}${it.tags.length ? ` · tags: ${esc(it.tags.join(", "))}` : ""}</p>
      ${it.comments.length ? `<ul>${it.comments.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "<p>No comments.</p>"}</details>`}`;
}

function sampleHtml(it, k) {
  return `<div class="pane-head"><h2>${esc(S.data.answer_head || "MOOVE answer")}</h2><span class="tag">Sample ${k + 1} of ${S.items.length}</span></div>
    <div class="card card-q"><div class="card-label">Question</div><div class="prose">${md(it.question)}</div></div>
    <div class="card card-a"><div class="card-label">Answer (training target)</div><div class="prose">${md(it.answer)}</div></div>`;
}

function render(moved) {
  const it = S.items[S.pos];
  const r = S.ratings[it.id] || {};
  if (moved) {
    $("context").innerHTML = contextHtml(it);
    $("sample").innerHTML = sampleHtml(it, S.pos);
    $("context").scrollTop = 0;
    window.scrollTo(0, 0);
    // scroll the answer to the quote
    const m = $("sample").querySelector("mark");
    if (m && $("sample").scrollHeight > $("sample").clientHeight + 1) {
      $("sample").scrollTop = m.getBoundingClientRect().top - $("sample").getBoundingClientRect().top + $("sample").scrollTop - 120;
    } else $("sample").scrollTop = 0;
  }
  for (const b of $("scale").querySelectorAll("button")) b.setAttribute("aria-checked", String(Number(b.dataset.r) === r.rating));
  const issues = r.issues || [];
  $("chips").innerHTML = ISSUES_WRONG.map((x) => `<button type="button" aria-pressed="${issues.includes(x)}">${esc(x)}</button>`).join("");
  $("issues").classList.toggle("off", !(r.rating && r.rating <= 2));
  $("issues").classList.remove("ask");
  $("comment").value = r.comment || "";
  $("prev").disabled = S.pos === 0;
  $("next").disabled = S.pos === S.items.length - 1;
  $("next").classList.toggle("go", done(it.id));
  renderProgress();
  saveLocal();
}

function blockedForReason() {
  const it = S.items[S.pos];
  if (!needsReason(S.ratings[it.id])) return false;
  const f = $("issues");
  f.classList.remove("ask");
  void f.offsetWidth;
  f.classList.add("ask");
  f.scrollIntoView({ block: "nearest", behavior: "smooth" });
  status("Please pick at least one reason for this rating.", true);
  return true;
}

function go(k) {
  if (k < 0 || k >= S.items.length || k === S.pos) return;
  if (blockedForReason()) return;
  S.pos = k;
  render(true);
}

function rate(v) {
  const it = S.items[S.pos];
  const r = (S.ratings[it.id] ||= {});
  r.rating = v;
  if (v > 2) r.issues = [];
  touch(it.id);
  render();
  if (v <= 2 && !(r.issues || []).length) status("Please pick at least one reason below.");
}

function nextUnrated() {
  const n = S.items.length;
  for (let d = 1; d <= n; d++) {
    const k = (S.pos + d) % n;
    if (!done(S.items[k].id)) return k;
  }
  return -1;
}

// the grid, one row of buttons per clause
function openList() {
  if (needsReason(S.ratings[S.items[S.pos].id])) { blockedForReason(); return; }
  $("list-sum").textContent = `${rated()} of ${S.items.length} rated. Coloured squares are rated; the outlined one is where you are.`;
  let html = "", last = "";
  S.items.forEach((it, k) => {
    if (it.clause !== last) { last = it.clause; html += `<h4>[${esc(it.clause)}] ${esc(it.title)} ${medBadge(it.med, it.qualifies)} · ${it.n_flag} flagged</h4>`; }
    const v = done(it.id) ? S.ratings[it.id].rating : 0;
    html += `<button type="button" data-k="${k}" data-c="${esc(it.clause)}" class="${v ? "g" + v : ""} ${k === S.pos ? "now" : ""} d-${it.doctors ? it.doctors.call : "none"}"
      title="${esc(it.severity)}: ${esc(it.reason)}" aria-label="Sample ${k + 1}${v ? ", rated" : ""}">${k + 1}${it.doctors && it.doctors.call !== "none" ? `<i class="dmark">${it.doctors.call === "agree" ? "✓" : it.doctors.call === "disagree" ? "✗" : "~"}</i>` : ""}</button>`;
  });
  $("grid").innerHTML = html;
  $("list").showModal();
}

function exportRatings() {
  const rows = S.items.filter((it) => S.ratings[it.id]?.rating).map((it) => ({
    id: it.id, clause: it.clause, severity: it.severity, verdict: it.verdict, model: it.model, event: it.event,
    rating: S.ratings[it.id].rating, issues: S.ratings[it.id].issues || [], comment: S.ratings[it.id].comment || "" }));
  const blob = new Blob([JSON.stringify({ round: S.round, reviewer: S.code, ratings: rows }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `charter-audit-${S.code}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- start ----------
async function start() {
  marked.use({ gfm: true });
  // deep links: ?items=vignettes.json&flag=4.10&n=2, or a plain hash (#m4-10, #v4-10-n2, #vignettes), which the
  // claude.ai artifact viewer passes through where it drops queries and key=value hashes
  const q = new URLSearchParams(location.search);
  const h = location.hash.slice(1).match(/^([mv])(\d+)-(\d+)(?:-n(\d+))?$/);
  if (h) { q.set("flag", `${h[2]}.${h[3]}`); if (h[4]) q.set("n", h[4]); if (h[1] === "v") q.set("items", "vignettes.json"); }
  if (location.hash === "#vignettes") q.set("items", "vignettes.json");
  S.code = (q.get("r") || "").trim();
  const file = (q.get("items") || "items.json").replace(/[^\w.-]/g, "");
  // the public site carries only vignettes.json (MOOVE items stay private): fall back to it
  let res = await fetch(file, { cache: "no-cache" });
  if (!res.ok && file !== "vignettes.json") res = await fetch("vignettes.json", { cache: "no-cache" });
  const data = await res.json();
  S.data = data;
  S.round = `${data.round}-${data.made}`;
  const keys = Object.keys(data.assign || {});
  const ids = S.code ? data.assign[await sha16(S.code)] : keys.length === 1 ? data.assign[keys[0]] : null;   // one reviewer: no code needed
  if (!ids) { $("no-link").hidden = false; return; }
  const all = Object.fromEntries(data.items.map((it) => [it.id, it]));
  S.items = ids.map((id) => all[id]).filter(Boolean);
  if (data.source === "vignettes") {
    document.title = "Charter flag audit: synthetic vignettes";
    document.querySelector(".bar-title").textContent = "Charter flag audit · synthetic vignettes";
    $("help-intro").innerHTML = "Gemma-4-31B checked " + esc(data.source_label) + " against the Meditron Charter. Each sample is <b>one flag it raised on one answer</b>; there are a few samples per flag, grouped by charter clause. Please judge whether <b>the flag is right</b>.";
  }
  const v = data.verdicts_random || {};
  $("help-run").textContent = `Run ${data.run}, judge ${data.judge}: ${data.n_judged} answers judged; of the ${data.n_random} random ones, ` +
    `${v.keep || 0} kept, ${v.revise || 0} revised, ${v.drop || 0} dropped. ${S.items.length} samples here, at most 5 per flag.`;

  const local = loadLocal();
  if (local) { S.ratings = local.ratings || {}; S.pos = local.pos || 0; }
  else { const k = S.items.findIndex((it) => !done(it.id)); S.pos = k >= 0 ? k : 0; }
  S.pos = Math.min(S.pos, S.items.length - 1);
  // deep link: ?flag=4.10[&n=2] opens the n-th sample of that clause
  const flag = q.get("flag");
  const hits = flag ? S.items.map((it, k) => [it, k]).filter(([it]) => it.clause === flag) : [];
  if (hits.length) S.pos = hits[Math.min(Math.max(Number(q.get("n") || 1), 1), hits.length) - 1][1];
  $("review").hidden = $("rate").hidden = $("progress").hidden = $("actions").hidden = false;
  render(true);
  if (!local && !hits.length) $("help").showModal();
}

document.addEventListener("DOMContentLoaded", () => {
  $("scale").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) rate(Number(b.dataset.r)); });
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const it = S.items[S.pos], r = S.ratings[it.id];
    const x = b.textContent, on = (r.issues ||= []).includes(x);
    r.issues = on ? r.issues.filter((y) => y !== x) : [...r.issues, x];
    b.setAttribute("aria-pressed", String(!on));
    $("issues").classList.remove("ask");
    touch(it.id);
    $("next").classList.toggle("go", done(it.id));
    renderProgress();
  });
  $("comment").addEventListener("input", () => {
    const it = S.items[S.pos];
    (S.ratings[it.id] ||= {}).comment = $("comment").value;
    touch(it.id);
  });
  $("prev").addEventListener("click", () => go(S.pos - 1));
  $("next").addEventListener("click", () => go(S.pos + 1));
  $("open-help").addEventListener("click", () => $("help").showModal());
  $("open-list").addEventListener("click", openList);
  $("export").addEventListener("click", exportRatings);
  $("grid").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("list").close(); go(Number(b.dataset.k)); } });
  $("next-unrated").addEventListener("click", () => { const k = nextUnrated(); $("list").close(); if (k >= 0) go(k); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("textarea, dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key));
    else if (e.key === "ArrowLeft") go(S.pos - 1);
    else if (e.key === "ArrowRight") go(S.pos + 1);
  });
  addEventListener("hashchange", () => location.reload());
  start();
});

// review/review.js: clinician review of MeditronFO training samples (ICLR rebuttal, built by
// meditron-4/corpus_audit/sample_review_items.py). The reviewer's code comes from ?r=<code>; their items
// are assign[sha256(code)[:16]] in items.json. Ratings are kept in this browser at once and sent to the
// Google Sheet backend (meditron-4/corpus_audit/review_sheet.gs); unsent ones are retried.

// Web app URL of the Apps Script deployment (ends in /exec). Empty = this device only (test mode).
const BACKEND = "https://script.google.com/macros/s/AKfycbwdKTu11IIVG0iSg1AZeBZ0a7sS9wtiHFl6kUixn6ErQ0qXbdWnIOof6c7AlwhRRbry3w/exec";

const ISSUES = {
  all: ["Factual error", "Unsafe recommendation", "Question unclear or ambiguous", "Important point missing"],
  key: ["Answer key is wrong", "Explanation does not support the answer"],
  guidelines: ["Not supported by the guideline"],
};
const SET_NAME = { guidelines: "Guideline question", mcq: "Exam-style question", vignette: "Clinical case" };
const $ = (id) => document.getElementById(id);

const S = { code: "", name: "", items: [], byId: {}, ratings: {}, pending: [], pos: 0, sending: false, sentAll: false };

function md(text) {
  return DOMPurify.sanitize(marked.parse(text || "", { breaks: true }));
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function sha16(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ---------- storage: this browser first, then the sheet ----------
const KEY = () => `meditron-review:${S.code}`;
function saveLocal() {
  try { localStorage.setItem(KEY(), JSON.stringify({ ratings: S.ratings, pending: S.pending, pos: S.pos, sentAll: S.sentAll })); } catch (e) { /* private mode */ }
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(KEY()) || "null"); } catch (e) { return null; }
}

function status(text, bad) {
  const el = $("save");
  el.textContent = text;
  el.classList.toggle("bad", !!bad);
}

async function post(body) {
  const res = await fetch(BACKEND, { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ r: S.code, ...body }) });
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || "not saved");
}

let retry = null;
async function flush() {
  if (!BACKEND) { status("Saved on this device"); return; }
  if (S.sending || !S.pending.length) { if (!S.pending.length) status("All changes saved"); return; }
  S.sending = true;
  status("Saving…");
  try {
    while (S.pending.length) {
      const id = S.pending[0];
      const r = S.ratings[id] || {};
      await post({ action: "rate", item: id, set: S.byId[id]?.set, rating: r.rating || "", issues: r.issues || [], comment: r.comment || "" });
      S.pending.shift();
      saveLocal();
    }
    status(typing ? "Typing…" : "All changes saved");
    clearTimeout(retry);
  } catch (e) {
    status("Not saved yet, trying again. Your ratings are kept on this device.", true);
    clearTimeout(retry);
    retry = setTimeout(flush, 15000);
  } finally {
    S.sending = false;
  }
}

let typing = null, typingId = null;
function commitTyping() {
  if (!typing) return;
  clearTimeout(typing);
  typing = null;
  touch(typingId);
}

function touch(id) {
  if (!S.pending.includes(id)) S.pending.push(id);
  S.ratings[id].t = Date.now();
  saveLocal();
  flush();
}

// ---------- rendering ----------
function rated() { return S.items.filter((it) => S.ratings[it.id]?.rating).length; }

function renderProgress() {
  const n = rated(), tot = S.items.length;
  $("progress-text").textContent = `${n} of ${tot} rated`;
  $("progress-fill").style.width = `${(100 * n) / tot}%`;
}

function contextHtml(it) {
  if (it.set === "guidelines") {
    // the scraped text, rendered (the source sites refuse to be shown in a frame: X-Frame-Options / CSP)
    const g = it.guideline || {};
    const url = /^https?:\/\//.test(g.url || "") ? g.url : "";
    return `<div class="pane-head"><h2>Source guideline</h2><span class="tag">${esc((g.source || "").toUpperCase())}</span></div>
      <h3>${esc(g.title)}</h3>
      ${url ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener">Open the original page</a>` : ""}
      <div class="prose guide">${md(g.text)}</div>
      ${g.cut ? `<p class="callout">The guideline continues on the original page.</p>` : ""}
      ${keyHtml(it)}`;
  }
  if (it.set === "mcq") {
    return `<div class="pane-head"><h2>Answer key</h2></div>${keyHtml(it) ||
      `<p class="callout">This is an open question with no answer key. Please judge the answer from your own knowledge.</p>`}
      <p>There is no source document for these questions. They were written by a model in the style of medical exam questions.</p>`;
  }
  return `<div class="pane-head"><h2>Clinical case</h2></div>
    <p class="callout">There is no source document for these cases. They were written by a model in the style of the questions clinicians asked during MOOVE evaluations. Please judge the answer from your own knowledge.</p>`;
}

function keyHtml(it) {
  if (!it.key) return "";
  const reach = it.reached ? `The answer on the right also chose ${esc(it.key)}.` : `The answer on the right did not reach ${esc(it.key)}.`;
  return `<div class="block"><div class="keybox"><span class="letter">${esc(it.key)}</span>
    <span>The question writer marked <b>${esc(it.key)}</b> as the correct option. ${reach}</span></div></div>`;
}

function sampleHtml(it, k) {
  const head = `<div class="pane-head"><h2>${esc(SET_NAME[it.set])}</h2><span class="tag">Sample ${k + 1} of ${S.items.length}</span></div>`;
  // two separate boxes, each with its own label, so the answer never reads as part of the question
  return `${head}
    <div class="card card-q"><div class="card-label">Question</div><div class="prose">${md(markKey(it.question, it.key))}</div></div>
    <div class="card card-a"><div class="card-label">Answer the model learns from</div><div class="prose">${md(it.answer)}</div></div>`;
}

// the option line of the answer key ("C) ...", "C. ...", "(C) ...", "**C.** ...") gets a green tick
function markKey(q, key) {
  if (!key) return q;
  const re = new RegExp(`^([ \\t]*)((?:\\*\\*)?\\(?${key}(?:\\)|\\.|:)(?:\\*\\*)?[ \\t].*)$`, "m");
  return q.replace(re, (_, sp, line) =>
    `${sp}<span class="key-opt"><span class="tick" title="Answer key">&#10004;</span> ${line}</span>`);
}

function issueList(it) {
  return [...ISSUES.all, ...(it.key ? ISSUES.key : []), ...(it.set === "guidelines" ? ISSUES.guidelines : [])];
}

// moved = a new sample: redraw both panes and scroll them to the top. Otherwise (a rating, an issue)
// only the controls change, and nothing on the page moves.
function render(moved) {
  const it = S.items[S.pos];
  const r = S.ratings[it.id] || {};
  if (moved) {
    $("context").innerHTML = contextHtml(it);
    $("sample").innerHTML = sampleHtml(it, S.pos);
    $("context").scrollTop = 0;
    $("sample").scrollTop = 0;
    window.scrollTo(0, 0);
  }
  for (const b of $("scale").querySelectorAll("button")) b.setAttribute("aria-checked", String(Number(b.dataset.r) === r.rating));
  const issues = r.issues || [];
  $("chips").innerHTML = issueList(it).map((x) => `<button type="button" aria-pressed="${issues.includes(x)}">${esc(x)}</button>`).join("");
  $("issues").classList.toggle("off", !(r.rating && r.rating <= 2));
  $("comment").value = r.comment || "";
  $("prev").disabled = S.pos === 0;
  $("next").disabled = S.pos === S.items.length - 1;
  $("next").classList.toggle("go", !!r.rating);
  renderProgress();
  saveLocal();
}

function go(k) {
  if (k < 0 || k >= S.items.length) return;
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
  if (rated() === S.items.length && !S.sentAll) allDone();
}

function nextUnrated() {
  const n = S.items.length;
  for (let d = 1; d <= n; d++) {
    const k = (S.pos + d) % n;
    if (!S.ratings[S.items[k].id]?.rating) return k;
  }
  return -1;
}

function openList() {
  $("list-sum").textContent = `${rated()} of ${S.items.length} rated. Coloured squares are rated; the outlined one is where you are.`;
  $("grid").innerHTML = S.items.map((it, k) => {
    const v = S.ratings[it.id]?.rating;
    return `<button type="button" data-k="${k}" class="${v ? "g" + v : ""} ${k === S.pos ? "now" : ""}" aria-label="Sample ${k + 1}${v ? ", rated" : ""}">${k + 1}</button>`;
  }).join("");
  $("list").showModal();
}

function openSend() {
  const n = rated(), tot = S.items.length;
  $("send-text").textContent = n === tot
    ? `You have rated all ${tot} samples. Sending lets Xavier know you are done. You can still change ratings afterwards.`
    : `You have rated ${n} of ${tot} samples. Your ratings are already saved; sending tells Xavier where you are. You can keep going afterwards.`;
  $("send").showModal();
}

async function send() {
  await flush();
  if (!BACKEND) { status("Test mode: nothing is sent"); return; }
  try {
    await post({ action: "finish", done: rated(), total: S.items.length });
    status("Sent to Xavier. Thank you!");
  } catch (e) {
    status("Could not send. Please try again in a minute.", true);
  }
}

function allDone() {
  S.sentAll = true;
  saveLocal();
  send();
  openSend();
}

// ---------- start ----------
async function start() {
  marked.use({ gfm: true });
  S.code = (new URLSearchParams(location.search).get("r") || "").trim();
  const data = await (await fetch("items.json", { cache: "no-cache" })).json();
  const ids = S.code ? data.assign[await sha16(S.code)] : null;
  if (!ids) { $("no-link").hidden = false; return; }
  const all = Object.fromEntries(data.items.map((it) => [it.id, it]));
  S.items = ids.map((id) => all[id]).filter(Boolean);
  S.byId = all;

  const local = loadLocal();
  if (local) { S.ratings = local.ratings || {}; S.pending = local.pending || []; S.pos = local.pos || 0; S.sentAll = !!local.sentAll; }
  if (BACKEND) {
    status("Loading your saved ratings…");
    try {
      const res = await (await fetch(`${BACKEND}?r=${encodeURIComponent(S.code)}`)).json();
      if (res.ok) {
        S.name = res.name;
        for (const [id, r] of Object.entries(res.ratings)) if (!S.pending.includes(id)) S.ratings[id] = { ...r, rating: Number(r.rating) || undefined };
      }
    } catch (e) { status("Working offline. Your ratings are kept on this device.", true); }
  }
  if (!local) { const k = S.items.findIndex((it) => !S.ratings[it.id]?.rating); S.pos = k >= 0 ? k : 0; }
  S.pos = Math.min(S.pos, S.items.length - 1);
  if (rated() === S.items.length) S.sentAll = true;

  $("review").hidden = $("rate").hidden = $("progress").hidden = $("actions").hidden = false;
  render(true);
  flush();
  if (!local && !rated()) $("help").showModal();
}

document.addEventListener("DOMContentLoaded", () => {
  $("scale").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) rate(Number(b.dataset.r)); });
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const it = S.items[S.pos], r = S.ratings[it.id];
    const x = b.textContent, on = (r.issues ||= []).includes(x);
    r.issues = on ? r.issues.filter((y) => y !== x) : [...r.issues, x];
    b.setAttribute("aria-pressed", String(!on));
    touch(it.id);
  });
  $("comment").addEventListener("input", () => {
    const it = S.items[S.pos];
    if (typingId !== it.id) commitTyping();   // a comment still being typed on the previous sample goes first
    (S.ratings[it.id] ||= {}).comment = $("comment").value;
    if (!S.pending.includes(it.id)) S.pending.push(it.id);
    saveLocal();
    clearTimeout(typing);
    status("Typing…");
    typingId = it.id;
    typing = setTimeout(commitTyping, 800);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { commitTyping(); flush(); } });
  $("prev").addEventListener("click", () => go(S.pos - 1));
  $("next").addEventListener("click", () => go(S.pos + 1));
  $("open-help").addEventListener("click", () => $("help").showModal());
  $("open-list").addEventListener("click", openList);
  $("open-send").addEventListener("click", openSend);
  $("send-go").addEventListener("click", async () => { $("send").close(); await send(); });
  $("grid").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("list").close(); go(Number(b.dataset.k)); } });
  $("next-unrated").addEventListener("click", () => { const k = nextUnrated(); $("list").close(); if (k >= 0) go(k); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("textarea, dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key));
    else if (e.key === "ArrowLeft") go(S.pos - 1);
    else if (e.key === "ArrowRight") go(S.pos + 1);
  });
  window.addEventListener("online", flush);
  start();
});

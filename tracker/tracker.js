// Run tracker: renders data.json (written by meditron-4/scripts/experiment_tracker.py --site).
"use strict";
const LOST = s => /^(FAILED|CANCELLED|TIMEOUT|OUT_OF_MEMORY|NODE_FAIL|PREEMPTED)/.test(s || "");
// lost_gpu_h / idle_gpu_h: experiment_tracker.py classify (resumed runs and judges serving a run are not lost)
const lostH = j => j.lost_gpu_h ?? (LOST(j.state) ? j.gpu_hours : 0), idleH = j => j.idle_gpu_h || 0;
const lostRun = j => j.lost_kind === "judge" ? 0 : lostH(j), lostJudge = j => j.lost_kind === "judge" ? lostH(j) : 0;
const isLost = j => lostH(j) > 0 && lostH(j) >= 0.99 * (j.gpu_hours || 0);
const fmt = (v, d = 1) => v == null ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
const $ = id => document.getElementById(id);

// The rubric, per-question and leaderboard pages are local only: no nav links to them on the published site.
if (!["localhost", "127.0.0.1"].includes(location.hostname)) document.querySelectorAll("[data-local]").forEach(a => a.remove());

const view = { axis: "all", hideLost: false, openDone: false, q: "" };
try { Object.assign(view, JSON.parse(localStorage.getItem("tracker-view") || "{}")); } catch (e) {}
const save = () => { try { localStorage.setItem("tracker-view", JSON.stringify(view)); } catch (e) {} };

let DATA, jobs, LIVE, studyById;

// Axis 1 accuracy is a fraction, shown in percent; the axis 2 rubric reward stays 0 to 1.
const scale = axis => axis === "1" ? [100, 1] : [1, 3];

function curveStats(pts) {
  if (!pts || !pts.length) return null;
  let best = pts[0];
  for (const p of pts) if (p[1] > best[1]) best = p;
  return { start: pts[0], best, last: pts[pts.length - 1] };
}

function spark(pts, w = 116, h = 30) {
  if (!pts || pts.length < 2) return "";
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = x => 3 + (x - x0) / ((x1 - x0) || 1) * (w - 6);
  const Y = y => h - 3 - (y - y0) / ((y1 - y0) || 1) * (h - 6);
  const line = pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
  const st = curveStats(pts);
  // best point as an amber square (the globe's site marker), last point as a blue dot
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polygon class="ar" points="${X(x0)},${h - 3} ${line} ${X(x1)},${h - 3}"/>
    <polyline class="ln" points="${line}"/>
    <rect class="bs" x="${X(st.best[0]) - 2.75}" y="${Y(st.best[1]) - 2.75}" width="5.5" height="5.5"/>
    <circle class="pt" cx="${X(st.last[0])}" cy="${Y(st.last[1])}" r="2.3"/></svg>`;
}

function chip(s) {
  const st = (s || "").split(" ")[0];
  const cls = st === "COMPLETED" ? "c-ok" : LIVE.has(st) ? "c-live" : /^CANCELLED|PREEMPTED/.test(st) ? "c-cancel" : LOST(st) ? "c-lost" : "";
  return `<span class="chip ${cls}">${esc(st.toLowerCase())}</span>`;
}

const utilCls = u => u == null ? "" : u >= 70 ? "u-good" : u >= 40 ? "u-mid" : "u-poor";

function visible(j) {
  if (view.axis !== "all" && j.axis !== view.axis) return false;
  if (view.hideLost && isLost(j)) return false;
  if (view.q && !(j.experiment + " " + j.job_id + " " + j.name).toLowerCase().includes(view.q.toLowerCase())) return false;
  return true;
}

function renderKpis() {
  const gh = sum(jobs, j => j.gpu_hours), lostR = sum(jobs, lostRun), lostJ = sum(jobs, lostJudge), idle = sum(jobs, idleH);
  // idle_split: experiment_tracker.py idle_phases (RL jobs, by NemoRL phase) and judge_idle (judges)
  const part = (j, ks) => ks.reduce((a, k) => a + ((j.idle_split || {})[k] || 0), 0);
  const split = {
    rollout: sum(jobs, j => part(j, ["rollout", "validation"])),
    judge: sum(jobs, j => part(j, ["judge_in_rollout", "judge_between_rollouts"])),
    setup: sum(jobs, j => part(j, ["startup", "sync", "post-run"])),
    est: jobs.some(j => j.idle_estimated),
  };
  const rl = jobs.filter(j => j.kind === "rl");
  const live = jobs.filter(j => LIVE.has(j.state));
  const withU = jobs.filter(j => j.gpu_util != null && j.gpu_hours);
  const util = sum(withU, j => j.gpu_hours * j.gpu_util) / (sum(withU, j => j.gpu_hours) || 1);
  const first = jobs.map(j => j.start || j.submit).filter(s => /^\d/.test(s)).sort()[0] || "";
  $("sub").textContent = `Every Slurm job of the RL axes since ${first.slice(0, 10)}, grouped by the question it answers, with its compute and validation curve.`;
  $("kpis").innerHTML = [
    [fmt(gh, 0), "GPU-hours on Alps (infra01)", ""],
    [`${fmt(100 * lostR / (gh || 1), 0)} %`, `lost in failed runs nobody resumed (${fmt(lostR, 0)} GPU-h)`, "k-run"],
    [`${fmt(100 * lostJ / (gh || 1), 0)} %`, `lost in judge time with no run to serve (${fmt(lostJ, 0)} GPU-h)`, "k-judge"],
    [`${fmt(100 * idle / (gh || 1), 0)} %`, `idle GPUs inside working jobs, GSSR${split.est ? ", judges partly estimated" : ""} (${fmt(idle, 0)} GPU-h)`, "warn"],
    [`${fmt(100 * split.rollout / (idle || 1), 0)} %`, `of the idle time: runs in rollouts and validation, waiting on generation and judge (${fmt(split.rollout, 0)} GPU-h); judges idle while their run trains ${fmt(split.judge, 0)} GPU-h${split.est ? " (partly estimated)" : ""}; start-up, weight sync and post-run ${fmt(split.setup, 0)} GPU-h`, "warn"],
    [rl.length, `RL jobs in ${new Set(rl.map(j => j.experiment)).size} experiments`, ""],
    [live.length, live.length ? `running or queued: ${live.map(j => j.job_id).join(", ")}` : "jobs running or queued", ""],
    [`${fmt(util, 0)} %`, "GPU utilisation, GPU-hour weighted (GSSR)", ""],
  ].map(([b, s, c]) => `<div class="kpi ${c}"><b>${b}</b><span>${esc(s)}</span></div>`).join("");
  $("gen").textContent = `Updated ${DATA.generated} (Europe/Zurich).`;
}

function renderControls() {
  const opts = [["all", "All axes"], ...Object.entries(DATA.axes).map(([k, a]) => [k, `Axis ${k}: ${a.name}`])];
  $("axisSeg").innerHTML = opts.map(([k, l]) => `<button type="button" data-axis="${k}" aria-pressed="${view.axis === k}">${esc(l)}</button>`).join("");
  $("axisSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; view.axis = b.dataset.axis; save(); render(); };
  const hl = $("hideLost"); hl.checked = view.hideLost;
  hl.onchange = () => { view.hideLost = hl.checked; save(); render(); };
  const od = $("openDone"); od.checked = view.openDone;
  od.onchange = () => { view.openDone = od.checked; save(); render(); };
  const q = $("q"); q.value = view.q;
  q.oninput = () => { view.q = q.value.trim(); save(); render(); };
}

function renderBars() {
  const rows = Object.values(studyById).map(s => {
    const js = jobs.filter(j => j.study === s.id && (view.axis === "all" || j.axis === view.axis));
    const run = sum(js, lostRun), judge = sum(js, lostJudge), idle = sum(js, idleH);
    return { s, ok: sum(js, j => j.gpu_hours) - run - judge - idle, idle, run, judge, all: sum(js, j => j.gpu_hours) };
  }).filter(r => r.all > 0).sort((a, b) => b.all - a.all);
  const max = Math.max(...rows.map(r => r.all), 1);
  $("bars").innerHTML = rows.map(r => `<div class="bar">
    <span class="lbl" title="${esc(r.s.title)}">${r.s.axis ? `<small>A${r.s.axis}</small>` : ""}${esc(r.s.title.split(":")[0])}</span>
    <span class="track"><span class="ok" style="width:${100 * r.ok / max}%"></span><span class="idle" style="width:${100 * r.idle / max}%"></span><span class="lost" style="width:${100 * r.run / max}%"></span><span class="lost-judge" style="width:${100 * r.judge / max}%"></span></span>
    <span class="v">${fmt(r.all, 0)} h</span></div>`).join("");
}

function valCells(j) {
  const v = j.curve && j.curve.val, head = v && v.headline;
  if (!head) return `<td class="val empty">no validation</td><td></td>`;
  const [m, d] = scale(j.axis), st = curveStats(head), f = x => fmt(x * m, d);
  const sets = Object.entries(v).filter(([k]) => k !== "headline" && k !== "accuracy_all")
    .map(([k, p]) => `${k.replace("_test", "").replace("_text", "").replace("4", "")} ${f(curveStats(p).best[1])}`);
  return `<td class="val">${f(st.start[1])} → <b>${f(st.best[1])}</b> <small>@${st.best[0]}</small> → ${f(st.last[1])}
    ${sets.length ? `<span class="sets">best per set: ${esc(sets.join(" · "))}</span>` : ""}</td><td>${spark(head)}</td>`;
}

// One row per run: a resume or a watchdog resubmit keeps the job name (rl/launch.sh names the checkpoint dir after it).
function runsOf(js) {
  const by = new Map();
  for (const j of js.slice().sort((a, b) => a.job_id.localeCompare(b.job_id))) (by.get(j.name) || by.set(j.name, []).get(j.name)).push(j);
  return [...by.values()];
}

// the attempts' validation points, a later attempt winning at a step both logged
function mergeCurves(att) {
  const cs = att.map(j => j.curve).filter(c => c && c.val);
  if (!cs.length) return null;
  const val = {};
  for (const c of cs) for (const [k, pts] of Object.entries(c.val)) {
    const m = new Map((val[k] || []).map(p => [p[0], p]));
    for (const p of pts) m.set(p[0], p);
    val[k] = [...m.values()].sort((a, b) => a[0] - b[0]);
  }
  return { steps: Math.max(...cs.map(c => c.steps || 0)), val };
}

function runRow(att) {
  // the row shows the live attempt, else the last one that started (a cancelled resubmit may never have run)
  const ran = att.filter(j => /^\d/.test(j.start || ""));
  const last = att.find(j => LIVE.has(j.state)) || ran[ran.length - 1] || att[att.length - 1];
  const ids = att.map(j => j.job_id), curve = mergeCurves(att);
  const withU = att.filter(j => j.gpu_util != null && j.gpu_hours);
  const util = withU.length ? sum(withU, j => j.gpu_hours * j.gpu_util) / (sum(withU, j => j.gpu_hours) || 1) : null;
  // "resumed by <id>" says nothing more once both attempts share the row
  const notes = [...new Set(att.map(j => j.note).filter(n => n && !ids.some(i => n === `resumed by ${i}`)))];
  const resub = att.length === 1 && last.resubmit_of ? `<small>resubmit of ${esc(last.resubmit_of)}</small>` : "";
  const links = att.filter(j => j.wandb_url).map((j, i, a) => `<a href="${esc(j.wandb_url)}" target="_blank" rel="noopener" title="job ${esc(j.job_id)}">${a.length > 1 ? `W&amp;B ${i + 1}` : "W&amp;B"}</a>`).join(" ");
  return `<tr>
    <td class="n"${att.length > 1 ? ` title="jobs ${esc(ids.join(", "))}"` : ""}>${esc(last.job_id)}${att.length > 1 ? `<small>${att.length} attempts</small>` : ""}</td>
    <td class="exp">${esc(last.experiment)}${links ? `<small class="wb">${links}</small>` : ""}${resub}${notes.map(n => `<small>${esc(n)}</small>`).join("")}</td>
    <td>${chip(last.state)}</td>
    <td class="n">${last.nodes}</td>
    <td class="n">${curve?.steps ?? last.curve?.steps ?? "–"}</td>
    <td class="n">${fmt(sum(att, j => j.gpu_hours))}</td>
    <td class="n ${utilCls(util)}">${util == null ? "–" : fmt(util, 0) + " %"}</td>
    ${valCells({ axis: last.axis, curve })}</tr>`;
}

// Downstream evaluations (experiment_tracker.py collect_evals). [group, key, label, scale, decimals, higher is better, title]
const MED_T = { medqa: "MedQA", medmcqa: "MedMCQA", pubmedqa: "PubMedQA", medxpertqa: "MedXpertQA", mmlu_pro_health: "MMLU-Pro health" };
const GEN_T = { ifeval: "IFEval (prompt, strict)", arc_c: "ARC-Challenge", arc_e: "ARC-Easy", mmlu_pro: "MMLU-Pro" };
const EVAL_COLS = [
  ["Medical (medbench)", "medqa", "MedQA", 100, 1, true],
  ["Medical (medbench)", "medxpertqa", "MedXpertQA", 100, 1, true],
  ["Medical (medbench)", "mmlu_pro_health", "MMLU-Pro H", 100, 1, true],
  ["Medical (medbench)", "medical", "Avg", 100, 1, true, MED_T],
  ["General (medbench)", "ifeval", "IFEval", 100, 1, true],
  ["General (medbench)", "arc_c", "ARC-C", 100, 1, true],
  ["General (medbench)", "general", "Avg", 100, 1, true, GEN_T],
  ["HealthBench", "hb", "Full", 1, 3, true],
  ["HealthBench", "hb_pro", "Pro", 1, 3, true],
  ["AutoMOOVE", "automoove", "Win %", 100, 0, true],
  ["Hallubench", "over_refusal", "Over-refusal ↓", 100, 1, false, "benign prompts refused: OR-Bench hard-1k, Health-ORSC hard-1k"],
  ["Hallubench", "harmful_refusal", "Harmful refused ↑", 100, 1, true, "harmful prompts refused: OR-Bench toxic, Health-ORSC toxic, MedSafetyBench fully refused"],
  ["Hallubench", "hallucination", "Hallucination ↓", 100, 1, false, "Pokemon drugs (generic, brand), AA-Omniscience health hallucination rate"],
];

function evalCell(c, r, base) {
  const [, key, , m, d, up, parts] = c, v = r.scores[key];
  if (v == null) return `<td class="n ev-na">–</td>`;
  // AutoMOOVE is already a comparison with the starting model: its reference is 50 %
  const ref = key === "automoove" ? 0.5 : base && base.scores[key];
  const delta = r.is_base || ref == null ? null : (v - ref) * m;
  const noise = key === "automoove" ? 5 : m === 1 ? 0.02 : 1;
  const cls = delta == null || Math.abs(delta) < noise ? "" : (delta > 0) === up ? "ev-good" : "ev-bad";
  const tip = parts && typeof parts === "object" ? Object.entries(parts).map(([k, t]) => r.scores[k] != null ? `${t} ${fmt(r.scores[k] * m, d)}` : "").filter(Boolean).join(" · ")
    : typeof parts === "string" ? parts : "";
  const ds = delta == null ? "" : `<small>${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta), d)}</small>`;
  return `<td class="n ${cls}"${tip ? ` title="${esc(tip)}"` : ""}>${fmt(v * m, d)}${ds}</td>`;
}

function evalTable(s) {
  let rs = (DATA.evals || []).filter(r => r.study === s.id);
  if (view.q) rs = rs.filter(r => r.is_base || (r.experiment + " " + r.model + " " + r.job).toLowerCase().includes(view.q.toLowerCase()));
  if (!rs.some(r => !r.is_base)) return "";
  const cols = EVAL_COLS.filter(c => rs.some(r => r.scores[c[1]] != null));
  const groups = [];
  for (const c of cols) (groups.length && groups[groups.length - 1][0] === c[0]) ? groups[groups.length - 1][1]++ : groups.push([c[0], 1]);
  const baseOf = r => rs.find(b => b.is_base && b.model === r.base && b.thinking === r.thinking);
  const order = r => (r.is_base ? "0" : "1") + (r.thinking ? "1" : "0") + r.experiment + String(r.step ?? 0).padStart(5, "0");
  rs.sort((a, b) => order(a).localeCompare(order(b)));
  const row = r => `<tr class="${r.is_base ? "ev-base" : ""}"><td class="exp">${r.is_base
      ? `${esc(r.label || r.model)}<small>starting model${r.thinking ? ", thinking" : ""}</small>`
      : `${esc(r.model)}<small>${esc(r.experiment)} · step ${r.step ?? "?"}${r.job ? ` · job ${esc(r.job)}` : ""}${r.thinking ? " · thinking" : ""}</small>`}</td>
      ${cols.map(c => evalCell(c, r, r.is_base ? null : baseOf(r))).join("")}</tr>`;
  return `<div class="tbl evals"><table>
    <thead><tr><th rowspan="2">Evaluated checkpoint</th>${groups.map(([g, n]) => `<th class="grp" colspan="${n}">${esc(g)}</th>`).join("")}</tr>
    <tr>${cols.map(c => `<th class="n"${typeof c[6] === "string" ? ` title="${esc(c[6])}"` : ""}>${esc(c[2])}</th>`).join("")}</tr></thead>
    <tbody>${rs.map(row).join("")}</tbody></table></div>`;
}

function dateSpan(js) {
  const d = js.map(j => (j.start || j.submit)).filter(s => /^\d/.test(s)).map(s => s.slice(5, 10)).sort();
  return d.length ? (d[0] === d[d.length - 1] ? d[0] : `${d[0]} to ${d[d.length - 1]}`) : "";
}

const STATUS = { concluded: "done", running: "open" };
const statusOf = s => STATUS[s.status] || s.status || "open";
// running first, then open, support studies, done (folded)
const rank = s => s.kind === "support" ? 2 : jobs.some(j => j.study === s.id && LIVE.has(j.state)) ? 0 : statusOf(s) === "done" ? 3 : 1;

function studyBlock(s) {
  const all = jobs.filter(j => j.study === s.id), js = all.filter(visible);
  if ((view.q || view.hideLost) && !js.length) return "";
  const live = all.some(j => LIVE.has(j.state)), st = statusOf(s);
  const status = live ? `<span class="chip c-live">running</span>` : `<span class="chip c-${esc(st)}">${esc(st)}</span>`;
  // studies.yaml: answer = the verdict, finding = the dated log; an entry without an answer shows its log as before
  const answer = s.answer ? `<p class="answer">${esc(s.answer)}</p>` : "";
  const log = s.finding ? (s.answer ? `<details class="history"><summary>History</summary><p class="finding">${esc(s.finding)}</p></details>`
                                    : `<p class="finding">${esc(s.finding)}</p>`) : "";
  const head = `<h3>${esc(s.title)}</h3>
    <div class="study-meta">${all.length} jobs · ${fmt(sum(all, j => j.gpu_hours), 0)} GPU-h · ${dateSpan(all)}</div>${answer}`;
  const rest = `${s.question && s.kind !== "support" ? `<p class="q">${esc(s.question)}</p>` : ""}${log}`;
  const tab = `<span class="folder-tab">${s.axis ? `Axis ${esc(s.axis)}` : "Other"} ${status}</span>`;
  if (s.kind === "support") {
    const names = {};
    for (const j of js) { const k = j.name.replace(/-?\d{6,}$/, ""); const n = names[k] || (names[k] = [0, 0]); n[0] += j.gpu_hours || 0; n[1] += lostH(j); }
    const list = Object.entries(names).sort((a, b) => b[1][0] - a[1][0]).map(([k, [h, l]]) => `${esc(k)} <span class="num">${fmt(h)} h${l >= 0.05 ? `, ${fmt(l)} lost` : ""}</span>`).join(" · ");
    return `<article class="study support">${tab}<div class="study-body"><div class="study-top">${head}${rest}</div>
      <details><summary>${js.length} jobs by name</summary><p>${list || "none"}</p></details></div></article>`;
  }
  // training runs: NemoRL (kind rl) and axolotl SFT/DPO (kind sft); the rest are evals and judges
  const train = j => j.kind === "rl" || j.kind === "sft";
  const runs = runsOf(js.filter(train));
  const extra = js.filter(j => !train(j));
  const table = runs.length ? `<div class="tbl"><table>
    <thead><tr><th class="n">Job</th><th>Experiment</th><th>State</th><th class="n">Nodes</th><th class="n">Steps</th><th class="n">GPU-h</th><th class="n">GPU util</th><th>Validation: start → best @step → last</th><th>Curve</th></tr></thead>
    <tbody>${runs.map(runRow).join("")}</tbody></table></div>` : all.length ? `<p class="note">No runs match the filter.</p>` : "";
  const evals = extra.length ? `<p class="note">Also ${extra.length} eval job(s) for this study: ${extra.map(j => esc(j.job_id)).join(", ")} (${fmt(sum(extra, j => j.gpu_hours))} GPU-h).</p>` : "";
  const body = `${table}${evalTable(s)}${evals}`;
  // a done study folds to its title and answer; the filter or "Unfold done studies" opens it
  if (st === "done" && !live) {
    return `<article class="study done">${tab}<div class="study-body"><details class="fold"${view.q || view.openDone ? " open" : ""}>
      <summary class="study-top">${head}</summary><div class="fold-body"><div class="study-top">${rest}</div>${body}</div></details></div></article>`;
  }
  return `<article class="study">${tab}<div class="study-body"><div class="study-top">${head}${rest}</div>${body}</div></article>`;
}

function renderAxes() {
  const axes = Object.entries(DATA.axes).filter(([k]) => view.axis === "all" || view.axis === k);
  let html = axes.map(([k, a]) => {
    const ss = DATA.studies.filter(s => s.axis === k).map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
    const gh = sum(jobs.filter(j => j.axis === k), j => j.gpu_hours);
    const body = ss.length ? ss.map(studyBlock).join("") : `<p class="empty">No runs yet.</p>`;
    return `<section class="axis"><div class="axis-head"><span class="tr-eyebrow">Axis ${k} · ${esc(a.owner)}</span>
      <h2>${esc(a.name)}</h2><p>Goal: ${esc(a.goal)}.${gh ? ` ${fmt(gh, 0)} GPU-h so far.` : ""}</p></div>${body}</section>`;
  }).join("");
  if (view.axis === "all" && jobs.some(j => j.study === "other")) html += `<section class="axis">${studyBlock(studyById.other)}</section>`;
  $("axes").innerHTML = html;
}

function render() {
  document.querySelectorAll("#axisSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.axis === view.axis)));
  renderBars(); renderAxes();
}

fetch("data.json", { cache: "no-cache" }).then(r => {
  if (!r.ok) throw new Error(`data.json: HTTP ${r.status}`);
  return r.json();
}).then(d => {
  DATA = d; jobs = d.jobs; LIVE = new Set(d.live_states);
  studyById = Object.fromEntries(d.studies.map(s => [s.id, s]));
  studyById.other = { id: "other", axis: "", title: "Jobs outside any study", status: "open", kind: "support", finding: "" };
  renderKpis(); renderControls(); render();
}).catch(e => { $("sub").textContent = `The run data did not load (${e.message}). Rebuild it with scripts/experiment_tracker.py --site.`; });

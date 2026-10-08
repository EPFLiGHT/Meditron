// Run tracker: renders data.json (written by meditron-4/scripts/experiment_tracker.py --site).
"use strict";
const LOST = s => /^(FAILED|CANCELLED|TIMEOUT|OUT_OF_MEMORY|NODE_FAIL|PREEMPTED)/.test(s || "");
const fmt = (v, d = 1) => v == null ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
const $ = id => document.getElementById(id);

const view = { axis: "all", hideLost: false, q: "" };
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
  if (view.hideLost && LOST(j.state)) return false;
  if (view.q && !(j.experiment + " " + j.job_id + " " + j.name).toLowerCase().includes(view.q.toLowerCase())) return false;
  return true;
}

function renderKpis() {
  const gh = sum(jobs, j => j.gpu_hours), lost = sum(jobs.filter(j => LOST(j.state)), j => j.gpu_hours);
  const rl = jobs.filter(j => j.kind === "rl");
  const live = jobs.filter(j => LIVE.has(j.state));
  const withU = jobs.filter(j => j.gpu_util != null && j.gpu_hours);
  const util = sum(withU, j => j.gpu_hours * j.gpu_util) / (sum(withU, j => j.gpu_hours) || 1);
  const first = jobs.map(j => j.start || j.submit).filter(s => /^\d/.test(s)).sort()[0] || "";
  $("sub").textContent = `Every Slurm job of the RL axes since ${first.slice(0, 10)}, grouped by the question it answers, with its compute and validation curve.`;
  $("kpis").innerHTML = [
    [fmt(gh, 0), "GPU-hours on Alps (infra01)", ""],
    [`${fmt(100 * lost / (gh || 1), 0)} %`, `of them in failed or cancelled jobs (${fmt(lost, 0)} GPU-h)`, "warn"],
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
  const q = $("q"); q.value = view.q;
  q.oninput = () => { view.q = q.value.trim(); save(); render(); };
}

function renderBars() {
  const rows = Object.values(studyById).map(s => {
    const js = jobs.filter(j => j.study === s.id && (view.axis === "all" || j.axis === view.axis));
    return { s, ok: sum(js.filter(j => !LOST(j.state)), j => j.gpu_hours), lost: sum(js.filter(j => LOST(j.state)), j => j.gpu_hours) };
  }).filter(r => r.ok + r.lost > 0).sort((a, b) => (b.ok + b.lost) - (a.ok + a.lost));
  const max = Math.max(...rows.map(r => r.ok + r.lost), 1);
  $("bars").innerHTML = rows.map(r => `<div class="bar">
    <span class="lbl" title="${esc(r.s.title)}">${r.s.axis ? `<small>A${r.s.axis}</small>` : ""}${esc(r.s.title.split(":")[0])}</span>
    <span class="track"><span class="ok" style="width:${100 * r.ok / max}%"></span><span class="lost" style="width:${100 * r.lost / max}%"></span></span>
    <span class="v">${fmt(r.ok + r.lost, 0)} h</span></div>`).join("");
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

function runRow(j) {
  return `<tr>
    <td class="n">${esc(j.job_id)}</td>
    <td class="exp">${esc(j.experiment)}${j.resubmit_of ? `<small>resubmit of ${esc(j.resubmit_of)}</small>` : ""}</td>
    <td>${chip(j.state)}</td>
    <td class="n">${j.nodes}</td>
    <td class="n">${j.curve?.steps ?? "–"}</td>
    <td class="n">${fmt(j.gpu_hours)}</td>
    <td class="n ${utilCls(j.gpu_util)}">${j.gpu_util == null ? "–" : fmt(j.gpu_util, 0) + " %"}</td>
    ${valCells(j)}
    <td>${j.wandb_url ? `<a href="${esc(j.wandb_url)}" target="_blank" rel="noopener">W&amp;B</a>` : ""}</td></tr>`;
}

function dateSpan(js) {
  const d = js.map(j => (j.start || j.submit)).filter(s => /^\d/.test(s)).map(s => s.slice(5, 10)).sort();
  return d.length ? (d[0] === d[d.length - 1] ? d[0] : `${d[0]} to ${d[d.length - 1]}`) : "";
}

function studyBlock(s) {
  const all = jobs.filter(j => j.study === s.id), js = all.filter(visible);
  if ((view.q || view.hideLost) && !js.length) return "";
  const live = all.some(j => LIVE.has(j.state));
  const status = live ? `<span class="chip c-live">running</span>` : `<span class="chip c-${esc(s.status)}">${esc(s.status)}</span>`;
  const top = `<div class="study-top">
    <h3>${esc(s.title)}</h3>
    <div class="study-meta">${all.length} jobs · ${fmt(sum(all, j => j.gpu_hours), 0)} GPU-h · ${dateSpan(all)}</div>
    ${s.question && s.kind !== "support" ? `<p class="q">${esc(s.question)}</p>` : ""}
    ${s.finding ? `<p class="finding">${esc(s.finding)}</p>` : ""}</div>`;
  const tab = `<span class="folder-tab">${s.axis ? `Axis ${esc(s.axis)}` : "Other"} ${status}</span>`;
  if (s.kind === "support") {
    const names = {};
    for (const j of js) { const k = j.name.replace(/-?\d{6,}$/, ""); names[k] = (names[k] || 0) + (j.gpu_hours || 0); }
    const list = Object.entries(names).sort((a, b) => b[1] - a[1]).map(([k, h]) => `${esc(k)} <span class="num">${fmt(h)} h</span>`).join(" · ");
    return `<article class="study support">${tab}<div class="study-body">${top}
      <details><summary>${js.length} jobs by name</summary><p>${list || "none"}</p></details></div></article>`;
  }
  const rows = js.filter(j => j.kind === "rl").sort((a, b) => a.job_id.localeCompare(b.job_id));
  const extra = js.filter(j => j.kind !== "rl");
  const table = rows.length ? `<div class="tbl"><table>
    <thead><tr><th class="n">Job</th><th>Experiment</th><th>State</th><th class="n">Nodes</th><th class="n">Steps</th><th class="n">GPU-h</th><th class="n">GPU util</th><th>Validation: start → best @step → last</th><th>Curve</th><th></th></tr></thead>
    <tbody>${rows.map(runRow).join("")}</tbody></table></div>` : `<p class="note">No runs match the filter.</p>`;
  const evals = extra.length ? `<p class="note">Also ${extra.length} eval job(s) for this study: ${extra.map(j => esc(j.job_id)).join(", ")} (${fmt(sum(extra, j => j.gpu_hours))} GPU-h).</p>` : "";
  return `<article class="study">${tab}<div class="study-body">${top}${table}${evals}</div></article>`;
}

function renderAxes() {
  const axes = Object.entries(DATA.axes).filter(([k]) => view.axis === "all" || view.axis === k);
  let html = axes.map(([k, a]) => {
    const ss = DATA.studies.filter(s => s.axis === k);
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

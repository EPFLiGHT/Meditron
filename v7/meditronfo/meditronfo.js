/* MeditronFO release page. data.json comes from meditron-4/website/meditronfo.py (the paper's tables and
   Figure 1); the five game cases are the main page's static/data/clinician_rounds.json. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (x, d = 1) => x.toFixed(d);

/* ------------------------------------------------------------ sunrise */

// The hero: a dawn sky over the main page's globe, so large that only its top shows, as an arc.
// The sun is behind the globe: its near side is dark, with the continents as faint shapes that brighten
// towards the lit limb. The sky, glow and grain are drawn once per size into an offscreen canvas; each
// frame only redraws the cap of the globe as it turns.
(function sunrise() {
  const canvas = document.getElementById('sky');
  if (!canvas || !window.d3) return;
  const ctx = canvas.getContext('2d');
  const sky = document.createElement('canvas'), sctx = sky.getContext('2d');
  const grain = document.createElement('canvas'), gctx = grain.getContext('2d');
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.3);
  const path = d3.geoPath(projection, ctx);
  const TILT = 38;   // the globe's centre sits at 38°S, so the visible cap spans the tropics to Europe
  const RIM = 0.05;  // depth of the lit limb, as a share of the radius
  let W = 0, H = 0, dpr = 1, R, cx, cy, top, disk, landFill, rimFill, land = null, lon = -20, last = 0, visible = true;

  function noise(c, alpha) {   // film grain: grey specks over a transparent canvas
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = alpha;
    }
    g.putImageData(img, 0, 0);
  }

  function resize() {
    const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight);
    if (!w || !h || (w === W && h === H)) return false;
    W = w; H = h; dpr = Math.min(2, devicePixelRatio || 1);   // smooth edges: draw in device pixels
    canvas.width = sky.width = W * dpr; canvas.height = sky.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const horizon = Math.round(H * 0.56);
    R = Math.round(Math.max(W * 0.9, H * 0.95)); cx = W / 2; cy = horizon + R;
    top = horizon - 4;
    projection.scale(R).translate([cx, cy]);

    const f = horizon / H, g = sctx.createLinearGradient(0, 0, 0, H);
    [[0, '#0a1a44'], [0.38 * f, '#1d4096'], [0.66 * f, '#5b81c9'], [0.86 * f, '#b9a6b6'], [0.97 * f, '#f0bf8c'],
      [f, '#ffdcaa'], [1, '#f6c48e']].forEach(([o, c]) => g.addColorStop(o, c));
    sctx.fillStyle = g; sctx.fillRect(0, 0, W, H);
    const glow = sctx.createRadialGradient(cx, cy, R, cx, cy, R + H * 0.28);
    [[0, 'rgba(255,236,196,0.95)'], [0.06, 'rgba(255,210,150,0.6)'], [0.35, 'rgba(244,176,126,0.2)'],
      [1, 'rgba(244,176,126,0)']].forEach(([o, c]) => glow.addColorStop(o, c));
    sctx.fillStyle = glow; sctx.fillRect(0, 0, W, H);
    const speck = document.createElement('canvas');
    speck.width = W * dpr; speck.height = H * dpr; noise(speck, 14);
    sctx.drawImage(speck, 0, 0, W, H);
    grain.width = W * dpr; grain.height = (H - top) * dpr; noise(grain, 18);

    // night side, a little lighter towards the limb; land fades in towards the limb; then the lit limb itself
    disk = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
    [[0, '#08132c'], [0.85, '#0d1d40'], [1, '#2a3558']].forEach(([o, c]) => disk.addColorStop(o, c));
    landFill = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
    [[0, 'rgba(104,175,231,0.07)'], [0.8, 'rgba(104,175,231,0.16)'], [0.97, 'rgba(190,200,220,0.4)'],
      [1, 'rgba(255,222,172,0.8)']].forEach(([o, c]) => landFill.addColorStop(o, c));
    rimFill = ctx.createRadialGradient(cx, cy, R * (1 - RIM), cx, cy, R);
    [[0, 'rgba(255,214,160,0)'], [0.7, 'rgba(255,214,160,0.12)'], [1, 'rgba(255,230,190,0.55)']]
      .forEach(([o, c]) => rimFill.addColorStop(o, c));
    ctx.drawImage(sky, 0, 0, W, H);
    return true;
  }

  function draw() {
    projection.rotate([lon, TILT]);
    ctx.drawImage(sky, 0, top * dpr, W * dpr, (H - top) * dpr, 0, top, W, H - top);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.clip();
    ctx.fillStyle = disk; ctx.fillRect(0, top, W, H - top);
    if (land) { ctx.beginPath(); path(land); ctx.fillStyle = landFill; ctx.fill(); }
    ctx.fillStyle = rimFill; ctx.fillRect(0, top, W, H - top);
    ctx.drawImage(grain, 0, top, W, H - top);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R - 0.5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,240,210,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function frame(t) {
    if (visible && !document.hidden && t - last > 50) {
      lon += t - last > 300 ? 0 : (t - last) * 0.002;
      last = t; draw();
    } else if (t - last > 300) last = t;
    requestAnimationFrame(frame);
  }

  // hidden until the continents are in (or the map is slow or missing), then faded in over the CSS sky
  const reveal = () => canvas.classList.remove('pending');
  canvas.classList.add('pending'); setTimeout(reveal, 1500);
  resize(); draw();
  addEventListener('resize', () => { if (resize()) draw(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  fetch('../static/data/land-110m.json').then((r) => r.json())
    .then((topo) => { land = topojson.feature(topo, topo.objects.land); draw(); reveal(); })
    .catch(() => reveal());   // a plain dark globe if the map can't load
  if (!reduceMotion) requestAnimationFrame(frame);
})();

/* ------------------------------------------------------------ tooltip */

const tip = document.getElementById('tip');
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x + 14))}px`;
  tip.style.top = `${y + 14 + r.height > innerHeight ? y - r.height - 10 : y + 14}px`;
}
const hideTip = () => { tip.hidden = true; };
function tipOn(el, html) {
  el.addEventListener('pointermove', (e) => showTip(html(), e.clientX, e.clientY));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip(html(), r.right, r.top); });
  el.addEventListener('blur', hideTip);
}

/* ------------------------------------------- HealthBench against size */

// label offsets (px) and x nudges, after OFF_PAPER / the nudges in healthbench/plot_healthbench_figures.py
const OFF = {
  base_gemma3_4b_it: [-4, -14, 'start'], ref_medgemma4b: [0, -12, 'middle'],
  base_llama31_8b_instruct: [-10, 4, 'end'], ref_aloe_beta_8b: [-10, 14, 'end'],
  meditronFO_gptoss_8b: [0, -15, 'middle'], apertus8b_instruct: [-10, 4, 'end'],
  base_euro9b_instruct: [10, 6, 'start'], meditronFO_gptoss_euro9b: [11, 4, 'start'],
  meditronFO_gptoss_euro22b: [0, -15, 'middle'], base_euro22b_instruct: [-10, 4, 'end'],
  meditronFO_gptoss_gemma3_27b: [-10, -12, 'end'], base_gemma3_27b_it: [-9, 15, 'end'],
  base_medgemma27b: [11, 4, 'start'],
  meditronFO_gptoss_olmo32b: [11, 4, 'start'], base_olmo32b_sft: [-10, 4, 'end'],
  meditronFO_gptoss_70b_16n: [-11, -8, 'end'], apertus70b_instruct: [-10, 4, 'end'],
  ref_aloe_beta_70b: [-10, 4, 'end'], base_llama31_70b_instruct: [-10, 4, 'end'],
  ref_gptoss_120b: [0, 18, 'middle'],
};
const NUDGE = { base_medgemma27b: 1.08, base_gemma3_27b_it: 0.95, ref_aloe_beta_8b: 0.88, base_llama31_8b_instruct: 0.88,
  ref_aloe_beta_70b: 0.86, base_llama31_70b_instruct: 0.86 };

function star(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    p.push(`${fmt(cx + rr * Math.cos(a), 2)},${fmt(cy + rr * Math.sin(a), 2)}`);
  }
  return `<polygon class="mk" points="${p.join(' ')}"/>`;
}

let hbView = 'ours';
function drawHB(points) {
  const root = document.getElementById('hb-chart');
  const W = root.clientWidth, narrow = W < 560;
  const H = narrow ? 380 : 440, m = { l: narrow ? 40 : 58, r: narrow ? 6 : 16, t: 18, b: 50 };
  const finetuned = new Set(points.filter((p) => p.finetune).flatMap((p) => [p.run, p.finetune]));
  const shown = points.filter((p) => hbView === 'all' || finetuned.has(p.run) || p.run === 'base_medgemma27b');
  const [x0, x1] = hbView === 'all' ? [3, 140] : [5.2, 88];
  const [y0, y1] = [15, 63];
  const X = (v) => m.l + ((Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0))) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const px = (p) => X(p.params * (NUDGE[p.run] || 1));
  const byRun = Object.fromEntries(points.map((p) => [p.run, p]));

  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  for (let v = 20; v <= 60; v += 10) {
    s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${m.l - 10}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  s += `<path class="axis" d="M${m.l},${m.t}V${H - m.b}H${W - m.r}" fill="none"/>`;
  const ticks = [...new Set(shown.map((p) => p.params))].sort((a, b) => a - b)
    .filter((v) => !narrow || [4, 8, 27, 70, 117].includes(v) || (hbView === 'ours' && [22].includes(v)));
  ticks.forEach((v) => { s += `<text class="tick" x="${X(v)}" y="${H - m.b + 20}" text-anchor="middle">${v}B</text>`; });
  s += `<text class="axlab" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Parameters (log scale)</text>`;
  s += `<text class="axlab" transform="translate(${narrow ? 11 : 16},${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">Score (%)</text>`;

  // the best model of each openness at or below each size, as straight segments (the paper's frontier lines)
  ['fully', 'weights'].forEach((o) => {
    let best = -1;
    const front = shown.filter((p) => p.open === o).sort((a, b) => a.params - b.params || b.score - a.score)
      .filter((p) => p.score > best && (best = p.score) >= 0);
    if (front.length > 1) {
      s += `<polyline class="front" stroke="${o === 'fully' ? 'var(--c-fully)' : 'var(--c-weights)'}" points="${
        front.map((p) => `${px(p)},${Y(p.score)}`).join(' ')}"/>`;
    }
  });

  // base -> finetune arrows (Gemma-3-27B gains too little for one, as in the paper)
  s += '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--c-arrow)"/></marker></defs>';
  shown.filter((p) => p.finetune && byRun[p.finetune]).forEach((b) => {
    const f = byRun[b.finetune];
    if (f.score - b.score > 2) s += `<line x1="${px(b)}" y1="${Y(b.score) - 7}" x2="${px(f)}" y2="${Y(f.score) + 9}" stroke="var(--c-arrow)" stroke-width="2" marker-end="url(#ah)"/>`;
  });

  const labelled = (p) => p.role === 'fo' || p.run === 'base_medgemma27b' || p.run === 'ref_gptoss_120b' || !narrow;
  shown.forEach((p) => {
    const x = px(p), y = Y(p.score), c = p.open === 'fully' ? 'var(--c-fully)' : 'var(--c-weights)';
    const ours = finetuned.has(p.run) || p.run === 'base_medgemma27b';
    s += `<g class="pt${hbView === 'all' && !ours ? ' dim' : ''}" tabindex="0" data-run="${p.run}" fill="${c}">`;
    s += `<line x1="${x}" x2="${x}" y1="${Y(p.ci[0])}" y2="${Y(p.ci[1])}" stroke="var(--c-ci)" stroke-width="1.5"/>`;
    s += (p.role === 'fo' || p.role === 'med') ? star(x, y, p.role === 'fo' ? 10 : 8.5) : `<circle class="mk" cx="${x}" cy="${y}" r="6"/>`;
    s += `<circle class="hit" cx="${x}" cy="${y}" r="14"/>`;
    if (labelled(p)) {
      let [dx, dy, a] = OFF[p.run] || [10, 4, 'start'];
      if (narrow && p.role === 'fo') [dx, dy, a] = [0, p.run === 'meditronFO_gptoss_euro22b' ? -27 : -15, 'middle'];
      if (narrow && x + dx > W - 60 && a !== 'end') [dx, a] = [-10, 'end'];
      if (narrow && x < 90 && a === 'middle') a = 'start';
      const name = narrow ? p.model.replace('-MeditronFO', '-FO') : p.model;
      s += `<text class="lbl${p.role === 'fo' ? ' fo' : ''}${hbView === 'all' && !ours ? ' dim' : ''}" x="${x + dx}" y="${y + dy}" text-anchor="${a}">${esc(name)}</text>`;
    }
    s += '</g>';
  });
  root.innerHTML = s + '</svg>';

  root.querySelectorAll('.pt').forEach((g) => {
    const p = byRun[g.dataset.run];
    const base = points.find((b) => b.finetune === p.run);
    tipOn(g, () => `<b>${esc(p.model)}</b><div class="row"><span>HealthBench</span><span>${fmt(p.score)}%</span></div>
      <div class="row"><span>95% interval</span><span>${fmt(p.ci[0])}–${fmt(p.ci[1])}</span></div>
      ${base ? `<div class="row"><span>Gain over base</span><span>+${fmt(p.score - base.score)}</span></div>` : ''}
      <div class="row"><span>Parameters</span><span>${p.params}B</span></div>
      <div class="row"><span>Openness</span><span>${p.open === 'fully' ? 'Fully-open' : 'Open-weight'}</span></div>`);
  });
}

function hbTable(points) {
  const rows = [...points].sort((a, b) => b.score - a.score).map((p) => `<tr class="${p.role === 'fo' ? 'ours' : ''}">
    <th scope="row">${esc(p.model)}</th><td>${p.params}B</td><td>${p.open === 'fully' ? 'Fully-open' : 'Open-weight'}</td>
    <td>${fmt(p.score)}</td><td>${fmt(p.ci[0])}–${fmt(p.ci[1])}</td></tr>`).join('');
  document.getElementById('hb-table').innerHTML = `<table class="m-table"><thead><tr><th scope="col">Model</th><th scope="col">Size</th>
    <th scope="col">Openness</th><th scope="col">HealthBench</th><th scope="col">95% interval</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ------------------------------------------------- benchmark table */

const GROUPS = [['Fully-open', ['Apertus-70B-Instruct', 'OLMo-2-32B-SFT', 'EuroLLM-22B-Instruct']],
  ['Small fully-open', ['Apertus-8B-Instruct', 'EuroLLM-9B-Instruct']], ['Open-weight', ['Gemma-3-27B-IT', 'MedGemma-27B']]];
const COLS = [['medmcqa', 'MedMCQA'], ['medqa', 'MedQA'], ['pubmedqa', 'PubMedQA'], ['medxpertqa', 'MedXpertQA'],
  ['healthbench', 'HealthBench'], ['avg5', 'Avg']];

function benchTable(rows) {
  const best = Object.fromEntries(COLS.map(([k]) => [k, Math.max(...rows.map((r) => r[k]))]));
  const byName = Object.fromEntries(rows.map((r) => [r.model, r]));
  const cell = (r, k) => {
    const v = k === 'avg5' ? fmt(r[k], 2) : fmt(r[k]);
    const d = r.base && k === 'avg5' ? r[k] - byName[r.base][k] : null;
    return `<td class="${k === 'avg5' ? 'avg' : ''}">${r[k] === best[k] ? `<b>${v}</b>` : v}${
      d !== null ? `<span class="delta${d > 0 ? ' up' : ''}">${d > 0 ? '+' : ''}${fmt(d, 2)}</span>` : ''}</td>`;
  };
  const row = (r) => `<tr class="${r.role === 'fo' ? 'ours' : 'base'}"><th scope="row">${esc(r.model)}</th>
    ${COLS.map(([k]) => cell(r, k)).join('')}
    <td>${r.mcqa_gain ? `${r.mcqa_gain[0] > 0 ? '+' : ''}${fmt(r.mcqa_gain[0], 2)}<span class="ci">[${fmt(r.mcqa_gain[1])}, ${fmt(r.mcqa_gain[2])}]</span>` : ''}</td></tr>`;
  let body = '';
  GROUPS.forEach(([title, bases]) => {
    body += `<tr class="grp"><th colspan="${COLS.length + 2}" scope="rowgroup">${title}</th></tr>`;
    bases.forEach((b) => { body += row(byName[b]); rows.filter((r) => r.base === b).forEach((r) => { body += row(r); }); });
  });
  document.getElementById('bench-table').innerHTML = `<thead><tr><th scope="col">Model</th>${
    COLS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}<th scope="col">MCQ gain</th></tr></thead><tbody>${body}</tbody>`;
}

/* ------------------------------------------------- AutoMOOVE win rates */

function amChart(rows) {
  const root = document.getElementById('am-chart');
  const vsBase = rows.filter((r) => r.against !== 'MedGemma-27B');
  const order = ['Gemma-3-27B-MeditronFO', 'Gemma-3-27B-IT', 'Apertus-70B-MeditronFO', 'Apertus-70B-Instruct'];
  const vsMed = order.map((n) => rows.find((r) => r.model === n && r.against === 'MedGemma-27B'));
  const line = (r) => {
    const base = !r.model.includes('MeditronFO'), open = r.model.startsWith('Gemma') ? 'weights' : 'fully';
    const [w, lo, hi] = r.majority;
    return `<div class="m-row${base ? ' base' : ''}" role="listitem" tabindex="0" data-i="${rows.indexOf(r)}"
      aria-label="${esc(r.model)} against ${esc(r.against)}: wins ${fmt(w)}% of vignettes">
      <span class="who">${esc(r.model)}<small>vs ${esc(r.against)}</small></span>
      <span class="track"><span class="mid"></span><span class="ci" style="left:${lo}%;width:${hi - lo}%"></span>
      <span class="dot ${open}" style="left:${w}%"></span></span><span class="val">${Math.round(w)}%</span></div>`;
  };
  root.innerHTML = `<p class="grp">Against the model it started from</p>${vsBase.map(line).join('')}
    <p class="grp">Against MedGemma-27B, next to the starting model</p>${vsMed.map(line).join('')}
    <div class="m-axis" aria-hidden="true"><span></span><span class="ticks"><span style="left:0">0%</span><span style="left:50%">50%</span><span style="left:100%">100%</span></span><span></span></div>`;
  root.querySelectorAll('.m-row').forEach((el) => {
    const r = rows[+el.dataset.i];
    const ci = (v) => `${fmt(v[0])}% <span style="opacity:.7">[${fmt(v[1])}–${fmt(v[2])}]</span>`;
    tipOn(el, () => `<b>${esc(r.model)}</b> vs ${esc(r.against)}
      <div class="row"><span>Gemma-4: win / tie / loss</span><span>${r.win} / ${r.tie} / ${r.loss}</span></div>
      <div class="row"><span>Gemma-4-31B</span><span>${ci(r.gemma4)}</span></div>
      <div class="row"><span>Qwen3.8-27B</span><span>${ci(r.qwen38)}</span></div>
      <div class="row"><span>Muse-Glimmer-30B</span><span>${ci(r.muse)}</span></div>
      <div class="row"><span>Majority of three</span><span>${ci(r.majority)}</span></div>`);
  });
}

/* ------------------------------------------- the five cases, inline */

function renderText(text) {
  return text.split(/\n+/).map((line) => {
    line = line.trim();
    if (!line) return '';
    const bullet = /^[*-]\s+/.test(line);
    let h = esc(line.replace(/^[*-]\s+/, '').replace(/^#+\s*/, ''));
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>');
    return bullet ? `<p class="li">${h}</p>` : `<p>${h}</p>`;
  }).join('');
}

function game(root, { rounds, meta }) {
  const picks = [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  const word = (p) => (p === 'tie' ? 'Equally good' : `Answer ${p}`);
  const progress = (i) => `<div class="game-progress" aria-label="Case ${Math.min(i + 1, rounds.length)} of ${rounds.length}">${
    rounds.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div>`;
  const answerBox = (r, side, revealed) => {
    const isClin = revealed && r.clinician_pick === side;
    const text = r[side.toLowerCase()];
    return `<div class="answer ${isClin ? 'clin' : ''}"><h4><span>Answer ${side} ${isClin ? '<span class="badge">Clinicians\' pick</span>' : ''}</span>
      <small>${text.split(/\s+/).length} words</small></h4>${renderText(text)}</div>`;
  };

  function round(i, pick) {
    const r = rounds[i], revealed = pick !== undefined;
    const n = r.clinicians.A + r.clinicians.B + r.clinicians.tie, clinN = r.clinicians[r.clinician_pick];
    const youOk = pick === r.clinician_pick, judgeOk = r.judge_pick === r.clinician_pick, last = i === rounds.length - 1;
    root.innerHTML = `${progress(i)}
      <p class="case-setting">Case ${i + 1} of ${rounds.length}: ${esc(r.setting)}</p>
      <div class="case-q">${esc(r.question)}</div>
      <div class="answers">${answerBox(r, 'A', revealed)}${answerBox(r, 'B', revealed)}</div>
      ${revealed ? `<div class="verdicts" aria-live="polite">
          <div class="verdict"><span class="verdict-who">You</span><span class="verdict-what">${word(pick)} <span class="${youOk ? 'match' : 'miss'}">${youOk ? 'Same as the clinicians' : 'Not the clinicians\' pick'}</span></span></div>
          <div class="verdict"><span class="verdict-who">Clinicians</span><span class="verdict-what">Answer ${r.clinician_pick}, ${clinN === n ? `all ${n}` : `${clinN} of ${n}`} of them</span></div>
          <div class="verdict"><span class="verdict-who">AI judge</span><span class="verdict-what">${word(r.judge_pick)} <span class="${judgeOk ? 'match' : 'miss'}">${judgeOk ? 'Same as the clinicians' : 'Not the clinicians\' pick'}</span>
            <span class="conf" aria-hidden="true"><span class="ca" style="width:${pct(r.judge_prob.A)}"></span><span class="ct" style="width:${pct(r.judge_prob.tie)}"></span><span class="cb" style="width:${pct(r.judge_prob.B)}"></span></span>
            <span class="conf-key">How sure it was: A ${pct(r.judge_prob.A)}, equal ${pct(r.judge_prob.tie)}, B ${pct(r.judge_prob.B)}</span></span></div>
        </div>
        <p class="case-note">${esc(r.note)}</p>
        <div class="game-actions"><button type="button" class="game-btn primary" data-act="${last ? 'end' : 'next'}">${last ? 'See how you did' : 'Next case'}</button></div>`
      : `<div class="vote" role="group" aria-label="Which answer is better?">
          <button type="button" data-pick="A">A is better</button><button type="button" data-pick="tie">Equally good</button><button type="button" data-pick="B">B is better</button></div>`}`;
  }

  function end() {
    const you = rounds.map((r, i) => picks[i] === r.clinician_pick), judge = rounds.map((r) => r.judge_pick === r.clinician_pick);
    const row = (label, hits) => `<div class="tally-row"><span class="verdict-who">${label}</span><span class="tally">${
      hits.map((h, k) => `<span class="${h ? 'hit' : ''}" title="Case ${k + 1}: ${h ? 'matched' : 'missed'}">${k + 1}</span>`).join('')}</span></div>`;
    root.innerHTML = `<div class="game-narrow">${progress(rounds.length)}
      <h4>You matched the clinicians on ${you.filter(Boolean).length} of ${rounds.length}</h4>
      ${row('You', you)}${row('AI judge', judge)}
      <p>The judge matched them on ${judge.filter(Boolean).length} of these ${rounds.length}. Across all ${meta.n_pairs} pairs where every clinician agreed, it matches them ${meta.judge_agree} times: ${Math.round(100 * meta.judge_agree / meta.n_pairs)}%.</p>
      <div class="game-actions"><button type="button" class="game-btn" data-act="again">Play again</button></div></div>`;
  }

  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = picks.length - (b.dataset.pick ? 0 : 1);
    if (b.dataset.pick) { picks.push(b.dataset.pick); round(i, b.dataset.pick); }
    else if (b.dataset.act === 'next') { round(i + 1); root.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
    else if (b.dataset.act === 'end') end();
    else if (b.dataset.act === 'again') { picks.length = 0; round(0); }
  };
  round(0);
}

/* --------------------------------------------------------------- cite */

document.getElementById('cite-copy').onclick = async (e) => {
  try {
    await navigator.clipboard.writeText(document.getElementById('cite-bibtex').textContent);
    e.target.textContent = 'Copied';
  } catch { e.target.textContent = 'Select and copy'; }
  setTimeout(() => { e.target.textContent = 'Copy BibTeX'; }, 2000);
};

/* ------------------------------------------------------------- load */

(async () => {
  try {
    const d = await (await fetch('data.json')).json();
    drawHB(d.healthbench);
    hbTable(d.healthbench);
    benchTable(d.benchmarks);
    amChart(d.automoove);
    document.querySelectorAll('[data-hb]').forEach((b) => b.addEventListener('click', () => {
      hbView = b.dataset.hb;
      document.querySelectorAll('[data-hb]').forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
      drawHB(d.healthbench);
    }));
    let w = innerWidth;
    addEventListener('resize', () => { if (innerWidth !== w) { w = innerWidth; drawHB(d.healthbench); } });
  } catch {
    document.getElementById('hb-chart').textContent = 'The results did not load. Reload the page to try again.';
  }
  const g = document.getElementById('game');
  try { game(g, await (await fetch('../static/data/clinician_rounds.json')).json()); }
  catch { g.textContent = 'The cases did not load. Reload the page to try again.'; }
})();

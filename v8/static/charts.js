/* Shared by the main page and the MeditronFO page: the helpers, the tooltip and the HealthBench chart.
   The chart's points are healthbench in meditronfo/data.json. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 1) => x.toFixed(d);

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

function drawHB(points, hbView) {
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

// The chart, its table and its two views, in #hb-chart, #hb-table and the [data-hb] buttons.
function showHealthBench(points) {
  let view = 'ours', w = innerWidth;
  drawHB(points, view);
  hbTable(points);
  document.querySelectorAll('[data-hb]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.hb;
    document.querySelectorAll('[data-hb]').forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
    drawHB(points, view);
  }));
  addEventListener('resize', () => { if (innerWidth !== w) { w = innerWidth; drawHB(points, view); } });
}

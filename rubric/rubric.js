// Rubric reward viewer: untrained Llama-3.1-8B vs one GRPO checkpoint, per question and per criterion.
// merged.json = 10-08 run (its own 58 questions); rubric.json = rubric-design checks (64 questions, one entry per checkpoint).
// The question texts are not published (MOOVE data): a question is shown by its number and theme labels.
const CKPTS = [
  { key: 'merged', file: 'merged.json', label: 'Merged', step: 'step 180',
    note: 'Run 3616573: the criteria of every theme that applies, equal points, with the length term. 58 training questions (ICRC left out), checked 10-08.' },
  { key: 'primary', file: 'rubric.json', label: 'Primary theme', step: 'step 50',
    note: 'Run 3636913: trained on the criteria of one theme per question (HealthBench style), with the length term. Graded here on the merged criteria; 64 training questions, checked 10-11.' },
  { key: 'aspects', file: 'rubric.json', label: 'Aspects', step: 'step 60',
    note: 'Run 3636914: merged criteria, points set so each aspect weighs the same, with the length term. Graded here on the merged criteria; 64 training questions, checked 10-11.' },
  { key: 'nolen', file: 'rubric.json', label: 'Aspects, no length term', step: 'step 60',
    note: 'Run 3640084: as aspects, without the length term. Graded here on the merged criteria; 64 training questions, checked 10-12. Its answers later grow to ~1,750 tokens by step 200.' },
];

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const f2 = x => x.toFixed(2);
const sgn = x => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const THEMES = ['emergency_referrals', 'context_seeking', 'hedging', 'communication', 'global_health', 'complex_responses', 'health_data_tasks'];
function splitCluster(c) {
  const th = THEMES.find(t => c.startsWith(t + '_')) || '';
  const rest = c.slice(th.length + 1);
  return { theme: th.replace(/_/g, ' '), rest: rest.replace(/_/g, ' · ').replace(/-/g, ' ') };
}

const state = { ckpt: 'merged', q: null, bSel: 0, aSel: 0, csort: 'orig', sort: 'hack', tab: 'answers' };
try { Object.assign(state, JSON.parse(localStorage.getItem('rubric-viewer') || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem('rubric-viewer', JSON.stringify(state)); } catch (e) {} };

const files = {};
const fetchJSON = f => files[f] || (files[f] = fetch(f).then(r => r.json()));
let D = [], C = CKPTS[0];

async function setCkpt(key) {
  C = CKPTS.find(c => c.key === key) || CKPTS[0];
  state.ckpt = C.key;
  const raw = await fetchJSON(C.file);
  D = raw.map((q, i) => {
    const step = q.runs ? q.runs[C.key] : q.step;
    const o = { ...q, step, i, all: q.base.concat(step).map(a => a.text).join('\n').toLowerCase() };
    o.bS = mean(q.base.map(a => a.score)); o.aS = mean(step.map(a => a.score));
    o.bG = mean(q.base.map(a => a.gemma)); o.aG = mean(step.map(a => a.gemma));
    o.bT = mean(q.base.map(a => a.tokens)); o.aT = mean(step.map(a => a.tokens));
    o.bR = mean(q.base.map(a => a.reward)); o.aR = mean(step.map(a => a.reward));
    o.dS = o.aS - o.bS; o.dG = o.aG - o.bG; o.hack = o.dS - o.dG;
    return o;
  });
  let cur = D.findIndex(q => q.id === state.q);
  if (cur < 0) { cur = D.findIndex(q => /dog bite|bitten by a dog/.test(q.all)); if (cur < 0) cur = 0; state.bSel = 0; state.aSel = 0; }
  state.q = D[cur].id;
  save();
  renderSeg(); renderTiles(); renderList(); renderQ();
}

function renderSeg() {
  document.getElementById('ckptSeg').innerHTML = CKPTS.map(c =>
    `<button data-k="${c.key}" aria-pressed="${c.key === C.key}">${esc(c.label)}<small>${c.step}</small></button>`).join('');
  document.getElementById('ckptNote').textContent = C.note;
}
document.getElementById('ckptSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b && b.dataset.k !== C.key) setCkpt(b.dataset.k);
});

function renderTiles() {
  const all = k => mean(D.map(q => q[k]));
  const tile = (k, b, a, fmt = f2) =>
    `<div class="tile"><div class="k">${k}</div><div class="v"><span class="b">${fmt(b)}</span> → <span class="a">${fmt(a)}</span></div></div>`;
  document.getElementById('tiles').innerHTML =
    tile('Reward (Plumb + length term)', all('bR'), all('aR')) +
    tile('Plumb-4B score (RL judge)', all('bS'), all('aS')) +
    tile('Gemma-4 score (not trained on)', all('bG'), all('aG')) +
    tile('Answer length, tokens', all('bT'), all('aT'), x => Math.round(x).toString()) +
    `<div class="tile"><div class="k">Questions where Gemma-4 drops</div><div class="v">${D.filter(q => q.dG < 0).length} / ${D.length}</div></div>`;
}

const qsEl = document.getElementById('qs'), searchEl = document.getElementById('search'), sortEl = document.getElementById('sort');
sortEl.value = state.sort;
function renderList() {
  const term = searchEl.value.trim().toLowerCase();
  const key = { hack: q => -q.hack, plumb: q => -q.dS, gemma: q => q.dG, len: q => q.aT - q.bT, orig: q => q.i }[sortEl.value];
  const list = D.filter(q => !term || q.all.includes(term)).sort((x, y) => key(x) - key(y));
  qsEl.innerHTML = list.map(q => `<button class="q" data-i="${q.i}" aria-current="${q.id === state.q}">
      <span class="t"><b>Question ${q.i + 1}</b> · ${esc(summary(q))}</span>
      <span class="d"><span class="${q.dS >= 0 ? 'up' : 'down'}">${sgn(q.dS)}</span><small>Plumb</small></span>
      <span></span>
      <span class="d"><span class="${q.dG >= 0 ? 'up' : 'down'}">${sgn(q.dG)}</span><small>Gemma</small></span>
    </button>`).join('') || '<p style="padding:10px;color:var(--muted)">No question matches.</p>';
}
qsEl.addEventListener('click', e => {
  const b = e.target.closest('.q'); if (!b) return;
  state.q = D[+b.dataset.i].id; state.bSel = 0; state.aSel = 0; save(); renderList(); renderQ();
});
searchEl.addEventListener('input', renderList);
sortEl.addEventListener('change', () => { state.sort = sortEl.value; save(); renderList(); });

const summary = q => [q.labels.communication, q.labels.emergency_referrals, q.labels.complex_responses]
  .filter(v => v && v !== 'not_applicable').map(v => v.replace(/[-_]/g, ' ')).join(' · ');
const heat = p => `rgba(var(--heat), ${(0.06 + 0.6 * p).toFixed(3)})`;
function renderQ() {
  const q = D.find(x => x.id === state.q);
  const stepName = `${C.label}, ${C.step}`;
  const labels = Object.entries(q.labels).filter(([, v]) => v && v !== 'not_applicable')
    .map(([k, v]) => `<span class="chip">${k.replace(/_/g, ' ')}: <b>${esc(v.replace(/[-_]/g, ' '))}</b></span>`).join('');
  document.getElementById('qcard').innerHTML = `<div class="sec-h"><h2>Question ${q.i + 1}</h2>
      <span class="note">Plumb <span class="b">${f2(q.bS)}</span> → <span class="a">${f2(q.aS)}</span> ·
      Gemma-4 <span class="b">${f2(q.bG)}</span> → <span class="a">${f2(q.aG)}</span> ·
      tokens <span class="b">${Math.round(q.bT)}</span> → <span class="a">${Math.round(q.aT)}</span></span></div>
    <p class="qhidden">The MOOVE question text is not published here; Gemma-4's labels of it below.</p><div class="chips">${labels}</div>`;

  const nb = q.base.length, na = q.step.length;
  state.bSel = Math.min(state.bSel, nb - 1); state.aSel = Math.min(state.aSel, na - 1);
  let rows = q.criteria.map((c, k) => ({ c, b: q.base.map(a => a.p[k]), a: q.step.map(a => a.p[k]) }));
  rows.forEach(r => r.d = mean(r.a) - mean(r.b));
  if (state.csort === 'delta') rows = rows.slice().sort((x, y) => y.d - x.d);
  const colH = (side, j) => `<th class="col ${side === 'b' ? (j === state.bSel ? 'sel-b' : '') : (j === state.aSel ? 'sel-a' : '')}" data-side="${side}" data-j="${j}" tabindex="0" title="Read this answer">#${j + 1}</th>`;
  let h = `<thead><tr><th rowspan="2" style="text-align:left">Criterion</th>
      <th class="grp b" colspan="${nb}">Untrained</th><th class="grp a" colspan="${na}">${esc(stepName)}</th><th rowspan="2" style="text-align:right">Δ mean</th></tr>
      <tr>${q.base.map((_, j) => colH('b', j)).join('')}${q.step.map((_, j) => colH('a', j)).join('')}</tr></thead><tbody>`;
  for (const r of rows) {
    const cl = splitCluster(r.c.cluster);
    const first = r.c.text.split('\n')[0].replace(/^- /, '');
    const cell = (p, side, j) => `<td class="p ${side === 'b' && j === state.bSel ? 'sel-b' : ''}${side === 'a' && j === state.aSel ? 'sel-a' : ''}" style="background:${heat(p)}" title="P(met) = ${p.toFixed(3)}">${f2(p)}</td>`;
    h += `<tr><td class="crit"><details><summary><div class="th">${esc(cl.theme)} · ${esc(cl.rest)}</div>
        <div class="short">${esc(first)}${r.c.text.includes('\n') ? ' …' : ''}</div></summary><div class="tx">${esc(r.c.text)}</div></details></td>
      ${r.b.map((p, j) => cell(p, 'b', j)).join('')}${r.a.map((p, j) => cell(p, 'a', j)).join('')}
      <td class="delta ${r.d >= 0 ? 'up' : 'down'}">${sgn(r.d)}</td></tr>`;
  }
  const sumRow = (lbl, key, fmt = f2, cls = '') => `<tr class="sum ${cls}"><td class="lbl">${lbl}</td>${q.base.map(a => `<td>${fmt(a[key])}</td>`).join('')}${q.step.map(a => `<td>${fmt(a[key])}</td>`).join('')}<td></td></tr>`;
  h += sumRow('Plumb score', 'score', f2, 'first') + sumRow('Reward (+ length)', 'reward') + sumRow('Gemma-4 score', 'gemma') + sumRow('Tokens', 'tokens', x => x) + '</tbody>';
  document.getElementById('grid').innerHTML = h;

  const A = (side, a, j) => `<div class="ans ${side}"><h3>${side === 'b' ? 'Untrained' : esc(stepName)} · answer #${j + 1}</h3>
      <div class="meta">Plumb ${f2(a.score)} · reward ${f2(a.reward)} · Gemma-4 ${f2(a.gemma)} · ${a.tokens} tokens</div>
      <div class="body">${esc(a.text)}</div></div>`;
  document.getElementById('answers').innerHTML = A('b', q.base[state.bSel], state.bSel) + A('a', q.step[state.aSel], state.aSel);
}
function pick(th) {
  if (th.dataset.side === 'b') state.bSel = +th.dataset.j; else state.aSel = +th.dataset.j;
  save(); renderQ();
}
const grid = document.getElementById('grid');
grid.addEventListener('click', e => { const th = e.target.closest('th.col'); if (th) pick(th); });
grid.addEventListener('keydown', e => { const th = e.target.closest('th.col'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(th); } });
function setCsort(id) {
  state.csort = id; save();
  document.getElementById('cs-orig').setAttribute('aria-pressed', id === 'orig');
  document.getElementById('cs-delta').setAttribute('aria-pressed', id === 'delta');
}
for (const id of ['orig', 'delta']) document.getElementById('cs-' + id).addEventListener('click', () => { setCsort(id); renderQ(); });
setCsort(state.csort);

// ---- criteria overlap view (from the merged run) ----
const ASP_LABEL = { accuracy: 'factual accuracy', complete: 'complete / helpful', concise: 'concise, no bulk', direct: 'answers directly',
  hedging: 'hedging', ask: 'must ask for context', ask_if_needed: 'ask if needed', no_ask: 'must not ask', referral: 'emergency referral',
  tailored: 'tailored to user', language: 'language', format_requested: 'follows requested format' };
const short = t => t.replace('emergency_referrals', 'emergency').replace('context_seeking', 'context').replace('complex_responses', 'complexity')
  .replace('global_health', 'global health').replace('health_data_tasks', 'data tasks');
fetchJSON('overlap.json').then(O => {
  document.getElementById('ov-n').textContent = O.n_questions.toLocaleString('en');
  const maxShare = Math.max(...Object.values(O.share));
  document.getElementById('ov-bars').innerHTML = O.aspects.map(a => `<div class="obar"><span>${ASP_LABEL[a]}</span>
    <span class="track"><span class="fill ${a === 'accuracy' ? 'warn' : ''}" style="width:${(100 * O.share[a] / maxShare).toFixed(1)}%"></span></span>
    <span class="num">${(100 * O.share[a]).toFixed(1)}% · ${O.count[a].toFixed(1)}/q</span></div>`).join('') +
    `<div class="obar"><span>formatting (unrequested)</span><span class="track"></span><span class="num">0.0% · none</span></div>`;

  let open = null;
  const table = document.getElementById('ov-table');
  function renderTable() {
    let h = `<thead><tr><th style="text-align:left">Criterion</th>${O.aspects.map(a => `<th class="asp">${ASP_LABEL[a]}</th>`).join('')}
      <th>% of Qs</th><th>Base → step 180</th></tr></thead><tbody>`;
    let cur = '';
    for (const c of O.criteria) {
      if (c.theme !== cur) { cur = c.theme; h += `<tr class="th-row"><td colspan="${O.aspects.length + 3}">${cur.replace(/_/g, ' ')}</td></tr>`; }
      const bs = c.base == null ? '—' : `<span class="b">${f2(c.base)}</span> → <span class="a">${f2(c.step)}</span>`;
      h += `<tr class="crow" data-id="${c.id}"><td>${esc(c.rest.replace(/_/g, ' · ').replace(/-/g, ' '))} ${c.nhp ? '<span class="flag">lay user</span>' : ''}</td>
        ${O.aspects.map(a => `<td class="dot">${c.aspects.includes(a) ? '●' : ''}</td>`).join('')}
        <td class="num">${(100 * c.use).toFixed(0)}%</td><td class="num">${bs}</td></tr>`;
      if (open === c.id) h += `<tr class="full"><td colspan="${O.aspects.length + 3}">${esc(c.text)}</td></tr>`;
    }
    table.innerHTML = h + '</tbody>';
  }
  table.addEventListener('click', e => { const r = e.target.closest('tr.crow'); if (!r) return; open = open === r.dataset.id ? null : r.dataset.id; renderTable(); });
  renderTable();

  const thOf = id => O.criteria.find(c => c.id === id).theme;
  const TH = [...new Set(O.criteria.map(c => c.theme))];
  const acc = {};
  for (const p of O.corr) {
    const a = thOf(p.a), b = thOf(p.b);
    for (const k of [a + '|' + b, b + '|' + a]) { acc[k] = acc[k] || [0, 0]; acc[k][0] += p.r * p.n; acc[k][1] += p.n; }
  }
  let hh = `<tr><th></th>${TH.map(t => `<th>${short(t)}</th>`).join('')}</tr>`;
  for (const a of TH) {
    hh += `<tr><th class="rh">${short(a)}</th>` + TH.map(b => {
      const v = acc[a + '|' + b]; if (!v) return '<td>—</td>';
      const r = v[0] / v[1];
      const bg = r >= 0 ? `rgba(var(--heat), ${(0.06 + 0.7 * Math.min(r, 1)).toFixed(3)})` : 'transparent';
      return `<td style="background:${bg}" title="${a} × ${b}: r = ${r.toFixed(2)}">${r.toFixed(2)}</td>`;
    }).join('') + '</tr>';
  }
  document.getElementById('ov-heat').innerHTML = hh;
  const lab = id => { const c = O.criteria.find(x => x.id === id); return `${short(c.theme)}: ${c.rest.replace(/_/g, ' · ').replace(/-/g, ' ')}`; };
  document.getElementById('ov-pairs').innerHTML = O.corr.filter(p => thOf(p.a) !== thOf(p.b)).sort((x, y) => y.r - x.r).slice(0, 15)
    .map(p => `<li><b>${p.r.toFixed(2)}</b> ${esc(lab(p.a))} ~ ${esc(lab(p.b))} <span style="color:var(--muted)">(n=${p.n})</span></li>`).join('');
});

function showTab(t) {
  document.getElementById('overlap').hidden = t !== 'overlap';
  document.getElementById('answers-view').hidden = t === 'overlap';
  document.getElementById('tiles').hidden = t === 'overlap';
  document.getElementById('tab-answers').setAttribute('aria-pressed', t !== 'overlap');
  document.getElementById('tab-overlap').setAttribute('aria-pressed', t === 'overlap');
  state.tab = t; save();
}
document.getElementById('tab-answers').addEventListener('click', () => showTab('answers'));
document.getElementById('tab-overlap').addEventListener('click', () => showTab('overlap'));
showTab(location.hash === '#overlap' ? 'overlap' : state.tab);
setCkpt(location.hash.slice(1) && CKPTS.some(c => c.key === location.hash.slice(1)) ? location.hash.slice(1) : state.ckpt);

/* MeditronFO release page. data.json comes from meditron-4/website/meditronfo.py (the paper's tables and
   Figure 1); the five game cases are the main page's static/data/clinician_rounds.json. The helpers, the tooltip
   and the HealthBench chart are in ../static/charts.js. */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ dawn sky */

// The hero's sky: the dawn gradient, with the horizon just under the hero's buttons, and film grain.
(function dawn() {
  const canvas = document.getElementById('sky'), ctas = document.querySelector('.m-hero .m-ctas');
  if (!canvas || !ctas) return;
  const ctx = canvas.getContext('2d');
  let drawn = '';

  function draw() {
    const W = Math.round(canvas.clientWidth), H = Math.round(canvas.clientHeight);
    const horizon = Math.round(ctas.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 20);
    if (!W || !H || `${W}|${H}|${horizon}` === drawn) return;
    drawn = `${W}|${H}|${horizon}`;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = horizon / H, g = ctx.createLinearGradient(0, 0, 0, H);
    const root = getComputedStyle(document.documentElement);
    const paper = root.getPropertyValue('--paper').trim();   // the sky ends in the page
    [[0, '#0a1a44'], [0.38 * f, '#1d4096'], [0.66 * f, root.getPropertyValue('--dawn-low').trim()],
      [f, paper], [1, paper]].forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // film grain: grey specks over the blue, gone by the horizon
    const speck = document.createElement('canvas');
    speck.width = canvas.width; speck.height = canvas.height;
    const sctx = speck.getContext('2d'), img = sctx.createImageData(speck.width, speck.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = Math.random() * 255; d[i + 3] = 14; }
    sctx.putImageData(img, 0, 0);
    const fade = sctx.createLinearGradient(0, 0, 0, speck.height);
    fade.addColorStop(0.66 * f, '#000'); fade.addColorStop(f, 'transparent');
    sctx.globalCompositeOperation = 'destination-in';
    sctx.fillStyle = fade; sctx.fillRect(0, 0, speck.width, speck.height);
    ctx.drawImage(speck, 0, 0, W, H);
  }

  draw();
  document.fonts?.ready.then(draw);
  addEventListener('resize', draw);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawn = ''; draw(); });
})();

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
    showHealthBench(d.healthbench);
    benchTable(d.benchmarks);
    amChart(d.automoove);
  } catch {
    document.getElementById('hb-chart').textContent = 'The results did not load. Reload the page to try again.';
  }
  const g = document.getElementById('game');
  try { game(g, await (await fetch('../static/data/clinician_rounds.json')).json()); }
  catch { g.textContent = 'The cases did not load. Reload the page to try again.'; }
})();

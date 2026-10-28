// Meditron site: dithered globe, draggable folders, project panels, the AutoMOOVE game, chat.

// The chat goes through server/chat_server.py, which holds the RCP key and pins the
// model, temperature and token budget. The page only sends the conversation.
// Same origin by default; for a page hosted elsewhere, put the server's full URL here.
const CHAT = {
  endpoint: 'api/chat',
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------------------------------------------------------------- globe */

// Where the MOOVE events ran: city where the event is known, the capital otherwise.
// Counts are distinct questions and clinician votes per event, summed per place.
const SITES = [
  { at: [6.63, 46.52], name: 'CHUV, Lausanne', lines: ['3 events, Aug 2024 to Nov 2025', '758 questions, 5,086 clinician votes', 'Specialist hospital care'] },
  { at: [6.15, 46.20], name: 'HUG, Geneva', lines: ['1 event, Sep to Dec 2024', '320 questions, 1,704 clinician votes', 'Specialist hospital care'] },
  { at: [4.35, 50.85], name: 'Belgium', lines: ['1 event, Oct 2025', '108 questions, 126 clinician votes', 'Specialist hospital care'] },
  { at: [36.82, -1.29], name: 'Kenya', lines: ['3 events, May 2025 to Aug 2026', '712 questions, 2,923 clinician votes', 'Primary care'] },
  { at: [39.21, -6.79], name: 'Tanzania', lines: ['2 events, Dec 2025 to Jun 2026', '467 questions, 3,034 clinician votes', 'Primary care'] },
  { at: [33.79, -13.96], name: 'Malawi', lines: ['2 events, May to Jul 2026', '300 questions, 1,700 clinician votes', 'Primary care'] },
  { at: [38.74, 9.03], name: 'Ethiopia', lines: ['2 events, Mar to Apr 2026', '612 questions, 1,534 clinician votes', 'Primary care'] },
  { at: [77.59, 12.97], name: 'Bengaluru, India', lines: ['1 event, Jan to Mar 2026', '305 questions, 491 clinician votes', 'Specialist hospital care'] },
  { at: [78.49, 17.39], name: 'Hyderabad, India', lines: ['1 event, Jan to Feb 2026', '98 questions, 87 clinician votes', 'Specialist hospital care'] },
  { at: [77.02, 28.99], name: 'Ashoka University, India', lines: ['1 event, Jan to Apr 2026', '86 questions, 138 clinician votes', 'Specialist hospital care'] },
];

(function globe() {
  const canvas = document.getElementById('globe');
  const ctx = canvas.getContext('2d');
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  let land = null, size = 0, noise = null, out = null, ink = [12, 67, 160], marker = '#e08a12';
  let lon = -25, last = 0, visible = true, hovered = null, shown = [];

  const projection = d3.geoOrthographic().clipAngle(90).precision(0.5);
  const path = d3.geoPath(projection, mctx);

  function hexToRgb(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function readColors() { ink = hexToRgb(css('--globe-ink') || '#0c43a0'); marker = css('--marker') || '#e08a12'; }

  function resize() {
    const cssSize = canvas.getBoundingClientRect().width;
    // one buffer pixel per CSS pixel: fine stipple at any density
    const s = Math.max(160, Math.min(760, Math.round(cssSize)));
    if (s === size) return;
    size = s;
    canvas.width = canvas.height = mask.width = mask.height = size;
    projection.scale(size / 2 - 1).translate([size / 2, size / 2]);
    noise = new Float32Array(size * size);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
    out = ctx.createImageData(size, size);
  }

  function draw() {
    projection.rotate([lon, -12]);
    mctx.clearRect(0, 0, size, size);
    if (land) { mctx.beginPath(); path(land); mctx.fillStyle = '#000'; mctx.fill(); }
    const m = mctx.getImageData(0, 0, size, size).data;
    const o = out.data, c = size / 2, R = size / 2 - 1;
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5 - c) / R;
      for (let x = 0; x < size; x++) {
        const i = y * size + x, p = i * 4;
        const dx = (x + 0.5 - c) / R, r2 = dx * dx + dy * dy;
        if (r2 > 1) { o[p + 3] = 0; continue; }
        const nz = Math.sqrt(1 - r2);
        const shade = Math.max(0, -0.42 * dx - 0.5 * dy + 0.76 * nz);   // light from the upper left
        let v = m[p + 3] > 100 ? 0.3 + 0.7 * shade : 0.015 + 0.09 * shade * shade;
        if (r2 > 0.988) v = 0.85;                                          // crisp limb
        const on = v > noise[i];
        o[p] = ink[0]; o[p + 1] = ink[1]; o[p + 2] = ink[2]; o[p + 3] = on ? 255 : 0;
      }
    }
    ctx.putImageData(out, 0, 0);
    // event sites on the near side, as solid squares so they sit in the dither's pixel grid
    const center = [-lon, 12], d = Math.max(3, Math.round(size / 95));
    ctx.fillStyle = marker;
    shown = [];
    for (const s of SITES) {
      if (d3.geoDistance(s.at, center) > Math.PI / 2 - 0.08) continue;
      const [px, py] = projection(s.at);
      const k = s === hovered ? 2 * d : d;
      ctx.fillRect(Math.round(px - k / 2), Math.round(py - k / 2), k, k);
      shown.push({ s, px, py });
    }
    if (hovered) placeTip();
  }

  // A site's description follows its square as the globe turns, until the pointer moves off it or it turns out of view.
  const tip = document.createElement('div');
  tip.className = 'site-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  canvas.after(tip);

  function siteAt(e) {
    const r = canvas.getBoundingClientRect(), k = size / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    let best = null, bestD = 14 * k;
    for (const m of shown) {
      const dist = Math.hypot(m.px - x, m.py - y);
      if (dist < bestD) { best = m.s; bestD = dist; }
    }
    return best;
  }
  function hover(s) {
    if (s === hovered) return;
    hovered = s;
    canvas.style.cursor = s ? 'pointer' : '';
    if (s) tip.innerHTML = `<strong>${s.name}</strong>${s.lines.map((l) => `<span>${l}</span>`).join('')}`;
    tip.hidden = !s;
    draw();
  }
  function placeTip() {
    const m = shown.find((x) => x.s === hovered);
    if (!m) { hover(null); return; }
    const r = canvas.getBoundingClientRect(), h = canvas.parentElement.getBoundingClientRect(), k = r.width / size;
    tip.style.left = `${r.left - h.left + m.px * k}px`;
    tip.style.top = `${r.top - h.top + m.py * k}px`;
  }
  canvas.addEventListener('pointermove', (e) => hover(siteAt(e)));
  canvas.addEventListener('pointerdown', (e) => hover(siteAt(e)));
  canvas.addEventListener('pointerleave', () => hover(null));

  function frame(t) {
    if (visible && !document.hidden && t - last > 40) {
      lon += (t - last > 200 ? 0 : (t - last) * 0.006);
      last = t; draw();
    } else if (t - last > 200) last = t;
    requestAnimationFrame(frame);
  }

  readColors(); resize(); draw();
  addEventListener('resize', () => { resize(); draw(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  fetch('static/data/land-110m.json')
    .then((r) => r.json())
    .then((topo) => { land = topojson.feature(topo, topo.objects.land); draw(); })
    .catch(() => { /* plain dithered sphere if the map can't load */ });

  if (!reduceMotion) requestAnimationFrame(frame);
})();

/* -------------------------------------------------------------- folders */

(function folders() {
  const desktop = matchMedia('(min-width: 901px)');
  let top = 10;
  document.querySelectorAll('.folder').forEach((el) => {
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, down = false;
    el.addEventListener('pointerdown', (e) => {
      if (!desktop.matches || e.button !== 0) return;
      down = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      ox = parseFloat(el.style.getPropertyValue('--x')) || 0;
      oy = parseFloat(el.style.getPropertyValue('--y')) || 0;
      el.style.zIndex = ++top;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; el.classList.add('dragging');
      el.style.setProperty('--x', `${ox + dx}px`);
      el.style.setProperty('--y', `${oy + dy}px`);
    });
    const end = () => { down = false; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // click also fires for Enter/Space; a drag that just ended is not a click
    el.addEventListener('click', () => {
      if (moved) { moved = false; return; }
      location.hash = el.dataset.open;
    });
  });
})();

/* ---------------------------------------------------------------- panel */

const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const panelTitle = document.getElementById('panel-title');

// The two leaderboard folders open the same page, each on its own board.
const BOARD_PAGES = {
  'swiss-moove': { board: 'chuv', title: 'Swiss MOOVE results' },
  'east-africa-moove': { board: 'phc', title: 'East Africa MOOVE results' },
};
const templateFor = (name) => document.getElementById(`tpl-${BOARD_PAGES[name] ? 'leaderboards' : name}`);

function route() {
  const name = location.hash.slice(1);
  const tpl = templateFor(name);
  if (!tpl) { if (panel.open) panel.close(); return; }
  panelTitle.textContent = BOARD_PAGES[name]?.title ?? tpl.dataset.title;
  panelBody.replaceChildren(tpl.content.cloneNode(true));
  panelBody.scrollTop = 0;
  if (name === 'automoove') startGame(document.getElementById('game'));
  if (tpl.id === 'tpl-leaderboards') showBoards(document.getElementById('boards'), BOARD_PAGES[name]?.board ?? 'chuv');
  if (!panel.open) panel.showModal();
}
function closePanel() {
  if (panel.open) panel.close();
}
panel.addEventListener('close', () => {
  if (templateFor(location.hash.slice(1))) {
    history.pushState(null, '', location.pathname + location.search);
  }
});
document.getElementById('panel-close').addEventListener('click', closePanel);
panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });  // backdrop
addEventListener('hashchange', route);

/* --------------------------------------------------------- text helpers */

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Just enough markdown for model answers: paragraphs, bullets, bold.
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

// Full markdown for live chat answers (tables, headings), sanitised: model output is untrusted.
function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) return renderText(text);
  return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: false }));
}

/* --------------------------------------------------------- leaderboards */

let boardData = null;

async function showBoards(root, first) {
  if (!boardData) {
    try {
      boardData = await (await fetch('static/data/leaderboards.json')).json();
    } catch {
      root.innerHTML = '<p>The leaderboards did not load. Reload the page to try again.</p>';
      return;
    }
  }
  const tabs = root.querySelectorAll('[data-board]');
  const x = (v) => (v - 20) / 0.6;  // the axis runs from 20% to 80%
  function show(key) {
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.board === key)));
    root.querySelectorAll('.board-note').forEach((n) => { n.hidden = n.dataset.note !== key; });
    root.querySelector('.lb').innerHTML = boardData[key].map((r, i) => `
      <li class="${r.ours ? 'ours' : ''}">
        <span class="lb-rank">${i + 1}</span>
        <span class="who">${esc(r.name)}${r.maker ? `<small>${esc(r.maker)}</small>` : ''}</span>
        <span class="lb-track" aria-hidden="true">
          <span class="lb-ci" style="left:${x(r.lo)}%;width:${x(r.hi) - x(r.lo)}%"></span>
          <span class="lb-dot" style="left:${x(r.win)}%"></span>
        </span>
        <span class="val">${Math.round(r.win)}%</span>
      </li>`).join('') + '<li class="lb-axis" aria-hidden="true"><span></span><span></span><span class="lb-ticks"><span>20%</span><span>50%</span><span>80%</span></span><span></span></li>';
  }
  root.onclick = (e) => {
    const b = e.target.closest('[data-board]');
    if (!b) return;
    show(b.dataset.board);
    const [page, { title }] = Object.entries(BOARD_PAGES).find(([, p]) => p.board === b.dataset.board);
    panelTitle.textContent = title;
    history.replaceState(null, '', `#${page}`);
  };
  show(first);
}

/* ------------------------------------------------------ AutoMOOVE game */

let gameData = null;

async function startGame(root) {
  if (!gameData) {
    root.innerHTML = '<p class="note">Loading the cases…</p>';
    try {
      gameData = await (await fetch('static/data/clinician_rounds.json')).json();
    } catch {
      root.innerHTML = '<p>The cases did not load. Reload the page to try again.</p>';
      return;
    }
  }
  const { rounds, meta } = gameData;
  const picks = [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  const word = (p) => (p === 'tie' ? 'Equally good' : `Answer ${p}`);

  function intro() {
    root.innerHTML = `
      <div class="game-narrow">
        <h2>Can you judge like a clinician?</h2>
        <p class="lead">On MOOVE, clinicians read two anonymous answers to the same question and vote for the better one. Their votes are the best test we have, but every vote costs a clinician's time. AutoMOOVE gives the job to an AI judge.</p>
        <p>Before trusting the judge, try the job yourself: ${rounds.length} real cases written by clinicians in Ethiopia, Switzerland and Kenya. In each one, every clinician who reviewed it picked the same answer.</p>
        <p class="note">The answers come from the models being tested on MOOVE at the time, not from today's Meditron.</p>
        <div class="game-actions"><button type="button" class="game-btn primary" data-act="start">Start the first case</button></div>
      </div>`;
  }

  function progress(i) {
    return `<div class="game-progress" aria-label="Case ${i + 1} of ${rounds.length}">${
      rounds.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div>`;
  }

  function answerBox(r, side, revealed) {
    const isClin = revealed && r.clinician_pick === side;
    const words = r[side.toLowerCase()].split(/\s+/).length;
    return `<div class="answer ${isClin ? 'clin' : ''}">
      <h4><span>Answer ${side} ${isClin ? '<span class="badge">Clinicians\' pick</span>' : ''}</span><small>${words} words</small></h4>
      ${renderText(r[side.toLowerCase()])}</div>`;
  }

  function round(i, pick) {
    const r = rounds[i];
    const revealed = pick !== undefined;
    const n = r.clinicians.A + r.clinicians.B + r.clinicians.tie;
    const clinN = r.clinicians[r.clinician_pick];
    const youOk = pick === r.clinician_pick, judgeOk = r.judge_pick === r.clinician_pick;
    const last = i === rounds.length - 1;
    root.innerHTML = `
      ${progress(i)}
      <p class="case-setting">Case ${i + 1} of ${rounds.length}: ${esc(r.setting)}</p>
      <div class="case-q">${esc(r.question)}</div>
      <div class="answers">${answerBox(r, 'A', revealed)}${answerBox(r, 'B', revealed)}</div>
      ${revealed ? `
        <div class="verdicts" aria-live="polite">
          <div class="verdict"><span class="verdict-who">You</span><span class="verdict-what">${word(pick)} <span class="${youOk ? 'match' : 'miss'}">${youOk ? 'Same as the clinicians' : 'Not the clinicians\' pick'}</span></span></div>
          <div class="verdict"><span class="verdict-who">Clinicians</span><span class="verdict-what">Answer ${r.clinician_pick}, ${clinN === n ? `all ${n}` : `${clinN} of ${n}`} of them</span></div>
          <div class="verdict"><span class="verdict-who">AI judge</span><span class="verdict-what">${word(r.judge_pick)} <span class="${judgeOk ? 'match' : 'miss'}">${judgeOk ? 'Same as the clinicians' : 'Not the clinicians\' pick'}</span>
            <span class="conf" aria-hidden="true"><span class="ca" style="width:${pct(r.judge_prob.A)}"></span><span class="ct" style="width:${pct(r.judge_prob.tie)}"></span><span class="cb" style="width:${pct(r.judge_prob.B)}"></span></span>
            <span class="conf-key">How sure it was: A ${pct(r.judge_prob.A)}, equal ${pct(r.judge_prob.tie)}, B ${pct(r.judge_prob.B)}</span></span></div>
        </div>
        <p class="case-note">${esc(r.note)}</p>
        <div class="game-actions"><button type="button" class="game-btn primary" data-act="${last ? 'end' : 'next'}">${last ? 'See how you did' : 'Next case'}</button></div>
      ` : `
        <div class="vote" role="group" aria-label="Which answer is better?">
          <button type="button" data-pick="A">A is better</button>
          <button type="button" data-pick="tie">Equally good</button>
          <button type="button" data-pick="B">B is better</button>
        </div>`}`;
    if (revealed) root.querySelector('.verdicts').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    else panelBody.scrollTop = 0;
  }

  function end() {
    const you = rounds.map((r, i) => picks[i] === r.clinician_pick);
    const judge = rounds.map((r) => r.judge_pick === r.clinician_pick);
    const nYou = you.filter(Boolean).length, nJudge = judge.filter(Boolean).length;
    const row = (label, hits) => `<div class="tally-row"><span class="verdict-who">${label}</span><span class="tally">${
      hits.map((h, k) => `<span class="${h ? 'hit' : ''}" title="Case ${k + 1}: ${h ? 'matched' : 'missed'}">${k + 1}</span>`).join('')}</span></div>`;
    root.innerHTML = `
      <div class="game-narrow">
        ${progress(rounds.length)}
        <h2>You matched the clinicians on ${nYou} of ${rounds.length}</h2>
        ${row('You', you)}${row('AI judge', judge)}
        <p>The judge matched them on ${nJudge} of these ${rounds.length}. Across all ${meta.n_pairs} cases where every clinician agreed, it matches them ${meta.judge_agree} times: ${Math.round(100 * meta.judge_agree / meta.n_pairs)}%.</p>

        <h3>So the judges do the rounds</h3>
        <p>Clinicians can't vote on every new model. AutoMOOVE puts three AI judges on 516 clinician-written cases and takes their majority vote. Share of cases Meditron wins, ties counting half:</p>
        <ul class="bars half" aria-label="AutoMOOVE win rates">
          <li class="ours"><span class="who">Apertus-70B-Meditron<small>against its starting point</small></span><span class="track"><span class="fill" style="width:89.7%"></span></span><span class="val">90%</span></li>
          <li class="ours"><span class="who">Gemma-3-27B-Meditron<small>against MedGemma-27B</small></span><span class="track"><span class="fill" style="width:57.1%"></span></span><span class="val">57%</span></li>
          <li class="ours"><span class="who">Apertus-70B-Meditron<small>against MedGemma-27B</small></span><span class="track"><span class="fill" style="width:35.8%"></span></span><span class="val">36%</span></li>
        </ul>
        <p class="note">The dashed line is 50%: above it, Meditron wins more often than it loses.</p>

        <h3>Where the judge is weakest</h3>
        <ul class="points">
          <li>When clinicians prefer the shorter answer, as in case 5. The judge leans towards longer, more complete answers.</li>
          <li>On safety, the criterion where it agrees with clinicians least.</li>
        </ul>
        <p>That is why clinicians stay in the loop: MOOVE events keep producing new votes, and we check the judge against them.</p>
        <div class="game-actions">
          <button type="button" class="game-btn primary" data-act="chat">Talk to Meditron</button>
          <button type="button" class="game-btn" data-act="again">Play again</button>
        </div>
      </div>`;
    panelBody.scrollTop = 0;
  }

  let i = 0;
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pick) { picks[i] = b.dataset.pick; round(i, picks[i]); return; }
    switch (b.dataset.act) {
      case 'start': i = 0; picks.length = 0; round(0); break;
      case 'next': i += 1; round(i); break;
      case 'end': end(); break;
      case 'again': i = 0; picks.length = 0; round(0); break;
      case 'chat': closePanel(); location.hash = 'chat'; break;
    }
  };
  intro();
}

/* ----------------------------------------------------------------- chat */

(function chat() {
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  const status = document.getElementById('chat-status');
  const suggest = document.getElementById('chat-suggest');
  const history = [];
  let busy = null;

  // Off until the server answers its health check, so a static-only host shows a clear state.
  function setOnline(on) {
    input.disabled = send.disabled = !on;
    suggest.querySelectorAll('button').forEach((b) => { b.disabled = !on; });
    status.textContent = on ? '' : 'The chat is not connected yet. It opens when the Meditron server goes public.';
  }
  setOnline(false);
  fetch(CHAT.endpoint).then((r) => r.ok && r.json()).then((d) => setOnline(Boolean(d && d.ok))).catch(() => {});

  function bubble(role, html) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    if (role === 'user') el.textContent = html; else el.innerHTML = html;
    log.append(el);
    return el;
  }

  async function ask(text) {
    history.push({ role: 'user', content: text });
    bubble('user', text);
    suggest.hidden = true;
    const out = bubble('bot', '<p>…</p>');
    let answer = '';
    busy = new AbortController();
    send.textContent = 'Stop';
    status.textContent = 'Meditron is writing.';
    try {
      const res = await fetch(CHAT.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) }),
        signal: busy.signal,
      });
      if (!res.ok) {
        const msg = await res.json().then((d) => d.error).catch(() => null);
        throw new Error(msg || `The server answered ${res.status}.`);
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try { answer += JSON.parse(data).choices?.[0]?.delta?.content ?? ''; } catch { /* partial keep-alive */ }
        }
        out.innerHTML = renderMarkdown(answer) || '<p>…</p>';
      }
      history.push({ role: 'assistant', content: answer });
      status.textContent = '';
    } catch (err) {
      if (err.name === 'AbortError') {
        if (answer) history.push({ role: 'assistant', content: answer });
        status.textContent = 'Stopped.';
      } else {
        history.pop();
        out.classList.add('error');
        out.innerHTML = `<p>Meditron could not answer. ${esc(err.message)} Try again in a minute.</p>`;
        status.textContent = '';
      }
    } finally {
      busy = null; send.textContent = 'Send';
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { busy.abort(); return; }
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    ask(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  suggest.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !busy) ask(b.textContent);
  });
})();

// Open a panel named in the URL only now that everything above (the game included) is defined.
route();

// Meditron site: dithered globe, draggable folders, project panels, the AutoMOOVE game, chat.

// The public chat goes through the MOOVE gateway's meditron-chat relay, which holds the RCP key
// and pins the model, temperature and token budget; the page only sends the conversation.
// Served locally by server/chat_server.py, the page uses that server's same-origin relay instead.
const CHAT = {
  endpoint: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'api/chat'
    : 'https://moovegateway.epfl.ch/dev/meditron/chat', // the dev gateway until moove-gateway's main has the route
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------------------------------------------------------------- globe */

// Where clinicians evaluated Meditron, in the order the story visits them: the month of the first vote on a Meditron
// answer there (`since`). `meditron` counts the votes on a pair with a Meditron answer; `lines` describe every MOOVE
// event at the place, with or without Meditron. City where the event is known, the capital otherwise.
// Counts are distinct questions and clinician votes per place (two Kenya events shared one question set).
const SITES = [
  { at: [39.21, -6.79], name: 'Tanzania', since: 'Aug 2024', meditron: 2838, lines: ['5 events, Aug 2024 to Aug 2026', '1,055 questions, 4,621 clinician votes', 'Primary care, paediatric emergency care'] },
  { at: [6.15, 46.20], name: 'HUG, Geneva', since: 'Sep 2024', meditron: 1704, lines: ['1 event, Sep to Dec 2024', '320 questions, 1,704 clinician votes', 'Specialist hospital care'] },
  { at: [36.82, -1.29], name: 'Kenya', since: 'Oct 2024', meditron: 5417, lines: ['7 events, Oct 2024 to Oct 2026', '2,130 questions, 7,549 clinician votes', 'Primary care, maternal, newborn and child health'] },
  { at: [6.63, 46.52], name: 'CHUV, Lausanne', since: 'Oct 2024', meditron: 3883, lines: ['4 events, Aug 2024 to Nov 2025', '4,320 questions, 13,112 clinician votes', 'Specialist hospital care'] },
  { at: [100.49, 13.76], name: 'Siriraj Hospital, Bangkok', since: 'Dec 2024', meditron: 1126, lines: ['1 event, Dec 2024 to Aug 2025', '339 questions, 1,126 clinician votes', 'Specialist hospital care'] },
  { at: [-47.88, -15.79], name: 'Brazil', since: 'Jan 2025', meditron: 173, lines: ['2 events, Jan to Nov 2025', '450 questions, 1,514 clinician votes', 'Specialist hospital care'] },
  { at: [4.35, 50.85], name: 'Belgium', since: 'Oct 2025', meditron: 58, lines: ['1 event, Oct 2025', '108 questions, 126 clinician votes', 'Specialist hospital care'] },
  { at: [77.02, 28.99], name: 'Ashoka University, India', since: 'Jan 2026', meditron: 41, lines: ['1 event, Jan to Apr 2026', '86 questions, 138 clinician votes', 'Specialist hospital care'] },
  { at: [77.59, 12.97], name: 'Bengaluru, India', since: 'Jan 2026', meditron: 201, lines: ['1 event, Jan to Mar 2026', '305 questions, 491 clinician votes', 'Specialist hospital care'] },
  { at: [78.49, 17.39], name: 'Hyderabad, India', since: 'Jan 2026', meditron: 33, lines: ['1 event, Jan to Feb 2026', '98 questions, 87 clinician votes', 'Specialist hospital care'] },
  { at: [33.79, -13.96], name: 'Malawi', since: 'May 2026', meditron: 1033, lines: ['2 events, May to Jul 2026', '300 questions, 1,700 clinician votes', 'Primary care'] },
  { at: [76.27, 9.93], name: 'Amrita, India', since: 'Jul 2026', meditron: 458, lines: ['1 event, Jul to Sep 2026', '306 questions, 684 clinician votes', 'Primary care, maternal and newborn health'] },
  { at: [38.74, 9.03], name: 'Ethiopia', since: 'Sep 2026', meditron: 720, lines: ['3 events, Mar to Sep 2026', '812 questions, 2,734 clinician votes', 'Primary care, paediatric emergency care'] },
  { at: [73.05, 33.68], name: 'Pakistan', since: 'Sep 2026', meditron: 556, lines: ['1 event, Sep 2026', '278 questions, 834 clinician votes', 'Primary care, maternal and newborn health'] },
];

(function globe() {
  const canvas = document.getElementById('globe');
  const ctx = canvas.getContext('2d');
  const story = document.getElementById('story'), stage = document.getElementById('story-stage');
  const rail = document.getElementById('story-rail'), stops = document.getElementById('story-stops');
  const tally = document.getElementById('story-tally'), play = document.getElementById('story-play');
  const card = document.getElementById('story-card'), ocean = document.getElementById('ocean-card');
  // the globe all sea and all land, drawn once per size; a frame lays the land layer over the sea one, clipped to the coasts
  const seaLayer = document.createElement('canvas'), landLayer = document.createElement('canvas');
  let land = null, size = 0, ink = [12, 67, 160], marker = '#efcd5f';
  let hovered = null, shown = [];

  // the MeditronFO page's globe: a navy night side, light blue land and a warm limb
  const NIGHT = [13, 29, 64], LAND = [104, 175, 231], RIM = [255, 222, 172], LIMB = [255, 240, 210];

  const projection = d3.geoOrthographic().clipAngle(90).precision(0.5);
  const path = d3.geoPath(projection, ctx);

  // The story's clock T counts stops and is the scroll position, so the story plays both ways: the camera reaches
  // stop i at T = i + 0.5, after MOVE of a step in flight, and rests there for the rest of the step.
  // Stop n, after the last site, is the ocean, where the card about Meditron rests until the clock ends.
  const n = SITES.length, MOVE = 0.4, END = n + 1.9, STEP_SVH = 34, STEP_MS = 2600;
  const START = [-5, 12], OCEAN_VIEW = [70, -15], OCEAN_SPOT = [79, -23];   // where the camera starts; the ocean's view, and where its card sits
  const docked = matchMedia('(max-width: 900px)');   // phones: the site's card sits under the globe instead of beside its square
  const arrive = (i) => i + 0.5;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const ease = (x) => x * x * (3 - 2 * x);
  const wrap = (d) => ((d + 540) % 360) - 180;
  const count = (v) => v.toLocaleString('en-US');
  const legs = SITES.map((s, i) => (i ? d3.geoInterpolate(SITES[i - 1].at, s.at) : null));
  let T = reduceMotion ? END : 0, spin = 0;   // the turn of the idle globe, in degrees from its start

  const view = (i) => {
    if (i < 0) return START;
    if (i >= n) return OCEAN_VIEW;
    // the site a little left of centre, with room for its card on the right, and nearer the equator than the camera
    const [lon, lat] = SITES[i].at;
    return [lon + (docked.matches ? 0 : 16), lat * 0.7];
  };
  function camera() {
    const k = Math.min(n, Math.max(0, Math.ceil(T - 0.5)));
    const [lon0, lat0] = view(k - 1), [lon1, lat1] = view(k), e = ease(clamp((T - arrive(k) + MOVE) / MOVE));
    return [lon0 + wrap(lon1 - lon0) * e + spin, lat0 + (lat1 - lat0) * e];
  }

  function hexToRgb(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function readColors() {
    ink = hexToRgb(css('--globe-ink') || '#0c43a0');
    marker = css('--marker') || '#efcd5f';
  }

  function resize() {
    const cssSize = canvas.getBoundingClientRect().width;
    // 1.5 to 2 buffer pixels per CSS pixel, smoothed down by the browser: a fine, soft stipple
    const k = Math.min(2, Math.max(1.5, devicePixelRatio || 1));
    const s = Math.max(240, Math.min(1200, Math.round(cssSize * k)));
    if (s === size) return;
    size = s;
    canvas.width = canvas.height = seaLayer.width = seaLayer.height = landLayer.width = landLayer.height = size;
    projection.scale(size / 2 - 1).translate([size / 2, size / 2]);
    // light, limb and dither don't move as the globe turns, only the land does: each pixel's colour as sea and as
    // land is worked out once here (little-endian RGBA words) into the two layers
    const noise = new Float32Array(size * size);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
    const word = (col) => (255 << 24 | col[2] << 16 | col[1] << 8 | col[0]) >>> 0;
    const nightW = word(NIGHT), landW = word(LAND), rimW = word(RIM), limbW = word(LIMB);
    const sea = new ImageData(size, size), landImg = new ImageData(size, size);
    const seaPx = new Uint32Array(sea.data.buffer), landPx = new Uint32Array(landImg.data.buffer);
    const c = size / 2, R = size / 2 - 1;
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5 - c) / R;
      for (let x = 0; x < size; x++) {
        const i = y * size + x, dx = (x + 0.5 - c) / R, r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;   // outside the disk: transparent
        const shade = Math.max(0, -0.42 * dx - 0.5 * dy + 0.76 * Math.sqrt(1 - r2));   // light from the upper left
        // navy, light blue land dots, a few warm dots just inside a crisp limb
        const rim = Math.max(0, (r2 - 0.92) / 0.068), n2 = noise[(i * 7919) % noise.length];
        const edge = r2 > 0.988 ? limbW : n2 < 0.3 * rim * rim ? rimW : 0;
        seaPx[i] = edge || nightW;
        landPx[i] = edge || (noise[i] < 0.22 + 0.3 * shade ? landW : nightW);
      }
    }
    seaLayer.getContext('2d').putImageData(sea, 0, 0);
    landLayer.getContext('2d').putImageData(landImg, 0, 0);
  }

  function draw(now = 0) {
    const [lon, lat] = camera(), center = [lon, lat];
    projection.rotate([-lon, -lat]);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(seaLayer, 0, 0);
    if (land) { ctx.save(); ctx.beginPath(); path(land); ctx.clip(); ctx.drawImage(landLayer, 0, 0); ctx.restore(); }
    const d = Math.max(3, Math.round(size / 95)), b = Math.max(1, Math.round(size / 500));
    const lit = Math.min(n, Math.max(0, Math.floor(T - 0.45) + 1));
    // the way from site to site, dotted like the dither, drawn out as the camera flies it
    ctx.strokeStyle = marker; ctx.lineWidth = b * 1.5; ctx.setLineDash([b * 1.5, b * 3.5]); ctx.globalAlpha = 0.8;
    for (let i = 1; i < n; i++) {
      const k = ease(clamp((T - arrive(i) + MOVE) / MOVE));
      if (k <= 0) break;
      ctx.beginPath(); path({ type: 'LineString', coordinates: [SITES[i - 1].at, legs[i](k)] }); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // event sites on the near side, as solid squares so they sit in the dither's pixel grid;
    // a globe-ink rim sets the yellow off from the light blue land; each lands big and settles
    shown = [];
    SITES.slice(0, lit).forEach((s, i) => {
      if (d3.geoDistance(s.at, center) > Math.PI / 2 - 0.04) return;
      const [px, py] = projection(s.at);
      const k = Math.round(s === hovered ? 2 * d : d * (2 - clamp((T - arrive(i) + 0.05) / 0.2)));
      const x0 = Math.round(px - k / 2), y0 = Math.round(py - k / 2);
      ctx.fillStyle = `rgb(${ink})`; ctx.fillRect(x0 - b, y0 - b, k + 2 * b, k + 2 * b);
      ctx.fillStyle = marker; ctx.fillRect(x0, y0, k, k);
      shown.push({ s, px, py });
    });
    // the site of the moment sends out a square ring
    const cur = showing();
    const m = cur && shown.find((x) => x.s === cur.s);
    if (m) {
      const q = (now / 1300) % 1, k = d * (1.5 + 3.5 * q);
      ctx.strokeStyle = marker; ctx.lineWidth = b * 1.5; ctx.globalAlpha = (1 - q) * cur.a;
      ctx.strokeRect(m.px - k / 2, m.py - k / 2, k, k);
      ctx.globalAlpha = 1;
    }
    placeCards(cur);
    showProgress(lit);
    if (hovered) placeTip();
  }

  // the site whose card is up at this T, and how far it has faded in
  function showing() {
    const i = Math.floor(T - 0.44);
    if (i < 0 || i >= n) return null;
    const x = T - arrive(i), a = clamp((x + 0.06) / 0.1) * clamp((0.56 - x) / 0.07);
    return a > 0 ? { s: SITES[i], i, a } : null;
  }

  let cardFor = -1;
  function placeCards(cur) {
    const r = canvas.getBoundingClientRect(), h = stage.getBoundingClientRect(), k = r.width / size;
    const inStage = (at) => { const [x, y] = projection(at); return [r.left - h.left + x * k, r.top - h.top + y * k]; };
    card.hidden = !cur;
    if (cur) {
      if (cur.i !== cardFor) {
        cardFor = cur.i;
        card.innerHTML = `<small>${cur.s.since}, ${cur.i ? 'then here' : 'first evaluated here'}</small><strong>${cur.s.name}</strong>`
          + `<b>${count(cur.s.meditron)} votes on Meditron's answers</b>${cur.s.lines.map((l) => `<span>${l}</span>`).join('')}`;
      }
      card.style.opacity = cur.a;
      if (docked.matches) card.style.transform = '';
      else {
        const [x, y] = inStage(cur.s.at), left = Math.min(x + 26 * (1 + 0.3 * (1 - cur.a)), h.width - card.offsetWidth - 16);
        card.style.transform = `translate(${left}px, ${Math.max(8, y - card.offsetHeight / 2)}px)`;
      }
    }
    const o = ease(clamp((T - arrive(n) + 0.12) / 0.3));
    ocean.style.visibility = o > 0 ? 'visible' : 'hidden';
    ocean.style.opacity = o;
    if (o > 0) {
      const [x, y] = inStage(OCEAN_SPOT), w = ocean.offsetWidth, top = y - ocean.offsetHeight / 2;
      ocean.style.transform = `translate(${Math.max(16, Math.min(x - w / 2, h.width - w - 16))}px, ${Math.max(8, top + 12 * (1 - o))}px)`;
    }
  }

  // the rail, one button per stop: it follows the story, and a click takes the story there
  const items = [...SITES.map((s, i) => [s.name, arrive(i) + 0.15, `${s.since}. ${s.lines.join('. ')}. ${count(s.meditron)} votes on Meditron's answers.`]),
    ['What is Meditron', END - 0.2, '']];
  stops.innerHTML = items.map(([name, , more]) => `<li><button type="button">${name}${more ? `<span class="sr"> ${more}</span>` : ''}</button></li>`).join('');
  const rows = [...stops.children];
  rows.forEach((li, i) => li.addEventListener('click', () => {
    wanted = false; held = false;
    scrollTo({ top: scrollFor(items[i][1]), behavior: reduceMotion ? 'auto' : 'smooth' });
  }));
  let lastLit = -1, lastHere = -1;
  function showProgress(lit) {
    rail.style.setProperty('--p', (T / END).toFixed(4));
    const here = T >= arrive(n) - 0.12 ? n : lit - 1;
    if (here !== lastHere) {
      lastHere = here;
      rows.forEach((li, i) => { li.classList.toggle('lit', i < lit); if (i === here) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    }
    if (lit !== lastLit) {
      lastLit = lit;
      const votes = SITES.slice(0, lit).reduce((sum, s) => sum + s.meditron, 0);
      tally.innerHTML = `<b>${count(votes)}</b> clinician votes on Meditron's answers, ${lit} of ${n} places`;
    }
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
    if (s) tip.innerHTML = `<strong>${s.name}</strong><span>${count(s.meditron)} votes on Meditron's answers</span>${s.lines.map((l) => `<span>${l}</span>`).join('')}`;
    tip.hidden = !s;
    draw();
  }
  function placeTip() {
    const m = shown.find((x) => x.s === hovered);
    if (!m) { hover(null); return; }
    const r = canvas.getBoundingClientRect(), h = stage.getBoundingClientRect(), k = r.width / size;
    tip.style.left = `${r.left - h.left + m.px * k}px`;
    tip.style.top = `${r.top - h.top + m.py * k}px`;
  }

  /* the clock: the scroll position, which the story moves on by itself while nobody else is scrolling */
  const stepPx = () => (story.offsetHeight - stage.offsetHeight) / END;
  const scrollFor = (t) => scrollY + story.getBoundingClientRect().top + t * stepPx();
  let wanted = !reduceMotion;   // the story plays until someone scrolls it back or pauses it
  let held = false;             // paused with the button: stays paused, even back at the top of the page
  let lastInput = -1e9, pos = null, lastY = scrollY, last = 0, drawn = null;
  const idle = 1400;
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });

  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, t - last);
    if (dt < 30) return;
    last = t;
    const top = story.getBoundingClientRect().top, step = stepPx(), vh = innerHeight;
    // someone else moved the page: going back means they want to look at something, so the story stops playing;
    // back at the top it may start again
    if (pos !== null && Math.abs(scrollY - pos) > 8) { pos = null; lastInput = t; }
    if (pos === null && scrollY < lastY - 1) wanted = false;
    if (top > vh * 0.5 && !held) wanted = true;
    lastY = scrollY;
    T = clamp(-top / (step * END)) * END;
    const playing = wanted && !document.hidden && t - lastInput > idle && top < vh * 0.3 && T < END && !document.querySelector('dialog[open]');
    if (playing) {
      pos = (pos ?? scrollY) + dt * step / STEP_MS;
      scrollTo({ top: pos, behavior: 'instant' });
      lastY = scrollY;
    } else pos = null;
    play.textContent = T >= END - 0.01 ? 'Replay' : wanted ? 'Pause' : 'Play';
    // the rail joins once the stage is nearly in place, so it is never cut off by the fold
    const railIn = clamp(1 - top / (vh * 0.2));
    rail.style.opacity = railIn; rail.style.visibility = railIn > 0 ? 'visible' : 'hidden';
    // the globe turns by itself until the story starts, then comes round to the camera the short way
    spin = top >= 0 ? wrap(spin + dt * 0.0042) : Math.abs(spin) < 0.05 ? 0 : spin * Math.exp(-dt / 220);
    const state = `${T}|${spin}|${size}`;
    if (visible && !document.querySelector('dialog[open]') && (state !== drawn || showing())) { drawn = state; draw(t); }
  }
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  play.addEventListener('click', () => {
    if (T >= END - 0.01) { scrollTo({ top: scrollFor(0), behavior: 'instant' }); lastY = scrollY; wanted = true; held = false; }
    else { wanted = !wanted; held = !wanted; }
    lastInput = -1e9;
  });

  // the globe also turns by hand: a sideways drag runs the story, to the right to go back
  let dragX = null;
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) { hover(siteAt(e)); return; }
    const top = story.getBoundingClientRect().top;
    if (top <= 0 && T < END) scrollBy({ top: (dragX - e.clientX) * stepPx() / 110, behavior: 'instant' });
    dragX = e.clientX;
  });
  canvas.addEventListener('pointerdown', (e) => {
    hover(siteAt(e));
    if (!reduceMotion && e.button === 0) { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); }
  });
  const dragEnd = () => { dragX = null; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', dragEnd);
  canvas.addEventListener('pointercancel', dragEnd);
  canvas.addEventListener('pointerleave', () => hover(null));

  // hidden until the continents are in (or the map is slow or missing), then faded in: no empty sphere first
  const reveal = () => canvas.classList.remove('pending');
  canvas.classList.add('pending'); setTimeout(reveal, 1500);
  if (reduceMotion) story.classList.add('still');
  else {
    story.style.height = `calc(100svh + ${END * STEP_SVH}svh)`;
    // the story's height just moved every section below it: a link into the page lands on its section again
    if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  }
  readColors(); resize(); draw();
  addEventListener('resize', () => { resize(); draw(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });

  fetch('static/data/land-110m.json')
    .then((r) => r.json())
    .then((topo) => { land = topojson.feature(topo, topo.objects.land); draw(); reveal(); })
    .catch(() => reveal());   // plain dithered sphere if the map can't load

  if (!reduceMotion) requestAnimationFrame(frame);
})();

/* -------------------------------------------------------------- folders */

(function folders() {
  const desktop = matchMedia('(min-width: 901px)');
  let top = 10;
  // The row keeps its folded height, so a folder unfolding on hover overlays the chat instead of pushing it down.
  const row = document.querySelector('.folders');
  function lockRow() {
    if (!row) return;
    row.style.height = '';
    if (desktop.matches) row.style.height = `${row.offsetHeight}px`;
  }
  addEventListener('load', lockRow);
  addEventListener('resize', lockRow);
  document.fonts?.ready.then(lockRow);
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
      // portal folders with a data-href leave the site (a relative one, a page of this site, opens in place);
      // the others open a panel
      if (el.dataset.href && !el.dataset.href.includes('://')) location.href = el.dataset.href;
      else if (el.dataset.href) window.open(el.dataset.href, '_blank', 'noopener');
      else location.hash = el.dataset.open;
    });
  });
})();

/* ---------------------------------------------------------------- beam */

// The beam types its arguments one after another, with the LiGHT homepage's timings, and lights the
// matching folder group; with reduced motion it shows all three at once.
(function beam() {
  const el = document.getElementById('beam-word');
  if (!el || !document.documentElement.classList.contains('withbeam')) return;
  const words = el.dataset.words.split('|');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = `(${words.map((w) => w.slice(1, -1)).join(', ')})`;
    return;
  }
  // the folder group of the commitment being typed lights up (the words and the groups share their order)
  const groups = document.querySelectorAll('.fgroup');
  const light = (k) => groups.forEach((g, gi) => g.classList.toggle('is-lit', gi === k));
  let w = 0, n = words[0].length;
  light(0);
  function type() {
    if (n < words[w].length) { el.textContent = words[w].slice(0, ++n); setTimeout(type, 80); }
    else setTimeout(erase, 1200);
  }
  function erase() {
    if (n > 0) { el.textContent = words[w].slice(0, --n); setTimeout(erase, 40); }
    else { w = (w + 1) % words.length; light(w); setTimeout(type, 300); }
  }
  setTimeout(erase, 1200);   // the first word is already in the HTML
})();

/* ---------------------------------------------------------------- panel */

const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const panelTitle = document.getElementById('panel-title');

// Older links name panels that are now merged into others; the board says which leaderboard to show first.
const ALIASES = {
  apertus: { page: 'open' },
  data: { page: 'open' },
  healthbench: { page: 'results' },
  'swiss-moove': { page: 'results', board: 'chuv' },
  'east-africa-moove': { page: 'results', board: 'phc' },
};
const templateFor = (name) => document.getElementById(`tpl-${ALIASES[name]?.page ?? name}`);

function route() {
  const name = location.hash.slice(1);
  const tpl = templateFor(name);
  if (!tpl) { if (panel.open) panel.close(); return; }
  panelTitle.textContent = tpl.dataset.title;
  panelBody.replaceChildren(tpl.content.cloneNode(true));
  panelBody.scrollTop = 0;
  if (name === 'automoove') startGame(document.getElementById('game'));
  const board = ALIASES[name]?.board;
  if (tpl.id === 'tpl-results') showBoards(document.getElementById('boards'), board ?? 'chuv');
  if (!panel.open) panel.showModal();
  if (board) document.getElementById('boards').scrollIntoView();
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
  // The model the relay serves, from its health check, so the label follows the server when the model changes.
  const modelLine = document.getElementById('chat-model');
  function showModel(id) {
    if (!id) return;
    const name = id.split('/').pop(), base = name.replace(/-MeditronFO$/, '');
    const link = document.createElement('a');
    link.href = `https://huggingface.co/${id}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = name;
    modelLine.replaceChildren('Model: ', link,
      base !== name ? ` · ${base} fine-tuned on the open MeditronFO medical data` : '');
    modelLine.hidden = false;
  }
  setOnline(false);
  fetch(CHAT.endpoint).then((r) => r.ok && r.json())
    .then((d) => { setOnline(Boolean(d && d.ok)); if (d && d.ok) showModel(d.model); }).catch(() => {});

  // Meditron's answers carry the cube, as chat apps put the assistant's logo beside its messages.
  const CUBE = '<span class="cube chat-cube" aria-hidden="true"><img class="cube-light" src="static/img/cube.png" alt=""><img class="cube-dark" src="static/img/cube-dark.png" alt=""></span>';
  function bubble(role, html) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    if (role === 'user') el.textContent = html; else el.innerHTML = html;
    if (role === 'bot') {
      const row = document.createElement('div');
      row.className = 'msg-row';
      row.innerHTML = CUBE;
      row.append(el);
      log.append(row);
    } else log.append(el);
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
        // the relay answers {error}; Kong's own refusals, like its rate limit, answer {message}
        const d = await res.json().catch(() => ({}));
        const msg = d.error || (res.status === 429 ? 'Too many questions in a short time. Wait a minute.' : d.message);
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
      if (answer.trim()) history.push({ role: 'assistant', content: answer });
      status.textContent = '';
    } catch (err) {
      if (err.name === 'AbortError') {
        if (answer.trim()) history.push({ role: 'assistant', content: answer });
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

/* --------------------------------------------------------- cite */

(() => {
  const btn = document.getElementById('cite-copy');
  const bib = document.getElementById('cite-bibtex');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bib.textContent);
      btn.textContent = 'Copied';
    } catch {
      // No clipboard access (e.g. plain http): select the entry so it can be copied by hand.
      getSelection().selectAllChildren(bib);
      btn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { btn.textContent = 'Copy BibTeX'; }, 2000);
  });
})();

// Open a panel named in the URL only now that everything above (the game included) is defined.
route();

/* ═══════════════════════════════════════════════════════════════════════════
   OPENING A PHASE IS ONE PICTURE MOVING, NOT TWO.

   Reported: "the animation seems to be messed up and slow on the gantt."
   Frozen frame by frame, a fold showed three things wrong, none of them about
   speed alone:
   · the arrows did not move. They were drawn for the NEW layout from the first
     frame, so for a third of a second every arrow below the phase pointed at
     rows that had not arrived while the bars slid in underneath;
   · the clock started before the first frame. Chrome stamps a frame with the
     time it began, and after a click that took a while to draw, that stamp is
     EARLIER than the moment the glide read the clock. The elapsed time came out
     negative, the ease went below zero, and on the first frame every row jumped
     past where it had been before sliding back. The slower the redraw, the
     bigger the jump;
   · a click during a glide restarted every row from where the LAST render put
     it, not from where it was on screen, and dropped the rows that were still
     folding away, so the chart jumped.

   One identity covers the moment of every click: THE PICTURE DOES NOT CHANGE
   WHEN THE CLICK LANDS. Every row, bar, leaving copy and arrow visible just
   before is visible just after, in the same place at the same strength, and
   nothing else is visible. It is checked before any frame has run (a browser
   may paint before the first frame callback) and on the first frame, stamped
   earlier than the click finished, as Chrome stamps it after a slow redraw.
   Checked for a click on a still chart, for closing a phase that is half open,
   for opening one that is half closed, and for opening another phase while one
   is still folding away.

   Then: no row travels beyond its old place or its new one; when the glide is
   over the chart is exactly the chart as drawn, with nothing left behind; and
   with reduced motion asked for, nothing moves or fades.

   Everything drawn on the chart belongs to a row that moves (a bar, its
   baseline and slack, the critical strip on a folded phase, the ? badge, the
   reserve row), or to the arrows.

   Everything is read off the screen (getBoundingClientRect and the opacity the
   browser computes, multiplied up the tree), never off the attributes that
   produce it.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();
const POS = 0.5, ALPHA = 0.03, SEEN = 0.02;

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];

  async function open(reduce) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(APP, { waitUntil: 'load' });
    const ids = await page.evaluate(d => {
      /* Frames run only when this says so, stamped with whatever time it gives,
         so a glide can be stopped and read at any point of its run. Taken over
         BEFORE anything is drawn: folding the chart below starts a glide of its
         own, and one left running would be read as the picture before a click. */
      window.__q = [];
      window.requestAnimationFrame = f => { window.__q.push(f); return window.__q.length; };
      window.__frame = ts => { const q = window.__q; window.__q = []; q.forEach(f => f(ts)); };
      hydrate(d); calculate(); refreshAll(); switchTab('gantt'); setCollapseLevel(0);
      for (let i = 1; i <= 20 && window.__q.length; i++) window.__frame(performance.now() + i * 10000);
      /* The picture: every row and bar where the screen has it and how strongly
         it shows, keyed by task and role, live or leaving; every arrow by its
         path, with how strongly it shows. */
      window.__shot = () => {
        const svg = document.querySelector('#ganttContainer svg');
        if (!svg) return null;
        const o = svg.getBoundingClientRect();
        const alpha = el => { let a = 1; for (let n = el; n && n !== svg.parentNode; n = n.parentNode) if (n.nodeType === 1) a *= +getComputedStyle(n).opacity; return a; };
        const groups = {}, ghosts = {};
        svg.querySelectorAll('g[data-gopen], g[data-gmove]').forEach(g => {
          const r = g.getBoundingClientRect(), k = g.dataset.gmove || (g.dataset.gopen + '·' + (g.dataset.grole || ''));
          (g.closest('.g-ghost') ? ghosts : groups)[k] = { x: r.left - o.left, y: r.top - o.top, a: alpha(g) };
        });
        const arrows = [...svg.querySelectorAll('path[data-glink]')].map(p => ({ d: p.getAttribute('d'), ghost: !!p.closest('.g-ghost'), a: alpha(p), inLayer: !!p.closest('[data-glinks]') }));
        const offsets = [...svg.querySelectorAll('g[data-gopen], [data-glinks]')].filter(g => !g.closest('.g-ghost') && (g.getAttribute('transform') || g.getAttribute('opacity'))).length;
        // anything drawn on the chart that belongs to no row, so nothing would carry it when its row moves
        const layer = [...svg.querySelectorAll('g[clip-path]')].find(g => g.querySelector('g[data-gopen]'));
        const loose = layer ? [...layer.querySelectorAll('rect, circle, ellipse, polygon, text, path')]
          .filter(el => !el.closest('g[data-gopen], g[data-gmove], [data-glinks], .g-ghost'))
          .map(el => el.tagName + ' ' + (el.getAttribute('fill') || el.getAttribute('stroke') || '') + ' at y=' + Math.round(+(el.getAttribute('y') || el.getAttribute('cy') || 0))) : [];
        return { groups, ghosts, arrows, loose, ghostCount: svg.querySelectorAll('.g-ghost').length, offsets };
      };
      // the arrows as the chart draws them, with nothing in flight: each path and its strength
      window.__drawn = () => {
        const box = document.createElement('div');
        box.innerHTML = buildGanttSvg().markup;
        return [...box.querySelectorAll('path[data-glink]')].map(p => ({ d: p.getAttribute('d'), a: +(p.getAttribute('opacity') || 1) }));
      };
      window.__toggle = id => { const t = document.querySelector('#ganttContainer [data-gtoggle="' + id + '"]'); if (!t) return false; t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; };
      return [...document.querySelectorAll('#ganttContainer [data-gtoggle]')].map(t => t.dataset.gtoggle);
    }, DATA);
    return { ctx, page, ids };
  }

  const where = p => '(' + p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ') at ' + Math.round(p.a * 100) + '%';
  // one entry per task and role, whether it is a live row or a copy on its way out
  const merged = s => {
    const m = {};
    Object.keys(s.ghosts).forEach(k => { m[k] = s.ghosts[k]; });
    Object.keys(s.groups).forEach(k => { if (!m[k] || s.groups[k].a >= m[k].a) m[k] = s.groups[k]; });
    return m;
  };
  // how strongly each path shows, all its copies together
  const strength = s => {
    const m = {};
    s.arrows.forEach(a => { m[a.d] = 1 - (1 - (m[a.d] || 0)) * (1 - a.a); });
    return m;
  };
  function doubles(at, s) {
    const two = Object.keys(s.groups).filter(k => s.groups[k].a >= SEEN && s.ghosts[k] && s.ghosts[k].a >= SEEN);
    if (two.length) say(at, two.length + ' row(s) show twice, arriving and leaving at once (' + two.slice(0, 3).join(', ') + ')');
  }
  function samePicture(at, A, B) {
    doubles(at, B);
    const P = merged(A), Q = merged(B);
    let bad = 0;
    const keys = new Set([...Object.keys(P), ...Object.keys(Q)]);
    keys.forEach(k => {
      const p = P[k], q = Q[k];
      const pa = p ? p.a : 0, qa = q ? q.a : 0;
      if (pa < SEEN && qa < SEEN) return;
      if (bad >= 4) { bad++; return; }
      if (pa < SEEN) { bad++; say(at, k + ' was not on screen and shows at once at ' + where(q)); return; }
      if (qa < SEEN) { bad++; say(at, k + ' was on screen at ' + where(p) + ' and is gone at once'); return; }
      if (Math.abs(p.x - q.x) > POS || Math.abs(p.y - q.y) > POS || Math.abs(pa - qa) > ALPHA) { bad++; say(at, k + ' jumps from ' + where(p) + ' to ' + where(q)); }
    });
    const SA = strength(A), SB = strength(B);
    const paths = new Set([...Object.keys(SA), ...Object.keys(SB)]);
    let pop = 0, gone = 0, dim = 0;
    paths.forEach(d => {
      const pa = SA[d] || 0, qa = SB[d] || 0;
      if (pa < SEEN && qa >= SEEN) pop++;
      else if (pa >= SEEN && qa < SEEN) gone++;
      else if (Math.abs(pa - qa) > ALPHA) dim++;
    });
    if (pop) say(at, pop + ' arrow(s) that were not on screen show at once, drawn for rows that have not moved yet');
    if (gone) say(at, gone + ' arrow(s) that were on screen vanish at once, while the rows they join are still where they were');
    if (dim) say(at, dim + ' arrow(s) change strength at once');
    return bad + pop + gone + dim;
  }
  async function settled(at, page) {
    const s = await page.evaluate(() => window.__shot()), drawn = await page.evaluate(() => window.__drawn());
    if (s.ghostCount) say(at, s.ghostCount + ' leaving copy(ies) are still on the chart after the glide');
    if (s.loose.length) say(at, s.loose.length + ' shape(s) on the chart belong to no row (' + s.loose.slice(0, 3).join('; ') + '), so the next fold leaves them behind');
    if (s.offsets) say(at, s.offsets + ' group(s) still carry an offset or a fade after the glide');
    const live = {}; s.arrows.filter(a => !a.ghost).forEach(a => { live[a.d] = a.a; });
    const off = drawn.filter(a => live[a.d] == null || Math.abs(live[a.d] - a.a) > 0.01);
    if (off.length) say(at, off.length + ' of ' + drawn.length + ' arrows are not drawn as the chart draws them (missing or at another strength) after the glide');
    const queued = await page.evaluate(() => window.__q.length);
    if (queued) say(at, 'the glide still asks for ' + queued + ' frame(s) after it is over');
    return s;
  }
  // a click, read before any frame and on a first frame stamped before the click finished
  async function click(page, id, at, from) {
    const now = await page.evaluate(i => { window.__toggle(i); return window.__shot(); }, id);
    samePicture(at + ', before the first frame', from, now);
    const f0 = await page.evaluate(() => { const s = performance.now() - 60; window.__frame(s); return { s, shot: window.__shot() }; });
    samePicture(at + ', first frame', from, f0.shot);
    return f0;
  }
  const finish = (page, s) => page.evaluate(t => window.__frame(t + 5000), s);
  const midway = (page, s, dt) => page.evaluate(([t, d]) => { window.__frame(t + d); return window.__shot(); }, [s, dt || 110]);
  // early and part way, while what leaves and what arrives are both still showing
  const twice = async (page, s, at) => {
    for (const dt of [40, 110]) doubles(at + ', ' + dt + 'ms in', await page.evaluate(([t, d]) => { window.__frame(t + d); return window.__shot(); }, [s, dt]));
  };

  // ═══ OPENING A PHASE ON A STILL CHART ══════════════════════════════════
  const { ctx, page, ids } = await open(false);
  // the last phase first, so the arrows between the phases above it have no reason to change
  const [X, Y] = ids, Z = ids[ids.length - 1];
  R.phases = ids.length;
  const before = await page.evaluate(() => window.__shot());
  if (!before) say('Gantt', 'no chart was drawn');
  else {
    R.arrows = before.arrows.length;
    R.rows = Object.keys(before.groups).length;
    if (before.loose.length) say('Gantt', before.loose.length + ' shape(s) on the chart belong to no row (' + before.loose.slice(0, 3).join('; ') + '), so when a fold moves the rows they stay where the new layout puts them');
    const outside = before.arrows.filter(a => !a.inLayer).length;
    if (outside) say('Gantt', outside + ' of ' + before.arrows.length + ' arrows are outside the arrow layer, so the glide cannot fade them with the rest');
  }
  if (!before || X == null) say('Gantt', 'the folded chart offers no phase to open, so no glide could be watched');
  else {
    const f0 = await click(page, Z, 'Opening a phase', before);
    const mid = await midway(page, f0.s);
    await finish(page, f0.s);
    const end = await settled('Opening a phase, at the end', page);
    R.arrived = Object.keys(end.groups).filter(k => !before.groups[k]).length;
    if (!R.arrived) say('Opening a phase', 'opening phase ' + Z + ' added no rows, so there was nothing to unfurl');
    // an arrow whose path is the same before and after shows at full strength all the way through
    const SB = strength(before), SM = strength(mid), endPaths = new Set(end.arrows.filter(a => !a.ghost).map(a => a.d));
    const blink = Object.keys(SB).filter(d => SB[d] >= SEEN && endPaths.has(d) && Math.abs((SM[d] || 0) - SB[d]) > ALPHA);
    R.unchangedArrows = Object.keys(SB).filter(d => endPaths.has(d)).length;
    if (blink.length) say('Opening a phase, part way', blink.length + ' arrow(s) whose path does not change are faded part way through, so they blink though nothing about them moved');
    doubles('Opening a phase, part way', mid);
    // part way, every row between where it was and where it ends
    let past = 0;
    const inside = (v, a, c) => v >= Math.min(a, c) - POS && v <= Math.max(a, c) + POS;
    Object.keys(mid.groups).forEach(k => {
      const p = before.groups[k], q = mid.groups[k], z = end.groups[k];
      if (p && z && !(inside(q.y, p.y, z.y) && inside(q.x, p.x, z.x)) && past++ < 3)
        say('Opening a phase, part way', k + ' is at ' + where(q) + ', outside the way from ' + where(p) + ' to ' + where(z));
    });

    // ═══ CLOSING IT WHILE IT IS STILL OPENING ═══════════════════════════
    let g = await click(page, Z, 'Closing a phase (setting up)', await page.evaluate(() => window.__shot()));
    await finish(page, g.s);
    if (X !== Z) {
      g = await click(page, X, 'Opening the first phase (setting up)', await page.evaluate(() => window.__shot()));
      await finish(page, g.s);
      g = await click(page, X, 'Closing the first phase (setting up)', await page.evaluate(() => window.__shot()));
      await finish(page, g.s);
    }
    g = await click(page, X, 'Opening a phase again (setting up)', await page.evaluate(() => window.__shot()));
    let caught = await midway(page, g.s);
    g = await click(page, X, 'Closing a phase while it is still opening', caught);
    R.leaving = Object.keys(caught.groups).filter(k => !g.shot.groups[k]).length;
    await twice(page, g.s, 'Closing a phase while it is still opening');
    await finish(page, g.s);
    await settled('Closing a phase while it is still opening, at the end', page);

    // ═══ OPENING IT WHILE IT IS STILL CLOSING ═══════════════════════════
    g = await click(page, X, 'Opening a phase (setting up)', await page.evaluate(() => window.__shot()));
    await finish(page, g.s);
    g = await click(page, X, 'Closing a phase again (setting up)', await page.evaluate(() => window.__shot()));
    caught = await midway(page, g.s, 40);
    R.caughtLeaving = Object.keys(caught.ghosts).filter(k => caught.ghosts[k].a >= 0.3).length;
    if (!R.caughtLeaving) say('Opening a phase while it is still closing', 'nothing was on its way out half way through closing phase ' + X);
    g = await click(page, X, 'Opening a phase while it is still closing', caught);
    await twice(page, g.s, 'Opening a phase while it is still closing');
    await finish(page, g.s);
    await settled('Opening a phase while it is still closing, at the end', page);

    // ═══ ANOTHER PHASE WHILE ONE IS STILL FOLDING AWAY ═════════════════
    if (Y == null) R.another = 'SKIPPED-one-phase-only';
    else {
      g = await click(page, X, 'Closing a phase once more (setting up)', await page.evaluate(() => window.__shot()));
      caught = await midway(page, g.s, 40);
      g = await click(page, Y, 'Opening another phase while the first is still closing', caught);
      await twice(page, g.s, 'Opening another phase while the first is still closing');
      await finish(page, g.s);
      await settled('Opening another phase while the first is still closing, at the end', page);
      R.another = Y;
    }
  }
  await ctx.close();

  // ═══ REDUCED MOTION ════════════════════════════════════════════════════
  const still = await open(true);
  if (still.ids.length) {
    await still.page.evaluate(i => window.__toggle(i), still.ids[0]);
    const s = await settled('Reduced motion', still.page);
    const faint = Object.keys(s.groups).filter(k => s.groups[k].a < 0.99);
    if (faint.length) say('Reduced motion', faint.length + ' group(s) are drawn faded, though nothing is meant to fade');
  }
  await still.ctx.close();

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

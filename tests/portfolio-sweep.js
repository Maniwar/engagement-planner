/* ═══════════════════════════════════════════════════════════════════════════
   IS ANYBODY OVER, ONCE THE WHOLE BOOK IS ADDED UP?

   Every other panel in this product answers a question about ONE engagement.
   The portfolio answers the only one none of them can: somebody booked full
   time on two projects reads OK on both, because from inside either plan there
   is nothing to see. That is the reading this exists for, and it is the one
   worth checking hardest.

   So this builds a real book — three saved projects in the index, with
   overlapping people and deliberately conflicting capacities — and recomputes
   the answer from the raw per-day loads rather than reading portfolioData back,
   which would only prove portfolioData equals itself.

   The capacity conflict is not a corner case. The same name is 100% in one plan
   and 300% in another whenever somebody models a pooled team as a person, and a
   portfolio that silently picks one has invented its own denominator. The rule
   is: use the SMALLEST, and SAY the plans disagree — a warning you can dismiss
   by checking beats a reassurance you cannot.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', d => d.accept());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(data => { window.__fixture = data; hydrate(data); calculate(); }, DATA);
  await page.waitForTimeout(500);

  const R = await page.evaluate(() => {
    const bad = [], out = {};
    const say = (a, b2) => bad.push(a + ' :: ' + b2);
    if (typeof portfolioData !== 'function') { say('Portfolio', 'the portfolio is gone'); return { bad, out }; }

    /* A BOOK, WRITTEN DIRECTLY INTO THE INDEX. The index is exactly what a
       saved project publishes, so writing it is the same as having saved three
       projects — and it lets the numbers be chosen so the expected answer is
       known by hand rather than read off the thing being tested. */
    const prev = localStorage.getItem('pertGantt.projIndex');
    const act = activeProjectId();
    const book = {};
    book[act] = { name: 'Alpha', updatedAt: '2026-08-01T00:00:00Z',
      metrics: { finish: '2026-09-04', dur: 31.4, pct: 49, cost: 54293, over: 2, tasks: 23 },
      caps: { 'Deep Diver': 100, 'Solo Act': 100, 'Pool Team': 100 },
      load: { 'Deep Diver': { '2026-08-10': 60, '2026-08-11': 100 },
              'Solo Act':   { '2026-08-10': 90 },
              'Pool Team':  { '2026-08-10': 100 } } };
    book.pB = { name: 'Bravo', updatedAt: '2026-08-02T00:00:00Z',
      metrics: { finish: '2026-10-01', dur: 40, pct: 10, cost: 20000, over: 0, tasks: 9 },
      caps: { 'Deep Diver': 100, 'Pool Team': 300 },
      load: { 'Deep Diver': { '2026-08-10': 60 },
              'Pool Team':  { '2026-08-10': 150 } } };
    book.pC = { name: 'Charlie', updatedAt: '2026-08-03T00:00:00Z', metrics: null,
      caps: { 'Deep Diver': 100 },
      load: { 'Deep Diver': { '2026-08-11': 30 } } };
    localStorage.setItem('pertGantt.projIndex', JSON.stringify(book));

    const d = portfolioData();
    out.projects = d.projects.map(p => p.name);
    out.people = d.people.map(p => p.name + ' peak' + p.peak + '/cap' + p.cap + ' over' + p.overDays.length);
    out.totals = d.totals;

    /* ── the reading that matters, recomputed by hand ──────────────────────
       Deep Diver: Aug 10 is 60 (Alpha) + 60 (Bravo) = 120 against 100 → OVER,
       and NEITHER project sees it: 60 is innocent in both. Aug 11 is 100
       (Alpha) + 30 (Charlie) = 130 → also over. So two days.
       Solo Act: 90 on one project only → never over.
       Pool Team: Aug 10 is 100 + 150 = 250. Alpha says capacity 100, Bravo says
       300. The smallest is 100, so it is over AND the disagreement is flagged. */
    const dd = d.people.find(p => p.name === 'Deep Diver');
    if (!dd) say('Portfolio', 'Deep Diver works on three projects and does not appear at all');
    else {
      if (dd.overDays.length !== 2)
        say('Portfolio', 'Deep Diver is 60+60 on Aug 10 and 100+30 on Aug 11 against a capacity of 100 — '
          + 'two days over, and the portfolio reports ' + dd.overDays.length
          + '. Neither day is visible from inside any single plan, which is the whole reason this panel exists');
      if (Math.round(dd.peak) !== 130)
        say('Portfolio', 'Deep Diver\'s combined peak should be 130 (Aug 11) and reads ' + dd.peak);
      if (dd.projects.length !== 3)
        say('Portfolio', 'Deep Diver is claimed by three projects and the portfolio names '
          + dd.projects.length);
      /* The days must name WHO is claiming them, or the reading is "you are
         over" without the conversation that follows it. */
      const day = dd.overDays.find(x => x.iso === '2026-08-10');
      if (!day || Object.keys(day.from || {}).length !== 2)
        say('Portfolio', 'the Aug 10 conflict does not name both projects taking a share of Deep Diver');
    }
    const solo = d.people.find(p => p.name === 'Solo Act');
    if (solo && solo.overDays.length)
      say('Portfolio', 'Solo Act is on one project at 90% of 100 and is reported over — a portfolio that '
        + 'invents conflicts is worse than none, because every real one then reads as noise');

    /* ── the capacity conflict ──────────────────────────────────────────── */
    const pool = d.people.find(p => p.name === 'Pool Team');
    if (!pool) say('Portfolio', 'Pool Team is missing');
    else {
      if (pool.cap !== 100)
        say('Portfolio', 'Alpha says Pool Team is 100% and Bravo says 300%; the portfolio used ' + pool.cap
          + '. The smallest has to win, because it is the reading that makes the strongest claim about being '
          + 'over and can be checked, where the largest quietly hides the conflict');
      if (!pool.capDisagree)
        say('Portfolio', 'two plans disagree about Pool Team\'s capacity and the portfolio does not say so — '
          + 'it is presenting a number it picked as though it were a fact');
    }

    /* ── totals must not silently omit ─────────────────────────────────── */
    if (d.totals.unscheduled !== 1)
      say('Portfolio', 'Charlie has never been calculated and the totals report ' + d.totals.unscheduled
        + ' uncalculated projects — a total that quietly omits one is worse than one that says what it is missing');
    if (d.totals.cost !== 74293)
      say('Portfolio', 'the committed cost should be 54293 + 20000 = 74293 and reads ' + d.totals.cost);
    if (d.totals.overPeople !== 2)
      say('Portfolio', 'two people are over across the book and the totals say ' + d.totals.overPeople);

    /* ── and it has to DRAW, with the conflict first ────────────────────── */
    const host = document.createElement('div');
    host.innerHTML = portfolioHtml();
    document.body.appendChild(host);
    const heads = [...host.querySelectorAll('.pf-h')].map(h => h.textContent.trim());
    out.sections = heads;
    const rows = host.querySelectorAll('.pf-t tbody tr').length;
    out.rowsDrawn = rows;
    if (!/capacity/i.test(heads[0] || ''))
      say('Portfolio', 'the first thing on the panel is "' + (heads[0] || '(nothing)') + '" rather than the '
        + 'over-capacity reading — that reading is the only one here that is not already available inside a '
        + 'project, so anything above it is in front of the answer');
    if (rows < 5)
      say('Portfolio', 'only ' + rows + ' rows drew for three projects and three people');
    if (!/Pool Team/.test(host.textContent) || !/Deep Diver/.test(host.textContent))
      say('Portfolio', 'somebody who is over across the book is not named on the panel');
    if (/undefined|NaN|\[object/.test(host.textContent))
      say('Portfolio', 'the panel prints a broken value');
    host.remove();

    if (prev == null) localStorage.removeItem('pertGantt.projIndex');
    else localStorage.setItem('pertGantt.projIndex', prev);
    if (typeof otherProjectLoad === 'function') otherProjectLoad(true);   // drop the memo
    hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    return { bad, out };
  });

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if ((R.bad || []).length || errs.length) process.exitCode = 1;
})();

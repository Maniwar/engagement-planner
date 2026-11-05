/* ═══════════════════════════════════════════════════════════════════════════
   THE GANTT IN WEEKS AND DAYS, AND HOW FAR IT BREAKS OUT.

   Asked for: "i also want the gantt to support relative weeks / days and be
   able to control that view and breakout". A plan priced before its start date
   is fixed is talked about as "week 3", not as a date nobody has agreed, and
   the chart could only print dates. Its fold went to L2 and no further on a
   four-level plan, never said which level was on, and could not show the work
   person by person.

   What is required:
   · the Gantt toolbar has one Dates / Weeks / Days switch, folded into the zoom
     (−, +, Fit) rather than beside it, and it says which one is on;
   · Weeks labels the axis "Week 1, Week 2…" in 7-day blocks from the first
     working day and numbers each working day inside its week; Days numbers the
     working days 1, 2, 3… from the start. Weekends and holidays get no number.
     Counted here from the plan's own calendar, independently of the app;
   · every bar, milestone, baseline bar and the today line sits on the column
     whose label is its own date's position; hover text, milestone labels and
     the title line say that position; no calendar date is printed on the chart
     in a relative view;
   · the breakout buttons offer every WBS level the plan has, then All, then
     People; each level shows exactly its rows, says it is the one on, and folds
     the Tasks table the same way; a fold by hand leaves no level claiming it;
   · People draws one lane per person (owner and attendees) holding every one
     of their activities, with no two bars overlapping on one track; a lane
     opens into one row per activity and closes again; the chart says that its
     dependency arrows are drawn only when grouped by WBS;
   · the view is saved with the plan: it survives a reload and an export and
     import, adds no undo step, and a new plan starts on Dates;
   · the chart image and the status report show the view on screen.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

// A holiday inside the plan, so "no number on a holiday" is exercised, and a
// today inside the plan, so the today line is drawn at all.
const HOLIDAY = '2026-08-10';
const TODAY = '2026-08-12';
const PLAN = JSON.parse(JSON.stringify(DATA));
PLAN.holidays = [String(PLAN.holidays || '').trim(), HOLIDAY].filter(Boolean).join(', ');

// ═══ THE CALENDAR, COUNTED HERE ═══════════════════════════════════════════
const DAY = 86400000;
const ms = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const isoOf = t => new Date(t).toISOString().slice(0, 10);
const weekend = new Set(String(PLAN.weekendDays == null ? '0,6' : PLAN.weekendDays).split(',')
  .map(s => parseInt(s, 10)).filter(n => n >= 0 && n <= 6));
const hols = new Set(String(PLAN.holidays || '').split(',').map(s => s.trim()).filter(Boolean));
const working = t => !weekend.has(new Date(t).getUTCDay()) && !hols.has(isoOf(t));
let DAY1 = ms(PLAN.projectStart || '2026-01-05');
for (let g = 0; g < 14 && !working(DAY1); g++) DAY1 += DAY;
function rel(iso) {
  const t = ms(iso), off = Math.round((t - DAY1) / DAY);
  if (off < 0) return null;
  const ws = Math.floor(off / 7) * 7;
  let day = 0, wd = 0;
  for (let i = 0; i <= off; i++) if (working(DAY1 + i * DAY)) { day++; if (i >= ws) wd++; }
  return { off, day, week: Math.floor(off / 7) + 1, wd, working: working(t) };
}
const label = (iso, axis) => {
  const r = rel(iso);
  if (!r) return null;
  if (axis === 'weeks') return r.working ? 'Week ' + r.week + ', day ' + r.wd : 'Week ' + r.week + ', non-working day';
  return r.working ? 'Day ' + r.day : 'non-working day after Day ' + r.day;
};
// working-day numbers of the first and last working day in a 7-day block
const blockRange = week => {
  let a = 0, b = 0, n = 0;
  for (let i = 0; i < (week - 1) * 7 + 7; i++) if (working(DAY1 + i * DAY)) { n++; if (i >= (week - 1) * 7) { if (!a) a = n; b = n; } }
  return [a, b];
};

// the WBS, read from the file rather than from the app
const byId = {}; PLAN.tasks.forEach(t => { byId[t.id] = t; });
const kids = {}; PLAN.tasks.forEach(t => { if (t.parentId != null && byId[t.parentId]) (kids[t.parentId] = kids[t.parentId] || []).push(t.id); });
const depthOf = t => { let n = 0, c = t, g = 0; while (c.parentId != null && byId[c.parentId] && g++ < 50) { n++; c = byId[c.parentId]; } return n; };
const summaries = PLAN.tasks.filter(t => kids[t.id]);
const maxSumDepth = summaries.length ? Math.max(...summaries.map(depthOf)) : -1;
const leaves = PLAN.tasks.filter(t => !kids[t.id]);
const people = (() => {
  const m = new Map();
  leaves.forEach(t => {
    const seen = new Set(), names = [];
    [t.owner].concat((t.attendees || []).map(a => a.name)).forEach(n => {
      const s = String(n || '').trim(); if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); names.push(s); }
    });
    (names.length ? names : ['']).forEach(n => { if (!m.has(n)) m.set(n, []); m.get(n).push(t.id); });
  });
  const names = [...m.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (m.has('')) names.push('');
  return names.map(n => ({ name: n || 'Unassigned', ids: m.get(n).sort((a, b) => a - b) }));
})();

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(new Date(TODAY + 'T10:00:00'));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); refreshAll(); switchTab('gantt'); }, PLAN);
  await page.waitForTimeout(300);

  if (!leaves.length) say('plan', 'the plan holds no activities, so no bar, label or lane below can be checked against anything');

  // ═══ READING THE CHART ══════════════════════════════════════════════════
  const press = (seg, text) => page.evaluate(([s, tx]) => {
    const btn = [...document.querySelectorAll('#' + s + ' button')].find(x => x.textContent.trim() === tx);
    if (!btn) return false;
    btn.click(); return true;
  }, [seg, text]);
  const segState = seg => page.evaluate(s => [...document.querySelectorAll('#' + s + ' button')]
    .map(x => ({ t: x.textContent.trim(), on: x.getAttribute('aria-pressed') === 'true' })), seg);
  /* What is DRAWN, not what is on its way out: a fold glides the rows that
     leave as faded copies (.g-ghost) for a third of a second, and those copies
     carry the old rows' markers. */
  const chart = () => page.evaluate(() => {
    const svg = document.querySelector('#ganttContainer svg');
    if (!svg) return null;
    const live = sel => [...svg.querySelectorAll(sel)].filter(e => !e.closest('.g-ghost'));
    const txt = sel => live(sel).map(e => ({ x: +e.getAttribute('x'), t: e.textContent.trim(), w: e.getComputedTextLength() }));
    // every way the plan's own dates could be printed, to look for on a relative chart
    const dates = new Set();
    const add = d => { if (d) { dates.add(fmtNice(d)); dates.add(fmtDoc(d)); dates.add(fmtISO(d)); } };
    tasks.forEach(t => { add(t.startDate); add(t.finishDate); add(t.baseStart); add(t.baseFinish); });
    const sched = {};
    tasks.forEach(t => { sched[t.id] = { start: t.startDate ? fmtISO(t.startDate) : null, finish: t.finishDate ? fmtISO(t.finishDate) : null,
      sum: !!t.isSummary, ms: !!t.milestone, base: t.baseStart && t.baseFinish ? [fmtISO(t.baseStart), fmtISO(t.baseFinish)] : null, name: t.name }; });
    const today = svg.querySelector('line[data-gtoday]'), pill = svg.querySelector('g[data-gtoday]');
    return {
      x0: +svg.dataset.x0, dayW: +svg.dataset.dayw, start: svg.dataset.start,
      top: txt('[data-gaxis="top"]'), bottom: txt('[data-gaxis="bottom"]'),
      bars: live('g[data-grole="bar"]').map(g => {
        const r = g.querySelector('rect'), tl = g.querySelector('title'), tx = g.querySelector('text');
        let bb = null; try { const b = g.getBBox(); bb = [b.x, b.x + b.width]; } catch (e) {}
        return { id: +g.dataset.gopen, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), bb,
          tip: tl ? tl.textContent : '', text: tx ? tx.textContent.trim() : '' };
      }),
      rows: live('g[data-grole="row"]').map(g => +g.dataset.gopen),
      lanes: live('g[data-glane]').map(g => {
        const r = g.querySelector('rect');
        return { key: g.dataset.glane, text: g.textContent.replace(/\s+/g, ' ').trim(), y: +r.getAttribute('y'), h: +r.getAttribute('height') };
      }),
      base: live('rect[data-gbase]').map(r => ({ id: +r.dataset.gbase, x: +r.getAttribute('x'), tip: (r.querySelector('title') || {}).textContent || '' })),
      today: today ? +today.getAttribute('x1') : null,
      todayTip: pill && pill.querySelector('title') ? pill.querySelector('title').textContent : '',
      links: live('path[marker-end]').length,
      allText: live('text').map(e => e.textContent.trim()).filter(s => !/^Generated /.test(s)),
      tips: live('title').map(e => e.textContent),
      dates: [...dates],
      note: (document.getElementById('ganttImplNote') || {}).textContent || '',
      sched, collapsed: [...collapsedIds].sort((a, b) => a - b)
    };
  });
  const col = (C, iso) => Math.round((ms(iso) - ms(C.start)) / DAY);
  const colOfX = (C, x) => Math.floor((x - C.x0) / C.dayW + 1e-6);

  // ═══ THE SWITCH ═════════════════════════════════════════════════════════
  const V0 = await segState('ganttViewSeg');
  R.viewSeg = V0.map(v => v.t + (v.on ? '*' : ''));
  ['Dates', 'Weeks', 'Days', '−', '+', 'Fit'].forEach(t => {
    if (!V0.some(v => v.t === t)) say('Gantt toolbar', 'the view switch has no "' + t + '" button (it holds: ' + (V0.map(v => v.t).join(' · ') || 'nothing') + ')');
  });
  const onAxis = V => V.filter(v => ['Dates', 'Weeks', 'Days'].indexOf(v.t) >= 0 && v.on).map(v => v.t);
  if (onAxis(V0).join() !== 'Dates') say('Gantt toolbar', 'a plan with no saved view should open on Dates, and the switch says: ' + (onAxis(V0).join(', ') || 'nothing is on'));
  const C0 = await chart();
  if (!C0) say('Gantt', 'no chart was drawn');
  else if (C0.top.some(l => /^Week \d/.test(l.t))) say('Dates', 'the calendar axis prints relative weeks: ' + C0.top.map(l => l.t).slice(0, 4).join(' · '));

  // ═══ WEEKS AND DAYS ═════════════════════════════════════════════════════
  const checkAxis = async axis => {
    const at = axis === 'weeks' ? 'Weeks' : 'Days';
    if (!await press('ganttViewSeg', at)) { say(at, 'there is no ' + at + ' button to press'); return null; }
    await page.waitForTimeout(150);
    const V = await segState('ganttViewSeg');
    if (onAxis(V).join() !== at) say(at, 'after pressing ' + at + ' the switch says: ' + (onAxis(V).join(', ') || 'nothing is on'));
    const C = await chart();
    if (!C) { say(at, 'no chart was drawn'); return null; }
    if (!(C.dayW > 0) || !Number.isFinite(C.x0) || !C.start) { say(at, 'the chart does not say where its time axis starts or how wide a day is'); return C; }
    const fmt = iso => label(iso, axis);
    // top tier: one label per 7-day block from the first working day
    const day1Col = col(C, isoOf(DAY1));
    const tops = C.top.map(l => ({ c: Math.floor((l.x - 4 - C.x0) / C.dayW + 1e-6), t: l.t })).sort((a, b) => a.c - b.c);
    if (!tops.length) say(at, 'the time axis has no week labels');
    tops.forEach(l => {
      const k = (l.c - day1Col) / 7;
      if (!Number.isInteger(k)) { say(at, 'the label "' + l.t + '" starts on column ' + l.c + ', which is not the start of a week counted from Day 1 (column ' + day1Col + ')'); return; }
      const week = k + 1;
      if (axis === 'weeks') {
        if (!new RegExp('^(Week |W)' + week + '$').test(l.t)) say(at, 'the block starting on column ' + l.c + ' is week ' + week + ' but is labelled "' + l.t + '"');
      } else {
        const [a, z] = blockRange(week), m = /^(?:Days )?(\d+)–(\d+)$/.exec(l.t);
        if (!m || +m[1] !== a || +m[2] !== z) say(at, 'the block starting on column ' + l.c + ' holds working days ' + a + '–' + z + ' but is labelled "' + l.t + '"');
      }
    });
    // bottom tier: one number per working day, none on a weekend or holiday
    const bottoms = new Map(C.bottom.map(l => [colOfX(C, l.x), l.t]));
    if (C.dayW >= 13) {
      if (!bottoms.size) say(at, 'at ' + C.dayW + 'px a day the axis numbers no days');
      bottoms.forEach((t, c) => {
        const iso = isoOf(ms(C.start) + c * DAY), r = rel(iso);
        if (!r) { say(at, 'column ' + c + ' (' + iso + ') is before Day 1 but is numbered "' + t + '"'); return; }
        if (!r.working) { say(at, iso + ' is not a working day but is numbered "' + t + '"'); return; }
        const want = axis === 'weeks' ? String(r.wd) : String(r.day);
        if (t !== want && t !== 'Day ' + want) say(at, iso + ' is ' + fmt(iso) + ' but the axis numbers it "' + t + '"');
      });
      const holCol = col(C, HOLIDAY);
      if (holCol >= 0 && bottoms.has(holCol)) say(at, 'the holiday ' + HOLIDAY + ' is numbered "' + bottoms.get(holCol) + '"');
    }
    // every bar sits on its own date's column, and its hover says that position
    let checked = 0;
    C.bars.forEach(br => {
      const s = C.sched[br.id];
      if (!s || !s.start) return;
      const name = '"' + s.name + '"';
      if (!s.ms) {
        const want = C.x0 + col(C, s.start) * C.dayW;
        if (Math.abs(br.x - want) > 0.5) say(at, name + ' starts ' + s.start + ', column ' + col(C, s.start) + ', but its bar is drawn at column ' + ((br.x - C.x0) / C.dayW).toFixed(2));
        if (C.dayW >= 13 && !s.sum) {
          const lbl = bottoms.get(col(C, s.start)), r = rel(s.start);
          const want2 = r && (axis === 'weeks' ? String(r.wd) : String(r.day));
          if (r && lbl !== want2 && lbl !== 'Day ' + want2) say(at, name + ' starts on ' + fmt(s.start) + ' but the axis above its first column reads "' + (lbl || 'nothing') + '"');
        }
      } else {
        const c = Math.round((br.x + 7 - C.x0) / C.dayW);
        if (c !== col(C, s.start) && c !== col(C, s.start) + 1) say(at, 'the milestone ' + name + ' (' + s.start + ') is drawn at column ' + c);
        if (br.text.indexOf(fmt(s.finish)) < 0) say(at, 'the milestone ' + name + ' is on ' + fmt(s.finish) + ' but its label reads "' + br.text + '"');
      }
      const span = fmt(s.start) + ' → ' + fmt(s.finish);
      if (br.tip.indexOf(span) < 0) say(at, 'hovering ' + name + ' should say "' + span + '" and says "' + br.tip.split('\n').slice(0, 2).join(' / ') + '"');
      checked++;
    });
    if (leaves.length && !checked) say(at, 'no bar on the chart could be matched to an activity in the schedule');
    // baseline bars
    let baseSeen = 0;
    Object.keys(C.sched).forEach(id => {
      const s = C.sched[id];
      if (!s.base || s.sum || s.ms || !s.start || (s.base[0] === s.start && s.base[1] === s.finish)) return;
      if (C.rows.indexOf(+id) < 0) return;
      const bb = C.base.find(x => x.id === +id);
      if (!bb) { say(at, 'the baseline of "' + s.name + '" moved (' + s.base[0] + ') and no baseline bar is drawn for it'); return; }
      baseSeen++;
      const want = C.x0 + col(C, s.base[0]) * C.dayW;
      if (Math.abs(bb.x - want) > 0.5) say(at, 'the baseline bar of "' + s.name + '" should start on column ' + col(C, s.base[0]) + ' and starts on ' + ((bb.x - C.x0) / C.dayW).toFixed(2));
      const span = 'Baseline ' + fmt(s.base[0]) + ' → ' + fmt(s.base[1]);
      if (bb.tip.indexOf(span) < 0) say(at, 'hovering the baseline of "' + s.name + '" should say "' + span + '" and says "' + bb.tip + '"');
    });
    R[axis + 'Baselines'] = baseSeen;
    // the today line
    if (C.today == null) say(at, 'today (' + TODAY + ') is inside the plan and no today line is drawn');
    else {
      const want = C.x0 + col(C, TODAY) * C.dayW;
      if (Math.abs(C.today - want) > 0.5) say(at, 'the today line should be on column ' + col(C, TODAY) + ' and is on ' + ((C.today - C.x0) / C.dayW).toFixed(2));
      if (C.todayTip.indexOf(fmt(TODAY)) < 0) say(at, 'today is ' + fmt(TODAY) + ' and the TODAY marker says "' + C.todayTip + '"');
    }
    // no calendar date anywhere on a relative chart (the generation stamp aside)
    const dated = C.allText.concat(C.tips).filter(s => C.dates.some(d => s.indexOf(d) >= 0));
    if (dated.length) say(at, 'a relative chart still prints calendar dates: "' + dated.slice(0, 3).map(s => s.slice(0, 70)).join('" · "') + '"');
    return C;
  };
  const CW = await checkAxis('weeks');
  R.weeksTop = CW ? CW.top.slice(0, 4).map(l => l.t) : [];
  // zoomed right out, the labels still start on week boundaries and thin out
  // rather than print over each other (measured, not estimated)
  const zoomedOut = async at => {
    for (let i = 0; i < 12; i++) await press('ganttViewSeg', '−');
    await page.waitForTimeout(150);
    const CN = await chart();
    if (!CN || !CN.top.length) { say(at + ', zoomed out', 'zoomed out the axis has no labels at all'); return; }
    const xs = CN.top.slice().sort((a, b) => a.x - b.x);
    for (let i = 1; i < xs.length; i++) if (xs[i - 1].x + xs[i - 1].w > xs[i].x - 1) {
      say(at + ', zoomed out', '"' + xs[i - 1].t + '" and "' + xs[i].t + '" are drawn on top of each other at ' + CN.dayW + 'px a day'); break;
    }
    xs.forEach(l => { const c = Math.floor((l.x - 4 - CN.x0) / CN.dayW + 1e-6) - col(CN, isoOf(DAY1)); if (c % 7) say(at + ', zoomed out', '"' + l.t + '" is not at the start of a week'); });
    await press('ganttViewSeg', 'Fit'); await page.waitForTimeout(150);
  };
  await zoomedOut('Weeks');
  const VF = await segState('ganttViewSeg');
  if (!(VF.find(v => v.t === 'Fit') || {}).on) say('Gantt toolbar', 'after Fit, Fit does not say it is on');
  const CD = await checkAxis('days');
  R.daysTop = CD ? CD.top.slice(0, 4).map(l => l.t) : [];
  await zoomedOut('Days');

  // ═══ BREAKOUT ═══════════════════════════════════════════════════════════
  const B0 = await segState('ganttBreakSeg');
  R.breakSeg = B0.map(v => v.t + (v.on ? '*' : ''));
  const wantLevels = [];
  for (let k = 0; k <= maxSumDepth; k++) wantLevels.push('L' + (k + 1));
  const wantSeg = wantLevels.concat(['All', 'People']);
  if (B0.map(v => v.t).join(' · ') !== wantSeg.join(' · '))
    say('Breakout', 'the plan has ' + (maxSumDepth + 2) + ' WBS levels, so the buttons should be ' + wantSeg.join(' · ') + ' and are ' + (B0.map(v => v.t).join(' · ') || 'missing'));
  if (B0.filter(v => v.on).map(v => v.t).join() !== 'All') say('Breakout', 'an unfolded plan should show All as on, and shows: ' + (B0.filter(v => v.on).map(v => v.t).join(', ') || 'nothing'));
  for (let k = 0; k <= maxSumDepth; k++) {
    const at = 'Breakout L' + (k + 1);
    if (!await press('ganttBreakSeg', 'L' + (k + 1))) continue;
    await page.waitForTimeout(150);
    const C = await chart();
    const want = PLAN.tasks.filter(t => depthOf(t) <= k || (t.milestone && !kids[t.id])).map(t => t.id).sort((a, b) => a - b);
    const got = (C ? C.rows : []).slice().sort((a, b) => a - b);
    const missing = want.filter(id => got.indexOf(id) < 0), extra = got.filter(id => want.indexOf(id) < 0);
    if (missing.length) say(at, 'rows that should show are missing: ' + missing.map(id => '"' + byId[id].name + '"').join(', '));
    if (extra.length) say(at, 'rows deeper than level ' + (k + 1) + ' are shown: ' + extra.map(id => '"' + byId[id].name + '"').join(', '));
    const wantFold = summaries.filter(t => depthOf(t) >= k).map(t => t.id).sort((a, b) => a - b);
    if (C && C.collapsed.join() !== wantFold.join()) say(at, 'the shared fold should be ' + JSON.stringify(wantFold) + ' and is ' + JSON.stringify(C.collapsed));
    const S = await segState('ganttBreakSeg');
    if (S.filter(v => v.on).map(v => v.t).join() !== 'L' + (k + 1)) say(at, 'after pressing L' + (k + 1) + ' the buttons say ' + (S.filter(v => v.on).map(v => v.t).join(', ') || 'nothing is on'));
    // the Tasks table folds the same way
    const T = await page.evaluate(() => { switchTab('tasks'); const ids = [...document.querySelectorAll('tr[data-task-id]')].map(r => +r.dataset.taskId); switchTab('gantt'); return ids; });
    const hiddenLeak = T.filter(id => byId[id] && depthOf(byId[id]) > k && !byId[id].milestone);
    const shownMiss = PLAN.tasks.filter(t => depthOf(t) <= k && T.indexOf(t.id) < 0);
    if (hiddenLeak.length || shownMiss.length) say(at, 'the Tasks table is not folded to the same level: ' + (hiddenLeak.length ? 'shows ' + hiddenLeak.map(id => '"' + byId[id].name + '"').slice(0, 3).join(', ') : '') + (shownMiss.length ? ' hides ' + shownMiss.map(t => '"' + t.name + '"').slice(0, 3).join(', ') : ''));
  }
  await press('ganttBreakSeg', 'All'); await page.waitForTimeout(150);
  // a fold by hand is no level
  const hand = summaries.find(t => depthOf(t) === 0 && kids[t.id].some(c => kids[c]));
  if (hand) {
    await page.evaluate(id => { const g = document.querySelector('#ganttContainer [data-gtoggle="' + id + '"]'); if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, hand.id);
    await page.waitForTimeout(150);
    const S = await segState('ganttBreakSeg');
    if (S.some(v => v.on)) say('Breakout', 'after folding only "' + hand.name + '" by hand, ' + S.filter(v => v.on).map(v => v.t).join(', ') + ' still says it is on');
    await press('ganttBreakSeg', 'All'); await page.waitForTimeout(150);
  }

  // ═══ PEOPLE ═════════════════════════════════════════════════════════════
  const undo0 = await page.evaluate(() => undoStack.length);
  /* The case where a lane's milestone label can collide: the last gate sits
     near the right edge, so its label is drawn to the LEFT, over whatever the
     same person finished just before it. On the fixture that bar's own long
     name is printed past its end and happens to keep the gate off its track, so
     the bar is given a name that fits inside it and only the gate's label is
     left to make room for itself. */
  R.squeezed = await page.evaluate(() => {
    const ms = leafTasks().filter(t => t.milestone && t.owner && t.finishDate).sort((a, b) => b.finishDate - a.finishDate)[0];
    if (!ms) return null;
    const own = ms.owner.trim().toLowerCase();
    const prev = leafTasks().filter(t => !t.milestone && t.finishDate && t.finishDate <= ms.startDate
      && taskParticipants(t).some(p => p.name.toLowerCase() === own)).sort((a, b) => b.finishDate - a.finishDate)[0];
    if (!prev) return null;
    prev.name = 'Go';
    return { gate: ms.name, before: prev.id };
  });
  if (R.squeezed) byId[R.squeezed.before].name = 'Go';
  // Weeks, whose longer position text is what pushes that label to the left
  await press('ganttViewSeg', 'Weeks');
  if (await press('ganttBreakSeg', 'People')) {
    await page.waitForTimeout(200);
    const S = await segState('ganttBreakSeg');
    if (S.filter(v => v.on).map(v => v.t).join() !== 'People') say('People', 'after pressing People the buttons say ' + (S.filter(v => v.on).map(v => v.t).join(', ') || 'nothing is on'));
    const C = await chart();
    R.lanes = C ? C.lanes.map(l => l.text.slice(0, 30)) : [];
    if (!C || C.lanes.length !== people.length) say('People', 'the plan has ' + people.length + ' people (' + people.map(p => p.name).join(', ') + ') and the chart draws ' + (C ? C.lanes.length : 0) + ' lanes');
    else {
      people.forEach((p, i) => {
        const L = C.lanes[i];
        if (L.text.indexOf(p.name) < 0) { say('People', 'lane ' + (i + 1) + ' should be ' + p.name + ' and reads "' + L.text + '"'); return; }
        const inLane = C.bars.filter(br => br.y >= L.y && br.y < L.y + L.h);
        const ids = [...new Set(inLane.map(br => br.id))].sort((a, b) => a - b);
        if (ids.join() !== p.ids.join()) say('People', p.name + ' works on ' + p.ids.map(id => '"' + byId[id].name + '"').join(', ') + ' and the lane holds ' + (ids.map(id => '"' + (byId[id] || {}).name + '"').join(', ') || 'nothing'));
        const tracks = new Map();
        inLane.forEach(br => {
          const s = C.sched[br.id];
          if (s && !s.ms && s.start && Math.abs(br.x - (C.x0 + col(C, s.start) * C.dayW)) > 0.5) say('People', '"' + s.name + '" in ' + p.name + '’s lane is not drawn on its start date');
          // what is drawn, label included: a name printed past a short bar, or a
          // milestone's label, must not run into the next bar on the track either
          const ext = br.bb || (s && s.ms ? [br.x, br.x + 14] : [br.x, br.x + br.w]);
          // a track is a line through the middle of its shapes: a diamond's top
          // edge sits lower than a bar's, its centre does not
          const k = Math.round(br.y + br.h / 2); if (!tracks.has(k)) tracks.set(k, []); tracks.get(k).push(ext.concat([br.id]));
        });
        tracks.forEach(list => {
          list.sort((a, b) => a[0] - b[0]);
          for (let j = 1; j < list.length; j++) if (list[j][0] < list[j - 1][1] - 0.5)
            say('People', 'in ' + p.name + '’s lane "' + byId[list[j - 1][2]].name + '" and "' + byId[list[j][2]].name + '" are drawn over each other on one track');
        });
      });
      if (C.links) say('People', C.links + ' dependency arrows are drawn across the people lanes');
      if (!/WBS/.test(C.note)) say('People', 'the chart does not say that dependency arrows are drawn only when grouped by WBS (it says "' + C.note.trim() + '")');
      // a lane opens into its activities and closes again
      const p = people.find(x => x.ids.length > 1) || people[0];
      const key = C.lanes[people.indexOf(p)].key;
      await page.evaluate(k => document.querySelector('#ganttContainer g[data-glane="' + k + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), key);
      await page.waitForTimeout(150);
      const CO = await chart();
      const rowsOpen = CO ? CO.rows.slice().sort((a, b) => a - b) : [];
      if (rowsOpen.join() !== p.ids.join()) say('People', 'opening ' + p.name + ' should list ' + p.ids.length + ' activities as rows and lists ' + rowsOpen.length);
      R.opened = p.name;
    }
  } else say('People', 'there is no People button');
  const undo1 = await page.evaluate(() => undoStack.length);
  if (undo1 !== undo0) say('People', 'changing the view added ' + (undo1 - undo0) + ' undo step(s); a view is not an edit');
  // the SOW's chart is the scope at the scope table's depth: always by WBS
  const sow = await page.evaluate(async () => {
    const orig = buildGanttSvg; let seen = null;
    buildGanttSvg = function () { const r = orig.apply(this, arguments); seen = r.markup; return r; };
    try { await generateSOW(); } catch (e) { return { err: e.message }; } finally { buildGanttSvg = orig; }
    return { lanes: seen ? (seen.match(/data-glane=/g) || []).length : -1, rows: seen ? (seen.match(/data-grole="row"/g) || []).length : -1, group: ganttView.group };
  });
  R.sow = sow;
  if (sow.err) say('SOW', 'building the SOW threw: ' + sow.err);
  else {
    if (sow.lanes !== 0 || !(sow.rows > 0)) say('SOW', 'with the screen in people lanes, the SOW’s chart was drawn with ' + sow.lanes + ' lanes and ' + sow.rows + ' WBS rows, not by WBS');
    if (sow.group !== 'people') say('SOW', 'building the SOW left the screen grouped by ' + sow.group + ' instead of putting it back');
  }
  await page.evaluate(() => switchTab('gantt')); await page.waitForTimeout(150);

  // ═══ SAVED WITH THE PLAN ════════════════════════════════════════════════
  await press('ganttViewSeg', 'Weeks');
  await press('ganttViewSeg', '+');
  await page.waitForTimeout(150);
  const before = await page.evaluate(async () => { flushViewSave(); await persistNow(); return { v: serialize().ganttView || null, dayW: +((document.querySelector('#ganttContainer svg') || { dataset: {} }).dataset.dayw) }; });
  R.saved = before.v;
  if (!before.v) say('Saved', 'the saved plan carries no Gantt view');
  else {
    if (before.v.axis !== 'weeks') say('Saved', 'the saved axis is "' + before.v.axis + '", not weeks');
    if (before.v.group !== 'people') say('Saved', 'the saved breakout is "' + before.v.group + '", not people');
    if (R.opened && (before.v.open || []).indexOf(R.opened) < 0) say('Saved', 'the saved view does not remember that ' + R.opened + ' was opened');
  }
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof tasks !== 'undefined' && tasks.length > 0, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { if (!calculated) calculate(); switchTab('gantt'); });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ view: [...document.querySelectorAll('#ganttViewSeg button[aria-pressed="true"]')].map(x => x.textContent.trim()),
    brk: [...document.querySelectorAll('#ganttBreakSeg button[aria-pressed="true"]')].map(x => x.textContent.trim()),
    rows: [...document.querySelectorAll('#ganttContainer g[data-grole="row"]')].filter(g => !g.closest('.g-ghost')).length,
    lanes: document.querySelectorAll('#ganttContainer g[data-glane]').length,
    dayW: +((document.querySelector('#ganttContainer svg') || { dataset: {} }).dataset.dayw) }));
  if (after.view.indexOf('Weeks') < 0) say('Reload', 'after a reload the switch says ' + (after.view.join(', ') || 'nothing') + ', not Weeks');
  if (after.brk.join() !== 'People' || !after.lanes) say('Reload', 'after a reload the chart is not in people lanes (' + (after.brk.join(', ') || 'nothing on') + ', ' + after.lanes + ' lanes)');
  if (R.opened && !after.rows) say('Reload', 'after a reload ' + R.opened + '’s lane is closed again');
  if (after.dayW !== before.dayW) say('Reload', 'the zoom was ' + before.dayW + 'px a day and is ' + after.dayW + ' after a reload');
  // the chart image and the status report show what is on screen
  const ex = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(chartSvgMarkup('gantt'), 'image/svg+xml');
    const screen = [...document.querySelectorAll('#ganttContainer [data-gaxis="top"]')].map(e => e.textContent.trim());
    const img = [...doc.querySelectorAll('[data-gaxis="top"]')].map(e => e.textContent.trim());
    const lanes = doc.querySelectorAll('g[data-glane]').length;
    const ms = tasks.find(t => t.milestone && t.finishDate);
    return { screen, img, lanes, report: buildStatusReportHtml(), ms: ms ? fmtISO(ms.finishDate) : null, msDoc: ms ? fmtDoc(ms.finishDate) : null };
  });
  if (ex.img.join('|') !== ex.screen.join('|')) say('Export', 'the chart image labels its axis ' + ex.img.slice(0, 3).join(' · ') + ' while the screen shows ' + ex.screen.slice(0, 3).join(' · '));
  if (!ex.lanes) say('Export', 'the chart image is not grouped by person while the screen is');
  if (ex.ms && ex.report.indexOf(label(ex.ms, 'weeks')) < 0) say('Status report', 'in the Weeks view the report should date the milestone ' + label(ex.ms, 'weeks') + ' and does not');
  if (ex.ms && ex.report.indexOf(ex.msDoc) >= 0) say('Status report', 'in the Weeks view the report still prints the calendar date ' + ex.msDoc);
  // import elsewhere: the view travels with the file
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => errs.push(e.message));
  await page2.goto(APP, { waitUntil: 'load' });
  const imported = await page2.evaluate(d => { hydrate(d); calculate(); refreshAll(); switchTab('gantt');
    return { v: serialize().ganttView, on: [...document.querySelectorAll('#ganttViewSeg button[aria-pressed="true"], #ganttBreakSeg button[aria-pressed="true"]')].map(x => x.textContent.trim()) }; },
    await page.evaluate(() => JSON.parse(JSON.stringify(serialize()))));
  if (JSON.stringify(imported.v) !== JSON.stringify(before.v)) say('Import', 'the view read back from the file is ' + JSON.stringify(imported.v) + ', not ' + JSON.stringify(before.v));
  if (imported.on.indexOf('Weeks') < 0 || imported.on.indexOf('People') < 0) say('Import', 'an imported plan opens with ' + (imported.on.join(', ') || 'nothing') + ' on, not Weeks and People');
  // an older file with no view, and a new plan, start on Dates
  const older = await page2.evaluate(d => { hydrate(d); calculate(); refreshAll(); switchTab('gantt'); return serialize().ganttView; }, PLAN);
  if (!older || older.axis !== 'dates' || older.group !== 'wbs') say('Import', 'a file saved before views existed opens as ' + JSON.stringify(older) + ', not dates by WBS');
  const fresh = await page.evaluate(async () => { await newProject(false); return serialize().ganttView; });
  if (!fresh || fresh.axis !== 'dates' || fresh.group !== 'wbs' || fresh.zoom != null) say('New plan', 'a new plan starts with the view ' + JSON.stringify(fresh));

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

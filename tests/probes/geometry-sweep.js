/* ═══ WHAT THE SCREEN ACTUALLY DOES WITH THE TEXT ═══════════════════════════
   Behavioural assertions read innerHTML: they confirm a value was rendered, and
   are blind to it being rendered four pixels wide, underneath something else, or
   cut mid-word. Four defects in the ledger passed every such check.

   The classes below are the ones that survived assertions, stated as geometry:

     clipped   overflow hidden, content wider than the box, and NO ellipsis and
               NO line-clamp — text is simply gone, with nothing saying so
     crushed   a cell so narrow the text inside it cannot form a word
     overlap   two siblings whose boxes intersect
     overhang  content past the right edge of its own scroll container, where
               that container cannot scroll to reach it
     trapped   the container CAN scroll but by so little that the overflow is
               effectively unreachable — "technically scrollable, by 4px"
     escapes   a control wider than the cell that is supposed to bound it
     collide   two CONTROLS overlapping across a column boundary, so one takes
               clicks meant for the other
     buried    the browser's own hit test disagrees that you can click it —
               something is on top, or it takes no clicks at all — at every
               scroll position it can be seen from

   Every kind above except the last measures BOXES and infers reachability from
   them. `buried` asks the browser directly, which is why it is the one with no
   threshold in it, and why it catches the two shapes boxes cannot see: a scrim
   over a control (nothing to compare it TO), and pointer-events switched off
   (nothing to compare it WITH).

   Deliberately NOT reported: a healthy .table-wrap that scrolls sideways, a
   line-clamped cell, or an ellipsis on a genuinely long free-text field. Those
   are designs, not defects, and a probe that cries wolf on them gets ignored —
   which is how the real ones survive. Nor is a row passing under a sticky header
   or a pinned column: both are placed over content on purpose and the content is
   one scroll away. Judging burial across every scroll position rather than the
   first took a clean build from 138 findings to none, and the same rule applied
   to `collide` removed a sticky-column false positive at 1440px. */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('../_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

const SURFACES = [
  { id: 'tasks',     name: 'Activity list',        tab: 'tasks' },
  { id: 'wbs',       name: 'WBS dictionary',       tab: 'wbs' },
  { id: 'req',       name: 'Requirements',         tab: 'req' },
  { id: 'raid',      name: 'RAID log',             tab: 'raid' },
  { id: 'resources', name: 'Resources / cost',     tab: 'resources' },
  { id: 'baseline',  name: 'Plan vs actual',       tab: 'baseline' },
  { id: 'analytics', name: 'Analytics',            tab: 'analytics' }
];
/* 1440 earns its place: it is the commonest laptop, and it is inside the narrow
   band where #taskTable is wider than the window but only just — the one state
   in which the pinned actions column overlaps a real input. Three widths that
   all sat outside that band is how a sticky-column collision came to be found by
   the self-test rather than by the sweep. */
const WIDTHS = [1280, 1440, 1512, 1920];

const { AUDIT } = require('./geometry-lib.js');


(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const findings = [];
  for (const w of WIDTHS) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } });
    p.on('dialog', d => d.accept());
    await p.goto(APP, { waitUntil: 'load' });
    await p.evaluate(d => { hydrate(d); calculate(); }, DATA);
    await p.waitForTimeout(600);
    for (const s of SURFACES) {
      try {
        await p.evaluate(t => switchTab(t), s.tab);
        await p.waitForTimeout(700);
        const got = await p.evaluate(AUDIT);
        got.forEach(g => findings.push(Object.assign({ width: w, surface: s.name }, g)));
      } catch (e) { findings.push({ width: w, surface: s.name, kind: 'threw', detail: e.message.slice(0, 90) }); }
    }
    await p.close();
  }
  await b.close();

  /* HARD defects fail the build; TRUNCATED does not. An ellipsis is a designed
     answer to long free text, and a probe that reddens a commit over one is a
     probe people start passing --no-verify around. It is printed so a person can
     judge whether a column is doing its job, and that judgement stays theirs. */
  /* escapes and collide are HARD. A control wider than the cell meant to bound
     it, or one covering another control across a column boundary, is not a
     matter of taste like an ellipsis — it is a click landing on the wrong
     thing, which is how the roster's company picker came to open a company
     list when somebody aimed at the capacity figure beside it. */
  /* buried is HARD for the same reason: a control that takes no clicks anywhere
     is not a matter of taste. It is judged across every scroll position, so a
     row passing under a sticky header never reaches this list. */
  const HARD = ['clipped', 'crushed', 'overhang', 'trapped', 'page', 'threw', 'escapes', 'collide', 'buried'];
  const byKind = {};
  findings.forEach(f => { (byKind[f.kind] = byKind[f.kind] || []).push(f); });
  console.log('=== ' + findings.length + ' finding(s) ===');
  Object.keys(byKind).sort().forEach(k => {
    console.log('\n' + k.toUpperCase() + '  (' + byKind[k].length + ')');
    const seen = new Set();
    byKind[k].forEach(f => {
      const key = f.surface + f.cls + f.text.slice(0, 30);
      if (seen.has(key)) return; seen.add(key);
      console.log('  [' + f.width + '] ' + f.surface + ' · ' + (f.cls || f.tag)
        + '\n      ' + f.detail + (f.text ? '\n      text: "' + f.text + '"' : ''));
    });
  });
  const hard = findings.filter(f => HARD.indexOf(f.kind) >= 0);
  if (!findings.length) console.log('\nNothing clipped, crushed, overlapping or unreachable across '
    + SURFACES.length + ' surfaces x ' + WIDTHS.length + ' widths.');
  else if (!hard.length) console.log('\n' + findings.length + ' truncation note(s) only — nothing is '
    + 'unreachable. These are ellipses doing their job or a column that wants widening; your call.');
  if (hard.length) process.exitCode = 1;
})();

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

   Deliberately NOT reported: a healthy .table-wrap that scrolls sideways, a
   line-clamped cell, or an ellipsis on a genuinely long free-text field. Those
   are designs, not defects, and a probe that cries wolf on them gets ignored —
   which is how the real ones survive. */
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
const WIDTHS = [1280, 1512, 1920];

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
  const HARD = ['clipped', 'crushed', 'overhang', 'trapped', 'page', 'threw'];
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

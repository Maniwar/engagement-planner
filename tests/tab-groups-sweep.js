/* ═══════════════════════════════════════════════════════════════════════════
   THE TABS SAY WHICH STAGE OF THE WORK THEY BELONG TO.

   Nine equal tabs in one strip, several of them jargon (WBS, PERT), said
   nothing about how they relate. They fall into three stages of one job:
   PLAN the work (Tasks · WBS · Stories · PERT · Gantt), TRACK it against the
   plan (Resources · Plan vs actual · Analytics), and GOVERN what is agreed with
   the client (RAID & SOW). The strip now labels each stage and opens a gap
   between them.

   The labels are captions, not controls: aria-hidden, unfocusable, and outside
   the .tab set, so the tablist still owns exactly nine tabs, every tab id and
   deep link is unchanged, and the sliding pill — placed from the active tab's
   offsets inside the bar — still lands on the tab that is active.

   Checked at 1440, 1280 and on a 390px phone (where the strip scrolls):
   · the nine tabs, in their order, each still switches its view;
   · three labels, Plan / Track / Govern, each directly before its stage's
     first tab, hidden from assistive tech and never focusable;
   · the gap between two stages is visibly wider than the gap inside one;
   · on the desktop the strip is one row;
   · the pill sits on the active tab after every switch.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();
const ORDER = ['tasks', 'wbs', 'req', 'pert', 'gantt', 'resources', 'baseline', 'analytics', 'raid'];
const STAGES = [['Plan', 'tasks'], ['Track', 'resources'], ['Govern', 'raid']];

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  for (const [w, mobile] of [[1440, false], [1280, false], [390, true]]) {
    const at = w + 'px';
    const ctx = await b.newContext(Object.assign({ viewport: { width: w, height: 900 } }, mobile ? { isMobile: true, hasTouch: true } : {}));
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(APP, { waitUntil: 'load' });
    await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
    await page.waitForTimeout(400);

    const S = await page.evaluate(STAGES => {
      const bar = document.querySelector('.tabs[role="tablist"]');
      const kids = [...bar.children].filter(el => !el.classList.contains('tab-slider'));
      const tabs = [...bar.querySelectorAll('.tab[data-tab]')];
      const labels = [...bar.querySelectorAll('.tab-stage')];
      const lab = labels.map(l => {
        const next = l.nextElementSibling;
        return { text: l.textContent.trim(), hidden: l.getAttribute('aria-hidden') === 'true',
                 focusable: l.tabIndex >= 0 || /^(BUTTON|A|INPUT)$/.test(l.tagName),
                 before: next && next.dataset ? next.dataset.tab : null };
      });
      const r = el => el.getBoundingClientRect();
      // the gap after each tab, to the next tab
      const gaps = tabs.slice(0, -1).map((t, i) => ({ after: t.dataset.tab, gap: r(tabs[i + 1]).left - r(t).right }));
      return { order: tabs.map(t => t.dataset.tab), tabsAreDirectChildren: tabs.every(t => t.parentElement === bar),
               roleTabs: bar.querySelectorAll('[role="tab"]').length, labels: lab, gaps,
               rows: new Set(tabs.map(t => Math.round(r(t).top))).size,
               nonTabKids: kids.filter(el => !el.classList.contains('tab') && !el.classList.contains('tab-stage')).map(el => el.tagName) };
    }, STAGES);
    R['at' + w] = S;

    if (S.order.join() !== ORDER.join()) say(at, 'the tabs are ' + S.order.join(', ') + ' — the order (and so the deep links) changed');
    if (!S.tabsAreDirectChildren) say(at, 'a tab is no longer a direct child of the tablist, so the pill offsets and arrow-key order can drift');
    if (S.roleTabs !== 9) say(at, 'the tablist owns ' + S.roleTabs + ' role=tab elements, not 9');
    if (S.nonTabKids.length) say(at, 'the tablist holds something that is neither a tab nor a stage label: ' + S.nonTabKids.join(', '));
    STAGES.forEach(([name, first]) => {
      const l = S.labels.find(x => x.text.toLowerCase() === name.toLowerCase());
      if (!l) { say(at, 'no "' + name + '" stage label'); return; }
      if (l.before !== first) say(at, 'the "' + name + '" label sits before ' + l.before + ', not before ' + first);
      if (!l.hidden) say(at, 'the "' + name + '" label is read out as part of the tab list (no aria-hidden)');
      if (l.focusable) say(at, 'the "' + name + '" label takes keyboard focus — it is a caption, not a control');
    });
    if (S.labels.length !== STAGES.length) say(at, S.labels.length + ' stage labels, not ' + STAGES.length);
    if (!mobile) {
      if (S.rows > 1) say(at, 'the tab strip wraps onto ' + S.rows + ' rows');
      const inside = S.gaps.filter(g => !['gantt', 'analytics'].includes(g.after)).map(g => g.gap);
      const between = S.gaps.filter(g => ['gantt', 'analytics'].includes(g.after)).map(g => g.gap);
      const maxIn = Math.max(...inside), minBetween = Math.min(...between);
      if (!(minBetween >= maxIn + 12)) say(at, 'the gap between stages (' + Math.round(minBetween) + 'px) is not clearly wider than the gap inside one (' + Math.round(maxIn) + 'px)');
    }

    // every tab still switches its view, and the pill lands on it
    for (const t of ORDER) {
      await page.click('.tab[data-tab="' + t + '"]');
      await page.waitForTimeout(350);
      const P = await page.evaluate(t => {
        const tab = document.querySelector('.tab[data-tab="' + t + '"]'), sl = document.querySelector('.tab-slider');
        const view = document.getElementById('view-' + t);
        const a = tab.getBoundingClientRect(), s = sl ? sl.getBoundingClientRect() : null;
        return { active: tab.classList.contains('active') && tab.getAttribute('aria-selected') === 'true',
                 shown: !!view && view.classList.contains('active'),
                 off: s ? Math.max(Math.abs(a.left - s.left), Math.abs(a.width - s.width), Math.abs(a.top - s.top)) : 999 };
      }, t);
      if (!P.active) say(at, 'clicking ' + t + ' did not make it the selected tab');
      if (!P.shown) say(at, 'clicking ' + t + ' did not show view-' + t);
      if (P.off > 1.5) say(at, 'the pill is ' + Math.round(P.off) + 'px off the active tab (' + t + ')');
    }
    await ctx.close();
  }
  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

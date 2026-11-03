/* ═══════════════════════════════════════════════════════════════════════════
   THE HEADER ON A PHONE.

   At 390px the header was a two-column grid of full-width buttons — undo,
   redo, Project, Team, Export, each on half a row — under the app name and the
   project chip: about 450px of an 844px screen before the first tab. And the
   chip cut its project name off at the START ("lient Engagement – CRM |"): a
   centred flex row that overflows spills both ways, so the clipping took the
   first letters, which are the ones that say which project this is.

   What is required, at phone width and on the desktop:
   · the header leaves the screen to the plan (≤ 140px on a phone, and no
     taller than one row on a 1440 desktop);
   · the project name is read from its first letter, and a name too long for
     the chip ends in an ellipsis rather than a hard cut;
   · every header control is on screen, inside the viewport, at least 40px
     tall on a touch screen, and the menus still open where they can be read;
   · nothing scrolls sideways, and the app's name stays in the document for a
     screen reader even where it is not drawn.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

const MEASURE = () => {
  const hd = document.querySelector('header');
  const chip = document.getElementById('projChip');
  const name = chip && (chip.querySelector('b') || chip);
  const cr = chip.getBoundingClientRect(), nr = name.getBoundingClientRect();
  const cs = getComputedStyle(chip);
  const innerRight = cr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const ctrls = [...document.querySelectorAll('header .header-actions > button, header .header-actions > details > summary, header .header-actions > label')]
    .filter(el => getComputedStyle(el).display !== 'none')
    .map(el => { const r = el.getBoundingClientRect();
      return { label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20),
               left: r.left, right: r.right, w: r.width, h: r.height }; });
  const h1 = document.querySelector('header h1');
  return {
    vw: innerWidth,
    headerH: hd.getBoundingClientRect().height,
    pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1,
    headerOverflows: hd.scrollWidth > hd.clientWidth + 1,
    chipText: chip.textContent.trim(),
    nameStartClipped: nr.left < cr.left - 0.5,
    nameCut: name.scrollWidth > name.clientWidth + 1,
    // the name's own box running past the chip: the chip cuts it, and no ellipsis is drawn there
    nameRunsOut: nr.right > innerRight + 0.5,
    nameEllipsis: getComputedStyle(name).textOverflow === 'ellipsis',
    h1Text: h1 ? h1.textContent.trim() : '',
    h1Drawn: !!h1 && h1.getBoundingClientRect().width > 1,
    ctrls
  };
};

/* A name too long for any chip, set on purpose. The plan's own name happens to
   fit at every width checked here, so without this the rule that a long name
   yields at its END was never exercised. A mutant that let the name run out of
   the chip, or centred one that could not shrink, passed for that reason. */
const LONG_NAME = 'Northwind Holdings – Enterprise CRM Rollout, Data Migration and Service Desk Integration (Phase 2)';
const longName = async (page, at, say) => {
  await page.evaluate(n => { document.getElementById('projectName').value = n; renderConfigSummary(); }, LONG_NAME);
  const L = await page.evaluate(MEASURE);
  if (!L.nameCut && !L.nameRunsOut) say(at, 'a ' + LONG_NAME.length + '-character project name fits the chip, so the long-name rule was not exercised');
  if (L.nameStartClipped) say(at, 'a long project name is cut off at its START ("' + L.chipText.slice(0, 30) + '")');
  if (L.nameRunsOut) say(at, 'a long project name runs past the edge of the chip and is cut there, with no ellipsis');
  else if (L.nameCut && !L.nameEllipsis) say(at, 'a long project name is cut hard, with no ellipsis');
  if (L.pageScrollsSideways) say(at, 'a long project name makes the page scroll sideways');
  return L;
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const open = async (vp, mobile) => {
    const ctx = await b.newContext(Object.assign({ viewport: vp }, mobile ? { isMobile: true, hasTouch: true } : {}));
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(APP, { waitUntil: 'load' });
    await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
    await page.waitForTimeout(500);
    return { ctx, page };
  };

  // ═══ A PHONE ═════════════════════════════════════════════════════════════
  for (const w of [390, 360]) {
    const { ctx, page } = await open({ width: w, height: 844 }, true);
    const M = await page.evaluate(MEASURE);
    R['phone' + w] = M;
    const at = 'Phone ' + w + 'px';
    if (M.headerH > 140) say(at, 'the header is ' + Math.round(M.headerH) + 'px tall — more than 140px of the screen before the first tab');
    if (M.pageScrollsSideways) say(at, 'the page scrolls sideways');
    if (M.headerOverflows) say(at, 'the header content is wider than the header');
    if (M.nameStartClipped) say(at, 'the project name is cut off at its START ("' + M.chipText.slice(0, 30) + '")');
    if (M.nameCut && !M.nameEllipsis) say(at, 'a project name too long for the chip is cut hard, with no ellipsis');
    if (M.nameRunsOut) say(at, 'the project name runs past the edge of the chip and is cut there, with no ellipsis');
    if (!M.h1Text) say(at, 'the app name is gone from the document, so a screen reader has no page heading');
    if (M.ctrls.length < 5) say(at, 'only ' + M.ctrls.length + ' header controls are shown — undo, redo, Project, Team and Export must all be reachable');
    M.ctrls.forEach(c => {
      if (c.w < 1 || c.h < 1) say(at, '"' + c.label + '" is not drawn');
      if (c.left < -0.5 || c.right > M.vw + 0.5) say(at, '"' + c.label + '" is partly off screen (' + Math.round(c.left) + '–' + Math.round(c.right) + ')');
      if (c.h < 40) say(at, '"' + c.label + '" is ' + Math.round(c.h) + 'px tall — under 40px is a hard target on a touch screen');
    });
    // the menus still open, and open where they can be read
    const menus = await page.$$('header .header-actions > details > summary');
    for (const s of menus) {
      const label = (await s.textContent()).trim().slice(0, 12);
      await s.click();
      await page.waitForTimeout(150);
      const pop = await page.evaluate(sum => {
        const d = sum.parentElement; const box = d.querySelector(':scope > :not(summary)');
        if (!d.open || !box) return { open: d.open };
        const r = box.getBoundingClientRect();
        return { open: true, left: r.left, right: r.right, w: r.width, h: r.height };
      }, s);
      if (!pop.open) say(at, 'the ' + label + ' menu does not open');
      else if (pop.w < 1 || pop.left < -0.5 || pop.right > M.vw + 0.5) say(at, 'the ' + label + ' menu opens partly off screen');
      await s.click();
      await page.waitForTimeout(100);
    }
    R['phone' + w + 'LongName'] = await longName(page, at + ', long name', say);
    await ctx.close();
  }

  // ═══ THE DESKTOP — the phone fix must not cost a row here ═══════════════
  for (const w of [1280, 1440]) {
    const { ctx, page } = await open({ width: w, height: 900 }, false);
    const M = await page.evaluate(MEASURE);
    R['desk' + w] = M;
    const at = 'Desktop ' + w + 'px';
    if (M.headerH > 64) say(at, 'the header is ' + Math.round(M.headerH) + 'px tall — it has wrapped onto a second row');
    if (!M.h1Drawn) say(at, 'the app name is not drawn');
    if (M.nameStartClipped) say(at, 'the project name is cut off at its START');
    if (M.nameCut && !M.nameEllipsis) say(at, 'a project name too long for the chip is cut hard, with no ellipsis');
    if (M.nameRunsOut) say(at, 'the project name runs past the edge of the chip and is cut there, with no ellipsis');
    if (M.pageScrollsSideways) say(at, 'the page scrolls sideways');
    R['desk' + w + 'LongName'] = await longName(page, at + ', long name', say);
    await ctx.close();
  }

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

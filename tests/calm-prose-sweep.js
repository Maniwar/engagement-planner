/* ═══════════════════════════════════════════════════════════════════════════
   THE WORKING FOLDS UNDER THE NUMBERS.

   Analytics and Plan vs actual explain themselves at length, inline: the
   Budget row's note alone ran to 4,500 characters under its bar, and every
   panel without an API key opened on the same 235-character paragraph saying
   so. The method text is worth having and wrong to lead with — the bar, the
   chip and the figure beside it ARE the reading — so a long note now shows its
   first two lines and folds the rest under "How this is measured", and the
   no-key notice is one short line that can be dismissed for every panel.

   Folded, not removed: the text stays in the DOM, and a line clamp keeps it
   laid out, so every check that reads these sentences reads all of them, and
   a printed page shows them in full. A note that is opened stays open when the
   panel repaints, which on this page is constant.

   · every visible note over 400 characters on Analytics and Plan vs actual is
     clamped to about two lines, with a "How this is measured" toggle beside it;
   · the toggle opens it in full, says so (aria-expanded), and the note stays
     open through a repaint;
   · in print every note is whole and no toggle is printed;
   · the no-key notice is one short line with Add a key and a dismiss, and
     dismissing it clears it from every panel, across a reload.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();
const VIEWS = ['analytics', 'baseline'];
const MIN = 400;

const NOTES = MIN => [...document.querySelectorAll('#view-analytics *, #view-baseline *')].filter(e => {
  // a live readout (the spend curve's hover value) is output, not working, and folding it would hide the value
  if (e.closest('[aria-live]')) return false;
  if (!e.offsetParent || /^(BUTTON|SUMMARY|TABLE|TBODY|TR|TD|TH|UL|OL|SVG|SELECT)$/.test(e.tagName)) return false;
  const own = [...e.childNodes].filter(n => n.nodeType === 3 || /^(B|I|EM|STRONG|SPAN|A|CODE)$/.test(n.tagName || '')).map(n => n.textContent).join('').trim();
  return own.length > MIN;
});

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss());
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  await page.waitForTimeout(500);

  for (const v of VIEWS) {
    await page.evaluate(x => switchTab(x), v); await page.waitForTimeout(500);
    const S = await page.evaluate(([NOTES_SRC, MIN]) => {
      const NOTES = eval(NOTES_SRC);
      return NOTES(MIN).filter(e => e.closest('#view-' + document.querySelector('.tab.active').dataset.tab)).map(e => {
        const lh = parseFloat(getComputedStyle(e).lineHeight) || 18;
        const t = e.nextElementSibling;
        return { cls: String(e.className).split(' ')[0] || e.tagName, len: e.textContent.trim().length, h: e.clientHeight, lh,
          full: e.scrollHeight, toggle: !!t && t.classList.contains('calm-toggle'), label: t ? t.textContent.trim() : '',
          exp: t ? t.getAttribute('aria-expanded') : null };
      });
    }, [NOTES.toString(), MIN]);
    R[v] = S;
    if (!S.length) say(v, 'no note over ' + MIN + ' characters is drawn, so nothing here was checked');
    S.forEach(n => {
      if (n.h > n.lh * 3.3) say(v, '.' + n.cls + ' (' + n.len + ' chars) is drawn ' + Math.round(n.h / n.lh) + ' lines tall — the working is leading, not the reading');
      if (!n.toggle) say(v, '.' + n.cls + ' is folded with no "How this is measured" toggle beside it');
      else if (!/how this is measured/i.test(n.label)) say(v, '.' + n.cls + ' toggle reads "' + n.label + '"');
      else if (n.exp !== 'false') say(v, '.' + n.cls + ' toggle does not say it is closed (aria-expanded=' + n.exp + ')');
    });

    // open the first one, repaint, and it must still be open
    const O = await page.evaluate(() => {
      const t = document.querySelector('#view-' + document.querySelector('.tab.active').dataset.tab + ' .calm-toggle');
      if (!t) return null;
      const note = t.previousElementSibling; t.click();
      const opened = { exp: t.getAttribute('aria-expanded'), whole: note.clientHeight >= note.scrollHeight - 2 };
      try { renderPlanTruth(); renderBaseline(); } catch (e) {}
      return { opened, cls: String(note.className).split(' ')[0] };
    });
    await page.waitForTimeout(250);
    if (O) {
      const after = await page.evaluate(cls => { const n = document.querySelector('#view-' + document.querySelector('.tab.active').dataset.tab + ' .' + cls + '.calm');
        const t = n && n.nextElementSibling; return n ? { exp: t && t.getAttribute('aria-expanded'), whole: n.clientHeight >= n.scrollHeight - 2 } : null; }, O.cls);
      if (O.opened.exp !== 'true' || !O.opened.whole) say(v, 'the toggle did not open .' + O.cls + ' in full');
      if (!after || after.exp !== 'true' || !after.whole) say(v, 'an opened .' + O.cls + ' closed again when the panel repainted');
    }
  }

  // print: whole notes, no toggles
  await page.evaluate(x => switchTab(x), 'analytics'); await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' });
  const P = await page.evaluate(() => ({ cut: [...document.querySelectorAll('#view-analytics .calm')].filter(n => n.offsetParent && n.clientHeight < n.scrollHeight - 2).length,
    toggles: [...document.querySelectorAll('#view-analytics .calm-toggle')].filter(t => getComputedStyle(t).display !== 'none').length }));
  await page.emulateMedia({ media: 'screen' });
  R.print = P;
  if (P.cut) say('Print', P.cut + ' note(s) print folded — a printed page has no toggle to open them');
  if (P.toggles) say('Print', P.toggles + ' "How this is measured" toggle(s) are printed');

  // the no-key notice
  const K = await page.evaluate(() => {
    const n = [...document.querySelectorAll('[data-state="nokey"]')].filter(x => x.offsetParent);
    const first = n[0];
    return { count: n.length, len: first ? first.textContent.replace(/\s+/g, ' ').trim().length : 0,
      says: first ? /Readings are off/.test(first.textContent) : false,
      add: first ? !!first.querySelector('button') && /add a key/i.test(first.textContent) : false,
      dismiss: first ? !!first.querySelector('[data-nokey-hide]') : false };
  });
  R.nokey = K;
  if (!K.count) say('No-key notice', 'no notice is shown without a key, so there was nothing to check');
  else {
    if (K.len > 140) say('No-key notice', 'the notice is ' + K.len + ' characters — one line is the point');
    if (!K.says) say('No-key notice', 'the notice no longer says "Readings are off"');
    if (!K.add) say('No-key notice', 'the notice has no Add a key button');
    if (!K.dismiss) say('No-key notice', 'the notice cannot be dismissed');
    else {
      await page.locator('[data-state="nokey"] [data-nokey-hide]:visible').first().click(); await page.waitForTimeout(300);
      const left = async () => { let c = 0; for (const v of ['analytics', 'baseline', 'raid']) { await page.evaluate(x => switchTab(x), v); await page.waitForTimeout(300);
        c += await page.evaluate(() => [...document.querySelectorAll('[data-state="nokey"]')].filter(x => x.offsetParent).length); } return c; };
      const now = await left();
      if (now) say('No-key notice', 'dismissing it left ' + now + ' notice(s) on other panels');
      await page.reload({ waitUntil: 'load' }); await page.evaluate(d => { hydrate(d); calculate(); }, DATA); await page.waitForTimeout(400);
      const later = await left();
      if (later) say('No-key notice', 'the dismissal did not survive a reload (' + later + ' back)');
    }
  }
  await ctx.close();
  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

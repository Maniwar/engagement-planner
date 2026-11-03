/* ═══════════════════════════════════════════════════════════════════════════
   THE DARK THEME.

   There was none — prefers-color-scheme appeared nowhere in the file, in a
   tool people sit in all day. The theme is now Auto (the operating system's),
   Light or Dark, chosen in the Project menu and applied before first paint.

   How it is built decides what can go wrong, so that is what is checked:
   every stylesheet colour became a token whose LIGHT value is the hex it
   replaced, and the dark theme mirrors each one; inline styles and SVG colour
   attributes written by script are overridden from the stylesheet by their
   exact text, because the reports and chart exports carry that markup out of
   the page and must not change.

   · RESOLUTION: Auto follows the system, live; a stored Light or Dark wins
     over it; the switch persists and says which is on.
   · WHAT LEAVES THE PAGE: the Gantt SVG export and the email-ready status
     report are byte-identical in both themes.
   · READABLE: no text that is readable in the light theme becomes unreadable
     in the dark one (< 3:1 against what is actually behind it). Judged per
     element on the same DOM in both themes, so a light-theme weakness is not
     blamed on the dark theme — and a dark-theme one is not excused by it.
   · NO LIGHT PATCHES: in the dark theme nothing outside the header paints a
     pale ground — the tell-tale of a colour the override never reached.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();
const TABS = ['tasks', 'wbs', 'req', 'pert', 'gantt', 'resources', 'baseline', 'analytics', 'raid'];

const SCAN = () => {
  const px = c => { const m = String(c || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const ground = el => { let n = el; while (n) { const c = px(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c; n = n.parentElement; }
    return { r: 255, g: 255, b: 255, a: 1 }; };
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) >= 0.35; };
  const out = { text: [], patches: [] };
  const all = document.querySelectorAll('body *');
  all.forEach((el, idx) => {
    if (el.closest('header, svg, [aria-hidden="true"], .no-dark-check') || el.disabled) return;
    if (!visible(el)) return;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim());
    const cs = getComputedStyle(el);
    if (own) { const fg = px(cs.color); if (fg && fg.a > 0.3) out.text.push({ idx, r: ratio(fg, ground(el)),
      t: el.textContent.trim().slice(0, 32), cls: String(el.className || '').slice(0, 30), id: (el.closest('[id]') || {}).id || '' }); }
    const bg = px(cs.backgroundColor); const rr = el.getBoundingClientRect();
    if (bg && bg.a > 0.6 && rr.width >= 6 && rr.height >= 6 && Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) < 24 && !/^(IMG|CANVAS|VIDEO)$/.test(el.tagName))
      out.patches.push({ idx, l: lum(bg), cls: String(el.className || '').slice(0, 30), tag: el.tagName, id: (el.closest('[id]') || {}).id || '',
        style: (el.getAttribute('style') || '').slice(0, 70), bg: cs.backgroundColor });
  });
  return out;
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const open = async (scheme, stored) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    if (stored) await ctx.addInitScript(v => { try { localStorage.setItem('pertGantt.theme', v); } catch (e) {} }, stored);
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss());
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(APP, { waitUntil: 'load' });
    return { ctx, page };
  };
  const isDark = page => page.evaluate(() => document.documentElement.classList.contains('theme-dark'));

  // ═══ RESOLUTION ═════════════════════════════════════════════════════════
  for (const [scheme, stored, want] of [['dark', null, true], ['light', null, false], ['dark', 'light', false], ['light', 'dark', true]]) {
    const { ctx, page } = await open(scheme, stored);
    const got = await isDark(page);
    if (got !== want) say('Theme', 'system ' + scheme + ' with ' + (stored || 'nothing') + ' stored drew the ' + (got ? 'dark' : 'light') + ' theme');
    if (scheme === 'dark' && !stored) {
      const g = await page.evaluate(() => { const c = getComputedStyle(document.body); return { bg: c.backgroundColor, fg: c.color }; });
      R.darkBody = g;
      await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(100);
      if (await isDark(page)) say('Theme', 'Auto did not follow the system to light while the page was open');
      await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(100);
      if (!(await isDark(page))) say('Theme', 'Auto did not follow the system back to dark');
      // the switch, from the Project menu
      await page.click('header .header-actions > details:nth-of-type(1) > summary'); await page.waitForTimeout(150);
      const btn = await page.$('[data-theme-set="light"]');
      if (!btn) say('Theme', 'the Project menu has no Light / Dark / Auto switch');
      else {
        await btn.click(); await page.waitForTimeout(100);
        const st = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('theme-dark'), stored: localStorage.getItem('pertGantt.theme'),
          pressed: [...document.querySelectorAll('[data-theme-set]')].filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.getAttribute('data-theme-set')) }));
        if (st.dark) say('Theme', 'choosing Light left the dark theme on');
        if (st.stored !== 'light') say('Theme', 'choosing Light was not stored (' + st.stored + ')');
        if (st.pressed.join() !== 'light') say('Theme', 'the switch shows ' + (st.pressed.join() || 'nothing') + ' as chosen, not light');
        // a menu item closes its menu, as every other one does — reopen it
        if (!(await page.isVisible('[data-theme-set="auto"]'))) { await page.click('header .header-actions > details:nth-of-type(1) > summary'); await page.waitForTimeout(150); }
        await page.click('[data-theme-set="auto"]'); await page.waitForTimeout(100);
        if (!(await isDark(page))) say('Theme', 'back on Auto under a dark system, the light theme stayed');
      }
    }
    await ctx.close();
  }

  // ═══ EXPORTS, READABILITY, PATCHES — one DOM, both themes ═══════════════
  const { ctx, page } = await open('light', 'light');
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  /* measured, not watched: controls fade their colours over .15s, so a reading
     taken just after the theme flips is a frame of the fade, not either theme */
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  await page.waitForTimeout(500);
  const ex = await page.evaluate(() => {
    const set = d => document.documentElement.classList.toggle('theme-dark', d);
    switchTab('gantt');
    set(false); const a = { svg: chartSvgMarkup('gantt'), rep: buildStatusReportHtml() };
    set(true); const b = { svg: chartSvgMarkup('gantt'), rep: buildStatusReportHtml() };
    set(false);
    return { svgSame: a.svg === b.svg, repSame: a.rep === b.rep, svgLen: (a.svg || '').length, repLen: (a.rep || '').length };
  });
  R.exports = ex;
  if (!ex.svgLen) say('Export', 'the Gantt SVG export came back empty, so it was not compared');
  if (!ex.svgSame) say('Export', 'the Gantt SVG export differs between the themes — the dark theme leaked into a file that leaves the page');
  if (!ex.repSame) say('Export', 'the status report differs between the themes — the dark theme leaked into an email');

  const unreadable = [], patches = [];
  for (const t of TABS) {
    await page.evaluate(x => switchTab(x), t); await page.waitForTimeout(350);
    await page.evaluate(() => document.querySelectorAll('main details').forEach(d => { d.open = true; })); await page.waitForTimeout(200);
    const L = await page.evaluate(SCAN);
    await page.evaluate(() => document.documentElement.classList.add('theme-dark')); await page.waitForTimeout(80);
    const D = await page.evaluate(SCAN);
    await page.evaluate(() => document.documentElement.classList.remove('theme-dark'));
    const lr = new Map(L.text.map(x => [x.idx, x.r]));
    D.text.forEach(x => { const was = lr.get(x.idx); if (x.r < 3 && (was === undefined || was >= 3))
      unreadable.push(t + ' · ' + (x.id ? '#' + x.id + ' ' : '') + (x.cls ? '.' + x.cls.split(' ')[0] + ' ' : '') + '"' + x.t + '" ' + x.r.toFixed(2) + ':1 (light ' + (was ? was.toFixed(2) : '?') + ')'); });
    /* a SURFACE that was pale in the light theme and is still pale: a colour the
       dark theme never reached. A neutral that was dark and is now pale is a chip
       inverting on purpose, and a coloured mark (a bar, a dot) is data, not ground. */
    const lp = new Map(L.patches.map(x => [x.idx, x.l]));
    D.patches.filter(p => p.l > 0.55 && (lp.get(p.idx) || 0) > 0.55).forEach(p => patches.push(t + ' · ' + p.tag.toLowerCase() + (p.id ? ' in #' + p.id : '') + (p.cls ? ' .' + p.cls.split(' ')[0] : '') + ' ' + p.bg + (p.style ? ' style="' + p.style + '"' : '')));
  }
  await ctx.close();
  const uniq = a => [...new Set(a)];
  R.unreadable = uniq(unreadable); R.patches = uniq(patches);
  R.unreadable.slice(0, 40).forEach(x => say('Unreadable in dark', x));
  if (R.unreadable.length > 40) say('Unreadable in dark', '…and ' + (R.unreadable.length - 40) + ' more');
  R.patches.slice(0, 40).forEach(x => say('Light patch in dark', x));
  if (R.patches.length > 40) say('Light patch in dark', '…and ' + (R.patches.length - 40) + ' more');

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

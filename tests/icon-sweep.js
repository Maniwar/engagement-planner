/* ═══════════════════════════════════════════════════════════════════════════
   ONE ICON SET.

   The controls used emoji as icons — 📂 👥 🤖 📌 ⚖️ 💰 and fifty-odd more —
   next to text glyphs like ↶ ↷ for undo and redo. Emoji are drawn by the
   operating system, in its own colours and at its own size, so the same
   button looked different on every machine and none of them took the text
   colour of the control they sat in. The chrome now draws one stroke icon set
   (Lucide, ISC licence) as a CSS mask filled with currentColor, so an icon is
   the colour of its button in every state and every theme.

   Scope, deliberately: CONTROLS AND TITLES — buttons, menu summaries, card
   headings and the .ico slot. Messages, alerts, toasts and the email-ready
   reports keep their emoji: those are text that leaves the page, and an icon
   drawn by this page's CSS would arrive in an email as nothing at all.

   What is checked, on the rendered page across every tab and every header
   menu (the rendered DOM, not the source, so a button built by string
   concatenation is held to it too):
   · no visible button, summary, heading or icon slot carries an emoji;
   · every icon names one that exists — a typo in data-i draws nothing;
   · a control that is only an icon still has a name for a screen reader.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();
const TABS = ['tasks', 'wbs', 'req', 'pert', 'gantt', 'resources', 'baseline', 'analytics', 'raid'];

const SCAN = () => {
  const PICT = /\p{Extended_Pictographic}/u;
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const where = el => { const c = el.closest('[id]'); return c ? '#' + c.id : el.tagName; };
  const emoji = [], unresolved = [], unnamed = [];
  document.querySelectorAll('button, summary, h1, h2, h3, h4, .ico, .tab').forEach(el => {
    if (!vis(el)) return;
    const own = (el.textContent || '').trim();
    if (PICT.test(own)) emoji.push(where(el) + ' ' + el.tagName.toLowerCase() + ': "' + own.slice(0, 40) + '"');
  });
  document.querySelectorAll('.ico[data-i]').forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    const m = cs.maskImage || cs.webkitMaskImage || 'none';
    if (m === 'none' || !/url\(/.test(m)) unresolved.push(el.getAttribute('data-i') + ' in ' + where(el));
  });
  document.querySelectorAll('button, summary').forEach(el => {
    if (!vis(el)) return;
    const text = (el.textContent || '').replace(/[\s▾▴▸·]+/g, '');
    if (!text && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('input, select'))
      unnamed.push(where(el) + ' ' + el.outerHTML.slice(0, 80));
  });
  return { emoji, unresolved, unnamed, icons: document.querySelectorAll('.ico[data-i]').length };
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  await page.waitForTimeout(500);

  const seen = { emoji: new Set(), unresolved: new Set(), unnamed: new Set() };
  let icons = 0;
  const take = r => { ['emoji', 'unresolved', 'unnamed'].forEach(k => r[k].forEach(x => seen[k].add(x))); icons = Math.max(icons, r.icons); };
  for (const t of TABS) {
    await page.evaluate(x => switchTab(x), t);
    await page.waitForTimeout(500);
    take(await page.evaluate(SCAN));
  }
  // every header menu, opened
  const menus = await page.$$('header .header-actions > details > summary');
  for (const s of menus) {
    await s.click(); await page.waitForTimeout(150);
    take(await page.evaluate(SCAN));
    await s.click(); await page.waitForTimeout(80);
  }

  const R = { iconsDrawn: icons, emoji: [...seen.emoji], unresolved: [...seen.unresolved], unnamed: [...seen.unnamed], contradictions: [] };
  R.emoji.slice(0, 40).forEach(x => R.contradictions.push('Emoji icon :: ' + x));
  if (R.emoji.length > 40) R.contradictions.push('Emoji icon :: …and ' + (R.emoji.length - 40) + ' more');
  R.unresolved.forEach(x => R.contradictions.push('Unknown icon :: data-i="' + x + '" draws nothing'));
  R.unnamed.forEach(x => R.contradictions.push('Unnamed control :: ' + x));
  if (!icons) R.contradictions.push('Icon set :: no .ico[data-i] icon is drawn anywhere — the set is not wired in');
  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

/* ═══════════════════════════════════════════════════════════════════════════
   ONE NEXT STEP PER SCREEN.

   The Stories ▸ Findings room showed five filled blue buttons at once, two of
   them twice (the counters at the top repeated the boxes below), and the
   brightest button on the "not linked" box was the one that adds an activity
   per story to the plan and the price, while the safe Auto-relink beside it was
   the faint one. The boxes were pale light-theme colours written into the
   markup, which dark mode recoloured into deep red and brown slabs. The same
   pattern ran through the rest of the app.

   What is required, on every tab and every sub-tab, with the plan as it is and
   with problems planted on purpose:
   · R1  at most one main (filled blue) button on a screen, and in an open dialog;
   · R2  no action offered twice on one screen;
   · R3  an action that adds, replaces or deletes in bulk is never the main button;
   · R4  no notice is a pale box painted inline; notices are .finding rows, whose
         surface is the card's own in both themes, with a severity edge;
   · R5  a button label is at most 32 characters and carries no parenthetical;
   · R6  a heading carries at most one ⓘ;
   · R7  the Stories findings run in working order (clean up → link → cover →
         wording), the blue is the first safe step, "create an activity per
         story" is never blue, and Relink says how many it can fix;
   · R8  a toolbar shows at most five things; the rest are one click away
         behind More, not gone.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE, EMPTY_PLAN } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();
const TABS = ['tasks', 'wbs', 'req', 'pert', 'gantt', 'resources', 'baseline', 'analytics', 'raid'];

/* Handlers that change many things at once or delete. Listed here, not read
   from a marker in the app, so a build that drops its own marker cannot pass. */
const BULK = /^(createTasksFromUnlinked|cleanup\w*|delete\w*|remove\w*|purge\w*|wipe\w*|clear\w*|reset\w*|replace\w*|discard\w*|regenerate\w*|resetAll\w*)\s*\(/;
/* Going somewhere is not doing something: the same activity is reachable from
   its chip in several cells, a sub-tab from its counter, an entry from its row.
   Those may repeat. Opening a SPECIFIC item needs its argument; "add a new one"
   (no argument) is an action and may not. */
const NAV = /^(reqGoto|reqOpenView|reqCloseView|switchTab\w*|scrollTo\w*|toggle\w*|raidImpactToggle)\(|^(openEditModal|openReqStory|openStoryModal|wlOpenPerson|openRaidForm)\([^)]/;
const PASTEL = /background:\s*#(fef2f2|fee2e2|fff7ed|fffbeb|fef3c7|fefce8|fef9c3|eff6ff|f0fdf4|ecfeff|ecfdf5|faf5ff|f5f3ff|ede9fe)\b/i;

/* Everything a person can press on one screen, measured in the page. */
const SCREEN = ([rootSel, PASTEL_SRC]) => {
  const PASTEL = new RegExp(PASTEL_SRC, 'i');
  const root = document.querySelector(rootSel);
  if (!root) return null;
  const shown = el => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05;
  };
  const act = el => (el.getAttribute('onclick') || '').replace(/event\.(stopPropagation|preventDefault)\(\);?/g, '').replace(/\s+/g, '');
  const label = el => ((el.innerText || '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || '').trim();
  const ctrls = [...root.querySelectorAll('button, summary, a[onclick], [role="button"], input[type="button"]')]
    .filter(el => shown(el) && !el.closest('.tabs, .tab-bar, [role="tablist"]'))
    .map(el => ({ tag: el.tagName, label: label(el).slice(0, 80), act: act(el),
      primary: el.classList.contains('btn-primary') && !el.disabled,
      btn: [...el.classList].some(c => /^btn(-|$)/.test(c)),
      disabled: !!el.disabled, danger: el.classList.contains('btn-danger') }));
  const alerts = [...root.querySelectorAll('div, section, p')].filter(el => {
    const st = el.getAttribute('style') || '';
    if (!PASTEL.test(st) || !/border(-left)?\s*:\s*1px/.test(st) || !shown(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 200 && r.height > 28 && (el.innerText || '').trim().length > 20;
  }).map(el => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70));
  const heads = [...root.querySelectorAll('h1, h2, h3, h4')].filter(shown)
    .map(h => ({ t: (h.innerText || '').trim().slice(0, 50), n: [...h.querySelectorAll('.info-icon')].filter(shown).length }))
    .filter(h => h.n > 1);
  const bars = [...root.querySelectorAll('.toolbar, .chart-toolbar')].filter(shown).map(tb => {
    const items = [...tb.children].filter(c => shown(c) && (c.matches('button, details, a[onclick], label, .seg, .btn-group, [role="group"]')
      || c.querySelector('button')));
    return { n: items.length, labels: items.map(c => label(c).slice(0, 24)) };
  }).filter(b => b.n > 5);
  return { ctrls, alerts, heads, bars };
};

const judge = (at, S, say, { modal } = {}) => {
  const btns = S ? S.ctrls.filter(c => c.btn) : [];
  if (!S) { say(at, 'the screen was not found'); return; }
  const prim = S.ctrls.filter(c => c.primary);
  if (prim.length > 1) say(at, prim.length + ' main buttons at once: ' + prim.map(c => '"' + c.label + '"').join(', '));
  prim.filter(c => BULK.test(c.act)).forEach(c => say(at, '"' + c.label + '" changes or deletes in bulk (' + c.act.slice(0, 40) + ') and is styled as the main button'));
  if (!modal) {
    const seen = {};
    S.ctrls.filter(c => c.act && !c.disabled && !NAV.test(c.act)).forEach(c => { (seen[c.act] = seen[c.act] || []).push(c.label); });
    Object.entries(seen).filter(([, l]) => l.length > 1).forEach(([a, l]) => say(at, 'the same action is offered ' + l.length + ' times: ' + l.map(x => '"' + x.slice(0, 30) + '"').join(' and ') + ' → ' + a.slice(0, 50)));
  }
  btns.forEach(c => {
    if (c.label.length > 32) say(at, 'button label is ' + c.label.length + ' characters: "' + c.label + '"');
    else if (/\([^)]*[a-z]{2,}[^)]*\)/i.test(c.label)) say(at, 'button label carries a parenthetical: "' + c.label + '"');
  });
  S.alerts.forEach(t => say(at, 'a notice is a pale box painted inline: "' + t + '"'));
  S.heads.forEach(h => say(at, 'heading "' + h.t + '" carries ' + h.n + ' ⓘ'));
  S.bars.forEach(b => say(at, 'a toolbar shows ' + b.n + ' things: ' + b.labels.join(' · ')));
};

/* Problems planted on purpose, so the notices that only appear on a troubled
   plan are drawn and judged too. */
const PLANT = () => {
  const st = reqs.stories;
  const live = st.filter(s => s.wbsId != null && tasks.some(t => t.id === s.wbsId));
  if (live.length < 3) return null;
  const a = live[0], b = live[1], c = live[2];
  // one story whose activity id is stale but whose remembered name still matches: Relink can fix it
  a.wbsName = tasks.find(t => t.id === a.wbsId).name; a.wbsId = 990001; a.wbsIds = [990001];
  // one whose activity is gone altogether: Relink cannot
  b.wbsId = 990002; b.wbsIds = [990002]; b.wbsName = 'An activity that was deleted long ago';
  // wording a reviewer would flag
  c.persona = 'user';
  // a clone from the old risk fix
  const src = tasks.find(t => !t.milestone && !isSummaryId(t.id));
  tasks.push(makeTask(Object.assign({}, src, { id: nextId++, name: src.name + ' (Parallel Track)', predecessors: [] })));
  // one person on two things at once, so Workload draws its conflict cards
  const who = (tasks.find(t => !t.milestone && !isSummaryId(t.id) && t.owner && resources[t.owner]) || {}).owner;
  if (who) ['Parallel review A', 'Parallel review B'].forEach(nm =>
    tasks.push(makeTask({ id: nextId++, name: nm, o: 4, m: 5, p: 6, owner: who, units: 100, audience: 'internal', predecessors: [] })));
  // a client-facing activity nobody has written a story for
  tasks.push(makeTask({ id: nextId++, name: 'Client walkthrough of the new queues', o: 1, m: 2, p: 3, audience: 'client', predecessors: [] }));
  calculate();
  return { relinkable: 1 };
};

(async () => {
  const br = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [], screens: {} };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss());
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  await page.waitForTimeout(400);

  const walk = async state => {
    for (const tab of TABS) {
      await page.evaluate(x => switchTab(x), tab); await page.waitForTimeout(350);
      const subs = await page.evaluate(t => [...document.querySelectorAll('#view-' + t + ' .stab')].map((s, i) => i), tab);
      const runs = subs.length ? subs : [null];
      for (const i of runs) {
        let name = tab;
        if (i != null) {
          // a sub-tab strip can redraw on click (an empty plan has fewer), so each is found afresh
          name = await page.evaluate(([t, i]) => { const s = document.querySelectorAll('#view-' + t + ' .stab')[i]; if (!s) return null; s.click(); return t + '▸' + s.innerText.replace(/\s+\d+$/, '').trim(); }, [tab, i]);
          if (!name) continue;
          await page.waitForTimeout(300);
        }
        const S = await page.evaluate(SCREEN, ['#view-' + tab, PASTEL.source]);
        R.screens[state + ' ' + name] = S && { ctrls: S.ctrls.length, primary: S.ctrls.filter(c => c.primary).map(c => c.label) };
        judge(state + ' · ' + name, S, say);
      }
    }
  };

  await walk('plan');

  // dialogs: each judged on its own
  for (const [nm, open] of [['Add activity', 'openAddModal(false)'], ['Edit activity', 'openEditModal(tasks.find(t => !t.milestone && !isSummaryId(t.id)).id)'], ['Add story', 'openStoryModal(null)']]) {
    await page.evaluate(o => { try { eval(o); } catch (e) {} }, open); await page.waitForTimeout(300);
    const sel = await page.evaluate(() => { const m = [...document.querySelectorAll('.modal, .overlay, [role="dialog"]')].filter(x => x.getClientRects().length && getComputedStyle(x).display !== 'none').pop(); if (!m) return null; m.setAttribute('data-ah', '1'); return '[data-ah="1"]'; });
    if (!sel) { say('dialog ' + nm, 'did not open'); continue; }
    judge('dialog ' + nm, await page.evaluate(SCREEN, [sel, PASTEL.source]), say, { modal: true });
    await page.evaluate(() => { const m = document.querySelector('[data-ah="1"]'); m.removeAttribute('data-ah'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); try { closeModal(); } catch (e) {} });
    await page.waitForTimeout(250);
  }

  // ═══ A TROUBLED PLAN ════════════════════════════════════════════════════
  const P = await page.evaluate(PLANT);
  if (!P) say('troubled', 'the plan has fewer than three linked stories, so no problems could be planted');
  await page.waitForTimeout(300);
  await walk('troubled');

  // R7 — the Findings room reads in working order
  await page.evaluate(() => reqGoto('findings')); await page.waitForTimeout(400);
  const F = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#view-req .finding')].filter(r => r.getClientRects().length);
    return rows.map(r => ({ id: r.id || '', kind: r.dataset.kind || '', sev: [...r.classList].find(c => /^is-/.test(c)) || '',
      text: (r.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
      btns: [...r.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => ({ l: b.innerText.trim(), a: (b.getAttribute('onclick') || ''), p: b.classList.contains('btn-primary'), d: b.disabled })) }));
  });
  R.findings = F;
  const ORDER = ['cleanup', 'link', 'cover', 'wording'];
  const kinds = F.map(r => r.kind);
  if (F.length < 4) say('troubled · findings', 'only ' + F.length + ' finding rows are drawn for a plan planted with a clone, two unlinked stories, an uncovered activity and a vague persona');
  if (kinds.some(k => !ORDER.includes(k))) say('troubled · findings', 'a finding row does not say what kind of step it is: ' + JSON.stringify(kinds));
  for (let i = 1; i < kinds.length; i++) if (ORDER.indexOf(kinds[i]) < ORDER.indexOf(kinds[i - 1])) say('troubled · findings', 'rows are out of working order: ' + kinds.join(' → '));
  F.forEach(r => { if (!r.sev) say('troubled · findings', 'row "' + r.text.slice(0, 40) + '" carries no severity'); });
  const blue = F.flatMap(r => r.btns.filter(b => b.p).map(b => Object.assign({ row: r.kind }, b)));
  const firstSafe = F.flatMap(r => r.btns.map(b => Object.assign({ row: r.kind }, b))).find(b => !b.d && !BULK.test(b.a));
  if (blue.length !== 1) say('troubled · findings', blue.length + ' blue buttons among the findings (want exactly one, the next step)');
  else if (firstSafe && blue[0].a !== firstSafe.a) say('troubled · findings', 'the blue button is "' + blue[0].l + '", not the first safe step "' + firstSafe.l + '"');
  const link = F.find(r => r.kind === 'link');
  if (link) {
    const rel = link.btns.find(b => /repairOrphanStories/.test(b.a));
    const mk = link.btns.find(b => /createTasksFromUnlinked/.test(b.a));
    if (!rel) say('troubled · findings', 'the unlinked-stories row offers no Relink');
    else if (!new RegExp('\\b' + (P ? P.relinkable : 1) + '\\b').test(rel.l)) say('troubled · findings', 'Relink does not say how many it can fix (' + (P ? P.relinkable : 1) + '): "' + rel.l + '"');
    if (!mk) say('troubled · findings', 'the unlinked-stories row lost its create-activities action');
    else if (mk.p) say('troubled · findings', '"' + mk.l + '" adds an activity per story to the plan and the price, and is blue');
  }

  // the counters at the top report; they do not repeat an action
  const G = await page.evaluate(() => [...document.querySelectorAll('#view-req .rq-gauges [onclick]')].map(e => e.getAttribute('onclick')));
  G.filter(a => !/reqGoto/.test(a)).forEach(a => say('troubled · counters', 'a counter performs an action instead of going to its finding: ' + a.slice(0, 50)));

  // R4 in the dark: a notice is the card's own surface, with a coloured edge —
  // the shared .finding row and every class that draws a notice of its own
  await page.evaluate(() => { try { setTheme('dark'); } catch (e) { document.documentElement.classList.add('theme-dark'); } });
  await page.waitForTimeout(300);
  const NOTICE = '.finding, td.finding-cell, .io-findings, .pa-lock, .rf-box, .co-gap';
  const DARK = ([sel]) => {
    const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return 0; const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    // brightness alone misses a slab: a deep brown and the slate card are 1.19:1 and nothing like the same colour
    const dist = (a, b) => { const p = a.match(/[\d.]+/g).map(Number), q = b.match(/[\d.]+/g).map(Number); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
    // the card's own colour, read from the token itself: the first .card on the
    // page is the AI builder's, whose gradient reads as transparent
    const probe = document.createElement('div'); probe.style.background = 'var(--card)'; document.body.appendChild(probe);
    const card = getComputedStyle(probe).backgroundColor; probe.remove();
    return [...document.querySelectorAll('.view.active ' + sel.split(', ').join(', .view.active '))].filter(r => r.getClientRects().length).map(r => {
      const cs = getComputedStyle(r);
      return { cls: String(r.className).split(' ').slice(0, 2).join('.'), text: (r.innerText || '').replace(/\s+/g, ' ').slice(0, 40), surface: ratio(cs.backgroundColor, card), hue: dist(cs.backgroundColor, card), bg: cs.backgroundColor };
    }).filter(d => d.surface > 1.25 || d.hue > 40);
  };
  for (const tab of TABS) {
    await page.evaluate(x => switchTab(x), tab); await page.waitForTimeout(250);
    const n = await page.evaluate(t => document.querySelectorAll('#view-' + t + ' .stab').length, tab);
    for (let i = 0; i < Math.max(1, n); i++) {
      if (n) { const ok = await page.evaluate(([t, i]) => { const s = document.querySelectorAll('#view-' + t + ' .stab')[i]; if (s) s.click(); return !!s; }, [tab, i]); if (!ok) continue; await page.waitForTimeout(250); }
      (await page.evaluate(DARK, [NOTICE])).forEach(d => say('dark · ' + tab, '.' + d.cls + ' "' + d.text + '" is a slab of colour (' + d.bg + ') against the card'));
    }
  }
  await page.evaluate(() => reqGoto('findings')); await page.waitForTimeout(300);
  const D = await page.evaluate(() => {
    const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return 0; const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const probe = document.createElement('div'); probe.style.background = 'var(--card)'; document.body.appendChild(probe);
    const card = getComputedStyle(probe).backgroundColor; probe.remove();
    return [...document.querySelectorAll('#view-req .finding')].filter(r => r.getClientRects().length).map(r => {
      const cs = getComputedStyle(r);
      const dist = (a, b) => { const p = a.match(/[\d.]+/g).map(Number), q = b.match(/[\d.]+/g).map(Number); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
      return { bg: cs.backgroundColor, card, surface: ratio(cs.backgroundColor, card), hue: dist(cs.backgroundColor, card), edge: cs.borderLeftColor, edgeW: parseFloat(cs.borderLeftWidth), ink: ratio(cs.color, cs.backgroundColor) };
    });
  });
  R.dark = D;
  D.forEach((d, i) => {
    if (d.surface > 1.25 || d.hue > 40) say('dark · finding ' + (i + 1), 'its surface (' + d.bg + ') is a slab of colour against the card (' + d.card + ')');
    if (d.edgeW < 2) say('dark · finding ' + (i + 1), 'no severity edge');
    if (d.ink < 4.5) say('dark · finding ' + (i + 1), 'text contrast ' + d.ink.toFixed(2));
  });

  // ═══ NO BASELINE YET — its notice offers Set baseline today, so the toolbar
  // copy of the same action waits until there is one to update ═════════════
  await page.evaluate(() => { try { setTheme('light'); } catch (e) {} baselineDate = null; switchTab('baseline'); try { renderBaseline(); } catch (e) {} });
  await page.waitForTimeout(300);
  judge('no baseline · baseline', await page.evaluate(SCREEN, ['#view-baseline', PASTEL.source]), say);

  // ═══ AN EMPTY PLAN — the empty pages carry their own main buttons ══════
  await page.evaluate(() => { try { setTheme('light'); } catch (e) { document.documentElement.classList.remove('theme-dark'); } });
  await page.evaluate(d => { hydrate(d); calculate(); try { refreshAll(); } catch (e) {} }, EMPTY_PLAN);
  await page.waitForTimeout(300);
  await walk('empty');

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await br.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

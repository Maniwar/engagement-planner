/* ═══════════════════════════════════════════════════════════════════════════
   IS THIS CONTROL DRAWN IN THE COLOUR OF THE THING BEHIND IT?

   Reported by use, not by any check: "buttons to reorder are not visible."

   They were not missing. `.btn-ghost` is a HEADER class — white text on a
   transparent ground with a translucent white border — which is right on the
   dark header bar and invisible anywhere else. The SOW section picker used it
   inside a white dialog, so two buttons rendered white-on-white with a white
   border, under a sentence promising "use ↑ ↓ to reorder". They were in the
   DOM, focusable, clickable, and unreadable.

   NOTHING IN THE SUITE COULD SEE IT, and that is the point of this file. The
   geometry probe asks whether a box is clipped, crushed, overlapping,
   overhanging or trapped — every one of those is a question about GEOMETRY, and
   this box is perfect. pointer-stability asks what sits under the cursor; the
   button is there and answers correctly. Behavioural assertions read
   innerHTML, and the markup is exactly right. An invisible control passes every
   check written so far, which is how one shipped.

   So this asks the one question none of them ask: take the colour the control
   is painted in and the colour of whatever is behind it, and see whether a
   person could tell them apart.

   TWO SEVERITIES, because they are not the same event.

     INVISIBLE  a contrast ratio near 1 — the control is the same colour as its
                ground. There is no design in which this is intended, so it
                fails the build.
     FAINT      below the 3:1 that WCAG asks of a non-text control. Real, worth
                looking at, and a matter of judgement often enough that gating
                on it would get the gate switched off. Printed, not failed —
                the same split the geometry probe makes between a clipped cell
                and an ellipsis doing its job.

   WHAT IT DELIBERATELY IGNORES, so that what it does report can be trusted:

     · disabled controls, and toggles that SAY they are off (aria-pressed
       false, aria-disabled true). Recessed is what OFF MEANS, and a probe that
       reports the greyed-out half of every toolbar is a probe nobody reads.
       The test is the control's own declaration, not a guess at class names:
       "wk-day off" is a struck-through weekday chip at 2.34:1 and the
       recession is the entire point of it, but skipping anything whose class
       contains "off" would be reading English rather than state.
     · controls with no text, unless the border is the only thing drawing them —
       an icon painted by a background image or a pseudo-element is not
       something a computed colour can speak to, and guessing would be worse
       than silence.
     · anything the geometry probe would already have caught for being zero-
       sized or off-screen. One defect, one owner.

   SHOWN TO FIRE, against the build as it was reported: the shipped fix turned
   out to be TWO things — a `.modal .btn-ghost` rule and an inline colour on the
   buttons themselves — and reverting only the rule left them dark, because an
   inline style beats a stylesheet. With both reverted the probe reports 20
   invisible controls at a contrast ratio of 1, naming the ↑ and ↓ of the SOW
   sections dialog. Worth writing down: a probe verified against the wrong
   revert is a probe verified against nothing.

   AND WHAT IT CANNOT SAY: it compares a control against the first opaque thing
   behind it in the ancestor chain. A control sitting over an image, a gradient
   whose stops differ, or a sibling painted underneath it by z-index is beyond
   what getComputedStyle can answer, and those are reported as clean. This
   narrows the hole; it does not close it.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('../_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

/* Every surface, plus the dialogs — which is where the reported defect lived
   and where a header class is most likely to be reused off its ground. */
const TABS = ['tasks', 'wbs', 'req', 'pert', 'gantt', 'resources', 'baseline', 'analytics', 'raid'];

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1512, height: 1000 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    window.__contrast = function (label) {
      const out = [];
      const px = c => {
        const m = String(c || '').match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(x => parseFloat(x));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      /* The first ancestor that actually paints. A transparent background is
         not a colour, it is a hole, and the thing seen through it is whatever
         is behind — which is exactly the mistake the reported defect made. */
      const groundOf = el => {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = px(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0.95) return c;
          n = n.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };
      const lum = c => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const ratio = (a, b2) => {
        const l1 = lum(a), l2 = lum(b2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const sel = 'button, a[href], summary, [role="button"], input[type="button"], input[type="submit"]';
      [...document.querySelectorAll(sel)].forEach(el => {
        if (el.disabled) return;                       // recessed is what disabled means
        // …and a toggle that declares itself off is saying the same thing
        if (el.getAttribute('aria-pressed') === 'false') return;
        if (el.getAttribute('aria-disabled') === 'true') return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 4 || r.height < 4) return;       // the geometry probe owns this
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        if (el.offsetParent === null && cs.position !== 'fixed') return;
        if (parseFloat(cs.opacity) < 0.35) return;     // deliberately faded, and it says so
        const own = px(cs.backgroundColor);
        const ground = (own && own.a > 0.95) ? own : groundOf(el.parentElement || el);
        const txt = (el.textContent || '').trim();
        const rows = [];
        if (txt) {
          const fg = px(cs.color);
          if (fg && fg.a > 0.3) rows.push({ what: 'text', c: fg });
        } else {
          /* No text: the border is the only thing drawing it, so that is what
             has to be visible. An icon painted by an image or a pseudo-element
             is beyond a computed colour and is left alone rather than guessed
             at. */
          const bw = parseFloat(cs.borderTopWidth) || 0;
          const bc = px(cs.borderTopColor);
          if (bw > 0 && bc && bc.a > 0.3) rows.push({ what: 'border', c: bc });
        }
        rows.forEach(row => {
          const cr = ratio(row.c, ground);
          if (cr >= 3) return;
          out.push({ surface: label, kind: cr < 1.35 ? 'invisible' : 'faint',
            ratio: Math.round(cr * 100) / 100, part: row.what,
            cls: String(el.className || '').slice(0, 44),
            label: (txt || el.getAttribute('aria-label') || el.title || '(no text)').slice(0, 40),
            fg: 'rgb(' + [row.c.r, row.c.g, row.c.b].join(',') + ')',
            bg: 'rgb(' + [ground.r, ground.g, ground.b].join(',') + ')' });
        });
      });
      return out;
    };
  });

  const findings = [];
  for (const t of TABS) {
    await page.evaluate(x => switchTab(x), t);
    await page.waitForTimeout(260);
    findings.push(...await page.evaluate(x => window.__contrast(x), t));
  }

  /* THE DIALOGS, which is where the reported defect lived. A modal is opened by
     a function rather than by a tab, so it is invisible to any sweep that only
     walks the tab strip — and a white dialog is exactly where a class written
     for the dark header goes wrong. */
  /* Openers are EXPRESSIONS, not bare names: the join dialog needs a trunk and
     a kinship reading to describe, and a probe that could only reach zero-arg
     functions would have quietly left the one dialog whose whole job is being
     read out of the sweep. */
  const MODALS = [
    ['SOW sections', "sowOpenSections()"],
    ['Project settings', "openProjSettings()"],
    ['Recovery', "openRecovery()"],
    ['Sync guide', "openSyncGuide()"],
    ['Join histories', "trunkJoinAsk('twin', { name: 'Trunk file', lineage: 'lin_a1' }, "
      + "{ shared: 0, mine: 3, theirs: 9, who: ['Sam Okafor'], myLineage: 'lin_a1', "
      + "theirLineage: 'lin_a1', theirName: 'Trunk file' })"],
    ['Join histories · shared', "trunkJoinAsk('kin', { name: 'Trunk file', lineage: 'lin_b2' }, "
      + "{ shared: 2, mine: 5, theirs: 9, who: ['Sam Okafor'], myLineage: 'lin_a1', "
      + "theirLineage: 'lin_b2', theirName: 'Trunk file' })"]
  ];
  const skipped = [];
  for (const [name, expr] of MODALS) {
    /* AND THE TEST IS THAT A DIALOG APPEARED, not that a name resolved. This
       shipped naming the SOW sections dialog "openSowSections", which is not
       what the function is called — so the one surface the probe was WRITTEN
       for was never opened, and the miss was pushed into a list only invisible
       and faint findings are ever read out of. The probe reported a clean build
       having looked at nine tabs and three dialogs, and said 13. Asking the
       screen closes that gap for openers that resolve and then do nothing. */
    const thrown = await page.evaluate(e => {
      try { (0, eval)(e); } catch (err) { return 'threw: ' + String(err.message || err).slice(0, 60); }
      return null;
    }, expr);
    /* WAITED FOR, not sampled. Half these openers are async — the Recovery
       dialog reads IndexedDB before it draws anything — so asking the same tick
       the call was made reports "nothing opened" about a dialog that opens
       fine a moment later. The first version of this check did exactly that and
       reported the Recovery dialog unreachable. */
    let ok = thrown;
    if (!ok) {
      ok = await page.waitForSelector('.modal-overlay.open', { timeout: 2500 })
        .then(() => true).catch(() => 'nothing opened within 2.5s');
    }
    if (ok !== true) { skipped.push(name + ' (' + ok + ')'); continue; }
    await page.waitForTimeout(300);
    findings.push(...await page.evaluate(x => window.__contrast(x), name));
    await page.evaluate(() => {
      // the join dialog holds a promise open; settle it rather than orphaning it
      if (typeof joinClose === 'function' && document.getElementById('joinModal')
          && document.getElementById('joinModal').classList.contains('open')) joinClose(false);
      document.querySelectorAll('.modal-overlay.open, .modal-overlay').forEach(m => m.classList.remove('open'));
    });
    await page.waitForTimeout(150);
  }

  await b.close();

  const bad = findings.filter(f => f.kind === 'invisible');
  const faint = findings.filter(f => f.kind === 'faint');
  const seen = new Set();
  const dedupe = list => list.filter(f => {
    const k = f.surface + f.cls + f.label;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  console.log(JSON.stringify({ checked: TABS.length + MODALS.length - skipped.length,
    surfacesNamed: TABS.length + MODALS.length, notReached: skipped,
    invisible: bad.length, faint: faint.length,
    findings: dedupe(bad.concat(faint)).slice(0, 30), pageErrors: errs.slice(0, 4) }, null, 1));
  if (skipped.length) {
    console.error('\n' + skipped.length + ' surface(s) this probe names were never opened, so nothing on '
      + 'them was checked:');
    skipped.forEach(s => console.error('  ' + s));
    process.exitCode = 1;
  }
  if (bad.length) {
    console.error('\n' + bad.length + ' control(s) are painted in the colour of the thing behind them:');
    dedupe(bad).forEach(f => console.error('  ' + f.surface + ' · "' + f.label + '" (' + f.cls + ') — '
      + f.part + ' ' + f.fg + ' on ' + f.bg + ', contrast ' + f.ratio + ':1'));
    process.exitCode = 1;
  } else if (faint.length) {
    console.error('\n' + faint.length + ' control(s) below the 3:1 WCAG asks of a non-text control — '
      + 'not a build failure, and worth a look.');
  }
  if (errs.length) process.exitCode = 1;
})();

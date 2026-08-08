/* ═══════════════════════════════════════════════════════════════════════════
   THE BUTTON HAS TO STILL BE THERE WHEN THE CLICK LANDS

   Reported by use, not by any check:

     "i can also never actually click the decompose button as the pop-up will
      popup, and the X will be where my cursor is"

   The activity row's action cluster shows one button until the row is hovered
   and five after. It is right-anchored, so the four that appear are inserted to
   the LEFT of the anchor — and at the time, decompose sat THIRD of five. Moving
   the pointer towards it expanded the cluster, everything right of the third
   position slid over, and DELETE arrived under a cursor that was already
   travelling. The fix was to reorder the DOM so the always-visible button is
   the one at the anchored edge.

   Nothing in the geometry probe could have caught it. Every one of its classes
   — clipped, crushed, overlap, overhang, trapped, truncated — is a question
   about a SINGLE STATIC LAYOUT. This defect does not exist in either layout: the
   collapsed one is fine, the expanded one is fine, and the bug lives in the
   transition between them. A probe that only photographs both ends of a move
   cannot see it.

   So this asks a different question, and it is the question a hand asks: if I
   put the pointer on a control and the interface reacts to my pointer being
   there, is the same control still under it? Anything else is a click that
   lands somewhere the person did not aim, and when the thing that arrives is
   destructive it is a click that deletes their work.

   TWO SEVERITIES, because they are not the same event. A control that swaps for
   another control is a misfire. A control that swaps for a DESTRUCTIVE one is
   the reported bug.

   ─── NOT IN THE COMMIT GATE YET, AND HERE IS WHY ────────────────────────────
   The pointer-shift half works: it passes on the current build and would have
   caught the reported defect, because decompose is now the anchored button.

   The BURIED half does not yet separate a real finding from an artifact, and
   the artifacts are mine:

     · it reported five controls "buried under an h2" that were simply on a tab
       nobody had opened — a section whose sub-tab bar has never painted is not
       hidden, it is stacked. Fixed by scoping to the active view.
     · a Clear button with a 0x0 box still passes the offsetParent filter, so
       something in a collapsed container is being measured as though it were
       on screen.
     · and one finding looks real — a Clear button at [168,351] whose centre
       resolves to the textarea beside it — which has NOT been confirmed as
       actually unclickable by a person.

   A probe that reports four false alarms and one real one teaches people to
   ignore all five, which is the exact failure the geometry probe's own header
   warns about and the reason it excludes sr-only text by shape. So this runs
   on request — `node tests/probes/pointer-stability.js` — and joins the gate
   when its findings can be trusted one at a time. Shipping it green-by-
   exception, or with the buried half deleted to make it pass, would both be
   worse: the first is a check nobody reads, the second is a check that has
   given up on the thing it was written for.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('../_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

/* What "destructive" means, by what the control DOES rather than by how it
   looks: a class the product uses for danger, or an onclick that names a
   removal. Looks are a style choice and can be restyled; the handler is the
   thing that eats the work. */
const DESTRUCTIVE = /delete|remove|discard|clear|reset|wipe/i;

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1512, height: 1000 } });
  page.on('dialog', d => d.accept());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  await page.waitForTimeout(600);

  const findings = [];
  const notes = {};

  /* Clusters that CHANGE when pointed at. Found by behaviour — measure, hover,
     measure again — rather than by a list of known class names, so a new
     hover-expanding control is covered the day it is written rather than the
     day somebody remembers to add it here. */
  const rowsToCheck = await page.evaluate(() => {
    switchTab('tasks');
    return [...document.querySelectorAll('#taskBody tr[data-task-id]')].slice(0, 6)
      .map(tr => tr.getAttribute('data-task-id'));
  });
  await page.waitForTimeout(300);
  notes.rowsChecked = rowsToCheck.length;
  if (!rowsToCheck.length) {
    findings.push({ severity: 'hard', what: 'no activity rows to check — this probe is vacuous' });
  }

  for (const id of rowsToCheck) {
    const sel = '#taskBody tr[data-task-id="' + id + '"]';
    /* BEFORE: what a person can see and aim at without having moved yet. */
    const before = await page.evaluate(s => {
      const tr = document.querySelector(s);
      if (!tr) return null;
      const btns = [...tr.querySelectorAll('button')].filter(x => {
        const r = x.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && getComputedStyle(x).visibility !== 'hidden';
      });
      return btns.map(x => {
        const r = x.getBoundingClientRect();
        return { label: (x.textContent || '').trim().slice(0, 6),
          onclick: (x.getAttribute('onclick') || '').slice(0, 40),
          cls: String(x.className || '').slice(0, 40),
          cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
      });
    }, sel);
    if (!before || !before.length) continue;

    /* Point at the first thing that is actually visible — which is what a
       person does — and let the interface react. page.hover moves the real
       mouse, so :hover fires; dispatching an event does not, and an earlier
       version of this reported STABLE while never expanding anything. */
    const aim = before[0];
    await page.mouse.move(aim.cx, aim.cy);
    await page.waitForTimeout(220);

    const after = await page.evaluate(pt => {
      const el = document.elementFromPoint(pt.cx, pt.cy);
      if (!el) return { landedOn: null };
      const btn = el.closest ? el.closest('button') : null;
      return { landedOn: btn ? {
          label: (btn.textContent || '').trim().slice(0, 6),
          onclick: (btn.getAttribute('onclick') || '').slice(0, 40),
          cls: String(btn.className || '').slice(0, 40)
        } : null,
        tag: el.tagName.toLowerCase() };
    }, aim);

    const same = after.landedOn && after.landedOn.onclick === aim.onclick;
    if (!same) {
      const arrived = after.landedOn;
      const danger = arrived && (DESTRUCTIVE.test(arrived.onclick) || /danger/.test(arrived.cls));
      findings.push({
        severity: danger ? 'hard' : 'soft',
        what: 'the pointer was put on "' + aim.label + '" (' + aim.onclick + ') and after the interface '
          + 'reacted that point sits on '
          + (arrived ? '"' + arrived.label + '" (' + arrived.onclick + ')' : 'no button at all')
          + (danger ? ' — which DESTROYS work. This is a click that deletes what the person was trying to edit.'
                    : ' — the click lands somewhere they did not aim.'),
        row: id
      });
    }
    await page.mouse.move(2, 2);
    await page.waitForTimeout(120);
  }

  /* ═══ AND THE OTHER HALF: PRESENT, HITTABLE BY TAB, COVERED BY SOMETHING ══
     A control can be perfectly laid out and still be unclickable because
     another element is painted over it. Every static class in the geometry
     probe says the box is fine, and it is — the box is just not the thing the
     mouse reaches. Asked the way the browser answers it: whatever is at the
     centre of this control had better BE this control. */
  const buried = await page.evaluate(() => {
    const out = [];
    /* THE ACTIVE PANEL ONLY. `main` holds all nine tab panels and three layers
       of sub-tab sections; the inactive ones are hidden, but a section whose
       sub-tab bar has never been PAINTED is not hidden yet — it is simply
       stacked behind its siblings, which is what a first version of this
       reported as five buttons "buried" under an h2. They were not buried;
       they were on a page nobody had opened. A probe that asserts about panels
       which are not on screen is describing a state no person can be in. */
    const view = document.querySelector('.view.active') || document.querySelector('main') || document.body;
    const btns = [...view.querySelectorAll('button, a[href], input, select')]
      .filter(x => {
        const r = x.getBoundingClientRect();
        const cs = getComputedStyle(x);
        /* offsetParent null catches everything in a display:none ancestor,
           which a zero rect alone does not reliably do inside a grid. */
        if (x.offsetParent === null && cs.position !== 'fixed') return false;
        return r.width > 3 && r.height > 3 && cs.visibility !== 'hidden' && cs.display !== 'none'
          && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
      });
    btns.slice(0, 400).forEach(x => {
      const r = x.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (!hit) return;
      if (hit === x || x.contains(hit) || hit.contains(x)) return;
      /* A LABEL over its own input is not a burial — clicking the label
         activates the control, which is the entire point of a label. */
      if (hit.tagName === 'LABEL' && (hit.control === x || hit.contains(x))) return;
      out.push({ label: (x.textContent || x.value || x.getAttribute('aria-label') || '').trim().slice(0, 30),
        cls: String(x.className || '').slice(0, 36),
        under: hit.tagName.toLowerCase() + '.' + String(hit.className || '').slice(0, 30) });
    });
    return out;
  });
  notes.buriedChecked = true;
  buried.forEach(x => findings.push({ severity: 'hard',
    what: 'the control "' + x.label + '" (' + x.cls + ') has ' + x.under + ' painted over its centre — '
      + 'it is in the page and reachable by keyboard, and a mouse cannot get to it' }));

  await b.close();

  const hard = findings.filter(f => f.severity === 'hard');
  const soft = findings.filter(f => f.severity === 'soft');
  console.log(JSON.stringify({ hard: hard.length, soft: soft.length, notes: notes,
    findings: findings.slice(0, 20), pageErrors: errs.slice(0, 5) }, null, 1));
  if (hard.length || errs.length) {
    console.error('\n' + hard.length + ' control(s) move out from under the pointer, or cannot be reached '
      + 'by one at all:');
    hard.forEach(f => console.error('  ' + f.what));
    process.exitCode = 1;
  } else if (soft.length) {
    console.error('\n' + soft.length + ' non-destructive pointer shift(s) — not a build failure, but a click '
      + 'that lands off-target:');
    soft.forEach(f => console.error('  ' + f.what));
  }
})();

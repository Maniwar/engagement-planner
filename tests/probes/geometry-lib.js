/* The audit itself, shared by the auditor and its self-test. Playwright
   serialises a plain function into the page, so it must close over nothing
   from Node — which is also what makes it testable from two callers. */
const AUDIT = () => {
  const out = [];
  const seen = new Set();
  const push = (kind, el, detail) => {
    const key = kind + '|' + (el.tagName + (el.className || '')).slice(0, 60) + '|' + detail.slice(0, 40);
    if (seen.has(key)) return;
    seen.add(key);
    const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    out.push({ kind: kind, tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 40), text: txt, detail: detail });
  };
  /* SCREEN-READER-ONLY TEXT IS NOT A CLIPPED CELL. The sr-only pattern is a
     1px box with overflow hidden and a clip rect — geometrically identical to
     text that has been cut off, and semantically its opposite: it is text put
     there ON PURPOSE for assistive tech and hidden from sight. The first run of
     this probe reported 84 findings and every one was .ek-sr, which is exactly
     the crying-wolf failure its own header warns about. Excluded by SHAPE
     rather than by class name, so the next sr-only helper is handled too. */
  const srOnly = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.clipPath && cs.clipPath !== 'none') return true;
    if (cs.clip && cs.clip !== 'auto') return true;
    if (r.width <= 2 || r.height <= 2) return true;
    return false;
  };
  const vis = el => { const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !srOnly(el); };

  const root = document.querySelector('main') || document.body;
  const all = [...root.querySelectorAll('td, th, div, span, a, button, label')].filter(vis);

  all.forEach(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    const ellipsis = cs.textOverflow === 'ellipsis';
    const scrolls = /auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflow);
    const hidesX = cs.overflowX === 'hidden' || cs.overflow === 'hidden';
    const over = el.scrollWidth - el.clientWidth;

    // CLIPPED — cut with no affordance at all
    if (hidesX && !ellipsis && !clamped && over > 2 && el.childElementCount === 0
        && (el.textContent || '').trim().length > 3)
      push('clipped', el, over + 'px of text hidden, no ellipsis and no clamp');

    /* TRUNCATED — cut, but WITH an ellipsis. Not a defect by itself: an
       ellipsis is a designed answer to long free text. It is reported anyway,
       separately, because "the client column is cut off" is what a person
       actually sees, and whether that reads as polish or as damage depends on
       HOW MUCH is missing. Three characters is a tidy ellipsis; thirty is a
       column that is not doing its job. The count is the finding. */
    if (ellipsis && over > 2 && el.childElementCount === 0) {
      const full = (el.textContent || '').trim();
      const shown = Math.max(1, Math.round(full.length * el.clientWidth / Math.max(1, el.scrollWidth)));
      const lost = full.length - shown;
      if (lost >= 8) push('truncated', el, lost + ' of ' + full.length + ' characters hidden behind the ellipsis');
    }

    // TRAPPED — says it scrolls, but not far enough to reach the overflow
    if (scrolls && over > 2 && over < 12)
      push('trapped', el, 'scrollable by only ' + over + 'px — the overflow is unreachable');

    // CRUSHED — a cell too narrow to hold a word
    if ((el.tagName === 'TD' || el.tagName === 'TH') && r.width > 0 && r.width < 26
        && (el.textContent || '').trim().length > 2)
      push('crushed', el, Math.round(r.width) + 'px wide holding ' + (el.textContent || '').trim().length + ' chars');
  });

  // OVERHANG — content past the right edge of a scroll container that cannot reach it
  [...root.querySelectorAll('.table-wrap, .rl-wrap, [style*="overflow"]')].filter(vis).forEach(w => {
    const over = w.scrollWidth - w.clientWidth;
    const cs = getComputedStyle(w);
    if (over > 2 && !/auto|scroll/.test(cs.overflowX + cs.overflow))
      push('overhang', w, over + 'px of table is unreachable — the wrapper does not scroll');
  });

  /* ═══ A CONTROL THAT ESCAPES ITS OWN CELL ════════════════════════════════
     Found by use, not by this probe: the roster's company picker carried an
     inline width of 150px inside a 116px cell, so it overhung its column by
     45px and sat on top of the capacity number beside it. Clicking where the
     figure appeared opened the company list.

     Every existing check walked straight past it. `clipped`, `truncated` and
     `trapped` ask whether a box is too SMALL for its content; this box is too
     BIG for its container, which is the same defect seen from the other side
     and had no question asked about it. `overhang` only looks at scroll
     wrappers. `overlap` compares seven decorative classes and only between
     SIBLINGS — a select in one <td> and an input in the next are cousins.

     So: does this control fit inside the thing that is supposed to bound it?
     Self-contained, no sibling comparison, and it catches the case whether or
     not anything happens to be sitting in the overflow. */
  [...root.querySelectorAll('input, select, textarea, button, a[href]')].filter(vis).forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.position === 'absolute' || cs.position === 'fixed') return;   // placed on purpose
    const box = el.closest('td, th, li, .rl-org-c, .toolbar, .form-group');
    if (!box || box === el) return;
    const bcs = getComputedStyle(box);
    if (/auto|scroll/.test(bcs.overflowX + bcs.overflow)) return;        // it can be reached
    const r = el.getBoundingClientRect(), rb = box.getBoundingClientRect();
    if (!rb.width) return;
    const past = Math.round(r.right - rb.right);
    if (past > 3)
      push('escapes', el, past + 'px wider than the ' + Math.round(rb.width) + 'px '
        + box.tagName.toLowerCase() + ' meant to bound it');
  });

  // OVERLAP — siblings whose boxes intersect (tables excluded: rows legitimately abut)
  const cand = [...root.querySelectorAll('.stat-card, .pa-card, .refx-row, .badge, .btn-sm, h3, h4')].filter(vis);
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i], b = cand[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (a.parentElement !== b.parentElement) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3)
        push('overlap', a, 'overlaps a sibling by ' + Math.round(ox) + '×' + Math.round(oy) + 'px');
    }
  }

  /* ═══ TWO CLICKABLE THINGS ON TOP OF EACH OTHER ══════════════════════════
     The overlap check above is deliberately narrow — a fixed list of decorative
     classes, and only between siblings — because most boxes on a page overlap
     something harmlessly. This asks the one version of the question that is
     never harmless: can two things you can CLICK cover each other? Whichever is
     on top steals the other's clicks, and the person who aimed at the one
     underneath gets an action they did not ask for.

     Not restricted to siblings, because the real case was not siblings: a
     select in one table cell reaching into the next. Ancestors are excluded (a
     button inside a link is one target, not two), and so is anything
     positioned, which is placed over things on purpose.

     AND RESTRICTED TO CONTROLS IN DIFFERENT FIELDS, which is the whole
     difference between a collision and a layout. Written without that, the
     first run reported 22 findings on a clean build and every one was two
     controls inside ONE field — a Clear button sitting on its own textarea, a
     mode picker over the box it configures. Overlapping inside a field is a
     composition somebody chose; overlapping across fields is one control
     stealing another's clicks, and only the second is ever a defect. Twenty-two
     findings nobody will act on is the crying-wolf failure this file's own
     header warns about, so the rule is narrowed to the shape that was actually
     reported rather than shipped loud. */
  const hits = [...root.querySelectorAll('input, select, textarea, button, a[href]')]
    .filter(vis)
    .filter(el => { const cs = getComputedStyle(el);
      return cs.position !== 'absolute' && cs.position !== 'fixed' && cs.pointerEvents !== 'none'; });
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const a = hits[i], b = hits[j];
      if (a.contains(b) || b.contains(a)) continue;
      /* BOTH IN CELLS, AND DIFFERENT ONES. A table row is the one place on this
         page where the boxes are supposed to be disjoint — a column IS a
         promise that what is in it stays in it — so a control reaching out of
         its cell onto the next is unambiguous. Everywhere else, overlapping
         controls turned out to be compositions somebody chose: a Clear button
         on its own textarea, a mode picker over the box it configures. Narrow
         on purpose; the loose version reported 22 findings on a clean build and
         none of them were defects. */
      const fa = a.closest('td, th'), fb = b.closest('td, th');
      if (!fa || !fb || fa === fb) continue;
      /* A PINNED COLUMN IS PLACED OVER THINGS ON PURPOSE, exactly like the
         absolute and fixed controls excluded above, and for the same reason:
         what is under it is one horizontal scroll away. #taskTable's actions
         column is sticky right, so between about 1390px and 1500px — where the
         table is wider than the screen but only just — it sits over the actuals
         input two columns along, and this reported it as a collision. The three
         widths the sweep runs at all missed that band, so the finding surfaced
         in the self-test instead, which is the wrong place to learn it. */
      if (getComputedStyle(fa).position === 'sticky' || getComputedStyle(fb).position === 'sticky') continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3)
        push('collide', a, 'covers ' + Math.round(ox) + '×' + Math.round(oy) + 'px of another control ('
          + b.tagName.toLowerCase() + (b.className ? '.' + String(b.className).split(' ')[0] : '')
          + '), so one of them takes clicks meant for the other');
    }
  }

  /* ═══ REACHABLE, AND BURIED ANYWAY ═══════════════════════════════════════
     Every check above measures BOXES: too small for its content, too big for
     its container, intersecting another box. None of them asks the question a
     person actually has, which is "if I click this, does the click get there".
     Boxes are a proxy for that and a leaky one in both directions — `collide`
     only compares two controls, so a control buried under a sticky header, a
     scrim, or a panel that is not itself a control is invisible to it, and a
     control with pointer-events switched off overlaps nothing at all while
     being just as dead.

     So stop proxying and ask the browser. elementFromPoint IS the hit test the
     click will use, which makes this the one check here with no threshold to
     argue about: either the thing at the control's own centre is the control,
     or the click lands somewhere else.

     SCROLLED, and judged over EVERY position rather than the first one. A row
     passing under a sticky table header is unclickable at that instant and
     perfectly clickable two lines later — that is what sticky means, and a probe
     that reports the instant reports the design. So a control is buried only if
     there is no scroll position anywhere at which a click reaches it. Written
     the naive way this printed 21 findings on a clean build and every one was a
     row under the header it had just scrolled beneath.

     Anything that never comes into view at any position is COUNTED and
     reported, because "checked nothing and said nothing" is the failure this
     probe has already been caught in once. */
  const scroller = document.scrollingElement || document.documentElement;
  const y0 = scroller.scrollTop;
  /* A BOX IS NOT A PROOF THAT ANYTHING IS DRAWN. getBoundingClientRect answers
     for a closed <details> and for content skipped by content-visibility — it
     hands back a plausible rectangle for a subtree the browser never painted
     and will never hit-test. Written without this, the first run reported 138
     findings on a clean build and the great majority were controls inside
     collapsed accordions: "a click on ⬇ Bank (.csv) lands on an <h2>", about a
     button nobody can see. There is no answer to "does a click reach this" for
     something that is not on the screen, so it is not asked. */
  const rendered = el => {
    if (typeof el.checkVisibility === 'function'
        && !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true, opacityProperty: true }))
      return false;
    const d = el.closest('details:not([open])');
    return !(d && !el.closest('summary'));
  };
  /* AND THE VIEWPORT IS NOT THE ONLY THING THAT CLIPS. A row scrolled out of a
     table wrapper still reports a rect where it WOULD be; the wrapper clips it,
     so nothing is painted there and the hit test lands on the page behind. That
     is not a burial, it is a row you have not scrolled to. The honest bound is
     the intersection of the viewport with every clipping ancestor. */
  const clipOf = el => {
    let box = { l: 1, t: 1, r: window.innerWidth - 1, b: window.innerHeight - 1 };
    for (let a = el.parentElement; a && a.tagName !== 'HTML'; a = a.parentElement) {
      const c = getComputedStyle(a);
      if (c.overflow === 'visible' && c.overflowX === 'visible' && c.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      box = { l: Math.max(box.l, ar.left), t: Math.max(box.t, ar.top),
              r: Math.min(box.r, ar.right), b: Math.min(box.b, ar.bottom) };
    }
    return box;
  };
  const ctrls = [...root.querySelectorAll('input, select, textarea, button, a[href]')]
    .filter(vis).filter(rendered);
  const reached = new Set();        // a click got through at some position
  const blocked = new Map();        // el -> why, at every position it was testable
  const probe = () => ctrls.forEach(el => {
    if (reached.has(el)) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const cb = clipOf(el);
    if (cx < cb.l || cy < cb.t || cx > cb.r || cy > cb.b) return;
    const hit = document.elementFromPoint(cx, cy);
    /* A descendant is the control (a span inside a button is the button), and
       so is an ancestor that WRAPS it for that purpose — a <label> around its
       own input forwards the click by definition. Any other ancestor coming
       back means the control let the click through to whatever is behind it. */
    if (hit && el.contains(hit)) { reached.add(el); blocked.delete(el); return; }
    if (hit && hit.contains(el) && hit.tagName === 'LABEL') { reached.add(el); blocked.delete(el); return; }
    const name = hit ? '<' + hit.tagName.toLowerCase()
      + (hit.className ? '.' + String(hit.className).split(' ')[0] : '') + '>' : null;
    blocked.set(el, !hit ? 'nothing is at its own centre — it is outside every hit region'
      : hit.contains(el) ? 'a click at its centre passes through to ' + name + ', the box AROUND it — '
        + 'the control is drawn but takes no clicks'
      : 'a click at its centre lands on ' + name + ' instead, at every scroll position it can be seen at');
  });
  /* THE PAGE IS NOT THE ONLY THING THAT SCROLLS. Most of this application's
     controls live inside a table wrapper or a panel with its own scrollbar, and
     a pass that only moves the window reached 75 of 193 of them — a check that
     covers a third of the surface and says nothing about the rest is how the
     letterbox mutant lived. Each inner scroller is stepped too, and put back. */
  const inner = [...root.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowY + ' ' + cs.overflowX + ' ' + cs.overflow)) return false;
    return el.scrollHeight - el.clientHeight > 8 || el.scrollWidth - el.clientWidth > 8;
  }).map(el => ({ el: el, top0: el.scrollTop, left0: el.scrollLeft }));
  const sweepInner = () => inner.forEach(s => {
    const h = s.el.clientHeight, w = s.el.clientWidth;
    const maxT = s.el.scrollHeight - h, maxL = s.el.scrollWidth - w;
    if (!h || !w) return;
    /* SIDEWAYS TOO. The activity table is wider than any screen it is read on,
       so a third of its controls sit past the right edge of their own wrapper
       and are clipped there — measurable, unpaintable, and never asked about.
       Vertical-only stepping left 44 of 193 controls on that tab unexamined. */
    for (let x = 0; ; x += Math.max(160, Math.floor(w * 0.8))) {
      s.el.scrollLeft = Math.min(x, maxL);
      for (let y = 0; ; y += Math.max(120, Math.floor(h * 0.8))) {
        s.el.scrollTop = Math.min(y, maxT);
        probe();
        if (y >= maxT) break;
      }
      if (x >= maxL) break;
    }
    s.el.scrollLeft = s.left0;
    s.el.scrollTop = s.top0;
  });
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  const maxY = Math.max(0, scroller.scrollHeight - window.innerHeight);
  for (let y = 0; ; y += step) {
    scroller.scrollTop = Math.min(y, maxY);
    probe();
    sweepInner();
    if (y >= maxY) break;
  }
  scroller.scrollTop = y0;
  blocked.forEach((why, el) => push('buried', el, why));
  const unseen = ctrls.length - reached.size - blocked.size;
  if (unseen > 0 && ctrls.length)
    out.push({ kind: 'unhittable', tag: '', cls: '', text: '',
      detail: unseen + ' of ' + ctrls.length + ' controls never had their centre on screen at any scroll '
        + 'position, so nothing was asked about them' });

  // the page itself must never scroll sideways
  const doc = document.documentElement;
  if (doc.scrollWidth - doc.clientWidth > 2)
    out.push({ kind: 'page', tag: 'html', cls: '', text: '',
      detail: (doc.scrollWidth - doc.clientWidth) + 'px of horizontal page scroll' });
  return out;
};
module.exports = { AUDIT };

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

  // the page itself must never scroll sideways
  const doc = document.documentElement;
  if (doc.scrollWidth - doc.clientWidth > 2)
    out.push({ kind: 'page', tag: 'html', cls: '', text: '',
      detail: (doc.scrollWidth - doc.clientWidth) + 'px of horizontal page scroll' });
  return out;
};
module.exports = { AUDIT };

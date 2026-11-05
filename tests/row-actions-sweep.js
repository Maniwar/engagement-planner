/* ═══════════════════════════════════════════════════════════════════════════
   THE ROW ACTIONS MUST NOT SIT ON ANOTHER CELL.

   The activity list pins each row's actions — ✕ delete, ⇤ outdent, ⇥ indent,
   ✎ edit, ⑂ decompose — to the right edge of the table. On a wide screen the
   rail is one button wide and the other four spread leftwards out of their
   cell when the row is pointed at, over the far end of the row. On a narrow
   screen the far end of the row is the owner and the frozen name column:

   · on a phone, with no hover to wait for, all five were drawn at rest, over
     the activity's name, its "+" and its owner, on every row;
   · in a narrow window with a mouse, pointing at a row spread the cluster
     over the owner's name, and narrower still over the "+", so a click meant
     for "+" landed on a row action.

   Every other check read the DOM, where the name, the owner and the "+" were
   all present and correct. This asks the page what is ON TOP, the way a tap
   does: document.elementFromPoint across every word and every control in the
   row, on a phone and a tablet (touch) and in narrow windows (mouse), at rest,
   with the row pointed at, and with focus inside it, at four sideways scroll
   positions. Then it taps or clicks each row's "+" for real and requires the
   blank row to open under that activity, and nothing else to happen.

   What a pinned column covers on purpose is not counted: content that has
   scrolled under the frozen name column or under the rail's own cell is one
   sideways scroll away, which is the point of pinning. Only what the cluster
   paints OUTSIDE its own cell is a finding — and the frozen name column under
   the rail is one too, because two pinned columns cannot be scrolled apart.

   AND THE ORDER IS A SAFETY PROPERTY, so it is held here as well as the
   overlap. ⑂ is where the pointer rests, so it must not move when the row is
   pointed at or takes focus (a click aimed at it would land on whatever slid
   under it), and ✕ must be the button farthest from it. Both buttons are
   found by what they do, not by how they look.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

/* 390 is the phone the defect was seen on. 400 with a mouse is a narrow or
   zoomed desktop window (150% on a 600px window), where the pointed-at cluster
   reached the "+". 600 to 760 is the rest of the band where the name column is
   frozen, where it reached the owner. 1024 is a tablet: no hover, so the whole
   cluster was drawn at rest there too, over the estimates. */
const SCREENS = [
  { at: 'Phone 390px (touch)', w: 390, h: 844, touch: true },
  { at: 'Window 400px (mouse)', w: 400, h: 900 },
  { at: 'Window 600px (mouse)', w: 600, h: 900 },
  { at: 'Window 700px (mouse)', w: 700, h: 900 },
  { at: 'Window 760px (mouse)', w: 760, h: 900 },
  { at: 'Tablet 1024px (touch)', w: 1024, h: 768, touch: true }
];
const POSITIONS = ['start', 'owner', 'middle', 'end'];

/* In the page: put the table at a named sideways position. "owner" is the
   worst case for the owner's text: its cell's right edge against the rail. */
const SCROLL = pos => {
  const wrap = document.getElementById('taskTableWrap');
  const row = document.querySelector('#taskBody tr[data-task-id]');
  const max = wrap.scrollWidth - wrap.clientWidth;
  let s = 0;
  if (pos === 'end') s = max;
  else if (pos === 'middle') s = Math.round(max / 2);
  else if (pos === 'owner' && row) {
    const owner = row.querySelector('td[data-owner-id]'), rail = row.querySelector('.row-acts');
    const railTd = rail && rail.closest('td');
    if (owner && railTd) {
      wrap.scrollLeft = 0;
      s = Math.round(owner.getBoundingClientRect().right - railTd.getBoundingClientRect().left);
    }
  }
  wrap.scrollLeft = Math.max(0, Math.min(max, s));
  return wrap.scrollLeft;
};

/* In the page: what a press at this point would land on. */
const ON_TOP = ({ x, y }) => {
  const top = document.elementFromPoint(x, y);
  if (!top) return 'nothing';
  if (top.closest('.wbs-add')) return 'the "+"';
  const tb = top.closest('button');
  if (tb) return '"' + (tb.title || tb.getAttribute('aria-label') || tb.textContent).split(/ \(| — /)[0].trim().slice(0, 32) + '"';
  const td = top.closest('td');
  return (td && td.querySelector('.row-acts')) ? 'the row actions' : top.tagName.toLowerCase();
};

/* In the page: bring a row to the middle of the table's view without moving
   the table sideways, and say where its "+" and its ⑂ are. */
const CENTRE = ({ id, onTopSrc }) => {
  const onTop = eval('(' + onTopSrc + ')');
  const row = document.querySelector('#taskBody tr[data-task-id="' + id + '"]');
  if (!row) return null;
  const wrap = document.getElementById('taskTableWrap');
  const keep = wrap.scrollLeft;
  row.scrollIntoView({ block: 'center', inline: 'nearest' });
  wrap.scrollLeft = keep;
  const mid = el => { if (!el) return null; const q = el.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; };
  const plus = row.querySelector('.wbs-add');
  const key = row.querySelector('.row-acts button[onclick*="aiDecompose"]');
  return { plus: mid(plus), key: mid(key), onTop: plus ? onTop(mid(plus)) : 'nothing' };
};

/* In the page: what is on top of every word and every control in the row's
   other cells, where ⑂ sits in its rail, and whether ✕ is the farthest button
   from it. Returns plain data; node does the judging. */
const AUDIT = ({ only, onTopSrc }) => {
  const say = eval('(' + onTopSrc + ')');
  const wrap = document.getElementById('taskTableWrap');
  const heads = [...document.querySelectorAll('#taskTable thead th')].map(th => th.textContent.trim());
  const rows = [...document.querySelectorAll('#taskBody tr[data-task-id]')]
    .filter(r => only == null || +r.dataset.taskId === only);
  const out = { rows: rows.length, points: 0, plusRows: 0, covered: [], plusBuried: [], noPlus: [], keys: {}, order: [] };
  const inside = (p, b, m = 0) => !!b && p.x >= b.left - m && p.x <= b.right + m && p.y >= b.top - m && p.y <= b.bottom + m;
  const centre = q => ({ x: q.left + q.width / 2, y: q.top + q.height / 2 });
  const drawn = el => { const q = el.getBoundingClientRect(); return q.width > 1 && q.height > 1; };
  /* The table is its own scroller in both directions, under a sticky header,
     so "on screen" means inside the window AND inside the part of the table
     below its header. */
  const view = () => {
    const wr = wrap.getBoundingClientRect(), hd = document.querySelector('#taskTable thead');
    return { left: Math.max(0, wr.left + wrap.clientLeft), right: Math.min(innerWidth, wr.left + wrap.clientLeft + wrap.clientWidth),
             top: Math.max(0, wr.top + wrap.clientTop, hd ? hd.getBoundingClientRect().bottom : 0),
             bottom: Math.min(innerHeight, wr.top + wrap.clientTop + wrap.clientHeight) };
  };
  for (const row of rows) {
    const id = +row.dataset.taskId;
    const t = (typeof tasks !== 'undefined' ? tasks : []).find(x => x.id === id) || {};
    const label = t.name || ('#' + id);
    const keep = wrap.scrollLeft;
    let clip = view();
    const rr = row.getBoundingClientRect();
    if (rr.top < clip.top + 2 || rr.bottom > clip.bottom - 2) {
      row.scrollIntoView({ block: 'center', inline: 'nearest' });
      wrap.scrollLeft = keep;
      clip = view();
    }
    const rail = row.querySelector('.row-acts');
    const railTd = rail ? rail.closest('td') : null;
    const railBox = railTd ? railTd.getBoundingClientRect() : null;
    const nameTd = row.querySelector('td[data-name-id]');
    const nameBox = nameTd ? nameTd.getBoundingClientRect() : null;
    const nameFrozen = !!nameTd && getComputedStyle(nameTd).position === 'sticky';
    const probe = (cell, what, p) => {
      if (!inside(p, clip)) return;
      /* Scrolled under the pinned rail is one scroll away — unless the cell is
         pinned too. A pixel of margin, because the hit test snaps to whole
         pixels and a pinned column's edge sits on a fraction of one: a point
         0.5px outside it is still answered by the column. */
      if (inside(p, railBox, 1) && !(cell === nameTd && nameFrozen)) return;
      if (cell !== nameTd && inside(p, nameBox, 1)) return;  // scrolled under the frozen name column
      const hit = document.elementFromPoint(p.x, p.y);
      out.points++;
      if (!hit || cell.contains(hit)) return;
      if (hit.closest('.row-acts') || (railTd && railTd.contains(hit)))
        out.covered.push({ row: label, what, by: say(p) });
    };
    let col = 0;
    for (const cell of [...row.cells]) {
      const at = col; col += cell.colSpan || 1;
      if (cell === railTd || !drawn(cell)) continue;          // the rail itself, or a column this width hides
      const what = cell === nameTd ? 'the name' : cell.hasAttribute('data-owner-id') ? 'the owner'
        : 'the ' + (heads[at] || 'column ' + (at + 1)) + ' cell';
      const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        if (!n.nodeValue.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const w = n.parentElement && n.parentElement.closest('.wbs-add') ? 'the "+"' : what;
        for (const q of rg.getClientRects()) {
          if (q.width < 2 || q.height < 2) continue;
          const y = q.top + q.height / 2;
          [q.left + 1.5, q.left + q.width / 2, q.right - 1.5].forEach(x => probe(cell, w, { x, y }));
        }
      }
      for (const c of cell.querySelectorAll('button, input, select, textarea, a[href], [onclick]')) {
        if (!drawn(c)) continue;
        const q = c.getBoundingClientRect();
        const w = c.classList.contains('wbs-add') ? 'the "+"'
          : what + ' (' + (c.getAttribute('aria-label') || c.title || c.tagName.toLowerCase()).split(/ \(| — /)[0].trim().slice(0, 32) + ')';
        const dx = q.width / 4, dy = q.height / 4;
        [[q.left + q.width / 2, q.top + q.height / 2], [q.left + dx, q.top + dy], [q.right - dx, q.top + dy],
         [q.left + dx, q.bottom - dy], [q.right - dx, q.bottom - dy]].forEach(([x, y]) => probe(cell, w, { x, y }));
      }
    }
    /* Where ⑂ sits, measured from the rail's right edge and the row's top, so
       it can be compared across scroll positions and states; and whether ✕ is
       the farthest of the buttons drawn. */
    if (rail && railTd) {
      const key = rail.querySelector('button[onclick*="aiDecompose"]');
      const del = rail.querySelector('button[onclick*="deleteTask"]');
      if (key && drawn(key)) {
        const k = centre(key.getBoundingClientRect());
        out.keys[id] = { dx: railBox.right - k.x, dy: k.y - row.getBoundingClientRect().top };
        if (del && drawn(del)) {
          const dist = b => { const c = centre(b.getBoundingClientRect()); return Math.hypot(c.x - k.x, c.y - k.y); };
          const far = [...rail.querySelectorAll('button')].filter(b => b !== key && b !== del && drawn(b))
            .sort((a, z) => dist(z) - dist(a))[0];
          if (far && dist(far) > dist(del) + 0.5) out.order.push({ row: label, far: say(centre(far.getBoundingClientRect())) });
        }
      }
    }
    // the "+" has to be the thing a tap at its centre reaches — under nothing at all
    if (t.milestone) continue;
    const plus = row.querySelector('.wbs-add');
    if (!plus) { out.noPlus.push(label); continue; }
    const p = centre(plus.getBoundingClientRect());
    if (!inside(p, clip)) continue;                            // scrolled sideways out of view: one scroll away
    out.plusRows++;
    const hit = document.elementFromPoint(p.x, p.y);
    if (!hit || !plus.contains(hit)) out.plusBuried.push({ row: label, by: say(p) });
  }
  return out;
};

/* In the page: the same audit with focus inside each row in turn, which is
   the keyboard's way of opening the cluster. */
const FOCUS_AUDIT = ({ auditSrc, onTopSrc }) => {
  const audit = eval('(' + auditSrc + ')');
  const all = { rows: 0, points: 0, plusRows: 0, covered: [], plusBuried: [], noPlus: [], keys: {}, order: [] };
  for (const row of [...document.querySelectorAll('#taskBody tr[data-task-id]')]) {
    const target = row.querySelector('.wbs-add') || row.querySelector('.row-acts button[onclick*="aiDecompose"]');
    if (!target) continue;
    target.focus({ preventScroll: true });
    const r = audit({ only: +row.dataset.taskId, onTopSrc });
    target.blur();
    all.rows += r.rows; all.points += r.points; all.plusRows += r.plusRows;
    all.covered.push(...r.covered); all.plusBuried.push(...r.plusBuried); all.noPlus.push(...r.noPlus);
    all.order.push(...r.order); Object.assign(all.keys, r.keys);
  }
  return all;
};

const blank = () => ({ rows: 0, points: 0, plusRows: 0, covered: [], plusBuried: [], noPlus: [], keys: {}, order: [] });
const merge = (acc, r) => {
  acc.rows += r.rows; acc.points += r.points; acc.plusRows += r.plusRows;
  acc.covered.push(...r.covered); acc.plusBuried.push(...r.plusBuried); acc.noPlus.push(...r.noPlus);
  acc.order.push(...r.order); Object.assign(acc.keys, r.keys);
  return acc;
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [], screens: {} };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const SRC = { onTopSrc: ON_TOP.toString() };
  const few = names => { const u = [...new Set(names)]; return u.length + ' row(s): ' + u.slice(0, 3).join('; ') + (u.length > 3 ? '; …' : ''); };
  /* One line per kind of finding, not one per point: a cluster over the owner
     on twenty rows is one defect, and the first few rows name it. `rest` is
     where ⑂ sat with nothing pointed at, to compare against. */
  const judge = (at, state, r, rest) => {
    const where = at + ', ' + state;
    const by = new Map();
    r.covered.forEach(c => { const k = c.what + ' ← ' + c.by; if (!by.has(k)) by.set(k, []); by.get(k).push(c.row); });
    by.forEach((rows, k) => {
      const [what, btn] = k.split(' ← ');
      say(where, (/^"/.test(btn) ? 'the row action ' + btn + ' is' : btn + ' are') + ' drawn over ' + what + ' on ' + few(rows));
    });
    if (r.plusBuried.length) say(where, 'a tap at the centre of the "+" does not reach it on ' + few(r.plusBuried.map(p => p.row + ' (under ' + p.by + ')')));
    if (r.noPlus.length) say(where, 'activity rows have no "+" to add under them: ' + few(r.noPlus));
    if (r.order.length) say(where, '✕ is not the button farthest from ⑂, where the pointer rests — ' + r.order[0].far + ' is, on ' + few(r.order.map(o => o.row)));
    if (rest) {
      const moved = Object.keys(r.keys).filter(id => rest[id]
        && (Math.abs(r.keys[id].dx - rest[id].dx) > 1 || Math.abs(r.keys[id].dy - rest[id].dy) > 1));
      if (moved.length) {
        const id = moved[0], d = Math.round(Math.hypot(r.keys[id].dx - rest[id].dx, r.keys[id].dy - rest[id].dy));
        say(where, '⑂ moves ' + d + 'px from where it sat at rest, so a click aimed at it lands on something else, on '
          + moved.length + ' row(s)');
      }
    }
  };

  for (const S of SCREENS) {
    const t0 = Date.now();
    const ctx = await b.newContext(Object.assign({ viewport: { width: S.w, height: S.h } },
      S.touch ? { isMobile: true, hasTouch: true } : {}));
    const page = await ctx.newPage();
    const dialogs = [];
    // dismissed, so a stray tap on ✕ is reported rather than obeyed
    page.on('dialog', d => { dialogs.push(d.message().slice(0, 50)); d.dismiss().catch(() => {}); });
    page.on('pageerror', e => errs.push(S.at + ': ' + e.message));
    const load = async () => {
      await page.goto(APP, { waitUntil: 'load' });
      await page.evaluate(d => { hydrate(d); calculate(); switchTab('tasks'); }, DATA);
      await page.waitForTimeout(400);
    };
    await load();
    const sum = { rows: 0, points: 0, plusChecked: 0, keys: 0, hovered: 0, tapped: 0 };
    R.screens[S.at] = sum;
    const tally = r => { sum.rows = Math.max(sum.rows, r.rows); sum.points += r.points; sum.plusChecked += r.plusRows; };

    // ── at rest ────────────────────────────────────────────────────────────
    if (!S.touch) await page.mouse.move(1, 1);
    const rest = {};
    for (const pos of POSITIONS) {
      await page.evaluate(SCROLL, pos);
      const r = await page.evaluate(AUDIT, Object.assign({ only: null }, SRC));
      tally(r); judge(S.at, 'at rest, scrolled to the ' + pos, r, pos === 'start' ? null : rest);
      if (pos === 'start') Object.assign(rest, r.keys);
    }
    sum.keys = Object.keys(rest).length;
    if (!sum.rows) say(S.at, 'the activity list drew no rows, so nothing here was checked');
    else if (!sum.keys) say(S.at, 'no row drew ⑂, so where it rests could not be checked');

    sum.phases = { rest: Date.now() - t0 };
    // ── focus inside the row ───────────────────────────────────────────────
    for (const pos of ['start', 'owner']) {
      await page.evaluate(SCROLL, pos);
      const r = await page.evaluate(FOCUS_AUDIT, Object.assign({ auditSrc: AUDIT.toString() }, SRC));
      tally(r); judge(S.at, 'with focus in the row, scrolled to the ' + pos, r, rest);
    }

    sum.phases.focus = Date.now() - t0 - sum.phases.rest;
    // ── the row pointed at, with the pointer resting on ⑂ ──────────────────
    if (!S.touch) {
      const ids = await page.evaluate(() => [...document.querySelectorAll('#taskBody tr[data-task-id]')].map(r => +r.dataset.taskId));
      for (const pos of ['start', 'owner']) {
        await page.evaluate(SCROLL, pos);
        const acc = blank();
        for (const id of ids) {
          const c = await page.evaluate(CENTRE, Object.assign({ id }, SRC));
          if (!c || !c.key) continue;
          await page.mouse.move(c.key.x, c.key.y);
          merge(acc, await page.evaluate(AUDIT, Object.assign({ only: id }, SRC)));
          sum.hovered++;
        }
        tally(acc); judge(S.at, 'with the row pointed at, scrolled to the ' + pos, acc, rest);
      }
      await page.mouse.move(1, 1);
    }

    // ── a real tap or click on each "+" ────────────────────────────────────
    /* A stray tap does something — opens the editor, asks to delete, indents
       the row — so after one the page is reloaded clean. Three misses on one
       screen are enough to name the defect; trying the rest would only make a
       broken build slow, and this check has to finish inside the mutation
       engine's time limit on exactly those builds. */
    const CAP = 3;
    const tTap = Date.now();
    sum.phases.hover = tTap - t0 - sum.phases.rest - sum.phases.focus;
    /* WHICH ROWS ARE TAPPED. Every row's "+" was already hit-tested above, in
       every state, and the hit test is what decides where a tap lands. What a
       real tap adds is the whole path — the event, the handler, the blank row
       under the right parent — and each tap redraws the table, which under
       anchor-check's decorator costs about two seconds. So the taps go to the
       rows that differ: the first phase, the first plain activity, the
       deepest row, the row whose "+" sits nearest the rail, and the last. */
    await page.evaluate(SCROLL, 'start');
    const ids = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#taskBody tr[data-task-id]')].filter(r => r.querySelector('.wbs-add'));
      const info = rows.map(r => {
        const id = +r.dataset.taskId, t = tasks.find(x => x.id === id) || {};
        let depth = 0;
        for (let p = t; p && p.parentId != null && depth < 50; p = tasks.find(x => x.id === p.parentId)) depth++;
        return { id, sum: !!t.isSummary, depth, right: r.querySelector('.wbs-add').getBoundingClientRect().right };
      });
      if (!info.length) return [];
      const pick = [info.find(i => i.sum), info.find(i => !i.sum),
        info.reduce((a, i) => i.depth > a.depth ? i : a), info.reduce((a, i) => i.right > a.right ? i : a), info[info.length - 1]];
      return [...new Set(pick.filter(Boolean).map(i => i.id))];
    });
    const shape = () => page.evaluate(() => tasks.map(t => t.id + '<' + t.parentId).join());
    const missed = [];
    let tried = 0;
    for (const id of ids) {
      if (missed.length >= CAP) break;
      const c = await page.evaluate(CENTRE, Object.assign({ id }, SRC));
      if (!c || !c.plus) continue;
      const before = await shape();
      dialogs.length = 0;
      if (S.touch) await page.touchscreen.tap(c.plus.x, c.plus.y);
      else {
        // arrive first, then say what is under the pointer once the row has reacted to it, then press
        await page.mouse.move(c.plus.x, c.plus.y);
        c.onTop = await page.evaluate(ON_TOP, c.plus);
        await page.mouse.down(); await page.mouse.up();
      }
      await page.waitForTimeout(60);
      const got = await page.evaluate(id => {
        const d = document.querySelector('#taskBody tr.wbs-draft');
        const modal = document.querySelector('.modal-overlay.open');
        const res = { opened: !!d && +d.dataset.parent === id, under: d ? +d.dataset.parent : null, modal: modal ? modal.id : '' };
        const inp = d && d.querySelector('input');
        if (inp) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return res;
      }, id);
      const after = await shape();
      tried++; sum.tapped++;
      if (got.opened && !got.modal && after === before && !dialogs.length) continue;
      const name = await page.evaluate(id => (tasks.find(t => t.id === id) || {}).name || '#' + id, id);
      missed.push(name + ' (under the ' + (S.touch ? 'finger' : 'pointer') + ': ' + c.onTop
        + (got.modal ? '; opened #' + got.modal : '') + (dialogs.length ? '; asked "' + dialogs[0] + '…"' : '')
        + (after !== before ? '; the plan changed' : '')
        + (!got.opened && got.under != null ? '; a blank row opened under #' + got.under : '') + ')');
      await load();                                           // whatever the stray tap did, start clean
      if (!S.touch) await page.mouse.move(1, 1);
    }
    if (!ids.length) say(S.at, 'no row has a "+", so no tap was tried');
    if (!sum.plusChecked) say(S.at, 'no "+" was ever in view to check');
    if (!sum.points) say(S.at, 'no word or control in any row was in view to check');
    if (missed.length) say(S.at, (S.touch ? 'a tap' : 'a click') + ' on the "+" does not open a blank row under that activity on '
      + missed.length + ' of ' + tried + ' row(s) tried' + (missed.length >= CAP ? ' (stopped after ' + CAP + ')' : '') + ': ' + missed.join('; '));
    sum.phases.tap = Date.now() - tTap;
    sum.ms = Date.now() - t0;
    await ctx.close();
  }

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

/* ═══════════════════════════════════════════════════════════════════════════
   EDITING THE WBS WHERE IT IS DRAWN.

   The activity list on the Tasks tab edits in place: click a name, an owner or
   an estimate and type. The WBS table did not — a click anywhere on a row
   opened the full dialog, so renaming an element, or writing the deliverable,
   scope and acceptance the dictionary exists to hold, was a dialog per cell.
   And + on a row opened that dialog too, so laying out a phase's work meant
   one dialog per line.

   What is required:
   · the name, the owner of an activity, and the dictionary text — deliverable,
     description, acceptance, inputs — edit in place: Enter saves, Esc puts it
     back, an empty name is refused, and the multi-line fields take Shift+Enter
     as a new line; a cell can be reached and opened from the keyboard;
   · a summary row's owner rolls up from its children and is not offered;
   · any other cell still opens the full editor, so nothing became unreachable;
   · + opens a blank row in place, directly under the last row of what it adds
     to; Enter adds the activity at the end of that element and opens the next
     blank row, Esc closes it, an empty Enter adds nothing, and "More options…"
     carries the typed name and the parent into the full dialog;
   · adding under a leaf makes it a phase; every edit is one undo step.

   And the activity list on Tasks adds work the same way: + on any of its rows
   but a milestone's opens the same blank row there, held to every requirement
   above. On either table:
   · the blank row opens only in the table whose + was pressed, never in the
     other one as well;
   · a redraw of the table while it is open — one or two in a row — keeps it
     open, keeps what was typed, and takes the focus back only when the blank
     row had it;
   · on a phone, where the table scrolls sideways, More options… is on screen.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); refreshAll(); switchTab('wbs'); }, DATA);
  await page.waitForTimeout(400);

  const cellSel = (id, f) => '#wbsContainer tr[data-wbsrow="' + id + '"] td[data-ed="' + f + '"]';
  const modalOpen = () => page.evaluate(() => { const m = document.getElementById('modal'); return !!m && m.getClientRects().length > 0 && getComputedStyle(m).display !== 'none' && !m.classList.contains('closing'); });
  const closeAll = () => page.evaluate(() => { try { closeModal(); } catch (e) {} try { endCellEdit(true); } catch (e) {} });
  const editorIn = sel => page.evaluate(s => { const td = document.querySelector(s); const e = td && td.querySelector('input, textarea'); return e ? { tag: e.tagName, focused: document.activeElement === e } : null; }, sel);
  const pick = () => page.evaluate(() => {
    computeWbsCodes();
    const leaf = tasks.find(t => !t.milestone && !isSummaryId(t.id) && !isTestCaseTask(t));
    const leaf2 = tasks.filter(t => !t.milestone && !isSummaryId(t.id) && !isTestCaseTask(t))[1];
    const ph = tasks.find(t => isSummaryId(t.id) && childrenOf(t.id).length >= 2);
    return { leaf: leaf && { id: leaf.id, name: leaf.name }, leaf2: leaf2 && leaf2.id, ph: ph && { id: ph.id, wbs: ph.wbs, n: childrenOf(ph.id).length } };
  });
  const t0 = await pick();
  if (!t0.leaf || !t0.ph) { say('fixture', 'the plan has no plain activity or no phase with two children'); }
  const L = t0.leaf && t0.leaf.id;

  // ═══ THE NAME, IN PLACE ══════════════════════════════════════════════════
  if (L) {
    const undo0 = await page.evaluate(() => undoStack.length);
    await page.click(cellSel(L, 'name') + ' .wbs-name').catch(e => say('name', 'the name cannot be clicked: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(150);
    const E = await editorIn(cellSel(L, 'name'));
    if (!E) say('name', 'clicking an activity\'s name opens no editor in its cell');
    else if (!E.focused) say('name', 'the name editor is not focused, so typing goes nowhere');
    if (await modalOpen()) say('name', 'clicking the name opened the full dialog instead of editing in place');
    if (E) {
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Renamed in the WBS'); await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
      const N = await page.evaluate(([id, s]) => ({ name: tasks.find(t => t.id === id).name, shown: (document.querySelector(s) || {}).innerText || '', undo: undoStack.length }), [L, cellSel(L, 'name')]);
      if (N.name !== 'Renamed in the WBS') say('name', 'Enter did not save the new name (it is "' + N.name + '")');
      if (N.shown.indexOf('Renamed in the WBS') < 0) say('name', 'the row does not show the new name after saving');
      if (N.undo <= undo0) say('name', 'the rename is not an undo step');
      const back = await page.evaluate(id => { doUndo(); return tasks.find(t => t.id === id).name; }, L);
      if (back !== t0.leaf.name) say('name', 'undo did not put the old name back (it is "' + back + '")');
      await page.evaluate(() => { switchTab('wbs'); renderWBS(); }); await page.waitForTimeout(150);
    }
    // Esc puts it back
    await page.click(cellSel(L, 'name') + ' .wbs-name').catch(() => {});
    await page.waitForTimeout(120);
    if (await editorIn(cellSel(L, 'name'))) {
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Should not stick'); await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const X = await page.evaluate(([id, s]) => ({ name: tasks.find(t => t.id === id).name, editing: !!document.querySelector(s + ' input') }), [L, cellSel(L, 'name')]);
      if (X.name !== t0.leaf.name) say('name', 'Esc saved the typed name instead of putting the old one back');
      if (X.editing) say('name', 'Esc left the editor open');
    }
    // an empty name is refused
    await page.click(cellSel(L, 'name') + ' .wbs-name').catch(() => {});
    await page.waitForTimeout(120);
    if (await editorIn(cellSel(L, 'name'))) {
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      const Z = await page.evaluate(([id, s]) => ({ name: tasks.find(t => t.id === id).name, editing: !!document.querySelector(s + ' input') }), [L, cellSel(L, 'name')]);
      if (Z.name !== t0.leaf.name) say('name', 'an empty name was saved');
      if (!Z.editing) say('name', 'an empty name closed the editor without saying why');
      await page.keyboard.press('Escape');
    }
    // from the keyboard
    const K = await page.evaluate(s => { const td = document.querySelector(s); if (!td) return null; return { tab: td.tabIndex }; }, cellSel(L, 'name'));
    if (!K || K.tab < 0) say('keyboard', 'the name cell cannot be reached with Tab');
    else {
      await page.focus(cellSel(L, 'name')); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
      if (!(await editorIn(cellSel(L, 'name')))) say('keyboard', 'Enter on a focused name cell does not open its editor');
      await page.keyboard.press('Escape');
    }
  }

  // ═══ THE DICTIONARY TEXT, IN PLACE ══════════════════════════════════════
  if (L) {
    for (const [f, prop] of [['deliverable', 'deliverable'], ['description', 'description'], ['acceptance', 'acceptance'], ['inputs', 'inputs']]) {
      await closeAll(); await page.evaluate(() => renderWBS()); await page.waitForTimeout(100);
      const has = await page.$(cellSel(L, f));
      if (!has) { say(f, 'the ' + f + ' cell is not editable in place'); continue; }
      await page.click(cellSel(L, f)); await page.waitForTimeout(120);
      const E = await editorIn(cellSel(L, f));
      if (!E) { say(f, 'clicking the ' + f + ' cell opens no editor in it'); continue; }
      if (E.tag !== 'TEXTAREA') say(f, 'the ' + f + ' editor is one line, for text that runs to several');
      if (await modalOpen()) say(f, 'clicking the ' + f + ' cell opened the full dialog');
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('First line of ' + f);
      await page.keyboard.press('Shift+Enter'); await page.keyboard.type('Second line');
      await page.keyboard.press('Enter'); await page.waitForTimeout(200);
      const v = await page.evaluate(([id, p]) => tasks.find(t => t.id === id)[p], [L, prop]);
      if (v !== 'First line of ' + f + '\nSecond line') say(f, 'saving gave ' + JSON.stringify(v) + ' — Shift+Enter is a new line and Enter saves');
    }
  }

  // ═══ THE OWNER — an activity's, not a summary's ═════════════════════════
  if (L) {
    await closeAll(); await page.evaluate(() => renderWBS()); await page.waitForTimeout(100);
    const own = await page.$(cellSel(L, 'owner'));
    if (!own) say('owner', 'an activity\'s owner is not editable in place');
    else {
      await page.click(cellSel(L, 'owner')); await page.waitForTimeout(150);
      if (!(await editorIn(cellSel(L, 'owner')))) say('owner', 'clicking an activity\'s owner opens no editor in its cell');
      if (await modalOpen()) say('owner', 'clicking the owner opened the full dialog');
      await page.keyboard.press('Escape');
    }
  }
  if (t0.ph) {
    const sumOwner = await page.$(cellSel(t0.ph.id, 'owner'));
    if (sumOwner) say('owner', 'a summary row offers its owner for editing, but it rolls up from its children');
  }

  // ═══ EVERYTHING ELSE STILL OPENS THE FULL EDITOR ════════════════════════
  if (L) {
    await closeAll(); await page.evaluate(() => renderWBS()); await page.waitForTimeout(100);
    const startCell = await page.evaluate(id => { const tr = document.querySelector('#wbsContainer tr[data-wbsrow="' + id + '"]'); const tds = [...tr.children]; const i = [...document.querySelectorAll('#wbsContainer thead th')].findIndex(th => /^Start/.test(th.textContent.trim())); return i; }, L);
    if (startCell < 0) say('full editor', 'the Start column was not found');
    else {
      await page.click('#wbsContainer tr[data-wbsrow="' + L + '"] > td:nth-child(' + (startCell + 1) + ')'); await page.waitForTimeout(300);
      if (!(await modalOpen())) say('full editor', 'clicking a cell that does not edit in place no longer opens the full editor');
      await closeAll(); await page.waitForTimeout(200);
    }
  }

  // ═══ + OPENS A BLANK ROW IN PLACE — on the WBS tab and on Tasks ═════════
  const TABLES = {
    wbs:   { label: '',          tab: 'wbs',   box: '#wbsContainer', attr: 'data-wbsrow',  key: 'wbsrow', render: 'renderWBS',       other: '#taskBody' },
    tasks: { label: ' (Tasks)', tab: 'tasks', box: '#taskBody',     attr: 'data-task-id', key: 'taskId', render: 'renderTaskTable', other: '#wbsContainer' }
  };
  const rowOf = (T, id) => T.box + ' tr[' + T.attr + '="' + id + '"]';
  const show = T => page.evaluate(([tab, render]) => { try { closeModal(); } catch (e) {} switchTab(tab); window[render](); }, [T.tab, T.render]).then(() => page.waitForTimeout(150));
  const draftIn = box => page.evaluate(b => { const d = document.querySelector(b + ' tr.wbs-draft'); const i = d && d.querySelector('input');
    return d ? { value: i ? i.value : null, focused: !!i && document.activeElement === i } : null; }, box);

  async function blankRow(name) {
    const T = TABLES[name], A0 = '+ in place' + T.label, sfx = T.label ? ' ' + name : '';
    const t1 = await pick();
    if (!t1.ph) return say(A0, 'the plan has no phase with two children left to add under');
    const P = t1.ph;
    await show(T);

    // + on every row but a milestone's
    const cover = await page.evaluate(([box, attr]) => {
      const rows = [...document.querySelectorAll(box + ' tr[' + attr + ']')];
      const ms = rows.filter(r => (tasks.find(t => t.id === +r.getAttribute(attr)) || {}).milestone);
      const work = rows.filter(r => !ms.includes(r));
      return { work: work.length, workWithout: work.filter(r => !r.querySelector('.wbs-add')).length, ms: ms.length, msWith: ms.filter(r => r.querySelector('.wbs-add')).length };
    }, [T.box, T.attr]);
    if (!cover.work) say(A0, 'the table shows no rows to add under');
    if (cover.workWithout) say(A0, cover.workWithout + ' of ' + cover.work + ' rows have no +');
    if (cover.msWith) say(A0, cover.msWith + ' milestones offer a + — a date has no work under it');

    await page.click(rowOf(T, P.id) + ' .wbs-add', { force: true }).catch(e => say(A0, 'the phase row\'s + cannot be pressed: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(200);
    const D = await page.evaluate(([pid, box, attr, other]) => {
      const d = document.querySelector(box + ' tr.wbs-draft');
      if (!d) return null;
      // the row it sits under: the phase's last visible descendant, or the phase
      computeWbsCodes();
      const desc = new Set(); const walk = id => childrenOf(id).forEach(c => { desc.add(c.id); walk(c.id); }); walk(pid);
      const rows = [...document.querySelectorAll(box + ' tr[' + attr + ']')];
      const lastOf = rows.filter(r => +r.getAttribute(attr) === pid || desc.has(+r.getAttribute(attr))).pop();
      const inp = d.querySelector('input');
      return { after: d.previousElementSibling === lastOf, focused: !!inp && document.activeElement === inp, parent: +d.dataset.parent,
        elsewhere: !!document.querySelector(other + ' tr.wbs-draft') };
    }, [P.id, T.box, T.attr, T.other]);
    if (!D) return say(A0, '+ on a phase opened no blank row in the table');
    if (await modalOpen()) say(A0, '+ opened the full dialog instead of a row in place');
    if (D.parent !== P.id) say(A0, 'the blank row is not for the phase whose + was pressed');
    if (!D.after) say(A0, 'the blank row is not directly under the last row of the phase');
    if (!D.focused) say(A0, 'the blank row\'s name is not focused, so typing goes nowhere');
    if (D.elsewhere) say(A0, 'a blank row opened in the other table as well');
    await page.evaluate(r => window[r](), T.render); await page.waitForTimeout(150);
    const K0 = await draftIn(T.box);
    if (!K0) say(A0, 'a redraw of the table closed the blank row before anything was typed');
    else if (!K0.focused) say(A0, 'a redraw of the table took the focus out of the empty blank row');
    const before = await page.evaluate(() => tasks.length);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    if ((await page.evaluate(() => tasks.length)) !== before) say(A0, 'Enter on an empty blank row added an activity');
    const one = 'Inline child one' + sfx, two = 'Inline child two' + sfx;
    await page.keyboard.type(one); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await page.keyboard.type(two); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const A = await page.evaluate(([pid, n1, n2, box, other]) => {
      computeWbsCodes();
      const kids = childrenOf(pid);
      const one = tasks.find(t => t.name === n1), two = tasks.find(t => t.name === n2);
      const d = document.querySelector(box + ' tr.wbs-draft');
      return { one: one && { parent: one.parentId, code: one.wbs, at: kids.indexOf(one) }, two: two && { parent: two.parentId, at: kids.indexOf(two) },
        n: kids.length, draftAgain: !!d, focused: !!d && document.activeElement === d.querySelector('input'), wbs: (tasks.find(t => t.id === pid) || {}).wbs,
        elsewhere: !!document.querySelector(other + ' tr.wbs-draft') };
    }, [P.id, one, two, T.box, T.other]);
    R['inline' + (sfx ? '_' + name : '')] = A;
    if (!A.one || !A.two) say(A0, 'Enter did not add the typed activities (one: ' + !!A.one + ', two: ' + !!A.two + ')');
    else {
      if (A.one.parent !== P.id || A.two.parent !== P.id) say(A0, 'an activity added in place is not under the phase');
      if (A.one.at !== P.n || A.two.at !== P.n + 1) say(A0, 'the added activities are not at the end of the phase, in the order typed');
      if (A.one.code !== A.wbs + '.' + (P.n + 1)) say(A0, 'the first added activity is ' + A.one.code + ', not ' + A.wbs + '.' + (P.n + 1));
    }
    if (!A.draftAgain || !A.focused) say(A0, 'after Enter there is no fresh blank row ready for the next one');
    if (A.elsewhere) say(A0, 'after Enter a blank row opened in the other table as well');

    // a redraw keeps what was typed, and the focus only when the blank row had it
    await page.keyboard.type('Half typed');
    await page.evaluate(r => window[r](), T.render); await page.waitForTimeout(150);
    const K1 = await draftIn(T.box);
    if (!K1) say(A0, 'a redraw of the table closed the blank row with a name half typed');
    else {
      if (K1.value !== 'Half typed') say(A0, 'a redraw of the table lost what was typed in the blank row (it holds ' + JSON.stringify(K1.value) + ')');
      if (!K1.focused) say(A0, 'a redraw of the table took the focus out of the blank row while it was being typed in');
    }
    await page.evaluate(r => { window[r](); window[r](); }, T.render); await page.waitForTimeout(150);
    const K3 = await draftIn(T.box);
    if (!K3 || K3.value !== 'Half typed' || !K3.focused) say(A0, 'two redraws in a row ' + (!K3 ? 'closed the blank row' : K3.value !== 'Half typed' ? 'lost what was typed' : 'took the focus out of the blank row'));
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.evaluate(r => window[r](), T.render); await page.waitForTimeout(150);
    const K2 = await draftIn(T.box);
    if (K2 && K2.focused) say(A0, 'a redraw pulled the focus back into the blank row after it had left it');
    if (K2 && K2.value !== 'Half typed') say(A0, 'a redraw lost the half-typed name once the focus had left it');
    await page.focus(T.box + ' tr.wbs-draft input').catch(() => {});
    await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace');

    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const gone = await page.evaluate(b => !document.querySelector(b + ' tr.wbs-draft'), T.box);
    if (!gone) say(A0, 'Esc did not close the blank row');
    const un = await page.evaluate(n2 => { doUndo(); return tasks.some(t => t.name === n2); }, two);
    if (un) say(A0, 'undo did not take back the last activity added in place');

    // More options… carries the name and the parent into the full dialog
    await show(T);
    await page.click(rowOf(T, P.id) + ' .wbs-add', { force: true }); await page.waitForTimeout(150);
    await page.keyboard.type('A bigger piece of work');
    const more = await page.$(T.box + ' tr.wbs-draft .wbs-draft-more');
    if (!more) say(A0, 'the blank row has no way into the full dialog');
    else {
      await more.click(); await page.waitForTimeout(300);
      const M = await page.evaluate(pid => ({ open: document.getElementById('modal').getClientRects().length > 0, name: document.getElementById('mName').value,
        parent: resolveTaskRef(document.getElementById('mParent').value, modalParentMap) === pid }), P.id);
      if (!M.open) say('More options…' + T.label, 'it did not open the full dialog');
      if (M.name !== 'A bigger piece of work') say('More options…' + T.label, 'the typed name did not come with it ("' + M.name + '")');
      if (!M.parent) say('More options…' + T.label, 'the parent did not come with it');
      await closeAll();
    }

    // on a phone the table scrolls sideways; what the blank row offers stays on screen
    {
      const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const pp = await pc.newPage();
      pp.on('pageerror', e => errs.push(e.message));
      await pp.goto(APP, { waitUntil: 'load' });
      await pp.evaluate(([d, tab, render]) => { hydrate(d); calculate(); refreshAll(); switchTab(tab); window[render](); }, [DATA, T.tab, T.render]);
      await pp.waitForTimeout(300);
      const pid = await pp.evaluate(() => tasks.find(t => isSummaryId(t.id) && childrenOf(t.id).length >= 2).id);
      await pp.tap(rowOf(T, pid) + ' .wbs-add').catch(e => say(A0, 'at a phone\'s width the + cannot be tapped: ' + e.message.split('\n')[0]));
      await pp.waitForTimeout(250);
      const PH = await pp.evaluate(b => { const m = document.querySelector(b + ' tr.wbs-draft .wbs-draft-more'); if (!m) return null;
        m.closest('tr').scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: innerWidth }; }, T.box);
      if (!PH) say(A0, 'at a phone\'s width a tap on + opened no blank row');
      else if (PH.left < 0 || PH.right > PH.w) say(A0, 'at a phone\'s width More options… is off screen (' + PH.left + '–' + PH.right + ' of ' + PH.w + ')');
      await pc.close();
    }

    // + on a leaf makes it a phase
    const leaf = (await pick()).leaf2;
    if (leaf) {
      const A1 = '+ under a leaf' + T.label, step = 'A step within it' + sfx;
      await show(T);
      await page.click(rowOf(T, leaf) + ' .wbs-add', { force: true }).catch(e => say(A1, 'its + cannot be pressed'));
      await page.waitForTimeout(150);
      await page.keyboard.type(step); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      const LF = await page.evaluate(([id, st]) => { const n = tasks.find(t => t.name === st); return { parent: n && n.parentId, sum: isSummaryId(id) }; }, [leaf, step]);
      if (LF.parent !== leaf) say(A1, 'the activity added in place is not under the leaf');
      if (!LF.sum) say(A1, 'the leaf did not become a phase');
    }
  }
  await blankRow('wbs');
  await blankRow('tasks');

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

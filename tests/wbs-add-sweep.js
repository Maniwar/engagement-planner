/* ═══════════════════════════════════════════════════════════════════════════
   ADDING WORK WHERE IT GOES IN THE WBS.

   + Add activity opened a dialog whose first question was the name, whose
   second screenful was progress, actuals and invoicing for work that did not
   exist yet, and whose WBS parent sat below all of it — and the new activity
   always landed last under that parent. The WBS tab itself offered no way to
   add anything: its help text said to set a parent in an Edit dialog on
   another tab. And a plan whose saved id counter had fallen behind its highest
   id handed the next new activity an id that was already taken.

   What is required:
   · loading a plan never leaves the id counters at an id already in use;
   · the WBS tab has + Add activity (its main button) and + Add milestone, and
     every row has a "+" that adds an activity under that row;
   · the dialog asks where the activity goes in its first section — under what,
     and in what position — and says the WBS code it will get before it is
     saved; the code it says is the code it gets;
   · progress and actuals are folded away while adding, one click from open,
     and open as before while editing;
   · adding under a leaf makes the leaf a phase; undo takes the addition back.
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
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });

  // ═══ THE ID COUNTERS ═════════════════════════════════════════════════════
  // the plan as saved, with its counters pulled behind its highest ids
  const stale = JSON.parse(JSON.stringify(DATA));
  const maxId = Math.max(...stale.tasks.map(t => t.id));
  stale.nextId = Math.max(1, maxId - 1);
  const maxRaid = Math.max(0, ...(stale.raid || []).map(r => r.id));
  if (maxRaid) stale.nextRaidId = Math.max(1, maxRaid - 1);
  R.ids = await page.evaluate(d => { hydrate(d); calculate(); return { nextId, nextRaidId, ids: tasks.map(t => t.id), raidIds: raid.map(r => r.id) }; }, stale);
  if (R.ids.ids.includes(R.ids.nextId) || R.ids.nextId <= maxId) say('ids', 'after loading, the next activity id is ' + R.ids.nextId + ', which is not past the highest id in use (' + maxId + ')');
  if (maxRaid && (R.ids.raidIds.includes(R.ids.nextRaidId) || R.ids.nextRaidId <= maxRaid)) say('ids', 'after loading, the next RAID id is ' + R.ids.nextRaidId + ', which is not past the highest in use (' + maxRaid + ')');
  await page.evaluate(d => { hydrate(d); calculate(); refreshAll(); }, DATA);
  await page.waitForTimeout(300);

  // ═══ THE WBS TAB OFFERS TO ADD ══════════════════════════════════════════
  await page.evaluate(() => switchTab('wbs')); await page.waitForTimeout(300);
  const W = await page.evaluate(() => {
    const vis = e => !!e && e.getClientRects().length > 0;
    const tb = [...document.querySelectorAll('#view-wbs .toolbar button')].filter(vis);
    const add = tb.find(x => /openAddModal\(false\)/.test(x.getAttribute('onclick') || ''));
    const ms = tb.find(x => /openAddModal\(true\)/.test(x.getAttribute('onclick') || ''));
    const rows = [...document.querySelectorAll('#wbsContainer tr[data-wbsrow]')];
    const plus = rows.map(r => r.querySelector('.wbs-add'));
    // a milestone is a moment, not a container: it cannot hold work, so it has no +
    const milestones = rows.filter(r => { const t = tasks.find(x => x.id === +r.dataset.wbsrow); return t && t.milestone; });
    return { add: !!add, addPrimary: !!add && add.classList.contains('btn-primary'), ms: !!ms,
      milestones: milestones.length, msWithPlus: milestones.filter(r => r.querySelector('.wbs-add')).length,
      rows: rows.length, withPlus: plus.filter(Boolean).length,
      named: plus.filter(p => p && /add .*under/i.test(p.getAttribute('aria-label') || '')).length };
  });
  R.wbsTab = W;
  if (!W.add) say('WBS tab', 'there is no + Add activity on the WBS tab');
  else if (!W.addPrimary) say('WBS tab', '+ Add activity is not the WBS tab\'s main button');
  if (!W.ms) say('WBS tab', 'there is no + Add milestone on the WBS tab');
  if (!W.rows) say('WBS tab', 'no WBS rows are drawn, so nothing here was checked');
  else if (W.withPlus < W.rows - W.milestones) say('WBS tab', 'only ' + W.withPlus + ' of ' + (W.rows - W.milestones) + ' rows that can hold work offer a "+" to add under them');
  else if (W.msWithPlus) say('WBS tab', W.msWithPlus + ' milestone row(s) offer to hold work under them');
  else if (W.named < W.rows - W.milestones) say('WBS tab', 'a row\'s "+" does not say, to a screen reader, what it adds under');

  // a phase with at least two children
  const P = await page.evaluate(() => {
    computeWbsCodes();
    const p = tasks.find(t => isSummaryId(t.id) && childrenOf(t.id).length >= 2);
    return p && { id: p.id, wbs: p.wbs, kids: childrenOf(p.id).map(c => ({ id: c.id, wbs: c.wbs, name: c.name })) };
  });
  if (!P) { say('WBS tab', 'the plan has no phase with two children'); }
  else {
    // + opens a row in place (wbs-inline-sweep.js); the full dialog is its More options…
    await page.evaluate(id => document.querySelector('#wbsContainer tr[data-wbsrow="' + id + '"] .wbs-add').click(), P.id).catch(e => say('WBS tab', 'the phase row\'s "+" could not be pressed: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(150);
    await page.evaluate(() => { const m = document.querySelector('#wbsContainer tr.wbs-draft .wbs-draft-more'); if (m) m.click(); });
    await page.waitForTimeout(300);
    const D = await page.evaluate(pid => {
      const vis = e => !!e && e.getClientRects().length > 0;
      const par = document.getElementById('mParent'), pos = document.getElementById('mPosition'), pv = document.getElementById('mWbsPreview');
      const sec = document.getElementById('edSecWhat');
      return { open: vis(document.getElementById('modal')), title: document.getElementById('modalTitle').textContent,
        parentResolves: par ? resolveTaskRef(par.value, modalParentMap) === pid : false, parentText: par ? par.value : null,
        parentInFirst: !!(sec && par && sec.contains(par)),
        parentBeforeEstimate: !!(par && document.getElementById('mO') && (par.compareDocumentPosition(document.getElementById('mO')) & Node.DOCUMENT_POSITION_FOLLOWING)),
        pos: pos ? [...pos.options].map(o => ({ v: o.value, t: o.textContent })) : null, posShown: vis(pos),
        preview: pv ? pv.textContent.trim() : null,
        pctShown: vis(document.getElementById('mPct')), unfold: vis(document.getElementById('paUnfold')) };
    }, P.id);
    R.addUnder = D;
    const at = 'add under ' + P.wbs;
    if (!D.open) say(at, 'the row\'s "+" and More options… did not open the Add activity dialog');
    if (!D.parentResolves) say(at, 'the dialog does not start with the phase as its parent (it reads "' + D.parentText + '")');
    if (!D.parentInFirst || !D.parentBeforeEstimate) say(at, 'where the activity goes is not asked in the dialog\'s first section, before the estimate');
    if (!D.pos || !D.posShown) say(at, 'there is no position to choose');
    else {
      if (!D.pos.length || D.pos[0].v !== 'end') say(at, 'the first position offered is not "at the end": ' + JSON.stringify(D.pos[0]));
      const afters = D.pos.filter(o => /^after:/.test(o.v));
      if (afters.length !== P.kids.length) say(at, afters.length + ' "after …" positions for a phase with ' + P.kids.length + ' children');
      if (!afters.every((o, i) => o.t.indexOf(P.kids[i].wbs) >= 0)) say(at, 'the "after …" positions do not name the children\'s codes in order');
    }
    const want = P.wbs + '.' + (P.kids.length + 1);
    if (!D.preview || D.preview.indexOf(want) < 0) say(at, 'the dialog does not say the new code will be ' + want + ' (it says "' + D.preview + '")');
    if (D.pctShown) say(at, 'progress and actuals are open while adding work that has not started');
    if (!D.unfold) say(at, 'with progress folded, there is no way to open it');

    // after the first child: the preview follows, and the save lands there
    const S = await page.evaluate(([P]) => {
      const pos = document.getElementById('mPosition');
      if (pos) { pos.value = 'after:' + P.kids[0].id; pos.dispatchEvent(new Event('change', { bubbles: true })); }
      const preview = (document.getElementById('mWbsPreview') || {}).textContent || '';
      const unf = document.getElementById('paUnfold'); if (unf) unf.click();
      const pctAfter = document.getElementById('mPct').getClientRects().length > 0;
      document.getElementById('mName').value = 'Walk the client through the new IA';
      document.getElementById('mO').value = '1'; document.getElementById('mM').value = '2'; document.getElementById('mP').value = '3';
      const before = tasks.length;
      saveActivity();
      computeWbsCodes();
      const nt = tasks.find(t => t.name === 'Walk the client through the new IA');
      const sib = childrenOf(P.id).map(c => c.id);
      return { preview, pctAfter, added: tasks.length - before, id: nt && nt.id, parent: nt && nt.parentId, code: nt && nt.wbs,
        at: nt ? sib.indexOf(nt.id) : -1, dupId: nt ? tasks.filter(t => t.id === nt.id).length : 0, modalOpen: document.getElementById('modal').getClientRects().length > 0 };
    }, [P]);
    R.saved = S;
    const want2 = P.wbs + '.2';
    if (S.preview.indexOf(want2) < 0) say(at, 'choosing "after ' + P.kids[0].wbs + '" does not change the preview to ' + want2 + ' ("' + S.preview + '")');
    if (!S.pctAfter) say(at, 'opening progress does not show it');
    if (S.added !== 1) say(at, 'saving added ' + S.added + ' activities');
    else {
      if (S.parent !== P.id) say(at, 'the saved activity is not under the phase');
      if (S.code !== want2) say(at, 'the dialog said ' + want2 + ' and the activity got ' + S.code);
      if (S.at !== 1) say(at, 'the saved activity is at position ' + (S.at + 1) + ' among its siblings, not second');
      if (S.dupId !== 1) say(at, 'the saved activity shares its id with ' + (S.dupId - 1) + ' other(s)');
    }

    // editing it: progress open as before, and no position question
    if (S.id) {
      // from a folded Add dialog straight into editing: the editor must open progress itself
      const E = await page.evaluate(id => { openAddModal(false); closeModal(); openEditModal(id); const vis = e => !!e && e.getClientRects().length > 0;
        const r = { pct: vis(document.getElementById('mPct')), pos: vis(document.getElementById('mPosition')), parentInFirst: document.getElementById('edSecWhat').contains(document.getElementById('mParent')) };
        closeModal(); return r; }, S.id);
      R.edit = E;
      if (!E.pct) say('edit', 'progress and actuals are folded while editing an existing activity');
      if (E.pos) say('edit', 'editing asks for a position — moving within a phase is the row handles\' job');
      // undo takes the addition back
      const U = await page.evaluate(id => { doUndo(); return tasks.some(t => t.id === id); }, S.id);
      if (U) say('undo', 'undo did not take the added activity back');
    }
  }

  // under a leaf: the leaf becomes a phase
  await page.evaluate(() => { calculate(); refreshAll(); switchTab('wbs'); }); await page.waitForTimeout(300);
  const L = await page.evaluate(() => { const l = tasks.find(t => !t.milestone && !isSummaryId(t.id) && !isTestCaseTask(t)); return l && l.id; });
  if (L) {
    const missing = await page.evaluate(id => { const btn = document.querySelector('#wbsContainer tr[data-wbsrow="' + id + '"] .wbs-add'); if (btn) btn.click(); return !btn; }, L);
    await page.waitForTimeout(150);
    const LR = missing ? { missing: true } : await page.evaluate(id => {
      const more = document.querySelector('#wbsContainer tr.wbs-draft .wbs-draft-more');
      if (!more) return { missing: true };
      more.click();
      document.getElementById('mName').value = 'Prepare the workshop pack';
      document.getElementById('mO').value = '1'; document.getElementById('mM').value = '1'; document.getElementById('mP').value = '2';
      saveActivity();
      const nt = tasks.find(t => t.name === 'Prepare the workshop pack');
      return { parent: nt && nt.parentId, summary: isSummaryId(id) };
    }, L);
    R.leaf = LR;
    if (LR.missing) say('add under a leaf', 'the leaf row has no "+"');
    else { if (LR.parent !== L) say('add under a leaf', 'the activity did not go under the leaf'); if (!LR.summary) say('add under a leaf', 'the leaf did not become a phase'); }
  }

  // + Add milestone from the WBS tab, and a top-level add from the Tasks tab
  const M = await page.evaluate(() => {
    const ms = [...document.querySelectorAll('#view-wbs .toolbar button')].find(x => /openAddModal\(true\)/.test(x.getAttribute('onclick') || ''));
    if (!ms) return null;
    ms.click(); const r = { milestone: document.getElementById('mMilestone').checked, title: document.getElementById('modalTitle').textContent };
    closeModal(); return r;
  });
  if (M && !M.milestone) say('WBS tab', '+ Add milestone opens a dialog that is not a milestone');
  const T = await page.evaluate(() => {
    computeWbsCodes(); const roots = tasks.filter(t => t.parentId == null || !tasks.some(x => x.id === t.parentId)).length;
    openAddModal(false);
    const r = { parent: document.getElementById('mParent').value, preview: ((document.getElementById('mWbsPreview') || {}).textContent || '').trim(), roots };
    // choosing a parent by typing refreshes the positions
    const ph = tasks.find(t => isSummaryId(t.id));
    const par = document.getElementById('mParent');
    par.value = ph.wbs; par.dispatchEvent(new Event('input', { bubbles: true }));
    const pos = document.getElementById('mPosition');
    r.afterTyping = pos ? [...pos.options].filter(o => /^after:/.test(o.value)).length : -1;
    r.kids = childrenOf(ph.id).length;
    closeModal(); return r;
  });
  R.top = T;
  if (T.parent) say('Tasks ▸ + Add activity', 'a top-level add starts with a parent ("' + T.parent + '")');
  if (T.preview.indexOf(String(T.roots + 1)) < 0) say('Tasks ▸ + Add activity', 'the preview does not say the new code will be ' + (T.roots + 1) + ' ("' + T.preview + '")');
  if (T.afterTyping !== T.kids) say('Tasks ▸ + Add activity', 'typing a parent offered ' + T.afterTyping + ' "after …" positions for one with ' + T.kids + ' children');

  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

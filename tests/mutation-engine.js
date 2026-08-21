/* ═══════════════════════════════════════════════════════════════════════════
   DOES THE SUITE HAVE TEETH?

   Nine sweeps and forty-four hand-derived cases were green while the PERT
   weighting was deliberately broken. Not because anyone wrote a bad check —
   because the reference plan's estimates are all symmetric, and for a symmetric
   estimate every weighted mean returns the same answer. The check was correct,
   the fixture could not tell the difference, and the whole apparatus reported
   success on a build that computed the wrong duration.

   That is the failure mode this file exists to catch. It breaks a load-bearing
   identity in the product, one at a time, writes the broken build to a temp
   file, and points the suite at it. Each mutant MUST turn something red. A
   surviving mutant is not a defect in the product — it is proof that a whole
   region of the product is unguarded, and it names which one.

   Usage:  node tests/mutation-engine.js
             Every mutant walks every check until one goes red. A SURVIVED here
             is trustworthy: nothing in the suite noticed.

           node tests/mutation-engine.js --quick
             Only the check expected to notice, plus the hand-derived plan. Fast
             enough to run while editing. A SURVIVED here means "the expected
             check did not catch it" and NOT "the suite has a hole" — some other
             check may well catch it. Confirm with a full run before believing a
             survivor.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// one product file, named for what Pages serves it as
const PRODUCT = ['index.html', 'pert-gantt-tracker.html']
  .find(n => fs.existsSync(path.join(ROOT, n))) || 'index.html';
const SRC = fs.readFileSync(path.join(ROOT, PRODUCT), 'utf8');
const QUICK = process.argv.indexOf('--quick') >= 0;
/* Positional substring filter, matched against `what`. Two hundred mutants is
   twenty-six to forty minutes, which is the right price for a release gate and the wrong
   price for "I just added one — is it caught?". Without this the honest options
   were to run the lot or to hand-edit the array, and hand-editing a probe to
   make it finish is how a probe quietly stops covering what it claims to.
   Same shape as anchor-check.js takes, deliberately: one convention. */
const ONLY = process.argv.slice(2).filter(a => !a.startsWith('-'));

/* Each mutant names the identity it breaks and what should notice. `find` must
   match exactly once in the file — a mutant that silently fails to apply is a
   false pass, which is the very thing being hunted here. */
const MUTANTS = [
  { what: 'PERT weighting: the 4x on most-likely becomes 5x over 7',
    find: 'return (O + 4 * M + P) / 6;',
    with: 'return (O + 5 * M + P) / 7;' },

  { what: 'PERT variance: the range is treated as five sigma, not six',
    find: 'function pertVariance(o, p) { return Math.pow(((+p || 0) - (+o || 0)) / 6, 2); }',
    with: 'function pertVariance(o, p) { return Math.pow(((+p || 0) - (+o || 0)) / 5, 2); }' },

  { what: 'criticality: an activity with a day of float is called critical',
    find: 't.isCritical = Math.abs(t.slack) < 0.01;',
    with: 't.isCritical = Math.abs(t.slack) < 1.01;' },

  /* THE OTHER DIRECTION. The mutant above makes MORE activities critical and
     was the only one ever aimed here; nothing tested a build that marks NONE.
     It turns out to be caught by the per-activity assertion — "zero slack and
     not marked critical" — rather than by anything about the path, which is
     worth knowing and is not what I expected when I wrote it. Named for what it
     actually proves. */
  { what: 'network: an activity with zero slack is not marked critical at all',
    find: '        t.isCritical = Math.abs(t.slack) < 0.01;',
    with: '        t.isCritical = false;' },

  { what: 'earned value: completed work is valued at its cost, not its budget',
    find: 'const evOf = t => plannedCostOf(t, hb) * ((t.percentComplete || 0) / 100);',
    with: 'const evOf = t => (actOf.get(t.id) || 0);' },

  /* ── the regions that had never been asked this question ──────────────────
     Four caught mutants proved four regions guarded and said nothing about the
     rest. These are the ones named as unverified: the backward pass, the working
     calendar, resource pair counting, the percentile rule, save/load field
     coverage, and the margin. A survivor here is not a product defect — it is a
     region where a defect could ship unnoticed, which is worth knowing. */

  { what: 'backward pass: slack measured from the finish instead of the start',
    find: 't.slack = t.ls - t.es;',
    with: 't.slack = t.lf - t.ef + 0.5;' },

  { what: 'working calendar: weekends counted as working days',
    find: '        if (isWorkingDay(d, holidays)) added++;',
    with: '        added++;' },

  { what: 'resource load: a double-booked day counted once per person, not per pair',
    find: '            overResourceDays++;',
    with: '            /* mutant: the day is no longer counted */' },

  { what: 'percentile: P80 reads the 80th value of an UNSORTED series',
    find: "      const pct = q => durations[Math.min(durations.length - 1, Math.floor(q * durations.length))];",
    with: "      const pct = q => durations[Math.min(durations.length - 1, Math.floor(q * durations.length * 0.75))];" },

  { what: 'save/load: percentComplete is written but never read back',
    find: '          percentComplete: t.percentComplete, predecessors: t.predecessors,',
    with: '          predecessors: t.predecessors,' },

  { what: 'margin: computed against cost instead of price',
    find: '      const margin = (price > 0 && !costBlind) ? (price - cost) / price * 100 : null;',
    with: '      const margin = (price > 0 && !costBlind) ? (price - cost) / cost * 100 : null;' },

  /* ── what leaves the application ──────────────────────────────────────────
     An export is read by a client, or loaded into Jira, or opened in Excel by
     someone with no way to tell a total is wrong. It is the one category where
     the mistake is seen by somebody else first. */

  { what: 'billing CSV: the TOTAL row overstates cost by 10%',
    find: 'd.totCost.toFixed(0), d.totBill.toFixed(0)]);',
    with: '(d.totCost*1.1).toFixed(0), d.totBill.toFixed(0)]);' },

  { what: 'Jira CSV: the first story is silently dropped',
    find: '      reqs.stories.forEach(st => {',
    with: '      reqs.stories.slice(1).forEach(st => {' },

  { what: 'billing CSV: a line emits its cost as NaN',
    find: 'r.cost.toFixed(0), r.billed.toFixed(0)',
    with: '(r.cost*undefined).toFixed(0), r.billed.toFixed(0)' },

  /* ── undo ─────────────────────────────────────────────────────────────────
     The one feature a person reaches for when they already believe something
     has gone wrong, which is what makes a partial restore worse than none.

     Note on a mutant that is NOT here: removing `redoStack = keepRedo` from
     doRedo. restoreSnapshot sets undoGuard before its internal saveLocal, so
     trackUndo returns before it can clear the branch — the line is dead defence
     and its removal changes nothing observable. Verified by tracing redoStack
     through a three-step redo on both builds: identical. An equivalent mutant
     no test can catch, so listing it would report a permanent false hole. */

  { what: 'undo: the history is a bag — it pops the oldest state, not the newest',
    find: '      restoreSnapshot(undoStack.pop());',
    with: '      restoreSnapshot(undoStack.shift());' },

  { what: 'undo: the guard fails, so undo records itself and stops progressing',
    find: '      if (undoGuard) { lastSnapshot = currentStr; return; }',
    with: '      if (false) { lastSnapshot = currentStr; return; }' },

  { what: 'undo: the depth cap discards the newest step instead of the oldest',
    find: '        if (undoStack.length > 60) undoStack.shift();',
    with: '        if (undoStack.length > 60) undoStack.pop();' },

  { what: 'undo: editing after an undo keeps the abandoned redo branch alive',
    find: '        redoStack = [];',
    with: '        /* mutant: the branch is kept */' },

  { what: 'undo: the restore rewinds the activities but not the RAID log',
    find: '        hydrate(JSON.parse(str));',
    with: '        { const _k = raid; hydrate(JSON.parse(str)); raid = _k; }' },

  /* ── the reference every variance is measured against ─────────────────────
     Break the baseline and nothing looks broken: the plan reports itself
     against the wrong past, confidently and self-consistently. */

  { what: 'baseline: it freezes the dates but not the effort',
    find: '        t.baseTe = t.te;',
    with: '        t.baseTe = t.te * 1.15;' },

  { what: 'baseline: the feature set is committed at a different moment than the dates',
    find: '      reqsBaseline = {\n        at: baselineDate,',
    with: "      reqsBaseline = {\n        at: '2020-01-01'," },

  { what: 'baseline: the reference tracks the plan instead of holding still',
    find: '        t.baseCost = taskCost(t);',
    with: "        t.baseCost = taskCost(t);\n        Object.defineProperty(t,'baseTe',{get(){return this.te;},configurable:true});" },

  { what: 'baseline: clearing keeps the committed feature set',
    find: "      reqsBaseline = null;\n      // logged, not truncated",
    with: "      // logged, not truncated" },

  { what: 'baseline: the reference dates are never written to the file',
    find: '          baseStart: t.baseStart ? fmtISO(new Date(t.baseStart)) : null,',
    with: '          baseStart: null,' },

  /* Rolling the baseline is now "push a version and point at it", so the
     mutant is the version not being taken: the next change order then diffs
     from the one before and re-lists scope the client already approved. */
  { what: 'change order: approval does not roll the baseline, so the next one re-bills',
    find: "      const toV = pushVersion('co', p.no);",
    with: '      const toV = contractVersion() || pushVersion(\'co\', p.no);' },

  { what: 'change order: approval leaves the draft pending and it can be logged twice',
    find: '      draftChangeOrder._pending = null;\n      saveLocal();\n      renderCoHistory();',
    with: '      saveLocal();\n      renderCoHistory();' },

  /* Anchored on the ACCEPT path specifically. The short anchor stopped being
     unique the moment issuing became its own path writing its own log entry,
     and the engine SKIPPED it rather than picking one — correctly: a mutant
     that lands somewhere ambiguous is not evidence about anything. Reported as
     stale rather than as a survivor, which is the distinction that made this a
     two-minute repair instead of a hunt. */
  { what: 'change order: the log records a price delta the client never approved',
    /* REPAIRED. The anchor was three consecutive lines of the accepted-change-order
       record, and eight fields were added to that record since — rationale,
       baseDate, baseFinish, basePrice, amended, unit, legacyBasis, unpricedAdds
       — so the block stopped matching and the engine reported it stale. It was
       proving nothing for as long as that was true.

       Re-anchored on the smallest thing that is BOTH unique and load-bearing:
       the line that mints the accepted version, plus the line carrying the
       price. The price line alone appears twice, once on issue and once on
       acceptance, and a mutant that lands ambiguously is not evidence — which
       is exactly why the engine refused to guess. Two lines instead of three,
       so the next field added to this record does not break it again. */
    find: "      const toV = pushVersion('co', p.no);\n      coLog.push({ no: p.no, date: fmtISO(new Date()), scope: p.scope, detail: p.detail,\n        finishDelta: p.finishDelta, priceDelta: p.priceDelta,",
    with: "      const toV = pushVersion('co', p.no);\n      coLog.push({ no: p.no, date: fmtISO(new Date()), scope: p.scope, detail: p.detail,\n        finishDelta: p.finishDelta, priceDelta: (p.priceDelta || 0) + 500," },

  /* ── the dependency wizard: a button that acts on something else ───────────
     These three are not arithmetic. They are the shape of defect the user hit
     and no check could see: the control is wired, the handler runs, the data
     changes — and it is the WRONG object, or the button is off the edge of the
     dialog where no click can reach it. Reported as "the buttons don't do
     anything", which is what a correct handler on an unreachable or misaddressed
     control looks like from the outside. */

  { what: 'wizard: ✎ Open sends you to the task in the headline, whose link list is empty',
    find: 'const openId = holder ? holder.id : id;',
    with: 'const openId = id;' },

  /* ── the split budget bar and the catch-up date ────────────────────────────
     Both of these went wrong on the way in, and neither threw: the segments
     stacked naively so the drawn far end stated the timing figure while the
     badge stated the net, and the catch-up search bisected on instants and then
     floored the answer, naming a day on which the curve had not yet reached the
     booked total. A panel that talks a reader out of an alarm has to be right
     about the date it does it with. */

  { what: 'budget bar: the neutral segment carries the overrun instead of the timing',
    find: '        const timing = (evNow != null && pvNow != null) ? evNow - pvNow : null;',
    with: '        const timing = (evNow != null && pvNow != null) ? actCost - evNow : null;' },

  { what: 'budget bar: the segments stack naively, so the drawn end is not the gap',
    find: '            const lo = counter ? Math.min(a, b2) : Math.max(Math.min(a, b2), loN);',
    with: '            const lo = Math.min(a, b2);' },

  /* ── THE RECONCILIATION'S SOURCE COLUMNS ────────────────────────────────
     Three ways the table stops adding up, all of which leave the DERIVED
     columns footing perfectly — which is why the version that shipped with two
     of them was green on every check in this repo. An activity contributing
     zero, or a milestone, takes its booked and due figures out of the visible
     rows and leaves both in the totals; the bar stays right and the audit trail
     under it stops being one. The last mutant is the trap the first version of
     the CHECK fell into: let the residual absorb the difference and the columns
     add up again under a label that says the money cannot be opened. */

  /* ── VERSIONS, ACCEPTANCE, AND THE DIFF THAT SITS ON BOTH ────────────────
     Seven mutants for the three layers, each restoring one of the specific
     defects they were built to end. All seven are invisible to a
     value-comparing check on a loaded fixture, because none of these conditions
     exists in a committed plan: nothing is renamed, no test carries a result,
     nobody has signed anything. The checks that catch them build the case
     first, which is why they are in baseline-sweep rather than anywhere that
     merely looks. */

  { what: 'baseline: the diff goes back to keying activities by name',
    find: '      const A = new Map((fromSnap.tasks || []).map(t => [t.id, t]));\n      const B = new Map((toSnap.tasks || []).map(t => [t.id, t]));',
    with: '      const A = new Map((fromSnap.tasks || []).map(t => [t.name, t]));\n      const B = new Map((toSnap.tasks || []).map(t => [t.name, t]));' },

  { what: 'baseline: an owner change is invisible to the change order again',
    find: "        if (String(a.owner || '') !== String(b.owner || ''))",
    with: '        if (false)' },

  { what: 'baseline: a change-order line prices off the frozen baseline, so nothing is priced',
    find: '          value: Math.round(taskBilledValue(t) || 0),',
    with: '          value: Math.round(plannedCostOf(t, hasBaseline()) || 0),' },

  { what: 'baseline: finishing a test case counts as the test passing',
    find: "      else if (passed.length === cases.length) state = 'accepted';",
    with: "      else if (cases.every(t => (t.percentComplete || 0) >= 100)) state = 'accepted';" },

  { what: 'baseline: a failed test case stops making its criterion fail',
    find: "      else if (failed.length) state = 'failed';",
    with: "      else if (false) state = 'failed';" },

  { what: 'baseline: a re-test leaves no trace, so passed and passed-eventually are one fact',
    find: '               retests: cases.reduce((s, t) => s + Math.max(0, (t.tcRuns || []).length - 1), 0) };',
    with: '               retests: 0 };' },

  /* The comparison is computed correctly and reaches no host — the failure this
     repo has shipped before and that no arithmetic check can see. And the
     commitment log stops taking a version, so every row goes back to ending at
     a sentence with nothing behind it. */
  { what: 'baseline: the version comparison is computed and never drawn',
    find: "        + '<div id=\"versionCompareBl\" style=\"margin-top:.6rem\">' + versionViewHtml() + versionCompareHtml() + '</div>'",
    with: "        + ((() => versionViewHtml() + versionCompareHtml())(), '')" },

  { what: 'baseline: a commitment stops recording which version it took',
    find: "      const vRec = kind === 'clear' ? null : pushVersion('baseline',\n        kind === 'set' ? (baselineLog.length ? 'Re-baselined' : 'Original commitment') : String(kind));",
    with: '      const vRec = null;' },

  /* Three fields that shipped wired to nothing, and one that counted the wrong
     set. Each is a "reads correct, does nothing" defect — the shape no
     value-comparing check can see, because the value it would compare is never
     produced. */

  { what: 'baseline: the evidence field goes back to being unreachable',
    find: '            <div class="form-group" id="mTcRow" style="display:none;margin-bottom:0">',
    with: '            <div class="form-group" id="mTcRowGone" style="display:none;margin-bottom:0">' },

  { what: 'baseline: typing evidence into the editor is read but never stored',
    find: '      t.tcEvidence = ev.value.trim();',
    with: '      /* mutant: read and discarded */' },

  { what: 'baseline: a failure recorded in the app raises nothing to chase',
    find: "      if (result) { try { raised = raiseTestDefect(t, result, o.note, 'recorded in the app'); } catch (e) {} }",
    with: '      if (false) { raised = true; }' },

  { what: 'baseline: re-running a failing case opens a second defect for the same thing',
    find: "      if (raid.some(x => x.taskId === tc.id && x.title === title && x.status !== 'Closed')) return false;",
    with: '      if (false) return false;' },

  { what: 'baseline: delivered stops being distinguished from accepted',
    find: '        if (done && worth > 0 && unaccepted.has(t.id)) {',
    with: '        if (false) {' },

  { what: 'change order: the cumulative total counts scope nobody has agreed',
    find: '      const acc = coAccepted();',
    with: '      const acc = coLog;' },

  /* View and restore. The middle one is the unrecoverable failure in this
     feature: a restore that tidies the plan by deleting the record of work
     people actually did. */

  { what: 'baseline: a version can be diffed but not opened',
    find: "        if (el) { try { el.innerHTML = versionViewHtml() + versionCompareHtml(); } catch (e) {} }",
    with: "        if (el) { try { el.innerHTML = versionCompareHtml(); } catch (e) {} }" },

  { what: 'baseline: restoring a version wipes the actuals along with the plan',
    find: '        if (s2.acceptance != null) t.acceptance = s2.acceptance;',
    with: "        t.percentComplete = 0; t.actualStart = ''; t.actualFinish = ''; t.actualEffort = null; t.invoiced = null;\n        if (s2.acceptance != null) t.acceptance = s2.acceptance;" },

  { what: 'baseline: a restore leaves the scope added after the version in place',
    find: "      const rm = new Set();\n      addedSince.forEach(t => { rm.add(t.id); allDescendants(t.id).forEach(d => rm.add(d.id)); });\n      tasks = tasks.filter(t => !rm.has(t.id));",
    with: '      const rm = new Set();' },

  { what: 'baseline: a restore overwrites the present without recording it first',
    find: "      pushVersion('draft', 'Before restoring v' + v.v);",
    with: '      /* mutant: the present is not saved */' },

  { what: 'baseline: a restore leaves links pointing at activities it deleted',
    find: '        t.predecessors = (t.predecessors || []).filter(pr => live.has(pr.id));',
    with: '        t.predecessors = (t.predecessors || []);' },

  { what: 'baseline: a restore puts the activities back and leaves the criteria drifted',
    find: '        st.ac = (was.ac || []).map(a => ({ id: String(a.id), text: String(a.text || \'\'),\n                                           type: a.type || \'\' }));',
    with: '        /* mutant: the criteria are left as they now stand */' },

  { what: 'baseline: the version chain grows without bound',
    find: '      if (planVersions.length <= VERSION_CAP) return 0;',
    with: '      return 0;' },

  { what: 'baseline: the trim takes a version a change order points at',
    find: "      if (v.kind === 'sow' || v.kind === 'co' || v.kind === 'signoff') return true;",
    with: '      return false;' },

  { what: 'baseline: versions are dropped and nothing records that they were',
    find: '        planVersions[0].trimmed = (planVersions[0].trimmed || 0) + dropped;',
    with: '        /* mutant: the gap is left unexplained */' },

  { what: 'baseline: a sign-off records a date instead of the version it signed',
    find: "      const v = pushVersion('signoff', 'Accepted: ' + (signoffRefLabel(sc, ref) || sc));",
    with: '      const v = { v: null };' },

  /* Splitting a crowded tab into sections creates two failures the old scroll
     could not have: a section with no way to reach it, and two buttons that
     paint the same thing because a key fell through to a default. Both look
     completely normal. And a link into the tab is now a two-part address, so
     one that names only the tab lands wherever you happened to be last —
     "Set day rates" opening the worklist is a button that lies. */
  { what: 'navigation: two sections of the team tab paint the same panel',
    find: "        cost:     () => resourceEffortHtml() + timesheetHtml() + ledgerHtml() + billingBreakdownHtml() + cashTermsPanelHtml()",
    with: "        cost:     () => levelBanner + heatmap + summary" },

  /* The `hidden` attribute only sets display:none from the user-agent sheet,
     and .toolbar carries an author display:flex — so the attribute reads
     correctly in the DOM and changes nothing on screen. This one exists to keep
     the check reading the COMPUTED style; an assertion on the flag agrees with
     the code and not with the page. */
  { what: 'navigation: the section-scoped toolbar is hidden by a flag the stylesheet overrules',
    find: "      if (tools) tools.style.display = resTab === 'workload' ? '' : 'none';",
    with: "      if (tools) tools.hidden = resTab !== 'workload';" },

  { what: 'navigation: a link into the team tab forgets which section it meant',
    find: '    function resGoto(k) { setResTab(k); switchTab(\'resources\'); }',
    with: "    function resGoto(k) { switchTab('resources'); }" },

  /* L1 is the executive view of the chart and it was the one with no committed
     dates on it: collapsing the phases took every milestone underneath them. */
  { what: 'criticality: the Gantt loses its milestones the moment a phase is collapsed',
    find: '      const rows = ganttWbsOrder();',
    with: '      const rows = visibleWbsOrder();' },

  { what: 'drill-in: an activity running exactly to plan is dropped from the reconciliation',
    find: '            if (!(booked > 0.5 || due > 0.5)) return null;',
    with: '            if (!(booked > 0.5 || due > 0.5) || Math.abs(gap(t)) < 0.5) return null;' },

  { what: 'drill-in: milestones carry booked cost and are excluded from the reconciliation',
    find: '          const rows = leaves.map(t => {\n            const booked = actOf.get(t.id) || 0, due = planToDate(t);',
    with: '          const rows = leaves.filter(t => !t.milestone).map(t => {\n            const booked = actOf.get(t.id) || 0, due = planToDate(t);' },

  /* Two more were written for this and then DELETED rather than kept green,
     because neither could change what the page does. Zeroing the residual
     line's due/booked cells is a no-op once the table stops dropping rows — the
     residual is always zero — and routing an unknown tone through `m[tone] ||
     default` behaves identically while every tone is in the map. A mutant that
     cannot alter behaviour is caught by nothing and proves nothing, and keeping
     it would have inflated the count with two guaranteed survivors or, worse,
     two that "passed" because the build and the mutant were the same program. */

  /* ── ONE AMBER OVER TWO OPPOSITE FINDINGS ───────────────────────────────
     Being ahead of the spend curve because the work is ahead costs nothing.
     Finished work costing more than it was budgeted is a real overrun. They
     shared a colour, which put the alarm on the benign case — and the benign
     case is the common one, so the alarm was mostly wrong and stopped being
     read. Two mutants: collapse the tones back into one, and let the new tone
     fall through a default that paints it green. */

  { what: 'budget bar: ahead-of-curve and genuinely overrun wear the same warning colour',
    find: "        tone: (overCurve && overValue) ? 'bad' : overValue ? 'chg' : overCurve ? 'early' : 'good'",
    with: "        tone: (overCurve && overValue) ? 'bad' : (overCurve || overValue) ? 'chg' : 'good'" },

  { what: 'budget bar: the new tone is wired to the reassuring colour instead of its own',
    find: "      badge: { bad: 'badge-blocked', chg: 'badge-warn', early: 'badge-info', good: 'badge-ok' },",
    with: "      badge: { bad: 'badge-blocked', chg: 'badge-warn', early: 'badge-ok', good: 'badge-ok' }," },

  /* A glyph that duplicates the punctuation of the words beside it. Nothing is
     miscomputed, so every value-comparing check in the repo is blind to it, and
     a reader sees it instantly. */
  { what: 'form: the watch chip prefixes a question mark to a label that is already a question',
    find: "        + escapeHtml(tip) + '\"><span aria-hidden=\"true\">👁</span>'",
    with: "        + escapeHtml(tip) + '\"><span aria-hidden=\"true\">' + (asks ? '?' : '👁') + '</span>'" },

  { what: 'catch-up: the crossing date is floored to the midnight before it',
    find: '      return { on: stripTime(new Date(dayAt(hiD))), days: hiD };',
    with: '      return { on: stripTime(new Date(dayAt(hiD) - 86400000)), days: hiD };' },

  /* ── one envelope, not three ───────────────────────────────────────────────
     The Budget bar divides by an envelope, the spend curve totals one, and the
     note says the bar IS the curve's vertical gap at today. On a plan with work
     added after the baseline they were three different numbers, because
     pvSpread never fell back to live DATES the way plannedCostOf falls back to
     live COST, and the bar's denominator summed `baseCost || 0` — the exact bug
     budgetAtCompletion carries a comment about. Invisible until a real export
     with twelve post-baseline test cases arrived. */

  { what: 'envelope: the curve drops work the baseline never dated',
    /* anchored through the comment above it, because revSpread now applies the
       SAME baseline-then-live date rule and the two lines alone match twice.
       A mutant that matches more than once cannot be trusted to have applied
       where it was aimed, which is why the run reports a skip rather than
       quietly patching the first hit. */
    find: '           where "this was not in the commitment" gets said. */\n        const s1 = (ub ? t.baseStart : t.startDate) || t.startDate;\n        const f1 = (ub ? t.baseFinish : t.finishDate) || t.finishDate;',
    with: '           where "this was not in the commitment" gets said. */\n        const s1 = ub ? t.baseStart : t.startDate;\n        const f1 = ub ? t.baseFinish : t.finishDate;' },

  { what: 'envelope: the bar divides by the frozen sum instead of the plan',
    find: '        const ref = baseCost > 0 ? budgetAtCompletion(hb) : planCost;',
    with: '        const ref = baseCost > 0 ? baseCost : planCost;' },

  /* the scope verdict, in both directions — "no change order is due" is the most
     expensive sentence on the page to get wrong */

  { what: 'scope: test-case regeneration is never named as verification work',
    find: "        if (verificationOnly && featureHeld && scp.state !== 'flat') {",
    with: '        if (false) {' },

  { what: 'scope: real growth is cleared as verification work',
    find: '        const verificationOnly = moved.length > 0 && movedTc === moved.length;',
    with: '        const verificationOnly = moved.length > 0;' },

  { what: 'form: a template placeholder is printed at the reader again',
    find: '<div id="rScore" class="raid-score">\u2014</div>',
    with: '<span class="help-text">Score $' + '{\'\' /' + '* prob x impact *' + '/}</span>' },

  { what: 'form: the RAID owner box is no longer a type-ahead',
    find: '      populateOwnerList();\n      /* Status had no control at all.',
    with: '      /* Status had no control at all.' },

  { what: 'drill-in: the badge counts the top 5 rather than everything that matched',
    find: '      const shownN = r.drivers.length, totalN = r.drivers.matched || shownN;',
    with: '      const shownN = r.drivers.length, totalN = shownN;' },

  /* ── the red ring ─────────────────────────────────────────────────────────
     It lands on GREEN cells, so a red ring on a finished activity reads as "done
     badly". It never means that: only that the RECORD of what happened is
     missing or impossible. Reported by someone whose ringed activities had all
     come in under their estimates. */

  { what: 'ring: the caption counts the flagged cells and names no reason',
    find: "          + (top.length ? ': ' + top.join(', ') + '.' : '.')",
    with: "          + '.'" },

  { what: 'ring: nothing says the ring is about the record, not about effort',
    find: "              + '<i class=\"ptr-c-done ptr-flag-high\"></i>the <b>record</b> needs a second look — dates, '\n              + 'cost or an open RAID entry, not effort</span>' : '');",
    with: "              + '<i class=\"ptr-c-done ptr-flag-high\"></i>needs a second look</span>' : '');" },

  /* ── the corrupt file ──────────────────────────────────────────────────────
     A real plan with two pairs of test cases sharing activity ids. Everything is
     keyed by id, so the pairs collided, the topological sort miscounted, the
     cycle finder started from `undefined` and threw — out of recompute, out of
     ensureCalculated, out of switchTab. Five tabs dead, the estimate bank blank,
     Calculate inert. One TypeError, no error boundary anywhere above it, and
     three sweeps plus forty-five hand-derived cases green the whole time. */

  { what: 'corrupt file: the cycle finder dies on an empty cycle set again',
    find: ['      if (!inCycle.size) return null;\n      let cur = inCycle.values().next().value;',
           '      while (cur != null && !seen.has(cur)) {',
           '        const nxt = (preds[cur] || []).find(p => inCycle.has(p.id));'],
    with: ['      let cur = inCycle.values().next().value;',
           '      while (!seen.has(cur)) {',
           '        const nxt = preds[cur].find(p => inCycle.has(p.id));'] },

  { what: 'corrupt file: duplicate ids are no longer healed on load',
    find: '      repairDuplicateTaskIds({ silent: true });',
    with: '      /* mutant: the file loads corrupt */' },

  { what: 'corrupt file: the notice blames a loop for a duplicate id',
    find: '      const dup = findDuplicateTaskIds();\n      if (dup.length)',
    with: '      const dup = [];\n      if (dup.length)' },

  /* ── the two the user found on the live demo ──────────────────────────────
     Both are about what a panel says when it has nothing to show. One told a
     reader with 41 activities to add activities; the other showed forty-four
     full-sentence rows where a count belonged. Neither is an arithmetic error,
     and neither would ever throw. */

  { what: 'blocked tab: a plan with a dependency loop shows the first-run message again',
    find: '      if (!schedOk && tasks.length) paintScheduleBlocked();',
    with: '      /* mutant: nothing says why the tab is empty */' },

  { what: 'blocked tab: the reason is overwritten by the next repaint',
    find: '      if (!calculated) { host.innerHTML = scheduleBlockedHtml(); return; }',
    with: '      if (!calculated) { host.innerHTML = blank; return; }' },

  { what: 'blocked tab: Calculate fails silently again',
    /* anchor moved when calculate() gained its boundary: the bare
       `if (!recompute())` became a guarded call whose result is read from `rc`.
       Repaired rather than deleted — the property it holds is still live and the
       skip was reported precisely so this would not go quietly vacuous. */
    find: '      if (!rc) {\n        const loop = findScheduleCycleIds() || [];',
    with: '      if (!rc) { return; }\n      if (false) {\n        const loop = findScheduleCycleIds() || [];' },

  { what: 'changes panel: a large diff expands over the whole tab again',
    find: '      const BIG = d.total > 12;',
    with: '      const BIG = false;' },

  /* ── the side readout ─────────────────────────────────────────────────────
     Three separate facts that used to be one middot-joined sentence in a badge.
     Split apart, each can now disagree with the others on its own, and two of
     those disagreements would put an alarm back on a plan that is fine. */

  { what: 'readout: the caption contradicts the direction of the figure beside it',
    find: "          : bv.gap > 0 ? 'ahead of the spend curve' : 'behind the spend curve';",
    with: "          : bv.gap > 0 ? 'behind the spend curve' : 'ahead of the spend curve';" },

  { what: 'readout: an underrun is painted as a fault',
    find: "          bud.deltaVerdictTone = tiny ? 'flat' : overAll > 0 ? 'bad' : 'good';",
    with: "          bud.deltaVerdictTone = 'bad';" },

  /* ── the two surfaces that had no checks at all ────────────────────────────
     The commitment history and the estimate bank. The bank matters most: it is
     the only data here that outlives the project file, and a wrong median in it
     surfaces as a quote that is light — on the next engagement, to a different
     client, with nothing on any screen looking wrong. */

  { what: 'baseline history: taking a baseline no longer records the commitment',
    find: "      baselineLogPush('set');",
    with: '      /* mutant: the commitment is not recorded */' },

  { what: 'baseline history: clearing truncates the log instead of appending to it',
    find: "      baselineLogPush('clear');",
    with: '      baselineLog = [];' },

  { what: 'baseline history: the cap drops the ORIGINAL commitment',
    find: '        const gone = baselineLog.splice(1, 1)[0];',
    with: '        const gone = baselineLog.splice(0, 1)[0];' },

  { what: 'baseline history: the reset count ignores what the cap took',
    find: "      return baselineLog.filter(e => e.kind === 'set').length\n        + ((baselineLog[0] && baselineLog[0].trimmedSets) || 0);",
    with: "      return baselineLog.filter(e => e.kind === 'set').length;" },

  { what: 'baseline history: the log is never written to the file',
    find: '        resources, reserves, baselineDate, baselineLog, levelMode, projectBudget,',
    with: '        resources, reserves, baselineDate, levelMode, projectBudget,' },

  { what: 'bank: forgetting a project shortens the list without dropping the records',
    find: '      const keep = all.filter(r => r.proj !== proj);',
    with: '      const keep = all.slice(0, Math.max(0, all.length - 1));' },

  { what: 'bank: span-derived actuals are taught to the estimator as measured effort',
    find: "    function bankCalibration() {\n      const rows = loadBank().filter(r => r.basis === 'logged' && r.ratio > 0);",
    with: "    function bankCalibration() {\n      const rows = loadBank().filter(r => r.ratio > 0);" },

  { what: 'test plan: the sample ships its test cases as one serial chain again',
    find: '      unchainTestCases({ silent: true });',
    with: '      /* mutant: the sample ships chained */' },

  { what: 'wizard: ⑂ Nest offers to re-parent a test case under a phase',
    find: '&& predT && !isTestCaseTask(predT) && !predIsPhase',
    with: '&& predT && !isTestCaseTask(predT)' },

  /* Two edits, because either alone still fits: putting the buttons back beside
     the text only overflows once they also stop wrapping, and a mutant that
     survives for being too small reads as a hole in the sweep that is not one. */
  { what: 'wizard: the buttons sit beside the text again and run off the dialog',
    find: ['rows += `<div style="padding:0.5rem 0.65rem;border:1px solid',
           '<div style="display:flex;gap:0.35rem;flex-wrap:wrap;justify-content:flex-end;margin-top:0.4rem">'],
    with: ['rows += `<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0.65rem;border:1px solid',
           '<div style="display:flex;gap:0.35rem;flex-shrink:0;flex-wrap:nowrap;justify-content:flex-end">'] },

  /* ── prose that only pretends to read the plan ────────────────────────────
     Every other mutant here breaks a computation. This one leaves the
     computation perfectly correct and stops the SENTENCE from using it — the
     figure is still right everywhere else on the page, and one caption states
     a number typed by hand. That is the shape of defect a reader cannot catch
     by eye, because a hardcoded claim reads exactly like a computed one, and it
     is the shape nothing in the suite could see before dynamic-prose-sweep. */

  { what: 'prose: the booked-to-date caption states a figure typed by hand',
    find: "escapeHtml(hasAc ? money(c.ac) + ' booked' : 'nothing booked')",
    with: "escapeHtml(hasAc ? '$27,900 booked' : 'nothing booked')" },

  /* ── one rule, asked in four places ───────────────────────────────────────
     computeResourceLoad does not count a day whose overlapping work is all
     finished. The heatmap cell, its tooltip, the day drill-in and the mend cards
     all restate that judgement, and three of them used to re-derive it naively —
     so a red cell sat beside a badge reading OK, and the drill-in's jump button
     pointed at a mend card that is never built for a discounted day and did
     nothing at all when clicked. */

  { what: 'heatmap: a day is painted as a conflict on raw load, ignoring the finished-work rule',
    find: '          const isOver = overSet.has(iso);',
    with: '          const isOver = load > R.capacity + 1e-6;' },

  { what: 'heatmap: the day drill-in re-derives "over" and offers a jump with nowhere to land',
    find: '        const isOver = (R.overDays || []).indexOf(iso) >= 0;',
    with: '        const isOver = day.load > R.capacity + 1e-6;' },

  { what: 'heatmap: a 200% peak sits beside a bare green OK with nothing reconciling them',
    find: '            : R.peak > R.capacity + 1e-6',
    with: '            : false' },

  /* ── the address bar, and the panel you hand to a person ──────────────────
     Both are about somebody else acting on what they see: one is whether a view
     can be returned to or linked, the other is whether a row says enough to act
     on and whether the copy of it carries the same facts. */

  { what: 'navigation: a tab no longer writes its own address, so Back leaves the application',
    find: "      if (!_tabNav && location.hash.replace(/^#/, '') !== name) {",
    with: '      if (false) {' },

  { what: 'worklist: the row stops carrying the open RAID entry raised against its activity',
    find: "(typeof raidForTask === 'function' ? raidForTask(t.id, true) : [])",
    with: '[]' },

  { what: 'worklist: activity names are truncated back to a shared prefix',
    find: "        + ekTok(r.kind, r.wbs, r.name, { xs: true, max: 140 }) + '</button>'",
    with: "        + ekTok(r.kind, r.wbs, r.name, { xs: true, max: 22 }) + '</button>'" },

  { what: 'worklist: nothing can start and the thing everyone waits on goes unnamed',
    find: '      const all = [...cnt.values()].sort((a, b) => b.n - a.n);\n      return all.length ? all[0] : null;',
    with: '      return null;' },

  { what: 'worklist: the copied document drops the risks it lists on screen',
    find: "(r.raid || []).forEach(q => L.push('      ' + q.type.toLowerCase() + ': ' + q.title",
    with: "[].forEach(q => L.push('      ' + q.type.toLowerCase() + ': ' + q.title" },
  /* ── every row reachable, and criteria that only ever ADD ─────────────────
     Two requests, one shape: a summary with no way out. The worklist card capped
     three groups and discarded finished work at the data layer, so "and 6 more"
     was the end of the road; and the story card could rewrite its criteria or
     regenerate its test cases but never simply add coverage — a rewrite replaces
     wording a client may have signed. */

  { what: 'worklist: "Show every row" no longer lifts the per-group cap',
    find: '      const MAXN = wlView.all ? 1e9 : 6, MAXB = wlView.all ? 1e9 : 5;',
    with: '      const MAXN = 6, MAXB = 5;' },

  { what: 'worklist: the drill-in caps its own list, which is the one thing it exists not to do',
    find: '          + wlTable(rows, showBlock, 1e9)',
    with: '          + wlTable(rows, showBlock, 3)' },

  { what: 'worklist: finished activities are discarded instead of kept behind a filter',
    find: '          if (done) { b.done++; b.doneRows.push(r2); return; }',
    with: '          if (done) { b.done++; return; }' },

  { what: 'criteria: the model\'s own AC ids are trusted, so a new one collides with an existing one',
    find: "        do { id = base + '.' + (n++); } while (existing.has(id));",
    with: "        id = String(a.id || (base + '.' + (n++)));" },

  { what: 'criteria: "add" replaces the existing criteria instead of appending to them',
    find: '      s.ac = (s.ac || []).concat(added);',
    with: '      s.ac = added;' },
  /* ── effort, and whose it is ──────────────────────────────────────────────
     A worklist that states a date and not a size asks somebody to plan their
     week from half the information. Once effort is on the row the variance is
     free — but both are per PERSON: an activity two people split at 50% each
     contributes half to each, and dropping that weighting silently inflates the
     plan's effort by every piece of joint work. */

  { what: 'effort: a worklist row shows the whole activity as one person\'s, ignoring their allocation',
    find: '            estDays: unitToWorkingDays(row.te) * share,',
    with: '            estDays: unitToWorkingDays(row.te),' },

  { what: 'effort: the per-person breakdown drops the allocation weighting and double-counts shared work',
    find: '          R.planDays += unitToWorkingDays(Number(t.te) || 0) * share;',
    with: '          R.planDays += unitToWorkingDays(Number(t.te) || 0);' },

  { what: 'effort: variance is measured against the whole estimate, not the fraction actually earned',
    find: '        R.varDays = R.measured ? R.actDays - R.earnedDays : null;',
    with: '        R.varDays = R.measured ? R.actDays - R.refDays : null;' },

  { what: 'effort: the rich-text copy drops the column the screen shows',
    find: '                + \'<td style="\' + td + \'">\' + h(wlEffText(r)) + \'</td>\'',
    with: '                + \'<td style="\' + td + \'">—</td>\'' },
  /* ── who did it, and who they work for ────────────────────────────────────
     The bank could calibrate by activity kind, work type and role, and could not
     answer the question that recurs every time the same subcontractor turns up on
     another engagement: does THAT firm's work run over. A role cannot answer it —
     two firms both field "integration developers" — and an individual's name
     usually cannot either, because people rarely repeat across clients while the
     partner does. */

  { what: 'bank: the archived row loses the set of companies that touched the activity',
    find: '          orgs: [...new Set(taskParticipants(t).map(pr => orgOf(pr.name)).filter(Boolean))],',
    with: '          orgs: [],' },

  { what: 'bank: archived participants carry no allocation, so one person at 100% reads like four at 25%',
    find: '          people: taskParticipants(t).map(pr => ({ n: pr.name, u: Number(pr.units) || 0,',
    with: '          people: taskParticipants(t).map(pr => ({ n: pr.name, u: 0,' },

  { what: 'bank: joint work is credited to one firm instead of every firm on it',
    find: '        }, { minN: ORG_MIN_N, multi: true }).slice(0, 10),',
    with: '        }, { minN: ORG_MIN_N }).slice(0, 10),' },

  { what: 'bank: the company calibration is computed and never reaches the prompt',
    find: "By the COMPANY that did the work — ${c.byOrg.map(line).join(' | ')}.",
    with: 'By the COMPANY that did the work — (omitted).' },
  /* ── a company is an entity, not a spelling ───────────────────────────────
     The bank exists to compare the same firm ACROSS engagements, and free text
     cannot do it: "Northwind Integration" retyped as "Northwind Integration Ltd"
     on the fourth project silently starts a fourth history with n=1, exactly when
     the first three had become worth something. */

  { what: 'bank: company history is grouped on the NAME, so a rename splits it in two',
    find: `          if (ids.length) return ids.map((id, i) => (orgFind(id) || {}).name
            || (r.orgs || [])[i] || r.org || id);
          return (r.orgs && r.orgs.length) ? r.orgs : (r.org || '');`,
    with: `          return (r.orgs && r.orgs.length) ? r.orgs : (r.org || '');
          /* mutant: the id is ignored, so the NAME is the grouping key */` },

  { what: 'effort: people with no company set are dropped from the company breakdown',
    find: '        if (!g.has(key)) g.set(key, { name: label, planDays: 0',
    with: '        if (!r.org) return;\n        if (!g.has(key)) g.set(key, { name: label, planDays: 0' },

  { what: 'effort: the worklist total sums only the rows on screen, not the whole group',
    find: '      const totDays = rows.reduce((a, r) => a + (r.estDays || 0), 0);',
    with: '      const totDays = shown.reduce((a, r) => a + (r.estDays || 0), 0);' },
  /* ── the handoff ──────────────────────────────────────────────────────────
     The company registry lives outside every project, so a bank export, a people
     library and a project file all carry company IDS referencing it. On the
     machine that wrote them every id resolves; on a colleague's it does not, and
     that shipped broken in two visible ways — the bank's company card printing a
     raw slug as a firm's name, and a roster picker reading "— none —" for a
     person whose employer the file states plainly.

     Note a mutant that is NOT here: removing the `orgs` block from the bank
     export. Every row also carries the company's NAME beside its id, and the
     importer adopts from the rows when the block is absent — an older export has
     no block at all and must still work. The removal is therefore equivalent:
     nothing observable changes, and listing it would report a permanent false
     hole. Verified by exporting, deleting the block by hand, and importing into
     an empty registry on both builds: identical. */

  { what: 'handoff: an adopted company is given a fresh local id, splitting one firm in two',
    find: '      const rec = { id: key, name: nm || key, at: fmtISO(new Date()), adopted: true };',
    with: "      const rec = { id: orgSlug(nm || key) + '-local', name: nm || key, at: fmtISO(new Date()), adopted: true };" },

  { what: 'handoff: a company the registry has not adopted is labelled with its internal id',
    find: `          if (ids.length) return ids.map((id, i) => (orgFind(id) || {}).name
            || (r.orgs || [])[i] || r.org || id);`,
    with: '          if (ids.length) return ids.map(id => (orgFind(id) || {}).name || id);' },
  /* ── three things a person could not do ───────────────────────────────────
     Reported from use, not from reading the code: a readout whose buttons vanish
     as you reach for them, a timing figure that states a consequence and hides
     its cause, and a backup that leaves behind three of the four stores that make
     up a workspace. */

  { what: 'curve: the reading clears the instant the pointer leaves, so its buttons cannot be reached',
    find: '      ptrScGraceT = setTimeout(ptrScClearNow, 420);',
    with: '      ptrScClearNow();' },

  { what: 'drill-in: "ahead of its dates" no longer names the two dates that moved the money',
    find: "            + (timing > 0 ? 'ahead of its dates' : 'behind its dates') + when",
    with: "            + (timing > 0 ? 'ahead of its dates' : 'behind its dates') + ''" },

  { what: 'backup: the whole-workspace file leaves the estimate bank behind',
    find: '        projects: projects, bank: bank, people: people, orgs: orgs',
    with: '        projects: projects, people: people, orgs: orgs' },
  /* ── is "booked" a fact or an accrual? ────────────────────────────────────
     actualCostOf DERIVES cost from work recorded — day rate × logged effort plus
     fixed cost prorated by percent complete — unless somebody typed over it. So
     an activity finishing nineteen days early books its cost nineteen days early
     whether or not an invoice exists. Right default for judging delivery, still
     an assumption, and "you are spending ahead of the plan" read as money out of
     the door is a different conclusion from the one the data supports. */

  { what: 'accrual: the bar draws the timing conclusion and drops the caveat that booked money is accrued',
    /* Re-anchored: the disclosure was hoisted out of the one arm it hung off
       and now rides every branch, which cost it two spaces of indent. The
       mutant still plants the same defect — the caveat goes silent — at the
       sentence's new home. */
    find: '        const cb0 = costBasisSplit(leaves);\n        if (cb0.anyDerived)',
    with: '        const cb0 = costBasisSplit(leaves);\n        if (false)' },

  { what: 'accrual: typed-in cost is counted as derived, so the panel describes the wrong model',
    find: '        if (t.autoActualCost === false) { out.typedN++; out.typed += v; }',
    with: '        if (false) { out.typedN++; out.typed += v; }' },
  /* ── cash timing ──────────────────────────────────────────────────────────
     Terms convert the accrual into when money is expected to move. Three ways
     the second line is worse than not drawing it: the same total must eventually
     arrive (a shift is not a discount), it must never arrive EARLIER than the
     work that caused it, and with no terms set there must be no second line at
     all — drawing one implies a distinction nobody made. */

  { what: 'cash: the shift loses money on the way, so a delay reads as a discount',
    find: "      if (T.kind === 'net') return [{ s: s + T.days * DAY, f: f + T.days * DAY, c: c }];",
    with: "      if (T.kind === 'net') return [{ s: s + T.days * DAY, f: f + T.days * DAY, c: c * 0.9 }];" },

  { what: 'cash: terms move money EARLIER, so the plan pays before the work happens',
    find: "      if (T.kind === 'net') return [{ s: s + T.days * DAY, f: f + T.days * DAY, c: c }];",
    with: "      if (T.kind === 'net') return [{ s: s - T.days * DAY, f: f - T.days * DAY, c: c }];" },

  { what: 'cash: a second curve is drawn on a plan with no payment terms at all',
    find: '      const anyTerms = cashAnyTerms();',
    with: '      const anyTerms = true;' },

  /* ── the error boundaries ────────────────────────────────────────────────
     Every one of these restores a variant of the SAME failure: a throw in one
     render taking every render after it, with the panels keeping the markup
     they were born with. It reached a user once and looked like an empty app,
     not like a crash, which is why it survived a green suite. */

  /* ── money in, and the record of it ──────────────────────────────────────
     Revenue was bill rate × effort with no way to say an invoice had gone out.
     Two things now: a MODEL of when money is expected, and a RECORD of what
     actually happened. These break each half in turn. */

  { what: 'revenue: the curve collects the rate-card sum instead of the fee',
    find: '      const scale = rawTotal > 0 ? fee / rawTotal : 0;',
    with: '      const scale = 1;' },

  { what: 'revenue: a deposit is ADDED to the fee rather than taken out of it',
    find: '      const rest = 1 - (fee > 0 ? dep / fee : 0);',
    with: '      const rest = 1;' },

  { what: 'revenue: milestone billing smears across the work like a monthly',
    find: "      if (T.kind !== 'milestone') return cashPhaseSeg(s, f, c, T);",
    with: "      if (true) return cashPhaseSeg(s, f, c, { kind: 'monthly', days: T.days });" },

  { what: 'revenue: an unrecorded invoice is counted as an invoice for nothing',
    find: '    function taskInvoiced(t) { return (t && t.invoiced != null) ? (Number(t.invoiced) || 0) : null; }',
    with: '    function taskInvoiced(t) { return Number((t && t.invoiced) || 0); }' },

  { what: 'revenue: finished work that was never invoiced is not reported at all',
    find: '        if (done && inv == null && worth > 0) {',
    with: '        if (false) {' },

  { what: 'revenue: the cash-positive date is the FIRST crossing, not the last dip',
    find: '      for (let i = pts.length - 1; i >= 0; i--) {\n        if (pts[i].net < 0) break;\n        positive = pts[i].ms;\n      }',
    with: '      for (let i = 0; i < pts.length; i++) {\n        if (pts[i].net >= 0) { positive = pts[i].ms; break; }\n      }' },

  { what: 'revenue: a receipt leaks into actual cost, so CPI is computed on a mixed basis',
    find: '      if (t.autoActualCost === false) return Number(t.actualCost) || 0;   // manual override',
    with: '      if (t.paid != null) return Number(t.paid) || 0;\n      if (t.autoActualCost === false) return Number(t.actualCost) || 0;   // manual override' },

  /* ── the plan-vs-actual marks ─────────────────────────────────────────────
     Three columns of correct numbers that nobody could scan. A bar that
     disagrees with its own number is worse than no bar: it is read first and
     believed, and the number underneath is what gets doubted. */

  /* ── ticking something complete ───────────────────────────────────────────
     The ordinary one-gesture check-off, which is how most work actually gets
     recorded, and it was inventing the dates every other figure is measured
     from. */

  /* ── money in, on the way out ─────────────────────────────────────────────
     The record reached one panel and nothing that leaves the tool. */

  /* ── getting paid ─────────────────────────────────────────────────────────
     The archive carried invoices and receipts and nothing read them. */

  { what: 'bank: days-to-pay is a mean, so one chased invoice moves the headline',
    find: "      const med = arr => {\n        if (!arr.length) return null;\n        const v = arr.slice().sort((a, b) => a - b);\n        return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;\n      };",
    with: "      const med = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;" },

  { what: 'bank: an outstanding invoice counts as paid in zero days',
    find: "      const paidRows = rows.filter(r => Number.isFinite(Number(r.daysToPay)) && r.daysToPay != null);",
    with: "      const paidRows = rows.map(r => Object.assign({}, r, { daysToPay: Number(r.daysToPay) || 0 }));" },

  { what: 'bank: what is still owed is reported as collected',
    find: "      out.collectedPct = out.invoiced > 0 ? Math.round(100 * out.received / out.invoiced) : null;",
    with: "      out.collectedPct = out.invoiced > 0 ? 100 : null;" },

  { what: 'bank: the slowest payer is listed last, where nobody reads it',
    find: "        max: Math.max.apply(null, v) })).sort((a, b) => b.median - a.median);",
    with: "        max: Math.max.apply(null, v) })).sort((a, b) => a.median - b.median);" },

  { what: 'bank: the payment history is computed and never drawn',
    find: "      host.innerHTML = head + hist + bankCalHtml() + bankPaymentHtml() + cards",
    with: '      host.innerHTML = head + hist + bankCalHtml() + cards' },

  { what: 'bank: an empty book is laid out as measured zeros',
    find: "      if (!P.invoicedN) {",
    with: '      if (false) {' },

  { what: 'bank: the billing-discipline cut is presented as payment behaviour',
    find: "          + '. This is your own billing discipline, not anybody\\'s payment behaviour — the company on a record '\n          + 'is whoever DID the work, not whoever pays for it.</p>'",
    with: "          + '.</p>'" },

  { what: 'client: a lint finding carries money into the request body in screen-share mode',
    find: "        const redact = v => safe ? String(v).replace(/[$£€]\\s?[\\d][\\d,]*(\\.\\d+)?/g, '(withheld)') : v;",
    with: '        const redact = v => v;' },

  { what: 'client: the receivables export drops every activity nobody has invoiced',
    find: '      const rows = receivablesRows();\n      const out = [',
    with: '      const rows = receivablesRows().filter(r => r.invoiced != null);\n      const out = [' },

  { what: 'client: unbilled work is folded into the outstanding total, overstating the book',
    find: "      out.push(['TOTAL outstanding', '', '', '', '', '', '', '', '', '', rec.billedUnpaid.toFixed(0)]);",
    with: "      out.push(['TOTAL outstanding', '', '', '', '', '', '', '', '', '', (rec.billedUnpaid + rec.doneUnbilled).toFixed(0)]);\n      out.push(['x']);" },

  { what: 'client: the receivables export loses how long a receipt has been outstanding',
    find: "          if (!isNaN(d0.getTime())) daysOut = Math.max(0, calDaysBetween(stripTime(d0), stripTime(new Date())));",
    with: '          daysOut = \'\';' },

  { what: 'client: the status report never says what has been invoiced',
    find: '        ${baseLine}${costLine}${moneyInLine}${overLine}',
    with: '        ${baseLine}${costLine}${overLine}' },

  { what: 'client: client-safe mode prints what the client has not been billed for',
    find: "      const moneyInLine = (clientSafeReports || !recIn || (!recIn.doneUnbilledN && !(recIn.billedUnpaid > 0)))",
    with: "      const moneyInLine = (false || !recIn || (!recIn.doneUnbilledN && !(recIn.billedUnpaid > 0)))" },

  /* SUPPRESSES the finding rather than renaming its label. The first version
     changed area to '_UnbilledDelivery' and survived — correctly: the check
     matches on what the finding SAYS, so renaming a label is a no-op against
     that property, and a mutant that changes nothing observable reports a hole
     that is not there. */
  { what: 'client: unbilled delivery is not a health finding',
    find: '        if (rec.doneUnbilledN) {',
    with: '        if (false) {' },

  { what: 'check-off: the started rule pre-empts the finished one, so nothing is back-dated',
    find: "      if (pct > 0 && prevPct <= 0 && !t.actualStart && !completing) { t.actualStart = today; t.autoActualStart = true; }",
    with: "      if (pct > 0 && prevPct <= 0 && !t.actualStart) { t.actualStart = today; t.autoActualStart = true; }" },

  { what: 'check-off: a five-day activity is recorded as starting and finishing the same day',
    find: '          const back = Math.max(0, Math.round(durD) - 1);',
    with: '          const back = 0;' },

  { what: 'check-off: the observed finish is back-dated too, so nothing is anchored to today',
    find: "        if (!t.actualFinish) { t.actualFinish = today; t.autoActualFinish = true; }\n        /* A FIVE-DAY ACTIVITY",
    with: "        if (!t.actualFinish) { t.actualFinish = fmtISO(subWorkingDays(new Date(), 3, getHolidaySet())); t.autoActualFinish = true; }\n        /* A FIVE-DAY ACTIVITY" },

  { what: 'check-off: an inferred start is presented as a recorded one',
    find: '          t.actualStartInferred = back > 0;      // said out loud on the panel',
    with: '          t.actualStartInferred = false;' },

  /* ANCHOR REPAIRED. The baseline panel stopped inlining its attention block
     into the template and started building it into a variable first, so this
     matched nothing and the mutant had been silently not planted. */
  { what: 'check-off: work marked complete with no dates at all is not reported',
    find: '      const attention = undatedCompletionsHtml() + completionReviewHtml()',
    with: '      const attention = completionReviewHtml()' },

  { what: 'revenue: the funding gap is stated in words and never drawn',
    find: "            bits.push(ptrCashSvg(pos)\n              + '<p class=\"ptr-mi-line\">Billed '",
    with: "            bits.push('' \n              + '<p class=\"ptr-mi-line\">Billed '" },

  { what: 'revenue: the cash chart is scaled non-uniformly and smears its labels',
    find: "      return '<svg class=\"mi-svg\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" '",
    with: "      return '<svg class=\"mi-svg\" preserveAspectRatio=\"none\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" '" },

  { what: 'revenue: the cash chart draws one side of the zero line only',
    find: "        + '<path d=\"' + areaTo() + '\" class=\"mi-area mi-area-dn\" clip-path=\"url(#' + uid + 'b)\"/>'",
    with: "        + ''" },

  { what: 'chart: over-plan rows draw no overrun, so over and under look the same',
    find: "          + (over > 0 ? '<i class=\"pv-over' + (clipped ? ' pv-over-clip' : '') + '\" style=\"width:' + over + 'px\"></i>' : '')",
    with: "          + ''" },

  { what: 'chart: the meter fills the track in the under-plan colour when it is over',
    find: "          + '<i class=\"pv-fill' + (r > 1.001 ? ' pv-fill-over' : '') + '\" style=\"width:' + fill + 'px\"></i></span>'",
    with: "          + '<i class=\"pv-fill\" style=\"width:' + fill + 'px\"></i></span>'" },

  { what: 'chart: early and late are drawn on the same side of the centre line',
    find: "        const late = days > 0;",
    with: '        const late = true;' },

  { what: 'chart: the bars ship with no key, so the geometry is a guess',
    find: '        <p class="help-text pv-keyrow">',
    with: '        <p class="help-text pv-keyrow" style="display:none">' },

  { what: 'form: a decision cannot record which option was taken',
    find: "      const isDec = (document.getElementById('rType') || {}).value === 'Decision';\n      row.style.display = isDec ? '' : 'none';",
    with: "      const isDec = false;\n      row.style.display = isDec ? '' : 'none';" },

  { what: 'form: options with none marked as taken are accepted in silence',
    find: "          ? '<b style=\"color:var(--warn)\">' + filled.length + ' option' + (filled.length === 1 ? '' : 's')\n            + ' and none marked as taken.</b>",
    with: "          ? '<b>' + filled.length + ' option' + (filled.length === 1 ? '' : 's')\n            + ' recorded.</b>" },

  { what: 'form: the why chain loses which option was taken on save',
    find: "        chosen: document.getElementById('rType').value === 'Decision' ? raidOptionsRead().chosen : null,",
    with: '        chosen: null,' },

  { what: 'form: the why chain is written by the editor and dropped by the file',
    find: '        whys: raidWhysRead(),',
    with: '        whys: [],' },

  { what: 'form: each why repeats the original question instead of the answer above it',
    find: "      return 'And why did THAT happen? — “' + q + '”';",
    with: "      return 'And why did THAT happen?' + (q ? '' : '');" },

  /* the trail turns back into editable rows, which is the regression that
     matters: the moment more than one why is answerable at once it stops being
     an interview and becomes a form, and a form gets five restatements of the
     same sentence. A mutant that merely moved the step index was a no-op — the
     renderer still drew one card — and is not listed, because a mutant that
     changes nothing observable reports a hole that is not there. */
  { what: 'form: the why wizard makes every step answerable at once',
    find: "          + '<span class=\"why-past-t\">' + escapeHtml(t) + '</span>'",
    with: "          + '<input class=\"mini-inp why-past-t\" value=\"' + escapeHtml(t) + '\">'" },

  { what: 'form: the wizard never says which step the reader is on',
    find: "        + '<div class=\"why-head\"><span class=\"why-step\">Step ' + (whyState.step + 1) + ' of up to ' + WHY_MAX",
    with: "        + '<div class=\"why-head\"><span class=\"why-step\">Why' + '' + ('' + WHY_MAX).slice(1)" },

  { what: 'form: concluding the chain drops the answer it was concluding',
    find: '    function raidWhyFinish() {\n      raidWhyCommit();',
    with: '    function raidWhyFinish() {' },

  { what: 'form: the trail of answers already given is not shown',
    find: "      const trail = whyState.chain.slice(0, whyState.done ? whyState.chain.length : whyState.step)",
    with: "      const trail = [].slice.call([], 0, 0)" },

  /* the objection this replaces was written against the LIST version of the why
     chain, where a reader could type five answers and never draw a conclusion.
     The wizard cannot reach that state — concluding fills the root cause from
     the last link — so the property moved with the design: the conclusion has
     to actually be filled, and the anchor now points at the line that fills it.
     Reported as a SKIP rather than quietly matching nothing. */
  { what: 'form: concluding a chain leaves the root cause empty',
    find: '      if (!whyState.root) whyState.root = last;',
    with: '      if (false) whyState.root = last;' },

  /* ANCHOR REPAIRED. The RAID row was rebuilt around a severity instrument and
     an entry cell, so the title no longer lives in a font-weight:600 <td> and
     this matched nothing. The identity is unchanged: strip the sub-line that
     carries the analysis and see whether anything notices. */
  { what: 'form: the log shows the entry and hides the analysis behind it',
    find: '            ${raidTitleSubHtml(r)}',
    with: '            ' },

  { what: 'form: a Decision has no way to record how it turned out',
    find: "      Decision: [\n        { v: 'stands',     lbl: 'Still stands',            short: 'stands',     explains: true },",
    with: "      _Decision: [\n        { v: 'stands',     lbl: 'Still stands',            short: 'stands',     explains: true }," },

  { what: 'form: a decision that still stands is painted as a fault',
    find: "      if (r.type === 'Decision') return false;",
    with: "      if (r.type === 'Decision' && false) return false;" },

  { what: 'form: the outcome question asks a decision whether it happened',
    find: "      if (type === 'Decision') return 'Did it stand?';",
    with: "      if (type === 'Decision') return 'Did it happen?';" },

  { what: 'boundary: a failing render rethrows, so the tab dies at the first throw',
    find: "        try { console.error('[render boundary] ' + label, e); } catch (e2) {}\n        return false;",
    with: "        try { console.error('[render boundary] ' + label, e); } catch (e2) {}\n        throw e;" },

  { what: 'boundary: the failure is caught and the panel is never told, so it shows what it held before',
    find: '        try { if (host) renderFailInto(host, label, e); } catch (e2) {}',
    with: '        try { if (false) renderFailInto(host, label, e); } catch (e2) {}' },

  { what: 'boundary: nothing is said at the top of the page, so a failure on another tab is invisible',
    find: '        try { paintRenderBanner(); } catch (e2) {}\n        // and into the console',
    with: '        try { void 0; } catch (e2) {}\n        // and into the console' },

  { what: 'boundary: the tab switch goes back to swallowing one of its renders',
    find: "        guardRender('renderBank', renderBank);",
    with: '        try { renderBank(); } catch (e) {}' },

  { what: 'boundary: a throw in the first of eight renders costs the seven after it and the save',
    find: "      guardRender('renderTaskTable', renderTaskTable);",
    with: '      renderTaskTable();' },

  { what: 'boundary: a throw inside the schedule pass escapes ensureCalculated exactly as it first did',
    find: "      if (!guardRender('recompute', () => { ok = recompute(); })) return false;",
    with: '      ok = recompute();' },

  { what: 'boundary: a host id that is not in the document, so the notice is written nowhere',
    find: "      renderTaskTable: 'taskTableWrap'",
    with: "      renderTaskTable: 'taskTableBody'" },

  { what: 'boundary: the notice blanks its host, destroying the element the retry draws into',
    find: "      host.insertAdjacentHTML('afterbegin', renderFailHtml(label, err, stale));",
    with: '      host.innerHTML = renderFailHtml(label, err, stale);' },

  /* ── the five checks with no evidence they can fail ───────────────────────
     A hundred and three mutants, and five of the twenty-two checks had never
     been the one to go red: golden-reference, client-facing, cross-surface,
     schedule and task-editor. That is not proof they are broken — a mutant
     stops at the FIRST check that notices, and something earlier in the running
     order usually did. But it is the absence of proof, and the whole premise of
     this file is that an unexercised check is worth nothing until it has failed
     once on purpose.

     So each of these targets a region that belongs to one of those five, and
     LIKELY points at it, so that check runs first and the verdict names it.
     One of them found a real hole on the way in: schedule-sweep holds four
     dependency types and every committed fixture is FS, so three of its four
     branches had never executed. That check now constructs the links. */

  { what: 'reference: the milestone convention adds a day and the panel stops saying why',
    find: '            if (!planEndsOnMilestone()) return \'\';',
    with: '            if (true) return \'\';' },

  { what: 'client: client-safe mode prints the money it exists to withhold',
    find: "      const costLine = clientSafeReports ? '' : (cost > 0 || projectBudget > 0)",
    with: "      const costLine = false ? '' : (cost > 0 || projectBudget > 0)" },

  { what: 'client: a test case whose audience nobody can determine is called client-facing',
    find: "      return s ? storyAudience(s) : 'unclassified';",
    with: "      return s ? storyAudience(s) : 'client';" },

  { what: 'client: the RAID export silently drops the first entry',
    find: '      raid.forEach(r => rows.push([r.type, r.title, r.probability, r.impact,',
    with: '      raid.slice(1).forEach(r => rows.push([r.type, r.title, r.probability, r.impact,' },

  { what: 'card: the Budget pair and its delta go back to different references',
    find: "          ${card('Budget', fmtMoney(pvAt(stripTime(new Date()).getTime())) + ' due by today', fmtMoney(actCostAll),",
    with: "          ${card('Budget', fmtMoney(costRef) + ' envelope', fmtMoney(actCostAll)," },

  /* A mutant that is NOT here: silencing the Schedule card's count of
     activities off their own dates. cross-surface compares that count against
     the BAR's, and the bar only prints one in the projVar ≠ 0 wording — on
     crm-rollout the finish is held, so both take their other branch and there
     is nothing to disagree about. The mutant survives for want of a fixture,
     not for want of a check, and listing it would report a permanent false
     hole. The card's colour is the reachable half of the same card. */

  { what: 'card: the Budget card paints the project red while the verdict does not',
    find: "      const budTone = bvCard.tone === 'bad' ? 1 : bvCard.tone === 'good' ? -1 : 0;",
    with: '      const budTone = 1;' },

  { what: 'network: an SS link is scheduled as though it were FS',
    find: "          const L = p.lag;\n          switch (p.type) {\n            case 'SS': s = es[p.id] + L; break;",
    with: "          const L = p.lag;\n          switch (p.type) {\n            case 'SS': s = ef[p.id] + L; break;" },

  { what: 'network: contingency is subtracted, so the committed date precedes the CPM finish',
    find: '      const committedUnits = cpmUnits + contingencyUnits;',
    with: '      const committedUnits = cpmUnits - contingencyUnits;' },

  { what: 'network: the confidence a date carries is reported as its complement',
    find: '        return n / mcResult.durations.length * 100;',
    with: '        return 100 - n / mcResult.durations.length * 100;' },

  { what: 'editor: the live preview weights the estimate differently from the plan it writes into',
    find: '      return (mLastEstUnits = pertTE(o, m, p));',
    with: '      return (mLastEstUnits = (o + 3 * m + p) / 5);' },

  { what: 'editor: a half-typed estimate collapses the readout to zero instead of holding',
    find: '      if (![o, m, p].every(v => Number.isFinite(v) && v >= 0)) return mLastEstUnits;',
    with: '      if (![o, m, p].every(v => Number.isFinite(v) && v >= 0)) return 0;' },

  { what: 'boundary: the banner cannot be dismissed, so it sits there for the rest of the session',
    find: '        + \'<button class="btn-sm btn-secondary" onclick="renderFailures=[];paintRenderBanner()">Dismiss</button>\';',
    with: "        + '';" },

  { what: 'boundary: a panel that has since drawn correctly keeps saying it could not be drawn',
    find: '      try { renderFailClear(label); } catch (e2) {}\n      return true;',
    with: '      try { void 0; } catch (e2) {}\n      return true;' },

  /* ── the four surfaces added after a reader used them ───────────────────── */

  { what: 'accrual: the spend shape moves the TOTAL, not only when it lands',
    find: '        if (end > cur) out.push({ s: cur, f: end, c: c * w[i] / tot });',
    with: '        if (end > cur) out.push({ s: cur, f: end, c: c * w[i] / (tot - 1) });' },

  { what: 'accrual: the spend shape is accepted, stored, and then ignored by the curve',
    find: '        shapeSpans(s, f, c1, curveOf(t)).forEach(sp =>',
    with: "        shapeSpans(s, f, c1, 'even').forEach(sp =>" },

  { what: "accrual: back-loaded and front-loaded are the same curve, drawn the wrong way round",
    find: "      back:  { lbl: 'Back-loaded', w: [1, 2, 3, 4],",
    with: "      back:  { lbl: 'Back-loaded', w: [4, 3, 2, 1]," },

  { what: 'curve: the readout names three activities and hides the rest with no way to reach them',
    find: '      const cut = (ptrScAllMs != null && ptrScAllMs === ms) ? rows.length : 3;',
    with: '      const cut = 3;' },

  { what: 'curve: an expansion made at one date is presented as the answer at every later one',
    find: '      if (ptrScAllMs != null && ptrScAllMs !== ms) ptrScAllMs = null;',
    with: '      if (false) ptrScAllMs = null;' },

  { what: 'navigation: collapse-to-a-level on the activity list is drawn but wired to nothing',
    find: '<span class="seg" id="taskCollapseSeg"><button class="btn-sm" onclick="setCollapseLevel(0)"',
    with: '<span class="seg" id="taskCollapseSeg"><button class="btn-sm" onclick="void 0"' },

  /* Decision, not Issue. No fixture in this repo carries an Issue entry, so a
     mutant that collapsed Issue into Risk would SURVIVE and be reported as a
     hole in the sweep that isn't one — the fixture-cannot-reach-the-branch
     failure this directory has a whole probe for. Decision and Assumption are
     both present, and they are also the two words clients most often use to
     mean each other, which is the pair the colours exist to separate. */
  { what: 'navigation: two RAID kinds that mean opposite things are drawn identically',
    find: "      Decision:   { cls: 'raid-k-dec', sub: 'settled',",
    with: "      Decision:   { cls: 'raid-k-assum', sub: 'relied on'," },

  { what: 'navigation: the RAID kind chip says the word and drops the definition behind it',
    find: "        + escapeHtml(r.type + ' — ' + k.def) + '\">' + r.type + '</span>'",
    with: "        + escapeHtml(r.type) + '\">' + r.type + '</span>'" },

  /* ── acceptance at the level a client actually signs, and the change-order
        life somebody has to be able to steer ───────────────────────────────── */

  { what: 'baseline history: a phase sign-off silently covers every story in the plan',
    find: "      if (so.scope === 'story') return { rows: stories.filter(s => String(s.id) === so.ref), traced: true };",
    with: "      if (so.scope === 'story') return { rows: stories, traced: true };" },

  { what: 'baseline history: a story re-traced out of a signed phase leaves without a trace',
    find: "          if (!live || !signoffCoversNow(so, live))",
    with: "          if (false)" },

  { what: 'baseline history: the sign-off record prints the id it stored instead of the name',
    find: "        return t ? ((t.wbs ? t.wbs + ' ' : '') + t.name)",
    with: "        return t ? String(ref)" },

  { what: 'baseline history: superseded is a one-way door again',
    find: "                   rejected: ['accepted'], superseded: ['accepted', 'rejected'] }[st] || [];",
    with: "                   rejected: ['accepted'], superseded: [] }[st] || [];" },

  { what: 'baseline history: withholding a line price also removes it from the total',
    find: "      const lineSum = c.lineSum == null ? diff.reduce((s, x) => s + (x.priceDelta || 0), 0) : c.lineSum;",
    with: "      const lineSum = shownSum;" },

  { what: 'baseline history: the change-order history goes back to being unopenable rows',
    find: "          <tbody>${coLog.map(c => `<tr class=\"co-row\" onclick=\"coOpen('${ekJs(c.no)}')\"",
    with: "          <tbody>${coLog.map(c => `<tr" },

  { what: 'baseline history: generating the SOW throws away the document it replaces',
    find: "      sowPushVersion('regenerated from the plan');",
    with: "      sowVersions = [];" },

  { what: 'baseline history: trimming the SOW history drops the original instead of the middle',
    find: "        sowVersions.splice(1, sowVersions.length - SOW_VERSION_CAP);",
    with: "        sowVersions.splice(0, sowVersions.length - SOW_VERSION_CAP);" },

  { what: 'baseline history: a project that already had a SOW loads with an empty history',
    find: '      if (sowDraft && !sowVersions.length) {',
    with: '      if (false) {' },

  { what: 'baseline history: nothing in the toolbar says the SOW has a version history',
    find: "        btn.textContent = '🕓 History' + (sowVersions.length ? ' (' + sowVersions.length + ')' : '');",
    with: "        btn.textContent = '🕓 History';" },

  /* The writer and the reader disagreeing about the record's shape. Restored
     as a mutant because the real one was found by UNDO rather than by anything
     about the SOW, and a defect that can only be caught sideways is one field
     away from not being caught at all. */
  { what: 'baseline history: a SOW version does not survive a save and reload unchanged',
    find: "      const v = sowVersionNorm({ n: nextSowNo++, at: fmtISO(new Date()),",
    with: "      const v = ({ n: nextSowNo++, at: fmtISO(new Date())," },

  /* The role field back at the width it was built for — a NUMBER — with the
     value no longer in the title. Both halves, because either one alone leaves
     the value readable: a narrow box whose title carries the text is honest,
     and a wide box needs no title. It is the combination that shows a reader a
     fragment and tells them nothing about it. */
  /* The reported defect itself, and the over-correction that would replace it.
     The second is the more interesting mutant: clamping EVERY allocation to
     capacity looks like a fix and silently rewrites an instruction the plan
     gave on purpose. */
  { what: 'criteria: a part-time person is booked full time by the plan that states their capacity',
    find: '          if (t._unitsAuto && t.units > cap) { t.units = cap; alloc.lowered++; alloc.people.add(own); }',
    with: '          if (false) { t.units = cap; alloc.lowered++; alloc.people.add(own); }' },

  { what: 'criteria: an allocation the plan asked for explicitly is clamped to capacity anyway',
    find: '          if (t._unitsAuto && t.units > cap) { t.units = cap; alloc.lowered++; alloc.people.add(own); }\n          else if (!t._unitsAuto && t.units > cap) { alloc.keptOver++; alloc.people.add(own); }',
    with: '          if (t.units > cap) { t.units = cap; alloc.lowered++; alloc.people.add(own); }' },

  { what: 'criteria: attendee allocations are hard-coded past whatever the plan said',
    find: '            return { name: an, units: given ? au : 100, _unitsAuto: !given };',
    with: '            return { name: an, units: 100, _unitsAuto: true };' },

  { what: 'resource load: a day somebody never works is treated as an ordinary working day',
    /* Re-anchored with its FOLLOWING line: the rewritten leveler reads the same
       working-day test inside levelFirstFit, so the bare line now matches twice
       and the engine rightly refused to trust it. capToday is computeResourceLoad's
       alone, which is the reader this mutant is aimed at. */
    find: '          const offToday = !resWorksOn(R.name, new Date(iso + \'T00:00:00\').getDay());\n          const capToday = (R.ptoSet.has(iso) || offToday) ? 0 : R.capacity;',
    with: '          const offToday = false;\n          const capToday = (R.ptoSet.has(iso) || offToday) ? 0 : R.capacity;' },

  { what: 'resource load: an unset working week means the person works NO days',
    find: "      if (!Array.isArray(raw) || !raw.length) return null;      // follows the project",
    with: '      if (!Array.isArray(raw)) return new Set();' },

  /* NOT A MUTANT: breaking the hydrate coercion `r.workDays = w.length ? w :
     null`. It survives everything, and correctly — resWorkDays guards the same
     condition on the read side, so an empty array that reaches storage still
     resolves to "follows the project". The mutant above proves the read-side
     guard is load-bearing; the write-side one is belt and braces and there is
     no observable defect to plant. Listing it anyway would report a permanent
     hole that is not one, which is the failure mode this file learned about the
     hard way. */

  { what: 'heatmap: a day off and a day somebody never works are described identically',
    find: "            : isOff ? 'does not work ' + ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'][dd.getDay()]",
    with: "            : isOff ? 'PTO'" },

  { what: 'effort: a roster role is cut off by its own box with the full text nowhere',
    find: ['    .rl-role { width: 100%; min-width: 17rem; }',
           "title=\"${escapeHtml((resources[name] || {}).role ? (resources[name] || {}).role + ' — ' : '')}What they do on this engagement"],
    with: ['    .rl-role { width: 64px; min-width: 64px; }',
           'title="What they do on this engagement'] },

  /* The input/output map. Its whole value is that it is a VIEW of the plan
     rather than a copy, and that it says which deliverables are too vague to be
     accepted against. Each mutant takes one of those away. */

  { what: 'io map: "Analysis" and "Documentation" pass as deliverables',
    find: '      if (DELIV_CATEGORY.test(d))',
    with: '      if (false)' },

  { what: 'io map: a milestone is flagged for handing over no artefact',
    find: "      if (t.milestone) return { level: 'na', why: '' };",
    with: "      if (false) return { level: 'na', why: '' };" },

  { what: 'io map: inputs are a copy of the predecessor NAME, not a view of its deliverable',
    find: "        .forEach(p => out.push({ kind: 'upstream', text: String(p.deliverable || '').trim() || p.name, from: p }));",
    with: "        .forEach(p => out.push({ kind: 'upstream', text: p.name, from: p }));" },

  { what: 'io map: the predecessor link is read as a task and yields nothing',
    find: '        .map(pd => tasks.find(x => Number(x.id) === Number(pd.id)))\n        .filter(p => p && !p.milestone)   // a milestone is a date; it hands over nothing',
    with: '        .map(pd => pd)\n        .filter(p => p && !p.milestone)   // a milestone is a date; it hands over nothing' },

  { what: 'io map: the dictionary computes the chain and never draws it',
    find: '<th title="What this activity consumes: ↤ the deliverable of an activity it waits for, ◇ a client dependency from a story, · an input stated on the activity itself">Inputs</th>',
    with: '<th>Consumes</th>' },

  { what: 'io map: a stated input is dropped on save',
    find: "          parentId: t.parentId, description: t.description, deliverable: t.deliverable, inputs: t.inputs || '',",
    with: '          parentId: t.parentId, description: t.description, deliverable: t.deliverable,' },

  /* Duration versus effort. The distinction is the whole point, and every
     mutant here collapses it back — which is what the product did before. */

  { what: 'effort: planned effort ignores the allocation and equals the calendar span',
    find: '      return unitToWorkingDays(te) * ((u > 0 ? u : 100) / 100);',
    with: '      return unitToWorkingDays(te);' },

  { what: 'effort: a lone part-time person keeps only units/100 of the time they logged',
    find: '      return (Number(me.units) || 0) / tot;',
    with: '      return (Number(me.units) || 0) / 100;' },

  { what: 'effort: actual cost multiplies logged time by the allocation a second time',
    find: '      const labor = taskParticipants(t).reduce((sx, pr) => sx + (isClientResource(pr.name) ? 0 : getRate(pr.name) * days), 0);',
    with: '      const labor = taskParticipants(t).reduce((sx, pr) => sx + (isClientResource(pr.name) ? 0 : getRate(pr.name) * days * pr.units / 100), 0);' },

  { what: 'effort: the estimate bank files a calendar span against logged work',
    find: '        const est = workingDaysToUnit(plannedEffortDays(t));',
    with: '        const est = t.te || 0;' },

  { what: 'timesheet: planned hours are the span rather than the work',
    /* The ledger computes planned hours the same way and from the same fields,
       which is correct — and it means the bare line is no longer unique in the
       file. Two matches make a mutant untrustworthy, so the anchor carries the
       two lines above it that only the timesheet has. */
    find: '        parts.forEach(pr => {\n          const u = Number(pr.units) || 0;\n          const planH = spanDays * (u / 100) * 8;',
    with: '        parts.forEach(pr => {\n          const u = Number(pr.units) || 0;\n          const planH = spanDays * 8;' },

  { what: 'timesheet: the weekly split does not add back to the activity total',
    find: '        const perDayPlan = r.planH / days.length;',
    with: '        const perDayPlan = r.planH;' },

  { what: 'wbs dictionary: the Work column repeats the duration',
    find: '            const e = plannedEffortDays(t);\n            return e > 0 ? escapeHtml(fmtDurCell(workingDaysToUnit(e))) : \'—\';',
    with: '            const e = unitToWorkingDays(t.te || 0);\n            return e > 0 ? escapeHtml(fmtDurCell(workingDaysToUnit(e))) : \'—\';' },

  { what: 'work cell: no explanation when the work exceeds the duration',
    find: "        + (tot > 100 ? '. More than one person is on this, so the work is LONGER than the time it is open: a 30-minute call with two people is an hour of somebody\\u2019s time.' : '');",
    with: "        + '';" },

  { what: 'io repair: the AI pass overwrites a deliverable somebody wrote',
    find: "          if (d && !String(t.deliverable || '').trim()) { t.deliverable = d; dLit++; }",
    with: "          if (d) { t.deliverable = d; dLit++; }" },

  { what: 'editor: typing the work does not move the duration',
    find: "      if (cur > 0) {\n        const k = wantTe / cur;",
    with: "      if (false) {\n        const k = wantTe / cur;" },

  { what: 'editor: work-driven duration flattens the three-point spread',
    find: "          if (Number.isFinite(v) && v > 0) set(id, v * k);",
    with: "          if (Number.isFinite(v) && v > 0) set(id, wantTe);" },

  { what: 'SOW: the scope table names nothing an activity consumes',
    find: "            inputs: (clientSafeReports || t.isSummary || t.milestone) ? []",
    with: "            inputs: true ? []" },

  { what: 'SOW versions: deleting one takes the original with it',
    find: "      if (sowVersions.length && v.n === sowVersions[0].n) return 'the original';",
    with: "      if (false) return 'the original';" },

  { what: 'SOW versions: tidying deletes the document on screen too',
    find: "      const doomed = sowVersions.filter((v, i) => !sowVersionPin(v) && i < sowVersions.length - keep);",
    with: "      const doomed = sowVersions.filter((v, i) => i < sowVersions.length - keep);" },

  { what: 'activity list: the Work column repeats the duration',
    find: "              : workingDaysToUnit(plannedEffortDays(t));\n            return w > 0 ? fmtDur(w) : '\u2014';",
    with: "              : (Number(t.te) || 0);\n            return w > 0 ? fmtDur(w) : '\u2014';" },

  { what: 'merge: a conflict defaults to taking THEIR value',
    with: "          conflicts.push({ id: id, name: a.name, field: f, label: lbl, mine: va, theirs: vc, take: 'theirs' });",
    find: "          conflicts.push({ id: id, name: a.name, field: f, label: lbl, mine: va, theirs: vc, take: 'mine' });" },

  { what: 'merge: it merges per ACTIVITY, so an untouched field of mine is overwritten',
    find: "          if (vc === undefined || String(vc) === String(vb)) return;   // they did not touch it",
    with: "          if (vc === undefined) return;" },

  { what: 'merge: phases read as new activities because the stored flag is trusted',
    find: "      const theirParents = new Set((theirDoc.tasks || [])\n        .map(t => t.parentId).filter(x => x != null).map(Number));",
    with: "      const theirParents = new Set();" },

  { what: 'merge: an arriving activity carries their baseline into my plan',
    find: "        src.baseStart = null; src.baseFinish = null; src.baseTe = null;",
    with: "        src.baseTe = src.baseTe;" },

  { what: 'merge: a file with no shared history is merged anyway',
    find: "      if (!theirs.length || !planVersions.length) return null;",
    with: "      if (!theirs.length || !planVersions.length) return { mine: planVersions[0] || { v: 0, at: '' }, theirs: null, snap: { tasks: [] } };" },

  { what: 'SOW: the section picker does nothing — every section prints anyway',
    find: "    function sowWants(key) { return !sowOffSet().has(String(key)); }",
    with: "    function sowWants(key) { return true; }" },

  { what: 'SOW: an excluded section leaves a gap in the numbering',
    find: "      const add = (key, title, body) => { if (body && sowWants(key)) secs.push({ key, title, body }); };",
    with: "      const add = (key, title, body) => { if (body) secs.push({ key, title, body: sowWants(key) ? body : '<!--x-->' }); };" },

  { what: 'SOW: a saved version does not record the shape it was written in',
    find: "                  label: String(label || ''), html: html, off: [...sowOffSet()],",
    with: "                  label: String(label || ''), html: html, off: []," },

  { what: 'RAID: the type tab shows every entry regardless of kind',
    find: "        if (raidTab !== 'all' && r.type !== raidTab) return false;",
    with: "        if (false) return false;" },

  { what: 'RAID: the text filter matches everything',
    find: "        return [r.title, r.mitigation, r.owner, r.description, r.rootCause]\n          .some(x => String(x || '').toLowerCase().indexOf(raidQ) >= 0);",
    with: "        return true;" },

  { what: 'RAID: near-duplicates are only found when byte-identical',
    find: "      return inter / Math.min(A.size, B.size);      // containment, so a longer restatement still matches",
    with: "      return a === b ? 1 : 0;" },

  { what: 'RAID: bulk delete removes only the first selected entry',
    find: "      raid = raid.filter(x => !raidSel.has(x.id));",
    with: "      const one9 = ids[0]; raid = raid.filter(x => x.id !== one9);" },

  { what: 'SOW: the version history mints a version on every RAID edit',
    find: "    function raidTouched() {\n      try {\n        if (sowSyncExclusions() < 0) return;\n        sowShowLive();",
    with: "    function raidTouched() {\n      try {\n        if (sowSyncExclusions() < 0) return;\n        sowPushVersion('exclusions changed'); sowShowLive();" },

  { what: 'SOW prose: "As a Independent Product Advisor"',
    find: "      return /^[aeiou]/i.test(String(word || '').trim()) ? 'an' : 'a';",
    with: "      return 'a';" },

  { what: 'SOW prose: "I want to a baseline scorecard"',
    find: "      return (STORY_NOUN_LEAD.has(first) || /^\\d/.test(String(want || '').trim())) ? 'I want' : 'I want to';",
    with: "      return 'I want to';" },

  { what: 'SOW: the effort column mixes hours and days down one column',
    find: "                  const num = v => (Math.abs(v - Math.round(v)) < 0.005 ? v.toFixed(1) : v.toFixed(2)) + ' ' + u2;",
    with: "                  const num = v => fmtDurText(v);" },

  { what: 'SOW panel: both history tabs show the same history',
    find: "          host.innerHTML = docHistTab === 'plan' ? versionChainHtml(true) : (sowHistoryHtml() + sowCompareHtml());",
    with: "          host.innerHTML = sowHistoryHtml();" },

  { what: 'SOW panel: the selected history tab looks like the unselected one',
    find: "        el.className = 'btn-sm ' + (on ? 'btn-primary' : 'btn-secondary');",
    with: "        el.className = 'btn-sm btn-secondary';" },

  { what: 'SOW panel: the document is read through a letterbox again',
    find: "color:#1e293b;max-width:1080px;margin:0 auto\">",
    with: "color:#1e293b;max-width:420px\">" },

  { what: 'editor: the estimate form does not say what the estimate comes to',
    find: "      const work = unitToWorkingDays(te) * (u / 100);",
    with: "      const work = unitToWorkingDays(te);" },

  { what: 'SOW: the scope table quotes the calendar span as effort',
    find: "                  const work = workingDaysToUnit(plannedEffortDays(t));",
    with: "                    const work = Number(t.te) || 0;" },

  { what: 'SOW: filing an exclusion changes the log and not the document',
    find: "        const shown = sowSyncExclusions();\n        if (shown > 0) { sowPushVersion(n + ' exclusion' + (n === 1 ? '' : 's') + ' drafted'); sowShowLive(); }",
    with: "        const shown = -1;" },

  { what: 'SOW: the exclusion patch overwrites the boundary clause above it',
    find: "      sowDraft = sowDraft.slice(0, hd) + after.slice(0, bodyAt)\n        + clause + tail + after.slice(secEnd);",
    with: "      sowDraft = sowDraft.slice(0, hd) + after.slice(0, bodyAt) + tail + after.slice(secEnd);" },

  /* Effort vs schedule, the second sweep. Every one of these took te — a
     CALENDAR SPAN — as the estimate and compared it against logged WORK. */

  { what: 'plan vs actual: the Effort column estimates with the span',
    find: "        const planTe = plannedEffortUnit(t, hb);",
    with: "        const planTe = hb && t.baseTe != null ? t.baseTe : (t.te || 0);" },

  { what: 'plan vs actual: the Effort spent card totals spans',
    find: "      const planTeAll = sum(t => plannedEffortUnit(t));",
    with: "      const planTeAll = sum(t => t.te);" },

  { what: 'plan truth: the scope panel calls a sum of spans effort',
    find: "        const planTe = leaves.reduce((s, t) => s + plannedEffortUnit(t), 0);",
    with: "        const planTe = leaves.reduce((s, t) => s + (Number(t.te) || 0), 0);" },

  { what: 'cause of a miss: a part-time person on plan ranks as an overrun',
    find: "      const refD = plannedEffortDays(t, true);",
    with: "      const refD = unitToWorkingDays(Number(t.baseTe) > 0 ? Number(t.baseTe) : (Number(t.te) || 0));" },

  { what: 'variance CSV: the effort ratio divides logged work by the span',
    find: "        const est = plannedEffortUnit(t, hasBaseline());   // the work, which is what varies",
    with: "        const est = t.te || 0;   // the work, which is what varies" },

  { what: 'editor: a summary rolls up its leaves\u2019 spans and calls it effort',
    find: "          estTime: lv.reduce((s, x) => s + workingDaysToUnit(plannedEffortDays(x)), 0),",
    with: "          estTime: lv.reduce((s, x) => s + (+x.te || 0), 0)," },

  { what: 'baseline: the committed effort follows today\u2019s allocation',
    find: "        t.baseUnits = taskUnitsTotal(t);",
    with: "        t.baseUnits = null;" },

  { what: 'wbs dictionary CSV: the exported Work effort column repeats the span',
    find: "            const e = t.isSummary ? leafDescendants(t.id).reduce((a, x) => a + plannedEffortDays(x), 0) : plannedEffortDays(t);",
    with: "            const e = t.isSummary ? leafDescendants(t.id).reduce((a, x) => a + unitToWorkingDays(x.te || 0), 0) : unitToWorkingDays(t.te || 0);" },

  /* The four SOW-generation defects, each planted back. All four shipped in a
     document a client had already been sent, and none of them were visible in
     the skeleton DATA — they lived in the assembly, which is why the sweep that
     checked the data caught nothing. */

  /* The retainer. Its whole character is that the amount is contractual and the
     count is calendar, so every mutant here is the same mistake in a different
     place: letting the plan have a vote. */

  { what: 'retainer: the fixed period amount is scaled by how busy the period was',
    find: '          if (T.retainer > 0) { out.segs.push({ s: pay, f: pay + DAY, c: T.retainer }); out.placed += T.retainer; }',
    with: '          if (T.retainer > 0) { const c9 = T.retainer * (fee / Math.max(1, pers.length * T.retainer)); out.segs.push({ s: pay, f: pay + DAY, c: c9 }); out.placed += c9; }' },

  { what: 'retainer: a period with no work in it is not billed',
    find: '        for (let cur = s0; cur <= fin && out.length < 600; cur += 7 * DAY) out.push({ start: cur, n: out.length + 1 });',
    with: '        for (let cur = s0; cur <= fin && out.length < 600; cur += 7 * DAY) { if (lv.some(t => { const f2 = (ub ? t.baseFinish : t.finishDate) || t.finishDate; const s2 = (ub ? t.baseStart : t.startDate) || t.startDate; return s2 && f2 && stripTime(s2).getTime() <= cur + 6 * DAY && stripTime(f2).getTime() >= cur; })) out.push({ start: cur, n: out.length + 1 }); }' },

  { what: 'retainer: the gap between what is retained and what the work is priced at is reconciled away',
    find: '        out.retainerGap = out.scheduled - out.total;',
    with: '        out.total = out.scheduled; out.retainerGap = 0;' },

  { what: 'retainer: the contract does not say the period is owed whether or not it is used',
    find: "        ? 'This engagement is retained. The amounts below are payable for each period whether or not the period is fully utilised, and reserve the team\\'s availability for it.'",
    with: "        ? 'This engagement is retained.'" },

  /* RETIRED. This mutant survived, and the reason was not a hole in the suite:
     sowKeepRefs was called by nothing. The identity it named — a trace column
     must not cite a story the document does not print — is real and is asserted
     in client-facing-sweep against the function that actually does the work,
     sowTraceRef. The dead function has been removed from the product. */

  { what: 'SOW: a story the contract relies on is left out of the appendix it points readers to',
    find: '        if ((s.nfrs || []).some(x => String(x).trim())) out.add(s.id);',
    with: '        if (false) out.add(s.id);' },

  { what: 'SOW: the appendix goes back to printing client-facing stories alone',
    find: '      return new Set(reqs.stories.filter(s => storyAudience(s) === \'client\' || ref.has(s.id)).map(s => s.id));',
    with: "      return new Set(reqs.stories.filter(s => storyAudience(s) === 'client').map(s => s.id));" },

  { what: 'SOW: a dependency traces to a delivery-side story the reader cannot look up',
    find: "            const ref = sowTraceRef(s.id, printedIds);\n            if (!ref) dropped++;",
    with: "            const ref = s.id;\n            if (!ref) dropped++;" },

  { what: 'SOW: milestone billing names the milestones and states no amount against any of them',
    find: '          const amt = money.get(k) || 0;',
    with: '          const amt = 0;' },

  { what: 'SOW: the payment schedule totals less than the price the client is signing',
    find: '      [...money.keys()].sort((a, b) => a - b).forEach(k => {',
    with: '      [].forEach(k => {' },

  { what: 'SOW: with no billing arrangement recorded the terms ship as a finished clause',
    find: "      if (!pay || pay.kind === 'none' || !pay.rows.length) {",
    with: '      if (false) {' },

  { what: 'SOW: out of scope reads as a waiver rather than a limit',
    find: '        `<p style="font-size:13px">Only the work itemised in {{sec:scope}} is included in this Statement of Work. Anything not expressly listed there is out of scope,',
    with: '        `<p style="font-size:13px">No exclusions apply: all activities and deliverables are as defined in the scope table,' },

  { what: 'SOW: section numbers skip whenever an optional section is empty',
    find: '        `<h2 style="font-size:16px;margin:16px 0 6px">${i + 1}. ${s.title}</h2>${s.body}`).join(\'\');',
    with: '        `<h2 style="font-size:16px;margin:16px 0 6px">${secs.length > 9 ? i + 1 : i + 2}. ${s.title}</h2>${s.body}`).join(\'\');' },

  { what: 'SOW: a cross-reference points at a section number that does not exist',
    find: '      secs.forEach((s, i) => { numOf[s.key] = i + 1; });',
    with: '      secs.forEach((s, i) => { numOf[s.key] = i + 2; });' },

  /* RE-POINTED. This planted its change at the add() CALL SITES, which do not
     decide anything: the document is emitted in SOW_SECTIONS order and add()
     only registers a body against a key. The mutant produced a byte-identical
     section list and was recorded as an unguarded region for a year. The
     ordering authority is the table, so that is where the price gets pushed
     back into the basement. */
  { what: 'SOW: the price and the payment schedule go back to the basement',
    find: ["      { key: 'commercial',  name: 'Commercial Terms',             note: 'the price and the payment schedule', heavy: true },\n",
           "      { key: 'change',      name: 'Change Control',               note: 'how scope changes are agreed', heavy: true }"],
    with: ['',
           "      { key: 'change',      name: 'Change Control',               note: 'how scope changes are agreed', heavy: true },\n      { key: 'commercial',  name: 'Commercial Terms',             note: 'the price and the payment schedule', heavy: true }"] },

  { what: 'change order: the activity lookup returns every order regardless of which it touched',
    find: '        const lines = (c.diff || []).filter(d => Number(d.id) === id);',
    with: '        const lines = (c.diff || []);' },

  { what: 'change order: the activity lookup quietly hides everything not yet accepted',
    find: '      return (coLog || []).map(c => {',
    with: "      return (coLog || []).filter(c => coState(c) === 'accepted').map(c => {" },

  { what: 'change order: the activity editor computes the change-order row and never shows it',
    find: "      row.style.display = html ? '' : 'none';\n      host.innerHTML = html;",
    with: "      row.style.display = 'none';\n      host.innerHTML = html;" },

  { what: 'change order: rejected-and-kept is stored the same as never-rejected again',
    find: '          c.scopeKept = true;',
    with: '          c.scopeKept = false;' },

  { what: 'change order: the unbillable-scope finding never clears once it is raised',
    find: "      if (next !== 'rejected') c.scopeKept = false;",
    with: '      if (false) c.scopeKept = false;' },

  { what: 'change order: kept scope is valued off the price movement, not off its lines',
    find: "      if ((c.diff || []).length) return c.diff.reduce((s2, d2) => s2 + (d2.priceDelta || 0), 0);",
    with: '      if ((c.diff || []).length) return 0;' },

  { what: 'change order: two accepted orders pricing the same line go unnoticed',
    find: '          if (!shared.length) continue;',
    with: '          if (shared.length >= 0) continue;' },

  { what: 'change order: overlap is matched on the activity alone, so every busy row is a finding',
    find: "      return new Set((c.diff || []).map(d => String(d.id) + '|' + String(d.field || '')));",
    with: "      return new Set((c.diff || []).map(d => String(d.id)));" },

  { what: 'baseline history: two SOW versions both claim to be the current one',
    find: '        if (sowVersions[i].html === sowDraft) { curIdx = i; break; }',
    with: '        if (sowVersions[i].html === sowDraft) { curIdx = i; }' },

  /* A MUTANT CAN GO STALE IN MEANING, NOT ONLY IN ITS ANCHOR, and the engine
     reports both as SURVIVED. This one used to plant a getter in the object
     literal so `cos` read the live log; a later refactor put a normaliser
     between that literal and the stored record, and the normaliser COPIES the
     array — so the getter fired once, froze into a plain array, and the mutant
     stopped expressing anything. It survived because there was nothing to
     catch, which reads identically to a hole in the suite and is the opposite.
     Moved to the READER, where the defect it names actually lives: answering
     "which SOW versions contain this change order" from today's log rather than
     from what each version recorded. */
  { what: 'baseline history: a past SOW claims every change order accepted since it was written',
    find: "      return sowVersions.filter(v => sowVersionCoRead(v).nos.some(x => String(x) === String(no)));",
    with: "      return sowVersions.filter(() => coAccepted().some(c => String(c.no) === String(no)));" },

  { what: 'baseline history: the SOW never says which change orders it already incorporates',
    find: "        ${(() => { const a = coAccepted(); return a.length",
    with: "        ${(() => { const a = []; return a.length" },

  { what: 'baseline history: the two documents share one box with no way between them',
    find: "      strip.innerHTML = tabs.length < 2 ? '' : '<span class=\"seg\">'",
    with: "      strip.innerHTML = tabs.length < 99 ? '' : '<span class=\"seg\">'" },

  /* The narrative promises a longer engagement than the schedule funds. Both
     halves are written from the same brief and neither is checked against the
     other, so the contradiction leaves the building inside the contract. */

  { what: 'week lint: the schedule span is measured from the start dates alone, so it is always one week',
    find: '      return Math.max(1, Math.ceil((b - a + 86400000) / (7 * 86400000)));',
    with: '      return 1;' },

  { what: 'week lint: a range ("Weeks 1-8") is read as its first number, so the far end is never seen',
    find: '      while ((m = re.exec(txt))) { out.add(+m[1]); if (m[2]) out.add(+m[2]); }',
    with: '      while ((m = re.exec(txt))) { out.add(+m[1]); }' },

  { what: 'week lint: "an 8-week proof of value" is not a week reference',
    find: '      const re2 = /\\b(\\d{1,2})\\s*-\\s*week\\b/gi;\n      while ((m = re2.exec(txt))) out.add(+m[1]);',
    with: '      const re2 = /\\b(\\d{1,2})\\s*-\\s*week\\b/gi;' },

  { what: 'week lint: a week past the end of the schedule is counted as inside it',
    find: '      const over = sowWeekRefs(html).filter(n => n > span);',
    with: '      const over = sowWeekRefs(html).filter(n => n > span + 100);' },

  { what: 'week lint: the warning is computed and never drawn on the document',
    find: "        ${(() => { const w = (typeof sowWeekLint === 'function') ? sowWeekLint(sowSections(d, narrative, td, th, showEffort, showRates, scopeRows)) : null;",
    with: '        ${(() => { const w = null;' },

  /* Seventy quality attributes in one flat run is a third of the contract and
     nobody reads to the end of it. */

  { what: 'NFR: the attribute prefix is not parsed, so every requirement lands in one heap',
    find: '              const g = m ? m[1].trim() : \'Other\';',
    with: "              const g = 'Other';" },

  { what: 'NFR: the group heading is computed and the rows print without it',
    find: '        ${keys.map(k => `<tr><td colspan="2" style="${td};background:#f8fafc;font-weight:700;font-size:12px">${h(k)}</td></tr>`',
    with: '        ${keys.map(k => ``' },

  { what: 'NFR: only the first group is printed and the rest are dropped',
    find: '            const keys = [...groups.keys()].sort((a, b) => {',
    with: '            const keys = [...groups.keys()].slice(0, 1).sort((a, b) => {' },

  /* The ledger is a VIEW of the billing table. Every mutant here turns it into
     a rival to it — a fourth money surface that disagrees with the other three,
     which is worse than not having it. */

  /* Several measures at once, and an order the drafter chose. */

  /* A form about work, opened on a date. */

  { what: 'editor: a milestone is asked for units, spend shape, attendees and hours spent',
    find: "    const MILESTONE_NA = ['mUnitsGroup', 'mCurveGroup', 'attGroup', 'mActualEffortGroup',\n                          'mTaxonomyGroup', 'ompHint'];",
    with: '    const MILESTONE_NA = [];' },

  { what: 'editor: the running duration commentary survives the estimate block being hidden',
    find: "'mTaxonomyGroup', 'ompHint'];",
    with: "'mTaxonomyGroup'];" },

  /* Both of these were planted against #modal .modal-body and survived every
     run. Not because the checks were weak — because the rule they broke had
     stopped drawing anything. The editor became section cards, so every direct
     child of the body spans 1 / -1 and the grid there is indistinguishable from
     `display: block`. Re-pointed at .ed-sec, which is where the two columns
     actually are; the dead rule is out of the product. A mutant that cannot
     change a pixel measures the mutant, not the suite. */
  { what: 'editor: nothing pairs side by side, so the second column stays empty',
    find: '      .ed-sec > .mb-half { grid-column: auto; }',
    with: '      .ed-sec > .mb-half { grid-column: 1 / -1; }' },

  { what: 'editor: the form is one tall column on any screen',
    find: '      .ed-sec { display: grid; grid-template-columns: 1fr 1fr; column-gap: 1.25rem; align-items: start; }',
    with: '      .ed-sec { display: block; }' },

  { what: 'editor: hiding the work fields takes the payment fields with them',
    find: "    const MILESTONE_NA = ['mUnitsGroup', 'mCurveGroup', 'attGroup', 'mActualEffortGroup',",
    with: "    const MILESTONE_NA = ['mFixedCost', 'mInvoiced', 'mPaid', 'mUnitsGroup', 'mCurveGroup', 'attGroup', 'mActualEffortGroup'," },

  /* Two surfaces, one word, different questions. */

  { what: 'audience: how a story is verified decides who it is for, so artifact evidence reads as internal',
    find: "      const t = (s && s.wbsId != null) ? tasks.find(x => x.id === s.wbsId) : null;\n      if (!t) return 'client';",
    with: "      if (isProcessStory(s)) return 'internal';\n      const t = (s && s.wbsId != null) ? tasks.find(x => x.id === s.wbsId) : null;\n      if (!t) return 'client';" },

  { what: 'audience: the matrix calls artifact-evidenced work internal again',
    find: "\u2705 by artifact</span>'".replace('\u2705', '\ud83d\udccb'),
    with: "\u2705 internal</span>'".replace('\u2705', '\ud83d\udccb') },

  { what: 'ledger: the cell key forgets the measure, so every column shows the same figure',
    find: '    function ledgerKey4(a, b, ck, mk) { return JSON.stringify([String(a), String(b), String(ck), String(mk)]); }',
    with: '    function ledgerKey4(a, b, ck, mk) { return JSON.stringify([String(a), String(b), String(ck)]); }' },

  { what: 'ledger: several measures draw one header row, so no column says which number it is',
    find: "        + (multi\n            ? '<tr>' + pv.colKeys.concat(['__tot'])",
    with: "        + (false\n            ? '<tr>' + pv.colKeys.concat(['__tot'])" },

  { what: 'ledger: the last measure can be switched off, leaving a pivot of nothing',
    find: '      if (i >= 0) { if (ms.length === 1) return; ms.splice(i, 1); } else {',
    with: '      if (i >= 0) { ms.splice(i, 1); } else {' },

  { what: 'SOW: the drafter reorders the sections and the document ignores it',
    find: '      const ord = sowOrder();\n      secs.sort((a, b) => {',
    with: '      const ord = SOW_SECTIONS.map(x => x.key);\n      secs.sort((a, b) => {' },

  { what: 'SOW: a reordered section keeps its old number, so cross-references point at the wrong clause',
    find: '      const numOf = {};\n      secs.forEach((s, i) => { numOf[s.key] = i + 1; });',
    with: '      const numOf = {};\n      SOW_SECTIONS.forEach((s, i) => { numOf[s.key] = i + 1; });' },

  /* A working transport nobody can start. Each of these puts the guide back to
     the state it was in when it could not be set up from a Mac. */

  { what: 'sync guide: the reason blames the browser even when the origin is what refuses',
    find: "      if (fileOrigin) return { ok: false,",
    with: '      if (false) return { ok: false,' },

  { what: 'sync guide: it says watching is unavailable and offers nothing to do about it',
    find: "      if (fsSupported() && !fileOrigin) return { ok: true, why: '', fix: '' };",
    with: "      if (true) return { ok: true, why: '', fix: '' };" },

  { what: 'sync guide: never says the watched file is on your own disk, so uploading to Drive looks right',
    find: "        + box('#eff6ff', '#bfdbfe', '<b>The part that catches everybody out:</b> this watches a file <b>on your own '",
    with: "        + box('#eff6ff', '#bfdbfe', '<b>The part that catches everybody out:</b> this watches a file <b>on a '" },

  { what: 'sync guide: the Mac fix for a picker that cannot see the drive is gone',
    find: "<b>Google Drive</b> → switch to <b>Mirror files</b>.",
    with: "<b>Google Drive</b> → have a look around." },

  { what: 'sync guide: a Mac is shown the Windows steps',
    find: "        + (mac\n            ? '<ol style=",
    with: "        + (false\n            ? '<ol style=" },

  { what: 'sync guide: never says that watching only reads, so half a setup looks whole',
    find: "        + '<b>It only reads — it never writes your changes anywhere.</b></td>'",
    with: "        + '</td>'" },

  { what: 'chip: watching with nothing published looks identical to a working pair',
    find: '      const publishing = !!diskFileHandle;',
    with: '      const publishing = true;' },

  { what: 'sync guide: unreachable — nothing on the page opens it',
    find: '          <button onclick="openSyncGuide()" title="What this actually does',
    with: '          <button title="What this actually does' },

  { what: 'ledger: fixed costs are nobody’s time, so they are left out and the total no longer ties',
    find: '        const fc = Number(t.fixedCost) || 0;\n        if (fc > 0) out.push(',
    with: '        const fc = 0;\n        if (fc > 0) out.push(' },

  { what: 'ledger: the per-day split repeats the whole activity on every day instead of dividing it',
    find: '            const h = planH / n;',
    with: '            const h = planH;' },

  { what: 'ledger: the person filter is accepted and never applied',
    find: '        if (s.people.length && s.people.indexOf(f.who) < 0) return false;',
    with: '        if (false) return false;' },

  { what: 'ledger: the company filter is accepted and never applied',
    find: "        if (s.orgs.length && s.orgs.indexOf(f.org || '') < 0) return false;",
    with: '        if (false) return false;' },

  { what: 'ledger: the date window is accepted and never applied',
    find: '          if (from != null && f.day < from) return false;',
    with: '          if (false) return false;' },

  { what: 'ledger: client-side people are billed at their bill rate like everybody else',
    find: '          const rate = client ? 0 : getRate(pr.name), bill = client ? 0 : getBillRate(pr.name);',
    with: '          const rate = getRate(pr.name), bill = getBillRate(pr.name);' },

  { what: 'ledger: the second grouping level is chosen and its rows are never drawn',
    find: "        return grpRow + subs.map(([b]) =>",
    with: "        return grpRow + [].map(([b]) =>" },

  { what: 'ledger: the tie-out to the billing table is never printed, so nobody can tell the two agree',
    find: "      if (MK.indexOf('billed') >= 0 && !ledgerFiltersOn()) {",
    with: '      if (false) {' },

  { what: 'ledger: a person named "A" and the pair (A, B) collide in one cell',
    find: '    function ledgerKey(a, b, ck) { return JSON.stringify([String(a), String(b), String(ck)]); }',
    with: "    function ledgerKey(a, b, ck) { return String(a) + String(b) + String(ck); }" },

  /* Two totals on one screen. The gap between them is always one of three
     specific things and the app knows which; these put it back to a mystery. */

  { what: 'price gap: the "rate-card sum" it quotes is the fee, so the two can never differ',
    find: '      const rateCard = (Number(f.labor) || 0) + (Number(f.fixedTotal) || 0);   // == billingData().totBill',
    with: '      const rateCard = Math.max(0, Number(f.price) || 0);' },

  { what: 'price gap: the difference is computed and never drawn beside the table it contradicts',
    find: '        ${priceVsRateCardHtml()}`;',
    with: '        `;' },

  { what: 'NFR: the section never says how much it holds',
    find: '        <p style="font-size:11.5px;color:#64748b;margin:4px 0 0">${rows.length} requirement${rows.length === 1 ? \'\' : \'s\'} across ${keys.length} categor${keys.length === 1 ? \'y\' : \'ies\'}',
    with: '        <p style="font-size:11.5px;color:#64748b;margin:4px 0 0">${\'\'}' },

  /* ═══ THE SYNC DEFECTS, EACH ONE FOUND BY A PERSON ══════════════════════════
     Fourteen mutants that were already written, run and watched go red — and
     then thrown away. Every one of them was a plant made while fixing a defect
     somebody reported: break it, watch the check catch it, put it back. That
     cycle IS a mutant; it simply was not written down, so the coverage probe
     could not see it and trunk-sweep read 2 of 54 assertions with evidence
     behind them while more than a dozen had been proven by hand that afternoon.

     Recording them costs nothing and turns a habit into a measurement. Each is
     the exact edit that produced the reported symptom, so the `what` reads as
     the complaint rather than as a description of the code. */

  { what: 'sync: a version files itself and the changelog has no word for what moved',
    find: "          rows = rows.concat(trunkExtraRows(from, to));",
    with: "          rows = rows.concat([]);" },

  { what: 'sync: the daily status snapshot is enough to file a version of its own',
    find: "      try { const o = JSON.parse(work); delete o.status; return JSON.stringify(o); }",
    with: "      try { const o = JSON.parse(work); return JSON.stringify(o); }" },

  { what: 'sync: a focused but idle box stops the automatic loop for good',
    find: "      return inBox && (Date.now() - trunkLastKey) < TRUNK_QUIET_MS;",
    with: "      return inBox;" },

  { what: 'sync: progress cannot be compared against a history older than the work record',
    find: "      if (t && t.base) fromDoc(t.base.vid, t.base.doc);",
    with: "      if (false) fromDoc(t.base.vid, t.base.doc);" },

  { what: 'merge: the RAID log, the stories, the phases and the roster have no ancestor',
    find: "      const baseDoc = trunkDocOfVid(trunkFile, found.mine && found.mine.vid);",
    with: "      const baseDoc = null; void trunkDocOfVid;" },

  { what: 'the review panel disowns the relation the merge just worked out',
    find: "               rel: rel, haveBaseDoc: !!baseDoc,",
    with: "               haveBaseDoc: !!baseDoc," },

  { what: 'a file merge is turned away by the version chain while holding their unfiled edits',
    find: "      if (!take) {",
    with: "      if (rel.relation === 'same') {" },

  { what: 'the reviewed merge is recomputed without the trunk it came from',
    find: "      const r = mergeCompute(doc, trunkFile);",
    with: "      const r = mergeCompute(doc);" },

  { what: 'the contested pull hands the review panel no trunk to find the ancestor in',
    find: "        mergeReview(tip.doc, 'the team trunk', t);",
    with: "        mergeReview(tip.doc, 'the team trunk');" },

  { what: 'changelog: a change shows where it landed but not where it came from',
    find: "          rows.push({ kind: WORK_DIFF_KIND[f], id: id, name: nameOf(id), from: a[f], to: b[f] });",
    with: "          rows.push({ kind: WORK_DIFF_KIND[f], id: id, name: nameOf(id), from: null, to: b[f] });" },

  { what: 'a plan with nothing in it opens a modal from inside a compute function',
    find: "      if (tasks.length === 0) { flashSaved('Add at least one activity first.'); return; }",
    with: "      if (tasks.length === 0) { alert('Add at least one activity first.'); return; }" },

  { what: 'the emailable status table prints a tooltip where an estimate should be',
    find: "${escapeHtml(fmtDurCell(t.te || 0))}</td>",
    with: "${escapeHtml(fmtDur(t.te || 0))}</td>" },

  { what: 'the plain-text status request carries markup into Slack and mail',
    find: "estimate ${fmtDurCell(t.te || 0)}, currently",
    with: "estimate ${fmtDur(t.te || 0)}, currently" },

  { what: 'the activity list sent to the model carries markup instead of a unit',
    find: "', time spent so far ' + fmtDurText(t.actualEffort)",
    with: "', time spent so far ' + fmtDur(t.actualEffort)" },

  { what: 'a push onto a trunk that moved after it was read is not refused',
    find: "        if (rel.relation === 'behind' || rel.relation === 'diverged') {",
    with: "        if (false && (rel.relation === 'behind' || rel.relation === 'diverged')) {" },

  { what: 'a pull fast-forwards over work that was never shared',
    find: "        if ((rel.relation === 'behind' || rel.relation === 'same') && leafTasks().length) {",
    with: "        if (false && (rel.relation === 'behind' || rel.relation === 'same') && leafTasks().length) {" },

  { what: 'the changelog counts RAID entries instead of naming which one moved',
    find: "      trunkRaidRows(a.raid, b.raid).forEach(r => rows.push(r));",
    with: "      void trunkRaidRows;" },

  { what: 'the sync control never says why it is holding off',
    find: "      if (trunkBusyEditing()) { trunkHeld = 'editing'; updateTrunkBtn(); return; }",
    with: "      if (trunkBusyEditing()) return;" },

  /* ═══ AIMED AT THE SENTENCES THAT HAD NEVER FIRED ══════════════════════════
     The coverage probe (tests/probes/assertion-coverage.js) read the full-run
     journal and answered: 432 of 1284 matchable assertions had ever been the
     one that went red. Not because the other 852 are wrong — because judging
     stops at the first check that goes red, so a sentence can only earn its
     evidence by being the FIRST to catch something, and whole sweeps
     (portfolio, cross-surface, three-people: 0%) had never once been that.

     Every mutant below was aimed at a specific never-fired sentence and
     dry-run-verified before landing here: pristine sweep green, mutated copy
     red, the target sentence in the red run's output. Three targets could not
     be fired and are recorded where they belong instead: the RAID-type
     whitelist is masked by the <select> element re-validating behind it (a
     browser will not hold a value its list does not offer), one
     contradiction-sweep line proved to be algebra over the check's own locals,
     and three-people-sweep read the repo's product by path so APP_FILE never
     reached it — fixed in the sweep, which is what made its five sentences
     below reachable at all. */

  /* ── the portfolio and the plan-vs-actual cards ── */
  { what: "portfolio: person rows merge by upper-cased name, so the roster names no longer match",
    find: "return { name: e.name, cap: cap, capDisagree: capDisagree, caps: e.caps,",
    with: "return { name: String(e.name).toUpperCase(), cap: cap, capDisagree: capDisagree, caps: e.caps," },

  { what: "portfolio: a day’s combined load takes the largest single claim instead of the sum",
    find: "d.total += n; d.from[pname] = (d.from[pname] || 0) + n;",
    with: "d.total = Math.max(d.total, n); d.from[pname] = (d.from[pname] || 0) + n;" },

  { what: "portfolio: anyone past 80% of capacity is reported as over across the book",
    find: "if (d.total > cap + 1e-6) over.push({ iso: iso, total: d.total, from: d.from });",
    with: "if (d.total > cap * 0.8) over.push({ iso: iso, total: d.total, from: d.from });" },

  { what: "portfolio: conflicting capacities resolve to the largest recorded value",
    find: "const cap = capVals.length ? Math.min.apply(null, capVals) : 100;",
    with: "const cap = capVals.length ? Math.max.apply(null, capVals) : 100;" },

  { what: "portfolio: committed cost tile reports the largest project instead of the book’s total",
    find: "cost: projects.reduce((n, p) => n + ((p.metrics && p.metrics.cost) || 0), 0),",
    with: "cost: projects.reduce((n, p) => Math.max(n, (p.metrics && p.metrics.cost) || 0), 0)," },

  { what: "io map: plan-to-date is accrued a week behind today, skewing the budget bar and spend-line gap",
    find: "const pvNow = accrualAt(sp.segs, today.getTime());   // === the planned-value card",
    with: "const pvNow = accrualAt(sp.segs, today.getTime() - 7 * 86400000);   // === the planned-value card" },

  { what: "io map: the budget bar prints earned value where the booked figure belongs",
    find: "bud.actTxt = money(actCost);",
    with: "bud.actTxt = money(evNow);" },

  { what: "io map: the drill-in’s per-activity overrun carries the cost-variance sign convention",
    find: "const timing = ev - pv, over = ac - ev;",
    with: "const timing = ev - pv, over = ev - ac;" },

  { what: "io map: the over-allocation health finding is filed under Cost and fires on the roster object, not the count",
    find: "const over = resourceLoad ? resourceLoad.overResourceDays : 0;\n      if (over) findings.push({ severity: 'high', area: 'Resourcing', finding: ",
    with: "const over = resourceLoad ? resourceLoad.overResourceDays : 0;\n      if (resourceLoad) findings.push({ severity: 'high', area: 'Cost', finding: " },


  /* ── pricing and the readout contradictions ── */
  { what: "pricing rate: fixed-fee cap decoupled from the quoted price",
    find: "const cap = isTM ? (contract || ceiling) : price;",
    with: "const cap = isTM ? (contract || ceiling) : recPrice;" },

  { what: "pricing rate: cost-unknown guard tests participation instead of rated participation",
    find: "const costBlind = anyInternalPart && !anyRatedPart;",
    with: "const costBlind = anyInternalPart && !anyPart;" },

  { what: "pricing rate: panel headline prints markup over cost instead of the ratio over price",
    find: ", leaving ${pbPct(f.margin)} margin over a ${fmtMoney(f.cost)} delivery cost",
    with: ", leaving ${pbPct((f.price - f.cost) / f.cost * 100)} margin over a ${fmtMoney(f.cost)} delivery cost" },

  { what: "pricing rate: calculated guard inverted so the panel always shows the blocked notice",
    find: "if (!calculated || !tasks.length) {\n        cont.innerHTML = blocked('Calculate the plan first",
    with: "if (!calculated || tasks.length) {\n        cont.innerHTML = blocked('Calculate the plan first" },

  { what: "pricing rate: SOW price block omitted unless a contract price was typed",
    find: "if (!(f.price > 0)) return null;",
    with: "if (!(f.contract > 0)) return null;" },

  { what: "pricing rate: client-kind detection broken by a case-sensitive compare",
    find: "function isClientResource(name) { return getKind(name) === 'client'; }",
    with: "function isClientResource(name) { return getKind(name) === 'Client'; }" },

  { what: "pricing rate: rate-card currency never read, every figure renders in dollars",
    find: "return (!c || /^usd$/i.test(c)) ? '$' : c;",
    with: "return '$';" },

  { what: "pricing rate: simulation drift threshold mistyped from 2% to 200%",
    find: "const staleSim = haveSim && (drift(simCostMean, cost) > 0.02 || drift(simRevMean, detRev) > 0.02);",
    with: "const staleSim = haveSim && (drift(simCostMean, cost) > 2 || drift(simRevMean, detRev) > 2);" },

  { what: "readout: budget driver returns its timing and overrun halves swapped",
    find: "return { timing: timing, over: over,",
    with: "return { timing: over, over: timing," },

  { what: "readout: budget driver filter keeps both signs so the remainder sentence goes stale",
    find: ".filter(x => Number.isFinite(x.v) && x.v * dir > 0.0001)",
    with: ".filter(x => Number.isFinite(x.v) && Math.abs(x.v) > 0.0001)" },

  { what: "readout: driver list pinned to the over side and its fault line reworded",
    find: ["v => (v > 0 ? '+' : '−') + money(Math.abs(Math.round(v))), overspent ? 1 : -1, budDetail);",
           "(over > 0 ? 'over its own budget' : 'under its own budget')"],
    with: ["v => (v > 0 ? '+' : '−') + money(Math.abs(Math.round(v))), 1, budDetail);",
           "(over > 0 ? 'above its own budget' : 'under its own budget')"] },

  { what: "readout: cause chip painted as a fault for any explaining entry",
    find: "const fault = raidIsFault(top);",
    with: "const fault = raidExplains(top);" },

  { what: "readout: decisions counted as faults and the log-offer gate flipped with them",
    find: ["if (r.type === 'Decision') return false;",
           "+ (raidHasFaultCause(taskId) || !mkOffer ? '' : mkOffer())"],
    with: ["if (r.type === 'Decision') return true;",
           "+ (raidHasFaultCause(taskId) && mkOffer ? mkOffer() : '')"] },

  { what: "readout: spend verdict flags transposed between the curve test and the value test",
    find: ["const overValue = (actCost - evNow) > tol;",
           "if (bv.overCurve && !bv.overValue) {"],
    with: ["const overValue = (evNow - actCost) > tol;",
           "if (!bv.overCurve && bv.overValue) {"] },

  { what: "readout: remainder tolerance comparison inverted, the note claims the tidy case",
    find: "+ (Math.abs(budRest) > Math.max(1, Math.abs(budShownSum) * 0.02)",
    with: "+ (Math.abs(budRest) < Math.max(1, Math.abs(budShownSum) * 0.02)" },


  /* ── the AI input boundary ── */
  { what: "criteria: reading validator no longer checks that an open/raid act ref resolves to a real task",
    find: "if (!tasks.some(t => t.id === n)) a = null; else a = { v, id: n, label: String(a.label || '').slice(0, 22) };",
    with: "a = { v, id: n, label: String(a.label || '').slice(0, 22) };" },

  { what: "criteria: reading text interpolated into panel markup without escapeHtml",
    find: "let h = escapeHtml(i.text);",
    with: "let h = i.text;" },

  { what: "criteria: RAID capture stops clamping model probability/impact to the 1-5 scale",
    find: "const clamp = v => Math.min(5, Math.max(1, Math.round(+v) || 3));",
    with: "const clamp = v => Math.round(+v) || 3;" },

  { what: "criteria: add-criteria path upserts by the model-supplied id, rewriting existing criteria and admitting blank text",
    find: "      const existing = new Set((s.ac || []).map(a => String(a.id)));\n      let n = next;\n      const added = res.ac.map(a => {\n        let id;\n        do { id = base + '.' + (n++); } while (existing.has(id));\n        existing.add(id);\n        return { id: id,\n          type: /^(happy|error|edge|perf)$/i.test(String(a.type)) ? String(a.type).toLowerCase() : 'happy',\n          text: String(a.text || '').trim() };\n      }).filter(a => a.text);",
    with: "      const existing = new Set((s.ac || []).map(a => String(a.id)));\n      let n = next;\n      const added = [];\n      res.ac.forEach(a => {\n        const type = /^(happy|error|edge|perf)$/i.test(String(a.type)) ? String(a.type).toLowerCase() : 'happy';\n        const text = String(a.text || '').trim();\n        const hit = (s.ac || []).find(x => String(x.id) === String(a.id));\n        if (hit) { hit.type = type; hit.text = text; return; }\n        let id;\n        do { id = base + '.' + (n++); } while (existing.has(id));\n        existing.add(id);\n        added.push({ id: id, type: type, text: text });\n      });" },

  { what: "criteria: saving a draft writes its title over the deliverable even when one was already typed",
    find: "if (t.aiDoc && !String(t.deliverable || '').trim() && t.aiDoc.title) {",
    with: "if (t.aiDoc && t.aiDoc.title) {" },

  { what: "criteria: transcript cap simplified to a plain tail slice, losing the opening brief turn",
    find: "return rows.length <= CHAT_MSG_CAP ? rows\n        : [rows[0]].concat(rows.slice(rows.length - (CHAT_MSG_CAP - 1)));",
    with: "return rows.slice(-CHAT_MSG_CAP);" },


  /* ── the network, the simulation and save/load ── */
  { what: "network: milestones are given a half-day default duration instead of zero",
    find: "if (t.milestone || t.isSummary) { t.te = 0; t.variance = 0; }",
    with: "if (t.milestone || t.isSummary) { t.te = t.milestone ? 0.5 : 0; t.variance = 0; }" },

  { what: "network: successor graph is built for FS edges only, so plans with SS/FF/SF links cannot schedule",
    find: "nodes.forEach(t => preds[t.id].forEach(p => { if (successors[p.id]) successors[p.id].push({ id: t.id, type: p.type, lag: p.lag }); }));",
    with: "nodes.forEach(t => preds[t.id].forEach(p => { if (successors[p.id] && (p.type || 'FS') === 'FS') successors[p.id].push({ id: t.id, type: p.type, lag: p.lag }); }));" },

  { what: "network: critical flag tolerance widened so near-critical activities are marked critical",
    find: "t.isCritical = Math.abs(t.slack) < 0.01;",
    with: "t.isCritical = t.slack < 1.5;" },

  { what: "network: Monte Carlo duration distribution sorted descending, inverting every percentile",
    find: "durations.sort((a, b) => a - b);",
    with: "durations.sort((a, b) => b - a);" },

  { what: "network: dateConfidencePct guard reads mcResult.duration (typo), so it always bails to null",
    find: "if (!mcResult || !Array.isArray(mcResult.durations) || !mcResult.durations.length) return null;",
    with: "if (!mcResult || !Array.isArray(mcResult.duration) || !mcResult.duration.length) return null;" },

  { what: "save/load serialize renames the roster and RAID keys, so hydrate never finds them again",
    find: "resources, reserves, baselineDate, baselineLog, levelMode, projectBudget,\n        raid, nextRaidId,",
    with: "roster: resources, reserves, baselineDate, baselineLog, levelMode, projectBudget,\n        raidLog: raid, nextRaidId," },

  { what: "save/load org adoption mints a fresh local id and never checks the registry for an existing record",
    find: "const known = orgFind(key);\n      if (known) return known;\n      const sameName = nm ? orgByName(nm) : null;\n      if (sameName) return sameName;\n      const lib = loadOrgLib().slice();\n      const rec = { id: key, name: nm || key, at: fmtISO(new Date()), adopted: true };",
    with: "const lib = loadOrgLib().slice();\n      const rec = { id: 'org-' + Math.random().toString(36).slice(2, 10), name: nm || key, at: fmtISO(new Date()), adopted: true };" },


  /* ── the trunk and the three-person exchange ── */
  { what: "trunk: trunkVerifyChain forgets to admit earlier log entries as parents, so it only accepts the base",
    find: "if (e.pvid && !seen.has(e.pvid)) gaps.push({ vid: e.vid, missingParent: e.pvid, by: e.byName || e.by || 'somebody', at: e.at });\n        seen.add(e.vid);",
    with: "if (e.pvid && !seen.has(e.pvid)) gaps.push({ vid: e.vid, missingParent: e.pvid, by: e.byName || e.by || 'somebody', at: e.at });" },

  { what: "trunk: trunkWhoMoved builds the \"already mine\" set from the trunk log itself, so every arriving entry reads as already seen",
    /* RE-ANCHORED. The sync repair that ended one user's "Pull first" loop
       replaced this line, so the mutant stopped applying and read as coverage
       it no longer had — over exactly the code that had just been changed,
       which is the worst possible moment to lose a guard. */
    find: "      const mine = planKnownVids();",
    with: "      const mine = new Set(((t && t.log) || []).map(v => v.vid).filter(Boolean));" },

  { what: "trunk: mergeCompute inverts the three-way rule, reporting fields only the other side changed as conflicts",
    find: "if (String(va) === String(vb)) { auto.push({ id: id, name: a.name, field: f, label: lbl, mine: va, theirs: vc }); return; }",
    with: "if (String(va) !== String(vb)) { auto.push({ id: id, name: a.name, field: f, label: lbl, mine: va, theirs: vc }); return; }" },

  { what: "trunk: the unattended path treats a diverged copy as a plain catch-up, taking the trunk tip instead of merging",
    find: ["      if (rel.relation === 'behind') { await trunkPull(true); trunkAutoStart(); return; }",
           "        if (rel.relation === 'behind') {\n"],
    with: ["      if (rel.relation === 'behind' || rel.relation === 'diverged') { await trunkPull(true); trunkAutoStart(); return; }",
           "        if (rel.relation === 'behind' || (quiet && rel.relation === 'diverged')) {\n"] },

  { what: "trunk: the push preview sentence is simplified to a generic line that states neither the size of the push nor who will see it",
    find: "      return 'You are about to share ' + s2.versions + ' version' + (s2.versions === 1 ? '' : 's')\n        + ' with the team' + (who ? ' — ' + who + ' will see this next time they sync' : '') + '.\\n\\n'\n        + (bits.length ? bits.join(', ') + '.\\n\\n' : 'Nothing about the activities changed; this files where '\n            + 'you are so the histories stay joined.\\n\\n')",
    with: "      return 'You are about to share your latest work with the team.\\n\\n'" },

  { what: "trunk: the kin and twin verdicts are swapped in trunkRelation",
    find: ["return k.shared > 0 ? { relation: 'kin', kin: k } : { relation: 'unrelated', kin: k };",
           "        if (planLineage && t.lineage && planLineage === t.lineage)\n          return { relation: 'twin', kin: k };"],
    with: ["return k.shared > 0 ? { relation: 'twin', kin: k } : { relation: 'unrelated', kin: k };",
           "        if (planLineage && t.lineage && planLineage === t.lineage)\n          return { relation: 'kin', kin: k };"] },

  { what: "trunk: the sync chip inverts its outbound-half test, offering the autosave fix exactly when it is already set up",
    find: "const publishing = !!diskFileHandle;",
    with: "const publishing = !diskFileHandle;" },

  { what: "trunk: the auto-sync control's held-while-editing label is trimmed and no longer says anybody is typing",
    find: "'⏳ Auto sync: waiting until you stop typing'",
    with: "'⏳ Auto sync: waiting'" },

  { what: "three-person sync: mergeApply writes the local value back for fields only the other side changed",
    find: "r.auto.forEach(x => { if (applyRow(x, x.theirs)) n++; });",
    with: "r.auto.forEach(x => { if (applyRow(x, x.mine)) n++; });" },

  { what: "three-person sync: trunkPull applies the fast-forward branch to diverged copies, replacing the plan instead of merging",
    find: "        if (rel.relation === 'behind') {\n",
    with: "        if (rel.relation === 'behind' || rel.relation === 'diverged') {\n" },


  /* ═══ THE SECOND AIMED BATCH ═══════════════════════════════════════════════
     Same instrument, next ring out: after the first aimed batch the union stood
     at 521 of 1284, with the biggest remaining tails in the drawn surfaces,
     navigation, the exports and the trunk. Every mutant below is dry-run
     verified the same way (pristine green, mutated red, target sentence in the
     output). Two more check defects fell out of the aiming: export-sweep's
     whole round-trip block sat behind `if (rep)` on importers that rendered
     their report and returned undefined — repaired in the importers, and the
     block ran green on the pristine product the first time it ever ran — and
     the RAID-type whitelist needed a compound mutant (free-text type field AND
     the whitelist dropped) because a <select> re-validates behind any single
     validator defect. */

  /* ── the network, the simulation and the reserves ── */
  { what: "network: management reserve added onto the raw CPM finish instead of the committed date",
    find: "const totalUnits = committedUnits + managementUnits;",
    with: "const totalUnits = cpmUnits + managementUnits;" },

  { what: "network: date stepping counts every calendar day as a day worked",
    find: "        d.setDate(d.getDate() + 1);\n        if (isWorkingDay(d, holidays)) added++;",
    with: "        d.setDate(d.getDate() + 1);\n        added++;" },

  { what: "network: the per-task critical count is kept raw instead of divided by the iterations",
    find: "tasks.forEach(t => t.criticality = critCount[t.id] / iters);",
    with: "tasks.forEach(t => t.criticality = critCount[t.id]);" },

  { what: "network: a milestone reports the work behind its gate as its own planned work",
    find: "    function plannedEffortUnit(t, useBaseline) {\n      if (!t || t.milestone) return 0;",
    with: "    function plannedEffortUnit(t, useBaseline) {\n      if (!t) return 0;\n      if (t.milestone) { const r = milestoneReach(t); return r ? r.effort : 0; }" },

  { what: "network: computing a milestone reach accrues the upstream cost onto the milestone",
    /* RE-ANCHORED. milestoneReach grew a second span between this mutant's
       `find` and the return it planted before, so the anchor stopped matching
       and the mutant silently stopped applying — a false pass, which is the one
       failure mode this whole file exists to prevent. Anchored to the return
       line alone now, which is all it was ever about. */
    find: "      return { n: leaves.length, effort: effort, cost: cost,",
    with: "      t.fixedCost = (Number(t.fixedCost) || 0) + cost;\n      return { n: leaves.length, effort: effort, cost: cost," },


  /* ── the AI input boundary, second pass ── */
  { what: "criteria: the RAID catalogue's roster line offers 'Unassigned' as a valid owner nobody on the plan has",
    find: "const roster = Object.keys(resources);",
    with: "const roster = Object.keys(resources).concat(['Unassigned']);" },

  { what: "criteria: sentence capture files the entry straight into the log instead of only staging the draft",
    find: "raidDraftLinks = links;",
    with: "raidDraftLinks = links;\n      raid.push({ id: nextRaidId++, type: type, title: (title || sentence).slice(0, 90),\n        description: String((res && res.description) || sentence).slice(0, 600),\n        probability: type === 'Issue' ? 5 : clamp(res && res.probability), impact: clamp(res && res.impact),\n        owner: owner, status: 'Open', mitigation: String((res && res.mitigation) || '').slice(0, 400),\n        createdAt: fmtISO(new Date()) });" },

  { what: "criteria: draft-fit classifier loses its structural guards, so milestones and phases are offered as things to compose",
    find: "      if (!t || t.isSummary) return { fit: 'unlikely', why: 'a phase is a container, not a deliverable' };\n      if (t.milestone) return { fit: 'unlikely', why: 'a milestone is a date, not an artefact' };",
    with: "      if (!t) return { fit: 'unlikely', why: 'nothing selected' };" },

  { what: "criteria: the drafting context digest sweeps the owner's bill rate into the text sent with every draft turn",
    find: "      if (t.owner) L.push('  Owner: ' + t.owner + ((resources[t.owner] || {}).role ? ' — ' + resources[t.owner].role : ''));",
    with: "      if (t.owner) L.push('  Owner: ' + t.owner + ((resources[t.owner] || {}).role ? ' — ' + resources[t.owner].role : '')\n        + ' ($' + rawBillRate(t.owner) + '/' + resRateUnit(t.owner) + ' bill rate)');" },

  { what: "criteria: the drafting contract softens its rule against quoting prices into a mere consistency note",
    find: "      '- Never state a price, rate, cost or margin. Commercials live in the Statement of Work.',",
    with: "      '- Keep any commercial terms consistent with the Statement of Work.'," },

  { what: "criteria: the drafting contract drops its hard ban on invented facts, keeping only the placeholder advice",
    find: "      '- Invent NOTHING. Where a real figure, name or date is needed and the brief does not have it, write a [SQUARE-BRACKET PLACEHOLDER] naming exactly what is missing.',",
    with: "      '- Where a real figure, name or date is needed and the brief does not have it, write a [SQUARE-BRACKET PLACEHOLDER] naming exactly what is missing.'," },

  { what: "criteria: drafting transcript bubbles are filled with innerHTML, so model output lands in the page as live markup",
    find: "body.textContent = m.text + (m.trimmed",
    with: "body.innerHTML = m.text + (m.trimmed" },

  { what: "criteria: the type field becomes free text and capture trusts the model's type verbatim, admitting kinds the log does not have",
    find: ["<select id=\"rType\" onchange=\"raidOutcomeFormSync()\">\n                <option>Risk</option><option>Assumption</option><option>Issue</option><option>Decision</option><option>Exclusion</option></select>",
           "      const type = TYPES.indexOf(String(res && res.type)) >= 0 ? res.type : 'Risk';\n      if (res && res.type && TYPES.indexOf(String(res.type)) < 0) drops.push('an unknown type, defaulted to Risk');"],
    with: ["<input id=\"rType\" type=\"text\" value=\"Risk\" onchange=\"raidOutcomeFormSync()\" />",
           "      const type = String((res && res.type) || 'Risk').trim();"] },


  /* ── navigation, the worklist and the analytics layout ── */
  { what: "worklist: the copy names who owns the blocker and drops the blocking activity itself",
    find: "return (b.wbs ? b.wbs + ' ' : '') + b.name + ' (' + who + ')'",
    with: "return who" },

  { what: "worklist: the group subtotal row is dropped from every table",
    find: "+ shown.map(r => wlTableRow(r, showBlock)).join('') + '</tbody>' + foot + '</table></div>'",
    with: "+ shown.map(r => wlTableRow(r, showBlock)).join('') + '</tbody>' + '</table></div>'" },

  { what: "worklist: the waiting-on-whom chain reverts to roster order",
    find: "        .sort((a, b) => b.holdingUp.length - a.holdingUp.length\n          || b.now - a.now || b.blocked - a.blocked || String(a.name).localeCompare(String(b.name)));",
    with: "        .sort((a, b) => String(a.name).localeCompare(String(b.name)));" },

  { what: "worklist: the chain shows only people entangled in a dependency",
    find: "        total: p.now.length + p.blocked.length + p.soon.length + p.doneRows.length }))\n        .sort((a, b) => b.holdingUp.length - a.holdingUp.length",
    with: "        total: p.now.length + p.blocked.length + p.soon.length + p.doneRows.length }))\n        .filter(r => r.holdingUp.length || r.waitingOn.length)\n        .sort((a, b) => b.holdingUp.length - a.holdingUp.length" },

  { what: "navigation: the Money section is looked up and never written",
    find: "      const moneyHost = document.getElementById('moneyContent');\n      if (moneyHost) moneyHost.innerHTML = costBlock;",
    with: "      const moneyHost = document.getElementById('moneyContent');" },

  { what: "navigation: the money block is left behind in the Monte Carlo card as well",
    find: "        ${reservesBlock}\n        ${histBlock}",
    with: "        ${reservesBlock}\n        ${costBlock}\n        ${histBlock}" },

  { what: "navigation: the contract badge counts every log entry, open or not",
    find: "          const open = (raid || []).filter(r => (r.type === 'Risk' || r.type === 'Issue')\n            && String(r.status || '') !== 'Closed');",
    with: "          const open = (raid || []).slice();" },

  { what: "navigation: leaving the chart clears a reading the click was meant to keep",
    find: "      if (ptrScPinned) return;                       // a pinned reading stays put\n",
    with: "" },


  /* ── what leaves as a file ── */
  { what: "billing CSV summary line relabeled 'Grand total' in a copy polish",
    find: "rows.push(['TOTAL', '', '', '', '', d.totDays.toFixed(2)",
    with: "rows.push(['Grand total', '', '', '', '', d.totDays.toFixed(2)" },

  { what: "billing CSV per-person Billed $ cell copy-pasted from the Cost $ cell",
    find: "r.rec.days.toFixed(2), r.rec.tasks, r.rec.tcs, r.cost.toFixed(0), r.billed.toFixed(0)",
    with: "r.rec.days.toFixed(2), r.rec.tasks, r.rec.tcs, r.cost.toFixed(0), r.cost.toFixed(0)" },

  { what: "export: variance sheet Est-effort header renamed 'Planned effort'",
    find: "'Allocation %', 'Est effort (' + u + ')',",
    with: "'Allocation %', 'Planned effort (' + u + ')'," },

  { what: "export: traceability Story ID column switched to the Jira key",
    find: "const base = [s.epicId || '', s.id, storySentence(s), s.persona || '', s.jira || ''];",
    with: "const base = [s.epicId || '', s.jira || '', storySentence(s), s.persona || '', s.jira || ''];" },

  { what: "export: project JSON save strips percentComplete as a derived field",
    find: "download(safeName() + '.json', JSON.stringify(data, null, 2), 'application/json');",
    with: "download(safeName() + '.json', JSON.stringify(data, (k, v) => k === 'percentComplete' ? undefined : v, 2), 'application/json');" },

  { what: "export: project JSON withholds internal cost rates as confidential",
    find: "download(safeName() + '.json', JSON.stringify(data, null, 2), 'application/json');",
    with: "download(safeName() + '.json', JSON.stringify(data, (k, v) => k === 'rate' ? undefined : v, 2), 'application/json');" },

  { what: "export: WBS dictionary work-effort header shortened to plain 'Effort'",
    find: "'Duration — span (' + u + ')','Work effort (' + u + ')'",
    with: "'Duration — span (' + u + ')','Effort (' + u + ')'" },


  /* ── the drawn surfaces ── */
  { what: "chart: an always-on hide-completed filter leaks into the Gantt row list, so finished activities lose their bars",
    find: "if (!hasCollapsedAncestor(task)) { shown.add(task.id); return true; }",
    with: "if (!hasCollapsedAncestor(task)) { if ((task.percentComplete || 0) >= 100 && !task.isSummary && !task.milestone) return false; shown.add(task.id); return true; }" },

  { what: "chart: fencepost lost in the leaf bar span, so a one-day and a five-day bar are drawn at two different px-per-day scales",
    find: "const spanDays = t.finishDate ? (calDaysBetween(t.startDate, t.finishDate) + 1) : 1;",
    with: "const spanDays = t.finishDate ? Math.max(1, calDaysBetween(t.startDate, t.finishDate)) : 1;" },

  { what: "chart: the unstarted critical track drifts to an orange outside the red family during a palette touch-up",
    find: "fill=\"${crit ? '#fca5a5' : '#93c5fd'}\"",
    with: "fill=\"${crit ? '#fdba74' : '#93c5fd'}\"" },

  { what: "chart: the collapsed-phase critical strip drops the /100 on percent, so its start lands past the bar end and no red is drawn",
    find: "doneX: pbx + Math.max(dayW, pspan * dayW) * (t.percentComplete || 0) / 100,",
    with: "doneX: pbx + Math.max(dayW, pspan * dayW) * (t.percentComplete || 0)," },

  { what: "chart: the Gantt milestone row swaps its done/total count for the effort percentage, so the two surfaces stop agreeing about the same gate",
    find: "text-anchor=\"end\">${msR.done}/${msR.n}<title>",
    with: "text-anchor=\"end\">${msR.pct}%<title>" },

  { what: "chart: the gate reach sums raw open-duration instead of allocation-weighted work, so the band quotes the wrong work figure",
    find: "effort += workingDaysToUnit(plannedEffortDays(x));",
    with: "effort += (Number(x.te) || 0);" },

  { what: "chart: the work-cell explanation loses its participant roster in a copy trim, so nothing names who is on the activity",
    find: "+ ' of work' + (who ? ' \\u2014 ' + who : '')",
    with: "+ ' of work'" },

  { what: "chart: the row-late styling inlines the date test and forgets the completed guard, so finished past work is painted late",
    find: "${isLate(t) ? 'late' : ''}",
    with: "${calculated && t.finishDate && stripTime(t.finishDate) < stripTime(new Date()) ? 'late' : ''}" },

  { what: "chart: the reconciliation drops rows that contribute nothing, so the source columns stop footing to their own totals",
    find: "const body = R.rows.map(x =>",
    with: "const body = R.rows.filter(x => Math.abs(x.total) >= 1).map(x =>" },

  { what: "chart: the phase Work cell sums raw TE spans instead of allocation-weighted work, so the sum column stops being a sum",
    find: "? leafDescendants(t.id).reduce((sx, x) => sx + workingDaysToUnit(plannedEffortDays(x)), 0)",
    with: "? leafDescendants(t.id).reduce((sx, x) => sx + (Number(x.te) || 0), 0)" },


  /* ── the trunk, second pass ── */
  { what: "trunk: trunkEntryFromVersion defaults a rootless entry's parent to the entry itself, so the very first push files a self-parented link",
    find: "return { vid: v.vid, pvid: v.pvid || null, at: v.at || fmtISO(new Date()),",
    with: "return { vid: v.vid, pvid: v.pvid || v.vid, at: v.at || fmtISO(new Date())," },

  { what: "trunk: push deduplicates against the trunk by parent id instead of version id, so any version whose parent is already shared never leaves the machine",
    find: "const mine = (planVersions || []).filter(v => v.vid && !have.has(v.vid));",
    with: "const mine = (planVersions || []).filter(v => v.vid && !have.has(v.pvid || v.vid));" },

  { what: "trunk: trunkWhoMoved reads the arriving entries off the local history instead of the trunk log, attributing the move to the person asking",
    /* RE-ANCHORED. The sync repair that ended one user's "Pull first" loop
       replaced this line, so the mutant stopped applying and read as coverage
       it no longer had — over exactly the code that had just been changed,
       which is the worst possible moment to lose a guard. */
    find: "      const mine = planKnownVids();\n      const entries = (t.log || []).filter(e => e.vid && !mine.has(e.vid));",
    with: "      const mine = new Set(((t && t.log) || []).map(e => e.vid).filter(Boolean));\n      const entries = (planVersions || []).filter(e => e.vid && !mine.has(e.vid));" },

  { what: "trunk: trunkRelation decides 'ahead' from the trunk's ROOT rather than its tip, so a diverged copy reads as merely ahead",
    /* RE-ANCHORED. The sync repair that ended one user's "Pull first" loop
       replaced this line, so the mutant stopped applying and read as coverage
       it no longer had — over exactly the code that had just been changed,
       which is the worst possible moment to lose a guard. */
    find: "      if (mySet.has(theirTip)) {\n        return { relation: 'ahead', ahead: myVids.length - 1 - myVids.indexOf(theirTip), behind: 0, baseVid: theirTip };",
    with: "      if (mySet.has(theirVids[0])) {\n        return { relation: 'ahead', ahead: myVids.length - 1 - myVids.indexOf(theirTip), behind: 0, baseVid: theirTip };" },

  { what: "trunk: the kinship gate slips to shared >= 0, so a trunk with not one version in common is greeted as kin instead of refused",
    find: "return k.shared > 0 ? { relation: 'kin', kin: k } : { relation: 'unrelated', kin: k };",
    with: "return k.shared >= 0 ? { relation: 'kin', kin: k } : { relation: 'unrelated', kin: k };" },

  { what: "trunk: the syncChip span was renamed in the markup and the renderer's lookup was not, so the loop's state has no element to land in",
    find: "<span id=\"syncChip\" style=\"display:none\"></span>",
    with: "<span id=\"syncStateChip\" style=\"display:none\"></span>" },

  { what: "trunk: the tick's hidden-tab guard records the hold but forgets to return, so a background tab keeps reading and writing the shared file",
    find: "if (document.hidden) { trunkHeld = 'tab'; return; }",
    with: "if (document.hidden) { trunkHeld = 'tab'; }" },



  /* ═══ BATCH 3 — 56 mutants for regions no assertion had ever fired on ════
     Rebuilt after the first batch-3 set was lost: it had been spliced in but
     never committed, and the workspace rolled back underneath it. Committing
     BEFORE judging is the lesson, and is what happened this time.

     Nine of these guard fixes made the same week they were written — the
     trimmed-version and fast-forward sync faults that left one user unable to
     push or pull at all, the trunk byte budget, the duration cells that read
     every span in hours, and the milestone OPEN column that printed calendar
     days into a column of working-day spans. A fix with no mutant behind it is
     a fix that can be silently undone.

     Four candidates were dropped in validation as duplicates of mutants already
     here — two exact (same find AND same with) and two differing only in
     wording. The validator compares against BOTH quote styles, because an
     earlier pass grepped only single-quoted `what:` and missed 93 double-quoted
     entries, which is how a de-dup pass can itself be the thing that duplicates. */

  { what: 'trunk: a trimmed version is forgotten, so an old common ancestor reads as unrelated',
    find: '        rememberSeenVid(planVersions[i].vid);   // the row goes; the identity stays',
    with: '        /* forgotten */                        // the row goes; the identity stays' },

  { what: 'trunk: a fast-forward takes the plan but not the trunk\'s version ids',
    find: '          (t.log || []).forEach(e => { if (e && e.vid) rememberSeenVid(e.vid); });',
    with: '          (t.log || []).forEach(e => { if (false) rememberSeenVid(e.vid); });' },

  { what: 'trunk: a fast-forward forgets the base version it fast-forwarded from',
    find: '          if (t.base && t.base.vid) rememberSeenVid(t.base.vid);',
    with: '          if (false && t.base.vid) rememberSeenVid(t.base.vid);' },

  { what: 'trunk: the trunk keeps every SOW body, so the file grows without bound',
    find: '    const TRUNK_KEEP_SOW_BODIES = 2;              // on the newest entry only',
    with: '    const TRUNK_KEEP_SOW_BODIES = 9999;           // on the newest entry only' },

  { what: 'trunk: the byte budget is raised past any real file, so compaction never runs',
    find: '    const TRUNK_BYTE_BUDGET = 24 * 1024 * 1024;   // the file, not one entry',
    with: '    const TRUNK_BYTE_BUDGET = 24 * 1024 * 1024 * 1024;   // the file, not one entry' },

  { what: 'chart: a sub-day duration prints in days, so 4h reads as 0.5d',
    find: '      if (hrs < 8) return sign + t(hrs) + \'h\';',
    with: '      if (hrs < 0) return sign + t(hrs) + \'h\';' },

  { what: 'chart: a long duration never scales up to weeks, so a quarter prints as 60d',
    find: '      if (d < 2 * wdw) return sign + t(d) + \'d\';',
    with: '      if (d < 2 * wdw * 9999) return sign + t(d) + \'d\';' },

  { what: 'chart: an hours project measures a working day as six hours, not eight',
    find: '      const hrs = Math.abs(unit === \'hours\' ? n : unit === \'weeks\' ? n * wdw * 8 : n * 8);',
    with: '      const hrs = Math.abs(unit === \'hours\' ? n : unit === \'weeks\' ? n * wdw * 6 : n * 6);' },

  { what: 'client: a truncated AI reply is no longer repaired at a string seam',
    find: '      for (let cut = s.lastIndexOf(\'",\'); cut > 0; cut = s.lastIndexOf(\'",\', cut - 1)) {',
    with: '      for (let cut = -1; cut > 0; cut = s.lastIndexOf(\'",\', cut - 1)) {' },

  { what: 'resource load: the day-walk leveller drops its move cap and runs unbounded',
    find: '      const MOVES_MAX = 400, ITER_MAX = 20000, T0 = performance.now(), BUDGET_MS = 8000;',
    with: '      const MOVES_MAX = 0, ITER_MAX = 20000, T0 = performance.now(), BUDGET_MS = 8000;' },

  { what: 'resource load: the first-fit leveller is given no time budget at all',
    find: '      const MOVES_MAX = 600, ITER_MAX = 20000, T0 = performance.now(), BUDGET_MS = 10000;',
    with: '      const MOVES_MAX = 600, ITER_MAX = 0, T0 = performance.now(), BUDGET_MS = 10000;' },

  { what: 'client: the status report reports earned value and never what was booked',
    find: '<b>${fmtMoney(repAC)} booked to date</b>',
    with: '<b>${fmtMoney(repAC)} to date</b>' },

  { what: 'baseline: setBaseline freezes the start but never the finish',
    find: '        t.baseFinish = t.finishDate ? new Date(t.finishDate) : null;',
    with: '        t.baseFinish = null;' },

  { what: 'baseline: clearing the baseline leaves every finish reference behind',
    find: '      tasks.forEach(t => { t.baseStart = null; t.baseFinish = null; t.baseTe = null; t.baseUnits = null; t.baseCost = null; });',
    with: '      tasks.forEach(t => { t.baseStart = null; t.baseTe = null; t.baseUnits = null; t.baseCost = null; });' },

  { what: 'baseline: the committed feature set is never captured, so scope drift has no reference',
    find: '      reqsBaseline = {\n        at: baselineDate,',
    with: '      reqsBaseline = null && {\n        at: baselineDate,' },

  { what: 'trunk: every version reports itself pinned, so the chain can never be tidied',
    find: '      if ((coLog || []).some(c => c.fromV === v.v || c.toV === v.v)) return true;',
    with: '      if (true) return true;' },

  { what: 'trunk: tidying ignores pinning and deletes the versions a document depends on',
    find: '        if (versionIsPinned(planVersions[i])) { i++; continue; }',
    with: '        if (false) { i++; continue; }' },

  { what: 'trunk: tidying is free to delete the newest version as well as the oldest',
    find: '      for (let i = 1; i < planVersions.length - 1 && planVersions.length > VERSION_CAP; ) {',
    with: '      for (let i = 1; i < planVersions.length - 0 && planVersions.length > VERSION_CAP; ) {' },

  { what: 'form: the owner box has no datalist behind it, so every name is typed from memory',
    find: '            <datalist id="ownerList"></datalist>',
    with: '            <datalist id="ownerListGone"></datalist>' },

  { what: 'form: the RAID owner box stops pointing at the suggestion list',
    find: '<input id="rOwner" type="text" list="ownerList" placeholder="start typing a name…" autocomplete="off" />',
    with: '<input id="rOwner" type="text" placeholder="start typing a name…" autocomplete="off" />' },

  { what: 'form: the owner suggestions are built from nobody on the plan or the roster',
    find: '      const names = new Set([...tasks.map(t => (t.owner || \'\').trim()).filter(Boolean), ...Object.keys(resources)]);',
    with: '      const names = new Set();' },

  { what: 'form: Status goes back to a free-text box in the RAID editor',
    find: '              <div><label for="rStatus">Status</label><select id="rStatus"></select></div>',
    with: '              <div><label for="rStatus">Status</label><input id="rStatus" type="text" /></div>' },

  { what: 'form: nothing next to Probability and Impact says they are a 1-5 judgement',
    find: '<p class="help-text" id="rScaleHint" style="margin:0 0 0.75rem">Probability and impact are a 1–5',
    with: '<p class="help-text" id="rScaleHint" style="margin:0 0 0.75rem">Probability and impact are a' },

  { what: 'form: the probability box accepts a score outside the scale it is labelled with',
    find: '<input id="rProb" type="number" min="1" max="5" value="3" oninput="raidScoreSync()" />',
    with: '<input id="rProb" type="number" min="1" max="50" value="3" oninput="raidScoreSync()" />' },

  { what: 'navigation: starting a trunk reaches for the open picker, which can only choose a file that exists',
    find: '          ? await showSaveFilePicker({ suggestedName: safeName() + \'-team-trunk.json\', types: kind })',
    with: '          ? (await showOpenFilePicker({ types: kind }))[0]' },

  { what: 'navigation: the save picker offers no file name, so a trunk has to be named from nothing',
    find: 'suggestedName: safeName() + \'-team-trunk.json\', types: kind })',
    with: 'types: kind })' },

  { what: 'navigation: joining a trunk opens the save picker and can flatten the team history',
    find: '          : (await showOpenFilePicker({ types: kind }))[0];',
    with: '          : await showSaveFilePicker({ suggestedName: \'trunk.json\', types: kind });' },

  { what: 'ledger: a company still named by a roster row can be deleted',
    find: '      if (u.total) return u;',
    with: '      if (false) return u;' },

  { what: 'ledger: renaming a company moves the id and leaves the roster showing the old name',
    find: '      Object.keys(resources).forEach(n => { if (resources[n].orgId === id) resources[n].org = nm; });',
    with: '      /* mutant: the label is left behind */' },

  { what: 'ledger: a company can be renamed onto a name already on the list',
    find: '      if (lib.some(o => o.id !== id && String(o.name || \'\').trim().toLowerCase() === nm.toLowerCase()))\n        return false;',
    with: '      if (false)\n        return false;' },

  { what: 'ledger: merging two companies does not repoint the roster rows onto the survivor',
    find: '        if (resources[n].orgId === fromId) { resources[n].orgId = toId; resources[n].org = to.name; moved++; }',
    with: '        if (false) { resources[n].orgId = toId; resources[n].org = to.name; moved++; }' },

  { what: 'ledger: a merged-away company stays on the list it was merged out of',
    find: '      saveOrgLib(loadOrgLib().filter(o => o.id !== fromId));',
    with: '      saveOrgLib(loadOrgLib());' },

  { what: 'ledger: a company set on the roster is not counted as used, so deleting it looks safe',
    find: '      const names = Object.keys(resources).filter(n => (resources[n] || {}).orgId === key);',
    with: '      const names = [];' },

  { what: 'bank: an archived row carries no owning company, so the by-company split has nothing to group on',
    find: '          org: orgOf(t.owner), orgId: orgIdOf(t.owner),',
    with: '          org: \'\', orgId: \'\',' },

  { what: 'bank: an archived row lists no participants, so nothing downstream can name who did the work',
    find: '          people: taskParticipants(t).map(pr => ({ n: pr.name, u: Number(pr.units) || 0,',
    with: '          people: [].map(pr => ({ n: pr.name, u: Number(pr.units) || 0,' },

  { what: 'bank: only the owner’s company is archived, so joint work with a partner credits one firm',
    find: '          orgs: [...new Set(taskParticipants(t).map(pr => orgOf(pr.name)).filter(Boolean))],',
    with: '          orgs: [orgOf(t.owner)].filter(Boolean),' },

  { what: 'bank: the calibration median goes back to the upper-middle value, biasing every quote upward',
    find: '      const medianOf = sorted => sorted.length % 2\n        ? sorted[(sorted.length - 1) / 2]\n        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;',
    with: '      const medianOf = sorted => sorted[Math.floor(sorted.length / 2)];' },

  { what: 'bank: a company needs eight records before it is reported, so a real partner never appears',
    find: '    const ORG_MIN_N = 3;',
    with: '    const ORG_MIN_N = 8;' },

  { what: 'bank: one record is enough to report a work-type median, so n=1 reads as calibration',
    find: '    const TAX_MIN_N = 5;',
    with: '    const TAX_MIN_N = 1;' },

  { what: 'undo: the undo button stays live on an empty history',
    find: '      if (ub) ub.disabled = !undoStack.length;',
    with: '      if (ub) ub.disabled = false;' },

  { what: 'undo: the history grows past its stated cap',
    find: '        if (undoStack.length > 60) undoStack.shift();',
    with: '        if (undoStack.length > 6000) undoStack.shift();' },

  { what: 'undo: an undo no longer clears the redo branch, so redo replays a plan that never existed',
    find: '        redoStack = [];',
    with: '        /* mutant: the abandoned branch is kept */' },

  { what: 'undo: undoing past the start of the session is allowed and empties the plan',
    find: '      if (!undoStack.length) return;',
    with: '      if (false) return;' },

  { what: 'revenue: the deposit is dropped, so a 25% up-front payment never reaches the curve',
    find: '      const dep = Math.max(0, Math.min(100, Math.round(Number(x && x.deposit) || 0)));',
    with: '      const dep = 0;' },

  { what: 'revenue: milestone billing ignores the terms, so every checkpoint is paid on the day it lands',
    find: '        const bill = (marks[i] === Infinity ? f : marks[i]) + T.days * DAY;',
    with: '        const bill = (marks[i] === Infinity ? f : marks[i]);' },

  { what: 'revenue: the tail after the last checkpoint bills at the start of the work, not its finish',
    find: '      return out.length ? out : [{ s: f + T.days * DAY, f: f + T.days * DAY + DAY, c: c }];',
    with: '      return out.length ? out : [{ s: s, f: s + DAY, c: c }];' },

  { what: 'export: the billing CSV total row states a cost that is not the sum of its own rows',
    find: '      rows.push([\'TOTAL\', \'\', \'\', \'\', \'\', d.totDays.toFixed(2), \'\', \'\', d.totCost.toFixed(0), d.totBill.toFixed(0)]);',
    with: '      rows.push([\'TOTAL\', \'\', \'\', \'\', \'\', d.totDays.toFixed(2), \'\', \'\', (d.totCost * 0.9).toFixed(0), d.totBill.toFixed(0)]);' },

  { what: 'export: fixed costs are dropped from the billing CSV but still counted in its total',
    find: '      if (d.fixedTotal) rows.push([\'Fixed costs (licenses, travel…)\', \'billed\', \'\', \'\', \'\', \'\', \'\', \'\', d.fixedTotal.toFixed(0), d.fixedTotal.toFixed(0)]);',
    with: '      if (false) rows.push([]);' },

  { what: 'cash: net terms on the cost side shift the wrong way, so paying later looks worse',
    find: '      if (T.kind === \'none\') return [{ s: s, f: f, c: c }];',
    with: '      if (T.kind === \'none\') return [{ s: s, f: f, c: c * 1.1 }];' },

  { what: 'SOW: the document prints unnumbered headings, so nothing can be cross-referenced',
    find: '        `<h2 style="font-size:16px;margin:16px 0 6px">${i + 1}. ${s.title}</h2>${s.body}`).join(\'\');',
    with: '        `<h2 style="font-size:16px;margin:16px 0 6px">${s.title}</h2>${s.body}`).join(\'\');' },

  { what: 'SOW: a reference to an excluded section prints §undefined on the contract',
    find: '        numOf[k] ? \'§\' + numOf[k] : (named[k] || \'the relevant section\'));',
    with: '        \'§\' + numOf[k]);' },

  { what: 'SOW: the chosen section order is ignored, so reordering changes nothing in the document',
    find: '        const ia = ord.indexOf(a.key), ib = ord.indexOf(b.key);\n        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);',
    with: '        return 0;' },

  { what: 'SOW: Reset order leaves the customised order in place',
    find: '    function sowResetOrder() { delete pricing.sowOrder; saveLocal(); renderSowSectionPicker(); }',
    with: '    function sowResetOrder() { saveLocal(); renderSowSectionPicker(); }' },

  { what: 'SOW: moving a section copies it instead of moving it, so the document gains a duplicate',
    find: '      ord.splice(j, 0, ord.splice(i, 1)[0]);',
    with: '      ord.splice(j, 0, ord[i]);' },

  { what: 'SOW: "include every section" leaves one switched off',
    find: '    function sowAllSections() { pricing.sowOff = []; saveLocal(); renderSowSectionPicker(); }',
    with: '    function sowAllSections() { pricing.sowOff = [\'commercial\']; saveLocal(); renderSowSectionPicker(); }' },

  { what: 'SOW: an excluded section prints anyway, so the picker decides nothing',
    find: '      const add = (key, title, body) => { if (body && sowWants(key)) secs.push({ key, title, body }); };',
    with: '      const add = (key, title, body) => { if (body) secs.push({ key, title, body }); };' },


  /* ═══ A REPLACED PLAN AND THE REQUIREMENTS THAT OUTLIVED IT ═══════════════
     Reported as "i redid the whole plan but it kept all the same user stories
     and acceptance criteria from the old list" — ninety-four stories tracing to
     activities that applyAIPlan had just re-issued from id 1, and a scope
     readout still certifying them as "exactly the set committed". */

  { what: 'client: a replaced plan keeps its old feature-set baseline, so the scope readout certifies activities that no longer exist',
    find: "        if (mode === 'replace') reqsBaseline = null;",
    with: "        if (false) reqsBaseline = null;" },

  { what: 'client: a replaced plan carries its stale stories forward without asking, so every trace breaks in silence',
    find: "            && !(alsoStories && alsoStories.checked)) {",
    with: "            && !(alsoStories && alsoStories.checked) && false) {" },

  { what: 'client: choosing to discard the stale stories after a replace keeps them anyway',
    find: "          if (drop) { reqs = null; }",
    with: "          if (false) { reqs = null; }" },


  /* ═══ THE PULL/PUSH DEADLOCK ═══════════════════════════════════════════════
     Diverged with nothing to take: the pull found no content of theirs missing,
     said so, told the reader to push — and returned without adopting the trunk's
     version id, so the push it asked for was refused with "Pull first" and the
     pull that followed repeated the advice. Days of it, and no check had built
     the state: two chains differing in IDS while agreeing on every FIELD. */

  { what: "trunk: a pull with nothing to take leaves the histories divergent, so the push it asks for is refused",
    /* RE-ANCHORED onto the corrected repair. The first cut adopted into the live
       chain, which made an older id the tip and had the copy reading itself
       three versions behind its own pushed work; it remembers now, which records
       the id without claiming a position it never had. */
    find: "            (t.log || []).forEach(e => { if (e && e.vid) { rememberSeenVid(e.vid); took++; } });",
    with: "            (t.log || []).forEach(e => { if (false) { rememberSeenVid(e.vid); took++; } });" },

];

/* Filtered AFTER the array is written, never inside it, so the anchor audit and
   the "N of M" arithmetic below both speak about the run that actually
   happened. A filtered run says so in its own summary rather than reading as a
   clean full pass. */
/* ═══ ONLY THE MUTANTS THIS COMMIT COULD POSSIBLY HAVE BROKEN ═══════════════
   The full set is the right thing to run when there is a machine that can hold
   it. At the moment somebody is about to push, it is the wrong shape: a mutant
   whose anchor sits four thousand lines from anything the commit touched cannot
   have changed verdict, and paying for it is why the gate stopped being run at
   all — which is worse than any coverage it buys.

   --changed [ref] keeps the mutants whose anchor text falls inside a line range
   the diff touched, plus a margin either side, since an edit just above a guard
   can change what that guard sees. Everything else is reported as DEFERRED by
   name and count, never silently dropped: a run that quietly narrowed itself
   reads exactly like a run that passed.

   This is a PRE-PUSH tool and it says so in its own output. It cannot see a
   change that breaks a distant identity — moving a shared helper, renaming
   something with far-away callers — so it narrows what is checked, and the full
   sweep is still what proves the suite. */
const CHANGED_AT = process.argv.indexOf('--changed');
const CHANGED = CHANGED_AT >= 0;
const CHANGED_REF = CHANGED ? (process.argv[CHANGED_AT + 1] && !process.argv[CHANGED_AT + 1].startsWith('-')
  ? process.argv[CHANGED_AT + 1] : 'HEAD') : null;
const CHANGED_MARGIN = 40;   // lines either side of a hunk

function changedLineRanges(ref) {
  const { execSync } = require('child_process');
  let diff = '';
  try {
    diff = execSync('git diff -U0 ' + ref + ' -- ' + PRODUCT,
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { return null; }          // not a repo, or the ref is unknown
  const ranges = [];
  const re = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let m;
  while ((m = re.exec(diff))) {
    const start = +m[1], len = (m[2] == null ? 1 : +m[2]);
    if (len === 0) ranges.push([start - CHANGED_MARGIN, start + CHANGED_MARGIN]);
    else ranges.push([start - CHANGED_MARGIN, start + len + CHANGED_MARGIN]);
  }
  return ranges;
}
/* The anchor's line in the CURRENT file. Anchors are required to match exactly
   once, which is what makes this a lookup rather than a guess. */
function anchorLine(src, find) {
  const at = src.indexOf(find);
  if (at < 0) return -1;
  return src.slice(0, at).split('\n').length;
}

let DEFERRED = [];
const SELECTED = (() => {
  let set = ONLY.length
    ? MUTANTS.filter(m => ONLY.some(o => m.what.toLowerCase().indexOf(o.toLowerCase()) >= 0))
    : MUTANTS;
  if (!CHANGED) return set;
  const ranges = changedLineRanges(CHANGED_REF);
  if (ranges == null) {
    console.log('--changed: could not read a diff against ' + CHANGED_REF + ', so NOTHING was narrowed '
      + 'and the full set runs.');
    return set;
  }
  if (!ranges.length) {
    console.log('--changed: ' + PRODUCT + ' is identical to ' + CHANGED_REF + ' — no mutant can have '
      + 'changed verdict, so none were run.');
    return [];
  }
  const inScope = m => [].concat(m.find).some(f => {
    const ln = anchorLine(SRC, f);
    return ln > 0 && ranges.some(([a, b]) => ln >= a && ln <= b);
  });
  const keep = set.filter(inScope);
  DEFERRED = set.filter(m => !inScope(m));
  console.log('--changed ' + CHANGED_REF + ': ' + ranges.length + ' hunk(s) in ' + PRODUCT
    + ' → ' + keep.length + ' mutant(s) in scope, ' + DEFERRED.length + ' DEFERRED (not run, not passed).');
  return keep;
})();

/* harness-meta.js is deliberately NOT in this list. It reads the CHECK files and
   resolves the names they call against the loaded app, so a mutant that changes
   an identity in the product tells it nothing — it would add five seconds to
   each of two hundred-odd runs and never once be the one to go red. Its
   own ability to fail is proven differently and better: it plants both defects
   it hunts into synthetic files on every run and requires itself to name them,
   so that proof happens on every commit rather than only under FULL=1. */
/* ═══ EVERY SWEEP, NOT A LIST SOMEBODY REMEMBERED TO EXTEND ════════════════
   This was a hardcoded array of twenty files. The commit gate globs
   tests/*sweep*.js and therefore runs twenty-two, so two sweeps were in the
   gate and invisible to the engine — and a check the engine never runs cannot
   kill a mutant, which means SURVIVED meant "none of these twenty noticed"
   while the output said "nothing in the suite noticed".

   That is not a small difference. It was found the honest way: five survivors
   from the full run were guarded by a new sweep, the five were re-run, and all
   five survived again — because the file that guards them was not on the list.
   A list maintained by hand drifts the moment somebody adds a file, and the
   drift is silent and flatters the result.

   So the list is DERIVED, the same way the gate derives its own, with the
   tuned order kept in front: the entries below are ordered by how often they
   are the killer, which is worth preserving, and anything on disk that is not
   named here is appended rather than dropped. New sweep, covered that day. */
const ORDERED = ['run-test-plan.js', 'golden-reference.js', 'contradiction-sweep.js',
     'schedule-sweep.js', 'drawn-surfaces-sweep.js', 'pricing-sweep.js',
     'resourcing-sweep.js', 'persistence-sweep.js', 'export-sweep.js', 'undo-sweep.js',
     'baseline-sweep.js', 'cross-surface-sweep.js',
     'client-facing-sweep.js', 'dialog-sweep.js', 'chart-reconciliation-sweep.js',
     'bank-sweep.js', 'corrupt-file-sweep.js', 'dynamic-prose-sweep.js', 'navigation-sweep.js',
     'error-boundary-sweep.js', 'revenue-sweep.js'];
const ON_DISK = (() => {
  try { return fs.readdirSync(__dirname).filter(f => /sweep.*\.js$/.test(f)); }
  catch (e) { return []; }
})();
const CHECKS = QUICK ? ['run-test-plan.js']
  : ORDERED.filter(f => f === 'run-test-plan.js' || f === 'golden-reference.js' || ON_DISK.indexOf(f) >= 0)
      .concat(ON_DISK.filter(f => ORDERED.indexOf(f) < 0));

/* Which check is EXPECTED to notice. This is a running order, not a shortcut:
   if the named check does not go red the mutant still walks every other one, so
   a genuine hole is still found and still reported by name. It exists because
   the naive order made this file unfinishable — a mutant caught by the last of
   fourteen checks costs ninety seconds, and twenty-six of those exceeded ten
   minutes and were killed before ever printing a verdict. A check nobody can
   afford to run is a check that does not run. */
const LIKELY = {
  /* ── families added from OBSERVED catches, not from guessing ─────────────
     97 of the 340 mutants matched nothing here, so each walked the whole check
     list before its killer — around twenty browser launches to learn something
     the engine had already printed on a previous run. Every entry below was
     read off an actual "→ <sweep>" line from a run in this session.

     A wrong entry costs ONE extra check and can never change a verdict: if the
     named check does not go red the mutant still walks all the others. That is
     what makes it safe to seed this by hand. The persistent killer map above
     supersedes anything here the moment a mutant is judged for real. */
  'SOW:': 'client-facing-sweep.js', 'NFR:': 'client-facing-sweep.js',
  'week lint:': 'client-facing-sweep.js', 'audience:': 'client-facing-sweep.js',
  'ledger:': 'resourcing-sweep.js', 'price gap:': 'resourcing-sweep.js',
  'timesheet:': 'resourcing-sweep.js',
  'sync guide:': 'dialog-sweep.js', 'editor:': 'dialog-sweep.js', 'chip:': 'dialog-sweep.js',
  'io map:': 'cross-surface-sweep.js',

  'billing CSV': 'export-sweep.js', 'Jira CSV': 'export-sweep.js',
  'save/load': 'persistence-sweep.js', 'undo:': 'undo-sweep.js',
  'baseline:': 'baseline-sweep.js', 'change order:': 'baseline-sweep.js',
  'criticality': 'drawn-surfaces-sweep.js', 'resource load': 'resourcing-sweep.js',
  'margin': 'pricing-sweep.js', 'wizard:': 'dialog-sweep.js',
  'budget bar:': 'chart-reconciliation-sweep.js', 'catch-up:': 'chart-reconciliation-sweep.js',
  'test plan:': 'run-test-plan.js', 'baseline history:': 'baseline-sweep.js',
  'bank:': 'bank-sweep.js', 'handoff:': 'bank-sweep.js', 'curve:': 'navigation-sweep.js',
  'drill-in:': 'chart-reconciliation-sweep.js', 'backup:': 'persistence-sweep.js', 'accrual:': 'chart-reconciliation-sweep.js', 'cash:': 'chart-reconciliation-sweep.js', 'readout:': 'contradiction-sweep.js',
  'blocked tab:': 'dialog-sweep.js', 'changes panel:': 'drawn-surfaces-sweep.js',
  'corrupt file:': 'corrupt-file-sweep.js', 'ring:': 'drawn-surfaces-sweep.js',
  'envelope:': 'chart-reconciliation-sweep.js', 'scope:': 'chart-reconciliation-sweep.js',
  'form:': 'drawn-surfaces-sweep.js', 'drill-in:': 'chart-reconciliation-sweep.js',
  'prose:': 'dynamic-prose-sweep.js', 'heatmap:': 'resourcing-sweep.js',
  'navigation:': 'navigation-sweep.js', 'worklist:': 'navigation-sweep.js',
  'boundary:': 'error-boundary-sweep.js', 'revenue:': 'revenue-sweep.js',
  'chart:': 'drawn-surfaces-sweep.js', 'check-off:': 'baseline-sweep.js',
  'reference:': 'golden-reference.js', 'client:': 'client-facing-sweep.js',
  'card:': 'cross-surface-sweep.js', 'network:': 'schedule-sweep.js',
  'editor:': 'task-editor-sweep.js',
  'criteria:': 'ai-boundary-sweep.js', 'effort:': 'resourcing-sweep.js', 'bank:': 'bank-sweep.js', 'handoff:': 'bank-sweep.js', 'curve:': 'navigation-sweep.js',
  /* the four families the never-fired batch introduced — each read off its
     verified dry-run catch, like every other entry here */
  'portfolio:': 'portfolio-sweep.js', 'trunk:': 'trunk-sweep.js',
  'three-person sync:': 'three-people-sweep.js', 'pricing rate:': 'pricing-sweep.js',
  'export:': 'export-sweep.js',
  'drill-in:': 'chart-reconciliation-sweep.js', 'backup:': 'persistence-sweep.js', 'accrual:': 'chart-reconciliation-sweep.js', 'cash:': 'chart-reconciliation-sweep.js'
};
/* ═══ WHAT ACTUALLY KILLED THIS MUTANT LAST TIME ════════════════════════════
   judge() walks the checks until one goes red, so the cost of a mutant is
   however many checks it takes to reach its killer. LIKELY guesses that from
   keywords in the mutant's own description — a decent heuristic written by
   hand, and wrong often enough that a caught mutant still averaged several
   browser launches.

   But the engine has always KNOWN the true answer: it prints "→ dialog-sweep.js"
   for every catch, writes it to the journal, and then throws it away at the
   start of the next run. Reading it back turns most mutants into a single check.

   MERGED, never replaced: a filtered run only knows about the mutants it ran,
   and overwriting would erase the rest of the map. Keyed by the mutant's own
   description, which is already required to be unique.

   This is an ORDERING hint and nothing more. If the remembered killer does not
   go red, the mutant still walks every other check, so a stale entry costs one
   extra run and can never turn a genuine hole into a false pass. */
const KILLERS_PATH = path.join(__dirname, '.mutation-killers.json');
const KILLERS = (() => {
  try { return JSON.parse(fs.readFileSync(KILLERS_PATH, 'utf8')) || {}; } catch (e) { return {}; }
})();
/* BANKED AS IT GOES, not at the end. Both runs this file lost were killed
   mid-flight — one by a bad diagnosis, one by the environment reclaiming a long
   background job — and because the map was written only on completion, four
   hours of judging taught it nothing. Writing after each verdict makes a killed
   run leave the next one faster, which is the difference between an ordering
   trick and a run that can actually finish here. */
function rememberOne(r) {
  if (!r || r.skipped) return;
  const was = KILLERS[r.m.what];
  if (r.by) { if (was === r.by) return; KILLERS[r.m.what] = r.by; }
  else if (r.survived) { if (!was) return; delete KILLERS[r.m.what]; }
  else return;
  try { fs.writeFileSync(KILLERS_PATH, JSON.stringify(KILLERS, null, 1)); } catch (e) {}
}
function rememberKillers(results) {
  let n = 0;
  (results || []).filter(Boolean).forEach(r => {
    if (!r.by || r.skipped) return;
    if (KILLERS[r.m.what] !== r.by) { KILLERS[r.m.what] = r.by; n++; }
  });
  // a mutant that SURVIVED has no killer; drop any stale entry so the next run
  // does not keep paying for a check that no longer catches it
  (results || []).filter(Boolean).forEach(r => {
    if (r.survived && KILLERS[r.m.what]) { delete KILLERS[r.m.what]; n++; }
  });
  if (!n) return 0;
  try { fs.writeFileSync(KILLERS_PATH, JSON.stringify(KILLERS, null, 1)); } catch (e) {}
  return n;
}
const orderFor = m => {
  const hit = Object.keys(LIKELY).find(k => m.what.indexOf(k) === 0 || m.what.indexOf(k) >= 0);
  // what killed it last time beats what the keyword map guesses
  const remembered = KILLERS[m.what];
  const first = (remembered && CHECKS.indexOf(remembered) >= 0) ? remembered : (hit ? LIKELY[hit] : null);
  return first ? [first].concat(CHECKS.filter(c => c !== first)) : CHECKS.slice();
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr-mut-'));

/* Node's own failure modes, not a check's. A sweep reports findings as text
   or JSON; it never reports them as a module-resolution error. */
const CRASH_RE = /\b(ENOENT|MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError)\b/;
function runAsync(script, appFile) {
  return new Promise(resolve => {
    const ch = spawn(process.execPath, [path.join(__dirname, script)],
      { cwd: ROOT, env: Object.assign({}, process.env, { APP_FILE: appFile }), stdio: 'pipe' });
    let out = '';
    ch.stdout.on('data', d => out += d);
    ch.stderr.on('data', d => out += d);
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 180000);
    ch.on('close', code => { clearTimeout(t); resolve(code === 0 ? null : (out.trim() || 'exited non-zero')); });
  });
}

/* One mutant may need more than one edit. A defect is not always one line: the
   wizard's layout regression was a flex container and a shrink rule, and either
   half alone leaves a page that still fits, so a single-edit mutant would
   SURVIVE and be reported as a hole in the sweep that isn't one. `find`/`with`
   therefore accept arrays, applied in order, each still required to match
   exactly once — the anchor check is the whole reason a mutant can be trusted
   to have applied at all. */
async function judge(m, i) {
  const finds = [].concat(m.find), withs = [].concat(m.with);
  if (finds.length !== withs.length) return { m, skipped: true,
    why: 'it lists ' + finds.length + ' anchor(s) and ' + withs.length + ' replacement(s)' };
  let src = SRC;
  for (let k = 0; k < finds.length; k++) {
    const n = src.split(finds[k]).length - 1;
    if (n !== 1) return { m, skipped: true, why: 'anchor ' + (k + 1) + ' of ' + finds.length
      + ' matches ' + n + ' times in the source, so this mutant cannot be trusted to have applied' };
    /* split/join, NOT String.replace: a replacement is LITERAL text here, and
       replace() interprets $-patterns in it — a mutant whose replacement was
       `return '$';` had its $' expanded to the entire rest of the file, which
       broke the build's script wholesale and took the run down as a harness
       failure in whichever check happened to be walking it. The anchor count
       above already speaks split's dialect; now the application does too. */
    src = src.split(finds[k]).join(withs[k]);
  }
  const file = path.join(tmp, 'mutant-' + i + '.html');
  fs.writeFileSync(file, src);
  for (const c of orderFor(m)) {
    const out = await runAsync(c, file);
    /* The failing OUTPUT, not only the fact of failure. Which check went red
       says a file is guarding this identity; which ASSERTION went red says
       which sentence in it is. Every one of these runs already produced the
       text and it was being thrown away — the journal below turns 28 minutes
       of work that was already happening into a map of what is actually
       proven. */
    /* A SWEEP THAT CANNOT START IS NOT A SWEEP THAT CAUGHT SOMETHING, and from
       here the two are identical: both are a non-zero exit. One file in this
       directory kept a hardcoded path to the product's old name after the repo
       was reorganised, so it threw ENOENT before its first assertion — and
       because it sits second-to-last in the running order, every mutant that
       would have SURVIVED walked the whole list, hit the crash, and was
       reported CAUGHT by a check that never executed. A two-hour run came back
       clean and proved nothing.

       A Node stack trace is unambiguous: no sweep reports a finding that way.
       It aborts the WHOLE run rather than downgrading the one mutant, because a
       broken check makes every other verdict in the run untrustworthy too. */
    if (out && CRASH_RE.test(out)) {
      console.error('\nHARNESS FAILURE - ' + c + ' could not run at all:\n'
        + String(out).split('\n').slice(0, 6).map(l => '    ' + l).join('\n')
        + '\n\n  Every mutant reaching this check would be reported CAUGHT by a check that\n'
        + '  never executed, so the run is stopped. Fix ' + c + ' and start again.');
      process.exit(3);
    }
    if (out) return { m, by: c, findings: assertionsIn(out) };
  }
  return { m, survived: true };
}
/* The assertion TEXTS a red run printed. The sweeps report findings as strings
   inside a JSON array, and every one of them is a sentence somebody wrote — so
   the sentences are the identifiers. Truncated at a length that is still unique
   in practice but short enough to survive a check appending a computed number
   to its own message, which most of them do. */
function assertionsIn(out) {
  const hits = [];
  const re = /"((?:[^"\\]|\\.){20,})"/g;
  let m2;
  while ((m2 = re.exec(out))) {
    const t = m2[1].replace(/\\"/g, '"');
    if (/ :: | — |^[A-Z][a-z]/.test(t)) hits.push(t.slice(0, 160));
  }
  return [...new Set(hits)];
}

(async () => {
  /* Mutants are independent, so they run several at a time. The cap is small on
     purpose: each one launches a browser, and oversubscribing turns a fast run
     into a slow one that also reports flaky timeouts as holes. */
  const LANES = Math.max(1, Math.min(4, (os.cpus() || []).length - 2 || 2));
  if (ONLY.length && !SELECTED.length) {
    console.log('no mutant matches ' + JSON.stringify(ONLY) + ' — nothing was run, and nothing is proven');
    process.exitCode = 2; return;
  }
  /* ═══ IS THE PRODUCT GREEN BEFORE WE START? ═══════════════════════════════
     A mutant is judged CAUGHT when a check goes red against it. That inference
     only holds if the check was GREEN against the unmutated product — otherwise
     every mutant is "caught" by a failure that was already there, and the run
     reports a clean sheet on a broken build. Planting one real defect and
     watching two unrelated mutants both come back CAUGHT is what showed this.

     The full gate runs every sweep before reaching this file, so it has already
     established the baseline. A --changed run used on its own — the pre-push
     case, the whole reason that flag exists — has no such guarantee, so it
     establishes it here: the distinct checks the in-scope mutants will actually
     use, run once against the pristine source. Usually one sweep, a few seconds.
     Cheap enough to always do, and without it the fast path is not trustworthy
     enough to be worth having. */
  if (CHANGED && SELECTED.length) {
    const need = [...new Set(SELECTED.map(m => orderFor(m)[0]))];
    const base = path.join(tmp, 'baseline.html');
    fs.writeFileSync(base, SRC);
    for (const c of need) {
      const out = await runAsync(c, base);
      if (!out) continue;
      console.error('\nTHE PRODUCT IS ALREADY FAILING ' + c + ' — before any mutant was applied:\n'
        + String(out).split('\n').filter(Boolean).slice(0, 8).map(l => '    ' + l).join('\n')
        + '\n\n  Every mutant judged against this build would be reported CAUGHT by a failure\n'
        + '  that is already there, so the run would show a clean sheet on a broken product.\n'
        + '  Fix the finding above, then run again.');
      fs.rmSync(tmp, { recursive: true, force: true });
      process.exit(4);
    }
    console.log('  baseline: ' + need.length + ' check(s) green on the unmutated product');
  }

  const results = new Array(SELECTED.length);
  let next = 0, done = 0;
  const lane = async () => {
    while (true) {
      const i = next++;
      if (i >= SELECTED.length) return;
      results[i] = await judge(SELECTED[i], i);
      rememberOne(results[i]);
      done++;
      if (process.stderr.isTTY) process.stderr.write('\r  ' + done + '/' + SELECTED.length + ' judged   ');
    }
  };
  await Promise.all(Array.from({ length: LANES }, lane));
  if (process.stderr.isTTY) process.stderr.write('\r');

  /* SURVIVED and SKIPPED are different findings and were reported as one number.
     A survivor says a region of the PRODUCT is unguarded. A skip says this FILE
     is stale — its anchor no longer matches, usually because the code it aimed at
     was edited — and the region may be perfectly well covered. Printing "1 of 38
     survived — the suite has holes there" for a stale anchor sends someone
     hunting for a hole that is not there, and worse, hides a real survivor behind
     a number that is routinely nonzero. Both still fail the run: a mutant that
     cannot apply is proving nothing and has to be repaired. */
  let survived = 0, skipped = 0;
  results.forEach(r => {
    if (r.skipped) { skipped++; console.log('SKIPPED  ' + r.m.what + '\n         ' + r.why); }
    else if (r.by) console.log('CAUGHT   ' + r.m.what + '\n         → ' + r.by);
    else { survived++; console.log('SURVIVED ' + r.m.what
      + '\n         nothing in the suite noticed. This identity is unguarded.'); }
  });

  /* ═══ EVIDENCE ACCUMULATES; IT DOES NOT GET OVERWRITTEN ═══════════════════
     This replaced the file on every run, so a four-mutant filtered run — the
     normal way anybody works here — erased the record of every catch the suite
     had ever made. The coverage probe then read four rows and announced "3 of
     1260 assertions have ever been the one that went red", which is a
     statement about the last two minutes wearing the clothes of a statement
     about the project. The 507-of-800 figure this task was written to
     re-measure had been destroyed by the next partial run after it was taken.

     An assertion that fired last week still fired. So `fired` is a union that
     only grows, keyed by the sentence, remembering when it was first and last
     seen and which mutants produced it. `runs` keeps the provenance a reader
     needs to know how much of the set that union is drawn from. The last run
     is still recorded whole, because "what happened just now" is a different
     question and both are worth having. */
  try {
    const JP = path.join(__dirname, '.mutation-journal.json');
    let prior = {};
    try { prior = JSON.parse(fs.readFileSync(JP, 'utf8')) || {}; } catch (e) {}
    const hist = (prior.history && typeof prior.history === 'object') ? prior.history : {};
    const fired = (hist.fired && typeof hist.fired === 'object') ? hist.fired : {};
    const everRan = new Set(Array.isArray(hist.everRan) ? hist.everRan : []);
    const at = new Date().toISOString();
    results.filter(Boolean).forEach(r => {
      everRan.add(r.m.what);
      (r.findings || []).forEach(f => {
        const k = String(f);
        const e = fired[k] || { first: at, last: at, byMutants: [] };
        e.last = at;
        if (e.byMutants.indexOf(r.m.what) < 0) e.byMutants.push(r.m.what);
        fired[k] = e;
      });
    });
    const runs = (Array.isArray(hist.runs) ? hist.runs : []).concat([{
      at: at, full: !ONLY.length, ran: SELECTED.length, of: MUTANTS.length,
      caught: results.filter(r => r && r.by).length }]).slice(-40);
    fs.writeFileSync(JP, JSON.stringify({
      at: at,
      full: !ONLY.length,
      ran: SELECTED.length, of: MUTANTS.length,
      rows: results.filter(Boolean).map(r => ({
        what: r.m.what, by: r.by || null, survived: !!r.survived, skipped: !!r.skipped,
        findings: r.findings || [] })),
      history: { fired: fired, everRan: [...everRan].sort(), runs: runs }
    }, null, 1));
  } catch (e) { console.log('(could not write the mutation journal: ' + (e.message || e) + ')'); }

  const learned = rememberKillers(results);
  if (learned) console.log('  killer map: ' + learned + ' entr' + (learned === 1 ? 'y' : 'ies')
    + ' updated (' + Object.keys(KILLERS).length + ' of ' + MUTANTS.length + ' mutants know their check)');

  fs.rmSync(tmp, { recursive: true, force: true });
  const parts = [];
  if (survived) parts.push(survived + ' of ' + SELECTED.length
    + ' mutants SURVIVED — those regions of the product are unguarded');
  if (skipped) parts.push(skipped + ' mutant(s) could not be applied — this FILE is stale, not the suite: '
    + 'the anchor was edited out of the product. Repair the anchor; it is proving nothing until you do');
  /* A NARROWED RUN MUST NEVER READ AS A FULL ONE. "all 340 mutants" under a
     --changed run would be the single most misleading line this file could
     print, so the deferred count rides in the summary and in the exit banner,
     not only in the header nobody scrolls back to. */
  if (CHANGED && DEFERRED.length) parts.push(DEFERRED.length + ' mutant(s) DEFERRED by --changed — they sit '
    + 'outside the lines this commit touched and were NOT run. They are not passing; they are unexamined. '
    + 'Run without --changed before trusting the suite');
  const scope = CHANGED
    ? SELECTED.length + ' of ' + MUTANTS.length + ' mutants (scoped to what changed against '
      + CHANGED_REF + ' — this is NOT a full run)'
    : ONLY.length ? SELECTED.length + ' of ' + MUTANTS.length + ' mutants (filtered by '
    + JSON.stringify(ONLY) + ' — this is NOT a full run)' : 'all ' + MUTANTS.length + ' mutants';
  console.log(parts.length ? '\n' + parts.join('.\n') + '.' + ((ONLY.length || CHANGED) ? '\nRan ' + scope + '.' : '')
    : '\n' + scope + ' were caught.');
  process.exitCode = (survived || skipped) ? 1 : 0;
})();

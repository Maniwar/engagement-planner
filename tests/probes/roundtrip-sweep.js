/* ═══════════════════════════════════════════════════════════════════════════
   WHAT DOES SAVING AND LOADING QUIETLY THROW AWAY?

   Asked after three defects in one session shipped green through 22 sweeps, a
   339-mutant engine and 1260 assertions, and the worst of them was this shape:

     hydrate() rebuilds every plan version field by field, and it did not name
     vid or pvid. So every page load, every project switch and every
     fast-forward pull erased the identity of the whole history. trunkRelation
     compares by those ids; with none it answers "behind by everything they
     have", permanently, and no pull can ever converge. Reported by use, after
     the suite had been green for weeks.

   ── WHY NOTHING CAUGHT IT ────────────────────────────────────────────────

   persistence-sweep round-trips the PLAN and checks the activities survive. It
   asks "is my plan still here", which is the right question and a different
   one. Every sweep that reads a version chain does so in a single page session,
   where the objects were never through the loader. The mutation engine plants
   defects it has a mutant for, and nobody writes a mutant for a field a mapper
   forgot to name — that is the point of forgetting it. vacuity-check proves a
   check CAN fail; this check did not exist to be vacuous.

   The family is bigger than versions: ANY save/load path that rebuilds an
   object field by field can silently drop one, and the loss is invisible until
   something downstream reads the missing field and gets undefined. There are
   several such mappers in this file.

   ── WHAT THIS ASKS ───────────────────────────────────────────────────────

   One question, mechanically, over a populated plan:

     serialize() → hydrate() → serialize() must be LOSSLESS.

   Not "similar". Every key that carried a value on the way in must carry the
   same value on the way out, at every depth. What is deliberately dropped is
   named in DROPS below with the reason, so an intentional omission is a line
   somebody wrote rather than a silence.

   This is a stronger question than "does the plan survive", and it is the one
   the identity defect would have failed instantly and loudly: 8 of 8 versions
   lost `vid`, 7 lost `pvid`.

   ── WHAT IT HAS BEEN ATTACKED WITH ───────────────────────────────────────

   VALUES, not key names, and that distinction is the whole probe. Adversarial
   review of a weaker design — one comparing key sets — found two ways the same
   family survives a key-only check, and both were then planted here:

     · `vid: x.vId || null` — a typo in the SOURCE field. The key comes back
       holding null, trunkRelation's filter(Boolean) empties again, and the
       original defect returns verbatim. Caught: "vid: v_… went in and null
       came back."
     · hydrate's task mapper drops invoicedDate, and makeTask() — an
       Object.assign over about forty-five defaults — supplies '' underneath,
       so the key IS present afterwards. Caught the same way. This is the more
       likely spelling in this file, because almost every loader here layers
       defaults; the version mapper was a bare literal, which is the only
       reason the original showed up as an absence at all.

   ── WHY IT WILL NOT CRY WOLF ─────────────────────────────────────────────

   Volatile-by-design values — a stamp that says when the file was written, a
   count derived on load — would flag on every run and get the probe turned
   off. So the comparison normalises those away by NAME, in one list, and the
   list is short enough to read. Anything not on it is a real loss.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('../_harness');
const { chromium } = requirePlaywright();
const fs = require('fs'), path = require('path');
const CRM = FIXTURE();
const QA = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'fixtures', 'qa-reference.json'), 'utf8'));

/* Deliberately not preserved, each with the reason it is not a loss. A key that
   belongs here and is not here reads as a defect, which is the right default:
   the cost of explaining an intentional drop once is a line of text, and the
   cost of not noticing an accidental one is this file's opening paragraph. */
const DROPS = {
  savedAt: 'a stamp saying when the file was written; a new one is written on every save',
  _work: 'a fingerprint recomputed from the plan on load rather than carried',
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', d => d.accept());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });

  const run = async (label, data) => {
    await page.evaluate(d => { hydrate(d); calculate(); }, data);
    await page.waitForTimeout(400);
    return page.evaluate(({ lbl, drops }) => {
      const bad = [];
      const say = x => bad.push(lbl + ' :: ' + x);

      /* A PLAN NOBODY HAS WORKED ON PROVES NOTHING. The fields most likely to be
         dropped are the ones only present once somebody has done something —
         versions, actuals, RAID outcomes — so the fixture is made to carry them
         before it is round-tripped. A probe run against an empty plan is the
         "checked nothing and said nothing" failure this directory exists for. */
      const leaves = leafTasks().filter(t => !t.isSummary && !t.milestone);
      if (leaves.length < 2) { say('this fixture has fewer than two work packages, so almost nothing below '
        + 'has a value to lose'); return { bad, out: {} }; }
      leaves[0].percentComplete = 45; leaves[0].actualEffort = 3.5;
      leaves[0].actualStart = '2026-06-01'; leaves[0].invoiced = 4200; leaves[0].invoicedDate = '2026-06-30';
      leaves[1].deadline = '2026-12-01'; leaves[1].startNoEarlier = '2026-05-04';
      calculate();
      if (typeof pushVersion === 'function') {
        pushVersion('edit', 'round trip a');
        leaves[0].name = 'ROUND TRIP RENAME';
        calculate();
        pushVersion('baseline', 'round trip b');
      }
      /* A FIELD THE FIXTURE NEVER FILLS IS A FIELD THIS CANNOT WATCH. Proved
         the hard way: a planted defect dropping a test run's `note` on load
         went unnoticed, because no fixture carries a test run with a note, and
         the probe reported "lossless" having looked at nothing there. So the
         structures that only exist once somebody has USED the product are
         seeded here — and whatever is still empty afterwards is named in the
         output rather than counted as covered. */
      const seed = t => {
        t.tcRuns = [{ at: '2026-06-02', result: 'pass', by: 'A. Rivera', note: 'ran on the staging copy' }];
        t.stories = Array.isArray(t.stories) ? t.stories : [];
      };
      seed(leaves[0]);
      if (typeof raid !== 'undefined' && Array.isArray(raid) && raid.length) {
        raid[0].outcome = 'It triggered in week 3';
        raid[0].outcomeAt = '2026-06-10';
      }
      /* ═══ AND THE ELEVEN THIS HAD NEVER LOOKED AT ═══════════════════════════
         The list below was not chosen; it was READ OFF this probe's own output.
         Every green run ended with "Not exercised by either fixture, so nothing
         under these was checked", naming eleven top-level keys — and "lossless"
         over a key that is an empty array is the same sentence as "checked
         nothing there".

         That is precisely the shape of the defect this whole probe exists for:
         hydrate rebuilt each version field by field and dropped vid and pvid,
         which nothing noticed because nothing compared a version that had one.
         Eleven more keys were sitting in that same blind spot, and each of them
         is somewhere a person's work goes — a change order, a sign-off, a
         drafted statement of work, a holiday calendar.

         Seeded with values that are DISTINGUISHABLE: no two fields share a
         value, so a mapper that copies the right shape into the wrong slot
         still fails. */
      /* SHAPED THE WAY THE PRODUCT SHAPES THEM, which is not a detail. The first
         draft of these seeds invented plausible objects — statusNarrative as a
         string, reqsBaseline stories carrying `want`, sowVersions keyed by `no`
         — and the probe dutifully reported eight losses, every one of them the
         loader correctly refusing a shape nothing ever writes. A seed that the
         application would never produce does not test the application; it tests
         the seed. Each of these is copied from the code that writes it:
         reqsBaseline from setRequirementsBaseline, sowVersions from
         sowVersionNorm, coLog from issueChangeOrder, signoffs from
         recordSignoff, statusNarrative from its own declaration. */
      const gv = n => 'RT-' + n;
      /* These three resisted the first attempt and each for its own reason,
         which is the point of naming what is not exercised rather than
         reporting a total: `holidays` is not a variable at all, it is the text
         in a form control; `collapsedIds` is a Set, so pushing to it did
         nothing; and the QA fixture simply carries no RAID entries. A seed
         that silently does not take leaves the key exactly as blind as before
         while looking like coverage. */
      const hol = document.getElementById('holidays');
      if (hol) hol.value = '2026-12-24, 2026-12-25';
      if (typeof collapsedIds !== 'undefined' && collapsedIds && collapsedIds.add && leaves[0])
        collapsedIds.add(leaves[0].parentId == null ? leaves[0].id : leaves[0].parentId);
      if (typeof raid !== 'undefined' && Array.isArray(raid) && !raid.length) {
        raid.push({ id: 1, type: 'Risk', title: gv('raid-title'), description: gv('raid-desc'),
                    probability: 4, impact: 5, owner: gv('raid-owner'), status: 'Open',
                    mitigation: gv('raid-mitigation'), taskId: leaves[0] ? leaves[0].id : null,
                    // taskId is a MIRROR of the first activity link, not an
                    // independent field — seeding one without the other asks
                    // the loader to preserve a contradiction
                    createdAt: '2026-06-07',
                    links: [{ k: 'act', id: leaves[0] ? leaves[0].id : 1 }], whys: [gv('raid-why')],
                    rootCause: gv('raid-root'), options: [], chosen: null, v: 2 });
        if (typeof nextRaidId !== 'undefined') nextRaidId = 2;
      }
      if (typeof planForkedFrom !== 'undefined' && !planForkedFrom) planForkedFrom = gv('forked-lineage');
      // { date, text } — a loader that takes only .text would still pass a
      // string seed by dropping it, so the object is what gets checked
      if (typeof statusNarrative !== 'undefined' && !statusNarrative)
        statusNarrative = { date: '2026-06-06', text: gv('narrative-week-six-on-track') };
      if (typeof sowDraft !== 'undefined' && !sowDraft) sowDraft = gv('sow-draft-body');
      if (typeof sowBaseline !== 'undefined' && !sowBaseline)
        sowBaseline = { at: '2026-06-02', price: 4242, tasks: [{ id: leaves[0] ? leaves[0].id : 1,
                          name: gv('sow-base-task'), te: 2.5, value: 1500 }] };
      if (typeof sowVersions !== 'undefined' && Array.isArray(sowVersions) && !sowVersions.length)
        sowVersions.push({ n: 1, at: '2026-06-01', ts: '09:15', label: gv('sow-label'),
                           html: '<p>' + gv('sow-body-v1') + '</p>', trimmed: 0, seeded: false,
                           cos: [{ no: gv('sow-co-no'), state: 'issued' }],
                           off: [gv('sow-section-off')], baseV: 1 });
      if (typeof coLog !== 'undefined' && Array.isArray(coLog) && !coLog.length)
        coLog.push({ no: gv('co-no'), date: '2026-06-03', scope: gv('co-scope'), detail: gv('co-detail'),
                     finishDelta: 2, priceDelta: 250, newFinish: '2026-09-01', newPrice: 41000,
                     diff: [{ kind: 're-estimated', id: leaves[0] ? leaves[0].id : 1,
                              name: gv('co-row-name'), from: 1, to: 2, priceDelta: 250, days: 0.5 }],
                     lineSum: 250, hidePrice: [gv('co-hidden-line')], rationale: gv('co-rationale'),
                     baseDate: '2026-05-30', baseFinish: '2026-08-30', basePrice: 40750,
                     amended: false, unit: 'days', legacyBasis: false, unpricedAdds: 0,
                     fromV: 1, toV: null, state: 'issued', stateAt: '2026-06-03' });
      if (typeof signoffs !== 'undefined' && Array.isArray(signoffs) && !signoffs.length)
        signoffs.push({ no: 1, at: '2026-06-04', scope: 'project', ref: gv('signoff-ref'),
                        by: gv('signoff-by'), note: gv('signoff-note'), v: 1 });
      // stories here carry ac as a list of ID STRINGS, not objects — that is
      // what the baseline records, and seeding objects invents a shape
      if (typeof reqsBaseline !== 'undefined' && !reqsBaseline)
        reqsBaseline = { at: '2026-06-05', stories: [{ id: gv('rb-story'),
                          // audience is a two-value field, not free text
                          audience: 'internal', ac: [gv('rb-ac-one'), gv('rb-ac-two')] }] };
      /* THE COUNTERS ARE DERIVED, so seed a document that is internally
         consistent rather than one the loader has to correct. nextSowNo and
         nextSignoffNo are recomputed from the highest entry on load — which is
         right, and a serialized counter that disagrees with its own content
         SHOULD be fixed rather than preserved. Leaving them at 1 beside an
         entry numbered 1 made this probe report the loader being careful as a
         loss. */
      // recomputed from the highest entry on load, so keep them consistent
      if (typeof nextSowNo !== 'undefined' && typeof sowVersions !== 'undefined')
        nextSowNo = Math.max(1, ...sowVersions.map(v => (+v.n || 0) + 1));
      if (typeof nextSignoffNo !== 'undefined' && typeof signoffs !== 'undefined')
        nextSignoffNo = Math.max(1, ...signoffs.map(x => (+x.no || 0) + 1));
      const before = JSON.parse(JSON.stringify(serialize()));
      hydrate(JSON.parse(JSON.stringify(before)));
      calculate();
      const after = JSON.parse(JSON.stringify(serialize()));

      /* Compared by PATH, so a loss is reported where it happened rather than as
         "the documents differ". Arrays are walked by index; a length change is
         itself reported and the walk stops there, because pairing element 4 of
         one with element 4 of a shorter list invents differences. */
      const losses = [];
      const walk = (a, b2, p) => {
        if (losses.length > 60) return;
        if (a === null || a === undefined) return;                 // nothing to lose
        if (Array.isArray(a)) {
          if (!Array.isArray(b2)) { losses.push({ path: p, was: 'array[' + a.length + ']', now: typeof b2 }); return; }
          if (a.length !== b2.length) { losses.push({ path: p, was: a.length + ' entries', now: b2.length + ' entries' }); return; }
          a.forEach((x, i) => walk(x, b2[i], p + '[' + i + ']'));
          return;
        }
        if (a && typeof a === 'object') {
          if (!b2 || typeof b2 !== 'object') { losses.push({ path: p, was: 'object', now: String(b2) }); return; }
          Object.keys(a).forEach(k => {
            if (drops[k]) return;
            const v = a[k];
            if (v === null || v === undefined || v === '' ) return;  // carried nothing
            if (!(k in b2)) { losses.push({ path: p + '.' + k, was: JSON.stringify(v).slice(0, 60), now: 'MISSING' }); return; }
            walk(v, b2[k], p + '.' + k);
          });
          return;
        }
        if (a !== b2) losses.push({ path: p, was: String(a).slice(0, 50), now: String(b2).slice(0, 50) });
      };
      walk(before, after, '');

      /* COVERAGE, NAMED. "Lossless" over a document whose interesting halves are
         empty is the same sentence as "checked nothing", and this file exists
         because that sentence has been believed here before. So the count of
         leaf values actually compared is reported, and every top-level key that
         held nothing is listed by name — those are the paths a future defect
         can hide in, and a person reading this can seed one. */
      let leavesCompared = 0;
      const countLeaves = v => {
        if (v === null || v === undefined || v === '') return;
        if (Array.isArray(v)) { v.forEach(countLeaves); return; }
        if (typeof v === 'object') { Object.keys(v).forEach(k => { if (!drops[k]) countLeaves(v[k]); }); return; }
        leavesCompared++;
      };
      countLeaves(before);
      const empty = Object.keys(before).filter(k => {
        const v = before[k];
        return v === null || v === undefined || v === ''
          || (Array.isArray(v) && !v.length)
          || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      });
      const out = { keysIn: Object.keys(before).length, valuesCompared: leavesCompared,
                    losses: losses.length,
                    versions: (before.planVersions || []).length,
                    notExercised: empty,
                    sample: losses.slice(0, 12) };
      if (leavesCompared < 200)
        say('only ' + leavesCompared + ' values were compared, which is too thin a document for "lossless" '
          + 'to mean much — seed the fixture or this reports a clean bill on an empty page');
      if (losses.length) {
        /* Grouped, because one forgotten field in a mapper shows up once per
           element and forty identical lines hide the second defect behind the
           first. */
        const byKey = {}, how = {};
        losses.forEach(l => { const k = l.path.replace(/\[\d+\]/g, '[]');
          byKey[k] = (byKey[k] || 0) + 1;
          if (!how[k]) how[k] = l;
        });
        out.byField = byKey;
        /* WHICH KIND OF LOSS, because the two need different fixes and the
           second is the one a weaker probe would miss. A key that does not come
           back is a mapper that forgot to name it. A key that comes back
           holding something else is a mapper that named it WRONG — a typo in
           the source field, or a default layered underneath that fills the hole
           so convincingly the key survives. This file's own loaders make the
           second the more likely: tasks go through makeTask(), which supplies
           about forty-five defaults, so a dropped field returns as '' rather
           than as an absence. Both were planted and both are caught; saying
           only "loses" about the second sends somebody hunting for a missing
           line that is right there. */
        Object.keys(byKey).sort((x, y) => byKey[y] - byKey[x]).slice(0, 8).forEach(k => {
          const l = how[k], gone = l.now === 'MISSING';
          say(gone
            ? 'saving and loading DROPS ' + k + (byKey[k] > 1 ? ' (' + byKey[k] + ' times)' : '')
              + ' — the key does not come back at all, so whatever reads it after a reload gets undefined'
            : 'saving and loading CHANGES ' + k + (byKey[k] > 1 ? ' (' + byKey[k] + ' times)' : '')
              + ': ' + l.was + ' went in and ' + l.now + ' came back. The key is still there, which is why '
              + 'a check on key names alone would call this clean — a default underneath, or a mis-spelled '
              + 'source field, fills the hole and the value is gone anyway');
        });
      }
      return { bad, out };
    }, { lbl: label, drops: DROPS });
  };

  const a = await run('QA reference', QA);
  const c = await run('Real export', CRM);
  const R = { contradictions: [].concat(a.bad, c.bad), qa: a.out, crm: c.out,
              pageErrors: errs.slice(0, 6) };
  console.log(JSON.stringify(R, null, 1));
  if (!R.contradictions.length) {
    console.log('\nsave → load → save is lossless on both fixtures — '
      + a.out.valuesCompared + ' and ' + c.out.valuesCompared + ' values compared across '
      + a.out.keysIn + ' top-level keys.');
    /* Printed on a GREEN run, on purpose. The blind spots are what a person can
       act on; a probe that only speaks when it fails never tells anybody where
       it is not looking. */
    const blind = [...new Set([].concat(a.out.notExercised || [], c.out.notExercised || []))].sort();
    if (blind.length) console.log('Not exercised by either fixture, so nothing under these was checked: '
      + blind.join(', ') + '.');
  }
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

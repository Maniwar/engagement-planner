/* ═══════════════════════════════════════════════════════════════════════════
   A SPAN IS NOT AN EFFORT, AN ALLOCATION IS NOT APPLIED TWICE, AND MONEY IN IS
   NOT MONEY OUT

   Written from the first full 340-mutant run. Five mutants survived it, and
   they are the five below: nothing in twenty-two sweeps would have noticed if
   the product started doing any of them. Three are the duration-vs-effort
   confusion #84 exists to prevent, alive in corners no check reached — which is
   precisely the shape #84 warned about, since the whole point of that work was
   that ONE number must mean ONE thing everywhere it is read, and "everywhere"
   is only as good as the places somebody looked.

   The three identities, stated as the product states them:

     TE IS A CALENDAR SPAN. The effort is te x allocation. A surface that
     reports a sum of te as "effort" is describing a different quantity from the
     one its label claims, and the two are equal only when every allocation is
     100 — which is exactly why a fixture full of 100% people cannot tell them
     apart, and why this file sets one to 20 before asking anything.

     LOGGED EFFORT IS ALREADY EFFORT. Somebody measured it. The allocation
     belongs to the PLAN, where it turns a span into expected effort; it has no
     business scaling a number that was observed. Applying it again costs a
     person at 20% four fifths of their own recorded time, and that figure is AC
     in every EVM reading, the CPI and the margin.

     ACTUAL COST IS WHAT IT COST YOU. `paid` is what the client handed over.
     Letting a receipt reach actual cost computes CPI on a mixed basis: cost on
     one side of the ratio, revenue on the other, and the answer looks like a
     project doing well. It is the number that gets reported upward, which makes
     it the worst of the five in consequence even though it is the smallest edit.

   ── THE FIXTURE HAS TO BE ABLE TO TELL THE DIFFERENCE ────────────────────
   The reason nine sweeps and forty-four hand-derived cases once passed on a
   build with the PERT weighting broken is that the reference plan's estimates
   were symmetric, so every weighted mean returned the same answer. The same
   trap is wide open here: with allocation at 100, te and effort ARE equal, and
   every assertion below would pass against a product that had confused them.

   So each block sets an allocation deliberately away from 100 and ASSERTS THAT
   THE TWO QUANTITIES NOW DIFFER before asking which one a surface used. If that
   guard ever goes red, the checks under it are proving nothing and say so
   rather than reporting green.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', d => d.accept());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'load' });
  await page.evaluate(d => { hydrate(d); calculate(); }, DATA);
  await page.waitForTimeout(500);

  const R = await page.evaluate(() => {
    const bad = [], out = {};
    const say = (a, b2) => bad.push(a + ' :: ' + b2);
    const near = (x, y, tol) => Math.abs(x - y) <= (tol == null ? 0.01 : tol);

    const subject = tasks.find(t => !t.isSummary && !t.milestone && (Number(t.te) || 0) > 0);
    if (!subject) { say('Effort basis', 'no leaf activity with an estimate — every check here is vacuous'); return { bad, out }; }
    const who = (subject.owner || '').trim();
    if (!who) { say('Effort basis', 'the subject activity has no owner, so nothing below can be attributed'); return { bad, out }; }

    const keep = { units: subject.units, attendees: subject.attendees,
      actualEffort: subject.actualEffort, paid: subject.paid, autoActualCost: subject.autoActualCost,
      actualCost: subject.actualCost };
    const restore = () => { Object.assign(subject, keep); calculate(); };

    /* ═══ 1. A SPAN IS NOT AN EFFORT ═══════════════════════════════════════ */
    /* Actuals FIRST. The bank only files a row for an activity somebody has
       logged time against — there is nothing to calibrate otherwise — so asking
       it before the logging produced "(no row)" and an assertion that read
       nothing while reporting green. */
    subject.units = 20; subject.attendees = null; subject.actualEffort = 4; subject.autoActualCost = true;
    calculate();
    const te = Number(subject.te) || 0;
    const eff = plannedEffortUnit(subject);
    out.te = Math.round(te * 1000) / 1000;
    out.effortAt20 = Math.round(eff * 1000) / 1000;
    /* THE GUARD. If these are equal the fixture cannot tell a span from an
       effort and everything below is theatre. */
    if (near(te, eff, 0.001)) {
      say('Effort basis', 'with the owner at 20% the activity\'s span (' + te + ') and its effort (' + eff
        + ') come out identical, so nothing below can distinguish them. The fixture cannot see the defect '
        + 'this file exists to catch');
    } else {
      if (!near(eff, te * 0.2, 0.02))
        say('Effort basis', 'one person at 20% on a ' + te + ' span is ' + (te * 0.2) + ' of effort and '
          + 'plannedEffortUnit says ' + eff + '. This is the conversion every other reading is built on');

      /* ── the scope panel ────────────────────────────────────────────────
         planTe is a LOCAL. It never reaches the returned object; the only
         place the number surfaces is inside the sentence the panel prints —
         "the plan holds N days of effort" — so reading d.scope.planTe gave
         undefined, the whole block skipped, and out.scopePlanTe read
         "(not exposed)" while the file reported green. An assertion that
         quietly does not run is the thing this suite exists to prevent, so it
         reads the sentence instead of the field that was never there.

         The sentence only takes that branch when NO baseline is saved, so the
         baseline is cleared for the duration and put back. Forcing the state an
         assertion needs is honest; hoping the fixture happens to be in it is
         how a check ends up proving nothing. */
      if (typeof planTruthData === 'function') {
        const leaves = leafTasks().filter(t => !t.isSummary);
        const wantEff = leaves.reduce((s, t) => s + plannedEffortUnit(t), 0);
        const wantSpan = leaves.reduce((s, t) => s + (Number(t.te) || 0), 0);
        const hadBase = (typeof hasBaseline === 'function') ? hasBaseline() : false;
        const keptBase = hadBase ? tasks.map(t => ({ t: t, b: t.baseTe, s: t.baseStart, f: t.baseFinish })) : null;
        if (hadBase) { tasks.forEach(t => { t.baseTe = null; t.baseStart = null; t.baseFinish = null; }); calculate(); }
        /* planTruthData returns { rows: [schedule, budget, scope] } — there is no
           `scope` property on it. Reading d.scope gave undefined twice over:
           once for the object, once for the sentence inside it, and the block
           skipped in silence both times. Found by printing what came back
           rather than by reading the code, which is the pattern every one of
           this session's harness bugs has followed. */
        let why = '';
        try {
          const d = planTruthData();
          const row = ((d && d.rows) || []).find(x => x && x.key === 'scope');
          why = (row && row.why) || '';
        } catch (e) { why = ''; }
        const m = String(why).replace(/<[^>]*>/g, '').match(/holds\s+([\d.,]+)/);
        const got = m ? parseFloat(m[1].replace(/,/g, '')) : null;
        out.scopeSays = got == null ? '(no sentence)' : got;
        out.scopeWantEffort = Math.round(wantEff * 10) / 10;
        out.scopeWantSpan = Math.round(wantSpan * 10) / 10;
        if (got == null)
          say('Plan truth', 'the scope panel prints no figure for what the plan holds, so the reading this '
            + 'block exists to check is not on the page: "' + String(why).slice(0, 90) + '"');
        else if (!near(wantEff, wantSpan, 0.15)) {
          if (near(got, Math.round(wantSpan * 10) / 10, 0.15))
            say('Plan truth', 'the scope panel says the plan holds ' + got + ', which is the sum of the '
              + 'SPANS. The effort is ' + (Math.round(wantEff * 10) / 10) + '. Adding spans across activities '
              + 'that run in parallel is not a quantity anybody has, and it is printed under the word "effort"');
          else if (!near(got, Math.round(wantEff * 10) / 10, 0.15))
            say('Plan truth', 'the scope panel says the plan holds ' + got + ' where the planned effort is '
              + (Math.round(wantEff * 10) / 10));
        }
        if (keptBase) { keptBase.forEach(k => { k.t.baseTe = k.b; k.t.baseStart = k.s; k.t.baseFinish = k.f; }); calculate(); }
      }

      /* the estimate bank */
      if (typeof bankRowsFromPlan === 'function') {
        const rows = bankRowsFromPlan() || [];
        /* The row is keyed `rid` = project:taskId, and the estimate it files is
           the field called `te` — which holds the EFFORT, not the span the
           product's own t.te means. The name is a trap in itself and is the
           reason to assert on the value rather than trust the label. */
        const row = rows.find(r => r && (String(r.rid || '').split(':').pop() === String(subject.id)
          || (r.name && r.name === subject.name)));
        out.bankEst = row ? row.te : '(no row)';
        if (!row) say('Estimate bank', 'the subject has logged effort and an estimate and the bank files no '
          + 'row for it at all, so nothing below is testing the bank');
        if (row) {
          const got = Number(row.te) || 0;
          if (near(got, te, 0.02) && !near(got, eff, 0.02))
            say('Estimate bank', 'the bank files ' + got + ' against this activity, which is its calendar '
              + 'SPAN. The work logged against it will be effort, so the bank would be comparing a span with '
              + 'an effort and calling the difference an estimating error — it would learn the allocation, '
              + 'not the estimate');
          else if (!near(got, eff, 0.02))
            say('Estimate bank', 'the bank files ' + got + ' where the planned effort is ' + eff);
        }
      }
    }

    /* ═══ 2. LOGGED EFFORT IS ALREADY EFFORT ══════════════════════════════ */
    /* One person, at 20%, who logged real time. Their share of what they
       measured is ALL of it — there is nobody else to share it with. */
    const share = (typeof effortShareOf === 'function') ? effortShareOf(subject, who) : null;
    out.loneShareAt20 = share;
    if (share == null) say('Effort basis', 'effortShareOf is gone — nothing splits logged time between people');
    else if (!near(share, 1, 0.001))
      say('Logged effort', 'one person is on this activity, at 20%, and they are credited with ' + share
        + ' of the time they logged. A lone participant\'s share is all of it whatever their allocation — '
        + 'the allocation is a statement about the PLAN, and this is a number somebody measured');

    /* two people, so the split is a real split rather than a degenerate one */
    /* attendees, not `participants`. taskParticipants builds its list from the
       OWNER plus t.attendees and has never read a field called participants —
       so the first version of this set a key nothing consumes, measured a lone
       owner, and reported the product for answering correctly. The assertion
       was wrong, not the split. */
    const second = Object.keys(resources || {}).find(n => n !== who) || null;
    if (!second) { out.pairShare = '(only one person in the roster)'; }
    else {
      subject.attendees = [{ name: second, units: 20 }];
      calculate();
    }
    const s1 = second ? effortShareOf(subject, who) : 0.5;
    if (second) out.pairShare = Math.round(s1 * 1000) / 1000;
    if (second && !near(s1, 0.5, 0.001))
      say('Logged effort', 'two people at equal allocations each carry half the logged time; this one '
        + 'carries ' + s1 + '. Shares are normalised against the team on the activity, not read off '
        + 'units/100 — two people at 20% each would otherwise account for a fifth of what was logged');

    /* actual cost draws on logged days ONCE */
    subject.attendees = null; subject.units = 20;
    subject.actualEffort = 4; subject.autoActualCost = true;
    calculate();
    const days = actualEffortDays(subject);
    const rate = (typeof getRate === 'function') ? getRate(who) : null;
    const cost = computedActualCost(subject);
    out.actualDays = days; out.actualCost = cost == null ? null : Math.round(cost);
    if (days == null || rate == null || cost == null) {
      say('Actual cost', 'logged effort was recorded and the cost of it could not be computed at all');
    } else if (!isClientResource(who)) {
      const want = rate * days;
      if (near(cost, want * 0.2, Math.max(1, want * 0.01)) && !near(cost, want, Math.max(1, want * 0.01)))
        say('Actual cost', 'four days were logged by somebody allocated 20% and the cost came back as '
          + Math.round(cost) + ' against a rate x days of ' + Math.round(want) + '. The allocation has been '
          + 'applied to a measurement — it belongs to the plan, where it turns a span into expected effort. '
          + 'This figure is AC in every EVM reading, the CPI and the margin');
      else if (!near(cost, want, Math.max(1, want * 0.01)))
        say('Actual cost', 'four logged days at ' + Math.round(rate) + '/day should cost '
          + Math.round(want) + ' and came back as ' + Math.round(cost));
    }

    /* ═══ 3. MONEY IN IS NOT MONEY OUT ════════════════════════════════════ */
    const before = actualCostOf(subject);
    subject.paid = (before || 1000) * 7 + 12345;      // unmistakably not the cost
    subject.paidDate = '2026-08-01';
    calculate();
    const after = actualCostOf(subject);
    out.costBeforeReceipt = Math.round(before);
    out.costAfterReceipt = Math.round(after);
    if (!near(before, after, Math.max(1, Math.abs(before) * 0.01)))
      say('Actual cost', 'recording a client RECEIPT of ' + Math.round(subject.paid) + ' changed this '
        + 'activity\'s actual cost from ' + Math.round(before) + ' to ' + Math.round(after) + '. What the '
        + 'client paid you is not what the work cost you, and actual cost is the denominator of CPI — mixing '
        + 'revenue into it computes the ratio on two different bases and makes a project look like it is '
        + 'doing well. It is the number that gets reported upward');
    if (near(after, subject.paid, 1))
      say('Actual cost', 'actual cost is now exactly the amount the client paid, so cost has been replaced '
        + 'by revenue outright');

    restore();
    return { bad, out };
  });

  R.pageErrors = errs.slice(0, 6);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if ((R.bad || []).length || errs.length) process.exitCode = 1;
})();

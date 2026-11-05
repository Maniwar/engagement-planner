/* ═══════════════════════════════════════════════════════════════════════════
   ASK BEFORE REPLACING SOMEBODY'S WORK.

   Four actions threw work away without a word. Set baseline overwrote a
   committed baseline. Generate plan, in its default mode, rebuilt every
   activity, and only asked anything after the AI had answered and the old plan
   was gone. Draft from WBS rewrote every existing story, and dropped the ones
   the AI left out. Fix with AI on the wording findings put the AI's rewrites
   straight into the stories, and the health check's Fix all N with AI put its
   plan update straight into the plan.

   What is required, each case on a fresh copy of the fixture, the AI stubbed:
   · with work to lose, the action asks first, BEFORE any AI call, and the
     question says what goes: which baseline (its date) and how many
     activities, how many activities a replace rebuilds and, when the
     "+ user stories" box is ticked, how many stories go with them, how many
     stories and criteria a redraft rewrites, how many flagged stories and
     criteria a wording fix rewrites, how many fixes Fix all applies;
   · answering no changes nothing: the plan, the undo stack, the notes in the
     box, and no AI call goes out;
   · answering yes does the work, and an action that was one undo step is
     still one, and one undo brings the old work back;
   · with nothing to lose (no baseline yet, an empty plan, no stories yet,
     nothing flagged, nothing fixable) or
     nothing replaced wholesale (Update existing), it does not ask;
   · one action asks one question: the reading's "Freeze today as the
     baseline" already asks, so it must not ask twice, and a replace that
     redrafts the stories does not ask again when the redraft starts.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE, EMPTY_PLAN } = require('./_harness');
const { chromium } = requirePlaywright();
const DATA = FIXTURE();

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  // every question below is answered by the stub; a native one that slips past
  // it is answered no, so it can never approve a replace on the check's behalf
  page.on('dialog', d => d.dismiss());
  await page.goto(APP, { waitUntil: 'load' });

  const R = await page.evaluate(async ({ data, empty }) => {
    const bad = [];
    const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const real = { confirm: window.confirm, call: window.callAnthropic, alert: window.alert };
    const clip = s => String(s).replace(/\s+/g, ' ').slice(0, 140);

    /* Every question is recorded with the number of AI calls already out when
       it was asked: a question asked after the call is a question asked after
       the work is already gone. */
    let calls = 0;
    const log = { asked: [], at: [], alerts: [] };
    const answer = a => {
      log.asked = []; log.at = [];
      window.confirm = m => { log.asked.push(String(m)); log.at.push(calls); return typeof a === 'function' ? a(String(m)) : a; };
    };
    const reply = fn => { calls = 0; window.callAnthropic = async () => { calls++; return fn(calls); }; };
    window.alert = m => { log.alerts.push(String(m)); };
    const fresh = d => {
      hydrate(JSON.parse(JSON.stringify(d || data)));
      calculate(); resetUndo(); saveLocal();
    };
    const state = () => JSON.stringify(serialize());
    const steps = () => undoStack.length;
    const storyCount = () => ((reqs && reqs.stories) || []).length;
    const acCount = () => ((reqs && reqs.stories) || []).reduce((n, s) => n + ((s.ac || []).length), 0);
    const storyKey = () => ((reqs && reqs.stories) || []).map(s => s.id + '=' + s.want + '#' + (s.ac || []).length).join('|');
    const aiError = () => { const e = document.getElementById('aiError'); return e && e.style.display !== 'none' ? e.textContent.trim() : ''; };
    localStorage.setItem('pertGantt.anthropicKey', 'sk-test-not-a-real-key');

    const PLAN = { projectName: 'ZZ replacement plan', durationUnit: 'days', tasks: [
      { name: 'ZZ Phase', parent: '' },
      { name: 'ZZ Design', parent: 'ZZ Phase', optimistic: 2, mostLikely: 3, pessimistic: 5, owner: 'Ana' },
      { name: 'ZZ Build', parent: 'ZZ Phase', optimistic: 4, mostLikely: 6, pessimistic: 9, owner: 'Ana', dependsOn: ['ZZ Design'] },
      { name: 'ZZ Live', parent: 'ZZ Phase', milestone: true, dependsOn: ['ZZ Build'] }],
      resources: [{ name: 'Ana', capacityPercent: 100 }] };
    const REQS = () => {
      const leaf = (typeof storyableLeaves === 'function' ? storyableLeaves() : leafTasks())[0] || tasks[0];
      return { personas: [{ name: 'ZZ Sales manager', definition: 'ZZ' }], epics: [{ id: 'EP-1', title: 'ZZ epic', wbsName: '' }],
        stories: [{ id: 'US-1', epicId: 'EP-1', wbsName: leaf ? leaf.name : '', persona: 'ZZ Sales manager', want: 'ZZ redrafted story',
          soThat: 'ZZ', verification: 'uat', ac: [{ id: 'AC-1.1', type: 'happy', text: 'Given ZZ When ZZ Then ZZ within 2 seconds' }] }] };
    };

    try {
      /* ═══ 1. SET BASELINE ═══════════════════════════════════════════════
         The toolbar's Set / update baseline, the "Re-baseline" links and the
         analytics CTAs all call setBaseline(). The toolbar button is the one
         pressed here; the others are the same call. */
      fresh();
      out.baseline = { was: baselineDate, committed: leafTasks().filter(t => t.baseFinish).length };
      if (!hasBaseline()) say('Set baseline', 'the fixture commits no baseline, so whether replacing one asks first cannot be seen');
      else {
        const was = baselineDate, nB = out.baseline.committed;
        const d0 = new Date(was + 'T00:00:00');
        const shown = [was, fmtNice(d0), fmtDoc(d0)];
        switchTab('baseline'); renderBaseline();
        const btn = document.getElementById('baselineSetBtn');
        if (!btn) say('Plan vs actual', 'there is no Set / update baseline button');
        else {
          answer(false);
          const s0 = state(), u0 = steps();
          btn.click();
          out.baseline.question = log.asked[0] ? clip(log.asked[0]) : null;
          if (!log.asked.length) say('Set baseline', 'replaced the baseline set on ' + was + ' without asking');
          else {
            const q = log.asked[0];
            if (!shown.some(x => q.indexOf(x) >= 0))
              say('Set baseline', 'the question does not say which baseline it replaces (the one set on ' + was + '): "' + clip(q) + '"');
            if (q.indexOf(String(nB)) < 0)
              say('Set baseline', 'the question does not say how many activities the baseline commits (' + nB + '): "' + clip(q) + '"');
            if (log.asked.length > 1) say('Set baseline', 'one press asked ' + log.asked.length + ' questions');
          }
          if (state() !== s0) say('Set baseline', 'answering no still changed the plan (the baseline now reads ' + baselineDate + ')');
          if (steps() !== u0) say('Set baseline', 'answering no added ' + (steps() - u0) + ' undo step(s)');

          answer(true);
          const u1 = steps();
          btn.click();
          if (baselineDate === was) say('Set baseline', 'answering yes did not replace the baseline set on ' + was);
          else {
            out.baseline.yesSteps = steps() - u1;
            if (steps() - u1 !== 1) say('Set baseline', 'a confirmed re-baseline took ' + (steps() - u1) + ' undo steps; it was one');
            doUndo();
            if (baselineDate !== was) say('Set baseline', 'one undo after a re-baseline left ' + baselineDate + ', not the baseline set on ' + was);
          }
        }
      }

      // nothing to lose: no baseline yet, and the notice on Plan vs actual offers one
      fresh();
      if (tasks.length) {
        baselineDate = null; reqsBaseline = null;
        tasks.forEach(t => { t.baseStart = null; t.baseFinish = null; t.baseTe = null; t.baseUnits = null; t.baseCost = null; });
        saveLocal(); switchTab('baseline'); renderBaseline();
        const notice = [...document.querySelectorAll('#baselineContainer button')]
          .find(x => /^setBaseline\(\)/.test((x.getAttribute('onclick') || '').trim()));
        answer(true);
        if (!notice) say('Plan vs actual', 'with no baseline there is no "Set baseline today" button to press');
        else {
          notice.click();
          out.baseline.fresh = { asked: log.asked.length, set: hasBaseline() };
          if (log.asked.length) say('Set baseline today', 'asked "' + clip(log.asked[0]) + '" with no baseline to lose');
          if (!hasBaseline()) say('Set baseline today', 'pressing it did not set a baseline');
        }
      }

      // the reading's fix already asks; the re-baseline it runs must not ask again
      fresh();
      if (hasBaseline() && typeof PT_FIX === 'object' && PT_FIX.rebaseline) {
        const leaf = leafTasks().find(t => !t.milestone && (t.percentComplete || 0) < 100);
        if (leaf) { leaf.m = (Number(leaf.m) || 1) + 4; leaf.p = Math.max(Number(leaf.p) || 0, leaf.m + 2); calculate(); }
        answer(true);
        if (!PT_FIX.rebaseline.describe()) say('Reading ▸ Freeze today as the baseline', 'the fix does not apply to the fixture, so whether it asks twice cannot be seen');
        else {
          ptApplyFix('rebaseline');
          out.baseline.readingQuestions = log.asked.length;
          if (log.asked.length !== 1)
            say('Reading ▸ Freeze today as the baseline', 'one press asked ' + log.asked.length + ' questions' + (log.asked.length ? ': ' + log.asked.map(clip).join(' / ') : ''));
        }
      }

      /* ═══ 2. GENERATE PLAN ══════════════════════════════════════════════
         "Create / replace all tasks" is the first option of the mode select,
         so it is what a person gets without choosing. */
      const gen = async (mode, ticked) => {
        document.getElementById('aiMode').value = mode;
        document.getElementById('aiNotes').value = 'ZZ rebuild the plan';
        document.getElementById('aiAlsoStories').checked = !!ticked;
        await generateWithAI();
      };
      fresh();
      const nAct = leafTasks().length, nSt = storyCount();
      out.generate = { activities: nAct, stories: nSt, defaultMode: document.getElementById('aiMode').options[0].value };
      if (!nAct) say('Generate plan', 'the fixture holds no activities, so whether a replace asks first cannot be seen');
      else {
        answer(false); reply(() => JSON.stringify(PLAN));
        const s0 = state(), u0 = steps();
        await gen('replace', true);
        out.generate.question = log.asked[0] ? clip(log.asked[0]) : null;
        if (!log.asked.length) say('Generate plan', 'replaced all ' + nAct + ' activities without asking');
        else {
          const q = log.asked[0];
          if (log.at[0] !== 0) say('Generate plan', 'asked only after the AI had been called — the old plan was already gone');
          if (q.indexOf(String(nAct)) < 0) say('Generate plan', 'the question does not say how many activities it replaces (' + nAct + '): "' + clip(q) + '"');
          if (nSt && q.indexOf(String(nSt)) < 0)
            say('Generate plan', 'with "+ user stories" ticked the ' + nSt + ' existing stories are redrafted too, and the question does not say so: "' + clip(q) + '"');
        }
        if (calls) say('Generate plan', 'answering no still called the AI ' + calls + ' time(s)');
        if (state() !== s0) say('Generate plan', 'answering no still changed the plan');
        if (steps() !== u0) say('Generate plan', 'answering no added ' + (steps() - u0) + ' undo step(s)');
        if (document.getElementById('aiNotes').value !== 'ZZ rebuild the plan') say('Generate plan', 'answering no threw away the notes in the box');
        if (document.getElementById('aiGenerateBtn').disabled) say('Generate plan', 'answering no left the button disabled');

        // yes, box unticked: one go-ahead before the call; the question about
        // the stories it leaves behind still comes after, as it did
        fresh(); answer(true); reply(() => JSON.stringify(PLAN));
        await gen('replace', false);
        out.generate.yes = { before: log.at.filter(c => c === 0).length, after: log.at.filter(c => c > 0).length, rebuilt: tasks.some(t => t.name === 'ZZ Build') };
        if (!out.generate.yes.rebuilt) say('Generate plan', 'answering yes did not build the new plan' + (aiError() ? ': ' + aiError() : ''));
        if (out.generate.yes.before > 1) say('Generate plan', 'asked ' + out.generate.yes.before + ' questions before the AI call');

        // yes, box ticked: the redraft that follows does not ask again
        fresh(); answer(true); reply(n => JSON.stringify(n === 1 ? PLAN : REQS()));
        await gen('replace', true);
        out.generate.ticked = { asked: log.asked.length, calls };
        if (log.asked.length !== 1)
          say('Generate plan', 'with "+ user stories" ticked one replace asked ' + log.asked.length + ' questions: ' + log.asked.map(clip).join(' / '));
        if (calls < 2) say('Generate plan', 'with "+ user stories" ticked the stories were not redrafted after the replace');
      }

      // nothing to lose: an empty plan
      fresh(empty); answer(true); reply(() => JSON.stringify(PLAN));
      await gen('replace', false);
      out.generate.empty = { asked: log.asked.length, calls };
      if (log.asked.length) say('Generate plan on an empty plan', 'asked "' + clip(log.asked[0]) + '" with nothing to replace');
      if (calls !== 1) say('Generate plan on an empty plan', 'the AI was called ' + calls + ' times, not once' + (aiError() ? ': ' + aiError() : ''));

      // nothing replaced wholesale: Update existing edits in place
      fresh();
      if (tasks.length) {
        answer(true); reply(() => JSON.stringify({ changedTasks: [{ name: 'ZZ added by an update', optimistic: 1, mostLikely: 2, pessimistic: 3 }] }));
        await gen('merge', false);
        out.generate.merge = { before: log.at.filter(c => c === 0).length, calls };
        if (out.generate.merge.before) say('Generate plan ▸ Update existing', 'asked "' + clip(log.asked[0]) + '" before an update that replaces nothing');
        if (!tasks.some(t => t.name === 'ZZ added by an update')) say('Generate plan ▸ Update existing', 'the update did not apply' + (aiError() ? ': ' + aiError() : ''));
      }

      /* ═══ 3. DRAFT FROM WBS ═════════════════════════════════════════════ */
      fresh();
      const nS = storyCount(), nC = acCount();
      out.draft = { stories: nS, criteria: nC };
      if (!nS) say('Draft from WBS', 'the fixture holds no stories, so whether a redraft asks first cannot be seen');
      else {
        answer(false); reply(() => JSON.stringify(REQS()));
        const s0 = state(), u0 = steps();
        await draftRequirements();
        out.draft.question = log.asked[0] ? clip(log.asked[0]) : null;
        if (!log.asked.length) say('Draft from WBS', 'rewrote the ' + nS + ' existing stories without asking');
        else {
          const q = log.asked[0];
          if (log.at[0] !== 0) say('Draft from WBS', 'asked only after the AI had been called');
          if (q.indexOf(String(nS)) < 0) say('Draft from WBS', 'the question does not say how many stories it rewrites (' + nS + '): "' + clip(q) + '"');
          if (q.indexOf(String(nC)) < 0) say('Draft from WBS', 'the question does not say how many acceptance criteria it rewrites (' + nC + '): "' + clip(q) + '"');
        }
        if (calls) say('Draft from WBS', 'answering no still called the AI ' + calls + ' time(s)');
        if (state() !== s0) say('Draft from WBS', 'answering no still changed the stories');
        if (steps() !== u0) say('Draft from WBS', 'answering no added ' + (steps() - u0) + ' undo step(s)');

        fresh(); answer(true); reply(() => JSON.stringify(REQS()));
        const k0 = storyKey(), u1 = steps();
        await draftRequirements();
        if (storyKey() === k0) say('Draft from WBS', 'answering yes did not redraft the stories' + (log.alerts.length ? ': ' + clip(log.alerts[log.alerts.length - 1]) : ''));
        else {
          out.draft.yesSteps = steps() - u1;
          if (steps() - u1 !== 1) say('Draft from WBS', 'a confirmed redraft took ' + (steps() - u1) + ' undo steps; it was one');
          doUndo();
          if (storyKey() !== k0) say('Draft from WBS', 'one undo after a redraft did not bring back the ' + nS + ' stories');
        }
      }

      // nothing to lose: a plan with no stories yet
      fresh();
      if (tasks.length) {
        reqs = null; saveLocal();
        answer(true); reply(() => JSON.stringify(REQS()));
        await draftRequirements();
        out.draft.fresh = { asked: log.asked.length, calls };
        if (log.asked.length) say('Draft from WBS with no stories', 'asked "' + clip(log.asked[0]) + '" with no stories to lose');
        if (calls !== 1) say('Draft from WBS with no stories', 'the AI was called ' + calls + ' times, not once');
      }

      /* ═══ 4. FIX WITH AI ════════════════════════════════════════════════
         Two buttons put the AI's rewrites straight in. Stories ▸ Findings,
         the wording row: "Fix with AI" rewrites every flagged story.
         Analytics ▸ Health check: "Fix all N with AI" applies a plan update
         for every fixable finding. A count is looked for as a number on its
         own, with ids like US-2 or AC-1.1 taken out first, so a question that
         names US-2 does not pass for one that says "2 stories". */
      const hasNum = (q, n) => new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(String(q).replace(/\b[A-Z]{2,}-[\w.]+/g, ' '));

      // the wording row, with lint findings planted on two stories
      fresh();
      const pick = ((reqs && reqs.stories) || []).filter(s => (s.ac || []).length).slice(0, 2);
      if (pick.length < 2) say('Fix with AI', 'the fixture holds fewer than two stories with criteria, so the wording fix has nothing to rewrite');
      else {
        pick.forEach(s => { s.persona = 'user'; s.ac[0].text = 'Given a user When they search Then results are fast and seamless'; });
        saveLocal(); resetUndo(); saveLocal();
        const flagged = reqs.stories.filter(s => storyLint(s).length);
        const nF = flagged.length, nAC = flagged.reduce((n, s) => n + (s.ac || []).length, 0);
        out.fixLint = { flagged: nF, criteria: nAC };
        switchTab('req'); renderReqs();
        const btn = [...document.querySelectorAll('#reqContainer button')].find(x => (x.getAttribute('onclick') || '').trim() === 'aiFixStoryLints()');
        if (!btn) say('Stories ▸ Findings', 'with ' + nF + ' flagged stories there is no Fix with AI button on the wording row');
        const fixed = () => JSON.stringify({ personas: [], stories: flagged.map(s => ({ id: s.id, persona: 'ZZ Sales manager', want: 'ZZ fixed ' + s.want, soThat: s.soThat,
          ac: [{ id: s.id.replace(/^US/i, 'AC') + '.1', type: 'happy', text: 'Given ZZ When ZZ Then ZZ within 2 seconds' }] })) });
        answer(false); reply(fixed);
        const s0 = state(), u0 = steps();
        await aiFixStoryLints();
        out.fixLint.question = log.asked[0] ? clip(log.asked[0]) : null;
        if (!log.asked.length) say('Fix with AI', 'rewrote the ' + nF + ' flagged stories without asking');
        else {
          const q = log.asked[0];
          if (log.at[0] !== 0) say('Fix with AI', 'asked only after the AI had been called');
          if (!hasNum(q, nF)) say('Fix with AI', 'the question does not say how many stories it rewrites (' + nF + '): "' + clip(q) + '"');
          if (!hasNum(q, nAC)) say('Fix with AI', 'the question does not say how many acceptance criteria it rewrites (' + nAC + '): "' + clip(q) + '"');
        }
        if (calls) say('Fix with AI', 'answering no still called the AI ' + calls + ' time(s)');
        if (state() !== s0) say('Fix with AI', 'answering no still changed the stories');
        if (steps() !== u0) say('Fix with AI', 'answering no added ' + (steps() - u0) + ' undo step(s)');

        answer(true); reply(fixed);
        const k0 = storyKey(), u1 = steps();
        await aiFixStoryLints();
        if (storyKey() === k0) say('Fix with AI', 'answering yes did not rewrite the flagged stories' + (log.alerts.length ? ': ' + clip(log.alerts[log.alerts.length - 1]) : ''));
        else {
          out.fixLint.yesSteps = steps() - u1;
          if (steps() - u1 !== 1) say('Fix with AI', 'a confirmed fix took ' + (steps() - u1) + ' undo steps; it was one');
          doUndo();
          if (storyKey() !== k0) say('Fix with AI', 'one undo after the fix did not bring back the ' + nF + ' stories as they were');
        }
      }
      // nothing flagged: nothing to rewrite, nothing to ask
      fresh();
      if (storyCount() && !reqs.stories.some(s => storyLint(s).length)) {
        answer(true); reply(() => JSON.stringify({ personas: [], stories: [] }));
        await aiFixStoryLints();
        if (log.asked.length) say('Fix with AI with nothing flagged', 'asked "' + clip(log.asked[0]) + '" with no story to fix');
        if (calls) say('Fix with AI with nothing flagged', 'called the AI with no story to fix');
      }

      // the health check's Fix all
      fresh();
      healthFindings = { date: fmtISO(new Date()), findings: lintPlan() };
      const fixable = healthFindings.findings.filter(fd => fd.recommendation && fd.severity !== 'info' && !fd.jump && !fd.relink);
      const nX = fixable.length;
      out.fixAll = { fixable: nX };
      if (nX < 2) say('Fix all with AI', 'the fixture raises ' + nX + ' fixable health-check finding(s), so "Fix all" cannot be seen asking');
      else {
        switchTab('analytics'); renderHealth();
        const btn = [...document.querySelectorAll('#healthContainer button')].find(x => (x.getAttribute('onclick') || '').trim() === 'aiFixFindings()');
        if (!btn) say('Analytics ▸ Health check', 'with ' + nX + ' fixable findings there is no Fix all button');
        const target = leafTasks().find(t => !t.milestone);
        const delta = () => JSON.stringify({ changedTasks: [{ name: target.name, optimistic: 9, mostLikely: 10, pessimistic: 20 }] });
        answer(false); reply(delta);
        const s0 = state(), u0 = steps();
        await aiFixFindings();
        out.fixAll.question = log.asked[0] ? clip(log.asked[0]) : null;
        if (!log.asked.length) say('Fix all with AI', 'applied ' + nX + ' fixes to the plan without asking');
        else {
          const q = log.asked[0];
          if (log.at[0] !== 0) say('Fix all with AI', 'asked only after the AI had been called');
          if (!hasNum(q, nX)) say('Fix all with AI', 'the question does not say how many fixes it applies (' + nX + '): "' + clip(q) + '"');
        }
        if (calls) say('Fix all with AI', 'answering no still called the AI ' + calls + ' time(s)');
        if (state() !== s0) say('Fix all with AI', 'answering no still changed the plan');
        if (steps() !== u0) say('Fix all with AI', 'answering no added ' + (steps() - u0) + ' undo step(s)');

        healthFindings = { date: fmtISO(new Date()), findings: lintPlan() };
        answer(true); reply(delta);
        const m0 = target.m, u1 = steps();
        await aiFixFindings();
        const now = tasks.find(t => t.id === target.id);
        if (!now || now.m === m0) say('Fix all with AI', 'answering yes did not apply the fixes' + (log.alerts.length ? ': ' + clip(log.alerts[log.alerts.length - 1]) : ''));
        else {
          out.fixAll.yesSteps = steps() - u1;
          if (steps() - u1 !== 1) say('Fix all with AI', 'a confirmed Fix all took ' + (steps() - u1) + ' undo steps; it was one');
          doUndo();
          const back = tasks.find(t => t.id === target.id);
          if (!back || back.m !== m0) say('Fix all with AI', 'one undo after Fix all did not bring back ' + target.name + ' as it was');
        }
      }
      // nothing fixable: nothing to ask
      fresh();
      healthFindings = { date: fmtISO(new Date()), findings: [] };
      answer(true); reply(() => JSON.stringify({ changedTasks: [] }));
      await aiFixFindings();
      if (log.asked.length) say('Fix all with AI with nothing to fix', 'asked "' + clip(log.asked[0]) + '" with no finding to fix');
    } finally {
      window.confirm = real.confirm; window.callAnthropic = real.call; window.alert = real.alert;
      localStorage.removeItem('pertGantt.anthropicKey');
    }
    return { bad, out };
  }, { data: DATA, empty: EMPTY_PLAN });

  const report = { contradictions: R.bad, seen: R.out, pageErrors: errs.slice(0, 8) };
  console.log(JSON.stringify(report, null, 1));
  await b.close();
  if (R.bad.length || errs.length) process.exitCode = 1;
})();

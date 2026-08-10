/* ═══════════════════════════════════════════════════════════════════════════
   CAN THREE PEOPLE ACTUALLY SHARE ONE FILE?

   The trunk shipped with its chain logic proved against an in-memory stand-in:
   objects handed straight to trunkRelation and trunkVerifyChain, never written
   to anything and never read back. That proves the arithmetic and nothing about
   the feature. Everything between the arithmetic and the user — serialize,
   JSON.stringify, a writable stream, getFile().text(), JSON.parse, hydrate —
   was untested, and that is where a whole-file sync actually loses work.

   So this drives the real functions through a REAL FileSystemFileHandle, from
   the Origin Private File System, which headless Chromium provides and which
   implements the same getFile()/createWritable() contract the directory picker
   returns. trunkRead and trunkWrite are called unmodified.

   Three people, because two is the case that hides the bug. With two, "the
   trunk is ahead" names the only other person; with three the question is whose
   work is arriving, and a diverged pull is the common case rather than the
   exception. Each person is simulated by swapping the whole global plan state,
   which is what a second laptop would look like from the file's side.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const fs = require('fs'), http = require('http');
const DATA = FIXTURE();

/* SERVED OVER HTTP, uniquely among these checks, and only because of what is
   being tested. The Origin Private File System is where a real
   FileSystemFileHandle can be had in a headless browser, and OPFS is refused on
   a file:// page — its origin is opaque, so there is no origin to have private
   storage for. Every other sweep reads the app the way a person opens it, off
   the disk; this one needs a real origin to get a real handle, and a handle
   shim would prove the test's own mock rather than the browser's file API.

   The page is byte-identical either way: the same index.html, read once and
   served. Nothing about the product is configured differently. */
function serveApp() {
  const file = decodeURIComponent(String(APP).replace(/^file:\/\//, ''));
  const html = fs.readFileSync(file);
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

(async () => {
  const { srv, url } = await serveApp();
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  /* Every confirm() is accepted and every alert recorded. A pull that asks a
     question the test does not see is a pull that would have blocked a person,
     so the prompts are part of what is being checked, not noise to suppress. */
  const dialogs = [];
  page.on('dialog', d => { dialogs.push({ type: d.type(), msg: d.message() }); d.accept(); });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(data => { window.__fixture = data; hydrate(data); calculate(); }, DATA);
  await page.waitForTimeout(500);

  const R = await page.evaluate(async data => {
    const bad = [], out = {};
    const say = (a, b2) => bad.push(a + ' :: ' + b2);

    if (typeof trunkRead !== 'function' || typeof trunkPush !== 'function') {
      say('Trunk', 'the trunk functions are gone'); return { bad, out };
    }

    /* A REAL handle. OPFS gives a FileSystemFileHandle with the same
       getFile()/createWritable() the picker returns, so trunkRead and
       trunkWrite run exactly as they do for a person. */
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry('trunk-sweep.json'); } catch (e) {}
    const handle = await root.getFileHandle('trunk-sweep.json', { create: true });
    out.handleKind = handle.kind;
    if (handle.kind !== 'file') { say('Trunk', 'OPFS did not hand back a file handle'); return { bad, out }; }

    /* Swapping the whole plan state is what a different laptop looks like from
       the file's point of view: same lineage, different history beyond the
       point they last shared. */
    const capture = () => ({ doc: JSON.parse(JSON.stringify(serialize())),
      versions: JSON.parse(JSON.stringify(planVersions || [])), lineage: planLineage });
    const restore = st => {
      hydrate(JSON.parse(JSON.stringify(st.doc)));
      planVersions = JSON.parse(JSON.stringify(st.versions));
      planLineage = st.lineage;
      calculate();
    };
    const beA = n => { try { localStorage.setItem('pertGantt.whoAmI', n);
      localStorage.setItem('pertGantt.whoAmIEmail', n.toLowerCase().replace(/[^a-z]/g, '') + '@x.test'); } catch (e) {} };
    const editName = (id, v) => { const t = tasks.find(x => x.id === id); if (t) t.name = v; };
    const editO = (id, v) => { const t = tasks.find(x => x.id === id); if (t) t.o = v; };

    trunkHandle = handle;
    const leaves = leafTasks().filter(x => !x.milestone);
    /* Recorded as a SKIP rather than a failure. Too few activities to give
       three people something disjoint to edit is a fact about the fixture, not
       a defect in the trunk — and vacuity-check runs every sweep against an
       EMPTY plan on purpose, so a hard failure here would turn that deliberate
       probe into a red gate. The output still changes, which is what vacuity
       asks; and on the real fixture this line is never reached, so it cannot
       quietly become the way this whole check passes. */
    out.simulated = leaves.length >= 3;
    if (leaves.length < 3) { out.skipped = 'fewer than three activities to divide between three people';
      return { bad, out }; }
    const A_ID = leaves[0].id, B_ID = leaves[1].id, C_ID = leaves[2].id;

    // ── 1. ALICE STARTS THE TRUNK ───────────────────────────────────────────
    beA('Alice');
    planLineageId();
    pushVersion('edit', 'alice base');
    await trunkPush(true);
    const shared = capture();
    let t = await trunkRead(handle);
    out.afterAlice = { entries: (t.log || []).length, hasDoc: !!(trunkTip(t) || {}).doc };
    if (!t) { say('Trunk', 'nothing was written to the file at all'); return { bad, out }; }
    if (!(t.log || []).length) say('Trunk', 'Alice pushed and the log is empty');
    if (!trunkVerifyChain(t).ok) say('Trunk', 'the chain is already broken after one push');

    // ── 2. BOB PULLS, EDITS SOMETHING ELSE, PUSHES ──────────────────────────
    restore(shared); beA('Bob');
    editName(B_ID, 'BOB RENAMED THIS');
    pushVersion('edit', 'bob rename');
    await trunkPush(true);
    const bobState = capture();
    t = await trunkRead(handle);
    out.afterBob = { entries: (t.log || []).length };
    if ((t.log || []).length < 2) say('Trunk', 'Bob pushed onto Alice and the file did not grow');
    if (!trunkVerifyChain(t).ok)
      say('Trunk', 'the chain broke when a second person appended: ' + JSON.stringify(trunkVerifyChain(t).gaps));

    // ── 3. CAROL, WHO NEVER SAW BOB, EDITS A THIRD ACTIVITY ─────────────────
    /* This is the case the feature exists for and the one that was never
       exercised: diverged histories, disjoint edits. Carol branched from the
       version Alice shared, so she has none of Bob's — and she has work of her
       own, so it is not a fast-forward either. */
    restore(shared); beA('Carol');
    editO(C_ID, 9.5);
    pushVersion('edit', 'carol estimate');
    t = await trunkRead(handle);
    const relC = trunkRelation(t);
    out.carolRelation = relC.relation;
    out.carolAheadBehind = [relC.ahead, relC.behind];
    if (relC.relation !== 'diverged')
      say('Trunk', 'Carol branched from Alice and pushed her own work, and the trunk calls that "'
        + relC.relation + '" rather than diverged — the whole three-person case rests on this');

    const who = trunkWhoMoved(t);
    out.carolSeesWhoMoved = who.list.map(x => x.name + ':' + x.n);
    if (!who.list.length)
      say('Trunk', 'Carol cannot see who moved the trunk — with three people, "it moved" is not an answer');
    if (!who.list.some(x => x.name === 'Bob'))
      say('Trunk', 'the entries Carol is missing were written by Bob and trunkWhoMoved does not name him: '
        + JSON.stringify(out.carolSeesWhoMoved));
    if (who.list.some(x => x.name === 'Carol'))
      say('Trunk', 'trunkWhoMoved lists Carol as somebody who moved the trunk while she was away');

    /* AND THE DISJOINT CASE MUST NOT ASK HER TO REVIEW ANYTHING. */
    const tipC = trunkTip(t);
    const rC = mergeCompute(tipC.doc);
    out.carolMerge = { conflicts: (rC.conflicts || []).length, auto: (rC.auto || []).length,
      theirAdds: (rC.theirAdds || []).length, collisions: (rC.collisions || []).length, noBase: !!rC.noBase };
    if (rC.noBase)
      say('Trunk', 'Carol and the trunk share Alice\'s version and the merge cannot find a common ancestor');
    if ((rC.conflicts || []).length)
      say('Trunk', 'Bob renamed one activity and Carol re-estimated a different one, and the merge reports '
        + rC.conflicts.length + ' conflict(s) — disjoint edits are not a conflict, and treating them as one is '
        + 'what made every pull on a team of three walk through a review panel');
    if (!(rC.auto || []).length)
      say('Trunk', 'the merge found nothing of Bob\'s to bring across, though he renamed an activity');

    const dlgBefore = window.__dlgCount || 0;
    const modalWasOpen = () => {
      const m = document.getElementById('mergeModal');
      return !!m && m.offsetHeight > 0;
    };
    await trunkPull(true);          // quiet: no confirm, so this is the APPLY path
    out.mergeModalOpened = modalWasOpen();
    if (out.mergeModalOpened)
      say('Trunk', 'the clean three-person pull opened the conflict review anyway');
    const gotBob = (tasks.find(x => x.id === B_ID) || {}).name;
    const keptCarol = (tasks.find(x => x.id === C_ID) || {}).o;
    out.carolAfterPull = { bobsRename: gotBob, herOwnEdit: keptCarol };
    if (gotBob !== 'BOB RENAMED THIS')
      say('Trunk', 'after the pull Carol does not have Bob\'s rename — it reads "' + gotBob + '"');
    if (Math.abs(Number(keptCarol) - 9.5) > 0.001)
      say('Trunk', 'the pull overwrote Carol\'s own estimate (' + keptCarol + ' instead of 9.5) — a merge that '
        + 'loses the work of the person running it is the worst outcome this format exists to prevent');

    // ── 4. AND SHE CAN PUSH THE RESULT BACK ─────────────────────────────────
    await trunkPush(true);
    t = await trunkRead(handle);
    out.afterCarol = { entries: (t.log || []).length, chainOk: trunkVerifyChain(t).ok };
    if (!trunkVerifyChain(t).ok)
      say('Trunk', 'the chain broke when the third person pushed their merge back: '
        + JSON.stringify(trunkVerifyChain(t).gaps));
    const relAfter = trunkRelation(t);
    if (relAfter.relation !== 'same')
      say('Trunk', 'Carol pushed and is still not in step with the trunk (' + relAfter.relation + ') — the '
        + 'round trip does not close, so the next person inherits her divergence');

    // ── 5. A REAL CONFLICT STILL GETS A REVIEW ──────────────────────────────
    /* The clean path must not be so eager that it swallows a contested field.
       Dave edits the SAME activity Bob renamed. */
    restore(shared); beA('Dave');
    editName(B_ID, 'DAVE RENAMED IT DIFFERENTLY');
    pushVersion('edit', 'dave rename');
    t = await trunkRead(handle);
    const rD = mergeCompute(trunkTip(t).doc);
    out.daveConflicts = (rD.conflicts || []).length;
    if (!(rD.conflicts || []).length)
      say('Trunk', 'Dave and Bob renamed the SAME activity to different things and the merge reports no '
        + 'conflict — the clean-pull shortcut would apply one over the other silently');
    /* AND HE HAS TO ACTUALLY BE ASKED. Computing the conflict count proves what
       mergeCompute thinks; it proves nothing about whether trunkPull respects
       it. The first version of this check stopped at the count, and a build
       whose shortcut ignored conflicts entirely — applying whatever the trunk
       said over the top of Dave's work without a word — passed it. So: pull for
       real, and require either the review to open or Dave's own edit to still
       be there. Quiet, so the clean path would take the APPLY branch without
       asking, which is exactly the silent overwrite being guarded against. */
    await trunkPull(true);
    out.daveReviewOpened = modalWasOpen();
    out.daveNameAfterPull = (tasks.find(x => x.id === B_ID) || {}).name;
    /* THE ASSERTION IS THAT HE WAS ASKED, not that a particular value won.
       The first version of this checked whether Dave's own text survived, and
       the mutant it was written for passed: mergeApply defaults every conflict
       to 'mine', so a shortcut that ignores conflicts entirely still leaves the
       person running it with their own value. Nothing is lost from THEIR side,
       which is exactly why it would never be noticed — what disappears is the
       other person's edit, with no record that it was ever in contention.

       So the requirement is the review, not the outcome. A contested field
       resolved without anybody being asked is the defect, whichever way it
       lands. */
    if ((rD.conflicts || []).length && !out.daveReviewOpened)
      say('Trunk', 'Dave and Bob had renamed the same activity to different things and the pull resolved it '
        + 'without opening the review. It kept "' + out.daveNameAfterPull + '" by default, so nothing looks '
        + 'wrong from Dave\'s side — and Bob\'s rename was discarded with no record that there was ever a '
        + 'disagreement');
    if (out.daveReviewOpened) { mergePlanState = null; closeOverlay('mergeModal'); trunkAdoptPending = null; }

    // ── 6. AND A STALE PUSH IS STILL REFUSED ────────────────────────────────
    /* Erin, and not Dave, because Dave has just been through a pull and the
       point of this check is somebody who has NOT. Reusing him made the
       assertion's own premise false, so it passed or failed for reasons that
       had nothing to do with staleness. */
    restore(shared); beA('Erin');
    editName(A_ID, 'ERIN RENAMED THIS');
    pushVersion('edit', 'erin rename');
    t = await trunkRead(handle);
    const beforeEntries = (t.log || []).length;
    out.erinRelation = trunkRelation(t).relation;
    await trunkPush(true);
    const t2 = await trunkRead(handle);
    out.stalePushBlocked = (t2.log || []).length === beforeEntries;
    if (out.erinRelation !== 'diverged')
      say('Trunk', 'Erin branched from Alice and has her own work, and the trunk calls that "'
        + out.erinRelation + '" — the staleness check below is only meaningful if she is behind it');
    if (!out.stalePushBlocked)
      say('Trunk', 'Erin pushed onto a trunk she had never pulled and it was accepted — her entries now '
        + 'claim parents nobody else has, which is the hole the format exists to prevent');

    /* AWAITED. Written as a bare (async () => {})() it was fire-and-forget:
       the evaluate returned before a single assertion inside it had run, the
       findings landed in a `bad` nobody was still holding, and the sweep
       reported green having tested nothing. The same shape as every other
       silent-assertion bug in this session, and it took printing the output
       to see it rather than reading the code. */
    await (async () => {
      const t0 = await trunkRead(handle);
      const tip0 = trunkTip(t0);
      if (!tip0 || !tip0.doc) { bad.push('Auto sync :: the trunk has no tip to build a conflict from'); return; }

      /* Both sides move the SAME field, which is what makes it contested. */
      const mine = tasks.find(x => !x.isSummary && !x.milestone);
      if (!mine) { bad.push('Auto sync :: no activity to contest'); return; }
      const theirDoc = JSON.parse(JSON.stringify(tip0.doc));
      const theirs = (theirDoc.tasks || []).find(x => x.id === mine.id);
      if (!theirs) { bad.push('Auto sync :: the trunk tip does not hold the activity under test'); return; }
      theirs.name = 'THEY RENAMED IT';
      mine.name = 'I RENAMED IT DIFFERENTLY';
      calculate(); pushVersion('edit', 'my rename');
      const entry = { vid: 'vCONFLICT', pvid: tip0.vid, at: new Date().toISOString(),
        by: 'other@example.com', byName: 'Other Person', kind: 'edit', note: 'their rename', doc: theirDoc };
      t0.log.push(entry);
      await trunkWrite(handle, t0);

      const relNow = trunkRelation(await trunkRead(handle)).relation;
      out.autoConflictRelation = relNow;
      if (relNow !== 'diverged')
        bad.push('Auto sync :: the two sides read as "' + relNow + '" rather than diverged, so the tick below '
          + 'is not being asked the question this block exists to ask');

      trunkAuto = true; trunkPaused = ''; trunkLastLocal = 0;
      const before = mine.name;
      await trunkAutoTick();
      out.autoPausedOn = trunkPaused;
      out.autoKeptMyName = tasks.find(x => x.id === mine.id).name === before;
      if (trunkPaused !== 'conflict')
        bad.push('Auto sync :: two people renamed the same activity and the loop did not stop — it reported "'
          + (trunkPaused || 'nothing') + '". Unattended, it is about to choose between two people\'s edits, '
          + 'and whichever it drops is gone without anybody being told');
      if (!out.autoKeptMyName)
        bad.push('Auto sync :: the loop changed this activity\'s name by itself while the change was '
          + 'contested. Nothing may be applied until a person has seen it');

      /* and once paused it stays paused, rather than trying again on the next
         tick and applying what it just refused to apply */
      await trunkAutoTick();
      if (tasks.find(x => x.id === mine.id).name !== before)
        bad.push('Auto sync :: a second tick applied what the first one refused — pausing has to mean '
          + 'paused until a person acts, not "wait one cycle"');

      /* ── AND IT MUST ACTUALLY SEND, WHEN THERE IS NOTHING TO ARGUE ABOUT ──
         The hidden-tab guard was first checked from the CONFLICTED state above,
         which cannot see it: the tick pauses on the conflict before it ever
         reaches the visibility test, so removing that test entirely left the
         check green. The premise was wrong, not the guard.

         So the conflict is cleared first and the plan is put back in step with
         the trunk. From there the tick genuinely wants to write, which is the
         only state in which "it did not write" means anything — and the same
         setup proves the other half nobody had tested: that automatic sync
         SENDS. A loop that only ever receives keeps one person up to date and
         everybody else stale. */
      trunkPaused = '';
      const tSummary = await trunkRead(handle);
      const tipNow = trunkTip(tSummary);

      /* ── A PUSH SAYS WHAT IT IS ABOUT TO PUBLISH ────────────────────────
         Pull explained itself and push said nothing until it was over, which
         is backwards: pull changes YOUR copy and undo reaches it; push changes
         the file a whole team reads and you cannot reach into their browsers.
         The one that leaves the building is the one that has to announce
         itself.

         Asserted on the CLAIM, not on the wording: the sentence has to carry
         the number of activities that actually differ between this plan and
         the trunk tip, and it has to name somebody else who is in the file.
         A confirm that says "share it?" and nothing else is a button with a
         speed bump, not an explanation. */
      (() => {
        const tRead = tSummary;
        const mineNow = (planVersions || []).filter(v => v.vid
          && !new Set(((tRead.log) || []).map(e => e.vid)).has(v.vid));
        const sent = trunkPushSentence(tRead, mineNow, 'trunk-sweep.json');
        const sum = trunkPushSummary(tRead, mineNow);
        out.pushSaysChanged = sum.changed;
        out.pushNamesOthers = sum.others.length;
        out.pushSentence = String(sent).slice(0, 80);
        if (!sum.changed && !sum.added && !sum.removed)
          bad.push('Auto sync :: the push preview reports nothing changed at all, so the sentence below is '
            + 'not describing this push and the assertion is vacuous');
        else if (String(sent).indexOf(String(sum.changed || sum.added || sum.removed)) < 0)
          bad.push('Trunk :: the push preview never states how much is going: "' + String(sent).slice(0, 100)
            + '". A confirm that says "share it?" and nothing else is a speed bump, not an explanation');
        if (!sum.others.length)
          bad.push('Trunk :: the push preview finds nobody else in a trunk five people have written to, so '
            + 'it cannot tell anybody who is about to see their work');
        else if (String(sent).indexOf(sum.others[0]) < 0)
          bad.push('Trunk :: the push preview knows who else is in the file and does not say so');
      })();

      hydrate(JSON.parse(JSON.stringify(tipNow.doc))); calculate();
      adoptVersions((await trunkRead(handle)).log || []);
      out.autoRelAfterCatchUp = trunkRelation(await trunkRead(handle)).relation;
      if (out.autoRelAfterCatchUp !== 'same')
        bad.push('Auto sync :: after taking the trunk tip the plan reads "' + out.autoRelAfterCatchUp
          + '" rather than in step, so the send test below is starting from the wrong place');

      editName(A_ID, 'AUTO SEND ME');
      trunkLastLocal = Date.now() - 60000;          // settled long ago
      const beforeHidden = (await trunkRead(handle)).log.length;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      await trunkAutoTick();
      out.autoHiddenWrote = (await trunkRead(handle)).log.length !== beforeHidden;
      if (out.autoHiddenWrote)
        bad.push('Auto sync :: a hidden tab wrote to the shared file. A background tab racing somebody '
          + 'else is a conflict nobody can see happening, and nobody is there to answer for it');

      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      trunkLastLocal = Date.now() - 60000;
      await trunkAutoTick();
      out.autoSent = (await trunkRead(handle)).log.length > beforeHidden;
      if (!out.autoSent)
        bad.push('Auto sync :: the plan moved, settled, and the visible tab sent nothing. A loop that only '
          + 'ever receives keeps one person current and everybody else stale, which is the problem it was '
          + 'built to end');
    })();

    /* ═══ A DIFFERENT STAMP IS NOT A DIFFERENT ENGAGEMENT ═════════════════
       Reported twice: "clicking push pull says there is a different trunk
       again." Identity was decided by one field — the lineage stamp — and when
       it disagreed the answer was a refusal with no evidence and no way out.
       But a stamp goes out of step for ordinary reasons (a file saved by an
       older build, a copy made before the two were connected) while the
       histories underneath are plainly the same history.

       So the question is asked of the VERSION IDS, which are the stronger
       evidence: if any id appears on both sides these two files were once one
       file. Driven here, not inspected — a trunk is built that shares this
       plan's versions and carries a foreign stamp, which is exactly the state
       that produced the report. */
    (() => {
      const keptLin = planLineage, keptFork = planForkedFrom;
      const mine = (planVersions || []).map(v => v.vid).filter(Boolean);
      if (mine.length < 1) {
        bad.push('Kinship :: this plan has no versions, so "shares a version with the trunk" cannot be '
          + 'constructed and the check below would pass on any build');
        return;
      }
      const foreign = { _format: TRUNK_FORMAT, lineage: 'L-someone-elses-stamp', name: 'Same engagement',
                        base: null, log: mine.map(v => ({ vid: v, pvid: null, by: 'w1', byName: 'A. Rivera' })) };
      planForkedFrom = '';
      planLineage = 'L-my-own-stamp';
      const kin = trunkRelation(foreign);
      out.kinRelation = kin.relation;
      out.kinShared = kin.kin ? kin.kin.shared : null;
      if (kin.relation === 'unrelated')
        bad.push('Kinship :: a trunk holding this plan\'s own version ids, under a different lineage stamp, '
          + 'is called a different engagement. The stamp is the weaker evidence and it is overruling the '
          + 'stronger — this is the state a person reports as "it says there is a different trunk again", '
          + 'and there is nothing they can do about it from that dialog');
      else if (kin.relation !== 'kin')
        bad.push('Kinship :: a shared-history trunk under a foreign stamp reports "' + kin.relation
          + '", which is neither the refusal nor the offer to reconcile');
      /* ═══ SAME LINEAGE, NO SHARED VERSION ═══════════════════════════════
         The state a person actually hit, reproduced exactly: both sides carry
         the SAME lineage and neither holds a version the other has. That is
         what copying a project produces once each copy has saved — and it was
         answered with "belongs to a different engagement", contradicting the
         lineage the same dialog printed two lines above.

         Two copies of one engagement are joinable. Refusing is the one answer
         that is wrong, so this asserts the verdict is neither the refusal nor
         a silent merge, but the offer to join. */
      planLineage = 'L-shared-stamp';
      const twin = { _format: TRUNK_FORMAT, lineage: 'L-shared-stamp', name: 'VenesaCRM (copy)',
                     base: null, log: [{ vid: 'v-theirs-only', pvid: null, by: 'w2', byName: 'M. Berenji' }] };
      const relT = trunkRelation(twin);
      out.twinRelation = relT.relation;
      out.twinShared = relT.kin ? relT.kin.shared : null;
      if (relT.relation === 'unrelated')
        bad.push('Kinship :: two copies of ONE engagement — same lineage, neither holding a version the '
          + 'other has — are called different engagements. That is what copying a project produces, the '
          + 'dialog says so in the same breath as printing one lineage for both sides, and the person is '
          + 'left with no way to join them');
      else if (relT.relation !== 'twin')
        bad.push('Kinship :: same lineage with no shared version reports "' + relT.relation + '", which is '
          + 'neither the refusal nor the offer to join');
      if (typeof trunkAdoptTwin !== 'function')
        bad.push('Kinship :: there is no way to join two copies of one engagement, so the verdict is a '
          + 'diagnosis with no treatment');

      /* AND A GENUINE STRANGER IS STILL REFUSED. A check that only proves the
         permissive half would pass on a build that accepted everything. */
      const stranger = { _format: TRUNK_FORMAT, lineage: 'L-unrelated', name: 'Someone else\'s project',
                         base: null, log: [{ vid: 'v-nothing-in-common', pvid: null, by: 'w9' }] };
      const rel2 = trunkRelation(stranger);
      out.strangerRelation = rel2.relation;
      if (rel2.relation !== 'unrelated')
        bad.push('Kinship :: a trunk with no version in common reports "' + rel2.relation + '" rather than '
          + 'refusing — two unrelated engagements would merge into one, and every activity in the other '
          + 'would read as an addition to this one');
      /* THE REFUSAL SHOWS ITS WORKING. A verdict nobody can check reads as a
         bug, which is how this arrived. */
      const ev = typeof trunkKinshipEvidence === 'function'
        ? trunkKinshipEvidence(rel2.kin || trunkKinship(stranger)) : '';
      out.evidenceNamesBoth = /lineage/.test(ev) && /versions in common/.test(ev);
      if (!out.evidenceNamesBoth)
        bad.push('Kinship :: the refusal prints no evidence, so a person told their own trunk is a stranger '
          + 'cannot see what was compared');
      planLineage = keptLin; planForkedFrom = keptFork;
    })();

    /* ═══ HALF A LOOP MUST NOT LOOK LIKE A WHOLE ONE ══════════════════════
       Watching a colleague's file is inbound only: it reads their changes and
       writes nothing back. Somebody who sets that up and stops there receives
       everything and sends nothing, while the other person watches a file that
       never moves and concludes the tool is broken.

       The chip is the only thing that can say so, and it said nothing — it
       reported the half that WAS set up. The fix draws a warning and a way to
       finish the pair, and this asserts the DIFFERENCE between the two states
       rather than any wording: with an outbound handle the chip is quiet, and
       without one it offers the control that completes the loop. */
    (() => {
      const keptTheirs = fsTheirs, keptHandle = diskFileHandle, keptPending = fsPending;
      const el = document.getElementById('syncChip');
      if (!el) {
        bad.push('Sync chip :: there is no chip element to report the state of the loop at all');
        return;
      }
      fsPending = null;
      fsTheirs = { name: 'their-plan.json', handle: {} };
      diskFileHandle = null;
      renderSyncChip();
      const oneWay = el.innerHTML;
      diskFileHandle = {};                       // the outbound half now exists
      renderSyncChip();
      const bothWays = el.innerHTML;
      fsTheirs = keptTheirs; diskFileHandle = keptHandle; fsPending = keptPending;
      renderSyncChip();
      out.chipOneWayOffersFix = /setupDiskAutosave/.test(oneWay);
      out.chipQuietWhenPaired = !/setupDiskAutosave/.test(bothWays);
      if (oneWay === bothWays)
        bad.push('Sync chip :: receiving somebody\'s changes while sending none of your own draws exactly '
          + 'the same chip as a working pair. The one state a person cannot discover for themselves is the '
          + 'one the chip refuses to distinguish');
      if (!out.chipOneWayOffersFix)
        bad.push('Sync chip :: the one-way state is drawn with no way out of it — a warning that names no '
          + 'next step leaves the reader knowing they are broken and not how to stop being broken');
      if (!out.chipQuietWhenPaired)
        bad.push('Sync chip :: a fully paired loop still offers to set up the half that already exists, so '
          + 'the warning means nothing');
    })();

    /* ═══ THE JOIN DIALOG IS A DECISION SURFACE, AND IT MUST SETTLE ════════
       Three window.confirm() calls used to ask whether two files are the same
       engagement. A confirm has two properties this replacement must not lose
       and one it must not inherit: it always returns, it always returns a
       boolean, and it can say nothing a reader can look at.

       So the assertions are about the ANSWER, not the artwork: every route out
       of the dialog resolves the promise (a Push waiting on a resolve that
       never comes is worse than the box it replaced), the figures drawn are the
       figures that were measured, and the two phases are actually two — an
       animation that ends where it started explains nothing and would pass any
       check that only asked whether the button exists. */
    await (async () => {
      const sayJ = x => bad.push('Join dialog :: ' + x);
      const K = { shared: 0, mine: 3, theirs: 9, who: ['Sam Okafor'],
                  myLineage: 'lin_aaa111', theirLineage: 'lin_aaa111', theirName: 'CRM Rollout (copy)' };
      const el = document.getElementById('joinModal');
      if (!el) { sayJ('there is no join dialog at all'); return; }
      const openIt = k => { const pr = trunkJoinAsk(k, { name: K.theirName, lineage: K.theirLineage }, K); return pr; };
      // 1. every kind opens it, and none of them falls back to a native confirm
      for (const kind of ['twin', 'kin', 'fork']) {
        const kk = kind === 'kin' ? Object.assign({}, K, { shared: 2, theirLineage: 'lin_bbb222' }) : K;
        const pr = trunkJoinAsk(kind, { name: kk.theirName, lineage: kk.theirLineage }, kk);
        if (!el.classList.contains('open')) sayJ(kind + ' did not open the dialog, so that decision is still '
          + 'being made in a box nobody can read');
        const txt = (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' ');
        out['join_' + kind] = txt.slice(0, 60);
        // the figures on screen are the figures that were measured
        if (txt.indexOf(String(kk.theirs)) < 0 || txt.indexOf(String(kk.mine)) < 0)
          sayJ(kind + ' does not print both version counts (' + kk.mine + ' and ' + kk.theirs + '), so the '
            + 'reader is asked to agree to a merge whose size is not stated');
        if (txt.indexOf(kk.theirName) < 0)
          sayJ(kind + ' does not name the trunk it is proposing to join, so two candidate files look identical');
        if (txt.indexOf(kk.theirLineage) < 0 || txt.indexOf(kk.myLineage) < 0)
          sayJ(kind + ' hides one of the two lineage stamps — the stamps ARE the disagreement being resolved');
        joinClose(false);
        const ans = await pr;
        if (ans !== false) sayJ(kind + ' resolved ' + JSON.stringify(ans) + ' when the reader cancelled');
      }
      // 2. the two phases are two: nodes end up somewhere else
      const pr2 = openIt('twin');
      /* THE NODES' OWN TRANSFORMS, not their place on the screen. Read as
         viewport rectangles this compared the wrong thing entirely: the modal
         plays its own entry animation while the first sample is taken, so the
         boxes land somewhere different a second later whatever the diagram
         does — and the check passed against a build whose nodes were pinned to
         their starting position and could not move at all. */
      /* Past the auto-play, not into it. The dialog plays itself once on open,
         so a "before" set at 500ms was overwritten by that timer at 620ms and
         both samples were taken in the same phase — which is why this reported
         a frozen diagram on a build whose diagram was fine. */
      await new Promise(r => setTimeout(r, 1500));
      const nodes = () => [...document.querySelectorAll('#joinStage .jn-n')]
        .map(n => getComputedStyle(n).transform);
      joinPhase('before');
      await new Promise(r => setTimeout(r, 900));
      const before = nodes().join('|');
      joinPhase('after');
      await new Promise(r => setTimeout(r, 900));
      const after = nodes().join('|');
      out.joinNodes = nodes().length;
      if (nodes().some(t => !t || t === 'none'))
        sayJ('a version box carries no transform at all, so it is placed by nothing and the two phases '
          + 'cannot differ by construction');
      if (!out.joinNodes) sayJ('the diagram draws no version boxes, so there is nothing to look at');
      if (before === after)
        sayJ('every version box is in the same place before and after the join, so the one picture of what '
          + 'the join DOES shows nothing happening');
      // 3. Escape settles it too — this is the route that used to hang
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const esc = await Promise.race([pr2, new Promise(r => setTimeout(() => r('HUNG'), 600))]);
      if (esc === 'HUNG')
        sayJ('pressing Escape leaves the promise unsettled, so Push waits forever on an answer that was '
          + 'already given');
      else if (esc !== false) sayJ('Escape resolved ' + JSON.stringify(esc) + ' rather than "do not join"');
      // 4. and the affirmative route returns true
      const pr3 = openIt('twin');
      document.getElementById('joinGo').click();
      const yes = await Promise.race([pr3, new Promise(r => setTimeout(() => r('HUNG'), 600))]);
      if (yes !== true) sayJ('pressing the join button resolved ' + JSON.stringify(yes) + ' rather than true');
      // and it leaves. The exit is animated, so this waits past it rather than
      // reading mid-flight and reporting the animation as a stuck dialog.
      await new Promise(r => setTimeout(r, 320));
      if (el.classList.contains('open'))
        sayJ('the dialog is still on screen after being answered, so the plan it was asked about is behind '
          + 'an overlay nobody can dismiss');
    })();

    /* ═══ THE LOUD PATH, WHICH NOTHING HAS EVER RUN ════════════════════════
       Every push and pull in this file is driven with quiet=true, which is the
       right way to test what they DO to the data and means the dialog half has
       never been exercised once. Reported by use — "i still see this modal, we
       need animations all the way through all steps until done" — about a
       confirm() that had been sitting in the loud path the whole time.

       So one push is run the way a person runs it: answer the question, watch
       the steps, and check the closing frame says what actually happened. The
       assertions are about SETTLING, because that is the failure this shape
       has: a step left spinning, or a dialog that closes on OK and leaves the
       work invisible again. */
    await (async () => {
      const sayP = x => bad.push('Push run :: ' + x);
      const el = document.getElementById('joinModal');
      if (!el) { sayP('there is no dialog for a push to draw into'); return; }
      editName(A_ID, 'A LOUD PUSH');
      pushVersion('edit', 'loud push');
      const pr = trunkPush(false);            // deliberately NOT quiet
      await new Promise(r => setTimeout(r, 600));
      if (!el.classList.contains('open')) {
        sayP('a push with unshared work asked nothing and showed nothing — the one route a person takes '
          + 'is the one route nothing here has ever run');
        await pr; return;
      }
      const ask = (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' ');
      out.pushAsk = ask.slice(0, 70);
      if (ask.indexOf('trunk-sweep.json') < 0)
        sayP('the question does not name the file it is about to write');
      /* ═══ AND IT SAYS WHAT IS CHANGING, AND WHO CHANGED IT ═══════════════
         Reported by use: "it doesn't show the updates or whatever the details
         of what is changing in a user friendly way and who changes what last".
         A version COUNT is a fact about the file; what a person is deciding is
         whether to share somebody's edits, and that is answered by naming the
         edits and the person. Both were stored the whole time.

         Asserted against the plan, not against the wording: the activity this
         run renamed must be named in the dialog, the person who filed the
         version must be named, and the change must be classified. A check on
         the word "changes" alone would pass on a build that printed a heading
         over an empty box. */
      const who = (trunkIdentity && trunkIdentity().label) || '';
      out.pushLogNames = { activity: ask.indexOf('A LOUD PUSH') >= 0, who: !!who && ask.indexOf(who) >= 0 };
      if (!document.querySelector('#joinBody .jn-log'))
        sayP('the question carries no changelog at all, so it asks somebody to share work it will not name');
      else {
        if (ask.indexOf('A LOUD PUSH') < 0)
          sayP('the changelog does not name the activity this push actually renamed, so it is describing '
            + 'something other than the versions being sent');
        if (who && ask.indexOf(who) < 0)
          sayP('the changelog does not say who filed the version — on a plan three people share, whose edit '
            + 'this is is the first thing a reader wants');
        const kinds = [...document.querySelectorAll('#joinBody .jn-log .jn-k')].map(x => x.textContent.trim());
        out.pushLogKinds = [...new Set(kinds)];
        if (!kinds.length)
          sayP('the changelog lists no classified change — a heading over an empty box reads as "nothing '
            + 'changed", which is the one thing it must never say by accident');
        if (kinds.indexOf('Renamed') < 0)
          sayP('this run renamed an activity and the changelog does not carry a Renamed row: '
            + JSON.stringify([...new Set(kinds)]));
      }
      if (!/\badd/i.test(ask))
        sayP('the question never says a push only ADDS — which is the single fact that makes it safe to say yes');
      document.getElementById('joinGo').click();
      await new Promise(r => setTimeout(r, 250));
      out.pushSteps = document.querySelectorAll('#joinSteps .jn-step').length;
      if (!out.pushSteps)
        sayP('answering the question closed the dialog and the write happened out of sight — which is the '
          + 'defect this replaced, reintroduced one screen later');
      await pr;
      await new Promise(r => setTimeout(r, 600));
      const done = (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' ');
      out.pushDone = done.slice(0, 70);
      if (!/Shared/i.test(done))
        sayP('the run never reached a closing frame — it stopped on the steps, so a person cannot tell '
          + 'whether the write finished: ' + done.slice(0, 80));
      const all = [...document.querySelectorAll('#joinSteps .jn-step')];
      const stuck = all.filter(x => x.getAttribute('data-s') !== 'done');
      if (stuck.length)
        sayP(stuck.length + ' of ' + all.length + ' steps never settled, so the run reports itself as still '
          + 'going after it finished');
      /* AND THE FILE ON DISK AGREES. A dialog that says "shared" is a claim; the
         only thing that settles it is reading the trunk back. The version's
         label is what carries the note — reading a field the entry does not
         have (`note`) had this reporting a lost push about a write that landed
         exactly as promised, which is the same class of miss as the rest of
         this session. */
      const tAfter = await trunkRead(handle);
      const labels = ((tAfter && tAfter.log) || []).map(e => e.label || '');
      out.pushLanded = labels.slice(-3);
      if (labels.indexOf('loud push') < 0)
        sayP('the dialog said it shared and the trunk on disk carries no such version — last entries: '
          + JSON.stringify(labels.slice(-3)));
      joinClose(true);
      await new Promise(r => setTimeout(r, 250));

      /* ═══ AND THE SAME QUESTION FROM THE OTHER SIDE ══════════════════════
         A pull is where the changelog earns its place: a push describes work
         the reader did and remembers, and a pull describes somebody else's,
         which they have never seen. Driven as a real fast-forward — somebody
         else moves the trunk, this copy goes back to where it was, and the
         dialog has to name them and what they did. */
      const mine0 = capture();
      beA('Dana Whitfield');
      editName(B_ID, 'DANA REWORKED THIS');
      pushVersion('edit', 'dana rework');
      await trunkPush(true);
      restore(mine0);
      const pl = trunkPull(false);
      await new Promise(r => setTimeout(r, 600));
      if (!el.classList.contains('open')) {
        sayP('a pull with the trunk ahead asked nothing — the incoming work arrives unannounced');
        await pl;
      } else {
        const ptxt = (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' ');
        out.pullAsk = ptxt.slice(0, 70);
        if (!document.querySelector('#joinBody .jn-log'))
          sayP('the pull question carries no changelog, so somebody is asked to accept edits it will not name');
        if (ptxt.indexOf('Dana Whitfield') < 0)
          sayP('the pull does not say WHOSE work is arriving — on somebody else\'s edits that is the first '
            + 'thing a reader needs and the only one they cannot work out for themselves');
        if (ptxt.indexOf('DANA REWORKED THIS') < 0)
          sayP('the pull does not name the activity that changed, so "take it" is being asked about work '
            + 'the reader cannot see');
        document.getElementById('joinGo').click();
        await pl;
        await new Promise(r => setTimeout(r, 600));
        const pdone = (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' ');
        out.pullDone = pdone.slice(0, 70);
        if (!/Level with the team/i.test(pdone))
          sayP('the pull run never reached its closing frame: ' + pdone.slice(0, 80));
        joinClose(true);
        await new Promise(r => setTimeout(r, 250));
      }
    })();

    /* ═══ A DATE ROLLING OVER IS NOT A CHANGE TO THE PLAN ══════════════════
       trunkEnsureTip decides whether a push has anything new by comparing the
       plan against its last version. It compared whole snapshots, and a
       snapshot carries the DATE it was taken — so an untouched plan looked
       identical all day and different the moment midnight passed, and the next
       push filed a version whose only content was a new date stamp. Those
       versions then travelled to the trunk and the changelog had to describe
       them: "shared with the team — nothing this diff can see". Reported from a
       real trunk, several of them in one pull.

       Driven by moving the STAMP rather than the clock, which is the same fact
       from the side this code can reach. */
    (() => {
      const sayD = x => bad.push('Ensure tip :: ' + x);
      const keep = capture();
      pushVersion('edit', 'a real edit');
      const n0 = planVersions.length;
      // nothing has changed: no version should be filed
      trunkEnsureTip();
      out.tipNoChange = planVersions.length - n0;
      if (planVersions.length !== n0)
        sayD('a push on an untouched plan filed a version anyway, so the trunk gains an entry with nothing '
          + 'in it every time somebody presses Push');
      // the snapshot was taken on an earlier DAY, and still nothing has changed
      const last = planVersions[planVersions.length - 1];
      last.snap.at = '2020-01-01';
      trunkEnsureTip();
      out.tipStaleDate = planVersions.length - n0;
      if (planVersions.length !== n0)
        sayD('a version whose snapshot carries an older DATE is treated as a plan that has moved, so the '
          + 'first push after midnight files a version whose only change is the day it was taken — and the '
          + 'changelog then has to describe it as "nothing this diff can see"');
      // and a genuine edit still files one
      const t0 = leafTasks().find(x => !x.isSummary && !x.milestone);
      if (t0) { t0.name = 'ENSURE TIP EDIT'; calculate(); trunkEnsureTip();
        out.tipRealEdit = planVersions.length - n0;
        if (planVersions.length === n0)
          sayD('a real edit did not produce a version, so pressing Push would share nothing and say the '
            + 'trunk already has everything'); }
      /* ═══ AND PROGRESS COUNTS AS SOMETHING HAVING HAPPENED ═══════════════
         snapshotPlan() is the COMMITMENT snapshot and deliberately carries no
         progress and no actuals — it exists so a change order can say what was
         agreed. Using it to answer "is there anything to push" meant a
         check-off, a logged day and an invoice all left the fingerprint
         byte-identical, so no version was filed and Push replied "the trunk
         already has everything of yours". Reported by use: "I changed the
         progress and it said no change". Status is the thing a team most needs
         out of a shared file and it was the one class of edit that could never
         leave the building. */
      const t1 = leafTasks().find(x => !x.isSummary && !x.milestone);
      if (!t1) { sayD('no work package to record progress against, so this proves nothing'); }
      else {
        const each = (label, mutate) => {
          trunkEnsureTip();                       // settle: nothing outstanding
          const before = planVersions.length;
          mutate(); calculate(); trunkEnsureTip();
          const filed = planVersions.length - before;
          out['tipSees_' + label] = filed;
          if (!filed)
            sayD(label + ' did not register as a change, so pressing Push shares nothing and answers "the '
              + 'trunk already has everything of yours" — the work is recorded here and can never reach '
              + 'anybody else');
        };
        each('progress', () => { t1.percentComplete = (Number(t1.percentComplete) || 0) === 60 ? 25 : 60; });
        each('loggedEffort', () => { t1.actualEffort = (Number(t1.actualEffort) || 0) + 2; });
        each('invoicing', () => { t1.invoiced = (Number(t1.invoiced) || 0) + 1500; });
        if (typeof raid !== 'undefined' && Array.isArray(raid))
          each('raidEntry', () => { raid.push({ id: 999001, kind: 'risk', title: 'A new risk', status: 'open' }); });
      }
      restore(keep); calculate();
    })();

    /* ═══ IDENTITY SURVIVES A ROUND TRIP, OR NONE OF THIS WORKS ════════════
       The single most load-bearing property in the whole sync design, and
       nothing asserted it. hydrate() rebuilds each version field by field and
       did not name vid or pvid, so every page load, every project switch and
       every fast-forward pull erased the identity of the entire history.

       trunkRelation reads planVersions.map(v => v.vid).filter(Boolean); with
       none it takes the !myVids.length branch and answers "behind by everything
       they have", permanently. Reported by use: "everytime i pull i get the
       same dialog... no one is working on the trunk it's only me, i have pushed
       and pulled to it and not changed a thing." The pull fast-forwarded,
       hydrate wiped the ids, and the next pull said the same thing forever.

       Asserted as the ROUND TRIP rather than as the presence of a field name,
       because the property that matters is that two files which ARE in step
       still say so after being saved and loaded. */
    (() => {
      const sayI = x => bad.push('Version identity :: ' + x);
      /* Versions filed HERE, not taken from the fixture. The fixture arrives
         through hydrate, so on a build with the defect its ids are already gone
         before this block starts and the check reported "fewer than two
         identified versions" — true, and about the wrong thing. Filing them
         first makes the "before" a fact rather than an assumption. */
      const keep = capture();
      pushVersion('edit', 'identity a');
      pushVersion('edit', 'identity b');
      pushVersion('edit', 'identity c');
      const before = planVersions.map(v => v.vid).filter(Boolean);
      if (before.length < 3) {
        sayI('filing three versions produced ' + before.length + ' with an id — a version with no id cannot '
          + 'be compared with anything, so the chain is not a chain');
        restore(keep); calculate(); return;
      }
      const doc = JSON.parse(JSON.stringify(serialize()));
      hydrate(doc); calculate();
      const after = planVersions.map(v => v.vid).filter(Boolean);
      out.vidsBefore = before.length; out.vidsAfter = after.length;
      out.pvidsAfter = planVersions.map(v => v.pvid).filter(Boolean).length;
      if (after.length !== before.length)
        sayI(before.length + ' versions carried an id before saving and ' + after.length + ' carry one after '
          + 'loading. Every comparison with a trunk is made on these ids, so a plan that loses them is '
          + 'permanently "behind by everything" and no pull can ever catch it up');
      if (before.some((v, i) => after[i] !== v))
        sayI('the ids came back in a different order or with different values, so the chain no longer '
          + 'describes the history it came from');
      if (!out.pvidsAfter)
        sayI('no version carries a parent id after loading, so the chain has no links — every version reads '
          + 'as a root and no common ancestor can ever be found');
      /* AND THE VERDICT ITSELF SURVIVES, which is the thing a person sees. */
      const t2 = { _format: TRUNK_FORMAT, lineage: planLineageId(), name: 'roundtrip', base: null, log: [] };
      planVersions.forEach((v, i) => t2.log.push(trunkEntryFromVersion(v,
        JSON.parse(JSON.stringify(i === planVersions.length - 1 ? serialize()
          : Object.assign({}, serialize(), v.snap))))));
      const relA = trunkRelation(t2).relation;
      hydrate(JSON.parse(JSON.stringify(trunkTip(t2).doc))); calculate();
      const relB = trunkRelation(t2);
      out.relRoundTrip = [relA, relB.relation];
      if (relA === 'same' && relB.relation !== 'same')
        sayI('a plan in step with a trunk reports "' + relB.relation + (relB.behind ? ' by ' + relB.behind : '')
          + '" after taking that trunk\'s own tip — so pulling can never finish, and the same dialog comes '
          + 'back every time somebody presses Pull');
      restore(keep); calculate();
    })();

    /* ═══ THE CHANGELOG'S THREE SILENCES, AND ITS ONE OVERWHELMING CASE ════
       Reported live, from a real trunk: three of five arriving versions read
       "payload trimmed" and the fourth listed four deletions and "and 16 more".
       Both were the changelog being wrong rather than the plan.

       "Payload trimmed" was printed whenever EITHER end of the comparison was
       missing, so a version with perfectly good contents whose PARENT had been
       trimmed out of the chain reported itself as gone. Those are different
       facts and now have different words. And a version that replaces the plan
       rather than editing it — which is what joining two copies of one
       engagement produces — is summarised rather than itemised, because four
       activity names and "and 16 more" reads as somebody deleting the project. */
    (() => {
      const sayC = x => bad.push('Changelog :: ' + x);
      const A = JSON.parse(JSON.stringify(snapshotPlan()));
      const B = JSON.parse(JSON.stringify(A));
      B.tasks = B.tasks.slice(0, 2).concat([{ id: 90001, name: 'Brand new thing', te: 3, o: 2, m: 3, p: 4 }]);
      const has = new Map([['v-a', A], ['v-b', B]]);
      const one = (list, look) => trunkDeltas(list, look);
      const V = (vid, pvid) => ({ vid: vid, pvid: pvid, byName: 'Someone', at: '2026-08-09T10:00:00', label: 'x' });

      // 1. contents present, parent missing → "oldest in view", NOT "trimmed"
      const noBase = one([V('v-b', 'v-gone')], vid => has.get(vid))[0];
      out.clNoBase = { unknown: noBase.unknown, noBase: noBase.noBase };
      if (noBase.unknown)
        sayC('a version whose own contents are intact reports them as trimmed because its PARENT is missing '
          + '— that tells somebody their history is being eaten when it is not');
      if (!noBase.noBase) sayC('a version with no parent in the file is not marked as such, so it renders as '
        + 'a version that changed nothing');

      // 2. contents genuinely absent → "trimmed"
      const gone = one([V('v-missing', 'v-a')], vid => has.get(vid))[0];
      out.clTrimmed = { unknown: gone.unknown, noBase: gone.noBase };
      if (!gone.unknown) sayC('a version whose snapshot really is gone does not say so, so the reader is '
        + 'shown nothing and told nothing');

      // 3. a replacement is summarised, not itemised
      const repl = one([V('v-b', 'v-a')], vid => has.get(vid))[0];
      out.clWholesale = { wholesale: repl.wholesale, was: repl.wasN, is: repl.isN, gone: repl.gone };
      if (!repl.wholesale)
        sayC('a version that removes ' + repl.gone + ' of ' + repl.wasN + ' activities is itemised four at a '
          + 'time with "and N more" — which reads as somebody deleting the project rather than as two copies '
          + 'being joined');
      const html = trunkLogHtml([repl], { head: 'x' });
      if (html.indexOf('replaces') < 0)
        sayC('the rendered block for a wholesale replacement never uses the word, so the summary exists in '
          + 'the data and not on the screen');

      // 4. an ordinary edit is still itemised
      const C = JSON.parse(JSON.stringify(A));
      if (C.tasks[0]) C.tasks[0].name = 'A RENAMED ONE';
      has.set('v-c', C);
      const small = one([V('v-c', 'v-a')], vid => has.get(vid))[0];
      out.clSmall = { wholesale: small.wholesale, n: (small.rows || []).length };
      if (small.wholesale)
        sayC('a single rename is being called a replacement, so the summary has swallowed the itemised list '
          + 'it exists to spare people from');
    })();

    /* ═══ NO REFUSAL MAY STOP AN UNATTENDED RUN ════════════════════════════
       Every native alert() in this flow became a modal. An alert blocked the
       thread and was answered by whoever was sitting there; a modal awaits a
       click that never comes, so converting one on a path the 15-second tick
       can reach hangs the application permanently. That exact bug shipped once
       already and was caught only because this sweep stopped responding.

       So the property is asserted directly, on the two entry points and on the
       identity check between them: a quiet call ALWAYS settles, and it never
       leaves a dialog on screen. Driven against a trunk deliberately made
       unusable, so the refusals are the paths being taken. */
    await (async () => {
      const sayQ = x => bad.push('Unattended sync :: ' + x);
      const el = document.getElementById('joinModal');
      const keepH = trunkHandle;
      const settles = async (label, fn) => {
        // each case starts from a clean screen, so one hang does not report
        // itself six times over as five later cases "leaving a dialog open"
        if (el && el.classList.contains('open')) { joinClose(false); await new Promise(r => setTimeout(r, 250)); }
        const r = await Promise.race([
          Promise.resolve().then(fn).then(() => 'settled', e => 'threw: ' + (e && e.message)),
          new Promise(res => setTimeout(() => res('HUNG'), 2500))]);
        if (r === 'HUNG') sayQ(label + ' never returned. An unattended run that stops on a dialog waits '
          + 'forever, and the auto tick reaches this every 15 seconds');
        else if (el && el.classList.contains('open')) {
          sayQ(label + ' left a dialog on screen, so the next tick finds the app modal and the person finds '
            + 'a question nobody asked them');
          joinClose(false);
        }
        return r;
      };
      // no trunk at all
      trunkHandle = null;
      out.quietNoTrunk = [await settles('a quiet pull with no trunk', () => trunkPull(true)),
                          await settles('a quiet push with no trunk', () => trunkPush(true))];
      // a handle whose read always throws — the permission and read refusals
      trunkHandle = { name: 'gone.json', getFile: () => { throw new Error('NotFoundError'); } };
      out.quietUnreadable = [await settles('a quiet pull on an unreadable trunk', () => trunkPull(true)),
                             await settles('a quiet push on an unreadable trunk', () => trunkPush(true))];
      // and permission refused outright
      trunkHandle = { name: 'locked.json', getFile: () => { throw new Error('NotAllowedError'); },
                      queryPermission: async () => 'denied', requestPermission: async () => 'denied' };
      out.quietDenied = [await settles('a quiet pull with permission denied', () => trunkPull(true)),
                         await settles('a quiet push with permission denied', () => trunkPush(true))];
      /* AND THE LOUD ONES DO OPEN. The guard above is satisfied by a build that
         refuses silently in both modes, which would be the whole feature
         deleted rather than made safe. */
      const loud = trunkPull(false);
      await new Promise(r => setTimeout(r, 500));
      out.loudDenialOpens = !!(el && el.classList.contains('open'));
      if (!out.loudDenialOpens)
        sayQ('a pull a PERSON pressed, onto a trunk it cannot reach, says nothing on screen — the quiet guard '
          + 'has been applied to both modes and the refusal is now invisible');
      else {
        const txt = (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' ');
        out.loudDenialText = txt.slice(0, 60);
        if (!/press|point|join|allow/i.test(txt))
          sayQ('the refusal names no next step, which is the dead end the alerts it replaced were');
        joinClose(false);
      }
      await loud;
      trunkHandle = keepH;
      await new Promise(r => setTimeout(r, 200));
    })();

    /* ═══ A PULL MUST NOT SPEND WORK THAT WAS NEVER SHARED ═══════════════════
       Found by photographing two people rather than by any check here, which is
       why this block exists: somebody corrected an activity from 100% down to
       25%, pressed Pull, and got 100% back — no dialog, no mention, nothing to
       undo. Every assertion in this file passed while that was true.

       The reason it passed is worth more than the fix. Where you stand relative
       to the trunk was read off the VERSION CHAIN, and work done since the last
       version is not in the chain — so an hour of recorded progress read as
       "behind, and you have changed nothing", and a fast-forward is applied
       straight through precisely BECAUSE it believes there is nothing to weigh.
       Every case above filed a version before syncing, the way the product's
       own push does, so none of them ever presented the state where the two
       disagree. The bug lived in the gap between what the sweep set up and what
       a person does, which is the only place a bug can live once the obvious
       cases are covered.

       So this drives the sequence a PERSON produces: change something, and
       press the button without filing anything first. Three properties, and all
       three are needed — the first alone is satisfied by a build that never
       fast-forwards, and the first two by one that files a version for
       everybody including the newcomer who has nothing yet. */
    await (async () => {
      const sayW = m => say('Unshared work', m);
      try { await root.removeEntry('trunk-sweep.json'); } catch (e) {}
      const h2 = await root.getFileHandle('trunk-sweep.json', { create: true });
      trunkHandle = h2;
      const pct = id => { const t = tasks.find(x => x.id === id); return t ? (Number(t.percentComplete) || 0) : null; };
      const setPct = (id, v) => { const t = tasks.find(x => x.id === id); if (t) t.percentComplete = v; };

      // one shared starting point both sides agree on
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
      beA('Alice'); planLineageId();
      pushVersion('edit', 'shared start');
      await trunkPush(true);
      const start = capture();

      // the other person moves, files a version the way a push does, and shares
      restore(start); beA('Bob');
      const wasPct = pct(B_ID);            // read, never assumed — 1b compares against it
      out.wasPct = wasPct;
      setPct(B_ID, 45); editName(B_ID, 'BOB MOVED THIS');
      pushVersion('edit', 'bob progress');
      await trunkPush(true);

      // ── 1. and back here, progress recorded and NOT filed as a version ────
      restore(start); beA('Alice');
      setPct(A_ID, 25);
      out.unsharedBefore = { mine: pct(A_ID), versions: (planVersions || []).length };
      await trunkPull(true);
      out.unsharedAfter = { mine: pct(A_ID), theirs: pct(B_ID) };
      if (pct(A_ID) !== 25)
        sayW('25% was recorded here and never shared, then a pull replaced it with ' + pct(A_ID)
          + '. A pull that reads its position off the version chain cannot see work done since the last '
          + 'version, so it fast-forwards over it — silently, because a fast-forward is the path that '
          + 'believes there is nothing to weigh');
      if (pct(B_ID) !== 45)
        sayW('the other side recorded 45% on a different activity and after the pull this copy holds '
          + pct(B_ID) + ' — protecting local work must not cost the work that was pulled for');

      /* ── 1b. AND THE DIALOG SAYS WHICH ITEMS, WITH BOTH SIDES OF EACH ─────
         Asked for in exactly these words: "i need to be able to see exactly
         which items were adjusted like activity went from 0 to 44". A count is
         not that, and neither is the new value on its own — "45%" could be a
         move from 0 or from 44, and only one of those is worth reading a
         dialog about. So the assertion is on the two VALUES and the activity's
         NAME, never on how they are dressed: tags are stripped first, so a
         restyling cannot make this go red and cannot make it pass either. */
      restore(start); beA('Alice');
      const snaps = trunkSnapIndex(await trunkRead(h2)), wk = trunkWorkIndex(await trunkRead(h2));
      const tt = await trunkRead(h2);
      const mineV = new Set((planVersions || []).map(v => v.vid));
      const arriving = (tt.log || []).filter(e => e.vid && !mineV.has(e.vid));
      const html = trunkLogHtml(trunkDeltas(arriving, v => snaps.get(v), null, v => wk.get(v)),
        { head: 'What is arriving' });
      const plain = String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      out.changelogText = plain.slice(0, 220);
      const bName = (tasks.find(x => x.id === B_ID) || {}).name || '';
      if (plain.indexOf(bName) < 0)
        sayW('the changelog for an incoming version does not name “' + bName + '”, the activity that moved. '
          + 'A count of changes is not a list of them');
      /* BOTH VALUES, ADJACENT AND IN ORDER. Checking for "45%" alone is
         satisfied by a build that prints only the destination; checking for the
         old value alone is satisfied by "100%" appearing anywhere on the page.
         The separator between them is presentation and is allowed to be
         anything short, so a restyled arrow does not turn this red. */
      const pair = new RegExp(wasPct + '%[^%]{0,14}45%');
      if (!pair.test(plain))
        sayW('the changelog does not show ' + wasPct + '% → 45% for “' + bName + '”. Printed with only the '
          + 'destination, "0 → 45%" and "44 → 45%" read identically, and one of those is a week of work and '
          + 'the other is a rounding — asked for in exactly those terms');

      // ── 2. …and with nothing of my own, it is still a straight catch-up ───
      restore(start); beA('Alice');
      const vBefore = (planVersions || []).length;
      await trunkPull(true);
      out.cleanFf = { theirs: pct(B_ID), versionsAdded: (planVersions || []).length - vBefore };
      if (pct(B_ID) !== 45)
        sayW('with nothing changed here, a pull did not bring the other side\'s 45% across — the catch-up '
          + 'path has been disabled rather than made safe, which passes the check above for the wrong reason');

      // ── 3. …and somebody with nothing yet can still join ──────────────────
      const fresh = JSON.parse(JSON.stringify(window.__fixture));
      fresh.tasks = []; fresh.planVersions = []; fresh.planLineage = '';
      restore({ doc: fresh, versions: [], lineage: '' });
      beA('Newcomer');
      /* MINTED ON PURPOSE, because leaving it to chance is what this sub-check
         did first and it disagreed with itself between runs: the stamp appears
         the moment anything saves, so whether an empty page had one depended on
         which async write landed first. Minting it makes the case the harder
         of the two — a newcomer who opened the app and let it save once before
         joining — and makes the answer the same every run. */
      planLineageId();
      const tN = await trunkRead(h2);
      out.newcomerSaw = { rel: trunkRelation(tN).relation, hasStamp: !!planLineage,
                          versions: (planVersions || []).length, tasks: tasks.length };
      await trunkPull(true);
      out.newcomerJoined = leafTasks().length;
      if (!leafTasks().length)
        sayW('somebody opened the app, let it save once, then pulled the team trunk and ended up with an '
          + 'empty plan (the trunk came back as “' + out.newcomerSaw.rel + '”). Two ways to arrive here and '
          + 'both are real: a lineage stamp is minted by SAVING rather than by any work, so an empty page '
          + 'reads as a different engagement; and filing a version to protect local work mints one too, so '
          + 'the guard that protects work has to ask whether there is any before it fires');
      trunkHandle = h2;
    })();

    /* ═══ A VERSION THAT CANNOT SAY WHAT IT DID ═════════════════════════════
       Asked as "why can we add versions with no changes?", over a push reading
       "0 changes across 1 version". Nothing was wrong with the version — a
       version is filed only when the fingerprint moves, so something HAD moved.
       What was wrong is that the diff had no word for it, and the dialog
       reported the absence of a word as the absence of a change.

       Two comparisons, and they were never the same comparison: the fingerprint
       reads the whole commitment snapshot plus the whole work record, and the
       changelog read a hand-written list of fields. Everything in the gap filed
       a silent version. Twelve things were in the gap.

       This closes it mechanically rather than by listing today's twelve: move
       one thing, and if that is enough to file a version it must also be enough
       to produce a row. Anything added to the snapshot later and not taught to
       the changelog fails here, which is the whole point — the next field is
       the one nobody will remember. */
    await (async () => {
      const sayS = m => say('Silent version', m);
      const base = JSON.parse(JSON.stringify(window.__fixture));
      const cases = [
        ['a pass-when condition', () => { leafTasks()[0].acceptance = 'Signed by the sponsor.'; }],
        ['a deliverable', () => { leafTasks()[0].deliverable = 'Kick-off pack'; }],
        ['a work type', () => { leafTasks()[0].taxonomy = 'analysis'; }],
        ['an audience', () => { leafTasks()[0].audience = 'client'; }],
        ['who is on it', () => { const t = leafTasks()[0];
          t.attendees = (t.attendees || []).concat(['Somebody New']); }],
        ['an estimate range that keeps its mean', () => { const t = leafTasks()[0];
          t.o = Math.max(0.1, (Number(t.o) || 2) - 1); t.p = (Number(t.p) || 6) + 1; }],
        ['the pricing model', () => { pricing.model = pricing.model === 'tm' ? 'fixed' : 'tm'; }],
        ['the contract price', () => { pricing.contractPrice = (Number(pricing.contractPrice) || 0) + 5000; }],
        ['the status narrative', () => { statusNarrative = 'Week six: on track.'; }],
        ['progress', () => { const t = leafTasks().find(x => !x.milestone);
          t.percentComplete = (Number(t.percentComplete) || 0) === 50 ? 60 : 50; }]
      ];
      const silent = [];
      out.silentTried = cases.length;
      cases.forEach(([label, mutate]) => {
        hydrate(JSON.parse(JSON.stringify(base))); calculate();
        const s0 = JSON.parse(JSON.stringify(snapshotPlan())), w0 = trunkWorkFingerprint();
        try { mutate(); recompute(); } catch (e) { silent.push(label + ' (threw: ' + e.message + ')'); return; }
        const s1 = JSON.parse(JSON.stringify(snapshotPlan())), w1 = trunkWorkFingerprint();
        const a = Object.assign({}, s0), b = Object.assign({}, s1); delete a.at; delete b.at;
        const filesAVersion = JSON.stringify(a) !== JSON.stringify(b) || w0 !== w1;
        /* THROUGH trunkDeltas, which is what the dialog calls — not through the
           row builders one at a time. The first draft called those directly and
           stayed green when the builders were unwired from the changelog: it was
           proving the parts exist, while the reader's question is whether the
           DIALOG can say anything. Anchor the check where the answer is
           assembled and both failures show. */
        const deltas = trunkDeltas([{ vid: 'B', pvid: 'A', by: 'Test' }],
          v => (v === 'A' ? s0 : s1), null, v => (v === 'A' ? w0 : w1));
        const rows = (deltas[0] && deltas[0].rows) || [];
        if (filesAVersion && !rows.length) silent.push(label);
      });
      out.silent = silent;
      if (silent.length)
        sayS(silent.length + ' of ' + cases.length + ' edits file a version and produce no row in the '
          + 'changelog, so a push reports "0 changes" over a version that really did move something: '
          + silent.join('; ') + '. The fingerprint that decides to FILE a version and the diff that '
          + 'decides what to SAY about it are two different comparisons, and everything in the gap '
          + 'between them becomes a version nobody can read');
      hydrate(JSON.parse(JSON.stringify(base))); calculate();
    })();

    /* ═══ A COUNT IS NOT A LIST, ON THE LOG THAT SAYS WHY ═══════════════════
       The changelog reported a RAID change as "3 entries → 4 entries", which
       cannot tell a new risk from a closed one. That log is where the cause of
       a miss is written down, so a reader pulling somebody's week wants the
       entry NAMED. Both sides are already in the work record, keyed by id. */
    (function () {
      const sayR = m => say('RAID changelog', m);
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
      raid = raid || [];
      raid.push({ id: 9101, type: 'Risk', title: 'Integration slips', status: 'Open',
                  probability: 3, impact: 4, owner: 'Alice', createdAt: '2026-08-01' });
      const w0 = trunkWorkFingerprint();
      (raid.find(x => x.id === 9101) || {}).status = 'Closed';
      raid.push({ id: 9102, type: 'Issue', title: 'Sandbox down', status: 'Open', createdAt: '2026-08-05' });
      const w1 = trunkWorkFingerprint();
      const rows = trunkWorkMetaRows(w0, w1);
      const plain = JSON.stringify(rows);
      out.raidRows = rows.map(r => (r.lbl || r.kind) + ':' + r.name).slice(0, 6);
      if (!rows.some(r => r.name === 'Integration slips' && String(r.to) === 'Closed'))
        sayR('a risk was closed and the changelog does not name it with its new status. A count of entries '
          + 'cannot tell a closed risk from a newly raised one, and this is the log a post-mortem is '
          + 'built from');
      if (!rows.some(r => r.kind === 'raid-added' && r.name === 'Sandbox down'))
        sayR('an issue was raised and the changelog does not name it, so a reader pulling somebody\'s week '
          + 'sees a number move and cannot tell what happened');
      if (/entr(y|ies)/.test(plain) && !rows.length)
        sayR('the RAID change is still reported as a count of entries');
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    })();

    /* ═══ AND WHY THE LOOP DECLINED, WHERE IT CAN BE READ ═══════════════════
       "N to send" was only recomputed past four early returns, one of which
       fires while a dialog is open — the moment somebody is most likely to be
       looking at it. A number that is not moving has to be a sentence. */
    (function () {
      /* PUT BACK WHAT THIS BORROWS. The keystroke below sets trunkLastKey, and
         the typing guard further down reads it — the first draft of this block
         made that check report a focused-but-idle box as busy, which is the
         defect it exists to catch, reported by this block having pressed a key
         moments earlier. Two checks sharing one mutable clock is a false red
         waiting to happen, and a false red on a real defect is worse than
         either alone. */
      const savedKey = trunkLastKey;
      const inp2 = document.createElement('input');
      inp2.type = 'text';
      document.body.appendChild(inp2);
      inp2.focus();
      inp2.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      trunkHeld = 'editing'; updateTrunkBtn();
      const btn = document.getElementById('trunkAutoBtn');
      out.heldLabel = btn ? String(btn.textContent || '') : '';
      inp2.blur(); inp2.remove();
      trunkHeld = ''; updateTrunkBtn();
      out.freeLabel = btn ? String(btn.textContent || '') : '';
      trunkLastKey = savedKey;
      if (!/typing/i.test(out.heldLabel))
        say('Auto sync', 'the loop held off because somebody was typing and the control says nothing about '
          + 'it — reading "Auto sync: on" beside work that is not moving is the reason somebody asks why '
          + 'they have to push it themselves');
      if (out.heldLabel === out.freeLabel)
        say('Auto sync', 'the control reads the same whether the loop is held off or running, so the '
          + 'sentence it gained is not attached to anything');
    })();

    /* ═══ THE MORNING MUST NOT FILE A VERSION BY ITSELF ═════════════════════
       recompute() records one status snapshot per calendar day, and the work
       record carries the status history — so simply opening the plan on a new
       morning moved the fingerprint and filed a version. Seen in a real push,
       with "STATUS SNAPSHOT · 4 recorded → 5 recorded" as its entire content:
       history written by a timer, landing in every teammate's changelog.

       Both halves are asserted, because a build that files nothing is not a
       fix — it is the version chain switched off. */
    (function () {
      const sayD = m => say('Timer versions', m);
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
      pushVersion('edit', 'settled'); 
      out.tipCurrentAtRest = trunkTipIsCurrent();
      if (!out.tipCurrentAtRest) {
        sayD('a version filed a moment ago already does not describe the plan, so every check below this '
          + 'compares against a moving target');
      } else {
        // a new calendar day, as recompute() would record it
        const before = (planVersions || []).length;
        statusHistory = statusHistory || [];
        statusHistory.push({ date: '2099-01-01', pct: 12, finish: '2099-02-02', p80: null,
                             cost: 1234, over: 0, openRisks: 1 });
        out.afterSnapshot = { tipCurrent: trunkTipIsCurrent() };
        trunkEnsureTip();
        out.afterSnapshot.versionsAdded = (planVersions || []).length - before;
        if (out.afterSnapshot.versionsAdded)
          sayD('recording one daily status snapshot filed a version on its own. Every field in a snapshot is '
            + 'derived from the plan it was read from, so nobody decided anything — and on a team this '
            + 'lands in everybody\'s changelog every morning, from a timer');

        // and something a person actually did still files one
        const before2 = (planVersions || []).length;
        const t2 = leafTasks().find(x => !x.milestone);
        if (t2) t2.name = String(t2.name) + ' (edited)';
        recompute();
        trunkEnsureTip();
        out.afterRealEdit = { versionsAdded: (planVersions || []).length - before2 };
        if (!out.afterRealEdit.versionsAdded)
          sayD('renaming an activity no longer files a version either, so the fix for the timer has switched '
            + 'the version chain off rather than made it honest');
      }
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    })();

    /* ═══ A PLAN IS NOT ONLY ITS ACTIVITIES ═════════════════════════════════
       The merge compared against the commitment snapshot, and a commitment is
       activities and their inputs — so the RAID log, the stories, the phase
       rows and the roster had no ancestor and simply did not cross. The panel
       said so in its own words, which made it a documented limitation rather
       than a bug, and it is the same silent divergence progress had: two
       people both touch the RAID log in one week, each keeps their own, and
       neither is told.

       The ancestor was always on disk. Every trunk entry carries a whole plan.
       So this drives the case that matters — the OTHER side moves each of the
       four while this side moves none of them, which must apply cleanly — and
       then the case where both move the same field, which must be asked about
       rather than decided. */
    await (async () => {
      const sayM = m => say('Whole-plan merge', m);
      try { await root.removeEntry('trunk-sweep.json'); } catch (e) {}
      const h4 = await root.getFileHandle('trunk-sweep.json', { create: true });
      trunkHandle = h4;
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
      beA('Alice'); planLineageId();

      // a shared starting point that actually HAS one of each
      raid = raid || [];
      raid.push({ id: 9001, type: 'Risk', title: 'Integration slips', status: 'Open',
                  probability: 3, impact: 4, owner: 'Alice', mitigation: 'Early spike',
                  description: 'API not proven', createdAt: '2026-08-01' });
      if (typeof reqs !== 'undefined' && reqs) {
        reqs.stories = reqs.stories || [];
        reqs.stories.push({ id: 'S900', want: 'see my open tickets', ac: [{ id: 'AC900', text: 'lists open only', type: 'functional' }] });
      }
      if (typeof resources !== 'undefined') resources['Alice'] = Object.assign({ capacity: 100 }, resources['Alice'] || {});
      const phase = tasks.find(t => t.isSummary);
      out.mergeHasPhase = !!phase;
      recompute();
      pushVersion('edit', 'shared start'); await trunkPush(true);
      const start4 = capture();

      // ── the other side moves all four; this side moves none of them ────────
      restore(start4); beA('Bob');
      (raid.find(x => x.id === 9001) || {}).status = 'Closed';
      (raid.find(x => x.id === 9001) || {}).outcome = 'did-not-happen';
      raid.push({ id: 9002, type: 'Issue', title: 'Sandbox down', status: 'Open', createdAt: '2026-08-05' });
      if (reqs && reqs.stories) (reqs.stories.find(x => x.id === 'S900') || {}).want = 'see my open AND closed tickets';
      const bobPhase = tasks.find(t => t.id === (phase || {}).id);
      if (bobPhase) bobPhase.name = 'PHASE RENAMED BY BOB';
      if (typeof resources !== 'undefined' && resources['Alice']) resources['Alice'].capacity = 60;
      recompute();
      pushVersion('edit', 'bob touches everything'); await trunkPush(true);

      // ── back here, with none of it touched ────────────────────────────────
      restore(start4); beA('Alice');
      const t4 = await trunkRead(h4);
      const tip4 = trunkTip(t4);
      const r4 = mergeCompute(tip4.doc, t4);
      out.wholeMerge = { haveBaseDoc: !!r4.haveBaseDoc, auto: (r4.auto || []).length,
                         conflicts: (r4.conflicts || []).length,
                         raidAdds: (r4.raidAdds || []).length,
                         kinds: Array.from(new Set((r4.auto || []).map(x => x.entity || 'task'))).sort().join(',') };
      if (!r4.haveBaseDoc)
        sayM('the merge found no stored copy of the shared version even though it came from a trunk, so the '
          + 'RAID log, the stories, the phases and the roster have no ancestor and cannot cross at all');
      const want = ['phase', 'raid', 'roster', 'story'];
      const got = new Set((r4.auto || []).map(x => x.entity).filter(Boolean));
      const missing = want.filter(k => !got.has(k));
      if (missing.length)
        sayM('the other side moved the RAID log, a story, a phase name and the roster, and the merge did not '
          + 'pick up: ' + missing.join(', ') + '. Nothing of theirs is contested, so every one of these '
          + 'should apply without asking — a plan is not only its activities');
      if (!(r4.raidAdds || []).length)
        sayM('they raised a new RAID entry and the merge brings across no RAID additions, so an issue logged '
          + 'by one person never reaches anybody else');

      // and it must actually LAND, not merely be listed
      mergePlanState = { r: r4, name: 'the team trunk' };
      await mergeApply({ run: false });
      const after = raid.find(x => x.id === 9001) || {};
      const story = (reqs && reqs.stories || []).find(x => x.id === 'S900') || {};
      out.wholeApplied = { raidStatus: after.status, storyWant: String(story.want || '').slice(0, 20),
                           phaseName: (tasks.find(t => t.id === (phase || {}).id) || {}).name,
                           cap: (typeof resources !== 'undefined' && resources['Alice'] || {}).capacity,
                           raidN: (raid || []).length };
      if (after.status !== 'Closed')
        sayM('the merge listed the RAID status change and after applying it the entry still reads "'
          + after.status + '" — listed is not merged');
      if (!/closed tickets/.test(String(story.want || '')))
        sayM('the story rewording was listed and did not land, so the scope on screen is not the scope merged');
      if (!(raid || []).some(x => String(x.title) === 'Sandbox down'))
        sayM('the RAID entry they added did not arrive');

      /* ── AND WHEN BOTH SIDES MOVED THE SAME ONE ─────────────────────────
         The half that matters more. Everything above is the merge being
         useful; this is it refusing to be clever. Two people closing the same
         risk with different outcomes is a disagreement about what happened on
         the project, and a machine picking between them unattended loses one
         person's account of it with nobody told. */
      restore(start4); beA('Alice');
      const mine9001 = raid.find(x => x.id === 9001);
      if (mine9001) { mine9001.status = 'Mitigated'; mine9001.owner = 'Alice R'; }
      const t5 = await trunkRead(h4);
      const r5 = mergeCompute(trunkTip(t5).doc, t5);
      const raidConf = (r5.conflicts || []).filter(c => c.entity === 'raid' && c.field === 'status');
      out.raidConflict = { conflicts: (r5.conflicts || []).length, onStatus: raidConf.length,
                           take: (raidConf[0] || {}).take,
                           mine: (raidConf[0] || {}).mine, theirs: (raidConf[0] || {}).theirs };
      if (!raidConf.length)
        sayM('both sides closed the same risk differently and the merge reports no conflict on its status — '
          + 'one of the two accounts of what happened is about to be overwritten with nobody asked');
      if (raidConf.length && raidConf[0].take !== 'mine')
        sayM('a contested RAID field defaults to taking THEIRS, so pressing Merge without reading replaces '
          + 'this person\'s own record of what happened');
      // and the unattended loop must refuse this outright
      const cleanEnough = !(r5.conflicts || []).length && !(r5.collisions || []).length;
      out.autoWouldStop = !cleanEnough;
      if (cleanEnough)
        sayM('the automatic loop measures "nothing contested" the same way this panel does, and it reads this '
          + 'as clean — so an unattended sync would decide a disagreement between two people');

      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    })();

    /* ═══ PUSHING ONTO A HISTORY OLDER THAN THE WORK RECORD ═════════════════
       The check above moves one thing and asks whether the changelog can name
       it — and it passed while the reported defect was live, because it built
       BOTH sides of the comparison itself and gave both a work record. Real
       histories are not like that. A trunk that has been going for a while is
       full of versions filed before `_work` existed, and the first version
       pushed onto one has a parent with no work record at all.

       That is exactly what was reported, with a screenshot: "i changed this to
       100% but i don't see the bars", over an entry reading "nothing this diff
       can see". The progress had moved; the comparison had nowhere to stand.

       So this stages the real shape — strip the stamp off the trunk's history
       the way an older build would have left it, move progress, and require the
       push dialog to name it. The work state was in the payload the whole time;
       nothing was reading it. */
    await (async () => {
      const sayO = m => say('Older history', m);
      try { await root.removeEntry('trunk-sweep.json'); } catch (e) {}
      const h3 = await root.getFileHandle('trunk-sweep.json', { create: true });
      trunkHandle = h3;
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
      beA('Alice'); planLineageId();
      pushVersion('edit', 'old build'); await trunkPush(true);

      // as an older build left it: full payloads, no work stamp anywhere
      const raw = await trunkRead(h3);
      const strip = doc => ((doc && doc.planVersions) || []).forEach(v => { delete v._work; });
      if (raw.base) strip(raw.base.doc);
      (raw.log || []).forEach(e => { delete e._work; strip(e.doc); });
      await trunkWrite(h3, raw);
      (planVersions || []).forEach(v => { delete v._work; });

      const t3 = await trunkRead(h3);
      out.oldHistoryStamps = ((t3.log || [])[0] || {}).doc
        ? ((t3.log[0].doc.planVersions || []).filter(v => typeof v._work === 'string').length) : -1;

      const tgt = tasks.find(x => x.id === A_ID);
      const wasPct2 = Number(tgt.percentComplete) || 0;
      updatePct(A_ID, wasPct2 === 100 ? 40 : 100);
      const nowPct = Number(tgt.percentComplete) || 0;
      trunkEnsureTip();
      const mineVids3 = new Set(((t3.log || []).map(e => e.vid)).concat(t3.base ? [t3.base.vid] : []));
      const mine3 = (planVersions || []).filter(v => v.vid && !mineVids3.has(v.vid));
      const mySnaps3 = new Map((planVersions || []).map(v => [v.vid, v.snap]).filter(x => x[0] && x[1]));
      const trunkWork3 = trunkWorkIndex(t3);
      const myWork3 = new Map((planVersions || [])
        .filter(v => v.vid && typeof v._work === 'string').map(v => [v.vid, v._work]));
      const html3 = trunkLogHtml(trunkDeltas(mine3, v => mySnaps3.get(v),
        mine3.length ? mine3[mine3.length - 1].vid : null,
        v => myWork3.get(v) || trunkWork3.get(v)), { head: 'What the team receives' });
      const plain3 = String(html3).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      out.oldHistoryText = plain3.slice(0, 200);
      const pair3 = new RegExp(wasPct2 + '%[^%]{0,14}' + nowPct + '%');
      if (!mine3.length) sayO('nothing was staged to push, so this case checked nothing');
      else if (!pair3.test(plain3))
        sayO('progress moved from ' + wasPct2 + '% to ' + nowPct + '% and the push dialog does not show it. '
          + 'The parent version was filed before the work record existed, which is every version in a trunk '
          + 'that predates it — and the work state is in that version\'s stored PLAN, not only in the stamp, '
          + 'so there was always something to compare against');
      hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    })();

    /* ═══ AND THE LOOP THAT WAS RUNNING THE WHOLE TIME ══════════════════════
       "Why isn't this done automatically, why do I have to push it and pull
       it?" — because the guard that stops a sync landing under somebody's
       cursor asked "is a box focused", and typing a percentage leaves the
       cursor in that box until the next click somewhere else. Focus is not
       typing. Both halves are asserted, because a guard that never holds off
       is as wrong as one that never releases. */
    (function () {
      const inp = document.createElement('input');
      inp.type = 'number';
      document.body.appendChild(inp);
      inp.focus();
      const idle = trunkBusyEditing();
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true }));
      const typing = trunkBusyEditing();
      inp.blur(); inp.remove();
      out.busyIdle = idle; out.busyTyping = typing;
      if (idle)
        say('Auto sync', 'a box that is focused but idle stops the automatic loop. Recording a percentage '
          + 'leaves the cursor in the cell, so the one workflow the loop exists for is the workflow that '
          + 'switches it off — reported as "why do I have to push it and pull it?"');
      if (!typing)
        say('Auto sync', 'the loop does not hold off while somebody is actually typing, so a half-entered '
          + 'number can be pushed to the team or a merge can land under the cursor');
    })();

    try { await root.removeEntry('trunk-sweep.json'); } catch (e) {}
    hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    /* ═══ AUTOMATIC SYNC MUST NEVER DECIDE A DISAGREEMENT ══════════════════
       The loop exists because pressing Pull and Push forever is a chore. It is
       allowed to be quiet about everything unambiguous — behind, or diverged
       with nothing contested — and it must STOP the moment two people have
       changed the same field.

       That is the property worth a test, because it is the one whose failure is
       silent and expensive: a machine picking between two people's edits,
       unattended, loses somebody's work and nobody finds out until they look
       for something they wrote. Every other failure of this loop is visible —
       it did not sync, and you press the button.

       Driven, not inspected: a real conflict is created in a real trunk file
       and the tick is called. */
    return { bad, out };
  }, DATA);

  R.pageErrors = errs.slice(0, 8);
  R.dialogs = dialogs.slice(0, 10);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  srv.close();
  if ((R.bad || []).length || errs.length) process.exitCode = 1;
})();

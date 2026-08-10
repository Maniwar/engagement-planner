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

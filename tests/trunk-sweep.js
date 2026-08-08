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

    try { await root.removeEntry('trunk-sweep.json'); } catch (e) {}
    hydrate(JSON.parse(JSON.stringify(window.__fixture))); calculate();
    return { bad, out };
  }, DATA);

  R.pageErrors = errs.slice(0, 8);
  R.dialogs = dialogs.slice(0, 10);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  srv.close();
  if ((R.bad || []).length || errs.length) process.exitCode = 1;
})();

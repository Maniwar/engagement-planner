/* ═══════════════════════════════════════════════════════════════════════════
   TWO PEOPLE, ONE SHARED FILE, PHOTOGRAPHED.

   Asked for directly: "i want to see visual evidence of different users
   updating statuses and percentages completion and it working with the auto
   sync and push pull".

   Everything else in tests/ answers with a number. This answers with pictures,
   because the thing being claimed — that two people can work on one engagement
   and each end up holding the other's status — is a claim about what somebody
   SEES, and a green assertion has never once convinced anybody of that.

   ── WHAT MAKES IT REAL ───────────────────────────────────────────────────

   Two separate browser CONTEXTS, which is two separate laptops as far as the
   product is concerned: separate localStorage, separate IndexedDB, separate
   identity, separate plan state. Neither can see the other's memory.

   Between them, ONE FILE on disk. The trunk handle each page holds implements
   the two methods the product actually calls — getFile().text() and
   createWritable().write() — against that file through Node. So trunkRead,
   trunkWrite, trunkRelation, trunkEnsureTip, the push dialog, the changelog and
   the auto-sync tick all run exactly the code a person runs. Nothing here
   reaches past the product to move data.

   The check-offs are made through the PRODUCT's own path — the same function
   the check-off control calls — rather than by assigning to a field, so what is
   photographed is the feature and not a fixture.

   ── WHAT IT ASSERTS ──────────────────────────────────────────────────────

   Pictures alone are theatre; a demo that cannot fail is an advertisement. So
   every step also asserts the thing the picture is supposed to show, and the
   run goes red if a claim and its screenshot disagree — the numbers on Bob's
   screen must be the numbers Alice typed, and they are compared, not eyeballed.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PRODUCT = ['index.html', 'pert-gantt-tracker.html']
  .find(n => fs.existsSync(path.join(ROOT, n))) || 'index.html';
const OUT = process.env.DEMO_OUT || path.join(ROOT, 'demo');
const DATA = FIXTURE();

/* Served over http rather than opened from file://, because two contexts on
   file:// do not share an origin and the product's own storage would behave
   differently from the way it does for anybody using it. */
function serveApp(html) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

const shots = [];
async function shot(page, name, caption) {
  const file = path.join(OUT, String(shots.length + 1).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: file });
  shots.push({ file: path.basename(file), name, caption });
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, PRODUCT), 'utf8');
  const { srv, url } = await serveApp(html);
  const TRUNK = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'demo-trunk-')), 'team-trunk.json');
  fs.writeFileSync(TRUNK, '');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const bad = [], notes = [];
  const say = x => bad.push(x);

  /* A person, as the product sees one: their own browser, their own name, and a
     handle onto the shared file that implements exactly the two methods the
     product calls on it. */
  async function person(name, opts) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.exposeFunction('__trunkRead', () => fs.readFileSync(TRUNK, 'utf8'));
    await page.exposeFunction('__trunkWrite', txt => { fs.writeFileSync(TRUNK, txt); return true; });
    await page.addInitScript(who => { try { localStorage.setItem('pertGantt.whoAmI', who); } catch (e) {} }, name);
    await page.goto(url, { waitUntil: 'load' });
    /* THE SECOND PERSON ARRIVES EMPTY, which is what actually happens. The
       first draft gave both of them the same fixture and had Bob pull, and the
       product correctly refused: two plans conjured independently mint
       different lineage stamps and ARE two different engagements, whatever
       they contain. Nobody joins a team by separately inventing the same
       project — they open the app and join the trunk. */
    if (!(opts && opts.empty)) {
      await page.evaluate(d => { hydrate(d); calculate(); refreshAll(); }, DATA);
    }
    await page.waitForTimeout(600);
    await page.evaluate(n => {
      trunkSetWho(n, n.toLowerCase().replace(/\s+/g, '.') + '@example.com');
      trunkHandle = {
        kind: 'file', name: 'team-trunk.json',
        getFile: async () => ({ text: async () => await window.__trunkRead() }),
        createWritable: async () => ({
          write: async t => { await window.__trunkWrite(t); },
          close: async () => {} })
      };
      updateTrunkBtn();
    }, name);
    return { name, ctx, page, errs };
  }

  const alice = await person('Alice Rivera');
  const bob = await person('Bob Nguyen', { empty: true });   // a new teammate, joining

  /* The product's own check-off path, so what is demonstrated is the feature.
     Returns what the plan holds afterwards, which is what the assertions
     compare against — never the value that was requested. */
  const setProgress = (p, name, pct) => p.page.evaluate(({ nm, v }) => {
    const t = leafTasks().find(x => !x.isSummary && !x.milestone && x.name.indexOf(nm) >= 0)
           || leafTasks().find(x => !x.isSummary && !x.milestone);
    if (!t) return null;
    /* updatePct is what the check-off box and the % cell both call, and there
       is deliberately no fallback. The first draft guessed a function name that
       does not exist, silently took a branch that assigned the field directly,
       and went on claiming in its own header that it drove the product's path.
       The harness-meta check found it by resolving every call in this file
       against the application — which is the only reason the claim and the code
       say the same thing now. */
    updatePct(t.id, v);
    refreshAll();
    return { id: t.id, name: t.name, pct: t.percentComplete, effort: t.actualEffort || 0 };
  }, { nm: name, v: pct });

  const readPct = (p, id) => p.page.evaluate(i => {
    const t = tasks.find(x => x.id === i);
    return t ? { name: t.name, pct: t.percentComplete, effort: t.actualEffort || 0 } : null;
  }, id);

  const goTasks = async p => { await p.page.evaluate(() => switchTab('tasks')); await p.page.waitForTimeout(500); };

  // ── 1. Alice records progress ──────────────────────────────────────────
  await goTasks(alice);
  const a1 = await setProgress(alice, 'Discovery', 60);
  const a2 = await setProgress(alice, 'Requirements', 35);
  await alice.page.waitForTimeout(400);
  notes.push('Alice set ' + (a1 && a1.name) + ' to ' + (a1 && a1.pct) + '% and '
    + (a2 && a2.name) + ' to ' + (a2 && a2.pct) + '%');
  await shot(alice.page, 'alice-records-progress',
    'Alice records progress on two activities. Nothing has been shared yet.');
  if (!a1 || a1.pct !== 60) say('Alice set 60% and the plan holds ' + (a1 && a1.pct)
    + ' — the demo cannot show sharing a number the product did not accept');

  // ── 2. Alice pushes: the question, the run, the result ─────────────────
  const push1 = alice.page.evaluate(() => trunkPush(false));
  await alice.page.waitForTimeout(1600);
  await shot(alice.page, 'alice-push-question',
    'Push asks first, and names what the team receives — who changed what, and the totals.');
  const askTxt = await alice.page.evaluate(() =>
    (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' '));
  if (askTxt.indexOf('Alice Rivera') < 0)
    say('the push question does not name Alice, so the changelog is not signed');
  await alice.page.evaluate(() => document.getElementById('joinGo').click());
  await alice.page.waitForTimeout(700);
  await shot(alice.page, 'alice-push-running', 'The dialog becomes the work: each step reports what it did.');
  await push1;
  await alice.page.waitForTimeout(900);
  await shot(alice.page, 'alice-push-done', 'The closing frame, rather than a toast that vanishes.');
  await alice.page.evaluate(() => joinClose(true));
  const onDisk1 = JSON.parse(fs.readFileSync(TRUNK, 'utf8') || '{}');
  notes.push('the shared file now holds ' + ((onDisk1.log || []).length) + ' version(s)');
  if (!(onDisk1.log || []).length) say('Alice pushed and the shared file on disk is still empty');

  // ── 3. Bob pulls and gets Alice's status ───────────────────────────────
  await goTasks(bob);
  const bobCountBefore = await bob.page.evaluate(() => tasks.length);
  await shot(bob.page, 'bob-before-joining',
    'Bob opens the app on a different machine. Empty — he has never seen this engagement.');
  if (bobCountBefore) say('Bob is meant to be starting empty and already holds ' + bobCountBefore
    + ' activities, so nothing below shows a join');
  const pull1 = bob.page.evaluate(() => trunkPull(false));
  await bob.page.waitForTimeout(1600);
  await shot(bob.page, 'bob-join-question', 'Joining: what is arriving, and from whom.');
  const pullTxt = await bob.page.evaluate(() =>
    (document.getElementById('joinBody').innerText || '').replace(/\s+/g, ' '));
  notes.push('Bob\'s joining dialog said: ' + pullTxt.slice(0, 90));
  await bob.page.evaluate(() => document.getElementById('joinGo').click());
  await bob.page.waitForTimeout(900);
  await bob.page.evaluate(() => { if (document.getElementById('joinModal').classList.contains('open')) joinClose(true); });
  await pull1;
  await bob.page.waitForTimeout(800);
  await goTasks(bob);
  await shot(bob.page, 'bob-after-join',
    'Bob now holds the whole engagement, including Alice’s progress. Same plan, two machines.');
  const bobAfter = a1 ? await readPct(bob, a1.id) : null;
  notes.push('after pulling, Bob shows ' + (bobAfter && bobAfter.name) + ' at ' + (bobAfter && bobAfter.pct) + '%');
  if (!bobAfter || bobAfter.pct !== 60)
    say('Alice recorded 60% and after a pull Bob shows ' + (bobAfter && bobAfter.pct)
      + ' — the picture and the plan disagree, and the plan is what matters');

  // ── 4. Bob records his own, on a different activity, and pushes ────────
  const b1 = await setProgress(bob, 'Solution', 80);
  await bob.page.waitForTimeout(400);
  await shot(bob.page, 'bob-records-progress',
    'Bob records his own progress on a different activity: ' + (b1 && b1.name) + ' at ' + (b1 && b1.pct) + '%.');
  const push2 = bob.page.evaluate(() => trunkPush(false));
  await bob.page.waitForTimeout(1500);
  await shot(bob.page, 'bob-push-question', 'Bob shares. The trunk already holds Alice’s work, and a push only adds.');
  await bob.page.evaluate(() => document.getElementById('joinGo').click());
  await push2;
  await bob.page.waitForTimeout(1000);
  await bob.page.evaluate(() => { if (document.getElementById('joinModal').classList.contains('open')) joinClose(true); });

  // ── 5. Alice catches up through the AUTOMATIC tick, not a button ───────
  const tickName = await alice.page.evaluate(() =>
    typeof trunkAutoTick === 'function' ? 'trunkAutoTick' : '');
  if (!tickName) { notes.push('no automatic tick function is exposed, so this step used Pull'); }
  await alice.page.evaluate(async () => {
    trunkPaused = ''; trunkAuto = true;
    if (typeof trunkAutoTick === 'function') await trunkAutoTick();
    else await trunkPull(true);
  });
  await alice.page.waitForTimeout(1600);
  await alice.page.evaluate(() => { const m = document.getElementById('joinModal');
    if (m && m.classList.contains('open')) { document.getElementById('joinGo').click(); } });
  await alice.page.waitForTimeout(1200);
  await alice.page.evaluate(() => { const m = document.getElementById('joinModal');
    if (m && m.classList.contains('open')) joinClose(true); });
  await goTasks(alice);
  await shot(alice.page, 'alice-after-autosync',
    'Alice pressed nothing. The automatic tick brought Bob’s work across.');
  const aliceHasBob = b1 ? await readPct(alice, b1.id) : null;
  notes.push('after the automatic tick, Alice shows ' + (aliceHasBob && aliceHasBob.name) + ' at '
    + (aliceHasBob && aliceHasBob.pct) + '%');
  if (!aliceHasBob || aliceHasBob.pct !== 80)
    say('Bob recorded 80% and Alice shows ' + (aliceHasBob && aliceHasBob.pct)
      + ' after the automatic sync — the loop did not bring his work across');

  /* ── 6. THE CASE THAT NEEDED THE PRODUCT FIXED ─────────────────────────
     Everything above is one person moving at a time, which a fast-forward
     handles: the whole document is taken. The interesting case is both moving
     at once, because then the pull is a MERGE, and a merge copies a named list
     of fields — a list that described the plan as agreed and said nothing about
     what had been done. Progress, time logged, actuals and invoicing were all
     outside it, so two people working the same week each kept their own status
     and neither was told. Found by this demo, fixed in MERGE_FIELDS, and this
     is the round that proves it rather than asserting it. */
  const a3 = await setProgress(alice, 'Data', 25);
  const b3 = await setProgress(bob, 'Integration', 45);
  notes.push('both then moved at once: Alice ' + (a3 && a3.name) + ' → ' + (a3 && a3.pct)
    + '%, Bob ' + (b3 && b3.name) + ' → ' + (b3 && b3.pct) + '%');
  await goTasks(alice); await shot(alice.page, 'both-move-alice', 'Round two: Alice moves one activity…');
  await goTasks(bob); await shot(bob.page, 'both-move-bob', '…and at the same time, Bob moves another.');
  /* NOT awaited here. trunkPush blocks on its own dialog, and an awaited
     evaluate cannot return until the push resolves — so the click that would
     answer it can never be sent and the whole demo deadlocks. Fire it, answer
     it, then join the promise. */
  const push3 = bob.page.evaluate(() => trunkPush(false));
  await bob.page.waitForTimeout(1400);
  await bob.page.evaluate(() => { const m = document.getElementById('joinModal');
    if (m && m.classList.contains('open')) document.getElementById('joinGo').click(); });
  await bob.page.waitForTimeout(1400);
  await bob.page.evaluate(() => { const m = document.getElementById('joinModal');
    if (m && m.classList.contains('open')) joinClose(true); });
  await push3.catch(() => {});
  const pull3 = alice.page.evaluate(() => trunkPull(false));
  await alice.page.waitForTimeout(1600);
  await shot(alice.page, 'alice-merge-question',
    'Alice pulls with both of them moved. Nothing conflicts — different activities — so it merges.');
  await alice.page.evaluate(() => { const m = document.getElementById('joinModal');
    if (m && m.classList.contains('open')) document.getElementById('joinGo').click(); });
  await alice.page.waitForTimeout(1500);
  await alice.page.evaluate(() => { const m = document.getElementById('joinModal');
    if (m && m.classList.contains('open')) joinClose(true); });
  await pull3.catch(() => {});
  await goTasks(alice);
  await shot(alice.page, 'alice-after-merge',
    'Alice keeps her own figure and gains Bob’s. This is the case the merge used to drop.');
  const mineKept = a3 ? await readPct(alice, a3.id) : null;
  const theirsTaken = b3 ? await readPct(alice, b3.id) : null;
  notes.push('after the merge Alice holds her own ' + (mineKept && mineKept.pct) + '% and Bob\'s '
    + (theirsTaken && theirsTaken.pct) + '%');
  if (!mineKept || mineKept.pct !== 25)
    say('Alice recorded ' + (a3 && a3.pct) + '% and after merging holds ' + (mineKept && mineKept.pct)
      + ' — the merge overwrote her own progress with the other side');
  if (!theirsTaken || theirsTaken.pct !== 45)
    say('Bob recorded 45% on a DIFFERENT activity and after the merge Alice holds '
      + (theirsTaken && theirsTaken.pct) + '. A merge copies a named list of fields, and progress used to '
      + 'be missing from it — two people working the same week each kept their own status silently');

  // ── 7. and both machines agree, on both people's numbers ──────────────
  const finalA = { a: a1 ? await readPct(alice, a1.id) : null, b: b1 ? await readPct(alice, b1.id) : null };
  const finalB = { a: a1 ? await readPct(bob, a1.id) : null, b: b1 ? await readPct(bob, b1.id) : null };
  notes.push('Alice ends holding ' + JSON.stringify(finalA) + '; Bob ends holding ' + JSON.stringify(finalB));
  if (JSON.stringify(finalA) !== JSON.stringify(finalB))
    say('the two machines do not agree at the end: ' + JSON.stringify(finalA) + ' vs ' + JSON.stringify(finalB));

  const errs = [].concat(alice.errs, bob.errs);
  await browser.close();
  srv.close();

  const R = { shots: shots, notes: notes, contradictions: bad, pageErrors: errs.slice(0, 6),
              trunkFile: TRUNK, out: OUT };
  fs.writeFileSync(path.join(OUT, 'demo.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R, null, 1));
  if (bad.length || errs.length) process.exitCode = 1;
})();

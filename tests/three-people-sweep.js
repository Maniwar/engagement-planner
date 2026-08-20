/* ═══════════════════════════════════════════════════════════════════════════
   THREE PEOPLE, ONE FILE.

   The two-person demo found a defect no assertion here could: a pull that
   fast-forwarded over unshared work. It found it because it stopped modelling a
   colleague and went and got one — two real browser contexts, one real file on
   disk. This does the same for the number that actually turns up on an
   engagement.

   Three is not two plus one. With two people the trunk only ever moves under
   somebody who is not looking; with three it moves WHILE THEY ARE PUSHING, and
   the cases that follow from that do not exist at a smaller size:

     · two people push before the third pulls, so one pull has to carry a chain
       rather than a version
     · somebody pushes onto a trunk that moved after they read it — the stale
       push, which is the one a whole-file sync silently eats
     · the third person is holding unshared work of their own while the other
       two converge

   Everything here runs quiet (trunkPush(true) / trunkPull(true)), which is the
   unattended path. That is deliberate: a dialog is a person deciding, and the
   property worth asserting is what happens when nobody is there to decide.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PRODUCT = ['index.html', 'pert-gantt-tracker.html']
  .find(n => fs.existsSync(path.join(ROOT, n))) || 'index.html';
const DATA = FIXTURE();

(async () => {
  /* APP_FILE, like every other sweep. This read the repo's own copy by path —
     the one build no mutant is ever applied to, because the engine delivers a
     mutated build exclusively through APP_FILE (see _harness.js). So every
     mutant "survived" this sweep by construction, and its assertions could
     never be the one that went red. Found by pointing APP_FILE at a file that
     does not exist: the sweep passed. */
  const html = fs.readFileSync(process.env.APP_FILE || path.join(ROOT, PRODUCT), 'utf8');
  const srv = http.createServer((q, s) => {
    s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(html);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const TRUNK = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trio-')), 'team-trunk.json');
  fs.writeFileSync(TRUNK, '');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const bad = [], notes = [], errs = [];
  const say = m => bad.push(m);

  async function person(name, opts) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errs.push(name + ': ' + e.message));
    await page.exposeFunction('__trunkRead', () => fs.readFileSync(TRUNK, 'utf8'));
    await page.exposeFunction('__trunkWrite', txt => { fs.writeFileSync(TRUNK, txt); return true; });
    await page.addInitScript(who => { try { localStorage.setItem('pertGantt.whoAmI', who); } catch (e) {} }, name);
    await page.goto(url, { waitUntil: 'load' });
    if (!(opts && opts.empty)) await page.evaluate(d => { hydrate(d); calculate(); refreshAll(); }, DATA);
    await page.waitForTimeout(500);
    await page.evaluate(n => {
      trunkSetWho(n, n.toLowerCase().replace(/\s+/g, '.') + '@example.com');
      trunkAuto = false;              // every sync in this file is asked for explicitly
      trunkHandle = {
        kind: 'file', name: 'team-trunk.json',
        getFile: async () => ({ text: async () => await window.__trunkRead() }),
        createWritable: async () => ({
          write: async t => { await window.__trunkWrite(t); }, close: async () => {} })
      };
      updateTrunkBtn();
    }, name);
    return { name, ctx, page };
  }

  const A = await person('Ana Ruiz');
  const B = await person('Ben Okoro', { empty: true });
  const C = await person('Cai Zhang', { empty: true });

  /* The product's own paths, never a field assignment: updatePct is what the
     check-off box calls, and the quiet push and pull are what the loop calls. */
  const setPct = (p, needle, v) => p.page.evaluate(({ nm, val }) => {
    const t = leafTasks().find(x => !x.isSummary && !x.milestone && x.name.indexOf(nm) >= 0);
    if (!t) return null;
    updatePct(t.id, val);
    return { id: t.id, name: t.name, pct: t.percentComplete };
  }, { nm: needle, val: v });
  const pct = (p, id) => p.page.evaluate(i => {
    const t = tasks.find(x => x.id === i); return t ? t.percentComplete : null;
  }, id);
  const push = p => p.page.evaluate(() => trunkPush(true));
  const pull = p => p.page.evaluate(() => trunkPull(true));
  const state = p => p.page.evaluate(async () => {
    const t = await trunkRead(trunkHandle);
    return { rel: trunkRelation(t).relation, mine: (planVersions || []).length,
             trunk: ((t && t.log) || []).length, paused: trunkPaused || '' };
  });

  // ── 1. ANA STARTS IT, BEN AND CAI JOIN ─────────────────────────────────
  const a1 = await setPct(A, 'Discovery', 60);
  await push(A);
  await pull(B); await pull(C);
  notes.push('after joining: Ben ' + await pct(B, a1.id) + '%, Cai ' + await pct(C, a1.id) + '%');
  if (await pct(B, a1.id) !== 60 || await pct(C, a1.id) !== 60)
    say('Ana recorded 60% and after joining the trunk Ben holds ' + await pct(B, a1.id)
      + ' and Cai holds ' + await pct(C, a1.id) + ' — a trunk that cannot fan one version out to two '
      + 'people is not a team feature');

  // ── 2. TWO PUSH BEFORE THE THIRD PULLS ─────────────────────────────────
  /* The case that does not exist with two people: Ben and Cai both share
     before Ana looks, so Ana's next pull carries a CHAIN. A sync that takes
     "the latest" rather than everything since loses whoever pushed first. */
  const b1 = await setPct(B, 'Requirements', 45);
  await push(B);
  const c1 = await setPct(C, 'Solution', 30);
  const cBefore = await state(C);
  notes.push('Cai stands ' + cBefore.rel + ' with unshared work of their own');
  await pull(C);                         // must merge Ben's in without losing Cai's
  if (await pct(C, c1.id) !== 30)
    say('Cai recorded 30% and after pulling Ben\'s version holds ' + await pct(C, c1.id)
      + '. Pulling while holding unshared work must merge, never replace');
  if (await pct(C, b1.id) !== 45)
    say('Ben shared 45% on a different activity and after pulling Cai holds ' + await pct(C, b1.id));
  await push(C);
  await pull(A);
  const aSees = { ben: await pct(A, b1.id), cai: await pct(A, c1.id) };
  notes.push('Ana pulls once and sees Ben ' + aSees.ben + '%, Cai ' + aSees.cai + '%');
  if (aSees.ben !== 45 || aSees.cai !== 30)
    say('two people shared before Ana pulled, and one pull left her holding Ben ' + aSees.ben
      + ' and Cai ' + aSees.cai + '. A pull has to carry every version since the last one, not the '
      + 'newest — with three people somebody is always two behind');

  // ── 3. A PUSH ONTO A TRUNK THAT MOVED AFTER IT WAS READ ────────────────
  /* Ben reads the trunk, then Cai shares, then Ben pushes. Ben's copy no longer
     contains the trunk's tip, so appending onto it would drop Cai's version.
     Refusing is the only correct answer; the test is that it is refused AND
     that Ben can still get his work in afterwards. */
  const b2 = await setPct(B, 'Data', 55);
  const staleBefore = await state(B);
  const c2 = await setPct(C, 'Integration', 70);
  await push(C);                         // the trunk moves under Ben
  await push(B);                         // must not silently append onto a stale read
  const trunkNow = JSON.parse(fs.readFileSync(TRUNK, 'utf8') || '{}');
  const stillHasCai = (trunkNow.log || []).some(e => e.doc
    && (e.doc.tasks || []).some(t => t.id === c2.id && t.percentComplete === 70));
  notes.push('Ben was ' + staleBefore.rel + ' when he pushed onto a trunk Cai had just moved');
  if (!stillHasCai)
    say('Ben pushed onto a copy of the trunk he had read BEFORE Cai shared, and Cai\'s 70% is no longer '
      + 'in the file. A push appends to what is on disk now, not to what was there when the page last '
      + 'looked — this is the case a whole-file sync eats silently');
  await pull(B); await push(B);
  await pull(A); await pull(C);
  const ends = { A: await pct(A, b2.id), C: await pct(C, b2.id), Acai: await pct(A, c2.id) };
  notes.push('after Ben catches up and re-shares: Ana ' + ends.A + '%, Cai ' + ends.C + '%');
  if (ends.A !== 55 || ends.C !== 55)
    say('Ben pulled and pushed again after being refused, and his 55% has still not reached Ana ('
      + ends.A + ') or Cai (' + ends.C + '). Refusing a stale push is only correct if the retry works');
  if (ends.Acai !== 70)
    say('Cai\'s 70% is missing from Ana\'s copy after the round — something in the exchange dropped a '
      + 'version that was already on disk');

  // ── 4. ALL THREE HOLD THE SAME ACTIVITY ────────────────────────────────
  /* The one a machine must not settle. Everything above is the trunk being
     useful; this is it declining to be clever with three people's work. */
  const same = await setPct(A, 'Kick-off', 10);
  await push(A);
  await pull(B); await pull(C);
  await setPct(B, 'Kick-off', 20);
  await setPct(C, 'Kick-off', 30);
  await push(B);
  await pull(C);                          // Cai now has a contested field
  const cAfter = await pct(C, same.id);
  const cState = await state(C);
  notes.push('all three moved one activity: Cai holds ' + cAfter + '%, stands ' + cState.rel
    + ', ' + (cState.paused ? 'paused: ' + cState.paused : 'not paused'));
  if (cAfter !== 30)
    say('Ben and Cai each recorded a different figure on the same activity and an unattended pull '
      + 'replaced Cai\'s 30% with ' + cAfter + '. Two people disagreeing about one number is the one '
      + 'thing a machine must never settle on its own');
  /* KEEPING HER OWN IS ONLY HALF RIGHT. Silence is safe for the number and
     unsafe for the person: if Cai now reads as level with the trunk while
     holding a figure Ben disagrees with, she has been told the argument is
     over. Standing diverged is the honest state — her next push meets the
     disagreement and asks her, which is the whole design. */
  if (cState.rel === 'same')
    say('an unattended pull left Cai reading as in step with the trunk while she and Ben hold different '
      + 'figures for the same activity. Keeping her own number is right; telling her the two copies '
      + 'agree is not, because nothing will ever bring it up again');
  const cPush = await push(C);
  void cPush;
  const cAfterPush = await state(C);
  notes.push('and after Cai tries to share: ' + cAfterPush.rel
    + (cAfterPush.paused ? ' (paused: ' + cAfterPush.paused + ')' : ''));
  if (await pct(C, same.id) !== 30)
    say('Cai\'s own figure changed while she was trying to SHARE it, which is the one direction that '
      + 'is meant to be incapable of losing her work');


  // ── 5. A CLEAN FAST-FORWARD, THEN A PUSH ───────────────────────────────
  /* THE CASE THAT LOCKED SOMEBODY OUT OF THEIR OWN TRUNK.

     Step 3 already pulls and then pushes, so this looked covered for months and
     was not: Ben is holding unshared work when he does it, so his pull MERGES —
     and the merge path records the trunk's version ids on its way through. The
     pure FAST-FORWARD, somebody with nothing of their own taking the tip whole,
     is the path that did not record them. It is also the ordinary one: it is
     what everybody does first thing in the morning.

     Reported as "i did pull first --- but i still see this error". The pull
     genuinely worked and the plan was right; only the ids were missed, so the
     next push could find no common ancestor and asked for a pull that had
     already happened. A loop with no exit from inside the product, and the
     trunk file grew unbounded behind it because compaction only runs on a push
     that succeeds.

     ANA IS THE CLEAN ONE HERE. Ben and Cai both hold contested figures by now;
     Ana has pushed and not touched anything since, so her pull is the straight
     fast-forward this exists to exercise. Getting that wrong would silently
     test the merge path again and prove nothing. */
  /* PAST THE CAP FIRST, or this tests nothing. The chain trims at VERSION_CAP
     (40) and the TRUNK LOG does not — so until somebody has pushed more than
     forty times, the tip document still carries every id the log lists and a
     fast-forward inherits a complete history by accident. That is why the first
     draft of this scenario passed with the fix removed: six versions, nothing
     trimmed, nothing to miss. Ben churns past the cap so the trunk's log
     genuinely outruns the chain inside its own newest document, which is the
     state a real team reaches in a fortnight and the one the report came from. */
  await pull(B);
  for (let i = 0; i < 45; i++) { await setPct(B, 'Discovery', 5 + (i % 90)); await push(B); }
  const churn = await state(B);
  notes.push('after 45 shares Ben carries ' + churn.mine + ' versions and the trunk log holds ' + churn.trunk);
  if (churn.trunk <= churn.mine)
    say('Ben pushed 45 times and the trunk log (' + churn.trunk + ') has not outgrown his own chain ('
      + churn.mine + '), so the fast-forward below inherits a complete history by accident and proves '
      + 'nothing. The cap is what makes this case exist');

  await pull(A);                          // nothing local: a straight fast-forward
  const ffRel = (await state(A)).rel;
  notes.push('after a clean fast-forward Ana stands ' + ffRel + ' with the trunk');
  if (ffRel !== 'same')
    say('Ana pulled holding no work of her own and stands "' + ffRel + '" with the trunk rather than '
      + '"same". A fast-forward that does not leave the two copies level has taken the trunk\'s plan '
      + 'without its history, and every push she makes from here will be refused');
  const a5 = await setPct(A, 'Discovery', 82);
  await push(A);
  const afterFf = await state(A);
  notes.push('Ana edits and shares after the fast-forward: now ' + afterFf.rel
    + (afterFf.paused ? ' (paused: ' + afterFf.paused + ')' : ''));
  const trunkFf = JSON.parse(fs.readFileSync(TRUNK, 'utf8') || '{}');
  const landed = (trunkFf.log || []).some(e => e.doc
    && (e.doc.tasks || []).some(t => t.id === a5.id && t.percentComplete === 82));
  if (!landed)
    say('Ana pulled cleanly, made one edit, and pushed — and her 82% is not in the trunk file. This is '
      + 'the "pull first" loop as the person hits it: the pull is accepted, the ids behind it are not '
      + 'adopted, and the push that follows can find no common ancestor with a trunk it just copied '
      + 'wholesale. Pulling again cannot help, because pulling was never what was missing');
  if (afterFf.paused)
    say('Ana\'s push after a clean fast-forward left the sync paused ("' + afterFf.paused + '"). A '
      + 'fast-forward followed by an edit is the most ordinary sequence there is and must never need '
      + 'a person to resolve anything');
  const R = { contradictions: bad, notes: notes, pageErrors: errs.slice(0, 6), trunkFile: TRUNK };
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
  srv.close();
  if (bad.length || errs.length) process.exitCode = 1;
})();

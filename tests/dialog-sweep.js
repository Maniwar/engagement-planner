/* ═══════════════════════════════════════════════════════════════════════════
   THE DIALOGS NOBODY LOOKED AT.

   Every earlier sweep reads the eight tab panels. I scanned all of them for
   markup rendered as text, found none, and reported the application clean —
   and the dependency-fix wizard was printing raw <span class="ek …"> tags at
   the user, because a dialog is not a tab and nothing ever opened one.

   The defect itself was one word: nm() already returns entity-mark HTML and was
   wrapped in escapeHtml(), so the tags were shown instead of rendered. Trivial
   to fix, impossible to notice from a check that never opens the thing.

   So this opens the dialogs — including the ones that only appear when the plan
   is in a particular state, which is exactly why they are the least-seen and
   most-broken surfaces in the file. A wizard that only fires on a dependency
   loop is a wizard nobody has read since the day it was written.
   ═══════════════════════════════════════════════════════════════════════════ */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();
const fs = require('fs'), path = require('path');
const CRM = FIXTURE();
const QA = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'fixtures', 'qa-reference.json'), 'utf8'));

(async () => {
  const b = await chromium.launch({headless:true,args:['--no-sandbox'],executablePath: chromePath()});
  const page = await b.newPage({viewport:{width:1440,height:1200}});
  page.on('dialog', d => d.accept());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, {waitUntil:'load'});

  const sweep = async (label, data) => {
    await page.evaluate(d => { hydrate(d); calculate(); }, data);
    await page.waitForTimeout(500);
    return page.evaluate(lbl => {
      const bad = [];
      const say = (w, x) => bad.push(lbl + ' · ' + w + ' :: ' + x);
      const out = { opened: [] };

      /* Markup shown as TEXT. A tag name inside a text node is never prose —
         "<span class=" cannot occur in an English sentence about a project. */
      const TAGS = /<\/?(span|div|b|i|p|button|a|table|td|tr)\b/i;
      const scan = (where, root) => {
        if (!root) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n, hits = 0, eg = '';
        while ((n = w.nextNode())) {
          const v = n.nodeValue || '';
          if (TAGS.test(v)) { hits++; if (!eg) eg = v.trim().slice(0, 90); }
        }
        if (hits) say(where, hits + ' text node(s) print raw markup instead of rendering it, e.g. "'
          + eg + '"');
        // an entity mark that rendered correctly leaves NO literal class name behind
        if ((root.textContent || '').indexOf('class="ek') >= 0)
          say(where, 'an entity mark is being escaped rather than rendered');
      };

      const openAndScan = (name, fn) => {
        try { fn(); } catch (e) { say(name, 'threw while opening: ' + e.message); return; }
        out.opened.push(name);
        document.querySelectorAll('.modal-overlay').forEach(m => scan(name, m));
      };

      // ── the dependency-fix wizard: only exists when the plan has a loop, so
      //    build one. Two activities pointed at each other is the shape the
      //    wizard is written for.
      const lv = leafTasks().filter(t => !t.milestone);
      if (lv.length >= 2) {
        const A = lv[0], B = lv[1];
        const keepA = (A.predecessors || []).slice(), keepB = (B.predecessors || []).slice();
        A.predecessors = [{ id: B.id, type: 'FS', lag: 0 }];
        B.predecessors = [{ id: A.id, type: 'FS', lag: 0 }];
        try { calculate(); } catch (e) {}
        openAndScan('dependency-fix wizard', () => openDepFixWizard());
        try { closeDepFixWizard(); } catch (e) {}
        A.predecessors = keepA; B.predecessors = keepB;
        try { calculate(); } catch (e) {}
      }

      /* ── EVERY BUTTON IN THE WIZARD ACTS ON THE THING IT NAMES ──────────
         A wizard row holds two different pairs. The headline is the EFFECTIVE
         edge from the cycle walk, leaf waiting on leaf. The buttons act on the
         STORED predecessor entry, which can sit on an ancestor PHASE of the
         waiting task and can point at a phase too. When those differ, the row
         was showing one pair and operating on another, and the visible symptom
         was "the buttons do nothing": ✎ Open opened the leaf from the headline,
         whose Dependencies list is EMPTY — the entry lives on its phase — so
         the person arrived at an editor with nothing to delete. Worse, ⑂ Nest
         under it read as the activity in the headline and re-parented the test
         case under the PHASE, tearing it out of the UAT activity it decomposes,
         while the toast reported success because the loop did clear.

         The shape above (two leaves pointed at each other) can never catch it:
         holder and headline are the same task, so the gap is closed by luck.
         This builds the shape where they differ. */
      const wizRows = () => [...document.querySelectorAll('#depFixBody > div')]
        .filter(r => r.querySelector('button'))
        .map(r => ({
          text: (r.textContent || '').replace(/\s+/g, ' ').trim(),
          nest: (r.querySelector('button.btn-primary') || {getAttribute: () => null}).getAttribute('onclick'),
          cut: (r.querySelector('button.btn-danger') || {getAttribute: () => null}).getAttribute('onclick'),
          open: (r.querySelector('button.btn-secondary') || {getAttribute: () => null}).getAttribute('onclick')
        }));
      const tcW = leafTasks().find(t => isTestCaseTask(t) && !t.isSummary);
      const phW = tasks.find(t => t.isSummary && !isTestCaseTask(t) && leafDescendants(t.id).length);
      if (!tcW || !phW) out.opened.push('wizard-actions·SKIPPED-fixture-has-no-test-case-and-phase');
      if (tcW && phW) {
        const keep = new Map(tasks.map(t => [t.id, (t.predecessors || []).slice()]));
        const keepParent = tcW.parentId;
        tcW.predecessors = [{ id: phW.id, type: 'FS', lag: 0 }];
        phW.predecessors = [{ id: tcW.id, type: 'FS', lag: 0 }];
        try { calculate(); } catch (e) {}
        if (!findScheduleCycleIds()) say('dependency-fix wizard',
          'the probe failed to build a loop, so none of the wizard checks below ran');
        else {
          openDepFixWizard();
          const rows = wizRows();
          out.wizardRows = rows.length;
          if (!rows.length) say('dependency-fix wizard', 'a loop exists but the wizard drew no rows');
          rows.forEach(r => {
            const cut = (r.cut || '').match(/depFixRemove\((\d+),\s*(\d+)/);
            const opn = (r.open || '').match(/openEditModal\((\d+)/);
            if (cut && opn) {
              const holder = tasks.find(t => t.id === +cut[1]);
              const opened = tasks.find(t => t.id === +opn[1]);
              // ✎ Open must land where the link actually is, or there is
              // nothing on screen to edit and the button reads as dead
              if (!opened || !(opened.predecessors || []).some(p => p.id === +cut[2]))
                say('dependency-fix wizard', '✎ Open sends you to “'
                  + ((opened || {name: '#' + opn[1]}).name || '').slice(0, 40)
                  + '”, whose Dependencies list does not contain the link the same row offers to cut '
                  + '(that link is on “' + ((holder || {name: '?'}).name || '').slice(0, 40)
                  + '”) — the editor opens with nothing to delete');
            }
            const nest = (r.nest || '').match(/depFixNestTC\((\d+),\s*(\d+)/);
            if (nest) {
              const target = tasks.find(t => t.id === +nest[2]);
              // nesting under a phase is not "the activity it verifies": it
              // pulls the case out of the activity it decomposes
              if (!target || isSummaryId(target.id))
                say('dependency-fix wizard', '⑂ Nest under … offers to re-parent a test case under “'
                  + ((target || {name: '#' + nest[2]}).name || '').slice(0, 40)
                  + '”, which is a PHASE, not the activity the case verifies');
              if (target && !(r.text || '').includes(target.name.slice(0, 12)))
                say('dependency-fix wizard', '⑂ Nest under … would move the case under “'
                  + target.name.slice(0, 40) + '”, which the row never names');
            }
          });
          /* And the buttons have to be REACHABLE. Naming the objects made the
             labels long enough that the first attempt pushed ✎ Open past the
             right edge of the dialog, where no click can land — a defect every
             assertion above passes straight through, because the handler is
             wired correctly to an element nobody can hit. */
          const dlg = document.querySelector('#depFixModal .modal');
          if (dlg) {
            const box = dlg.getBoundingClientRect();
            [...document.querySelectorAll('#depFixBody button')].forEach(btn => {
              const r = btn.getBoundingClientRect();
              if (r.width < 8 || r.height < 8)
                say('dependency-fix wizard', 'the button “' + btn.textContent.trim().slice(0, 30)
                  + '” has no clickable area (' + Math.round(r.width) + '×' + Math.round(r.height) + ')');
              else if (r.right > box.right + 1 || r.left < box.left - 1)
                say('dependency-fix wizard', 'the button “' + btn.textContent.trim().slice(0, 30)
                  + '” sticks out past the edge of the dialog, so part of it cannot be clicked');
              else if (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== btn
                       && !btn.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)))
                say('dependency-fix wizard', 'a click at the centre of “' + btn.textContent.trim().slice(0, 30)
                  + '” lands on something else');
            });
          }
          // and the guard holds even when called directly, so no future caller
          // can reach the damage the hidden button used to do
          const before = tcW.parentId;
          depFixNestTC(tcW.id, phW.id);
          if (tcW.parentId !== before)
            say('dependency-fix wizard', 'depFixNestTC re-parented a test case under a PHASE when '
              + 'called directly — the guard is only in the button, not in the function');
          try { closeDepFixWizard(); } catch (e) {}
        }
        tcW.parentId = keepParent;
        tasks.forEach(t => { const k = keep.get(t.id); if (k) t.predecessors = k; });
        try { calculate(); } catch (e) {}
      }

      /* ── A BLOCKED TAB MUST SAY IT IS BLOCKED ───────────────────────────
         recompute() returns false on a dependency loop, so `calculated` stays
         false, every render on the schedule-dependent tabs is skipped by its own
         `&& calculated` guard, and the panels keep the first-run markup they were
         born with. A reader with 41 activities and one circle was told "Nothing
         to compare yet. Add activities and press Calculate" — the application
         knowing exactly what was wrong, having a wizard for it, and saying
         nothing. Reported from the live demo, reproduced here end to end. */
      out.opened.push('blockedTab');
      {
        const keepAll = tasks.map(t => (t.predecessors || []).slice());
        const lv2 = leafTasks().filter(t => !t.milestone && !t.isSummary);
        if (lv2.length >= 2) {
          lv2[0].predecessors = [{ id: lv2[1].id, type: 'FS', lag: 0 }];
          lv2[1].predecessors = [{ id: lv2[0].id, type: 'FS', lag: 0 }];
          calculated = false;
          switchTab('analytics');
          try { closeDepFixWizard(); } catch (e) {}
          const pt = (document.getElementById('planTruth') || {}).textContent || '';
          out.blockedText = pt.replace(/\s+/g, ' ').trim().slice(0, 60);
          if (/Add activities/i.test(pt))
            say('blocked tab', 'the plan has ' + tasks.length + ' activities and a dependency loop, and the '
              + 'panel tells the reader to ADD ACTIVITIES — the one thing that is not the problem');
          if (!/cannot be computed|circle|loop/i.test(pt))
            say('blocked tab', 'the schedule cannot be computed and the panel does not say so: "'
              + pt.replace(/\s+/g, ' ').trim().slice(0, 80) + '"');
          if (!/depFixWizard|Fix the loop/i.test((document.getElementById('planTruth') || {}).innerHTML || ''))
            say('blocked tab', 'the panel names the problem and offers no way to fix it, on the one screen '
              + 'where the fix is one click away');
          /* AND IT HAS TO SURVIVE A REPAINT.
             The first version of this fix painted the reason from switchTab, so
             it read correctly the instant the tab opened and was overwritten by
             the next renderPlanTruth() — which writes the first-run sentence
             unconditionally. The panel then went back to telling a reader with a
             full plan to add activities, and the check, which only looked once on
             entry, stayed green. Ask again after a repaint. */
          renderPlanTruth();
          const pt2 = (document.getElementById('planTruth') || {}).textContent || '';
          if (/Add activities/i.test(pt2) || !/cannot be computed|circle|loop/i.test(pt2))
            say('blocked tab', 'the reason survives opening the tab but not a repaint — renderPlanTruth() puts '
              + 'the first-run sentence back, so the truth is whatever happened to render last');
          /* THE HEALTH PANEL IS BLOCKED BY THE SAME THING AND MUST SAY SO.
             Plan truth writes its own reason from inside its renderer; the health
             panel has no renderer that runs at all when the schedule is missing,
             so switchTab paints it. Two different mechanisms for the same fact,
             and only one of them was checked — the mutant that removed the
             painting survived a full run because every assertion here was reading
             planTruth, which fixes itself. */
          const hb = (document.getElementById('healthContainer') || {}).textContent || '';
          out.blockedHealth = hb.replace(/\s+/g, ' ').trim().slice(0, 40);
          if (!/cannot be computed|circle|loop/i.test(hb))
            say('blocked tab', 'the health panel is blocked by the same loop and says nothing about it: "'
              + (hb.replace(/\s+/g, ' ').trim().slice(0, 60) || '(completely empty)') + '"');

          /* AND PRESSING THE BUTTON MUST DO SOMETHING VISIBLE.
             calculate() returned early on a loop with no message of its own,
             relying entirely on the wizard it opens. Dismiss that wizard once and
             the button becomes a control that produces no observable effect —
             which is how it was reported. */
          switchTab('tasks');
          const ind = document.getElementById('savedIndicator');
          if (ind) ind.textContent = '';
          closeDepFixWizard();
          calculate();
          const said = (ind || {}).textContent || '';
          out.calcSaid = said.slice(0, 40);
          if (!said.trim())
            say('blocked tab', 'pressing Calculate on a looped plan produced no message at all — the button '
              + 'reads as dead to anyone who has dismissed the wizard');
          else if (!/circle|loop/i.test(said))
            say('blocked tab', 'Calculate said "' + said.slice(0, 60) + '" and did not name the loop as the reason');
          tasks.forEach((t, i) => { t.predecessors = keepAll[i]; });
          try { calculate(); } catch (e) {}
        }
      }

      // ── the activity editor, on a real activity
      const t0 = leafTasks().find(t => !t.milestone && !t.isSummary);
      if (t0) { openAndScan('activity editor', () => openEditModal(t0.id, true));
                try { closeModal(); } catch (e) {} }

      /* ── the story modal, and the RAID form
         What stood here was `if (t1 && typeof openDepMap === 'function')` — and
         there is no openDepMap in the application, so the guard was permanently
         false and the branch had never run once. A `typeof … === 'function'`
         guard is the polite way to write an optional case and it is also the
         perfect way to hide a name that does not exist: nothing throws, nothing
         is scanned, and `out.opened` simply never lists it. The dependency map
         it was reaching for is not a surface this app has; the wizard above is,
         and is already covered.
         Replaced with two dialogs that DO exist and were not being scanned. The
         story modal is the one that draws model-written prose and entity marks,
         which is precisely what this sweep is looking for. */
      const st = (reqs && reqs.stories || [])[0];
      if (st) {
        openAndScan('story modal', () => openStoryModal(st.id));
        try { closeStoryModal(); } catch (e) { try { closeModal(); } catch (e2) {} }
      } else {
        // said out loud rather than skipped in silence: the qa-reference plan
        // carries no stories, so this dialog is genuinely unreachable there and
        // the real export is the only run that covers it
        out.opened.push('story modal·SKIPPED-fixture-has-no-story');
      }
      openAndScan('RAID form', () => openRaidForm());
      try { closeRaidForm(); } catch (e) {}

      /* and the names have to be REAL. Every dialog above is opened through a
         function this file names in source; if one is renamed out of the product
         the opener throws and openAndScan reports it — except where a typeof
         guard would swallow it, which is the trap this block just came out of.
         So the count is asserted: a dialog that silently stopped being opened
         shows up here as a smaller number rather than as nothing at all. */
      out.expectedDialogs = ['activity editor', 'RAID form'].concat(st ? ['story modal'] : []);
      const missed = out.expectedDialogs.filter(n => out.opened.indexOf(n) < 0);
      if (missed.length)
        say('Dialogs', missed.join(', ') + ' never opened, so nothing in them was scanned — a dialog that '
          + 'quietly stopped being reachable is indistinguishable from a clean one');

      /* ══ THE SETUP GUIDE HAS TO SAY THE THING THAT ACTUALLY GOES WRONG ═════
         The collaboration transport worked and nobody could start it. Watching
         points at a file ON YOUR OWN DISK, so the desktop sync client has to be
         installed — and putting the file on drive.google.com through a browser
         creates nothing local, which looks exactly like a broken feature. The
         old failure path was an alert reading "this browser cannot watch a file
         — Chrome or Edge can", which is the wrong reason two times in three
         and, said to somebody already in Chrome, is no reason at all.

         Every check here is on the SENTENCE, not on the dialog existing: a
         guide that opens and omits the one fact you needed IS the defect. */
      /* ══ THE EDITOR IS A FORM ABOUT WORK, AND A MILESTONE IS A DATE ═══════
         Only the estimate block was hidden, so a checkpoint asked for the share
         of somebody's week it consumes, the shape of its spend across a window
         it does not have, who else attends it, and the hours spent on it. What
         must STAY is the interesting half: a milestone is exactly where a
         payment lands, so fixed cost, invoiced and received remain. Hiding the
         money would be the tidier-looking mistake. */
      out.modalShape = (() => {
        const t0 = leafTasks().find(x => !x.isSummary && !x.milestone);
        if (!t0) { say('Activity editor', 'no leaf activity to open — this check is vacuous'); return null; }
        openEditModal(t0.id);
        const body = document.querySelector('#modal .modal-body');
        if (!body) { say('Activity editor', 'the editor has no body'); return null; }
        /* innerText, not textContent: textContent hands back hidden nodes, and
           the first version of this check happily read the estimate block it had
           just hidden and reported it visible. */
        const vis = id => { const n = document.getElementById(id);
          return !!n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0; };
        const g = { hAct: Math.round(body.getBoundingClientRect().height) };
        /* THE COMPUTED LAYOUT, NOT THE CLASS NAME. Counting elements carrying
           .mb-half proves somebody typed the class; it says nothing about
           whether two columns exist, and it passed on a build where the grid
           was switched off entirely and on one where every half-width item was
           told to span both columns. What matters is the rendered geometry: two
           tracks on the body, and a paired field noticeably narrower than it. */
        /* ANYWHERE UNDER THE BODY, and the grid measured on whatever owns it.
           The form became sections — each card is a full-width child holding
           its own two-column grid — and this read body.children only, so it
           reported "no field is marked to pair" on a build laying out in two
           columns exactly as intended. The check was right about WHAT to
           measure and wrong about WHERE, which is the failure mode its own
           comment above warns about, one level up. */
        const halves = [...body.querySelectorAll('.mb-half')];
        g.half = halves.length;
        if (!halves.length) say('Activity editor', 'no field is marked to pair, so the second column is empty');
        const gridOwner = (halves.find(k => getComputedStyle(k).display !== 'none') || {}).parentElement || body;
        const tracks = String(getComputedStyle(gridOwner).gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean);
        g.tracks = tracks.length;
        g.gridOwner = gridOwner === body ? 'modal-body' : (gridOwner.className || gridOwner.tagName);
        g.bodyW = Math.round(gridOwner.getBoundingClientRect().width);
        if (window.innerWidth >= 1000) {
          if (tracks.length !== 2) say('Activity editor', 'on a ' + window.innerWidth + 'px screen the editor '
            + 'lays out in ' + tracks.length + ' column(s) — the form is the single tall column it always was, '
            + 'with two thirds of the screen empty beside it');
          const vh = halves.filter(k => getComputedStyle(k).display !== 'none');
          if (vh.length) {
            const w = vh[0].getBoundingClientRect().width;
            g.halfW = Math.round(w);
            if (w > g.bodyW * 0.7) say('Activity editor', 'a field marked to pair renders '
              + Math.round(w) + 'px wide inside a ' + g.bodyW + 'px body — it is spanning both columns, '
              + 'so nothing actually sits beside anything');
          }
          /* AND SOMETHING IS ACTUALLY BESIDE SOMETHING. Everything above reads
             ONE field and the box around it: how many tracks the owner declares,
             how wide a paired field comes out. Both are proxies for the only
             question a reader would ask — are two of these on the SAME LINE —
             and neither can answer it alone: a two-track grid whose items all
             span it still stacks, and a half-width field with nothing next to it
             is still a half-empty row. Two boxes sharing a top edge and not
             sharing a left edge is the question asked of the pixels, and it is
             false under every one-column layout. */
          const tops = {};
          vh.forEach(k => { const r = k.getBoundingClientRect();
            (tops[Math.round(r.top)] = tops[Math.round(r.top)] || []).push(Math.round(r.left)); });
          const paired = Object.values(tops).filter(ls => new Set(ls).size > 1);
          g.pairedRows = paired.length;
          if (vh.length >= 2 && !paired.length)
            say('Activity editor', vh.length + ' fields are marked to pair and no two of them share a line — '
              + 'each starts its own row, so the form is the tall single column the pairing exists to prevent '
              + 'and half of a ' + g.bodyW + 'px form is blank beside it');
        } else g.skipped = 'viewport under the breakpoint';

        const NA = ['mUnitsGroup', 'mCurveGroup', 'attGroup', 'mActualEffortGroup', 'mTaxonomyGroup', 'ompHint', 'estBlock'];
        const KEEP = ['mFixedCost', 'mInvoiced', 'mPaid', 'mPct', 'mOwner'];
        const cb = document.getElementById('mMilestone');
        cb.checked = true; toggleMilestoneFields();
        NA.forEach(id => { if (vis(id)) say('Activity editor', 'a milestone still shows ' + id
          + ', which asks about work it cannot have'); });
        KEEP.forEach(id => { if (!vis(id)) say('Activity editor', 'a milestone has lost ' + id
          + ' — a payment checkpoint is exactly where that belongs'); });
        const txt = (body.innerText || '').replace(/\s+/g, ' ');
        if (!txt) say('Activity editor', 'the editor renders no text, so this check is vacuous');
        else if (/in work, at \d+%/.test(txt))
          say('Activity editor', 'a milestone prints running duration commentary directly under the '
            + 'checkbox that just declared it has none');
        g.hMs = Math.round(body.getBoundingClientRect().height);
        if (!(g.hMs < g.hAct)) say('Activity editor', 'the milestone form is no shorter than the activity '
          + 'form, so nothing was actually removed');
        cb.checked = false; toggleMilestoneFields();
        NA.forEach(id => { if (id !== 'ompHint' && !vis(id))
          say('Activity editor', id + ' did not come back when the milestone box was unticked'); });
        closeModal();
        return g;
      })();

      out.syncGuide = (() => {
        const cap = syncCapability();
        const g = {};
        /* This harness runs on file://, so the honest verdict is "unavailable,
           and here is why" — and the reason must name the ORIGIN, not the
           browser. A build that blames Chrome while running in Chrome is
           precisely what this replaced. */
        if (cap.ok) say('Sync guide', 'a file:// page reports that file watching is available');
        if (!/file:\/\//.test(String(cap.why)))
          say('Sync guide', 'watching is unavailable and the stated reason does not name the file:// origin');
        if (/Chrome or Edge can/.test(String(cap.why)))
          say('Sync guide', 'the reason blames the browser on a page where the browser is not the problem');
        if (!cap.fix || String(cap.fix).length < 30)
          say('Sync guide', 'the guide reports watching unavailable and offers nothing to do about it');

        openSyncGuide();
        const modal = document.getElementById('syncGuideModal');
        if (!modal || !modal.classList.contains('open')) { say('Sync guide', 'the guide does not open'); return g; }
        const txt = (document.getElementById('syncGuideBody').textContent || '').replace(/\s+/g, ' ');
        g.chars = txt.length;
        if (txt.indexOf('on your own computer') < 0)
          say('Sync guide', 'never says the watched file is on your own disk, which is the fact the whole '
            + 'setup rests on');
        if (txt.indexOf('drive.google.com') < 0)
          say('Sync guide', 'does not warn that uploading through a browser creates nothing to point at');
        if (txt.indexOf('Two files, never one') < 0)
          say('Sync guide', 'does not say two files rather than one, which is what stops the sync client '
            + 'silently leaving a second copy');
        if (!document.querySelector('[onclick="openSyncGuide()"]'))
          say('Sync guide', 'nothing on the page opens the guide, so it is unreachable');
        /* THE TWO HALVES, NAMED. "Watch their file" only reads; a reader who
           stops there sends nothing and is told nothing. */
        if (txt.indexOf('never writes your changes anywhere') < 0)
          say('Sync guide', 'does not say that watching only reads, which is the thing every reader assumes '
            + 'the other way round');
        if (txt.indexOf('You need both') < 0)
          say('Sync guide', 'does not say both halves are needed');

        /* THE MAC BRANCH, FORCED. The Windows and Mac paths are different
           prose, and the platform this harness reports is not the one the fix
           was written for — so asserting on whatever happens to render proves
           only that ONE branch is intact, and a build that gutted the Mac
           advice passed. navigator.platform is overridden for the length of
           this check and put back. */
        const realPlat = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform')
          || Object.getOwnPropertyDescriptor(navigator, 'platform');
        try {
          Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel', configurable: true });
          closeOverlay('syncGuideModal');
          openSyncGuide();
          const mtxt = (document.getElementById('syncGuideBody').textContent || '').replace(/\s+/g, ' ');
          g.macChars = mtxt.length;
          if (/drive letter/.test(mtxt)) say('Sync guide', 'a Mac is shown the Windows steps');
          if (!/Mirror files/.test(mtxt))
            say('Sync guide', 'the Mac path offers no fix for the picker being unable to see Google Drive — '
              + 'which is the exact failure that made this feature unusable');
          if (mtxt.indexOf('CloudStorage') < 0)
            say('Sync guide', 'the Mac path does not name the hidden CloudStorage location the picker lands away from');
          if (mtxt.indexOf('Available offline') < 0)
            say('Sync guide', 'the Mac path does not say to materialise an online-only placeholder');
        } finally {
          if (realPlat) { try { Object.defineProperty(navigator, 'platform', realPlat); } catch (e) {} }
        }
        closeOverlay('syncGuideModal');
        return g;
      })();

      return { contradictions: bad, counts: out };
    }, label);
  };

  const qa = await sweep('QA reference', QA);
  const crm = await sweep('Real export', CRM);
  const R = { contradictions: [].concat(qa.contradictions, crm.contradictions),
              qaCounts: qa.counts, crmCounts: crm.counts,
              pageErrors: errs.slice(0, 8) };
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

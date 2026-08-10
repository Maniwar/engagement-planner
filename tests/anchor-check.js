/* ═══════════════════════════════════════════════════════════════════════════
   IS THIS CHECK READING THE PROPERTY, OR THE PACKAGING?

   The second root cause behind the recurring defects in this directory, and
   until now the one with no machinery behind it. Root cause 1 — the fixture
   cannot reach the branch — got vacuity-check.js. This one kept being caught by
   reading, by screenshot, and by luck, which is to say it kept not being
   caught. Nine-plus instances, every one of them in the CHECK rather than in
   the product:

     · cross-surface found the delta with .find(font-weight:700) and got the
       value pair instead — first thing matching a SHAPE, not the thing wanted.
     · a health-finding check matched /unbilled/i against the AREA label, so it
       passed a rename that removed the finding entirely.
     · an outstanding-total check asserted the row EXISTED rather than what it
       said.
     · a legend check asserted the key existed rather than that it was VISIBLE.
     · a bank check used innerText, which returns '' for anything not being
       rendered, and reported the shipped build for a defect that did not exist.
     · the leveling-toolbar check read the `hidden` ATTRIBUTE, agreed with the
       code, and passed on a build where the buttons were visible on all four
       sections — the stylesheet overruled the attribute and only a screenshot
       found it.

   One shape: THE ASSERTION IS ON AN ARTEFACT THAT USUALLY ACCOMPANIES THE
   PROPERTY. Position, a style value, an attribute flag, a label's words, the
   existence of a row. Each correlates with the truth until the day it does not,
   and on that day the check stays green and is counted as coverage.

   ── THE MECHANICAL QUESTION ────────────────────────────────────────────────

   The mutation engine changes what the panels SAY and requires a check to go
   red. This is the other half: change HOW they say it, leave what they say
   exactly alone, and require every check to stay GREEN. A check that goes red
   under a meaning-preserving change was reading the packaging, and it says so
   by failing — no keyword, no convention, nothing a person can satisfy by
   typing the right sentence.

   Every mutation below is invisible to a human looking at the page. That is the
   whole contract, and it is why a red result is a finding about the CHECK and
   never about the product:

     1. an extra class on every element. No CSS rule matches it, so nothing
        moves. Breaks className === '…' and classList[0].
     2. a hidden, empty, bold decoy span inside every table cell. Adds no text,
        no layout, no visible mark — and breaks "find the bold one", which is
        how a check once grabbed a value pair and called it a delta.
     3. a space either side of the text in leaf elements. HTML collapses it, so
        the rendering is identical; textContent gains two characters. Breaks
        exact equality on untrimmed text.

   ── WHAT THIS DOES NOT CATCH, said plainly so nobody reads more into a green
   run than is in it ────────────────────────────────────────────────────────

   It cannot catch an assertion anchored to a LABEL's words, because renaming a
   heading is not meaning-preserving and resolving a column by its header is the
   CORRECT pattern — a probe that renamed headings would punish the right
   answer. It cannot catch "asserted the row exists rather than what it says",
   because existence survives every mutation here by design. And it cannot catch
   an attribute read that disagrees with the computed style, because swapping
   `hidden` for `display:none` is not meaning-preserving in general — that is
   the case the author of this file got wrong twice and it stays outside.

   So this covers the positional and stylistic third of the pattern. The
   mutation engine covers "you would have noticed a wrong value", vacuity-check
   covers "you looked at the input", and this covers "you looked at the thing
   itself rather than at what it happened to be wearing". Three probes, three
   different questions, and none of them is the whole standard.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// one product file, named for what Pages serves it as
const PRODUCT = ['index.html', 'pert-gantt-tracker.html']
  .find(n => fs.existsSync(path.join(ROOT, n))) || 'index.html';
const APP = path.resolve(ROOT, PRODUCT);
const ONLY = process.argv.slice(2).filter(a => !a.startsWith('-'));

/* Injected at the END of the body so it runs after the app's own script has
   defined everything, and re-applied on every DOM mutation because these panels
   are redrawn constantly — decorating once would leave the probe describing a
   page that no longer exists by the time a check looks at it. */
const DECORATOR = `
<script>
(function () {
  var ON = window.__PZ_ON || (window.__PZ_ON = { cls: 1, pad: 1, decoy: 1, wrap: 1 });
  var SKIP = { SCRIPT: 1, STYLE: 1, PRE: 1, CODE: 1, TEXTAREA: 1, OPTION: 1, TITLE: 1, svg: 1 };
  var busy = false;
  /* COUNTED, EVERY RUN. This file's own header records the day two of its three
     mutations cancelled each other and nothing was padded at all — 93 leaf
     cells, 0 padded — and says it was found by counting rather than by reading.
     The counting was a one-off at the terminal and never became part of the
     probe, so the same silence could return the next time the order changed.
     A mutation that applies to nothing makes every check pass for the reason
     this probe exists to catch. */
  window.__pzCounts = { classed: 0, padded: 0, decoyed: 0, wrapped: 0 };
  function decorate(el) {
    if (!el || el.nodeType !== 1 || el.__pz) return;
    /* SVG className is an SVGAnimatedString, not a string — classList.add on it
       throws in some engines and the drawn charts are full of them. Nothing
       here is about SVG, so it is skipped entirely rather than special-cased. */
    if (el.ownerSVGElement || el.tagName === 'svg') return;
    if (SKIP[el.tagName]) return;
    el.__pz = 1;
    if (ON.cls) try { el.classList.add('pz'); window.__pzCounts.classed++; } catch (e) {}
    /* PADDING BEFORE THE DECOY, and the order is not cosmetic. Appending the
       decoy makes a table cell non-empty of children, so the leaf test below it
       stopped being true for exactly the cells the padding was aimed at and
       nothing was padded at all — 93 leaf cells, 0 padded. The probe's own two
       mutations cancelled, and a probe that quietly applies one of the three
       things it claims is the same green-for-the-wrong-reason it exists to
       catch. Found by counting rather than by reading the code, which is the
       only reason it was found. */
    /* 3. A SPACE EITHER SIDE OF THE TEXT — BUT ONLY WHERE IT REALLY COLLAPSES.
          The header said "HTML collapses it, so the rendering is identical".
          That is true of a BLOCK-level leaf, where leading and trailing
          whitespace is stripped at the start and end of a line, and false of an
          inline one, where the space survives as a real space beside whatever
          sits next to it. Measured, after the self-check below started refusing
          to run: on the activity list 14 of 1353 elements changed width, all of
          them inline — an <em> grew 4px, a <b> grew 5px.

          So this mutation had been VISIBLE for its whole life, and this file's
          own contract says a red result is therefore a finding about the probe
          wearing the clothes of a finding about a check. Padding is now applied
          only where the collapse is a rule of the language rather than a hope. */
    if (ON.pad && !el.children.length && el.firstChild && el.firstChild.nodeType === 3) {
      var v = el.firstChild.nodeValue;
      var disp = '';
      try { disp = getComputedStyle(el).display; } catch (e) {}
      var blocky = /^(block|flex|grid|table-cell|list-item|table-caption)$/.test(disp);
      if (blocky && v && v.trim() && v === v.trim()) {
        el.firstChild.nodeValue = ' ' + v + ' '; window.__pzCounts.padded++;
      }
    }
    /* 4. THE TEXT MOVES INSIDE A NEUTRAL SPAN. An inline element with no rules
          against it renders identically — the same glyphs on the same line —
          and textContent is unchanged. What it breaks is a whole family the
          other three cannot touch: firstChild.nodeValue, childNodes[0],
          innerHTML === 'the text', and "this element has no element children,
          so it is a leaf". Every one of those is a check reaching for the
          text's PACKAGING rather than for the text.

          Applied after the padding on purpose, and the order is the same
          lesson this file learned once already: wrap first and the padding
          finds no bare text node to pad. */
    if (ON.wrap && !el.children.length && el.firstChild && el.firstChild.nodeType === 3
        && (el.firstChild.nodeValue || '').trim()) {
      try {
        var w = document.createElement('span');
        w.className = 'pz-wrap';
        w.__pz = 1;
        el.insertBefore(w, el.firstChild);
        w.appendChild(w.nextSibling);
        window.__pzCounts.wrapped++;
      } catch (e) {}
    }
    // 2. a bold decoy that no human can see, inside every table cell
    if (ON.decoy && (el.tagName === 'TD' || el.tagName === 'TH')) {
      try {
        var d = document.createElement('span');
        d.className = 'pz-decoy';
        d.setAttribute('aria-hidden', 'true');
        d.setAttribute('style', 'display:none;font-weight:700');
        d.__pz = 1;
        el.appendChild(d);
        window.__pzCounts.decoyed++;
      } catch (e) {}
    }
  }
  function sweep(root) {
    if (!root) return;
    decorate(root);
    var all;
    try { all = root.querySelectorAll ? root.querySelectorAll('*') : []; } catch (e) { return; }
    for (var i = 0; i < all.length; i++) decorate(all[i]);
  }
  /* The observer mutates the DOM, so without the guard it would observe its own
     work and recurse until the stack gives out. Disconnected around the pass
     rather than filtered afterwards: filtering would still queue thousands of
     records per render on a plan this size. */
  var obs = new MutationObserver(function () {
    if (busy) return;
    busy = true;
    try { obs.disconnect(); sweep(document.body); } catch (e) {}
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    busy = false;
  });
  function start() {
    sweep(document.body);
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    window.__pzActive = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>
`;

/* Every check that drives the product. run-test-plan is included because it is
   forty-five assertions about drawn panels and is exactly as capable of reading
   a class name as any sweep. */
const CHECKS = fs.readdirSync(__dirname)
  .filter(f => /sweep.*\.js$/.test(f) || f === 'golden-reference.js' || f === 'run-test-plan.js')
  .filter(f => !ONLY.length || ONLY.some(o => f.indexOf(o) >= 0))
  .sort();

function run(script, appFile) {
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, { APP_FILE: appFile });
    const ch = spawn(process.execPath, [path.join(__dirname, script)], { cwd: ROOT, env: env, stdio: 'pipe' });
    let out = '';
    ch.stdout.on('data', d => out += d);
    ch.stderr.on('data', d => out += d);
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 240000);
    ch.on('close', code => { clearTimeout(t); resolve({ code: code, out: out }); });
  });
}

/* The first line that reads like an assertion failing, for the report. A
   finding that says only "this sweep went red" sends the reader back to run it
   themselves, which is most of the work. */
function firstFinding(out) {
  const m = out.match(/"[^"]*::[^"]{10,}/);
  if (m) return m[0].replace(/^"/, '').slice(0, 220);
  const e = out.match(/(?:Error|TypeError|ReferenceError)[^\n]{0,160}/);
  return e ? e[0] : '(no assertion text captured)';
}

/* ═══ THE CONTRACT, MECHANISED ══════════════════════════════════════════════
   This file's header states the whole basis of the probe — "Every mutation
   below is invisible to a human looking at the page. That is the whole
   contract, and it is why a red result is a finding about the CHECK and never
   about the product" — and nothing verified it. A mutation that moved one pixel
   would make every red result a lie in the most damaging direction available:
   it would blame a correct check for a difference the probe itself introduced,
   and somebody would rewrite a good assertion to satisfy it.

   So the two pages are rendered side by side and compared as PIXELS, on several
   tabs, with motion turned off so the comparison is of layout rather than of
   timing. Identical bytes, or the probe refuses to run and says which surface
   moved. It also reads back how many elements each mutation actually touched,
   because a mutation applied to nothing is invisible for the wrong reason and
   would sail through a pixel test.
   ═══════════════════════════════════════════════════════════════════════════ */
async function proveInvisible(cleanFile, mutantFile, on) {
  const { requirePlaywright, chromePath } = require('./_harness');
  const { chromium } = requirePlaywright();
  const FIX = require('./_harness').FIXTURE();
  const TABS = ['tasks', 'wbs', 'req', 'gantt', 'resources', 'baseline', 'analytics', 'raid'];
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const shots = {}, problems = [];
  let counts = null;
  for (const which of ['clean', 'mutant']) {
    const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });   // layout, not timing
    page.on('dialog', d => d.accept());
    if (which === 'mutant' && on) await page.addInitScript(o => { window.__PZ_ON = o; }, on);
    await page.goto('file://' + (which === 'clean' ? cleanFile : mutantFile), { waitUntil: 'load' });
    await page.evaluate(d => { hydrate(d); calculate(); }, FIX);
    await page.waitForTimeout(700);
    shots[which] = {};
    for (const t of TABS) {
      try {
        await page.evaluate(x => switchTab(x), t);
        await page.waitForTimeout(500);
        shots[which][t] = await page.screenshot({ fullPage: false });
      } catch (e) { problems.push('could not render ' + t + ' on the ' + which + ' page: ' + e.message); }
    }
    if (which === 'mutant') counts = await page.evaluate(() => window.__pzCounts || null);
    await page.close();
  }
  await b.close();
  const visibleOn = TABS.filter(t => shots.clean[t] && shots.mutant[t] && !shots.clean[t].equals(shots.mutant[t]));
  if (!counts) problems.push('the decorator never reported its counts, so nothing proves it ran at all');
  return { counts: counts, problems: problems, visibleOn: visibleOn };
}

/* ═══ THE SET IS CHOSEN BY MEASUREMENT, NOT BY ASSERTION ═══════════════════
   Each mutation is rendered on its own and kept only if the page is pixel-
   identical with it on. That is the file's stated contract, and running it
   turned up that the contract had never held: the whitespace padding changed
   the width of every inline leaf it touched — an <em> grew 4px, a <b> grew 5px
   — for the entire life of this probe. Padding only block-level leaves fixed
   seven of eight tabs, and the rest of the difference is the two mutations that
   add a CHILD, against a stylesheet carrying seventy-one :empty / :only-child /
   :nth-child rules that a new child necessarily disturbs.

   So the probe no longer claims a set and hopes. It measures, keeps what is
   invisible, drops what is not, and prints both — a smaller honest probe being
   worth more than a larger one whose red results might be its own doing. */
async function chooseMutations(cleanFile, mutantFile) {
  const ALL = ['cls', 'pad', 'decoy', 'wrap'];
  const NAME = { cls: 'an extra class on every element', pad: 'a space either side of block-level text',
                 decoy: 'a hidden bold decoy in every table cell', wrap: 'leaf text moved into a neutral span' };
  const kept = [], dropped = [];
  for (const m of ALL) {
    const on = { cls: 0, pad: 0, decoy: 0, wrap: 0 }; on[m] = 1;
    const r = await proveInvisible(cleanFile, mutantFile, on);
    const touched = r.counts ? (r.counts[{ cls: 'classed', pad: 'padded', decoy: 'decoyed', wrap: 'wrapped' }[m]] || 0) : 0;
    if (!touched) dropped.push({ m: m, why: NAME[m] + ' touched 0 elements, so it could not have proved anything' });
    else if (r.visibleOn.length) dropped.push({ m: m, why: NAME[m] + ' is VISIBLE on ' + r.visibleOn.join(', ')
      + ' — a mutation that moves a pixel makes every red result a finding about this probe' });
    else kept.push({ m: m, touched: touched, why: NAME[m] });
  }
  return { kept: kept, dropped: dropped };
}

(async () => {
  if (!fs.existsSync(APP)) { console.error('product file not found: ' + APP); process.exit(2); }
  const src = fs.readFileSync(APP, 'utf8');
  const at = src.lastIndexOf('</body>');
  if (at < 0) { console.error('no </body> in the product file — nothing to inject into'); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr-anchor-'));
  const mutant = path.join(tmp, 'presentation-mutant.html');
  fs.writeFileSync(mutant, src.slice(0, at) + DECORATOR + src.slice(at));

  /* Before a single check is run, because a probe that cannot be trusted to be
     invisible has nothing to say about anybody's assertions. */
  const chosen = await chooseMutations(APP, mutant);
  if (!chosen.kept.length) {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(JSON.stringify({ selfCheck: chosen, findings: [],
      note: 'REFUSING TO RUN. Not one mutation is invisible, so this probe cannot accuse anything of '
        + 'reading the packaging without the accusation possibly being its own doing.' }, null, 1));
    chosen.dropped.forEach(d => console.log('  ✗ ' + d.why));
    process.exit(1);
  }
  const ON = { cls: 0, pad: 0, decoy: 0, wrap: 0 };
  chosen.kept.forEach(k => { ON[k.m] = 1; });
  /* Re-written with only the surviving mutations enabled, so the checks below
     run against a page proved pixel-identical to the shipped one. */
  fs.writeFileSync(mutant, src.slice(0, at)
    + '<script>window.__PZ_ON = ' + JSON.stringify(ON) + ';</script>' + DECORATOR + src.slice(at));
  console.log('self-check: ' + chosen.kept.length + ' of 4 mutations are pixel-invisible on 8 tabs and are '
    + 'in use — ' + chosen.kept.map(k => k.m + ' (' + k.touched + ')').join(', '));
  chosen.dropped.forEach(d => console.log('  · dropped: ' + d.why));

  const findings = [], rows = [], notes = [];
  for (const c of CHECKS) {
    /* The BASELINE matters. A check that is red on the shipped build is red
       under the probe too, and calling that an anchoring finding would be the
       same mistake vacuity-check's first version made — reporting a check for
       a condition that has nothing to do with the question being asked. */
    const base = await run(c, APP);
    if (base.code !== 0) {
      notes.push(c + ' is already red on the shipped build, so this probe can say nothing about it');
      rows.push({ check: c, baseline: base.code, underProbe: null, verdict: 'skipped-already-red' });
      continue;
    }
    const probed = await run(c, mutant);
    rows.push({ check: c, baseline: 0, underProbe: probed.code,
                verdict: probed.code === 0 ? 'reads the property' : 'ANCHORED' });
    if (probed.code !== 0)
      findings.push(c + ' :: goes RED when the page is restyled without changing a single thing it says. '
        + 'Nothing a reader can see is different, so this is an assertion on the packaging rather than on '
        + 'the property — first failure: ' + firstFinding(probed.out));
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify({ checks: rows.length, rows: rows, notes: notes, findings: findings }, null, 1));
  if (findings.length) {
    console.log('\n' + findings.length + ' check(s) are anchored to how the page LOOKS rather than to what it '
      + 'says. Every mutation applied is invisible to a human — an unused class, a hidden empty span, a space '
      + 'either side of some text — so a red run here is a defect in the check, never in the product.');
  } else {
    console.log('\nall ' + rows.length + ' checks survived a restyling that changed nothing they assert about'
      + (notes.length ? '; ' + notes.length + ' not covered and named above' : '') + '.');
  }
  process.exitCode = findings.length ? 1 : 0;
})();

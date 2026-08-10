/* ═══════════════════════════════════════════════════════════════════════════
   WHICH ASSERTIONS HAVE NEVER FIRED?

   The mutation engine proves that a CHECK FILE can go red. That was the right
   question when the worry was a whole sweep gone vacuous, and it is far too
   coarse now: baseline-sweep is fifteen hundred lines and catches most of the
   mutant set, so "baseline-sweep has been the catcher" says nothing whatever
   about the ninety-odd individual assertions inside it. An assertion nobody
   ever aimed a mutant at is an assertion with no evidence behind it, and this
   session produced five defects that lived in exactly that gap:

     · a negative case built on a subject an earlier block had already touched,
       so it reported the product for answering correctly
     · an assertion on a derived list that also filtered on the condition being
       tested, so the mutant's change was masked and the check stayed green
     · a filter on `te` immediately after a hydrate — a derived field, zero
       until the next calculate() — which selected nothing and passed
     · an assertion anchored to markup that was later redrawn
     · a mutant neutered by a refactor, surviving because there was nothing left
       to catch rather than because something was unguarded

   Each was found by the engine or by printing an intermediate count. None was
   found by reading. So the useful instrument is not another kind of probe: it
   is knowing WHICH SENTENCES have ever been the one that fired.

   ── HOW ──────────────────────────────────────────────────────────────────

   Every sweep reports findings as strings, and every one of those strings is a
   sentence somebody wrote. So the sentences are the identifiers. This reads
   two things:

     1. the assertion texts that EXIST — extracted from the string literals
        passed to say()/fail.push()/bad.push() in each check file
     2. the assertion texts that have FIRED — from tests/.mutation-journal.json,
        which the mutation engine now writes on every run, recording the output
        of each catching run instead of throwing it away

   Everything in (1) and not in (2) is an assertion carrying no evidence. That
   is not the same as a broken assertion, and this file is a PROBE precisely
   because the difference matters: plenty of these guard conditions no mutant
   expresses, and a gate that failed on them would just be turned off. It
   reports; a person decides which of them are worth a mutant.

   ── WHAT IT CANNOT SAY ───────────────────────────────────────────────────

   An assertion that HAS fired is proven only against the mutants that fired it
   — it can still be wrong in a direction nothing has tested. And matching is by
   text, so a check whose message is built entirely from computed values has no
   stable identity here and is reported as never-fired even when it is doing its
   job. Both are stated in the output rather than left for the reader to
   discover.

   ── AND WHAT IT GOT WRONG, THREE TIMES ───────────────────────────────────

   Worth keeping, because the instrument built to measure unreliable checks was
   itself unreliable, in exactly the ways it exists to find. The answer moved
   39% → 28% → 37% across three versions of one function:

     · it required the reporting call's FIRST argument to be a quoted literal,
       so `say(t.name, '…')` was invisible and contradiction-sweep lost every
       assertion labelled with an activity name
     · it matched only ' and " literals, so golden-reference — which reports in
       template literals — came back with ZERO assertions, and that read as a
       finding about golden-reference rather than about the extractor
     · it scanned a fixed 900 characters forward instead of matching brackets,
       so it ran off the end of a call and reported the NEXT statement's strings
       as assertions belonging to it. In ai-boundary-sweep that meant an XSS
       payload — data being fed to the app — was listed as something a check says

   Each was found by reading the OUTPUT rather than the summary number, which is
   how every check defect in this directory has been found. A percentage is
   exactly the shape of thing you can stare at while it is wrong.

   One artefact is left and is not worth removing: an assertion whose opening
   fragment is under 24 characters — `'the model returned "' + id + '" does not
   resolve'` — is identified by its SECOND fragment, so it appears in the list
   labelled from the middle of its own sentence. It still matches correctly when
   it fires; only the label reads oddly.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');

const DIR = path.resolve(__dirname, '..');
const JOURNAL = path.join(DIR, '.mutation-journal.json');

/* The assertion SENTENCE out of a reporting call. Three shapes are in use here
   and the first version of this understood only one of them:

     say('Area', 'the sentence')      — literal label
     say(t.name, 'the sentence')      — the label is a VARIABLE
     fails.push(`the sentence ${x}`)  — a template literal

   Requiring a quoted first argument missed the second entirely, and matching
   only ' and " missed the third — so golden-reference reported ZERO assertions
   for a file full of them and contradiction-sweep lost the ones whose label is
   an activity name. Both read as findings about those checks and were findings
   about this extractor, which is the same mistake in miniature as everything
   this probe exists to surface: an instrument that cannot see something
   reporting that the something is not there.

   So: find the call, take every literal inside it, and keep the LONGEST — the
   sentence is long and the area label is short. Under 24 characters is dropped
   as too short to be an identity. */
function assertionsInFile(src) {
  const out = [];
  const call = /(?:say2?|fails?\.push|bad2?\.push)\s*\(/g;
  let m;
  while ((m = call.exec(src))) {
    const seg = callText(src, m.index + m[0].length - 1);
    const lits = literalsIn(seg);
    /* The FIRST literal long enough to be a sentence, not the longest. A
       sentence interrupted by a value — say('… "' + id + '" is not on the
       roster') — arrives as two fragments, and the opening one is what a fired
       message also starts with, so it is the half that matches. Taking the
       longest picked the tail, and in ai-boundary-sweep it picked an XSS
       PAYLOAD sitting in the same call: a string that is data being fed to the
       app rather than anything the check says. */
    const best = lits.find(t => t.length >= 24);
    if (best) out.push(best);
  }
  return [...new Set(out)];
}
/* The text of ONE call, by matching its brackets. Scanning a fixed number of
   characters forward — which is what this did — runs past the end of the call
   into whatever follows, and then reports the neighbouring code's strings as
   assertions belonging to it. */
function callText(src, openIdx) {
  let depth = 0, i = openIdx, inS = null;
  for (; i < src.length && i < openIdx + 4000; i++) {
    const ch = src[i], prev = src[i - 1];
    if (inS) { if (ch === inS && prev !== '\\') inS = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inS = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (!depth) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx, i);
}
function literalsIn(seg) {
  const out = [];
  const lit = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let l;
  while ((l = lit.exec(seg))) {
    const t = ((l[1] != null ? l[1] : l[2] != null ? l[2] : l[3]) || '')
      .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ')
      .replace(/\$\{[^}]*\}/g, ' ').trim();
    // markup is data being fed to the app, never something a check SAYS
    if (/^</.test(t) || /<(?:script|img|svg)\b/i.test(t)) continue;
    out.push(t);
  }
  return out;
}

/* Fired texts carry the area prefix and the computed tail; existing texts are
   the literal fragment. So the match is "does the fired text CONTAIN the
   literal", on a normalised form — one space, no case. */
const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

(function () {
  if (!fs.existsSync(JOURNAL)) {
    console.log(JSON.stringify({ note: 'no mutation journal yet — run `node tests/mutation-engine.js` '
      + 'once (a filtered run is enough to create it, a full run is needed to draw conclusions)' }, null, 1));
    return;
  }
  const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  /* THE ACCUMULATED UNION, not the last run. This read j.rows — the most recent
     run only — so after any filtered run it compared 1260 assertions against
     whatever four mutants happened to be re-checked and reported the difference
     as a coverage figure. The engine now keeps history.fired as a union that
     only grows; rows is still read as a fallback for a journal written before
     that existed. */
  const hist = j.history || {};
  const firedTexts = Object.keys(hist.fired || {});
  const fired = (firedTexts.length ? firedTexts
    : [].concat(...(j.rows || []).map(r => r.findings || []))).map(norm);
  /* AND ITS PROVENANCE, which is the difference between a measurement and a
     number. A union drawn from 12 of 339 mutants is not evidence about the
     suite, and printing a ratio without saying so is how "3 of 1260" came to
     be read as a finding about the checks rather than about the journal. */
  const runs = Array.isArray(hist.runs) ? hist.runs : [];
  const lastFull = runs.filter(r => r && r.full).pop() || null;
  const everRan = (hist.everRan || []).length;
  const ofSet = (runs.length ? runs[runs.length - 1].of : (j.of || 0));
  const provenance = {
    mutantsEverRun: everRan, mutantsInSet: ofSet,
    lastFullRun: lastFull ? lastFull.at : null,
    runsRecorded: runs.length,
    readAs: !everRan ? 'nothing has been run — this is not a measurement'
      : (!lastFull ? 'NO FULL RUN IS ON RECORD. The evidence below is drawn from ' + everRan + ' of '
          + ofSet + ' mutants, so a low "ever fired" count says more about what has been run than '
          + 'about the checks. Run `node tests/mutation-engine.js` with no filter before reading it '
          + 'as coverage.'
        : (everRan < ofSet ? 'the last full run was ' + lastFull.at + '; the union since covers '
            + everRan + ' of ' + ofSet + ' mutants'
          : 'the union covers every mutant in the set; this is a measurement'))
  };

  const files = fs.readdirSync(DIR)
    .filter(f => /sweep.*\.js$/.test(f) || f === 'golden-reference.js' || f === 'run-test-plan.js')
    .sort();

  const rows = [], never = [];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const all = assertionsInFile(src);
    const hit = all.filter(a => { const n = norm(a); return fired.some(x => x.indexOf(n) >= 0); });
    /* A file with nothing extractable is not a file with no assertions — it is
       one whose messages are built entirely from computed values, which have no
       stable identity to match on. golden-reference is the clear case: its
       failures read `${what}: expected ${exp}, got ${got}`, and with the holes
       removed there is no sentence left. Saying "0%" about it would be this
       probe reporting its own blind spot as a finding about the check. */
    rows.push({ check: f, assertions: all.length, everFired: hit.length,
                proven: all.length ? Math.round(100 * hit.length / all.length) + '%'
                  : 'n/a — its messages are built from computed values, so they carry no stable text '
                    + 'for this to match on' });
    all.filter(a => !hit.includes(a)).forEach(a => never.push({ check: f, says: a.slice(0, 110) }));
  });

  // the denominator counts only what is MATCHABLE, and says so
  const tot = rows.reduce((s, r) => s + r.assertions, 0);
  const hitTot = rows.reduce((s, r) => s + r.everFired, 0);
  console.log(JSON.stringify({
    journal: { lastRun: j.at, lastRunWasFull: !!j.full, lastRunSize: j.ran, mutantsInSet: j.of },
    evidence: provenance,
    totals: { assertions: tot, everFired: hitTot,
              proven: tot ? Math.round(100 * hitTot / tot) + '%' : '—' },
    byCheck: rows,
    neverFired: never
  }, null, 1));
  /* THE HEADLINE CARRIES ITS OWN PROVENANCE. This printed the bare ratio, and a
     bare ratio off a four-mutant journal read as a finding about 1260
     assertions — which is how "507 of 800" came to be quoted as a fact about
     the suite long after the run that produced it had been overwritten. A
     number nobody can tell the weight of is worse than no number. */
  const solid = provenance.mutantsEverRun >= provenance.mutantsInSet && provenance.lastFullRun;
  console.log('\n' + hitTot + ' of ' + tot + ' MATCHABLE assertions have been the one that went red at '
    + 'least once.');
  console.log(solid
    ? 'Evidence: every one of ' + provenance.mutantsInSet + ' mutants has been run; last full run '
      + provenance.lastFullRun + '. This is a measurement.'
    : '⚠ NOT A MEASUREMENT — ' + provenance.readAs);
  console.log('An assertion with no evidence is not the same as a wrong one. Read the list and decide '
    + 'which\ndeserve a mutant; an assertion nobody can make fail is what this directory exists to find.');
})();

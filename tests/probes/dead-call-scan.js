/* ═══════════════════════════════════════════════════════════════════════════
   AN ASSERTION THAT HAS NEVER RUN CAN BE ARBITRARILY BROKEN

   client-facing-sweep.js carried this for months:

       say('Client-safe status report', '… ' + leaked.slice(0, 4).map(money).join(', '))

   `money` is not a function. Not in the sweep, not in the product, nowhere. The
   line is inside `if (leaked.length)`, which only runs when client-safe mode
   LEAKS a money figure, and the shipped build does not leak — so the branch had
   never executed once. The check passed every day, and it passed because it was
   never asked the question.

   It surfaced when the mutation engine broke client-safe mode: the sweep
   CRASHED rather than reported, and the engine stopped the whole run rather
   than score a crashed check as a catch. That is the harness-failure guard
   doing its job, and it is also an expensive way to find a typo — it cost a
   thirty-minute run, and it can only find one at a time, in whichever branch a
   mutant happened to reach.

   So: find them statically instead. Every call site inside a sweep's browser
   code names an identifier; that identifier has to exist either in the sweep
   itself or in the product the sweep drives. Anything else is a line that will
   throw the first time it matters.

   WHAT THIS COVERS: names with a paren after them, and names handed to an
   array method that takes a function. `money` was the second kind — it is
   never called, it is passed to .map() — and the first version of this scan
   walked past it while being built to find it.

   WHAT IT CANNOT DO, said plainly so a green run is not over-read: it checks
   that a NAME resolves, not that a branch is reachable, and not that the
   assertion is worth anything. 507 of these assertions have still never been
   the thing that went red. This closes the crash-when-it-fires hole, which is
   the subset that makes a red finding disappear into a stack trace. It also
   does not do scope analysis: a global that shadows a local, or a name only
   valid inside one closure, is beyond it.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const PRODUCT = ['index.html', 'pert-gantt-tracker.html']
  .map(n => path.join(ROOT, n)).find(p => fs.existsSync(p));
if (!PRODUCT) { console.error('no product file found'); process.exit(2); }
const SRC = fs.readFileSync(PRODUCT, 'utf8');

/* What the browser already has. Deliberately generous: a false ALARM here
   costs somebody an investigation and teaches them to ignore the check, which
   is worse than the occasional miss this scan was never going to catch. */
const BUILTINS = new Set(`
Array Object String Number Boolean Math JSON Date RegExp Map Set WeakMap WeakSet Promise Symbol
Error TypeError RangeError SyntaxError Function BigInt Proxy Reflect Intl
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
setTimeout setInterval clearTimeout clearInterval requestAnimationFrame queueMicrotask structuredClone
alert confirm prompt fetch btoa atob getComputedStyle matchMedia
console document window navigator localStorage sessionStorage location history
Blob File FileReader FormData URL URLSearchParams TextEncoder TextDecoder AbortController
Element HTMLElement Node NodeList Event CustomEvent MutationObserver IntersectionObserver
ClipboardItem Image Audio Worker IDBKeyRange indexedDB crypto performance
ErrorEvent PromiseRejectionEvent DOMParser XMLSerializer Range Text Option
eval require module exports process __dirname __filename Buffer
`.trim().split(/\s+/));

/* Declarations in the product: function f(), const f = , let f = , var f = ,
   and class-ish assignments. */
function declaredIn(text) {
  const out = new Set();
  const pats = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\b|\()/g,   // object-literal methods
    /\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g                        // destructured
  ];
  pats.forEach((re, i) => {
    let m;
    while ((m = re.exec(text))) {
      if (i === 4) m[1].split(',').forEach(part => {
        const nm = part.split(':').pop().split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(nm)) out.add(nm);
      });
      else out.add(m[1]);
    }
  });
  return out;
}

/* ═══ ONLY WHAT THE BROWSER SCOPE ACTUALLY HAS ═══════════════════════════
   declaredIn(SRC) over the whole product is too generous, and it swallowed the
   exact bug this scan was written for: `money` appears eleven times in
   index.html as `const money = …` — every one of them a LOCAL inside some
   function, none of them reachable from a page.evaluate. Counting locals as
   globals turns the allow-list into "any word that appears anywhere", and an
   allow-list that permissive permits everything.

   The product is one file with one script block at a consistent four-space
   top-level indent, so a top-level declaration is one that starts at exactly
   that indent. That is a convention, not a language rule, so it is checked:
   if the count collapses, the convention has changed and this scan would
   quietly start reporting hundreds of real globals as missing. Better to say
   so than to become the check nobody trusts. */
function topLevelNames(text) {
  const out = new Set();
  const re = /^ {4}(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/gm;
  let m;
  while ((m = re.exec(text))) out.add(m[1] || m[2]);
  return out;
}
const PRODUCT_NAMES = topLevelNames(SRC);
const MIN_GLOBALS = 300;
if (PRODUCT_NAMES.size < MIN_GLOBALS) {
  console.error('Only ' + PRODUCT_NAMES.size + ' top-level declarations found in '
    + path.basename(PRODUCT) + ', against at least ' + MIN_GLOBALS + ' expected. The file\'s '
    + 'indentation convention has changed, so this scan can no longer tell a global from a local '
    + 'and would report most of the product as missing. Fix the detection, do not relax the check.');
  process.exit(2);
}

/* Call sites: `name(` where name is NOT preceded by a dot (that is a method on
   something and this scan says nothing about it), not a keyword, and not
   immediately part of a declaration. */
const KEYWORDS = new Set(`if for while switch catch return typeof instanceof new delete void async
  do else try finally throw yield await function class const let var of in case default extends super import export`
  .trim().split(/\s+/));

/* Quoted text out, ${…} holes kept. Written as a scan rather than a regex
   because quotes nest inside each other in this suite constantly — "it's" in a
   double-quoted sentence, apostrophes in escaped single-quoted ones — and a
   regex for that is how a stripper starts eating real code. */
/* A stripped span is replaced by the same NUMBER OF NEWLINES it contained, so
   the line numbers this reports point at the real line in the real file. The
   first version collapsed multi-line strings to nothing and reported four
   different findings as all being on line 999 — a report nobody can act on. */
function nl(span) { return '\n'.repeat((span.match(/\n/g) || []).length); }
function stripLiterals(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "'" || c === '"') {
      const start = i, q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; out += '""' + nl(src.slice(start, i));
      continue;
    }
    if (c === '`') {
      const tstart = i;
      i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; out += ' ';
          // copy the expression itself — it is code
          let d = 1;
          while (i < n && d > 0) {
            if (src[i] === '{') d++;
            else if (src[i] === '}') { d--; if (!d) break; }
            out += src[i]; i++;
          }
          i++; out += ' ';
          continue;
        }
        if (src[i] === '`') { i++; break; }
        i++;
      }
      out += ' "" ' + nl(src.slice(tstart, i));
      continue;
    }
    /* COMMENTS, IN THE SAME PASS. Stripping them first — a separate regex over
       the whole file — is how the last four findings survived: a comment
       terminator sitting inside a string literal ends a real comment early, and
       an opener sitting in prose starts a fake one, after which every offset is
       wrong and the stripper is reporting on text it has misread. Strings,
       templates, regexes and comments all have to be recognised by one scanner
       that knows which of them it is currently inside.

       Writing this note is what proved the point: the first draft spelled both
       delimiters out, and the terminator closed this very comment two lines
       early. The file would not parse. */
    if (c === '/' && src[i + 1] === '*') {
      const start = i; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += ' ' + nl(src.slice(start, Math.min(i, n)));
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    /* REGEX LITERALS. /activit(y|ies)/ is not a call to activit(), and four of
       the twelve findings this scan first produced were exactly that. Detected
       by what can legally precede a regex — an operator or an opening bracket,
       never a value — which is the standard way to resolve the division
       ambiguity and is right far more often than it is wrong here. */
    if (c === '/' && /[(,=:[!&|?+\-*%~^{;]|\breturn|\btypeof/.test(prevTok(out))) {
      const start = i; i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i++; break; }
        else if (src[i] === '\n') break;          // not a regex after all
        i++;
      }
      while (i < n && /[gimsuyd]/.test(src[i])) i++;
      out += ' RE ' + nl(src.slice(start, i));
      continue;
    }
    out += c; i++;
  }
  return out;
}
/* The last non-space characters written, which is what decides whether a `/`
   opens a regex or divides. */
function prevTok(out) { return out.replace(/\s+$/, '').slice(-8); }

const files = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter(f => /sweep.*\.js$|^golden-reference\.js$/.test(f))
  .map(f => path.join(ROOT, 'tests', f));

const findings = [];
const perFile = {};
files.forEach(fp => {
  const text = fs.readFileSync(fp, 'utf8');
  /* Comments AND string literals carry prose that looks like code. A note
     saying "trunkPush(quiet)" is not a call site, and neither is the English in
     say('… resolved without opening the review (…)'). The first version of this
     stripped only comments and reported thirty findings, every one of them a
     word inside a sentence — a check that cries wolf thirty times is a check
     people turn off, so this is the difference between the scan being used and
     the scan being muted.

     Template literals keep their ${…} holes, because those ARE code: the
     text between them is prose and the expressions inside them are not. */
  const code = stripLiterals(text);
  const local = declaredIn(code);
  /* Parameters, from REAL headers only: `(a, b) =>` and `function f(a, b)`.
     The first version matched any identifier sitting between a bracket and a
     comma, which is also the shape of `.map(money)` — so the one bug this whole
     scan was written for was being classified as a parameter declaration and
     skipped. Re-planting it proved the scan green, which is the same
     never-fired-so-never-checked failure the scan exists to find, committed by
     the scan. The `=>` is what makes a parenthesised list a parameter list. */
  const params = new Set();
  let pm;
  const arrow = /\(([^()]*)\)\s*=>/g;
  while ((pm = arrow.exec(code))) pm[1].split(',').forEach(x => {
    const nm = x.trim().split('=')[0].trim().replace(/^\.\.\./, '');
    if (/^[A-Za-z_$][\w$]*$/.test(nm)) params.add(nm);
  });
  const bare = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*=>/g;
  while ((pm = bare.exec(code))) params.add(pm[2]);
  const fn = /\bfunction\s*[\w$]*\s*\(([^()]*)\)/g;
  while ((pm = fn.exec(code))) pm[1].split(',').forEach(x => {
    const nm = x.trim().split('=')[0].trim().replace(/^\.\.\./, '');
    if (/^[A-Za-z_$][\w$]*$/.test(nm)) params.add(nm);
  });
  /* catch (e) binds a name too. */
  const cat = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
  while ((pm = cat.exec(code))) params.add(pm[1]);

  const seen = new Map();
  const consider = (name, idx, how) => {
    if (KEYWORDS.has(name) || BUILTINS.has(name)) return;
    if (local.has(name) || params.has(name) || PRODUCT_NAMES.has(name)) return;
    const line = code.slice(0, idx).split('\n').length;
    if (!seen.has(name)) seen.set(name, line + (how ? ' (' + how + ')' : ''));
  };
  let m;
  /* 1. Call sites: name(… */
  const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(code))) consider(m[2], m.index, '');
  /* ═══ 2. CALLBACKS PASSED BY NAME ══════════════════════════════════════
     The bug that started all of this was `leaked.map(money)`, and the scan
     above walked straight past it: `money` is never CALLED there, it is handed
     to map as a value. A name passed to a higher-order method has to resolve
     to a function exactly as much as a name with a paren after it — more so,
     because there is no paren to make it look like code.

     Restricted to the array methods that take a function, rather than every
     bare identifier in the file. General identifier resolution is a different
     and much noisier job — it would need real scope analysis — and this is the
     shape the mistake actually takes: somebody reaching for a formatter by the
     name they half-remember. */
  const HOF = /\.(?:map|filter|forEach|find|findIndex|some|every|sort|flatMap|reduce|reduceRight)\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
  while ((m = HOF.exec(code))) consider(m[1], m.index, 'passed as a callback');
  const rel = path.relative(ROOT, fp);
  perFile[rel] = [...seen.entries()].map(([n, l]) => n + ':' + l);
  seen.forEach((line, name) => findings.push({ file: rel, name, line }));
});

const out = { scanned: files.length, product: path.basename(PRODUCT),
  productNames: PRODUCT_NAMES.size, findings, perFile };
console.log(JSON.stringify(out, null, 1));
if (findings.length) {
  console.error('\n' + findings.length + ' call(s) name something that exists nowhere — '
    + 'each will throw the first time its branch runs, and a check that throws is scored as a '
    + 'CRASH, not as a finding:');
  findings.forEach(f => console.error('  ' + f.file + ':' + f.line + '  ' + f.name + '(…)'));
  process.exitCode = 1;
}

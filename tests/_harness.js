/* Shared setup for every probe.

   playwright-core is not vendored into this repo — it lives wherever the runner
   installed it. Resolving it by walking NODE_PATH and a few known roots means a
   probe runs with `node tests/<name>.js` from the repo root instead of only from
   the directory that happens to hold node_modules, which is how the first
   committed copies of these files were unrunnable. */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');

function requirePlaywright() {
  const roots = [];
  if (process.env.PLAYWRIGHT_ROOT) roots.push(process.env.PLAYWRIGHT_ROOT);
  (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).forEach(p => roots.push(p));
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) {}
  // any node_modules from here up to the filesystem root
  let d = __dirname;
  for (let i = 0; i < 8 && d !== path.dirname(d); i++, d = path.dirname(d)) roots.push(path.join(d, 'node_modules'));
  // and the scratchpad the session probes were developed in
  try {
    const base = '/tmp/claude-0';
    if (fs.existsSync(base)) fs.readdirSync(base).forEach(a => {
      const p1 = path.join(base, a);
      if (!fs.statSync(p1).isDirectory()) return;
      fs.readdirSync(p1).forEach(b2 => roots.push(path.join(p1, b2, 'scratchpad', 'node_modules')));
    });
  } catch (e) {}
  for (const r of roots) {
    const p = path.join(r, 'playwright-core');
    if (fs.existsSync(p)) { try { return require(p); } catch (e) {} }
  }
  try { return require('playwright-core'); } catch (e) {}
  console.error('playwright-core not found. Install it (npm i playwright-core) or set PLAYWRIGHT_ROOT '
    + 'to the node_modules directory holding it.');
  process.exit(2);
}

// Chromium is pre-installed in this environment; do not download one.
function chromePath() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r)) {
      if (!/chromium/i.test(d)) continue;
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(r, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;   // let playwright find its own
}

/* APP_FILE lets a check run against a deliberately broken copy of the product.
   That is how a sweep proves it can still fail: point it at a mutant and it must
   go red. Unset — which is every real run — it is the shipped file. */
/* index.html IS the product here. It was pert-gantt-tracker.html in the repo
   this suite grew up in, copied to index.html on every deploy — two names for
   one file, and a copy step nobody could see that had to be remembered. GitHub
   Pages wants index.html, so index.html is what the checks read. The old name
   is still accepted so a stray checkout of the previous layout still runs. */
const APP_CANDIDATES = ['index.html', 'pert-gantt-tracker.html'];
const APP = 'file://' + path.resolve(process.env.APP_FILE || (() => {
  for (const n of APP_CANDIDATES) {
    const p2 = path.resolve(__dirname, '..', n);
    if (fs.existsSync(p2)) return p2;
  }
  return path.resolve(__dirname, '..', APP_CANDIDATES[0]);
})());
/* FIXTURE_FILE points a check at a different plan, the way APP_FILE points it at
   a different build. Both exist for the same reason: a check has to be runnable
   against something OTHER than the happy case, or nothing can ask whether it is
   reading its inputs at all. vacuity-check.js uses it to feed every sweep an
   empty plan and require the output to change. */
const FIXTURE = () => JSON.parse(fs.readFileSync(process.env.FIXTURE_FILE
  || path.resolve(__dirname, '..', 'fixtures', 'crm-rollout.json'), 'utf8'));

module.exports = { requirePlaywright, chromePath, APP, FIXTURE };

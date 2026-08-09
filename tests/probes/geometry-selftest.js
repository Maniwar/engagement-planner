/* Does the probe DISCRIMINATE? A geometry audit that reports nothing is either
   a clean product or a broken probe, and from the output those look identical.
   Each defect below is planted into the live page and must be found. */
const { requirePlaywright, chromePath, APP, FIXTURE } = require('../_harness');
const { chromium } = requirePlaywright();
const fs = require('fs');
const DATA = FIXTURE();
const { AUDIT } = require('./geometry-lib.js');

(async () => {
  const b = await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:chromePath()});
  const p = await b.newPage({viewport:{width:1440,height:900}});
  p.on('dialog', d=>d.accept());
  await p.goto(APP,{waitUntil:'load'});
  await p.evaluate(d=>{hydrate(d);calculate();},DATA);
  await p.waitForTimeout(600);
  await p.evaluate(()=>switchTab('tasks'));
  await p.waitForTimeout(700);

  const run = async () => p.evaluate(AUDIT);
  const clean = await run();
  const plant = async html => p.evaluate(h => {
    document.getElementById('__geo')?.remove();
    const d = document.createElement('div'); d.id='__geo'; d.innerHTML = h;
    (document.querySelector('main')||document.body).appendChild(d);
  }, html);
  const clear = async () => p.evaluate(()=>document.getElementById('__geo')?.remove());

  const cases = [
    ['clipped',  '<div style="width:60px;overflow:hidden;white-space:nowrap">Signed-off scope confirmation note</div>'],
    // table-layout:fixed is what actually honours the width; without it the
    // browser auto-layouts the column wider and nothing is crushed, so the first
    // version of this case tested the PROBE against a defect that was not there
    ['crushed',  '<table style="table-layout:fixed;width:14px"><tr><td style="width:10px;overflow:hidden">A. Rivera</td></tr></table>'],
    ['overhang', '<div class="table-wrap" style="overflow:visible;width:200px"><table style="width:900px"><tr><td>x</td></tr></table></div>'],
    ['page',     '<div style="width:3000px;height:4px"></div>'],
    ['truncated','<div style="width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Signed-off scope confirmation note from the CEO</div>'],
    /* The two shapes the probe was blind to until a person found one by hand.
       ESCAPES is the roster's company picker exactly: an inline width larger
       than the cell that was supposed to bound it, which no question about
       clipping, crushing or trapping can see because the box is not too small
       for its content — it is too big for its container. */
    ['escapes',  '<table style="table-layout:fixed;width:120px"><tr><td style="width:60px">'
               + '<select style="width:150px"><option>— none —</option></select></td></tr></table>'],
    /* COLLIDE is what that overflow then does: lands on the control in the next
       column, so a click aimed at one opens the other. Two cells, because
       controls overlapping INSIDE one field are a composition somebody chose
       and reporting those produced 22 findings and no defects. */
    ['collide',  '<table style="table-layout:fixed;width:200px"><tr>'
               + '<td style="width:60px"><select style="width:150px"><option>— none —</option></select></td>'
               + '<td style="width:60px"><input value="100"></td></tr></table>'],
    /* BURIED, in both of its shapes. The first is a scrim: a panel with no
       controls in it laid over one, which `collide` cannot see because it only
       ever compares two controls to each other. The second is the quieter one —
       nothing is on top at all, the control simply refuses clicks and hands them
       to the box behind it, so every box measurement in this file agrees the
       layout is perfect while the button does nothing. */
    ['buried',   '<div style="position:relative;height:60px">'
               + '<button style="position:absolute;left:10px;top:10px;width:120px;height:34px">Approve</button>'
               + '<div style="position:absolute;left:0;top:0;width:200px;height:60px;background:rgba(0,0,0,.02)"></div>'
               + '</div>'],
    ['buried-inert', '<div><button style="pointer-events:none;width:120px;height:34px">Approve</button></div>']
  ];
  const res = {};
  for (const [kind, html] of cases) {
    await plant(html); await p.waitForTimeout(180);
    const got = await run();
    // two cases prove the same kind by two different routes; both must fire
    res[kind] = got.some(f => f.kind === kind.replace(/-.*$/, ''));
    await clear();
  }
  console.log(JSON.stringify({ cleanFindings: clean.length, cleanKinds: clean.map(f=>f.kind+':'+f.detail.slice(0,60)), detects: res }, null, 1));
  const missed = Object.entries(res).filter(([,v])=>!v).map(([k])=>k);
  if (missed.length) console.log('NOT DETECTED: ' + missed.join(', ') + ' — the probe is blind to these');
  await b.close();
  if (missed.length) process.exitCode = 1;
})();

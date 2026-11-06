/* ═══════════════════════════════════════════════════════════════════════════
   EVERY GANTT ARROW JOINS THE TWO DATES ITS LINK NAMES, AND TOUCHES NOTHING ELSE.

   Reported with a screenshot of a real engagement plan: arrows that ran back
   from the end of a folded phase into the far ends of the bars below it, a
   line dropped through every bar it fed, and short loops between a folded
   phase and its own milestones. The plan here has that plan's shape — its WBS
   codes, durations and links, the folds the screenshot had — under neutral
   names, plus one phase that uses every link type, two that each wait on
   the other's work (folded, the picture goes round in a circle), and one
   where four arrows a day apart drop past a gate with a short label and then
   one with a long label (so one of them, whatever the font, is a step short
   of clearing the first label and nowhere near clearing the second), and one
   whose gates wait on each other through hidden work with a lead in it. The
   sample plan runs too.

   Each view is drawn, and every arrow is measured against the shapes on the
   chart and against dates counted here from the schedule, not asked of the
   router:

   1. Every arrow says which link it draws, and both of its ends are drawn.
      Its pieces are only ever horizontal or vertical.
   2. It LEAVES its predecessor at the date the link names: the finish for
      finish-to-start and finish-to-finish, the start for start-to-start and
      start-to-finish. That is a bar's right or left end, a diamond's top or
      bottom point, or — when the predecessor is folded into a phase — the
      phase bar at that hidden activity's own date, never the phase's end.
   3. It LANDS on its successor at the date the link names: a bar's start (its
      left end, or its top or bottom just inside the start) for -to-start
      links, its finish for -to-finish links; a diamond only through its top or
      bottom point; a folded phase at the hidden activity's own date. The head
      points into the shape it lands on.
   4. The head rides a straight run at least as long as the head (8 px).
   5. No arrow runs through an activity's bar or a diamond on its way, nor
      through either of its own two ends. Phase bars it may cross: phases
      overlap in time, so an arrow into a phase that began earlier has to pass
      that phase's bar, which sits above the activity and spans its date, and
      one between two phases often has to pass the bar of one between them.
      An activity's bar it may cross only where both ways round it are off
      the chart or more than max(160 px, 8 days) away — a crossing beats a
      detour across the chart. Work that starts on day one, under a long bar
      that also starts on day one, has no way round on the left.
   6. No two arrows draw the same pair.
   7. An arrow out of a folded phase draws the hidden activity that GATES the
      successor — of the phase's activities that the successor waits on, the
      one that finishes last. Keeping whichever came first drew a folded build
      phase as gating its review from the build's first day.
   8. An arrow never steps aside for the bar of a phase that holds one of its
      own ends: it is entering or leaving that phase anyway. Steering round it
      sent arrows out past the phase's far end and back, and boxed in a
      diamond that two arrows into one gate passed on either side.
   9. No arrow joins a row to the bar of a folded phase that holds it. A gate
      left showing under a folded phase, linked to work hidden in that same
      phase, drew a loop: up out of the gate into its own phase bar, and back
      down from the bar into the next gate.
   10. No link is lost. Where an activity waits on one that shows as another
      row (neither holding the other), a chain of drawn arrows leads from the
      one row to the other. The loops of rule 9 made the folded picture
      circular, and the pass that drops arrows a longer chain already implies
      then dropped two arrows each "implied" by the other: nothing led from
      the first phase into the second.
   11. Gates showing under one folded phase that wait on each other through
      its hidden work are joined by arrows, so dropping the loops of rule 9
      leaves no gate floating with nothing to say where it sits in the flow.
   12. No line runs through a gate's label where the column beside its diamond,
      on the side away from the label, was within 40 px. Further than that the
      line may cross (the label sits on a halo): arrows sent the long way round
      to spare a label swung out and back across half the chart, which read
      far worse. Round a diamond it goes on the side away from the label.
   13. A sideways step that no shape forced pays for itself: the straight
      line would have run through a label before its next turn (labels
      measured as drawn — a wide estimate stepped round text that was not
      there and into the next label), the step is at most 40 px, and the line
      it steps to crosses none of the labels the straight line would have.
      Stepping past one label only to cross the next one anyway put a kink in
      the line and saved nothing.
   14. The span the chart keeps lines out of for a gate's label (data-glab)
      is the label as drawn, to within 1.5 px. The chart's room-making guess at
      a label's width runs up to 35 px wide; kept clear on that guess, a line
      stepped round text that was not there and into the next label.
   15. No arrow is drawn that other drawn arrows already imply: no chain of
      them leads from its predecessor's row to its successor's through plain
      finish-to-start links alone (an arrow joining two gates through a folded
      phase's hidden work counts, when every link in that work is one). Folded,
      a build phase drew a gate's line to the final review beside the arrow
      that joined the first review to the final one — the same constraint
      twice, and a third red line down the phase.
   16. And no link is left out that they do not imply: where a link joins two
      rows and no arrow is drawn for it, it is a plain finish-to-start and a
      chain of drawn plain finish-to-start arrows leads there instead. A lead
      in the hidden work makes the chain round it weaker than the link.

   Views: everything open on dates, on weeks, and on days zoomed in; the
   screenshot's folds on dates, on weeks, and on days zoomed in; phases only
   (L1) on dates, on weeks and on days zoomed in; two levels (L2) zoomed out
   and on weeks; three levels (L3); the sample plan open, at L1 and at L2.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();

// [WBS code, days ('' for a phase, 0 for a gate), predecessors, and for a gate
// what it marks]. A lead is written FS-5; the folds below are the ones the
// screenshot had. The gates say what they mark, in neutral words as long as a
// real plan's, because how far a label runs decides where a line can pass it.
const SHAPE = `P2||PRE-PLAN
P2.1|0||signed SOW received
P2.2|4|P2.1
P2.3|0|P2.2|welcome email sent to the customer
P2.4||P2.2
P2.4.1|1|P2.3
P2.4.2|5|
P2.4.3|4|P2.4.1
P2.5|5|P2.2
P2.6|4|P2.4.1
P2.7|4|P2.4.1
P2.8|4|P2.4.1
P2.9|4|P2.4.1
P2.10|4|P2.4.1
3||PLAN
3.1||P2.4.3,P2.5,P2.6,P2.7,P2.8,P2.9,P2.10
3.1.1|0||kick-off minutes shared with everyone
3.1.2|0||weekly status meetings scheduled
3.2|2|3.1
3.3||3.2
3.3.1|2|3.2
3.3.1.2|3|3.3.1
3.3.1.3|5|3.3.1
3.3.1.4|0|3.3.1.3|customer signoff on the requirements
4||BUILD
4.1|3|3.3.1.4
4.2||3.3.1.4
4.2.1||3.3.1.4
4.2.1.1|1|3.3.1.4
4.2.1.2|1|4.2.1.1
4.2.1.3|1|4.2.1.2
4.2.2||4.2.1
4.2.2.1|1|4.2.1
4.2.2.2|1|4.2.2.1
4.2.2.3|1|4.2.2.2
4.2.3||4.2.1
4.2.3.1|1|4.2.1
4.2.3.2|1|4.2.3.1
4.2.3.3|1|4.2.3.2
4.2.4||4.2.2,4.2.3
4.2.4.1|1|4.2.2,4.2.3
4.2.4.2|1|4.2.4.1
4.2.4.3|1|4.2.4.2
4.2.5||4.2.2
4.2.5.1|1|4.2.2
4.2.5.2|1|4.2.5.1
4.2.5.3|1|4.2.5.2
4.2.6||4.2.2,4.2.3
4.2.6.1|1|4.2.2,4.2.3
4.2.6.2|1|4.2.6.1
4.2.6.3|1|4.2.6.2
4.2.7||4.2.4,4.2.5,4.2.6
4.2.7.1|1|4.2.4,4.2.5,4.2.6
4.2.7.2|1|4.2.7.1
4.2.7.3|1|4.2.7.2
4.3||3.3.1.4
4.3.1|0|4.2|first build review held
4.3.2|3|4.3.1
4.3.3|0|4.3.2|final build review held
5||UAT
5.1|5|3.3.1.4
5.2||4.2
5.2.1|1|5.2
5.3|0|4.3.3|customer approval to proceed with testing
5.4|0|4.3.3|test kick-off scheduled
5.5||4.3.3
5.5.1|3|5.5
5.5.2|4|5.5
5.5.3|1|5.5.2
7||EDUCATE
7.1||3.3.1.4
7.1.2|5|7.1
7.1.3|5|7.1.2
7.2||7.1.3
7.2.1|0|7.2|session two on community management
7.2.2|0|7.2.1|session three on reporting and analytics (1hr)
7.2.3|0|7.2.2|session four on system admin
7.2.4|0|7.2.1,7.2.2,7.2.3|all the training content uploaded
7.3|0|7.2.1,7.2.2,7.2.3|training signed off
8||GO LIVE
8.1||5.5.3
8.2|0|5.5.3|support told of the launch
8.3||5.5.3
8.3.1|2|8.3
8.1.2|0|8.1|customer signoff on the launch checklist
8.4|0|8.1.2|go / no-go meeting held
8.5|0|8.4|customer signoff on the launch date
8.6|0|8.5|launch
9||EMPOWER
9.1|3|5.5.3
9.2|3|5.5.3
9.3|2|9.1
9.4|10|9.3
10||CLOSURE
10.1|2|9.4FS-5
10.2|2|9.4FS-5
10.3|0|10.2|internal handover meeting held
10.4|2|10.3
10.5|2|10.3
10.6|0|10.5|external wrap-up meeting held
10.7|0|10.6|closing note sent to the customer
11||LINK TYPES
11.1|6|4.1SS+1
11.2|3|4.2.7.3FF
11.3|2|4.2.2.1FS-1
11.4|2|8.6SF
11.5|2|11.1SS
12||CROSS A
12.1|2|11.5
12.2|2|13.1
13||CROSS B
13.1|2|11.5
13.2|2|12.1
14||LABELS
14.1|2|
14.2|10|
14.3|9|
14.4|8|
14.5|7|
14.6|0|14.1
14.7|0|14.1|a long label that runs well past every line
14.8|2|14.2
14.9|2|14.3
14.10|2|14.4
14.11|2|14.5
15||LEAD
15.1|0|10.7|go-ahead for the phase with a lead
15.2||15.1
15.2.1|0||first step of the phase signed off
15.2.2|3|15.2.1FS-2
15.2.3|0|15.2.2|last step of the phase signed off`.split('\n').map(l => l.split('|'));
const FOLDS = ['P2.4', '3.1', '3.3', '4.2', '4.3'];
const TODAY = '2026-11-05';

function shapedPlan() {
  const D = FIXTURE();
  const base = JSON.parse(JSON.stringify(D.tasks.find(t => !t.milestone && t.parentId != null) || D.tasks[0]));
  const codes = SHAPE.map(r => r[0]);
  const idOf = new Map(codes.map((c, i) => [c, i + 1]));
  const parentCode = c => { const p = c.split('.'); while (p.length > 1) { p.pop(); const k = p.join('.'); if (idOf.has(k)) return k; } return c === 'P2' || !/^P/.test(c) ? null : 'P2'; };
  const phase = new Set(codes.map(parentCode).filter(Boolean));
  const P = JSON.parse(JSON.stringify(D));
  Object.assign(P, { projectName: 'Arrow check', projectStart: '2026-10-26', holidays: '', baselineDate: '', statusHistory: [],
    raid: [], reqs: [], coLog: [], collapsedIds: [], nextId: codes.length + 10 });
  P.tasks = SHAPE.map(([c, days, preds, marks], i) => {
    const t = JSON.parse(JSON.stringify(base));
    const gate = !phase.has(c) && days === '0';
    Object.assign(t, { id: i + 1, name: (preds && !/[|,\d]/.test(preds[0]) && days === '' && !parentCode(c)) ? preds : (phase.has(c) ? 'Phase ' : gate ? 'Gate ' : 'Activity ') + c + (marks ? ' — ' + marks : ''),
      parentId: parentCode(c) ? idOf.get(parentCode(c)) : null, milestone: gate, percentComplete: 0, owner: 'PM', attendees: [],
      description: '', deliverable: '', acceptance: '', actualStart: '', actualFinish: '', actualEffort: null, jira: '',
      startNoEarlier: '', deadline: '', baseStart: '', baseFinish: '', baseTe: 0, baseCost: 0 });
    t.o = t.m = t.p = phase.has(c) ? 0 : +days || 0;
    t.predecessors = String(!parentCode(c) && days === '' ? '' : preds || '').split(',').filter(Boolean).map(s => {
      const m = s.match(/^(P?[\d.]+?)(FS|SS|FF|SF)?([+-]\d+)?$/);
      // a row that names its own phase (5.2.1 → 5.2) is a loop the app refuses: dropped
      return c.startsWith(m[1] + '.') ? null : { id: idOf.get(m[1]), type: m[2] || 'FS', lag: m[3] ? +m[3] : 0 };
    }).filter(p => p && p.id && p.id !== i + 1);
    return t;
  });
  return { plan: P, folds: FOLDS.map(c => idOf.get(c)) };
}

const DAY = 86400000;
const ms = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const days = (a, b) => Math.round((ms(b) - ms(a)) / DAY);

// ═══ THE GEOMETRY, MEASURED HERE ═══════════════════════════════════════════
const HEAD = 8;
const R_bends = [], R_ink = { v: 0 };
const pts = d => (d.match(/[ML][^ML]+/g) || []).map(s => s.slice(1).trim().split(/[ ,]+/).map(Number));
function inside(s, x, y) {
  if (s.kind === 'ms') return Math.abs(x - s.cx) + Math.abs(y - s.cy) < 9.9 - 1.5;
  const y2 = s.kind === 'sum' ? s.y + 7 : s.y + s.h;
  return x > s.x + 1 && x < s.x + s.w - 1 && y > s.y + 1 && y < y2 - 1;
}
// a point on the shape's outline (within 2.5 px), and which side of it
function onShape(s, x, y) {
  if (s.kind === 'ms') {
    const dx = x - s.cx, dy = y - s.cy;
    if (Math.abs(Math.abs(dx) + Math.abs(dy) - 9.9) > 2.5) return null;
    return Math.abs(dx) <= 1.5 ? (dy < 0 ? 'top' : 'bottom') : (dx < 0 ? 'left' : 'right');
  }
  const top = s.y, bot = s.kind === 'sum' ? s.y + 7 : s.y + s.h, cap = s.kind === 'sum' ? s.y + 13 : bot;
  const inX = x >= s.x - 2.5 && x <= s.x + s.w + 2.5;
  const inY = y >= top - 2.5 && y <= cap + 2.5;
  if (!inX || !inY) return null;
  if (Math.abs(y - top) <= 2.5) return 'top';
  if (Math.abs(y - bot) <= 2.5 || Math.abs(y - cap) <= 2.5) return 'bottom';
  if (Math.abs(x - s.x) <= 2.5) return 'left';
  if (Math.abs(x - (s.x + s.w)) <= 2.5) return 'right';
  return null;
}

function judge(C, view, say) {
  const shape = new Map(C.shapes.map(s => [s.id, s]));
  const sched = new Map(C.sched.map(t => [t.id, t]));
  const xOfDay = iso => C.x0 + days(C.start, iso) * C.dayW;
  // where a link's end sits: a drawn shape's own edge, or (folded away) its dates
  const anchor = (id, atFinish, rep) => {
    const s = shape.get(id), t = sched.get(id);
    if (s && id === rep) return { exact: true, x: s.kind === 'ms' ? s.cx : atFinish ? s.x + s.w : s.x };
    if (t.ms) return { exact: false, lo: xOfDay(t.start) - 1, hi: xOfDay(t.start) + C.dayW + 1 };
    const x = atFinish ? xOfDay(t.finish) + C.dayW : xOfDay(t.start);
    return { exact: false, lo: x - 7, hi: x + 7 };
  };
  const seen = new Set();
  // rule 7: the activities inside folded phase `ph` that `succ` waits on, read from the plan's own links
  const kids = new Map(); C.sched.forEach(t => { if (t.parent != null) { if (!kids.has(t.parent)) kids.set(t.parent, []); kids.get(t.parent).push(t.id); } });
  const leavesOf = id => kids.has(id) ? [].concat(...kids.get(id).map(leavesOf)) : [id];
  const within = (id, ph) => { for (let c = sched.get(id), g = 0; c && g++ < 50; c = sched.get(c.parent)) if (c.parent === ph) return true; return false; };
  const gates = (ph, succ) => {
    const ids = new Set();
    for (let c = sched.get(succ), g = 0; c && g++ < 50; c = sched.get(c.parent)) c.preds.forEach(p => leavesOf(p).forEach(l => { if (within(l, ph)) ids.add(l); }));
    return [...ids];
  };
  const finishOf = id => { const t = sched.get(id); return t.ms ? t.start : t.finish; };
  const nm = id => (sched.get(id) || {}).name || id;
  // 14. the span kept clear for a gate's label is the label as drawn
  C.shapes.forEach(s => {
    if (s.kind !== 'ms' || !s.lab) return;
    if (!s.glab) { say(view + ' · ' + s.id, 'the diamond of ' + nm(s.id) + ' does not say (data-glab) where its label runs, so nothing can check that lines are kept out of it'); return; }
    const [a, b] = s.glab.split(',').map(Number);
    if (Math.abs(a - s.lab.x) > 1.5 || Math.abs(b - (s.lab.x + s.lab.w)) > 1.5)
      say(view + ' · ' + s.id, 'lines are kept out of ' + a.toFixed(1) + '–' + b.toFixed(1) + ' for the label of ' + nm(s.id) + ', which is drawn at ' + s.lab.x.toFixed(1) + '–' + (s.lab.x + s.lab.w).toFixed(1));
  });
  const isAnc = (x, y) => { for (let c = sched.get(y), g = 0; c && c.parent != null && g++ < 50; c = sched.get(c.parent)) if (c.parent === x) return true; return false; };
  // the row an activity shows as: itself, or the folded phase it is hidden in
  const repOf = id => { for (let c = sched.get(id), g = 0; c && g++ < 50; c = sched.get(c.parent)) if (shape.has(c.id)) return c.id; return null; };
  C.links.forEach(L => {
    const at = view + ' · ' + (L.link || '?');
    if (!L.link || !L.from || !L.to || !L.type) { say(at, 'an arrow carries no data-glink / data-gfrom / data-gto / data-gtype, so nothing can say which link it draws (d=' + L.d.slice(0, 60) + ')'); return; }
    const [a, b] = L.link.split('>').map(Number), from = +L.from, to = +L.to;
    const S = shape.get(from), T = shape.get(to);
    if (!S || !T) { say(at, 'an end of this arrow is not drawn: ' + (!S ? 'source ' + from : 'target ' + to)); return; }
    const key = from + '>' + to;
    if (seen.has(key)) say(at, 'the pair ' + key + ' is drawn twice');
    seen.add(key);
    // 9. no loop between a folded phase and a row inside it
    if (isAnc(from, to) || isAnc(to, from)) {
      const [row, ph] = isAnc(from, to) ? [to, from] : [from, to];
      say(at, 'the arrow joins ' + nm(row) + ' to the bar of ' + nm(ph) + ', the folded phase holding it — a loop out of a row and back into the phase it sits in');
    }
    const P = pts(L.d);
    if (P.length < 2) { say(at, 'the arrow has fewer than two points'); return; }
    for (let n = 1; n < P.length; n++) {
      const dx = Math.abs(P[n][0] - P[n - 1][0]), dy = Math.abs(P[n][1] - P[n - 1][1]);
      if (dx > 0.2 && dy > 0.2) { say(at, 'a piece of the arrow runs at a slant, from ' + P[n - 1] + ' to ' + P[n]); return; }
    }
    const fromFinish = L.type === 'FS' || L.type === 'FF', toFinish = L.type === 'FF' || L.type === 'SF';
    const nameOf = id => (sched.get(id) || {}).name || id;
    // 2. it leaves at the predecessor's own date
    const F = P[0], side0 = onShape(S, F[0], F[1]), A = anchor(a, fromFinish, from);
    if (!side0) say(at, 'the arrow does not start on ' + nameOf(from) + ' (it starts at ' + F.map(v => v.toFixed(1)) + ')');
    else if (S.kind === 'ms' ? (side0 !== 'top' && side0 !== 'bottom') : false) say(at, 'the arrow leaves the diamond of ' + nameOf(from) + ' from its ' + side0 + ' side, where its label is, not a point');
    else if (A.exact ? Math.abs(F[0] - A.x) > 1.5 && !(S.kind !== 'ms' && Math.abs(F[0] - A.x) <= 10 && (side0 === 'top' || side0 === 'bottom'))
      : (F[0] < A.lo || F[0] > A.hi)) {
      say(at, 'the arrow leaves ' + nameOf(from) + ' at x=' + F[0].toFixed(1) + ', but the ' + (fromFinish ? 'finish' : 'start') + ' of ' + nameOf(a)
        + ' that ' + L.type + ' anchors to is at ' + (A.exact ? A.x.toFixed(1) : A.lo.toFixed(1) + '–' + A.hi.toFixed(1)) + (a !== from ? ' (folded into ' + nameOf(from) + ')' : ''));
    }
    // 3. it lands on the successor's own date, pointing in
    const Z = P[P.length - 1], Y = P[P.length - 2], side = onShape(T, Z[0], Z[1]), B = anchor(b, toFinish, to);
    const dir = Z[0] > Y[0] + 0.1 ? 'right' : Z[0] < Y[0] - 0.1 ? 'left' : Z[1] > Y[1] ? 'down' : 'up';
    const inward = { top: 'down', bottom: 'up', left: 'right', right: 'left' };
    if (!side) say(at, 'the arrowhead does not touch ' + nameOf(to) + ' (it ends at ' + Z.map(v => v.toFixed(1)) + ')');
    else {
      if (inward[side] !== dir) say(at, 'the arrowhead lands on the ' + side + ' of ' + nameOf(to) + ' heading ' + dir + ', not into it');
      if (T.kind === 'ms' && side !== 'top' && side !== 'bottom') say(at, 'the arrow enters the diamond of ' + nameOf(to) + ' from its ' + side + ' side, not a point');
      if (T.kind !== 'ms') {
        const ok = B.exact
          ? (side === 'left' || side === 'right' ? (side === 'right') === toFinish && Math.abs(Z[0] - B.x) <= 2.5
            : toFinish ? Z[0] <= B.x + 0.5 && Z[0] >= B.x - Math.max(8, 0) - 0.5 : Z[0] >= B.x - 0.5 && Z[0] <= B.x + 8.5)
          : Z[0] >= B.lo && Z[0] <= B.hi;
        if (!ok) say(at, 'the arrow lands on ' + nameOf(to) + ' at x=' + Z[0].toFixed(1) + ' (' + side + '), but the ' + (toFinish ? 'finish' : 'start') + ' of ' + nameOf(b)
          + ' it waits on is at ' + (B.exact ? B.x.toFixed(1) : B.lo.toFixed(1) + '–' + B.hi.toFixed(1)) + (b !== to ? ' (folded into ' + nameOf(to) + ')' : ''));
      }
    }
    // 4. the head rides a straight run
    const run = Math.hypot(Z[0] - Y[0], Z[1] - Y[1]);
    if (run < HEAD - 0.01) say(at, 'the arrowhead sits on a run of ' + run.toFixed(1) + ' px, shorter than the ' + HEAD + ' px head');
    // 5. nothing stabbed on the way
    const hit = new Map();   // shape → the x where the arrow runs into it
    for (let n = 1; n < P.length; n++) {
      const [x1, y1] = P[n - 1], [x2, y2] = P[n], len = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(1, Math.ceil(len));
      for (let k = 0; k <= steps; k++) {
        const x = x1 + (x2 - x1) * k / steps, y = y1 + (y2 - y1) * k / steps;
        C.shapes.forEach(s => { if (!hit.has(s.id) && inside(s, x, y)) hit.set(s.id, x); });
      }
    }
    // 7. a folded phase shows the activity that gates the successor
    if (a !== from) {
      const g = gates(from, b);
      const last = g.reduce((m, id) => finishOf(id) > m ? finishOf(id) : m, '');
      if (g.length > 1 && finishOf(a) < last) say(at, 'the arrow out of ' + nameOf(from) + ' draws ' + nameOf(a) + ' (finishing ' + finishOf(a) + '), but of the ' + g.length
        + ' activities in it that ' + nameOf(b) + ' waits on, the last finishes ' + last);
    }
    // 8. no step aside for a phase that holds either end
    const anc = new Set();
    [a, b].forEach(id => { for (let c = sched.get(id), g = 0; c && c.parent != null && g++ < 50; c = sched.get(c.parent)) anc.add(c.parent); });
    for (let n = 1; n + 1 < P.length; n++) {
      const [hx0, hy] = P[n - 1], [hx1, hy1] = P[n], [vx, vy] = P[n + 1];
      if (Math.abs(hy - hy1) > 0.2 || Math.abs(hx1 - hx0) < 0.5 || Math.abs(vx - hx1) > 0.2) continue;   // a sideways step, then a vertical
      anc.forEach(ph => {
        const sh = shape.get(ph); if (!sh || sh.kind !== 'sum') return;
        const down = vy > hy, lane = down ? sh.y - 13 : sh.y + 23;
        if (Math.abs(hy - lane) > 1.5) return;
        const passes = down ? vy >= sh.y + 13 : vy <= sh.y;
        const beside = (vx < sh.x && vx >= sh.x - 6) || (vx > sh.x + sh.w && vx <= sh.x + sh.w + 6);
        if (passes && beside && hx0 >= sh.x && hx0 <= sh.x + sh.w) say(at, 'the arrow steps aside for the bar of ' + nameOf(ph) + ', a phase holding one of its own ends, from x=' + hx0.toFixed(1) + ' to ' + hx1.toFixed(1));
      });
    }
    hit.forEach((hx, id) => {
      const s = shape.get(id);
      if (id !== from && id !== to && s.kind === 'sum') return;   // a phase bar on the way
      if (id !== from && id !== to && s.kind === 'bar') {          // an activity's, with no way round in reach
        const far = Math.max(160, C.dayW * 8), L = s.x - 4, H = s.x + s.w + 4;
        if (!(L >= C.x0 + 2 && hx - L <= far) && !(H <= C.w - 14 && H - hx <= far)) return;
      }
      say(at, 'the arrow runs through ' + (id === from ? 'its own predecessor ' : id === to ? 'its own successor ' : '') + nameOf(id));
    });
    // 12. no line through a gate's label
    for (let n = 1; n < P.length; n++) {
      const [x1, y1] = P[n - 1], [x2, y2] = P[n];
      if (Math.abs(x1 - x2) > 0.2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      C.shapes.forEach(s => {
        if (s.kind !== 'ms' || !s.lab || s.id === from || s.id === to) return;
        if (!(x1 > s.lab.x + 0.5 && x1 < s.lab.x + s.lab.w - 0.5 && hi > s.lab.y + 0.5 && lo < s.lab.y + s.lab.h - 0.5)) return;
        const beside = s.lab.x > s.cx ? s.cx - 14 : s.cx + 14;   // clear of the diamond, away from its label
        if (Math.abs(x1 - beside) <= 40 - 0.5) say(at, 'the arrow runs through the label of ' + nm(s.id) + ' at x=' + x1.toFixed(1) + ', though the column beside its diamond (x=' + beside.toFixed(1) + ') was ' + Math.abs(x1 - beside).toFixed(0) + ' px away');
      });
    }
    // 13. a step no shape forced clears the labels the straight line would have crossed
    const top = S.kind === 'ms' ? S.cy - 15 : S.kind === 'sum' ? S.y - 10 : S.y - 7, goingDown = Z[1] > F[1];
    const laneS = goingDown ? top + 27 : top + 3;
    const crossesLab = (x, ya, yb, slack) => C.shapes.filter(s => s.kind === 'ms' && s.lab && s.id !== from && s.id !== to
      && x > s.lab.x + 0.5 - slack && x < s.lab.x + s.lab.w - 0.5 + slack && Math.max(ya, yb) > s.lab.y + 0.5 && Math.min(ya, yb) < s.lab.y + s.lab.h - 0.5).map(s => s.id);
    const inWay = (x, ya, yb) => C.shapes.some(s => {
      if (s.id === from || s.id === to || anc.has(s.id)) return false;
      const [y1, y2] = s.kind === 'ms' ? [s.cy - 10, s.cy + 10] : [s.y, s.kind === 'sum' ? s.y + 13 : s.y + s.h];
      const [x1, x2] = s.kind === 'ms' ? [s.cx - 14, s.cx + 14] : [s.x - 4, s.x + s.w + 4];
      return x > x1 + 0.5 && x < x2 - 0.5 && Math.max(ya, yb) > y1 && Math.min(ya, yb) < y2;
    });
    for (let n = 1; n + 1 < P.length; n++) {
      if (Math.abs(P[n][1] - P[n - 1][1]) > 0.2 || Math.abs(P[n - 1][0] - P[n][0]) < 0.5) continue;    // a sideways piece…
      if (Math.abs(P[n][0] - P[n + 1][0]) > 0.2 || n < 2 || Math.abs(P[n - 1][0] - P[n - 2][0]) > 0.2) continue;   // …between two verticals
      const hy = P[n][1], ox = P[n - 1][0], nx = P[n][0], vy = P[n + 1][1];
      if (Math.abs(hy - laneS) < 1 || Math.abs(nx - Z[0]) < 0.5 || inWay(ox, hy, vy)) continue;   // the opening move, the line-up on the target, or a shape's doing
      const was = new Set(crossesLab(ox, hy, vy, 0)), step = 'the arrow steps aside from x=' + ox.toFixed(1) + ' to ' + nx.toFixed(1) + ' with no shape in its way';
      if (!crossesLab(ox, hy, vy, 1.5).length) say(at, step + ', and no label either');
      else if (Math.abs(nx - ox) > 40.5) say(at, step + ', ' + Math.abs(nx - ox).toFixed(0) + ' px to spare a label');
      crossesLab(nx, hy, vy, 0).filter(id => was.has(id)).forEach(id => say(at, step + ', and still crosses the label of ' + nm(id) + ' that it would have crossed anyway'));
    }
    R_bends.push(P.length - 2);
    R_ink.v += P.reduce((t, q, n) => n ? t + Math.abs(q[0] - P[n - 1][0]) + Math.abs(q[1] - P[n - 1][1]) : 0, 0);
  });
  // the drawn picture as a graph, and the plan's own links activity to activity
  const adj = new Map();
  C.links.forEach(L => { if (!L.from || !L.to) return; if (!adj.has(+L.from)) adj.set(+L.from, []); adj.get(+L.from).push(+L.to); });
  const reaches = (x, y) => { const got = new Set([x]), q = [x]; while (q.length) { const u = q.shift(); if (u === y) return true; (adj.get(u) || []).forEach(v => { if (!got.has(v)) { got.add(v); q.push(v); } }); } return false; };
  const red = new Set(C.redundant), succ = new Map();
  C.sched.forEach(t => t.eff.forEach(p => { if (red.has(t.id + ':' + p)) return; if (!succ.has(p)) succ.set(p, []); succ.get(p).push(t.id); }));
  // 10. no link lost: the successor's row is reached from the predecessor's
  const lost = new Set();
  succ.forEach((outs, p) => outs.forEach(t => {
    const A = repOf(p), B = repOf(t), k = A + '>' + B;
    if (A == null || B == null || A === B || isAnc(A, B) || isAnc(B, A) || lost.has(k)) return;
    if (!reaches(A, B)) { lost.add(k); say(view + ' · ' + p + '>' + t, 'no chain of arrows leads from ' + nm(A) + ' to ' + nm(B) + ', though ' + nm(t) + ' waits on ' + nm(p)); }
  }));
  // 11. gates in one folded phase, chained through its hidden work, are joined
  C.collapsed.forEach(ph => {
    if (!shape.has(ph)) return;
    const inPh = new Set(C.shapes.filter(s => isAnc(ph, s.id)).map(s => s.id));
    inPh.forEach(m => {
      const got = new Set([m]), q = [m];
      while (q.length) (succ.get(q.shift()) || []).forEach(v => {
        if (got.has(v)) return; got.add(v);
        if (shape.has(v)) { if (inPh.has(v) && !reaches(m, v)) say(view + ' · ' + m + '>' + v, nm(v) + ' waits on ' + nm(m) + ' through the hidden work of ' + nm(ph) + ', the folded phase both show under, but no chain of arrows joins them'); return; }
        if (repOf(v) === ph) q.push(v);
      });
    });
  });
  // 15–16. an arrow a plain chain of drawn arrows implies is not drawn, and a link left undrawn is one they imply
  const plainIn = new Map(C.sched.map(t => [t.id, new Set(t.plain)]));
  // the links folded into each pair of rows, and whether every one is a plain finish-to-start
  const pairPlain = new Map();
  succ.forEach((outs, p) => outs.forEach(t => {
    const A = repOf(p), B = repOf(t);
    if (A == null || B == null || A === B || isAnc(A, B) || isAnc(B, A)) return;
    const k = A + '>' + B;
    pairPlain.set(k, (pairPlain.has(k) ? pairPlain.get(k) : true) && plainIn.get(t).has(p));
  }));
  // no link of its own joins the two rows: a chain through work hidden in a folded phase both show under
  const plainSucc = new Map();
  C.sched.forEach(t => t.plain.forEach(p => { if (red.has(t.id + ':' + p)) return; if (!plainSucc.has(p)) plainSucc.set(p, []); plainSucc.get(p).push(t.id); }));
  const hiddenPlain = (u, v) => C.collapsed.some(ph => {
    if (!shape.has(ph) || !isAnc(ph, u) || !isAnc(ph, v)) return false;
    const got = new Set([u]), q = [u];
    while (q.length) for (const w of (plainSucc.get(q.shift()) || [])) {
      if (w === v) return true;
      if (got.has(w) || shape.has(w) || repOf(w) !== ph) continue;
      got.add(w); q.push(w);
    }
    return false;
  });
  const stepPlain = (u, v) => pairPlain.has(u + '>' + v) ? pairPlain.get(u + '>' + v) : hiddenPlain(u, v);
  const drawn = C.links.filter(L => L.from && L.to).map(L => [+L.from, +L.to]);
  const plainChain = (x, y, skip) => {
    const got = new Set([x]), q = [x];
    while (q.length) { const u = q.shift(); for (const e of drawn) {
      if (e === skip || e[0] !== u || got.has(e[1]) || !stepPlain(e[0], e[1])) continue;
      if (e[1] === y) return true;
      got.add(e[1]); q.push(e[1]);
    } }
    return false;
  };
  drawn.forEach(e => {
    if (stepPlain(e[0], e[1]) && plainChain(e[0], e[1], e)) say(view + ' · ' + e.join('>'), 'the arrow from ' + nm(e[0]) + ' to ' + nm(e[1]) + ' is drawn, though other arrows already lead there through plain finish-to-start links alone, so it moves no date');
  });
  const isDrawn = new Set(drawn.map(e => e.join('>')));
  pairPlain.forEach((plain, k) => {
    if (isDrawn.has(k)) return;
    const [A, B] = k.split('>').map(Number);
    if (!plain || !plainChain(A, B, null)) say(view + ' · ' + k, 'no arrow joins ' + nm(A) + ' to ' + nm(B) + ', though a link joins them, and ' + (plain ? 'no chain of plain finish-to-start arrows leads there instead' : 'the link is not a plain finish-to-start, so no chain implies it'));
  });
  return C.links.length;
}

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [], views: {} };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(new Date(TODAY + 'T10:00:00'));
  await page.goto(APP, { waitUntil: 'load' });

  const read = () => page.evaluate(() => {
    const svg = document.querySelector('#ganttContainer svg');
    if (!svg) return null;
    const live = sel => [...svg.querySelectorAll(sel)].filter(e => !e.closest('.g-ghost'));
    const shapes = live('g[data-grole="bar"]').map(g => {
      const id = +g.dataset.gopen, t = tasks.find(x => x.id === id), r = g.querySelector('rect');
      const x = +r.getAttribute('x'), y = +r.getAttribute('y'), w = +r.getAttribute('width'), h = +r.getAttribute('height');
      if (r.getAttribute('transform')) {
        const tx = g.querySelector('text'), bb = tx ? tx.getBBox() : null;
        return { id, kind: 'ms', cx: x + 7, cy: y + 7, lab: bb ? { x: bb.x, y: bb.y, w: bb.width, h: bb.height } : null, glab: g.dataset.glab || null };
      }
      return { id, kind: t && t.isSummary ? 'sum' : 'bar', x, y, w, h };
    });
    // every line drawn in the arrow layer: anything stroked in the two link colours
    const links = live('g[clip-path] path').filter(p => p.getAttribute('fill') === 'none' && /^#(dc2626|94a3b8)$/.test(p.getAttribute('stroke') || ''))
      .map(p => ({ d: p.getAttribute('d'), link: p.dataset.glink, from: p.dataset.gfrom, to: p.dataset.gto, type: p.dataset.gtype, head: p.hasAttribute('marker-end') }));
    return {
      x0: +svg.dataset.x0, dayW: +svg.dataset.dayw, start: svg.dataset.start, w: +svg.getAttribute('width'), shapes, links,
      sched: tasks.map(t => ({ id: t.id, parent: t.parentId, preds: (t.predecessors || []).map(p => p.id), eff: t.isSummary ? [] : effectivePreds(t).map(p => p.id),
        // the predecessors every one of whose links to this activity is a plain finish-to-start
        plain: t.isSummary ? [] : (E => [...new Set(E.map(p => p.id))].filter(id => E.every(p => p.id !== id || (p.type === 'FS' && !p.lag))))(effectivePreds(t)),
        name: t.name, start: t.startDate ? fmtISO(t.startDate) : null, finish: t.finishDate ? fmtISO(t.finishDate) : null, ms: !!t.milestone })),
      redundant: redundantLinkList().map(r => r.task.id + ':' + r.predId), collapsed: [...collapsedIds]
    };
  });
  const view = async (name, plan, setup) => {
    await page.evaluate(([d, s]) => {
      hydrate(d); calculate(); refreshAll(); switchTab('gantt');
      collapsedIds.clear();
      if (s.level != null) setCollapseLevel(s.level === 'all' ? Infinity : s.level);
      (s.folds || []).forEach(id => collapsedIds.add(id));
      setGanttAxis(s.axis || 'dates');
      ganttDayW = null;
      for (let k = 0; k < Math.abs(s.zoom || 0); k++) ganttZoom(Math.sign(s.zoom));
      renderGantt();
    }, [plan, setup]);
    await page.waitForTimeout(450);
    const C = await read();
    if (!C) { say(name, 'no chart was drawn'); return; }
    if (!C.links.length) say(name, 'no arrows were drawn at all, so nothing below was measured');
    R.views[name] = { arrows: judge(C, name, say), shapes: C.shapes.length };
  };

  const { plan, folds } = shapedPlan();
  await view('open, dates', plan, { level: 'all', axis: 'dates' });
  await view('open, weeks', plan, { level: 'all', axis: 'weeks' });
  await view('open, days, zoomed in', plan, { level: 'all', axis: 'days', zoom: 2 });
  await view('the screenshot\'s folds, dates', plan, { level: 'all', folds, axis: 'dates' });
  await view('the screenshot\'s folds, weeks', plan, { level: 'all', folds, axis: 'weeks' });
  await view('the screenshot\'s folds, days, zoomed in', plan, { level: 'all', folds, axis: 'days', zoom: 2 });
  await view('phases only, dates', plan, { level: 0, axis: 'dates' });
  await view('phases only, weeks', plan, { level: 0, axis: 'weeks' });
  await view('phases only, days, zoomed in', plan, { level: 0, axis: 'days', zoom: 2 });
  await view('two levels, zoomed out', plan, { level: 1, axis: 'dates', zoom: -3 });
  await view('two levels, weeks', plan, { level: 1, axis: 'weeks' });
  await view('three levels, weeks', plan, { level: 2, axis: 'weeks' });
  const sample = FIXTURE();
  await view('the sample plan, open', sample, { level: 'all', axis: 'dates' });
  await view('the sample plan, phases only', sample, { level: 0, axis: 'weeks' });
  await view('the sample plan, two levels, weeks', sample, { level: 1, axis: 'weeks' });

  R.bends = { most: Math.max(0, ...R_bends), over4: R_bends.filter(n => n > 4).length, of: R_bends.length, total: R_bends.reduce((a, b) => a + b, 0), ink: Math.round(R_ink.v) };
  R.pageErrors = errs;
  if (errs.length) say('page', 'the page threw: ' + errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(JSON.stringify(R, null, 1));
  process.exit(R.contradictions.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

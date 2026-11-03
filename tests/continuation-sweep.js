/* ═══════════════════════════════════════════════════════════════════════════
   AN ANSWER THAT HITS THE OUTPUT CEILING IS STITCHED, NOT LOST.

   callAnthropic() resumes a response that stopped on max_tokens. It used to
   resend the partial answer as the FINAL assistant turn — a prefill — and
   Claude 4.6 and every later model reject that with a 400. So on every model
   the picker offers, the second round of a big plan was guaranteed to fail:
   nothing was applied (the flows are atomic), but the feature the README
   promises, "huge plans get stitched together seamlessly", was dead.

   The documented replacement (platform.claude.com, prompting best practices →
   "Migrating away from prefilled responses" → Continuations, and
   handling-stop-reasons → "Ensure complete responses"): keep the partial answer
   as an ordinary assistant turn and follow it with a USER turn that says it was
   cut off and quotes how it ended. The request then ends on a user turn.

   window.fetch is replaced by a stub that behaves the way the API does — a
   request whose last turn is the assistant's gets a 400 — so the old code fails
   here exactly as it failed in the field. No key, nothing leaves the page.

   What a continuation must also survive, because a model that is ASKED to
   continue (rather than forced to, as a prefill did) can still do either:
   repeating the tail it was shown, and wrapping its continuation in a code
   fence. Both are trimmed; a short coincidental overlap is not, because an
   answer that legitimately repeats a few characters at the seam is commoner
   than one that repeats a whole quoted line.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP } = require('./_harness');
const { chromium } = requirePlaywright();

const SEAM = '{"tasks":[{"name":"Alpha task","owner":"Priya"},';
const REST = '{"name":"Beta task","owner":"Sam"}]}';
const WHOLE = SEAM + REST;

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [], requests = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  page.on('request', r => { const u = r.url(); if (!/^file:/.test(u)) requests.push(u); });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const R = await page.evaluate(async ([SEAM, REST, WHOLE]) => {
    const bad = [];
    const say = (a, m) => bad.push(a + ' :: ' + m);
    const realFetch = window.fetch;
    const key = document.getElementById('aiKey');
    const keyWas = key.value;
    key.value = 'sk-ant-test-fixture-not-a-key';

    const sse = (text, stop, extra) => ['message_start', 'content_block_delta', 'message_delta'].map(t => 'event: ' + t + '\ndata: ' + JSON.stringify(
      t === 'message_start' ? { type: t, message: { usage: { input_tokens: 1 } } }
      : t === 'content_block_delta' ? { type: t, index: 0, delta: { type: 'text_delta', text: text } }
      : { type: t, delta: Object.assign({ stop_reason: stop }, extra || {}) })).join('\n\n') + '\n\n';
    /* rounds: [[text, stop_reason], …] answered in order. A request ending on an
       assistant turn is answered the way the API answers it. */
    const run = async (rounds, opts) => {
      const bodies = [];
      window.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        const msgs = body.messages || [];
        if (msgs.length && msgs[msgs.length - 1].role === 'assistant')
          return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error',
            message: 'This model does not support assistant message prefill. The conversation must end with a user message.' } }),
            { status: 400, headers: { 'content-type': 'application/json' } });
        const r = rounds[Math.min(bodies.length - 1, rounds.length - 1)];
        return new Response(sse(r[0], r[1], r[2]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      };
      let text = '', threw = '';
      try { text = await callAnthropic('Draft the plan.', Object.assign({ quiet: true }, opts || {})); }
      catch (e) { threw = e.message; }
      finally { window.fetch = realFetch; }
      return { text, threw, bodies };
    };
    const contentText = c => Array.isArray(c) ? c.map(x => x.text || '').join('') : String(c || '');
    const out = {};
    try {
      // ── A. the plain seam ───────────────────────────────────────────────
      const A = await run([[SEAM, 'max_tokens'], [REST, 'end_turn']]);
      out.A = { text: A.text, threw: A.threw, requests: A.bodies.length,
                roles: A.bodies.map(bd => (bd.messages || []).map(m => m.role).join('>')) };
      if (A.threw) say('Continuation', 'a response cut at the ceiling FAILED on the next round: ' + A.threw);
      else if (A.text !== WHOLE) say('Continuation', 'the two halves did not stitch: got ' + JSON.stringify(A.text));
      if (A.bodies.length !== 2) say('Continuation', 'a single cut took ' + A.bodies.length + ' requests, not 2');
      const second = A.bodies[1];
      if (second) {
        const m = second.messages || [];
        const last = m[m.length - 1] || {};
        if (last.role !== 'user') say('Continuation', 'the resume request ends on the ' + last.role + ' turn — a prefill, which current models reject');
        const asst = m.filter(x => x.role === 'assistant');
        if (asst.length !== 1 || contentText(asst[0].content) !== SEAM)
          say('Continuation', 'the resume request does not carry the partial answer as the assistant turn, verbatim');
        if (last.role === 'user' && contentText(last.content).indexOf('{"name":"Alpha task","owner":"Priya"},') < 0)
          say('Continuation', 'the resume ask does not quote how the partial answer ended, so the model cannot tell where to pick up');
        if (JSON.stringify(m[0]) !== JSON.stringify((A.bodies[0].messages || [])[0]))
          say('Continuation', 'the resume request changed the opening user turn — the prompt cache only matches an identical prefix');
        if (second.model !== A.bodies[0].model || second.max_tokens !== A.bodies[0].max_tokens)
          say('Continuation', 'the resume request changed model or max_tokens between rounds');
      }
      try { JSON.parse(A.text); } catch (e) { if (!A.threw) say('Continuation', 'the stitched answer is not valid JSON'); }

      // ── B. the model repeats the tail it was shown ─────────────────────
      const B = await run([[SEAM, 'max_tokens'], ['{"name":"Alpha task","owner":"Priya"},' + REST, 'end_turn']]);
      out.B = { text: B.text, threw: B.threw };
      if (!B.threw && B.text !== WHOLE) say('Overlap', 'a continuation that repeated the quoted tail was stitched with the repeat in it: ' + JSON.stringify(B.text));

      // ── C. the model fences its continuation ───────────────────────────
      const C = await run([[SEAM, 'max_tokens'], ['```json\n' + REST + '\n```', 'end_turn']]);
      out.C = { text: C.text, threw: C.threw };
      if (!C.threw && C.text !== WHOLE) say('Fence', 'a fenced continuation was stitched with its fence inside the answer: ' + JSON.stringify(C.text));
      // …but an answer that OPENED with a fence keeps its closing fence
      const C2 = await run([['```json\n' + SEAM, 'max_tokens'], [REST + '\n```', 'end_turn']]);
      out.C2 = { text: C2.text, threw: C2.threw };
      if (!C2.threw && C2.text !== '```json\n' + WHOLE + '\n```') say('Fence', 'the closing fence of an answer that opened with one was dropped: ' + JSON.stringify(C2.text));

      // ── D. a short coincidental overlap is content, not a repeat ───────
      const D = await run([['{"a":[1,2,', 'max_tokens'], ['2,3]}', 'end_turn']]);
      out.D = { text: D.text, threw: D.threw };
      if (!D.threw && D.text !== '{"a":[1,2,2,3]}') say('Overlap', 'a two-character legitimate repeat at the seam was trimmed: ' + JSON.stringify(D.text));

      // ── E. flows that opted out still stop at the first cut ────────────
      const E = await run([['{"reading":"long', 'max_tokens'], ['never sent', 'end_turn']], { noContinue: true });
      out.E = { text: E.text, threw: E.threw, requests: E.bodies.length };
      if (E.bodies.length !== 1) say('noContinue', 'a flow that opted out of continuation sent ' + E.bodies.length + ' requests');
      if (!/\/\*TRUNCATED\*\/$/.test(E.text)) say('noContinue', 'a cut answer in an opted-out flow is not marked truncated, so the strict parser could apply it');

      // ── F. a conversation keeps its order around the continuation ──────
      const F = await run([[SEAM, 'max_tokens'], [REST, 'end_turn']],
        { history: [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }] });
      out.F = { text: F.text, threw: F.threw, roles: F.bodies.map(bd => (bd.messages || []).map(m => m.role).join('>')) };
      if (F.threw) say('Conversation', 'a cut answer inside a conversation failed on the next round: ' + F.threw);
      else if (F.text !== WHOLE) say('Conversation', 'a cut answer inside a conversation did not stitch: ' + JSON.stringify(F.text));
      if (F.bodies[1] && out.F.roles[1] !== 'user>assistant>user>assistant>user')
        say('Conversation', 'the resume request inside a conversation has turns ' + out.F.roles[1] + ', not user>assistant>user>assistant>user');

      // ── G. a run that never ends is cut off and says so ────────────────
      const parts = [];
      for (let i = 0; i < 9; i++) parts.push(['"part ' + i + ' of a plan that never ends",', 'max_tokens']);
      const G = await run(parts);
      out.G = { threw: G.threw, requests: G.bodies.length, tail: G.text.slice(-30) };
      if (G.threw) say('Exhaustion', 'eight cut rounds in a row threw instead of returning a marked-truncated answer: ' + G.threw);
      if (G.bodies.length !== 8) say('Exhaustion', 'the continuation loop ran ' + G.bodies.length + ' rounds, not its limit of 8');
      if (!G.threw && !/\/\*TRUNCATED\*\/$/.test(G.text)) say('Exhaustion', 'an answer still cut after the last round is not marked truncated');
      if (!G.threw && G.text.indexOf('"part 7 of a plan') < 0) say('Exhaustion', 'the last round\'s text is missing from the result');
      // ── H. the context window filled: cut, and said to be cut ──────────
      /* A second round would resend everything plus the partial answer — more
         input into a window that is already full — so this one is not resumed;
         it is marked, and the strict parser refuses it. (handling-stop-reasons:
         model_context_window_exceeded is a truncation like max_tokens.) */
      const H = await run([[SEAM, 'model_context_window_exceeded'], ['never sent', 'end_turn']]);
      out.H = { text: H.text, threw: H.threw, requests: H.bodies.length };
      if (H.threw) say('Context window', 'a context-window stop threw instead of returning the marked answer: ' + H.threw);
      else if (!/\/\*TRUNCATED\*\/$/.test(H.text)) say('Context window', 'an answer the context window cut off came back unmarked, as if it were complete');
      if (H.bodies.length !== 1) say('Context window', 'a context-window stop was resumed (' + H.bodies.length + ' requests) — the window is already full');

      // ── I. a refusal is a refusal, not malformed JSON ─────────────────
      const I = await run([['{"tasks":[', 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: 'This request was declined.' } }]]);
      out.I = { text: I.text, threw: I.threw, requests: I.bodies.length };
      if (!I.threw) say('Refusal', 'a refused answer came back as an answer (' + JSON.stringify(I.text.slice(0, 40)) + ') — the flow then reports it as bad JSON');
      else {
        if (!/declined/i.test(I.threw)) say('Refusal', 'the refusal error does not say the model declined: ' + I.threw);
        if (!/This request was declined/.test(I.threw)) say('Refusal', 'the refusal error drops the explanation the API gave');
        if (!/NOTHING was changed/.test(I.threw)) say('Refusal', 'the refusal error does not say nothing was applied');
      }
      if (I.bodies.length !== 1) say('Refusal', 'a refusal was retried or resumed (' + I.bodies.length + ' requests)');
      // category and explanation may both be null — the message must still stand
      const I2 = await run([['', 'refusal', { stop_details: { type: 'refusal', category: null, explanation: null } }]]);
      out.I2 = { threw: I2.threw };
      if (!I2.threw || !/declined/i.test(I2.threw) || /null|undefined/.test(I2.threw)) say('Refusal', 'a refusal with no category or explanation reads: ' + (I2.threw || '(no error)'));

      // ── J. a cut right after a space keeps the space ──────────────────
      const J = await run([['{"name":"Alpha ', 'max_tokens'], ['task"}', 'end_turn']]);
      out.J = { text: J.text, threw: J.threw };
      if (!J.threw && J.text !== '{"name":"Alpha task"}') say('Seam', 'a cut just after a space lost it: ' + JSON.stringify(J.text));
      const J2 = await run([['{"name":"Alpha ', 'max_tokens'], [' task"}', 'end_turn']]);
      out.J2 = { text: J2.text, threw: J2.threw };
      if (!J2.threw && J2.text !== '{"name":"Alpha task"}') say('Seam', 'a continuation that re-sent the space doubled it: ' + JSON.stringify(J2.text));
      const asst = ((J.bodies[1] || {}).messages || []).filter(m => m.role === 'assistant').map(m => contentText(m.content));
      if (asst.some(a => /\s$/.test(a))) say('Seam', 'the assistant turn is sent ending in whitespace');
    } finally {
      window.fetch = realFetch;
      key.value = keyWas;
    }
    out.contradictions = bad;
    return out;
  }, [SEAM, REST, WHOLE]);

  R.outboundRequests = requests.slice(0, 8);
  if (requests.length) R.contradictions.push('Network :: the page made ' + requests.length + ' request(s) off the machine');
  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

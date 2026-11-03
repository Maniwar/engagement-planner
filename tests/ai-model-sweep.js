/* ═══════════════════════════════════════════════════════════════════════════
   THE MODELS THE APP OFFERS, AND WHAT IT SENDS FOR THEM.

   No API key, and nothing leaves the page: window.fetch is replaced for the
   length of each call, so the request body is read exactly as the app built it
   and answered with a one-line stream.

   THE SPEC is the vendor's, not ours. It was read from platform.claude.com on
   2026-11-03 — the models overview for the ids, and the "Output limits" table
   in build-with-claude/thinking for the ceilings. When Anthropic ships a new
   model, this table is the first thing to change, and the check then says
   everything the app still has to catch up on.

   Four things are checked, each because it has been wrong before or would be
   wrong silently:

   1. The picker offers exactly the current models and opens on the one the
      label calls "recommended". It used to open on its FIRST option (Opus 5)
      while the label and the code's fallback both said Sonnet 5 — three
      sources for one default, agreeing by accident at best.

   2. Every offered model has its own documented output ceiling. The ceiling
      table matches by id prefix, so a new id inherits whatever prefix it
      happens to share: claude-haiku-5-5 shares none and fell through to the
      64k unknown-model floor, half of what the model allows.

   3. The request carries the chosen model, its full ceiling, and no manual
      thinking budget — `thinking: {type: "enabled", budget_tokens}` is a 400
      on every model from Opus 4.7 on.

   4. A model id saved in this browser that the picker no longer offers moves
      to the same family's current model, says so, and is saved back. Before,
      select.value = <unknown id> left the picker EMPTY, and every call quietly
      went out on the hardcoded fallback — a user who chose Opus got Sonnet and
      nothing on screen said so.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP } = require('./_harness');
const { chromium } = requirePlaywright();

// id → documented max output tokens, for the models the picker must offer
const CURRENT = {
  'claude-fable-5-1':  128000,
  'claude-opus-5-5':   128000,
  'claude-sonnet-5-5': 128000,
  'claude-haiku-5-5':  128000
};
const DEFAULT = 'claude-sonnet-5-5';
// earlier ids keep their own documented ceilings: opts.model can still name them
const LEGACY_CAPS = {
  'claude-haiku-4-5-20251001': 64000,
  'claude-opus-5': 128000,
  'claude-sonnet-5': 128000,
  'claude-opus-4-8': 128000
};
// a saved choice the picker no longer offers → what it must become
const SUCCESSOR = {
  'claude-opus-5': 'claude-opus-5-5',
  'claude-sonnet-5': 'claude-sonnet-5-5',
  'claude-opus-4-8': 'claude-opus-5-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-5-5',
  'claude-fable-5': 'claude-fable-5-1',
  'claude-sonnet-4-6': 'claude-sonnet-5-5',
  'not-a-model': DEFAULT
};
// hardcoded here because the init script runs before the app defines it; the
// first check confirms it still matches AI_MODEL_STORE, or every migration
// case below would be seeding a key the app never reads
const STORE_KEY = 'pertGantt.aiModel';

/* Record every message the save indicator shows. flashSaved replaces the text
   node, so each message is its own added node — reading the records rather
   than the element means a later message in the same task cannot hide an
   earlier one. Observing `document` works before <html> exists. */
const WATCH_FLASHES = () => {
  window.__flashes = [];
  new MutationObserver(recs => recs.forEach(r => {
    if (!r.target || r.target.id !== 'savedIndicator') return;
    r.addedNodes.forEach(n => { const t = String(n.textContent || '').trim(); if (t) window.__flashes.push(t); });
  })).observe(document, { subtree: true, childList: true });
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const R = { contradictions: [] };
  const say = (a, m) => R.contradictions.push(a + ' :: ' + m);
  const errs = [], requests = [];
  const open = async seed => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(WATCH_FLASHES);
    if (seed !== undefined) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [STORE_KEY, seed]);
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errs.push(e.message));
    page.on('request', r => { const u = r.url(); if (!/^file:/.test(u)) requests.push(u); });
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    return { ctx, page };
  };

  // ═══ 1–3. A FRESH BROWSER ═══════════════════════════════════════════════
  {
    const { ctx, page } = await open();
    const F = await page.evaluate(async ([CURRENT, LEGACY_CAPS, STORE_KEY]) => {
      const sel = document.getElementById('aiModel');
      const out = {
        storeKey: AI_MODEL_STORE === STORE_KEY,
        offered: Array.from(sel.options).map(o => o.value),
        value: sel.value,
        selectedText: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '',
        caps: {}, legacyCaps: {}, sent: {}, emptyPickerSent: null
      };
      Object.keys(CURRENT).forEach(id => { out.caps[id] = modelOutputCap(id); });
      Object.keys(LEGACY_CAPS).forEach(id => { out.legacyCaps[id] = modelOutputCap(id); });

      // the request each offered model produces, read straight off fetch
      const realFetch = window.fetch;
      const key = document.getElementById('aiKey');
      const keyWas = key.value;
      key.value = 'sk-ant-test-fixture-not-a-key';
      const sse = ['message_start', 'content_block_delta', 'message_delta'].map(t => 'event: ' + t + '\ndata: ' + JSON.stringify(
        t === 'message_start' ? { type: t, message: { usage: { input_tokens: 1 } } }
        : t === 'content_block_delta' ? { type: t, index: 0, delta: { type: 'text_delta', text: 'pong' } }
        : { type: t, delta: { stop_reason: 'end_turn' } })).join('\n\n') + '\n\n';
      const send = async () => {
        let body = null;
        window.fetch = async (url, init) => {
          body = JSON.parse(init.body);
          return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
        };
        let text = '';
        try { text = await callAnthropic('ping', { quiet: true }); }
        catch (e) { text = 'THREW: ' + e.message; }
        finally { window.fetch = realFetch; }
        return { body, text };
      };
      try {
        for (const id of out.offered) {
          sel.value = id;
          const r = await send();
          const bd = r.body || {};
          const msgs = Array.isArray(bd.messages) ? bd.messages : [];
          out.sent[id] = {
            text: r.text, model: bd.model, max_tokens: bd.max_tokens, stream: bd.stream,
            budgetThinking: !!(bd.thinking && (bd.thinking.type === 'enabled' || 'budget_tokens' in bd.thinking)),
            lastRole: msgs.length ? msgs[msgs.length - 1].role : null
          };
        }
        // no option selected at all — the request must still go out on the default
        sel.selectedIndex = -1;
        const r = await send();
        out.emptyPickerSent = r.body ? r.body.model : r.text;
      } finally {
        key.value = keyWas;
        sel.value = out.value;
      }
      return out;
    }, [CURRENT, LEGACY_CAPS, STORE_KEY]);
    R.fresh = F;
    await ctx.close();

    if (!F.storeKey) say('Setup', 'the app no longer stores the model under ' + STORE_KEY + ' — every migration case below seeds a key nothing reads');
    const want = Object.keys(CURRENT);
    want.filter(id => F.offered.indexOf(id) < 0).forEach(id => say('Picker', 'does not offer ' + id + ', a current model'));
    F.offered.filter(id => want.indexOf(id) < 0).forEach(id => say('Picker', 'offers ' + id + ', which is not one of the current models'));
    if (F.value !== DEFAULT) say('Default', 'a fresh browser opens on ' + (F.value || 'nothing') + ', not ' + DEFAULT);
    if (!/recommended/i.test(F.selectedText)) say('Default', 'the option a fresh browser opens on ("' + F.selectedText + '") is not the one labelled recommended');
    want.forEach(id => {
      if (F.caps[id] !== CURRENT[id]) say('Output ceiling', id + ' is given ' + F.caps[id] + ' tokens; the documented limit is ' + CURRENT[id]);
    });
    Object.keys(LEGACY_CAPS).forEach(id => {
      if (F.legacyCaps[id] !== LEGACY_CAPS[id]) say('Output ceiling', 'the earlier id ' + id + ' is given ' + F.legacyCaps[id] + ' tokens; the documented limit is ' + LEGACY_CAPS[id]);
    });
    F.offered.forEach(id => {
      const s = F.sent[id];
      if (!s) return;
      if (s.text !== 'pong') say('Request', id + ' — the call did not return the streamed text (' + s.text + ')');
      if (s.model !== id) say('Request', 'choosing ' + id + ' sent ' + s.model);
      if (CURRENT[id] && s.max_tokens !== CURRENT[id]) say('Request', id + ' was sent max_tokens ' + s.max_tokens + ', not its ceiling ' + CURRENT[id]);
      if (s.stream !== true) say('Request', id + ' was not streamed');
      if (s.budgetThinking) say('Request', id + ' was sent a manual thinking budget, which current models reject with a 400');
      if (s.lastRole !== 'user') say('Request', id + ' — the first round ends on a ' + s.lastRole + ' turn; current models reject a prefilled assistant turn');
    });
    if (F.emptyPickerSent !== DEFAULT) say('Fallback', 'with nothing selected the request went out on ' + F.emptyPickerSent + ', not the default ' + DEFAULT);
  }

  // ═══ 4. A CHOICE SAVED BEFORE THE PICKER CHANGED ════════════════════════
  R.migrated = {};
  for (const saved of Object.keys(SUCCESSOR)) {
    const { ctx, page } = await open(saved);
    const M = await page.evaluate(STORE_KEY => {
      const sel = document.getElementById('aiModel');
      const opt = sel.options[sel.selectedIndex];
      return { value: sel.value, stored: localStorage.getItem(STORE_KEY),
               label: opt ? opt.textContent.split(' (')[0].trim() : '', flashes: window.__flashes.slice() };
    }, STORE_KEY);
    R.migrated[saved] = M;
    await ctx.close();
    const want = SUCCESSOR[saved];
    if (M.value !== want) say('Saved model', saved + ' became ' + (M.value || 'an EMPTY picker') + ', not ' + want);
    if (M.stored !== want) say('Saved model', saved + ' was not saved back as ' + want + ' (storage holds ' + M.stored + ')');
    const told = M.flashes.some(t => t.indexOf(saved) >= 0 && M.label && t.indexOf(M.label) >= 0);
    if (!told) say('Saved model', 'switching ' + saved + ' to ' + want + ' was not announced — flashes seen: ' + JSON.stringify(M.flashes));
  }

  // a saved choice that IS offered is left alone, and nothing is announced
  {
    const keep = 'claude-opus-5-5';
    const { ctx, page } = await open(keep);
    const K = await page.evaluate(STORE_KEY => ({ value: document.getElementById('aiModel').value,
      stored: localStorage.getItem(STORE_KEY), flashes: window.__flashes.slice() }), STORE_KEY);
    R.kept = K;
    await ctx.close();
    if (K.value !== keep) say('Saved model', 'a saved current model (' + keep + ') was replaced by ' + (K.value || 'nothing'));
    if (K.stored !== keep) say('Saved model', 'a saved current model was rewritten in storage to ' + K.stored);
    if (K.flashes.some(t => /no longer offered/i.test(t))) say('Saved model', 'a saved current model was announced as no longer offered');
  }

  R.outboundRequests = requests.slice(0, 8);
  if (requests.length) say('Network', 'the page made ' + requests.length + ' request(s) off the machine during a check that stubs every call');
  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

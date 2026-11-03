/* ═══════════════════════════════════════════════════════════════════════════
   AN EXISTING SCHEDULE, PASTED OR DROPPED, BECOMES THE PLAN.

   No API key, and nothing leaves the page: window.fetch is replaced for each
   call, so the request body is read exactly as the app built it and answered
   with a stream written here.

   THE SPEC is the vendor's. Read from platform.claude.com on 2026-11-03:
   build-with-claude/vision (image blocks: base64 PNG, JPEG, GIF or WebP; 10 MB
   per image as base64; 8000 px a side; Claude 4.7 and later read up to a
   2576 px long edge and 4784 visual tokens, ⌈w/28⌉ × ⌈h/28⌉; more than 20
   images in a request tightens every image to 2000 px), build-with-claude/
   pdf-support (a `document` block, base64 application/pdf, 32 MB per request)
   and build-with-claude/prompt-caching (image and document blocks in a user
   turn can carry cache_control; at most 4 breakpoints in a request).

   What is held, each because it is the part that would go wrong quietly:

   A. A pasted image reaches the request as a well-formed image block — base64
      with no data: prefix, a media type that matches its own bytes — ahead of
      the instruction it is the subject of. The cached prefix the notes flow
      earns stays the same two leading blocks, and a cut answer resumes with the
      opening turn, image included, unchanged.
   B. A table copied from a spreadsheet (HTML) or as TSV/CSV text arrives as
      ROWS — one JSON array per row, header first, cells exact — not as a
      flattened paragraph. Prose is still pasted as prose, and in progress mode
      a status table still lands in the notes, where that flow reads it.
   C. An image larger than the model reads is downscaled to what it reads, and
      says so; one that cannot be sent is refused in words, and nothing is
      attached.
   D. The answer lands as the plan: WBS nesting, typed links with lag, O/M/P
      (a single figure becomes a derived range, and the plan says so), units,
      attendees and dates — on Create, and through the delta on Update.
   E. A malformed or truncated answer applies NOTHING.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { requirePlaywright, chromePath, APP, FIXTURE } = require('./_harness');
const { chromium } = requirePlaywright();

// the documented high-resolution tier: [source, what Claude reads]
const DOC_RESIZE = [[[3840, 2160], [2576, 1449]], [[1920, 1080], [1920, 1080]], [[200, 200], [200, 200]]];

const EXCEL_HTML = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">'
  + '<head><style>.xl66{mso-char-indent-count:1;}</style></head><body><table>'
  + '<tr><td>ID</td><td>Task Name</td><td>Duration</td><td>Start</td><td>Predecessors</td><td>Resource Names</td></tr>'
  + '<tr><td>1</td><td>Discovery</td><td>10 days</td><td>Mon 1/11/27</td><td></td><td></td></tr>'
  + '<tr><td>2</td><td class="xl66">Interviews</td><td>5 days</td><td>Mon 1/11/27</td><td></td><td>Ana[50%]</td></tr>'
  + '<tr><td>3</td><td class="xl66">Map &amp; analyse, "as is"</td><td>8 days</td><td>Wed 1/13/27</td><td>2SS+2 days</td><td>Ben</td></tr>'
  + '<tr><td>4</td><td>Sign-off<br>gate</td><td colspan="2">0 days</td><td>3</td><td>Ana,Ben</td></tr>'
  + '</table></body></html>';
const EXCEL_ROWS = [
  ['ID', 'Task Name', 'Duration', 'Start', 'Predecessors', 'Resource Names'],
  ['1', 'Discovery', '10 days', 'Mon 1/11/27', '', ''],
  ['2', '  Interviews', '5 days', 'Mon 1/11/27', '', 'Ana[50%]'],
  ['3', '  Map & analyse, "as is"', '8 days', 'Wed 1/13/27', '2SS+2 days', 'Ben'],
  ['4', 'Sign-off\ngate', '0 days', '', '3', 'Ana,Ben']
];
const TSV = 'WBS\tTask\tDuration\tPredecessors\n1\tPlan\t\t\n1.1\tKick-off\t1d\t\n1.2\tScope review\t3d\t1.1FS+1d\n';
const TSV_ROWS = [['WBS', 'Task', 'Duration', 'Predecessors'], ['1', 'Plan', '', ''], ['1.1', 'Kick-off', '1d', ''], ['1.2', 'Scope review', '3d', '1.1FS+1d']];
const CSV = 'Task,Duration,Predecessors\n"Design, review",4d,\nBuild,10d,"Design, review"\nGo-live,0d,Build\n';
const CSV_ROWS = [['Task', 'Duration', 'Predecessors'], ['Design, review', '4d', ''], ['Build', '10d', 'Design, review'], ['Go-live', '0d', 'Build']];

// the answer the stub gives on Create: every field the import has to carry
const PLAN = {
  projectName: 'Imported Rollout', durationUnit: 'days', projectStart: '2027-01-11',
  tasks: [
    { name: 'Phase A — Discovery', parent: '', optimistic: 0, mostLikely: 0, pessimistic: 0, milestone: false },
    { name: 'Kickoff', parent: 'Phase A — Discovery', milestone: true, optimistic: 0, mostLikely: 0, pessimistic: 0, owner: 'Ana' },
    { name: 'Interviews', parent: 'Phase A — Discovery', optimistic: 3, mostLikely: 4, pessimistic: 7, owner: 'Ana', units: 50, dependsOn: ['Kickoff'] },
    // ONE figure in the source and no range: the app derives it
    { name: 'Current-state map', parent: 'Phase A — Discovery', mostLikely: 8, owner: 'Ben', dependsOn: [{ name: 'Interviews', type: 'SS', lag: 2 }] },
    { name: 'Phase B — Build', parent: '' },
    { name: 'Build sub-phase', parent: 'Phase B — Build' },
    // ONE figure in the source, range derived by the model and flagged
    { name: 'Configure', parent: 'Build sub-phase', optimistic: 6, mostLikely: 8, pessimistic: 12, rangeDerived: true, owner: 'Dev team', units: 200,
      attendees: [{ name: 'Ben', units: 25 }], dependsOn: [{ name: 'Current-state map', type: 'FF', lag: -1 }], startNoEarlier: '2027-02-01' },
    { name: 'Data load', parent: 'Build sub-phase', optimistic: 2, mostLikely: 3, pessimistic: 5, owner: 'Ben', dependsOn: [{ name: 'Configure', type: 'sf', lag: 0 }, 'Interviews'] },
    { name: 'Go-live', parent: 'Phase B — Build', milestone: true, dependsOn: ['Data load'], deadline: '2027-03-31' }
  ],
  resources: [{ name: 'Ana', capacityPercent: 100 }, { name: 'Ben', capacityPercent: 100 }, { name: 'Dev team', capacityPercent: 300 }],
  exclusions: []
};

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: chromePath() });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [], requests = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errs.push(e.message));
  // data: and blob: URLs are the page reading its own pasted bytes — on the machine
  page.on('request', r => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) requests.push(u); });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.evaluate(d => { hydrate(d); calculate(); }, FIXTURE());
  await page.waitForTimeout(300);

  /* Shared helpers, hung on window so each evaluate below calls them as methods
     — a bare call to a helper declared in another evaluate would read, to the
     dead-call scan, as a call to an app function that does not exist. */
  await page.evaluate(() => {
    const realFetch = window.fetch;
    const sse = (text, stop) => ['message_start', 'content_block_delta', 'message_delta'].map(t => 'event: ' + t + '\ndata: ' + JSON.stringify(
      t === 'message_start' ? { type: t, message: { usage: { input_tokens: 1 } } }
      : t === 'content_block_delta' ? { type: t, index: 0, delta: { type: 'text_delta', text: text } }
      : { type: t, delta: { stop_reason: stop } })).join('\n\n') + '\n\n';
    const S = {
      bodies: [],
      stub: (rounds) => {
        S.bodies = [];
        window.fetch = async (url, init) => {
          S.bodies.push(JSON.parse(init.body));
          const r = rounds[Math.min(S.bodies.length - 1, rounds.length - 1)];
          return new Response(sse(r[0], r[1]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
        };
      },
      unstub: () => { window.fetch = realFetch; },
      picture: async (w, h, type) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#2563eb' : '#f59e0b'; g.fillRect(w * (0.05 + i * 0.1), h * (0.08 + i * 0.14), w * 0.3, h * 0.08); }
        return await new Promise(res => c.toBlob(res, type || 'image/png', 0.9));
      },
      transfer: (items) => {
        const dt = new DataTransfer();
        (items.files || []).forEach(f => dt.items.add(f));
        Object.keys(items.data || {}).forEach(k => dt.setData(k, items.data[k]));
        return dt;
      },
      paste: (items) => {
        const ta = document.getElementById('aiNotes');
        const ev = new ClipboardEvent('paste', { clipboardData: S.transfer(items), bubbles: true, cancelable: true });
        ta.dispatchEvent(ev);
        return ev.defaultPrevented;
      },
      drop: (items) => {
        const ta = document.getElementById('aiNotes');
        const ev = new DragEvent('drop', { dataTransfer: S.transfer(items), bubbles: true, cancelable: true });
        ta.dispatchEvent(ev);
        return ev.defaultPrevented;
      },
      error: () => { const e = document.getElementById('aiError'); return e && e.style.display !== 'none' ? e.textContent.trim() : ''; },
      clearError: () => { const e = document.getElementById('aiError'); if (e) { e.style.display = 'none'; e.textContent = ''; } },
      snapshot: () => {
        return JSON.stringify({ tasks: tasks.map(t => [t.id, t.name, t.o, t.m, t.p, t.parentId, t.predecessors, t.owner, t.units, t.startNoEarlier, t.deadline]),
          resources, raid, ps: document.getElementById('projectStart').value, pn: document.getElementById('projectName').value });
      },
      generate: async (mode, notes, rounds) => {
        document.getElementById('aiMode').value = mode;
        document.getElementById('aiNotes').value = notes || '';
        document.getElementById('aiAlsoStories').checked = false;
        S.clearError();
        S.stub(rounds);
        try { await generateWithAI(); } finally { S.unstub(); }
        return { bodies: S.bodies, error: S.error(), status: document.getElementById('aiStatus').textContent };
      },
      firstTurn: (body) => { const m = ((body || {}).messages || [])[0]; return m ? (Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }]) : []; },
      dims: async (b64, type) => {
        const bin = atob(b64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const bm = await createImageBitmap(new Blob([u], { type: type }));
        return { w: bm.width, h: bm.height };
      },
      // the documented fit test, written out so the check does not trust the app's own
      fits: (w, h) => { return Math.ceil(w / 28) * 28 <= 2576 && Math.ceil(h / 28) * 28 <= 2576 && Math.ceil(w / 28) * Math.ceil(h / 28) <= 4784; },
      rowsIn: (text) => { return String(text).split('\n').filter(l => /^\[/.test(l)).map(l => JSON.parse(l)); }
    };
    window.__si = S;
    document.getElementById('aiKey').dataset.was = document.getElementById('aiKey').value;
    document.getElementById('aiKey').value = 'sk-ant-test-fixture-not-a-key';
  });

  const R = { contradictions: [] };
  const take = o => { (o.bad || []).forEach(c => R.contradictions.push(c)); delete o.bad; return o; };

  /* ═══ A. A PASTED IMAGE IS AN IMAGE BLOCK ═══════════════════════════════ */
  R.image = take(await page.evaluate(async ([PLAN]) => {
    const bad = []; const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const S = window.__si;
    if (typeof aiAttachments === 'undefined' || typeof aiAttachIdle !== 'function') {
      say('Attach', 'the AI builder has no attachment list (aiAttachments / aiAttachIdle) — nothing can be pasted into it');
      return Object.assign(out, { bad });
    }
    aiAttachClear();
    // the notes-only request first: its cached prefix is what an import must keep
    const plain = await S.generate('replace', 'A small CRM rollout.', [[JSON.stringify(PLAN), 'end_turn']]);
    const plainTurn = S.firstTurn(plain.bodies[0]);

    const shot = new File([await S.picture(640, 360)], 'gantt.png', { type: 'image/png' });
    const took = S.paste({ files: [shot] });
    await aiAttachIdle();
    out.attached = aiAttachments.map(a => ({ kind: a.kind, name: a.name, mediaType: a.mediaType, w: a.w, h: a.h }));
    if (!took) say('Paste', 'pasting an image did not stop the browser pasting it into the notes as well');
    if (aiAttachments.length !== 1 || aiAttachments[0].kind !== 'image') say('Paste', 'a pasted screenshot did not become one image attachment: ' + JSON.stringify(out.attached));
    const tray = document.getElementById('aiAttachTray');
    if (!tray || tray.hidden || !tray.querySelector('img')) say('Preview', 'the pasted image has no thumbnail in the builder');
    if (!tray || !Array.from(tray.querySelectorAll('button')).some(x => /remove/i.test(x.getAttribute('aria-label') || '')))
      say('Preview', 'the thumbnail has no button to remove it');

    const r = await S.generate('replace', '', [[JSON.stringify(PLAN), 'end_turn']]);
    out.error = r.error;
    if (r.error) say('Generate', 'an image with no notes was refused: ' + r.error);
    // read once: left attached, it would ride along with the next Update as an order to re-sync
    if (!r.error && aiAttachments.length) say('Generate', 'a schedule that was imported is still attached, so the next Update would send it again');
    const turn = S.firstTurn(r.bodies[0]);
    out.blockTypes = turn.map(x => x.type + (x.cache_control ? '*' : ''));
    const imgs = turn.filter(x => x.type === 'image');
    if (imgs.length !== 1) say('Request', 'the request carries ' + imgs.length + ' image blocks, not 1');
    const img = imgs[0];
    if (img) {
      const src = img.source || {};
      if (src.type !== 'base64') say('Request', 'the image source type is ' + src.type + ', not base64');
      if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].indexOf(src.media_type) < 0) say('Request', 'the image media type is ' + src.media_type);
      if (/^data:|\s/.test(String(src.data || ''))) say('Request', 'the image data carries a data: prefix or whitespace — the API wants bare base64');
      const magic = String(src.data || '').slice(0, 12);
      const isPng = /^iVBORw0KGgo/.test(magic), isJpg = /^\/9j\//.test(magic);
      if ((src.media_type === 'image/png' && !isPng) || (src.media_type === 'image/jpeg' && !isJpg))
        say('Request', 'the media type ' + src.media_type + ' does not match the bytes it labels (' + magic + ')');
      try { const d = await S.dims(src.data, src.media_type); out.sentDims = d; if (d.w !== 640 || d.h !== 360) say('Request', 'a 640×360 screenshot was sent at ' + d.w + '×' + d.h); }
      catch (e) { say('Request', 'the image data does not decode: ' + e.message); }
      const iImg = turn.indexOf(img), last = turn[turn.length - 1];
      if (!last || last.type !== 'text' || !/schedule/i.test(last.text || '')) say('Request', 'the request does not end with the instruction to read the schedule');
      if (iImg > turn.length - 2) say('Request', 'the image comes after the instruction — the vision guide asks for image, then text');
    }
    const marks = turn.filter(x => x.cache_control).length;
    if (marks > 4) say('Cache', marks + ' cache breakpoints in one request; the API allows 4');
    // the cached prefix is the run of leading marked blocks (one or two: the bank block is left out when empty)
    let lead = 0; while (lead < plainTurn.length && plainTurn[lead].cache_control) lead++;
    out.cachedLead = lead;
    if (!lead) say('Cache', 'the notes request carries no cached prefix — this check has nothing to compare');
    if (JSON.stringify(turn.slice(0, lead)) !== JSON.stringify(plainTurn.slice(0, lead)))
      say('Cache', 'the leading cached blocks differ between a notes request and an import — the import starts a cache of its own');
    if (img && !turn.slice(turn.indexOf(img), -1).some(x => x.cache_control))
      say('Cache', 'nothing marks the attachment for caching, so a retry within five minutes uploads and bills it again');

    // a cut answer resumes with the opening turn — image included — unchanged
    S.paste({ files: [shot] }); await aiAttachIdle();
    const half = JSON.stringify(PLAN); const cut = Math.floor(half.length / 2);
    const c = await S.generate('replace', '', [[half.slice(0, cut), 'max_tokens'], [half.slice(cut), 'end_turn']]);
    out.continued = { requests: c.bodies.length, error: c.error };
    if (c.bodies.length !== 2) say('Continuation', 'a cut import took ' + c.bodies.length + ' requests, not 2');
    else {
      const m2 = c.bodies[1].messages || [];
      if (JSON.stringify(m2[0]) !== JSON.stringify((c.bodies[0].messages || [])[0])) say('Continuation', 'the resume request changed the opening turn that carries the image');
      if ((m2[m2.length - 1] || {}).role !== 'user') say('Continuation', 'the resume request ends on a ' + (m2[m2.length - 1] || {}).role + ' turn');
    }
    if (c.error) say('Continuation', 'a cut import that was resumed still failed: ' + c.error);

    // the remove button takes it away, and the next request is the plain one again
    S.paste({ files: [shot] }); await aiAttachIdle();
    const x = tray && Array.from(tray.querySelectorAll('button')).find(bt => /remove/i.test(bt.getAttribute('aria-label') || ''));
    if (x) x.click();
    out.afterRemove = aiAttachments.length;
    if (aiAttachments.length) say('Remove', 'the remove button left ' + aiAttachments.length + ' attachment(s)');
    if (tray && !tray.hidden) say('Remove', 'the empty tray is still shown');
    const after = await S.generate('replace', 'A small CRM rollout.', [[JSON.stringify(PLAN), 'end_turn']]);
    if (S.firstTurn(after.bodies[0]).some(x => x.type === 'image')) say('Remove', 'a removed image was still sent');
    if (JSON.stringify(after.bodies[0].messages) !== JSON.stringify(plain.bodies[0].messages)) say('Remove', 'with nothing attached the request is not the notes request it was before');

    // no notes and nothing attached is still refused; progress mode does not read attachments
    const none = await S.generate('replace', '', [[JSON.stringify(PLAN), 'end_turn']]);
    if (!none.error || none.bodies.length) say('Generate', 'with no notes and nothing attached the request went out anyway');
    S.paste({ files: [shot] }); await aiAttachIdle();
    const prog = await S.generate('progress', 'Kick-off is done.', [['{"updates":[]}', 'end_turn']]);
    out.progress = prog.error;
    if (prog.bodies.length) say('Progress mode', 'an attachment went out on a progress update, which does not read it');
    if (!/attach/i.test(prog.error)) say('Progress mode', 'an attachment on a progress update is dropped without a word: ' + JSON.stringify(prog.error));
    aiAttachClear();
    return Object.assign(out, { bad });
  }, [PLAN]));

  /* ═══ B. A PASTED TABLE ARRIVES AS ROWS ═════════════════════════════════ */
  R.table = take(await page.evaluate(async ([PLAN, EXCEL_HTML, EXCEL_ROWS, TSV, TSV_ROWS, CSV, CSV_ROWS]) => {
    const bad = []; const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const S = window.__si;
    if (typeof aiAttachments === 'undefined') { say('Table', 'no attachment support — a pasted table goes into the notes as text'); return { bad }; }
    const sentRows = async label => {
      const r = await S.generate('replace', '', [[JSON.stringify(PLAN), 'end_turn']]);
      const turn = S.firstTurn(r.bodies[0]);
      if (turn.some(x => x.type === 'image' || x.type === 'document')) say(label, 'a pasted table was sent as a picture or a document');
      const blk = turn.find(x => x.type === 'text' && S.rowsIn(x.text).length);
      return blk ? S.rowsIn(blk.text) : null;
    };
    const ta = document.getElementById('aiNotes');
    const cases = [
      ['Excel HTML', { data: { 'text/html': EXCEL_HTML, 'text/plain': EXCEL_ROWS.map(r => r.join('\t')).join('\n') } }, EXCEL_ROWS, /excel/i],
      // Excel also puts a picture of the cells on the clipboard; the cells win
      ['Excel HTML + picture', { files: [new File([await S.picture(300, 120)], 'cells.png', { type: 'image/png' })], data: { 'text/html': EXCEL_HTML } }, EXCEL_ROWS, /excel/i],
      ['TSV', { data: { 'text/plain': TSV } }, TSV_ROWS, null],
      ['CSV', { data: { 'text/plain': CSV } }, CSV_ROWS, null]
    ];
    out.cases = {};
    for (const [label, items, want, src] of cases) {
      aiAttachClear(); ta.value = '';
      document.getElementById('aiMode').value = 'replace';
      const took = S.paste(items);
      await aiAttachIdle();
      const a = aiAttachments[0] || {};
      const kinds = aiAttachments.map(x => x.kind);
      const tray = document.getElementById('aiAttachTray');
      if (!tray || tray.hidden || !tray.querySelector('table')) say(label, 'the pasted table has no preview in the builder');
      const rows = await sentRows(label);
      out.cases[label] = { took, kinds, source: a.source, rows: rows && rows.length };
      if (!took) say(label, 'the paste was not taken — the table went into the notes as text');
      if (kinds.length !== 1 || a.kind !== 'table') say(label, 'did not become one table attachment: ' + JSON.stringify(kinds));
      if (src && !src.test(String(a.source || ''))) say(label, 'the source is reported as ' + JSON.stringify(a.source));
      if (!rows) { say(label, 'the request carries no rows'); continue; }
      if (JSON.stringify(rows) !== JSON.stringify(want)) say(label, 'the rows sent are ' + JSON.stringify(rows) + ', not ' + JSON.stringify(want));
    }

    // a dropped .csv file is a table too, and a dropped PDF is a document block
    aiAttachClear();
    const tookCsv = S.drop({ files: [new File([CSV], 'schedule.csv', { type: 'text/csv' })] });
    await aiAttachIdle();
    if (!tookCsv || aiAttachments.length !== 1 || aiAttachments[0].kind !== 'table') say('Drop', 'a dropped CSV file did not become a table: ' + JSON.stringify(aiAttachments.map(x => x.kind)));
    aiAttachClear();
    const pdfBytes = '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n';
    S.drop({ files: [new File([pdfBytes], 'schedule.pdf', { type: 'application/pdf' })] });
    await aiAttachIdle();
    if (aiAttachments.length !== 1 || aiAttachments[0].kind !== 'pdf') say('Drop', 'a dropped PDF did not become one document attachment');
    const rp = await S.generate('replace', '', [[JSON.stringify(PLAN), 'end_turn']]);
    const doc = S.firstTurn(rp.bodies[0]).find(x => x.type === 'document');
    out.pdf = doc ? { media_type: doc.source && doc.source.media_type, type: doc.source && doc.source.type } : null;
    if (!doc) say('PDF', 'the request has no document block');
    else {
      if (!doc.source || doc.source.type !== 'base64' || doc.source.media_type !== 'application/pdf') say('PDF', 'the document block is ' + JSON.stringify(doc.source && { type: doc.source.type, media_type: doc.source.media_type }));
      else {
        let back = null; try { back = atob(doc.source.data); } catch (e) { back = null; }
        if (back !== pdfBytes) say('PDF', 'the document data is not the dropped file as bare base64' + (back == null ? ' (it does not decode)' : ''));
      }
    }

    // prose is prose; a status table in progress mode is still notes
    aiAttachClear(); ta.value = '';
    document.getElementById('aiMode').value = 'replace';
    const prose = S.paste({ data: { 'text/plain': 'Discovery first, then design, then build. Ana leads, Ben helps.' } });
    if (prose || aiAttachments.length) say('Prose', 'a pasted sentence was taken as a table');
    // several lines of notes with commas in them are notes, not a CSV
    const lines = S.paste({ data: { 'text/plain': 'Discovery first, then design.\nAna leads, Ben helps, Cy reviews.\nGo-live in March.' } });
    if (lines || aiAttachments.length) say('Prose', 'three lines of notes with commas were taken as a table');
    const prose2 = S.paste({ data: { 'text/html': '<p>Kick-off <b>next</b> week</p>', 'text/plain': 'Kick-off next week' } });
    if (prose2 || aiAttachments.length) say('Prose', 'pasted rich text with no table was taken as an attachment');
    document.getElementById('aiMode').value = 'progress';
    const status = S.paste({ data: { 'text/plain': TSV } });
    if (status || aiAttachments.length) say('Progress mode', 'a status table pasted for a progress update was taken out of the notes');
    document.getElementById('aiMode').value = 'replace';
    aiAttachClear();
    return Object.assign(out, { bad });
  }, [PLAN, EXCEL_HTML, EXCEL_ROWS, TSV, TSV_ROWS, CSV, CSV_ROWS]));

  /* ═══ C. TOO BIG IS DOWNSCALED, OR REFUSED IN WORDS ═════════════════════ */
  R.oversize = take(await page.evaluate(async ([PLAN, DOC_RESIZE]) => {
    const bad = []; const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const S = window.__si;
    if (typeof aiAttachments === 'undefined') { say('Oversize', 'no attachment support — an image cannot be downscaled or refused'); return { bad }; }
    if (typeof aiFitImage !== 'function') say('Resize', 'there is no aiFitImage — the size the model reads is not computed');
    else {
      out.docTable = DOC_RESIZE.map(([src, want]) => { const g = aiFitImage(src[0], src[1]); return [src, [g.w, g.h], want]; });
      out.docTable.forEach(([src, got, want]) => { if (got[0] !== want[0] || got[1] !== want[1]) say('Resize', src.join('×') + ' fits to ' + got.join('×') + '; the vision guide says ' + want.join('×')); });
    }
    aiAttachClear(); S.clearError();
    S.paste({ files: [new File([await S.picture(5000, 3000)], 'huge-gantt.png', { type: 'image/png' })] });
    await aiAttachIdle();
    const a = aiAttachments[0];
    out.big = a ? { w: a.w, h: a.h, from: a.from, mediaType: a.mediaType, chars: a.data.length } : null;
    if (!a) say('Downscale', 'a 5000×3000 screenshot was not attached: ' + S.error());
    else {
      if (!S.fits(a.w, a.h)) say('Downscale', 'a 5000×3000 screenshot is kept at ' + a.w + '×' + a.h + ', beyond what the model reads');
      if (a.w / a.h < 1.64 || a.w / a.h > 1.69) say('Downscale', 'the downscale changed the shape: ' + a.w + '×' + a.h);
      if (a.data.length > 10e6) say('Downscale', 'the image is ' + a.data.length + ' base64 characters, over the 10 MB limit');
      const tray = document.getElementById('aiAttachTray');
      const said = tray ? tray.textContent : '';
      if (!/5000\s*×\s*3000/.test(said) || !/downscal|resiz/i.test(said)) say('Downscale', 'the preview does not say the image was downscaled from 5000×3000: ' + JSON.stringify(said.slice(0, 160)));
      const r = await S.generate('replace', '', [[JSON.stringify(PLAN), 'end_turn']]);
      const img = S.firstTurn(r.bodies[0]).find(x => x.type === 'image');
      if (img) {
        try { const d = await S.dims(img.source.data, img.source.media_type); out.sent = d; if (!S.fits(d.w, d.h)) say('Downscale', 'the image SENT is ' + d.w + '×' + d.h); }
        catch (e) { say('Downscale', 'the downscaled image sent does not decode: ' + e.message); }
      }
      else say('Downscale', 'the downscaled image was not sent');
    }
    // refused: a file too large to read, a format the API does not take, a 21st attachment
    aiAttachClear(); S.clearError();
    S.paste({ files: [new File([new Uint8Array(41e6)], 'enormous.png', { type: 'image/png' })] });
    await aiAttachIdle();
    out.tooBig = S.error();
    if (aiAttachments.length) say('Refuse', 'a 41 MB file was attached');
    if (!/MB/.test(out.tooBig) || !/enormous\.png/.test(out.tooBig)) say('Refuse', 'a 41 MB file is refused without naming it and its size: ' + JSON.stringify(out.tooBig));
    S.clearError();
    S.drop({ files: [new File([new Uint8Array(64)], 'scan.tiff', { type: 'image/tiff' })] });
    await aiAttachIdle();
    out.tiff = S.error();
    if (aiAttachments.length) say('Refuse', 'a TIFF was attached; the API takes PNG, JPEG, GIF and WebP');
    if (!/PNG/.test(out.tiff) || !/JPEG/.test(out.tiff)) say('Refuse', 'a TIFF is refused without saying what is accepted: ' + JSON.stringify(out.tiff));
    S.clearError();
    const small = await S.picture(40, 30);
    const many = []; for (let i = 0; i < 21; i++) many.push(new File([small], 'shot-' + i + '.png', { type: 'image/png' }));
    S.drop({ files: many });
    await aiAttachIdle();
    out.many = { kept: aiAttachments.length, said: S.error() };
    if (aiAttachments.length !== 20) say('Refuse', '21 images left ' + aiAttachments.length + ' attached, not the first 20');
    if (!/20/.test(out.many.said)) say('Refuse', 'the 21st image is dropped without a word: ' + JSON.stringify(out.many.said));
    aiAttachClear(); S.clearError();
    return Object.assign(out, { bad });
  }, [PLAN, DOC_RESIZE]));

  /* ═══ D. THE ANSWER LANDS AS THE PLAN ═══════════════════════════════════ */
  R.create = take(await page.evaluate(async ([PLAN]) => {
    const bad = []; const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const S = window.__si;
    const can = typeof aiAttachments !== 'undefined';
    if (!can) say('Create', 'no attachment support — the answer below went through the notes path instead');
    else {
      aiAttachClear();
      S.paste({ files: [new File([await S.picture(800, 450)], 'gantt.png', { type: 'image/png' })] });
      await aiAttachIdle();
    }
    const raidBefore = raid.length;
    const r = await S.generate('replace', can ? '' : 'Rebuild this schedule.', [[JSON.stringify(PLAN), 'end_turn']]);
    out.error = r.error; out.status = r.status;
    if (r.error) { say('Create', 'the import failed: ' + r.error); return Object.assign(out, { bad }); }
    const by = n => tasks.find(t => t.name === n);
    const id = n => (by(n) || {}).id;
    out.tasks = tasks.map(t => ({ name: t.name, omp: [t.o, t.m, t.p], parent: (tasks.find(x => x.id === t.parentId) || {}).name || '',
      preds: t.predecessors.map(p => ((tasks.find(x => x.id === p.id) || {}).name) + ' ' + p.type + (p.lag ? (p.lag > 0 ? '+' : '') + p.lag : '')) }));
    if (tasks.length !== PLAN.tasks.length) say('Create', tasks.length + ' activities, not ' + PLAN.tasks.length);
    const parentOf = n => (tasks.find(x => x.id === (by(n) || {}).parentId) || {}).name || '';
    [['Kickoff', 'Phase A — Discovery'], ['Current-state map', 'Phase A — Discovery'], ['Build sub-phase', 'Phase B — Build'],
     ['Configure', 'Build sub-phase'], ['Data load', 'Build sub-phase'], ['Go-live', 'Phase B — Build'], ['Phase A — Discovery', '']]
      .forEach(([n, p]) => { if (parentOf(n) !== p) say('WBS', '“' + n + '” sits under “' + parentOf(n) + '”, not “' + p + '”'); });
    const links = n => JSON.stringify(((by(n) || {}).predecessors || []).map(p => [p.id, p.type, p.lag]));
    [['Interviews', [[id('Kickoff'), 'FS', 0]]], ['Current-state map', [[id('Interviews'), 'SS', 2]]],
     ['Configure', [[id('Current-state map'), 'FF', -1]]], ['Data load', [[id('Configure'), 'SF', 0], [id('Interviews'), 'FS', 0]]],
     ['Go-live', [[id('Data load'), 'FS', 0]]]]
      .forEach(([n, want]) => { if (links(n) !== JSON.stringify(want)) say('Links', '“' + n + '” waits on ' + links(n) + ', not ' + JSON.stringify(want)); });
    const omp = n => JSON.stringify([(by(n) || {}).o, (by(n) || {}).m, (by(n) || {}).p]);
    [['Interviews', [3, 4, 7]], ['Configure', [6, 8, 12]], ['Data load', [2, 3, 5]], ['Current-state map', [6, 8, 13]]]
      .forEach(([n, want]) => { if (omp(n) !== JSON.stringify(want)) say('Estimates', '“' + n + '” has O/M/P ' + omp(n) + ', not ' + JSON.stringify(want)); });
    ['Kickoff', 'Go-live'].forEach(n => { if (!(by(n) || {}).milestone) say('Milestones', '“' + n + '” is not a milestone'); });
    const cfg = by('Configure') || {};
    if (cfg.units !== 200) say('Units', 'Configure is booked at ' + cfg.units + '%, not the 200% the schedule gives');
    if (JSON.stringify((cfg.attendees || []).map(a => [a.name, a.units])) !== JSON.stringify([['Ben', 25]])) say('Units', 'Configure attendees are ' + JSON.stringify(cfg.attendees));
    if ((by('Interviews') || {}).units !== 50) say('Units', 'Interviews is booked at ' + (by('Interviews') || {}).units + '%, not 50%');
    if (document.getElementById('projectStart').value !== '2027-01-11') say('Dates', 'the project starts ' + document.getElementById('projectStart').value + ', not the schedule’s 2027-01-11');
    if (cfg.startNoEarlier !== '2027-02-01') say('Dates', 'Configure has no start-no-earlier of 2027-02-01: ' + JSON.stringify(cfg.startNoEarlier));
    if ((by('Go-live') || {}).deadline !== '2027-03-31') say('Dates', 'Go-live has no deadline of 2027-03-31: ' + JSON.stringify((by('Go-live') || {}).deadline));
    // a single figure became a range — and the plan says so, where it stays said
    if (!/derived/i.test(r.status) || !/\b2\b/.test(r.status)) say('Derived range', 'the result does not say that 2 ranges were derived: ' + JSON.stringify(r.status));
    const note = raid.slice(raidBefore).find(x => x.type === 'Assumption');
    out.assumption = note ? { title: note.title, links: (note.links || []).map(l => l.was) } : null;
    if (!note) say('Derived range', 'no assumption is filed for the derived ranges, so the statement is gone when the status line clears');
    else {
      const linked = (note.links || []).filter(l => l.k === 'act').map(l => l.id).sort((a, c) => a - c);
      const want = [id('Current-state map'), id('Configure')].sort((a, c) => a - c);
      if (JSON.stringify(linked) !== JSON.stringify(want)) say('Derived range', 'the assumption links ' + JSON.stringify(linked) + ', not the two derived activities ' + JSON.stringify(want));
    }
    // the instruction says what a single figure becomes
    const instr = (S.firstTurn(r.bodies[0]).slice(-1)[0] || {}).text || '';
    if (!/single|one figure|one duration/i.test(instr) || !/rangeDerived/.test(instr)) say('Prompt', 'the import instruction does not say how to treat a single duration');
    if (!/SS|start-to-start/.test(instr) || !/lag/i.test(instr)) say('Prompt', 'the import instruction does not ask for link types and lag');
    if (can) aiAttachClear();
    return Object.assign(out, { bad });
  }, [PLAN]));

  // UPDATE EXISTING — through the delta, on the real plan
  await page.evaluate(d => { hydrate(d); calculate(); }, FIXTURE());
  await page.waitForTimeout(200);
  R.merge = take(await page.evaluate(async ([TSV]) => {
    const bad = []; const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const S = window.__si;
    const can = typeof aiAttachments !== 'undefined';
    if (!can) say('Update', 'no attachment support — the delta below went through the notes path instead');
    const rw = tasks.find(t => t.name === 'Requirements Workshop');
    const kick = tasks.find(t => t.name === 'Kick-off & Discovery');
    const inter = tasks.find(t => t.name === 'Stakeholder Interviews');
    const ph1 = tasks.find(t => t.name === 'Phase 1 — Discovery');
    if (!rw || !kick || !inter || !ph1) { say('Setup', 'the fixture no longer has the activities this case edits'); return Object.assign(out, { bad }); }
    rw.predecessors = [{ id: kick.id, type: 'SS', lag: 1 }];
    const before = tasks.length;
    if (can) { aiAttachClear(); S.paste({ data: { 'text/plain': TSV } }); await aiAttachIdle(); }
    const delta = { changedTasks: [
      { name: 'Requirements Workshop', dependsOn: ['Kick-off & Discovery'] },
      { name: 'Vendor demo', parent: 'Phase 1 — Discovery', mostLikely: 2, owner: rw.owner, dependsOn: [{ name: 'Stakeholder Interviews', type: 'SS', lag: 1 }] }
    ], removeTasks: [], resources: [] };
    const r = await S.generate('merge', can ? '' : 'Apply this schedule.', [[JSON.stringify(delta), 'end_turn']]);
    out.error = r.error; out.status = r.status;
    if (r.error) { say('Update', 'the delta import failed: ' + r.error); return Object.assign(out, { bad }); }
    const text = S.firstTurn(r.bodies[0]).map(x => x.text || '').join('\n');
    if (!/"type":\s*"SS"/.test(text)) say('Update', 'the current plan sent to the model hides that Requirements Workshop starts with Kick-off (SS+1)');
    if (!S.rowsIn(text).length) say('Update', 'the pasted table is not in the update request');
    if (tasks.length !== before + 1) say('Update', 'the delta left ' + tasks.length + ' activities, not ' + (before + 1));
    const kept = JSON.stringify(rw.predecessors.map(p => [p.id, p.type, p.lag]));
    if (kept !== JSON.stringify([[kick.id, 'SS', 1]])) say('Update', 'a link named again without a type lost its SS+1: ' + kept);
    const vd = tasks.find(t => t.name === 'Vendor demo');
    if (!vd) say('Update', 'the new activity was not added');
    else {
      if (vd.parentId !== ph1.id) say('Update', 'the new activity is not under Phase 1');
      if (JSON.stringify(vd.predecessors.map(p => [p.id, p.type, p.lag])) !== JSON.stringify([[inter.id, 'SS', 1]])) say('Update', 'the new activity waits on ' + JSON.stringify(vd.predecessors));
      if (JSON.stringify([vd.o, vd.m, vd.p]) !== JSON.stringify([1.5, 2, 3])) say('Update', 'a single figure of 2 became ' + JSON.stringify([vd.o, vd.m, vd.p]) + ', not the derived 1.5/2/3');
    }
    if (!/derived/i.test(r.status)) say('Update', 'the update does not say a range was derived: ' + JSON.stringify(r.status));
    if (can) aiAttachClear();
    return Object.assign(out, { bad });
  }, [TSV]));

  /* ═══ E. A BAD ANSWER APPLIES NOTHING ═══════════════════════════════════ */
  R.atomic = take(await page.evaluate(async ([PLAN]) => {
    const bad = []; const say = (a, m) => bad.push(a + ' :: ' + m);
    const out = {};
    const S = window.__si;
    const can = typeof aiAttachments !== 'undefined';
    if (!can) say('Atomic', 'no attachment support — the answers below went through the notes path instead');
    else {
      aiAttachClear();
      S.paste({ files: [new File([await S.picture(640, 360)], 'gantt.png', { type: 'image/png' })] });
      await aiAttachIdle();
    }
    const whole = JSON.stringify(PLAN);
    const cases = [
      ['malformed', 'replace', [[whole.slice(0, whole.length - 40) + ',{"name":"Go-live" "milestone":true}]}', 'end_turn']]],
      ['cut by a full context window', 'replace', [[whole.slice(0, Math.floor(whole.length * 0.6)), 'model_context_window_exceeded']]],
      ['no tasks array', 'replace', [['{"rows":[{"name":"Discovery"}]}', 'end_turn']]],
      ['malformed delta', 'merge', [['{"changedTasks":[{"name":"Vendor demo","mostLikely":2},{"name":"Build", "dependsOn":["Vendor demo"]', 'end_turn']]]
    ];
    out.cases = {};
    for (const [label, mode, rounds] of cases) {
      const was = S.snapshot();
      const r = await S.generate(mode, can ? '' : 'Rebuild this schedule.', rounds);
      const same = S.snapshot() === was;
      out.cases[label] = { error: r.error.slice(0, 160), unchanged: same, stillAttached: can ? aiAttachments.length : null };
      if (!same) say('Atomic', 'a ' + label + ' answer CHANGED the plan');
      if (!r.error) say('Atomic', 'a ' + label + ' answer reported no error');
      if (can && aiAttachments.length !== 1) say('Atomic', 'after a ' + label + ' answer the schedule is no longer attached, so it cannot simply be retried');
    }
    if (can) aiAttachClear();
    return Object.assign(out, { bad });
  }, [PLAN]));

  await page.evaluate(() => { const k = document.getElementById('aiKey'); k.value = k.dataset.was || ''; });
  R.outboundRequests = requests.slice(0, 8);
  if (requests.length) R.contradictions.push('Network :: the page made ' + requests.length + ' request(s) off the machine');
  R.pageErrors = errs.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await b.close();
  if (R.contradictions.length || errs.length) process.exitCode = 1;
})();

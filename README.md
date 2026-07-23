# Engagement Planner

**AI-assisted engagement planning and delivery tracking for engagement managers and PMs — in a single HTML file.**

Open `index.html` in any modern browser. No install, no server, no build step. All data stays in your browser — projects are stored in IndexedDB (disk-backed, no 5 MB limit) with a rolling 15-snapshot history per project and a 🛟 recovery panel; on Chrome/Edge you can additionally auto-save every change to a real `.json` file on disk. Nothing is sent anywhere except direct calls you make to the Anthropic API with your own key.

> If GitHub Pages is enabled for this repo, the tool runs at the Pages URL directly.

## What it does

### Plan & estimate
- **AI Plan Builder** — paste meeting notes or an SOW; Claude drafts the full plan: tasks, 3-point estimates, dependencies, owners, phases, and a complete WBS dictionary (deliverable / scope / acceptance per item). Natural-language updates ("add a security review after testing, 2–4 days") and per-task **AI decomposition** into sub-tasks.
- **Differential plan updates** — "Update existing" and health-check fixes ask the AI for a **delta only** (changed / new / removed tasks), applied in place: untouched tasks keep their IDs, % complete, actual dates, and story/test-case links, with a receipt ("2 added, 1 updated, 1 removed — everything else untouched").
- **Streams you can see and stop** — every AI call streams with a live elapsed/thinking heartbeat, follows you across tabs, and has a **⏹ Stop** button that cancels generation server-side (unspent tokens are never billed). A stopped or truncated response applies **nothing** — plans are updated atomically or not at all.
- **PERT 3-point estimation** (TE, variance) + **CPM** critical path with FS/SS/FF/SF dependencies and lag, working-day calendar with holidays.
- **Monte Carlo simulation** (Beta-PERT): P50/P80/P90/P95 finish dates, target-date probability, per-task criticality index.
- **Historical calibration** — load your past-project benchmarks (`.md`/`.txt`/`.csv`); every AI estimate is calibrated against them. One-click **archive to history** feeds actuals back in when a project ends.
- **Plan health check** — lints over-narrow ranges, oversized tasks (8/80), missing scope/owners/milestones, under-linked networks, big-bang UAT, oversized or flat-estimated test cases, duplicate "(Parallel Track)" clones; AI review on top. Zero-estimate work packages also alarm inline in the task table (red O/M/P cells + clickable banner) — never only inside the health check.
- **UAT style preference** — generation defaults to *rolling* UAT (each deliverable gets a short verification right after it's built, plus one short end-to-end regression before go-live); switch to *single phase* when the client contractually wants one consolidated UAT window — the health check then stops flagging it.
- **Hour-scale display** — the math stays in one canonical unit, but sub-day durations read as hours/minutes everywhere ("2.3 h (0.29 days)"), the AI thinks in hours when decomposing fine-grained work (1 day = 8 working hours, never 24), and the O/M/P fields carry a fraction-of-a-day cheat sheet.

### Requirements & user stories
- **Requirements layer traced to the WBS** — AI drafts a personas glossary, epics (from your phases), and INVEST user stories, one per work item, each with Given/When/Then acceptance criteria covering the happy path, error paths, and edge cases (plus measured performance criteria where they apply), NFRs with numbers, assumptions with impact-if-false, and client dependencies with slip consequences. On-screen consolidated panels list every NFR, assumption/client dependency, and test case; the WBS tab shows a Links column (↤ predecessors / ↦ successors) and the dictionary CSV carries Predecessors, Successors, and Verified-by columns.
- **Built-in requirements lint** — flags untestable words ("fast", "seamless", "robust"…), vague personas, missing error/edge coverage, and unlinked stories; one-click AI repair of flagged stories and a targeted gap-filler for uncovered activities (test cases never count as scope needing stories).
- **Test plan flow** — 🧪 generates one executable test case per **UAT-testable** acceptance criterion (numbered Given/When/Then-derived steps, exact expected result), nested as a **WBS decomposition of your existing UAT activities** (per-workstream matching, cycle-safe dependencies) and scheduled like any other work. PM/governance **process criteria** (charter sign-off, status reports, RAID hygiene) are recognised and skipped — they're verified by their own artifacts, and listed as such rather than as gaps. Test cases are written to a strict contract: names state *action → observable outcome* (never topic restatements), scripted cases are sized 5–30 minutes with a real O<M<P spread (flat estimates and 24-hour-day conversions are rejected and auto-normalized), and owners inherit from the UAT activity they decompose. Re-running heals broken test cases **in place** — missing steps, flat estimates, or legacy topic-style names — keeping IDs, schedule position, and links; a ✍ banner counts what needs rewriting, and ⏱ right-size / ⚖ spread-across-testers (client names unbilled, `name*` for internal billable) fix sizing and pile-ups one click each. Exports: test plan `.md` (entry/exit gates, S1–S4 severity ladder, AC→TC traceability), execution sheet and traceability matrix each as **CSV or formatted Excel** with in-cell line breaks (yellow fill-in Result/Defect columns for the tester).
- **Traceability everywhere** — story status rolls up from the linked task; the on-screen matrix shows the full story sentence with its ACs and test cases; stories and ACs flow into the WBS dictionary CSV, spreadsheet CSV, Smartsheet notes, MS Project task notes, a dedicated requirements Markdown doc, a one-row-per-AC traceability matrix CSV, and an SOW appendix. Drilling into any test-case task shows its full spec: the criterion it verifies, tester steps, and pass condition.

### Track & manage
- **Live scheduling** — change anything and the whole chain, critical path, Gantt, and forecasts recompute instantly.
- **WBS** with unlimited nesting, collapse/expand levels, drag-to-reorder, indent/outdent, exportable dictionary.
- **Resources** — capacity, cost & bill rates, PTO calendars, over-allocation heatmap, leveling (within slack, or extend-timeline), add-capacity mending, managed roster with one-click 🧹 removal of idle entries (AI updates can no longer leave unused "QA Tester 2"-style roster clutter).
- **💰 Billing & cost breakdown** — per-person audit of what is billed and what is not: effort, cost rate vs bill rate, client-side (unbilled) vs internal, fixed costs, no-rate warnings, totals — exportable as CSV. Over-allocation cards show each overlapping task's *effort* with a Σ total-vs-window ratio that explains the peak %.
- **Rate cards** — named role→rate cards shared across all projects, with discounts and a default card.
- **Baseline & variance**, actual dates, **EVM** (PV/EV/AC/SV/CV/SPI/CPI/EAC), budget tracking, status snapshots with a forecast-slip trend chart.
- **One-click check-off** — tick tasks done in the activity list; phase and project percentages recompute instantly, weighted by expected duration (TE).
- **Bulk edit with shift-click** — tick a row, shift-click another to select the range; set owner/units/%, scale estimates, move under a new parent, or scope an AI edit to just those rows. Moving tasks that would loop the schedule names the conflicting links and offers to drop exactly those.
- **Dependency fix wizard + AI link repair** — a schedule loop opens a wizard showing each "X waits for Y" edge with its stored link and a one-click remove; 🔗 AI link repair proposes predecessors for unlinked tasks (or your selection), cycle-checking every suggestion before it applies.
- **Status-update round trip** — copy an email-ready update request grouped by owner (scoped to your selected rows if any), send it out, paste the replies back, and the AI updates every %, actual date, and rollup; blockers auto-log to RAID.
- **Risk explained, not just scored** — the Monte-Carlo page states *why* risk is high (P50→P90 spread, committed-date coverage vs P80) and lists the tasks driving it, each with one-click AI decomposition or re-estimation fixes.
- **RAID log** (risks/assumptions/issues/decisions/exclusions) with P×I scoring — AI can draft it from the plan.
- **Reserves** — contingency & management buffers (% or absolute, or set from P80), shown on the Gantt.
- **Multi-project library** with duplicate-as-scenario and side-by-side **what-if comparison**.

### Communicate & sell
- **Export-ready visuals** — the Gantt and PMI-style PERT network are self-contained SVGs: copy to clipboard as an image, or download PNG/SVG, complete with title, legend, and completeness indicators.
- **Status report** — one click copies email-ready tables (milestones, WBS completeness, variance, top risks) with an optional AI-drafted narrative; **client-safe mode** strips financials.
- **SOW generator** — assembles a client-ready draft from the plan itself: scope & deliverables with acceptance criteria, milestones, team & rates, assumptions/exclusions from the RAID log, and **Monte-Carlo risk-adjusted fixed pricing** (bid at P80/P90, with margin analysis).
- **Change orders that iterate** — numbered COs diff the live plan against the contract baseline; approving one logs it in a cumulative change history and rolls the baseline so the next CO covers only new changes.
- **Exports** — Microsoft Project XML (WBS outline, dependencies, resources, units), Smartsheet CSV, spreadsheet CSV, JSON backup/restore.

## AI setup (optional but recommended)
1. Get an **Anthropic API key** at [console.anthropic.com](https://console.anthropic.com) → API Keys (starts with `sk-ant-`).
2. In the tool: Tasks tab → **⚙ API Key** → paste → Save. The key is stored only in your browser and sent only to Anthropic.

Everything except the AI features works without a key.

## Development
The entire application is one file: `index.html` (vanilla JS + SVG, no dependencies). Originally developed in [Maniwar/tutorials](https://github.com/Maniwar/tutorials).

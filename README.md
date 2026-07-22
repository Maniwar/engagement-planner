# Engagement Planner

**AI-assisted engagement planning and delivery tracking for engagement managers and PMs — in a single HTML file.**

Open `index.html` in any modern browser. No install, no server, no build step. All data stays in your browser (localStorage); nothing is sent anywhere except direct calls you make to the Anthropic API with your own key.

> If GitHub Pages is enabled for this repo, the tool runs at the Pages URL directly.

## What it does

### Plan & estimate
- **AI Plan Builder** — paste meeting notes or an SOW; Claude drafts the full plan: tasks, 3-point estimates, dependencies, owners, phases, and a complete WBS dictionary (deliverable / scope / acceptance per item). Natural-language updates ("add a security review after testing, 2–4 days") and per-task **AI decomposition** into sub-tasks.
- **PERT 3-point estimation** (TE, variance) + **CPM** critical path with FS/SS/FF/SF dependencies and lag, working-day calendar with holidays.
- **Monte Carlo simulation** (Beta-PERT): P50/P80/P90/P95 finish dates, target-date probability, per-task criticality index.
- **Historical calibration** — load your past-project benchmarks (`.md`/`.txt`/`.csv`); every AI estimate is calibrated against them. One-click **archive to history** feeds actuals back in when a project ends.
- **Plan health check** — lints over-narrow ranges, oversized tasks (8/80), missing scope/owners/milestones, under-linked networks; AI review on top.

### Requirements & user stories
- **Requirements layer traced to the WBS** — AI drafts a personas glossary, epics (from your phases), and INVEST user stories, one per work item, each with Given/When/Then acceptance criteria covering the happy path, error paths, and edge cases (plus measured performance criteria where they apply), NFRs with numbers, assumptions with impact-if-false, and client dependencies with slip consequences.
- **Built-in requirements lint** — flags untestable words ("fast", "seamless", "robust"…), vague personas, missing error/edge coverage, and unlinked stories.
- **Traceability everywhere** — story status rolls up from the linked task; stories and ACs flow into the WBS dictionary CSV, spreadsheet CSV, Smartsheet notes, MS Project task notes, a dedicated requirements Markdown doc, a one-row-per-AC traceability matrix CSV, and an SOW appendix.

### Track & manage
- **Live scheduling** — change anything and the whole chain, critical path, Gantt, and forecasts recompute instantly.
- **WBS** with unlimited nesting, collapse/expand levels, drag-to-reorder, indent/outdent, exportable dictionary.
- **Resources** — capacity, cost & bill rates, PTO calendars, over-allocation heatmap, leveling (within slack, or extend-timeline), add-capacity mending, managed roster.
- **Rate cards** — named role→rate cards shared across all projects, with discounts and a default card.
- **Baseline & variance**, actual dates, **EVM** (PV/EV/AC/SV/CV/SPI/CPI/EAC), budget tracking, status snapshots with a forecast-slip trend chart.
- **One-click check-off** — tick tasks done in the activity list; phase and project percentages recompute instantly, weighted by expected duration (TE).
- **Status-update round trip** — copy an email-ready update request grouped by owner, send it out, paste the replies back, and the AI updates every %, actual date, and rollup.
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

# PLAN: To-Do Tracker — Inbox + Wish List ("Tim" tab)

Consolidated working list, compiled 2026-06-16.

**Sources (today's scope):**
1. Gmail inbox (timroberton@gmail.com) — active threads
2. FASTR Wish List Tracker → **"Tim" tab** (the `Updates: Tim` sheet)

**Out of scope today** (other Wish List tabs: New requests, Meghan, Claire, HFA, "immediate" board) — stubbed at the bottom for a later pass.

Legend: `[ ]` open · `[~]` in progress · `[?]` status unclear / verify · `🔥` urgent · `↔` appears in both sources.

---

## 1. 🔥 URGENT — Bug fixes from the inboxes

These are live, user-reported breakages. Ordered by urgency.

- [ ] 🔥🔥 **#1 — Nigeria AOP state decks: AI slide creation blocked** — Claire, Jun 16 (direct). Project **"Nigeria General Project"**, folder **"state evidence packs"**; country prompt *"Annual Operating Plan (AOP) performance review slide deck by State"*. AI builds deck structure fine, but **every chart/timeseries slide fails to write**. Tied to Rachel's 36+1-state evidence-pack push (this week). Two distinct errors:
  - **(a) `period_id` — "expected string, received number". ✅ FIXED (typechecked, pending deploy).** Root cause: the `figureBundleSchema.items` contract was added (Zod hardening) as all-string `z.record(z.string(), z.string())`, but item rows are natural SQL primitives (`period_id`/counts = number, text = string, missing = null) — and renderers coerce at use. **Fix = relax the schema to the honest contract** (`z.union([z.string(), z.number(), z.null()])`, matching panther's `JsonArrayItem`) — *not* stringify the data. Pure validation, no transform, no migration, no cache bump. Also de-lied one consumer (`build_figure_inputs.ts` `displayedIndicatorsAllPercent`). Unblocks all chart/timeseries slides **and** the MASTER-replicant approach.
  - **(b) `valueLabelReplacements has null key`** — "invalid key in record" on **slide 14** (completeness/outliers DQ tables).
  - **Likely cause (to confirm):** Zod boundary-validation mismatch in the AI slide-creation tool path (smells like the ~Jun 12–13 hardening — a too-strict `z.string()` rejecting real stored data; cf. the nanoid `z.uuid()` lesson). See DOC_AI_TOOL_SCHEMAS.md. Claire shipped 5 placeholder decks (ABIA/ANAMBRA/EBONYI/ENUGU/IMO) as a stopgap.
- [~] 🔥 **Ethiopia report download broken** ↔ — `MOH 10-month performance report`, Ethiopia instance. Angelica (r4d), first raised Jun 10, **chased Jun 15, time-sensitive** (Ethiopia team at workshop, Jun 24–26). cc Meghan, Ashley, Nick. *Also in Wish List "New requests" tab, marked High.*
  - **Root cause (confirmed via DB):** the deck's cover+footer logo `MOH White.jpeg` is a JPEG; the deck exporter embedded it as PNG → jsPDF's PNG decoder threw *"wrong PNG signature"* on slide 1 (the cover). Renders fine in-app (browser decodes JPEG); only fails at export.
  - **Fix (implemented + typechecked, pending deploy):** panther `pdf_render_context.ts` now embeds the true format / rasterizes blob-backed `<img>` deterministically; plus a visible-placeholder fallback so one bad figure/image degrades in place across dashboards/decks/reports instead of aborting. No logo change needed after deploy. *Interim (no deploy): re-save the logo as PNG.*
- [~] 🔥 **GeoJSON direct-import freeze** ↔ — platform freezes importing GeoJSON at **admin-3 level**. Reported for **Cameroon** (logins sent May 14: `dhis-minsante-cm.org`, WORLDBANK_YAOUNDE) and **DRC** (May 15, ~100% AA2–AA4 match but won't pull). Credentials available to test. *Matches Wish List "New requests" item; likely = "Cameroun map error" note on Tim tab.* **Angelica: "not urgent."**
  - **Root cause (measured, Cameroon AA3):** the per-level DHIS2 geojson fetch returns **20.4 MB for 200 district polygons** (full-resolution boundaries) and takes **~43 s**; the server then parses it + runs `buildDhis2Context` within a **60 s** budget → timeout/freeze. A **geometry-payload cliff**, not feature count (200) and not client render. `server/dhis2/goal4_geojson/fetch_geojson.ts`, `server/routes/instance/geojson_maps.ts:262+`.
  - **Fix direction (not yet implemented):** the analyze/matching step needs only feature *properties*, not geometry — fetch properties-only (instant), pull full geometry only at *save* (longer timeout + progress), optionally simplify polygons before storing. Real refactor, not a one-liner. *Interim option: bump the fetch/route timeout.* **Settled plans (both DRAFT, report-only):** [PLAN_GEOJSON_NEAR_TERM.md](PLAN_GEOJSON_NEAR_TERM.md) — ship-now layer-1 fixes that close this bug; [PLAN_GEOJSON_SNAPSHOT.md](PLAN_GEOJSON_SNAPSHOT.md) — durable architecture (geojson as a portable project snapshot, S2). Read near-term first.
- [ ] **HFA viz "no data available" message** — Meghan, Jun 16, screenshot from call. Needs repro.
- [ ] **Nigeria disruptions bar chart not rendering** — disruptions analysis plot isn't showing correctly. Claire downloaded underlying data; Ashley re-flagged May 29 ("back on to-do list").
- [ ] **Nigeria maternal/neonatal discrepancy** — **root cause found** (Jun 8, Tim + Claire: DHIS2 numbers match). Open item is a **decision**: if/when to apply the fix, not a debug.
- [?] **Ghana storage scaling** — platform restored after storage bump (May 18); Solomon flagged that scaling to all regions will keep hitting the cap. Monitor / plan capacity, not an active break.

## 2. Inbox — feature / scoping / engagement (not bugs)

- [ ] **Ethiopia scorecard — next steps + addl functionality** — Ashley, Jun 12 (met Ethiopia team, scorecard setup needs).
- [ ] **HHFA indicator updates** — venterw@who.int (WHO), Jun 12 ⭐. Water/sanitation indicators changed in the inventory + notes; reflect in HFA module/platform.
- [ ] **HFA Sierra Leone integration** — (a) integrate service-specific snapshots (sjiwani draft mapping, Jun 4); (b) survey weights — SL R1 unique IDs + weights + strata sent (vazais, Jun 4). *Relates to HFA wish-list items below.*
- [ ] **Kenya county-level scorecard — questions** — Cara Noonan, May 18 (draft scorecard with Kenya MOH M&E).
- [ ] **PRISM / AOP next steps (Nigeria)** — Rachel (r4d): 36+1 states evidence packs, wants done **this week**; efficiency + AI-cost concerns → possible tooling to streamline evidence-pack generation. Tim to talk to Ashley first (engagement/decision).
- [ ] _(minor)_ **Abuja blog** — comms only: rearrange logos, add FASTR logo, reference Useful Data. Mostly R4D; no platform work.

---

## 3. Wish List "Tim" tab — structured rows

| # | Item | Type | Country | Pri | Effort | Notes |
|---|------|------|---------|-----|--------|-------|
| 1 | Coverage Part 1, Default 1: survey line **black**, "best" line **dashed** (or other way to show on top of its denominator) | Viz | All | High | Med | from Ashley |
| 2 | Add **two levels of replicants** | Func | All | Med | Med | also in brain-dump below |
| 3 | **Asset management**: non-admins upload for own use (e.g. report images), group assets by type/purpose, project-level assets | — | Ghana | — | Med | |
| 4 | **Default footer material**: page numbers, module params, "Generated by FASTR", date range — "fingerprint" idea | — | — | — | Med | |
| 5 | ✅ ~~AA2 "total" row when viewing AA3, same for AA4~~ **DONE** | — | — | — | Quick | All levels work (Nat-in-AA2, AA2-in-AA3, AA3-in-AA4); generic, no AA2 hardcoding |
| 6 | **Scheduled DHIS2 imports** | — | — | — | Hard | blocked on instance→results→project reorg |
| 7 | **Text formatting**: justification (L/R/C), bold/italic for viz captions + footer | — | — | High | Med | PLAN-006 (textAlign) |
| 8 | **Hide a slide** from export/PDF | — | — | — | Med | PLAN-005 (hiddenFromExport) |
| 9 | **Undo / redo** for viz + slides | — | Guinea | — | Hard | needs history stack + state snapshots |
| 10 | **Cascading filters**: admin2 selection restricts admin3 list | — | Ghana | — | Med | PLAN-008 |
| 11 | **Scale viz elements independently** (e.g. data labels alone, not one global scale) | Viz | Nigeria | — | Med | from Rachel |
| 12 | **Targets & baseline benchmarks**: input/pull annual targets, compare reported vs target | Viz | Ethiopia | — | Hard | major new data type/module |
| 13 | **Visualization sorting**: sort indicators/panes/lanes/tiers, not just alphabetical | Viz/Calc | All, Ghana | — | Med | needs custom sort order + UI |

## 4. Wish List "Tim" tab — shorthand brain-dump (grouped)

Tim's quick-jotted list. Grouped thematically; duplicates collapsed. Several may already be done — flagged `[?]`.

**Reports / slides / decks**
- [ ] Long-form reports `[~]` _(reports feature plan active)_
- [ ] Public links
- [ ] AI should be able to start a deck / move content to a deck
- [ ] Markdown legend — in report + slide editor
- [x] ✅ Table download — **DONE on both surfaces**: viz-editor CSV (`visualization_editor_inner.tsx:543`, "data-table-formatted") + dashboard Excel. Shared `getTableExportAoa()`. *(You doubted the editor one — worth a 30s UI check on a table viz.)*

**HFA**
- [ ] HFA in demo instance
- [ ] HFA validate Sierra Leone ↔ _(see inbox SL weights/snapshots)_
- [ ] HFA long / short labels
- [ ] HFA timeseries
- [ ] HFA survey weights ↔ _(vazais sent SL weights)_
- [ ] HFA grouping indicators
- [ ] HFA indicator editor — add "has N time points"

**Scorecards (mostly Nigeria)**
- [ ] Nigeria scorecard — interactive ↔ _(see Ethiopia/Kenya scorecard inbox items)_
- [ ] Scorecard (general)
- [ ] Remove ANC4 / ANC1 <20 wks
- [ ] Adjusted data
- [x] ✅ National + state rows — **DONE** via the generic rollup (same as §3 #5). *Confirm it behaves as wanted in the scorecard view specifically.*
- [ ] Zone, by state
- [ ] "Over time" → really means last two quarters as columns
- [ ] If indicators are columnGroups, colors should still work as normal

**Indicators / calc / modules**
- [ ] Calculated indicators — ID conflict, copy calculated indicators, edit ID
- [ ] Fourth metric for M3
- [ ] Module should warm cache
- [~] ⚠ Capitalise labels — **PARTIAL**: indicator labels auto-capitalised (`lib/types/indicators.ts:183`). **Gap**: disaggregation option values + non-Nigeria admin-area values still shown raw. → decision: capitalise those too?
- [x] ✅ Number format → toNumX — **DONE for viz/tables** (all `get_style_from_po/*` use `getFormatterFunc()`/toNum). Minor non-viz gaps: import tables use `.toLocaleString()` (`_previous_imports.tsx:70-84`); scorecard fallback uses `String()` (`_5_scorecard.ts:103`). Low-pri cleanup.
- [ ] Lighten the colours
- [ ] Date imported (show import date)

**Viz editor**
- [ ] In viz editor — filter by label
- [x] ✅ Download in Excel — **DONE** (dashboard → .xlsx, one sheet per table; `exports/export_dashboard_as_xlsx.ts`).

**Platform / infra**
- [ ] Reorg: instance → results → projects _(unblocks scheduled imports #6)_
- [ ] Landing page
- [ ] Documentation website
- [ ] Annoying pre-flight DHIS2 modal

**Other / follow-ups**
- [ ] **Ashley follow-up bundle**: service-utilization table by month+year (currently year only); DQA scores by month/year; reorder columns in tables; Module 1 code issue in digitization project (no-pairs case); output = facility × indicator × month/year × outlier list for routine DQ improvement
- [ ] Pelotas ICEH
- [ ] Cameroun map error ↔ _(likely = GeoJSON freeze bug, §1)_

---

## 5. Verification results (2026-06-16)

| Item | Verdict | Evidence |
|------|---------|----------|
| Table download — CSV in viz editor | ✅ Done | `visualization_editor_inner.tsx:543-554` & btn `:796` — "data-table-formatted" → `getTableExportAoa()` → `downloadCsv()` |
| Download in Excel — dashboard | ✅ Done | `exports/export_dashboard_as_xlsx.ts`, `download_dashboard_modal.tsx:149` — 1 sheet/table |
| AA total rows (Nat / AA2 / AA3 / AA4) | ✅ Done | generic, no AA2 hardcoding — `lib/admin_area_rollup.ts`, `get_fetch_config_from_po.ts:314`, `server/server_only_funcs_presentation_objects/query_helpers.ts:51` |
| Number format → toNumX | ✅ Done (viz) | all `get_style_from_po/*` via `getFormatterFunc()`; tiny non-viz gaps only |
| Capitalise labels | ⚠ Partial | indicators auto-capitalised (`lib/types/indicators.ts:183`); disagg-option + non-NG admin values still raw |

**Net: 4 effectively done, 1 partial.** Only remaining work:
- **Capitalise labels** → decision: also capitalise disaggregation-option + admin-area values?
- **toNumX** → optional low-pri cleanup of `_previous_imports.tsx` import tables.

**Re your hint:** the table CSV download *is* wired into the visualization editor (not dashboard-only). Code says done — but since you doubted it, a 30-second UI check on a table viz would settle it.

## 6. Later — other Wish List tabs (stub)

Not pulled today, by request: **New requests**, **Meghan**, **Claire**, **HFA**, and the status-tracked **"immediate" board**. Many overlap with the above (esp. New requests ↔ inbox bugs).

---

## 7. Comms backlog — people to tell (⛔ DO NOT SEND — track only)

Nothing here goes out without Tim's explicit say-so — just a holding list of who to notify when something is confirmed done.

**Ready to send (work confirmed done):**

- **Formatted table download** (CSV per table viz + Excel per dashboard) → **Angelica** (cc Meghan). Her CIV-workshop wishlist item. First check it wasn't already announced when it shipped ~Jun 10.

**Queued — send when the matching §1 fix lands:**

- **Ethiopia report download** → Angelica (cc Meghan, Ashley, Nick). **Fixed in code (pending deploy)** — cause was a JPEG logo; after the deploy she needs to do nothing. If she needs it *before* the deploy: re-save the deck logo as PNG. Time-sensitive — workshop Jun 24–26.
- **GeoJSON import freeze (Cameroon/DRC)** → Angelica. She has creds for retest; loop her in to re-verify.
- **HFA "no data available"** → Meghan. From her Jun 16 call screenshot.
- **Nigeria disruptions bar chart** → Claire + Ashley. Both flagged it.
- **Nigeria maternal/neonatal** → Josh, Rachel, Ashley, Claire. Decision first, then communicate the outcome to the group.

## 8. Wish List Tracker — updates to make in Drive (⛔ track only; Tim edits the sheet)

I can read the Drive sheet but won't edit it. Changes to make manually (all in the **"Tim" tab** unless noted):

**Mark Complete? = TRUE / Status = Done:**

- AA2 "total" row when viewing AA3 (+ AA4) — done at all levels
- Number format → toNumX — done for viz/tables
- "National + state rows" (brain-dump) — done via rollup *(confirm scorecard view first)*

**Update the note (not fully done):**

- Capitalise labels → "PARTIAL: indicator labels auto-capitalised; disaggregation-option + non-Nigeria admin-area values still raw — decision pending"

**Cross-tab (other tabs, when you get to them):**

- "New requests" / CIV item **"Download formatted table (pivot tables)"** (Angelica) → mark Done — same feature as the verified table/Excel export
- "New requests" item **"Ethiopia report downloader not working"** (High) → fix implemented + typechecked, pending deploy/verify; root cause = JPEG deck logo

> Running "cleared" log lives in **§5** (verification results). Add new clears there as we work through §1.

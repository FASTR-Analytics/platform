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

- [~] 🔥 **#1 — Nigeria AOP state decks: AI slide creation MOSTLY UNBLOCKED** — Claire, Jun 16 (direct). Project **"Nigeria General Project"**, folder **"state evidence packs"**; country prompt *"Annual Operating Plan (AOP) performance review slide deck by State"*. AI builds deck structure fine. Originally **every chart/timeseries slide failed to write**. Tied to Rachel's 36+1-state evidence-pack push (this week). **Status (Jun 17): chart/timeseries slides ✅ fixed & deployed (a); DQ-table slide (b) suspected resolved — can't replicate, confirming with Claire. Likely fully unblocked, pending her confirmation.** Two distinct errors:
  - **(a) `period_id` — "expected string, received number". ✅ FIXED & DEPLOYED (v1.53.0 — commits `77bf9e94`, `6d53790e`).** Root cause: the `figureBundleSchema.items` contract was added (Zod hardening) as all-string `z.record(z.string(), z.string())`, but item rows are natural SQL primitives (`period_id`/counts = number, text = string, missing = null) — and renderers coerce at use. **Fix = relax the schema to the honest contract** (`z.union([z.string(), z.number(), z.null()])`, matching panther's `JsonArrayItem`) — *not* stringify the data. Pure validation, no transform, no migration, no cache bump. Also de-lied one consumer (`build_figure_inputs.ts` `displayedIndicatorsAllPercent`). Unblocks all chart/timeseries slides **and** the MASTER-replicant approach.
  - **(b) `valueLabelReplacements has null key`** — "invalid key in record" on **slide 14** (completeness/outliers DQ tables). ⬅ **SUSPECTED RESOLVED — can't replicate (Jun 17); confirming with Claire.** Not deliberately fixed: schema is still `z.record(z.string(), z.string())` at [lib/types/_figure_bundle.ts:55](lib/types/_figure_bundle.ts#L55) (the (a) fix touched `items`, a different field) — but the original repro no longer reproduces, possibly incidental to the (a)/JsonArrayItem deploy. **Keep on the list until Claire confirms.**
  - **Likely cause (to confirm):** Zod boundary-validation mismatch in the AI slide-creation tool path (smells like the ~Jun 12–13 hardening — a too-strict `z.string()` rejecting real stored data; cf. the nanoid `z.uuid()` lesson). See DOC_AI_TOOL_SCHEMAS.md. Claire shipped 5 placeholder decks (ABIA/ANAMBRA/EBONYI/ENUGU/IMO) as a stopgap.
- [x] ✅ **Ethiopia report download — FIXED & DEPLOYED** ↔ — `MOH 10-month performance report`, Ethiopia instance. Angelica (r4d), first raised Jun 10, **chased Jun 15, time-sensitive** (Ethiopia team at workshop, Jun 24–26). cc Meghan, Ashley, Nick. *Also in Wish List "New requests" tab, marked High.*
  - **Root cause (confirmed via DB):** the deck's cover+footer logo `MOH White.jpeg` is a JPEG; the deck exporter embedded it as PNG → jsPDF's PNG decoder threw *"wrong PNG signature"* on slide 1 (the cover). Renders fine in-app (browser decodes JPEG); only fails at export.
  - **Fix DEPLOYED (v1.52.0→1.53.2 — panther sync `d483f66e`, placeholder degrade `d3743456`, pdf clip `07bd2bb2`):** panther `pdf_render_context.ts` now embeds the true format / rasterizes blob-backed `<img>` deterministically; plus a visible-placeholder fallback so one bad figure/image degrades in place across dashboards/decks/reports instead of aborting. Live now — no logo change needed. **Tim emailed Angelica (Jun 16) to tell her it's fixed.**
- [~] 🔥 **GeoJSON direct-import freeze** ↔ — platform freezes importing GeoJSON at **admin-3 level**. Reported for **Cameroon** (logins sent May 14: `dhis-minsante-cm.org`, WORLDBANK_YAOUNDE) and **DRC** (May 15, ~100% AA2–AA4 match but won't pull). Credentials available to test. *Matches Wish List "New requests" item; likely = "Cameroun map error" note on Tim tab.* **Angelica: "not urgent."**
  - **Root cause (measured, Cameroon AA3):** the per-level DHIS2 geojson fetch returns **20.4 MB for 200 district polygons** (full-resolution boundaries) and takes **~43 s**; the server then parses it + runs `buildDhis2Context` within a **60 s** budget → timeout/freeze. A **geometry-payload cliff**, not feature count (200) and not client render. `server/dhis2/goal4_geojson/fetch_geojson.ts`, `server/routes/instance/geojson_maps.ts:262+`.
  - **Fix direction (not yet implemented):** the analyze/matching step needs only feature *properties*, not geometry — fetch properties-only (instant), pull full geometry only at *save* (longer timeout + progress), optionally simplify polygons before storing. Real refactor, not a one-liner. *Interim option: bump the fetch/route timeout.* **Settled plans (both DRAFT, report-only):** [PLAN_GEOJSON_NEAR_TERM.md](PLAN_GEOJSON_NEAR_TERM.md) — ship-now layer-1 fixes that close this bug; [PLAN_GEOJSON_SNAPSHOT.md](PLAN_GEOJSON_SNAPSHOT.md) — durable architecture (geojson as a portable project snapshot, S2). Read near-term first.
- [~] **HFA preset preview shows false "No data available"** — Meghan, Jun 16 (screenshot, from call). **Diagnosed + fixed; committed & pushed to main (deploy + browser-verify pending).** Not missing data: in the Create-Visualization wizard (step 2 "Presets"), the preview thumbnail for replicant-driven presets (e.g. HFA "Indicators by time point (per service category)") rendered red "No data available". Root cause: the preview's `fetchPreview` built its fetch config straight from the preset, where `selectedReplicantValue` is `undefined` → [get_fetch_config_from_po.ts:432](lib/get_fetch_config_from_po.ts#L432) filters on the `"UNSELECTED"` sentinel → zero rows. The interactive viz auto-defaults to the first valid replicant; the preview didn't. **Fix (client-only — no schema/module/server):** extracted `resolveDefaultReplicant` (default-to-first policy) in [t2_presentation_objects.ts](client/src/state/project/t2_presentation_objects.ts), now shared by the PO-items generator + the preset preview. AI-slide path (intentional throw-on-unset) and dashboard/selector paths left untouched. Checked against DOC_STATE_* (Variant-A T2 composition, no new cache/version key, helper returns a fresh config copy — never mutates the live store). Affects **all** replicant-driven preset previews, not just HFA.
  - **Follow-on (editor consistency — A+reconcile, typechecked):** the editor rendered the auto-resolved replicant from the fetch copy, but its draft (`tempConfig`) + selector stayed unset, and every filter/disagg edit blind-reset the pick → user had to re-pick each time. Fix: (1) **commit-back** — the editor writes the resolved replicant into `tempConfig` after each fetch ([visualization_editor_inner.tsx](client/src/components/visualization/visualization_editor_inner.tsx), guarded on inequality, settles in one cache-hit fetch); (2) **reconcile** — removed the 6 blind `selectedReplicantValue → undefined` resets in `_2_filters.tsx`/`_3_disaggregation.tsx`, letting `resolveDefaultReplicant` (keep-if-valid-else-first) be the single verification on every config change. Now selector + chart + saved config agree, and a still-valid pick survives a filter change instead of being discarded. Confirmed safe: server `getPossibleValues` strips the replicant-column filter ([get_possible_values.ts:44-46](server/server_only_funcs_presentation_objects/get_possible_values.ts#L44-L46)), so the valid set is correct even when the current pick is stale. **Adversarially reviewed (2 independent agents, converged):** HIGH `needsSave`-on-open (blocked download/duplicate/rename on default replicant presets) → FIXED via a one-shot suppress flag so the programmatic commit-back doesn't mark the viz dirty; LOW duplicate replicant-options query → FIXED (helper now builds its options fetch-config with `excludeReplicantFilter: true`, sharing the selector's cache + making the round-2 query a hit). MED brief loading-flash on first open = known, deferred (cache-hit flicker). **Browser-verify still pending.**
- [~] **Nigeria disruptions bar chart — misleading default "expected" series** — Claire fwd May 21, Ashley re-flagged May 29 (*"address before the Addis workshop"*). **Diagnosed (not a render bug):** the 4 actual-vs-expected metrics (m3-02-01, m3-03-01, m3-04-01, m3-05-01) default the 2nd series to `count_expected_if_above_diff_threshold` = `ifelse(|diff%|>10, count_expect_sum, count_sum)` → equals **actual** wherever there's no disruption, so actual==expected on every non-disrupted bar (Nigeria national + 5/6 zones flat; only South East shows a gap). Labeled "Expected service volume," which misleads. True always-on expected (`count_expect_sum`) exists in every results object, unused by the default. **Scope: module-definition only (`wb-fastr-modules/m003/_metrics/*.ts` → `deno task build`), NO app code.** Options: (1) default to `count_expect_sum`; (2) relabel the thresholded series; (3) new metric for clean actual-vs-expected, keep thresholded one. ⚠ `valueProps` is baked into the installed metric copy per project DB ([server/db/project/modules.ts:174](server/db/project/modules.ts#L174)) → a def change fixes only NEW installs; existing Nigeria decks need a module update / PO regen separately. Ashley's 2nd point (zonal totals ≠ national) = **methods** (regression runs per admin level), Claire's domain, not this fix. **⏸ PARKED — Tim to handle as a separate module-def change.**
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

**✅ Already sent:**

- **Ethiopia report download** → Angelica (Jun 16) — told her it's fixed (now deployed, v1.52–1.53). ✔ Only email sent so far.

**Ready to send (work confirmed done):**

- **Formatted table download** (CSV per table viz + Excel per dashboard) → **Angelica** (cc Meghan). Her CIV-workshop wishlist item. First check it wasn't already announced when it shipped ~Jun 10.

**Queued — send when the matching §1 fix lands:**

- **Nigeria AOP decks (#1)** → Claire. Tell her once (b) slide-14 lands that full chart/timeseries deck generation works; (a) is already live so most slides should write now.
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
- "New requests" item **"Ethiopia report downloader not working"** (High) → **FIXED & DEPLOYED** (v1.52–1.53; root cause = JPEG deck logo) → mark Done. *(Angelica already notified Jun 16.)*

> Running "cleared" log lives in **§5** (verification results). Add new clears there as we work through §1.

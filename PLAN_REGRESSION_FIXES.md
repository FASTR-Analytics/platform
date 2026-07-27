# PLAN: Regression fixes from the 2026-07-27 review sweep

A review sweep of the week's commits (`32efc9bc..HEAD`, 2026-07-20 → 2026-07-27)
found 12 introduced regressions. Every finding below was adversarially verified:
the failure path was traced at HEAD, and most were reproduced by executing the
real code (deno harnesses against lib functions, Solid's client build, and
read-only queries against dev Postgres). Typecheck passes at HEAD — none of
these are compile errors.

Fix in the order listed. Items 2–4 landed AFTER the v1.61.2 deploy (2026-07-23)
and are not yet in production — they gate the next deploy. Everything else is
live in v1.61.x.

General rules for the fixes:

- Verify by executing, not by reading (CLAUDE.md): a ten-line harness run with
  `deno run --allow-all -c deno.json` settles behavior questions.
- Run `deno task typecheck` after each fix; run `./validate_queries` for
  anything touching the viz query path (items 1, 9).
- Check `git status` before staging — expect parallel workstreams.

---

## 1. Scorecard colors and per-indicator table formatting broken (HIGH, live)

**File:** `client/src/generate_visualization/get_style_from_po/_0_common.ts:169`
**Introduced:** f8408d26 (deployed v1.61.2)

`getIndicatorMetaForCell` short-circuits to
`metadataById.get(effectiveValueProps[0])` whenever there is exactly one
effective value prop, with no fallback to the col/row header ids. But long-format
metrics have `valueProps = ["value"]` with the indicator on a disaggregation
axis, and `indicatorMetadata` is keyed by the AXIS ids
(`server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`) —
nothing is ever keyed `"value"`, so the lookup returns undefined.

**Confirmed failure:** every m8-01-01 scorecard cell loses its
green/yellow/red threshold background and renders the raw value
(`String(info.value)`, e.g. "0.4531"); m10 HFA tables mixing percent- and
count-measure indicators format every cell with the metric-level `formatAs`
instead of per-indicator.

**Fix direction:** restore the col/row-header fallback in the single-prop
branch: `metadataById.get(valueProp) ?? metadataById.get(colHeader.id) ??
metadataById.get(rowHeader.id)` (match the >1 branch's semantics). Verify with
an m8 scorecard and an m10 mixed-measure table.

## 2. `po_detail` cache prefix not bumped for new `datasetFamily` field (MED, deploy gate)

**File:** `server/routes/caches/visualizations.ts:48`
**Introduced:** eac81c66 (not yet deployed)

eac81c66 added `resultsValue.datasetFamily` to the PresentationObjectDetail
payload (via `server/db/project/metric_enricher.ts`) and the client gates the
new "Show sample sizes (n)" toggle on it
(`presentation_object_editor_panel_style.tsx`). The `_PO_DETAIL_CACHE` prefix is
still `"po_detail_v2"` and its versionHash is only the PO row's `last_updated` —
the PO_CACHE_VERSION 6→7 bump in the same commit does not cover this cache.
Valkey persists across deploys, so pre-existing HFA vizs would serve old-shape
payloads and the toggle never appears (this is the CLAUDE.md cache-shape rule;
the `v2` suffix exists from the identical `hasFacilityLevelRows` incident).

**Fix direction:** bump the prefix to `"po_detail_v3"`. One line. Must land
before the next deploy.

## 3. Reserved-varName validation locks existing HFA indicators out of edits (MED, deploy gate)

**File:** `lib/api-routes/instance/hfa_indicators.ts:36`
**Introduced:** cad05b2c (not yet deployed)

`hfaVarNameSchema` (shape regex + `isReservedHfaVarName` refine) is now applied
to `indicator.varName` on `updateHfaIndicator`, `updateHfaIndicatorsBulk`,
`saveHfaIndicatorFull`, and `importHfaIndicatorsWorkbook`, with no bypass when
the name is unchanged. The reserved set is much broader than before (previously
only `weight`, only at staging): `facility_*`/`admin_area_*`/`time_point*`
prefixes, R keywords/functions (`sum`, `mean`, `all`, `any`, `c`, `round`, …),
`and`/`or` any case, `*__status`. Executed harness confirmed: a label-only edit
of an existing indicator named `facility_readiness` is rejected 400 by all four
routes. Both editors made varName read-only in the same window, so affected
indicators become permanently uneditable, and one bad name fails a whole
bulk/import/AI-categorize batch atomically.

**Fix direction:** validate the reserved-set rule only for NEW names — accept an
unchanged existing varName (e.g. validate against the stored row in the handler,
or carry `oldVarName` in the body and relax the schema refine to shape-only,
enforcing reservations in the handler when `varName !== oldVarName`). Creation
paths keep the full check. Decide and keep ONE authoritative place for the rule.

## 4. Migration 064 weekly anchor can skip a never-fired schedule's first occurrence (LOW, deploy gate)

**File:** `server/db/migrations/instance/064_schedule_recurrence.sql:24`
**Introduced:** 290fac85 (not yet deployed to production)

For never-fired legacy weekly rows, 064 sets the anchor to the first matching
weekday ON/AFTER `armed_at`'s wall date. If the row was armed on the schedule's
own weekday at a time after `start_time`, the anchor's cycle-0 occurrence
precedes `armed_at`, and the new scheduler's floor
(`scheduler.ts` `decideScheduleFire`: occurrence < armedAt → `none`, not
`missed`) suppresses it — first fire lands a full `everyNWeeks` interval late
(1–3 weeks for the old UI's 2/4-week options) with no missed/attention signal.

**Fix direction:** anchor never-fired rows to the first occurrence whose
`start_time` datetime is ≥ `armed_at` (not the weekday date). NOTE: 064 has
already auto-run on any dev instance started since 07-25 — check
PROTOCOL_APP_MIGRATIONS.md before editing the file in place vs. adding a
follow-up migration; production has NOT run it, which is what matters most.
Verify with a harness over the arming-day/time permutations.

## 5. Stale localStorage `projectTab` breaks project mount (MED, live)

**File:** `client/src/components/project/index.tsx:64`
**Introduced:** 186be90f

`AIContextSync` calls
`projectAIViewController.setView(PROJECT_TAB_TO_VIEW[projectTab()])`.
`projectTab` is seeded from an unvalidated localStorage cast
(`client/src/state/t4_ui.ts:26`). Deployed v1.7.x (Feb 2026) stored
`"whiteboard"` (then the default tab) and `"chatbot"` under the same key; for
those, the map yields undefined and panther's `setView` throws. Reproduced
against the client's installed Solid build: an exception in a mount-flush effect
skips ALL subsequently-created effects — the project page loads with no data/SSE
wiring, on every visit, until the user clicks a valid tab. There is no
ErrorBoundary in the client.

**Fix direction:** validate at the source — sanitize the localStorage read in
`t4_ui.ts` against the current TabOption set (fall back to the default tab),
and/or guard the map lookup (`const v = PROJECT_TAB_TO_VIEW[tab]; if (v)
setView(v)`). Fixing the seed is the root fix; the guard is cheap insurance.

## 6. `isValidCount` digits-only rewrite rejects previously-valid HMIS counts (MED, live)

**File:** `lib/table_structures/dataset_hmis_validation.ts:55`
**Introduced:** caedb99c (landed via the collab merge dda6d6e1)

`isValidCount` went from `Number()`-based validation to `/^\d+$/`. The staging
worker embeds the cleaned count string unquoted in the INSERT tuple and Postgres
assignment-casts numeric literals into the INTEGER column (verified read-only on
dev Postgres: `123.0`, `1e3`, `+5` all insert fine). So integer-valued
decimal/exponent forms that imported completely under v1.59 — notably
Excel-style float-formatted count columns (`"123.0"`) — now fail every row:
whole file reported invalid, 0 rows staged. The rewrite's actual goal
(stop `1e300` / 20-digit values from aborting the batch with SQL errors) is
legitimate; the overshoot is the bug.

**Fix direction:** accept integer-valued numeric forms — parse with `Number()`,
require `Number.isInteger(n) && n >= 0 && n <= 2147483647`, then stage the
normalized integer (normalizing also removes the unquoted-literal reliance).
Keep rejecting genuine garbage. Add/extend a harness over the forms:
`"123"`, `"123.0"`, `"12.5"`, `"1e3"`, `"1e300"`, `"+5"`, `"-1"`, 20-digit.

## 7. Batch period-filter update hard-fails when selection contains a default viz (MED, live)

**File:** `server/db/project/presentation_objects.ts:442`
**Introduced:** 1b4ec928 (via collab merge)

`batchUpdatePresentationObjectsPeriodFilter` now returns
`{success:false, err:"You cannot update a default visualization"}` if ANY batch
id is a default — all-or-nothing, where pre-window the batch applied to all.
The client wasn't updated: "Edit common properties…" is offered on every
multi-selection (including the Defaults group and mixed selections), passing all
ids through. Worse ordering bug: the route
(`server/routes/project/presentation_objects.ts:347-366`) applies the filter to
POs with live collab rooms BEFORE the batch DB call, so a mixed batch partially
applies (room-backed POs updated and checkpointed) and then reports an error.

**Fix direction:** decide the policy first (single-PO update has long had the
same guard, so the guard itself is likely intended): most consistent is to make
the batch skip defaults and update the rest (return skipped ids), and/or filter
default ids out client-side before calling. Either way the route must apply
live-room updates and the DB batch under the SAME id set decided AFTER the
guard — no partial application with an error.

## 8. TEMP Shift+N dark-mode hotkey shipped to production (MED, live)

**File:** `client/src/state/t4_ui.ts:272`
**Introduced:** d2669af0

Module-scope document keydown listener, comment: "TEMP — dark-mode testing
only, remove before release: Shift+N toggles the theme." It shipped in v1.61.2.
Fires whenever focus is not in a text input; persists the flip via localStorage.
Dark mode has a real toggle in the profile modal.

**Fix direction:** delete the listener block (`t4_ui.ts:269-285`). Trivial.

## 9. Single-district maps render all-gray (`singleValueDims` drops mapArea) (LOW, live)

**File:** `lib/normalize_po_config.ts:96`
**Introduced:** a4b9722a (refined by b3ed24d5 this week)

`getEffectivePOConfig`'s `single_value` drop rule exempts only replicant slots.
When a map's items contain exactly one distinct value for the mapArea dimension
(project data covers one district, no `__BLANK` group), the mapArea
disaggregator is dropped, `getDisaggregatorDisplayProp(...,["mapArea"],...)`
returns undefined, and `get_data_config_for_map.ts` falls back to the wrong
areaProp (`admin_area_2` for an `admin_area_3` map) — every feature misses the
value map and the whole map renders no-data gray. Executed against the real lib
functions; a two-district control keeps the dim.

**Fix direction:** exempt the mapArea slot from the single-value drop, exactly
like replicant slots (a map with one colored district is correct output, and
dropping the dim changes which prop the items are keyed by). Add a query-rig /
harness case. Display-slot semantics: SYSTEM_09.

## 10. Filters panel hides stored filters on single-valued dimensions (LOW, live)

**File:** `client/src/components/visualization/presentation_object_editor_panel_data.tsx:68`
**Introduced:** via collab merge (a4b9722a lineage)

`allowedFilterOptions().filter((o) => !p.singleValueDims.has(o.value))` removes
the DisaggregationFilter row entirely — including when the stored config already
carries a `filterBy` entry for that dim. The hidden filter still applies to
every fetch (`getFiltersWithReplicant` reads `config.d.filterBy` directly), so a
stale filter that matches nothing produces "no data" with no visible way to
discover or clear it.

**Fix direction:** keep suppressing the row only when the dim has no stored
`filterBy` entry; if `config.d.filterBy` references the dim, render the row
(checkbox + chips) so it can be cleared.

## 11. Presenter loading text frozen to English (LOW, live)

**File:** `client/src/components/slide_deck/slide_presenter.tsx:27`
**Introduced:** ba11be5c

`const LOADING_MSG = t3({...})` at module scope. panther's `t3()` resolves
eagerly against a global language that is only set during component render, and
the file is statically imported from the route tree, so the const resolves at
bundle-eval time with `"en"`. On fr/pt instances the loading placeholder shows
"Loading..." while everything else in the presenter is localized.

**Fix direction:** resolve at use — inline `t3({...})` at the two use sites
(line ~76 cached placeholder, line ~277 visible pane), or make it a function.
Grep the client for other module-scope `t3(` calls while there.

## 12. Slide-deck email: strict server validation not mirrored client-side (LOW, live)

**File:** `lib/api-routes/project/emails.ts:9`
**Introduced:** 1b4ec928 (via collab merge)

`recipients` tightened from `z.array(z.string())` to
`z.array(z.email()).min(1).max(50)`. The only caller
(`client/src/components/slide_deck/share_slide_deck.tsx`) still builds
recipients from an unvalidated free-text split plus an unbounded multi-select.
Route-level Zod rejection returns a generic failure with no `failedRecipients`,
so one malformed typed address (or >50 selections) → full PDF export runs,
nothing is sent to anyone, user sees only "Failed to send". Pre-window the
per-recipient loop delivered to valid addresses and reported the failures.

**Fix direction:** validate client-side before sending — email-shape check on
the parsed textarea entries (flag the offending entry inline) and enforce the
50-recipient cap in the UI. Server schema stays as the backstop.

---

Full verification traces (verifier reasoning, introducing-commit evidence,
harness outputs) are in the sweep workflow journal:
`~/.claude/projects/-Users-timroberton-projects-apps-wb-fastr/44f428d3-2ff4-4dc0-b4bc-90fa4705b9e0/subagents/workflows/wf_6a611709-6ce/journal.jsonl`.

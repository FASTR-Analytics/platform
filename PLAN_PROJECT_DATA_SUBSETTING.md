# Plan: Project-level data subsetting

**Status: not started, depends on
[PLAN_FULL_CAPTURE_GENERATION.md](PLAN_FULL_CAPTURE_GENERATION.md).** Written
2026-08-03.

**Ruling (Tim, 2026-08-03):** once packages always carry full data (period
range, indicators, admin areas, facility types/ownerships, HFA service
categories — see the companion plan), a project should be able to subset
what it queries from its attached package, without needing a
differently-windowed package generated for it. This is the second half of
replacing generation-time windowing.

This plan is explicitly a UX/scope nicety layered on top of the
correctness-critical full-capture change, not a precondition for it — it can
ship as a fast-follow. Every project can keep working unmodified (seeing the
whole package) until this lands.

## Priority (Tim, 2026-08-03)

The subsettable dimensions, in order:

1. **Admin Area 2 vs National — the main issue.** A project needs to scope
   its view of the package to a single Admin Area 2 (a sub-national region)
   or to the national/all-areas view. This is the dimension that actually
   matters; build and ship this first, end to end (storage → UI → query
   enforcement → caching), before touching the others.
2. **Indicators — second priority.** Restricting which indicators a project
   sees out of the full package.
3. **Time (period) — third priority, "may also be good to have."** Lower
   urgency than the above two; fine to defer to a later pass once 1 and 2 are
   working.

**Out of scope for this plan**: facility type/ownership subsetting and HFA
service-category subsetting. The query layer already supports both as
filter columns (see below) so nothing is precluded, but neither was
requested — don't build UI or storage for them unless asked.

## Current state (verified 2026-08-03) — there is no existing prior art

- `projects.run_id` is a plain nullable `text` FK, no accompanying
  settings/filter/JSON column anywhere (`server/db/instance/_main_database.sql:57-67`;
  confirmed against every `ALTER TABLE projects ADD COLUMN` migration — only
  `status`, `deletion_scheduled_at`, `is_central_reporting`, `run_id` exist).
- Attach route (`attachResultsPackage`,
  `server/routes/project/results_package.ts:86-103` →
  `attachRunToProject`, `server/runs/attach_run.ts:79-102` →
  `setProjectAttachedRun`) does a bare `UPDATE projects SET run_id = ...`.
  No filter/scope object is read, written, or threaded anywhere in this path.
- Client attach picker (`client/src/components/project/project_results_package.tsx`)
  is a flat list with a single "Use this package" action — no subset UI.
- **Conclusion: this is genuinely new territory**, not an extension of
  something half-built. The one directly reusable asset is
  `WindowingSelector.tsx` (`client/src/components/WindowingSelector.tsx`),
  already parameterized over exactly the shape needed
  (`DatasetHmisWindowingCommon`, `lib/types/dataset_hmis.ts:27-59`) — though
  it may need renaming/generalizing since it stops being about "windowing a
  dataset" and becomes "subsetting a project's view of a package."

## The query layer already speaks the vocabulary this needs

This is the strongest finding from investigation, and the reason this is
tractable without inventing a new query mechanism:

- Every project read resolves `projects.run_id` → `getRunManifestCached(runId)`
  → a `RunReadContext` (`server/run_query/run_read.ts:97-127`), then executes
  DuckDB SQL directly over `outputs/<moduleId>/<roId>.parquet` and
  `inputs/facilities_hmis|hfa.parquet` — never a live Postgres probe.
- `GenericLongFormFetchConfig.filters` (`{disOpt, values}[]`,
  `lib/types/presentation_objects.ts:399`) already compiles to SQL via
  `buildWhereClause` (`server/server_only_funcs_presentation_objects/query_helpers.ts`),
  shared identically by the pg-parity path and the run/DuckDB path through
  `getPresentationObjectItemsCore`
  (`server/server_only_funcs_presentation_objects/get_presentation_object_items.ts:91-238`).
  `admin_area_2` and `indicator_common_id` — the two priority dimensions —
  are both already valid `disOpt` filter columns, same as
  `facility_type`/`facility_ownership`/`admin_area_3..4`/`hfa_service_category`
  (out of scope here, but available the same way if priorities change later).
  Admin-area filters are split out via `computeFacilityContext`
  (`get_query_context.ts:35-83`) and joined through the `facility_subset` CTE
  (`cte_manager.ts:82-92`).
- There's existing precedent for silently injecting an extra filter into
  every fetch config: `getFiltersWithReplicant`
  (`lib/get_fetch_config_from_po.ts:446-453`) appends a pinned replicant
  filter onto the caller's own `filterBy`, deliberately excluded
  (`excludeReplicantFilter`) for options/possible-values queries. A
  project-level subset filter is the same shape of problem.
- Period scoping has a parallel two-tier mechanism: `PeriodFilter`
  (`RelativePeriodFilter | BoundedPeriodFilter`) resolved server-side by
  `getPeriodFilterExactBounds` (`lib/get_fetch_config_from_po.ts:112`) against
  live data bounds (`getPeriodBoundsCore`,
  `server/server_only_funcs_presentation_objects/get_period_bounds.ts`). A
  project-level default period window would AND into the same bounds
  resolution inside `getPresentationObjectItemsCore`
  (`get_presentation_object_items.ts:126-163`).

## Proposed shape (not yet ruled — needs investigation/decision)

Build in priority order — Admin Area 2 end-to-end first, then extend the same
plumbing to indicators, then to time. The storage/caching/query-injection
mechanism below is shared across all three dimensions, so phase 1 should
design the shape generally (a small set of optional filter dimensions) even
though only `adminArea2` is populated at first — avoids a schema change to
add indicators/time later.

1. **Storage**: most likely a new column on `projects` (e.g. `data_subset
   jsonb`, nullable = "no subset, see everything"; shape roughly
   `{adminArea2Id?: string, indicatorIds?: string[], periodBounds?: {...}}`,
   all optional so phase 1 only ever populates `adminArea2Id`), since attach
   is already a `projects`-row concept and the "no instance FKs inside run
   files" invariant means this can never live in the package itself. Confirm
   this is right before building — alternative locations (a separate table
   keyed by projectId) are worth a quick comparison if the subset needs its
   own audit/history.
2. **UI — phase 1 (Admin Area 2 vs National)**: a picker for "National" vs a
   single Admin Area 2. **Needs investigation/decision**: is this part of the
   attach flow (set once, at picker time) or a persistent, independently
   editable setting on the project's Results package tab
   (`client/src/components/project/project_results_package.tsx`), editable
   without re-attaching? Tim's framing ("the option to subset data taken into
   projects") leans toward the latter — confirm before building. Whether
   `WindowingSelector.tsx` is worth repurposing for just this one dimension,
   or whether a simple dedicated Admin Area 2 picker is less UI debt than
   adapting a component built for five dimensions — decide once phase 1 scope
   is fixed.
3. **Query-layer enforcement — phase 1**: inject the project's `adminArea2Id`
   (when set) as an extra `filters` entry at the run-read layer —
   `getPresentationObjectItemsFromRun` / `getPossibleValuesFromRun` /
   `getResultsValueInfoFromRun` in `run_read.ts` — before calling into
   `*Core`, following the `getFiltersWithReplicant` precedent. **Needs
   investigation**: whether possible-values/filter-option queries need the
   same `exclude`-style treatment replicant filters get, so a user picking
   filter values still sees the full package's option list or only the
   subset's — this is a real UX decision, not just plumbing (see open items).
   Phase 2/3 extend this same injection point with `indicator_common_id` and
   a period bound respectively.
4. **Caching**: a project's subset changes query results per project, so two
   projects attached to the SAME runId with different subsets must not
   collide in cache. SYSTEM_08 invariant 1 states caches currently fold only
   `runId` into their keys ("the manifest cache parses once per runId with no
   invalidation path... Valkey entries fold runId into their hashes").
   **Needs investigation**: enumerate every runId-keyed cache (manifest
   cache, virtual-defaults cache, Valkey PO caches per SYSTEM_03/SYSTEM_09)
   and add the subset as a second key dimension (e.g. hash of the subset
   config) everywhere runId alone is currently assumed sufficient. Design
   this dimension generally in phase 1 (hash the whole subset object, not
   just `adminArea2Id`) so phases 2/3 don't need a second cache-key change.
5. **Period bounds semantics (phase 3)**: `manifest.datasets[].info` /
   results-object `periodBounds` currently reflect the captured (soon: full)
   data. A project's *effective* bounds under its own subset need to be
   computed at query time, not read verbatim off the manifest. **Needs
   investigation**: whether `getPeriodBoundsCore` / `getRawPeriodBoundsFromRun`
   already support intersecting with an extra filter, or need extending. This
   is the lowest-priority dimension — defer investigation until phases 1/2
   are shipped.
6. **Non-PO consumers of run data**: anything that reads a run's data without
   going through the standard PO query path risks bypassing the subset
   entirely. **Needs investigation**: the AI copilot's tool layer
   (`getSharedToolsForModules`, SYSTEM_13_ai_assistant.md), exports (PDF/PPTX/DOCX),
   and the "queryable run-inputs UI" deferred item in
   PLAN_RESULTS_RUNS.md — each needs to either intersect with the project's
   subset or be an explicit, documented exception. Check against phase 1
   scope (Admin Area 2 only) first; re-check when indicators/time are added.

## Open items (explicitly left for investigation, not yet ruled)

- Exact storage shape/column for a project's subset (design generally across
  all three dimensions even though phase 1 only populates `adminArea2Id`).
- Whether the subset is set once at attach time only, or persistently
  editable afterward independent of re-attaching (this changes the UI
  significantly — confirm with Tim before building).
- Full enumeration of runId-only cache keys that need the subset folded in.
- Whether filter-option/possible-values pickers in the project UI should
  offer only the subset's values or the full package's values.
- Whether currently-windowed legacy packages (pre this-plan) need any
  reconciliation once attach-time subsetting exists, or simply become moot as
  projects regenerate/re-attach to full packages over time.
- Whether facility type/ownership or HFA service-category subsetting get
  added later — out of scope for now (see Priority), but the storage shape
  and query-injection point chosen in phase 1 should not preclude adding them
  the same way if priorities change.

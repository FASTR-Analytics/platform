# Plan: Project-level data subsetting (SUPERSEDED — reference only)

**Status: SECONDARY to
[PLAN_DATA_SUBSETTING_PROJECT_SPECIFIED.md](PLAN_DATA_SUBSETTING_PROJECT_SPECIFIED.md)
— do not implement from this file.** Tim's 2026-08-09 reframing (the AA2
scope is project IDENTITY, set at creation and branded, not a subset
setting on the attachment) replaced this plan's framing, and its phases
2/3 were dropped as likely never needed. This file is kept as the
research/evidence base: the verified-current-state citations, the cache
enumeration, and the level-mismatch findings below remain accurate and
are what the live plan builds on.

Original context: written 2026-08-03; verified, fleshed out and pinned
2026-08-09. The prerequisite (PLAN_FULL_CAPTURE_GENERATION, always-full
package generation) shipped 2026-08-03 and its plan file is deleted —
packages now always carry the full HMIS/HFA capture.

**Ruling (Tim, 2026-08-03):** a project can subset what it queries from its
attached package, without needing a differently-windowed package generated
for it. This is a UX/scope nicety, **not a security boundary** — project
members can already reach the whole package through internals surfaces; the
subset scopes the analytical view.

## Priority (Tim, 2026-08-03)

1. **Admin Area 2 vs National** — build end to end first (storage → UI →
   query enforcement → caching).
2. **Indicators** — second.
3. **Time (period)** — third, fine to defer.

**Out of scope**: facility type/ownership and HFA service-category
subsetting. The mechanism below supports them as filter columns if ever
asked; no UI or storage for them now.

## Verified current state (re-verified 2026-08-09)

- `projects` has no settings/filter/JSON column — only `id`, `label`,
  `ai_context`, `is_locked`, `is_central_reporting`, `status`,
  `deletion_scheduled_at`, `run_id`
  (`server/db/instance/_main_database.sql:57-67`; migrations 007, 021, 041,
  065 are the complete ALTER set; next free migration number is 075).
- Attach is a bare `UPDATE projects SET run_id`
  (`server/routes/project/results_package.ts:86-103` →
  `server/runs/attach_run.ts:79-102` → `setProjectAttachedRun`,
  `server/db/instance/run_generation.ts:413-450`). A second attach path
  exists: `publishReadyRun` (`run_generation.ts:544-568`) from the
  generation pipeline. **There is no detach** anywhere.
- Every project read resolves `projects.run_id` via
  `getRunReadContext(mainDb, projectId)`
  (`server/run_query/run_read.ts:99-129`) → `RunReadContext {runId, runDir,
  manifest}`, then DuckDB SQL over parquet. `getRunReadContext` is called
  per-route (presentation_objects.ts, modules.ts, results_package.ts) — it
  is the single choke point where a per-project subset naturally loads
  (same `projects` row it already SELECTs).
- `GenericLongFormFetchConfig.filters` (`{disOpt, values}[]`,
  `lib/types/presentation_objects.ts:613`) compiles to WHERE via
  `buildWhereClause` (`query_helpers.ts:303`), shared by the pg-parity and
  run paths through `getPresentationObjectItemsCore`
  (`get_presentation_object_items.ts:91-238`). `admin_area_2` and
  `indicator_common_id` are ordinary `DisaggregationOption` filter columns.
  Precedent for silently appending a filter: `getFiltersWithReplicant`
  (`lib/get_fetch_config_from_po.ts:483-499`).
- **Correction to the 2026-08-03 draft**: admin-area filters do NOT go
  through the `facility_subset` CTE. `computeFacilityContext`
  (`get_query_context.ts:35-83`) routes only `facility_*` optional columns
  through the facilities join; admin-area filters are `nonFacilityFilters`
  applied **directly against results-object columns**. So the injected
  filter only bites where the RO parquet physically carries the column —
  see "Level mismatch" below.
- The facilities parquets carry `facility_id` + all four admin areas +
  facility attributes (`PROJECT_FACILITY_COLUMN_NAMES`,
  `server/db/project/datasets_in_project_hmis.ts:69-83`) — the run-local
  source for both the AA2 picker list and the AA2→AA3 mapping.
- `WindowingSelector.tsx` is generic over the `DatasetHmisWindowing` union
  (`lib/types/dataset_hmis.ts:24-60`); its only live caller is the instance
  delete-data tool, passing the Raw variant. **Ruled: do not repurpose it**
  — phase 1 needs a radio (National) + one AA2 select, not a five-dimension
  windowing form.

### Level mismatch: module outputs are split per admin level

Modules emit separate ROs per level (`*_national.csv`, `*_admin_area.csv`,
`*_admin2.csv`, `*_admin3.csv`). Verified in wb-fastr-modules:

- Admin-2-level ROs carry `admin_area_2` → direct filter works.
- **Admin-3-level ROs drop `admin_area_2`** (M6 `script.R:585-588` deletes
  it explicitly; M5 similar) → filtering needs the run's AA3 values for the
  chosen AA2, derived from the facilities parquet.
- National ROs have no admin columns → cannot be scoped.
- M9/ICEH has no admin columns at all (survey data: `strat`/`level`).

**Rulings (2026-08-09, per the make-the-call rule):**

- Where the RO has `admin_area_2`: inject `admin_area_2 = X`.
- Where it has only `admin_area_3`/`admin_area_4`: inject
  `IN (run's child values under X)`, derived per `(runId, family, X)` from
  the family's facilities parquet and memoized (runs are immutable, the
  memo never invalidates). Bare-AA3 name collisions across AA2s are a
  pre-existing property of AA3 filtering today; inherited, not worsened.
- National ROs (and ICEH): **shown unfiltered.** A subset project still
  sees national metrics — inevitable (there is no per-area row to keep) and
  consistent with "the R scripts need full data" from the full-capture
  ruling. Document in SYSTEM_08/09 when landing.

## Phase 1 specification

### 1. Types (lib)

In `lib/types/projects.ts`:

```ts
export const projectDataSubsetSchema = z.object({
  adminArea2: z.string().min(1),
});
export type ProjectDataSubset = z.infer<typeof projectDataSubsetSchema>;

export function hashProjectDataSubset(s: ProjectDataSubset | null): string;
// sorted-keys JSON (hashFacilityColumnsConfig pattern,
// lib/types/instance.ts:205-211); "none" for null. The ONE hash used by
// server cache keys, holder stamps, and the client version key.
```

Phases 2/3 add optional keys (`indicatorCommonIds?`, `periodBounds?`) —
additive Zod extensions, no migration/transform (the stored-JSON
rename/delete hazard covers renames and deletes, not additions).

Threading: `DBProject` (`server/db/instance/_main_database_types.ts:73-82`)
gains `data_subset: string | null`; `ProjectDetail`
(`lib/types/projects.ts:27-52`) and `ProjectState`
(`lib/types/project_sse.ts:20-54`, plus `EMPTY_PROJECT_STATE`) gain
`dataSubset: ProjectDataSubset | null`. `getProjectDetail`
(`server/db/project/projects.ts:54+`) parses the column with
`safeParse` → null on invalid. `build_project_state.ts` copies it into the
SSE `starting` payload (the `starting` reconcile then needs no store work).

The subset is a **persistent, independently editable project setting** —
survives re-attach (an area team stays an area team across package
updates), editable without re-attaching. Attach-time-only was the rejected
alternative.

### 2. Storage

Migration `075_add_project_data_subset.sql`:
`ALTER TABLE projects ADD COLUMN data_subset text;` — same column added to
`_main_database.sql` base schema. Nullable text holding Zod-validated JSON
(the `presentation_objects.config` text-column pattern). NULL = no subset.
No separate table — no audit/history requirement, and attach is already a
projects-row concept.

### 3. Routes

Registry `lib/api-routes/project/projects.ts` (mirror `updateProject` at
:29-35):

```ts
updateProjectDataSubset: route({
  path: "/project/:project_id/data-subset",
  method: "POST",
  params: projectIdParamsSchema,
  body: z.object({ dataSubset: projectDataSubsetSchema.nullable() }),
  requiresProject: true,
}),
```

Server `server/routes/project/project.ts`: guard
`requireProjectPermission({preventAccessToLockedProjects: true},
"can_configure_visualizations")` — the attach guard, **not**
`updateProject`'s `requireAdmin` (the subset is attach-class: it changes
what everyone sees). DB function `updateProjectDataSubset(mainDb,
projectId, subset)` beside `updateProject` in
`server/db/project/projects.ts` — bare UPDATE of the JSON (or NULL). On
success: `notifyProjectDataSubsetChanged(projectId, subset)` (below).
Write-time validation is schema-only — no membership check against the
current run's AA2 list (the subset must survive re-attach to a package
whose list differs; the picker constrains normal entry).

Registry `lib/api-routes/project/results-package.ts`:

```ts
listResultsPackageAdminArea2s: route({
  path: "/project/:project_id/results_package/admin-area-2s",
  method: "GET",
  params: projectIdParamsSchema,
  requiresProject: true,
}),  // response: APIResponseWithData<string[]>
```

Server `server/routes/project/results_package.ts`, guard
`can_configure_visualizations`: `getRunReadContext`, then for each of
`facilities_hmis`/`facilities_hfa` present in `manifest.inputFiles`,
`SELECT DISTINCT admin_area_2 FROM <t> WHERE admin_area_2 IS NOT NULL` via
`executeSqlOverParquet` with a single-view spec
(`runInputFilePath(ctx.runDir, ...)`); union, dedupe on UPPER, sort by
LOWER (matching `dataset_hmis.ts:300-304`). Run-local on purpose — the
instance's live `admin_areas_2` table may have drifted from the attached
immutable package. **Not subset-filtered** (it feeds the picker).

### 4. RunReadContext + injection (server/run_query/run_read.ts)

- `getRunReadContext` extends its SELECT to `run_id, data_subset`;
  `RunReadContext` gains `subset: ProjectDataSubset | null` and
  `subsetHash: string` (from `hashProjectDataSubset`). Every consumer —
  routes, and MCP/AI which dispatch in-process through the same routes —
  inherits from this one load point.
- New helper (co-located in `run_read.ts`, its only consumer):

```ts
async function computeSubsetFilters(
  ctx: RunReadContext,
  ro: RunResultsObject,
): Promise<GenericLongFormFetchConfig["filters"]>
```

Logic: `ctx.subset === null` → `[]`. Else check `ro.columns` names
(manifest stamp, `lib/types/run_manifest.ts:43`):

- has `admin_area_2` → `[{disOpt: "admin_area_2", values: [adminArea2]}]`
- else has `admin_area_3` (then `admin_area_4` analogously) → derive the
  child values: `SELECT DISTINCT admin_area_3 FROM <family facilities
  table> WHERE UPPER(admin_area_2) = UPPER('<escapeSqlString(X)>') AND
  admin_area_3 IS NOT NULL`, family via
  `getDatasetFamilyFromRun(ctx, ro.moduleId)`; no facilities parquet for
  the family (ICEH) → `[]`. **Empty derivation must inject a
  never-matching sentinel value** (e.g. `["__SUBSET_EMPTY__"]`) — an
  empty `values` array is skipped by `buildWhereClause` and would show
  ALL data instead of none.
- else → `[]`.

Memo beside it: `Map<string, string[]>` keyed
  `${runId}|${family}|${UPPER(aa2)}`, FIFO cap ~50 (the
  `manifest_cache.ts:11-43` pattern); export an evict-by-runId called from
  `server/runs/delete_run.ts` beside `evictRunFromManifestCache` (memory
  hygiene, not correctness — runs are immutable).

- Injection sites (all in the FromRun wrappers; the shared Cores and the
  pg-parity path are untouched):
  - `getPresentationObjectItemsFromRun` (:736): compute `subsetFilters`;
    when non-empty, build `effectiveFetchConfig = {...fetchConfig,
    filters: [...fetchConfig.filters, ...subsetFilters]}` and pass it to
    **both** `buildQueryContextFromManifest` (the facility/non-facility
    split happens there) and the Core. After the Core returns a successful
    holder, set `res.data.fetchConfig = fetchConfig` (the caller's
    original) — the echo is the request; the subset rides as `subsetHash`
    (§5). No other holder-`fetchConfig` consumers exist (verified: the two
    client `.fetchConfig` reads are on resolved-replicant objects, not
    holders; the only echo consumer is cache `parseData`).
  - `getPossibleValuesFromRun` (:774): append `subsetFilters` to the
    `filters` param before `buildMinimalFetchConfig`. This automatically
    scopes `getResultsValueInfoFromRun`'s per-dimension possible values
    (:839) and the replicant-options route. **Ruled: option lists are
    subset-scoped** — the project sees the package as if it only contained
    the subset. The `excludeReplicantFilter` mechanism is orthogonal (it
    excludes the PO's own pinned replicant filter, never the subset).
  - `getResultsObjectItemsFromRun` (:854, raw-rows preview in the viz
    editor): build a WHERE via `buildWhereClause({...minimal, filters:
    subsetFilters}, false, undefined, {textColumns: new Set()})` and
    append to the `SELECT *`.
- A PO whose own `filterBy` names a different AA2 ANDs to empty — correct.
  Subset values compare case-insensitively and are escaped like any filter
  value (`buildWhereClause` UPPER + `escapeSqlString`).

### 5. Server caches (server/routes/caches/visualizations.ts)

The three data caches key on runId with **no project dimension** (comment
at :65-68 says so outright) — two projects on one run with different
subsets would serve each other's rows and option lists. And the injection
in §4 happens downstream of the route-level key computation, so without
key changes it would silently poison shared entries.

- Thread `subsetHash` into the holders: add `subsetHash?: string` beside
  `runId` in `ItemsVersionInfo`
  (`get_presentation_object_items.ts:33-39`) and supply it from
  `versionInfoFor(ctx, ...)` (`run_read.ts:725-733`) / `getRunVersionInfo`
  — it then spreads into the items, metric-info, and replicant-options
  holders wherever `...versionInfo` already lands. Add it explicitly to
  `PresentationObjectDetail` (set from `ctx.subsetHash` in
  `getPresentationObjectDetailFromRun`, both real and virtual branches).
  Optional like `runId` (the pg-parity baseline leaves both undefined and
  is never cached).
- Key changes (subset segment **trailing** — `delete_run.ts:61-63` purge
  and `cache_status.ts:61-74` prefix-scan on `${runId}|`/`${runId}::` and
  reverse-parse segment index 1; trailing preserves both):
  - `_PO_ITEMS_CACHE` (:120): uniqueness
    `[runId, roId, hashFetchConfig, subsetHash].join("|")`; route passes
    `runCtx.subsetHash`; `parseData` appends `res.data.subsetHash` and
    refuses to store when it is undefined (same rule as `runId`).
  - `_METRIC_INFO_CACHE` (:156): `[runId, metricId, subsetHash].join("::")`.
  - `_REPLICANT_OPTIONS_CACHE` (:192): append `::subsetHash`.
  - `_PO_DETAIL_CACHE` (:75): uniqueness already projectId-keyed; append
    `|${subsetHash ?? "none"}` to the **version** hash (both compute and
    `parseData` sides) — free insurance for phase 2.
- Bump `PO_CACHE_VERSION` `"13"` → `"14"` (:64) — belt and braces on top
  of the key-shape change (old-shape keys are already unreachable).
- In-process caches: manifest + input-JSON caches are per-run — safe;
  **never mutate the shared manifest object per project**. Virtual-defaults
  cache (runId-keyed) safe in phase 1; revisit at phase 2. DuckDB creates a
  fresh instance per query — nothing to do.
- MCP context cache: `invalidateProjectContext` requires the principal
  token, so no projectId-only sweep exists — **ruled: accept the 30s TTL**
  (`context_cache.ts:41`, "purely performance — correctness never depends
  on it"; SPA attach doesn't invalidate it either, same precedent). Data
  tools dispatch through routes per-call and get the subset immediately;
  only the cached catalog can be ≤30s stale, and phase 1 doesn't change
  the catalog.

### 6. SSE + client caches

- Notify (mirror `notifyProjectRunAttached`,
  `server/task_management/notify_project_v2.ts:141-146`):
  `notifyProjectDataSubsetChanged(projectId, dataSubset)` sending
  `{type: "data_subset_changed", data: {dataSubset}}`; add the union
  member in `lib/types/project_sse.ts` and a `t1_store.ts` case:
  `setProjectState("dataSubset", msg.data.dataSubset)`.
- `runVersionKey` (`t1_store.ts:186-188`) becomes:

```ts
return `${pds.attachedRunId ?? "no_run_attached"}~${hashProjectDataSubset(pds.dataSubset)}`;
```

  **`~` separator, not `|`** — the client `po_detail` version guard slices
  at `version.lastIndexOf("|") + 1` (`t2_presentation_objects.ts:71`) and
  must keep receiving the whole run+subset token as one trailing segment.
- **Guard trap (verified):** `responseRunIdMatches` (`t1_store.ts:196-201`)
  compares the holder's bare `runId` against the full version-key string —
  with the composite key it would reject every response and nothing would
  ever be cached. Replace with:

```ts
export function responseRunVersionMatches(
  data: { runId?: string; subsetHash?: string },
  runKey: string,
): boolean {
  return data.runId !== undefined && data.subsetHash !== undefined &&
    `${data.runId}~${data.subsetHash}` === runKey;
}
```

Update all four call sites (`t2_presentation_objects.ts:42-43, 70-71,
89-90`; `t2_replicant_options.ts:33-34`). The undefined checks keep the
parity-baseline never-cache rule. This also closes the in-flight race a
subset change opens (same race attach has today). Old IndexedDB entries
become unreachable via the version flip and age out — no purge, the
mechanism attach already relies on. `clear_caches.ts` prefix strings are
uniqueness-based and unaffected.

### 7. UI (client/src/components/project/project_results_package.tsx)

New `DataScopeSection` component in the same file, rendered inside
`AttachedPackageCard` (:275-299) between `ResultsPackageProvenanceLine`
and `ResultsPackageContents`; parent passes `canEdit` = the existing
`canAttach()` gate.

- Current value read live from `projectState.dataSubset` (arrives via
  `starting` and `data_subset_changed`).
- Editors: radio **National (all areas)** / **Single Admin Area 2** with a
  select fed by `serverActions.listResultsPackageAdminArea2s`
  (StateHolder-wrapped fetch on mount), save via `createButtonAction` →
  `serverActions.updateProjectDataSubset` (send `null` for National);
  disabled while `projectState.isLocked`. No optimistic write — the SSE
  round-trip updates the store, as attach does.
- Non-editors: the active scope as a read-only line.
- Stale-scope flag: if `projectState.dataSubset?.adminArea2` is not in the
  fetched list (UPPER compare), show a warning line ("this area is not in
  the attached package") — never silently clear.
- All strings `t3` with en/fr/pt.

### 8. Docs + cleanup

- SYSTEM_08: the subset concept; rulings — internals exception,
  national/ICEH ROs unfiltered, frozen-bundle behavior, run-local picker
  list, 30s MCP catalog staleness.
- SYSTEM_09: the injection point (wrapper-level, above the Cores), the
  AA2→AA3 derivation, cache-key shape + `PO_CACHE_VERSION` bump.
- SYSTEM_03: `data_subset_changed` in the notify catalog; the composite
  `runVersionKey`.
- Delete in passing: `server/db/project/results_objects.ts:9-23`, the
  legacy unrouted Postgres raw-rows reader (dead code that could be
  re-wired around the subset).

### Surfaces that bypass the injection (enumerated 2026-08-09, ruled)

- **Package internals** — module script, logs, file list, raw CSV download
  (`server/routes/project/results_package.ts:111-236`,
  `server/runs/package_internals.ts`): **documented exception.** They show
  the package as-is, are separately permission-gated
  (`can_view_script_code`/`can_view_logs`/`can_view_data`), and raw R
  outputs are not query-filterable. Consistent with "not a security
  boundary".
- **Stored FigureBundles** (slides/dashboards/reports,
  `lib/types/_figure_bundle.ts:109-124`) and the **public dashboard**
  route that serves them (`server/routes/public/dashboard.ts`): **no
  sweep.** Bundles are deliberately frozen (FigureBundle P2 design) and
  already go stale across re-attach the same way; the subset takes effect
  when a figure is re-resolved at authoring time. Same model, documented.
- **Manifest catalogs** (module summaries, metrics list, datasets tab,
  indicator/taxonomy lists, `run_read.ts:320-451`): unaffected by an AA2
  subset (they enumerate metrics/indicators, not areas). Becomes the real
  work of **phase 2**.
- **Relative period anchoring** (`getRawPeriodBoundsFromRun` manifest
  stamp, used by the replicant-options route and
  `ResultsValueInfo.periodBounds`): anchors to package-wide bounds, not
  subset bounds. Accepted for phase 1 (an area subset rarely changes time
  coverage); becomes real in **phase 3**.
- **AI/MCP**: `get_metric_data`/`get_visualization_data` dispatch through
  the standard routes → inherit the subset. `get_module_log`/
  `get_module_r_script` hit the internals exception above.
  `compareProjects` (instance admin route) reads manifests cross-project by
  design — exempt.

### Phase 1 work order + verification

1. §1 types + §2 migration; threading through DBProject/ProjectDetail/
   ProjectState/build_project_state.
2. §4 context load + `computeSubsetFilters` + memo + three injections.
3. §5 holder `subsetHash` + cache keys + version bump.
4. §3 routes + §6 SSE/notify/store/version-key/guard.
5. §7 UI.
6. §8 docs + dead-code deletion.

Verification: `deno task typecheck`; a `deno run --allow-all -c deno.json`
harness exercising `computeSubsetFilters` against a real run dir (AA2 RO,
AA3-only RO, national RO, ICEH RO; empty-AA3 sentinel; memo hit) and one
end-to-end items query with/without subset; `./validate_queries` (should
be untouched — injection sits above the Cores); the MCP probe rung
(PROTOCOL_APP_DEVELOPMENT) for `get_metric_data` under a subsetted
project. Deploy is app-only (no modules lockstep); migration is additive.

## Phase 2 (indicators) — sketch, do after phase 1 ships

- Schema: add `indicatorCommonIds?: string[]` (additive). Injection:
  `indicator_common_id IN (...)` where the RO carries the column (same
  helper). UI: multi-select fed from the run's `indicators.json`.
- The distinct work is **catalogs**: intersect
  `getCommonIndicatorsFromManifestInputs`, the AI metrics list, and
  decide whether virtual-default visualizations for out-of-subset
  indicators are hidden (then the virtual-defaults cache needs the subset
  key) — investigate then.
- Open: `source_indicator`/denominator dimensions reference indicators a
  subset might exclude — decide whether the subset filters only the
  primary `indicator_common_id` dimension (recommended) or those too.

## Phase 3 (period) — sketch, lowest priority

- Schema: add `periodBounds?: {min, max}` (additive). Mechanism: intersect
  at bounds resolution — clamp `rawDateRange`/`periodFilterExactBounds`
  inside the run path (likely a wrapper-supplied bound ANDed in
  `getPeriodBoundsCore`'s WHERE and intersected with
  `getPeriodFilterExactBounds`), and intersect the two manifest-stamp
  sites (`getRawPeriodBoundsFromRun`, `ResultsValueInfo.periodBounds`).
  Details investigated when picked up.

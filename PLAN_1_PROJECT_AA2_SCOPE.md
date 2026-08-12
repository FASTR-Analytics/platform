# Plan: Project-specified Admin Area 2 scope

**Status: fully specified, ready to implement.** Written 2026-08-09;
adversarially reviewed 2026-08-10 (13 findings folded in — one live bug
(the roll-up label, §6), four omitted work items (`copyProjectSync`,
the instance notify, `cache_status.ts`, the compatibility signature),
three implementation traps (§3), and corrections to the level-mismatch,
period-bounds and client-cache claims, all re-verified against real run
manifests and prod structure rather than re-read). This
supersedes the subset-setting framing of
[PLAN_DATA_SUBSETTING_OLD.md](PLAN_DATA_SUBSETTING_OLD.md) (kept
for reference — its verified-current-state research and cache analysis
remain the evidence base; its phases 2/3 are dropped as likely never
needed). Prerequisite (always-full package generation) shipped 2026-08-03.

**Ruling (Tim, 2026-08-09):** the Admin Area 2 scope is a property of the
PROJECT, not a subset knob on the package attachment. A project IS either a
**national project** or a **single-AA2 project** ("Lagos State project",
"Volta project") — chosen at creation, editable by a global admin (the
same audience as label edits; see §2),
branded in the UI, and flowing through to however the project reads
whatever results package is attached now or later. Packages stay
scope-blind (they are instance-level, immutable, and carry no project
FKs); one full national package published to many projects renders as each
project's own view.

**Prod evidence (verified 2026-08-09, read-only):** Ghana runs a project
per region — Volta (20 users), Eastern (14), Ahafo, Bono East, Greater
Accra, Upper East/West, Savannah, Northern, Oti, Western (North), Central,
North East… — alongside national program projects (MoH Ghana, EPI,
Malaria, TB). Nigeria: "Bauchi State", "Kaduna State Project", "Kano State
Project", "Lagos State Project" alongside "Nigeria General Project" and
the central-reporting project. The organizational unit already exists;
this plan gives it data semantics and branding.

**Not a security boundary.** Project members can still reach package
internals (scripts, logs, raw downloads) under their existing content
permissions. The scope defines the project's analytical view.

## Verified mechanics (carried from the research plan, re-verified 2026-08-09)

- `projects` columns: `id, label, ai_context, is_locked,
  is_central_reporting, status, deletion_scheduled_at, run_id`
  (`server/db/instance/_main_database.sql:57-67`); next free migration
  number 075. Attach = bare `UPDATE projects SET run_id` (route
  `server/routes/project/results_package.ts:86-103`; second path
  `publishReadyRun`, `server/db/instance/run_generation.ts:544-568`, loops
  attach-target projects in one publish). No detach exists.
- Every project read resolves through `getRunReadContext(mainDb,
  projectId)` (`server/run_query/run_read.ts:99-129`) — one SELECT on the
  projects row → `RunReadContext` → DuckDB over parquet. The single choke
  point for loading the scope.
- Filters (`{disOpt, values}[]`) compile to WHERE via `buildWhereClause`
  (`query_helpers.ts:303`); `admin_area_2` is an ordinary filter column
  applied **directly against results-object columns** (NOT via the
  `facility_subset` CTE — that carries only `facility_*` columns).
  Precedent for a silently appended filter: `getFiltersWithReplicant`
  (`lib/get_fetch_config_from_po.ts:483-499`).
- **Level mismatch — measured across all of prod, not assumed.** Swept
  `information_schema` over every `ro_*` table in every non-deleted
  project DB of all **34 instances** (read-only, PROTOCOL_ACCESS_DBS),
  cross-checked against the `resultsObjects[].columns` stamps of the 39
  local run manifests. **50 distinct results-object names**:
  - **24 carry `admin_area_2` and scope directly** — every AA3-bearing RO
    in M1, M2, M3 (levels 2/3/4), M8, M10, and **all three M7 scorecards
    including admin-3/4** (`m007/script.R:105-109` keeps every parent
    level; confirmed empirically in prod). Most admin-3 tables need no
    derivation at all.
  - **7 carry `admin_area_3` WITHOUT `admin_area_2`** — the whole
    derivation surface, one logical family (district-level coverage /
    denominators / combined-results) under seven historical module
    numberings: `m4_combined_results_admin3`,
    `m4_coverage_estimation_admin_area_3`, `m4_denominators_admin3`,
    `m5_combined_results_admin3`, `m5_coverage_estimation_admin3`,
    `m5_denominators_admin3`, `m6_coverage_estimation_admin3`. The R
    scripts delete the column explicitly (M6 `script.R:585-588`, M4/M5
    the same). **NB: the local-manifest sample showed only 4 of these** —
    the current module set. Prod carries the older names too, and any
    attached legacy package can hold them.
  - **19 cannot be scoped**: national ROs (`admin_area_1` only) and
    M9/ICEH. This bucket also contains `m3_all_indicators_shortfalls_*`
    and `m3_chartout` — NOT a scoping hole: `hasParquet=false` in the run
    manifests (file-only, never queried), and in prod they are empty
    central-reporting shells (single `source_server_id` column, 0 rows).

  The facilities parquets carry `facility_id` + all four admin areas
  (`PROJECT_FACILITY_COLUMN_NAMES`,
  `server/db/project/datasets_in_project_hmis.ts:69-83`) — the run-local
  source for the AA2 coverage check and the AA2→AA3 mapping.
- **AA3 names are not unique, and the 7 derived ROs cannot tell them
  apart** (they have no `admin_area_2` left). Swept `facilities_hmis`
  across all 38 instances: **Ethiopia alone collides** (171 region/district
  pairs, 162 distinct names — `North Shewa Zone` in Amhara + Oromia,
  `FACILITY AT HIGHER LEVEL` in seven regions). Measured blast radius
  today: **nil** — all seven tables are empty in all 7 Ethiopia projects
  (re-checked against the full list), and the instance that does populate
  them (Nigeria, 37 districts) has zero collisions. Latent, not live.
  Do not re-derive this; see the qualified ruling below.
- Server Valkey caches key on runId with **no project dimension**
  (`server/routes/caches/visualizations.ts:65-68` says so outright), so
  two projects on one package genuinely do serve each other's views —
  the server keys MUST learn the scope. The **client** caches already
  key `projectId` into `uniquenessKeys` (all four —
  `t2_presentation_objects.ts:37,61,83`, `t2_replicant_options.ts:26`),
  so cross-project bleed is impossible
  there; the client change (§5) exists solely to invalidate on a scope
  CHANGE within one project.

## Rulings

- **Scope where the column exists**: RO has `admin_area_2` → filter it;
  only `admin_area_3`/`admin_area_4` → filter by the derived child values;
  no admin columns (national ROs, ICEH) → **shown unfiltered**. A state
  project still sees national metrics — inevitable (no per-state row
  exists) and coherent under the branding ("the Lagos view; national
  metrics are context"). Say it in the scope UI help text.
- **Option lists are scope-filtered** — the project sees the package as if
  it only contained its area.
- **Mismatch is allowed, surfaced, never auto-fixed.** A package that
  doesn't contain the project's AA2 can be attached: area-level metrics
  show "no data available" (the filter matches nothing — degrades empty),
  and the UI warns (compatibility modal before attach; persistent warning
  on the attached-package card). Compared case-insensitively, same as the
  query layer. The scope is never silently cleared.
- **The degrade-to-empty guarantee holds for the 24 direct-filter ROs, NOT
  for the 7 derived ones.** Where scoping matches districts by NAME, an
  instance with duplicate district names will fold another region's
  identically-named district into the scoped project's numbers, and no
  column survives to prevent it. Accepted as latent (measured nil today —
  see Verified mechanics). Do not write "never another area's numbers"
  anywhere. If it ever goes live, the fix is three lines in the M4/M5/M6
  R scripts — stop dropping `admin_area_2` — after which all 24 scope
  directly and the derivation code can be deleted. That is a modules
  lockstep, which this plan otherwise avoids.
- **The roll-up row is relabelled under scope.** The `__NATIONAL` row is
  computed over the scoped WHERE (verified: `buildRollupQuery` inherits
  the injected filters) but labelled from the PO's own config, which never
  sees the scope — so `getRollupLabelContext` returns `{kind:"national"}`
  and the row reads "National" while totalling one area. See §6.
- **Package internals** (script/logs/file list/raw CSV download) and
  **stored FigureBundles** (slides/dashboards/reports + the public
  dashboard route) are documented exceptions — internals show the package
  as-is under their own permissions; bundles are deliberately frozen and
  pick up the scope on re-resolution at authoring time, exactly as they
  behave across re-attach today.
- **MCP context cache**: no invalidation call (needs the principal token;
  attach doesn't invalidate it either); 30s TTL accepted. Data tools
  dispatch through routes per-call and scope immediately.

## Specification

### 1. Identity & storage

- Migration `075_add_project_admin_area_2.sql`:
  `ALTER TABLE projects ADD COLUMN admin_area_2 text;` + same column in
  `_main_database.sql`. NULL = national. Plain text column — no JSON: the
  general multi-dimension subset shape was hedging for phases that are now
  dropped.
- lib (`lib/types/projects.ts`):

```ts
export function projectScopeToken(adminArea2: string | null): string {
  return adminArea2 === null
    ? "national"
    : encodeURIComponent(adminArea2.toUpperCase()).replaceAll("~", "%7E");
}
```

The ONE token used by server cache keys, response-holder stamps, and the
client version key. `encodeURIComponent` keeps it readable in Valkey
keys and escapes `|` (cache-segment separator); the tilde replace closes
the one unreserved char that would collide with the client version-key
separator (§5).

- Threading: `DBProject` (`_main_database_types.ts:73-82`) gains
  `admin_area_2: string | null`; `ProjectDetail`
  (`lib/types/projects.ts:27-52`) and `ProjectState`
  (`lib/types/project_sse.ts:20-54`, + `EMPTY_PROJECT_STATE`) gain
  `adminArea2: string | null`; `getProjectDetail`
  (`server/db/project/projects.ts:54+`) and `build_project_state.ts` copy
  it through (the SSE `starting` reconcile then needs no store work). The
  instance projects listing rows also gain `adminArea2` for the list badge
  (§6): the type is `ProjectSummary` (`lib/types/projects.ts`), the rows
  come from `getProjectsForUser` (`server/db/instance/instance.ts:296`,
  BOTH the admin branch and the member branch), reached via
  `getInstanceDetail` → `buildInstanceState`
  (`server/task_management/build_instance_state.ts`).
- **`copyProjectSync` must copy the column.**
  `server/db/project/projects.ts:863` INSERTs only
  `(id, label, ai_context, status)`, so a copied "Volta Project" would
  silently become national while inheriting Volta-authored content and
  the source's run pointer.

### 2. Setting the scope: creation + settings

- **AA2 list source: instance structure**, not the run — at creation no
  package is attached yet, and the identity outlives any package. Existing
  routes (`getStructureItems`, `getDatasetHmisDisplayInfo`) both require
  global `can_view_data` — wrong audience. Add a light route
  `listAdminArea2s` in `server/routes/instance/structure.ts`:
  `SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)`
  (the `dataset_hmis.ts:300-304` query), guard = any authenticated user
  (area names are not sensitive; counts are already in `instanceState`).
- **Creation**: registry `createProject`
  (`lib/api-routes/project/projects.ts:24-27`) body becomes
  `{ label: z.string(), adminArea2: z.string().min(1).nullable() }` —
  required-nullable so the client always states the choice explicitly (no
  default-argument drift). Route (`server/routes/project/project.ts:38-60`,
  guard `can_create_projects`) passes it to `addProject`, which writes the
  column at INSERT. UI: `AddProjectForm`
  (`client/src/components/instance/add_project.tsx`) gains the scope
  picker below the name input.
- **Editing**: new route `updateProjectAdminArea2` (registry beside
  `updateProject`, `lib/api-routes/project/projects.ts:29-35`): body
  `{ adminArea2: z.string().min(1).nullable() }`, guard
  `requireProjectPermission({preventAccessToLockedProjects: true,
  requireAdmin: true})` — the `updateProject` class: this is project
  identity, not the attach guard. NB `requireAdmin` means
  `globalUser.isGlobalAdmin` (`project_auth.ts:83`); there is no
  project-level admin role, so scope edits are global-admin-only,
  exactly like label edits. DB function beside `updateProject`; on
  success **both** `notifyProjectAdminArea2Changed` (§5) **and**
  `notifyInstanceProjectsLastUpdated(new Date().toISOString())` — the
  instance list only refetches off that message (`projects_last_updated`
  → `instanceState.projectsLastUpdated` → the deferred `createEffect` at
  `t1_sse.tsx:178-193`), so without it the §6 list badge stays stale until
  reload. Every sibling mutation in `project.ts` already fires it. UI: a
  "Project scope" section in `project_settings.tsx` (beside the existing
  label/aiContext forms at :107/:128).
- **Shared picker**: one `ProjectScopePicker` component in
  `client/src/components/_shared/` (radio **National** / **Single Admin
  Area 2** + select fed by `serverActions.listAdminArea2s`), used by both
  the create modal and settings. Help text notes national-level metrics
  remain national. All strings `t3` en/fr/pt.
- **The picker MUST render a stored value that is no longer in the list.**
  `cleanupUnusedAdminAreas`
  (`server/server_only_funcs_importing/integrate_structure_from_staging.ts:563`)
  DELETEs any `admin_areas_2` row no facility references, so a structure
  re-upload that renames or drops an area orphans the project's stored
  string. A plain `<select>` would render it as blank/first-option and the
  next save would silently rewrite the project's identity — the exact
  outcome the "never silently cleared" ruling forbids. Show it as an
  explicit disabled-style option ("X — not in the current structure") and
  keep it selected until an admin changes it deliberately.
- Write-time validation is schema-only — no membership check against any
  package (the picker constrains normal entry; the identity must survive
  package churn).

**The visualization editor needs NO work — this is load-bearing, not luck.**
Scope-filtering the option lists (§3) makes `admin_area_2` come back with
exactly one value, so `getSingleValueDimsFromPossibleValues`
(`lib/normalize_po_config.ts:277-292`) already classifies it, and the
existing single-value machinery hides it: the filter row is dropped
(`presentation_object_editor_panel_data.tsx:66-78` — "a one-option filter
is noise") and the disaggregate-by checkbox renders disabled with a
`single_value` reason (`_3_disaggregation.tsx:171-173`). Do not add a
scope-specific branch, and do not remove the single-value logic. Three
facts that make this safe, all traced 2026-08-10:

- **The strip is render-only; storage keeps the entry.** `saveFunc` →
  `getConfigForSave` → `normalizePOConfigForStorage`
  (`normalize_po_config.ts:123-149`), which maps `disaggregateBy` 1:1 and
  never calls `getEffectivePOConfig`. `dropStorageInvalidTransients` only
  touches `filterBy`/`valuesFilter`/`periodFilter`. Collab pushes raw
  `tempConfig`. The AI path uses `effectiveConfig` for a slot-collision
  assertion and commits `newConfig`. A nationally-authored viz opened in a
  scoped project therefore does NOT lose its AA2 disaggregation on save.
- **The one save-time mutation is scope-blind.** The rollup-flag
  canonicalisation gates on `isRollupCandidateDimension`
  (`get_fetch_config_from_po.ts:353-365`), which reads config only — no
  `singleValueDims`, no possible-values. The scope cannot silently clear a
  rollup flag.
- **The deliberate exception must survive.** The filter row is kept
  visible when the STORED config already filters on the dimension —
  otherwise a legacy viz carrying `filterBy: admin_area_2` shows "no data"
  with no way to see or clear it. Exactly the case Ghana/Nigeria projects
  will hit on the first scoped attach.

Two distinct paths, don't conflate them: an in-package scope yields ONE
value (single-value → hidden); a scope the package doesn't cover yields
NONE (`no_values_available` → the dimension is dropped from
`allowedFilterOptions` entirely, `panel_data.tsx:43-46`).

### 3. Query enforcement

- `getRunReadContext` extends its SELECT to `run_id, admin_area_2`;
  `RunReadContext` gains `adminArea2: string | null` and
  `scopeToken: string`. Every consumer — routes, and MCP/AI which
  dispatch in-process through the same routes — inherits from this one
  load point.
- Helper in `run_read.ts`:

```ts
async function computeScopeFilters(
  ctx: RunReadContext,
  ro: RunResultsObject,
): Promise<GenericLongFormFetchConfig["filters"]>
```

  `ctx.adminArea2 === null` → `[]`. Else check `ro.columns` names
  (manifest stamp, `lib/types/run_manifest.ts:43`):

- has `admin_area_2` → `[{disOpt: "admin_area_2", values: [adminArea2]}]`
- else has `admin_area_3` (then `admin_area_4` analogously) → derive child
  values from the family facilities parquet
  (`getDatasetFamilyFromRun(ctx, ro.moduleId)`):
  `SELECT DISTINCT admin_area_3 FROM <facilities table> WHERE
  UPPER(admin_area_2) = UPPER('<escapeSqlString(X)>') AND admin_area_3 IS
  NOT NULL`. **Resolve the table off `manifest.facilitiesTables` /
  `manifest.inputFiles`, never by calling `facilitiesTableForFamily`
  unguarded** — verified by execution, it THROWS for both `"iceh"` and
  `undefined` (`get_query_context.ts:20-30`). No facilities parquet → `[]`.
  **Empty derivation injects a never-matching sentinel** (e.g.
  `["__SCOPE_EMPTY__"]`) — an empty `values` array is skipped by
  `buildWhereClause` and would show ALL data instead of none.
  Reaches exactly the 7 ROs enumerated in Verified mechanics; matching is
  by district NAME, with the collision caveat ruled above.
- else → `[]`.

Memo beside it: `Map<string, string[]>` keyed
`${runId}|${family}|${UPPER(aa2)}`, FIFO cap ~50 (the
`manifest_cache.ts:11-43` pattern); evict-by-runId export called from
`server/runs/delete_run.ts` beside `evictRunFromManifestCache` (memory
hygiene — runs are immutable).

- Injection sites (all in the FromRun wrappers; the shared Cores and the
  pg-parity path are untouched):
  - `getPresentationObjectItemsFromRun` (`run_read.ts:736`): when filters
    are non-empty, pass `effectiveFetchConfig = {...fetchConfig, filters:
    [...fetchConfig.filters, ...scopeFilters]}` to **both**
    `buildQueryContextFromManifest` (the facility/non-facility split
    happens there) and the Core; afterwards restore the caller's original
    onto the holder: `res.data.fetchConfig = fetchConfig`. The echo is the
    request; the scope rides as `scopeToken` (§4). Verified: no other
    holder-`fetchConfig` consumers exist (the two client `.fetchConfig`
    reads are resolved-replicant objects; the only echo consumer is cache
    `parseData`).
  - `getPossibleValuesFromRun` (:774): **REASSIGN the `filters` param**,
    do not build a second local — it is consumed TWICE (once by
    `buildMinimalFetchConfig`, again by the `getPossibleValuesCore` call
    at the bottom). Scoping only the first leaves the query context
    scoped and the actual query unscoped. Automatically scopes
    `getResultsValueInfoFromRun`'s per-dimension possible values (:839)
    and the replicant-options route. `excludeReplicantFilter` is
    orthogonal (it excludes the PO's own replicant filter, never the
    scope).
  - `getResultsObjectItemsFromRun` (:854, raw-rows preview): append a
    WHERE via `buildWhereClause({...minimal, filters: scopeFilters},
    false, undefined, {textColumns: new Set()})`, spliced BEFORE the
    hand-built `LIMIT`. **Also fix `totalCount`** (:881): it returns the
    manifest's package-wide `ro.rowCount`, so scoped items under an
    unscoped total. Count over the same WHERE, or drop the count.
- A PO whose own `filterBy` names a different AA2 ANDs to empty —
  correct. Scope values compare case-insensitively and are escaped like
  any filter value (`buildWhereClause` UPPER + `escapeSqlString`).
- **Period bounds: the two paths anchor differently, and that is fine.**
  `admin_area_2` is NOT an enabled facility column
  (`getEnabledOptionalFacilityColumns`, `lib/types/instance.ts:188-201`),
  so the scope filter lands in `nonFacilityFilters` — which is exactly
  what `getPeriodBoundsCore` uses. The items path therefore DOES re-anchor
  to the scoped subset (verified by execution: `dateRange` min moves
  `201501` → `201512` on a real run). The replicant-options route keeps
  using the manifest stamp (`getRawPeriodBoundsFromRun`). Measured
  divergence: none — across 83 real RO/run pairs, **zero** areas have a
  max period behind the package max, and every relative filter type
  anchors on max. The only observable effect is the axis min. Accepted;
  do not "fix" the replicant path on this basis.

### 4. Server caches (server/routes/caches/visualizations.ts)

- Thread `scopeToken` into the holders: add `scopeToken?: string` beside
  `runId` in `ItemsVersionInfo`
  (`get_presentation_object_items.ts:33-39`), supplied by
  `versionInfoFor(ctx, ...)` (`run_read.ts:725-733`) / `getRunVersionInfo`
  — it spreads into the items, metric-info, and replicant-options holders
  wherever `...versionInfo` lands. Add explicitly to
  `PresentationObjectDetail` (both branches of
  `getPresentationObjectDetailFromRun`). Optional like `runId` (the
  pg-parity baseline leaves both undefined and is never cached).
- Key changes (scope segment **trailing** — `delete_run.ts:61-63` and
  `cache_status.ts:61-74` prefix-scan `${runId}|`/`${runId}::` and parse
  segment index 1; trailing preserves both):
  - `_PO_ITEMS_CACHE` (:120): uniqueness
    `[runId, roId, hashFetchConfig, scopeToken].join("|")`; route passes
    `runCtx.scopeToken`; `parseData` appends `res.data.scopeToken` and
    refuses to store when undefined (same rule as `runId`).
  - `_METRIC_INFO_CACHE` (:156): `[runId, metricId, scopeToken].join("::")`.
  - `_REPLICANT_OPTIONS_CACHE` (:192): append `::scopeToken`.
  - `_PO_DETAIL_CACHE` (:75): uniqueness already projectId-keyed; append
    `|${scopeToken ?? "none"}` to the **version** hash (compute and
    `parseData` sides).
- Bump `PO_CACHE_VERSION` `"13"` → `"14"` (:64).
- **Third call site, easy to miss:** `server/routes/project/cache_status.ts:91-95`
  calls `_METRIC_INFO_CACHE.exists({runId, metricId})` and builds the
  uniqueness hash from those params — it reads `projects.run_id` directly
  and has no scope in hand. Make `scopeToken` **required** on the three
  data caches' uniqueness-param types so typecheck forces this site
  (optional would compile and silently report the wrong cache status).
  The `poItemsCounts`/`replicantCounts` prefix scans in the same file now
  aggregate across every scope on the run — cosmetic, left as is.
- In-process caches: manifest + input-JSON caches are per-run — safe;
  **never mutate the shared manifest object per project**. Virtual-defaults
  cache (runId-keyed) unaffected (the scope never filters the metric
  catalog). DuckDB creates a fresh instance per query — nothing to do.

### 5. SSE + client version keys

- Notify (mirror `notifyProjectRunAttached`,
  `server/task_management/notify_project_v2.ts:141-146`):
  `notifyProjectAdminArea2Changed(projectId, adminArea2)` sending
  `{type: "admin_area_2_changed", data: {adminArea2}}`; union member in
  `lib/types/project_sse.ts`; `t1_store.ts` case:
  `setProjectState("adminArea2", msg.data.adminArea2)`.
- `runVersionKey` (`t1_store.ts:186-188`):

```ts
return `${pds.attachedRunId ?? "no_run_attached"}~${projectScopeToken(pds.adminArea2)}`;
```

`~` separator, not `|` — the client `po_detail` version guard slices at
`version.lastIndexOf("|") + 1` (`t2_presentation_objects.ts:71`) and
must keep receiving the whole run+scope token as one trailing segment
(`projectScopeToken` escapes both separators, §1).

- **Guard trap (verified):** `responseRunIdMatches`
  (`t1_store.ts:196-201`) compares the holder's bare `runId` against the
  full version-key string — with the composite key it would reject every
  response and silently disable client caching. Replace with:

```ts
export function responseRunVersionMatches(
  data: { runId?: string; scopeToken?: string },
  runKey: string,
): boolean {
  return data.runId !== undefined && data.scopeToken !== undefined &&
    `${data.runId}~${data.scopeToken}` === runKey;
}
```

Update all four call sites (`t2_presentation_objects.ts:42-43, 70-71,
89-90`; `t2_replicant_options.ts:33-34`). The undefined checks keep the
parity-baseline never-cache rule; the comparison also closes the in-flight
race a scope change opens (same race attach has today). Old IndexedDB
entries become unreachable via the version flip and age out — no purge
(the mechanism attach already relies on). `clear_caches.ts` prefix strings
are uniqueness-based and unaffected.

### 6. Branding + mismatch UI

- **Project shell header** (`client/src/components/project/index.tsx:156-163`,
  the bar rendering `projectState.label`): when `adminArea2` is set, a
  badge beside the label with the area name; national projects show
  nothing extra.
- **Instance projects list**
  (`client/src/components/instance/instance_projects.tsx`, rows at
  :194/:211 off `instanceState.projects`): same badge — with 29 projects
  in Ghana, the list is where the identity pays off. Requires the
  listing-row threading from §1.
- **Mismatch surfacing** (scope AA2 not in the attached package):
  - Extend the compatibility payload
    (`getResultsPackageCompatibility`,
    `server/routes/project/results_package.ts:72-84` →
    `server/runs/package_compatibility.ts`) with
    `projectAdminArea2Covered: boolean | null` (null = project is
    national), computed from `SELECT DISTINCT admin_area_2` over the run's
    facilities parquets (UPPER compare). The pre-attach modal
    (`results_package_compatibility_modal.tsx`) shows "this package has no
    data for X" as one more line.
    Note the signature change: `buildResultsPackageCompatibilityReport`
    (`package_compatibility.ts:88-91`) currently takes only
    `(projectDb, runId)` — it needs `mainDb` + `projectId` to read the
    scope. And "package has no facilities parquet at all" (ICEH-only) is a
    third state, not `false`.
  - The attached-package card (`AttachedPackageCard`,
    `project_results_package.tsx:256-300`) calls the same compatibility
    route for the attached run and renders a persistent warning when
    uncovered. One mechanism, two surfaces; no dedicated route needed.
- **Roll-up row label** (the live bug in the Rulings above). Verified by
  execution: with no `admin_area_2` entry in `config.d.filterBy` —
  which is always the case, the scope is server-injected —
  `getRollupLabelContext` returns `{kind:"national"}`, while the emitted
  SQL is `SELECT '__NATIONAL' … WHERE UPPER(admin_area_2) IN ('VOLTA')`.
  So a Volta project's district chart shows a row labelled "National"
  holding Volta's total; with `rollupDim: "admin_area_2"` it shows the
  single area twice. Fix in `getRollupRowLabel`
  (`client/src/generate_visualization/get_data_config_from_po.ts:102-111`):
  when `projectState.adminArea2` is set and the context is `national`,
  render the `pinned` form (`"<Area> — All areas"`) instead of
  `TC.national`. Display-only — never push the scope into the PO config,
  which would put it in the fetch config and the cache hash.

### 7. Docs + cleanup

- SYSTEM_08: project scope concept + rulings (national-RO behavior,
  internals exception, frozen bundles, mismatch policy, MCP TTL).
- SYSTEM_09: injection point (wrapper-level, above the Cores), the
  24/7/19 RO split and the AA2→AA3 name-matching caveat, the two
  period-bound anchors, cache-key shape + `PO_CACHE_VERSION` bump.
- SYSTEM_03: `admin_area_2_changed` in the notify catalog; composite
  `runVersionKey`; the client-cache note (uniqueness is already
  projectId-scoped; the version key carries the scope).
- SYSTEM_10 (figure render): the roll-up row label under a project scope.
- SYSTEM_14 (client shell): the header badge.
- Delete in passing: `server/db/project/results_objects.ts:9-23`, the
  legacy unrouted Postgres raw-rows reader (dead code that could be
  re-wired around the scope).
- Delete in passing: the two stale `serviceCategoryScope` references —
  `SYSTEM_08_results_packages.md:399` and
  `lib/types/datasets_in_project.ts:22`. The key has no schema field, no
  writer and no reader anywhere in the codebase; service categories are a
  viz filter (see Legacy section). Leaving them invites exactly the
  wrong inference next time someone plans a scope dimension.

## Legacy subsetted projects (ruled 2026-08-09)

Two flavors exist: pre-runs projects whose windowed data the backfill
synthesizer freezes into a synthetic package (all of prod today), and
early wizard-generated windowed packages from before full-capture. For
both, **the subset became the package**. Handling:

- They ship with `admin_area_2 = NULL` (national) and keep working
  unchanged — no filter injected over an already-subsetted package.
- The windowing details are not lost, only unrendered: legacy manifests
  carry `datasets[].info.windowing` verbatim — re-verified 2026-08-10
  against the 39 local manifests, 3 carry it with the full shape
  (`start`/`end`/`takeAllAdminArea2s`/`adminArea2sToInclude`/…). A
  "generated as a windowed extract" note on the package card is a
  possible later nicety, not phase-1 work.
- **`serviceCategoryScope` is NOT part of this (Tim, 2026-08-10).**
  Service categories are a visualization filter now
  (`hfa_service_category` — multi-membership, filter-only), not a
  windowing concept at instance or project level. Confirmed: zero
  occurrences in the 39 local manifests and zero code references — it
  survives only in two stale comments, listed in §7 for deletion. Do not
  reintroduce it as a scope dimension.
- **No migration auto-derives identity from legacy windowing stamps** —
  multi-area windows and renamed areas make guessing wrong too often.
  Convergence is manual and incremental: an admin sets the AA2 identity
  in settings whenever ready (harmless on the old package — the filter
  matches everything in it and coverage passes), gaining the branding
  immediately; the next attach of a full package continues the scoping
  from identity. Legacy period/indicator windows dissolve at that same
  re-attach (full package, no identity dimension for them — by design).

## Future direction (recorded, NOT in scope): user permissions

Tim (2026-08-09): the AA2 identity could one day tie into user
permissions. The prod pattern points there — Ghana's regional projects
each carry their own small memberships (Volta 20, Eastern 14, most regions
2-5), so "state user" is already a de-facto role expressed through project
membership. Possible later steps: instance-level user↔AA2 assignment that
auto-scopes which projects a user can join or see; scope-aware permission
presets (state users get editor in their state's project, viewer
elsewhere); or per-AA2 gating of instance surfaces. Nothing in this plan
precludes any of that — the identity lives on the `projects` row, which is
exactly the join key such permissions would need. Do not build any of it
now.

## Work order + verification

1. §1 migration + column + types + threading (ProjectDetail /
   ProjectState / `ProjectSummary` listing rows / `projectScopeToken` /
   `copyProjectSync`).
2. §3 context load + `computeScopeFilters` + memo + three injections
   (+ the `filters` reassignment, the facilities-table guard, and the
   raw-rows `totalCount`).
3. §4 holder `scopeToken` + cache keys + `PO_CACHE_VERSION` bump +
   `cache_status.ts`.
4. §2 routes (`listAdminArea2s`, `createProject` body,
   `updateProjectAdminArea2` + both notifies) + §5
   SSE/notify/store/version-key/guard.
5. §2 UI (picker in create + settings, incl. the orphaned-value case) +
   §6 branding, roll-up label, mismatch surfaces.
6. §7 docs + dead-code deletion.

Verification: `deno task typecheck`; a `deno run --allow-all -c deno.json`
harness exercising `computeScopeFilters` against a real run dir (AA2 RO,
AA3-only RO, national RO, ICEH RO; empty-AA3 sentinel; memo hit) and one
end-to-end items query with/without scope; `./validate_queries` (untouched
— injection sits above the Cores); the MCP probe rung
(PROTOCOL_APP_DEVELOPMENT) for `get_metric_data` under a scoped project.
Deploy is app-only (no modules lockstep); migration is additive.

Two harnesses already written during review and worth keeping as the
regression pins (both run against `_example_instance_dir/sandbox`, env
from `.env` plus `SANDBOX_DIR_PATH`):

- `getPresentationObjectItemsFromRun` with/without an `admin_area_2`
  filter — asserts the scoped `dateRange` narrows, and that no area lags
  the package period max (the assumption the period ruling rests on).
- `getRollupLabelContext` + `buildCombinedQuery` — asserts the roll-up
  SQL carries the scope WHERE and that the label fix fires.

The 24/7/19 split is now swept from all 34 instances, so it covers every
results object any live project holds — including legacy module
numberings a fresh install would never produce. Two limits remain, both
forward-looking rather than gaps: a NEW module (or a renamed output) can
add to the derivation surface, so `computeScopeFilters` must keep
deciding per-RO from `ro.columns` at runtime and never from a baked list;
and the sweep reads column PRESENCE, not whether a column is populated —
an RO carrying an all-NULL `admin_area_2` would scope to nothing rather
than scope wrongly, which is the safe direction but worth knowing.

The reproducible sweep (read-only, PROTOCOL_ACCESS_DBS) is worth keeping:
per instance, per non-deleted project DB, group `information_schema.columns`
over `table_name LIKE 'ro%'` by table with `bool_or(column_name='admin_area_N')`.
Re-run it after any module release that adds or renames an output.

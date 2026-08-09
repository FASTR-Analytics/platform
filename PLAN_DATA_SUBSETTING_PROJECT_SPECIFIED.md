# Plan: Project-specified Admin Area 2 scope

**Status: fully specified, ready to implement.** Written 2026-08-09. This
supersedes the subset-setting framing of
[PLAN_DATA_SUBSETTING_OLD.md](PLAN_DATA_SUBSETTING_OLD.md) (kept
for reference — its verified-current-state research and cache analysis
remain the evidence base; its phases 2/3 are dropped as likely never
needed). Prerequisite (always-full package generation) shipped 2026-08-03.

**Ruling (Tim, 2026-08-09):** the Admin Area 2 scope is a property of the
PROJECT, not a subset knob on the package attachment. A project IS either a
**national project** or a **single-AA2 project** ("Lagos State project",
"Volta project") — chosen at creation, editable by a project admin,
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
- **Level mismatch:** modules emit separate ROs per admin level.
  Admin-2-level ROs carry `admin_area_2`; **admin-3-level ROs drop it**
  (M6 `script.R:585-588`, M5 similar) → those need the run's AA3 values
  under the chosen AA2; national ROs (and all of M9/ICEH) have no admin
  columns and cannot be scoped. The facilities parquets carry
  `facility_id` + all four admin areas
  (`PROJECT_FACILITY_COLUMN_NAMES`,
  `server/db/project/datasets_in_project_hmis.ts:69-83`) — the run-local
  source for the AA2 coverage check and the AA2→AA3 mapping.
- Server Valkey caches key on runId with **no project dimension**
  (`server/routes/caches/visualizations.ts:65-68` says so outright);
  client caches version on `runVersionKey = attachedRunId` only
  (`t1_store.ts:186-188`). Both must learn the scope or two projects on
  one package serve each other's views.

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
  show "no data available" (the filter matches nothing — degrades empty,
  never to another area's numbers), and the UI warns (compatibility modal
  before attach; persistent warning on the attached-package card).
  Compared case-insensitively, same as the query layer. The scope is
  never silently cleared.
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
  instance projects listing rows (`instanceState.projects`, built in
  `buildInstanceState`, `server/db/instance/instance.ts`) also gain
  `adminArea2` for the list badge (§6).

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
  identity, not the attach guard. DB function beside `updateProject`; on
  success `notifyProjectAdminArea2Changed` (§5). UI: a "Project scope"
  section in `project_settings.tsx` (beside the existing
  label/aiContext forms at :107/:128).
- **Shared picker**: one `ProjectScopePicker` component in
  `client/src/components/_shared/` (radio **National** / **Single Admin
  Area 2** + select fed by `serverActions.listAdminArea2s`), used by both
  the create modal and settings. Help text notes national-level metrics
  remain national. All strings `t3` en/fr/pt.
- Write-time validation is schema-only — no membership check against any
  package (the picker constrains normal entry; the identity must survive
  package churn).

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
  NOT NULL`; no facilities parquet for the family (ICEH) → `[]`.
  **Empty derivation injects a never-matching sentinel** (e.g.
  `["__SCOPE_EMPTY__"]`) — an empty `values` array is skipped by
  `buildWhereClause` and would show ALL data instead of none.
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
  - `getPossibleValuesFromRun` (:774): append to the `filters` param
    before `buildMinimalFetchConfig` — automatically scopes
    `getResultsValueInfoFromRun`'s per-dimension possible values (:839)
    and the replicant-options route. `excludeReplicantFilter` is
    orthogonal (it excludes the PO's own replicant filter, never the
    scope).
  - `getResultsObjectItemsFromRun` (:854, raw-rows preview): append a
    WHERE via `buildWhereClause({...minimal, filters: scopeFilters},
    false, undefined, {textColumns: new Set()})`.
- A PO whose own `filterBy` names a different AA2 ANDs to empty —
  correct. Scope values compare case-insensitively and are escaped like
  any filter value (`buildWhereClause` UPPER + `escapeSqlString`).
- Relative period filters keep anchoring to the package-wide manifest
  bounds (`getRawPeriodBoundsFromRun`) — accepted: an area scope rarely
  changes time coverage.

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
  - The attached-package card (`AttachedPackageCard`,
    `project_results_package.tsx:256-300`) calls the same compatibility
    route for the attached run and renders a persistent warning when
    uncovered. One mechanism, two surfaces; no dedicated route needed.

### 7. Docs + cleanup

- SYSTEM_08: project scope concept + rulings (national-RO behavior,
  internals exception, frozen bundles, mismatch policy, MCP TTL).
- SYSTEM_09: injection point (wrapper-level, above the Cores), AA2→AA3
  derivation, cache-key shape + `PO_CACHE_VERSION` bump.
- SYSTEM_03: `admin_area_2_changed` in the notify catalog; composite
  `runVersionKey`.
- SYSTEM_14 (client shell): the header badge.
- Delete in passing: `server/db/project/results_objects.ts:9-23`, the
  legacy unrouted Postgres raw-rows reader (dead code that could be
  re-wired around the scope).

## Legacy subsetted projects (ruled 2026-08-09)

Two flavors exist: pre-runs projects whose windowed data the backfill
synthesizer freezes into a synthetic package (all of prod today), and
early wizard-generated windowed packages from before full-capture. For
both, **the subset became the package**. Handling:

- They ship with `admin_area_2 = NULL` (national) and keep working
  unchanged — no filter injected over an already-subsetted package.
- The windowing details are not lost, only unrendered: legacy manifests
  carry `datasets[].info.windowing` / `serviceCategoryScope` verbatim
  (confirmed during full-capture: the synthesizer copies them through;
  no client renders them). A "generated as a windowed extract" note on
  the package card is a possible later nicety, not phase-1 work.
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
   ProjectState / instance listing rows / `projectScopeToken`).
2. §3 context load + `computeScopeFilters` + memo + three injections.
3. §4 holder `scopeToken` + cache keys + `PO_CACHE_VERSION` bump.
4. §2 routes (`listAdminArea2s`, `createProject` body,
   `updateProjectAdminArea2`) + §5 SSE/notify/store/version-key/guard.
5. §2 UI (picker in create + settings) + §6 branding + mismatch surfaces.
6. §7 docs + dead-code deletion.

Verification: `deno task typecheck`; a `deno run --allow-all -c deno.json`
harness exercising `computeScopeFilters` against a real run dir (AA2 RO,
AA3-only RO, national RO, ICEH RO; empty-AA3 sentinel; memo hit) and one
end-to-end items query with/without scope; `./validate_queries` (untouched
— injection sits above the Cores); the MCP probe rung
(PROTOCOL_APP_DEVELOPMENT) for `get_metric_data` under a scoped project.
Deploy is app-only (no modules lockstep); migration is additive.

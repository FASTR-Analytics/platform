# PROTOCOL — App: Client State Tiers

> **App-specific protocol** (not panther's cross-project `PROTOCOL_*`): the
> T1–T5 client-state tier model, the app-specific read/write rules, and the
> state inventory — read it when building anything that holds or fetches
> client state. The state _machinery_ (stores, `_infra/`, SSE bridges) is
> owned by S3; the server-side producer (BroadcastChannel → SSE, notify
> catalog, `last_updated` coupling) is
> [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).
>
> **Base layer — read first, never restated here:** the generic construction
> rules live in panther: `panther/protocols/PROTOCOL_UI_STATE.md` (createQuery /
> createEffect+StateHolder patterns, live-vs-snapshot read modes, no-flash
> refetch, action helpers) and `PROTOCOL_UI_SOLIDJS.md` (tracking rules: deps
> before conditionals, no tracking after `await`, no conditional returns in
> components, never `createResource`). This doc holds only the app-specific
> deltas: the tier model, the SSE-driven invalidation contract, and the
> inventories.

## The tier model

Every piece of client state belongs to exactly one tier. If you can't classify
it, the tier system needs updating, not a workaround.

| Tier | Name              | Data origin                                | Reactive via SSE?                               | State files?                        |
| ---- | ----------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------- |
| T1   | SSE store         | Server pushes to client                    | Yes — real-time, multi-user                     | `t1_*`                              |
| T2   | Reactive cache    | Client fetches, version-keyed by T1 fields | Yes — refetches when the T1 version key changes | `t2_*`                              |
| T3   | On-demand fetch   | Client fetches                             | No — fetched fresh every time, not cached       | None — lives in components          |
| T4   | Client-persistent | Originates on client                       | No                                              | `t4_*`                              |
| T5   | Component-local   | Originates on client                       | No                                              | None — `createSignal` in components |

State files carry their tier prefix so files sort by tier; T3 and T5 have no
files by definition. T4 vs T5: T4 state must survive component unmount
(localStorage/sessionStorage/IndexedDB/module-level signals); T5 dies with it.

```text
client/src/state/
  instance/                ← instance-scoped T1 + T2
  project/                 ← project-scoped T1 + T2 + T4
  _infra/                  ← cache infrastructure (reactive_cache, indexeddb_cache, request_queue)
  t4_ui.ts                 ← cross-cutting T4 (UI prefs; also moduleLatestCommits, see T4)
  t4_connection_monitor.ts ← cross-cutting T4
  clear_caches.ts          ← utility
```

## T1 — SSE store

Two stores, same architecture, five files per level:

| Concern                          | Instance                                            | Project                                       |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Types (state shape, SSE events)  | `lib/types/instance_sse.ts`                         | `lib/types/project_sse.ts`                    |
| Server notifications             | `server/task_management/notify_instance_updated.ts` | `server/task_management/notify_project_v2.ts` |
| Server SSE endpoint              | `server/routes/instance/instance-sse.ts`            | `server/routes/project/project-sse-v2.ts`     |
| Client store + getters           | `client/src/state/instance/t1_store.ts`             | `client/src/state/project/t1_store.ts`        |
| Client SSE connection + boundary | `client/src/state/instance/t1_sse.tsx`              | `client/src/state/project/t1_sse.tsx`         |

**Write path — SSE only. NEVER write T1 state from components.** Component calls
mutation API → server route handler mutates → calls `notifyInstanceUpdate(...)`
/ `notifyLastUpdated(...)` → BroadcastChannel → SSE endpoint → client handler in
`t1_sse` → store setter. The setters in each `t1_store` are called by the SSE
handler only.

**T1 read mechanics.** Importing the store directly (`instanceState`,
`projectState`) in JSX / `createEffect` / `createMemo` is a **live read** —
Solid tracks field-level dependencies. The exported getter functions
(`getIndicatorMappingsVersion()`, `getProjectStateSnapshot()`, …) call
`unwrap()` internally and are **snapshot reads** — use them in async code, cache
version-key callbacks, and event handlers. Generic live/snapshot semantics:
PROTOCOL_UI_STATE "Read Modes". (The codebase also uses "snapshot" for _stored_
snapshots — e.g. `FigureBundle.snapshotAt`, viz data persisted onto a slide.
Same concept, persisted.)

**Boundary components.** `InstanceSSEBoundary` / `ProjectSSEBoundary` own the
connection lifecycle (`onMount` connect, `onCleanup` disconnect) and gate
children on `isReady`. Children import state directly — no Context, no hooks, no
prop threading; each `t1_store` exports every access pattern (reactive store,
snapshot getters, derived lookups) from the one file.

**Project store resets on project switch.** `disconnectProjectSSE()` →
`resetProjectState()` → `reconcile(EMPTY_PROJECT_STATE)`; nothing leaks between
projects. `isReady` resets on project _switch_ but NOT on same-project reconnect
— stale data stays visible while reconnecting.

### Instance T1 fields

| Data                  | Fields on `InstanceState`                                                                                                                  | SSE event                    | Version key for T2                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- |
| Immutable per session | `instanceName`, `instanceLanguage`, `instanceCalendar`                                                                                     | `starting` only              | —                                       |
| Instance config       | `maxAdminArea`, `countryIso3`, `facilityColumns`, `adminAreaLabels`                                                                        | `config_updated`             | —                                       |
| Projects              | `projects`, `projectsLastUpdated`                                                                                                          | `projects_last_updated`      | —                                       |
| Users                 | `users` (full `OtherUser[]`)                                                                                                               | `users_updated`              | —                                       |
| Assets                | `assets` (full `AssetInfo[]`)                                                                                                              | `assets_updated`             | —                                       |
| GeoJSON maps          | `geojsonMaps` (full `GeoJsonMapSummary[]`)                                                                                                 | `geojson_maps_updated`       | —                                       |
| Structure summary     | `structure` (counts), `structureLastUpdated`                                                                                               | `structure_updated`          | `structureLastUpdated`                  |
| HFA weights           | `hfaWeights`                                                                                                                               | `structure_updated`          | —                                       |
| Indicator summary     | `indicators` (counts), `indicatorMappingsVersion`, `hfaIndicatorsVersion`, `calculatedIndicatorsVersion`                                   | `indicators_updated`         | all three version fields                |
| HMIS dataset summary  | `datasetsWithData`, `datasetVersions.hmis`, `hmisNVersions`, `hmisImportRunActive`, `hmisImportRunsQueued`, `hmisScheduledImportAttention` | `datasets_updated`           | `datasetVersions.hmis` + `maxAdminArea` |
| HFA dataset summary   | `datasetsWithData`, `datasetVersions.hfa`, `hfaTimePoints`, `hfaCacheHash`                                                                 | `datasets_updated`           | `hfaCacheHash`                          |
| ICEH dataset summary  | `icehCacheHash`                                                                                                                            | `datasets_updated`           | `icehCacheHash`                         |
| Current user          | `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, `currentUserPermissions`                                            | `users_updated` (re-derived) | —                                       |

**Per-connection fields:** `currentUser*` are per-user, re-derived by finding
the current user in the broadcast list on `users_updated`. `projects` /
`projectsLastUpdated` are per-user; on `projects_last_updated` the client
fetches `/my_projects` (a broadcast can't carry every user's project list). All
other fields are identical across clients.

### Project T1 fields

| Data                  | Fields on `ProjectState`                                                                              | SSE event                                                  | Version key for T2                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Project identity      | `id`                                                                                                  | `starting` only                                            | —                                  |
| Project config        | `label`, `isLocked`, `isCentralReporting`, `aiContext`                                                | `project_config_updated`                                   | —                                  |
| Project datasets      | `projectDatasets`                                                                                     | `datasets_updated`                                         | —                                  |
| Installed modules     | `projectModules`                                                                                      | `modules_updated`                                          | —                                  |
| Metrics / indicators  | `metrics`, `commonIndicators`, `icehIndicators`                                                       | `modules_updated` (derived)                                | —                                  |
| HFA taxonomy          | `hfaTaxonomy`                                                                                         | `starting` only (no update event)                          | —                                  |
| Visualizations        | `visualizations`, `visualizationFolders`                                                              | `visualizations_updated` / `visualization_folders_updated` | —                                  |
| Slide decks           | `slideDecks`, `slideDeckFolders`                                                                      | `slide_decks_updated` / `slide_deck_folders_updated`       | —                                  |
| Reports               | `reports`, `reportFolders`                                                                            | `reports_updated` / `report_folders_updated`               | —                                  |
| Dashboards            | `dashboards`                                                                                          | `dashboards_updated`                                       | —                                  |
| Project users         | `projectUsers`                                                                                        | `project_users_updated`                                    | —                                  |
| Module dirty states   | `moduleDirtyStates`, `moduleLastRun`, `moduleLastRunGitRef`                                           | `module_dirty_state`                                       | `moduleLastRun[moduleId]`          |
| Any running           | `anyRunning`                                                                                          | `any_running`                                              | —                                  |
| Per-entity timestamps | `lastUpdated` — nested `Record<LastUpdateTableName, Record<string, string>>`                          | `last_updated`                                             | `lastUpdated[tableName][entityId]` |
| Current user          | `currentUserEmail` (`starting` only), `thisUserRole` (deprecated), `thisUserPermissions` (re-derived) | `project_users_updated`                                    | —                                  |

The table-name list for `lastUpdated` has one source of truth:
`LastUpdateTableName` in `lib/types/project_dirty_states.ts`.

**Derived lookup maps:** `project/t1_store.ts` maintains internal maps
(`metricToModule`, `resultsObjectToModule`, `metricToFormatAs`) recomputed
whenever `projectModules`/`metrics` update, exposed via snapshot getters
(`getModuleIdForMetric()`, `getModuleIdForResultsObject()`,
`getFormatAsForMetric()`). T2 caches use them to resolve module-based version
keys. No separate file.

**`aiContext` quirk:** only the `updateProject` route sends `aiContext` in
`project_config_updated`; routes that change just `isLocked` /
`isCentralReporting` omit it (optional in the payload).

## T2 — reactive cache

Medium-to-heavy data too large for SSE, cached in memory + IndexedDB via
`createReactiveCache` (`client/src/state/_infra/reactive_cache.ts`), version-
keyed by T1 fields. Live consumption is panther's createEffect+StateHolder
pattern with one app-specific binding: **the tracked read is a T1 version key**
(`projectState.lastUpdated.X[id]`, `instanceState.*Version`) — never a locally
flipped version signal.

**App override of the panther base pattern — never refetch after a mutation.**
Panther's canonical actions pass `query.silentFetch` as a success callback; this
app forbids post-mutation `silentFetch()` / `fetch()` / manual `refresh()`
absolutely. Server route handlers already call `notifyLastUpdated(...)`; SSE
flips the version key; the watching `createEffect` re-runs; the cache misses. A
manual refetch duplicates work and races SSE. If you want to "refresh" a
`createQuery` after a mutation, that view is long-lived enough that it must
become a live read — convert it.

### Variant A vs Variant B

Two invalidation shapes with different loading-state semantics:

- **Variant A — whole-collection.** One version key invalidates the entire
  collection; when it flips, every row is suspect, so **show loading on every
  effect re-run** (panther "Reactive Data (live)" code, with the
  `setData({ status: "loading" })` inside the effect).
- **Variant B — per-entity.** The key is `lastUpdated.{table}[entityId]`; a flip
  means one incremental change to the entity the user is looking at, so **never
  set loading on re-runs** — initialize the signal to `loading` once and let
  stale data stay visible (panther "Stale-while-revalidate" code). Error
  replacing stale data on a failed refetch is the accepted trade-off.

Assignments: instance T2 = Variant A (exception: the ICEH display consumer uses
the Variant B no-flash pattern); project per-entity caches = Variant B;
`moduleLastRun`-keyed caches (PO items, metric info, replicant options) =
Variant A — a module re-run changes all its outputs at once.

**Mandatory stale-response guard for Variant B** (not in panther): a rapid SSE
burst — two version flips before the first fetch resolves — lets the older
response overwrite the fresher. Guard every Variant B effect:

```tsx
createEffect(() => {
  const _v = projectState.lastUpdated.dashboards[id]; // reactive read for tracking
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  async function load() {
    // No setData({ status: "loading" }) — Variant B leaves stale data visible.
    const res = await getDashboardDetailFromCacheOrFetch(projectId, id);
    if (controller.signal.aborted) return; // discard if superseded
    setData(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  }
  load();
});
```

### Cache inventory — instance

All use `createReactiveCache` with `pdsNotRequired: true`, except GeoJSON.

| Data                               | File                        | Version key(s)                                                       |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| HMIS display items (data rows)     | `instance/t2_datasets.ts`   | `datasetVersions.hmis` + `indicatorMappingsVersion` + `maxAdminArea` |
| HFA display items (data rows)      | `instance/t2_datasets.ts`   | `hfaCacheHash`                                                       |
| ICEH display items (data rows)     | `instance/t2_datasets.ts`   | `icehCacheHash`                                                      |
| HFA dictionary (variable metadata) | `instance/t2_datasets.ts`   | `hfaCacheHash`                                                       |
| Indicator full list (mappings)     | `instance/t2_indicators.ts` | `indicatorMappingsVersion`                                           |
| HFA indicator full list            | `instance/t2_indicators.ts` | `hfaIndicatorsVersion`                                               |
| Calculated indicators              | `instance/t2_indicators.ts` | `calculatedIndicatorsVersion`                                        |
| Structure items (facility/admin)   | `instance/t2_structure.ts`  | `structureLastUpdated` + `maxAdminArea` + `facilityColumnsHash`      |
| GeoJSON map data                   | `instance/t2_geojson.ts`    | `uploadedAt` per admin level                                         |

- **HMIS special case:** the display cache is bypassed entirely (no read, no
  write) while `hmisImportRunActive` — "revisit at same version = cache hit"
  does not hold during a live DHIS2 run.
- **GeoJSON is bespoke:** a preloaded memory-Map + idb-keyval cache (preloaded
  on `starting` / `geojson_maps_updated`), with non-reactive sync reads via
  `getGeoJsonSync(level)` — not `createReactiveCache`.

### Cache inventory — project

| Data                          | File                                 | Version key(s)                                           | Variant |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------- | ------- |
| Dashboard detail (with items) | `project/t2_dashboards.ts`           | `lastUpdated.dashboards[dashboardId]`                    | B       |
| PO detail (config, metadata)  | `project/t2_presentation_objects.ts` | `lastUpdated.presentation_objects[poId]`                 | B       |
| PO items (data rows)          | `project/t2_presentation_objects.ts` | `moduleLastRun[moduleId]` + `datasetsVersionKey`         | A       |
| Metric info                   | `project/t2_presentation_objects.ts` | `moduleLastRun[moduleId]` + `datasetsVersionKey`         | A       |
| Replicant options             | `project/t2_replicant_options.ts`    | `moduleLastRun[moduleId]` + `datasetsVersionKey`         | A       |
| Slide content                 | `project/t2_slides.ts`               | `lastUpdated.slides[slideId]`                            | B       |
| Slide deck detail             | `project/t2_slide_decks.ts`          | `lastUpdated.slide_decks[deckId]`                        | B       |
| Image blobs                   | `project/t2_images.ts`               | URL-keyed (`TimCacheD`, immutable, with failure backoff) | —       |

`t2_images.ts` is not a reactive cache: it uses `TimCacheD`
(`_infra/indexeddb_cache.ts`) with the URL as both key and version, never reads
`ProjectState`, and is not SSE-invalidated. Correct because image URLs are
immutable.

### Sentinel versions

Two special version strings mark "not ready"; `setPromise` refuses to persist
under either (exact match):

- `"pds_not_ready"` — produced by `reactive_cache.ts` itself when the project
  store isn't ready (`!pds.isReady` without `pdsNotRequired`).
- `"unknown"` — produced by `versionKey` callbacks when the entity's version
  input doesn't exist yet, e.g.
  `pds.lastUpdated.slide_decks[newDeckId] ?? "unknown"`.

Caveat: the guard is exact-match only. Composite keys embedding the token (e.g.
`` `unknown|<datasetsVersionKey>` `` from the `moduleLastRun`-keyed caches) ARE
cached. Benign — when the module later runs, the version flips and the entry is
never read again — but any new composite key must keep that self-correcting
property.

### Heavy entity detail — always through a cache

If a component listens to `lastUpdated` and refetches on SSE, that refetch MUST
go through a T2 cache. Uncached SSE-triggered refetches (raw `serverActions.*`
inside a version-watching `createEffect`) are banned — they bypass
memory/IndexedDB and add server load.

### Edit-draft read mode

Some editors intentionally decouple from SSE: snapshot-at-open, free local
editing, explicit save (or autosave with optimistic concurrency via a
`lastUpdated` round-trip). A live update merged into an in-progress draft would
overwrite the user's work — these are NOT live-read violations. Canonical
markers:

- Entity loaded once on open (`createQuery` in the viz editor, `onMount` fetch
  in the report editor — either is fine).
- The component holds its own draft signal/store (not the T2 cache or T1 store).
- Save sends the draft; the server bumps `lastUpdated`; SSE propagates to
  _other_ views.
- The editor does not subscribe to `lastUpdated` for that entity.

Correct for: viz editor, report editor, slide settings editor, deck style
editor. Wrong for: dashboards (live multi-user editing), slide lists (SSE keeps
ordering fresh).

### Imperative listener side-channel

Two sanctioned ephemeral-event hooks in `client/src/state/project/t1_sse.tsx`
for consumers that need event notification without subscribing to the store:

- `addLastUpdatedListener(fn)` — fires on every `last_updated` SSE event with
  `(tableName, ids, timestamp)`. Used by `project_ai/index.tsx` to feed entity
  changes into the AI conversation.
- `addRScriptListener(fn)` — fires on every `r_script` SSE event with
  `(moduleId, text)`. Streams R execution logs to the module log panel.

Both return a cleanup function; register in `onMount`, clean up in `onCleanup`.

## T3 — on-demand fetch

Fetched fresh every time (mechanics: panther `createQuery` one-shot). Not
reactive, not cached, no state files. **Upload attempts are always T3
component-local** — transient per-user workflow state (signal + polling), not
shared.

Instance-level: structure / HMIS / HFA / ICEH upload attempts (each in its
dataset component), HMIS DHIS2 import runs + ledger
(`instance_dataset_hmis/dhis2_run/`), user logs, HMIS version history modal,
compare-projects modal, HFA indicator R code
(`indicator_manager_hfa/hfa_indicator_code_editor.tsx`), user-permission
editors, instance meta modal, profile refresh, and the `LoggedInWrapper.tsx`
bootstrap fetches (GlobalUser, InstanceMeta — needed before SSE connects).

Project-level: module execution logs (`view_logs.tsx`), module R script source
(`view_script.tsx`), module config selections (`settings_generic.tsx`), module
files modal (`view_files.tsx` — renders download links from its
`resultsObjectIds` prop; content fetched on download), backup creation trigger
(`create_backup_form.tsx`).

## T4 — client-persistent

| Data                              | File                         | Storage                 |
| --------------------------------- | ---------------------------- | ----------------------- |
| AI documents (Anthropic file IDs) | `project/t4_ai_documents.ts` | IndexedDB (per project) |
| UI prefs                          | `t4_ui.ts`                   | localStorage + signals  |
| Connection monitor                | `t4_connection_monitor.ts`   | module-level signals    |

`moduleLatestCommits` (in `t4_ui.ts`) is server data fetched once per session
and never SSE-updated — a "session-cached server data" variant that doesn't fit
T1–T5 cleanly; treat as T4. There is currently no instance-scoped T4 file (DHIS2
credentials moved server-side).

## T5 — component-local

`createSignal()` inside a component: search text, selected tabs, loading flags,
form inputs, AI chat drafts. Dies on unmount; no files.

## Open items

- `client/src/components/project/view_files.tsx:27` — dead fetch: an `rLogs`
  `createQuery` calls `getLogs` on every modal open but the result is never used
  (copy-paste from `view_logs.tsx`). Remove.
- `lib/types/project_sse.ts:30` — `thisUserRole` is deprecated ("kept with
  hardcoding bug intact") but still ships on every `starting` payload. Remove
  the field or fix the derivation.
- [PLAN_SNAPSHOT_NAMING.md](PLAN_SNAPSHOT_NAMING.md) — deferred `getSnapshot*`
  rename for the T1 snapshot getters (its F12 ordering blocker has landed).

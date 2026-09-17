# PROTOCOL (App): Client State Tiers

> **App-specific protocol** (not panther's cross-project `PROTOCOL_*`): the
> T1–T5 client-state tier model, the app-specific read/write rules, and the
> state inventory. Read it when building anything that holds or fetches
> client state. The state _machinery_ (stores, `_infra/`, SSE bridges) is
> owned by S3; the server-side producer (BroadcastChannel → SSE, notify
> catalog, `last_updated` coupling) is
> [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).
>
> **Base layer, read first and never restated here:** the generic construction
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
| T1   | SSE store         | Server pushes to client                    | Yes: real-time, multi-user                      | `t1_*`                              |
| T2   | Reactive cache    | Client fetches, version-keyed by T1 fields | Yes: refetches when the T1 version key changes  | `t2_*`                              |
| T3   | On-demand fetch   | Client fetches                             | No: fetched fresh every time, not cached        | None, lives in components           |
| T4   | Client-persistent | Originates on client                       | No                                              | `t4_*`                              |
| T5   | Component-local   | Originates on client                       | No                                              | None, `createSignal` in components  |

State files carry their tier prefix so files sort by tier; T3 and T5 have no
files by definition. T4 vs T5: T4 state must survive component unmount
(localStorage/sessionStorage/IndexedDB/module-level signals); T5 dies with it.

```text
client/src/state/
  instance/                ← instance-scoped T1 + T2
  products/                ← product-scoped T2 + T4
  _infra/                  ← cache infrastructure (reactive_cache, indexeddb_cache, request_queue)
  t4_ui.ts                 ← cross-cutting T4 (UI prefs)
  t4_connection_monitor.ts ← cross-cutting T4
  clear_caches.ts          ← utility
```

## T1: SSE store

One store, five files:

| Concern                          | File                                                |
| -------------------------------- | --------------------------------------------------- |
| Types (state shape, SSE events)  | `lib/types/instance_sse.ts`                         |
| Server notifications             | `server/task_management/notify_instance_updated.ts` |
| Server SSE endpoint              | `server/routes/instance/instance-sse.ts`            |
| Client store + getters           | `client/src/state/instance/t1_store.ts`             |
| Client SSE connection + boundary | `client/src/state/instance/t1_sse.tsx`              |

**Write path: SSE only. NEVER write T1 state from components.** Component calls
mutation API → server route handler mutates → calls a `notifyInstance*(...)`
function → BroadcastChannel → SSE endpoint → client handler in `t1_sse` → store
setter. The setters in `t1_store` are called by the SSE handler only.

**T1 read mechanics.** Importing the store directly (`instanceState`) in
JSX / `createEffect` / `createMemo` is a **live read**:
Solid tracks field-level dependencies. The exported getter functions call
`unwrap()` internally and are **snapshot reads**: use them in async code, cache
version-key callbacks, and event handlers. Snapshot-read getters are named
`getSnapshot*` (`getSnapshotInstanceState()`,
`getSnapshotInstanceLocalization()`) so the read mode is visible at the call
site. Generic live/snapshot semantics:
PROTOCOL_UI_STATE "Read Modes". (The codebase also uses "snapshot" for _stored_
snapshots, e.g. `FigureBundle.snapshotAt`, viz data persisted onto a slide.
Same concept, persisted.)

**Boundary component.** `InstanceSSEBoundary` owns the connection lifecycle
(`onMount` connect, `onCleanup` disconnect) and gates children on `isReady`.
Children import state directly: no Context, no hooks, no prop threading;
`t1_store` exports every access pattern (reactive store, snapshot getters,
derived lookups) from the one file.

### Instance T1 fields

| Data                  | Fields on `InstanceState`                                                                                                                  | SSE event                    | Version key for T2                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- |
| Immutable per session | `instanceName`, `instanceLanguage`, `instanceCalendar`, `instanceFiscalYear`, `countryIso3` (all env-sourced; `countryIso3` also rides `config_updated`, unchanged) | `starting` only              | none                                    |
| Instance config       | `structureSchemaHmis`, `structureSchemaHfa`, `adminAreaLabels`, `dhis2ConnectionUrl`, `aiContext`                                          | `config_updated`             | none                                    |
| Products              | `products` (full `ProductSummary[]`, maintained PER ROW: `products_upserted` carries only the changed rows, `products_deleted` the ids)     | `products_upserted` / `products_deleted` | `lastUpdated.products[id]` (the row's own stamp, written from the summary) |
| Folders               | `folders` (full `Folder[]`)                                                                                                                | `folders_updated`            | none                                    |
| Ready packages        | `readyPackages` (`ReadyPackage[]`, approved users; the `runsCatalog` idiom: `starting` fill plus a refetch on the catalogue nonce)         | `runs_catalog_updated`       | none                                    |
| Product stamps        | `lastUpdated.slides[id]`                                                                                                                   | `last_updated` (`slides` only) | `lastUpdated.slides[id]`                |
| Users                 | `users` (full `OtherUser[]`)                                                                                                               | `users_updated`              | none                                    |
| Assets                | `assets` (full `AssetInfo[]`)                                                                                                              | `assets_updated`             | none                                    |
| GeoJSON maps          | `geojsonMaps` (full `GeoJsonMapSummary[]`)                                                                                                 | `geojson_maps_updated`       | none                                    |
| Runs catalogue        | `runsCatalog` (full `RunCatalogItem[]`), `runsCatalogSignal` (nonce)                                                                       | `runs_catalog_updated`       | none                                    |
| Pinned package        | `pinnedRunId` (bare id, `null` = nothing pinned; unfiltered, every client)                                                                 | `pinned_run_updated`         | none                                    |
| Structure summary     | `structure` (counts), `structureLastUpdated`                                                                                               | `structure_updated`          | `structureLastUpdated`                  |
| HFA weights           | `hfaWeights`                                                                                                                               | `structure_updated`          | none                                    |
| Indicator summary     | `indicators` (counts), `indicatorsVersion`, `countIndicatorsVersion`, `hfaIndicatorsVersion`                                 | `indicators_updated`         | all three version fields                |
| HMIS dataset summary  | `datasetsWithData`, `datasetVersions.hmis`, `hmisNVersions`, `hmisImportRunActive`, `hmisImportRunsQueued`, `hmisScheduledImportAttention` | `datasets_updated`           | `datasetVersions.hmis` + structure hash |
| HFA dataset summary   | `datasetsWithData`, `datasetVersions.hfa`, `hfaTimePoints`, `hfaCacheHash`                                                                 | `datasets_updated`           | `hfaCacheHash`                          |
| ICEH dataset summary  | `icehCacheHash`                                                                                                                            | `datasets_updated`           | `icehCacheHash`                         |
| Population store      | `populationLevel` (the setting, undefined until set), `populationRowCount`, `populationCoverage` (per type vs the HMIS structure at that level), `populationLastUpdated` | `population_updated`         | `populationLastUpdated`                 |
| Current user          | `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, `currentUserPermissions`                                            | `users_updated` (re-derived) | none                                    |

**Per-connection fields:** `currentUser*` are per-user, re-derived by finding
the current user in the broadcast list on `users_updated`. `runsCatalog` is
per-user by a signal-plus-own-fetch shape: run labels
must not fan out (Q-B), so `runs_catalog_updated` carries only a data-free
NONCE (`crypto.randomUUID()`, not a timestamp: two same-millisecond
mutations minted identical ISO strings and the store's equality guard
silently dropped the second refetch; a nonce cannot collide and needs no
cross-worker counter coordination) and each entitled client
(`can_configure_data` / global-admin) fetches `listRunCatalog` through its
per-request guard; the boundary's effect also tracks the user's OWN
entitlement, so a mid-session grant fetches the catalogue and a revocation
clears it to `[]`, live, with no connection-captured gating. The starting
payload fills it per user, AND stamps a fresh nonce, so the
boundary refetches after every `starting`. RULED DELIBERATE (2026-08-15),
not waste: that refetch is what makes reconnect self-healing (backfill runs
and any missed signal surface there); the payload fill exists to prevent an
empty flash while it resolves, and `defer: true` only skips the mount-time
no-op run. A failed boundary catalogue fetch only console-errors, keeping
stale rows visible: accepted. The
ephemeral `run_progress`/`r_script` filter on the instance channel is also
live (re-derived from each `users_updated` in the forward loop). See
SYSTEM_03 †. `users` is `[]` for an UNAPPROVED connection (starting payload
and every `users_updated`, until a roster names them. SYSTEM_03 †). All
other fields are identical across clients.

The table-name list for `lastUpdated` (a nested
`Record<LastUpdateTableName, Record<string, string>>`) has one source of truth:
`LastUpdateTableName` in `lib/types/last_updated_tables.ts`.

### The collab WS store: T1-adjacent

`state/instance/collab.ts` (S16) is the one deliberate sibling of the T1
store outside the `t1_*` naming: the instance-wide collaboration WebSocket
manager, holding a Solid store of presence peers plus the per-document Yjs
session handles (each opened with its product id). It follows T1 discipline:
server-pushed only (the WS `presence_state`/awareness handlers are the sole
store writers; components never write it), connected by
`InstanceSSEBoundary` once the user is approved and disconnected with the
SSE connection. Its transport, however, is the
collab WebSocket rather than SSE, and its Y.Doc sessions are imperative
edit-draft machinery owned by the editor bridges, not reactive state. Read presence via
the exported accessors (`otherPeers()` etc.). Machinery and protocol:
[SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md).

## T2: reactive cache

Medium-to-heavy data too large for SSE, cached in memory + IndexedDB via
`createReactiveCache` (`client/src/state/_infra/reactive_cache.ts`), version-
keyed by T1 fields. Live consumption is panther's createEffect+StateHolder
pattern with one app-specific binding: **the tracked read is a T1 version key**
(`instanceState.lastUpdated.X[id]`, `instanceState.*Version`), never a locally
flipped version signal.

**App override of the panther base pattern: never refetch after a mutation.**
Panther's canonical actions pass `query.silentFetch` as a success callback; this
app forbids post-mutation `silentFetch()` / `fetch()` / manual `refresh()`
absolutely. Server route handlers already call `notifyInstance*(...)`; SSE
flips the version key; the watching `createEffect` re-runs; the cache misses. A
manual refetch duplicates work and races SSE. If you want to "refresh" a
`createQuery` after a mutation, that view is long-lived enough that it must
become a live read. Convert it.

### Variant A vs Variant B

Two invalidation shapes with different loading-state semantics:

- **Variant A, whole-collection.** One version key invalidates the entire
  collection; when it flips, every row is suspect, so **show loading on every
  effect re-run** (panther "Reactive Data (live)" code, with the
  `setData({ status: "loading" })` inside the effect).
- **Variant B, per-entity.** The key is `lastUpdated.{table}[entityId]`; a flip
  means one incremental change to the entity the user is looking at, so **never
  set loading on re-runs**: initialize the signal to `loading` once and let
  stale data stay visible (panther "Stale-while-revalidate" code). Error
  replacing stale data on a failed refetch is the accepted trade-off.

Assignments: instance T2 = Variant A (exception: the ICEH display consumer uses
the Variant B no-flash pattern); product per-entity caches = Variant B;
run-keyed caches are immutable by identity (the products inventory below).

**Mandatory stale-response guard for Variant B** (not in panther): a rapid SSE
burst (two version flips before the first fetch resolves) lets the older
response overwrite the fresher. Guard every Variant B effect:

```tsx
createEffect(() => {
  const _v = instanceState.lastUpdated.products[productId]; // reactive read for tracking
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  async function load() {
    // No setData({ status: "loading" }): Variant B leaves stale data visible.
    const res = await getReportDetailFromCacheOrFetch(productId);
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

### Cache inventory: instance

All use `createReactiveCache`, except GeoJSON.

| Data                               | File                        | Version key(s)                                                       |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| HMIS display items (data rows)     | `instance/t2_datasets.ts`   | `datasetVersions.hmis` + `countIndicatorsVersion` (the analysed count rows only, a calculated-definition edit changes nothing here) + `structureLastUpdated` (HMIS schema hash in uniqueness keys)  |
| HFA display items (data rows)      | `instance/t2_datasets.ts`   | `hfaCacheHash`                                                       |
| ICEH display items (data rows)     | `instance/t2_datasets.ts`   | `icehCacheHash`                                                      |
| HFA dictionary (variable metadata) | `instance/t2_datasets.ts`   | `hfaCacheHash`                                                       |
| Indicator full list                | `instance/t2_indicators.ts` | `indicatorsVersion` (the FULL stamp: every indicator row, whatever its type)         |
| HFA indicator full list            | `instance/t2_indicators.ts` | `hfaIndicatorsVersion`                                               |
| Structure items (facility/admin)   | `instance/t2_structure.ts`  | `family` + `structureLastUpdated` + `hashStructureSchema(family)`    |
| GeoJSON map data                   | `instance/t2_geojson.ts`    | `uploadedAt` per (family, admin level)                               |
| Population type store (the grid)   | `instance/t2_population.ts` | `populationLastUpdated` (bumped by every store write) + `structureLastUpdated` (rows are laid out against the structure) |
| Results-package detail (settings + files per module) | `instance/t2_runs.ts` | `[runId]` + constant `"immutable"`: immutable-by-identity like `t2_images`; never invalidated (a ready run dir never changes)  |

- **HMIS special case:** the display cache is bypassed entirely (no read, no
  write) while `hmisImportRunActive`: "revisit at same version = cache hit"
  does not hold during a live DHIS2 run.
- **GeoJSON is bespoke:** a preloaded memory-Map + idb-keyval cache (preloaded
  on `starting` / `geojson_maps_updated`), with non-reactive sync reads via
  `getGeoJsonSync(family, level)`, not `createReactiveCache`.

### Cache inventory: products

Version keys read `InstanceState` through the cache's `versionKey(params, ins)`
callback (no readiness gate; an absent stamp yields the `"unknown"` sentinel).

| Data                          | File                                 | Version key(s)                                           | Variant |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------- | ------- |
| Slide content                 | `products/t2_slides.ts`              | `lastUpdated.slides[slideId]` (uniqueness: the slide id; the product id only scopes the wire) | B |
| Slide deck detail             | `products/t2_slide_deck_detail.ts`   | `lastUpdated.products[productId]`                        | B       |
| Report detail                 | `products/t2_report_detail.ts`       | `lastUpdated.products[productId]`                        | B       |
| Figure data (PO items, metric info) | `products/t2_figure_data.ts`   | constant `"immutable"`; `(runId, scopeToken, …)` in the uniqueness key | A |
| Replicant options             | `products/t2_replicant_options.ts`   | constant `"immutable"`; `(runId, scopeToken, …)` in the uniqueness key | A |
| Run authoring context         | `instance/t2_run_authoring_context.ts` | `[runId]` + constant `"immutable"`                     | A       |
| Image blobs                   | `products/t2_images.ts`              | URL-keyed (`TimCacheD`, immutable, with failure backoff) | none    |

`t2_images.ts` is not a reactive cache: it uses `TimCacheD`
(`_infra/indexeddb_cache.ts`) with the URL as both key and version, never reads
the T1 store, and is not SSE-invalidated. Correct because image URLs are
immutable.

`instance/t2_runs.ts` is the second immutable-by-identity cache, built on
`createReactiveCache` with a constant version key: a results package's detail
never changes once the run is ready, so nothing invalidates it. Bump the
cache name when `RunDetail` changes shape.

### Sentinel version

The version string `"unknown"` marks "not ready": `versionKey` callbacks
return it when the entity's version input doesn't exist yet, e.g.
`ins.lastUpdated.slides[slideId] ?? "unknown"`, and `setPromise` refuses to
persist under it.

Caveat: the guard is exact-match only. A composite key embedding the token IS
cached. That is benign only while the entry self-corrects: when the entity's
`last_updated` later arrives, the version flips and the entry is never read
again. Any composite key must keep that property.

### Heavy entity detail: always through a cache

If a component listens to `lastUpdated` and refetches on SSE, that refetch MUST
go through a T2 cache. Uncached SSE-triggered refetches (raw `serverActions.*`
inside a version-watching `createEffect`) are banned: they bypass
memory/IndexedDB and add server load.

### Edit-draft read mode

Some editors intentionally decouple from SSE: snapshot-at-open, free local
editing, explicit save (or autosave with optimistic concurrency via a
`lastUpdated` round-trip). A live update merged into an in-progress draft would
overwrite the user's work. These are NOT live-read violations. Canonical
markers:

- Entity loaded once on open (`createQuery` in the figure editor, `onMount`
  fetch in the report editor, either is fine).
- The component holds its own draft signal/store (not the T2 cache or T1 store).
- Save sends the draft; the server bumps `lastUpdated`; SSE propagates to
  _other_ views.
- The editor does not subscribe to `lastUpdated` for that entity.

Correct for: figure editor, report editor, slide deck settings editor, deck
style editor. Wrong for: slide lists (SSE keeps ordering fresh).

### Imperative listener side-channel

One sanctioned ephemeral-event hook per channel for consumers that need
event notification without subscribing to the store:

- `addLastUpdatedListener(fn)` in `client/src/state/instance/t1_sse.tsx`:
  fires with `(tableName, ids, timestamp)` for the `last_updated` message
  (`slides`) and for every row of `products_upserted` (`products`, the
  product's own stamp). Used by the slide and report editors to keep their
  optimistic-save timestamp fresh under collab checkpoints, and by the copilot
  to notice slide edits and changes to its product.

Returns a cleanup function; register in `onMount`, clean up in `onCleanup`.
The instance channel also has the pair for generation telemetry
(`addInstanceRunProgressListener` / `addInstanceRScriptListener`).

## T3: on-demand fetch

Fetched fresh every time (mechanics: panther `createQuery` one-shot). Not
reactive, not cached, no state files. **Upload attempts are always T3
component-local**: transient per-user workflow state (signal + polling), not
shared.

Instance-level: structure upload attempts (in the structure dataset
component), HMIS import runs (`instance_dataset_hmis/imports/`: the shell's
`createQuery` reads for runs, scheduling and indicator labels; the runs poll
and both runs and scheduling refresh on the SSE summary flags) and the
HMIS import ledger (`instance_dataset_hmis/index.tsx`: a full-table read into
the page's `createSignal<StateHolder>`, refetched by a `createEffect` on
`datasetVersions.hmis` and `hmisImportRunActive`; SYSTEM_06), HFA
import runs (`instance_dataset_hfa/imports/`), ICEH import runs
(`instance_dataset_iceh/imports/`), user logs, HMIS version history modal,
HFA indicator R code
(`indicator_manager_hfa/hfa_indicator_code_editor.tsx`), user-permission
editors, instance meta modal, profile refresh, the results-package wizard's
module options + defaults
(`instance_results_packages/_wizard/index.tsx`, read once per open,
client-local until launch), and the `LoggedInWrapper.tsx` bootstrap fetches
(GlobalUser, InstanceMeta, needed before SSE connects).

Run-keyed: a package's script / log bytes and a failed run's
file listing (`_shared/results_package/view_{script,logs,files}.tsx`).

## T4: client-persistent

| Data                              | File                          | Storage                                                     |
| --------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| AI documents (Anthropic file IDs) | `products/t4_ai_documents.ts` | IndexedDB (uploads instance-wide, pending per conversation) |
| UI prefs                          | `t4_ui.ts`                    | localStorage + signals                                      |
| Connection monitor                | `t4_connection_monitor.ts`    | module-level signals                                        |

There is no instance-scoped T4 file (DHIS2 credentials are held server-side).

## T5: component-local

`createSignal()` inside a component: search text, selected tabs, loading flags,
form inputs, AI chat drafts. Dies on unmount; no files.


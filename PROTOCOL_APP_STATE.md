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
  instance/                ← instance T1 (store + SSE) + instance-scoped T2 + the collab socket
  products/                ← product-scoped T2 + T4
  _infra/                  ← cache infrastructure (reactive_cache, indexeddb_cache, request_queue)
  t4_ui.ts                 ← cross-cutting T4 (UI prefs)
  t4_connection_monitor.ts ← cross-cutting T4
  clear_caches.ts          ← utility
```

## T1 — SSE store

**ONE store, one channel.** Everything the app pushes rides the instance
channel (D8).

| Concern                          | File                                                |
| -------------------------------- | --------------------------------------------------- |
| Types (state shape, SSE events)  | `lib/types/instance_sse.ts`                         |
| Server notifications             | `server/task_management/notify_instance_updated.ts` |
| Server SSE endpoint              | `server/routes/instance/instance-sse.ts`            |
| Client store + getters           | `client/src/state/instance/t1_store.ts`             |
| Client SSE connection + boundary | `client/src/state/instance/t1_sse.tsx`              |

**Write path — SSE only. NEVER write T1 state from components.** Component calls
mutation API → server route handler mutates → calls `notifyInstanceUpdate(...)`
/ `notifyProductsUpserted(...)` / `notifyLastUpdated(...)` → BroadcastChannel →
SSE endpoint → client handler in `t1_sse` → store setter. The setters in
`t1_store` are called by the SSE handler only.

**T1 read mechanics.** Importing `instanceState` directly in JSX /
`createEffect` / `createMemo` is a **live read** — Solid tracks field-level
dependencies. The exported getter functions call `unwrap()` internally and are
**snapshot reads** — use them in async code, cache version-key callbacks, and
event handlers. Snapshot-read getters are named `getSnapshot*`
(`getSnapshotInstanceState()`, `getSnapshotInstanceLocalization()`,
`getSnapshotInstanceCountryIso3()`) so the read mode is visible at the call
site. Generic live/snapshot semantics: PROTOCOL_UI_STATE "Read Modes". (The
codebase also uses "snapshot" for _stored_ snapshots — e.g.
`FigureBundle.snapshotAt`, figure data persisted onto a slide. Same concept,
persisted.)

**A product's pair is read LIVE, never snapshotted (D16).** The editors take a
`productId` and read `runId`/`adminArea2` off the tracked T1 row, so a reattach
or scope change mid-edit moves the editor's reads with it and the D4 stale
badges light up. `snapshotForSlideEditor` snapshots only what must not move
under the open editor (the deck config at open).

**One edit gate.** `canEditProducts()` (`t1_store.ts`) = the current user is
approved. Every product-surface `canEdit` reads that one function, so a later
permission model replaces a function rather than twenty scattered checks (D2).

**Boundary component.** `InstanceSSEBoundary` owns the connection lifecycle
(`onMount` connect, `onCleanup` disconnect), gates children on `isReady`, and
also owns the collab socket: it connects/disconnects `state/instance/collab.ts`
on `currentUserApproved`, since that socket admits approved users only.
Children import state directly — no Context, no hooks, no prop threading;
`t1_store` exports every access pattern (reactive store, snapshot getters,
derived lookups like `productById`) from the one file.

**Reset on user switch, not on reconnect.** `resetInstanceState()` reconciles
back to `EMPTY_INSTANCE_STATE` (including `isReady: false`) so a Clerk cross-tab
user switch can never render the previous user's products, permissions, roster
or catalogue. `isReady` is NOT unset on a same-user reconnect — stale data stays
visible while reconnecting. The unapproved → approved transition calls
`reconnectForApproval()` (SSE disconnect/connect + collab connect), because
approval unlocks the whole `starting` payload at once.

### Instance T1 fields

| Data                  | Fields on `InstanceState`                                                                                                                  | SSE event                    | Version key for T2                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- |
| Immutable per session | `instanceName`, `instanceLanguage`, `instanceCalendar`, `instanceFiscalYear`, `countryIso3` (all env-sourced)                              | `starting` only              | —                                       |
| Instance config       | `structureSchemaHmis`, `structureSchemaHfa`, `adminAreaLabels`, `dhis2ConnectionUrl`, `aiContext`                                           | `config_updated`             | —                                       |
| Products              | `products` (full `ProductSummary[]`)                                                                                                       | `products_upserted` (per row) / `products_deleted` | `lastUpdated.products[id]` |
| Folders               | `folders` (full `Folder[]` — `{id, label, color, parentId, lastUpdated}`; the tree is derived client-side)                                 | `folders_updated`            | —                                       |
| Ready packages        | `readyPackages` (`{id, label, createdAt}[]`)                                                                                               | `starting` + `runs_catalog_updated` refetch | —                        |
| Per-entity timestamps | `lastUpdated` — `{ products, slides }`, each `Record<id, ts>`                                                                              | `products_upserted` (products) / `last_updated` (slides) | `lastUpdated[table][id]` |
| Users                 | `users` (full `OtherUser[]`)                                                                                                               | `users_updated`              | —                                       |
| Assets                | `assets` (full `AssetInfo[]`)                                                                                                              | `assets_updated`             | —                                       |
| GeoJSON maps          | `geojsonMaps` (full `GeoJsonMapSummary[]`)                                                                                                 | `geojson_maps_updated`       | —                                       |
| Runs catalogue        | `runsCatalog` (full `RunCatalogItem[]`), `runsCatalogSignal` (nonce)                                                                       | `runs_catalog_updated`       | —                                       |
| Pinned package        | `pinnedRunId` (bare id, `null` = nothing pinned; unfiltered — every client)                                                                | `pinned_run_updated`         | —                                       |
| Structure summary     | `structure` (counts), `structureLastUpdated`                                                                                               | `structure_updated`          | `structureLastUpdated`                  |
| HFA weights           | `hfaWeights`                                                                                                                               | `structure_updated`          | —                                       |
| Indicator summary     | `indicators` (counts), `indicatorMappingsVersion`, `hfaIndicatorsVersion`, `calculatedIndicatorsVersion`                                   | `indicators_updated`         | all three version fields                |
| HMIS dataset summary  | `datasetsWithData`, `datasetVersions.hmis`, `hmisNVersions`, `hmisImportRunActive`, `hmisImportRunsQueued`, `hmisScheduledImportAttention` | `datasets_updated`           | `datasetVersions.hmis` + structure hash |
| HFA dataset summary   | `datasetsWithData`, `datasetVersions.hfa`, `hfaTimePoints`, `hfaCacheHash`                                                                 | `datasets_updated`           | `hfaCacheHash`                          |
| ICEH dataset summary  | `icehCacheHash`                                                                                                                            | `datasets_updated`           | `icehCacheHash`                         |
| Current user          | `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, `currentUserPermissions`                                            | `users_updated` (re-derived) | —                                       |

**Per-connection fields:** `currentUser*` are per-user, re-derived by finding
the current user in the broadcast list on `users_updated`. `products`,
`folders`, `readyPackages`, `lastUpdated` and `users` are withheld entirely
from an UNAPPROVED connection by the existing roster rule (SYSTEM_03 †), which
is why approval triggers a full reconnect rather than a patch.
`readyPackages` follows the `runsCatalog` idiom exactly — a `starting` fill
plus the EXISTING `runs_catalog_updated` nonce triggering a
`listAttachableResultsPackages` refetch, no message type of its own — and it
carries `{id, label, createdAt}` only: the wide catalogue row's
progress/summary/provenance is generation telemetry and stays behind
`can_configure_data` (Q-B), so package LABELS are the whole of what D8 widens
to approved users.
`runsCatalog` is per-user by the same signal-plus-own-fetch shape: run labels
must not fan out (Q-B), so `runs_catalog_updated` carries only a data-free
NONCE (`crypto.randomUUID()`, not a timestamp — two same-millisecond
mutations minted identical ISO strings and the store's equality guard
silently dropped the second refetch; a nonce cannot collide and needs no
cross-worker counter coordination) and each entitled client
(`can_configure_data` / global-admin) fetches `listRunCatalog` through its
per-request guard; the boundary's effect also tracks the user's OWN
entitlement, so a mid-session grant fetches the catalogue and a revocation
clears it to `[]` — live, with no connection-captured gating. The starting
payload fills it per user, AND stamps a fresh nonce — so the
boundary refetches after every `starting`. RULED DELIBERATE (2026-08-15),
not waste: that refetch is what makes reconnect self-healing (backfill runs
and any missed signal surface there); the payload fill exists to prevent an
empty flash while it resolves, and `defer: true` only skips the mount-time
no-op run. A failed boundary catalogue fetch only console-errors, keeping
stale rows visible — accepted, same shape as the ready-package fetch. The
ephemeral `run_progress`/`r_script` filter on the instance channel is also
live (re-derived from each `users_updated` in the forward loop) — see
SYSTEM_03 †. `users` is `[]` for an UNAPPROVED connection (starting payload
and every `users_updated`, until a roster names them — SYSTEM_03 †). All
other fields are identical across clients.

The table-name list for `lastUpdated` has one source of truth:
`LastUpdateTableName` in `lib/types/last_updated_tables.ts` (= `products |
slides`). `products` stamps are written by `products_upserted` itself — the
per-row summary carries the row's `lastUpdated`, so the registry message and
the cache-version index cannot disagree; `last_updated` is emitted for
`slides` only.

**What deliberately does NOT ride the channel.** Everything run-derived —
modules, metrics, indicator lists, HFA taxonomy, presets — is served by the
immutable T2 `run_authoring_context` keyed by `runId` instead: a package's
contents cannot change, so there is nothing to push. A product row carries only
what a product IS (label, folder, package, scope, stamp) plus one cheap
per-type existence flag (`firstSlideId` / `hasEmbeds`) — no config, no body,
no lock, no role, no follow-the-pin flag (D2/D5).

### The collab WS store — T1-adjacent

`state/instance/collab.ts` (S16) is the one deliberate sibling of the T1
store outside the `t1_*` naming: the single instance-wide collaboration
WebSocket manager, holding a Solid store of presence peers plus the
per-document Yjs session handles. It follows T1 discipline — server-pushed
only (the WS `presence_state`/awareness handlers are the sole store writers;
components never write it), connected/disconnected by `InstanceSSEBoundary`
alongside the SSE connection, on approval — but its transport is the collab
WebSocket rather than SSE, and its Y.Doc sessions are imperative edit-draft
machinery owned by the editor bridges, not reactive state. Read presence via
the exported accessors (`otherPeers()` etc.). Presence is keyed by PRODUCT and
rooms by `docType::docId` for `slide` and `report` only. Machinery and
protocol: [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md).

## T2 — reactive cache

Medium-to-heavy data too large for SSE, cached in memory + IndexedDB via
`createReactiveCache` (`client/src/state/_infra/reactive_cache.ts`), version-
keyed by T1 fields. `versionKey` and `uniquenessKeys` take `(params,
instanceState)` — there is no second store to consult. Live consumption is
panther's createEffect+StateHolder pattern with one app-specific binding:
**the tracked read is a T1 version key** (`instanceState.lastUpdated.X[id]`,
`instanceState.*Version`) — never a locally flipped version signal.

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

Assignments: instance dataset/indicator/structure caches = Variant A (exception:
the ICEH display consumer uses the Variant B no-flash pattern); the product
per-entity caches (slide, deck detail, report detail) = Variant B. The
**immutable-by-identity** caches are neither: `run_authoring_context`,
`metric_info`, `po_items`, `replicant_options`, `t2_runs` and `t2_images` all
pin `versionKey: () => "immutable"` and put the identifying facts in
`uniquenessKeys` instead, so nothing ever invalidates them.

**Mandatory stale-response guard for Variant B** (not in panther): a rapid SSE
burst — two version flips before the first fetch resolves — lets the older
response overwrite the fresher. Guard every Variant B effect:

```tsx
createEffect(() => {
  const _v = instanceState.lastUpdated.products[id]; // reactive read for tracking
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  async function load() {
    // No setData({ status: "loading" }) — Variant B leaves stale data visible.
    const res = await getReportDetailFromCacheOrFetch(id);
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

All use `createReactiveCache`, except GeoJSON.

| Data                               | File                        | Version key(s)                                                       |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| HMIS display items (data rows)     | `instance/t2_datasets.ts`   | `datasetVersions.hmis` + `indicatorMappingsVersion` + `structureLastUpdated` (HMIS schema hash in uniqueness keys) |
| HFA display items (data rows)      | `instance/t2_datasets.ts`   | `hfaCacheHash`                                                       |
| ICEH display items (data rows)     | `instance/t2_datasets.ts`   | `icehCacheHash`                                                      |
| HFA dictionary (variable metadata) | `instance/t2_datasets.ts`   | `hfaCacheHash`                                                       |
| Indicator full list (mappings)     | `instance/t2_indicators.ts` | `indicatorMappingsVersion`                                           |
| HFA indicator full list            | `instance/t2_indicators.ts` | `hfaIndicatorsVersion`                                               |
| Calculated indicators              | `instance/t2_indicators.ts` | `calculatedIndicatorsVersion`                                        |
| Structure items (facility/admin)   | `instance/t2_structure.ts`  | `family` + `structureLastUpdated` + `hashStructureSchema(family)`    |
| GeoJSON map data                   | `instance/t2_geojson.ts`    | `uploadedAt` per (family, admin level)                               |
| Results-package detail (settings + files per module) | `instance/t2_runs.ts` | `[runId]` + constant `"immutable"` — immutable-by-identity like `t2_images`; never invalidated (a ready run dir never changes) |
| Run authoring context (modules, metrics, datasets, indicator lists, HFA taxonomy, presets) | `instance/t2_run_authoring_context.ts` | `[runId]` + `"immutable"` — derived from the run dir only, so it is immutable by identity |

- **HMIS special case:** the display cache is bypassed entirely (no read, no
  write) while `hmisImportRunActive` — "revisit at same version = cache hit"
  does not hold during a live DHIS2 run.
- **GeoJSON is bespoke:** a preloaded memory-Map + idb-keyval cache (preloaded
  on `starting` / `geojson_maps_updated`), with non-reactive sync reads via
  `getGeoJsonSync(level)` — not `createReactiveCache`.

### Cache inventory — products

| Data                         | File                            | Uniqueness / version key(s)                                             | Variant |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------ | ------- |
| Metric info (queryable shape) | `products/t2_figure_data.ts`   | `(runId, scopeToken, metricId)` + `"immutable"`                          | —       |
| Figure items (data rows)     | `products/t2_figure_data.ts`    | `(runId, scopeToken, resultsObjectId, hash(fetchConfig))` + `"immutable"` | —       |
| Replicant options            | `products/t2_replicant_options.ts` | `(runId, scopeToken, metricId, replicateBy, hash(fetchConfig))` + `"immutable"` | —  |
| Slide content                | `products/t2_slides.ts`         | `[slideId]` + `lastUpdated.slides[slideId]`                              | B       |
| Slide deck detail            | `products/t2_slide_deck_detail.ts` | `[deckId]` + `lastUpdated.products[deckId]`                           | B       |
| Report detail                | `products/t2_report_detail.ts`  | `[reportId]` + `lastUpdated.products[reportId]`                          | B       |
| Image blobs                  | `products/t2_images.ts`         | URL-keyed (`TimCacheD`, immutable, with failure backoff)                 | —       |

**Why the figure-data caches are keyed, not versioned.** A results package is
immutable, so `(runId, scopeToken)` LEADS the uniqueness key instead of
versioning the entry. That is what lets an embedded figure, a preset and Explore
hit the same entry, and it is what retired the response-side identity guard
(D8): a late response can no longer land under a key belonging to a different
package or scope, because the key already names both. `metric_info` is the one
with a `shouldStore` guard — a transient possible-values failure arrives as a
per-dimension `error` inside a successful payload, and freezing that would pin
the effective-format resolver's "cannot enumerate" fallback forever.

`t2_images.ts` is not a reactive cache: it uses `TimCacheD`
(`_infra/indexeddb_cache.ts`) with the URL as both key and version, reads no
store, and is not SSE-invalidated. Correct because image URLs are immutable.

`instance/t2_runs.ts` and `instance/t2_run_authoring_context.ts` are the
instance-side immutable-by-identity caches, built on `createReactiveCache` with
a constant version key: a results package's detail and its authoring projection
never change once the run is ready, so nothing invalidates them and every host
hits the same entry. Bump the cache name when `RunDetail` or
`RunAuthoringContext` changes shape.

### Sentinel version

One special version string marks "not ready"; `setPromise` refuses to persist
under it (exact match):

- `"unknown"` — produced by `versionKey` callbacks when the entity's version
  input doesn't exist yet, e.g.
  `ins.lastUpdated.products[newDeckId] ?? "unknown"`.

Caveat: the guard is exact-match only, so a composite key merely EMBEDDING the
token would be cached. Any such key must stay self-correcting — the entry must
become unreachable once the real version arrives.

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

- Entity loaded once on open (`createQuery` in the figure editor, `onMount`
  fetch in the report editor — either is fine).
- The component holds its own draft signal/store (not the T2 cache or T1 store).
- Save sends the draft; the server bumps `lastUpdated`; SSE propagates to
  _other_ views.
- The editor does not subscribe to `lastUpdated` for that entity.

Correct for: the figure editor, the report editor, slide settings, deck style.
Wrong for: slide lists (SSE keeps ordering fresh) and the product's own pair,
which is read live from T1 precisely so a reattach reaches the open editor.

### Imperative listener side-channel

One sanctioned ephemeral-event hook in `client/src/state/instance/t1_sse.tsx`
for consumers that need event notification without subscribing to the store:

- `addLastUpdatedListener(fn)` — fires with `(tableName, ids, timestamp)` on
  every `last_updated` SSE event AND on every `products_upserted` (as
  `("products", ids, ts)`), so one listener sees both carriers. Used by
  `components/copilot/index.tsx` to feed entity changes into the AI
  conversation.

Returns a cleanup function; register in `onMount`, clean up in `onCleanup`.
The same file has the equivalent pair for generation telemetry
(`addInstanceRunProgressListener` / `addInstanceRScriptListener`).

## T3 — on-demand fetch

Fetched fresh every time (mechanics: panther `createQuery` one-shot). Not
reactive, not cached, no state files. **Upload attempts are always T3
component-local** — transient per-user workflow state (signal + polling), not
shared.

Every T3 read is instance- or run-level. Structure
upload attempts (in the structure dataset
component), HMIS import runs + ledger (`instance_dataset_hmis/imports/` — the
ledger is a full-table read fetched only while its tab is showing, so it is
the shell's `createSignal<StateHolder>` + `createEffect` on the tab signal
plus a local `ledgerVersion` bumped by the shell's `refresh()`; SYSTEM_06), HFA
import runs (`instance_dataset_hfa/imports/`), ICEH import runs
(`instance_dataset_iceh/imports/`), user logs, HMIS version history modal,
HFA indicator R code
(`indicator_manager_hfa/hfa_indicator_code_editor.tsx`), user-permission
editors, instance meta modal, profile refresh, the results-package wizard's
module options + defaults
(`instance_results_packages/_wizard/index.tsx` — read once per open,
client-local until launch), and the `LoggedInWrapper.tsx` bootstrap fetches
(GlobalUser, InstanceMeta — needed before SSE connects).

Run-keyed: a package's script / log bytes and a failed run's file listing
(`_shared/results_package/view_{script,logs,files}.tsx`).

## T4 — client-persistent

| Data                              | File                          | Storage                                        |
| --------------------------------- | ----------------------------- | ---------------------------------------------- |
| AI documents (Anthropic file IDs) | `products/t4_ai_documents.ts` | IndexedDB, one key `ai-documents/copilot`      |
| UI prefs                          | `t4_ui.ts`                    | localStorage + signals                         |
| Connection monitor                | `t4_connection_monitor.ts`    | module-level signals                           |

`t4_ui.ts` holds: the Products page's `productsSortMode` /
`productsTypeFilter` / `productsOpenFolder` / `productsViewMode`
(localStorage-persisted),
Explore's ephemeral `exploreRunId` / `exploreAdminArea2` (signals only —
deliberately not persisted), the `schemePref` appearance preference, `showAi`,
`fitWithin`, and the three request signals the tours and deep links use
(`pendingEditorOpen`, `pendingSlideOpen`, `pendingTourReplay`). The
`?product=<id>` query-param name lives here too (`_PRODUCT_QUERY_PARAM`), since
the page consumes it into `pendingEditorOpen`.

`clear_caches.ts` splits IndexedDB on two prefixes and nothing else:
`ai-conv` / `ai-documents` are the ONLY keys a data-cache clear keeps, and the
only keys an AI-cache clear touches. Everything else is a T2 entry a re-fetch
reproduces, so no key shape has to be reasoned about — a stale one is simply
unreachable and gets swept by the next clear.

## T5 — component-local

`createSignal()` inside a component: search text, selected tabs, loading flags,
form inputs, AI chat drafts. Dies on unmount; no files.

## Open items

- **Dead exports in `t4_ui.ts`** (S14): `updateProductsView` (+ its
  `ProductsViewStateUpdates` type), `navCollapsed` and `setNavCollapsed` all
  have zero callers. Delete or re-wire.

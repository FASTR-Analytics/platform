---
system: 3
name: Realtime Sync & Cache Invalidation
globs:
  - client/src/state/_infra/indexeddb_cache.ts
  - client/src/state/_infra/reactive_cache.ts
  - client/src/state/_infra/request_queue.ts
  - client/src/state/clear_caches.ts
  - client/src/state/instance/t1_sse.tsx
  - client/src/state/instance/t1_store.ts
  - lib/types/instance_sse.ts
  - lib/types/last_updated_tables.ts
  - server/routes/instance/instance-sse.ts
  - server/task_management/build_instance_state.ts
  - server/task_management/notify_instance_updated.ts
  - server/utils/request_queue.ts
  - server/valkey/**
docs_absorbed:
---

# S3: Realtime Sync & Cache Invalidation

The `last_updated → BroadcastChannel/SSE → version-hash` triangle: the typed
notify hub, the instance SSE endpoint, the Valkey read-model cache, and the
client store/cache infrastructure. One design idea carried through every layer: **every
write bumps a version column; every read model, server Valkey entry or client
IndexedDB entry, is keyed on that version, so invalidation is implicit (the
next read misses) and nothing ever "clears a cache" on a normal write.**
Reviewed against code (first review cycle, review-only; absorbs
DOC_SSE_REALTIME + DOC_VALKEY_CACHE).

Boundaries: the client _consumer_ rules (tiers, live/snapshot reads,
never-refetch-after-mutation) are [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md).
This system owns the machinery those rules run on. The write side that bumps
version columns is **S2**
([SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)). SSE is server _push_; it
is not the request-scoped NDJSON `StreamWriter` in **S1**
(SYSTEM_01_api_contract.md). The other BroadcastChannel,
`RUN_GENERATION_ENDED_CHANNEL` (`worker_routines/generate_run/`), is **S8**'s
internal worker plumbing (SYSTEM_08_results_packages.md). It feeds no SSE
endpoint and is exempt from the notify-catalog rule.
`server/middleware/cache.ts` (`cacheMiddleware`) sets HTTP `Cache-Control`
headers on static assets, a completely different "cache", owned elsewhere. The
collaboration WebSocket layer (live Yjs deltas, presence) is **S16**
([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)), strictly additive:
its room checkpoints feed this system's triangle through the existing notify
wrappers and post nothing new to the BroadcastChannels. Sub-file custody
exceptions are in SYSTEMS.md §4.1 (`LoggedInWrapper.tsx` is owned by S1, this
system a reader).

## Contract

Every mutation must stamp `last_updated` and notify, but that obligation lives
in ~27 files owned by other systems. This system's _machinery_ is reviewed here;
its _convention_ is a standing audit (SYSTEMS.md §4.3.1).

## SSE: the producer side

Principles: (1) **mutations broadcast fresh state rather than returning it**; a
route mutates, then `notify*()`s, and clients refetch off the SSE feed (the
server half of the client never-manually-refetch rule). (2) **One typed
`notify*` wrapper per event type**: call sites never build a raw SSE message.
(3) **Subscribe before you build.** (4) **`last_updated` is the universal
version token**: the same timestamp a write bumps is broadcast to clients and
used as the cache version key.

```text
Route handler (after a successful DB write)
  │  notifyInstanceLastUpdated("slides", [slideId], lastUpdated)
  │  + notifyInstanceProductsUpserted(mainDb, [productId])
  ▼
notify* wrapper  → broadcastChannel.postMessage({ type, data })
  │                 (in-process BroadcastChannel: reaches main thread AND workers)
  ▼
SSE endpoint listener  → per-connection filter† → stream.writeSSE(JSON)
  ▼
Client EventSource (t1_sse.tsx) → T1 store → version keys flip → caches miss (PROTOCOL_APP_STATE)
```

Exactly **one SSE-feeding** broadcast channel, with one endpoint:

| Channel              | Endpoint                | File                              | Guard                                                         |
| -------------------- | ----------------------- | --------------------------------- | ------------------------------------------------------------- |
| `"instance_updates"` | `GET /instance_updates` | `routes/instance/instance-sse.ts` | `requireGlobalPermission()` (hard-deny) + per-message filter† |

† The instance endpoint admits every logged-in user, so the two results-package
generation messages (`run_progress` and `r_script`, which carry run labels,
module ids and R error detail) are dropped in the forward loop for callers
without `can_configure_data` (PLAN_RESULTS_RUNS Q-B). The filter is LIVE:
every `users_updated` passing through the same forward loop carries the full
permission rows, and the filter re-derives the connection's entitlement from
it (keyed on the connection's own email, which never changes), so a
mid-session grant starts the stream and a revocation stops it without a
reconnect. Per-message filtering is tolerable ONLY because these are
ephemeral telemetry. Durable per-user state never relies on it: the runs
CATALOGUE broadcasts a data-free nonce (`runs_catalog_updated`) and each
entitled client fetches `listRunCatalog` through its per-request guard, so
nothing sensitive rides the broadcast and permission changes take
effect live. The one other per-connection rule on the instance channel is
the ROSTER: a connection whose user is absent from the `users`
table (Clerk-authenticated but unapproved) receives `users: []` in
`starting` and has every `users_updated` rewritten to `[]` in the forward
loop, until a roster payload names them, at which point that message flows
whole and the client's own-email re-derivation flips them approved. The
roster is an enumeration surface (emails, names, permission maps) with no
consumer on the pending-approval screen. Deliberately NOT withheld from
unapproved connections, pending a separate ruling if ever wanted:
`dhis2ConnectionUrl`, the structure/indicator/dataset summaries, and assets;
likewise approved non-admin users still receive the full roster. The
product plane rides the same roster rule (PLAN_PRODUCTS_RESTRUCTURE D8):
`buildInstanceState` leaves `products`, `folders`, `readyPackages` and the
`lastUpdated` index empty for an unapproved connection, and the forward loop
drops `products_upserted`, `products_deleted`, `folders_updated` and
`last_updated` while the connection's user is absent from the roster. The
`readyPackages` labels are approved-user data by design: a deliberate
narrowing of Q-B to generation telemetry (`RunListingItem`'s progress,
summary and provenance), because every product card shows the label of the
package it serves from. No other message on the channel is filtered per
user.

`BroadcastChannel` in Deno is in-process: it fans out across the main thread and
all Web Workers in the same process, which is how a background worker's
progress reaches the main-thread SSE connection
(PROTOCOL_APP_WORKER_ROUTINES.md).

**Message contract.** `InstanceSseMessage` (`lib/types/instance_sse.ts`) is a
discriminated union keyed by `type`. The first message on any connection is
always `{ type: "starting", data: <full state> }`;
`{ type: "error", data: { message } }` terminates with an error.

`buildInstanceState` (`task_management/build_instance_state.ts`) is the
instance `starting` builder in two halves: `buildInstanceStateWithoutProducts`
is the grounding half the `/mcp` context cache uses (instance facts only,
product lists empty), and `buildInstanceState` adds the product plane for
the SSE handler when the caller is approved, each list degrading to empty
on a read failure rather than stopping the boundary.

**Connection lifecycle: subscribe-before-build.** The endpoint uses Hono's
`streamSSE` and follows six steps:

```text
1. Authenticate: hard-deny unauthenticated clients
2. Subscribe to the BroadcastChannel  ← FIRST, so nothing is missed during build
3. Build the full initial state (buildInstanceState)
4. writeSSE({ type: "starting", data: state })
5. Drain messages queued during step 3
6. Forward all subsequent messages until the connection closes
   ↳ Abort: stream.onAbort() wakes the park loop / closes the ReadableStream
     controller; stream.aborted checked after build and at the top of the
     forward loop; BroadcastChannel cleanup in finally.
```

Messages that arrive during the build wait in a `queue: []`; after `starting`
they drain into a `ReadableStream` controller the forward loop reads.

**The notify catalog (normative).** Every broadcast to the SSE channel goes
through a typed wrapper, never `postMessage` directly.
`server/task_management/notify_instance_updated.ts` exposes
`notifyInstanceUpdate(message)` plus sixteen wrappers, one per
`InstanceSseMessage` type: `notifyInstanceConfigUpdated` (`config_updated`;
`notifyInstanceConfigUpdatedFromDb` re-reads the config and calls it),
`notifyInstanceUsersUpdated` (`users_updated`), `notifyInstanceAssetsUpdated`
(`assets_updated`), `notifyInstanceGeoJsonMapsUpdated` (`geojson_maps_updated`),
`notifyInstanceStructureUpdated` (`structure_updated`),
`notifyInstanceIndicatorsUpdated` (`indicators_updated`),
`notifyInstanceDatasetsUpdated` (`datasets_updated`),
`notifyInstancePopulationUpdated` (`population_updated`: the population
level setting, the stored row count, per-type coverage and the
`population_last_updated` stamp, fired by every store write and by the two
HMIS structure write routes; S5 "Population store"),
`notifyInstanceRunsCatalogUpdated` (`runs_catalog_updated`: a data-free
NONCE, `crypto.randomUUID()`: a timestamp collided when two mutations landed
in the same millisecond and the client store's equality guard dropped the
second refetch. Entitled clients refetch `listRunCatalog` per the † rule
above; fired by every in-process mutation of the catalogue's facts: launch
(the route on success, and `generate_run/launch.ts` on the
row-created-then-failed path), `deleteRun`, the generate-run worker's
finalize-or-fail site plus the host's crash handler, `pinRun` / `unpinRun`,
and the `products.run_id` movers `setProductPackage`, `duplicateProduct` and
`deleteProducts`),
`notifyInstancePinnedRunUpdated` (`pinned_run_updated`: the instance's
pinned results package moved or was cleared, SYSTEM_08 "The pinned
package"; carries the bare `pinnedRunId | null` and is deliberately
UNFILTERED, the `config_updated` class: a run id alone is not sensitive
(every approved user already sees the ids of the packages products serve
from) and it is the ONE field every surface derives its Pinned badge from.
Its callers, `server/runs/pin_run.ts`'s `pinRun` and `unpinRun`, each fire
it once and then fire the catalogue nonce, because the catalogue rows carry
the pinned flag), `notifyInstanceRunProgress` (`run_progress`),
`notifyInstanceRScript` (`r_script`), and the product plane's four:
`notifyInstanceProductsUpserted(mainDb, ids)` (`products_upserted`, the
ONLY product-list message: it re-reads the summaries for the ids a
mutation touched and broadcasts them per row, never the whole list, so a
checkpoint on one deck never re-sends every card; a failed re-read is logged
and swallowed because the write has already committed),
`notifyInstanceProductsDeleted` (`products_deleted`),
`notifyInstanceFoldersUpdated` (`folders_updated`, whole list) and
`notifyInstanceLastUpdated(tableName, ids, ts)` (`last_updated`, carrying
`slides` only: a product's own stamp rides its summary, so emitting it here
too would version the same read twice). Generation telemetry (`run_progress`,
`r_script`) has no other channel: a product points only at a ready run, so
nothing else has a live view of a generation. The generate_run emitters call
`notifyInstanceRunProgress` / `notifyInstanceRScript` directly.

**The `last_updated` entry point.** `notifyInstanceLastUpdated(tableName, ids,
ts)`, keyed by `LastUpdateTableName` (`lib/types/last_updated_tables.ts`,
`"products" | "slides"`). Its callers are the slide routes
(`server/routes/products/slides.ts`, `slide_decks.ts`) and the collab slide
checkpoint (`server/routes/instance/collab.ts`). The client store keeps the
matching `instanceState.lastUpdated.{products,slides}` index: `products[id]`
from each summary's own stamp, `slides[id]` from the message. Both key the
products T2 caches the editors read.

**The mutation recipe** (see `server/routes/products/slides.ts` and
`server/routes/products/folders.ts`, in registry/`defineRoute` style): after a
successful write, (1) row-level: a slide write calls
`notifyInstanceLastUpdated("slides", ids, lastUpdated)` so clients invalidate
those slides' caches; (2) product-level: `await
notifyInstanceProductsUpserted(mainDb, [productId])` re-reads and broadcasts
the touched summaries, whose stamps version the product detail caches, or
`notifyInstanceProductsDeleted(ids)` on delete; (3) folder writes re-list and
broadcast the whole list via `notifyInstanceFoldersUpdated`, guarded by
`if (res.success)` (but see the stale-on-failure gotcha). The mutation
response itself is just `success`/`err` plus any stamp the caller needs for
its own optimistic lock. Clients never install list state from it.

**One deliberate exception: collab checkpoint rebroadcasts.** S16's collab room
checkpoints (debounced 1.5 s while users co-edit) notify on every checkpoint.
Product documents need no list-level throttle: a product's summary is ONE row,
re-read and pushed by `notifyInstanceProductsUpserted`, so a slide checkpoint
stamps the slide and re-broadcasts its deck's summary, and a report checkpoint
re-broadcasts its own. Net effect during active co-editing: an SSE message
roughly every 1.5 s, the contract working as designed, worth knowing if
broadcast volume ever becomes a concern.

**The triangle.** A DB write bumps `last_updated` / `last_run_at` (S2). The same
timestamp is (a) broadcast via `notifyInstanceLastUpdated` or a product
summary → client T1 store → client cache version keys flip → UI refetches
(PROTOCOL_APP_STATE), and (b) recomputed into a Valkey `versionHash` wherever
a server cache reads mutable data → next server read misses → fresh data. The
load-bearing invariant: **every realtime/cached read model is keyed on a version
column that _every_ write path bumps.** A write that forgets to bump leaves
clients and caches stale with no error.

**SSE gotchas** (verified current):

- A failed post-write re-read silently strands clients: `if (res.success)` in
  the folder routes, and the logged-and-swallowed summary re-read in
  `notifyInstanceProductsUpserted`, mean a failure sends _nothing_. Clients
  stay stale until the next mutation (Open items).
- The channel-name string is duplicated between producer
  (`notify_instance_updated.ts`) and consumer (`instance-sse.ts`); a
  one-character drift silently breaks delivery (Open items).

**Adding a real-time-updated entity:** add a union member to
`InstanceSseMessage`; add a `notifyInstance<Thing>Updated` wrapper in
`notify_instance_updated.ts`; include the entity in the `starting` snapshot
builder (`buildInstanceState`); in each mutating route bump `last_updated` and
call the wrapper; decide whether the forward loop must filter it per
connection; confirm the client consumer (`t1_sse.tsx`) handles the new `type`.

## Valkey: the server read-model cache

`TimCacheC<UniquenessParams, VersionParams, T>`
(`server/valkey/cache_class_C.ts`; the "C" is historical, not a generation).
Constructed with a `prefix` and three hash functions: `uniquenessHashFromParams`
(Redis key identity, what the entry _is_), `versionHashFromParams` (staleness
token, what _version_ it is), and
`parseData(data) → { shouldStore, uniquenessHash, versionHash }`, which
re-derives both hashes **from the resolved payload** for the write-time
self-check. Redis key: `cache:<prefix>:<uniquenessHash>`; stored value:
`JSON.stringify({ versionHash, data })`.

- **Read path:** `get(uniquenessParams, versionParams)` → in-flight
  `_unresolved` map first (a matching-version computation already running
  returns the _shared_ promise, thundering-herd dedup) → `getEx` (refreshes
  read TTL) → stored `versionHash` === recomputed? hit : miss. No client → miss.
  (`get` also accepts an `"any_version"` sentinel that skips the version check.)
- **Write path:**
  `setPromise(dataPromise, optimisticUniqueness,
  optimisticVersion)` registers
  in `_unresolved`, awaits, then `parseData` re-derives the hashes from the
  actual payload. `shouldStore: false` → drop (error responses are never
  cached). Version mismatch → logs `THE VERSION HASHES DON'T MATCH` and drops
  rather than caching a mislabeled value. That log line is a real bug to chase,
  not noise.
- **Invalidation:** none, explicitly. A write bumps a version column; the next
  read recomputes `versionHash`, mismatches, misses, recomputes. `.clear()`,
  `.clearAll()` and `exists()` currently have zero call sites; the one
  deliberate deletion is the run purge below.
- **TTLs are generous: the cache is version-gated, not time-gated.** `READ_TTL`
  30 days, refreshed on every `get` (so TTL is NOT a reliable invalidation
  backstop: a hot stale-version entry never expires, it just keeps missing);
  writes get 15 days + up to 15 days random jitter to stagger expiry.
- **Degrade gracefully:** `connectValkey()` (called in `main.ts`) is a no-op
  without `VALKEY_URL`; `getValkeyClient()` returns the client only while
  `_available` (any connection error flips it false); every method null-checks
  and try/catches, returning a miss. The app runs cache-disabled, never
  cache-broken.

**Two version layers on the run-keyed caches.** Each layer has a distinct job
(PLAN_RESULTS_RUNS §2.5 keyed the data dimension onto the run):

1. **Identity**: the immutable `runId` (which run the data came from) and the
   `scopeToken` lead the UNIQUENESS hash. Data never changes under a run, so
   no write ever needs to out-version an entry.
2. **`PO_CACHE_VERSION`** (`server/routes/caches/visualizations.ts`, currently
   `"23"`, bump history in the adjacent comment) is a manually-bumped semantic
   version used as the `versionHash` of all three; bump it when the _generated
   SQL, payload semantics or payload shape_ change so old entries miss without
   a prefix migration.

**The cache catalog**: four `_UPPER_SNAKE` module-level singletons (three in
`server/routes/caches/visualizations.ts`, one in
`server/routes/caches/dataset.ts`). The three data caches are run-scoped: two
products on the same run and scope share entries.

| Singleton                        | prefix           | uniquenessHash                                              | versionHash                            |
| -------------------------------- | ---------------- | ----------------------------------------------------------- | -------------------------------------- |
| `_PO_ITEMS_CACHE`                | `po_items`       | `runId\|resultsObjectId\|hashFetchConfig(fc)\|scopeToken`   | `PO_CACHE_VERSION`                     |
| `_METRIC_INFO_CACHE`             | `metric_info`    | `runId::metricId::scopeToken`                               | `PO_CACHE_VERSION`                     |
| `_REPLICANT_OPTIONS_CACHE`       | `replicant_opts` | `runId::resultsObjectId::replicateBy::hash(fc)::scopeToken` | `PO_CACHE_VERSION`                     |
| `_FETCH_CACHE_DATASET_HFA_ITEMS` | `ds_hfa`         | constant `"hfa"` (instance-wide singleton)                  | `computeHfaCacheHash(hfa_time_points)` |

Two key separators are live: `\|` (po_items) and `::` (metric_info,
replicant_opts). An HMIS cache (`_FETCH_CACHE_DATASET_HMIS_ITEMS`,
`ds_hmis`/`ds_hmis_v2`) was deleted (tombstone comment in
`dataset.ts`): once the HMIS display route's vizItems moved to the import
ledger, the read shrank to ~1.4k rows and the cache's value no longer paid for
its liabilities (mid-run bypass dance, prefix-bump obligation). The route
computes live; client-side T2 caching remains.

**Purge on run deletion** (`server/runs/delete_run.ts`, PLAN_RESULTS_RUNS Q-D) is
the one place that deliberately deletes entries rather than out-versioning them,
and it is **disk reclamation, not correctness**: TTLs plus the version
comparison in `get` already mean a dead run's entries are never served. Because
`po_items`, `metric_info` and `replicant_opts` fold `runId` into their
UNIQUENESS hash, they are swept by prefix (`scanUniquenessHashes(runId…)` →
`clearByUniquenessHash`).

**Rules.** Every cache is version-gated on a column bumped by _every_ write path
to its data. Never `.clear()` on a normal write. `parseData` must derive the
same hashes as the `*FromParams` functions: two computations of one key, keep
them in lockstep. Never cache failures (`shouldStore: false`, all four do).
Assume Valkey may be absent. Don't invent another caching mechanism: use
`TimCacheC` for cross-process versioned read models; a process-local in-memory
singleton (as the DHIS2 geojson session cache does, see SYSTEM_07) only for
per-process ephemeral data.

## Client cache machinery (`state/_infra/`)

The client mirrors the server design (two-part version-in-key caching with
in-flight dedup and no failure caching) in `createReactiveCache`
(`client/src/state/_infra/reactive_cache.ts`), the factory behind every
`t2_*` cache. Config: `name` (IndexedDB key prefix), `uniquenessKeys(params)`
(auto-hashed with `|`), `versionKey(params, instanceState)` (reads the one T1
store, the instance store, as a non-reactive snapshot) and optional `maxSize`
(memory LRU, default 100). Cache key: `<name>/<uniquenessHash>::<versionHash>`.
Version is part of the key, so a version flip is an automatic miss. Two tiers:
memory LRU map, then IndexedDB (`idb-keyval`); an in-flight `_unresolved` map
dedups concurrent identical fetches; failures are never cached; the sentinel
version `"unknown"` (a `lastUpdated` field the store has not received yet) is
refused by `setPromise`. Consumer semantics and the composite-key caveat are
in PROTOCOL_APP_STATE "Sentinel versions". `clearEntry` clears all versions of
one uniqueness key; `clearEntriesWithPrefix` requires a STRICT prefix of the
uniqueness keys (a complete key list matches nothing: full keys are followed
by `::`, not `|`).

Two version idioms exist. Product documents version on the SSE-pushed
`lastUpdated` maps (`slide`, `slide_deck_detail`, `report_detail`). Package
data (`state/products/t2_figure_data.ts`, `t2_replicant_options.ts`,
`state/instance/t2_runs.ts`, `t2_run_authoring_context.ts`) versions on the
constant `"immutable"` with the identity (`runId`, `scopeToken`) leading the
UNIQUENESS key: a ready package never changes, so nothing invalidates an
entry and a late response cannot land under another package's key. There is
no response-side identity guard any more; the key already names the package
and the scope. Old IndexedDB entries become unreachable via the version flip
and age out: no purge.

Around it:

- **`_infra/indexeddb_cache.ts` (`TimCacheD`)**: plain IndexedDB cache without
  the reactive version machinery; used by `t2_images.ts` (URL-keyed, immutable,
  failure backoff).
- **`_infra/request_queue.ts`**: `RequestQueue(maxConcurrent)` concurrency
  limiter; client singletons `poItemsQueue(15)` and `resultsValueInfoQueue(20)`
  throttle PO-items / value-info fan-out. An **identical copy of the class**
  lives at `server/utils/request_queue.ts` (instantiated in
  `server/run_query/run_data_reads.ts` at 10/15), a cross-tier duplicate
  that could live in `lib/` (Open items).
- **`clear_caches.ts`**: `clearDataCache()` deletes every IndexedDB key except
  the AI prefixes (`ai-conv`, `ai-documents`) and clears the geojson memory
  cache; `clearAiChatCache()` deletes only the AI prefixes.
- **Deploy flush**: `LoggedInWrapper.tsx` (S1 file, this system a reader)
  compares the server's `serverVersion` against `localStorage` on boot and calls
  `clearDataCache()` on change: client caches auto-invalidate on deploy. (Dev
  has no deploy: stale IndexedDB can mask server fixes; clear site data.)

**Adding a server cache:** define the `TimCacheC` singleton in the right
`routes/caches/*.ts`; pick a `versionHash` source bumped by every write to the
data; keep `uniquenessHashFromParams`/`parseData` hash-identical (same
separator); `shouldStore: false` on failure; wrap the producer in `setPromise`;
verify behavior with `getValkeyClient() === null`; if the payload shape can
change across deploys, re-validate on read or plan a prefix/`PO_CACHE_VERSION`
bump.

## Open items

- **Decoupling: make the notify/stamp convention structural.** The
  `last_updated → notify` triangle is enforced by hand in ~27 files. A
  write-helper that does mutate + stamp + notify together (or a dev assertion
  flagging mutations without a notify) would make audit §4.3.1 mechanical.
- A shared channel-name constant for `"instance_updates"`, currently a
  duplicated string literal between producer and consumer.
- Failed post-write re-read strands clients: define the handling (log it,
  or always emit `last_updated` so clients self-invalidate).
- Lint for raw `postMessage` / inline SSE messages outside the `notify_*` files
  (scoped to the SSE channel; `RUN_GENERATION_ENDED_CHANNEL` is S8's and
  exempt).
- `ds_hfa` version lockstep spans files: `versionHashFromParams` uses the
  route-computed `computeHfaCacheHash` while `parseData` trusts
  `res.data.cacheHash` from the producer: the dup-logic class item 9 exists to
  kill, here spanning route and lib.
- Cross-deploy payload-shape handling is per-cache and partial:
  `PO_CACHE_VERSION` covers the three run-keyed caches, `ds_hfa` has none.
  Fold a deploy/build version into `versionHash` generically, or document the
  per-cache choice.
- `RequestQueue` is an identical class copy-pasted into
  `client/src/state/_infra/` and `server/utils/`. Move one copy to `lib/`.
- Cruft: rename away the opaque `TimCacheC`/`cache_class_C` suffix and
  disambiguate "cache" (Valkey read-model) from `cacheMiddleware` (HTTP headers)
  when touched.

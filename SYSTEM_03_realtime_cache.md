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
  - server/task_management/notify_last_updated.ts
  - server/utils/request_queue.ts
  - server/valkey/**
docs_absorbed:
---

# S3 — Realtime Sync & Cache Invalidation

The `last_updated → BroadcastChannel/SSE → version-hash` triangle: the typed
notify hub, the one SSE endpoint, the Valkey read-model cache, and the client
store/cache infrastructure. One design idea carried through every layer: **every
write bumps a version column; every read model — server Valkey entry or client
IndexedDB entry — is keyed on that version, so invalidation is implicit (the
next read misses) and nothing ever "clears a cache" on a normal write.**
Reviewed against code 2026-07-16 (first review cycle, review-only; absorbs
DOC_SSE_REALTIME + DOC_VALKEY_CACHE).

Boundaries: the client _consumer_ rules (tiers, live/snapshot reads,
never-refetch-after-mutation) are [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md)
— this system owns the machinery those rules run on. The write side that bumps
version columns is **S2**
([SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)). SSE is server _push_; it
is not the request-scoped NDJSON `StreamWriter` in **S1**
(SYSTEM_01_api_contract.md). The third BroadcastChannel,
`RUN_GENERATION_ENDED_CHANNEL` (`worker_routines/generate_run/`), is **S8**'s
internal worker plumbing (SYSTEM_08_results_packages.md) — it feeds no SSE
endpoint and is exempt from the notify-catalog rule.
`server/middleware/cache.ts` (`cacheMiddleware`) sets HTTP `Cache-Control`
headers on static assets — a completely different "cache", owned elsewhere. The
collaboration WebSocket layer (live Yjs deltas, presence) is **S16**
([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)) — strictly additive:
its room checkpoints feed this system's
triangle through the existing notify wrappers and post nothing new to the
BroadcastChannel. Sub-file custody exceptions are in SYSTEMS.md §4.1
(`task_management/mod.ts` is S8's barrel and re-exports the notify hub).

## Contract

Every mutation must stamp `last_updated` and notify — but that obligation lives
in files owned by other systems. This system's _machinery_ is reviewed here;
its _convention_ is a standing audit (SYSTEMS.md §4.3.1).

## SSE — the producer side

Principles: (1) **mutations don't return fresh state — they broadcast it**; a
route mutates, then `notify*()`s, and clients refetch off the SSE feed (the
server half of the client never-manually-refetch rule). (2) **One typed
`notify*` wrapper per event type** — call sites never build a raw SSE message.
(3) **Subscribe before you build.** (4) **`last_updated` is the universal
version token** — the same timestamp a write bumps is broadcast to clients and
used as the cache version key.

```text
Route handler (after a successful DB write)
  │  notifyProductsUpserted(mainDb, [productId])   ← re-reads the summary, broadcasts it
  │  and/or notifyLastUpdated("slides", [id], lastUpdated)
  ▼
notify* wrapper  → broadcastChannel.postMessage({ type, data })
  │                 (in-process BroadcastChannel: reaches main thread AND workers)
  ▼
SSE endpoint listener  → per-message filter → stream.writeSSE(JSON)
  ▼
Client EventSource (t1_sse.tsx) → T1 store → version keys flip → caches miss (PROTOCOL_APP_STATE)
```

Exactly **one SSE-feeding** broadcast channel, with one endpoint:

| Channel              | Endpoint                | File                              | Guard                                                        |
| -------------------- | ----------------------- | --------------------------------- | ------------------------------------------------------------ |
| `"instance_updates"` | `GET /instance_updates` | `routes/instance/instance-sse.ts` | `requireGlobalPermission()` (hard-deny) + per-message filter |

The endpoint admits every logged-in user, approved or not, so the payload is
narrowed per connection instead. **Three per-message rules, all live off ONE
re-derivation** — every `users_updated` passing through the forward loop carries
the full roster with permission rows, and a connection's own email never
changes, so re-finding itself in each roster is sufficient. A mid-session grant
or revocation therefore takes effect with no reconnect:

1. **Generation telemetry (Q-B).** `run_progress` and `r_script` carry run
   labels, module ids and R error detail; they are dropped for callers without
   `can_configure_data`. Per-message filtering is tolerable ONLY because these
   are ephemeral telemetry.
2. **Roster.** A connection whose user is absent from the `users` table —
   Clerk-authenticated but unapproved — receives `users: []` in `starting` and
   has every `users_updated` rewritten to `[]`. The roster is an enumeration
   surface (emails, names, permission maps) with no consumer on the
   pending-approval screen.
3. **Product plane.** The same absent-from-roster test drops
   `products_upserted` / `products_deleted` / `folders_updated` /
   `last_updated`, matching what `buildInstanceState` withholds from the
   `starting` payload. The unapproved→approved transition is handled
   CLIENT-side (`reconnectForApproval` rebuilds the whole payload), so this
   filter only has to be right at connect time and to re-derive on each roster
   change.

**Q-B, as revised by the products restructure: ready-package LABELS are
approved-user data.** `readyPackages` (`{ id, label, createdAt }`) rides the
`starting` payload for every approved connection, and
`listAttachableResultsPackages` returns that narrow `ReadyPackage`, **not**
`RunListingItem`. The wide catalogue row carries `progress` / `summary` /
`provenance` — generation telemetry — and stays at `can_configure_data`. So Q-B
now reads: generation telemetry must not fan out; a package label may, because
every product card shows the label of the package it serves from. Because the
`starting` fill and the refetch call the same narrow route, the two agree by
construction rather than by the client hand-narrowing one of them.

Durable per-user state still never relies on per-message filtering: the runs
CATALOGUE broadcasts a data-free nonce (`runs_catalog_updated`) and each
entitled client fetches `listRunCatalog` through its per-request guard, so
nothing sensitive rides the broadcast and permission changes take effect live.
`readyPackages` follows that same idiom exactly — a `starting` fill plus a
refetch on the EXISTING `runs_catalog_updated` nonce, with no message type of
its own. Deliberately NOT withheld from unapproved connections, pending a
separate ruling if ever wanted: `dhis2ConnectionUrl`, the
structure/indicator/dataset summaries, and assets; likewise approved non-admin
users still receive the full roster. No other message is filtered per user.

`BroadcastChannel` in Deno is in-process: it fans out across the main thread and
all Web Workers in the same process — which is how a background worker's
progress reaches the main-thread SSE connection
(PROTOCOL_APP_WORKER_ROUTINES.md).

**Connect-payload cost (measured 2026-08-20).** A trimmed `ProductSummary` is
~266 B on the wire (dev instance: 20 products = 5,322 B), so the products
share of `starting` is negligible up to ~1,000 products (~250 KB). The SSE
stream is NOT compressed: `Deno.serve` auto-gzips ordinary string-bodied JSON
responses (verified ~100:1 on repetitive JSON; disabled only by
`Cache-Control: no-transform`, which nothing sets — no compression middleware
exists or is needed), but streamed bodies are exempt. If an instance ever
reaches ~1,000–3,000 products, move the bulk `starting` fills to a one-shot
fetch on connect (the `readyPackages` nonce idiom below) rather than gzipping
the event stream, which buffers every subsequent event. At ~5,000+ the
T1-resident list itself is the wrong model (paged/server-filtered route).

**Message contract.** `InstanceSseMessage` (`lib/types/instance_sse.ts`) is a
discriminated union keyed by `type`. The first message on any connection is
always `{ type: "starting", data: InstanceState }`;
`{ type: "error", data: { message } }` terminates with an error — generic on the
wire, because the connection may belong to an unapproved user and
`buildInstanceState`'s summary reads are unwrapped, so a raw driver message must
never reach the stream.

**Connection lifecycle — subscribe-before-build.** The endpoint uses Hono's
`streamSSE`:

```text
1. Authenticate — hard-deny unauthenticated clients
2. Subscribe to the BroadcastChannel  ← FIRST, so nothing is missed during build
3. Build the full initial state (buildInstanceState)
4. writeSSE({ type: "starting", data: state })
5. Drain messages queued during step 3 (a plain array, then a ReadableStream
   controller takes over)
6. Forward all subsequent messages, each through the per-message filter, until
   the connection closes
   ↳ Abort: stream.aborted is checked at the top of the forward loop; the
     BroadcastChannel is closed in the stream's cancel().
```

`buildInstanceState` is split: `buildInstanceStateWithoutProducts` builds
everything else, and the full builder adds `products` / `folders` /
`readyPackages` / `lastUpdated` on top. The `/mcp` context builder
(`server/mcp/context_cache.ts`) calls the WITHOUT variant, so a headless context
never embeds product lists or report bodies.

**The notify catalog (normative).** Every broadcast goes
through a typed wrapper in
`server/task_management/notify_instance_updated.ts` — never `postMessage`
directly. It exposes `notifyInstanceUpdate(message)` plus one wrapper per
`InstanceSseMessage` type:

| Wrapper                                               | Message                     | Notes                                                                                               |
| ----------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `notifyInstanceConfigUpdated` / `…FromDb`             | `config_updated`            | the `FromDb` form re-reads schemas, labels, DHIS2 info and `aiContext` and broadcasts them together |
| `notifyProductsUpserted(mainDb, ids)`                 | `products_upserted`         | the one re-read-and-broadcast path; `notifyInstanceProductsUpserted(summaries)` is the raw form     |
| `notifyInstanceProductsDeleted`                       | `products_deleted`          | ids only                                                                                            |
| `notifyInstanceFoldersUpdated`                        | `folders_updated`           | whole list — folders are few and change rarely                                                      |
| `notifyLastUpdated` (own file)                        | `last_updated`              | `slides` only                                                                                       |
| `notifyInstanceUsersUpdated`                          | `users_updated`             | also drives the live per-message filter                                                             |
| `notifyInstanceAssetsUpdated`                         | `assets_updated`            | —                                                                                                   |
| `notifyInstanceGeoJsonMapsUpdated`                    | `geojson_maps_updated`      | —                                                                                                   |
| `notifyInstanceStructureUpdated`                      | `structure_updated`         | —                                                                                                   |
| `notifyInstanceIndicatorsUpdated`                     | `indicators_updated`        | —                                                                                                   |
| `notifyInstanceDatasetsUpdated`                       | `datasets_updated`          | —                                                                                                   |
| `notifyInstanceRunsCatalogUpdated`                    | `runs_catalog_updated`      | data-free NONCE                                                                                     |
| `notifyInstancePinnedRunUpdated`                      | `pinned_run_updated`        | the bare pinned run id or null; deliberately unfiltered                                             |
| `notifyInstanceRunProgress` / `notifyInstanceRScript` | `run_progress` / `r_script` | generation telemetry, filtered per rule 1                                                           |

Three of these carry a decision worth stating once:

- **`products_upserted` is the ONLY product-list message, and it is per-row.**
  Every product mutation route and every collab checkpoint hands
  `notifyProductsUpserted(mainDb, ids)` the ids it touched; that helper re-reads
  the summaries and broadcasts them. A whole-list broadcast would re-send every
  card on a deck-heavy instance on every keystroke checkpoint. The write has
  already committed when the re-read runs, so a failed re-read is **logged and
  swallowed** — losing a broadcast costs one client a stale card until its next
  event, whereas throwing would turn a succeeded write into a failed request.
  A summary carries its own `lastUpdated`, which is what versions that product's
  detail cache, so there is deliberately **no** `last_updated` emit for a
  product.
- **`runs_catalog_updated` is a NONCE** (`crypto.randomUUID()`), not a
  timestamp: two mutations in the same millisecond minted identical ISO strings
  and the client store's equality guard dropped the second refetch. Fired by
  every in-process mutation of the catalogue's facts — launch (success AND the
  row-created-then-failed path), delete, the generate-run worker's
  finalize-or-fail site, and both pin movers.
- **`pinned_run_updated`** carries the bare pinned run id and is unfiltered, the
  `config_updated` class: a run id alone is not sensitive — an approved user
  already sees the id of the package each product serves from — and it is the
  ONE field every Pinned badge derives from. `server/runs/pin_run.ts`'s pin-move
  and unpin ALSO fire the catalogue nonce, because a pin move changes the
  catalogue's rows. A pin move touches **no product row** (S8, D5).

**The `last_updated` entry point.**
`server/task_management/notify_last_updated.ts` —
`notifyLastUpdated(tableName, ids, lastUpdated)`, re-exported via
`task_management/mod.ts`. `LastUpdateTableName` is
`products | slides` (`lib/types/last_updated_tables.ts`), but the wrapper is
called with **`slides` only**: a product's stamp rides its `products_upserted`
summary, and emitting it here as well would version the same read twice. The
`products` half of the index exists because the client store maintains it from
those summaries.

**The mutation recipe** (see `server/routes/products/reports.ts` for every
variant, in registry/`defineRoute` style): after a successful write,
`notifyProductsUpserted(mainDb, [productId])`, plus
`notifyLastUpdated("slides", [slideId], lastUpdated)` when a slide row moved.
There is no separate list refetch — the summary re-read IS the list update, and
it is scoped to the ids that changed. The mutation response itself is just
`success`/`err`; clients never install state from it.

**Collab checkpoint volume.** S16's room checkpoints are debounced 1.5 s while
users co-edit and each one emits the same per-row messages a normal save does.
Under the per-row shape this is already proportional: a keystroke checkpoint on
one deck broadcasts that deck's summary and that slide's stamp, not the
instance's card list.

**The triangle.** A DB write bumps `last_updated` / `last_run_at` (S2). The same
timestamp is (a) broadcast via `notifyLastUpdated` → client T1 store → client
cache version keys flip → UI refetches (PROTOCOL_APP_STATE), and (b) recomputed
into the Valkey `versionHash` → next server read misses → fresh data. The
load-bearing invariant: **every realtime/cached read model is keyed on a version
column that _every_ write path bumps.** A write that forgets to bump leaves
clients and caches stale with no error.

**SSE gotchas** (verified current):

- The endpoint hard-denies unauthenticated clients but admits every logged-in
  one, approved or not: narrowing is by payload (`buildInstanceState`) and by
  the forward-loop filter, never by refusing the connection. That is what lets
  the pending-approval screen exist at all.
- **The unapproved→approved transition is a client-side reconnect.** On
  `currentUserApproved` flipping false→true the client calls
  `reconnectForApproval()` (instance SSE disconnect/connect + collab connect),
  because the withheld halves of the `starting` payload cannot be back-filled by
  a message. The reverse is server-driven: `deleteUser` and `renameUserEmail`
  call `closeConnectionsForEmail` (S16), which drops that email's collab
  sockets; the SSE payload narrows itself on the next `users_updated`.
- A failed product summary re-read is logged and swallowed, so a broadcast can
  be lost: that client's card stays stale until its next event or reconnect.
  Deliberate — the alternative failed a committed write.
- The channel name `"instance_updates"` is a duplicated string literal between
  producer (`notify_instance_updated.ts`) and consumer (`instance-sse.ts`); a
  one-character drift silently breaks delivery (Open items).

**Adding a real-time-updated entity:** add a union member to
`InstanceSseMessage`; add a `notify<Thing>Updated` wrapper in
`notify_instance_updated.ts`; include the entity in `buildInstanceState`; decide
whether the forward-loop filter must withhold it from an unapproved connection;
in each mutating route bump `last_updated` and call the wrapper; confirm
`t1_sse.tsx` handles the new `type`.

## Valkey — the server read-model cache

`TimCacheC<UniquenessParams, VersionParams, T>`
(`server/valkey/cache_class_C.ts`; the "C" is historical, not a generation).
Constructed with a `prefix` and three hash functions: `uniquenessHashFromParams`
(Redis key identity — what the entry _is_), `versionHashFromParams` (staleness
token — what _version_ it is), and
`parseData(data) → { shouldStore, uniquenessHash, versionHash }`, which
re-derives both hashes **from the resolved payload** for the write-time
self-check. Redis key: `cache:<prefix>:<uniquenessHash>`; stored value:
`JSON.stringify({ versionHash, data })`.

- **Read path:** `get(uniquenessParams, versionParams)` → in-flight
  `_unresolved` map first (a matching-version computation already running
  returns the _shared_ promise — thundering-herd dedup) → `getEx` (refreshes
  read TTL) → stored `versionHash` === recomputed? hit : miss. No client → miss.
  (`get` also accepts an `"any_version"` sentinel that skips the version check.)
- **Write path:**
  `setPromise(dataPromise, optimisticUniqueness,
  optimisticVersion)` registers
  in `_unresolved`, awaits, then `parseData` re-derives the hashes from the
  actual payload. `shouldStore: false` → drop (error responses are never
  cached). Version mismatch → logs `THE VERSION HASHES DON'T MATCH` and drops
  rather than caching a mislabeled value — that log line is a real bug to chase,
  not noise.
- **Invalidation:** none, explicitly. A write bumps a version column; the next
  read recomputes `versionHash`, mismatches, misses, recomputes. `.clear()` and
  `.clearAll()` currently have zero call sites; the one deliberate deletion path
  is the run-delete sweep below, and it is disk reclamation, not correctness.
- **TTLs are generous — the cache is version-gated, not time-gated.** `READ_TTL`
  30 days, refreshed on every `get` (so TTL is NOT a reliable invalidation
  backstop: a hot stale-version entry never expires, it just keeps missing);
  writes get 15 days + up to 15 days random jitter to stagger expiry.
- **Degrade gracefully:** `connectValkey()` (called in `main.ts`) is a no-op
  without `VALKEY_URL`; `getValkeyClient()` returns the client only while
  `_available` (any connection error flips it false); every method null-checks
  and try/catches, returning a miss. The app runs cache-disabled, never
  cache-broken.

**Two version layers on the figure-data family.** Invalidation ingredients are
layered, and each layer has a distinct job:

1. **The immutable `runId`**, which rides the UNIQUENESS hash rather than the
   version hash: data never changes under a package, so "which package" is part
   of what the entry IS. Together with the `scopeToken` it is the whole data
   dimension — there is no row-version ingredient left, because a figure's
   config is not a stored row the server reads (S9).
2. **`PO_CACHE_VERSION`** (`server/routes/caches/visualizations.ts`, currently
   `"16"`, bump history in the adjacent comment) — the whole `versionHash` of all
   three caches. Bump it when the _generated SQL or payload semantics_ change,
   so old entries miss without a prefix migration.

**The cache catalog** — four `_UPPER_SNAKE` module-level singletons (three in
`server/routes/caches/visualizations.ts`, one in
`server/routes/caches/dataset.ts`). The three data caches are keyed by
`(package, scope)`, not by any product: two products sharing both dimensions
share entries.

| Singleton                        | prefix           | uniquenessHash                                                | versionHash                            |
| -------------------------------- | ---------------- | ------------------------------------------------------------- | -------------------------------------- |
| `_PO_ITEMS_CACHE`                | `po_items`       | `runId\|resultsObjectId\|hashFetchConfig(fc)\|scopeToken`     | `PO_CACHE_VERSION`                     |
| `_METRIC_INFO_CACHE`             | `metric_info`    | `runId::metricId::scopeToken`                                 | `PO_CACHE_VERSION`                     |
| `_REPLICANT_OPTIONS_CACHE`       | `replicant_opts` | `runId::resultsObjectId::replicateBy::hash(fc)::scopeToken`   | `PO_CACHE_VERSION`                     |
| `_FETCH_CACHE_DATASET_HFA_ITEMS` | `ds_hfa`         | constant `"hfa"` (instance-wide singleton)                    | `computeHfaCacheHash(hfa_time_points)` |

**The segment-order rule, and why it is load-bearing.** `runId` is the LEADING
uniqueness segment and `scopeToken` the TRAILING one, on all three. Leading
`runId` is what makes the run-delete prefix scan exhaustive; trailing
`scopeToken` is what keeps that scan — and the `roId`-at-index-1 parses — valid
while a dimension is added beside it. Adding the scope segment itself still cost
a bump (`"15"`), because the payloads' MEANING changed; what the ordering bought
is that no key-reading code had to change with it, and that re-keying the same
segment onto a caller-supplied pair afterwards cost nothing at all. Keep any
future dimension trailing for the same reason.
Two key separators are live: `|` (po_items) and `::` (metric_info,
replicant_opts). `scopeToken` is required, not optional, on the uniqueness
params of all three: an optional would compile and silently mis-key.

**Purge on run deletion** (`server/runs/delete_run.ts`, Q-D) —
the one place that deliberately deletes entries rather than out-versioning them,
and it is **disk reclamation, not correctness**: TTLs plus the version
comparison in `get` already mean a dead package's entries are never served. All
three run-keyed caches fold `runId` into their UNIQUENESS hash as its leading
segment, so all three are swept by prefix — `scanUniquenessHashes` on the run id
plus its separator, then `clearByUniquenessHash` on each hit.

**Rules.** Every cache is version-gated on a column bumped by _every_ write path
to its data. Never `.clear()` on a normal write. `parseData` must derive the
same hashes as the `*FromParams` functions — two computations of one key, keep
them in lockstep. Never cache failures (`shouldStore: false` — all four do; and
`metric_info` additionally refuses a SUCCESSFUL payload carrying a
per-dimension `error` status, which would otherwise pin the resolver's "cannot
enumerate" fallback until the next package).
Assume Valkey may be absent. Don't invent another caching mechanism: use
`TimCacheC` for cross-process versioned read models; a process-local in-memory
singleton (as the DHIS2 geojson session cache does — see SYSTEM_07) only for
per-process ephemeral data.

## Client cache machinery (`state/_infra/`)

The client mirrors the server design — two-part version-in-key caching with
in-flight dedup and no failure caching — in `createReactiveCache`
(`client/src/state/_infra/reactive_cache.ts`), the factory behind the ten
`t2_*` caches. Config: `name` (IndexedDB key prefix), `uniquenessKeys(params)`
(auto-hashed with `|`), `versionKey(params, ins)`, optional `maxSize` (memory
LRU, default 100) and `shouldStore(data)` (a payload-side guard: a SUCCESSFUL
response can still embed a transient failure, and returning false serves it
without freezing it). Cache key: `<name>/<uniquenessHash>::<versionHash>` —
version is part of the key, so a version flip is an automatic miss. Two tiers:
memory LRU map, then IndexedDB (`idb-keyval`); an in-flight `_unresolved` map
dedups concurrent identical fetches; failures are never cached; the sentinel
version `"unknown"` is refused by `setPromise` — consumer
semantics and the composite-key caveat are in PROTOCOL_APP_STATE "Sentinel
versions". `clearEntry` clears all versions of one uniqueness key;
`clearEntriesWithPrefix` requires a STRICT prefix of the uniqueness keys (a
complete key list matches nothing — full keys are followed by `::`, not `|`).

**`versionKey` reads the instance T1 store itself**
(`getSnapshotInstanceState`), so no consumer threads a version through the call
chain. There is exactly one store to read, and two shapes of version key:

- **Row-versioned** — `ins.lastUpdated.products[id]` for a deck or report
  detail, `ins.lastUpdated.slides[id]` for a slide, each `?? "unknown"`. SSE
  flipping that entry re-keys every read of it.
- **Constant** — the figure-data caches (`t2_figure_data`,
  `t2_replicant_options`) and the run authoring context version on a literal,
  because `(runId, scopeToken)` rides the UNIQUENESS key instead. A package or
  scope change therefore produces a _different entry_, not a stale one: the old
  entry stays valid and is hit again if the product moves back. The run
  authoring context is the purest case — a pure function of an immutable run
  directory, so nothing ever invalidates it, and every product on the same
  package shares one entry. Bump the cache NAME when such a payload changes
  shape (CLAUDE.md's cache-prefix rule).

Old IndexedDB entries become unreachable via the version flip and age out — no
purge.

Around it:

- **`_infra/indexeddb_cache.ts` (`TimCacheD`)** — plain IndexedDB cache without
  the reactive version machinery; used by `t2_images.ts` (URL-keyed, immutable,
  failure backoff).
- **`_infra/request_queue.ts`** — `RequestQueue(maxConcurrent)` concurrency
  limiter; client singletons `poItemsQueue(15)` and `resultsValueInfoQueue(20)`
  throttle figure-items / value-info fan-out. An **identical copy of the class**
  lives at `server/utils/request_queue.ts` (instantiated in
  `server/run_query/run_data_reads.ts` at 10/15) — a cross-tier duplicate
  that could live in `lib/` (Open items).
- **`clear_caches.ts`** — `clearDataCache()` deletes every IndexedDB key except
  the AI prefixes (`ai-conv`, `ai-documents`) and clears the geojson memory
  cache; `clearAiChatCache()` deletes only the AI prefixes.
- **Deploy flush** — `LoggedInWrapper.tsx` (S1 file, this system a reader)
  compares the server's `serverVersion` against `localStorage` on boot and calls
  `clearDataCache()` on change: client caches auto-invalidate on deploy. (Dev
  has no deploy — stale IndexedDB can mask server fixes; clear site data.)

**Adding a server cache:** define the `TimCacheC` singleton in the right
`routes/caches/*.ts`; pick a `versionHash` source bumped by every write to the
data; keep `uniquenessHashFromParams`/`parseData` hash-identical (same
separator); `shouldStore: false` on failure; wrap the producer in `setPromise`;
verify behavior with `getValkeyClient() === null`; if the payload shape can
change across deploys, re-validate on read or plan a prefix/`PO_CACHE_VERSION`
bump.

## Open items

- **Decoupling — make the notify/stamp convention structural.** The
  `last_updated → notify` triangle is enforced by hand across the product and
  instance mutation routes. A write-helper that does mutate + stamp + notify
  together (or a dev assertion flagging mutations without a notify) would make
  audit §4.3.1 mechanical.
- A shared channel-name constant for `"instance_updates"` — currently a
  duplicated string literal between producer and consumer.
- A lost `products_upserted` (the swallowed summary re-read failure) leaves one
  client's card stale until its next event: decide whether the failure should
  instead emit a bare `last_updated` so the client self-invalidates.
- Lint for raw `postMessage` / inline SSE messages outside
  `notify_instance_updated.ts` (`RUN_GENERATION_ENDED_CHANNEL` is S8's and
  exempt).
- `ds_hfa` version lockstep spans files: `versionHashFromParams` uses the
  route-computed `computeHfaCacheHash` while `parseData` trusts
  `res.data.cacheHash` from the producer — the dup-logic class item 9 exists to
  kill, here spanning route and lib.
- Cross-deploy payload-shape handling is per-cache and partial:
  `PO_CACHE_VERSION` covers the three figure-data caches, `ds_hfa` has no
  equivalent — fold a deploy/build version into `versionHash` generically, or
  document the per-cache choice.
- `RequestQueue` is an identical class copy-pasted into
  `client/src/state/_infra/` and `server/utils/` — move one copy to `lib/`.
- Cruft: rename away the opaque `TimCacheC`/`cache_class_C` suffix and
  disambiguate "cache" (Valkey read-model) from `cacheMiddleware` (HTTP headers)
  when touched.

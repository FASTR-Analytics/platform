---
system: 3
name: Realtime Sync & Cache Invalidation
globs:
  - client/src/components/project/project_cache.tsx
  - client/src/state/_infra/indexeddb_cache.ts
  - client/src/state/_infra/reactive_cache.ts
  - client/src/state/_infra/request_queue.ts
  - client/src/state/clear_caches.ts
  - client/src/state/instance/t1_sse.tsx
  - client/src/state/instance/t1_store.ts
  - client/src/state/project/t1_sse.tsx
  - client/src/state/project/t1_store.ts
  - lib/types/instance_sse.ts
  - lib/types/project_dirty_states.ts
  - lib/types/project_sse.ts
  - server/routes/instance/instance-sse.ts
  - server/routes/project/project-sse-v2.ts
  - server/task_management/build_instance_state.ts
  - server/task_management/build_project_state.ts
  - server/task_management/notify_instance_updated.ts
  - server/task_management/notify_last_updated.ts
  - server/task_management/notify_project_v2.ts
  - server/task_management/project_last_updated.ts
  - server/utils/request_queue.ts
  - server/valkey/**
docs_absorbed:
---

# S3 — Realtime Sync & Cache Invalidation

The `last_updated → BroadcastChannel/SSE → version-hash` triangle: the typed
notify hub, the two SSE endpoints, the Valkey read-model cache, and the client
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
([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)) — strictly additive
inside the same project boundary: its room checkpoints feed this system's
triangle through the existing notify wrappers and post nothing new to the
BroadcastChannels. Sub-file custody exceptions are in SYSTEMS.md §4.1
(`lib/types/project_dirty_states.ts` is owned here, S8 mandatory reader;
`t2_presentation_objects.ts` is owned by S9, this system a mandatory reader;
`task_management/mod.ts` is S8's barrel and re-exports the notify hub).

## Contract

Every mutation must stamp `last_updated` and notify — but that obligation lives
in ~26 files owned by other systems. This system's _machinery_ is reviewed here;
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
  │  notifyLastUpdated(projectId, "reports", [id], lastUpdated)
  │  + refetch list → notifyProjectReportsUpdated(projectId, list)
  ▼
notify* wrapper  → broadcastChannel.postMessage({ type, data [, projectId] })
  │                 (in-process BroadcastChannel: reaches main thread AND workers)
  ▼
SSE endpoint listener  → filters by projectId (project channel) → stream.writeSSE(JSON)
  ▼
Client EventSource (t1_sse.tsx) → T1 store → version keys flip → caches miss (PROTOCOL_APP_STATE)
```

Exactly **two SSE-feeding** broadcast channels, each with one endpoint:

| Channel                | Endpoint                          | File                               | Guard                                                         |
| ---------------------- | --------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `"instance_updates"`   | `GET /instance_updates`           | `routes/instance/instance-sse.ts`  | `requireGlobalPermission()` (hard-deny) + per-message filter† |
| `"project_updates_v2"` | `GET /project_sse_v2/:project_id` | `routes/project/project-sse-v2.ts` | `getGlobalUser` + `resolveProjectUserAccess` (hard-deny)      |

† The instance endpoint admits every logged-in user, so the two results-package
generation messages — `run_progress` and `r_script`, which carry run labels,
module ids and R error detail — are dropped in the forward loop for callers
without `can_configure_data` (PLAN_RESULTS_RUNS Q-B). The permission set is the
one captured at connect; a change takes effect on reconnect, exactly like
`currentUserPermissions` in the starting payload. No other message on either
channel is filtered per user.

`BroadcastChannel` in Deno is in-process: it fans out across the main thread and
all Web Workers in the same process — which is how a background worker's
progress reaches the main-thread SSE connection
(PROTOCOL_APP_WORKER_ROUTINES.md).

**Message contract.** `InstanceSseMessage` (`lib/types/instance_sse.ts`) and
`ProjectSseMessage` (`lib/types/project_sse.ts`) are discriminated unions keyed
by `type`. The first message on any connection is always
`{ type: "starting", data: <full state> }`;
`{ type: "error", data: { message } }` terminates with an error. Project
messages carry an extra `projectId` on the wire (stripped before forwarding) so
the endpoint can filter to its project.

**Connection lifecycle — subscribe-before-build.** Both endpoints use Hono's
`streamSSE` and follow the same six steps; the project endpoint's doc-comment
names this as the fix for the v1 drop race:

```text
1. Authenticate — hard-deny unauthenticated clients (both endpoints)
2. Subscribe to the BroadcastChannel  ← FIRST, so nothing is missed during build
3. Build the full initial state (buildProjectState / getInstanceDetail+summaries)
4. writeSSE({ type: "starting", data: state })
5. Drain messages queued during step 3
6. Forward all subsequent messages until the connection closes
   ↳ Abort: stream.onAbort() wakes the park loop / closes the ReadableStream
     controller; stream.aborted checked after build and at the top of the
     forward loop; BroadcastChannel cleanup in finally.
```

The two implementations diverge mechanically (and shouldn't): **instance** uses
a `queue: []` + `ReadableStream` controller; **project** uses a
`messageQueue: []` + a `notifyNewMessage` promise loop (Open items).

**The notify catalog (normative).** Every broadcast to the two SSE channels goes
through a typed wrapper — never `postMessage` directly.
`server/task_management/notify_instance_updated.ts` exposes
`notifyInstanceUpdate(message)` plus ten wrappers, one per `InstanceSseMessage`
type: `notifyInstanceConfigUpdated` (`config_updated`),
`notifyInstanceProjectsLastUpdated` (`projects_last_updated`),
`notifyInstanceUsersUpdated` (`users_updated`), `notifyInstanceAssetsUpdated`
(`assets_updated`), `notifyInstanceGeoJsonMapsUpdated` (`geojson_maps_updated`),
`notifyInstanceStructureUpdated` (`structure_updated`),
`notifyInstanceIndicatorsUpdated` (`indicators_updated`),
`notifyInstanceDatasetsUpdated` (`datasets_updated`),
`notifyInstanceRunProgress` (`run_progress`), `notifyInstanceRScript`
(`r_script`). `server/task_management/notify_project_v2.ts` exposes
`notifyProjectV2(projectId, message)` (spreads `projectId` in) plus fourteen
wrappers: `notifyProjectConfigUpdated`, `notifyProjectVisualizationsUpdated`,
`notifyProjectVisualizationFoldersUpdated`, `notifyProjectSlideDecksUpdated`,
`notifyProjectSlideDeckFoldersUpdated`, `notifyProjectReportsUpdated`,
`notifyProjectReportFoldersUpdated`, `notifyProjectDashboardsUpdated`,
`notifyProjectUsersUpdated`, `notifyProjectLastUpdatedV2`,
`notifyProjectRScript`, `notifyProjectRunProgress`, `notifyProjectRunAttached`,
`notifyProjectAdminArea2Changed` (`admin_area_2_changed` — the scope-identity
edit, PLAN_1_PROJECT_AA2_SCOPE §5; its route also fires
`notifyInstanceProjectsLastUpdated`, the only message the instance projects
list refetches off, so the list badge stays live).
(The module-dirty-state / any-running / modules-updated / datasets-updated
wrappers died with the dirty machine — PLAN_RESULTS_RUNS; run generation pushes
`r_script`, `run_progress`, and `run_attached` instead.) Generation telemetry
fans out on BOTH channels and no emitter calls the project wrappers directly:
`worker_routines/generate_run/notify_run.ts` pairs each instance push with the
per-attach-target project pushes, because a run launched with no attach targets
has no project channel at all. `run_attached` has TWO emitters — the generation
publish and a project's own package picker — and both go through
`server/runs/attach_run.ts`, so the repoint event carries the same full
run-derived catalog either way.

**The `last_updated` entry point.**
`server/task_management/notify_last_updated.ts` —
`notifyLastUpdated(projectId, tableName, ids, lastUpdated)` (~47 call sites,
re-exported via `task_management/mod.ts`) →
`notifyProjectV2({ type:
"last_updated", … })` directly. (The former
`notifyProjectLastUpdatedV2` middle layer was collapsed 2026-08-03.) **Call
`notifyLastUpdated`** from routes.

**The mutation recipe** (see `server/routes/project/reports.ts` for every
variant, in registry/`defineRoute` style): after a successful write, (1)
row-level — `notifyLastUpdated(projectId, tableName, [id], lastUpdated)` so
clients invalidate that entity's caches; (2) list-level — refetch the summary
list and broadcast it whole via `notify<Thing>Updated`, guarded by
`if (list.success)` (but see the stale-on-failure gotcha). The mutation response
itself is just `success`/`err` — clients never install state from it.

**One deliberate exception — collab checkpoint rebroadcasts.** S16's collab room
checkpoints (debounced 1.5 s while users co-edit) fire the row-level
`notifyLastUpdated` on every checkpoint but debounce the list-level rebroadcast
to 5 s per project (`scheduleReportsListRebroadcast` /
`scheduleVizListRebroadcast` in `server/routes/project/project-collab.ts`,
calling the existing `notifyProjectReportsUpdated` /
`notifyProjectVisualizationsUpdated`) — the reports list refetch loads every
report's body, far too heavy per checkpoint while someone is typing. (Slide
checkpoints skip the list rebroadcast entirely; they row-notify both the slide
and its deck.) Net effect during active co-editing: an SSE message and list
refetch roughly every 1.5 s / 5 s — the contract working as designed, worth
knowing if broadcast volume ever becomes a concern.

**The triangle.** A DB write bumps `last_updated` / `last_run_at` (S2). The same
timestamp is (a) broadcast via `notifyLastUpdated` → client T1 store → client
cache version keys flip → UI refetches (PROTOCOL_APP_STATE), and (b) recomputed
into the Valkey `versionHash` → next server read misses → fresh data. The
load-bearing invariant: **every realtime/cached read model is keyed on a version
column that _every_ write path bumps.** A write that forgets to bump leaves
clients and caches stale with no error.

**SSE gotchas** (verified current):

- Project SSE hard-denies unauthenticated clients: `getGlobalUser` before
  `streamSSE` (401 on `NOT_AUTHENTICATED`), then `resolveProjectUserAccess` —
  the same shared core as the route middleware (central-reporting gate,
  admin/H_USERS grant, role row with ≥1 `can_` flag) — 403 on deny, 503 on DB
  failure. Open-access mode does NOT bypass this; anonymous SSE is not
  supported. (`_BYPASS_AUTH` dev mode does skip the project check.)
- `projectsLastUpdated` is server-stamped `new Date()` in `starting`, so every
  SSE reconnect triggers a redundant `/my_projects` refetch on the client.
  Harmless but wasteful (Open items).
- A failed post-write list refetch silently strands clients: `if (list.success)`
  means a failure sends _nothing_ — clients stay stale until the next mutation
  (Open items).
- Channel-name strings are duplicated between producer (`notify_*` files) and
  consumer (SSE endpoints); a one-character drift silently breaks delivery (Open
  items).
- Vestigial `_v2` on the project route path, channel string, and filename — no
  v1 survives; the instance side has no suffix. Don't extend the pattern.
- The two client consumers diverge on reconnect and parsing: instance
  `_MAX_CONNECTION_ATTEMPTS = 5` + raw `JSON.parse`; project
  `MAX_CONNECTION_ATTEMPTS = 3` + `parseJsonOrThrow` (Open items).

**Adding a real-time-updated entity:** add a union member to the `*SseMessage`
type; add a `notify<Thing>Updated` wrapper in the matching `notify_*` file;
include the entity in the `starting` snapshot builder (`buildProjectState` /
`getInstanceDetail`+summaries); in each mutating route bump `last_updated` +
`notifyLastUpdated` + refetch list + `notify<Thing>Updated`; confirm the client
consumer (`t1_sse.tsx`) handles the new `type`.

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
  read recomputes `versionHash`, mismatches, misses, recomputes. Explicit
  `.clear()` is reserved for migration data-transforms that rewrite rows in
  place (the only call sites: `data_transforms/po_config.ts`,
  `data_transforms/metric.ts`); `.clearAll()` currently has zero call sites.
- **TTLs are generous — the cache is version-gated, not time-gated.** `READ_TTL`
  30 days, refreshed on every `get` (so TTL is NOT a reliable invalidation
  backstop: a hot stale-version entry never expires, it just keeps missing);
  writes get 15 days + up to 15 days random jitter to stagger expiry.
- **Degrade gracefully:** `connectValkey()` (called in `main.ts`) is a no-op
  without `VALKEY_URL`; `getValkeyClient()` returns the client only while
  `_available` (any connection error flips it false); every method null-checks
  and try/catches, returning a miss. The app runs cache-disabled, never
  cache-broken.

**Three version layers on the PO family.** Invalidation ingredients are layered,
and each layer has a distinct job (PLAN_RESULTS_RUNS §2.5 re-keyed the data
dimension onto the attached run):

1. **Run/row version** — `presentationObjectLastUpdated` (PO edits) plus the
   immutable `runId` (which run the data came from): the runId replaces the old
   `moduleLastRun` + `datasetsVersion` dimensions — data never changes under a
   run, only the pointer swaps.
2. **`PO_CACHE_VERSION`** (`server/routes/caches/visualizations.ts`, currently
   `"13"`, bump history in the adjacent comment) — a manually-bumped semantic
   version folded into the `versionHash` of the three query-shaped caches; bump
   it when the _generated SQL or payload semantics_ change so old entries miss
   without a prefix migration.
3. **Prefix bump** — `po_detail` → `po_detail_v7`: for payload _shape_ changes
   on the config cache; consumers additionally re-run
   `presentationObjectConfigSchema.parse` on every hit to adapt cross-deploy
   payloads.

**The cache catalog** — five `_UPPER_SNAKE` module-level singletons (four in
`server/routes/caches/visualizations.ts`, one in
`server/routes/caches/dataset.ts`). The three data caches are run-scoped, not
project-scoped: two projects attached to the same run share entries.

| Singleton                        | prefix           | uniquenessHash                                  | versionHash                            |
| -------------------------------- | ---------------- | ----------------------------------------------- | -------------------------------------- |
| `_PO_DETAIL_CACHE`               | `po_detail_v7`   | `projectId\|poId`                               | `presentationObjectLastUpdated\|runId` |
| `_PO_ITEMS_CACHE`                | `po_items`       | `runId\|resultsObjectId\|hashFetchConfig(fc)`   | `PO_CACHE_VERSION`                     |
| `_METRIC_INFO_CACHE`             | `metric_info`    | `runId::metricId`                               | `PO_CACHE_VERSION`                     |
| `_REPLICANT_OPTIONS_CACHE`       | `replicant_opts` | `runId::resultsObjectId::replicateBy::hash(fc)` | `PO_CACHE_VERSION`                     |
| `_FETCH_CACHE_DATASET_HFA_ITEMS` | `ds_hfa`         | constant `"hfa"` (instance-wide singleton)      | `computeHfaCacheHash(hfa_time_points)` |

Two key separators are live: `\|` (po family) and `::` (metric_info,
replicant_opts). A sixth cache (`_FETCH_CACHE_DATASET_HMIS_ITEMS`,
`ds_hmis`/`ds_hmis_v2`) was deleted 2026-07-15 (tombstone comment in
`dataset.ts`): once the HMIS display route's vizItems moved to the import
ledger, the read shrank to ~1.4k rows and the cache's value no longer paid for
its liabilities (mid-run bypass dance, prefix-bump obligation). The route
computes live; client-side T2 caching remains.

**Introspection.** `server/routes/project/cache_status.ts` uses
`scanUniquenessHashes(prefix)` (SCAN-based) to report which results-objects have
cached entries, reverse-parsing the key by hard-coded separator. Its `exists()`
check ignores `versionHash`, so "cached" in the status page can mean a
stale-version entry that will miss (Open items). The client half of that page is
`components/project/project_cache.tsx`, which shows the same per-viz grid for
the server (Valkey) and the client (IndexedDB, scanned by key prefix via
`getClientVizCacheStatuses`).

**Purge on run deletion** (`server/runs/delete_run.ts`, PLAN_RESULTS_RUNS Q-D) —
the one place that deliberately deletes entries rather than out-versioning them,
and it is **disk reclamation, not correctness**: TTLs plus the version
comparison in `get` already mean a dead run's entries are never served. Because
`po_items`, `metric_info` and `replicant_opts` fold `runId` into their
UNIQUENESS hash, they can be swept by prefix (`scanUniquenessHashes(runId…)` →
`clearByUniquenessHash`). `po_detail` folds runId into its VERSION hash instead,
so it cannot be prefix-swept and is left to expire on purpose — the alternative
was a prefix bump for already-dead entries.

**Rules.** Every cache is version-gated on a column bumped by _every_ write path
to its data. Never `.clear()` on a normal write. `parseData` must derive the
same hashes as the `*FromParams` functions — two computations of one key, keep
them in lockstep. Never cache failures (`shouldStore: false` — all five do).
Assume Valkey may be absent. Don't invent another caching mechanism: use
`TimCacheC` for cross-process versioned read models; a process-local in-memory
singleton (as the DHIS2 geojson session cache does — see SYSTEM_07) only for
per-process ephemeral data.

## Client cache machinery (`state/_infra/`)

The client mirrors the server design — two-part version-in-key caching with
in-flight dedup and no failure caching — in `createReactiveCache`
(`client/src/state/_infra/reactive_cache.ts`), the factory behind the eight
`t2_*` caches. Config: `name` (IndexedDB key prefix), `uniquenessKeys(params)`
(auto-hashed with `|`), `versionKey(params, pds)` (reads the T1 project-state
snapshot), optional `maxSize` (memory LRU, default 100) and `pdsNotRequired`
(instance-level caches). Cache key: `<name>/<uniquenessHash>::<versionHash>` —
version is part of the key, so a version flip is an automatic miss. Two tiers:
memory LRU map, then IndexedDB (`idb-keyval`); an in-flight `_unresolved` map
dedups concurrent identical fetches; failures are never cached; the sentinel
versions (`"pds_not_ready"`, `"unknown"`) are refused by `setPromise` — consumer
semantics and the composite-key caveat are in PROTOCOL_APP_STATE "Sentinel
versions". `clearEntry` clears all versions of one uniqueness key;
`clearEntriesWithPrefix` requires a STRICT prefix of the uniqueness keys (a
complete key list matches nothing — full keys are followed by `::`, not `|`).

The four run-derived caches version on the composite `runVersionKey(pds)` =
`` `${attachedRunId ?? "no_run_attached"}~${projectScopeToken(adminArea2)}` ``
(PLAN_1_PROJECT_AA2_SCOPE §5) — a package repoint OR a scope change flips it,
and the `responseRunVersionMatches` guard rejects in-flight responses from the
old key. Uniqueness is already projectId-scoped on all four, so cross-project
bleed was never possible client-side; the scope segment exists solely to
invalidate on a scope change within one project. Old IndexedDB entries become
unreachable via the version flip and age out — no purge, the same mechanism
attach relies on.

Around it:

- **`_infra/indexeddb_cache.ts` (`TimCacheD`)** — plain IndexedDB cache without
  the reactive version machinery; used by `t2_images.ts` (URL-keyed, immutable,
  failure backoff).
- **`_infra/request_queue.ts`** — `RequestQueue(maxConcurrent)` concurrency
  limiter; client singletons `poItemsQueue(15)` and `resultsValueInfoQueue(20)`
  throttle PO-items / value-info fan-out. An **identical copy of the class**
  lives at `server/utils/request_queue.ts` (instantiated in
  `routes/project/presentation_objects.ts` at 10/15) — a cross-tier duplicate
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
  `last_updated → notify` triangle is enforced by hand in ~26 files. A
  write-helper that does mutate + stamp + notify together (or a dev assertion
  flagging mutations without a notify) would make audit §4.3.1 mechanical.
- Factor one canonical SSE connection helper (subscribe-before-build, drain,
  forward, cleanup) — the two endpoints implement the lifecycle two different
  ways.
- Shared channel-name constants for `"instance_updates"` /
  `"project_updates_v2"` — currently duplicated string literals between producer
  and consumer.
- Failed post-write list refetch strands clients: define the handling (log it,
  or always emit `last_updated` so clients self-invalidate).
- Lint for raw `postMessage` / inline SSE messages outside the `notify_*` files
  (scoped to the two SSE channels; `RUN_GENERATION_ENDED_CHANNEL` is S8's and
  exempt).
- Align the two client SSE consumers (reconnect attempts 5 vs 3; `JSON.parse` vs
  `parseJsonOrThrow`) behind one connection contract.
- `projectsLastUpdated` server-stamped in `starting` → redundant `/my_projects`
  refetch on every reconnect; targeted invalidation or a client staleness check
  would eliminate it.
- `cache_status.ts` `exists()` ignores `versionHash` — the status page can
  report a stale-version entry as "cached".
- `ds_hfa` version lockstep spans files: `versionHashFromParams` uses the
  route-computed `computeHfaCacheHash` while `parseData` trusts
  `res.data.cacheHash` from the producer — the dup-logic class item 9 exists to
  kill, here spanning route and lib.
- Cross-deploy payload-shape handling is per-cache and partial:
  `PO_CACHE_VERSION` covers the three query caches, `po_detail_v2` used a prefix
  bump, `ds_hfa` has neither — fold a deploy/build version into `versionHash`
  generically, or document the per-cache choice.
- `RequestQueue` is an identical class copy-pasted into
  `client/src/state/_infra/` and `server/utils/` — move one copy to `lib/`.
- Cruft: rename away the opaque `TimCacheC`/`cache_class_C` suffix and
  disambiguate "cache" (Valkey read-model) from `cacheMiddleware` (HTTP headers)
  when touched.

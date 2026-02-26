# Plan: Persistent Cache with Valkey (Redis-compatible)

## Context

The server's TimCacheB instances hold expensive query results in memory (presentation objects, metric info, dataset items). These are lost on every process restart. On startup, `warmAllCaches()` rebuilds everything from PostgreSQL — running dozens or hundreds of queries. The goal is to back these caches with a persistent store so that restarts are near-instant and previously-fetched data is reused.

---

## Technology Decisions

### Why Valkey, not Redis

In March 2024 Redis Inc. relicensed Redis from BSD to RSALv2/SSPLv1 (source-available, not open-source). This prompted a fork: Valkey, maintained by the Linux Foundation with backing from AWS, Google, Oracle, Ericsson, and Snap. It stays on BSD 3-clause.

Key differences that matter for this project:

- **License**: Valkey is genuinely open-source (BSD). Redis 7.4+ is not. Redis added AGPLv3 in May 2025, but the community trust is broken.
- **Performance**: Valkey 8.0 added improved I/O multi-threading reaching 1.19M req/s — roughly 3× older Redis.
- **Drop-in**: 100% RESP protocol-compatible. Every Redis client library works unchanged with Valkey. No code difference.
- **Docker image**: `valkey/valkey:8` on Docker Hub.

### Why `npm:redis` (node-redis) as the Deno client

Several options were evaluated:

- **`npm:redis` (node-redis, official)** — Works via Deno's npm compatibility (already used in this project for `npm:postgres`, `npm:nanoid`, `npm:papaparse`). The Deno team officially documents it. Full-featured, actively maintained.
- **`@iuioiua/redis` (JSR)** — Minimal, idiomatic Deno. Excellent choice but fewer features and less documentation.
- **`npm:ioredis`** — Also works in Deno but node-redis is now the officially recommended library.

Verdict: `npm:redis` matches existing patterns in `deno.json` and has the most complete documentation.

### Why NOT a simple filesystem snapshot

The alternative explored was writing the cache Maps to a JSON file on SIGTERM and reloading on startup. This was rejected because:

- It requires a clean shutdown to persist (crashes / SIGKILL lose everything)
- Writing all caches atomically is brittle for large datasets
- Valkey persists automatically (RDB snapshots, AOF log) — no code needed for durability

---

## Architecture: Two-tier (L1 = in-memory, L2 = Valkey)

The existing TimCacheB in-memory Map becomes L1 (process cache). Valkey becomes L2 (persistent cache).

```
Request
  → TimCacheB._resolved Map (L1, in-memory)
      ──hit──→ return immediately (fastest path, unchanged)
      ──miss──→ Valkey (L2)
                  ──hit + version matches──→ hydrate L1 directly, return
                  ──miss or stale──→ PostgreSQL (existing path)
                                      → populate L1 via setPromise (existing)
                                      → also write to Valkey L2 (new)
```

The in-flight promise deduplication in `TimCacheB._unresolved` is preserved. This is important: if 10 requests arrive for the same uncached PO simultaneously, only 1 DB query fires — the other 9 await the same promise. Valkey doesn't change this.

---

## File-by-File Implementation

### Step 1: `deno.json` — Add the redis import

Why: Deno requires all npm packages to be declared in `imports` for type-checking to work correctly. Following the existing pattern in this file — all npm deps are pinned with a semver range.

```json
// In the "imports" object, add:
"redis": "npm:redis@^4.7.0",
```

This makes `import { createClient } from "redis"` work anywhere in the server.

---

### Step 2: `server/exposed_env_vars.ts` — Add `VALKEY_URL`

Why: All environment variables in this project are validated at startup and exported as typed constants. Following that pattern, `VALKEY_URL` should be optional (defaulting to `redis://localhost:6379` for local dev) rather than required, so dev machines without Valkey still work.

Add at the end of the Database Configuration section:

```ts
///////////////////////////////////////////////////////////////////////////////
// Cache (Valkey/Redis)
///////////////////////////////////////////////////////////////////////////////

export const _VALKEY_URL =
  Deno.env.get("VALKEY_URL") ?? "redis://localhost:6379";
// Note: No throw — Valkey is optional. If connection fails at runtime,
// the server logs a warning and falls back to in-memory-only behavior.
```

Also add `VALKEY_URL` to the Dockerfile comment block (documentation only, no functional change):

```
# - VALKEY_URL (optional, default: redis://localhost:6379)
```

---

### Step 3: New file `server/redis_client.ts` — Valkey connection singleton

Why: The `createClient()` call from `npm:redis` creates a client but does NOT connect automatically. You must call `.connect()`. The client must be a singleton — creating multiple connections is wasteful (each uses a TCP socket). This file owns the lifecycle: connect on startup, disconnect on shutdown.

```ts
import { createClient, type RedisClientType } from "redis";
import { _VALKEY_URL } from "./exposed_env_vars.ts";

// The client instance. null means not yet connected (or disabled).
let _client: RedisClientType | null = null;

// Whether Valkey is available. Set to false if connect() fails or on error,
// reset to true when the client recovers and emits "ready".
let _available = false;

export async function connectValkey(): Promise<void> {
  try {
    _client = createClient({ url: _VALKEY_URL }) as RedisClientType;

    // node-redis emits 'error' events for connection issues. If unhandled,
    // Node/Deno crashes. This listener prevents that.
    _client.on("error", (err: Error) => {
      console.warn(`[Valkey] Connection error: ${err.message}`);
      _available = false;
    });

    // Reset _available to true whenever the client is ready to accept commands.
    // This handles both initial connect and auto-reconnect after transient errors.
    _client.on("ready", () => {
      _available = true;
      console.log("[Valkey] Ready");
    });

    await _client.connect();
    _available = true;
    console.log(`[Valkey] Connected to ${_VALKEY_URL}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Valkey] Could not connect (${msg}). Cache will be in-memory only.`,
    );
    _client = null;
    _available = false;
  }
}

export async function disconnectValkey(): Promise<void> {
  if (_client && _available) {
    await _client.quit();
    console.log("[Valkey] Disconnected");
  }
}

// Used by cache_persistence.ts — returns null if Valkey is unavailable.
export function getValkeyClient(): RedisClientType | null {
  return _available ? _client : null;
}
```

Key design decisions:

- **`_available` flag**: If Valkey is down, the server continues running with in-memory-only caches. This is the correct degraded behavior — the cache is an optimization, not a hard dependency.
- **`"ready"` event listener**: node-redis auto-reconnects by default. Without listening to `"ready"`, a single transient error would permanently disable Valkey for the life of the process. The `"ready"` listener resets `_available` to `true` whenever the client recovers, ensuring the server re-enables Valkey after a transient outage.

---

### Step 4: New file `server/cache_persistence.ts` — typed get/set for persistent entries

Why: This is the adapter between the abstract TimCacheB persistence hook and the concrete Valkey client. It handles JSON serialization, key namespacing, and the `versionHash` envelope.

```ts
import { getValkeyClient } from "./redis_client.ts";

// Every cached entry is stored in Valkey as a JSON string with this shape.
// The versionHash is checked on read — if it doesn't match the current
// version (e.g., moduleLastRun changed), the entry is ignored.
type PersistedEntry<T> = {
  versionHash: string;
  data: T;
};

// Keys are namespaced to avoid collisions if Valkey is shared.
// Format: "cache:{cacheName}:{uniquenessHash}"
// Example: "cache:po_detail:proj-abc|po-xyz"
function buildKey(cacheName: string, uniquenessHash: string): string {
  return `cache:${cacheName}:${uniquenessHash}`;
}

// Reads a persisted entry from Valkey.
// Returns null if: Valkey unavailable, key missing, JSON parse error.
export async function getPersisted<T>(
  cacheName: string,
  uniquenessHash: string,
): Promise<PersistedEntry<T> | null> {
  const client = getValkeyClient();
  if (!client) return null;

  try {
    const raw = await client.get(buildKey(cacheName, uniquenessHash));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedEntry<T>;
  } catch {
    // JSON parse errors or client errors — treat as cache miss
    return null;
  }
}

// Writes an entry to Valkey.
// Fire-and-forget: errors are logged but do not throw, since cache writes
// should never break the main request flow.
export async function setPersisted<T>(
  cacheName: string,
  uniquenessHash: string,
  versionHash: string,
  data: T,
): Promise<void> {
  const client = getValkeyClient();
  if (!client) return;

  try {
    const entry: PersistedEntry<T> = { versionHash, data };
    await client.set(
      buildKey(cacheName, uniquenessHash),
      JSON.stringify(entry),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Valkey] Failed to persist cache entry (${cacheName}:${uniquenessHash}): ${msg}`,
    );
  }
}
```

Why no TTL: The existing version hashing already handles invalidation. When `moduleLastRun` changes (after a module runs), `getPersisted` returns a mismatched `versionHash` and the entry is ignored. Setting a TTL would add risk of premature expiry with no benefit.

Why JSON: Redis stores strings. The cache data (`APIResponseWithData<PresentationObjectDetail>` etc.) needs to cross the serialization boundary. All these types are plain data objects — no functions, no class instances — so `JSON.stringify`/`JSON.parse` roundtrips correctly.

---

### Step 5: `lib/cache_class_B_in_memory_map.ts` — Add optional persist hook + hydration method

Why: TimCacheB is in `lib/` (shared between client and server). The persistence is server-only. The cleanest approach is two additions:

1. An optional `persistHook` constructor parameter — a callback that fires after each successful `setPromise` write to `_resolved`.
2. A `hydrateResolved` method that writes directly to `_resolved` **without** triggering the hook. This is used by the cache warming code when loading from Valkey — since the data is already in Valkey, there's no point writing it back.

Changes to the constructor signature:

```ts
// New: optional persistence hook passed at construction time
type PersistHook<T> = (
  uniquenessHash: string,
  versionHash: string,
  data: T,
) => Promise<void>;

export class TimCacheB<UniquenessParams, VersionParams, T> {
  private _resolved = new Map<string, ResolvedPayload<T>>();
  private _unresolved = new Map<string, UnresolvedPayload<T>>();
  private _hashFuncs;
  private _persistHook?: PersistHook<T>;  // NEW

  constructor(
    hashFuncs: { ... },
    persistHook?: PersistHook<T>,          // NEW: optional second argument
  ) {
    this._hashFuncs = hashFuncs;
    this._persistHook = persistHook;       // NEW
  }
```

At the end of `setPromise`, after writing to `_resolved`, add:

```ts
  // After: this._resolved.set(d.uniquenessHash, { versionHash: d.versionHash, data });
  // Add:
  if (this._persistHook) {
    // Fire-and-forget: persistence failure must not throw or await here,
    // because setPromise is already being awaited by cache_warming.ts
    this._persistHook(d.uniquenessHash, d.versionHash, data).catch((err) => {
      console.warn("[TimCacheB] Persist hook failed:", err);
    });
  }
```

Add new `hydrateResolved` method:

```ts
  // Directly populates _resolved from a known-good external source (e.g. Valkey).
  // Does NOT trigger the persist hook — the data is already in the external store.
  hydrateResolved(
    uniquenessHash: string,
    versionHash: string,
    data: T,
  ): void {
    this._resolved.set(uniquenessHash, { versionHash, data });
  }
```

Why fire-and-forget for `persistHook`: The persist hook is async (Valkey network call). Awaiting it inside `setPromise` would add Valkey latency to every cache write. Since persistence is an optimization (L2 cache), it's acceptable to write it in the background.

Why `hydrateResolved` instead of calling `setPromise` for Valkey hits: Calling `setPromise(Promise.resolve(data))` during warming would trigger the persist hook and write the data back to Valkey — a pointless round-trip for every warm-restart cache hit. `hydrateResolved` populates `_resolved` directly with no side effects.

---

### Step 6: `server/routes/caches/visualizations.ts` — Wire the persist hook

Why: The 3 TimCacheB instances that are warmed by `cache_warming.ts` need to know their Valkey key namespace (`cacheName`) and call `setPersisted`.

Each warmed cache gets a second argument. Example for `_PO_DETAIL_CACHE`:

```ts
import { setPersisted } from "../../../cache_persistence.ts";

export const _PO_DETAIL_CACHE = new TimCacheB<...>(
  {
    // existing hashFuncs unchanged
    uniquenessHashFromParams: (params) =>
      [params.projectId, params.presentationObjectId].join("|"),
    versionHashFromParams: (params) => params.presentationObjectLastUpdated,
    parseData: (res) => { ... },
  },
  // NEW: persist hook
  (uniquenessHash, versionHash, data) =>
    setPersisted("po_detail", uniquenessHash, versionHash, data),
);
```

Apply same pattern to:

- `_PO_ITEMS_CACHE` → cacheName: `"po_items"`
- `_METRIC_INFO_CACHE` → cacheName: `"metric_info"`

`_REPLICANT_OPTIONS_CACHE` does **not** get a persist hook. It is not warmed by `cache_warming.ts` and its route handler has no Valkey read path — adding a hook would write to Valkey on every population but those entries would never be read back on restart. Leave its constructor single-argument (unchanged).

---

### Step 7: `server/routes/caches/dataset.ts` — Wire the persist hook

Same pattern:

- `_FETCH_CACHE_DATASET_HMIS_ITEMS` → cacheName: `"dataset_hmis"`
- `_FETCH_CACHE_DATASET_HFA_ITEMS` → cacheName: `"dataset_hfa"`

---

### Step 8: `server/cache_warming.ts` — Batch version checks + check Valkey before PostgreSQL

This step has two sub-changes that work together to reduce warm restart time from ~1.5 hours to under a minute.

#### 8a. Batch the version-check queries (eliminates 2 DB queries per PO)

Why: Currently the warming loop makes 2 individual PostgreSQL queries per PO just to get the version hashes needed to check the cache:

```sql
SELECT last_updated FROM presentation_objects WHERE id = $1  -- per PO
SELECT last_run FROM modules WHERE id = $1                   -- per PO
```

With thousands of POs, these add up significantly even on a warm restart. They can be eliminated by fetching both columns in the initial query that already loads all POs for a project.

Change the initial query in `warmPresentationObjectCaches()` from:

```ts
const allPresentationObjects = await projectDb<
  { id: string; label: string; module_id: string }[]
>`
  SELECT po.id, po.label, m.module_id
  FROM presentation_objects po
  JOIN metrics m ON po.metric_id = m.id
`;
```

To:

```ts
const allPresentationObjects = await projectDb<
  {
    id: string;
    label: string;
    module_id: string;
    last_updated: string;
    module_last_run: string | null;
  }[]
>`
  SELECT po.id, po.label, met.module_id, po.last_updated, mod.last_run AS module_last_run
  FROM presentation_objects po
  JOIN metrics met ON po.metric_id = met.id
  LEFT JOIN modules mod ON met.module_id = mod.id
`;
```

Why `LEFT JOIN` on modules (not `INNER JOIN`): Modules that haven't run yet have no `last_run`. With `INNER JOIN`, POs for unrun modules would silently disappear from the results. With `LEFT JOIN`, they're included with `module_last_run = null`, which is handled by the `if (!moduleLastRun)` check — preserving the current behaviour.

Now `po.last_updated` and `po.module_last_run` are available directly in the loop — the two per-PO queries are removed entirely. This is a single query per project regardless of how many POs it has.

**Behavioural note**: The current code fetches and warms PO detail even when `moduleLastRun` is null (PO detail is independent of module runs). After this change, POs with unrun modules are skipped before PO detail warming. This is acceptable — there's no data to display for an unrun module — but it's a deliberate change from previous behaviour.

#### 8b. Check Valkey before PostgreSQL for the expensive data queries

Why this is the most impactful change: The expensive operations in the loop — `getPresentationObjectDetail()`, `getResultsValueInfoForPresentationObject()`, and `getPresentationObjectItems()` — each run complex multi-table JOINs that can take seconds. On a warm restart, Valkey has all of this already. We check Valkey first using the version hashes from 8a, and only fall back to PostgreSQL on a miss.

The combined flow per PO:

```
Current:  2 per-PO DB queries (version checks) + 3 expensive DB queries = slow
New:      0 per-PO DB queries (versions in initial batch query)
          + 3 Valkey GETs (fast) → hydrate L1 directly via hydrateResolved(), skip DB
          OR on miss: 3 expensive DB queries (same as before) + write to Valkey via hook
```

The `hydrateResolved()` method is used here (not `setPromise`). This avoids triggering the persist hook and writing data back to Valkey unnecessarily on every warm-restart cache hit.

Before the existing `getPresentationObjectDetail(...)` call, add:

```ts
// poLastUpdated and moduleLastRun now come from the batched query (8a)
const poLastUpdated = po.last_updated;
const moduleLastRun = po.module_last_run;

if (!moduleLastRun) {
  console.log(
    `[${project.label}] Skipped PO (${po.label}): module has not run yet`,
  );
  return { success: false, label: po.label, error: "Module has not run yet" };
}

// Try Valkey for PO detail
const detailUniquenessHash = [project.id, po.id].join("|");
const persistedDetail = await getPersisted<
  APIResponseWithData<PresentationObjectDetail>
>("po_detail", detailUniquenessHash);

let poDetail;
if (
  persistedDetail &&
  persistedDetail.versionHash === poLastUpdated &&
  persistedDetail.data.success === true
) {
  // Valkey hit — hydrate L1 directly (no persist hook, data already in Valkey)
  _PO_DETAIL_CACHE.hydrateResolved(
    detailUniquenessHash,
    poLastUpdated,
    persistedDetail.data,
  );
  poDetail = persistedDetail.data.data;
} else {
  // Existing DB fetch path (unchanged) — persist hook writes to Valkey automatically
  const detailPromise = getPresentationObjectDetail(
    project.id,
    projectDb,
    po.id,
    mainDb,
  );
  _PO_DETAIL_CACHE.setPromise(
    detailPromise,
    { projectId: project.id, presentationObjectId: po.id },
    { presentationObjectLastUpdated: poLastUpdated },
  );
  const resDetail = await detailPromise;
  throwIfErrWithData(resDetail);
  poDetail = resDetail.data;
}
```

For `_METRIC_INFO_CACHE` and `_PO_ITEMS_CACHE` the pattern is **L1 → Valkey → DB** (not just Valkey → DB). These caches are shared across POs: many POs share the same metric or results object. Once one PO warms the entry into L1, subsequent POs must check L1 first — going straight to Valkey when L1 already has the answer wastes a network call per PO.

**Metric info block** (replaces the existing `_METRIC_INFO_CACHE` section in the warming loop):

```ts
/////////////////////////
//                     //
//    Variable info    //
//                     //
/////////////////////////

// 1. Check L1 first (many POs share the same metric — L1 may already be warm)
const existingResultsValueInfo = await _METRIC_INFO_CACHE.get(
  { projectId: project.id, metricId: poDetail.resultsValue.id },
  { moduleLastRun },
);

if (!existingResultsValueInfo || existingResultsValueInfo.success === false) {
  // 2. L1 miss — try Valkey
  const metricUniquenessHash = [project.id, poDetail.resultsValue.id].join("::");
  const persistedMetric = await getPersisted<
    APIResponseWithData<ResultsValueInfoForPresentationObject>
  >("metric_info", metricUniquenessHash);

  if (
    persistedMetric &&
    persistedMetric.versionHash === moduleLastRun &&
    persistedMetric.data.success === true
  ) {
    // Valkey hit — hydrate L1 directly (no persist hook, already in Valkey)
    _METRIC_INFO_CACHE.hydrateResolved(
      metricUniquenessHash,
      moduleLastRun,
      persistedMetric.data,
    );
  } else {
    // 3. Valkey miss — existing DB path (persist hook writes to Valkey automatically)
    const resultsValueInfoPromise = getResultsValueInfoForPresentationObject(
      mainDb,
      projectDb,
      project.id,
      poDetail.resultsValue.id,
      moduleLastRun,
    );

    _METRIC_INFO_CACHE.setPromise(
      resultsValueInfoPromise,
      { projectId: project.id, metricId: poDetail.resultsValue.id },
      { moduleLastRun },
    );

    const resResultsValueInfo = await resultsValueInfoPromise;
    throwIfErrWithData(resResultsValueInfo);
    console.log(
      `[${project.label}] Warmed Results Value Info for RV: ${poDetail.resultsValue.id}, moduleLastRun: ${moduleLastRun}`,
    );
  }
}
```

**Items block** (replaces the existing `_PO_ITEMS_CACHE` section in the warming loop):

Note: add these to the imports at the top of `cache_warming.ts` — none are currently present:

```ts
// New import from the new file:
import { getPersisted } from "./cache_persistence.ts";

// New additions to the existing "lib" import:
import {
  // ... existing imports unchanged ...
  hashFetchConfig,                          // NEW: for items uniqueness hash
  type PresentationObjectDetail,            // NEW: for getPersisted<> generic
  type ItemsHolderPresentationObject,       // NEW: for getPersisted<> generic
} from "lib";
```

```ts
/////////////////
//             //
//    Items    //
//             //
/////////////////

const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
  poDetail.resultsValue,
  poDetail.config,
);
throwIfErrWithData(resFetchConfig);
const fetchConfig = resFetchConfig.data;

// 1. Check L1 first (shared across POs with same resultsObjectId + fetchConfig)
const existingItems = await _PO_ITEMS_CACHE.get(
  {
    projectId: project.id,
    resultsObjectId: poDetail.resultsValue.resultsObjectId,
    fetchConfig,
  },
  { moduleLastRun },
);

if (!existingItems) {
  // 2. L1 miss — try Valkey
  const itemsUniquenessHash = [
    project.id,
    poDetail.resultsValue.resultsObjectId,
    hashFetchConfig(fetchConfig),
  ].join("|");
  const persistedItems = await getPersisted<
    APIResponseWithData<ItemsHolderPresentationObject>
  >("po_items", itemsUniquenessHash);

  if (
    persistedItems &&
    persistedItems.versionHash === moduleLastRun &&
    persistedItems.data.success === true
  ) {
    // Valkey hit — hydrate L1 directly
    _PO_ITEMS_CACHE.hydrateResolved(
      itemsUniquenessHash,
      moduleLastRun,
      persistedItems.data,
    );
  } else {
    // 3. Valkey miss — existing DB path (persist hook writes to Valkey automatically)
    const itemsPromise = getPresentationObjectItems(
      mainDb,
      project.id,
      projectDb,
      poDetail.resultsValue.resultsObjectId,
      fetchConfig,
      poDetail.resultsValue.periodOptions.at(0),
      moduleLastRun,
    );

    _PO_ITEMS_CACHE.setPromise(
      itemsPromise,
      {
        projectId: project.id,
        resultsObjectId: poDetail.resultsValue.resultsObjectId,
        fetchConfig,
      },
      { moduleLastRun },
    );

    const resItems = await itemsPromise;
    throwIfErrWithData(resItems);

    if (resItems.data.status === "too_many_items") {
      console.log(
        `[${project.label}] Warmed cache for PO: ${po.label} (RV: ${poDetail.resultsValue.id}) - TOO MANY ITEMS`,
      );
    } else if (resItems.data.status === "no_data_available") {
      console.log(
        `[${project.label}] Warmed cache for PO: ${po.label} (RV: ${poDetail.resultsValue.id}) - NO DATA`,
      );
    } else {
      console.log(
        `[${project.label}] Warmed cache for PO: ${po.label} (RV: ${poDetail.resultsValue.id}) - ${resItems.data.items.length} items`,
      );
    }
  }
}
```

Also add Valkey checks to `warmDatasetCaches()` for HMIS and HFA. Unlike the shared PO caches, dataset entries are not reused across iterations, so there is **no L1 check** — the pattern is Valkey → DB only.

Two additional type imports are needed if the generic types are used explicitly:

```ts
// Add to the "lib" import in cache_warming.ts:
type ItemsHolderDatasetHmisDisplay,   // NEW: for dataset HMIS getPersisted<> generic
type ItemsHolderDatasetHfaDisplay,    // NEW: for dataset HFA getPersisted<> generic
```

**HMIS** — inside the existing `for (const indicatorType of ["raw", "common"])` loop, before `getDatasetHmisItemsForDisplay`:

```ts
const hmisUniquenessHash = `${indicatorType}_${Object.values(facilityColumns).sort().join("_")}`;
const hmisVersionHash = `${hmisVersion.id}_${indicatorMappingsVersion}`;
const persistedHmis = await getPersisted<APIResponseWithData<ItemsHolderDatasetHmisDisplay>>(
  "dataset_hmis",
  hmisUniquenessHash,
);

if (
  persistedHmis &&
  persistedHmis.versionHash === hmisVersionHash &&
  persistedHmis.data.success === true
) {
  _FETCH_CACHE_DATASET_HMIS_ITEMS.hydrateResolved(
    hmisUniquenessHash,
    hmisVersionHash,
    persistedHmis.data,
  );
  console.log(`Warmed HMIS dataset cache from Valkey (${indicatorType} indicators)`);
} else {
  // Existing DB path unchanged
  const hmisPromise = getDatasetHmisItemsForDisplay(...);
  _FETCH_CACHE_DATASET_HMIS_ITEMS.setPromise(...);
  const resHmis = await hmisPromise;
  if (resHmis.success) {
    console.log(`Warmed HMIS dataset cache (${indicatorType} indicators)`);
  }
}
```

**HFA** — before `getDatasetHfaItemsForDisplay`:

```ts
const hfaVersionHash = `${hfaVersion.id}`;
const persistedHfa = await getPersisted<APIResponseWithData<ItemsHolderDatasetHfaDisplay>>(
  "dataset_hfa",
  "hfa",
);

if (
  persistedHfa &&
  persistedHfa.versionHash === hfaVersionHash &&
  persistedHfa.data.success === true
) {
  _FETCH_CACHE_DATASET_HFA_ITEMS.hydrateResolved("hfa", hfaVersionHash, persistedHfa.data);
  console.log("Warmed HFA dataset cache from Valkey");
} else {
  // Existing DB path unchanged
  const hfaPromise = getDatasetHfaItemsForDisplay(mainDb, hfaVersion.id);
  _FETCH_CACHE_DATASET_HFA_ITEMS.setPromise(...);
  const resHfa = await hfaPromise;
  if (resHfa.success) {
    console.log("Warmed HFA dataset cache");
  }
}
```

Note on hash computation: the uniqueness hashes above replicate what `uniquenessHashFromParams` computes in `dataset.ts`. If those functions ever change, these strings must stay in sync.

---

### Step 9: `main.ts` — Connect/disconnect and add SIGTERM

Why SIGTERM matters: Docker sends SIGTERM to containers when stopping (`docker stop`, `docker compose down`). The current code only handles SIGINT (Ctrl+C). Without a SIGTERM handler, the process gets forcefully killed by Docker's 10-second SIGKILL timeout and the Valkey client socket isn't cleanly closed.

Current shutdown:

```ts
const shutdown = () => {
  console.log("\nShutting down...");
  server.shutdown();
  Deno.exit(0);
};
Deno.addSignalListener("SIGINT", shutdown);
```

New shutdown (async, disconnect Valkey, handle both signals, with exit failsafe):

```ts
const shutdown = async () => {
  console.log("\nShutting down...");
  // Failsafe: if shutdown hangs, force exit before Docker's SIGKILL timeout (10s).
  // This ensures a clean exit even if server.shutdown() or disconnectValkey() hangs.
  setTimeout(() => {
    console.warn("[Shutdown] Timed out — forcing exit");
    Deno.exit(1);
  }, 8000);
  await Promise.all([
    server.shutdown(),
    disconnectValkey(),
  ]);
  Deno.exit(0);
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);  // NEW: Docker uses this
```

Note: `Deno.addSignalListener` does not await the handler's returned Promise, so the `async` shutdown is safe — the `setTimeout` failsafe guarantees the process always exits within Docker's SIGKILL window.

Also add before `dbStartUp()`:

```ts
import { connectValkey, disconnectValkey } from "./server/redis_client.ts";

await connectValkey(); // NEW: connect before warming
await dbStartUp();
await warmAllCaches(); // warmAllCaches now checks Valkey first
```

---

### Step 10: Changes to `server-cli` — Wire Valkey into the container lifecycle

Important context: There are no docker-compose files. The server-cli tool manages all container lifecycles with raw `docker run` commands. Each instance gets its own Docker network named `{id}`, and containers communicate by name within that network. Valkey follows the exact same pattern as postgres.

#### `server-cli/src/core/constants.ts` — Add `valkey_data` to `SUBDIRECTORIES` and `valkey/valkey:8` to `IMAGES_TO_PULL`

Two changes:

```ts
// Before:
export const IMAGES_TO_PULL = ["timroberton/comb:wb-hmis-r-linux", "postgres:17.4", "dpage/pgadmin4"];
export const SUBDIRECTORIES = ["databases", "sandbox", "exports", "assets"];

// After:
export const IMAGES_TO_PULL = ["timroberton/comb:wb-hmis-r-linux", "postgres:17.4", "dpage/pgadmin4", "valkey/valkey:8"];
export const SUBDIRECTORIES = ["databases", "sandbox", "exports", "assets", "valkey_data"];
```

Why `IMAGES_TO_PULL`: `wb pull` proactively fetches all images listed here. Without this, `wb pull` won't pre-fetch the Valkey image — it would be pulled on-demand during `wb run`, requiring internet access at run time rather than pull time.

Why `SUBDIRECTORIES`: The `wb dirs <id>` command creates the subdirectories listed here. Valkey needs a persistent directory on the host machine that gets bind-mounted into the container — just like `databases/` is bind-mounted into the postgres container.

For existing instances, create the directory manually once:

```sh
mkdir /path/to/{instanceId}/valkey_data
```

#### `server-cli/src/commands/docker/run-container.ts` — Start Valkey before the platform container

Add a "Run Valkey" section immediately after the "Run Postgres" section (after `await chdRunPostgres.output()`), and add `VALKEY_URL` to the platform container's environment args.

New "Run Valkey" section:

```ts
////////////////////////
//                    //
//    Run Valkey      //
//                    //
////////////////////////
const argsRunValkey = [
  "run",
  "--rm",           // remove container on stop (data persists via volume)
  "-dt",
  "--name",
  `${serverInfo.id}-valkey`,
  "--network",
  serverInfo.id,    // same network as postgres and platform container
  "-v",
  `${join(instanceDirPath, "valkey_data")}:/data`,
  "valkey/valkey:8",
  "valkey-server",
  "--save", "60", "1",  // RDB snapshot: save if 1+ key changed in 60s
];
const cmdRunValkey = new Deno.Command("docker", { args: argsRunValkey });
const chdRunValkey = cmdRunValkey.spawn();
await chdRunValkey.output();
```

Add `VALKEY_URL` to the platform container args (in `argsRunContainer`, after the `PG_PASSWORD` entry):

```ts
"-e",
`VALKEY_URL=redis://${serverInfo.id}-valkey:6379`,
```

Why `--rm`: Same as postgres — the container itself is ephemeral, but data persists through the host directory bind mount (`valkey_data/`). When the container is stopped and a new one starts, Valkey reloads from the RDB snapshot file in that directory.

Why `--save 60 1`: Valkey's RDB persistence mode writes a point-in-time snapshot to `/data/dump.rdb` whenever at least 1 key changed in the last 60 seconds. This file is in the bind-mounted `valkey_data/` directory on the host, so it survives container restarts and new deploys.

#### `server-cli/src/commands/docker/restart.ts` — Stop Valkey on restart

```ts
// Before:
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-postgres`, 30);

// After:
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-postgres`, 30);
await stopContainer(`${serverInfo.id}-valkey`, 10);  // NEW
```

The 10-second timeout gives Valkey time to finish writing its RDB snapshot before being killed.

#### `server-cli/src/commands/docker/stop.ts` — Stop Valkey before network removal

This is a required change. `stop.ts` removes the Docker network (`docker network rm {id}`) after stopping the platform container and postgres. Docker **cannot remove a network that has active containers attached to it**. Without stopping Valkey here, the `network rm` call will fail because the Valkey container (using `--rm`, so auto-removed on stop) remains running and attached to the network.

```ts
// Before:
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-postgres`, 30);
// ... network rm

// After:
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-postgres`, 30);
await stopContainer(`${serverInfo.id}-valkey`, 10);  // NEW: must stop before network rm
// ... network rm (unchanged)
```

---

## Summary of All File Changes

| File | Type | Change |
|------|------|--------|
| `deno.json` | Modify | Add `"redis": "npm:redis@^4.7.0"` to imports |
| `server/exposed_env_vars.ts` | Modify | Add optional `_VALKEY_URL` export |
| `server/redis_client.ts` | New | Valkey singleton: connect, disconnect, getClient. Includes `"ready"` listener to re-enable after transient errors. |
| `server/cache_persistence.ts` | New | Typed `getPersisted`/`setPersisted` using Valkey |
| `lib/cache_class_B_in_memory_map.ts` | Modify | Add optional `persistHook` param + `hydrateResolved()` method |
| `server/routes/caches/visualizations.ts` | Modify | Wire `persistHook` to 3 of 4 TimCacheB instances (`_PO_DETAIL_CACHE`, `_PO_ITEMS_CACHE`, `_METRIC_INFO_CACHE`); leave `_REPLICANT_OPTIONS_CACHE` unchanged |
| `server/routes/caches/dataset.ts` | Modify | Wire `persistHook` to both dataset TimCacheB instances |
| `server/cache_warming.ts` | Modify | (1) Batch version-check queries; (2) L1→Valkey→DB for `_METRIC_INFO_CACHE` and `_PO_ITEMS_CACHE`; Valkey→DB for `_PO_DETAIL_CACHE`; add `hashFetchConfig` to `"lib"` import |
| `main.ts` | Modify | `connectValkey` before startup, `disconnectValkey` on shutdown, add SIGTERM handler with 8s failsafe |
| `server-cli/src/core/constants.ts` | Modify | Add `"valkey_data"` to `SUBDIRECTORIES`; add `"valkey/valkey:8"` to `IMAGES_TO_PULL` |
| `server-cli/src/commands/docker/run-container.ts` | Modify | Add Valkey `docker run` command + `VALKEY_URL` env to platform container |
| `server-cli/src/commands/docker/restart.ts` | Modify | Stop `{id}-valkey` container before restart |
| `server-cli/src/commands/docker/stop.ts` | Modify | Stop `{id}-valkey` before network removal (required — running container blocks `network rm`) |

---

## Verification Steps

### Local dev (using `deno task dev`)

A local Valkey instance is needed. Start one once and leave it running:

```sh
docker run --name valkey-dev -d -p 6379:6379 valkey/valkey:8
```

This is the only raw Docker command required for dev. Subsequent dev restarts reuse the same container (`docker start valkey-dev` / `docker stop valkey-dev`).

**1. First startup** — Run `deno task dev`. Observe logs:
   - `[Valkey] Ready` (fires during connect)
   - `[Valkey] Connected to redis://localhost:6379`
   - Cache warming logs show DB queries firing (Valkey is empty on first run)

**2. Warm restart** — Stop the server (Ctrl+C), run `deno task dev` again. Observe:
   - Cache warming completes near-instantly
   - Log lines show Valkey hits (no DB fetch lines for already-warmed POs)

**3. Stale cache invalidation** — Modify a PO's `last_updated` directly in the DB. Run `deno task dev`. That PO's detail should show a DB fetch log line (version mismatch bypasses Valkey), all others still hit Valkey.

**4. Transient Valkey error** — With server running, stop and restart the local Valkey container:
   ```sh
   docker stop valkey-dev   # triggers [Valkey] Connection error: ... log
   docker start valkey-dev  # triggers [Valkey] Ready log
   ```
   Server must continue serving requests throughout (L1 unaffected). New cache writes resume to Valkey after reconnect.

**5. Valkey unavailable at startup** — Stop `valkey-dev`, then run `deno task dev`. Observe:
   - `[Valkey] Could not connect ... Cache will be in-memory only.`
   - Server starts and warms normally from DB
   - All requests work correctly

---

### Production (using `wb` commands)

For existing instances, run `wb init-dirs <id>` before the first `wb run`. The command skips directories that already exist, so it is safe to run on an existing instance — it will only create the missing `valkey_data/` directory.

**6. Run** — `wb run <id>`. Three containers start: `{id}-postgres`, `{id}-valkey`, `{id}`. Platform logs show `[Valkey] Ready` and `[Valkey] Connected to redis://{id}-valkey:6379`.

**7. Pull** — `wb pull`. Output should include a pull line for `valkey/valkey:8`.

**8. Stop** — `wb stop <id>`. Valkey is stopped before the network is removed — `docker network rm` should succeed without errors.

**9. Restart** — `wb restart <id>`. Valkey is stopped, then restarted via `runContainer`. Platform reconnects and warms from Valkey — near-instant on second restart.

**10. New deploy** — `wb stop <id>`, update the server image, `wb run <id>`. The `valkey_data/` directory persists across the stop/run cycle. Cache restores from the RDB snapshot — first startup after deploy should be fast rather than a full DB warm.

**11. Per-instance isolation** — Two instances running simultaneously should have completely independent caches. The containers `instanceA-valkey` and `instanceB-valkey` are on separate Docker networks and separate `valkey_data/` directories on the host.

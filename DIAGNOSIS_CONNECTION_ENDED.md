# Diagnosis: Ethiopia Production CONNECTION_ENDED Crash

## Observed Symptoms

From `docker logs ethiopia`:

1. Server starts normally, serves requests with cache hits
2. Project migrations run (all 8 succeed on a new project DB)
3. `Dependencies NOT READY for m001...m006, hfa001` — expected, modules have no data
4. Some PO Items requests show `MISS` times of **52-60 million ms (~14-16 hours)** — these requests were stuck, never completing
5. `CONNECTION_ENDED ethiopia-postgres:5432` errors appear
6. Cascading `SERVICE_UNAVAILABLE` on every subsequent request via `getGlobalUser` → `requireGlobalPermission`

From `docker inspect ethiopia-postgres`:

- `OOMKilled: false`
- `RestartCount: 0`
- `Memory: 0` (no limit)
- Running continuously since March 11 03:34 UTC

From `docker logs ethiopia-postgres`:

- Only routine checkpoints and expected "relation does not exist" errors (module results tables not yet created)
- **No connection drops, kills, or errors logged by postgres itself**

## Key Conclusion

**Postgres did not crash, restart, or drop connections.** The `CONNECTION_ENDED` errors originate from the application's own connection management code closing connections while they are still in use.

## Root Cause Analysis

### The Connection Cache Lifecycle

`server/db/postgres/connection_manager.ts` maintains a `Map<string, CachedConnection>` where each entry holds a `postgres.js` `Sql` pool instance. A cleanup function runs every 60 seconds:

```typescript
// Lines 61-85 (actual code, verbatim)
async function cleanupStaleConnections() {
  const now = new Date();
  const toRemove: string[] = [];

  for (const [key, conn] of _CACHED_CONNECTIONS.entries()) {
    const age = now.getTime() - conn.createdAt.getTime();
    const idleTime = now.getTime() - conn.lastUsed.getTime();
    if (age > MAX_CACHE_AGE_MS || idleTime > MAX_IDLE_TIME_MS) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    const conn = _CACHED_CONNECTIONS.get(key);
    if (conn) {
      try {
        await conn.sql.end();           // ← Shuts down the pool
      } catch (e) {
        console.error(`Error closing connection for ${key}:`, e);
      }
      _CACHED_CONNECTIONS.delete(key);   // ← Outside try/catch: runs even if .end() throws
    }
  }
}
```

Note: `cleanupStaleConnections` is `async` but called from `setInterval` without error handling (line 52-54). If it throws an unhandled rejection, the cleanup interval could silently stop or crash the process depending on the Deno runtime version. The fix is trivial: `cleanupStaleConnections().catch(console.error)`.

Also: `.delete()` is **outside** the `try/catch`, so the map entry is cleaned up even if `.end()` throws. This is slightly better than if it were inside the `try` (as it is in `closePgConnection` — see Issue 6). However, the core race remains: `.delete()` runs **after** `.end()`, so during the `.end()` await, the dying connection is still in the cache and can be handed to new requests.

### Issue 1: Age-Based Eviction Kills Active Connections

`MAX_CACHE_AGE_MS = 30 * 60 * 1000` (30 minutes)

The condition is `age > MAX_CACHE_AGE_MS || idleTime > MAX_IDLE_TIME_MS`. The `||` means a connection older than 30 minutes is **always** evicted, even if it was used 1ms ago. After 30 minutes of uptime, every cached connection becomes eligible for cleanup regardless of activity level.

### Issue 2: Race Between Cleanup and Request Handling

The cleanup sequence has a critical window:

```
T=0:    cleanupStaleConnections() decides connection X is stale
T=1:    Calls await conn.sql.end()
        postgres.js stops accepting NEW queries on this pool
        But connection X is STILL in _CACHED_CONNECTIONS (delete hasn't happened yet)
T=2:    Incoming request calls getPgConnectionFromCacheOrNew()
        Finds connection X in cache (it hasn't been deleted yet)
        Updates lastUsed, returns the Sql instance
T=3:    Request executes query on the shutting-down pool
        → CONNECTION_ENDED
T=4:    .end() completes, _CACHED_CONNECTIONS.delete(key) runs
        Too late — the request already has a dead reference
```

There is no lock, no re-check of `lastUsed` before closing, and no mechanism to prevent handing out a connection that is mid-shutdown.

### Issue 3: `closeAllConnections()` Cascade (Amplifier)

In `server/db/utils.ts`:

```typescript
// Lines 16-18
if (categorized.category === ERROR_CATEGORY.NETWORK_ERROR) {
  closeAllConnections().catch(() => {});  // Fire-and-forget
}
```

Any route handler wrapped in `tryCatchDatabaseAsync` that encounters `CONNECTION_ENDED` (classified as `NETWORK_ERROR`) triggers `closeAllConnections()`, which calls `.end()` on **every** cached connection. This turns a single connection's death into a full system outage.

`closeAllConnections` itself also has the same end-before-delete race: it calls `.end()` on all connections in parallel, then calls `_CACHED_CONNECTIONS.clear()` only after all promises resolve. During that await, requests can still get dying connections from the cache.

### Issue 4: PO Items Queue Stall (52M ms)

`server/routes/project/presentation_objects.ts` uses a concurrency-limited queue (`poItemsQueue`, max 10 concurrent). The `RequestQueue` properly rejects on error (freeing the slot), and `query_timeout` (5 minutes) prevents indefinite hangs. So a single connection death wouldn't stall the queue permanently.

The 52M ms (~14 hours) is more likely explained by the **cascade loop** (Issue 3): cleanup kills connections → requests fail with `CONNECTION_ENDED` → `closeAllConnections()` kills freshly-created replacements → next requests fail again. The server enters a cycle where it can never hold a working connection long enough to complete a queued PO Items request. Each attempt fails, frees the slot, the next attempt grabs a new connection that immediately gets killed by another cascade, and so on for hours.

### Issue 5: `lastUsed` Only Updates on Cache Lookup

`lastUsed` is updated in `getPgConnectionFromCacheOrNew()` when a connection is retrieved from cache. But the auth middleware (`server/middleware/userPermission.ts`) and `getGlobalUser()` call this multiple times per request. However, the SSE endpoint (`server/routes/project/project-sse.ts` line 13) grabs a `READ_ONLY` connection once and holds it for the lifetime of the SSE stream without further updates to `lastUsed`. After 5 minutes of no new SSE connections, this gets cleaned up.

### Issue 6: `closePgConnection` Leaks Map Entries on Error

In `closePgConnection` (lines 149-168), `.delete()` is **inside** the `try` block:

```typescript
// Lines 157-166 (actual code, verbatim)
for (const key of keys) {
  const conn = _CACHED_CONNECTIONS.get(key);
  if (conn) {
    try {
      await conn.sql.end();
      _CACHED_CONNECTIONS.delete(key);  // ← Inside try: skipped if .end() throws
    } catch (e) {
      console.error(`Error closing connection ${key}:`, e);
    }
  }
}
```

If `.end()` throws (e.g. connection already dead), the map entry is **never deleted**. The dead connection stays in the cache and will be handed to future requests, causing repeated `CONNECTION_ENDED` errors until the next cleanup cycle evicts it. Contrast with `cleanupStaleConnections` where `.delete()` is outside the `try/catch` and always runs.

### Issue 7: `READ_ONLY` Permission Has No Effect (Latent Bug)

`getPgConnectionFromCacheOrNew` accepts `"READ_ONLY" | "READ_AND_WRITE"` and creates separate cache keys (e.g. `main_READ_ONLY` vs `main_READ_AND_WRITE`). However, `getPgConnection` (lines 92-104) never passes the `readonly` option through to `postgres()`:

```typescript
// Lines 92-104 (actual code, verbatim)
export function getPgConnection(
  databaseId: string,
  options?: {
    max?: number;
    readonly?: boolean;  // ← Accepted but never used
  }
): Sql {
  return postgres({
    ...DEFAULT_CONNECTION_OPTIONS,
    database: databaseId,
    max: options?.max ?? DEFAULT_CONNECTION_OPTIONS.max,
    // readonly is never passed to postgres()
  });
}
```

Both `READ_ONLY` and `READ_AND_WRITE` get identical read-write pools. The separate cache keys just double the number of connection pools per database for no benefit. Not related to the crash, but worth fixing separately.

## Event Timeline (Reconstructed)

1. **T=0**: Server starts, `dbStartUp()` creates cached connections (`postgres_RW`, `main_RW`, `{project}_RW`)
2. **T=0+**: Server starts serving requests. Cache hits are fast.
3. **T=~30min**: Cleanup interval fires. Connections are now older than `MAX_CACHE_AGE_MS`. Cleanup calls `.end()` on active connections.
4. **T=~30min+ms**: In-flight requests get `CONNECTION_ENDED` from the shutting-down pool. After `.end()` completes, connections are removed from cache. Next requests create fresh connections.
5. **T=~30min+ms**: Some route handlers using `tryCatchDatabaseAsync` trigger `closeAllConnections()`, killing the freshly-created connections too.
6. **Repeated**: This cycle repeats every ~30 minutes. Most of the time, new connections are created fast enough that only a few requests fail. But if timing is unlucky (many concurrent requests during cleanup), the cascade is severe.
7. **PO Items stall**: The cascade loop prevents recovery — each new connection is killed before PO Items queries can complete, accumulating the observed 52M ms wait times.

## Proposed Solution

### Fix 1: Remove age-based eviction

The 30-minute age limit has no benefit — `postgres.js` already manages connection pooling internally. The idle timeout alone is sufficient to clean up unused connections.

```typescript
// Change from:
if (age > MAX_CACHE_AGE_MS || idleTime > MAX_IDLE_TIME_MS) {

// Change to:
if (idleTime > MAX_IDLE_TIME_MS) {
```

### Fix 2: Re-check before closing

After deciding to evict, re-check that the connection is still idle before calling `.end()`:

```typescript
for (const key of toRemove) {
  const conn = _CACHED_CONNECTIONS.get(key);
  if (conn) {
    // Re-check: connection may have been used since we decided to evict
    const currentIdleTime = Date.now() - conn.lastUsed.getTime();
    if (currentIdleTime <= MAX_IDLE_TIME_MS) {
      continue; // Skip — it's been used since we checked
    }
    _CACHED_CONNECTIONS.delete(key); // Delete BEFORE .end() to prevent races
    try {
      await conn.sql.end();
    } catch (e) {
      console.error(`Error closing connection for ${key}:`, e);
    }
  }
}
```

Note the order change: `delete` before `.end()`. This means any request arriving during `.end()` will create a **new** connection instead of getting the dying one.

### Fix 3: Remove the `closeAllConnections()` cascade

A single `CONNECTION_ENDED` on one database should not kill connections to all other databases. The current connection will be naturally evicted and recreated.

```typescript
// In server/db/utils.ts, change from:
if (categorized.category === ERROR_CATEGORY.NETWORK_ERROR) {
  closeAllConnections().catch(() => {});
}

// Change to:
// Let the stale connection be evicted naturally on next cleanup.
// New requests will create fresh connections when they miss the cache.
```

If targeted cleanup is desired, close only the specific connection that errored, not all of them.

### Fix 4: Increase idle timeout (lower priority)

5 minutes is aggressive for a server that might have periodic quiet periods. Consider 15-30 minutes. Less critical if Fixes 1-3 land — included for completeness.

```typescript
const MAX_IDLE_TIME_MS = 15 * 60 * 1000; // 15 minutes
```

### Fix 5: Fix `closePgConnection` and `closeAllConnections` races (same pattern)

Both `closePgConnection` (line 149) and `closeAllConnections` (line 173) have the same end-before-delete race. Additionally, `closePgConnection` has `.delete()` inside the `try` block (Issue 6), meaning a failed `.end()` leaves a dead connection in the cache. Apply delete-before-end in both:

`closePgConnection`:

```typescript
for (const key of keys) {
  const conn = _CACHED_CONNECTIONS.get(key);
  if (conn) {
    _CACHED_CONNECTIONS.delete(key); // Delete BEFORE .end()
    try {
      await conn.sql.end();
    } catch (e) {
      console.error(`Error closing connection ${key}:`, e);
    }
  }
}
```

`closeAllConnections`:

```typescript
const connections = [..._CACHED_CONNECTIONS.values()];
_CACHED_CONNECTIONS.clear(); // Clear BEFORE .end() calls
await Promise.all(
  connections.map((conn) =>
    conn.sql.end().catch((e) => console.error("Error closing connection:", e))
  )
);
```

### Summary of Changes

| File | Change |
|------|--------|
| `server/db/postgres/connection_manager.ts` | Remove age-based eviction, re-check before close, delete-before-end in both `cleanupStaleConnections` and `closePgConnection` |
| `server/db/utils.ts` | Remove `closeAllConnections()` on network error |

These are minimal, targeted changes. The connection cleanup code continues to serve its purpose (cleaning up truly idle connections) without the destructive side effects.

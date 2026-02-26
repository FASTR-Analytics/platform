# Redis Cache Layer Plan

## Context

Server uses in-memory `TimCacheB` (JS `Map`s) for visualization/dataset caches. All cache lost on restart. `warmAllCaches()` re-queries Postgres on every startup — Nigeria takes 90 minutes. Goal: persist cache to Redis so restarts are near-instant.

## Approach

- One Redis container per instance (same pattern as Postgres)
- `TimCacheC` — same interface as `TimCacheB`, backed by Redis
- Data persists in `{instanceDir}/redis/`
- Always started — every instance gets Redis, no opt-in flag
- Graceful fallback: if Redis connection fails, falls back to DB queries
- Delete all warming code — no `warmAllCaches()`, no warming indexes migration, no background warming
- Cache fills organically as users make requests. First session after enabling Redis is slow (same as today after restart), every restart after that is instant

## Library

**`@db/redis`** (`jsr:@db/redis`) — the JSR migration of the long-standing `denodrivers/redis` (`deno.land/x/redis`). Typed helpers for `get`, `set`, `scan`, `expire`, `del`, `flushdb`, etc. `scan()` returns `[cursor, keys]` tuple as the plan assumes.

## Part 1: wb-fastr (server)

### New: `lib/cache_class_C_redis.ts`

Same interface as `TimCacheB`. The `_unresolved` map serves the same dedup role — concurrent
requests for the same key share a single promise instead of hitting DB multiple times.

```ts
import { getRedis } from "../server/redis/connection.ts";

const WRITE_TTL_BASE = 15 * 86400; // 15 days base
const WRITE_TTL_JITTER = 15 * 86400; // up to 15 more days random
const READ_TTL = 30 * 86400; // fixed 30 days on access

type UnresolvedPayload<T> = {
  versionHash: string;
  dataPromise: Promise<T>;
};

export class TimCacheC<UniquenessParams, VersionParams, T> {
  private _unresolved = new Map<string, UnresolvedPayload<T>>();
  private _prefix: string;
  private _hashFuncs: {
    uniquenessHashFromParams: (ups: UniquenessParams) => string;
    versionHashFromParams: (vps: VersionParams) => string;
    parseData: (data: T) => {
      shouldStore: boolean;
      uniquenessHash: string;
      versionHash: string;
    };
  };
  constructor(
    prefix: string,
    hashFuncs: {
      uniquenessHashFromParams: (ups: UniquenessParams) => string;
      versionHashFromParams: (vps: VersionParams) => string;
      parseData: (data: T) => {
        shouldStore: boolean;
        uniquenessHash: string;
        versionHash: string;
      };
    },
  ) {
    this._prefix = prefix;
    this._hashFuncs = hashFuncs;
  }

  private _redisKey(uniquenessHash: string): string {
    return `cache:${this._prefix}:${uniquenessHash}`;
  }

  async get(
    uniquenessParams: UniquenessParams,
    versionParams: VersionParams | "any_version",
  ): Promise<T | undefined> {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);

    // 1. Check inflight promises (dedup concurrent requests)
    const existingUnresolved = this._unresolved.get(uniquenessHash);
    if (existingUnresolved) {
      if (versionParams === "any_version") {
        return await existingUnresolved.dataPromise;
      }
      const versionHash =
        this._hashFuncs.versionHashFromParams(versionParams);
      if (existingUnresolved.versionHash === versionHash) {
        return await existingUnresolved.dataPromise;
      }
    }

    // 2. Check Redis
    const redis = getRedis();
    if (!redis) return undefined;

    try {
      const raw = await redis.get(this._redisKey(uniquenessHash));
      if (!raw) return undefined;

      const parsed: { versionHash: string; data: T } = JSON.parse(raw);

      const key = this._redisKey(uniquenessHash);

      if (versionParams === "any_version") {
        await redis.expire(key, READ_TTL);
        return parsed.data;
      }
      const versionHash =
        this._hashFuncs.versionHashFromParams(versionParams);
      if (parsed.versionHash === versionHash) {
        await redis.expire(key, READ_TTL);
        return parsed.data;
      }
      // Version mismatch — stale data, treat as miss (30-day TTL handles cleanup)
      return undefined;
    } catch {
      // Redis error — degrade gracefully
      return undefined;
    }
  }

  async setPromise(
    dataPromise: Promise<T>,
    optimisticUniquenessParams: UniquenessParams,
    optimisticVersionParams: VersionParams,
  ) {
    const optimisticUniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(optimisticUniquenessParams);
    const optimisticVersionHash =
      this._hashFuncs.versionHashFromParams(optimisticVersionParams);

    // Track inflight for dedup (same as TimCacheB._unresolved)
    this._unresolved.set(optimisticUniquenessHash, {
      versionHash: optimisticVersionHash,
      dataPromise,
    });

    let data: T;
    try {
      data = await dataPromise;
    } catch (error) {
      this._unresolved.delete(optimisticUniquenessHash);
      throw error;
    }

    const d = this._hashFuncs.parseData(data);
    if (!d.shouldStore) {
      this._unresolved.delete(optimisticUniquenessHash);
      return;
    }
    if (d.versionHash !== optimisticVersionHash) {
      console.error(
        "THE VERSION HASHES DON'T MATCH",
        "Data =",
        d.versionHash,
        "Optimistic =",
        optimisticVersionHash,
      );
      this._unresolved.delete(optimisticUniquenessHash);
      return;
    }

    // Write to Redis
    const redis = getRedis();
    if (redis) {
      try {
        const key = this._redisKey(d.uniquenessHash);
        const value = JSON.stringify({
          versionHash: d.versionHash,
          data,
        });
        const ttl = WRITE_TTL_BASE + Math.floor(WRITE_TTL_JITTER * Math.random());
        await redis.set(key, value, { ex: ttl });
      } catch {
        // Redis write failed — not fatal, data just won't persist
      }
    }

    this._unresolved.delete(optimisticUniquenessHash);
  }

  clear(uniquenessParams: UniquenessParams) {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);
    this._unresolved.delete(uniquenessHash);

    const redis = getRedis();
    if (redis) {
      redis.del(this._redisKey(uniquenessHash)).catch(() => {});
    }
  }

  async clearAll(): Promise<void> {
    this._unresolved.clear();
    const redis = getRedis();
    if (!redis) return;
    try {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, {
          match: `cache:${this._prefix}:*`,
          count: 100,
        });
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    } catch {
      // Redis error — degrade gracefully
    }
  }
}
```

Key differences from `TimCacheB`:
- No `_resolved` map — Redis IS the resolved store
- `_unresolved` map kept for inflight promise dedup (same behavior)
- All Redis operations wrapped in try/catch for graceful degradation
- `clear()` deletes a single key from Redis (fire-and-forget)
- `clearAll()` uses SCAN to delete all keys for this cache's prefix (not KEYS — non-blocking)
- Constructor takes `prefix` string (no TTL param — TTL managed internally)
- Jittered TTL on write: 15–30 days (random) — prevents thundering herd when bulk-written keys expire
- Fixed TTL on read hit: 30 days via `expire()` — actively-used entries stay alive
- On version mismatch: return undefined (write TTL handles cleanup)
- Entries expire after 15–30 days if never read, or 30 days after last read

### New: `server/redis/connection.ts`

Reads `REDIS_URL` env var. If not set, Redis disabled. On startup, pings Redis to verify connectivity and logs the result:

```ts
export async function initRedis(): Promise<void> {
  const url = Deno.env.get("REDIS_URL");
  if (!url) {
    console.log("REDIS_URL not set — caching disabled");
    return;
  }
  try {
    redis = await connect(parseRedisUrl(url));
    await redis.ping();
    console.log("Redis connected");
  } catch (e) {
    console.warn("Redis connection failed — falling back to DB queries:", e.message);
    redis = undefined;
  }
}
```

### New: `server/redis/flush.ts`

Nuclear "clear all server caches" — equivalent of the client's `idb-keyval.clear()`.

```ts
import { getRedis } from "./connection.ts";

export async function flushAllServerCaches(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.flushdb();
}
```

Uses `FLUSHDB` (not `FLUSHALL`) — scoped to the current Redis database. Safe because each instance has its own Redis container and we only store cache data.

### New: `server/routes/caches/flush.ts`

```ts
app.post("/caches/flush-all", async (c) => {
  await flushAllServerCaches();
  return c.json({ success: true });
});
```

Called by:
- Client "Clear cache" button (`profile.tsx`) — now clears IndexedDB **and** server Redis
- Client version-mismatch logic (`LoggedInWrapper.tsx`) — same

### Modified files

| File | Change |
| ---- | ------ |
| `server/routes/caches/visualizations.ts` | `TimCacheB` → `TimCacheC` with prefixes: `po_detail`, `po_items`, `metric_info`, `replicant_opts` |
| `server/routes/caches/dataset.ts` | `TimCacheB` → `TimCacheC` with prefixes: `ds_hmis`, `ds_hfa` |
| `server/routes/caches/structure.ts` | Leave as-is (singleton, TTL-based, not TimCacheB, has Map inside that won't JSON round-trip) |
| `server/main.ts` | `await warmAllCaches()` → `await initRedis()` |
| `server/cache_warming.ts` | Delete entirely |
| `client/src/components/instance/profile.tsx` | "Clear cache" button: add `POST /caches/flush-all` before `idb-keyval.clear()` |
| `client/src/components/LoggedInWrapper.tsx` | Version-mismatch handler: add `POST /caches/flush-all` before `idb-keyval.clear()` |
| `deno.json` | Add `jsr:@db/redis` |

### Route handlers: NO CHANGES

Same `get()` / `setPromise()` / `clear()` interface.

## Part 2: wb-fastr-cli

### Modified: `src/core/constants.ts`

Add `"redis"` to `SUBDIRECTORIES`. Add `"redis:7-alpine"` to `IMAGES_TO_PULL`.

```ts
export const IMAGES_TO_PULL = ["timroberton/comb:wb-hmis-r-linux", "postgres:17.4", "dpage/pgadmin4", "redis:7-alpine"];
export const SUBDIRECTORIES = ["databases", "sandbox", "exports", "assets", "redis"];
```

### Modified: `src/commands/docker/run-container.ts`

**1. Replace the subdirectory existence check with create-if-missing.** The current code throws if any subdir is missing. Change to `mkdir` with `recursive: true` so new subdirs (like `redis/`) are created automatically on existing instances without requiring a separate `wb init-dirs` step:

```ts
for (const subDir of SUBDIRECTORIES) {
  await Deno.mkdir(join(instanceDirPath, subDir), { recursive: true });
}
```

**2. Start Redis after Postgres, before admin container.** Redis start failure is non-fatal — log a warning and continue (the server app degrades gracefully without Redis):

```ts
////////////////////////
//                    //
//    Run Redis       //
//                    //
////////////////////////
const argsRunRedis = [
  "run", "--rm", "-dt",
  "--name", `${serverInfo.id}-redis`,
  "--network", serverInfo.id,
  "-v", `${join(instanceDirPath, "redis")}:/data`,
  "redis:7-alpine",
  "redis-server", "--appendonly", "yes",
];
const cmdRunRedis = new Deno.Command("docker", { args: argsRunRedis });
const chdRunRedis = cmdRunRedis.spawn();
const redisOutput = await chdRunRedis.output();
if (!redisOutput.success) {
  console.log(colors.yellow(`⚠️  Warning: Redis container failed to start — app will fall back to DB queries`));
}
```

**3. Add `REDIS_URL` env var to app container args** (unconditionally — server handles missing Redis gracefully):

```ts
"-e", `REDIS_URL=redis://${serverInfo.id}-redis:6379`,
```

### Modified: `src/commands/docker/stop.ts`

Add Redis stop **after** app container, **before** network removal. Order: app → admin → redis → postgres → network.

```ts
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-redis`);
await stopContainer(`${serverInfo.id}-postgres`, 30);
// then remove network
```

### Modified: `src/commands/docker/restart.ts`

`restart.ts` has its own inline stop sequence (does not call `handleStop`). Add Redis stop in the same position — after app, before postgres:

```ts
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-redis`);
await stopContainer(`${serverInfo.id}-postgres`, 30);
```

No changes needed in the restart's run phase — `runContainer()` already picks up the Redis additions.

## Redis key schema

```
cache:{prefix}:{uniquenessHash}
```

No instance prefix needed — each instance has its own Redis.

Value: `JSON.stringify({ versionHash, data })`. Jittered TTL on write (15–30 days), fixed 30-day TTL refresh on each read.

## Migration path

1. Deploy new server image + updated CLI
2. `wb pull` — pre-pulls `redis:7-alpine` (now in `IMAGES_TO_PULL`)
3. `wb restart testing` — `runContainer` auto-creates `redis/` subdir, starts `testing-redis` container, app connects, cache fills as users browse. No `wb init-dirs` needed.
4. Verify POs load, restart is fast
5. `wb restart @all` to roll out everywhere

## Verification

1. `wb restart testing`
2. Load POs in client — first load hits DB, subsequent from Redis
3. `docker exec testing-redis redis-cli KEYS "cache:*"` — keys populated
4. `wb restart testing` — instant startup, no 90min warming
5. Update a PO — fresh data served (version mismatch = recompute)
6. Click "Clear cache" in profile — verify Redis flushed (`KEYS "cache:*"` returns empty), client reloads and refetches

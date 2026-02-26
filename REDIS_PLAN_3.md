# Valkey Cache Layer Plan

## Context

Server uses in-memory `TimCacheB` (JS `Map`s) for visualization/dataset caches. All cache lost on restart. `warmAllCaches()` re-queries Postgres on every startup — Nigeria takes 90 minutes. Goal: persist cache to Valkey so restarts are near-instant.

## Approach

- One Valkey container per instance (same pattern as Postgres)
- `TimCacheC` — superset of `TimCacheB` interface (adds `prefix` constructor param + `clearAll()`), backed by Valkey
- Data persists in `{instanceDir}/valkey/`
- Always started — every instance gets Valkey, no opt-in flag
- Graceful fallback: if Valkey connection fails, falls back to DB queries
- Delete all warming code — no `warmAllCaches()`, no warming indexes migration, no background warming
- Cache fills organically as users make requests. First session after enabling Valkey is slow (same as today after restart), every restart after that is instant

## Why Valkey, not Redis

In March 2024 Redis Inc. relicensed Redis from BSD to RSALv2/SSPLv1 (source-available, not open-source). Valkey is the Linux Foundation fork — genuinely open-source (BSD), 100% RESP protocol-compatible, and every Redis client library works unchanged with Valkey. Docker image: `valkey/valkey:8`.

## Library

**`npm:redis`** (node-redis) — works via Deno's npm compatibility, matching the existing pattern in `deno.json` (`npm:postgres`, `npm:nanoid`, `npm:papaparse`). Full-featured, actively maintained, and officially documented for Deno.

## Part 1: wb-fastr (server)

### New: `server/valkey/cache_class_C.ts`

Superset of `TimCacheB` interface (adds `prefix` constructor param + `clearAll()` method). Lives in `server/` rather than `lib/` because it imports from `server/valkey/connection.ts` — placing it in `lib/` would create a dependency direction violation (`lib/` → `server/`). The `_unresolved` map serves the same dedup role — concurrent requests for the same key share a single promise instead of hitting DB multiple times.

```ts
import { getValkeyClient } from "./connection.ts";

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

    // 2. Check Valkey
    const client = getValkeyClient();
    if (!client) return undefined;

    try {
      const raw = await client.getEx(this._redisKey(uniquenessHash), { EX: READ_TTL });
      if (!raw) return undefined;

      const parsed: { versionHash: string; data: T } = JSON.parse(raw);

      if (versionParams === "any_version") {
        return parsed.data;
      }
      const versionHash =
        this._hashFuncs.versionHashFromParams(versionParams);
      if (parsed.versionHash === versionHash) {
        return parsed.data;
      }
        // Version mismatch — stale data, treat as miss (TTL handles cleanup)
      return undefined;
    } catch {
      // Valkey error — degrade gracefully
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

    // Write to Valkey
    const client = getValkeyClient();
    if (client) {
      try {
        const key = this._redisKey(d.uniquenessHash);
        const value = JSON.stringify({
          versionHash: d.versionHash,
          data,
        });
        const ttl = WRITE_TTL_BASE + Math.floor(WRITE_TTL_JITTER * Math.random());
        await client.set(key, value, { EX: ttl });
      } catch {
        // Valkey write failed — not fatal, data just won't persist
      }
    }

    this._unresolved.delete(optimisticUniquenessHash);
  }

  clear(uniquenessParams: UniquenessParams) {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);
    this._unresolved.delete(uniquenessHash);

    const client = getValkeyClient();
    if (client) {
      client.del(this._redisKey(uniquenessHash)).catch(() => {});
    }
  }

  async clearAll(): Promise<void> {
    this._unresolved.clear();
    const client = getValkeyClient();
    if (!client) return;
    try {
      let cursor = 0;
      do {
        const result = await client.scan(cursor, {
          MATCH: `cache:${this._prefix}:*`,
          COUNT: 100,
        });
        cursor = result.cursor;
        if (result.keys.length > 0) await client.del(result.keys);
      } while (cursor !== 0);
    } catch {
      // Valkey error — degrade gracefully
    }
  }
}
```

Key differences from `TimCacheB`:
- No `_resolved` map — Valkey IS the resolved store
- `_unresolved` map kept for inflight promise dedup (same behavior)
- All Valkey operations wrapped in try/catch for graceful degradation
- `clear()` deletes a single key from Valkey (fire-and-forget)
- `clearAll()` uses SCAN to delete all keys for this cache's prefix (not KEYS — non-blocking). New method — `TimCacheB` has no `clearAll()`
- Constructor takes `prefix` string as first arg (breaking change vs `TimCacheB` — every instantiation site needs updating)
- Lives in `server/valkey/` not `lib/` to avoid `lib/` → `server/` dependency direction violation
- Jittered TTL on write: 15–30 days (random) — prevents thundering herd when bulk-written keys expire
- Fixed TTL on read hit: 30 days via `GETEX` — atomically gets value and refreshes TTL in one round-trip (instead of separate `GET` + `expire()`)
- On version mismatch: return undefined (write TTL handles cleanup)
- Entries expire after 15–30 days if never read, or 30 days after last read
- `npm:redis` uses `{ EX: ttl }` option syntax (uppercase) and `scan()` returns `{ cursor, keys }` object (not tuple)
- **JSON round-trip safety**: All cached `T` types (`APIResponseWithData<...>`) must be JSON-safe. Verified: the cached types contain only primitives, strings, arrays, and plain objects — no `Date`, `Map`, `Set`, or `BigInt` values. If new cache types are added, verify they survive `JSON.stringify` → `JSON.parse`

### New: `server/valkey/connection.ts`

Uses `npm:redis` (`createClient`). Reads `VALKEY_URL` env var. Handles `"error"` events (prevents Deno crash on unhandled events) and `"ready"` events (re-enables after transient outages via auto-reconnect):

```ts
import { createClient, type RedisClientType } from "redis";

let _client: RedisClientType | null = null;
let _available = false;

export async function connectValkey(): Promise<void> {
  const url = Deno.env.get("VALKEY_URL");
  if (!url) {
    console.log("VALKEY_URL not set — caching disabled");
    return;
  }
  try {
    _client = createClient({ url }) as RedisClientType;

    _client.on("error", (err: Error) => {
      console.warn(`[Valkey] Connection error: ${err.message}`);
      _available = false;
    });

    _client.on("ready", () => {
      _available = true;
      console.log("[Valkey] Ready");
    });

    await _client.connect();
    _available = true;
    console.log(`[Valkey] Connected to ${url}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Valkey] Could not connect (${msg}). Cache disabled.`);
    _client = null;
    _available = false;
  }
}

export async function disconnectValkey(): Promise<void> {
  if (_client) {
    try {
      await _client.disconnect();
      console.log("[Valkey] Disconnected");
    } catch {
      // Connection may already be dead — ignore
    }
  }
}

export function getValkeyClient(): RedisClientType | null {
  return _available ? _client : null;
}
```

Key design decisions:
- **`_available` flag**: If Valkey is down, the server continues with no caching. Cache is an optimization, not a hard dependency.
- **`"ready"` event listener**: `npm:redis` auto-reconnects by default. Without listening to `"ready"`, a single transient error would permanently disable Valkey. The listener resets `_available` to `true` on recovery.
- **`"error"` event listener**: `npm:redis` emits `"error"` events for connection issues. If unhandled, Deno crashes. This listener prevents that.
- **`disconnect()` over `quit()`**: `disconnectValkey` uses forceful `disconnect()` instead of graceful `quit()` because during shutdown the connection may already be dead. Wrapped in try/catch and not gated on `_available` to ensure cleanup regardless of connection state.

### New: `server/valkey/flush.ts`

Nuclear "clear all server caches" — equivalent of the client's `idb-keyval.clear()`.

```ts
import { getValkeyClient } from "./connection.ts";

export async function flushAllServerCaches(): Promise<void> {
  const client = getValkeyClient();
  if (!client) return;
  try {
    await client.sendCommand(["FLUSHDB"]);
  } catch {
    // Valkey error — degrade gracefully
  }
}
```

Uses `FLUSHDB` (not `FLUSHALL`) — scoped to the current database. Safe because each instance has its own Valkey container and we only store cache data. Wrapped in try/catch to match the graceful-degradation pattern — if Valkey is unhealthy but `_available` hasn't flipped yet, this won't crash the route handler.

### New: `lib/api-routes/instance/caches.ts`

Route registry entry for the flush endpoint. Follows the existing pattern (e.g. `instance/instance.ts`):

```ts
import { route } from "../route-utils.ts";

export const cachesRouteRegistry = {
  flushAllCaches: route({
    path: "/caches/flush-all",
    method: "POST",
  }),
} as const;
```

Then import and spread in `lib/api-routes/combined.ts`:

```ts
import { cachesRouteRegistry } from "./instance/caches.ts";

export const routeRegistry = {
  ...cachesRouteRegistry,
  // ... existing spreads
} as const;
```

### New: `server/routes/caches/flush.ts`

```ts
app.post("/caches/flush-all", async (c) => {
  markRouteDefined("flushAllCaches");
  await flushAllServerCaches();
  return c.json({ success: true });
});
```

Called by:
- Client "Clear cache" button (`profile.tsx`) — calls `serverActions.flushAllCaches({})` then `clearDataCache()`
- Client version-mismatch logic (`LoggedInWrapper.tsx`) — same

### Modified files

| File | Change |
| ---- | ------ |
| `server/routes/caches/visualizations.ts` | `TimCacheB` → `TimCacheC` (import from `server/valkey/cache_class_C.ts`) with prefixes: `po_detail`, `po_items`, `metric_info`, `replicant_opts` |
| `server/routes/caches/dataset.ts` | `TimCacheB` → `TimCacheC` with prefixes: `ds_hmis`, `ds_hfa` |
| `server/routes/caches/structure.ts` | Leave as-is (singleton, TTL-based, not TimCacheB, has Map inside that won't JSON round-trip) |
| `main.ts` (project root) | `await warmAllCaches()` → `await connectValkey()`. Consolidate shutdown (see below). |
| `server/cache_warming.ts` | Delete entirely |
| `server/db/postgres/connection_manager.ts` | Remove SIGINT/SIGTERM handlers (lines 240–253) — shutdown consolidated in `main.ts` |
| `lib/cache_class_B_in_memory_map.ts` | Keep (unused but reusable for future in-memory caching) |
| `lib/api-routes/instance/caches.ts` | New file: route registry for `POST /caches/flush-all` |
| `lib/api-routes/combined.ts` | Import and spread `cachesRouteRegistry` |
| `client/src/components/instance/profile.tsx` | "Clear cache" button: add `serverActions.flushAllCaches({})` before `clearDataCache()` |
| `client/src/components/LoggedInWrapper.tsx` | Version-mismatch handler: add `serverActions.flushAllCaches({})` before `clearDataCache()` |
| `deno.json` | Add `"redis": "npm:redis@^4.7.0"` to imports |

### Modified: `main.ts` (project root) — Startup, shutdown, SIGTERM

**Problem**: Currently there are competing signal handlers — `connection_manager.ts:240-253` registers its own SIGINT/SIGTERM handlers that call `Deno.exit(0)`, and `main.ts:112-118` registers a separate SIGINT handler. Deno runs all listeners for a signal, so the Postgres handler may `Deno.exit(0)` before Valkey disconnect completes.

**Fix**: Remove signal handlers from `connection_manager.ts` (see below). Consolidate all shutdown into a single handler in `main.ts` that orchestrates everything:

```ts
import { connectValkey, disconnectValkey } from "./server/valkey/connection.ts";
import { closeAllConnections } from "./server/db/postgres/connection_manager.ts";

// Startup: connect Valkey before serving
await connectValkey();

// Shutdown: consolidated handler for Postgres + Valkey + HTTP server
const shutdown = async () => {
  console.log("\nShutting down...");
  setTimeout(() => {
    console.warn("[Shutdown] Timed out — forcing exit");
    Deno.exit(1);
  }, 8000);
  await Promise.all([
    server.shutdown(),
    disconnectValkey(),
    closeAllConnections(),
  ]);
  Deno.exit(0);
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown); // Docker uses SIGTERM
```

### Modified: `server/db/postgres/connection_manager.ts` — Remove signal handlers

Delete lines 240–253 (the `if (typeof Deno !== "undefined")` block that registers its own SIGINT/SIGTERM handlers). Shutdown is now consolidated in `main.ts`. Ensure `closeAllConnections()` is exported (it already is).

### Route handlers: NO CHANGES

Same `get()` / `setPromise()` / `clear()` interface.

## Part 2: wb-fastr-cli

### Modified: `src/core/constants.ts`

Add `"valkey"` to `SUBDIRECTORIES`. Add `"valkey/valkey:8.0"` to `IMAGES_TO_PULL` (pinned to minor version, matching the `postgres:17.4` pattern).

```ts
export const IMAGES_TO_PULL = ["timroberton/comb:wb-hmis-r-linux", "postgres:17.4", "dpage/pgadmin4", "valkey/valkey:8.0"];
export const SUBDIRECTORIES = ["databases", "sandbox", "exports", "assets", "valkey"];
```

### Modified: `src/commands/docker/run-container.ts`

**1. Auto-create missing subdirectories with logging.** The current code throws if any subdir is missing. Use `mkdir` with `recursive: true` so new subdirs (like `valkey/`) are created automatically on existing instances without requiring a separate `wb init-dirs` step. Log when a directory is created so misconfigurations are visible:

```ts
for (const subDir of SUBDIRECTORIES) {
  const dirPath = join(instanceDirPath, subDir);
  try {
    await Deno.stat(dirPath);
  } catch {
    console.log(colors.cyan(`Creating missing directory: ${subDir}/`));
    await Deno.mkdir(dirPath, { recursive: true });
  }
}
```

**2. Start Valkey after Postgres, before admin container.** Valkey start failure is non-fatal — log a warning and continue (the server app degrades gracefully without Valkey). No maxmemory cap — TTLs (15–30 day jittered write, 30-day read refresh) handle cleanup organically:

```ts
////////////////////////
//                    //
//    Run Valkey      //
//                    //
////////////////////////
const argsRunValkey = [
  "run", "--rm", "-dt",
  "--name", `${serverInfo.id}-valkey`,
  "--network", serverInfo.id,
  "-v", `${join(instanceDirPath, "valkey")}:/data`,
  "valkey/valkey:8.0",
  "valkey-server", "--appendonly", "yes",
];
const cmdRunValkey = new Deno.Command("docker", { args: argsRunValkey });
const chdRunValkey = cmdRunValkey.spawn();
const valkeyOutput = await chdRunValkey.output();
if (!valkeyOutput.success) {
  console.log(colors.yellow(`⚠️  Warning: Valkey container failed to start — app will fall back to DB queries`));
}
```

**3. Add `VALKEY_URL` env var to app container args** (unconditionally — server handles missing Valkey gracefully). Uses `redis://` protocol — this is correct, Valkey speaks the RESP protocol and `redis://` is the standard URI scheme. There is no `valkey://` scheme:

```ts
"-e", `VALKEY_URL=redis://${serverInfo.id}-valkey:6379`,
```

### Modified: `src/commands/docker/stop.ts`

Add Valkey stop **after** app container, **before** network removal. Order: app → admin → valkey → postgres → network.

```ts
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-valkey`);
await stopContainer(`${serverInfo.id}-postgres`, 30);
// then remove network
```

### Modified: `src/commands/docker/restart.ts`

`restart.ts` has its own inline stop sequence (does not call `handleStop`). Add Valkey stop in the same position — after app, before postgres:

```ts
await stopContainer(serverInfo.id);
if (serverInfo.adminVersion) {
  await stopAdminContainer(serverInfo.id);
}
await stopContainer(`${serverInfo.id}-valkey`);
await stopContainer(`${serverInfo.id}-postgres`, 30);
```

No changes needed in the restart's run phase — `runContainer()` already picks up the Valkey additions.

## Valkey key schema

```txt
cache:{prefix}:{uniquenessHash}
```

No instance prefix needed — each instance has its own Valkey.

Value: `JSON.stringify({ versionHash, data })`. Jittered TTL on write (15–30 days), fixed 30-day TTL refresh on each read.

## Migration path

1. Deploy new server image + updated CLI
2. `wb pull` — pre-pulls `valkey/valkey:8.0` (now in `IMAGES_TO_PULL`)
3. `wb restart testing` — `runContainer` auto-creates `valkey/` subdir, starts `testing-valkey` container, app connects, cache fills as users browse. No `wb init-dirs` needed.
4. Verify POs load, restart is fast
5. `wb restart @all` to roll out everywhere

## Dead code cleanup

After migration, delete:

- `server/cache_warming.ts` — `warmAllCaches()`, `warmPresentationObjectCaches()`, `warmDatasetCaches()` — all dead
- `lib/cache_class_B_in_memory_map.ts` — keep as-is (unused but reusable for future in-memory caching needs)
- `client/src/state/caches/_archived/` — already unused, can clean up now

## Verification

1. `wb restart testing`
2. Load POs in client — first load hits DB, subsequent from Valkey
3. `docker exec testing-valkey valkey-cli KEYS "cache:*"` — keys populated
4. `wb restart testing` — instant startup, no 90min warming
5. Update a PO — fresh data served (version mismatch = recompute)
6. Click "Clear cache" in profile — verify Valkey flushed (`KEYS "cache:*"` returns empty), client reloads and refetches

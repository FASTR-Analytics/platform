# Valkey Cache

The distributed read-model cache (`TimCacheC`): the two-part `uniquenessHash` / `versionHash` key, **implicit** invalidation via `last_updated`/`last_run` bumps (no explicit clear on normal writes), the in-flight dedup + self-verification guards, and degrade-gracefully behavior when Valkey is absent.

> This doc owns the cache contract. The write side that bumps version columns is [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md); the broadcast side is [DOC_SSE_REALTIME.md](DOC_SSE_REALTIME.md); together they form the `last_updated → SSE → cache` triangle. [DOC_MIGRATIONS.md](DOC_MIGRATIONS.md) mentions in passing that migrations bumping `last_updated` implicitly invalidate the cache — that mechanic is fully documented here. **Not** to be confused with `server/middleware/cache.ts` (`cacheMiddleware`), which sets HTTP `Cache-Control` headers on static assets — a completely different "cache".

---

## Principles

1. **Cache versioned read models, not arbitrary values.** Every entry is keyed by *what it is* (`uniquenessHash`) and *what version it is* (`versionHash`). A read hits only when the stored version matches the recomputed version.
2. **Invalidate implicitly, by version — never `clear()` on a normal write.** A write bumps a version column (`last_updated` / `last_run_at` / dataset version). The next read recomputes `versionHash`, sees a mismatch, misses, and recomputes. Explicit `.clear()` is reserved for migration data-transforms that rewrite rows in place.
3. **Degrade gracefully.** If `VALKEY_URL` is unset or the connection errors, `getValkeyClient()` returns `null` and every cache method becomes a no-op miss. The app runs cache-disabled, never cache-broken.
4. **One version column, bumped by every writer.** The central invariant — a cached read model must be keyed on a monotonically-changing column that *all* of its write paths bump. A forgotten bump serves stale data forever, silently.

---

## The System

```text
  read path:
    cache.get(uniquenessParams, versionParams)
      ├─ in-flight? (_unresolved map) → return the shared promise        (dedup)
      ├─ client.getEx(key, EX: READ_TTL)  → refresh read TTL
      ├─ stored.versionHash === versionHashFromParams(versionParams)?
      │     ├─ yes → HIT (return data)
      │     └─ no  → MISS (return undefined)   ← stale version, recompute
      └─ no client → undefined (cache disabled)

  write path:
    cache.setPromise(dataPromise, optimisticUniqueness, optimisticVersion)
      register in _unresolved → await data
      → parseData(data): { shouldStore, uniquenessHash, versionHash }   ← re-derived FROM payload
      → !shouldStore?            → drop (e.g. error responses not cached)
      → versionHash !== optimistic? → console.error + drop              (self-verification guard)
      → client.set(key, { versionHash, data }, EX: WRITE_TTL_BASE + random*JITTER)

  invalidation:  (no explicit call) DB write bumps version column
                 → next get() recomputes versionHash → mismatch → miss → fresh
```

### `TimCacheC<UniquenessParams, VersionParams, T>`

`server/valkey/cache_class_C.ts`. Constructed with a `prefix` and three hash functions:

| Function | Returns | Role |
|----------|---------|------|
| `uniquenessHashFromParams(ups)` | `string` | Redis key identity (what the entry *is*) |
| `versionHashFromParams(vps)` | `string` | staleness token (what *version* it is) |
| `parseData(data)` | `{ shouldStore, uniquenessHash, versionHash }` | re-derives both hashes **from the resolved payload** for the write-time self-check |

Redis key namespace: `cache:<prefix>:<uniquenessHash>`. Stored value: `JSON.stringify({ versionHash, data })`.

TTLs (all generous; the cache is version-gated, not time-gated):
- `READ_TTL = 30 days` — every `get` uses `getEx` to refresh the entry's TTL (hot entries live longer).
- `WRITE_TTL_BASE = 15 days` + `WRITE_TTL_JITTER` up to 15 days, randomized per write — staggers expiry to avoid a stampede.

### The in-flight dedup (`_unresolved`)

`setPromise` registers the in-flight `dataPromise` in a process-local `_unresolved` map keyed by `uniquenessHash`; `get` checks it first and returns the *shared* promise if a matching-version computation is already running. This collapses a thundering herd of identical concurrent requests into one computation.

### The self-verification guard

`setPromise` takes *optimistic* params (the caller's best guess at the version) but, after the data resolves, calls `parseData(data)` to **re-derive** the hashes from the actual payload. If the payload's `versionHash` ≠ the optimistic one, it logs `THE VERSION HASHES DON'T MATCH` and drops the entry rather than caching a mislabeled value. This catches the bug class where the caller's version guess and the data's real version disagree.

### Degrade-gracefully connection

`server/valkey/connection.ts`: `connectValkey()` (called in `main.ts`) is a no-op if `VALKEY_URL` is unset. `getValkeyClient()` returns the client only when `_available`; on any connection error `_available` flips false. Every `TimCacheC` method null-checks the client and wraps Redis calls in try/catch, returning a miss on failure.

### The cache catalog

Six caches, all `_UPPER_SNAKE` module-level singletons grouped by domain file:

| Singleton | prefix | Version source (`versionHash`) | Key separator |
|-----------|--------|-------------------------------|---------------|
| `_PO_DETAIL_CACHE` | `po_detail` | `presentationObjectLastUpdated` | `\|` |
| `_PO_ITEMS_CACHE` | `po_items` | `moduleLastRun` | `\|` |
| `_METRIC_INFO_CACHE` | `metric_info` | `moduleLastRun` | `::` |
| `_REPLICANT_OPTIONS_CACHE` | `replicant_opts` | `moduleLastRun` | `::` |
| `_FETCH_CACHE_DATASET_HMIS_ITEMS` | `ds_hmis` | `versionId` + `indicatorMappingsVersion` | `_` |
| `_FETCH_CACHE_DATASET_HFA_ITEMS` | `ds_hfa` | dataset `hash` | `_` |

(First four in `server/routes/caches/visualizations.ts`; last two in `server/routes/caches/dataset.ts`.) The version source is always a column or value that the corresponding write path bumps: a PO edit bumps `presentation_objects.last_updated`; a module run bumps `last_run_at` (which cascades to dependent POs — see [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md)); a dataset import bumps `versionId`.

### Introspection

`server/routes/project/cache_status.ts` uses `scanUniquenessHashes(prefix)` to report which results-objects have cached PO-items / replicant-options entries (`SCAN`-based, reverse-parsing the `uniquenessHash` out of the Redis key by separator). The reverse-parse hard-codes the separator — another reason the separators should be unified.

---

## Rules

1. **Every cache is version-gated.** Choose a `versionHash` that is a column/value bumped by *every* write that could change the cached data. If multiple writers can change it, they must all bump the same column.
2. **Never `clear()` on a normal write.** Bump the version instead. `.clear()` / `.clearAll()` are for migration data-transforms (rows rewritten in place, no version change) — see [DOC_MIGRATIONS.md](DOC_MIGRATIONS.md).
3. **`parseData` must derive the same hashes as the `*FromParams` functions.** They are two computations of the same key; keep them in lockstep (ideally share one builder — see enforcement).
4. **Don't cache failures.** Return `shouldStore: false` from `parseData` for `success: false` responses (all six caches do).
5. **Assume the cache may be absent.** Code paths must work with `getValkeyClient() === null` (cache disabled).

---

## What NOT to do

- **Don't add a cache keyed on a column some writer forgets to bump.** That's the silent-stale failure mode this whole design exists to prevent.
- **Don't invent a fourth caching mechanism.** Use `TimCacheC` for cross-process, versioned read models. Use a process-local in-memory singleton (as the structure cache and the DHIS2 geojson session cache do — see [DOC_DHIS2_INTEGRATION.md](DOC_DHIS2_INTEGRATION.md)) only for per-process ephemeral data. Document which you chose and why.
- **Don't introduce a new key separator.** Three already exist (`|`, `::`, `_`); reuse one reserved separator via a shared key-builder.
- **Don't rely on cross-deploy payload shape.** A cache hit can return data serialized by a previous deploy. `_PO_DETAIL_CACHE` consumers re-run `presentationObjectConfigSchema.parse` on read to adapt — but that burden is per-cache and undocumented (see enforcement).

---

## Gotchas

- **`get` refreshes the TTL.** Because reads use `getEx`, a frequently-read stale-version entry won't expire — it just keeps missing on version. That's fine, but it means TTL is not a reliable invalidation backstop.
- **The version-mismatch on write is logged loudly.** `THE VERSION HASHES DON'T MATCH` in logs means a caller's optimistic version disagreed with the data's real version — a real bug to chase, not noise.
- **Separators differ per cache.** `po_detail`/`po_items` use `|`, `metric_info`/`replicant_opts` use `::`, dataset caches use `_`. A one-character drift between `uniquenessHashFromParams` and `parseData` silently drops every write.
- **The `C` suffix is meaningless.** `cache_class_C` / `TimCacheC` — the "C" is historical, not a generation/version. Don't read meaning into it.

---

## Enforcement opportunities

- **Single shared key-builder** per cache used by *both* the `*FromParams` functions and `parseData`, with one reserved separator — eliminates the dup-logic + separator-drift class of bugs and the hard-coded reverse-parse in `cache_status`.
- **Lint the central invariant:** for each cache, assert the `versionHash` source column is bumped by every known write path to the underlying data.
- **Generic cross-deploy shape handling:** fold a deploy/build version into `versionHash` so a schema change to a cached type invalidates old-shape entries automatically, instead of per-cache re-validation.
- **Rename away the opaque `C` suffix** and disambiguate "cache" (Valkey read-model cache) from `cacheMiddleware` (HTTP `Cache-Control`).
- **Document the TimCacheC-vs-in-memory decision** as a rule so new caching code doesn't invent a third pattern.

---

## Adding a cache — checklist

- [ ] Define `new TimCacheC<UniquenessParams, VersionParams, T>(prefix, hashFuncs)` as an `_UPPER_SNAKE` singleton in the right `routes/caches/*.ts`
- [ ] `versionHashFromParams` reads a column bumped by *every* write to the data (confirm the write paths)
- [ ] `uniquenessHashFromParams` and `parseData` derive identical hashes with the same separator
- [ ] `parseData` returns `shouldStore: false` for `success: false`
- [ ] Reads call `get(unique, version)`; writes wrap the producer in `setPromise(...)`
- [ ] Works when `getValkeyClient()` is `null`
- [ ] If cached data shape can change across deploys, re-validate/parse on read

---

## Key files

| File | Purpose |
|------|---------|
| `server/valkey/cache_class_C.ts` | `TimCacheC` — keying, get/setPromise, dedup, self-verify, scan/clear |
| `server/valkey/connection.ts` | connection singleton, `getValkeyClient` degrade-gracefully |
| `server/routes/caches/visualizations.ts` | `_PO_DETAIL`/`_PO_ITEMS`/`_METRIC_INFO`/`_REPLICANT_OPTIONS` caches |
| `server/routes/caches/dataset.ts` | `_FETCH_CACHE_DATASET_HMIS_ITEMS` / `_HFA_ITEMS` |
| `server/routes/project/cache_status.ts` | `/cache_status` introspection via `scanUniquenessHashes` |
| `server/middleware/cache.ts` | **unrelated** — HTTP `Cache-Control` for static assets |

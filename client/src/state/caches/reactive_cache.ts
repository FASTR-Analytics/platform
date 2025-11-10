import { del, get, keys, set } from "idb-keyval";
import type { APIResponseWithData, ProjectDirtyStates } from "lib";
import { getGlobalPDSSnapshot } from "~/components/project_runner/mod";

/**
 * Reactive Cache System - Context-Aware Caching with ProjectDirtyStates Integration
 *
 * This cache system automatically reads ProjectDirtyStates from Solid.js context,
 * eliminating the need for manual version threading throughout the application.
 *
 * Key features:
 * - Auto-hashing from key arrays (no manual .join("|"))
 * - Version incorporated into cache key (automatic invalidation)
 * - Two-tier: Memory (LRU) + IndexedDB (persistence)
 * - No parseData duplication
 * - Type-safe

 * @example
 * ```typescript
 * const _REPORT_CACHE = createReactiveCache({
 *   name: "report_detail",
 *   uniquenessKeys: (params) => [params.projectId, params.reportId],
 *   versionKey: (params, pds) => pds.lastUpdated.reports[params.reportId] ?? "unknown",
 *   extract: (res) => res.success ? res.data : null,
 * });
 *
 * // Usage - cache reads PDS internally
 * const data = await _REPORT_CACHE.get({ projectId: "p1", reportId: "r1" });
 * ```
 */

type ResolvedPayload<T> = {
  data: T;
};

type UnresolvedPayload<T> = {
  dataPromise: Promise<APIResponseWithData<T>>;
};

export type ReactiveCacheConfig<Params, Data> = {
  /** Cache name - used as IndexedDB key prefix */
  name: string;

  /** Extract uniqueness keys from params - will be auto-hashed */
  uniquenessKeys: (params: Params) => (string | number | undefined)[];

  /** Extract version from params + PDS - version is part of cache key */
  versionKey: (params: Params, pds: ProjectDirtyStates) => string;

  /** Max number of entries in memory cache (LRU eviction). Default: 100 */
  maxSize?: number;

  /** Set to true if this cache doesn't require PDS (e.g., instance-level caches). Default: false */
  pdsNotRequired?: boolean;
};

export interface ReactiveCache<Params, Data> {
  get(params: Params): Promise<{ data: Data | undefined; version: string; isInflight?: boolean }>;
  setPromise(
    promise: Promise<APIResponseWithData<Data>>,
    params: Params,
    version: string,
  ): Promise<void>;
  clearEntry(params: Params): Promise<void>;
  clearEntriesWithPrefix(partialKeys: (string | number | undefined)[]): Promise<void>;
  clearMemory(): void;
}

/**
 * Create a reactive cache that reads ProjectDirtyStates from context
 */
export function createReactiveCache<Params, Data>(
  config: ReactiveCacheConfig<Params, Data>,
): ReactiveCache<Params, Data> {
  const _resolved = new Map<string, ResolvedPayload<Data>>();
  const _unresolved = new Map<string, UnresolvedPayload<Data>>();
  const _accessOrder = new Map<string, number>();
  const maxSize = config.maxSize ?? 100;

  /** Hash array of keys into string */
  function hashKeys(keys: (string | number | undefined)[]): string {
    return keys
      .map((k) => (k === undefined ? "undefined" : String(k)))
      .join("|");
  }

  /** Get cache key from params + PDS */
  function getCacheKey(params: Params, pds: ProjectDirtyStates): string {
    const uniquenessHash = hashKeys(config.uniquenessKeys(params));
    const versionHash = config.versionKey(params, pds);
    // Version is PART of the key - different version = different key = automatic miss
    return `${uniquenessHash}::${versionHash}`;
  }

  /** Get IndexedDB key */
  function getIdbKey(cacheKey: string): string {
    return `${config.name}/${cacheKey}`;
  }

  /** LRU eviction for memory cache */
  function evictLRU(): void {
    if (_resolved.size <= maxSize) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, time] of _accessOrder.entries()) {
      if (time < oldestTime && _resolved.has(key)) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      _resolved.delete(oldestKey);
      _accessOrder.delete(oldestKey);
    }
  }

  /** Get from cache - ALWAYS returns version, data is undefined on miss */
  async function getCached(
    params: Params,
  ): Promise<{ data: Data | undefined; version: string; isInflight?: boolean }> {
    // Get non-reactive snapshot from global (works in async contexts)
    const pds = getGlobalPDSSnapshot();

    // If PDS not available or not ready, check if cache requires it
    if (!pds || !pds.isReady) {
      if (!config.pdsNotRequired) {
        // console.log(`[ReactiveCache:${config.name}] PDS not ready - cache miss`);
        return { data: undefined, version: "pds_not_ready" };
      }
      // Cache doesn't need PDS - create a dummy PDS to pass to versionKey
      // The versionKey function should ignore it anyway
    }

    const version = config.versionKey(params, pds!);
    const cacheKey = getCacheKey(params, pds!);

    // Check memory cache
    const existingInMemory = _resolved.get(cacheKey);
    if (existingInMemory) {
      // console.log(
      //   `[ReactiveCache:${config.name}] Memory HIT for key: ${cacheKey}`,
      // );
      _accessOrder.set(cacheKey, Date.now());
      return { data: existingInMemory.data, version };
    }

    // Check IndexedDB
    const idbKey = getIdbKey(cacheKey);
    const existing: ResolvedPayload<Data> | undefined = await get(idbKey);
    if (existing) {
      // console.log(
      //   `[ReactiveCache:${config.name}] IndexedDB HIT for key: ${cacheKey}`,
      // );
      evictLRU();
      _resolved.set(cacheKey, existing);
      _accessOrder.set(cacheKey, Date.now());
      return { data: existing.data, version };
    }

    // Check in-flight promises
    const existingUnresolved = _unresolved.get(cacheKey);
    if (existingUnresolved) {
      // console.log(
      //   `[ReactiveCache:${config.name}] In-flight promise found for key: ${cacheKey}`,
      // );
      const response = await existingUnresolved.dataPromise;
      const data = response.success ? response.data : undefined;
      return { data, version, isInflight: true };
    }

    // console.log(`[ReactiveCache:${config.name}] MISS for key: ${cacheKey}`);
    return { data: undefined, version };
  }

  /** Set promise and cache result - uses version from get() to ensure consistency */
  async function setPromise(
    promise: Promise<APIResponseWithData<Data>>,
    params: Params,
    version: string,
  ): Promise<void> {
    // Use provided version (from get()) rather than reading PDS again
    // This ensures we cache under the same key we checked

    // Build cache key using provided version
    const uniquenessHash = hashKeys(config.uniquenessKeys(params));
    const cacheKey = `${uniquenessHash}::${version}`;

    // Check if already in flight
    const existingUnresolved = _unresolved.get(cacheKey);
    if (existingUnresolved) {
      // console.log(
      //   `[ReactiveCache:${config.name}] Promise already in-flight for key: ${cacheKey}`,
      // );
      // Already processing this exact request
      return;
    }

    // console.log(
    //   `[ReactiveCache:${config.name}] Starting fetch for key: ${cacheKey}`,
    // );

    // Track in-flight
    _unresolved.set(cacheKey, {
      dataPromise: promise,
    });

    try {
      const response = await promise;

      // Always unwrap APIResponseWithData
      if (!response.success) {
        // console.log(
        //   `[ReactiveCache:${config.name}] Response failed - not caching`,
        // );
        // Don't cache errors/failures
        _unresolved.delete(cacheKey);
        return;
      }

      const valueToStore: ResolvedPayload<Data> = { data: response.data };

      // Store in memory
      evictLRU();
      _resolved.set(cacheKey, valueToStore);
      _accessOrder.set(cacheKey, Date.now());

      // Store in IndexedDB
      const idbKey = getIdbKey(cacheKey);
      await set(idbKey, valueToStore);

      // console.log(
      //   `[ReactiveCache:${config.name}] Successfully cached result for key: ${cacheKey}`,
      // );

      _unresolved.delete(cacheKey);
    } catch (error) {
      _unresolved.delete(cacheKey);
      console.error(`ReactiveCache[${config.name}] setPromise error:`, error);
      throw error;
    }
  }

  /** Clear specific entry (by uniqueness params only - all versions) */
  async function clearEntry(params: Params): Promise<void> {
    // We need to clear ALL versions of this uniqueness key
    // Since version is part of the key, we need to iterate
    const uniquenessHash = hashKeys(config.uniquenessKeys(params));
    const prefix = `${uniquenessHash}::`;

    // Clear from memory
    for (const key of _resolved.keys()) {
      if (key.startsWith(prefix)) {
        _resolved.delete(key);
        _accessOrder.delete(key);
      }
    }
    for (const key of _unresolved.keys()) {
      if (key.startsWith(prefix)) {
        _unresolved.delete(key);
      }
    }

    // Clear from IndexedDB (await to ensure it completes)
    try {
      const idbPrefix = getIdbKey(prefix);
      const allKeys = await keys();
      const deletePromises = [];
      for (const key of allKeys) {
        if (typeof key === "string" && key.startsWith(idbPrefix)) {
          deletePromises.push(del(key));
        }
      }
      await Promise.all(deletePromises);
    } catch (err) {
      console.error(`ReactiveCache[${config.name}] clearEntry error:`, err);
    }
  }

  /** Clear entries matching a partial key prefix */
  async function clearEntriesWithPrefix(partialKeys: (string | number | undefined)[]): Promise<void> {
    const prefix = hashKeys(partialKeys);

    // Clear from memory
    for (const key of _resolved.keys()) {
      if (key.startsWith(prefix)) {
        _resolved.delete(key);
        _accessOrder.delete(key);
      }
    }
    for (const key of _unresolved.keys()) {
      if (key.startsWith(prefix)) {
        _unresolved.delete(key);
      }
    }

    // Clear from IndexedDB
    try {
      const idbPrefix = `${config.name}/${prefix}`;
      const allKeys = await keys();
      const deletePromises = [];
      for (const key of allKeys) {
        if (typeof key === "string" && key.startsWith(idbPrefix)) {
          deletePromises.push(del(key));
        }
      }
      await Promise.all(deletePromises);
    } catch (err) {
      console.error(`ReactiveCache[${config.name}] clearEntriesWithPrefix error:`, err);
    }
  }

  /** Clear all memory caches */
  function clearMemory(): void {
    _resolved.clear();
    _unresolved.clear();
    _accessOrder.clear();
  }

  return {
    get: getCached,
    setPromise,
    clearEntry,
    clearEntriesWithPrefix,
    clearMemory,
  };
}

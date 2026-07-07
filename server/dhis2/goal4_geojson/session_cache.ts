import type { CachedGeoJsonMetadata, CachedHeavyGeoJson } from "./types.ts";

// Two process-local session caches for the DHIS2 geojson import wizard,
// deliberately separate namespaces (they cache different payloads for the
// same credentials+level key):
// - metadata (analyze): tiny org-unit metadata + geometry count — the user
//   builds the mapping against this.
// - heavy (save): the full ~20 MB FeatureCollection — kept only so a re-save
//   after fixing a mapping isn't another multi-minute DHIS2 fetch.
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_METADATA_ENTRIES = 10;
const MAX_HEAVY_ENTRIES = 2;

// SHA-256 over creds+level (the previous key was a 32-bit string hash over
// the plaintext-concatenated password — trivially collidable).
export async function getCredsCacheKey(
  url: string,
  username: string,
  password: string,
  dhis2Level: number,
): Promise<string> {
  const data = new TextEncoder().encode(
    `${url}|${username}|${password}|${dhis2Level}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type SessionCache<T> = {
  get(key: string): T | null;
  set(key: string, value: T): void;
  delete(key: string): void;
};

function createSessionCache<T extends { fetchedAt: number }>(
  maxEntries: number,
): SessionCache<T> {
  const cache = new Map<string, T>();

  function evictExpired(): void {
    const now = Date.now();
    for (const [key, value] of cache) {
      if (now - value.fetchedAt > CACHE_TTL_MS) {
        cache.delete(key);
      }
    }
  }

  function evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, value] of cache) {
      if (value.fetchedAt < oldestTime) {
        oldestTime = value.fetchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  return {
    get(key: string): T | null {
      evictExpired();
      return cache.get(key) ?? null;
    },
    set(key: string, value: T): void {
      evictExpired();
      while (cache.size >= maxEntries) {
        evictOldest();
      }
      cache.set(key, value);
    },
    delete(key: string): void {
      cache.delete(key);
    },
  };
}

export const metadataSessionCache =
  createSessionCache<CachedGeoJsonMetadata>(MAX_METADATA_ENTRIES);
export const heavyGeoJsonSessionCache =
  createSessionCache<CachedHeavyGeoJson>(MAX_HEAVY_ENTRIES);

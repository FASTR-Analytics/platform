import type { CachedGeoJsonData } from "./types.ts";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 10;

const cache = new Map<string, CachedGeoJsonData>();

function hashCacheKey(url: string, username: string, password: string, dhis2Level: number): string {
  const input = `${url}|${username}|${password}|${dhis2Level}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `geojson_${hash.toString(16)}_${dhis2Level}`;
}

function evictOldest(): void {
  if (cache.size === 0) return;

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

function evictExpired(): void {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (now - value.fetchedAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

export function getCacheKey(url: string, username: string, password: string, dhis2Level: number): string {
  return hashCacheKey(url, username, password, dhis2Level);
}

export function getFromCache(cacheKey: string): CachedGeoJsonData | null {
  evictExpired();

  const entry = cache.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(cacheKey);
    return null;
  }

  return entry;
}

export function setInCache(cacheKey: string, data: CachedGeoJsonData): void {
  evictExpired();

  while (cache.size >= MAX_CACHE_ENTRIES) {
    evictOldest();
  }

  cache.set(cacheKey, data);
}

export function invalidateCache(cacheKey: string): void {
  cache.delete(cacheKey);
}

export function clearAllCache(): void {
  cache.clear();
}

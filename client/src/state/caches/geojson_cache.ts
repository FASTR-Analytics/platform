import { get, set, del, keys } from "idb-keyval";
import type { GeoJSONFeatureCollection } from "panther";
import { serverActions } from "~/server_actions";

const GEOJSON_CACHE_PREFIX = "geojson:";

const memoryCache = new Map<number, GeoJSONFeatureCollection>();

export async function getGeoJsonCached(
  level: number,
): Promise<GeoJSONFeatureCollection> {
  const cached = memoryCache.get(level);
  if (cached) return cached;

  const cacheKey = `${GEOJSON_CACHE_PREFIX}${level}`;
  const existing: GeoJSONFeatureCollection | undefined = await get(cacheKey);
  if (existing) {
    memoryCache.set(level, existing);
    return existing;
  }

  const res = await serverActions.getGeoJsonForLevel({ level: String(level) });
  if (res.success === false) {
    throw new Error(res.err);
  }

  const parsed = JSON.parse(res.data) as GeoJSONFeatureCollection;
  memoryCache.set(level, parsed);
  await set(cacheKey, parsed);
  return parsed;
}

export async function clearGeoJsonCache(): Promise<void> {
  memoryCache.clear();
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === "string" && key.startsWith(GEOJSON_CACHE_PREFIX)) {
      await del(key);
    }
  }
}

import { get, set, del, keys } from "idb-keyval";
import type { GeoJSONFeatureCollection } from "panther";
import type { GeoJsonMapSummary } from "lib";
import { serverActions } from "~/server_actions";

const IDB_PREFIX = "geojson:";

type CacheEntry = {
  uploadedAt: string;
  data: GeoJSONFeatureCollection;
};

const memoryCache = new Map<number, CacheEntry>();

export function getGeoJsonSync(level: number): GeoJSONFeatureCollection | undefined {
  return memoryCache.get(level)?.data;
}

export async function preloadGeoJson(maps: GeoJsonMapSummary[]): Promise<void> {
  await Promise.all(maps.map((m) => loadLevel(m.adminAreaLevel, m.uploadedAt)));
}

async function loadLevel(level: number, uploadedAt: string): Promise<void> {
  const mem = memoryCache.get(level);
  if (mem && mem.uploadedAt === uploadedAt) return;

  const idbKey = `${IDB_PREFIX}${level}`;
  const stored: CacheEntry | undefined = await get(idbKey);
  if (stored && stored.uploadedAt === uploadedAt) {
    memoryCache.set(level, stored);
    return;
  }

  const res = await serverActions.getGeoJsonForLevel({ level: String(level) });
  if (!res.success) throw new Error(res.err);

  const entry: CacheEntry = {
    uploadedAt: res.data.uploadedAt,
    data: JSON.parse(res.data.geojson) as GeoJSONFeatureCollection,
  };
  memoryCache.set(level, entry);
  await set(idbKey, entry);
}

export function clearGeoJsonMemoryCache(): void {
  memoryCache.clear();
}

export async function clearGeoJsonCache(): Promise<void> {
  memoryCache.clear();
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === "string" && key.startsWith(IDB_PREFIX)) {
      await del(key);
    }
  }
}

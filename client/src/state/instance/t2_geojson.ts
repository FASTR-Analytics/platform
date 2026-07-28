import { get, set, del, keys } from "idb-keyval";
import type { GeoJSONFeatureCollection } from "panther";
import type { GeoJsonMapSummary } from "lib";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

const IDB_PREFIX = "geojson:";

type CacheEntry = {
  uploadedAt: string;
  data: GeoJSONFeatureCollection;
};

const memoryCache = new Map<number, CacheEntry>();

// Bumped whenever memoryCache contents change, and read inside
// getGeoJsonSync: a tracked computation that rendered "no boundaries"
// before a level loaded re-runs once it arrives. Untracked callers are
// unaffected.
const [geoJsonVersion, setGeoJsonVersion] = createSignal(0);

export function getGeoJsonSync(level: number): GeoJSONFeatureCollection | undefined {
  geoJsonVersion();
  return memoryCache.get(level)?.data;
}

export async function preloadGeoJson(maps: GeoJsonMapSummary[]): Promise<void> {
  await Promise.all(maps.map(async (m) => {
    try {
      await loadLevel(m.adminAreaLevel, m.uploadedAt);
    } catch (e) {
      console.error(`preloadGeoJson: level ${m.adminAreaLevel} failed:`, e);
    }
  }));
}

async function loadLevel(level: number, uploadedAt: string): Promise<void> {
  const mem = memoryCache.get(level);
  if (mem && mem.uploadedAt === uploadedAt) return;

  const idbKey = `${IDB_PREFIX}${level}`;
  const stored: CacheEntry | undefined = await get(idbKey);
  if (stored && stored.uploadedAt === uploadedAt) {
    memoryCache.set(level, stored);
    setGeoJsonVersion((v) => v + 1);
    return;
  }

  const res = await serverActions.getGeoJsonForLevel({ level: level });
  if (!res.success) throw new Error(res.err);

  const entry: CacheEntry = {
    uploadedAt: res.data.uploadedAt,
    data: JSON.parse(res.data.geojson) as GeoJSONFeatureCollection,
  };
  memoryCache.set(level, entry);
  setGeoJsonVersion((v) => v + 1);
  await set(idbKey, entry);
}

export async function evictDeletedGeoJsonLevels(maps: GeoJsonMapSummary[]): Promise<void> {
  const keepLevels = new Set(maps.map((m) => m.adminAreaLevel));
  let removedAny = false;
  for (const level of [...memoryCache.keys()]) {
    if (!keepLevels.has(level)) {
      memoryCache.delete(level);
      removedAny = true;
    }
  }
  if (removedAny) {
    setGeoJsonVersion((v) => v + 1);
  }
  try {
    const allKeys = await keys();
    for (const key of allKeys) {
      if (typeof key === "string" && key.startsWith(IDB_PREFIX)) {
        const level = Number(key.slice(IDB_PREFIX.length));
        if (!keepLevels.has(level)) {
          await del(key);
        }
      }
    }
  } catch (e) {
    console.error("evictDeletedGeoJsonLevels: IDB cleanup failed:", e);
  }
}

export function clearGeoJsonMemoryCache(): void {
  memoryCache.clear();
  setGeoJsonVersion((v) => v + 1);
}

export async function clearGeoJsonCache(): Promise<void> {
  memoryCache.clear();
  setGeoJsonVersion((v) => v + 1);
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === "string" && key.startsWith(IDB_PREFIX)) {
      await del(key);
    }
  }
}

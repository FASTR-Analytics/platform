import { get, set, del, keys } from "idb-keyval";
import type { GeoJSONFeatureCollection } from "panther";
import type { DatasetType, FacilityFamily, GeoJsonMapSummary } from "lib";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

const IDB_PREFIX = "geojson:";

type CacheEntry = {
  uploadedAt: string;
  data: GeoJSONFeatureCollection;
};

// Keyed `${family}:${level}` — maps are per facility registry.
const memoryCache = new Map<string, CacheEntry>();

function cacheKey(family: FacilityFamily, level: number): string {
  return `${family}:${level}`;
}

// Ruling: a results value without a stamped datasetFamily (packages
// synthesized before the field existed) defaults to hmis — the migration
// copies the legacy shared map to hmis whenever HMIS facilities exist, so
// legacy viz keep rendering exactly as today. iceh has no facility registry
// and takes the same default.
export function geoJsonFamilyFor(
  datasetFamily: DatasetType | undefined,
): FacilityFamily {
  return datasetFamily === "hfa" ? "hfa" : "hmis";
}

// Bumped whenever memoryCache contents change, and read inside
// getGeoJsonSync: a tracked computation that rendered "no boundaries"
// before a map loaded re-runs once it arrives. Untracked callers are
// unaffected.
const [geoJsonVersion, setGeoJsonVersion] = createSignal(0);

export function getGeoJsonSync(
  family: FacilityFamily,
  level: number,
): GeoJSONFeatureCollection | undefined {
  geoJsonVersion();
  return memoryCache.get(cacheKey(family, level))?.data;
}

let legacyKeysSwept = false;

export async function preloadGeoJson(maps: GeoJsonMapSummary[]): Promise<void> {
  await sweepLegacyIdbKeys();
  await Promise.all(maps.map(async (m) => {
    try {
      await loadMap(m.family, m.adminAreaLevel, m.uploadedAt);
    } catch (e) {
      console.error(
        `preloadGeoJson: ${m.family} level ${m.adminAreaLevel} failed:`,
        e,
      );
    }
  }));
}

// One-time sweep of pre-split `geojson:{N}` IDB keys (the new format is
// `geojson:{family}:{level}`).
async function sweepLegacyIdbKeys(): Promise<void> {
  if (legacyKeysSwept) return;
  legacyKeysSwept = true;
  try {
    const allKeys = await keys();
    for (const key of allKeys) {
      if (
        typeof key === "string" &&
        key.startsWith(IDB_PREFIX) &&
        !key.slice(IDB_PREFIX.length).includes(":")
      ) {
        await del(key);
      }
    }
  } catch (e) {
    console.error("sweepLegacyIdbKeys: IDB cleanup failed:", e);
  }
}

async function loadMap(
  family: FacilityFamily,
  level: number,
  uploadedAt: string,
): Promise<void> {
  const key = cacheKey(family, level);
  const mem = memoryCache.get(key);
  if (mem && mem.uploadedAt === uploadedAt) return;

  const idbKey = `${IDB_PREFIX}${key}`;
  const stored: CacheEntry | undefined = await get(idbKey);
  if (stored && stored.uploadedAt === uploadedAt) {
    memoryCache.set(key, stored);
    setGeoJsonVersion((v) => v + 1);
    return;
  }

  const res = await serverActions.getGeoJsonForLevel({ family, level });
  if (!res.success) throw new Error(res.err);

  const entry: CacheEntry = {
    uploadedAt: res.data.uploadedAt,
    data: JSON.parse(res.data.geojson) as GeoJSONFeatureCollection,
  };
  memoryCache.set(key, entry);
  setGeoJsonVersion((v) => v + 1);
  await set(idbKey, entry);
}

export async function evictDeletedGeoJsonLevels(maps: GeoJsonMapSummary[]): Promise<void> {
  const keepKeys = new Set(maps.map((m) => cacheKey(m.family, m.adminAreaLevel)));
  let removedAny = false;
  for (const key of [...memoryCache.keys()]) {
    if (!keepKeys.has(key)) {
      memoryCache.delete(key);
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
        if (!keepKeys.has(key.slice(IDB_PREFIX.length))) {
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

import { get, set, del, keys } from "idb-keyval";
import { serverActions } from "~/server_actions";

const GEOJSON_CACHE_PREFIX = "geojson:";

type CachedGeoJson = {
  data: unknown;
  uploadedAt: string;
};

export async function getGeoJsonCached(
  level: number,
  uploadedAt: string,
): Promise<unknown> {
  const cacheKey = `${GEOJSON_CACHE_PREFIX}${level}`;

  const existing: CachedGeoJson | undefined = await get(cacheKey);
  if (existing && existing.uploadedAt === uploadedAt) {
    return existing.data;
  }

  const res = await serverActions.getGeoJsonForLevel({ level: String(level) });
  if (res.success === false) {
    throw new Error(res.err);
  }

  const parsed = JSON.parse(res.data);

  await set(cacheKey, { data: parsed, uploadedAt } satisfies CachedGeoJson);

  return parsed;
}

export async function clearGeoJsonCache(): Promise<void> {
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === "string" && key.startsWith(GEOJSON_CACHE_PREFIX)) {
      await del(key);
    }
  }
}

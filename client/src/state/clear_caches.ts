import { keys, del } from "idb-keyval";
import { clearGeoJsonMemoryCache } from "./instance/t2_geojson";

const AI_PREFIXES = ["ai-conv", "ai-documents"];

export type ClientCacheBucket = {
  name: string;
  count: number;
};

export async function getClientCacheBuckets(): Promise<{
  total: number;
  buckets: ClientCacheBucket[];
}> {
  const allKeys = await keys();
  const counts = new Map<string, number>();
  for (const k of allKeys) {
    if (typeof k !== "string") continue;
    const slashIdx = k.indexOf("/");
    const colonIdx = k.indexOf(":");
    let bucket: string;
    if (slashIdx > 0 && (colonIdx === -1 || slashIdx < colonIdx)) {
      bucket = k.slice(0, slashIdx);
    } else if (colonIdx > 0) {
      bucket = k.slice(0, colonIdx);
    } else {
      bucket = k;
    }
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const buckets = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { total: allKeys.length, buckets };
}

export async function clearDataCache(): Promise<void> {
  clearGeoJsonMemoryCache();
  const allKeys = await keys();
  const cacheKeys = allKeys.filter((k) => {
    if (typeof k !== "string") return true;
    return !AI_PREFIXES.some((prefix) => k.startsWith(prefix));
  });
  await Promise.all(cacheKeys.map((k) => del(k)));
}

export async function clearAiChatCache(): Promise<void> {
  const allKeys = await keys();
  const aiKeys = allKeys.filter(
    (k) => typeof k === "string" && AI_PREFIXES.some((prefix) => k.startsWith(prefix)),
  );
  await Promise.all(aiKeys.map((k) => del(k)));
}

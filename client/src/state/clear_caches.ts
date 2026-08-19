import { keys, del } from "idb-keyval";
import { clearGeoJsonMemoryCache } from "./instance/t2_geojson";

// The AI prefixes are the ONE thing kept across a data-cache clear (and the
// one thing an AI-cache clear touches): everything else in IndexedDB is a T2
// cache entry that a re-fetch reproduces. Cache NAMES are otherwise
// unchanged by the products restructure — the deploy flush clears every
// non-AI key on a version change anyway, so pre-restructure entries under the
// old key shapes are gone by the time the new code reads them (D8).
const AI_PREFIXES = ["ai-conv", "ai-documents"];

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

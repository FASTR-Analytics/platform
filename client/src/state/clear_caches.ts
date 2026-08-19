import { keys, del } from "idb-keyval";
import { clearGeoJsonMemoryCache } from "./instance/t2_geojson";

// The AI prefixes are the ONE thing kept across a data-cache clear (and the
// one thing an AI-cache clear touches): everything else in IndexedDB is a T2
// cache entry that a re-fetch reproduces, so nothing here has to reason about
// stale key shapes — the deploy flush clears every non-AI key on a version
// change.
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

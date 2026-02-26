import { keys, del } from "idb-keyval";

const AI_PREFIXES = ["ai-conv", "ai-documents"];

export async function clearDataCache(): Promise<void> {
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

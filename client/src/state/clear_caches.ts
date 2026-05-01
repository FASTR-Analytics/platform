import { keys, del } from "idb-keyval";
import { clearGeoJsonMemoryCache } from "./instance/t2_geojson";

const AI_PREFIXES = ["ai-conv", "ai-documents"];

export type ClientVizCacheStatus = {
  id: string;
  poDetailCached: boolean;
  metricInfoCached: boolean;
  poItemsCount: number;
  replicantOptionsCount: number;
};

export async function getClientVizCacheStatuses(
  projectId: string,
  visualizations: { id: string; metricId: string; resultsObjectId: string | undefined }[],
): Promise<ClientVizCacheStatus[]> {
  const allKeys = (await keys()).filter((k): k is string => typeof k === "string");

  return visualizations.map((viz) => {
    const poDetailPrefix = `po_detail/${projectId}|${viz.id}::`;
    const metricInfoPrefix = `metric_info/${projectId}|${viz.metricId}::`;
    const poItemsPrefix = viz.resultsObjectId
      ? `po_items/${projectId}|${viz.resultsObjectId}|`
      : null;
    const replicantPrefix = viz.resultsObjectId
      ? `replicant_options/${projectId}|${viz.resultsObjectId}|`
      : null;

    return {
      id: viz.id,
      poDetailCached: allKeys.some((k) => k.startsWith(poDetailPrefix)),
      metricInfoCached: allKeys.some((k) => k.startsWith(metricInfoPrefix)),
      poItemsCount: poItemsPrefix
        ? allKeys.filter((k) => k.startsWith(poItemsPrefix)).length
        : 0,
      replicantOptionsCount: replicantPrefix
        ? allKeys.filter((k) => k.startsWith(replicantPrefix)).length
        : 0,
    };
  });
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

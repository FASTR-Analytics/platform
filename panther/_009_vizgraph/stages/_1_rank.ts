// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutWarning } from "../types_geometry.ts";
import type { LayoutOptions } from "../types_options.ts";
import { resolveLayers } from "../_internal/graph_index.ts";
import type { GraphIndex } from "../_internal/graph_index.ts";

export type RankResult = {
  layerIndexByNodeId: Map<string, number>;
  layerValueByIndex: number[];
};

// Stage 1: layer assignment. Author-supplied layers are the primary mode;
// longest-path is the automatic fallback (cycle-safe: back-edges skipped).
// Raw layer values (which may have gaps) are normalized to contiguous
// indexes; the raw value is echoed in NodeGeom.layer via layerValueByIndex.
export function rankStage(
  index: GraphIndex,
  options: LayoutOptions | undefined,
  warnings: LayoutWarning[],
): RankResult {
  const anyGivenLayer = [...index.nodeById.values()].some(
    (n) => n.layer !== undefined,
  );
  const ranking = options?.ranking ??
    (anyGivenLayer ? "given" : "longest-path");
  const resolved = resolveLayers(index, ranking === "given");
  if (resolved.hadCycle) {
    warnings.push({
      code: "cycle",
      message: "Edge graph contains a cycle; back-edges ignored for layering",
    });
  }
  if (resolved.missingLayerNodeIds.length > 0) {
    warnings.push({
      code: "missing-layer",
      message: 'ranking is "given" but some nodes have no layer; derived',
      ids: resolved.missingLayerNodeIds,
    });
  }

  const layerValueByIndex = [...new Set(resolved.layerByNodeId.values())].sort(
    (a, b) => a - b,
  );
  const indexByLayerValue = new Map<number, number>(
    layerValueByIndex.map((value, i) => [value, i]),
  );
  const layerIndexByNodeId = new Map<string, number>();
  for (const [nodeId, layerValue] of resolved.layerByNodeId) {
    layerIndexByNodeId.set(nodeId, indexByLayerValue.get(layerValue)!);
  }
  return { layerIndexByNodeId, layerValueByIndex };
}

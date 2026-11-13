// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataDimension } from "../deps.ts";
import type { LegendEntry } from "./types.ts";
import type { LegendInput } from "./scale_legend_types.ts";

// An unsplit series has no legend.
export function resolveDefaultLegend(
  legend: LegendInput | undefined,
  series: DataDimension | undefined,
): LegendInput {
  return legend ?? series?.members.map((h) => h.label) ?? [];
}

export function getLegendEntriesInGroups(
  legendEntries: LegendEntry[],
  maxLegendEntriesInOneColumn: number | number[],
): LegendEntry[][] {
  if (maxLegendEntriesInOneColumn instanceof Array) {
    let startIndex = 0;
    return maxLegendEntriesInOneColumn.map((n) => {
      const i = startIndex;
      startIndex += n;
      return legendEntries.slice(i, i + n);
    });
  } else {
    const nEntriesPerGroup = getNEntriesPerGroup(
      legendEntries.length,
      maxLegendEntriesInOneColumn,
    );
    return legendEntries.reduce<LegendEntry[][]>(
      (resultArray, entry, index) => {
        const chunkIndex = Math.floor(index / nEntriesPerGroup);
        if (!resultArray[chunkIndex]) {
          resultArray[chunkIndex] = [];
        }
        resultArray[chunkIndex].push(entry);
        return resultArray;
      },
      [],
    );
  }
}

function getNEntriesPerGroup(
  nLegendEntries: number,
  maxLegendEntriesInOneColumn: number,
): number {
  const columnsNeeded = Math.ceil(nLegendEntries / maxLegendEntriesInOneColumn);
  return Math.ceil(nLegendEntries / columnsNeeded);
}

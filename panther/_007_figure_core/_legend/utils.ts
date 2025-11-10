// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LegendItem } from "./types.ts";

export function getLegendItemsInGroups(
  legendItems: LegendItem[],
  maxLegendItemsInOneColumn: number | number[],
): LegendItem[][] {
  if (maxLegendItemsInOneColumn instanceof Array) {
    let startIndex = 0;
    return maxLegendItemsInOneColumn.map((n) => {
      const i = startIndex;
      startIndex += n;
      return legendItems.slice(i, i + n);
    });
  } else {
    const nItemsPerGroup = getNumberItemsPerGroup(
      legendItems.length,
      maxLegendItemsInOneColumn,
    );
    return legendItems.reduce<LegendItem[][]>((resultArray, item, index) => {
      const chunkIndex = Math.floor(index / nItemsPerGroup);
      if (!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = [];
      }
      resultArray[chunkIndex].push(item);
      return resultArray;
    }, []);
  }
}

function getNumberItemsPerGroup(
  nLegendItems: number,
  maxLegendItemsInOneColumn: number,
): number {
  const columnsNeeded = Math.ceil(nLegendItems / maxLegendItemsInOneColumn);
  return Math.ceil(nLegendItems / columnsNeeded);
}

// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { YScaleAxisWidthInfo } from "../../types.ts";

export function calculateHorizontalGridLinesForTier(
  i_tier: number,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  plotAreaY: number,
  plotAreaHeight: number,
): { y: number; tickValue: number }[] {
  const my = yScaleAxisWidthInfo;
  const horizontalGridLines: { y: number; tickValue: number }[] = [];

  const tickIncrement = plotAreaHeight /
    (my.yAxisTickValues[i_tier].length - 1);
  let currentY = plotAreaY;

  // Iterate from top to bottom (highest value to lowest)
  for (
    let i_tick = my.yAxisTickValues[i_tier].length - 1;
    i_tick >= 0;
    i_tick--
  ) {
    const tickValue = my.yAxisTickValues[i_tier][i_tick];
    horizontalGridLines.push({ y: currentY, tickValue });
    currentY += tickIncrement;
  }

  return horizontalGridLines;
}

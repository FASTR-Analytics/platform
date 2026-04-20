// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";

export function calculateHorizontalGridLinesForTierYText(
  i_tier: number,
  plotAreaRcd: RectCoordsDims,
  nIndicators: number,
  gridStrokeWidth: number,
  centeredTicks: boolean,
): { y: number; tickValue?: number }[] {
  const result: { y: number; tickValue?: number }[] = [];
  const innerH = centeredTicks
    ? plotAreaRcd.h() / nIndicators
    : (plotAreaRcd.h() - gridStrokeWidth * (nIndicators + 1)) / nIndicators;

  let currentY = centeredTicks
    ? plotAreaRcd.y()
    : plotAreaRcd.y() + gridStrokeWidth / 2;

  for (let i = 0; i < nIndicators; i++) {
    if (centeredTicks) {
      result.push({ y: currentY + innerH / 2 });
    } else {
      result.push({ y: currentY });
    }
    currentY += centeredTicks ? innerH : innerH + gridStrokeWidth;
  }
  if (!centeredTicks) {
    result.push({ y: plotAreaRcd.bottomY() - gridStrokeWidth / 2 });
  }
  return result;
}

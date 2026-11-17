// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";

export function calculateHorizontalGridLinesForTierYText(
  subChartRcd: RectCoordsDims,
  nIndicators: number,
  gridLineStrokeWidth: number,
  centeredTicks: boolean,
): { y: number; tickValue?: number }[] {
  const result: { y: number; tickValue?: number }[] = [];
  const slotExtent = centeredTicks
    ? subChartRcd.h() / Math.max(1, nIndicators)
    : (subChartRcd.h() - gridLineStrokeWidth * (nIndicators + 1)) /
      Math.max(1, nIndicators);

  let currentY = centeredTicks
    ? subChartRcd.y()
    : subChartRcd.y() + gridLineStrokeWidth / 2;

  for (let i = 0; i < nIndicators; i++) {
    if (centeredTicks) {
      result.push({ y: currentY + slotExtent / 2 });
    } else {
      result.push({ y: currentY });
    }
    currentY += centeredTicks ? slotExtent : slotExtent + gridLineStrokeWidth;
  }
  if (!centeredTicks) {
    result.push({ y: subChartRcd.bottomY() - gridLineStrokeWidth / 2 });
  }
  return result;
}

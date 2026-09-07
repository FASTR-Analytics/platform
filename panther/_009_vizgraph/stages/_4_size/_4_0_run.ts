// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import { padsStep } from "./_4_1_pads.ts";
import { floorStep } from "./_4_2_floor.ts";
import { widthsStep } from "./_4_3_widths.ts";

// Stage 4 runner: 4.1 pads → 4.2 floor → 4.3 widths. Everything that fixes
// PNode dimensions and clearances (pads, grown heights, allocated widths)
// before placement reads them.
export function sizeSteps(): PipelineStep[] {
  return [padsStep, floorStep, widthsStep];
}

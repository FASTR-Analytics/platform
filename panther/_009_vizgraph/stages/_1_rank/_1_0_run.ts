// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import { rankStep } from "./_1_1_rank.ts";
import { spansStep } from "./_1_2_spans.ts";
import { zonesStep } from "./_1_3_zones.ts";

// Stage 1 runner: 1.1 rank → 1.2 spans → 1.3 zones (both gated: only models
// with the matching regions run them). Layer assignment, then the span and
// zone claims resolved against those layers.
export function rankSteps(): PipelineStep[] {
  return [rankStep, spansStep, zonesStep];
}

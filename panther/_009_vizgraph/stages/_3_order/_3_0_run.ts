// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import { adoptPriorOrder } from "../../stability.ts";
import { sweepsStep } from "./_3_1_sweeps.ts";
import { contiguityStep } from "./_3_2_contiguity.ts";
import { finishStep } from "./_3_3_finish.ts";

// Stage 3 runner: 3.1 sweeps → 3.2 contiguity → 3.3 finish. The runner owns
// only order — plus the adopt-prior gate on 3.1: hard stickiness
// (stability.ts) means a prior that exactly covers this model pins the
// ordering verbatim, and the sweeps are skipped (the gate call both tests
// and, on success, adopts). Contiguity and the finish run either way —
// idempotent on an adopted ordering, and contiguity re-sorts when only
// group membership changed.
export function orderSteps(): PipelineStep[] {
  return [
    {
      ...sweepsStep,
      when: (state) =>
        !adoptPriorOrder(state.proper!, state.options?.prior?.order),
    },
    contiguityStep,
    finishStep,
  ];
}

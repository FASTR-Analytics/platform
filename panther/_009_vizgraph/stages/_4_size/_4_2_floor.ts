// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import { applyPortGapFloor } from "../_6_route/_6_2_ports.ts";

// Step 4.2 — the port-gap floor CALL SITE. The floor is ports logic and
// lives with its owner (step 6.2, `applyPortGapFloor`); stage 4 numbers the
// call: fixed-size nodes grow HERE, before any stage reads heights, and
// step 4.3 re-applies the same floor after every re-measure (measured
// heights change under fit-width budgets). Classification needs stage-3
// order but no coordinates, so this runs before placement.
export const floorStep: PipelineStep = {
  id: "4.2",
  name: "floor",
  run: (state) => applyPortGapFloor(state.proper!, state.spacing),
};

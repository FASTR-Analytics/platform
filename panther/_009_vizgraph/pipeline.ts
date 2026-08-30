// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GraphModel } from "./types_model.ts";
import type { LayoutOptions } from "./types_options.ts";
import { resolveSpacing } from "./types_options.ts";
import type {
  PipelineStage,
  PipelineState,
  PipelineStep,
} from "./_internal/pipeline_types.ts";
import { buildGraphIndex } from "./_internal/graph_index.ts";
import { buildPriorIndex } from "./stability.ts";
import { collapseFolded } from "./transform/collapse.ts";
import { buildGroupIndex } from "./transform/derive.ts";
import { rankStep } from "./stages/_1_rank.ts";
import { properizeStep } from "./stages/_2_properize.ts";
import { orderSteps } from "./stages/_3_order/_3_0_run.ts";
import { sizeSteps } from "./stages/_4_size/_4_0_run.ts";
import { placeSteps, resolvePlan } from "./stages/_5_place/_5_0_run.ts";
import { routeSteps } from "./stages/_6_route/_6_0_run.ts";

// The explicit pipeline (DOC_VIZGRAPH_ARCHITECTURE.md stage pipeline): the
// stage/step sequence is DATA, defined once and consumed twice — layout()
// runs it unobserved; the stage film (tools/vizgraph_stage_film.ts) runs the
// SAME registry with a render-after-each-step observer, so the film cannot
// drift from the code. The registry is built purely from (collapsed model,
// options), so tests/vizgraph_pipeline_test.ts can walk it statically and
// pin ids, names, and file addresses against `stages/` on disk.

// [T] + [0]: the pre-stage prelude — folding is a pre-layout model transform
// (stages only ever see the flat visible graph — DOC_VIZGRAPH_ARCHITECTURE.md
// decision log), followed by index building and input warnings.
export function createPipelineState(
  model: GraphModel,
  options: LayoutOptions | undefined,
): PipelineState {
  const collapsed = collapseFolded(model);
  const index = buildGraphIndex(collapsed);
  const state: PipelineState = {
    collapsed,
    options,
    spacing: resolveSpacing(options?.spacing),
    warnings: [],
    groupIndex: buildGroupIndex(collapsed),
    index,
    prior: buildPriorIndex(options?.prior),
    plan: resolvePlan(collapsed, options),
  };
  if (options?.orientation === "top-bottom") {
    state.warnings.push({
      code: "unsupported-option",
      message:
        'orientation "top-bottom" is not implemented yet; using "left-right"',
    });
  }
  if (index.danglingEdges.length > 0) {
    state.warnings.push({
      code: "dangling-edge",
      message: "Edges referencing unknown nodes were skipped",
      ids: index.danglingEdges.map((e) => e.id),
    });
  }
  return state;
}

// The six numbered stages in execution order. Stages 1 and 2 are single
// steps; 3, 4, and 6 list their step files; 5 expands the RESOLVED placement
// schedule (so its step count and names are schedule-dependent by design).
export function buildPipeline(state: PipelineState): PipelineStage[] {
  return [
    { stage: 1, name: "rank", steps: [rankStep] },
    { stage: 2, name: "properize", steps: [properizeStep] },
    { stage: 3, name: "order", steps: orderSteps() },
    { stage: 4, name: "size", steps: sizeSteps() },
    { stage: 5, name: "place", steps: placeSteps(state.plan) },
    { stage: 6, name: "route", steps: routeSteps(state.options) },
  ];
}

export type PipelineObserver = (
  stage: PipelineStage,
  step: PipelineStep,
) => void;

export function runPipeline(
  state: PipelineState,
  observe?: PipelineObserver,
): void {
  for (const stage of buildPipeline(state)) {
    for (const step of stage.steps) {
      if (step.when !== undefined && !step.when(state)) {
        continue;
      }
      step.run(state);
      observe?.(stage, step);
    }
  }
}

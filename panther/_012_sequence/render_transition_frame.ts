// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  FigureRenderer,
  isMeasuredSceneFigure,
  phaseProgress,
  renderSceneTransitionFrame,
  transitionTotalMs,
} from "./deps.ts";
import type { MeasuredFigure, RenderContext, Transition } from "./deps.ts";

export function renderTransitionFrame(
  rc: RenderContext,
  from: MeasuredFigure,
  to: MeasuredFigure,
  elapsedMs: number,
  transition: Transition,
): void {
  if (isMeasuredSceneFigure(from) && isMeasuredSceneFigure(to)) {
    renderSceneTransitionFrame(
      rc,
      from,
      to,
      phaseProgress(transition, elapsedMs),
    );
    return;
  }
  FigureRenderer.render(
    rc,
    elapsedMs < transitionTotalMs(transition) / 2 ? from : to,
  );
}

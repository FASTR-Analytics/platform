// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { renderFigureBackground, renderFigurePrimitives } from "./deps.ts";
import type {
  HeightConstraints,
  RectCoordsDims,
  RenderContext,
  Renderer,
} from "./deps.ts";
import type { MeasuredScene, Scene, SceneInputs } from "./types.ts";
import { SceneBuilder } from "./builder.ts";
import {
  getSceneFigureIdealHeight,
  measureSceneFigure,
} from "./_internal/measure.ts";
import type { SceneSourceFactory } from "./_internal/measure.ts";

// The scene is built once, at scale 1, in the declared frame or at the content
// width at scale 1; shrinking never rebuilds it.
function sceneSource(item: SceneInputs): SceneSourceFactory {
  return (rc, style, contentW) => {
    let built: { scene: Scene; minW: number } | undefined;
    return () => {
      if (built === undefined) {
        const fw = item.frame?.w ?? contentW;
        const builder = new SceneBuilder(rc, style, fw, item.frame?.h);
        item.build(builder);
        built = { scene: builder.scene(), minW: fw };
      }
      return built;
    };
  };
}

export const SceneRenderer: Renderer<SceneInputs, MeasuredScene> = {
  isType(item: unknown): item is SceneInputs {
    return typeof item === "object" && item !== null &&
      "figureType" in item && item.figureType === "scene";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: SceneInputs,
  ): MeasuredScene {
    return measureSceneFigure(rc, bounds, item, sceneSource(item));
  },

  render(rc: RenderContext, measured: MeasuredScene): void {
    renderFigureBackground(rc, measured.measuredSurrounds);
    renderFigurePrimitives(rc, measured.primitives);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: SceneInputs,
  ): void {
    this.render(rc, this.measure(rc, bounds, item));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: SceneInputs,
  ): HeightConstraints {
    return getSceneFigureIdealHeight(rc, width, item, sceneSource(item));
  },
};

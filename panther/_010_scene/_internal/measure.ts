// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildFitReport,
  computeFloorScale,
  CustomFigureStyle,
  findFitScaleWithFloor,
  findOptimalScale,
  generateSurroundsPrimitives,
  measureSurrounds,
  memoizeByScale,
  RectCoordsDims,
  resolveFigureAutofitOptions,
} from "../deps.ts";
import type {
  FigureInputsBase,
  HeightConstraints,
  MeasuredSurrounds,
  MergedSceneStyle,
  RenderContext,
} from "../deps.ts";
import type { MeasuredSceneFigure, Scene } from "../types.ts";
import { lowerScene } from "../lower.ts";

const PROBE_HEIGHT = 9999;

// The scene a figure lowers at one rung of the fit search, at scale 1 in the
// DU of its frame, with the narrowest width its frame can take at scale 1
// (the declared or natural frame width; the layout's floor under the
// engine). `fitW` is the content width over the rung's scale, the width the
// frame would have at scale 1 to fill the body rect; a producer that
// builds once ignores it.
export type SceneFit = { scene: Scene; minW: number };
export type SceneSource = (fitW: number) => SceneFit;

function surroundsAt(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: FigureInputsBase,
  fitScale: number,
): { cs: CustomFigureStyle; ms: MeasuredSurrounds } {
  const cs = new CustomFigureStyle(
    inputs.style,
    fitScale,
    inputs.autofitSurrounds,
  );
  const ms = measureSurrounds(
    rc,
    bounds,
    cs,
    inputs.title,
    inputs.subtitle,
    inputs.footnote,
    inputs.legend,
  );
  return { cs, ms };
}

// The scaled frame centred in the body rect where it underfills; where it
// overfills (cramped) it starts at the body rect's corner and overflows.
function layoutScene<I extends FigureInputsBase>(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: I,
  scene: Scene,
  sf: number,
): MeasuredSceneFigure<I> {
  const { cs, ms } = surroundsAt(rc, bounds, inputs, sf);
  const content = ms.bodyRcd;
  const origin = {
    x: content.x() + Math.max(0, (content.w() - scene.frame.w * sf) / 2),
    y: content.y() + Math.max(0, (content.h() - scene.frame.h * sf) / 2),
  };
  const shapes = lowerScene(rc, scene, sf, origin, cs.getMergedSceneStyle());
  return {
    inputs,
    bounds,
    measuredSurrounds: ms,
    extraHeightDueToSurrounds: ms.extraHeightDueToSurrounds,
    customFigureStyle: cs,
    primitives: [...shapes, ...generateSurroundsPrimitives(ms)],
    scene,
    sf,
    origin,
  };
}

// The frame's minimum width at scale k is its narrowest width at k plus the
// surrounds' width. A frame whose narrowest width is the content width itself
// (a scene without a declared frame, at k = 1) takes bounds.w exactly, so the
// width term never binds: x − x is exact, a + (b − a) is not.
function sizeAtScale(
  fit: SceneFit,
  bounds: RectCoordsDims,
  ms: MeasuredSurrounds,
  k: number,
): { minWidth: number; idealHeight: number } {
  const contentW = ms.bodyRcd.w();
  const frameW = fit.minW * k;
  return {
    minWidth: contentW - frameW === 0
      ? bounds.w()
      : frameW + (bounds.w() - contentW),
    idealHeight: fit.scene.frame.h * k + ms.extraHeightDueToSurrounds,
  };
}

// `contentW` is the content width at scale 1, the width a scene without a
// declared frame is built at.
export type SceneSourceFactory = (
  rc: RenderContext,
  style: MergedSceneStyle,
  contentW: number,
) => SceneSource;

export function measureSceneFigure<I extends FigureInputsBase>(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: I,
  makeSource: SceneSourceFactory,
): MeasuredSceneFigure<I> {
  const { cs: cs1, ms: ms1 } = surroundsAt(rc, bounds, inputs, 1);
  const source = makeSource(
    rc,
    cs1.getMergedSceneStyle(),
    ms1.bodyRcd.w(),
  );
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  if (!autofitOpts) {
    return layoutScene(
      rc,
      bounds,
      inputs,
      source(ms1.bodyRcd.w()).scene,
      1,
    );
  }
  const fitAt = memoizeByScale((k: number) => {
    const ms = k === 1 ? ms1 : surroundsAt(rc, bounds, inputs, k).ms;
    return { ms, fit: source(ms.bodyRcd.w() / k) };
  });
  const getSizeAtScale = memoizeByScale((k: number) => {
    const { ms, fit } = fitAt(k);
    return sizeAtScale(fit, bounds, ms, k);
  });
  const { fitScale, floorScale, cramped } = findFitScaleWithFloor(
    bounds.w(),
    bounds.h(),
    {
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu: cs1.baseFontSize,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    },
    getSizeAtScale,
  );
  const measured = layoutScene(
    rc,
    bounds,
    inputs,
    fitAt(fitScale).fit.scene,
    fitScale,
  );
  measured.cramped = cramped;
  measured.fitReport = buildFitReport(
    fitScale,
    floorScale,
    cramped,
    getSizeAtScale,
  );
  return measured;
}

export function getSceneFigureIdealHeight(
  rc: RenderContext,
  width: number,
  inputs: FigureInputsBase,
  makeSource: SceneSourceFactory,
): HeightConstraints {
  const probe = new RectCoordsDims({ x: 0, y: 0, w: width, h: PROBE_HEIGHT });
  const { cs: cs1, ms: ms1 } = surroundsAt(rc, probe, inputs, 1);
  const source = makeSource(
    rc,
    cs1.getMergedSceneStyle(),
    ms1.bodyRcd.w(),
  );
  const fit1 = source(ms1.bodyRcd.w());
  const minComfortableWidth = sizeAtScale(fit1, probe, ms1, 1).minWidth;
  const neededScalingToFitWidth = width >= minComfortableWidth
    ? 1
    : width / minComfortableWidth;
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  if (!autofitOpts) {
    const idealH = fit1.scene.frame.h + ms1.extraHeightDueToSurrounds;
    return {
      minH: idealH,
      idealH,
      maxH: idealH,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  }
  const floorScale = computeFloorScale({
    minScale: autofitOpts.minScale,
    maxScale: autofitOpts.maxScale,
    baseFontSizeDu: cs1.baseFontSize,
    minFontSizeDu: autofitOpts.minFontSizeDu,
  });
  // The frame's height at the rung of the fit ladder the width forces (a
  // frame wider than the content shrinks to fit it), never below the floor:
  // the height the figure will take at this width, found on the same ladder
  // measureSceneFigure searches, so the block fits the picture.
  const probeAt = memoizeByScale((k: number) => {
    const ms = k === 1 ? ms1 : surroundsAt(rc, probe, inputs, k).ms;
    return sizeAtScale(
      k === 1 ? fit1 : source(ms.bodyRcd.w() / k),
      probe,
      ms,
      k,
    );
  });
  const widthScale = findOptimalScale(
    width,
    { minScale: floorScale, maxScale: autofitOpts.maxScale },
    (k) => probeAt(k).minWidth,
  );
  const idealH = probeAt(widthScale).idealHeight;
  return {
    minH: probeAt(floorScale).idealHeight,
    idealH,
    // Extra height buys a scene nothing: it centres in it.
    maxH: idealH,
    neededScalingToFitWidth,
    minComfortableWidth,
  };
}

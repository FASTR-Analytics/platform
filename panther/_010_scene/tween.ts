// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Color,
  CustomFigureStyle,
  generateSurroundsPrimitives,
  getColor,
  lerp,
  Padding,
  renderFigureBackground,
  renderFigurePrimitives,
  translatePrimitive,
  tween,
} from "./deps.ts";
import type {
  ColorKeyOrString,
  FigureInputsBase,
  Measured,
  MeasuredSurrounds,
  MergedSceneStyle,
  PathSpec,
  PhaseProgress,
  Primitive,
  Pt,
  Rect,
  RenderContext,
  SurroundsPrimitive,
  TextAdjustmentOptions,
} from "./deps.ts";
import type {
  BoxElement,
  ConnectorElement,
  CustomElement,
  MeasuredSceneFigure,
  RegionElement,
  Scene,
  SceneBadgeStyle,
  SceneBoxStyle,
  SceneConnectorStyle,
  SceneElement,
  SceneRegionStyle,
  TextElement,
} from "./types.ts";
import { lowerScene } from "./lower.ts";

function begun(ph: PhaseProgress): boolean {
  return ph.exit > 0 || ph.move > 0 || ph.enter > 0;
}

function complete(ph: PhaseProgress): boolean {
  return ph.exit >= 1 && ph.move >= 1 && ph.enter >= 1;
}

// A tween's frame and the keys of the departing elements in it: elements
// of `a` with no match in `b`, or whose match cannot morph, still fading.
export type TweenedScene = { scene: Scene; departing: Set<string> };

// The scene between `a` and `b` at the transition's phase progress, elements
// paired by key: a departing element fades out over the exit, a matched one
// moves over the move, an arriving one fades in at its destination over the
// enter. A matched box, region or text moves and its style interpolates; a
// matched connector's path interpolates through the engine's tween; a custom
// element with transition "redraw" moves and is redrawn. A pair that cannot
// morph (a box whose content differs, a text whose text differs, a region
// whose shape or ring count differs, a custom element with transition
// "crossfade") is two elements, one departing and one arriving, as an
// unmatched key is. The frame interpolates in both dimensions on the move.
export function tweenScene(
  a: Scene,
  b: Scene,
  ph: PhaseProgress,
): TweenedScene {
  const byKeyB = new Map(b.elements.map((e) => [e.key, e]));
  const morphedKeys = new Set<string>();
  const departing = new Set<string>();
  const elements: SceneElement[] = [];
  const push = (el: SceneElement, alpha: number) => {
    if (alpha <= 0) {
      return;
    }
    elements.push(
      alpha >= 1 ? el : { ...el, opacity: alpha * (el.opacity ?? 1) },
    );
  };
  for (const ea of a.elements) {
    const eb = byKeyB.get(ea.key);
    const morphed = eb === undefined ? undefined : morph(ea, eb, ph.move);
    if (morphed !== undefined) {
      morphedKeys.add(ea.key);
      elements.push(morphed);
    } else {
      if (ph.exit < 1) {
        departing.add(ea.key);
      }
      push(ea, 1 - ph.exit);
    }
  }
  if (!begun(ph)) {
    return { scene: a, departing };
  }
  if (complete(ph)) {
    return { scene: b, departing: new Set() };
  }
  for (const eb of b.elements) {
    if (!morphedKeys.has(eb.key)) {
      push(eb, ph.enter);
    }
  }
  return {
    scene: {
      frame: {
        w: lerp(a.frame.w, b.frame.w, ph.move),
        h: lerp(a.frame.h, b.frame.h, ph.move),
      },
      elements,
    },
    departing,
  };
}

// `t` is the move's progress.
function morph(
  a: SceneElement,
  b: SceneElement,
  t: number,
): SceneElement | undefined {
  if (a.kind !== b.kind) {
    return undefined;
  }
  switch (a.kind) {
    case "box":
      return morphBox(a, b as BoxElement, t);
    case "region":
      return morphRegion(a, b as RegionElement, t);
    case "connector":
      return morphConnector(a, b as ConnectorElement, t);
    case "text":
      return morphText(a, b as TextElement, t);
    case "custom":
      return morphCustom(a, b as CustomElement, t);
  }
}

function morphBox(
  a: BoxElement,
  b: BoxElement,
  t: number,
): BoxElement | undefined {
  if (a.variant !== b.variant || !sameJson(a.content, b.content)) {
    return undefined;
  }
  return {
    ...b,
    rect: lerpRect(a.rect, b.rect, t),
    style: lerpBoxStyle(a.style, b.style, t),
    opacity: lerpOpacity(a.opacity, b.opacity, t),
  };
}

function morphRegion(
  a: RegionElement,
  b: RegionElement,
  t: number,
): RegionElement | undefined {
  if (
    a.shape !== b.shape || a.label?.text !== b.label?.text ||
    (a.outline === undefined) !== (b.outline === undefined) ||
    (a.outline !== undefined && b.outline !== undefined &&
      (a.outline.length !== b.outline.length ||
        a.outline.some((ring, i) =>
          ring.points.length !== b.outline![i].points.length
        )))
  ) {
    return undefined;
  }
  return {
    ...b,
    rect: lerpRect(a.rect, b.rect, t),
    outline: a.outline === undefined || b.outline === undefined
      ? undefined
      : a.outline.map((ring, i) => lerpRing(ring, b.outline![i], t)),
    label: b.label === undefined ? undefined : {
      ...b.label,
      style: lerpTextStyle(a.label?.style, b.label.style, t),
      at: a.label?.at === undefined || b.label.at === undefined
        ? b.label.at
        : lerpRect(a.label.at, b.label.at, t),
    },
    style: lerpRegionStyle(a.style, b.style, t),
    opacity: lerpOpacity(a.opacity, b.opacity, t),
  };
}

function morphConnector(
  a: ConnectorElement,
  b: ConnectorElement,
  t: number,
): ConnectorElement {
  return {
    ...b,
    path: tween(a.path, b.path, t),
    style: lerpConnectorStyle(a.style, b.style, t),
    label: t < 0.5 ? a.label : b.label,
    opacity: lerpOpacity(a.opacity, b.opacity, t),
  };
}

function morphText(
  a: TextElement,
  b: TextElement,
  t: number,
): TextElement | undefined {
  if (a.text !== b.text || a.rotation !== b.rotation) {
    return undefined;
  }
  return {
    ...b,
    rect: lerpRect(a.rect, b.rect, t),
    style: lerpTextStyle(a.style, b.style, t),
    opacity: lerpOpacity(a.opacity, b.opacity, t),
  };
}

function morphCustom(
  a: CustomElement,
  b: CustomElement,
  t: number,
): CustomElement | undefined {
  if ((b.transition ?? a.transition ?? "redraw") === "crossfade") {
    return undefined;
  }
  return {
    ...b,
    rect: lerpRect(a.rect, b.rect, t),
    draw: t < 0.5 ? a.draw : b.draw,
    opacity: lerpOpacity(a.opacity, b.opacity, t),
  };
}

////////////////////////////////////////////////////////////////////////////////
//    Interpolation
////////////////////////////////////////////////////////////////////////////////

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
  };
}

// A closed ring's corners belong to its vertices (the closing segment is
// implied), so a ring interpolates vertex by vertex, never through the
// open-path tween.
function lerpRing(a: PathSpec, b: PathSpec, t: number): PathSpec {
  return {
    points: a.points.map((p, i) => ({
      x: lerp(p.x, b.points[i].x, t),
      y: lerp(p.y, b.points[i].y, t),
    })),
    corners: a.corners.map((r, i) => lerp(r, b.corners[i] ?? 0, t)),
  };
}

function lerpOpacity(
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined {
  if (a === undefined && b === undefined) {
    return undefined;
  }
  return lerp(a ?? 1, b ?? 1, t);
}

function lerpPadding(a: Padding, b: Padding, t: number): Padding {
  return new Padding({
    top: lerp(a.pt(), b.pt(), t),
    right: lerp(a.pr(), b.pr(), t),
    bottom: lerp(a.pb(), b.pb(), t),
    left: lerp(a.pl(), b.pl(), t),
  });
}

// Two colours mixed by channel; a colour that does not parse (transparent,
// none) switches halfway.
function mixColor(
  a: ColorKeyOrString,
  b: ColorKeyOrString,
  t: number,
): ColorKeyOrString {
  if (sameJson(a, b)) {
    return b;
  }
  try {
    const ra = Color.strToRgba(getColor(a));
    const rb = Color.strToRgba(getColor(b));
    const r = Math.round(lerp(ra.r, rb.r, t));
    const g = Math.round(lerp(ra.g, rb.g, t));
    const bl = Math.round(lerp(ra.b, rb.b, t));
    return `rgba(${r}, ${g}, ${bl}, ${lerp(ra.a, rb.a, t)})`;
  } catch {
    return t < 0.5 ? a : b;
  }
}

// A colour set on one side only switches halfway, as one that does not
// parse does.
function mixOptionalColor(
  a: ColorKeyOrString | undefined,
  b: ColorKeyOrString | undefined,
  t: number,
): ColorKeyOrString | undefined {
  if (a === undefined || b === undefined) {
    return t < 0.5 ? a : b;
  }
  return mixColor(a, b, t);
}

// The target's adjustments with the colour interpolated.
function lerpTextStyle(
  a: TextAdjustmentOptions | undefined,
  b: TextAdjustmentOptions | undefined,
  t: number,
): TextAdjustmentOptions | undefined {
  const color = mixOptionalColor(a?.color, b?.color, t);
  if (b === undefined && color === undefined) {
    return undefined;
  }
  return { ...b, color };
}

// Badge styles pair by index: a morph needs the same content on both sides,
// so the boxes have the same badges. A style present on one side only is
// the target's.
function lerpBadgeStyles(
  a: SceneBadgeStyle[] | undefined,
  b: SceneBadgeStyle[] | undefined,
  t: number,
): SceneBadgeStyle[] | undefined {
  if (a === undefined || b === undefined) {
    return b;
  }
  return b.map((sb, i) => {
    const sa = a[i];
    if (sa === undefined) {
      return sb;
    }
    return {
      fillColor: mixOptionalColor(sa.fillColor, sb.fillColor, t),
      strokeColor: mixOptionalColor(sa.strokeColor, sb.strokeColor, t),
      textColor: mixOptionalColor(sa.textColor, sb.textColor, t),
      opacity: lerpOpacity(sa.opacity, sb.opacity, t),
    };
  });
}

function lerpBoxStyle(
  a: SceneBoxStyle,
  b: SceneBoxStyle,
  t: number,
): SceneBoxStyle {
  return {
    ...b,
    fillColor: mixColor(a.fillColor, b.fillColor, t),
    strokeColor: mixColor(a.strokeColor, b.strokeColor, t),
    strokeWidth: lerp(a.strokeWidth, b.strokeWidth, t),
    rectRadius: lerp(a.rectRadius, b.rectRadius, t),
    padding: lerpPadding(a.padding, b.padding, t),
    title: lerpTextStyle(a.title, b.title, t),
    sub: lerpTextStyle(a.sub, b.sub, t),
    badges: lerpBadgeStyles(a.badges, b.badges, t),
  };
}

function lerpRegionStyle(
  a: SceneRegionStyle,
  b: SceneRegionStyle,
  t: number,
): SceneRegionStyle {
  return {
    ...b,
    fillColor: mixColor(a.fillColor, b.fillColor, t),
    strokeColor: mixColor(a.strokeColor, b.strokeColor, t),
    strokeWidth: lerp(a.strokeWidth, b.strokeWidth, t),
    rectRadius: lerp(a.rectRadius, b.rectRadius, t),
    depth: a.depth === undefined || b.depth === undefined
      ? b.depth
      : lerp(a.depth, b.depth, t),
  };
}

function lerpConnectorStyle(
  a: SceneConnectorStyle,
  b: SceneConnectorStyle,
  t: number,
): SceneConnectorStyle {
  return {
    ...b,
    strokeColor: mixColor(a.strokeColor, b.strokeColor, t),
    strokeWidth: lerp(a.strokeWidth, b.strokeWidth, t),
    headSize: lerp(a.headSize, b.headSize, t),
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

////////////////////////////////////////////////////////////////////////////////
//    Frames
////////////////////////////////////////////////////////////////////////////////

export function isMeasuredSceneFigure<M extends Measured<FigureInputsBase>>(
  m: M,
): m is M & MeasuredSceneFigure<FigureInputsBase> {
  return "scene" in m && "sf" in m && "origin" in m;
}

export type TransitionFrame = {
  scene: Scene;
  sf: number;
  origin: Pt;
  // The tween's lowered shapes, then the two figures' surrounds paired by
  // part.
  primitives: Primitive[];
};

// One frame of the transition from `from` to `to` at the given phase
// progress: the tweened scene, lowered at the shrink factor and the origin
// the two measures interpolate to on the move (so the first frame is the
// source picture exactly and the last the target's), departing elements in
// the source figure's merged scene style and the rest in the target's; then
// the surrounds, which follow the same phases. The background is the
// target's from frame zero.
export function lowerTransitionFrame(
  rc: RenderContext,
  from: MeasuredSceneFigure<FigureInputsBase>,
  to: MeasuredSceneFigure<FigureInputsBase>,
  ph: PhaseProgress,
): TransitionFrame {
  const { scene, departing } = tweenScene(from.scene, to.scene, ph);
  const sf = lerp(from.sf, to.sf, ph.move);
  const origin = {
    x: lerp(from.origin.x, to.origin.x, ph.move),
    y: lerp(from.origin.y, to.origin.y, ph.move),
  };
  const styleOf = (
    m: MeasuredSceneFigure<FigureInputsBase>,
  ): MergedSceneStyle =>
    new CustomFigureStyle(m.item.style, sf, m.item.autofitSurrounds)
      .getMergedSceneStyle();
  const toStyle = styleOf(to);
  const fromStyle = departing.size === 0 ? toStyle : styleOf(from);
  const shapes = styleRuns(scene.elements, departing).flatMap((run) =>
    lowerScene(
      rc,
      { frame: scene.frame, elements: run.elements },
      sf,
      origin,
      run.departing ? fromStyle : toStyle,
    )
  );
  return {
    scene,
    sf,
    origin,
    primitives: [
      ...shapes,
      ...surroundsFrame(from.measuredSurrounds, to.measuredSurrounds, ph),
    ],
  };
}

type StyleRun = { departing: boolean; elements: SceneElement[] };

// Consecutive elements that lower in one style, so the paint order of the
// frame is the tween's.
function styleRuns(
  elements: SceneElement[],
  departing: Set<string>,
): StyleRun[] {
  const runs: StyleRun[] = [];
  for (const element of elements) {
    const isDeparting = departing.has(element.key);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.departing === isDeparting) {
      last.elements.push(element);
    } else {
      runs.push({ departing: isDeparting, elements: [element] });
    }
  }
  return runs;
}

function surroundsFrame(
  a: MeasuredSurrounds,
  b: MeasuredSurrounds,
  ph: PhaseProgress,
): Primitive[] {
  const byKeyB = new Map(
    generateSurroundsPrimitives(b).map((p) => [p.key, p]),
  );
  const matched = new Set<string>();
  const out: Primitive[] = [];
  for (const pa of generateSurroundsPrimitives(a)) {
    const pb = byKeyB.get(pa.key);
    if (pb !== undefined && sameSurround(pa, pb)) {
      matched.add(pa.key);
      out.push(
        translatePrimitive(
          pb,
          lerp(pa.bounds.x() - pb.bounds.x(), 0, ph.move),
          lerp(pa.bounds.y() - pb.bounds.y(), 0, ph.move),
        ),
      );
    } else {
      out.push(...faded(pa, 1 - ph.exit, `surrounds:from/${pa.key}`));
    }
  }
  for (const pb of byKeyB.values()) {
    if (!matched.has(pb.key)) {
      out.push(...faded(pb, ph.enter, `surrounds:to/${pb.key}`));
    }
  }
  return out;
}

function faded(p: Primitive, alpha: number, group: string): Primitive[] {
  if (alpha <= 0) {
    return [];
  }
  return [alpha >= 1 ? p : { ...p, opacity: alpha, group }];
}

// Translating to the origin leaves floating-point residue, so numbers compare
// to a thousandth of a unit.
function sameSurround(a: SurroundsPrimitive, b: SurroundsPrimitive): boolean {
  const atOrigin = (p: SurroundsPrimitive) =>
    JSON.stringify(
      translatePrimitive(p, -p.bounds.x(), -p.bounds.y()),
      (_key, value) =>
        typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
    );
  return atOrigin(a) === atOrigin(b);
}

export function renderSceneTransitionFrame(
  rc: RenderContext,
  from: MeasuredSceneFigure<FigureInputsBase>,
  to: MeasuredSceneFigure<FigureInputsBase>,
  ph: PhaseProgress,
): TransitionFrame {
  const frame = lowerTransitionFrame(rc, from, to, ph);
  renderFigureBackground(rc, to.measuredSurrounds);
  renderFigurePrimitives(rc, frame.primitives);
  return frame;
}

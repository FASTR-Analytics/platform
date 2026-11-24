// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomMarkdownStyle,
  isOverflow,
  MIN_FONT_SIZE_DU,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type {
  MarkdownAutofitOptions,
  MarkdownRendererInput,
  MeasuredFormattedText,
  MeasuredMarkdown,
  MeasuredMarkdownItem,
} from "../types.ts";
import { measureMarkdown } from "./measure_markdown.ts";

type ResolvedAutofitOptions = {
  minScale: number;
  maxScale: number;
  minFontSize: number;
};

// Shrink-to-fit is ON by default (per the sizing model, D6): only an explicit
// `false` opts out. `true`, an options object, or omitting it all enable it.
// maxScale is capped at 1 so markdown never grows; `minFontSize` (DU) is the
// legibility floor, shared with figures via MIN_FONT_SIZE_DU.
function resolveAutofitOptions(
  autofit: boolean | MarkdownAutofitOptions | undefined,
): ResolvedAutofitOptions | null {
  if (autofit === false) return null;
  if (autofit === true || autofit === undefined) {
    return {
      minScale: 0,
      maxScale: 1,
      minFontSize: MIN_FONT_SIZE_DU,
    };
  }
  return {
    minScale: autofit.minScale ?? 0,
    // shrink-to-fit never grows
    maxScale: Math.min(autofit.maxScale ?? 1, 1),
    minFontSize: autofit.minFontSize ?? MIN_FONT_SIZE_DU,
  };
}

// The scales shrink-to-fit chooses among, largest first: maxScale, the whole
// point sizes below its font size (with base 14 and maxScale 1, 13/14,
// 12/14, …), then the floor, the larger of minScale and minFontSize /
// baseFontSize (a 1 DU font when both are 0), never above maxScale. The floor
// is the last scale even where it falls between two whole points, so the minH
// measured there is a height the fit can reach. There is no grow path.
export function getAutofitScales(
  input: MarkdownRendererInput,
): number[] | undefined {
  const options = resolveAutofitOptions(input.autofit);
  if (!options) return undefined;
  const baseFontSize = new CustomMarkdownStyle(input.style)
    .getMergedMarkdownStyle().text.paragraph.fontSize;
  const stated = Math.max(
    options.minScale,
    options.minFontSize / baseFontSize,
  );
  const floor = Math.min(
    stated > 0 ? stated : 1 / baseFontSize,
    options.maxScale,
  );
  if (floor >= options.maxScale) return [options.maxScale];
  const steps: number[] = [];
  for (
    let pt = Math.ceil(baseFontSize * options.maxScale) - 1;
    pt / baseFontSize > floor;
    pt--
  ) {
    // A top that floating point puts a hair above a whole point
    // (15 × 0.2 = 3.0000000000000004) would otherwise repeat the top.
    if (pt / baseFontSize < options.maxScale) steps.push(pt / baseFontSize);
  }
  return [options.maxScale, ...steps, floor];
}

export function getHeightAtScale(
  rc: RenderContext,
  width: number,
  input: MarkdownRendererInput,
  scale: number,
): number {
  const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 99999 });
  // scale is threaded as the fitScale (shrink-to-fit factor), not style.scale.
  return measureMarkdown(rc, bounds, input, scale).bounds.h();
}

// Lines break only between words, so measured at width 0 every unbreakable
// run sits on a line of its own, and the widest line's overrun is the width
// the markdown needs.
export function getMinWidthAtScale(
  rc: RenderContext,
  input: MarkdownRendererInput,
  scale: number,
): number {
  const bounds = new RectCoordsDims({ x: 0, y: 0, w: 0, h: 99999 });
  return widestOverrun(measureMarkdown(rc, bounds, input, scale));
}

// How far the widest line reaches past the width its item gives its text: the
// item's width less its insets (a list's indent, a blockquote's border and
// padding, a code block's padding). 0 where every line fits.
export function widestOverrun(measured: MeasuredMarkdown): number {
  return measured.markdownItems
    .flatMap(textWidths)
    .reduce(
      (overrun, { lineW, maxW }) =>
        lineW > 0 ? Math.max(overrun, lineW - maxW) : overrun,
      0,
    );
}

export function findOptimalScale(
  rc: RenderContext,
  width: number,
  availableHeight: number,
  input: MarkdownRendererInput,
  scales: number[],
): number {
  return largestFittingScale(
    scales,
    (scale) =>
      !isOverflow(getMinWidthAtScale(rc, input, scale), width) &&
      !isOverflow(getHeightAtScale(rc, width, input, scale), availableHeight),
  );
}

export type AutofitSizeConstraints = {
  minH: number;
  idealH: number;
  maxH: number;
  minW: number;
};

export function getAutofitSizeConstraints(
  rc: RenderContext,
  width: number,
  input: MarkdownRendererInput,
  scales: number[],
): AutofitSizeConstraints {
  // The height at the scale the width alone forces, the one measure applies
  // where the height does not bind: a long word shrinks the whole block.
  const widthScale = largestFittingScale(
    scales,
    (scale) => !isOverflow(getMinWidthAtScale(rc, input, scale), width),
  );
  const idealH = getHeightAtScale(rc, width, input, widthScale);
  const floor = scales[scales.length - 1];
  const minH = floor === widthScale
    ? idealH
    : getHeightAtScale(rc, width, input, floor);
  // shrink-to-fit never grows, so maxH is the ideal height; empty markdown
  // grows, as a placeholder does.
  const maxH = input.markdown.trim() === "" ? Infinity : idealH;
  return { minH, idealH, maxH, minW: getMinWidthAtScale(rc, input, floor) };
}

// The top is tried first, since most blocks fit at it. The floor is the
// answer when no larger scale fits, so the search never tries it.
function largestFittingScale(
  scales: number[],
  fits: (scale: number) => boolean,
): number {
  if (fits(scales[0])) return scales[0];
  let best = scales[scales.length - 1];
  let lo = 1;
  let hi = scales.length - 2;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(scales[mid])) {
      best = scales[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

function textWidths(
  item: MeasuredMarkdownItem,
): { lineW: number; maxW: number }[] {
  const formatted = (t: MeasuredFormattedText) => ({
    lineW: t.dims.w(),
    maxW: t.maxWidth,
  });
  switch (item.type) {
    case "paragraph":
    case "heading":
      return [formatted(item.mFormattedText)];
    case "list-item":
      return [formatted(item.content.mFormattedText)];
    case "blockquote":
      return item.paragraphs.map((p) => formatted(p.mFormattedText));
    case "code-block": {
      const inset = item.contentPosition.x() - item.bounds.x();
      const maxW = item.bounds.w() - 2 * inset;
      return item.lines.map((l) => ({ lineW: l.mText.dims.w(), maxW }));
    }
    case "horizontal-rule":
      return [];
  }
}

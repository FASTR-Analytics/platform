// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ColorKeyOrString,
  getAdjustedText,
  type LayoutStyleOptions,
  type MeasurableItem,
  type Measured,
  type MeasuredText,
  type MergedPageStyle,
  Padding,
  type RectCoordsDims,
  type RenderContext,
  type TextAdjustmentOptions,
  type TextInfoUnkeyed,
} from "./deps.ts";
import type { ADTItemRenderer } from "./adt_item_renderer.ts";

// ================================================================================
// TYPES
// ================================================================================

export type ADTHeading =
  | ADTHeadingGeneric
  | ADTHeadingH2
  | ADTHeadingH3
  | ADTHeadingH4;

type ADTHeadingGeneric = {
  h: string;
  level: 2 | 3 | 4;
  s?: ADTHeadingStyleOptions;
};

type ADTHeadingH2 = {
  h2: string;
  s?: ADTHeadingStyleOptions;
};

type ADTHeadingH3 = {
  h3: string;
  s?: ADTHeadingStyleOptions;
};

type ADTHeadingH4 = {
  h4: string;
  s?: ADTHeadingStyleOptions;
};

export type ADTHeadingStyleOptions =
  & LayoutStyleOptions
  & TextAdjustmentOptions
  & {
    align?: "left" | "right" | "center";
  };

export function getADTHeadingAsGeneric(item: ADTHeading): ADTHeadingGeneric {
  if ((item as ADTHeadingGeneric).h !== undefined) {
    return item as ADTHeadingGeneric;
  }
  if ((item as ADTHeadingH2).h2 !== undefined) {
    return {
      h: (item as ADTHeadingH2).h2,
      level: 2,
      s: item.s,
    };
  }
  if ((item as ADTHeadingH3).h3 !== undefined) {
    return {
      h: (item as ADTHeadingH3).h3,
      level: 3,
      s: item.s,
    };
  }
  if ((item as ADTHeadingH4).h4 !== undefined) {
    return {
      h: (item as ADTHeadingH4).h4,
      level: 4,
      s: item.s,
    };
  }
  throw new Error("Bad heading");
}

// ================================================================================
// MEASURED TYPES
// ================================================================================

type MeasuredHeadingInfo = {
  outerRcd: RectCoordsDims;
  paddedRcd: RectCoordsDims;
  pad: Padding;
  text: string;
  level: 2 | 3 | 4;
  style: TextInfoUnkeyed;
  mText: MeasuredText;
  align?: "left" | "right" | "center";
  backgroundColor?: ColorKeyOrString;
  pageStyle: MergedPageStyle;
};

export type MeasuredHeading = Measured<ADTHeading> & {
  measuredInfo: MeasuredHeadingInfo;
};

// ================================================================================
// RENDERER
// ================================================================================

export const HeadingRenderer: ADTItemRenderer<ADTHeading, MeasuredHeading> = {
  isType(item: unknown): item is ADTHeading {
    return (
      typeof item === "object" &&
      item !== null &&
      ((item as ADTHeadingGeneric).h !== undefined ||
        (item as ADTHeadingH2).h2 !== undefined ||
        (item as ADTHeadingH3).h3 !== undefined ||
        (item as ADTHeadingH4).h4 !== undefined)
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTHeading>,
    pageStyle: MergedPageStyle,
  ): MeasuredHeading {
    return measureHeading(rc, bounds, item, pageStyle);
  },

  render(rc: RenderContext, measured: MeasuredHeading): void {
    renderHeading(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTHeading>,
    pageStyle: MergedPageStyle,
  ): void {
    const measured = measureHeading(rc, bounds, item, pageStyle);
    renderHeading(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MeasurableItem<ADTHeading>,
    pageStyle: MergedPageStyle,
  ): number {
    const headingObj = getADTHeadingAsGeneric(item);
    const pad = new Padding(headingObj.s?.padding ?? 0);
    const paddedWidth = width - pad.totalPx();

    // Get text style based on heading level
    // Fallback to paragraph style if specific heading styles don't exist
    const textStyleKey = headingObj.level === 2
      ? "h2"
      : headingObj.level === 3
      ? "h3"
      : "h4";
    const baseTextStyle = (pageStyle.text as any)[textStyleKey] ??
      pageStyle.text.paragraph;
    const textStyle = getAdjustedText(baseTextStyle, headingObj.s);

    const mText = rc.mText(headingObj.h, textStyle, paddedWidth);
    return mText.dims.h() + pad.totalPy();
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureHeading(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: MeasurableItem<ADTHeading>,
  pageStyle: MergedPageStyle,
): MeasuredHeading {
  const headingObj = getADTHeadingAsGeneric(item);
  const pad = new Padding(headingObj.s?.padding ?? 0);
  const paddedRcd = bounds.getPadded(pad);

  // Get text style based on heading level
  // Fallback to paragraph style if specific heading styles don't exist
  const textStyleKey = headingObj.level === 2
    ? "h2"
    : headingObj.level === 3
    ? "h3"
    : "h4";
  const baseTextStyle = (pageStyle.text as any)[textStyleKey] ??
    pageStyle.text.paragraph;
  const textStyle = getAdjustedText(baseTextStyle, headingObj.s);

  const mText = rc.mText(headingObj.h, textStyle, paddedRcd.w());

  const measuredInfo: MeasuredHeadingInfo = {
    outerRcd: bounds,
    paddedRcd,
    pad,
    text: headingObj.h,
    level: headingObj.level,
    style: textStyle,
    mText,
    align: headingObj.s?.align,
    backgroundColor: headingObj.s?.backgroundColor,
    pageStyle,
  };

  return {
    item,
    bounds,
    measuredInfo,
  };
}

function renderHeading(rc: RenderContext, measured: MeasuredHeading): void {
  const { measuredInfo } = measured;

  // Render background if specified
  if (measuredInfo.backgroundColor) {
    rc.rRect(measuredInfo.outerRcd, {
      show: true,
      fillColor: measuredInfo.backgroundColor,
    });
  }

  // Calculate x position based on alignment
  let x = measuredInfo.paddedRcd.x();
  if (measuredInfo.align === "center") {
    x += measuredInfo.paddedRcd.w() / 2;
  } else if (measuredInfo.align === "right") {
    x += measuredInfo.paddedRcd.w();
  }

  // Render heading text
  rc.rText(
    measuredInfo.mText,
    [x, measuredInfo.paddedRcd.y()],
    measuredInfo.align ?? "left",
  );
}

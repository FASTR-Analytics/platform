// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ColorKeyOrString,
  getAdjustedText,
  isStringArray,
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

export type ADTParagraph =
  | ADTParagraphObjectPAsString
  | ADTParagraphObjectPAsArray
  | string
  | string[];

type ADTParagraphObjectPAsString = {
  p: string;
  s?: ADTParagraphStyleOptions;
};

export type ADTParagraphObjectPAsArray = {
  p: string[];
  s?: ADTParagraphStyleOptions;
};

export type ADTParagraphStyleOptions =
  & LayoutStyleOptions
  & TextAdjustmentOptions
  & {
    align?: "left" | "right" | "center";
    vAlign?: "top" | "middle" | "bottom";
  };

export function getADTParagraphAsObjectWithPStringArray(
  item: ADTParagraph,
): ADTParagraphObjectPAsArray {
  let text: string;
  let style: ADTParagraphStyleOptions | undefined;

  if (typeof item === "string") {
    text = item;
  } else if (Array.isArray(item)) {
    text = item.join("\n");
  } else if (typeof item.p === "string") {
    text = item.p;
    style = item.s;
  } else {
    text = item.p.join("\n");
    style = item.s;
  }

  // Split on line breaks and filter empty
  const paragraphs = text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    p: paragraphs,
    s: style,
  };
}

// ================================================================================
// MEASURED TYPES
// ================================================================================

type MeasuredParagraphInfo = {
  outerRcd: RectCoordsDims;
  paddedRcd: RectCoordsDims;
  pad: Padding;
  paragraphs: Array<{
    text: string;
    style: TextInfoUnkeyed;
    mText: MeasuredText;
    y: number;
    extraForTab: number;
  }>;
  totalHeight: number;
  backgroundColor?: ColorKeyOrString;
  align?: "left" | "right" | "center";
  ps: MergedPageStyle;
};

export type MeasuredParagraph = Measured<ADTParagraph> & {
  measuredInfo: MeasuredParagraphInfo;
};

// ================================================================================
// RENDERER
// ================================================================================

export const ParagraphRenderer: ADTItemRenderer<
  ADTParagraph,
  MeasuredParagraph
> = {
  isType(item: unknown): item is ADTParagraph {
    if (typeof item === "string") return true;
    if (isStringArray(item)) return true;
    if (typeof item === "object" && item !== null && "p" in item) {
      const obj = item as { p: unknown };
      return typeof obj.p === "string" || isStringArray(obj.p);
    }
    return false;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTParagraph>,
    pageStyle: MergedPageStyle,
  ): MeasuredParagraph {
    return measureParagraph(rc, bounds, item, pageStyle);
  },

  render(rc: RenderContext, measured: MeasuredParagraph): void {
    renderParagraph(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTParagraph>,
    pageStyle: MergedPageStyle,
  ): void {
    const measured = measureParagraph(rc, bounds, item, pageStyle);
    renderParagraph(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MeasurableItem<ADTParagraph>,
    pageStyle: MergedPageStyle,
  ): number {
    const ps = pageStyle;
    const pObj = getADTParagraphAsObjectWithPStringArray(item);
    const pad = new Padding(pObj.s?.padding ?? 0);
    const paddedWidth = width - pad.totalPx();
    let idealH = pad.totalPy();

    pObj.p.forEach((p, i_p) => {
      const pStyle = getAdjustedText(ps.text.paragraph, pObj.s);

      if (i_p > 0) {
        const actualGap = pStyle.lineBreakGap === "none"
          ? 0
          : pStyle.lineBreakGap * pStyle.lineHeight * pStyle.fontSize;
        idealH += actualGap;
      }

      let goodStr = p;
      if (p.slice(0, 2) === "# ") {
        goodStr = p.slice(2);
        pStyle.font.weight = 700; // Need to think about how to handle this
        pStyle.fontSize *= 1.3;
      }
      let extraForTab = 0;
      if (p.slice(0, 2) === "||") {
        goodStr = p.slice(2);
        extraForTab = ps.content.tabWidth;
      }
      const mText = rc.mText(goodStr, pStyle, paddedWidth - extraForTab);
      idealH += mText.dims.h();
    });

    return idealH;
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureParagraph(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: MeasurableItem<ADTParagraph>,
  pageStyle: MergedPageStyle,
): MeasuredParagraph {
  const ps = pageStyle;
  const pObj = getADTParagraphAsObjectWithPStringArray(item);
  const pad = new Padding(pObj.s?.padding ?? 0);
  const paddedRcd = bounds.getPadded(pad);
  const paddedWidth = paddedRcd.w();

  let currentY = paddedRcd.y();
  const paragraphs: MeasuredParagraphInfo["paragraphs"] = [];

  pObj.p.forEach((p, i_p) => {
    const pStyle = getAdjustedText(ps.text.paragraph, pObj.s);

    if (i_p > 0) {
      const actualGap = pStyle.lineBreakGap === "none"
        ? 0
        : pStyle.lineBreakGap * pStyle.lineHeight * pStyle.fontSize;
      currentY += actualGap;
    }

    let goodStr = p;
    const style = { ...pStyle };

    if (p.slice(0, 2) === "# ") {
      goodStr = p.slice(2);
      style.font.weight = 700;
      style.fontSize *= 1.3;
    }

    let extraForTab = 0;
    if (p.slice(0, 2) === "||") {
      goodStr = p.slice(2);
      extraForTab = ps.content.tabWidth;
    }

    const mText = rc.mText(goodStr, style, paddedWidth - extraForTab);

    paragraphs.push({
      text: goodStr,
      style,
      mText,
      y: currentY,
      extraForTab,
    });

    currentY += mText.dims.h();
  });

  const measuredInfo: MeasuredParagraphInfo = {
    outerRcd: bounds,
    paddedRcd,
    pad,
    paragraphs,
    totalHeight: currentY - paddedRcd.y() + pad.totalPy(),
    backgroundColor: pObj.s?.backgroundColor,
    align: pObj.s?.align,
    ps,
  };

  return {
    item: item,
    bounds,
    measuredInfo,
  };
}

function renderParagraph(rc: RenderContext, measured: MeasuredParagraph): void {
  const { measuredInfo } = measured;

  // Render background if specified
  if (measuredInfo.backgroundColor) {
    rc.rRect(measuredInfo.outerRcd, {
      show: true,
      fillColor: measuredInfo.backgroundColor,
    });
  }

  // Render each paragraph
  measuredInfo.paragraphs.forEach((para) => {
    const finalW = measuredInfo.paddedRcd.w() - para.extraForTab;
    const x = measuredInfo.paddedRcd.x() +
      para.extraForTab +
      (measuredInfo.align === "center" ? finalW / 2 : 0);

    rc.rText(para.mText, [x, para.y], measuredInfo.align ?? "left");
  });
}

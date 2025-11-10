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

export type ADTQuote = ADTQuoteAsString | ADTQuoteAsArray;

type ADTQuoteAsString = {
  quote: string;
  attribution?: string;
  s?: ADTQuoteStyleOptions;
};

type ADTQuoteAsArray = {
  quote: string[];
  attribution?: string;
  s?: ADTQuoteStyleOptions;
};

export type ADTQuoteStyleOptions =
  & LayoutStyleOptions
  & TextAdjustmentOptions
  & {
    align?: "left" | "right" | "center";
    /**
     * Gap between quote lines as a multiplier of line height.
     * Formula: actualGap = quoteGap * lineHeight * fontSize
     * Default: 1.0 (one full line of space)
     */
    quoteGap?: number;
    /**
     * Gap before attribution as a multiplier of line height.
     * Default: 0.5 (half line of space)
     */
    attributionGap?: number;
  };

export function getADTQuoteAsArray(item: ADTQuote): ADTQuoteAsArray {
  if (typeof item.quote === "string") {
    return {
      quote: [item.quote],
      attribution: item.attribution,
      s: item.s,
    };
  }
  return item as ADTQuoteAsArray;
}

// ================================================================================
// MEASURED TYPES
// ================================================================================

type MeasuredQuoteInfo = {
  outerRcd: RectCoordsDims;
  paddedRcd: RectCoordsDims;
  pad: Padding;
  quoteLines: Array<{
    text: string;
    style: TextInfoUnkeyed;
    mText: MeasuredText;
    y: number;
  }>;
  attribution?: {
    text: string;
    style: TextInfoUnkeyed;
    mText: MeasuredText;
    y: number;
  };
  totalHeight: number;
  align?: "left" | "right" | "center";
  backgroundColor?: ColorKeyOrString;
  pageStyle: MergedPageStyle;
};

export type MeasuredQuote = Measured<ADTQuote> & {
  measuredInfo: MeasuredQuoteInfo;
};

// ================================================================================
// RENDERER
// ================================================================================

export const QuoteRenderer: ADTItemRenderer<ADTQuote, MeasuredQuote> = {
  isType(item: unknown): item is ADTQuote {
    return typeof item === "object" && item !== null && "quote" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTQuote>,
    pageStyle: MergedPageStyle,
  ): MeasuredQuote {
    return measureQuote(rc, bounds, item, pageStyle);
  },

  render(rc: RenderContext, measured: MeasuredQuote): void {
    renderQuote(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTQuote>,
    pageStyle: MergedPageStyle,
  ): void {
    const measured = measureQuote(rc, bounds, item, pageStyle);
    renderQuote(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MeasurableItem<ADTQuote>,
    pageStyle: MergedPageStyle,
  ): number {
    const quoteObj = getADTQuoteAsArray(item);
    const pad = new Padding(quoteObj.s?.padding ?? 0);
    const paddedWidth = width - pad.totalPx();
    let idealH = pad.totalPy();

    // Get text styles
    // Fallback to paragraph style if quote styles don't exist
    const quoteStyle = getAdjustedText(
      (pageStyle.text as any).quote ?? pageStyle.text.paragraph,
      quoteObj.s,
    );
    const attributionStyle = getAdjustedText(
      (pageStyle.text as any).quoteAttribution ?? pageStyle.text.paragraph,
      quoteObj.s,
    );

    // Measure quote lines
    quoteObj.quote.forEach((line, i) => {
      if (i > 0) {
        const quoteGap = quoteObj.s?.quoteGap ??
          (pageStyle.content as any).quoteGap ?? 1.0;
        const actualGap = quoteGap * quoteStyle.lineHeight *
          quoteStyle.fontSize;
        idealH += actualGap;
      }
      const mText = rc.mText(line, quoteStyle, paddedWidth);
      idealH += mText.dims.h();
    });

    // Measure attribution if present
    if (quoteObj.attribution) {
      const attributionGap = quoteObj.s?.attributionGap ??
        (pageStyle.content as any).quoteAttributionGap ??
        0.5;
      const actualGap = attributionGap * quoteStyle.lineHeight *
        quoteStyle.fontSize;
      idealH += actualGap;

      const mAttribution = rc.mText(
        `— ${quoteObj.attribution}`,
        attributionStyle,
        paddedWidth,
      );
      idealH += mAttribution.dims.h();
    }

    return idealH;
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureQuote(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: MeasurableItem<ADTQuote>,
  pageStyle: MergedPageStyle,
): MeasuredQuote {
  const quoteObj = getADTQuoteAsArray(item);
  const pad = new Padding(quoteObj.s?.padding ?? 0);
  const paddedRcd = bounds.getPadded(pad);
  const paddedWidth = paddedRcd.w();

  // Get text styles
  // Fallback to paragraph style if quote styles don't exist
  const quoteStyle = getAdjustedText(
    (pageStyle.text as any).quote ?? pageStyle.text.paragraph,
    quoteObj.s,
  );
  const attributionStyle = getAdjustedText(
    (pageStyle.text as any).quoteAttribution ?? pageStyle.text.paragraph,
    quoteObj.s,
  );

  let currentY = paddedRcd.y();
  const quoteLines: MeasuredQuoteInfo["quoteLines"] = [];

  // Measure quote lines
  quoteObj.quote.forEach((line, i) => {
    if (i > 0) {
      const quoteGap = quoteObj.s?.quoteGap ??
        (pageStyle.content as any).quoteGap ?? 1.0;
      const actualGap = quoteGap * quoteStyle.lineHeight * quoteStyle.fontSize;
      currentY += actualGap;
    }

    const mText = rc.mText(line, quoteStyle, paddedWidth);
    quoteLines.push({
      text: line,
      style: quoteStyle,
      mText,
      y: currentY,
    });
    currentY += mText.dims.h();
  });

  // Measure attribution if present
  let attribution: MeasuredQuoteInfo["attribution"];
  if (quoteObj.attribution) {
    const attributionGap = quoteObj.s?.attributionGap ??
      (pageStyle.content as any).quoteAttributionGap ??
      0.5;
    const actualGap = attributionGap * quoteStyle.lineHeight *
      quoteStyle.fontSize;
    currentY += actualGap;

    const attributionText = `— ${quoteObj.attribution}`;
    const mAttribution = rc.mText(
      attributionText,
      attributionStyle,
      paddedWidth,
    );
    attribution = {
      text: attributionText,
      style: attributionStyle,
      mText: mAttribution,
      y: currentY,
    };
    currentY += mAttribution.dims.h();
  }

  const measuredInfo: MeasuredQuoteInfo = {
    outerRcd: bounds,
    paddedRcd,
    pad,
    quoteLines,
    attribution,
    totalHeight: currentY - paddedRcd.y() + pad.totalPy(),
    align: quoteObj.s?.align,
    backgroundColor: quoteObj.s?.backgroundColor,
    pageStyle,
  };

  return {
    item,
    bounds,
    measuredInfo,
  };
}

function renderQuote(rc: RenderContext, measured: MeasuredQuote): void {
  const { measuredInfo } = measured;

  // Render background if specified
  if (measuredInfo.backgroundColor) {
    rc.rRect(measuredInfo.outerRcd, {
      show: true,
      fillColor: measuredInfo.backgroundColor,
    });
  }

  // Render quote lines
  measuredInfo.quoteLines.forEach((line) => {
    let x = measuredInfo.paddedRcd.x();
    if (measuredInfo.align === "center") {
      x += measuredInfo.paddedRcd.w() / 2;
    } else if (measuredInfo.align === "right") {
      x += measuredInfo.paddedRcd.w();
    }

    rc.rText(line.mText, [x, line.y], measuredInfo.align ?? "left");
  });

  // Render attribution if present
  if (measuredInfo.attribution) {
    let x = measuredInfo.paddedRcd.x();
    if (measuredInfo.align === "center") {
      x += measuredInfo.paddedRcd.w() / 2;
    } else if (measuredInfo.align === "right") {
      x += measuredInfo.paddedRcd.w();
    }

    rc.rText(
      measuredInfo.attribution.mText,
      [x, measuredInfo.attribution.y],
      measuredInfo.align ?? "left",
    );
  }
}

// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  measureLogos,
  type MergedFreeformStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";

export type HeaderFooterInputs = {
  header?: string;
  subHeader?: string;
  date?: string;
  footer?: string;
  headerLogos?: { width: number; height: number }[];
  footerLogos?: { width: number; height: number }[];
};

export type MeasuredHeaderFooterHeights = {
  headerHeight: number;
  footerHeight: number;
};

export function measureHeaderFooterHeights(
  rc: RenderContext,
  pageWidth: number,
  inputs: HeaderFooterInputs,
  style: MergedFreeformStyle,
): MeasuredHeaderFooterHeights {
  return {
    headerHeight: measureHeaderHeight(rc, pageWidth, inputs, style),
    footerHeight: measureFooterHeight(rc, pageWidth, inputs, style),
  };
}

function measureHeaderHeight(
  rc: RenderContext,
  pageWidth: number,
  inputs: HeaderFooterInputs,
  s: MergedFreeformStyle,
): number {
  const hasText =
    inputs.header?.trim() || inputs.subHeader?.trim() || inputs.date?.trim();
  const hasLogos = inputs.headerLogos && inputs.headerLogos.length > 0;

  if (!hasText && !hasLogos) {
    return 0;
  }

  const headerPadding = new Padding(s.header.padding);
  let maxHeaderTextWidth = pageWidth - headerPadding.totalPx();

  const logosDims = hasLogos
    ? measureLogos(new RectCoordsDims([0, 0, 10000, 10000]), {
        images: inputs.headerLogos!,
        style: s.header.logosSizing,
        alignH: "left",
        alignV: "top",
      })
    : undefined;
  const logosWidth = logosDims?.totalWidth ?? 0;
  const logosHeight = logosDims?.totalHeight ?? 0;

  // Logos (always right) reduce available text width
  if (hasLogos) {
    maxHeaderTextWidth -= logosWidth + s.header.logosSizing.gapX;
  }

  let totalInnerHeight = 0;
  let lastExtraToChop = 0;

  if (inputs.header?.trim()) {
    const mHeader = rc.mText(
      inputs.header.trim(),
      s.text.header,
      maxHeaderTextWidth,
    );
    totalInnerHeight += mHeader.dims.h() + s.header.headerBottomPadding;
    lastExtraToChop = s.header.headerBottomPadding;
  }

  if (inputs.subHeader?.trim()) {
    const mSubHeader = rc.mText(
      inputs.subHeader.trim(),
      s.text.subHeader,
      maxHeaderTextWidth,
    );
    totalInnerHeight += mSubHeader.dims.h() + s.header.subHeaderBottomPadding;
    lastExtraToChop = s.header.subHeaderBottomPadding;
  }

  if (inputs.date?.trim()) {
    const mDate = rc.mText(inputs.date.trim(), s.text.date, maxHeaderTextWidth);
    totalInnerHeight += mDate.dims.h();
  } else {
    totalInnerHeight -= lastExtraToChop;
  }

  // Logos may expand height if taller than text
  if (hasLogos) {
    totalInnerHeight = Math.max(totalInnerHeight, logosHeight);
  }

  return (
    totalInnerHeight +
    headerPadding.totalPy() +
    s.header.bottomBorderStrokeWidth
  );
}

function measureFooterHeight(
  rc: RenderContext,
  pageWidth: number,
  inputs: HeaderFooterInputs,
  s: MergedFreeformStyle,
): number {
  const hasText = !!inputs.footer?.trim();
  const hasLogos = inputs.footerLogos && inputs.footerLogos.length > 0;

  if (!hasText && !hasLogos) {
    return 0;
  }

  const footerPadding = new Padding(s.footer.padding);
  let totalInnerHeight = 0;

  if (inputs.footer?.trim()) {
    const mFooter = rc.mText(
      inputs.footer.trim(),
      s.text.footer,
      pageWidth - footerPadding.totalPx(),
    );
    totalInnerHeight = mFooter.dims.h();
  }

  if (hasLogos) {
    const logosDims = measureLogos(new RectCoordsDims([0, 0, 10000, 10000]), {
      images: inputs.footerLogos!,
      style: s.footer.logosSizing,
      alignH: "right",
      alignV: "middle",
    });
    totalInnerHeight = Math.max(totalInnerHeight, logosDims.totalHeight);
  }

  return totalInnerHeight + footerPadding.totalPy();
}

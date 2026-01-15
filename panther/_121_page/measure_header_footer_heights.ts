// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type MergedPageStyle, Padding, type RenderContext } from "./deps.ts";

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
  style: MergedPageStyle,
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
  s: MergedPageStyle,
): number {
  const hasText = inputs.header || inputs.subHeader || inputs.date;
  const hasLogos = inputs.headerLogos && inputs.headerLogos.length > 0;

  if (!hasText && !hasLogos) {
    return 0;
  }

  const headerPadding = new Padding(s.header.padding);
  let maxHeaderTextWidth = pageWidth - headerPadding.totalPx();

  // Right-placed logos reduce available text width
  if (s.header.logoPlacement === "right" && hasLogos) {
    let logoWidth = 0;
    for (const logo of inputs.headerLogos!) {
      logoWidth += (s.header.logoHeight * logo.width) / logo.height;
      logoWidth += s.header.logoGapX;
    }
    if (logoWidth > 0) {
      maxHeaderTextWidth -= logoWidth + s.header.logoGapX;
    }
  }

  let totalInnerHeight = 0;
  let lastExtraToChop = 0;

  // Left-placed logos add to height
  if (s.header.logoPlacement === "left" && hasLogos) {
    totalInnerHeight += s.header.logoHeight + s.header.logoBottomPadding;
    lastExtraToChop = s.header.logoBottomPadding;
  }

  if (inputs.header) {
    const mHeader = rc.mText(
      inputs.header,
      s.text.header,
      maxHeaderTextWidth,
    );
    totalInnerHeight += mHeader.dims.h() + s.header.headerBottomPadding;
    lastExtraToChop = s.header.headerBottomPadding;
  }

  if (inputs.subHeader) {
    const mSubHeader = rc.mText(
      inputs.subHeader,
      s.text.subHeader,
      maxHeaderTextWidth,
    );
    totalInnerHeight += mSubHeader.dims.h() + s.header.subHeaderBottomPadding;
    lastExtraToChop = s.header.subHeaderBottomPadding;
  }

  if (inputs.date) {
    const mDate = rc.mText(
      inputs.date,
      s.text.date,
      maxHeaderTextWidth,
    );
    totalInnerHeight += mDate.dims.h();
  } else {
    totalInnerHeight -= lastExtraToChop;
  }

  // Right-placed logos may expand height if taller than text
  if (s.header.logoPlacement === "right" && hasLogos) {
    totalInnerHeight = Math.max(totalInnerHeight, s.header.logoHeight);
  }

  return totalInnerHeight + headerPadding.totalPy() +
    s.header.bottomBorderStrokeWidth;
}

function measureFooterHeight(
  rc: RenderContext,
  pageWidth: number,
  inputs: HeaderFooterInputs,
  s: MergedPageStyle,
): number {
  const hasText = !!inputs.footer;
  const hasLogos = inputs.footerLogos && inputs.footerLogos.length > 0;

  if (!hasText && !hasLogos) {
    return 0;
  }

  const footerPadding = new Padding(s.footer.padding);
  let totalInnerHeight = 0;

  if (inputs.footer) {
    const mFooter = rc.mText(
      inputs.footer,
      s.text.footer,
      pageWidth - footerPadding.totalPx(),
    );
    totalInnerHeight = mFooter.dims.h();
  }

  if (hasLogos) {
    totalInnerHeight = Math.max(totalInnerHeight, s.footer.logoHeight);
  }

  return totalInnerHeight + footerPadding.totalPy();
}

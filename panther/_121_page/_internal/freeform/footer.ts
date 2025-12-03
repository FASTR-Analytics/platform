// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  getColor,
  type MeasuredText,
  type MergedPageStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
  sum,
} from "../../deps.ts";
import type { FreeformPageInputs } from "../../types.ts";

export interface MeasuredFooter {
  mFooter?: MeasuredText;
  rcdFooterOuter: RectCoordsDims;
}

export function measureFooter(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): MeasuredFooter | undefined {
  if (
    !inputs.footer?.trim() &&
    (!inputs.footerLogos || inputs.footerLogos.length === 0)
  ) {
    return undefined;
  }

  const padFooter = new Padding(s.footer.padding);
  let mFooter: MeasuredText | undefined;
  let totalInnerFooterHeight = 0;

  if (inputs.footer?.trim()) {
    mFooter = rc.mText(
      inputs.footer.trim(),
      s.text.footer,
      rcdOuter.w() - padFooter.totalPx(),
    );
    totalInnerFooterHeight = mFooter.dims.h();
  }

  if (inputs.footerLogos && inputs.footerLogos.length > 0) {
    totalInnerFooterHeight = Math.max(
      totalInnerFooterHeight,
      s.footer.logoHeight,
    );
  }

  const rcdFooterOuter = new RectCoordsDims([
    rcdOuter.x(),
    rcdOuter.bottomY() - (totalInnerFooterHeight + padFooter.totalPy()),
    rcdOuter.w(),
    totalInnerFooterHeight + padFooter.totalPy(),
  ]);

  return {
    mFooter,
    rcdFooterOuter,
  };
}

export function renderFooter(
  rc: RenderContext,
  measured: MeasuredFooter,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): void {
  const padFooter = new Padding(s.footer.padding);

  if (s.footer.backgroundColor !== "none") {
    rc.rRect(measured.rcdFooterOuter, {
      fillColor: getColor(s.footer.backgroundColor),
    });
  }

  const paddedRcd = measured.rcdFooterOuter.getPadded(padFooter);
  if (measured.mFooter) {
    rc.rText(measured.mFooter, paddedRcd.topLeftCoords(), "left");
  }

  if (inputs.footerLogos && inputs.footerLogos.length > 0) {
    const logosWidth = sum(
      inputs.footerLogos.map(
        (logo) => (s.footer.logoHeight * logo.width) / logo.height,
      ),
    ) +
      s.footer.logoGapX * (inputs.footerLogos.length - 1);

    let currentX = paddedRcd.rightX() - logosWidth;

    for (const logo of inputs.footerLogos) {
      const logoWidth = (s.footer.logoHeight * logo.width) / logo.height;
      rc.rImage(
        logo,
        currentX,
        paddedRcd.y() + (paddedRcd.h() - s.footer.logoHeight) / 2,
        logoWidth,
        s.footer.logoHeight,
      );
      currentX += logoWidth + s.footer.logoGapX;
    }
  }

  if (inputs.watermark) {
    const mText = rc.mText(
      inputs.watermark,
      s.text.watermark,
      measured.rcdFooterOuter.w(),
    );
    rc.rText(mText, measured.rcdFooterOuter.centerCoords(), "center", "center");
  }
}

// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MeasuredText,
  type MergedPageStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
  sum,
} from "../../deps.ts";
import { RectCoordsDims as RCD } from "../../deps.ts";
import type { FreeformPageInputs, PagePrimitive } from "../../types.ts";

export interface MeasuredFooter {
  mFooter?: MeasuredText;
  rcdFooterOuter: RectCoordsDims;
  maxWidthForFooterText: number;
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
  const maxWidthForFooterText = rcdOuter.w() - padFooter.totalPx();

  if (inputs.footer?.trim()) {
    mFooter = rc.mText(
      inputs.footer.trim(),
      s.text.footer,
      maxWidthForFooterText,
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
    maxWidthForFooterText,
  };
}

export function buildFooterPrimitives(
  measured: MeasuredFooter,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];
  const padFooter = new Padding(s.footer.padding);

  // Background
  if (s.footer.backgroundColor !== "none") {
    primitives.push({
      type: "background",
      id: "footerBackground",
      rcd: measured.rcdFooterOuter,
      fillColor: s.footer.backgroundColor,
    });
  }

  const paddedRcd = measured.rcdFooterOuter.getPadded(padFooter);

  // Footer text
  if (measured.mFooter) {
    primitives.push({
      type: "text",
      id: "footerText",
      mText: measured.mFooter,
      x: paddedRcd.x(),
      y: paddedRcd.y(),
      hAlign: "left",
      vAlign: "top",
      maxWidth: measured.maxWidthForFooterText,
    });
  }

  // Footer logos (right-aligned, vertically centered)
  if (inputs.footerLogos && inputs.footerLogos.length > 0) {
    const logosWidth = sum(
      inputs.footerLogos.map(
        (logo) => (s.footer.logoHeight * logo.width) / logo.height,
      ),
    ) +
      s.footer.logoGapX * (inputs.footerLogos.length - 1);

    let currentX = paddedRcd.rightX() - logosWidth;
    const logoY = paddedRcd.y() + (paddedRcd.h() - s.footer.logoHeight) / 2;

    for (let i = 0; i < inputs.footerLogos.length; i++) {
      const logo = inputs.footerLogos[i];
      const logoWidth = (s.footer.logoHeight * logo.width) / logo.height;
      primitives.push({
        type: "image",
        id: `footerLogo${i}`,
        image: logo,
        rcd: new RCD([currentX, logoY, logoWidth, s.footer.logoHeight]),
      });
      currentX += logoWidth + s.footer.logoGapX;
    }
  }

  return primitives;
}

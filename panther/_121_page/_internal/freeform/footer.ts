// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  measureLogos,
  type MeasuredText,
  type MergedFreeformStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
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
  s: MergedFreeformStyle,
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
  let maxWidthForFooterText = rcdOuter.w() - padFooter.totalPx();

  // Measure logos if present
  const hasLogos = inputs.footerLogos && inputs.footerLogos.length > 0;
  const logosDims = hasLogos
    ? measureLogos(new RCD([0, 0, 10000, 10000]), {
        images: inputs.footerLogos!,
        style: s.footer.logosSizing,
        alignH: "right",
        alignV: "middle",
      })
    : undefined;
  const logosHeight = logosDims?.totalHeight ?? 0;
  const logosWidth = logosDims?.totalWidth ?? 0;

  // Reduce maxWidth if footer logos are present (they're right-aligned)
  if (hasLogos) {
    maxWidthForFooterText -= logosWidth + s.footer.logosSizing.gapX;
  }

  if (inputs.footer?.trim()) {
    mFooter = rc.mText(
      inputs.footer.trim(),
      s.text.footer,
      maxWidthForFooterText,
    );
    totalInnerFooterHeight = mFooter.dims.h();
  }

  if (hasLogos) {
    totalInnerFooterHeight = Math.max(totalInnerFooterHeight, logosHeight);
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
  s: MergedFreeformStyle,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];
  const padFooter = new Padding(s.footer.padding);

  // Background
  if (s.footer.background !== "none") {
    primitives.push({
      type: "background",
      id: "footerBackground",
      rcd: measured.rcdFooterOuter,
      background: s.footer.background,
    });
  }

  const paddedRcd = measured.rcdFooterOuter.getPadded(padFooter);

  // Footer text
  if (measured.mFooter) {
    const x =
      s.footer.alignH === "center"
        ? paddedRcd.x() + measured.maxWidthForFooterText / 2
        : s.footer.alignH === "right"
          ? paddedRcd.x() + measured.maxWidthForFooterText
          : paddedRcd.x();
    primitives.push({
      type: "text",
      id: "footerText",
      mText: measured.mFooter,
      x,
      y: paddedRcd.centerY(),
      alignH: s.footer.alignH,
      alignV: "middle",
      maxWidth: measured.maxWidthForFooterText,
    });
  }

  // Footer logos (right-aligned, vertically centered)
  if (inputs.footerLogos && inputs.footerLogos.length > 0) {
    const mLogos = measureLogos(paddedRcd, {
      images: inputs.footerLogos,
      style: s.footer.logosSizing,
      alignH: "right",
      alignV: "middle",
    });

    for (let i = 0; i < mLogos.items.length; i++) {
      const logo = mLogos.items[i];
      primitives.push({
        type: "image",
        id: `footerLogo${i}`,
        image: logo.image,
        rcd: new RCD([logo.x, logo.y, logo.width, logo.height]),
      });
    }
  }

  return primitives;
}

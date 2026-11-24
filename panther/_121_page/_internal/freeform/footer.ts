// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MeasuredText,
  measureLogos,
  type MergedFreeformStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "../../deps.ts";
import { RectCoordsDims as RCD } from "../../deps.ts";
import { allotLogoRow } from "./logo_row.ts";
import type {
  FreeformPageInputs,
  HeaderFooterInputs,
  PageOverflowCause,
  PagePrimitive,
} from "../../types.ts";

export type MeasuredFooter = {
  mFooter?: MeasuredText;
  rcdFooterOuter: RectCoordsDims;
  maxWidthForFooterText: number;
  logosMaxWidth: number;
  overflowCauses: PageOverflowCause[];
};

export function measureFooter(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: HeaderFooterInputs,
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

  const logos = inputs.footerLogos ?? [];
  const hasLogos = logos.length > 0;
  const row = allotLogoRow(
    rc,
    "footer",
    rcdOuter.w() - padFooter.totalPx(),
    [{ id: "footerText", text: inputs.footer, textInfo: s.text.footer }],
    hasLogos
      ? { id: "footerLogos", images: logos, sizing: s.footer.logosSizing }
      : undefined,
  );
  const maxWidthForFooterText = row.textMaxWidth;
  const logosHeight = row.logosHeight;

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
    logosMaxWidth: row.logosMaxWidth,
    overflowCauses: row.overflowCauses,
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
    const x = s.footer.alignH === "center"
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
      rowMaxWidth: measured.logosMaxWidth,
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

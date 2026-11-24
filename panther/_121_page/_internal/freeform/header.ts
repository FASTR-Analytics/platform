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

export type MeasuredHeader = {
  mHeader?: MeasuredText;
  mSubHeader?: MeasuredText;
  mDate?: MeasuredText;
  rcdHeaderOuter: RectCoordsDims;
  yOffsetHeader: number;
  yOffsetRightPlacementLogos: number;
  maxWidthForHeaderText: number;
  logosMaxWidth: number;
  overflowCauses: PageOverflowCause[];
};

export function measureHeader(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: HeaderFooterInputs,
  s: MergedFreeformStyle,
): MeasuredHeader | undefined {
  if (
    !inputs.header?.trim() &&
    !inputs.subHeader?.trim() &&
    !inputs.date?.trim() &&
    (!inputs.headerLogos || inputs.headerLogos.length === 0)
  ) {
    return undefined;
  }

  const padHeader = new Padding(s.header.padding);
  let mHeader: MeasuredText | undefined;
  let mSubHeader: MeasuredText | undefined;
  let mDate: MeasuredText | undefined;
  let totalInnerHeaderHeight = 0;
  let lastExtraToChop = 0;
  let yOffsetHeader = 0;
  const yOffsetRightPlacementLogos = 0;

  const logos = inputs.headerLogos ?? [];
  const hasLogos = logos.length > 0;
  const row = allotLogoRow(
    rc,
    "header",
    rcdOuter.w() - padHeader.totalPx(),
    [
      { id: "headerText", text: inputs.header, textInfo: s.text.header },
      {
        id: "subHeaderText",
        text: inputs.subHeader,
        textInfo: s.text.subHeader,
      },
      { id: "dateText", text: inputs.date, textInfo: s.text.date },
    ],
    hasLogos
      ? { id: "headerLogos", images: logos, sizing: s.header.logosSizing }
      : undefined,
  );
  const maxWidthForHeaderText = row.textMaxWidth;
  const logosHeight = row.logosHeight;

  if (inputs.header?.trim()) {
    mHeader = rc.mText(
      inputs.header.trim(),
      s.text.header,
      maxWidthForHeaderText,
    );
    totalInnerHeaderHeight += mHeader.dims.h() + s.header.headerBottomPadding;
    lastExtraToChop = s.header.headerBottomPadding;
  }

  if (inputs.subHeader?.trim()) {
    mSubHeader = rc.mText(
      inputs.subHeader.trim(),
      s.text.subHeader,
      maxWidthForHeaderText,
    );
    totalInnerHeaderHeight += mSubHeader.dims.h() +
      s.header.subHeaderBottomPadding;
    lastExtraToChop = s.header.subHeaderBottomPadding;
  }

  if (inputs.date?.trim()) {
    mDate = rc.mText(inputs.date.trim(), s.text.date, maxWidthForHeaderText);
    totalInnerHeaderHeight += mDate.dims.h();
  } else {
    totalInnerHeaderHeight -= lastExtraToChop;
  }

  if (hasLogos) {
    yOffsetHeader = Math.max(0, (logosHeight - totalInnerHeaderHeight) / 2);
    // Logos are top-aligned (yOffsetRightPlacementLogos stays 0).
    totalInnerHeaderHeight = Math.max(totalInnerHeaderHeight, logosHeight);
  }

  const totalHeaderHeight = totalInnerHeaderHeight +
    padHeader.totalPy() +
    s.header.bottomBorderStrokeWidth;

  const rcdHeaderOuter = new RectCoordsDims([
    rcdOuter.x(),
    rcdOuter.y(),
    rcdOuter.w(),
    totalHeaderHeight,
  ]);

  return {
    mHeader,
    mSubHeader,
    mDate,
    rcdHeaderOuter,
    yOffsetHeader,
    yOffsetRightPlacementLogos,
    maxWidthForHeaderText,
    logosMaxWidth: row.logosMaxWidth,
    overflowCauses: row.overflowCauses,
  };
}

export function buildHeaderPrimitives(
  measured: MeasuredHeader,
  inputs: FreeformPageInputs,
  s: MergedFreeformStyle,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];
  const padHeader = new Padding(s.header.padding);

  // Background
  if (s.header.background !== "none") {
    primitives.push({
      type: "background",
      id: "headerBackground",
      rcd: measured.rcdHeaderOuter,
      background: s.header.background,
    });
  }

  // Overlay (complex sizing logic from renderHeader)
  if (inputs.overlay) {
    const overlayFinalWidth = measured.rcdHeaderOuter.w();
    const overlayFinalHeight = overlayFinalWidth *
      (inputs.overlay.height / inputs.overlay.width);

    if (overlayFinalHeight > measured.rcdHeaderOuter.h()) {
      const overlayFinalYOffset = overlayFinalHeight -
        measured.rcdHeaderOuter.h();
      primitives.push({
        type: "image",
        id: "headerOverlay",
        image: inputs.overlay,
        rcd: new RCD([
          measured.rcdHeaderOuter.x(),
          measured.rcdHeaderOuter.y() - overlayFinalYOffset,
          overlayFinalWidth,
          overlayFinalHeight,
        ]),
      });
    } else {
      const overlayFinalHeight = measured.rcdHeaderOuter.h();
      const overlayFinalWidth = overlayFinalHeight *
        (inputs.overlay.width / inputs.overlay.height);
      const overlayFinalXOffset =
        (overlayFinalWidth - measured.rcdHeaderOuter.w()) / 2;
      primitives.push({
        type: "image",
        id: "headerOverlay",
        image: inputs.overlay,
        rcd: new RCD([
          measured.rcdHeaderOuter.x() - overlayFinalXOffset,
          measured.rcdHeaderOuter.y(),
          overlayFinalWidth,
          overlayFinalHeight,
        ]),
      });
    }
  }

  const paddedRcd = measured.rcdHeaderOuter.getPadded(padHeader);
  const x = s.header.alignH === "center"
    ? paddedRcd.x() + measured.maxWidthForHeaderText / 2
    : s.header.alignH === "right"
    ? paddedRcd.x() + measured.maxWidthForHeaderText
    : paddedRcd.x();
  let currentY = paddedRcd.y() + measured.yOffsetHeader;

  // Header text
  if (measured.mHeader) {
    primitives.push({
      type: "text",
      id: "headerText",
      mText: measured.mHeader,
      x,
      y: currentY,
      alignH: s.header.alignH,
      alignV: "top",
      maxWidth: measured.maxWidthForHeaderText,
    });
    currentY += measured.mHeader.dims.h() + s.header.headerBottomPadding;
  }

  // Subheader text
  if (measured.mSubHeader) {
    primitives.push({
      type: "text",
      id: "subHeaderText",
      mText: measured.mSubHeader,
      x,
      y: currentY,
      alignH: s.header.alignH,
      alignV: "top",
      maxWidth: measured.maxWidthForHeaderText,
    });
    currentY += measured.mSubHeader.dims.h() + s.header.subHeaderBottomPadding;
  }

  // Date text
  if (measured.mDate) {
    primitives.push({
      type: "text",
      id: "dateText",
      mText: measured.mDate,
      x,
      y: currentY,
      alignH: s.header.alignH,
      alignV: "top",
      maxWidth: measured.maxWidthForHeaderText,
    });
  }

  // Logos (always right-aligned)
  if (inputs.headerLogos && inputs.headerLogos.length > 0) {
    const logoBounds = new RCD([
      paddedRcd.x(),
      paddedRcd.y() + measured.yOffsetRightPlacementLogos,
      paddedRcd.w(),
      10000,
    ]);
    const mLogos = measureLogos(logoBounds, {
      images: inputs.headerLogos,
      style: s.header.logosSizing,
      alignH: "right",
      alignV: "top",
      rowMaxWidth: measured.logosMaxWidth,
    });

    for (let i = 0; i < mLogos.items.length; i++) {
      const logo = mLogos.items[i];
      primitives.push({
        type: "image",
        id: `headerLogo${i}`,
        image: logo.image,
        rcd: new RCD([logo.x, logo.y, logo.width, logo.height]),
      });
    }
  }

  // Bottom border
  if (s.header.bottomBorderStrokeWidth > 0) {
    primitives.push({
      type: "line",
      id: "headerBorder",
      points: [
        [
          measured.rcdHeaderOuter.x(),
          measured.rcdHeaderOuter.bottomY() -
          s.header.bottomBorderStrokeWidth / 2,
        ],
        [
          measured.rcdHeaderOuter.rightX(),
          measured.rcdHeaderOuter.bottomY() -
          s.header.bottomBorderStrokeWidth / 2,
        ],
      ],
      style: {
        strokeWidth: s.header.bottomBorderStrokeWidth,
        strokeColor: s.header.bottomBorderColor,
        lineDash: "solid",
      },
    });
  }

  return primitives;
}

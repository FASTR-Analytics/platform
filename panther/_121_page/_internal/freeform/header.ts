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
} from "../../deps.ts";
import { RectCoordsDims as RCD } from "../../deps.ts";
import type { FreeformPageInputs, PagePrimitive } from "../../types.ts";

export interface MeasuredHeader {
  mHeader?: MeasuredText;
  mSubHeader?: MeasuredText;
  mDate?: MeasuredText;
  rcdHeaderOuter: RectCoordsDims;
  yOffsetHeader: number;
  yOffsetRightPlacementLogos: number;
  maxWidthForHeaderText: number;
}

export function measureHeader(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
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
  let yOffsetRightPlacementLogos = 0;

  if (
    s.header.logoPlacement === "left" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    totalInnerHeaderHeight += s.header.logoHeight + s.header.logoBottomPadding;
    lastExtraToChop = s.header.logoBottomPadding;
  }

  let maxWidthForHeaderText = rcdOuter.w() - padHeader.totalPx();

  if (
    s.header.logoPlacement === "right" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let logoWidth = 0;
    for (const logo of inputs.headerLogos) {
      logoWidth += (s.header.logoHeight * logo.width) / logo.height;
      logoWidth += s.header.logoGapX;
    }
    if (logoWidth > 0) {
      maxWidthForHeaderText -= logoWidth + s.header.logoGapX;
    }
  }

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

  if (
    s.header.logoPlacement === "right" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    yOffsetHeader = Math.max(
      0,
      (s.header.logoHeight - totalInnerHeaderHeight) / 2,
    );
    yOffsetRightPlacementLogos = Math.max(
      0,
      (totalInnerHeaderHeight - s.header.logoHeight) / 2,
    );
    totalInnerHeaderHeight = Math.max(
      totalInnerHeaderHeight,
      s.header.logoHeight,
    );
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
  };
}

export function buildHeaderPrimitives(
  measured: MeasuredHeader,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];
  const padHeader = new Padding(s.header.padding);

  // Background
  if (s.header.backgroundColor !== "none") {
    primitives.push({
      type: "background",
      id: "headerBackground",
      rcd: measured.rcdHeaderOuter,
      fillColor: s.header.backgroundColor,
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

  const x = measured.rcdHeaderOuter.getPadded(padHeader).x();
  let currentY = measured.rcdHeaderOuter.getPadded(padHeader).y() +
    measured.yOffsetHeader;

  // Left-placed logos
  if (
    s.header.logoPlacement === "left" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let currentX = x;
    for (let i = 0; i < inputs.headerLogos.length; i++) {
      const logo = inputs.headerLogos[i];
      const logoWidth = (s.header.logoHeight * logo.width) / logo.height;
      primitives.push({
        type: "image",
        id: `headerLogoLeft${i}`,
        image: logo,
        rcd: new RCD([currentX, currentY, logoWidth, s.header.logoHeight]),
      });
      currentX += logoWidth + s.header.logoGapX;
    }
    currentY += s.header.logoHeight + s.header.logoBottomPadding;
  }

  // Header text
  if (measured.mHeader) {
    primitives.push({
      type: "text",
      id: "headerText",
      mText: measured.mHeader,
      x,
      y: currentY,
      hAlign: "left",
      vAlign: "top",
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
      hAlign: "left",
      vAlign: "top",
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
      hAlign: "left",
      vAlign: "top",
      maxWidth: measured.maxWidthForHeaderText,
    });
  }

  // Right-placed logos
  if (
    s.header.logoPlacement === "right" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let currentX = measured.rcdHeaderOuter.getPadded(padHeader).rightX();
    const y = measured.rcdHeaderOuter.getPadded(padHeader).y() +
      measured.yOffsetRightPlacementLogos;

    for (let i = 0; i < inputs.headerLogos.length; i++) {
      const logo = inputs.headerLogos[i];
      const logoWidth = (s.header.logoHeight * logo.width) / logo.height;
      primitives.push({
        type: "image",
        id: `headerLogoRight${i}`,
        image: logo,
        rcd: new RCD([currentX - logoWidth, y, logoWidth, s.header.logoHeight]),
      });
      currentX -= logoWidth + s.header.logoGapX;
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

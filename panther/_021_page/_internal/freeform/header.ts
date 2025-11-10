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
} from "../../deps.ts";
import type { FreeformPageInputs } from "../../types.ts";

export interface MeasuredHeader {
  mHeader?: MeasuredText;
  mSubHeader?: MeasuredText;
  mDate?: MeasuredText;
  rcdHeaderOuter: RectCoordsDims;
  yOffsetHeader: number;
  yOffsetRightPlacementLogos: number;
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
  };
}

export function renderHeader(
  rc: RenderContext,
  measured: MeasuredHeader,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): void {
  const padHeader = new Padding(s.header.padding);

  if (s.header.backgroundColor !== "none") {
    rc.rRect(measured.rcdHeaderOuter, {
      fillColor: getColor(s.header.backgroundColor),
    });
  }

  if (inputs.overlay) {
    const overlayFinalWidth = measured.rcdHeaderOuter.w();
    const overlayFinalHeight = overlayFinalWidth *
      (inputs.overlay.height / inputs.overlay.width);
    if (overlayFinalHeight > measured.rcdHeaderOuter.h()) {
      const overlayFinalYOffset = overlayFinalHeight -
        measured.rcdHeaderOuter.h();
      rc.rImage(
        inputs.overlay,
        measured.rcdHeaderOuter.x(),
        measured.rcdHeaderOuter.y() - overlayFinalYOffset,
        overlayFinalWidth,
        overlayFinalHeight,
      );
    } else {
      const overlayFinalHeight = measured.rcdHeaderOuter.h();
      const overlayFinalWidth = overlayFinalHeight *
        (inputs.overlay.width / inputs.overlay.height);
      const overlayFinalXOffset =
        (overlayFinalWidth - measured.rcdHeaderOuter.w()) / 2;
      rc.rImage(
        inputs.overlay,
        measured.rcdHeaderOuter.x() - overlayFinalXOffset,
        measured.rcdHeaderOuter.y(),
        overlayFinalWidth,
        overlayFinalHeight,
      );
    }
  }

  const x = measured.rcdHeaderOuter.getPadded(padHeader).x();
  let currentY = measured.rcdHeaderOuter.getPadded(padHeader).y() +
    measured.yOffsetHeader;

  if (
    s.header.logoPlacement === "left" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let currentX = x;
    for (const logo of inputs.headerLogos) {
      const logoWidth = (s.header.logoHeight * logo.width) / logo.height;
      rc.rImage(logo, currentX, currentY, logoWidth, s.header.logoHeight);
      currentX += logoWidth + s.header.logoGapX;
    }
    currentY += s.header.logoHeight + s.header.logoBottomPadding;
  }

  if (measured.mHeader) {
    rc.rText(measured.mHeader, [x, currentY], "left");
    currentY += measured.mHeader.dims.h() + s.header.headerBottomPadding;
  }
  if (measured.mSubHeader) {
    rc.rText(measured.mSubHeader, [x, currentY], "left");
    currentY += measured.mSubHeader.dims.h() + s.header.subHeaderBottomPadding;
  }
  if (measured.mDate) {
    rc.rText(measured.mDate, [x, currentY], "left");
    currentY += measured.mDate.dims.h();
  }

  if (
    s.header.logoPlacement === "right" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let currentX = measured.rcdHeaderOuter.getPadded(padHeader).rightX();
    const y = measured.rcdHeaderOuter.getPadded(padHeader).y() +
      measured.yOffsetRightPlacementLogos;
    for (const logo of inputs.headerLogos) {
      const logoWidth = (s.header.logoHeight * logo.width) / logo.height;
      rc.rImage(logo, currentX - logoWidth, y, logoWidth, s.header.logoHeight);
      currentX -= logoWidth + s.header.logoGapX;
    }
  }

  if (s.header.bottomBorderStrokeWidth > 0) {
    rc.rLine(
      [
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
      {
        strokeWidth: s.header.bottomBorderStrokeWidth,
        strokeColor: s.header.bottomBorderColor,
        lineDash: "solid",
      },
    );
  }
}

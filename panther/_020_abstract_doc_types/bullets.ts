// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type BulletLevelStyleOptions,
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

export const BULLET_LEVEL_2_MIN_SPACES = 2;
export const BULLET_LEVEL_3_MIN_SPACES = 4;

export function getBulletLevelFromIndentation(
  leadingSpaces: number,
): 1 | 2 | 3 {
  if (leadingSpaces >= BULLET_LEVEL_3_MIN_SPACES) {
    return 3;
  }
  if (leadingSpaces >= BULLET_LEVEL_2_MIN_SPACES) {
    return 2;
  }
  return 1;
}

export type ADTBullets = {
  bullets: ADTBullet[];
  s?: ADTBulletsStyleOptions;
};

export type ADTBullet = ADTBulletObject | string;

type ADTBulletObject = { bullet: string; level: 1 | 2 | 3 };

export type ADTBulletsStyleOptions = LayoutStyleOptions & {
  numbered?: boolean;
  lettered?: boolean;
  startNumberingAt?: number;
  bullet1?: TextAdjustmentOptions & BulletLevelStyleOptions;
  bullet2?: TextAdjustmentOptions & BulletLevelStyleOptions;
  bullet3?: TextAdjustmentOptions & BulletLevelStyleOptions;
};

export function getADTBulletAsObject(item: ADTBullet): ADTBulletObject {
  if (typeof item === "string") {
    // Count leading spaces
    const leadingSpaces = item.match(/^(\s*)/)?.[1].length ?? 0;
    const level = getBulletLevelFromIndentation(leadingSpaces);
    return { bullet: item.trim(), level };
  }
  return item as ADTBulletObject;
}

// ================================================================================
// MEASURED TYPES
// ================================================================================

type MeasuredBulletInfo = {
  bulletObj: ReturnType<typeof getADTBulletAsObject>;
  effectiveLevel: 1 | 2 | 3;
  levelKey: "bullet1" | "bullet2" | "bullet3";
  marker: string;
  textStyle: TextInfoUnkeyed;
  mText: MeasuredText;
  mMarker: MeasuredText;
  y: number;
  markerIndent: number;
  textIndent: number;
  gapMultiplier: number;
};

type MeasuredBulletsInfo = {
  outerRcd: RectCoordsDims;
  paddedRcd: RectCoordsDims;
  pad: Padding;
  bullets: MeasuredBulletInfo[];
  totalHeight: number;
  backgroundColor?: ColorKeyOrString;
  pageStyle: MergedPageStyle;
};

export type MeasuredBullets = Measured<ADTBullets> & {
  measuredInfo: MeasuredBulletsInfo;
};

// ================================================================================
// RENDERER
// ================================================================================

export const BulletsRenderer: ADTItemRenderer<ADTBullets, MeasuredBullets> = {
  isType(item: unknown): item is ADTBullets {
    return typeof item === "object" && item !== null && "bullets" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTBullets>,
    pageStyle: MergedPageStyle,
  ): MeasuredBullets {
    return measureBullets(rc, bounds, item, pageStyle);
  },

  render(rc: RenderContext, measured: MeasuredBullets): void {
    renderBullets(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTBullets>,
    pageStyle: MergedPageStyle,
  ): void {
    const measured = measureBullets(rc, bounds, item, pageStyle);
    BulletsRenderer.render(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MeasurableItem<ADTBullets>,
    pageStyle: MergedPageStyle,
  ): number {
    const pad = new Padding(item.s?.padding ?? 0);
    const paddedWidth = width - pad.totalPx();
    let idealH = pad.totalPy();

    item.bullets.forEach((bullet, i) => {
      const bulletObj = getADTBulletAsObject(bullet);
      const level = bulletObj.level;

      // Get style for this bullet level (capped at 3)
      const effectiveLevel = Math.min(level, 3) as 1 | 2 | 3;
      const levelKey = effectiveLevel === 1
        ? "bullet1"
        : effectiveLevel === 2
        ? "bullet2"
        : "bullet3";
      const bulletStyle = item.s?.[levelKey];
      const defaultBulletStyle = pageStyle.content.bullets[levelKey];

      // Calculate indentation from style system
      const textIndent = bulletStyle?.textIndent ??
        defaultBulletStyle.textIndent;

      // Get text style - use bullet-specific text style from page styles
      const textStyle = getAdjustedText(pageStyle.text[levelKey], bulletStyle);

      // Measure text with reduced width for indentation
      const textWidth = paddedWidth - textIndent;
      const mText = rc.mText(bulletObj.bullet, textStyle, textWidth);

      // Add gap before this bullet (except for first bullet)
      if (i > 0) {
        const gapMultiplier = bulletStyle?.topGapToPreviousBullet ??
          defaultBulletStyle.topGapToPreviousBullet;
        const actualGap = gapMultiplier * textStyle.lineHeight *
          textStyle.fontSize;
        idealH += actualGap;
      }

      idealH += mText.dims.h();
    });

    return idealH;
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureBullets(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: MeasurableItem<ADTBullets>,
  pageStyle: MergedPageStyle,
): MeasuredBullets {
  const ps = pageStyle;
  const pad = new Padding(item.s?.padding ?? 0);
  const paddedRcd = bounds.getPadded(pad);
  const paddedWidth = paddedRcd.w();

  let currentY = paddedRcd.y();
  const bullets: MeasuredBulletInfo[] = [];

  item.bullets.forEach((bullet, i) => {
    const bulletObj = getADTBulletAsObject(bullet);
    const level = bulletObj.level;

    // Get style for this bullet level (capped at 3)
    const effectiveLevel = Math.min(level, 3) as 1 | 2 | 3;
    const levelKey = effectiveLevel === 1
      ? "bullet1"
      : effectiveLevel === 2
      ? "bullet2"
      : "bullet3";

    const bulletStyle = item.s?.[levelKey];
    const defaultBulletStyle = ps.content.bullets[levelKey];

    // Calculate indentation from style system
    const markerIndent = bulletStyle?.markerIndent ??
      defaultBulletStyle.markerIndent;
    const textIndent = bulletStyle?.textIndent ?? defaultBulletStyle.textIndent;

    // Get text style - use bullet-specific text style from page styles
    const textStyle = getAdjustedText(ps.text[levelKey], bulletStyle);

    // Determine marker
    let marker = bulletStyle?.marker ?? defaultBulletStyle.marker;

    // Handle numbered/lettered bullets
    if (item.s?.numbered) {
      marker = _getNumberedMarker(item, i, effectiveLevel);
    } else if (item.s?.lettered) {
      marker = _getLetteredMarker(item, i, effectiveLevel);
    }

    // Add gap before this bullet (except for first bullet)
    if (i > 0) {
      const gapMultiplier = bulletStyle?.topGapToPreviousBullet ??
        defaultBulletStyle.topGapToPreviousBullet;
      const actualGap = gapMultiplier * textStyle.lineHeight *
        textStyle.fontSize;
      currentY += actualGap;
    }

    // Measure text with reduced width for indentation
    const textWidth = paddedWidth - textIndent;
    const mText = rc.mText(bulletObj.bullet, textStyle, textWidth);
    const mMarker = rc.mText(marker, textStyle, 100); // Width doesn't matter for single marker

    const gapMultiplier = bulletStyle?.topGapToPreviousBullet ??
      defaultBulletStyle.topGapToPreviousBullet;

    bullets.push({
      bulletObj,
      effectiveLevel,
      levelKey,
      marker,
      textStyle,
      mText,
      mMarker,
      y: currentY,
      markerIndent,
      textIndent,
      gapMultiplier,
    });

    currentY += mText.dims.h();
  });

  const measuredInfo: MeasuredBulletsInfo = {
    outerRcd: bounds,
    paddedRcd,
    pad,
    bullets,
    totalHeight: currentY - paddedRcd.y() + pad.totalPy(),
    backgroundColor: item.s?.backgroundColor,
    pageStyle: ps,
  };

  return {
    item: item,
    bounds,
    measuredInfo,
  };
}

function renderBullets(rc: RenderContext, measured: MeasuredBullets): void {
  const { measuredInfo } = measured;

  // Render background if specified
  if (measuredInfo.backgroundColor) {
    rc.rRect(measuredInfo.outerRcd, {
      show: true,
      fillColor: measuredInfo.backgroundColor,
    });
  }

  // Render each bullet
  measuredInfo.bullets.forEach((bullet) => {
    // Render marker
    rc.rText(
      bullet.mMarker,
      [measuredInfo.paddedRcd.x() + bullet.markerIndent, bullet.y],
      "left",
    );

    // Render text
    rc.rText(
      bullet.mText,
      [measuredInfo.paddedRcd.x() + bullet.textIndent, bullet.y],
      "left",
    );
  });
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function _getNumberedMarker(
  item: ADTBullets,
  currentIndex: number,
  effectiveLevel: 1 | 2 | 3,
): string {
  // Count bullets at each level
  const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (let j = 0; j <= currentIndex; j++) {
    const prevLevel = Math.min(getADTBulletAsObject(item.bullets[j]).level, 3);
    levelCounts[prevLevel]++;
    // Reset lower level counts when we encounter a higher level
    if (j < currentIndex && prevLevel < effectiveLevel) {
      for (let l = prevLevel + 1; l <= 3; l++) {
        levelCounts[l] = 0;
      }
    }
  }

  const startNum = effectiveLevel === 1 ? item.s?.startNumberingAt ?? 1 : 1;
  return `${levelCounts[effectiveLevel] + startNum - 1}.`;
}

function _getLetteredMarker(
  item: ADTBullets,
  currentIndex: number,
  effectiveLevel: 1 | 2 | 3,
): string {
  // Count bullets at each level for lettering
  const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (let j = 0; j <= currentIndex; j++) {
    const prevLevel = Math.min(getADTBulletAsObject(item.bullets[j]).level, 3);
    levelCounts[prevLevel]++;
    // Reset lower level counts when we encounter a higher level
    if (j < currentIndex && prevLevel < effectiveLevel) {
      for (let l = prevLevel + 1; l <= 3; l++) {
        levelCounts[l] = 0;
      }
    }
  }

  const letterIndex = levelCounts[effectiveLevel] - 1;
  return String.fromCharCode(97 + (letterIndex % 26)) + "."; // a, b, c, ...
}

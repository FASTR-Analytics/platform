// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomPageStyle,
  ImageRenderer,
  type MergedSplitConfig,
  type PageBackgroundStyle,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredImage, MeasuredText } from "../deps.ts";
import { measureCover } from "./cover/measure_cover.ts";
import { measureFreeform } from "./freeform/measure_freeform.ts";
import { measureSection } from "./section/measure_section.ts";
import type { MeasuredPage, PageInputs } from "../types.ts";

export function measurePage(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: PageInputs,
  responsiveScale?: number,
): MeasuredPage {
  const pageStyle = new CustomPageStyle(item.style, responsiveScale);
  const fullPageBounds = bounds;

  let boundsForPageType: RectCoordsDims = bounds;
  let measuredSplitImage: MeasuredImage | undefined;
  let splitImageBounds: RectCoordsDims | undefined;
  let splitBackground: PageBackgroundStyle | undefined;

  const splitConfig = getSplitConfig(item.type, pageStyle);

  if (splitConfig.placement !== "none") {
    const split = computeSplitBounds(bounds, splitConfig);
    boundsForPageType = split.contentBounds;
    splitImageBounds = split.splitBounds;
    splitBackground = splitConfig.background;
    if (item.splitImage) {
      measuredSplitImage = ImageRenderer.measure(rc, split.splitBounds, {
        image: item.splitImage,
        fit: "cover",
      });
    }
  }

  let result: MeasuredPage;
  switch (item.type) {
    case "cover": {
      const style = pageStyle.getMergedCoverStyle();
      const mWatermark: MeasuredText | undefined = item.watermark?.trim()
        ? rc.mText(item.watermark.trim(), style.text.watermark, fullPageBounds.w())
        : undefined;
      result = measureCover(
        rc,
        boundsForPageType,
        item,
        style,
        responsiveScale,
        fullPageBounds,
        measuredSplitImage,
        mWatermark,
      );
      break;
    }
    case "section": {
      const style = pageStyle.getMergedSectionStyle();
      const mWatermark: MeasuredText | undefined = item.watermark?.trim()
        ? rc.mText(item.watermark.trim(), style.text.watermark, fullPageBounds.w())
        : undefined;
      result = measureSection(
        rc,
        boundsForPageType,
        item,
        style,
        responsiveScale,
        fullPageBounds,
        measuredSplitImage,
        mWatermark,
      );
      break;
    }
    case "freeform": {
      const style = pageStyle.getMergedFreeformStyle();
      const mWatermark: MeasuredText | undefined = item.watermark?.trim()
        ? rc.mText(item.watermark.trim(), style.text.watermark, fullPageBounds.w())
        : undefined;
      result = measureFreeform(
        rc,
        boundsForPageType,
        item,
        style,
        responsiveScale,
        fullPageBounds,
        measuredSplitImage,
        mWatermark,
      );
      break;
    }
    default: {
      const _exhaustive: never = item;
      throw new Error(`Unknown page type: ${_exhaustive}`);
    }
  }

  if (splitConfig.placement !== "none") {
    result.splitImageBounds = splitImageBounds;
    result.splitBackground = splitBackground;
  }

  return result;
}

function getSplitConfig(
  pageType: "cover" | "section" | "freeform",
  pageStyle: CustomPageStyle,
): MergedSplitConfig {
  switch (pageType) {
    case "cover":
      return pageStyle.getMergedCoverStyle().split;
    case "section":
      return pageStyle.getMergedSectionStyle().split;
    case "freeform":
      return pageStyle.getMergedFreeformStyle().split;
  }
}

function computeSplitBounds(
  fullBounds: RectCoordsDims,
  splitConfig: MergedSplitConfig,
): { splitBounds: RectCoordsDims; contentBounds: RectCoordsDims } {
  const pct = splitConfig.sizeAsPct;
  switch (splitConfig.placement) {
    case "left": {
      const splitW = fullBounds.w() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          splitW,
          fullBounds.h(),
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x() + splitW,
          fullBounds.y(),
          fullBounds.w() - splitW,
          fullBounds.h(),
        ]),
      };
    }
    case "right": {
      const splitW = fullBounds.w() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x() + fullBounds.w() - splitW,
          fullBounds.y(),
          splitW,
          fullBounds.h(),
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w() - splitW,
          fullBounds.h(),
        ]),
      };
    }
    case "top": {
      const splitH = fullBounds.h() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w(),
          splitH,
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y() + splitH,
          fullBounds.w(),
          fullBounds.h() - splitH,
        ]),
      };
    }
    case "bottom": {
      const splitH = fullBounds.h() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y() + fullBounds.h() - splitH,
          fullBounds.w(),
          splitH,
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w(),
          fullBounds.h() - splitH,
        ]),
      };
    }
    case "none":
      throw new Error("computeSplitBounds called with placement 'none'");
  }
}

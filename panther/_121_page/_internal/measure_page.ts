// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomPageStyle,
  ImageRenderer,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredImage, MeasuredText } from "../deps.ts";
import { measureCover } from "./cover/measure_cover.ts";
import { measureFreeform } from "./freeform/measure_freeform.ts";
import { measureSection } from "./section/measure_section.ts";
import type { MeasuredPage, PageInputs, SplitImageInputs } from "../types.ts";

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

  if (item.splitImage) {
    const split = computeSplitBounds(bounds, item.splitImage);
    boundsForPageType = split.contentBounds;
    splitImageBounds = split.imageBounds;
    if (item.splitImage.image) {
      measuredSplitImage = ImageRenderer.measure(rc, split.imageBounds, {
        image: item.splitImage.image,
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

  if (item.splitImage) {
    result.splitImageBounds = splitImageBounds;
    result.splitImageBackgroundColor = item.splitImage.backgroundColor;
  }

  return result;
}

function computeSplitBounds(
  fullBounds: RectCoordsDims,
  splitImage: SplitImageInputs,
): { imageBounds: RectCoordsDims; contentBounds: RectCoordsDims } {
  const pct = splitImage.sizeAsPctOfPage;
  switch (splitImage.placement) {
    case "left": {
      const imageW = fullBounds.w() * pct;
      return {
        imageBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          imageW,
          fullBounds.h(),
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x() + imageW,
          fullBounds.y(),
          fullBounds.w() - imageW,
          fullBounds.h(),
        ]),
      };
    }
    case "right": {
      const imageW = fullBounds.w() * pct;
      return {
        imageBounds: new RectCoordsDims([
          fullBounds.x() + fullBounds.w() - imageW,
          fullBounds.y(),
          imageW,
          fullBounds.h(),
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w() - imageW,
          fullBounds.h(),
        ]),
      };
    }
    case "top": {
      const imageH = fullBounds.h() * pct;
      return {
        imageBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w(),
          imageH,
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y() + imageH,
          fullBounds.w(),
          fullBounds.h() - imageH,
        ]),
      };
    }
    case "bottom": {
      const imageH = fullBounds.h() * pct;
      return {
        imageBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y() + fullBounds.h() - imageH,
          fullBounds.w(),
          imageH,
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w(),
          fullBounds.h() - imageH,
        ]),
      };
    }
  }
}

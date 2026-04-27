// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MeasuredText,
  MergedPageNumberStyle,
  PathSegment,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { ImageRenderer } from "../deps.ts";
import { renderPageAnnotations } from "./render_annotations.ts";
import { renderCover } from "./cover/render_cover.ts";
import { renderFreeform } from "./freeform/render_freeform.ts";
import { renderSection } from "./section/render_section.ts";
import type { MeasuredPage } from "../types.ts";

export function renderPage(
  rc: RenderContext,
  measured: MeasuredPage,
): void {
  if (measured.splitImageBounds && measured.splitBackground && measured.splitBackground !== "none") {
    rc.rRect(measured.splitImageBounds, {
      fillColor: measured.splitBackground,
    });
  }
  if (measured.measuredSplitImage) {
    ImageRenderer.render(rc, measured.measuredSplitImage);
  }

  switch (measured.type) {
    case "cover":
      renderCover(rc, measured);
      break;
    case "section":
      renderSection(rc, measured);
      break;
    case "freeform":
      renderFreeform(rc, measured);
      break;
    default: {
      const _exhaustive: never = measured;
      throw new Error(`Unknown page type: ${_exhaustive}`);
    }
  }

  if (measured.mWatermark) {
    rc.rText(
      measured.mWatermark,
      [measured.fullPageBounds.centerX(), measured.fullPageBounds.centerY()],
      "center",
      "middle",
    );
  }

  if (measured.item.pageNumber) {
    renderPageNumberOverlay(rc, measured);
  }

  if (measured.item.annotations?.length) {
    renderPageAnnotations(
      rc,
      measured.fullPageBounds,
      measured.item.annotations,
      measured.style.alreadyScaledValue,
    );
  }
}

function renderPageNumberOverlay(
  rc: RenderContext,
  measured: MeasuredPage,
): void {
  const pageNumberStyle = measured.style.pageNumber;
  const textStyle = measured.style.text.pageNumber;
  const pad = pageNumberStyle.padding;
  const fpb = measured.fullPageBounds;
  const mText = rc.mText(measured.item.pageNumber!, textStyle, fpb.w() * 0.3);

  const [x, alignH] = pageNumberStyle.placement === "bottom-left"
    ? [fpb.x() + pad.pl(), "left" as const]
    : pageNumberStyle.placement === "bottom-center"
    ? [fpb.centerX(), "center" as const]
    : [fpb.rightX() - pad.pr(), "right" as const];

  const textY = fpb.bottomY() - pad.pb();

  if (pageNumberStyle.background !== "none") {
    renderPageNumberBackground(rc, pageNumberStyle, mText, x, textY, alignH, fpb);
  }

  rc.rText(mText, [x, textY], alignH, "bottom");
}

function renderPageNumberBackground(
  rc: RenderContext,
  s: MergedPageNumberStyle,
  mText: MeasuredText,
  textX: number,
  textY: number,
  alignH: "left" | "center" | "right",
  fpb: { bottomY(): number; rightX(): number; x(): number },
): void {
  const bg = s.background;
  const bgColor = s.backgroundColor;
  const textW = mText.dims.w();
  const textH = mText.dims.h();
  const bgPadH = textH * 0.4;
  const bgPadV = textH * 0.3;

  const rectLeft = alignH === "left"
    ? textX - bgPadH
    : alignH === "center"
    ? textX - textW / 2 - bgPadH
    : textX - textW - bgPadH;
  const rectTop = textY - textH - bgPadV;
  const rectW = textW + bgPadH * 2;
  const rectH = textH + bgPadV * 2;

  if (bg === "triangle") {
    const placement = s.placement;
    if (placement === "bottom-center") {
      rc.rRect([rectLeft, rectTop, rectW, rectH], { fillColor: bgColor });
      return;
    }
    const pad = s.padding;
    const triSize = placement === "bottom-right"
      ? (pad.pr() + bgPadH + textW) + (pad.pb() + bgPadV + textH)
      : (pad.pl() + bgPadH + textW) + (pad.pb() + bgPadV + textH);
    const pageBottom = fpb.bottomY();
    const segments: PathSegment[] = placement === "bottom-right"
      ? [
        { type: "moveTo", x: fpb.rightX(), y: pageBottom },
        {
          type: "lineTo",
          x: fpb.rightX() - triSize,
          y: pageBottom,
        },
        {
          type: "lineTo",
          x: fpb.rightX(),
          y: pageBottom - triSize,
        },
      ]
      : [
        { type: "moveTo", x: fpb.x(), y: pageBottom },
        { type: "lineTo", x: fpb.x() + triSize, y: pageBottom },
        { type: "lineTo", x: fpb.x(), y: pageBottom - triSize },
      ];
    rc.rPath(segments, { fill: { color: bgColor } });
  } else if (bg === "circle") {
    const circleW = Math.max(rectW, rectH);
    const circleLeft = rectLeft - (circleW - rectW) / 2;
    rc.rRect([circleLeft, rectTop, circleW, rectH], {
      fillColor: bgColor,
      rectRadius: rectH / 2,
    });
  } else {
    rc.rRect([rectLeft, rectTop, rectW, rectH], { fillColor: bgColor });
  }
}

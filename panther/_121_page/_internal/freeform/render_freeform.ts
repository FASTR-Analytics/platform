// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../../deps.ts";
import { renderContent } from "./content.ts";
import type { MeasuredFreeformPage } from "../../types.ts";
import { renderPagePrimitives } from "../render_primitives.ts";

export function renderFreeform(
  rc: RenderContext,
  measured: MeasuredFreeformPage,
): void {
  const inputs = measured.item;
  const s = measured.mergedPageStyle;

  // Render background if needed
  if (s.content.backgroundColor !== "none") {
    rc.rRect(measured.bounds, {
      fillColor: s.content.backgroundColor,
    });
  }

  // Render header/footer primitives
  renderPagePrimitives(rc, measured.primitives);

  // Render content
  renderContent(
    rc,
    {
      rcdContentOuter: measured.rcdContentOuter,
      rcdContentInner: measured.rcdContentInner,
      mLayout: measured.mLayout,
      overflow: measured.overflow,
      gaps: measured.gaps,
    },
    inputs,
    s,
  );

  if (inputs.watermark) {
    const mText = rc.mText(
      inputs.watermark,
      s.text.watermark,
      measured.bounds.w(),
    );
    rc.rText(mText, measured.bounds.centerCoords(), "center", "center");
  }
}

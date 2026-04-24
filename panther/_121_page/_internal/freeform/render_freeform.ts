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
  if (measured.style.content.backgroundColor !== "none") {
    rc.rRect(measured.bounds, {
      fillColor: measured.style.content.backgroundColor,
    });
  }

  renderPagePrimitives(rc, measured.primitives);

  renderContent(
    rc,
    {
      rcdContentOuter: measured.rcdContentOuter,
      rcdContentInner: measured.rcdContentInner,
      mLayout: measured.mLayout,
      overflow: measured.overflow,
      gaps: measured.gaps,
    },
  );
}

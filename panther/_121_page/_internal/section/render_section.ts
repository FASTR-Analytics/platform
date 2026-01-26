// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../../deps.ts";
import type { MeasuredSectionPage } from "../../types.ts";
import { renderPagePrimitives } from "../render_primitives.ts";

export function renderSection(
  rc: RenderContext,
  measured: MeasuredSectionPage,
): void {
  renderPagePrimitives(rc, measured.primitives);
}

// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../../deps.ts";
import type { MeasuredCoverPage } from "../../types.ts";
import { renderPagePrimitives } from "../render_primitives.ts";

export function renderCover(
  rc: RenderContext,
  measured: MeasuredCoverPage,
): void {
  renderPagePrimitives(rc, measured.primitives);
}

// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../deps.ts";
import { renderCover } from "./cover/render_cover.ts";
import { renderFreeform } from "./freeform/render_freeform.ts";
import { renderSection } from "./section/render_section.ts";
import type { MeasuredPage } from "../types.ts";

export async function renderPage(
  rc: RenderContext,
  measured: MeasuredPage,
): Promise<void> {
  switch (measured.type) {
    case "cover":
      renderCover(rc, measured);
      break;
    case "section":
      renderSection(rc, measured);
      break;
    case "freeform":
      await renderFreeform(rc, measured);
      break;
    default: {
      const _exhaustive: never = measured as never;
      throw new Error(`Unknown page type: ${(measured as any).type}`);
    }
  }
}

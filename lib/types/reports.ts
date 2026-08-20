// =============================================================================
// Reports — long-form analytical documents (markdown body + figure/image
// registries). See PLAN_REPORTS.md. Figures/images reuse the slide FigureBlock /
// ImageBlock types verbatim.
// =============================================================================

import { z } from "zod";
import type { ImageBlock } from "./slides.ts";
import type { FigureBlock } from "./_figure_bundle.ts";
import { figureBlockSchema, imageBlockSchema } from "./_slide_config.ts";

// ── Config (v1: minimal; no per-report styling) ──────────────────────────────

export type ReportConfig = {
  // Reserved for future per-report theming / header-footer. Empty in v1.
  version?: number;
};

export const reportConfigSchema = z
  .object({
    version: z.number().optional(),
  })
  .passthrough();

export function getStartingConfigForReport(): ReportConfig {
  return { version: 1 };
}

// ── Embed registry write-validation ──────────────────────────────────────────
// Reuses the slide figure/image block schemas verbatim — report figures/images
// ARE slides' FigureBlock / ImageBlock (the strict figureBlockSchema — the bundle
// is validated, not z.unknown — same as slides).

export const reportFiguresSchema = z.record(z.string(), figureBlockSchema);
export const reportImagesSchema = z.record(z.string(), imageBlockSchema);

// ── Public types ─────────────────────────────────────────────────────────────

// Editor / render
export type ReportDetail = {
  id: string;
  label: string;
  body: string;
  figures: Record<string, FigureBlock>; // live data figures (slides' FigureBlock)
  images: Record<string, ImageBlock>; // uploaded images (slides' ImageBlock)
  config: ReportConfig;
  lastUpdated: string;
};

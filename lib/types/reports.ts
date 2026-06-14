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

export type ReportGroupingMode = "folders" | "flat";

export type ReportFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

// Cheap, server-computed preview shown on the report list card. Lives on the
// (lightweight) summary so it rides the existing `reports_updated` SSE path — no
// per-card detail fetch. Derived entirely from the markdown body.
export type ReportPreviewLine = { text: string; headingLevel: number }; // 0 = body

export type ReportPreview = {
  lines: ReportPreviewLine[]; // first few body lines, markdown stripped, headings flagged
  figureCount: number;
  imageCount: number;
};

// List view
export type ReportSummary = {
  id: string;
  label: string;
  folderId: string | null;
  config: ReportConfig;
  preview: ReportPreview;
};

function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // drop image/embed tokens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → link text
    .replace(/[*_`~]/g, "") // emphasis / code markers
    .replace(/\s+/g, " ")
    .trim();
}

export function buildReportPreview(body: string): ReportPreview {
  // Embed tokens are `![caption](figure:id)` / `![caption](image:id)`.
  const figureCount = (body.match(/\]\(figure:/g) ?? []).length;
  const imageCount = (body.match(/\]\(image:/g) ?? []).length;

  const lines: ReportPreviewLine[] = [];
  let chars = 0;
  for (const raw of body.split("\n")) {
    if (lines.length >= 8 || chars >= 300) break;
    if (/^\s*!\[[^\]]*\]\((figure|image):/.test(raw)) continue; // skip embed lines
    const headingMatch = raw.match(/^\s*(#{1,6})\s+(.*)$/);
    const text = stripInlineMarkdown(
      headingMatch ? headingMatch[2] : raw.replace(/^\s*(>|[-*+])\s+/, ""),
    ).slice(0, 120);
    if (!text) continue;
    lines.push({
      text,
      headingLevel: headingMatch ? headingMatch[1].length : 0,
    });
    chars += text.length;
  }

  return { lines, figureCount, imageCount };
}

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

// =============================================================================
// Custom report styles — user-authored design briefs for HTML reports, stored
// in the MAIN database (visibility can span projects, so a project DB cannot
// hold them). A style is injected into the AI's authoring instructions exactly
// like a built-in preset (SYSTEM_13); reports snapshot the brief at creation
// and resolve the live library copy when it is still visible (live ref +
// snapshot fallback — see reports.ts `customStyle`).
// =============================================================================

import { z } from "zod";

// Tile colors for the picker's generic custom-style mockup.
export const reportStyleColorsSchema = z.object({
  page: z.string().max(32),
  ink: z.string().max(32),
  accent: z.string().max(32),
});
export type ReportStyleColors = z.infer<typeof reportStyleColorsSchema>;

export const REPORT_CUSTOM_BRIEF_MAX = 8_000;
// A style distilled from a real report carries that report's actual <style>
// CSS verbatim — prose alone is a lossy encoding of a design, and regenerated
// stylesheets never match the original. The AI is told to REUSE this CSS.
export const REPORT_STYLE_REFERENCE_CSS_MAX = 20_000;

export type ReportCustomStyle = {
  id: string;
  label: string;
  description: string;
  brief: string;
  referenceCss: string | null;
  colors: ReportStyleColors | null;
  // null = visible to every project on the instance.
  projectIds: string[] | null;
  lastUpdated: string;
};

export const reportStyleBodySchema = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(200),
  brief: z.string().min(1).max(REPORT_CUSTOM_BRIEF_MAX),
  referenceCss: z.string().max(REPORT_STYLE_REFERENCE_CSS_MAX).nullable(),
  colors: reportStyleColorsSchema.nullable(),
  projectIds: z.array(z.string()).nullable(),
});
export type ReportStyleBody = z.infer<typeof reportStyleBodySchema>;

export function reportStyleVisibleToProject(
  style: Pick<ReportCustomStyle, "projectIds">,
  projectId: string,
): boolean {
  return style.projectIds === null || style.projectIds.includes(projectId);
}

// =============================================================================
// Custom report styles: user-authored design briefs for HTML and FASTR
// Markdown reports, stored in the MAIN database. A style is injected into the
// AI's authoring instructions exactly like a built-in preset (SYSTEM_13);
// reports snapshot the brief at creation and resolve the live library copy
// while it is still visible (live ref + snapshot fallback, see reports.ts
// `customStyle`).
//
// Visibility is per PRODUCT: a style is either instance-wide or limited to a
// named set of reports (PLAN_PRODUCTS_RESTRUCTURE left no project layer to
// scope it to).
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
// CSS verbatim: prose alone is a lossy encoding of a design, and regenerated
// stylesheets never match the original. The AI is told to REUSE this CSS.
export const REPORT_STYLE_REFERENCE_CSS_MAX = 20_000;

export type ReportCustomStyle = {
  id: string;
  label: string;
  description: string;
  brief: string;
  referenceCss: string | null;
  colors: ReportStyleColors | null;
  // null = visible to every product on the instance.
  productIds: string[] | null;
  lastUpdated: string;
};

export const reportStyleBodySchema = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(200),
  brief: z.string().min(1).max(REPORT_CUSTOM_BRIEF_MAX),
  referenceCss: z.string().max(REPORT_STYLE_REFERENCE_CSS_MAX).nullable(),
  colors: reportStyleColorsSchema.nullable(),
  productIds: z.array(z.string()).nullable(),
});
export type ReportStyleBody = z.infer<typeof reportStyleBodySchema>;

/** A style with no product list is instance-wide; otherwise it is offered
 *  only to the reports named in it. A report that already carries the style
 *  keeps working through its config snapshot once this returns false. */
export function reportStyleVisibleToProduct(
  style: Pick<ReportCustomStyle, "productIds">,
  productId: string,
): boolean {
  return style.productIds === null || style.productIds.includes(productId);
}

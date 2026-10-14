// =============================================================================
// Custom report styles: user-authored palettes for reports, stored in the
// MAIN database. A style's colors override the palette of whichever theme the
// report is on; a report snapshots the style when it is applied (see
// reports.ts `customStyle`). `brief` and `referenceCss` are what a style was
// when reports could be written as html (an AI design brief and the source
// report's stylesheet): they are still stored and round-tripped, and nothing
// reads them.
//
// Visibility is per PRODUCT: a style is either instance-wide or limited to a
// named set of reports (there is no project layer to scope it to).
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
  brief: z.string().max(REPORT_CUSTOM_BRIEF_MAX),
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

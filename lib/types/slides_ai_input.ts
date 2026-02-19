import { z } from "zod";
import {
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "../consts.ts";

// Metric schema

export const AiMetricQuerySchema = z.object({
  metricId: z
    .string()
    .describe(
      "The unique ID of the metric to query. This metric must exist in the project's data.",
    ),
  disaggregations: z
    .array(z.string())
    .optional()
    .describe(
      "Optional: Array of disaggregation dimensions to break down the data by. Use dimension names from get_available_metrics (e.g., 'admin_area_2', 'indicator_common_id'). Time disaggregations: 'period_id' (by specific month), 'year' (by year), 'month' (1-12, by month-of-year for seasonal patterns).",
    ),
  filters: z
    .array(
      z.object({
        col: z
          .string()
          .describe(
            "Must be a valid disaggregation dimension for this metric (see get_available_metrics)",
          ),
        vals: z
          .array(z.string())
          .describe(
            "Values must exist in the data. Use get_metric_data first to discover valid values.",
          ),
      }),
    )
    .optional()
    .describe(
      "Optional: Array of filters to limit which data is displayed. Each filter specifies a column and the values to include.",
    ),
  startDate: z
    .number()
    .optional()
    .describe(
      "Optional: Start of time range (inclusive). Format: YYYY for years (2023), YYYYMM for months (202301). Must be used together with endDate.",
    ),
  endDate: z
    .number()
    .optional()
    .describe(
      "Optional: End of time range (inclusive). Must be used together with startDate.",
    ),
});

// Individual figure schemas (unnested for type inference)

export const AiTextBlockSchema = z.object({
  type: z.literal("text"),
  markdown: z
    .string()
    .describe(
      `The text content in markdown format. Supports standard markdown syntax including headers, bold, italic, lists, and links. WORD COUNT: Target ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words TOTAL across all text blocks per slide (adjust down if slide has charts/figures), absolute maximum ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words TOTAL per slide. IMPORTANT: Tables-in-markdown are NOT ALLOWED. If you need to display tabular data, use a 'from_metric' block with a table preset, or a 'from_visualization' block.`,
    )
    .refine(
      (text) => {
        const wordCount = text.trim().split(/\s+/).length;
        return wordCount <= SLIDE_TEXT_TOTAL_WORD_COUNT_MAX;
      },
      {
        message: `Individual text block exceeds ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words`,
      },
    ),
});

export const AiFigureFromVisualizationSchema = z.object({
  type: z.literal("from_visualization"),
  visualizationId: z
    .string()
    .describe(
      "The unique ID of an existing visualization/presentation object to clone into this slide. The visualization must already exist in the project.",
    ),
  replicant: z
    .string()
    .optional()
    .describe(
      "Optional: If the source visualization uses replication (e.g., one chart per region), specify which replicant value to show. For example, 'North' to show only the North region's chart.",
    ),
});

export const AiFigureFromMetricSchema = z.object({
  type: z.literal("from_metric"),
  metricId: z
    .string()
    .describe(
      "The unique ID of the metric to visualize. Must exist in the project's data.",
    ),
  vizPresetId: z
    .string()
    .describe(
      "The ID of a pre-defined visualization preset for this metric. Get available preset IDs from get_available_metrics.",
    ),
  chartTitle: z.string().max(200).describe("Title displayed above the figure"),
  selectedReplicant: z
    .string()
    .optional()
    .describe(
      "Required when the preset has needsReplicant=true. Specifies which replicant value to display, e.g., 'anc1'.",
    ),
  filterOverrides: z
    .array(
      z.object({
        col: z.string().describe("Dimension to filter on. Must be listed in the preset's 'Filterable by' dimensions (shown in get_available_metrics)"),
        vals: z
          .array(z.string())
          .describe("Array of values to include for this filter"),
      }),
    )
    .optional()
    .describe(
      "Optional: Add filters to limit which data is displayed. Only use dimensions listed in the preset's 'Filterable by' list from get_available_metrics.",
    ),
  startDate: z
    .number()
    .optional()
    .describe(
      "Optional: Start of time range. Format depends on the preset's date format " +
      "(shown in preset listing). For YYYYMM presets: 202301 = Jan 2023. " +
      "For YYYY presets: 2023. Must be used together with endDate.",
    ),
  endDate: z
    .number()
    .optional()
    .describe(
      "Optional: End of time range. Format depends on the preset's date format " +
      "(shown in preset listing). For YYYYMM presets: 202312 = Dec 2023. " +
      "For YYYY presets: 2024. Must be used together with startDate.",
    ),
});

// Union schemas

export const AiFigureBlockInputSchema = z.union([
  AiFigureFromVisualizationSchema,
  AiFigureFromMetricSchema,
]);

export const AiContentBlockInputSchema = z.union([
  AiTextBlockSchema,
  AiFigureBlockInputSchema,
]);

// Layout spec schemas (for AI layout control)

export const LayoutCellSchema = z.object({
  block: z.union([
    z.string().describe("Existing block ID (from get_slide) to keep unchanged"),
    AiContentBlockInputSchema.describe("New block content to create"),
  ]),
  span: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe(
      "Column width (1-12). Spans per row must sum to 12. Omit for equal split.",
    ),
});

export const LayoutSpecSchema = z
  .array(z.array(LayoutCellSchema).min(1).max(3))
  .min(1)
  .max(3)
  .describe("Rows (top→bottom), each containing columns (left→right).");

export type LayoutCell = z.infer<typeof LayoutCellSchema>;
export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;

// Slide schemas

export const AiCoverSlideSchema = z.object({
  type: z.literal("cover"),
  title: z
    .string()
    .max(200)
    .describe(
      "The main title of the presentation, displayed prominently on the cover slide. Maximum 200 characters.",
    ),
  subtitle: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional: A subtitle or tagline that provides additional context about the presentation. Maximum 500 characters.",
    ),
  presenter: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Optional: The name(s) of the presenter(s) or author(s), e.g., 'Dr. Jane Smith' or 'Health Analytics Team'. Maximum 200 characters.",
    ),
  date: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Optional: The presentation date or time period, e.g., 'January 2024' or 'Q4 2023'. Maximum 100 characters.",
    ),
});

export const AiSectionSlideSchema = z.object({
  type: z.literal("section"),
  sectionTitle: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Required: The section title that will be displayed prominently. Use this to mark major transitions in the presentation, e.g., 'Introduction', 'Key Findings', 'Recommendations'. Minimum 1 character, maximum 200 characters.",
    ),
  sectionSubtitle: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional: Additional context or description for this section. Maximum 500 characters.",
    ),
});

export const AiContentSlideSchema = z.object({
  type: z.literal("content"),
  header: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Optional: The slide header/title that appears at the top of the slide. Should clearly describe what this slide is about. Maximum 200 characters.",
    ),
  blocks: z
    .array(AiContentBlockInputSchema)
    .describe(
      `Required: Array of content blocks (text and/or figures) to display on this slide. Blocks can be text (markdown), figures from existing visualizations, or figures from metrics with custom config. The layout will be automatically optimized. Maximum ${MAX_CONTENT_BLOCKS} blocks per slide.`,
    ),
});

export const AiSlideInputSchema = z.union([
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiContentSlideSchema,
]);

// Inferred types (single source of truth)

export type AiTextBlock = z.infer<typeof AiTextBlockSchema>;
export type AiFigureFromVisualization = z.infer<
  typeof AiFigureFromVisualizationSchema
>;
export type AiMetricQuery = z.infer<typeof AiMetricQuerySchema>;
export type AiFigureFromMetric = z.infer<typeof AiFigureFromMetricSchema>;
export type AiFigureBlockInput = z.infer<typeof AiFigureBlockInputSchema>;
export type AiContentBlockInput = z.infer<typeof AiContentBlockInputSchema>;
export type AiContentSlideInput = z.infer<typeof AiContentSlideSchema>;
export type AiSlideInput = z.infer<typeof AiSlideInputSchema>;

// Validation function
export function validateSlide(
  slide: unknown,
): { valid: true; data: AiSlideInput } | { valid: false; error: string } {
  const result = AiSlideInputSchema.safeParse(slide);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    error: result.error.issues[0]?.message ?? "Invalid slide",
  };
}

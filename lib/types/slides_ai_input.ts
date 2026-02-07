import { z } from "zod";
import { MAX_CONTENT_BLOCKS } from "../consts.ts";

// Metric schema

export const AiMetricQuerySchema = z.object({
  metricId: z.string().describe(
    "The unique ID of the metric/indicator to query. This metric must exist in the project's data.",
  ),
  disaggregations: z.array(z.string()).optional().describe(
    "Optional: Array of disaggregation dimensions to break down the data by, e.g., ['gender', 'age_group']. Time disaggregations: 'period_id' (by specific month), 'quarter_id' (by specific quarter), 'year' (by year), 'month' (1-12, by month-of-year for seasonal patterns).",
  ),
  filters: z.array(z.object({
    col: z.string().describe(
      "The column/dimension name to filter on, e.g., 'region' or 'facility_type'",
    ),
    vals: z.array(z.string()).describe(
      "Array of values to include for this filter, e.g., ['North', 'South'] to show only those regions",
    ),
  })).optional().describe(
    "Optional: Array of filters to limit which data is displayed. Each filter specifies a column and the values to include.",
  ),
  periodFilter: z.object({
    periodOption: z.enum(["period_id", "quarter_id", "year"]).describe(
      "Time granularity: 'period_id' = YYYYMM format (202301 = Jan 2023), 'quarter_id' = YYYYQQ format (202301 = Q1 2023), 'year' = YYYY format (2023)",
    ),
    min: z.number().describe(
      "Start of time range (inclusive). Examples: period_id 202301 (Jan 2023), quarter_id 202301 (Q1 2023), year 2023",
    ),
    max: z.number().describe(
      "End of time range (inclusive). Examples: period_id 202412 (Dec 2024), quarter_id 202404 (Q4 2024), year 2024",
    ),
  }).optional().describe(
    "Optional: Filter to limit the time range. Format depends on periodOption: period_id=YYYYMM (202301-202412), quarter_id=YYYYQQ (202301-202404), year=YYYY (2023-2024).",
  ),
  valuesFilter: z.array(z.string()).optional().describe(
    "Optional: Array of value property names to display. For metrics with multiple value properties (shown in 'Value properties' section from get_metric_data), specify which ones to include. E.g., ['count_final_both'] to show only the combined count.",
  ),
});

export type AiChartType = "bar" | "line" | "table";

// Visualization creation schemas

// const DisaggregationDisplaySchema = z.object({
//   disOpt: z.string(),
//   disDisplayOpt: z.enum([
//     "row",
//     "col",
//     "series",
//     "cell",
//     "indicator",
//     "replicant",
//     "rowGroup",
//     "colGroup",
//   ]),
// });

// const StylingSchema = z.object({
//   colorScale: z.enum([
//     "pastel-discrete",
//     "alt-discrete",
//     "red-green",
//     "blue-green",
//     "single-grey",
//     "custom",
//   ]).optional(),
//   showDataLabels: z.boolean().optional(),
//   content: z.enum(["lines", "bars", "points", "areas"]).optional(),
//   decimalPlaces: z.number().min(0).max(3).optional(),
//   barsStacked: z.boolean().optional(),
//   hideLegend: z.boolean().optional(),
// }).optional();

export const AiCreateVisualizationInputSchema = z.object({
  metricQuery: AiMetricQuerySchema.describe(
    "The metric query parameters specifying what data to visualize.",
  ),
  chartType: z.enum(["bar", "line", "table"]).optional().describe(
    "Optional: The visualization type - 'bar' for bar charts, 'line' for line charts, or 'table' for data tables. If not specified, an appropriate type will be chosen automatically.",
  ),
  chartTitle: z.string().max(200).describe("The chart title"),
  // disaggregationDisplay: z.array(DisaggregationDisplaySchema).optional(),
  // styling: StylingSchema,
});

export type AiCreateVisualizationInput = z.infer<
  typeof AiCreateVisualizationInputSchema
>;

// Individual figure schemas (unnested for type inference)

export const AiTextBlockSchema = z.object({
  type: z.literal("text").describe("Block type identifier for text content"),
  markdown: z.string().max(5000).describe(
    "The text content in markdown format. Supports standard markdown syntax including headers, bold, italic, lists, and links. Maximum 5000 characters. IMPORTANT: Tables-in-markdown are NOT ALLOWED. If you need to display tabular data, you must create a table figure using the 'from_metric' or 'from_visualization' block types with chartType='table', not markdown tables.",
  ),
});

export const AiFigureFromVisualizationSchema = z.object({
  type: z.literal("from_visualization").describe(
    "Block type identifier for figures cloned from existing visualizations",
  ),
  visualizationId: z.string().describe(
    "The unique ID of an existing visualization/presentation object to clone into this slide. The visualization must already exist in the project.",
  ),
  replicant: z.string().optional().describe(
    "Optional: If the source visualization uses replication (e.g., one chart per region), specify which replicant value to show. For example, 'North' to show only the North region's chart.",
  ),
});

export const AiFigureFromMetricSchema = z.object({
  type: z.literal("from_metric").describe(
    "Block type identifier for figures created from metric data with custom configuration",
  ),
}).merge(AiCreateVisualizationInputSchema);

export const AiFigureCustomSchema = z.object({
  type: z.literal("custom").describe(
    "Block type identifier for figures created from custom/arbitrary data",
  ),
  customData: z.array(z.unknown()).describe(
    "Array of custom data objects to visualize. The structure depends on the chartType - each object typically represents a data point or row.",
  ),
  chartType: z.enum(["bar", "line", "table"]).describe(
    "Required: The visualization type for the custom data - 'bar' for bar charts, 'line' for line charts, or 'table' for data tables.",
  ),
  description: z.string().optional().describe(
    "Optional: A description of what this custom chart shows, for documentation purposes.",
  ),
});

// Union schemas

export const AiFigureBlockInputSchema = z.union([
  AiFigureFromVisualizationSchema,
  AiFigureFromMetricSchema,
  // AiFigureCustomSchema,
]);

export const AiContentBlockInputSchema = z.union([
  AiTextBlockSchema,
  AiFigureBlockInputSchema,
]);

// Slide schemas

export const AiCoverSlideSchema = z.object({
  type: z.literal("cover").describe(
    "Slide type identifier for title/cover slides",
  ),
  title: z.string().max(200).describe(
    "The main title of the presentation, displayed prominently on the cover slide. Can be empty string. Maximum 200 characters.",
  ),
  subtitle: z.string().max(500).optional().describe(
    "Optional: A subtitle or tagline that provides additional context about the presentation. Maximum 500 characters.",
  ),
  presenter: z.string().max(200).optional().describe(
    "Optional: The name(s) of the presenter(s) or author(s), e.g., 'Dr. Jane Smith' or 'Health Analytics Team'. Maximum 200 characters.",
  ),
  date: z.string().max(100).optional().describe(
    "Optional: The presentation date or time period, e.g., 'January 2024' or 'Q4 2023'. Maximum 100 characters.",
  ),
});

export const AiSectionSlideSchema = z.object({
  type: z.literal("section").describe(
    "Slide type identifier for section divider slides",
  ),
  sectionTitle: z.string().min(1).max(200).describe(
    "Required: The section title that will be displayed prominently. Use this to mark major transitions in the presentation, e.g., 'Introduction', 'Key Findings', 'Recommendations'. Minimum 1 character, maximum 200 characters.",
  ),
  sectionSubtitle: z.string().max(500).optional().describe(
    "Optional: Additional context or description for this section. Maximum 500 characters.",
  ),
});

export const AiContentSlideSchema = z.object({
  type: z.literal("content").describe(
    "Slide type identifier for content slides with text and/or figures",
  ),
  header: z.string().max(200).optional().describe(
    "Optional: The slide header/title that appears at the top of the slide. Should clearly describe what this slide is about. Maximum 200 characters.",
  ),
  blocks: z.array(AiContentBlockInputSchema).describe(
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
export type AiFigureCustom = z.infer<typeof AiFigureCustomSchema>;
export type AiFigureBlockInput = z.infer<typeof AiFigureBlockInputSchema>;
export type AiContentBlockInput = z.infer<typeof AiContentBlockInputSchema>;
export type AiContentSlideInput = z.infer<typeof AiContentSlideSchema>;
export type AiSlideInput = z.infer<typeof AiSlideInputSchema>;

// Validation function
export function validateSlide(
  slide: unknown,
):
  | { valid: true; data: AiSlideInput }
  | { valid: false; error: string } {
  const result = AiSlideInputSchema.safeParse(slide);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    error: result.error.issues[0]?.message ?? "Invalid slide",
  };
}

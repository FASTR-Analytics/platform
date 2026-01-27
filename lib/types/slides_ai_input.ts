import { z } from "zod";

// Individual figure schemas (unnested for type inference)

export const AiTextBlockSchema = z.object({
  type: z.literal("text").describe("Block type identifier for text content"),
  markdown: z.string().max(5000).describe(
    "The text content in markdown format. Supports standard markdown syntax including headers, bold, italic, lists, and links. Maximum 5000 characters.",
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

export const AiMetricQuerySchema = z.object({
  metricId: z.string().describe(
    "The unique ID of the metric/indicator to query. This metric must exist in the project's data.",
  ),
  disaggregations: z.array(z.string()).optional().describe(
    "Optional: Array of disaggregation dimensions to break down the data by, e.g., ['gender', 'age_group']. Each dimension splits the data into separate series.",
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
      "The time granularity to filter by: 'period_id' for months, 'quarter_id' for quarters, or 'year' for years",
    ),
    min: z.number().describe(
      "The minimum time period value (inclusive). Use period IDs like 202401 for January 2024, quarter IDs like 20241 for Q1 2024, or years like 2024.",
    ),
    max: z.number().describe(
      "The maximum time period value (inclusive). Same format as min.",
    ),
  }).optional().describe(
    "Optional: Filter to limit the time range of data shown. Useful for showing only recent data or a specific historical period.",
  ),
});

export const AiFigureFromMetricSchema = z.object({
  type: z.literal("from_metric").describe(
    "Block type identifier for figures created from metric data with custom configuration",
  ),
  metricQuery: AiMetricQuerySchema.describe(
    "The metric query parameters specifying what data to visualize.",
  ),
  chartType: z.enum(["bar", "line", "table"]).optional().describe(
    "Optional: The visualization type - 'bar' for bar charts, 'line' for line charts, or 'table' for data tables. If not specified, an appropriate type will be chosen automatically.",
  ),
});

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
  AiFigureCustomSchema,
]);

export const AiContentBlockInputSchema = z.union([
  AiTextBlockSchema,
  AiFigureFromVisualizationSchema,
  AiFigureFromMetricSchema,
  AiFigureCustomSchema,
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
  heading: z.string().min(1).max(200).describe(
    "Required: The slide heading/title that appears at the top of the slide. Should clearly describe what this slide is about. Minimum 1 character, maximum 200 characters.",
  ),
  blocks: z.array(AiContentBlockInputSchema).max(10).describe(
    "Required: Array of content blocks (text and/or figures) to display on this slide. Blocks can be text (markdown), figures from existing visualizations, figures from metrics with custom config, or figures from custom data. The layout will be automatically optimized. Maximum 10 blocks per slide.",
  ),
});

export const AiSlideInputSchema = z.union([
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiContentSlideSchema,
]);

// Inferred types (single source of truth)

export type AiTextBlock = z.infer<typeof AiTextBlockSchema>;
export type AiFigureFromVisualization = z.infer<typeof AiFigureFromVisualizationSchema>;
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

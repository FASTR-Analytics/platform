import { z } from "zod";
import {
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "../consts.ts";
import { configDStrict } from "./_metric_installed.ts";
import { presentationObjectConfigTStrict } from "./_presentation_object_config.ts";
import { ROLLUP_DIMENSIONS } from "../rollup.ts";

// ============================================================================
// Shared filter schema - DERIVED from storage schema (configDStrict.filterBy)
//
// Field names match storage: disOpt, values (not col, vals)
// Type matches storage: values is (string | number)[] with .min(1)
// ============================================================================

const aiFilterElementSchema = configDStrict.shape.filterBy.element;

// ============================================================================
// Metric query schema
// ============================================================================

export const AiMetricQuerySchema = z.object({
  metricId: z
    .string()
    .describe(
      "The unique ID of the metric to query. This metric must exist in the project's data.",
    ),
  disaggregations: z
    .array(configDStrict.shape.disaggregateBy.element.shape.disOpt)
    .optional()
    .describe(
      "Optional: Array of disaggregation dimensions to break down the data by. Use dimension names from get_available_metrics (e.g., 'admin_area_2', 'indicator_common_id'). Time disaggregations: 'period_id' (by specific month), 'year' (by year), 'month' (1-12, by month-of-year for seasonal patterns).",
    ),
  filters: z
    .array(aiFilterElementSchema)
    .optional()
    .describe(
      "Optional: Array of filters to limit which data is displayed. Each filter has 'disOpt' (dimension name) and 'values' (array of values to include). Values must exist in the data.",
    ),
  // EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
  // AI provides dates in flexible format (YYYY or YYYYMM), system converts using
  // metric's mostGranularTimePeriodColumnInResultsFile. See build_config_from_metric.ts.
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
  valuesFilter: configDStrict.shape.valuesFilter
    .describe(
      "Optional: Array of value property names to include in the results. If omitted, all value properties are returned. Use the value property names shown by get_available_metrics.",
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
  // DERIVED from storage schema (same as AiMetricQuerySchema)
  filters: z
    .array(aiFilterElementSchema)
    .optional()
    .describe(
      "Optional: Filters to limit which data is displayed. Each filter has 'disOpt' (dimension name from preset's 'Filterable by' list) and 'values' (array of values to include).",
    ),
  valuesFilter: configDStrict.shape.valuesFilter
    .describe(
      "Optional: Which value properties to show. Array of value property names from get_available_metrics. If omitted, the preset's default is used.",
    ),
  // EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
  // See comment in AiMetricQuerySchema and build_config_from_metric.ts.
  startDate: z
    .number()
    .optional()
    .describe(
      "Optional: Start of time range. Format: YYYY for years (2023), YYYYMM for months (202301). System converts to metric's native format. Must be used together with endDate.",
    ),
  endDate: z
    .number()
    .optional()
    .describe(
      "Optional: End of time range. Must be used together with startDate.",
    ),
});

// ============================================================================
// Figure config PATCH schema — DERIVED from the storage schema (configDStrict +
// caption fields). ONE base schema for every AI config-edit surface: the
// figure tools (update_figure / update_report_figure) use it unchanged;
// the viz editor extends it with `type` + `timeseriesGrouping`
// (AiVizConfigUpdateSchema below). The data-shape subset a figure needs;
// style (`config.s`) is excluded by design.
// ============================================================================

export const AiFigureConfigPatchSchema = z.object({
  // ── config.d (data spec) ──
  // NOTE: chart `type` is intentionally NOT editable — the figure keeps its type.
  valuesDisDisplayOpt: configDStrict.shape.valuesDisDisplayOpt.optional()
    .describe(
      "Display slot for the value dimension — where a metric's MULTIPLE data "
      + "values (e.g. actual vs expected) are laid out. Valid slots depend on "
      + "the figure's type, and it has no effect at all on a figure showing a "
      + "single data value. It is NOT a label, caption or styling control.",
    ),
  valuesFilter: z.union([configDStrict.shape.valuesFilter, z.null()]).optional()
    .describe("Which value properties to show, or null to show all."),
  disaggregateBy: configDStrict.shape.disaggregateBy.optional()
    .describe(
      "Replaces ALL disaggregations. Each is { disOpt, disDisplayOpt }; set a "
      + "dimension's disDisplayOpt to 'replicant' to replicate by it. An "
      + "existing roll-up flag is carried over onto the same dimension — "
      + "unless ANY entry states its own `rollup` field, in which case the "
      + "provided flags replace all existing ones (at most one entry may be "
      + "flagged; an unavailable flag is an error). Prefer `rollupDimension` "
      + "for roll-up changes.",
    ),
  filterBy: configDStrict.shape.filterBy.optional()
    .describe("Replaces ALL data filters. Empty array clears."),
  selectedReplicantValue: z.union([z.string(), z.null()]).optional()
    .describe(
      "Which replicant value to show (e.g. 'opd'); null to clear. Only "
      + "meaningful when a disaggregation is displayed as 'replicant'.",
    ),
  rollupDimension: z.union([z.enum(ROLLUP_DIMENSIONS), z.null()]).optional()
    .describe(
      "Add a roll-up total row ('National' / 'All facilities') collapsing this "
      + "dimension — must be a disaggregated admin level or facility column "
      + "(constraints apply; error if unavailable); null to remove the roll-up.",
    ),
  rollupPosition: z.enum(["bottom", "top"]).optional()
    .describe("'top' or 'bottom'; defaults to bottom."),
  // EXCEPTION: simpler abstraction than the full periodFilter union. An
  // omitted max stores a `from_month` filter ("to present" — the range
  // extends as new data lands); an omitted min anchors to the data's
  // earliest period. See applyFigureConfigPatch.
  periodFilter: z.union([
    z.object({
      min: z.number().optional().describe(
        "Start period (YYYY / YYYYQ / YYYYMM). Omit to start at the earliest available data.",
      ),
      max: z.number().optional().describe(
        "End period (same format). Omit for 'to present' — the range then extends automatically as new data lands.",
      ),
    }),
    z.null(),
  ]).optional().describe("Time range filter, or null to clear."),

  // ── config.t (captions) ──
  caption: presentationObjectConfigTStrict.shape.caption.optional()
    .describe("Main chart/table title."),
  subCaption: presentationObjectConfigTStrict.shape.subCaption.optional()
    .describe("Subtitle text."),
  footnote: presentationObjectConfigTStrict.shape.footnote.optional()
    .describe("Footnote text."),
});

export type AiFigureConfigPatch = z.infer<typeof AiFigureConfigPatchSchema>;

// The viz editor's superset: same base patch plus the two fields only that
// surface may set. A `type` change runs convertVisualizationType (the same
// transform as the editor's type dropdown) before the rest of the patch
// applies — see applyFigureConfigPatch.
export const AiVizConfigUpdateSchema = AiFigureConfigPatchSchema.extend({
  type: configDStrict.shape.type.optional().describe(
    "Presentation type. Changing it converts the config the same way the "
    + "editor's type dropdown does (slots remapped, style resets applied); "
    + "fields you supply in the same call win over the conversion's choices.",
  ),
  timeseriesGrouping: configDStrict.shape.timeseriesGrouping.describe(
    "How to group the time axis. Only valid when the (resulting) presentation "
    + "type is timeseries.",
  ),
});

export type AiVizConfigUpdate = z.infer<typeof AiVizConfigUpdateSchema>;

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
  layoutPreference: z
    .enum(["cols", "rows"])
    .optional()
    .describe(
      "Optional: Layout preference for arranging content blocks. 'cols' places blocks side-by-side in columns. 'rows' stacks blocks vertically. If omitted, the layout is automatically optimized. Only set this when you have a specific reason; omit it to let the auto-optimizer decide.",
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

import { _GLOBAL_LAYOUT_COLUMNS } from "@timroberton/panther";
import { z } from "zod";
import {
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "../consts.ts";
import {
  configDStrict,
  relativePeriodFilterSchema,
} from "./_metric_installed.ts";
import {
  DECK_BLUEPRINT_MAX_BLOCKS,
  DECK_BLUEPRINT_SLIDE_WORDS_MAX,
} from "./_deck_blueprint.ts";
import { presentationObjectConfigTStrict } from "./_presentation_object_config.ts";
import { ROLLUP_DIMENSIONS } from "../rollup.ts";
import {
  contentSlideSchema,
  coverSlideSchema,
  imageBlockSchema,
  sectionSlideSchema,
} from "./_slide_config.ts";
import { slideDeckConfigSchema } from "./_slide_deck_config.ts";
import {
  COVER_TEXT_STYLES,
  SECTION_TEXT_STYLES,
  type Slide,
  type SlideTextStyle,
  SPLIT_SIZES_PCT,
  TEXT_BACKGROUND_KEYS,
} from "./slides.ts";

// ============================================================================
// Shared filter and disaggregation schemas - DERIVED from storage schema
// (configDStrict.filterBy, configDStrict.disaggregateBy)
//
// Field names match storage: disOpt, values (not col, vals)
// Type matches storage: values is (string | number)[] with .min(1)
//
// A tool input refuses an undeclared key, so every object borrowed from a
// storage schema is rebuilt closed here. The storage schema stays open,
// because stored rows that still carry a retired key would otherwise throw.
// ============================================================================

const aiFilterElementSchema = z.strictObject(
  configDStrict.shape.filterBy.element.shape,
);
const aiDisaggregationSchema = z.strictObject(
  configDStrict.shape.disaggregateBy.element.shape,
);

// ============================================================================
// Metric query schema
// ============================================================================

export const AiMetricQuerySchema = z.strictObject({
  metricId: z
    .string()
    .describe(
      "The unique ID of the metric to query. This metric must exist in the results package being read.",
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
      "Optional: Array of filters to limit which data is displayed. Each filter has 'disOpt' (dimension name) and 'values' (array of value ids to include). get_dimension_values lists a dimension's values.",
    ),
  // EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
  // AI provides dates in flexible format (YYYY or YYYYMM), system converts using
  // metric's mostGranularTimePeriodColumnInResultsFile. See build_config_from_preset.ts.
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

export const AiDimensionValuesQuerySchema = z.strictObject({
  metricId: z
    .string()
    .describe(
      "The metric whose dimensions to list, by the id get_available_metrics gives.",
    ),
  disOpt: configDStrict.shape.disaggregateBy.element.shape.disOpt
    .optional()
    .describe(
      "Optional: one dimension of the metric, to list its values page by page. Omit to list every dimension with its count.",
    ),
  search: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      "Optional: terms to find values by. A value matches when its line, label and facts included, holds every word of one term, case and accents ignored. Without disOpt, every dimension is searched.",
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Optional, with disOpt only: how many values to skip (matching values, with search). Each page names the offset of the next.",
    ),
});

// Individual figure schemas (unnested for type inference)

export const AiTextBlockSchema = z.strictObject({
  type: z.literal("text"),
  markdown: z
    .string()
    .describe(
      `The text content in markdown format. Supports standard markdown syntax including headers, bold, italic, lists, and links. WORD COUNT: Target ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words TOTAL across all text blocks per slide (adjust down if slide has charts/figures), absolute maximum ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words TOTAL per slide (${DECK_BLUEPRINT_SLIDE_WORDS_MAX} on a slide built to a blueprint's layoutRows, for text kept word for word). IMPORTANT: Tables-in-markdown are NOT ALLOWED. If you need to display tabular data, use a 'from_metric' block with a table preset.`,
    )
    // The bound per block is the blueprint slide's; the per-slide totals
    // (validateSlideTotalWordCount) hold every other slide to the usual one.
    .refine(
      (text) => {
        const wordCount = text.trim().split(/\s+/).length;
        return wordCount <= DECK_BLUEPRINT_SLIDE_WORDS_MAX;
      },
      {
        message:
          `Individual text block exceeds ${DECK_BLUEPRINT_SLIDE_WORDS_MAX} words`,
      },
    ),
  style: z
    .strictObject({
      textBackground: z
        .enum(TEXT_BACKGROUND_KEYS)
        .optional()
        .describe(
          "Optional: a panel behind the text. 'none' (the default), 'grey', 'primary' (the theme's colour), 'success' (green) or 'danger' (red).",
        ),
    })
    .optional()
    .describe(
      "Optional: the block's style. In update_slide's blockUpdates, a style left out keeps the replaced text block's style.",
    ),
});

export const AiFigureFromMetricSchema = z.strictObject({
  type: z.literal("from_metric"),
  metricId: z
    .string()
    .describe(
      "The unique ID of the metric to visualize. Must exist in the results package the product is attached to.",
    ),
  vizPresetId: z
    .string()
    .describe(
      "The ID of one of this metric's presets. Get available preset IDs from get_available_metrics.",
    ),
  chartTitle: z.string().max(200).describe("Title displayed above the figure"),
  selectedReplicant: z
    .string()
    .optional()
    .describe(
      "REQUIRED when the preset is marked `REQUIRES selectedReplicant` in get_available_metrics; the value is the id of one value of the dimension named there (e.g. 'anc1'), as get_dimension_values lists it. Omit otherwise.",
    ),
  // DERIVED from storage schema (same as AiMetricQuerySchema)
  filters: z
    .array(aiFilterElementSchema)
    .optional()
    .describe(
      "Optional: Filters to limit which data is displayed. Each filter has 'disOpt' (dimension name from the preset's 'filters:' list in get_available_metrics) and 'values' (array of value ids to include, as get_dimension_values lists them).",
    ),
  valuesFilter: configDStrict.shape.valuesFilter
    .describe(
      "Optional: Which value properties to show. Array of value property names from get_available_metrics. If omitted, the preset's default is used.",
    ),
  // EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
  // See comment in AiMetricQuerySchema and build_config_from_preset.ts.
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
  // DERIVED from storage (the relative members of configDStrict's
  // periodFilter): a period that names no dates and keeps moving with the
  // data. Mutually exclusive with startDate/endDate.
  relativePeriod: relativePeriodFilterSchema.optional().describe(
    "Optional: a relative time range that moves with the data (e.g. { filterType: 'last_n_months', nMonths: 12 }). Use instead of startDate/endDate, never with them.",
  ),
});

// ============================================================================
// Figure config PATCH schema: DERIVED from the storage schema (configDStrict +
// caption fields). ONE base schema for every AI config-edit surface: the
// figure tools (update_figure / update_report_figure) use it unchanged;
// the viz editor extends it with `type` + `timeseriesGrouping`
// (AiVizConfigUpdateSchema below). The data-shape subset a figure needs;
// style (`config.s`) is excluded by design.
// ============================================================================

export const AiFigureConfigPatchSchema = z.strictObject({
  // ── config.d (data spec) ──
  // NOTE: chart `type` is intentionally NOT editable. The figure keeps its type.
  valuesDisDisplayOpt: configDStrict.shape.valuesDisDisplayOpt.optional()
    .describe(
      "Display slot for the value dimension — where a metric's MULTIPLE data " +
        "values (e.g. actual vs expected) are laid out. Valid slots depend on " +
        "the figure's type, and it has no effect at all on a figure showing a " +
        "single data value. It is NOT a label, caption or styling control.",
    ),
  valuesFilter: z.union([configDStrict.shape.valuesFilter, z.null()]).optional()
    .describe("Which value properties to show, or null to show all."),
  disaggregateBy: z.array(aiDisaggregationSchema).optional()
    .describe(
      "Replaces ALL disaggregations. Each is { disOpt, disDisplayOpt }; set a " +
        "dimension's disDisplayOpt to 'replicant' to replicate by it. An " +
        "existing roll-up flag is carried over onto the same dimension — " +
        "unless ANY entry states its own `rollup` field, in which case the " +
        "provided flags replace all existing ones (at most one entry may be " +
        "flagged; an unavailable flag is an error). Prefer `rollupDimension` " +
        "for roll-up changes.",
    ),
  filterBy: z.array(aiFilterElementSchema).optional()
    .describe("Replaces ALL data filters. Empty array clears."),
  selectedReplicantValue: z.union([z.string(), z.null()]).optional()
    .describe(
      "Which replicant value to show (e.g. 'opd'); null to clear. Only " +
        "meaningful when a disaggregation is displayed as 'replicant'.",
    ),
  rollupDimension: z.union([z.enum(ROLLUP_DIMENSIONS), z.null()]).optional()
    .describe(
      "Add a roll-up total row ('National' / 'All facilities') collapsing this " +
        "dimension — must be a disaggregated admin level or facility column " +
        "(constraints apply; error if unavailable); null to remove the roll-up.",
    ),
  rollupPosition: z.enum(["bottom", "top"]).optional()
    .describe("'top' or 'bottom'; defaults to bottom."),
  // EXCEPTION: simpler abstraction than the full periodFilter union. An
  // omitted max stores a `from_month` filter ("to present": the range
  // extends as new data lands); an omitted min anchors to the data's
  // earliest period. See applyFigureConfigPatch.
  periodFilter: z.union([
    z.strictObject({
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
// applies: see applyFigureConfigPatch.
export const AiVizConfigUpdateSchema = AiFigureConfigPatchSchema.extend({
  type: configDStrict.shape.type.optional().describe(
    "Presentation type. Changing it converts the config the same way the " +
      "editor's type dropdown does (slots remapped, style resets applied); " +
      "fields you supply in the same call win over the conversion's choices.",
  ),
  timeseriesGrouping: configDStrict.shape.timeseriesGrouping.describe(
    "How to group the time axis. Only valid when the (resulting) presentation " +
      "type is timeseries.",
  ),
});

export type AiVizConfigUpdate = z.infer<typeof AiVizConfigUpdateSchema>;

// Union schemas

const imageBlock = imageBlockSchema.shape;

export const AiImageBlockSchema = z.strictObject({
  type: imageBlock.type,
  imgFile: imageBlock.imgFile.describe(
    "File name of one of the instance's image assets, exactly as get_image_assets lists it.",
  ),
  style: z.strictObject(imageBlock.style.unwrap().shape).optional().describe(
    "Optional: imgFit 'contain' (the default) shows the whole image inside its cell; 'cover' fills the cell and crops the overflow. imgAlign ('center', the default, 'top', 'bottom', 'left', 'right') places the image within its cell.",
  ),
});

export const AiContentBlockInputSchema = z.union([
  AiTextBlockSchema,
  AiFigureFromMetricSchema,
  AiImageBlockSchema,
]);

// Layout spec schemas (for AI layout control)

export const LayoutCellSchema = z.strictObject({
  block: z.union([
    z.string().describe(
      "Existing block ID (from get_slides or from the result of the write that made the block) to keep unchanged",
    ),
    AiContentBlockInputSchema.describe("New block content to create"),
  ]),
  span: z
    .number()
    .int()
    .min(1)
    .max(_GLOBAL_LAYOUT_COLUMNS)
    .optional()
    .describe(
      `Column width (1-${_GLOBAL_LAYOUT_COLUMNS}). Spans per row must sum to ${_GLOBAL_LAYOUT_COLUMNS}. Omit for equal split.`,
    ),
});

// Why a row's spans cannot fill its columns, or undefined when they can: a
// row of one cell spans them all, spans given for every cell sum to them, and
// spans given for some leave at least one column for each cell without one,
// which share the rest (normalizeSpans).
function layoutRowSpanError(
  row: readonly { span?: number }[],
): string | undefined {
  const given = row.flatMap((c) => c.span === undefined ? [] : [c.span]);
  const used = given.reduce((sum, s) => sum + s, 0);
  const without = row.length - given.length;
  if (row.length === 1) {
    return without === 1 || used === _GLOBAL_LAYOUT_COLUMNS
      ? undefined
      : `A row with one cell spans all ${_GLOBAL_LAYOUT_COLUMNS} columns: omit its span.`;
  }
  if (without === 0) {
    return used === _GLOBAL_LAYOUT_COLUMNS
      ? undefined
      : `Spans in row sum to ${used}, must sum to ${_GLOBAL_LAYOUT_COLUMNS}. Got: [${
        given.join(", ")
      }]`;
  }
  const left = _GLOBAL_LAYOUT_COLUMNS - used;
  return left >= without
    ? undefined
    : `Specified spans sum to ${used} of the row's ${_GLOBAL_LAYOUT_COLUMNS} columns, leaving ${
      Math.max(left, 0)
    } for ${without} cell(s) without a span, which need at least 1 each.`;
}

export const LayoutSpecSchema = z
  .array(
    z
      .array(LayoutCellSchema)
      .min(1)
      .max(3)
      .superRefine((row, ctx) => {
        const message = layoutRowSpanError(row);
        if (message !== undefined) ctx.addIssue({ code: "custom", message });
      }),
  )
  .min(1)
  .max(3)
  .describe("Rows (top→bottom), each containing columns (left→right).");

export type LayoutCell = z.infer<typeof LayoutCellSchema>;
export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;

// Slide schemas: every stored field of a slide type but its layout, each
// derived from the stored schema. server/tests/ai_slide_schema_test.ts fails
// when a stored field is in neither these nor its list of exclusions.

const cover = coverSlideSchema.shape;
const section = sectionSlideSchema.shape;
const content = contentSlideSchema.shape;
const split = content.split.unwrap().shape;
const [plainFill, patternFill, imageFill] = split.fill.options;

type TextStyleRange = Pick<
  SlideTextStyle<unknown>,
  "sizeDefault" | "min" | "max" | "boldDefault"
>;

function relFontSizeField(
  field: z.ZodOptional<z.ZodNumber>,
  style: TextStyleRange,
  label: string,
) {
  return field.unwrap().min(style.min).max(style.max).optional().describe(
    `Optional: the ${label}'s size, ${style.min} to ${style.max}; ${style.sizeDefault} when unset.`,
  );
}

function boldField(
  field: z.ZodOptional<z.ZodBoolean>,
  style: TextStyleRange,
  label: string,
) {
  return field.describe(
    `Optional: whether the ${label} is bold; ${
      style.boldDefault ? "bold" : "not bold"
    } when unset.`,
  );
}

function italicField(field: z.ZodOptional<z.ZodBoolean>, label: string) {
  return field.describe(
    `Optional: whether the ${label} is italic; not italic when unset.`,
  );
}

function logoVisibilityField(
  field: typeof cover.showLogos,
  logos: string,
) {
  return field.describe(
    `Optional: 'show' or 'hide' the deck's ${logos} on this slide. 'inherit', like leaving it unset, follows the deck's settings.`,
  );
}

const AiSplitSchema = z
  .strictObject({
    placement: split.placement.describe(
      "The side of the page the panel sits on.",
    ),
    sizeAsPct: split.sizeAsPct
      .refine((v) => SPLIT_SIZES_PCT.some((s) => s === v), {
        message: `sizeAsPct must be one of ${SPLIT_SIZES_PCT.join(", ")}`,
      })
      .describe(
        `The panel's width in percent of the page: one of ${
          SPLIT_SIZES_PCT.join(", ")
        }.`,
      ),
    fill: z.discriminatedUnion("type", [
      z.strictObject(plainFill.shape),
      z.strictObject(patternFill.shape),
      z.strictObject(imageFill.shape),
    ]).describe(
      "{ type: 'plain' } fills the panel with the theme's colour; { type: 'pattern', patternType } draws a pattern: ovals, circles, dots, lines, grid, chevrons, waves or noise; { type: 'image', imgFile } shows one of the instance's image assets, named as get_image_assets lists it.",
    ),
  })
  .describe(
    "Optional: a panel down one side of the slide, beside the header and the blocks.",
  );

const AI_COVER_SETTINGS = {
  showLogos: logoVisibilityField(cover.showLogos, "cover logos"),
  titleTextRelFontSize: relFontSizeField(
    cover.titleTextRelFontSize,
    COVER_TEXT_STYLES.title,
    "title",
  ),
  titleBold: boldField(cover.titleBold, COVER_TEXT_STYLES.title, "title"),
  titleItalic: italicField(cover.titleItalic, "title"),
  subTitleTextRelFontSize: relFontSizeField(
    cover.subTitleTextRelFontSize,
    COVER_TEXT_STYLES.subtitle,
    "subtitle",
  ),
  subTitleBold: boldField(
    cover.subTitleBold,
    COVER_TEXT_STYLES.subtitle,
    "subtitle",
  ),
  subTitleItalic: italicField(cover.subTitleItalic, "subtitle"),
  presenterTextRelFontSize: relFontSizeField(
    cover.presenterTextRelFontSize,
    COVER_TEXT_STYLES.presenter,
    "presenter",
  ),
  presenterBold: boldField(
    cover.presenterBold,
    COVER_TEXT_STYLES.presenter,
    "presenter",
  ),
  presenterItalic: italicField(cover.presenterItalic, "presenter"),
  dateTextRelFontSize: relFontSizeField(
    cover.dateTextRelFontSize,
    COVER_TEXT_STYLES.date,
    "date",
  ),
  dateBold: boldField(cover.dateBold, COVER_TEXT_STYLES.date, "date"),
  dateItalic: italicField(cover.dateItalic, "date"),
};

const AI_SECTION_SETTINGS = {
  sectionTextRelFontSize: relFontSizeField(
    section.sectionTextRelFontSize,
    SECTION_TEXT_STYLES.sectionTitle,
    "section title",
  ),
  sectionTitleBold: boldField(
    section.sectionTitleBold,
    SECTION_TEXT_STYLES.sectionTitle,
    "section title",
  ),
  sectionTitleItalic: italicField(section.sectionTitleItalic, "section title"),
  smallerSectionTextRelFontSize: relFontSizeField(
    section.smallerSectionTextRelFontSize,
    SECTION_TEXT_STYLES.sectionSubtitle,
    "section subtitle",
  ),
  sectionSubTitleBold: boldField(
    section.sectionSubTitleBold,
    SECTION_TEXT_STYLES.sectionSubtitle,
    "section subtitle",
  ),
  sectionSubTitleItalic: italicField(
    section.sectionSubTitleItalic,
    "section subtitle",
  ),
};

const AI_CONTENT_SETTINGS = {
  subHeader: content.subHeader.unwrap().max(300).optional().describe(
    "Optional: a line under the header. Maximum 300 characters.",
  ),
  date: content.date.unwrap().max(100).optional().describe(
    "Optional: a date or period shown on the slide. Maximum 100 characters.",
  ),
  footer: content.footer.unwrap().max(200).optional().describe(
    "Optional: the slide's footer text, shown only when the deck sets no footer text of its own. Maximum 200 characters.",
  ),
  showHeaderLogos: logoVisibilityField(content.showHeaderLogos, "header logos"),
  showFooterLogos: logoVisibilityField(content.showFooterLogos, "footer logos"),
  split: AiSplitSchema.optional(),
};

export const AiCoverSlideSchema = z.strictObject({
  type: cover.type,
  title: cover.title.max(200).describe(
    "The main title of the presentation, displayed prominently on the cover slide. Maximum 200 characters.",
  ),
  subtitle: cover.subtitle.unwrap().max(500).optional().describe(
    "Optional: A subtitle or tagline that provides additional context about the presentation. Maximum 500 characters.",
  ),
  presenter: cover.presenter.unwrap().max(200).optional().describe(
    "Optional: The name(s) of the presenter(s) or author(s), e.g., 'Dr. Jane Smith' or 'Health Analytics Team'. Maximum 200 characters.",
  ),
  date: cover.date.unwrap().max(100).optional().describe(
    "Optional: The presentation date or time period, e.g., 'January 2024' or 'Q4 2023'. Maximum 100 characters.",
  ),
  ...AI_COVER_SETTINGS,
});

export const AiSectionSlideSchema = z.strictObject({
  type: section.type,
  sectionTitle: section.sectionTitle.min(1).max(200).describe(
    "Required: The section title that will be displayed prominently. Use this to mark major transitions in the presentation, e.g., 'Introduction', 'Key Findings', 'Recommendations'. Minimum 1 character, maximum 200 characters.",
  ),
  sectionSubtitle: section.sectionSubtitle.unwrap().max(500).optional()
    .describe(
      "Optional: Additional context or description for this section. Maximum 500 characters.",
    ),
  ...AI_SECTION_SETTINGS,
});

const contentHeaderField = content.header.unwrap().max(200).optional()
  .describe(
    "Optional: The slide header/title that appears at the top of the slide. Should clearly describe what this slide is about. Maximum 200 characters.",
  );

export const AiContentSlideSchema = z.strictObject({
  type: content.type,
  header: contentHeaderField,
  ...AI_CONTENT_SETTINGS,
  layoutPreference: z
    .enum(["cols", "rows"])
    .optional()
    .describe(
      "Optional: Layout preference for arranging content blocks. 'cols' places blocks side-by-side in columns. 'rows' stacks blocks vertically. If omitted, the layout is automatically optimized. Only set this when you have a specific reason; omit it to let the auto-optimizer decide.",
    ),
  blocks: z
    .array(AiContentBlockInputSchema)
    .describe(
      `Required: Array of content blocks to display on this slide. A block is text (markdown), a figure built from a metric plus one of its presets, or an image asset. The layout will be automatically optimized unless layoutRows is given. Maximum ${MAX_CONTENT_BLOCKS} blocks per slide (${DECK_BLUEPRINT_MAX_BLOCKS} with layoutRows).`,
    ),
  // EXCEPTION: a simpler form than a LayoutNode. The blocks fill the grid in
  // reading order (row by row, left to right), so the cells need no ids.
  // Converted in one place: convert_ai_input_to_slide.ts.
  layoutRows: z
    .array(z.array(z.number().int().min(1).max(12)).min(1).max(4))
    .min(1)
    .max(4)
    .optional()
    .describe(
      "Optional: an exact layout instead of the automatic one, as rows of column spans; each row's spans sum to 12, and the blocks fill the cells in order, row by row. E.g. [[8, 4]] puts block 1 at 8/12 and block 2 at 4/12 side by side; [[12], [6, 6]] puts block 1 across the top and blocks 2 and 3 below. The number of cells must equal the number of blocks. Use it when told to match a given layout (a blueprint); otherwise omit it.",
    ),
});

// Mirrors the Slide storage union, so a field aimed at the wrong slide type
// is unrepresentable in the tool call.
export const AiSlideUpdateSchema = z
  .discriminatedUnion("type", [
    AiCoverSlideSchema.partial().required({ type: true }),
    AiSectionSlideSchema.partial().required({ type: true }),
    z.strictObject({
      type: content.type,
      header: contentHeaderField,
      ...AI_CONTENT_SETTINGS,
      split: AiSplitSchema.nullable().optional().describe(
        "Optional: a panel down one side of the slide, beside the header and the blocks. null removes the panel.",
      ),
      blockUpdates: z
        .array(
          z.strictObject({
            blockId: z.string().describe(
              "Block ID, from get_slides or from the result of the write that made the block",
            ),
            newContent: AiContentBlockInputSchema,
          }),
        )
        .optional()
        .describe(
          `REPLACE specific blocks by ID with new content. Max ${MAX_CONTENT_BLOCKS} blocks. Use this to swap a block for a DIFFERENT figure (a different metric or a different chart type) or to change a text block. To merely TWEAK an existing figure (e.g. its replicant, filters, captions), use update_figure instead: replacing a figure block here REBUILDS it from scratch and DISCARDS any prior edits. No markdown tables: use a from_metric block with a table-type preset (vizPresetId) instead. Mutually exclusive with layoutChange.`,
        ),
      layoutChange: z
        .strictObject({ layout: LayoutSpecSchema })
        .optional()
        .describe(
          `Restructure the layout: add, remove or rearrange blocks, or change their spans. The layout names ALL blocks that will be on the slide: an existing block it does not name is REMOVED. Name existing blocks by ID to keep them; give inline content for new ones. Prefer balanced spans (e.g. ${
            _GLOBAL_LAYOUT_COLUMNS / 2
          }+${_GLOBAL_LAYOUT_COLUMNS / 2} or ${
            (_GLOBAL_LAYOUT_COLUMNS * 2) / 3
          }+${
            _GLOBAL_LAYOUT_COLUMNS / 3
          }) unless the user asks for specific proportions. Mutually exclusive with blockUpdates.`,
        ),
    }),
  ])
  .describe(
    "Per-type update. `type` must match the slide's type. Name only the fields to change.",
  );

// Inferred types (single source of truth)

export type AiTextBlock = z.infer<typeof AiTextBlockSchema>;
export type AiMetricQuery = z.infer<typeof AiMetricQuerySchema>;
export type AiDimensionValuesQuery = z.infer<
  typeof AiDimensionValuesQuerySchema
>;
export type AiFigureFromMetric = z.infer<typeof AiFigureFromMetricSchema>;
export type AiContentBlockInput = z.infer<typeof AiContentBlockInputSchema>;
export type AiContentSlideInput = z.infer<typeof AiContentSlideSchema>;
export type AiSlideInput =
  | z.infer<typeof AiCoverSlideSchema>
  | z.infer<typeof AiSectionSlideSchema>
  | AiContentSlideInput;
export type AiSlideUpdate = z.infer<typeof AiSlideUpdateSchema>;

const SETTING_KEYS = {
  cover: z.strictObject(AI_COVER_SETTINGS).keyof().options,
  section: z.strictObject(AI_SECTION_SETTINGS).keyof().options,
  content: z.strictObject(AI_CONTENT_SETTINGS).keyof().options,
};

// replace_slide's input: a slide that keeps its type keeps the settings the
// input does not name.
export function withKeptSlideSettings(
  previous: Slide,
  input: AiSlideInput,
): AiSlideInput {
  if (previous.type === "cover" && input.type === "cover") {
    return { ...keptSettings(previous, SETTING_KEYS.cover, input), ...input };
  }
  if (previous.type === "section" && input.type === "section") {
    return { ...keptSettings(previous, SETTING_KEYS.section, input), ...input };
  }
  if (previous.type === "content" && input.type === "content") {
    return { ...keptSettings(previous, SETTING_KEYS.content, input), ...input };
  }
  return input;
}

function keptSettings<S extends Slide, K extends keyof S & string>(
  previous: S,
  keys: readonly K[],
  input: AiSlideInput,
): Partial<Pick<S, K>> {
  const kept: Partial<Pick<S, K>> = {};
  for (const key of keys) {
    if (!(key in input) && previous[key] !== undefined) {
      kept[key] = previous[key];
    }
  }
  return kept;
}

// ============================================================================
// Deck settings patch - DERIVED from storage schema (slideDeckConfigSchema)
// ============================================================================

const deck = slideDeckConfigSchema.shape;
const logos = deck.logos.shape;
const logoSection = logos.cover.shape;

const AiLogoSectionSchema = z.strictObject({
  ...logoSection,
  sizing: z.strictObject(logoSection.sizing.unwrap().shape).optional(),
});

export const AiDeckSettingsPatchSchema = z.strictObject({
  logos: z.strictObject({
    ...logos,
    cover: AiLogoSectionSchema,
    header: AiLogoSectionSchema,
    footer: AiLogoSectionSchema,
  }).optional().describe(
    "Optional: the deck's logos, replaced whole: availableCustom (the deck's own logos, each one of the instance's image assets) and, for cover, header and footer, the logos selected (each a built-in logo or one of availableCustom, drawn in this order), showByDefault (whether a slide shows them when its own setting is 'inherit') and an optional sizing ({ size, spacing }, each 'sm', 'md', 'lg' or 'xl').",
  ),
  // null stands for the stored field's absence, which JSON cannot send.
  globalFooterText: deck.globalFooterText.unwrap().nullable().optional()
    .describe(
      "Optional: text every content slide shows in place of its own footer. null turns it off, so each content slide shows its own footer.",
    ),
  useWatermark: deck.useWatermark.optional().describe(
    "Optional: whether every slide shows watermarkText as a watermark.",
  ),
  watermarkText: deck.watermarkText.optional().describe(
    "Optional: the watermark's text, shown while useWatermark is true.",
  ),
});

export type AiDeckSettingsPatch = z.infer<typeof AiDeckSettingsPatchSchema>;

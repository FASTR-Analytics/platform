// =============================================================================
// Deck blueprint: a portable description of a slide deck, made from a real
// deck and applied to a deck in any instance (lib/deck_blueprint.ts holds the
// pure functions that make, check and apply one).
//
// A blueprint carries a deck's topics, the purpose and scaling rule of each,
// its slides as PATTERNS (layout, figure metric + preset, a writing brief per
// text block) and its look (theme and deck settings). It carries no country
// data: no figure rows, filter values, run or project ids, fixed dates, asset
// file names or written-out text, except text a person marked "keep word for
// word". Every country-specific part of the source becomes a slot that the
// target deck fills from its own data: a period ROLE instead of dates, a
// `filterIntent` sentence instead of filter values, an image slot instead of
// a picture.
//
// The format is a file people move between instances (and that a central
// library could later store as is), so it is versioned by `formatVersion`
// and every field the reader does not know is stripped by the schema.
// =============================================================================

import { z } from "zod";
import { TEXT_SIZE_KEYS } from "../consts.ts";
import { relativePeriodFilterSchema } from "./_metric_installed.ts";
import { SLIDE_DECK_THEMES } from "./_slide_deck_themes.ts";

export const DECK_BLUEPRINT_KIND = "fastr_deck_blueprint";
export const DECK_BLUEPRINT_FORMAT_VERSION = 1;
export const DECK_BLUEPRINT_FILE_SUFFIX = ".fastr-blueprint.json";

// The bound on every written field (a brief, a purpose, a rule, a name):
// generous, since briefs are the model's words, and assembleBlueprint cuts
// to it rather than refuse a whole draft over one long field.
export const DECK_BLUEPRINT_TEXT_MAX = 4000;

// The placeholders a footer or watermark pattern may hold. They are filled
// from the target instance and the chosen period when the look is applied;
// nothing else in a pattern is ever rewritten.
export const DECK_BLUEPRINT_PATTERN_TOKENS = [
  "{Country}",
  "{Period}",
  "{Year}",
] as const;

// ── Period roles ────────────────────────────────────────────────────────────
// A fixed date range in the source becomes a role. The person applying the
// blueprint picks the reporting period once; every role resolves from it
// (resolvePeriodRoles): the comparison period is the same months a year
// earlier, a trend window is `months` long and ends where the reporting
// period ends.

export const deckBlueprintPeriodRoleSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
  kind: z.enum(["reporting", "comparison", "trend"]),
  // The reporting period's usual length, or the trend window's length.
  // Unused for a comparison period, which copies the reporting length.
  months: z.number().int().min(1).max(120).optional(),
});

export type DeckBlueprintPeriodRole = z.infer<
  typeof deckBlueprintPeriodRoleSchema
>;

// ── Blocks ──────────────────────────────────────────────────────────────────

const textBlockPatternSchema = z.object({
  type: z.literal("text"),
  // What to write, in words: "3 bullets: the worst region, the size of the
  // drop against last year, the likely cause". Never country A's text.
  brief: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
  // Roughly how many words the source block held, so the new text keeps
  // the slide's density.
  targetWords: z.number().int().min(0).max(5000).optional(),
  textSize: z.enum(TEXT_SIZE_KEYS).optional(),
  textBackground: z.string().max(40).optional(),
  // Copied as written (translated into the target's language when that
  // differs): a methodology note, a definition, a fixed disclaimer.
  keepVerbatim: z.boolean(),
  verbatimText: z.string().max(40_000).optional(),
});

// How a figure's time range carries over: through a period role, as the
// source's relative filter (it stays relative), or as the preset's own.
const figurePeriodPatternSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: z.string().min(1) }),
  z.object({ kind: z.literal("relative"), filter: relativePeriodFilterSchema }),
  z.object({ kind: z.literal("preset") }),
]);

export type DeckBlueprintFigurePeriod = z.infer<
  typeof figurePeriodPatternSchema
>;

const figureBlockPatternSchema = z.object({
  type: z.literal("figure"),
  metricId: z.string().min(1),
  // One of the metric's presets: the target rebuilds the chart from it.
  vizPresetId: z.string().min(1),
  // What the chart is there to show, so the target can judge a stand-in.
  purpose: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
  // The source figure's chart type, for the review panel and the AI's
  // choice of a stand-in. Informational: the preset decides the type.
  chartType: z.string().max(40).optional(),
  period: figurePeriodPatternSchema,
  // Which rows to show, in words ("the region this slide is about", "the
  // indicators that dropped"), never as values.
  filterIntent: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
  captionBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
});

const imageSlotPatternSchema = z.object({
  type: z.literal("image_slot"),
  // What the source image showed, for the person who fills the slot.
  note: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
});

export const deckBlueprintBlockSchema = z.discriminatedUnion("type", [
  textBlockPatternSchema,
  figureBlockPatternSchema,
  imageSlotPatternSchema,
]);

export type DeckBlueprintBlock = z.infer<typeof deckBlueprintBlockSchema>;
export type DeckBlueprintTextBlock = z.infer<typeof textBlockPatternSchema>;
export type DeckBlueprintFigureBlock = z.infer<
  typeof figureBlockPatternSchema
>;

// ── Slides ──────────────────────────────────────────────────────────────────
// A content slide's layout is a grid: rows top to bottom, each a list of
// cells whose spans sum to 12. The editor's nested layouts flatten to it
// (gridFromLayout); the AI rebuilds a slide in exactly this grid.

export const DECK_BLUEPRINT_MAX_BLOCKS = 6;

// The words a slide built to a blueprint's exact layout may hold: a source
// slide kept word for word (a methodology page) is often far over the 180
// an AI-written slide gets, and splitting it changes the deck's shape.
export const DECK_BLUEPRINT_SLIDE_WORDS_MAX = 600;

const deckBlueprintCellSchema = z.object({
  span: z.number().int().min(1).max(12),
  block: deckBlueprintBlockSchema,
});

export type DeckBlueprintCell = z.infer<typeof deckBlueprintCellSchema>;

// The split panel beside a content slide. A picture fill becomes a plain
// one with a note: the picture is the source's asset.
const splitPatternSchema = z.object({
  placement: z.enum(["left", "right"]),
  sizeAsPct: z.number().min(1).max(90),
  fill: z.discriminatedUnion("type", [
    z.object({ type: z.literal("plain") }),
    z.object({
      type: z.literal("pattern"),
      patternType: z.enum([
        "ovals",
        "circles",
        "dots",
        "lines",
        "grid",
        "chevrons",
        "waves",
        "noise",
        "none",
      ]),
    }),
  ]),
  imageNote: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
});

export type DeckBlueprintSplit = z.infer<typeof splitPatternSchema>;

export const deckBlueprintSlideSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cover"),
    titleBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
    subtitleBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
    presenterBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
    dateBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
  }),
  z.object({
    type: z.literal("section"),
    titleBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
    subtitleBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
  }),
  z.object({
    type: z.literal("content"),
    headerBrief: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
    rows: z.array(z.array(deckBlueprintCellSchema).min(1).max(4)).min(1).max(
      4,
    ),
    split: splitPatternSchema.optional(),
  }),
]);

export type DeckBlueprintSlide = z.infer<typeof deckBlueprintSlideSchema>;
export type DeckBlueprintContentSlide = Extract<
  DeckBlueprintSlide,
  { type: "content" }
>;

// ── Topics ──────────────────────────────────────────────────────────────────

export const deckBlueprintTopicSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(DECK_BLUEPRINT_TEXT_MAX),
  // Why the topic is in the deck.
  purpose: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
  // How many slides it gets in the target, in plain words, judged against
  // the target's data: "One slide per region below 80% coverage; if none,
  // drop the topic and say so."
  scalingRule: z.string().max(DECK_BLUEPRINT_TEXT_MAX),
  // The source's slides for this topic, as patterns, in order. A topic that
  // repeats (one slide per region) usually holds one pattern.
  slides: z.array(deckBlueprintSlideSchema).min(1).max(150),
});

export type DeckBlueprintTopic = z.infer<typeof deckBlueprintTopicSchema>;

// ── Look ────────────────────────────────────────────────────────────────────

const logoSlotSchema = z.object({
  // How many logos the source showed there; the target picks its own.
  count: z.number().int().min(0).max(10),
  showByDefault: z.boolean(),
});

export const deckBlueprintLookSchema = z.object({
  theme: z.enum(SLIDE_DECK_THEMES),
  headerSize: z.number(),
  showPageNumbers: z.boolean(),
  useWatermark: z.boolean(),
  // The source's footer and watermark with their country-specific words
  // replaced by DECK_BLUEPRINT_PATTERN_TOKENS. Absent: the source had none.
  footerPattern: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
  watermarkPattern: z.string().max(DECK_BLUEPRINT_TEXT_MAX).optional(),
  logoSlots: z.object({
    cover: logoSlotSchema,
    header: logoSlotSchema,
    footer: logoSlotSchema,
  }),
});

export type DeckBlueprintLook = z.infer<typeof deckBlueprintLookSchema>;

// ── The blueprint ───────────────────────────────────────────────────────────

export const deckBlueprintSchema = z.object({
  kind: z.literal(DECK_BLUEPRINT_KIND),
  formatVersion: z.literal(DECK_BLUEPRINT_FORMAT_VERSION),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  createdAt: z.string(),
  // The source deck's title as text, for the person choosing a blueprint.
  // No instance, project or product id.
  sourceDeckLabel: z.string().max(300),
  // The language the briefs are written in (always English, so a blueprint
  // reads anywhere); generated text follows the target instance.
  language: z.literal("en"),
  look: deckBlueprintLookSchema,
  periodRoles: z.array(deckBlueprintPeriodRoleSchema).max(10),
  topics: z.array(deckBlueprintTopicSchema).min(1).max(300),
});

export type DeckBlueprint = z.infer<typeof deckBlueprintSchema>;

// ── What a deck records about the blueprint that built it ───────────────────
// Stored as JSON text in slide_decks.plan. A deck built from no blueprint
// keeps the plan column empty, and a plan that does not parse as this is
// read as none (readDeckBlueprintProvenance).

export const DECK_BLUEPRINT_PROVENANCE_KIND = "fastr_deck_blueprint_applied";

const resolvedPeriodSchema = z.object({
  roleId: z.string(),
  label: z.string(),
  start: z.number().int(),
  end: z.number().int(),
});

export type ResolvedBlueprintPeriod = z.infer<typeof resolvedPeriodSchema>;

export const deckBlueprintOutlineTopicSchema = z.object({
  topicId: z.string(),
  // Slides planned for the topic; 0 means the topic is dropped.
  slideCount: z.number().int().min(0).max(30),
  reason: z.string().max(1000),
  // One short line per slide, e.g. "Bo district".
  slideNotes: z.array(z.string().max(300)).max(30).optional(),
  standIns: z.array(z.object({
    original: z.string().max(300),
    replacement: z.string().max(300),
    reason: z.string().max(500),
    accepted: z.boolean().optional(),
  })).max(20).optional(),
  translatedVerbatim: z.boolean().optional(),
});

export type DeckBlueprintOutlineTopic = z.infer<
  typeof deckBlueprintOutlineTopicSchema
>;

export const deckBlueprintProvenanceSchema = z.object({
  kind: z.literal(DECK_BLUEPRINT_PROVENANCE_KIND),
  blueprintName: z.string(),
  formatVersion: z.number().int(),
  appliedAt: z.string(),
  appliedBy: z.string().optional(),
  periods: z.array(resolvedPeriodSchema),
  placement: z.enum(["replace", "append"]),
  usedBlueprintLook: z.boolean(),
  outline: z.array(deckBlueprintOutlineTopicSchema),
  blueprint: deckBlueprintSchema,
});

export type DeckBlueprintProvenance = z.infer<
  typeof deckBlueprintProvenanceSchema
>;

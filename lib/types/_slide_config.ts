// =============================================================================
// Slide Config — STORED SHAPE (slides.config column)
// =============================================================================

import { z } from "zod";
import { presentationObjectConfigSchema } from "./_presentation_object_config.ts";

// ── Block Styles ────────────────────────────────────────────────────────────

const textBlockStyleSchema = z.object({
  textSize: z.number().optional(),
  textBackground: z.string().optional(),
});

const imageBlockStyleSchema = z.object({
  imgFit: z.enum(["cover", "contain"]).optional(),
  imgAlign: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
});

// ── Figure Source ───────────────────────────────────────────────────────────

const figureSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("from_data"),
    metricId: z.string(),
    config: presentationObjectConfigSchema,
    snapshotAt: z.string(),
  }),
  z.object({
    type: z.literal("custom"),
    description: z.string().optional(),
  }),
]);

// ── Content Blocks ──────────────────────────────────────────────────────────

const textBlockSchema = z.object({
  type: z.literal("text"),
  markdown: z.string(),
  style: textBlockStyleSchema.optional(),
});

const figureBlockSchema = z.object({
  type: z.literal("figure"),
  figureInputs: z.unknown().optional(),
  source: figureSourceSchema.optional(),
});

const imageBlockSchema = z.object({
  type: z.literal("image"),
  imgFile: z.string(),
  style: imageBlockStyleSchema.optional(),
});

const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  figureBlockSchema,
  imageBlockSchema,
]);

// ── Layout Node (recursive) ─────────────────────────────────────────────────
// Matches panther's LayoutNode<ContentBlock> structure.
// Uses z.lazy() for recursion. Type annotation uses z.ZodTypeAny because
// the inferred type doesn't match the branded LayoutNode<ContentBlock> generic.

const layoutNodeBaseFields = {
  id: z.string(),
  minH: z.number().optional(),
  maxH: z.number().optional(),
  span: z.number().int().min(1).max(12).optional(),
};

const itemLayoutNodeSchema = z.object({
  ...layoutNodeBaseFields,
  type: z.literal("item"),
  data: contentBlockSchema,
  style: z.record(z.string(), z.unknown()).optional(),
  alignV: z.enum(["top", "middle", "bottom"]).optional(),
});

const containerLayoutNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    ...layoutNodeBaseFields,
    type: z.enum(["rows", "cols"]),
    children: z.array(layoutNodeSchema),
  })
);

const layoutNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([itemLayoutNodeSchema, containerLayoutNodeSchema])
);

// ── Slide Types ─────────────────────────────────────────────────────────────

const coverSlideSchema = z.object({
  type: z.literal("cover"),
  title: z.string(),
  subtitle: z.string().optional(),
  presenter: z.string().optional(),
  date: z.string().optional(),
  logos: z.array(z.string()).optional(),
  titleTextRelFontSize: z.number().optional(),
  subTitleTextRelFontSize: z.number().optional(),
  presenterTextRelFontSize: z.number().optional(),
  dateTextRelFontSize: z.number().optional(),
});

const sectionSlideSchema = z.object({
  type: z.literal("section"),
  sectionTitle: z.string(),
  sectionSubtitle: z.string().optional(),
  sectionTextRelFontSize: z.number().optional(),
  smallerSectionTextRelFontSize: z.number().optional(),
});

const contentSlideSchema = z.object({
  type: z.literal("content"),
  header: z.string().optional(),
  subHeader: z.string().optional(),
  date: z.string().optional(),
  headerLogos: z.array(z.string()).optional(),
  footer: z.string().optional(),
  footerLogos: z.array(z.string()).optional(),
  layout: layoutNodeSchema,
});

// ── Public Schema ───────────────────────────────────────────────────────────

export const slideConfigSchema = z.discriminatedUnion("type", [
  coverSlideSchema,
  sectionSlideSchema,
  contentSlideSchema,
]);

export type SlideFromSchema = z.infer<typeof slideConfigSchema>;

// ── Module-load validation ──────────────────────────────────────────────────
// Catches type/schema drift at startup:
// - Required<T> forces every field to be present in the literal
// - If type adds a field, literal won't compile until you add it
// - If schema doesn't have that field, parse() throws at startup

import type {
  CoverSlide,
  SectionSlide,
  ContentSlide,
  TextBlockStyle,
  ImageBlockStyle,
} from "./slides.ts";

const _completeCover: Required<CoverSlide> = {
  type: "cover",
  title: "",
  subtitle: "",
  presenter: "",
  date: "",
  logos: [],
  titleTextRelFontSize: 1,
  subTitleTextRelFontSize: 1,
  presenterTextRelFontSize: 1,
  dateTextRelFontSize: 1,
};
slideConfigSchema.parse(_completeCover);

const _completeSection: Required<SectionSlide> = {
  type: "section",
  sectionTitle: "",
  sectionSubtitle: "",
  sectionTextRelFontSize: 1,
  smallerSectionTextRelFontSize: 1,
};
slideConfigSchema.parse(_completeSection);

const _completeContent: Required<ContentSlide> = {
  type: "content",
  header: "",
  subHeader: "",
  date: "",
  headerLogos: [],
  footer: "",
  footerLogos: [],
  layout: {
    type: "item",
    id: "x",
    data: {
      type: "text",
      markdown: "",
      style: { textSize: 1, textBackground: "" } satisfies Required<TextBlockStyle>,
    },
  },
};
slideConfigSchema.parse(_completeContent);

// Also validate figure block with both FigureSource variants
import { DEFAULT_S_CONFIG, DEFAULT_T_CONFIG } from "./presentation_object_defaults.ts";

// FigureSource "custom" variant
slideConfigSchema.parse({
  type: "content",
  layout: {
    type: "item",
    id: "x",
    data: {
      type: "figure",
      source: {
        type: "custom",
        description: "",
      },
    },
  },
} satisfies ContentSlide);

// FigureSource "from_data" variant
slideConfigSchema.parse({
  type: "content",
  layout: {
    type: "item",
    id: "x",
    data: {
      type: "figure",
      source: {
        type: "from_data",
        metricId: "",
        config: {
          d: {
            type: "timeseries",
            timeseriesGrouping: "year",
            valuesDisDisplayOpt: "row",
            disaggregateBy: [],
            filterBy: [],
          },
          s: DEFAULT_S_CONFIG,
          t: DEFAULT_T_CONFIG,
        },
        snapshotAt: "",
      },
    },
  },
} satisfies ContentSlide);

slideConfigSchema.parse({
  type: "content",
  layout: {
    type: "item",
    id: "x",
    data: {
      type: "image",
      imgFile: "",
      style: { imgFit: "cover", imgAlign: "center" } satisfies Required<ImageBlockStyle>,
    },
  },
} satisfies ContentSlide);
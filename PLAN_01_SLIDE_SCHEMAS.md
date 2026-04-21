# Plan: Strict Slide Schemas

Create strict Zod schemas for `slide_decks.config` and `slides.config` columns, replacing the current `z.unknown()` stubs.

## Current State

Stub schemas in place for migration infrastructure:

```ts
// lib/types/_slide_deck_config.ts
export const slideDeckConfigSchema = z.unknown();

// lib/types/_slide_config.ts  
export const slideConfigSchema = z.unknown();
```

Types already defined in `lib/types/slides.ts`:
- `SlideDeckConfig` (lines 15-28)
- `Slide` = `CoverSlide | SectionSlide | ContentSlide` (lines 111-146)

## Goal

Convert TypeScript types to Zod schemas so that:
1. Write-time validation works (already wired in DB functions)
2. Startup data transforms can validate
3. Report migration can validate output

## Implementation

### Phase 1: SlideDeckConfig Schema

File: `lib/types/_slide_deck_config.ts`

Source type from `lib/types/slides.ts`:
```ts
export type DeckFooterConfig = {
  text: string;
  logos: string[];
};

export type SlideDeckConfig = {
  label: string;
  selectedReplicantValue: undefined | string;
  logos: string[] | undefined;
  logoSize: number;
  figureScale: number;
  deckFooter: DeckFooterConfig | undefined;
  showPageNumbers: boolean;
  headerSize: number;
  useWatermark: boolean;
  watermarkText: string;
  primaryColor: string;
  overlay: "dots" | "rivers" | "waves" | "world" | "none" | undefined;
};
```

Convert to Zod:
```ts
import { z } from "zod";

const deckFooterConfigSchema = z.object({
  text: z.string(),
  logos: z.array(z.string()),
});

export const slideDeckConfigSchema = z.object({
  label: z.string(),
  selectedReplicantValue: z.string().optional(),
  logos: z.array(z.string()).optional(),
  logoSize: z.number(),
  figureScale: z.number(),
  deckFooter: deckFooterConfigSchema.optional(),
  showPageNumbers: z.boolean(),
  headerSize: z.number(),
  useWatermark: z.boolean(),
  watermarkText: z.string(),
  primaryColor: z.string(),
  overlay: z.enum(["dots", "rivers", "waves", "world", "none"]).optional(),
});

export type SlideDeckConfig = z.infer<typeof slideDeckConfigSchema>;
```

### Phase 2: SlideConfig Schema

File: `lib/types/_slide_config.ts`

Source types from `lib/types/slides.ts`:
- `CoverSlide`
- `SectionSlide`
- `ContentSlide` (contains `LayoutNode<ContentBlock>`)
- `ContentBlock` = `TextBlock | FigureBlock | ImageBlock`
- `FigureSource`
- Various style types

This is more complex due to:
1. Discriminated union (`type: "cover" | "section" | "content"`)
2. Recursive `LayoutNode<ContentBlock>` structure
3. `FigureInputs` from panther (large, complex type)

Approach:
```ts
import { z } from "zod";

// Block styles
const textBlockStyleSchema = z.object({
  textSize: z.number().optional(),
  textBackground: z.string().optional(),
});

const imageBlockStyleSchema = z.object({
  imgFit: z.enum(["cover", "contain"]).optional(),
  imgAlign: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
});

// Figure source
const figureSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("from_data"),
    metricId: z.string(),
    config: presentationObjectConfigSchema,  // from existing schema
    snapshotAt: z.string(),
  }),
  z.object({
    type: z.literal("custom"),
    description: z.string().optional(),
  }),
]);

// Content blocks
const textBlockSchema = z.object({
  type: z.literal("text"),
  markdown: z.string(),
  style: textBlockStyleSchema.optional(),
});

const figureBlockSchema = z.object({
  type: z.literal("figure"),
  figureInputs: z.unknown().optional(),  // FigureInputs is complex, validate loosely
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

// Layout node (recursive)
const layoutNodeSchema: z.ZodType<LayoutNode<ContentBlock>> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal("item"),
      id: z.string(),
      data: contentBlockSchema,
      span: z.number().optional(),
    }),
    z.object({
      type: z.enum(["row", "col"]),
      id: z.string(),
      children: z.array(layoutNodeSchema),
      span: z.number().optional(),
    }),
  ])
);

// Slide types
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

export const slideConfigSchema = z.discriminatedUnion("type", [
  coverSlideSchema,
  sectionSlideSchema,
  contentSlideSchema,
]);

export type Slide = z.infer<typeof slideConfigSchema>;
```

### Phase 3: Update Type Exports

In `lib/types/slides.ts`:
- Remove duplicate type definitions
- Import types from schema files via `z.infer<>`
- Keep helper functions

### Phase 4: Add Data Transforms

Create `server/db/migrations/data_transforms/slide_deck_config.ts` and `slide_config.ts`:
- Currently no-ops (z.unknown accepts everything)
- After strict schemas: validate and transform if needed

## Notes

- `figureInputs` uses `z.unknown()` because `FigureInputs` from panther is complex and changes. The `source` field is what matters for validation.
- `presentationObjectConfigSchema` already exists and should be reused for figure source config.
- Recursive `LayoutNode` requires `z.lazy()`.

## Files to Modify

1. `lib/types/_slide_deck_config.ts` — replace stub with real schema
2. `lib/types/_slide_config.ts` — replace stub with real schema
3. `lib/types/slides.ts` — update to use inferred types
4. `lib/types/mod.ts` — ensure exports are correct

## Validation

After implementation:
1. Run `deno task typecheck`
2. Start server — data transforms should pass
3. Create/edit slide deck — write validation should work

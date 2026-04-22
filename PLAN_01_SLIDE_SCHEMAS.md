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

Data transform files already exist (no-ops with z.unknown):
- `server/db/migrations/data_transforms/slide_deck_config.ts`
- `server/db/migrations/data_transforms/slide_config.ts`

## Goal

Convert TypeScript types to Zod schemas so that:
1. Write-time validation works (already wired in DB functions)
2. Startup data transforms can validate
3. Report migration can validate output

## Key Decisions

### Keep Manual Types + Schema Side-by-Side

The `LayoutNode<ContentBlock>` type comes from panther and is generic. Zod's `z.infer<>` cannot produce a type that matches `LayoutNode<ContentBlock>` because:
1. `LayoutNode<U>` is a generic type alias from external library
2. The recursive `z.lazy()` schema infers a structural type, not the branded generic

**Solution**: Keep manual type definitions in `slides.ts`. Schemas validate shape; types provide compile-time safety. Use `as ContentBlock` cast after parsing where needed.

### `undefined | string` vs `?.optional()`

The TS type `selectedReplicantValue: undefined | string` means the property is always present but may be `undefined`. This differs from `selectedReplicantValue?: string` where the property may be absent.

In JSON storage, both serialize the same way (property absent or `null`). Use `z.string().optional()` which accepts `undefined` and absent properties.

### LayoutNode Fields from Panther

From `panther/_008_layouter/types.ts`:
```ts
export type LayoutNodeBase = {
  id: LayoutNodeId;      // string
  minH?: number;         // MISSING FROM ORIGINAL PLAN
  maxH?: number;         // MISSING FROM ORIGINAL PLAN
  span?: number;
};

export type ItemLayoutNode<U> = LayoutNodeBase & {
  type: "item";
  data: U;
  style?: ContainerStyleOptions;  // MISSING FROM ORIGINAL PLAN
  alignV?: AlignV;                // MISSING FROM ORIGINAL PLAN ("top" | "middle" | "bottom")
};

export type RowsLayoutNode<U> = LayoutNodeBase & {
  type: "rows";   // NOT "row" - ORIGINAL PLAN WAS WRONG
  children: LayoutNode<U>[];
};

export type ColsLayoutNode<U> = LayoutNodeBase & {
  type: "cols";   // NOT "col" - ORIGINAL PLAN WAS WRONG
  children: LayoutNode<U>[];
};
```

### ContainerStyleOptions

From panther - complex nested type with `PaddingOptions`, `ColorKeyOrString`, etc. Use `z.record(z.unknown()).optional()` for `style` field since it's purely for rendering and panther handles defaults.

### Type-Schema Drift Protection

Cannot use `.strict()` on schemas because AI-generated slides may include underscore properties (e.g., `_thinking`) that would cause validation failures (see DOC_AI_TOOL_SCHEMAS.md).

Instead, use `Required<T>` compile-time checks combined with module-load parsing:

**(a) Type changes, schema not updated**: Complete examples using `Required<SlideType>` include every field. If type adds a field, the literal won't compile until you add the field. Then the parse fails because schema doesn't have it.

**(b) Schema changes, type not updated**: If schema adds a required field, parsing the complete example (which uses the old type) throws at startup.

---

## Implementation

### Step 1: SlideDeckConfig Schema

**File**: `lib/types/_slide_deck_config.ts`

**Replace entire file with**:
```ts
// =============================================================================
// Slide Deck Config — STORED SHAPE (slide_decks.config column)
// =============================================================================

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

export type SlideDeckConfigFromSchema = z.infer<typeof slideDeckConfigSchema>;

// ── Module-load validation ──────────────────────────────────────────────────
// Catches type/schema drift at startup:
// - Required<T> forces every field to be present in the literal
// - If type adds a field, literal won't compile until you add it
// - If schema doesn't have that field, parse() throws at startup

import type { SlideDeckConfig, DeckFooterConfig } from "./slides.ts";

const _completeDeckConfig: Required<SlideDeckConfig> = {
  label: "",
  selectedReplicantValue: "",
  logos: [],
  logoSize: 1,
  figureScale: 1,
  deckFooter: { text: "", logos: [] } satisfies DeckFooterConfig,
  showPageNumbers: true,
  headerSize: 1,
  useWatermark: false,
  watermarkText: "",
  primaryColor: "",
  overlay: "none",
};
slideDeckConfigSchema.parse(_completeDeckConfig);
```

Note: Export as `SlideDeckConfigFromSchema` to avoid conflict. `slides.ts` keeps the canonical `SlideDeckConfig` type.

### Step 2: SlideConfig Schema

**File**: `lib/types/_slide_config.ts`

**Replace entire file with**:
```ts
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
  span: z.number().optional(),
};

const itemLayoutNodeSchema = z.object({
  ...layoutNodeBaseFields,
  type: z.literal("item"),
  data: contentBlockSchema,
  style: z.record(z.unknown()).optional(),
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
      figureInputs: {},
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
      figureInputs: {},
      source: {
        type: "from_data",
        metricId: "",
        config: {
          d: {
            type: "line",
            timeseriesGrouping: "year",
            valuesDisDisplayOpt: "all",
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
```

### Step 3: Update slides.ts

**File**: `lib/types/slides.ts`

**Add default slide functions** (after `getStartingConfigForSlideDeck`, around line 57):

```ts
export function getDefaultCoverSlide(): CoverSlide {
  return {
    type: "cover",
    title: "Title",
    subtitle: "Subtitle",
  };
}

export function getDefaultSectionSlide(): SectionSlide {
  return {
    type: "section",
    sectionTitle: "Section",
  };
}

export function getDefaultContentSlide(): ContentSlide {
  return {
    type: "content",
    header: "New slide",
    layout: {
      type: "item",
      id: "a1a",
      data: { type: "text", markdown: "" },
    },
  };
}
```

These deduplicate inline defaults in `client/src/components/slide_deck/slide_list.tsx`.

Note: Module-load validation uses separate `Required<T>` complete examples (not these defaults) to catch all optional fields.

### Step 4: Update slide_list.tsx to use defaults

**File**: `client/src/components/slide_deck/slide_list.tsx`

**Replace inline slide objects** (around lines 354-370) with imports:

```tsx
import {
  getDefaultCoverSlide,
  getDefaultSectionSlide,
  getDefaultContentSlide,
} from "lib";

// In the menu items:
{
  label: t3({ en: "Cover slide", fr: "Diapositive de couverture" }),
  icon: "plus",
  onClick: () => addSlide(getDefaultCoverSlide()),
},
{
  label: t3({ en: "Section slide", fr: "Diapositive de section" }),
  icon: "plus",
  onClick: () => addSlide(getDefaultSectionSlide()),
},
{
  label: t3({ en: "Content slide", fr: "Diapositive de contenu" }),
  icon: "plus",
  onClick: () => addSlide(getDefaultContentSlide()),
},
```

### Step 5: Verify mod.ts exports

**File**: `lib/types/mod.ts`

Already has `export * from "./slides.ts"` which re-exports the schemas. No changes needed.

### Step 6: Data transforms (no changes needed)

The existing files at:
- `server/db/migrations/data_transforms/slide_deck_config.ts`  
- `server/db/migrations/data_transforms/slide_config.ts`

Already use `slideDeckConfigSchema.safeParse()` and `slideConfigSchema.parse()`. When schemas become strict, validation automatically activates. No code changes needed.

---

## Files to Modify

| File | Action |
|------|--------|
| `lib/types/_slide_deck_config.ts` | Replace stub with schema (Step 1) |
| `lib/types/_slide_config.ts` | Replace stub with schema (Step 2) |
| `lib/types/slides.ts` | Add default slide functions (Step 3) |
| `client/src/components/slide_deck/slide_list.tsx` | Use default functions (Step 4) |
| `lib/types/mod.ts` | No changes |
| `server/db/migrations/data_transforms/*` | No changes |

---

## Validation Checklist

After implementation, run in order:

1. **Typecheck**: `deno task typecheck`
   - Expect: No errors
   - If errors: Check schema field names match type field names exactly

2. **Start server**: `deno task dev`
   - Expect: Startup completes, data transforms pass
   - If errors: Existing data doesn't match schema — add transform block

3. **Create slide deck**: Via UI, create new deck
   - Expect: Saves successfully
   - If errors: Schema rejects valid data — check optional vs required

4. **Edit slides**: Create cover, section, content slides via UI
   - Expect: All save successfully
   - Focus on: Content slide with nested layout (tests recursive schema)

5. **AI slide generation**: If enabled, test AI creating slides
   - Expect: Generated slides validate against schema

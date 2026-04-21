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
```

### Step 3: Update slides.ts

**File**: `lib/types/slides.ts`

**Changes**:
1. Keep all existing type definitions (they're the canonical source)
2. Keep all helper functions
3. Schemas are already re-exported (lines 7-8)

No changes needed — the manual types remain authoritative, schemas validate storage.

### Step 4: Verify mod.ts exports

**File**: `lib/types/mod.ts`

Already has `export * from "./slides.ts"` which re-exports the schemas. No changes needed.

### Step 5: Data transforms (no changes needed)

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
| `lib/types/slides.ts` | No changes |
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

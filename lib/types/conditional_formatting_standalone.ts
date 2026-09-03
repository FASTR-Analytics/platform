import { z } from "zod";

// ============================================================================
// Standalone CF schemas — vendored to wb-fastr-modules for validation.
// No panther or translate dependencies. Keep in sync with conditional_formatting.ts.
// ============================================================================

const colorKeyOrStringSchema = z.union([
  z.string(),
  z.object({ key: z.string() }),
]);

// A label is stored trimmed with inner whitespace collapsed, and an empty one
// is absent: the legend merges rules by label text, so two authors' spacing
// must never read as two meanings.
const thresholdBucketSchema = z.object({
  color: colorKeyOrStringSchema,
  label: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .transform((s) => (s === "" ? undefined : s))
    .optional(),
});

// A thresholds rule on its own — what a common indicator carries (DB JSON
// text, catalog row, manifest entry, API body) and what the figure-level
// `thresholds` source wraps. Cutoffs are in STORED units, ascending; one
// bucket more than cutoffs. No `type` discriminator: that belongs to the
// figure-level union alone.
export const thresholdsRuleSchema = z
  .strictObject({
    cutoffs: z.array(z.number()),
    buckets: z.array(thresholdBucketSchema),
    direction: z.enum(["higher-is-better", "lower-is-better"]).optional(),
    noDataColor: colorKeyOrStringSchema.optional(),
  })
  .refine(
    (r) => r.buckets.length === r.cutoffs.length + 1,
    { message: "A thresholds rule needs exactly one more bucket than cutoffs" },
  )
  .refine(
    (r) => r.cutoffs.every((c, i) => i === 0 || r.cutoffs[i - 1] < c),
    { message: "Cutoffs must be strictly ascending" },
  );

export const cfStorageSchema = z.object({
  cfMode: z.enum(["none", "scale", "thresholds", "indicator"]),

  cfScalePaletteKind: z.enum(["preset", "custom"]),
  cfScalePalettePreset: z.string(),
  cfScaleCustomFrom: z.string(),
  cfScaleCustomMid: z.string(),
  cfScaleCustomTo: z.string(),
  cfScaleReverse: z.boolean(),
  cfScaleSteps: z.number(),
  cfScaleDomainKind: z.enum(["auto", "fixed"]),
  cfScaleDomainMin: z.number(),
  cfScaleDomainMax: z.number(),
  cfScaleNoDataColor: z.string(),

  cfThresholdCutoffs: z.array(z.number()),
  cfThresholdBuckets: z.array(thresholdBucketSchema),
  cfThresholdDirection: z.enum(["higher-is-better", "lower-is-better"]),
  cfThresholdNoDataColor: z.string(),
});

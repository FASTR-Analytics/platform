import { z } from "zod";

// ============================================================================
// Standalone cfStorageSchema — vendored to wb-fastr-modules for validation.
// No panther or translate dependencies. Keep in sync with conditional_formatting.ts.
// ============================================================================

const colorKeyOrStringSchema = z.union([
  z.string(),
  z.object({ key: z.string() }),
]);

export const cfStorageSchema = z.object({
  cfMode: z.enum(["none", "scale", "thresholds"]),

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
  cfThresholdBuckets: z.array(
    z.object({
      color: colorKeyOrStringSchema,
    }),
  ),
  cfThresholdDirection: z.enum(["higher-is-better", "lower-is-better"]),
  cfThresholdNoDataColor: z.string(),
});
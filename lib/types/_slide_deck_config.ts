// =============================================================================
// Slide Deck Config — STORED SHAPE (slide_decks.config column)
// =============================================================================

import { COLOR_PRESET_IDS, COVER_TREATMENT_IDS, FREEFORM_TREATMENT_IDS, LAYOUT_PRESET_IDS } from "@timroberton/panther";
import { z } from "zod";
import { BRAND_PRESET_IDS } from "../brand_presets.ts";

const ALL_PRESET_IDS = [...COLOR_PRESET_IDS, ...BRAND_PRESET_IDS] as const;

const colorThemeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("preset"), id: z.enum(ALL_PRESET_IDS) }),
  z.object({ type: z.literal("custom"), primary: z.string() }),
]);

export type ColorThemeFromSchema = z.infer<typeof colorThemeSchema>;

const logosSizingOptionsSchema = z.object({
  targetArea: z.number().optional(),
  maxHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  gapX: z.number().optional(),
});

const logoSectionConfigSchema = z.object({
  selected: z.array(z.string()),
  sizing: logosSizingOptionsSchema.optional(),
  showByDefault: z.boolean(),
});

const logosConfigSchema = z.object({
  availableCustom: z.array(z.string()),
  cover: logoSectionConfigSchema,
  header: logoSectionConfigSchema,
  footer: logoSectionConfigSchema,
});

export const slideDeckConfigSchema = z.object({
  label: z.string(),
  selectedReplicantValue: z.string().optional(),
  logos: logosConfigSchema,
  figureScale: z.number(),
  globalFooterText: z.string().optional(),
  showPageNumbers: z.boolean(),
  headerSize: z.number(),
  useWatermark: z.boolean(),
  watermarkText: z.string(),
  colorTheme: colorThemeSchema,
  overlay: z.enum([
    "none",
    "dots", "rivers", "waves", "world",
    "pattern-ovals", "pattern-circles", "pattern-dots", "pattern-lines",
    "pattern-grid", "pattern-chevrons", "pattern-waves", "pattern-noise", "pattern-none",
  ]).optional(),
  layout: z.enum(LAYOUT_PRESET_IDS),
  coverAndSectionTreatment: z.enum(COVER_TREATMENT_IDS),
  freeformTreatment: z.enum(FREEFORM_TREATMENT_IDS),
});

export type SlideDeckConfigFromSchema = z.infer<typeof slideDeckConfigSchema>;

// ── Module-load validation ──────────────────────────────────────────────────
// Catches type/schema drift at startup:
// - Required<T> forces every field to be present in the literal
// - If type adds a field, literal won't compile until you add it
// - If schema doesn't have that field, parse() throws at startup

import type { SlideDeckConfig, LogosConfig, LogoSectionConfig } from "./slides.ts";
import type { LogosSizingOptions } from "./slides.ts";

const _completeLogoSectionConfig: Required<LogoSectionConfig> = {
  selected: [],
  sizing: {
    targetArea: 1,
    maxHeight: 1,
    maxWidth: 1,
    gapX: 1,
  } satisfies Required<LogosSizingOptions>,
  showByDefault: true,
};

const _completeLogosConfig: Required<LogosConfig> = {
  availableCustom: [],
  cover: _completeLogoSectionConfig,
  header: _completeLogoSectionConfig,
  footer: _completeLogoSectionConfig,
};

const _completeDeckConfig: Required<SlideDeckConfig> = {
  label: "",
  selectedReplicantValue: "",
  logos: _completeLogosConfig,
  figureScale: 1,
  globalFooterText: "",
  showPageNumbers: true,
  headerSize: 1,
  useWatermark: false,
  watermarkText: "",
  colorTheme: { type: "preset", id: "teal" },
  overlay: "none",
  layout: "default",
  coverAndSectionTreatment: "bold",
  freeformTreatment: "classic",
};
slideDeckConfigSchema.parse(_completeDeckConfig);

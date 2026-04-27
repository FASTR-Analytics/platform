// =============================================================================
// Slide Deck Config — STORED SHAPE (slide_decks.config column)
// =============================================================================

import { LAYOUT_PRESET_IDS, TREATMENT_PRESET_IDS } from "@timroberton/panther";
import { z } from "zod";

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
  primaryColor: z.string(),
  overlay: z.enum([
    "none",
    "dots", "rivers", "waves", "world",
    "pattern-ovals", "pattern-circles", "pattern-dots", "pattern-lines",
    "pattern-grid", "pattern-chevrons", "pattern-waves", "pattern-noise", "pattern-none",
  ]).optional(),
  layout: z.enum(LAYOUT_PRESET_IDS),
  treatment: z.enum(TREATMENT_PRESET_IDS),
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
  primaryColor: "",
  overlay: "none",
  layout: "default",
  treatment: "default",
};
slideDeckConfigSchema.parse(_completeDeckConfig);

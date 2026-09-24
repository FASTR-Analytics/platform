// =============================================================================
// Slide Deck Config: STORED SHAPE (slide_decks.config column)
// =============================================================================

import { z } from "zod";
import { SLIDE_DECK_THEMES } from "./_slide_deck_themes.ts";

const logoSizeKeySchema = z.enum(["sm", "md", "lg", "xl"]);

const logoSizingConfigSchema = z.object({
  size: logoSizeKeySchema.optional(),
  spacing: logoSizeKeySchema.optional(),
});

const logoSectionConfigSchema = z.object({
  selected: z.array(z.string()),
  sizing: logoSizingConfigSchema.optional(),
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
  globalFooterText: z.string().optional(),
  showPageNumbers: z.boolean(),
  headerSize: z.number(),
  useWatermark: z.boolean(),
  watermarkText: z.string(),
  theme: z.enum(SLIDE_DECK_THEMES),
});

export type SlideDeckConfigFromSchema = z.infer<typeof slideDeckConfigSchema>;

// ── Module-load validation ──────────────────────────────────────────────────
// Catches type/schema drift at startup:
// - Required<T> forces every field to be present in the literal
// - If type adds a field, literal won't compile until you add it
// - If schema doesn't have that field, parse() throws at startup

import type { SlideDeckConfig, LogosConfig, LogoSectionConfig } from "./slides.ts";
import type { LogoSizingConfig } from "./slides.ts";

const _completeLogoSectionConfig: Required<LogoSectionConfig> = {
  selected: [],
  sizing: {
    size: "md",
    spacing: "md",
  } satisfies Required<LogoSizingConfig>,
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
  globalFooterText: "",
  showPageNumbers: true,
  headerSize: 1,
  useWatermark: false,
  watermarkText: "",
  theme: "default",
};
slideDeckConfigSchema.parse(_completeDeckConfig);

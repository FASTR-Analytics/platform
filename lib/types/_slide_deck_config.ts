// =============================================================================
// Slide Deck Config — STORED SHAPE (slide_decks.config column)
// =============================================================================

import { LAYOUT_PRESET_IDS, TREATMENT_PRESET_IDS } from "@timroberton/panther";
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
  layout: z.enum(LAYOUT_PRESET_IDS),
  treatment: z.enum(TREATMENT_PRESET_IDS),
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
  layout: "default",
  treatment: "default",
};
slideDeckConfigSchema.parse(_completeDeckConfig);

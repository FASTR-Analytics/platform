// =============================================================================
// DATA TRANSFORM: slide_decks.config
// =============================================================================
//
// Table:    slide_decks
// Column:   config (JSON)
// Schema:   lib/types/_slide_deck_config.ts
//           → slideDeckConfigSchema
//
// TRANSFORM BLOCKS (run in order, each is idempotent):
// 1. Add layout and treatment fields
// 2. Migrate logos structure - collect per-slide logos into deck-level
// 3. Migrate primaryColor → colorTheme
// 4. Split treatment → coverAndSectionTreatment + freeformTreatment
//
// =============================================================================

import { slideDeckConfigSchema, _GFF_GREEN, findBrandPresetByHex } from "lib";
import { Color, COVER_TREATMENT_IDS, FREEFORM_TREATMENT_IDS, getColorPresets, LAYOUT_PRESET_IDS } from "@timroberton/panther";
import type { ColorPresetId } from "@timroberton/panther";
import type { Sql } from "postgres";

function findNearestPresetByHue(primaryColor: string): ColorPresetId {
  const { h: brandHue } = new Color(primaryColor).hsl();
  const presets = getColorPresets();
  let nearestId: ColorPresetId = "gray";
  let minDiff = Infinity;

  for (const preset of presets) {
    const diff = Math.abs(preset.hue - brandHue);
    const wrappedDiff = Math.min(diff, 360 - diff);
    if (wrappedDiff < minDiff) {
      minDiff = wrappedDiff;
      nearestId = preset.id;
    }
  }

  return nearestId;
}

function isColorTooLight(hex: string): boolean {
  const { l } = new Color(hex).hsl();
  return l > 40;
}

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

export async function migrateSlideDeckConfigs(tx: Sql, _projectId: string): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string | null }[]>`
    SELECT id, config FROM slide_decks
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    if (!row.config) continue;

    const config = JSON.parse(row.config);

    // Already valid? Skip.
    if (slideDeckConfigSchema.safeParse(config).success) {
      continue;
    }

    // Block 1: Add layout and treatment fields
    if (!("layout" in config)) {
      config.layout = "default";
    }
    if (!("treatment" in config)) {
      config.treatment = "default";
    }

    // Block 2: Migrate logos structure
    // Old: logos: string[], logoSize: number, deckFooter: { text, logos }
    // New: logos: { availableCustom, cover, header, footer }, globalFooterText
    if (Array.isArray(config.logos) || config.logos === undefined) {
      const oldAvailableLogos: string[] = config.logos ?? [];
      const oldDeckFooter = config.deckFooter as { text: string; logos: string[] } | undefined;

      // Read slides for this deck to collect per-slide logos
      const slides = await tx<{ config: string }[]>`
        SELECT config FROM slides WHERE slide_deck_id = ${row.id}
      `;

      const coverLogos = new Set<string>();
      const headerLogos = new Set<string>();
      const footerLogos = new Set<string>();

      if (oldDeckFooter?.logos) {
        for (const logo of oldDeckFooter.logos) {
          footerLogos.add(logo);
        }
      }

      for (const slide of slides) {
        const slideConfig = JSON.parse(slide.config);

        if (slideConfig.type === "cover" && Array.isArray(slideConfig.logos)) {
          for (const logo of slideConfig.logos) {
            coverLogos.add(logo);
          }
        }

        if (slideConfig.type === "content") {
          if (Array.isArray(slideConfig.headerLogos)) {
            for (const logo of slideConfig.headerLogos) {
              headerLogos.add(logo);
            }
          }
          if (Array.isArray(slideConfig.footerLogos)) {
            for (const logo of slideConfig.footerLogos) {
              footerLogos.add(logo);
            }
          }
        }
      }

      config.logos = {
        availableCustom: oldAvailableLogos,
        cover: { selected: Array.from(coverLogos), showByDefault: true },
        header: { selected: Array.from(headerLogos), showByDefault: true },
        footer: { selected: Array.from(footerLogos), showByDefault: true },
      };

      config.globalFooterText = oldDeckFooter?.text || undefined;

      delete config.logoSize;
      delete config.deckFooter;
    }

    // Block 3: Migrate primaryColor → colorTheme
    // Priority: 1) Known brand color → brand preset, 2) Too light → nearest preset, 3) Custom
    if ("primaryColor" in config && !("colorTheme" in config)) {
      const primaryColor = config.primaryColor || _GFF_GREEN;
      const brandPresetId = findBrandPresetByHex(primaryColor);

      if (brandPresetId) {
        config.colorTheme = { type: "preset", id: brandPresetId };
      } else if (isColorTooLight(primaryColor)) {
        config.colorTheme = { type: "preset", id: findNearestPresetByHue(primaryColor) };
      } else {
        config.colorTheme = { type: "custom", primary: primaryColor };
      }

      delete config.primaryColor;
    }

    // Fallback: if no colorTheme yet (very old data), use default
    if (!("colorTheme" in config)) {
      config.colorTheme = { type: "preset", id: "gff" };
    }

    // Block 4: Split treatment → coverAndSectionTreatment + freeformTreatment
    // Also validate layout/treatment IDs against current preset arrays
    if ("treatment" in config) {
      delete config.treatment;
    }
    if (!COVER_TREATMENT_IDS.includes(config.coverAndSectionTreatment)) {
      config.coverAndSectionTreatment = COVER_TREATMENT_IDS[0];
    }
    if (!FREEFORM_TREATMENT_IDS.includes(config.freeformTreatment)) {
      config.freeformTreatment = FREEFORM_TREATMENT_IDS[0];
    }
    if (!LAYOUT_PRESET_IDS.includes(config.layout)) {
      config.layout = LAYOUT_PRESET_IDS[0];
    }

    // Block 5: Add fontFamily default
    if (!("fontFamily" in config)) {
      config.fontFamily = "International Inter";
    }
    if (
      config.fontFamily &&
      !["International Inter", "Fira Sans", "Merriweather", "Poppins"].includes(config.fontFamily)
    ) {
      config.fontFamily = "International Inter";
    }

    const validated = slideDeckConfigSchema.parse(config);

    await tx`
      UPDATE slide_decks
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}

// =============================================================================
// DATA TRANSFORM: slide_decks.config
// =============================================================================
//
// Table:    slide_decks
// Column:   config (JSON)
// Schema:   lib/types/_slide_deck_config.ts
//           → slideDeckConfigSchema
//
// TRANSFORM BLOCKS:
// 1. Fill primaryColor default
// 2. Add layout and treatment fields
// 3. Migrate logos structure - collect per-slide logos into deck-level
//
// =============================================================================

import { slideDeckConfigSchema, _GFF_GREEN } from "lib";
import type { Sql } from "postgres";

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

    // Block 1: Fill primaryColor default
    if (!("primaryColor" in config)) {
      config.primaryColor = _GFF_GREEN;
    }

    // Block 2: Add layout and treatment fields
    if (!("layout" in config)) {
      config.layout = "default";
    }
    if (!("treatment" in config)) {
      config.treatment = "default";
    }

    // Block 3: Migrate logos structure
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

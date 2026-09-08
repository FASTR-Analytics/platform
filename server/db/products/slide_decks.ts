import { Sql } from "postgres";
import {
  type APIResponseWithData,
  getStartingConfigForSlideDeck,
  parseJsonOrThrow,
  type SlideDeckConfig,
  type SlideDeckDetail,
  slideDeckConfigSchema,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueSlideId } from "../../utils/id_generation.ts";

/** LOAD-BEARING message: version capture (NOT_FOUND_ERRORS in
 *  server/collab/version_capture.ts) matches it EXACTLY to tell "row is gone
 *  → drop the editing session" from "transient error → retry". Reword only
 *  in lockstep with that set. */
export const SLIDE_DECK_NOT_FOUND = "Slide deck not found";

// The deck's label lives on `products`; the config's own copy of it is only a
// starting value for decks written before the config existed.
export function parseSlideDeckConfig(
  config: string | null,
  label: string,
): SlideDeckConfig {
  if (config) {
    return parseJsonOrThrow(config) as SlideDeckConfig;
  }
  return getStartingConfigForSlideDeck(label);
}

export async function getSlideDeckDetail(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<SlideDeckDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const deck = (
      await mainDb<
        {
          id: string;
          label: string;
          plan: string | null;
          config: string | null;
          last_updated: string;
        }[]
      >`
        SELECT sd.id, p.label, sd.plan, sd.config, p.last_updated
        FROM slide_decks sd
        INNER JOIN products p ON p.id = sd.id
        WHERE sd.id = ${productId}
      `
    ).at(0);

    if (!deck) {
      throw new Error(SLIDE_DECK_NOT_FOUND);
    }

    const slideIds = (
      await mainDb<{ id: string }[]>`
        SELECT id FROM slides WHERE slide_deck_id = ${productId} ORDER BY sort_order
      `
    ).map((row) => row.id);

    return {
      success: true,
      data: {
        id: deck.id,
        label: deck.label,
        plan: deck.plan ?? "",
        config: parseSlideDeckConfig(deck.config, deck.label),
        slideIds,
        lastUpdated: deck.last_updated,
      },
    };
  });
}

export async function updateSlideDeckPlan(
  mainDb: Sql,
  productId: string,
  plan: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const updated = await mainDb.begin(async (sql) => {
      const rows = await sql`
        UPDATE slide_decks SET plan = ${plan} WHERE id = ${productId}
        RETURNING id
      `;
      await sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${productId}
      `;
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error(SLIDE_DECK_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

// The deck config carries its own label field, which the editor's title box
// writes, so this is also a label write and the registry's copy is the
// authoritative one.
export async function updateSlideDeckConfig(
  mainDb: Sql,
  productId: string,
  config: SlideDeckConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const updated = await mainDb.begin(async (sql) => {
      const rows = await sql`
        UPDATE slide_decks
        SET config = ${JSON.stringify(slideDeckConfigSchema.parse(config))}
        WHERE id = ${productId}
        RETURNING id
      `;
      await sql`
        UPDATE products
        SET label = ${config.label}, last_updated = ${lastUpdated}
        WHERE id = ${productId}
      `;
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error(SLIDE_DECK_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

// The deck half of createProduct: runs INSIDE its transaction, after the new
// `products` row exists.
export async function insertNewSlideDeckDetail(
  sql: Sql,
  productId: string,
  label: string,
): Promise<void> {
  const config = slideDeckConfigSchema.parse(
    getStartingConfigForSlideDeck(label),
  );
  await sql`
    INSERT INTO slide_decks (id, plan, config)
    VALUES (${productId}, '', ${JSON.stringify(config)})
  `;
}

// The deck half of duplicateProduct: runs INSIDE its transaction, after the
// new `products` row exists. Slide configs (and so their FigureBundles) are
// copied verbatim; only the ids are fresh.
export async function duplicateSlideDeckDetail(
  sql: Sql,
  productId: string,
  newProductId: string,
  label: string,
  lastUpdated: string,
): Promise<void> {
  const deck = (
    await sql<{ plan: string | null; config: string | null }[]>`
      SELECT plan, config FROM slide_decks WHERE id = ${productId}
    `
  ).at(0);
  if (!deck) {
    throw new Error(SLIDE_DECK_NOT_FOUND);
  }

  const config = parseSlideDeckConfig(deck.config, label);
  config.label = label;
  await sql`
    INSERT INTO slide_decks (id, plan, config)
    VALUES (
      ${newProductId},
      ${deck.plan ?? ""},
      ${JSON.stringify(slideDeckConfigSchema.parse(config))}
    )
  `;

  const slides = await sql<{ config: string; sort_order: number }[]>`
    SELECT config, sort_order FROM slides
    WHERE slide_deck_id = ${productId}
    ORDER BY sort_order
  `;

  for (const slide of slides) {
    const newSlideId = await generateUniqueSlideId(sql);
    await sql`
      INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
      VALUES (${newSlideId}, ${newProductId}, ${slide.sort_order}, ${slide.config}, ${lastUpdated})
    `;
  }
}

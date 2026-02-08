import { Sql } from "postgres";
import { type APIResponseNoData, APIResponseWithData, SlideDeckSummary, SlideDeckDetail, SlideDeckConfig, getStartingConfigForReport, parseJsonOrThrow } from "lib";
import { DBSlideDeck } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueDeckId, generateUniqueSlideId } from "../../utils/id_generation.ts";

function parseDeckConfig(deck: DBSlideDeck): SlideDeckConfig {
  if (deck.config) {
    return parseJsonOrThrow(deck.config);
  }
  return getStartingConfigForReport(deck.label);
}

export async function getAllSlideDecks(
  projectDb: Sql,
): Promise<APIResponseWithData<SlideDeckSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const decks = await projectDb<(DBSlideDeck & { first_slide_id: string | null })[]>`
      SELECT sd.*,
        (SELECT id FROM slides WHERE slide_deck_id = sd.id ORDER BY sort_order LIMIT 1) as first_slide_id
      FROM slide_decks sd ORDER BY sd.last_updated DESC
    `;

    return {
      success: true,
      data: decks.map((d) => ({
        id: d.id,
        label: d.label,
        folderId: d.folder_id,
        firstSlideId: d.first_slide_id,
        config: parseDeckConfig(d),
      })),
    };
  });
}

export async function getSlideDeckDetail(
  projectDb: Sql,
  deckId: string,
): Promise<APIResponseWithData<SlideDeckDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const deck = (
      await projectDb<DBSlideDeck[]>`
        SELECT * FROM slide_decks WHERE id = ${deckId}
      `
    ).at(0);

    if (!deck) {
      throw new Error("Slide deck not found");
    }

    const slideIds = (
      await projectDb<{ id: string }[]>`
        SELECT id FROM slides WHERE slide_deck_id = ${deckId} ORDER BY sort_order
      `
    ).map((row) => row.id);

    return {
      success: true,
      data: {
        id: deck.id,
        label: deck.label,
        plan: deck.plan ?? "",
        config: parseDeckConfig(deck),
        slideIds,
        lastUpdated: deck.last_updated,
      },
    };
  });
}

export async function createSlideDeck(
  projectDb: Sql,
  label: string,
  folderId?: string | null,
): Promise<APIResponseWithData<{ deckId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const deckId = await generateUniqueDeckId(projectDb);
    const lastUpdated = new Date().toISOString();

    const defaultConfig = getStartingConfigForReport(label);
    await projectDb`
      INSERT INTO slide_decks (id, label, plan, config, folder_id, last_updated)
      VALUES (${deckId}, ${label}, '', ${JSON.stringify(defaultConfig)}, ${folderId ?? null}, ${lastUpdated})
    `;

    return { success: true, data: { deckId, lastUpdated } };
  });
}

export async function updateSlideDeckLabel(
  projectDb: Sql,
  deckId: string,
  label: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    await projectDb`
      UPDATE slide_decks
      SET label = ${label}, last_updated = ${lastUpdated}
      WHERE id = ${deckId}
    `;

    return { success: true, data: { lastUpdated } };
  });
}

export async function updateSlideDeckPlan(
  projectDb: Sql,
  deckId: string,
  plan: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    await projectDb`
      UPDATE slide_decks
      SET plan = ${plan}, last_updated = ${lastUpdated}
      WHERE id = ${deckId}
    `;

    return { success: true, data: { lastUpdated } };
  });
}

export async function moveSlideDeckToFolder(
  projectDb: Sql,
  deckId: string,
  folderId: string | null,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE slide_decks
      SET folder_id = ${folderId}, last_updated = ${lastUpdated}
      WHERE id = ${deckId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function duplicateSlideDeck(
  projectDb: Sql,
  deckId: string,
  label: string,
  folderId?: string | null,
): Promise<APIResponseWithData<{ newDeckId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const deck = (
      await projectDb<DBSlideDeck[]>`
        SELECT * FROM slide_decks WHERE id = ${deckId}
      `
    ).at(0);
    if (!deck) {
      throw new Error("Slide deck not found");
    }

    const newDeckId = await generateUniqueDeckId(projectDb);
    const lastUpdated = new Date().toISOString();

    const config = parseDeckConfig(deck);
    config.label = label.trim();
    await projectDb`
      INSERT INTO slide_decks (id, label, plan, config, folder_id, last_updated)
      VALUES (${newDeckId}, ${label.trim()}, ${deck.plan ?? ""}, ${JSON.stringify(config)}, ${folderId ?? null}, ${lastUpdated})
    `;

    const slides = await projectDb<{ config: string; sort_order: number }[]>`
      SELECT config, sort_order FROM slides
      WHERE slide_deck_id = ${deckId}
      ORDER BY sort_order
    `;

    for (const slide of slides) {
      const newSlideId = await generateUniqueSlideId(projectDb);
      await projectDb`
        INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
        VALUES (${newSlideId}, ${newDeckId}, ${slide.sort_order}, ${slide.config}, ${lastUpdated})
      `;
    }

    return { success: true, data: { newDeckId, lastUpdated } };
  });
}

export async function updateSlideDeckConfig(
  projectDb: Sql,
  deckId: string,
  config: SlideDeckConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE slide_decks
      SET label = ${config.label}, config = ${JSON.stringify(config)}, last_updated = ${lastUpdated}
      WHERE id = ${deckId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function deleteSlideDeck(
  projectDb: Sql,
  deckId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb`
      DELETE FROM slide_decks WHERE id = ${deckId}
    `;

    return { success: true };
  });
}

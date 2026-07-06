import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type DeckVersionDetail,
  type DeckVersionSlide,
  type DeckVersionSummary,
  type FigureBlock,
  type ImageBlock,
  parseJsonOrThrow,
  reportFiguresSchema,
  reportImagesSchema,
  type ReportVersionDetail,
  type ReportVersionSummary,
  type SlideDeckConfig,
  slideConfigSchema,
  slideDeckConfigSchema,
  type VersionEditor,
} from "lib";
import { DBDeckVersion, DBReportVersion } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  generateUniqueDeckId,
  generateUniqueReportId,
  generateUniqueSlideId,
} from "../../utils/id_generation.ts";
import { reSequence } from "./slides.ts";

// Newest N versions kept per document; pruned in the writer after each insert.
const VERSIONS_KEEP = 100;

// Version snapshots are stored VERBATIM (no schema re-parse on insert): they
// mirror content that was already validated when it was written to the live
// tables, and a later schema change must not be able to fail the version
// write (the tracker would retry forever). Validation happens on the way OUT
// instead — restore/copy parse with the current schemas, which normalizes old
// snapshots the same way reads of old rows are normalized.

// ---------------------------------------------------------------------------
// Report versions
// ---------------------------------------------------------------------------

export async function insertReportVersion(
  projectDb: Sql,
  args: {
    reportId: string;
    createdAt: string;
    label: string;
    body: string;
    figures: Record<string, FigureBlock>;
    images: Record<string, ImageBlock>;
    editors: VersionEditor[];
    contentHash: string;
    restoredFromVersionId?: string | null;
  },
): Promise<APIResponseWithData<{ versionId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const versionId = crypto.randomUUID();
    await projectDb`
      INSERT INTO report_versions
        (id, report_id, created_at, label, body, figures, images, editors, content_hash, restored_from_version_id)
      VALUES (
        ${versionId},
        ${args.reportId},
        ${args.createdAt},
        ${args.label},
        ${args.body},
        ${JSON.stringify(args.figures)},
        ${JSON.stringify(args.images)},
        ${JSON.stringify(args.editors)},
        ${args.contentHash},
        ${args.restoredFromVersionId ?? null}
      )
    `;
    await projectDb`
      DELETE FROM report_versions
      WHERE report_id = ${args.reportId} AND id NOT IN (
        SELECT id FROM report_versions
        WHERE report_id = ${args.reportId}
        ORDER BY created_at DESC
        LIMIT ${VERSIONS_KEEP}
      )
    `;
    return { success: true, data: { versionId } };
  });
}

export async function latestReportVersionHash(
  projectDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<{ hash: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<{ content_hash: string }[]>`
        SELECT content_hash FROM report_versions
        WHERE report_id = ${reportId}
        ORDER BY created_at DESC
        LIMIT 1
      `
    ).at(0);
    return { success: true, data: { hash: row?.content_hash ?? null } };
  });
}

export async function listReportVersions(
  projectDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<ReportVersionSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<
      (Pick<DBReportVersion, "id" | "created_at" | "editors" | "restored_from_version_id"> & {
        size_bytes: number;
      })[]
    >`
      SELECT id, created_at, editors, restored_from_version_id,
        (length(body) + length(figures) + length(images)) AS size_bytes
      FROM report_versions
      WHERE report_id = ${reportId}
      ORDER BY created_at DESC
    `;
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        editors: parseJsonOrThrow<VersionEditor[]>(r.editors),
        sizeBytes: Number(r.size_bytes),
        restoredFromVersionId: r.restored_from_version_id,
      })),
    };
  });
}

export async function getReportVersion(
  projectDb: Sql,
  reportId: string,
  versionId: string,
): Promise<APIResponseWithData<ReportVersionDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<DBReportVersion[]>`
        SELECT * FROM report_versions
        WHERE id = ${versionId} AND report_id = ${reportId}
      `
    ).at(0);
    if (!row) {
      throw new Error("Version not found");
    }
    return {
      success: true,
      data: {
        id: row.id,
        createdAt: row.created_at,
        editors: parseJsonOrThrow<VersionEditor[]>(row.editors),
        sizeBytes: row.body.length + row.figures.length + row.images.length,
        restoredFromVersionId: row.restored_from_version_id,
        label: row.label,
        body: row.body,
        figures: parseJsonOrThrow<Record<string, FigureBlock>>(row.figures),
        images: parseJsonOrThrow<Record<string, ImageBlock>>(row.images),
      },
    };
  });
}

/** Overwrite a report's content with a version snapshot (restore, no-room
 *  path). One UPDATE: bumping last_updated alone auto-invalidates any stored
 *  crdt_state, so the next collab open re-seeds from this content. */
export async function restoreReportContent(
  projectDb: Sql,
  reportId: string,
  content: {
    label: string;
    body: string;
    figures: Record<string, FigureBlock>;
    images: Record<string, ImageBlock>;
  },
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await projectDb`
      UPDATE reports
      SET label = ${content.label},
          body = ${content.body},
          figures = ${JSON.stringify(reportFiguresSchema.parse(content.figures))},
          images = ${JSON.stringify(reportImagesSchema.parse(content.images))},
          last_updated = ${lastUpdated}
      WHERE id = ${reportId}
      RETURNING id
    `;
    if (rows.length === 0) {
      throw new Error("Report not found");
    }
    return { success: true, data: { lastUpdated } };
  });
}

/** "Restore as copy": create a brand-new report from a version snapshot.
 *  Carries the source report's current config (versions don't store config). */
export async function copyReportFromVersion(
  projectDb: Sql,
  reportId: string,
  versionId: string,
  label: string,
  folderId?: string | null,
): Promise<APIResponseWithData<{ newReportId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const version = (
      await projectDb<DBReportVersion[]>`
        SELECT * FROM report_versions
        WHERE id = ${versionId} AND report_id = ${reportId}
      `
    ).at(0);
    if (!version) {
      throw new Error("Version not found");
    }
    const source = (
      await projectDb<{ config: string | null }[]>`
        SELECT config FROM reports WHERE id = ${reportId}
      `
    ).at(0);

    const figures = reportFiguresSchema.parse(
      parseJsonOrThrow(version.figures),
    );
    const images = reportImagesSchema.parse(parseJsonOrThrow(version.images));

    const newReportId = await generateUniqueReportId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
      INSERT INTO reports (id, label, body, figures, images, config, folder_id, last_updated)
      VALUES (
        ${newReportId},
        ${label.trim()},
        ${version.body},
        ${JSON.stringify(figures)},
        ${JSON.stringify(images)},
        ${source?.config ?? null},
        ${folderId ?? null},
        ${lastUpdated}
      )
    `;
    return { success: true, data: { newReportId, lastUpdated } };
  });
}

// ---------------------------------------------------------------------------
// Deck versions
// ---------------------------------------------------------------------------

export async function insertDeckVersion(
  projectDb: Sql,
  args: {
    deckId: string;
    createdAt: string;
    label: string;
    deckConfig: SlideDeckConfig;
    slides: DeckVersionSlide[];
    editors: VersionEditor[];
    contentHash: string;
    restoredFromVersionId?: string | null;
  },
): Promise<APIResponseWithData<{ versionId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const versionId = crypto.randomUUID();
    await projectDb`
      INSERT INTO deck_versions
        (id, deck_id, created_at, label, deck_config, slides, editors, content_hash, restored_from_version_id)
      VALUES (
        ${versionId},
        ${args.deckId},
        ${args.createdAt},
        ${args.label},
        ${JSON.stringify(args.deckConfig)},
        ${JSON.stringify(args.slides)},
        ${JSON.stringify(args.editors)},
        ${args.contentHash},
        ${args.restoredFromVersionId ?? null}
      )
    `;
    await projectDb`
      DELETE FROM deck_versions
      WHERE deck_id = ${args.deckId} AND id NOT IN (
        SELECT id FROM deck_versions
        WHERE deck_id = ${args.deckId}
        ORDER BY created_at DESC
        LIMIT ${VERSIONS_KEEP}
      )
    `;
    return { success: true, data: { versionId } };
  });
}

export async function latestDeckVersionHash(
  projectDb: Sql,
  deckId: string,
): Promise<APIResponseWithData<{ hash: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<{ content_hash: string }[]>`
        SELECT content_hash FROM deck_versions
        WHERE deck_id = ${deckId}
        ORDER BY created_at DESC
        LIMIT 1
      `
    ).at(0);
    return { success: true, data: { hash: row?.content_hash ?? null } };
  });
}

export async function listDeckVersions(
  projectDb: Sql,
  deckId: string,
): Promise<APIResponseWithData<DeckVersionSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<
      (Pick<DBDeckVersion, "id" | "created_at" | "editors" | "restored_from_version_id"> & {
        size_bytes: number;
        slide_count: number;
      })[]
    >`
      SELECT id, created_at, editors, restored_from_version_id,
        (length(deck_config) + length(slides)) AS size_bytes,
        json_array_length(slides::json) AS slide_count
      FROM deck_versions
      WHERE deck_id = ${deckId}
      ORDER BY created_at DESC
    `;
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        editors: parseJsonOrThrow<VersionEditor[]>(r.editors),
        slideCount: Number(r.slide_count),
        sizeBytes: Number(r.size_bytes),
        restoredFromVersionId: r.restored_from_version_id,
      })),
    };
  });
}

export async function getDeckVersion(
  projectDb: Sql,
  deckId: string,
  versionId: string,
): Promise<APIResponseWithData<DeckVersionDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<DBDeckVersion[]>`
        SELECT * FROM deck_versions
        WHERE id = ${versionId} AND deck_id = ${deckId}
      `
    ).at(0);
    if (!row) {
      throw new Error("Version not found");
    }
    const slides = parseJsonOrThrow<DeckVersionSlide[]>(row.slides);
    return {
      success: true,
      data: {
        id: row.id,
        createdAt: row.created_at,
        editors: parseJsonOrThrow<VersionEditor[]>(row.editors),
        slideCount: slides.length,
        sizeBytes: row.deck_config.length + row.slides.length,
        restoredFromVersionId: row.restored_from_version_id,
        label: row.label,
        deckConfig: parseJsonOrThrow<SlideDeckConfig>(row.deck_config),
        slides,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Deck restore
// ---------------------------------------------------------------------------

/** How a deck restore reconciles the current slide rows with a snapshot.
 *  Pure so it's harness-testable; the route derives room handling from it
 *  (toDelete ∪ toInsert rooms are killed; toUpdate rooms merge live). */
export type DeckRestorePlan = {
  toDelete: string[];
  toInsert: DeckVersionSlide[];
  toUpdate: DeckVersionSlide[];
};

export function planDeckRestore(
  currentIds: string[],
  snapshotSlides: DeckVersionSlide[],
): DeckRestorePlan {
  const current = new Set(currentIds);
  const snapshot = new Set(snapshotSlides.map((s) => s.id));
  return {
    toDelete: currentIds.filter((id) => !snapshot.has(id)),
    toInsert: snapshotSlides.filter((s) => !current.has(s.id)),
    toUpdate: snapshotSlides.filter((s) => current.has(s.id)),
  };
}

/** Deck restore, structural half: one transaction that deletes/re-inserts
 *  slide rows (original snapshot ids preserved), restores every slide's
 *  snapshot sort_order, and restores the deck's label + config. Configs of
 *  surviving (toUpdate) slides are NOT written here — the route applies them
 *  afterwards through the live-room chokepoint so co-editors follow the
 *  restore live. Safe ordering: checkpoints never write sort_order, so a
 *  straggler room checkpoint after this transaction can only touch config. */
export async function restoreDeckStructure(
  projectDb: Sql,
  deckId: string,
  label: string,
  deckConfig: SlideDeckConfig,
  plan: DeckRestorePlan,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const parsedConfig = slideDeckConfigSchema.parse(deckConfig);
    const insertConfigs = plan.toInsert.map((s) =>
      JSON.stringify(slideConfigSchema.parse(s.config))
    );

    await projectDb.begin((sql) => [
      ...(plan.toDelete.length > 0
        ? [
          sql`
            DELETE FROM slides
            WHERE slide_deck_id = ${deckId} AND id = ANY(${plan.toDelete})
          `,
        ]
        : []),
      ...plan.toInsert.map((s, i) =>
        sql`
          INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
          VALUES (${s.id}, ${deckId}, ${s.sortOrder}, ${insertConfigs[i]}, ${lastUpdated})
        `
      ),
      ...plan.toUpdate.map((s) =>
        sql`
          UPDATE slides SET sort_order = ${s.sortOrder}
          WHERE id = ${s.id} AND slide_deck_id = ${deckId}
        `
      ),
      sql`
        UPDATE slide_decks
        SET label = ${label},
            config = ${JSON.stringify(parsedConfig)},
            last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `,
      reSequence(sql, deckId),
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

/** "Restore as copy": create a brand-new deck (+ slides with FRESH ids — the
 *  originals may still exist in the source deck) from a version snapshot. */
export async function copyDeckFromVersion(
  projectDb: Sql,
  deckId: string,
  versionId: string,
  label: string,
  folderId?: string | null,
): Promise<APIResponseWithData<{ newDeckId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const version = (
      await projectDb<DBDeckVersion[]>`
        SELECT * FROM deck_versions
        WHERE id = ${versionId} AND deck_id = ${deckId}
      `
    ).at(0);
    if (!version) {
      throw new Error("Version not found");
    }

    const config = parseJsonOrThrow<SlideDeckConfig>(version.deck_config);
    config.label = label.trim();
    const slides = parseJsonOrThrow<DeckVersionSlide[]>(version.slides)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const newDeckId = await generateUniqueDeckId(projectDb);
    const lastUpdated = new Date().toISOString();
    await projectDb`
      INSERT INTO slide_decks (id, label, plan, config, folder_id, last_updated)
      VALUES (
        ${newDeckId},
        ${label.trim()},
        '',
        ${JSON.stringify(slideDeckConfigSchema.parse(config))},
        ${folderId ?? null},
        ${lastUpdated}
      )
    `;

    for (const slide of slides) {
      const newSlideId = await generateUniqueSlideId(projectDb);
      await projectDb`
        INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
        VALUES (
          ${newSlideId},
          ${newDeckId},
          ${slide.sortOrder},
          ${JSON.stringify(slideConfigSchema.parse(slide.config))},
          ${lastUpdated}
        )
      `;
    }

    return { success: true, data: { newDeckId, lastUpdated } };
  });
}

import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type AuthorRun,
  type DeckSlideEditors,
  type DeckVersionDetail,
  type DeckVersionSlide,
  type DeckVersionSummary,
  type FigureBlock,
  type ImageBlock,
  parseJsonOrThrow,
  reportFiguresSchema,
  reportImagesSchema,
  type ReportVersionDetail,
  type ReportVersionLineageStep,
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

// True byte size of stored text — used by the version detail responses so they
// agree with the SQL octet_length() the list queries use.
function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

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
    bodyAuthors?: AuthorRun[] | null;
  },
): Promise<APIResponseWithData<{ versionId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const versionId = crypto.randomUUID();
    await projectDb`
      INSERT INTO report_versions
        (id, report_id, created_at, label, body, figures, images, editors, content_hash, restored_from_version_id, body_authors)
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
        ${args.restoredFromVersionId ?? null},
        ${args.bodyAuthors ? JSON.stringify(args.bodyAuthors) : null}
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
        (octet_length(body) + octet_length(figures) + octet_length(images)) AS size_bytes
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
        sizeBytes: utf8Bytes(row.body) + utf8Bytes(row.figures) +
          utf8Bytes(row.images),
        restoredFromVersionId: row.restored_from_version_id,
        label: row.label,
        body: row.body,
        figures: parseJsonOrThrow<Record<string, FigureBlock>>(row.figures),
        images: parseJsonOrThrow<Record<string, ImageBlock>>(row.images),
        bodyAuthors: row.body_authors
          ? parseJsonOrThrow<AuthorRun[]>(row.body_authors)
          : null,
      },
    };
  });
}

/** The compare view's data: the base version plus every newer version, bodies
 *  and editors only (never the heavy figure/image payloads), oldest first.
 *  Diffing adjacent steps attributes each changed section to the editing
 *  session that introduced it. */
export async function getReportVersionLineage(
  projectDb: Sql,
  reportId: string,
  versionId: string,
): Promise<APIResponseWithData<ReportVersionLineageStep[]>> {
  return await tryCatchDatabaseAsync(async () => {
    type LineageRow = Pick<
      DBReportVersion,
      "id" | "created_at" | "editors" | "body" | "body_authors"
    >;
    const base = (
      await projectDb<LineageRow[]>`
        SELECT id, created_at, editors, body, body_authors FROM report_versions
        WHERE id = ${versionId} AND report_id = ${reportId}
      `
    ).at(0);
    if (!base) {
      throw new Error("Version not found");
    }
    const newer = await projectDb<LineageRow[]>`
      SELECT id, created_at, editors, body, body_authors FROM report_versions
      WHERE report_id = ${reportId}
        AND created_at >= ${base.created_at}
        AND id != ${versionId}
      ORDER BY created_at ASC, id ASC
    `;
    const toStep = (r: LineageRow): ReportVersionLineageStep => ({
      id: r.id,
      createdAt: r.created_at,
      editors: parseJsonOrThrow<VersionEditor[]>(r.editors),
      body: r.body,
      bodyAuthors: r.body_authors
        ? parseJsonOrThrow<AuthorRun[]>(r.body_authors)
        : null,
    });
    return { success: true, data: [toStep(base), ...newer.map(toStep)] };
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
    slideEditors?: DeckSlideEditors | null;
  },
): Promise<APIResponseWithData<{ versionId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const versionId = crypto.randomUUID();
    await projectDb`
      INSERT INTO deck_versions
        (id, deck_id, created_at, label, deck_config, slides, editors, content_hash, restored_from_version_id, slide_editors)
      VALUES (
        ${versionId},
        ${args.deckId},
        ${args.createdAt},
        ${args.label},
        ${JSON.stringify(args.deckConfig)},
        ${JSON.stringify(args.slides)},
        ${JSON.stringify(args.editors)},
        ${args.contentHash},
        ${args.restoredFromVersionId ?? null},
        ${args.slideEditors ? JSON.stringify(args.slideEditors) : null}
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
        (octet_length(deck_config) + octet_length(slides)) AS size_bytes,
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
        sizeBytes: utf8Bytes(row.deck_config) + utf8Bytes(row.slides),
        restoredFromVersionId: row.restored_from_version_id,
        label: row.label,
        deckConfig: parseJsonOrThrow<SlideDeckConfig>(row.deck_config),
        slides,
        slideEditors: row.slide_editors
          ? parseJsonOrThrow<DeckSlideEditors>(row.slide_editors)
          : null,
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

/** Slide ids are 3-char nanoids whose uniqueness is only checked against LIVE
 *  rows — a snapshot slide that was deleted may have had its id reused by a
 *  slide in another deck, so re-inserting it verbatim would violate the PK and
 *  abort the restore forever. Replace any colliding toInsert id with a fresh
 *  one (identity only matters for surviving slides; the toInsert rooms were
 *  discarded anyway). Call BEFORE closing rooms — the colliding id's live room
 *  belongs to another deck and must not be touched. */
export async function remapCollidingSlideIds(
  projectDb: Sql,
  plan: DeckRestorePlan,
): Promise<APIResponseWithData<{ plan: DeckRestorePlan; remapped: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const ids = plan.toInsert.map((s) => s.id);
    if (ids.length === 0) {
      return { success: true, data: { plan, remapped: 0 } };
    }
    const colliding = new Set(
      (
        await projectDb<{ id: string }[]>`
          SELECT id FROM slides WHERE id = ANY(${ids})
        `
      ).map((r) => r.id),
    );
    if (colliding.size === 0) {
      return { success: true, data: { plan, remapped: 0 } };
    }
    // generateUniqueSlideId only checks LIVE rows — also avoid the plan's own
    // not-yet-inserted ids and fresh ids picked earlier in this loop.
    const taken = new Set(ids);
    const toInsert: DeckVersionSlide[] = [];
    for (const s of plan.toInsert) {
      if (!colliding.has(s.id)) {
        toInsert.push(s);
        continue;
      }
      let freshId = await generateUniqueSlideId(projectDb);
      while (taken.has(freshId)) {
        freshId = await generateUniqueSlideId(projectDb);
      }
      taken.add(freshId);
      toInsert.push({ ...s, id: freshId });
    }
    return {
      success: true,
      data: { plan: { ...plan, toInsert }, remapped: colliding.size },
    };
  });
}

/** Deck restore, structural half: one transaction that deletes/re-inserts
 *  slide rows (ids taken verbatim from the plan — colliding toInsert ids were
 *  already replaced by remapCollidingSlideIds above, so only surviving
 *  toUpdate slides are guaranteed their original ids), restores every slide's
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

    // Validate + prepare EVERYTHING before writing anything, then insert deck
    // and slides in ONE transaction — a mid-loop failure (e.g. an old snapshot
    // config the current schema rejects) must not leave a half-copied deck.
    const parsedDeckConfig = JSON.stringify(slideDeckConfigSchema.parse(config));
    const parsedSlideConfigs = slides.map((s) =>
      JSON.stringify(slideConfigSchema.parse(s.config))
    );
    const newDeckId = await generateUniqueDeckId(projectDb);
    // generateUniqueSlideId only checks LIVE rows — none of this batch is
    // inserted yet, so also dedupe within the batch itself.
    const newSlideIds: string[] = [];
    const taken = new Set<string>();
    while (newSlideIds.length < slides.length) {
      const id = await generateUniqueSlideId(projectDb);
      if (taken.has(id)) continue;
      taken.add(id);
      newSlideIds.push(id);
    }
    const lastUpdated = new Date().toISOString();

    await projectDb.begin((sql) => [
      sql`
        INSERT INTO slide_decks (id, label, plan, config, folder_id, last_updated)
        VALUES (
          ${newDeckId},
          ${label.trim()},
          '',
          ${parsedDeckConfig},
          ${folderId ?? null},
          ${lastUpdated}
        )
      `,
      ...slides.map((slide, i) =>
        sql`
          INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated)
          VALUES (
            ${newSlideIds[i]},
            ${newDeckId},
            ${slide.sortOrder},
            ${parsedSlideConfigs[i]},
            ${lastUpdated}
          )
        `
      ),
    ]);

    return { success: true, data: { newDeckId, lastUpdated } };
  });
}

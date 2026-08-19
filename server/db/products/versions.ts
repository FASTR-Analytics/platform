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
import {
  type FigureBlockMut,
  type SlideLayoutNodeLike,
  transformFigureBlock,
  walkSlideLayoutNodes,
} from "../migrations/data_transforms/_figure_block.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  type DBDeckVersion,
  type DBReportVersion,
} from "../instance/_main_database_types.ts";
import {
  generateUniqueProductId,
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
// instead — restore/copy parse with the current schemas.
//
// The parse alone CANNOT cover a renamed/deleted key: Zod strip mode deletes
// unknown keys instead of normalizing them, so a snapshot from before a
// rename would lose the setting silently on restore. Every path that reads a
// snapshot out therefore runs the shared figure-block transforms first (the
// same upgrade the boot sweeps apply to live rows), via the helpers below —
// legacy keys migrate instead of vanishing.

function upgradeSnapshotFigures(
  figures: Record<string, FigureBlock>,
): Record<string, FigureBlock> {
  for (const block of Object.values(figures)) {
    transformFigureBlock(block as unknown as FigureBlockMut);
  }
  return figures;
}

function upgradeSnapshotSlideConfig<T>(config: T): T {
  const c = config as { type?: unknown; layout?: unknown } | null;
  if (c && typeof c === "object" && c.type === "content" && c.layout) {
    walkSlideLayoutNodes(c.layout as SlideLayoutNodeLike, (node) => {
      const data = node.data as { type?: unknown } | undefined;
      if (data && data.type === "figure") {
        transformFigureBlock(data as FigureBlockMut);
      }
    });
  }
  return config;
}

// ---------------------------------------------------------------------------
// Report versions
// ---------------------------------------------------------------------------

export async function insertReportVersion(
  mainDb: Sql,
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
    await mainDb`
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
    await mainDb`
      DELETE FROM report_versions
      WHERE report_id = ${args.reportId} AND id NOT IN (
        SELECT id FROM report_versions
        WHERE report_id = ${args.reportId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${VERSIONS_KEEP}
      )
    `;
    return { success: true, data: { versionId } };
  });
}

export async function latestReportVersionHash(
  mainDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<{ hash: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ content_hash: string }[]>`
        SELECT content_hash FROM report_versions
        WHERE report_id = ${reportId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
    ).at(0);
    return { success: true, data: { hash: row?.content_hash ?? null } };
  });
}

export async function listReportVersions(
  mainDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<ReportVersionSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<
      (Pick<DBReportVersion, "id" | "created_at" | "editors" | "restored_from_version_id"> & {
        size_bytes: number;
      })[]
    >`
      SELECT id, created_at, editors, restored_from_version_id,
        (octet_length(body) + octet_length(figures) + octet_length(images)) AS size_bytes
      FROM report_versions
      WHERE report_id = ${reportId}
      ORDER BY created_at DESC, id DESC
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
  mainDb: Sql,
  reportId: string,
  versionId: string,
): Promise<APIResponseWithData<ReportVersionDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<DBReportVersion[]>`
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
        figures: upgradeSnapshotFigures(
          parseJsonOrThrow<Record<string, FigureBlock>>(row.figures),
        ),
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
  mainDb: Sql,
  reportId: string,
  versionId: string,
): Promise<APIResponseWithData<ReportVersionLineageStep[]>> {
  return await tryCatchDatabaseAsync(async () => {
    type LineageRow = Pick<
      DBReportVersion,
      "id" | "created_at" | "editors" | "body" | "body_authors"
    >;
    const base = (
      await mainDb<LineageRow[]>`
        SELECT id, created_at, editors, body, body_authors FROM report_versions
        WHERE id = ${versionId} AND report_id = ${reportId}
      `
    ).at(0);
    if (!base) {
      throw new Error("Version not found");
    }
    // Strictly after the base by the SAME (created_at, id) order every other
    // version query uses — a plain created_at >= would pull in an equal-stamp
    // version that the list actually shows as OLDER, reversing a diff step.
    const newer = await mainDb<LineageRow[]>`
      SELECT id, created_at, editors, body, body_authors FROM report_versions
      WHERE report_id = ${reportId}
        AND (created_at, id) > (${base.created_at}, ${base.id})
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
 *  path). Bumping the product's last_updated alone auto-invalidates any
 *  stored crdt_state, so the next collab open re-seeds from this content. */
export async function restoreReportContent(
  mainDb: Sql,
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
    const figures = JSON.stringify(
      reportFiguresSchema.parse(upgradeSnapshotFigures(content.figures)),
    );
    const images = JSON.stringify(
      reportImagesSchema.parse(content.images),
    );
    const updated = await mainDb.begin(async (sql) => {
      const rows = await sql`
        UPDATE reports
        SET body = ${content.body},
            figures = ${figures},
            images = ${images}
        WHERE id = ${reportId}
        RETURNING id
      `;
      await sql`
        UPDATE products
        SET label = ${content.label}, last_updated = ${lastUpdated}
        WHERE id = ${reportId}
      `;
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error("Report not found");
    }
    return { success: true, data: { lastUpdated } };
  });
}

/** "Restore as copy": create a brand-new report PRODUCT from a version
 *  snapshot. Carries the source report's current config (versions don't store
 *  config) and — via INSERT … SELECT — the source product's `(run_id,
 *  admin_area_2)` pair verbatim, so the copy's figures are exactly as fresh
 *  as the original's. */
export async function copyReportFromVersion(
  mainDb: Sql,
  args: {
    reportId: string;
    versionId: string;
    label: string;
    folderId: string | null;
    createdBy: string;
  },
): Promise<APIResponseWithData<{ productId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const version = (
      await mainDb<DBReportVersion[]>`
        SELECT * FROM report_versions
        WHERE id = ${args.versionId} AND report_id = ${args.reportId}
      `
    ).at(0);
    if (!version) {
      throw new Error("Version not found");
    }
    const source = (
      await mainDb<{ config: string | null }[]>`
        SELECT config FROM reports WHERE id = ${args.reportId}
      `
    ).at(0);

    const figures = reportFiguresSchema.parse(
      upgradeSnapshotFigures(
        parseJsonOrThrow<Record<string, FigureBlock>>(version.figures),
      ),
    );
    const images = reportImagesSchema.parse(parseJsonOrThrow(version.images));

    const newReportId = await generateUniqueProductId(mainDb);
    const lastUpdated = new Date().toISOString();
    await mainDb.begin((sql) => [
      sql`
        INSERT INTO products
          (id, type, label, folder_id, run_id, admin_area_2, created_by, created_at, last_updated)
        SELECT
          ${newReportId}, 'report', ${args.label.trim()}, ${args.folderId},
          run_id, admin_area_2, ${args.createdBy}, ${lastUpdated}, ${lastUpdated}
        FROM products WHERE id = ${args.reportId}
      `,
      sql`
        INSERT INTO reports (id, body, figures, images, config)
        VALUES (
          ${newReportId},
          ${version.body},
          ${JSON.stringify(figures)},
          ${JSON.stringify(images)},
          ${source?.config ?? null}
        )
      `,
    ]);
    return { success: true, data: { productId: newReportId, lastUpdated } };
  });
}

// ---------------------------------------------------------------------------
// Deck versions
// ---------------------------------------------------------------------------

export async function insertDeckVersion(
  mainDb: Sql,
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
    await mainDb`
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
    await mainDb`
      DELETE FROM deck_versions
      WHERE deck_id = ${args.deckId} AND id NOT IN (
        SELECT id FROM deck_versions
        WHERE deck_id = ${args.deckId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${VERSIONS_KEEP}
      )
    `;
    return { success: true, data: { versionId } };
  });
}

export async function latestDeckVersionHash(
  mainDb: Sql,
  deckId: string,
): Promise<APIResponseWithData<{ hash: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ content_hash: string }[]>`
        SELECT content_hash FROM deck_versions
        WHERE deck_id = ${deckId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
    ).at(0);
    return { success: true, data: { hash: row?.content_hash ?? null } };
  });
}

export async function listDeckVersions(
  mainDb: Sql,
  deckId: string,
): Promise<APIResponseWithData<DeckVersionSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<
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
      ORDER BY created_at DESC, id DESC
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
  mainDb: Sql,
  deckId: string,
  versionId: string,
): Promise<APIResponseWithData<DeckVersionDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<DBDeckVersion[]>`
        SELECT * FROM deck_versions
        WHERE id = ${versionId} AND deck_id = ${deckId}
      `
    ).at(0);
    if (!row) {
      throw new Error("Version not found");
    }
    const slides = parseJsonOrThrow<DeckVersionSlide[]>(row.slides);
    for (const s of slides) {
      upgradeSnapshotSlideConfig(s.config);
    }
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
  mainDb: Sql,
  plan: DeckRestorePlan,
): Promise<APIResponseWithData<{ plan: DeckRestorePlan; remapped: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const ids = plan.toInsert.map((s) => s.id);
    if (ids.length === 0) {
      return { success: true, data: { plan, remapped: 0 } };
    }
    const colliding = new Set(
      (
        await mainDb<{ id: string }[]>`
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
      let freshId = await generateUniqueSlideId(mainDb);
      while (taken.has(freshId)) {
        freshId = await generateUniqueSlideId(mainDb);
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
  mainDb: Sql,
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

    await mainDb.begin((sql) => [
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
        SET config = ${JSON.stringify(parsedConfig)}
        WHERE id = ${deckId}
      `,
      sql`
        UPDATE products
        SET label = ${label}, last_updated = ${lastUpdated}
        WHERE id = ${deckId}
      `,
      reSequence(sql, deckId),
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

/** "Restore as copy": create a brand-new deck PRODUCT (+ slides with FRESH
 *  ids — the originals may still exist in the source deck) from a version
 *  snapshot. The source product's `(run_id, admin_area_2)` pair is cloned
 *  verbatim by INSERT … SELECT, so the copy's figures are exactly as fresh as
 *  the original's. */
export async function copyDeckFromVersion(
  mainDb: Sql,
  args: {
    deckId: string;
    versionId: string;
    label: string;
    folderId: string | null;
    createdBy: string;
  },
): Promise<APIResponseWithData<{ productId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const version = (
      await mainDb<DBDeckVersion[]>`
        SELECT * FROM deck_versions
        WHERE id = ${args.versionId} AND deck_id = ${args.deckId}
      `
    ).at(0);
    if (!version) {
      throw new Error("Version not found");
    }

    const config = parseJsonOrThrow<SlideDeckConfig>(version.deck_config);
    config.label = args.label.trim();
    const slides = parseJsonOrThrow<DeckVersionSlide[]>(version.slides)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Validate + prepare EVERYTHING before writing anything, then insert deck
    // and slides in ONE transaction — a mid-loop failure (e.g. an old snapshot
    // config the current schema rejects) must not leave a half-copied deck.
    const parsedDeckConfig = JSON.stringify(slideDeckConfigSchema.parse(config));
    const parsedSlideConfigs = slides.map((s) =>
      JSON.stringify(slideConfigSchema.parse(upgradeSnapshotSlideConfig(s.config)))
    );
    const newDeckId = await generateUniqueProductId(mainDb);
    // generateUniqueSlideId only checks LIVE rows — none of this batch is
    // inserted yet, so also dedupe within the batch itself.
    const newSlideIds: string[] = [];
    const taken = new Set<string>();
    while (newSlideIds.length < slides.length) {
      const id = await generateUniqueSlideId(mainDb);
      if (taken.has(id)) {
        continue;
      }
      taken.add(id);
      newSlideIds.push(id);
    }
    const lastUpdated = new Date().toISOString();

    await mainDb.begin((sql) => [
      sql`
        INSERT INTO products
          (id, type, label, folder_id, run_id, admin_area_2, created_by, created_at, last_updated)
        SELECT
          ${newDeckId}, 'slide_deck', ${args.label.trim()}, ${args.folderId},
          run_id, admin_area_2, ${args.createdBy}, ${lastUpdated}, ${lastUpdated}
        FROM products WHERE id = ${args.deckId}
      `,
      sql`
        INSERT INTO slide_decks (id, plan, config)
        VALUES (${newDeckId}, '', ${parsedDeckConfig})
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

    return { success: true, data: { productId: newDeckId, lastUpdated } };
  });
}

// =============================================================================
// CONSOLIDATION PLANNING CORE (PLAN_PRODUCTS_RESTRUCTURE D9/D13)
// =============================================================================
//
// Reads ONE legacy project database and returns the complete set of rows that
// would be inserted into the post-restructure main DB, plus the id remaps, the
// folder plan, the ai_context contribution and the counts of everything the
// consolidation DROPS. It is PURE PLANNING: it issues no writes and touches no
// main-DB handle. Two callers share it — 080_consolidate_projects.ts executes
// the plan inside the migration transaction, and the pre-deploy fleet dry-run
// only reports it — so the thing that is gated is the thing that runs.
//
// FROZEN TYPES: the old project-DB row types (`_project_database_types.ts`) are
// deleted by this restructure, and the nanoid alphabet/length live in
// `server/utils/id_generation.ts`, which is about products now. Both are copied
// in below. This file is migration history — it describes a schema that no
// longer exists anywhere else in the repo and must not start importing live
// code that can drift underneath it.
//
// ID COLLISIONS (D9/D14): project DBs were created with `CREATE DATABASE …
// WITH TEMPLATE`, so ids — uuids included — are byte-identical across projects
// that were copied from one another. Every primary key is therefore checked
// against `takenIds` (ids already claimed by main or by an earlier project in
// this run) and re-minted on collision, with the FULL reference surface
// rewritten: slides.slide_deck_id, deck_versions.deck_id, the `slides[].id`
// entries and `slide_editors.slides` keys inside deck-version payloads,
// report_versions.report_id and `restored_from_version_id` within the project.
// New product/slide ids are 4-char nanoids (D14); new version ids are uuids.
//
// FIGURE STAMPING (D4): `figureBundleSchema` gains a required `scope` and
// `provenance.runId`, which cannot be derived at read time — the version
// restore paths parse snapshots with the current strict schema, so a missing
// key is intended to fail loud. Every figure block that HAS a bundle is
// stamped here, in the live tables AND the version snapshots. A block without
// a bundle is an empty placeholder and is left alone. Stamping overwrites
// unconditionally, so re-planning the same source is idempotent.
//
// NOT READ: presentation_objects, visualization_folders, dashboards,
// dashboard_items, dashboard_item_groups (D3 — deleted, not converted; only
// counted, so the loss is known before the deploy rather than discovered
// after), and every module / results / dataset table.
//
// =============================================================================

import { customAlphabet } from "nanoid";
import type { Sql } from "postgres";
import {
  type FigureBlockMut,
  type SlideLayoutNodeLike,
  walkSlideLayoutNodes,
} from "../data_transforms/_figure_block.ts";

// ── Frozen: the legacy project-DB rows this planner reads ────────────────────

export type LegacyProjectRow = {
  id: string;
  label: string;
  ai_context: string;
  is_central_reporting: boolean;
  is_locked: boolean;
  status: string;
  deletion_scheduled_at: Date | null;
  run_id: string | null;
  admin_area_2: string | null;
  follow_pinned: boolean;
};

type LegacyFolderRow = {
  id: string;
  label: string;
  color: string | null;
};

type LegacySlideDeckRow = {
  id: string;
  label: string;
  plan: string | null;
  config: string | null;
  last_updated: string;
  folder_id: string | null;
};

type LegacySlideRow = {
  id: string;
  slide_deck_id: string;
  sort_order: number;
  config: string;
  last_updated: string;
  crdt_state: string | null;
  crdt_state_last_updated: string | null;
};

type LegacyReportRow = {
  id: string;
  label: string;
  body: string;
  figures: string;
  images: string;
  config: string | null;
  crdt_state: string | null;
  crdt_state_last_updated: string | null;
  body_authors: string | null;
  last_updated: string;
  folder_id: string | null;
};

type LegacyReportVersionRow = {
  id: string;
  report_id: string;
  created_at: string;
  label: string;
  body: string;
  figures: string;
  images: string;
  editors: string;
  content_hash: string;
  restored_from_version_id: string | null;
  body_authors: string | null;
};

type LegacyDeckVersionRow = {
  id: string;
  deck_id: string;
  created_at: string;
  label: string;
  deck_config: string;
  slides: string;
  editors: string;
  content_hash: string;
  restored_from_version_id: string | null;
  slide_editors: string | null;
};

// ── Planned rows: one per new main-DB table, columns 1:1 ─────────────────────

export type ProductType = "slide_deck" | "report";

export type PlannedFolder = {
  id: string;
  label: string;
  color: string | null;
  lastUpdated: string;
};

// createdBy/createdAt are typed `null`, not `string | null`: the legacy tables
// carry no provenance and D9 forbids inventing any.
export type PlannedProduct = {
  id: string;
  type: ProductType;
  label: string;
  folderId: string | null;
  runId: string;
  adminArea2: string | null;
  createdBy: null;
  createdAt: null;
  lastUpdated: string;
};

export type PlannedSlideDeck = {
  id: string;
  plan: string | null;
  config: string | null;
};

export type PlannedSlide = {
  id: string;
  slideDeckId: string;
  sortOrder: number;
  config: string;
  lastUpdated: string;
  crdtState: string | null;
  crdtStateLastUpdated: string | null;
};

export type PlannedReport = {
  id: string;
  body: string;
  figures: string;
  images: string;
  config: string | null;
  crdtState: string | null;
  crdtStateLastUpdated: string | null;
  bodyAuthors: string | null;
};

export type PlannedReportVersion = {
  id: string;
  reportId: string;
  createdAt: string;
  label: string;
  body: string;
  figures: string;
  images: string;
  editors: string;
  contentHash: string;
  restoredFromVersionId: string | null;
  bodyAuthors: string | null;
};

export type PlannedDeckVersion = {
  id: string;
  deckId: string;
  createdAt: string;
  label: string;
  deckConfig: string;
  slides: string;
  editors: string;
  contentHash: string;
  restoredFromVersionId: string | null;
  slideEditors: string | null;
};

export type IdRemapEntity = "product" | "slide" | "report_version" | "deck_version";

export type IdRemap = {
  entity: IdRemapEntity;
  from: string;
  to: string;
};

export type DroppedCounts = {
  presentationObjects: number;
  visualizationFolders: number;
  dashboards: number;
  dashboardItems: number;
  dashboardItemGroups: number;
};

export type TakenIds = {
  products: Set<string>;
  slides: Set<string>;
  reportVersions: Set<string>;
  deckVersions: Set<string>;
};

export type ConsolidationPlan = {
  projectId: string;
  projectLabel: string;
  runId: string;
  adminArea2: string | null;
  folders: PlannedFolder[];
  products: PlannedProduct[];
  slideDecks: PlannedSlideDeck[];
  slides: PlannedSlide[];
  reports: PlannedReport[];
  reportVersions: PlannedReportVersion[];
  deckVersions: PlannedDeckVersion[];
  aiContext: string | null;
  remaps: IdRemap[];
  droppedCounts: DroppedCounts;
  warnings: string[];
};

// ── Id minting ───────────────────────────────────────────────────────────────

const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const generateShortId = customAlphabet(ID_ALPHABET, 4);

const MAX_MINT_ATTEMPTS = 100;

function mintShortId(taken: Set<string>): string {
  for (let i = 0; i < MAX_MINT_ATTEMPTS; i++) {
    const id = generateShortId();
    if (!taken.has(id)) {
      return id;
    }
  }
  throw new Error(
    `Failed to mint a free 4-char id after ${MAX_MINT_ATTEMPTS} attempts`,
  );
}

function mintUuid(taken: Set<string>): string {
  for (let i = 0; i < MAX_MINT_ATTEMPTS; i++) {
    const id = crypto.randomUUID();
    if (!taken.has(id)) {
      return id;
    }
  }
  throw new Error(`Failed to mint a free uuid after ${MAX_MINT_ATTEMPTS} attempts`);
}

// Claims `legacyId` if free, otherwise mints a replacement. Either way the
// result is added to `taken`, so a later project in the same run sees it.
function claimId(
  taken: Set<string>,
  legacyId: string,
  mint: (taken: Set<string>) => string,
  entity: IdRemapEntity,
  remaps: IdRemap[],
): string {
  if (!taken.has(legacyId)) {
    taken.add(legacyId);
    return legacyId;
  }
  const replacement = mint(taken);
  taken.add(replacement);
  remaps.push({ entity, from: legacyId, to: replacement });
  return replacement;
}

// ── Figure-block stamping (D4) ───────────────────────────────────────────────

function stampFigureBlock(
  block: FigureBlockMut,
  runId: string,
  adminArea2: string | null,
): void {
  if (block.bundle === undefined || block.bundle === null) {
    return;
  }
  const bundle = block.bundle as Record<string, unknown>;
  bundle.scope = { adminArea2 };
  const provenance = (bundle.provenance ?? {}) as Record<string, unknown>;
  provenance.runId = runId;
  bundle.provenance = provenance;
}

function stampSlideConfigJson(
  configJson: string,
  runId: string,
  adminArea2: string | null,
): string {
  const config = JSON.parse(configJson) as { layout?: unknown };
  if (config.layout !== undefined && config.layout !== null) {
    walkSlideLayoutNodes(config.layout as SlideLayoutNodeLike, (node) => {
      const data = node.data as FigureBlockMut | undefined;
      if (data !== undefined && data !== null && data.type === "figure") {
        stampFigureBlock(data, runId, adminArea2);
      }
    });
  }
  return JSON.stringify(config);
}

function stampFiguresMapJson(
  figuresJson: string,
  runId: string,
  adminArea2: string | null,
): string {
  const figures = JSON.parse(figuresJson) as Record<string, unknown>;
  if (figures !== null && typeof figures === "object") {
    for (const block of Object.values(figures)) {
      if (block !== null && typeof block === "object") {
        stampFigureBlock(block as FigureBlockMut, runId, adminArea2);
      }
    }
  }
  return JSON.stringify(figures);
}

// A deck version's `slides` payload is DeckVersionSlide[] — each with its own
// layout tree, stamped exactly like a live slide.
function stampDeckVersionSlidesJson(
  slidesJson: string,
  runId: string,
  adminArea2: string | null,
  slideIdMap: Map<string, string>,
): string {
  const slides = JSON.parse(slidesJson) as Array<{ id?: string; config?: unknown }>;
  if (!Array.isArray(slides)) {
    return slidesJson;
  }
  for (const slide of slides) {
    if (typeof slide.id === "string") {
      const remapped = slideIdMap.get(slide.id);
      if (remapped !== undefined) {
        slide.id = remapped;
      }
    }
    const config = slide.config as { layout?: unknown } | undefined;
    if (config?.layout !== undefined && config.layout !== null) {
      walkSlideLayoutNodes(config.layout as SlideLayoutNodeLike, (node) => {
        const data = node.data as FigureBlockMut | undefined;
        if (data !== undefined && data !== null && data.type === "figure") {
          stampFigureBlock(data, runId, adminArea2);
        }
      });
    }
  }
  return JSON.stringify(slides);
}

// Snapshot slide ids that no longer exist live are left verbatim: they are not
// primary keys, and the restore path already re-mints a snapshot slide whose id
// was reused elsewhere (remapCollidingSlideIds).
function remapSlideEditorsJson(
  slideEditorsJson: string,
  slideIdMap: Map<string, string>,
): string {
  const slideEditors = JSON.parse(slideEditorsJson) as {
    slides?: Record<string, unknown>;
  };
  if (slideEditors?.slides === undefined || slideEditors.slides === null) {
    return slideEditorsJson;
  }
  const remapped: Record<string, unknown> = {};
  for (const [slideId, value] of Object.entries(slideEditors.slides)) {
    remapped[slideIdMap.get(slideId) ?? slideId] = value;
  }
  slideEditors.slides = remapped;
  return JSON.stringify(slideEditors);
}

// ── Dropped-row counts ───────────────────────────────────────────────────────

type DroppedTable =
  | "presentation_objects"
  | "visualization_folders"
  | "dashboards"
  | "dashboard_items"
  | "dashboard_item_groups";

// A project DB that never reached the migration adding one of these tables must
// report 0, not throw — the dry-run has to survive the whole fleet.
async function countIfTableExists(
  projectDb: Sql,
  table: DroppedTable,
): Promise<number> {
  const exists = await projectDb<{ one: number }[]>`
    SELECT 1 AS one FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  if (exists.length === 0) {
    return 0;
  }
  const rows = await projectDb<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM ${projectDb(table)}
  `;
  return rows[0].count;
}

// ── Planner ──────────────────────────────────────────────────────────────────

export async function planConsolidation(args: {
  projectDb: Sql;
  project: LegacyProjectRow;
  runId: string;
  takenIds: TakenIds;
}): Promise<ConsolidationPlan> {
  const { projectDb, project, runId, takenIds } = args;
  const adminArea2 = project.admin_area_2;
  const warnings: string[] = [];
  const remaps: IdRemap[] = [];
  const plannedAt = new Date().toISOString();

  const deckFolderRows = await projectDb<LegacyFolderRow[]>`
    SELECT id, label, color FROM slide_deck_folders ORDER BY id
  `;
  const reportFolderRows = await projectDb<LegacyFolderRow[]>`
    SELECT id, label, color FROM report_folders ORDER BY id
  `;
  const deckRows = await projectDb<LegacySlideDeckRow[]>`
    SELECT id, label, plan, config, last_updated, folder_id
    FROM slide_decks ORDER BY id
  `;
  const slideRows = await projectDb<LegacySlideRow[]>`
    SELECT id, slide_deck_id, sort_order, config, last_updated,
           crdt_state, crdt_state_last_updated
    FROM slides ORDER BY slide_deck_id, sort_order, id
  `;
  const reportRows = await projectDb<LegacyReportRow[]>`
    SELECT id, label, body, figures, images, config, crdt_state,
           crdt_state_last_updated, body_authors, last_updated, folder_id
    FROM reports ORDER BY id
  `;
  const reportVersionRows = await projectDb<LegacyReportVersionRow[]>`
    SELECT id, report_id, created_at, label, body, figures, images, editors,
           content_hash, restored_from_version_id, body_authors
    FROM report_versions ORDER BY report_id, created_at, id
  `;
  const deckVersionRows = await projectDb<LegacyDeckVersionRow[]>`
    SELECT id, deck_id, created_at, label, deck_config, slides, editors,
           content_hash, restored_from_version_id, slide_editors
    FROM deck_versions ORDER BY deck_id, created_at, id
  `;

  const deckFoldersById = new Map(deckFolderRows.map((f) => [f.id, f]));
  const reportFoldersById = new Map(reportFolderRows.map((f) => [f.id, f]));

  // D10: one folder per project ("P"), plus one per legacy sub-folder ("P / F").
  // Same-label sub-folders in the deck and report families MERGE into one
  // folder, so the key is the composed label. Emitted lazily, which is what
  // makes "only folders that receive a product" true by construction.
  const folders: PlannedFolder[] = [];
  const foldersByLabel = new Map<string, PlannedFolder>();

  function folderIdFor(subFolderLabel: string | null, color: string | null): string {
    const label = subFolderLabel === null
      ? project.label
      : `${project.label} / ${subFolderLabel}`;
    const existing = foldersByLabel.get(label);
    if (existing !== undefined) {
      if (existing.color === null && color !== null) {
        existing.color = color;
      }
      return existing.id;
    }
    const folder: PlannedFolder = {
      id: crypto.randomUUID(),
      label,
      color,
      lastUpdated: plannedAt,
    };
    folders.push(folder);
    foldersByLabel.set(label, folder);
    return folder.id;
  }

  // ── Products: decks ────────────────────────────────────────────────────────

  const products: PlannedProduct[] = [];
  const slideDecks: PlannedSlideDeck[] = [];
  const deckIdMap = new Map<string, string>();

  for (const deck of deckRows) {
    const id = claimId(takenIds.products, deck.id, mintShortId, "product", remaps);
    deckIdMap.set(deck.id, id);
    const legacyFolder = deck.folder_id === null
      ? null
      : deckFoldersById.get(deck.folder_id) ?? null;
    if (deck.folder_id !== null && legacyFolder === null) {
      warnings.push(
        `slide deck ${deck.id} references missing slide_deck_folder ${deck.folder_id}`,
      );
    }
    products.push({
      id,
      type: "slide_deck",
      label: deck.label,
      folderId: folderIdFor(
        legacyFolder === null ? null : legacyFolder.label,
        legacyFolder === null ? null : legacyFolder.color,
      ),
      runId,
      adminArea2,
      createdBy: null,
      createdAt: null,
      lastUpdated: deck.last_updated,
    });
    slideDecks.push({ id, plan: deck.plan, config: deck.config });
  }

  // ── Products: reports ──────────────────────────────────────────────────────

  const reports: PlannedReport[] = [];
  const reportIdMap = new Map<string, string>();

  for (const report of reportRows) {
    const id = claimId(takenIds.products, report.id, mintShortId, "product", remaps);
    reportIdMap.set(report.id, id);
    const legacyFolder = report.folder_id === null
      ? null
      : reportFoldersById.get(report.folder_id) ?? null;
    if (report.folder_id !== null && legacyFolder === null) {
      warnings.push(
        `report ${report.id} references missing report_folder ${report.folder_id}`,
      );
    }
    products.push({
      id,
      type: "report",
      label: report.label,
      folderId: folderIdFor(
        legacyFolder === null ? null : legacyFolder.label,
        legacyFolder === null ? null : legacyFolder.color,
      ),
      runId,
      adminArea2,
      createdBy: null,
      createdAt: null,
      lastUpdated: report.last_updated,
    });
    reports.push({
      id,
      body: report.body,
      figures: stampFiguresMapJson(report.figures, runId, adminArea2),
      images: report.images,
      config: report.config,
      crdtState: report.crdt_state,
      crdtStateLastUpdated: report.crdt_state_last_updated,
      bodyAuthors: report.body_authors,
    });
  }

  // ── Slides ─────────────────────────────────────────────────────────────────

  const slides: PlannedSlide[] = [];
  const slideIdMap = new Map<string, string>();

  for (const slide of slideRows) {
    const deckId = deckIdMap.get(slide.slide_deck_id);
    if (deckId === undefined) {
      warnings.push(
        `slide ${slide.id} references missing slide_deck ${slide.slide_deck_id} — dropped`,
      );
      continue;
    }
    const id = claimId(takenIds.slides, slide.id, mintShortId, "slide", remaps);
    slideIdMap.set(slide.id, id);
    slides.push({
      id,
      slideDeckId: deckId,
      sortOrder: slide.sort_order,
      config: stampSlideConfigJson(slide.config, runId, adminArea2),
      lastUpdated: slide.last_updated,
      crdtState: slide.crdt_state,
      crdtStateLastUpdated: slide.crdt_state_last_updated,
    });
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  const reportVersionIdMap = new Map<string, string>();
  const reportVersions: PlannedReportVersion[] = [];

  for (const version of reportVersionRows) {
    const reportId = reportIdMap.get(version.report_id);
    if (reportId === undefined) {
      warnings.push(
        `report_version ${version.id} references missing report ${version.report_id} — dropped`,
      );
      continue;
    }
    const id = claimId(
      takenIds.reportVersions,
      version.id,
      mintUuid,
      "report_version",
      remaps,
    );
    reportVersionIdMap.set(version.id, id);
    reportVersions.push({
      id,
      reportId,
      createdAt: version.created_at,
      label: version.label,
      body: version.body,
      figures: stampFiguresMapJson(version.figures, runId, adminArea2),
      images: version.images,
      editors: version.editors,
      contentHash: version.content_hash,
      restoredFromVersionId: version.restored_from_version_id,
      bodyAuthors: version.body_authors,
    });
  }

  const deckVersionIdMap = new Map<string, string>();
  const deckVersions: PlannedDeckVersion[] = [];

  for (const version of deckVersionRows) {
    const deckId = deckIdMap.get(version.deck_id);
    if (deckId === undefined) {
      warnings.push(
        `deck_version ${version.id} references missing slide_deck ${version.deck_id} — dropped`,
      );
      continue;
    }
    const id = claimId(
      takenIds.deckVersions,
      version.id,
      mintUuid,
      "deck_version",
      remaps,
    );
    deckVersionIdMap.set(version.id, id);
    deckVersions.push({
      id,
      deckId,
      createdAt: version.created_at,
      label: version.label,
      deckConfig: version.deck_config,
      slides: stampDeckVersionSlidesJson(
        version.slides,
        runId,
        adminArea2,
        slideIdMap,
      ),
      editors: version.editors,
      contentHash: version.content_hash,
      restoredFromVersionId: version.restored_from_version_id,
      slideEditors: version.slide_editors === null
        ? null
        : remapSlideEditorsJson(version.slide_editors, slideIdMap),
    });
  }

  // restored_from_version_id points inside the same project's version set, so
  // it is rewritten after both maps are complete.
  for (const version of reportVersions) {
    if (version.restoredFromVersionId !== null) {
      version.restoredFromVersionId =
        reportVersionIdMap.get(version.restoredFromVersionId) ??
          version.restoredFromVersionId;
    }
  }
  for (const version of deckVersions) {
    if (version.restoredFromVersionId !== null) {
      version.restoredFromVersionId =
        deckVersionIdMap.get(version.restoredFromVersionId) ??
          version.restoredFromVersionId;
    }
  }

  const droppedCounts: DroppedCounts = {
    presentationObjects: await countIfTableExists(projectDb, "presentation_objects"),
    visualizationFolders: await countIfTableExists(projectDb, "visualization_folders"),
    dashboards: await countIfTableExists(projectDb, "dashboards"),
    dashboardItems: await countIfTableExists(projectDb, "dashboard_items"),
    dashboardItemGroups: await countIfTableExists(projectDb, "dashboard_item_groups"),
  };

  const aiContext = project.ai_context.trim() === "" ? null : project.ai_context.trim();

  return {
    projectId: project.id,
    projectLabel: project.label,
    runId,
    adminArea2,
    folders,
    products,
    slideDecks,
    slides,
    reports,
    reportVersions,
    deckVersions,
    aiContext,
    remaps,
    droppedCounts,
    warnings,
  };
}

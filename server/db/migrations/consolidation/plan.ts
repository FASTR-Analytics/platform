// =============================================================================
// CONSOLIDATION PLANNER (PLAN_PRODUCTS_RESTRUCTURE D9, D10, D13, D14)
// =============================================================================
//
// Reads ONE legacy project database and returns the complete set of rows the
// consolidation would insert into main, plus the id remaps, the folder plan,
// the ai_context contribution and the counts of everything it drops. Pure
// planning: no writes, no main-DB handle. Two callers share it, so the thing
// that is gated is the thing that runs: execute.ts applies the plan inside
// the 085 migration transaction; validate_consolidation.ts only reports it.
//
// FROZEN TYPES: the legacy project-DB row types are copied below from
// server/db/project/_project_database_types.ts (plus the crdt columns the
// live types omit), and the nanoid alphabet from server/utils/id_generation.ts.
// Those describe a schema that will exist nowhere else in the repo, so they
// are frozen here rather than imported from files 9b deletes. The slide
// layout walker and ProductType survive the restructure and are imported.
//
// ID COLLISIONS (D9 item 6, D14): project DBs were created WITH TEMPLATE, so
// ids, uuids included, are byte-identical across projects copied from one
// another. Every primary key is checked against `takenIds` (ids claimed by
// main or by an earlier project in the same run) and re-minted on collision,
// with the full reference surface rewritten: slides.slide_deck_id,
// slide_deck_versions.slide_deck_id, the `slides[].id` entries and the
// `slide_editors.slides` keys inside deck-version payloads,
// report_versions.report_id, and restored_from_version_id within the
// project. New product and slide ids are 4-char nanoids; new version ids are
// uuids.
//
// FOLDERS (D10): one root folder per project, one child per legacy sub-folder
// that receives a product; same-label deck and report sub-folders merge into
// one child. Folders are emitted lazily, so a sub-folder with no product is
// dropped (there is nothing to hold), as is a project with no products.
//
// FIGURE STAMPING (D4): every figure block that has a bundle, in the live
// tables AND the version snapshots, gets `bundle.scope` and
// `bundle.provenance.runId` from the owning project row. A block without a
// bundle is an empty placeholder and is left alone. Stamping overwrites
// unconditionally, so re-planning the same source is idempotent.
//
// NOT READ (D3): presentation_objects, visualization_folders, dashboards,
// dashboard_items, dashboard_item_groups. Deleted with the project DBs; only
// counted, so the loss is known before the deploy rather than after.
//
// =============================================================================

import { customAlphabet } from "nanoid";
import type { Sql } from "postgres";
import type { ProductType } from "lib";
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

// ── Planned rows: one per main-DB table, columns 1:1 ─────────────────────────

// createdBy and createdAt are typed `null`: the legacy tables carry no
// provenance and D9 forbids inventing any.
export type PlannedFolder = {
  id: string;
  label: string;
  color: string | null;
  parentId: string | null;
  createdBy: null;
  createdAt: null;
  lastUpdated: string;
};

export type PlannedProduct = {
  id: string;
  type: ProductType;
  label: string;
  folderId: string;
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

export type PlannedSlideDeckVersion = {
  id: string;
  slideDeckId: string;
  createdAt: string;
  label: string;
  slideDeckConfig: string;
  slides: string;
  editors: string;
  contentHash: string;
  restoredFromVersionId: string | null;
  slideEditors: string | null;
};

export type IdRemapEntity =
  | "product"
  | "slide"
  | "report_version"
  | "slide_deck_version";

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
  slideDeckVersions: Set<string>;
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
  slideDeckVersions: PlannedSlideDeckVersion[];
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
  throw new Error(
    `Failed to mint a free uuid after ${MAX_MINT_ATTEMPTS} attempts`,
  );
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

function stampLayout(
  layout: unknown,
  runId: string,
  adminArea2: string | null,
): void {
  if (layout === undefined || layout === null) {
    return;
  }
  walkSlideLayoutNodes(layout as SlideLayoutNodeLike, (node) => {
    const data = node.data as FigureBlockMut | undefined;
    if (data !== undefined && data !== null && data.type === "figure") {
      stampFigureBlock(data, runId, adminArea2);
    }
  });
}

function stampSlideConfigJson(
  configJson: string,
  runId: string,
  adminArea2: string | null,
): string {
  const config = JSON.parse(configJson) as { layout?: unknown };
  stampLayout(config.layout, runId, adminArea2);
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

// A deck version's `slides` payload is a DeckVersionSlide[], each with its
// own layout tree, stamped exactly like a live slide. Snapshot slide ids that
// no longer exist live are left verbatim: they are not primary keys, and the
// restore path re-mints a snapshot slide whose id is taken.
function stampDeckVersionSlidesJson(
  slidesJson: string,
  runId: string,
  adminArea2: string | null,
  slideIdMap: Map<string, string>,
): string {
  const slides = JSON.parse(slidesJson) as Array<
    { id?: string; config?: unknown }
  >;
  if (!Array.isArray(slides)) {
    return slidesJson;
  }
  for (const slide of slides) {
    if (typeof slide.id === "string") {
      slide.id = slideIdMap.get(slide.id) ?? slide.id;
    }
    const config = slide.config as { layout?: unknown } | undefined;
    stampLayout(config?.layout, runId, adminArea2);
  }
  return JSON.stringify(slides);
}

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

export async function tableExists(db: Sql, table: string): Promise<boolean> {
  const rows = await db<{ one: number }[]>`
    SELECT 1 AS one FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

// A project DB that never reached the migration adding one of these tables
// reports 0 rather than throwing: the dry-run has to survive the whole fleet.
async function countIfTableExists(
  projectDb: Sql,
  table: DroppedTable,
): Promise<number> {
  if (!(await tableExists(projectDb, table))) {
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

  // ── Folders (D10) ──────────────────────────────────────────────────────────

  const folders: PlannedFolder[] = [];
  const childrenByLabel = new Map<string, PlannedFolder>();
  let root: PlannedFolder | null = null;

  function newFolder(
    label: string,
    color: string | null,
    parentId: string | null,
  ): PlannedFolder {
    const folder: PlannedFolder = {
      id: crypto.randomUUID(),
      label,
      color,
      parentId,
      createdBy: null,
      createdAt: null,
      lastUpdated: plannedAt,
    };
    folders.push(folder);
    return folder;
  }

  function rootFolderId(): string {
    if (root === null) {
      root = newFolder(project.label, null, null);
    }
    return root.id;
  }

  function folderIdFor(legacyFolder: LegacyFolderRow | null): string {
    if (legacyFolder === null) {
      return rootFolderId();
    }
    const existing = childrenByLabel.get(legacyFolder.label);
    if (existing !== undefined) {
      if (existing.color === null && legacyFolder.color !== null) {
        existing.color = legacyFolder.color;
      }
      return existing.id;
    }
    const child = newFolder(
      legacyFolder.label,
      legacyFolder.color,
      rootFolderId(),
    );
    childrenByLabel.set(legacyFolder.label, child);
    return child.id;
  }

  function resolveLegacyFolder(
    kind: "slide deck" | "report",
    ownerId: string,
    folderId: string | null,
    foldersById: Map<string, LegacyFolderRow>,
  ): LegacyFolderRow | null {
    if (folderId === null) {
      return null;
    }
    const folder = foldersById.get(folderId);
    if (folder === undefined) {
      warnings.push(
        `${kind} ${ownerId} references missing folder ${folderId}; placed in the project folder`,
      );
      return null;
    }
    return folder;
  }

  // ── Products: decks ────────────────────────────────────────────────────────

  const products: PlannedProduct[] = [];
  const slideDecks: PlannedSlideDeck[] = [];
  const deckIdMap = new Map<string, string>();

  for (const deck of deckRows) {
    const id = claimId(
      takenIds.products,
      deck.id,
      mintShortId,
      "product",
      remaps,
    );
    deckIdMap.set(deck.id, id);
    products.push({
      id,
      type: "slide_deck",
      label: deck.label,
      folderId: folderIdFor(
        resolveLegacyFolder("slide deck", deck.id, deck.folder_id, deckFoldersById),
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
    const id = claimId(
      takenIds.products,
      report.id,
      mintShortId,
      "product",
      remaps,
    );
    reportIdMap.set(report.id, id);
    products.push({
      id,
      type: "report",
      label: report.label,
      folderId: folderIdFor(
        resolveLegacyFolder("report", report.id, report.folder_id, reportFoldersById),
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
    const slideDeckId = deckIdMap.get(slide.slide_deck_id);
    if (slideDeckId === undefined) {
      warnings.push(
        `slide ${slide.id} references missing slide deck ${slide.slide_deck_id}; dropped`,
      );
      continue;
    }
    const id = claimId(takenIds.slides, slide.id, mintShortId, "slide", remaps);
    slideIdMap.set(slide.id, id);
    slides.push({
      id,
      slideDeckId,
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
        `report version ${version.id} references missing report ${version.report_id}; dropped`,
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

  const slideDeckVersionIdMap = new Map<string, string>();
  const slideDeckVersions: PlannedSlideDeckVersion[] = [];

  for (const version of deckVersionRows) {
    const slideDeckId = deckIdMap.get(version.deck_id);
    if (slideDeckId === undefined) {
      warnings.push(
        `deck version ${version.id} references missing slide deck ${version.deck_id}; dropped`,
      );
      continue;
    }
    const id = claimId(
      takenIds.slideDeckVersions,
      version.id,
      mintUuid,
      "slide_deck_version",
      remaps,
    );
    slideDeckVersionIdMap.set(version.id, id);
    slideDeckVersions.push({
      id,
      slideDeckId,
      createdAt: version.created_at,
      label: version.label,
      slideDeckConfig: version.deck_config,
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
  // it is rewritten once both maps are complete.
  for (const version of reportVersions) {
    if (version.restoredFromVersionId !== null) {
      version.restoredFromVersionId =
        reportVersionIdMap.get(version.restoredFromVersionId) ??
          version.restoredFromVersionId;
    }
  }
  for (const version of slideDeckVersions) {
    if (version.restoredFromVersionId !== null) {
      version.restoredFromVersionId =
        slideDeckVersionIdMap.get(version.restoredFromVersionId) ??
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

  const aiContext = project.ai_context.trim() === ""
    ? null
    : project.ai_context.trim();

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
    slideDeckVersions,
    aiContext,
    remaps,
    droppedCounts,
    warnings,
  };
}

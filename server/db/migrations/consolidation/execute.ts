// =============================================================================
// CONSOLIDATE PROJECTS INTO PRODUCTS (PLAN_PRODUCTS_RESTRUCTURE D9)
// =============================================================================
//
// The body of migration 085. Every slide deck and report of every READY
// project becomes a `products` row plus its detail and child rows, foldered
// per D10, attached to the project's package or the instance pin per D5,
// with the figure bundles stamped per D4. The planning is plan.ts, shared
// verbatim with the read-only fleet dry-run (validate_consolidation.ts), so
// the gate and the migration cannot diverge; the helpers exported here are
// the dry-run's too, for the same reason.
//
// TRANSACTION: `tx` is the migration transaction and the only handle to main.
// Source project pools are opened fresh per project, read by discipline only,
// and ended in a `finally`. Failure throws: the runner is the single rollback
// and fail-stop funnel.
//
// SKIPPED: `copying` projects (a half-built WITH TEMPLATE copy) and
// `pending_deletion` projects (D11). Projects whose database is gone are
// skipped with a log line. The dry-run reports all three classes per instance
// ahead of the deploy.
//
// HARD STOPS, both dry-run FAILs: a source DB not at the latest project
// migration, and a project with no run_id on an instance with no pin (D5).
//
// =============================================================================

import type { Sql } from "postgres";
import { getPgConnection } from "../../postgres/connection_manager.ts";
import {
  type ConsolidationPlan,
  type LegacyProjectRow,
  planConsolidation,
  tableExists,
  type TakenIds,
} from "./plan.ts";

export const REQUIRED_SOURCE_MIGRATION = "041_drop_frozen_results_plane";

export async function readProjects(db: Sql): Promise<LegacyProjectRow[]> {
  return await db<LegacyProjectRow[]>`
    SELECT id, label, ai_context, is_central_reporting, is_locked, status,
           deletion_scheduled_at, run_id, admin_area_2, follow_pinned
    FROM projects
    ORDER BY id
  `;
}

export async function readPinnedRunId(db: Sql): Promise<string | null> {
  const rows = await db<{ id: string }[]>`SELECT id FROM runs WHERE pinned`;
  return rows.length > 0 ? rows[0].id : null;
}

export async function projectDatabaseExists(
  db: Sql,
  projectId: string,
): Promise<boolean> {
  const rows = await db<{ one: number }[]>`
    SELECT 1 AS one FROM pg_database WHERE datname = ${projectId}
  `;
  return rows.length > 0;
}

export async function isSourceAtRequiredMigration(
  projectDb: Sql,
): Promise<boolean> {
  const rows = await projectDb<{ migration_id: string }[]>`
    SELECT migration_id FROM schema_migrations
    WHERE migration_id = ${REQUIRED_SOURCE_MIGRATION}
  `;
  return rows.length > 0;
}

// Ids already claimed on main. The tables are absent on an instance the
// dry-run reaches before 084 has shipped, which is the same as empty.
export async function seedTakenIds(db: Sql): Promise<TakenIds> {
  const takenIds: TakenIds = {
    products: new Set<string>(),
    slides: new Set<string>(),
    reportVersions: new Set<string>(),
    slideDeckVersions: new Set<string>(),
  };
  const sources: Array<[string, Set<string>]> = [
    ["products", takenIds.products],
    ["slides", takenIds.slides],
    ["report_versions", takenIds.reportVersions],
    ["slide_deck_versions", takenIds.slideDeckVersions],
  ];
  for (const [table, target] of sources) {
    if (!(await tableExists(db, table))) {
      continue;
    }
    const rows = await db<{ id: string }[]>`SELECT id FROM ${db(table)}`;
    for (const row of rows) {
      target.add(row.id);
    }
  }
  return takenIds;
}

export async function consolidateProjects(tx: Sql): Promise<void> {
  const projects = await readProjects(tx);
  if (projects.length === 0) {
    console.log(`[migration] 085 consolidate: no projects to consolidate`);
    return;
  }

  const pinnedRunId = await readPinnedRunId(tx);
  const takenIds = await seedTakenIds(tx);
  const plans: ConsolidationPlan[] = [];

  for (const project of projects) {
    const skipReason = project.status !== "ready"
      ? `status ${project.status}`
      : !(await projectDatabaseExists(tx, project.id))
      ? "database absent"
      : null;
    if (skipReason !== null) {
      console.log(
        `[migration] 085 consolidate: SKIP project ${project.id} ("${project.label}"): ${skipReason}`,
      );
      continue;
    }

    const runId = project.run_id ?? pinnedRunId;
    if (runId === null) {
      throw new Error(
        `Project ${project.id} ("${project.label}") has no run_id and this instance has no pinned results package. Pin a package, then redeploy.`,
      );
    }

    const projectDb = getPgConnection(project.id, { max: 2 });
    try {
      if (!(await isSourceAtRequiredMigration(projectDb))) {
        throw new Error(
          `Project database ${project.id} ("${project.label}") is not at ${REQUIRED_SOURCE_MIGRATION}. Boot the previous release first.`,
        );
      }
      const plan = await planConsolidation({
        projectDb,
        project,
        runId,
        takenIds,
      });
      await executePlan(tx, plan);
      plans.push(plan);
      logPlan(plan);
    } finally {
      await projectDb.end();
    }
  }

  await writeAiContext(tx, plans);
  logTotals(plans);
}

// Insert order is the FK order: folders (parents first), products, detail
// rows, children.
async function executePlan(tx: Sql, plan: ConsolidationPlan): Promise<void> {
  for (const folder of plan.folders) {
    await tx`
      INSERT INTO folders
        (id, label, color, parent_id, created_by, created_at, last_updated)
      VALUES
        (${folder.id}, ${folder.label}, ${folder.color}, ${folder.parentId},
         ${folder.createdBy}, ${folder.createdAt}, ${folder.lastUpdated})
    `;
  }

  for (const product of plan.products) {
    await tx`
      INSERT INTO products
        (id, type, label, folder_id, run_id, admin_area_2, created_by,
         created_at, last_updated)
      VALUES
        (${product.id}, ${product.type}, ${product.label}, ${product.folderId},
         ${product.runId}, ${product.adminArea2}, ${product.createdBy},
         ${product.createdAt}, ${product.lastUpdated})
    `;
  }

  for (const deck of plan.slideDecks) {
    await tx`
      INSERT INTO slide_decks (id, plan, config)
      VALUES (${deck.id}, ${deck.plan}, ${deck.config})
    `;
  }

  for (const report of plan.reports) {
    await tx`
      INSERT INTO reports
        (id, body, figures, images, config, crdt_state,
         crdt_state_last_updated, body_authors)
      VALUES
        (${report.id}, ${report.body}, ${report.figures}, ${report.images},
         ${report.config}, ${report.crdtState}, ${report.crdtStateLastUpdated},
         ${report.bodyAuthors})
    `;
  }

  for (const slide of plan.slides) {
    await tx`
      INSERT INTO slides
        (id, slide_deck_id, sort_order, config, last_updated, crdt_state,
         crdt_state_last_updated)
      VALUES
        (${slide.id}, ${slide.slideDeckId}, ${slide.sortOrder}, ${slide.config},
         ${slide.lastUpdated}, ${slide.crdtState}, ${slide.crdtStateLastUpdated})
    `;
  }

  for (const version of plan.slideDeckVersions) {
    await tx`
      INSERT INTO slide_deck_versions
        (id, slide_deck_id, created_at, label, slide_deck_config, slides,
         editors, content_hash, restored_from_version_id, slide_editors)
      VALUES
        (${version.id}, ${version.slideDeckId}, ${version.createdAt},
         ${version.label}, ${version.slideDeckConfig}, ${version.slides},
         ${version.editors}, ${version.contentHash},
         ${version.restoredFromVersionId}, ${version.slideEditors})
    `;
  }

  for (const version of plan.reportVersions) {
    await tx`
      INSERT INTO report_versions
        (id, report_id, created_at, label, body, figures, images, editors,
         content_hash, restored_from_version_id, body_authors)
      VALUES
        (${version.id}, ${version.reportId}, ${version.createdAt},
         ${version.label}, ${version.body}, ${version.figures},
         ${version.images}, ${version.editors}, ${version.contentHash},
         ${version.restoredFromVersionId}, ${version.bodyAuthors})
    `;
  }
}

// D15: the per-project ai_context blobs become one instance-level value, each
// under a `## <project label>` heading. An ai_context an admin has already
// written is kept and the project sections append beneath it.
async function writeAiContext(
  tx: Sql,
  plans: ConsolidationPlan[],
): Promise<void> {
  const sections = plans
    .filter((plan) => plan.aiContext !== null)
    .map((plan) => `## ${plan.projectLabel}\n\n${plan.aiContext}`);
  if (sections.length === 0) {
    return;
  }

  const existingRows = await tx<{ config_json_value: string }[]>`
    SELECT config_json_value FROM instance_config
    WHERE config_key = 'ai_context'
  `;
  const existing = existingRows.length > 0
    ? String(JSON.parse(existingRows[0].config_json_value)).trim()
    : "";

  const merged = (existing === "" ? sections : [existing, ...sections]).join(
    "\n\n",
  );
  const value = JSON.stringify(merged);

  await tx`
    INSERT INTO instance_config (config_key, config_json_value)
    VALUES ('ai_context', ${value})
    ON CONFLICT (config_key)
    DO UPDATE SET config_json_value = ${value}
  `;
}

function logPlan(plan: ConsolidationPlan): void {
  const dropped = plan.droppedCounts;
  console.log(
    `[migration] 085 consolidate: project ${plan.projectId} ("${plan.projectLabel}") ` +
      `-> ${plan.folders.length} folders, ${plan.products.length} products ` +
      `(${plan.slideDecks.length} decks / ${plan.reports.length} reports), ` +
      `${plan.slides.length} slides, ` +
      `${plan.slideDeckVersions.length + plan.reportVersions.length} versions, ` +
      `${plan.remaps.length} id remaps, run ${plan.runId}, ` +
      `scope ${plan.adminArea2 ?? "national"}; dropped ` +
      `${dropped.presentationObjects} visualizations, ${dropped.dashboards} dashboards`,
  );
  for (const warning of plan.warnings) {
    console.log(
      `[migration] 085 consolidate: WARNING ${plan.projectId}: ${warning}`,
    );
  }
}

function logTotals(plans: ConsolidationPlan[]): void {
  const sum = (pick: (plan: ConsolidationPlan) => number): number =>
    plans.reduce((total, plan) => total + pick(plan), 0);
  console.log(
    `[migration] 085 consolidate: ${plans.length} projects consolidated, ` +
      `${sum((p) => p.products.length)} products, ${sum((p) => p.slides.length)} slides, ` +
      `${sum((p) => p.folders.length)} folders, ${sum((p) => p.remaps.length)} id remaps; ` +
      `dropped ${sum((p) => p.droppedCounts.presentationObjects)} visualizations, ` +
      `${sum((p) => p.droppedCounts.visualizationFolders)} visualization folders, ` +
      `${sum((p) => p.droppedCounts.dashboards)} dashboards, ` +
      `${sum((p) => p.droppedCounts.dashboardItems)} dashboard items, ` +
      `${sum((p) => p.droppedCounts.dashboardItemGroups)} dashboard item groups`,
  );
}

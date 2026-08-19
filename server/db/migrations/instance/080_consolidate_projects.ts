// =============================================================================
// 080 — CONSOLIDATE PROJECTS INTO PRODUCTS (PLAN_PRODUCTS_RESTRUCTURE D9)
// =============================================================================
//
// Dissolves the per-project databases into the products tables 079 created:
// every slide deck and report of every READY project becomes a `products` row
// plus its detail/child rows, foldered per D10, attached to the project's
// package (or the instance pin) per D5, with `scope`/`provenance.runId`
// stamped into every figure bundle per D4.
//
// TRANSACTION: `tx` is the migration transaction and the ONLY handle to main —
// every main-DB statement here goes through it. Source project pools are
// separate, read-only by discipline, opened fresh per project and ended in a
// `finally`. Failure THROWS: the runner is the single rollback + fail-stop
// funnel, so there is no partial-success path and no Deno.exit.
//
// SKIPPED, DELIBERATELY: `copying` projects (a half-built WITH TEMPLATE copy)
// and `pending_deletion` projects (D11 — the runbook step before rollout is to
// restore any that must survive). Projects whose database is gone are skipped
// with a warning; the D13 dry-run reports all three classes per instance ahead
// of the deploy, so nothing here is a surprise.
//
// HARD STOPS (both are dry-run FAILs, so reaching them means the pre-flight was
// skipped): a source DB not at `039_metric_format_as_indicator` — the figure
// bundles have not been backfilled and must not be migrated half-shaped; and a
// project with no `run_id` on an instance with no pinned package — D5 gives a
// product no way to resolve a package.
//
// The planning itself lives in ../consolidation/plan.ts, shared verbatim with
// the read-only fleet dry-run so the gate and the migration cannot diverge.
//
// =============================================================================

import type { Sql } from "postgres";
import { getPgConnection } from "../../postgres/connection_manager.ts";
import {
  type ConsolidationPlan,
  type LegacyProjectRow,
  type TakenIds,
  planConsolidation,
} from "../consolidation/plan.ts";

const REQUIRED_SOURCE_MIGRATION = "039_metric_format_as_indicator";

export async function consolidateProjects(tx: Sql): Promise<void> {
  const pinnedRows = await tx<{ id: string }[]>`
    SELECT id FROM runs WHERE pinned
  `;
  const pinnedRunId = pinnedRows.length > 0 ? pinnedRows[0].id : null;

  const projects = await tx<LegacyProjectRow[]>`
    SELECT id, label, ai_context, is_central_reporting, is_locked, status,
           deletion_scheduled_at, run_id, admin_area_2, follow_pinned
    FROM projects
    ORDER BY id
  `;

  if (projects.length === 0) {
    console.log(`[migration] 080 consolidate: no projects to consolidate`);
    return;
  }

  const takenIds = await seedTakenIds(tx);
  const plans: ConsolidationPlan[] = [];

  for (const project of projects) {
    if (project.status !== "ready") {
      console.log(
        `[migration] 080 consolidate: SKIP project ${project.id} ("${project.label}") — status ${project.status}`,
      );
      continue;
    }

    const dbExists = await tx<{ one: number }[]>`
      SELECT 1 AS one FROM pg_database WHERE datname = ${project.id}
    `;
    if (dbExists.length === 0) {
      console.log(
        `[migration] 080 consolidate: SKIP project ${project.id} ("${project.label}") — database absent`,
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
      const applied = await projectDb<{ migration_id: string }[]>`
        SELECT migration_id FROM schema_migrations
        WHERE migration_id = ${REQUIRED_SOURCE_MIGRATION}
      `;
      if (applied.length === 0) {
        throw new Error(
          `Project database ${project.id} ("${project.label}") is not at ${REQUIRED_SOURCE_MIGRATION} — boot the previous release first.`,
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

async function seedTakenIds(tx: Sql): Promise<TakenIds> {
  const products = await tx<{ id: string }[]>`SELECT id FROM products`;
  const slides = await tx<{ id: string }[]>`SELECT id FROM slides`;
  const reportVersions = await tx<{ id: string }[]>`SELECT id FROM report_versions`;
  const deckVersions = await tx<{ id: string }[]>`SELECT id FROM deck_versions`;
  return {
    products: new Set(products.map((r) => r.id)),
    slides: new Set(slides.map((r) => r.id)),
    reportVersions: new Set(reportVersions.map((r) => r.id)),
    deckVersions: new Set(deckVersions.map((r) => r.id)),
  };
}

// Insert order is the FK order: folders → products → detail → children.
async function executePlan(tx: Sql, plan: ConsolidationPlan): Promise<void> {
  for (const folder of plan.folders) {
    await tx`
      INSERT INTO folders (id, label, color, last_updated)
      VALUES (${folder.id}, ${folder.label}, ${folder.color}, ${folder.lastUpdated})
    `;
  }

  for (const product of plan.products) {
    await tx`
      INSERT INTO products
        (id, type, label, folder_id, run_id, admin_area_2, created_by, created_at, last_updated)
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
        (id, body, figures, images, config, crdt_state, crdt_state_last_updated, body_authors)
      VALUES
        (${report.id}, ${report.body}, ${report.figures}, ${report.images},
         ${report.config}, ${report.crdtState}, ${report.crdtStateLastUpdated},
         ${report.bodyAuthors})
    `;
  }

  for (const slide of plan.slides) {
    await tx`
      INSERT INTO slides
        (id, slide_deck_id, sort_order, config, last_updated, crdt_state, crdt_state_last_updated)
      VALUES
        (${slide.id}, ${slide.slideDeckId}, ${slide.sortOrder}, ${slide.config},
         ${slide.lastUpdated}, ${slide.crdtState}, ${slide.crdtStateLastUpdated})
    `;
  }

  for (const version of plan.deckVersions) {
    await tx`
      INSERT INTO deck_versions
        (id, deck_id, created_at, label, deck_config, slides, editors, content_hash,
         restored_from_version_id, slide_editors)
      VALUES
        (${version.id}, ${version.deckId}, ${version.createdAt}, ${version.label},
         ${version.deckConfig}, ${version.slides}, ${version.editors},
         ${version.contentHash}, ${version.restoredFromVersionId}, ${version.slideEditors})
    `;
  }

  for (const version of plan.reportVersions) {
    await tx`
      INSERT INTO report_versions
        (id, report_id, created_at, label, body, figures, images, editors, content_hash,
         restored_from_version_id, body_authors)
      VALUES
        (${version.id}, ${version.reportId}, ${version.createdAt}, ${version.label},
         ${version.body}, ${version.figures}, ${version.images}, ${version.editors},
         ${version.contentHash}, ${version.restoredFromVersionId}, ${version.bodyAuthors})
    `;
  }
}

// D15: the per-project ai_context blobs become ONE instance-level value, each
// under a `## <project label>` heading. An ai_context an admin has already
// written is kept and the project sections append beneath it.
async function writeAiContext(tx: Sql, plans: ConsolidationPlan[]): Promise<void> {
  const sections = plans
    .filter((plan) => plan.aiContext !== null)
    .map((plan) => `## ${plan.projectLabel}\n\n${plan.aiContext}`);
  if (sections.length === 0) {
    return;
  }

  const existingRows = await tx<{ config_json_value: string }[]>`
    SELECT config_json_value FROM instance_config WHERE config_key = 'ai_context'
  `;
  const existing = existingRows.length > 0
    ? String(JSON.parse(existingRows[0].config_json_value)).trim()
    : "";

  const merged = (existing === "" ? sections : [existing, ...sections]).join("\n\n");
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
    `[migration] 080 consolidate: project ${plan.projectId} ("${plan.projectLabel}") ` +
      `→ ${plan.folders.length} folders, ${plan.products.length} products ` +
      `(${plan.slideDecks.length} decks / ${plan.reports.length} reports), ` +
      `${plan.slides.length} slides, ` +
      `${plan.deckVersions.length + plan.reportVersions.length} versions, ` +
      `${plan.remaps.length} id remaps, run ${plan.runId}, ` +
      `scope ${plan.adminArea2 ?? "national"}; dropped ` +
      `${dropped.presentationObjects} visualizations, ${dropped.dashboards} dashboards`,
  );
  for (const warning of plan.warnings) {
    console.log(`[migration] 080 consolidate: WARNING ${plan.projectId} — ${warning}`);
  }
}

function logTotals(plans: ConsolidationPlan[]): void {
  const sum = (pick: (plan: ConsolidationPlan) => number): number =>
    plans.reduce((total, plan) => total + pick(plan), 0);
  console.log(
    `[migration] 080 consolidate: ${plans.length} projects consolidated, ` +
      `${sum((p) => p.products.length)} products, ${sum((p) => p.slides.length)} slides, ` +
      `${sum((p) => p.folders.length)} folders, ${sum((p) => p.remaps.length)} id remaps; ` +
      `dropped ${sum((p) => p.droppedCounts.presentationObjects)} visualizations, ` +
      `${sum((p) => p.droppedCounts.visualizationFolders)} visualization folders, ` +
      `${sum((p) => p.droppedCounts.dashboards)} dashboards, ` +
      `${sum((p) => p.droppedCounts.dashboardItems)} dashboard items, ` +
      `${sum((p) => p.droppedCounts.dashboardItemGroups)} dashboard item groups`,
  );
}

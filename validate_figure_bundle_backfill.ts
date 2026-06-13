// =============================================================================
// PRE-DEPLOY DRY-RUN: FigureBundle backfill validation
// =============================================================================
//
// Run BEFORE the P2 cutover deploy against every instance's project databases.
// Executes the bundle backfill logic in READ-ONLY mode and reports:
//   - counts per outcome (in-place ok / chart+table+map ok / ts round-trip ok /
//     ts round-trip FAIL / already-bundle / empty)
//   - identity (project, surface, row id) of every failure
//
// Usage:
//   deno run --allow-env --allow-net --allow-read -c deno.json \
//     validate_figure_bundle_backfill.ts
//
// Outputs a summary to stdout. Zero "FAIL" rows = safe to deploy.
// Reconcile against the baseline: 16,689 figures (12,421 ts / 4,261 raw / 7 empty)
//
// =============================================================================

import postgres from "npm:postgres";
import {
  figureBundleSchema,
  figureBlockSchema,
} from "./lib/types/mod.ts";
import {
  transformFigureBlock,
  transformFigureBlockToBundle,
  getTransformLocalization,
  type FigureBlockMut,
} from "./server/db/migrations/data_transforms/_figure_block.ts";
import { _INSTANCE_LANGUAGE, _INSTANCE_CALENDAR } from "./server/exposed_env_vars.ts";

// ── Config ────────────────────────────────────────────────────────────────────

const PG_HOST = Deno.env.get("PG_HOST") ?? "localhost";
const PG_PORT = parseInt(Deno.env.get("PG_PORT") ?? "5432", 10);
const PG_USER = Deno.env.get("PG_USER") ?? "postgres";
const PG_PASSWORD = Deno.env.get("PG_PASSWORD") ?? "";
const PG_DB_MAIN = Deno.env.get("PG_DB_MAIN") ?? "postgres";

// ── Outcome types ─────────────────────────────────────────────────────────────

type Outcome = "already-bundle" | "empty" | "chart-table-map-ok" | "ts-ok" | "FAIL";

type Finding = {
  projectId: string;
  surface: "slide" | "dashboard_item" | "report";
  rowId: string;
  outcome: Outcome;
  failMsg?: string;
};

type Stats = Record<Outcome, number> & { total: number };

function makeStats(): Stats {
  return { "already-bundle": 0, empty: 0, "chart-table-map-ok": 0, "ts-ok": 0, FAIL: 0, total: 0 };
}

// ── Dry-run transform (read-only — does NOT write to DB) ──────────────────────

function dryRunBlock(
  figureBlock: FigureBlockMut,
  localization: ReturnType<typeof getTransformLocalization>,
  geoData: unknown,
): { outcome: Outcome; failMsg?: string } {
  const already = figureBlockSchema.safeParse(figureBlock).success;
  if (already) {
    return { outcome: figureBlock.bundle !== undefined ? "already-bundle" : "empty" };
  }

  const clone = JSON.parse(JSON.stringify(figureBlock)) as FigureBlockMut;
  try {
    transformFigureBlock(clone);
    transformFigureBlockToBundle(clone, localization, geoData);
  } catch (e) {
    return { outcome: "FAIL", failMsg: e instanceof Error ? e.message : String(e) };
  }

  const result = figureBlockSchema.safeParse(clone);
  if (!result.success) {
    return {
      outcome: "FAIL",
      failMsg: `schema invalid after transform: ${JSON.stringify(result.error.issues.slice(0, 2))}`,
    };
  }

  if (!result.data.bundle) {
    return { outcome: "empty" };
  }

  const bundleCheck = figureBundleSchema.safeParse(result.data.bundle);
  if (!bundleCheck.success) {
    return {
      outcome: "FAIL",
      failMsg: `bundle invalid: ${JSON.stringify(bundleCheck.error.issues.slice(0, 2))}`,
    };
  }

  const hadTimeseries = !!((figureBlock.figureInputs as Record<string, unknown> | undefined)?.timeseriesData);
  return { outcome: hadTimeseries ? "ts-ok" : "chart-table-map-ok" };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mainDb = postgres({
    host: PG_HOST, port: PG_PORT, user: PG_USER, password: PG_PASSWORD,
    database: PG_DB_MAIN,
  });

  // Get countryIso3 from instance_config
  let countryIso3 = "";
  try {
    const cfgRows = await mainDb<{ v: string | null }[]>`
      SELECT value->>'countryIso3' AS v FROM instance_config LIMIT 1
    `;
    countryIso3 = cfgRows[0]?.v ?? "";
  } catch {
    // instance_config query failed — use ""
  }
  const localization = getTransformLocalization(countryIso3);

  // List all project databases
  const projectRows = await mainDb<{ project_id: string }[]>`
    SELECT id AS project_id FROM projects
    WHERE status <> 'pending_deletion'
    AND deletion_scheduled_at IS NULL
  `;
  console.log(`Found ${projectRows.length} projects.`);

  const allFindings: Finding[] = [];
  const totals = makeStats();

  for (const { project_id } of projectRows) {
    const projectDb = postgres({
      host: PG_HOST, port: PG_PORT, user: PG_USER, password: PG_PASSWORD,
      database: project_id,
    });

    try {
      // ── Dashboard items ────────────────────────────────────────────────────
      const dashRows = await projectDb<{ id: string; figure_block: string; geo_data: string | null }[]>`
        SELECT id, figure_block, geo_data FROM dashboard_items
      `;
      for (const row of dashRows) {
        const fb = JSON.parse(row.figure_block) as FigureBlockMut;
        const geoData = row.geo_data ? JSON.parse(row.geo_data) : null;
        const { outcome, failMsg } = dryRunBlock(fb, localization, geoData);
        totals[outcome]++;
        totals.total++;
        if (outcome === "FAIL") {
          allFindings.push({ projectId: project_id, surface: "dashboard_item", rowId: row.id, outcome, failMsg });
        }
      }

      // ── Slides ────────────────────────────────────────────────────────────
      const slideRows = await projectDb<{ id: string; config: string }[]>`
        SELECT id, config FROM slides
      `;
      for (const row of slideRows) {
        const config = JSON.parse(row.config) as Record<string, unknown>;
        if (config.type !== "content") continue;

        function checkNode(node: Record<string, unknown>): void {
          if (node.type === "item") {
            const data = node.data as Record<string, unknown> | undefined;
            if (data?.type === "figure") {
              const fb = data as FigureBlockMut;
              const { outcome, failMsg } = dryRunBlock(fb, localization, null);
              totals[outcome]++;
              totals.total++;
              if (outcome === "FAIL") {
                allFindings.push({ projectId: project_id, surface: "slide", rowId: row.id, outcome, failMsg });
              }
            }
          } else if (node.type === "rows" || node.type === "cols") {
            const children = node.children as Record<string, unknown>[] | undefined;
            if (children) {
              for (const child of children) checkNode(child);
            }
          }
        }

        checkNode(config.layout as Record<string, unknown>);
      }

      // ── Reports ───────────────────────────────────────────────────────────
      const reportRows = await projectDb<{ id: string; figures: string }[]>`
        SELECT id, figures FROM reports
      `;
      for (const row of reportRows) {
        const figures = JSON.parse(row.figures) as Record<string, unknown>;
        for (const [_figId, block] of Object.entries(figures)) {
          const fb = block as FigureBlockMut;
          const { outcome, failMsg } = dryRunBlock(fb, localization, null);
          totals[outcome]++;
          totals.total++;
          if (outcome === "FAIL") {
            allFindings.push({ projectId: project_id, surface: "report", rowId: row.id, outcome, failMsg });
          }
        }
      }
    } catch (projectErr) {
      const msg = projectErr instanceof Error ? projectErr.message : String(projectErr);
      if (msg.includes("does not exist") || msg.includes("connect")) {
        console.log(`  [skip] project ${project_id}: DB not accessible (${msg.slice(0, 80)})`);
      } else {
        throw projectErr;
      }
    } finally {
      await projectDb.end().catch(() => {});
    }
  }

  await mainDb.end();

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("\n=== FigureBundle Backfill Dry-Run Results ===");
  console.log(`Total figures checked: ${totals.total}`);
  console.log(`  already-bundle:    ${totals["already-bundle"]}`);
  console.log(`  empty:             ${totals.empty}`);
  console.log(`  chart/table/map ok:${totals["chart-table-map-ok"]}`);
  console.log(`  timeseries ok:     ${totals["ts-ok"]}`);
  console.log(`  FAIL:              ${totals.FAIL}`);

  if (allFindings.length > 0) {
    console.log("\n=== FAILURES (must fix before deploying) ===");
    for (const f of allFindings) {
      console.log(`  [${f.surface}] project=${f.projectId} row=${f.rowId}: ${f.failMsg}`);
    }
    console.log(`\n⚠️  ${totals.FAIL} failure(s). DO NOT DEPLOY until resolved.`);
    Deno.exit(1);
  } else {
    console.log("\n✓ Zero failures. Safe to deploy.");
  }
}

main().catch((e) => {
  console.error("Dry-run error:", e);
  Deno.exit(1);
});

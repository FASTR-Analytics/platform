// The consolidation replay (PLAN_PRODUCTS_RESTRUCTURE step 2 gates). Driven
// by ./validate_consolidation_replay, which owns the throwaway Postgres
// container and points PG_HOST, PG_PORT, PG_PASSWORD and REPLAY_CONTAINER at
// it. Everything here runs against that server and nothing else.
//
// What it proves, in order:
//
//   (a) A live instance (base plus every instance migration recorded, two
//       project databases that are byte-identical WITH TEMPLATE copies, a
//       pending_deletion copy and a `copying` row without a database) taken
//       through 000, 085 and 086 by the real runner ends with: folders
//       nested per D10, every id collision re-minted with the full reference
//       surface rewritten, every figure bundle on all four surfaces stamped
//       with the owning project's run and scope, the ai_context blobs
//       concatenated, and a schema byte-identical to the base plus 086.
//   (b) A database whose users carry the default_project_* flags, whose logs
//       carry project_id and whose aggregate rows differ only by project_id
//       comes out of 086 with users and logs preserved and the aggregates
//       merged.
//   (c) The two negative controls from the plan's Appendix A: on the
//       post-restructure base, 000 without the user_logs_aggregate ALTER
//       fails at 035, and 000 without any log ALTER fails at 016.
//   (d) The fresh path: the post-restructure base plus 000, every instance
//       migration, 085 and 086, applied by the runner in one pass, converges
//       on the same schema as (a).
//
// Before (a) runs the migrations, the read-only dry-run
// (validate_consolidation.ts) plans the same seeded instance; its FAIL,
// REVIEW and planned counts are checked against what 085 then inserts, which
// is the mechanism the step 10 post-check reuses.

import { dirname, fromFileUrl, join } from "@std/path";
import type { Sql } from "postgres";
import { getPgConnection } from "./server/db/postgres/connection_manager.ts";
import {
  MigrationFailure,
  runMigrationsInDir,
  type TsMigration,
} from "./server/db/migrations/runner.ts";
import { consolidateProjects } from "./server/db/migrations/consolidation/staged/085_consolidate_projects.ts";
import { dryRunInstance, plannedCounts } from "./validate_consolidation.ts";

const ROOT = dirname(fromFileUrl(import.meta.url));
const INSTANCE_DIR = join(ROOT, "server/db/migrations/instance");
const PROJECT_DIR = join(ROOT, "server/db/migrations/project");
const STAGED_DIR = join(ROOT, "server/db/migrations/consolidation/staged");
const MAIN_BASE = join(ROOT, "server/db/instance/_main_database.sql");
const PROJECT_BASE = join(ROOT, "server/db/project/_project_database.sql");

const CONTAINER = Deno.env.get("REPLAY_CONTAINER");
if (CONTAINER === undefined) {
  console.error("REPLAY_CONTAINER is not set; run this through ./validate_consolidation_replay.");
  Deno.exit(2);
}

const TS_MIGRATIONS: Record<string, TsMigration> = {
  "085_consolidate_projects": consolidateProjects,
};

const P1 = "0a000000-0000-4000-8000-000000000001";
const P2 = "0a000000-0000-4000-8000-000000000002";
const P3 = "0a000000-0000-4000-8000-000000000003";
const P4 = "0a000000-0000-4000-8000-000000000004";
const RUN_PIN = "run_pinned";
const RUN_P1 = "run_older";
const AA2 = "AA2-X";

const failures: string[] = [];
function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    console.log(`  FAIL  ${message}`);
    failures.push(message);
  }
}

// ── Database helpers ─────────────────────────────────────────────────────────

async function withDb<T>(name: string, body: (db: Sql) => Promise<T>): Promise<T> {
  const db = getPgConnection(name, { max: 2 });
  try {
    return await body(db);
  } finally {
    await db.end();
  }
}

async function createDatabase(name: string, template?: string): Promise<void> {
  await withDb("postgres", async (admin) => {
    if (template === undefined) {
      await admin`CREATE DATABASE ${admin(name)}`;
    } else {
      await admin`CREATE DATABASE ${admin(name)} WITH TEMPLATE ${admin(template)}`;
    }
  });
}

async function loadFile(db: Sql, path: string): Promise<void> {
  await db.unsafe(await Deno.readTextFile(path));
}

async function count(db: Sql, table: string): Promise<number> {
  const rows = await db<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM ${db(table)}`;
  return rows[0].n;
}

async function listSqlFiles(dir: string): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".sql") && !entry.name.startsWith("_")) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

type ShellVariant = "full" | "no_aggregate_alter" | "no_log_alters";

// The runner scans one directory, so the replay assembles a throwaway one:
// the instance migrations as they are, plus the staged files, with 000
// optionally weakened for the negative controls.
async function stageMigrationDir(
  variant: ShellVariant,
  withConsolidation: boolean,
): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "wb-fastr-consolidation-replay-" });
  for (const name of await listSqlFiles(INSTANCE_DIR)) {
    await Deno.copyFile(join(INSTANCE_DIR, name), join(dir, name));
  }
  let shell = await Deno.readTextFile(join(STAGED_DIR, "000_legacy_project_shell.sql"));
  if (variant === "no_aggregate_alter") {
    shell = shell.replace(
      "ALTER TABLE user_logs_aggregate ADD COLUMN IF NOT EXISTS project_id text;",
      "",
    );
  } else if (variant === "no_log_alters") {
    shell = shell.replaceAll(/ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS project_id text;/g, "");
  }
  await Deno.writeTextFile(join(dir, "000_legacy_project_shell.sql"), shell);
  if (withConsolidation) {
    for (const name of ["085_consolidate_projects.ts", "086_drop_project_layer.sql"]) {
      await Deno.copyFile(join(STAGED_DIR, name), join(dir, name));
    }
  }
  return dir;
}

async function dumpSchema(database: string): Promise<string> {
  const result = await new Deno.Command("docker", {
    args: [
      "exec",
      CONTAINER!,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      database,
      "--schema-only",
      "--no-owner",
      "--no-privileges",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(`pg_dump ${database} failed: ${new TextDecoder().decode(result.stderr)}`);
  }
  return new TextDecoder()
    .decode(result.stdout)
    .split("\n")
    .filter((line) =>
      line !== "" && !line.startsWith("--") && !line.startsWith("\\restrict") &&
      !line.startsWith("\\unrestrict")
    )
    .sort()
    .join("\n");
}

async function schemasMatch(a: string, b: string, message: string): Promise<void> {
  const [dumpA, dumpB] = await Promise.all([dumpSchema(a), dumpSchema(b)]);
  const same = dumpA === dumpB;
  check(same, message);
  if (!same) {
    const dir = await Deno.makeTempDir({ prefix: "wb-fastr-schema-diff-" });
    await Deno.writeTextFile(join(dir, `${a}.sql`), dumpA);
    await Deno.writeTextFile(join(dir, `${b}.sql`), dumpB);
    const diff = await new Deno.Command("diff", {
      args: [join(dir, `${a}.sql`), join(dir, `${b}.sql`)],
      stdout: "piped",
    }).output();
    console.log(new TextDecoder().decode(diff.stdout));
  }
}

// ── Seed data ────────────────────────────────────────────────────────────────

function bundle(): string {
  return JSON.stringify({ metricId: "m1", provenance: { runId: null }, items: [] });
}

function layoutWithFigure(): string {
  return JSON.stringify({
    layout: {
      type: "rows",
      children: [
        { type: "item", data: { type: "figure", bundle: JSON.parse(bundle()) } },
        { type: "item", data: { type: "text", text: "hello" } },
      ],
    },
  });
}

function layoutWithPlaceholder(): string {
  return JSON.stringify({
    layout: { type: "cols", children: [{ type: "item", data: { type: "figure" } }] },
  });
}

const DV1 = "1d000000-0000-4000-8000-000000000001";
const DV2 = "1d000000-0000-4000-8000-000000000002";
const RV1 = "2e000000-0000-4000-8000-000000000001";
const RV2 = "2e000000-0000-4000-8000-000000000002";
const T = "2026-01-01T00:00:00.000Z";

async function seedProjectDatabase(db: Sql): Promise<void> {
  const figures = JSON.stringify({
    f1: { type: "figure", bundle: JSON.parse(bundle()) },
    f2: { type: "figure" },
  });
  await db`INSERT INTO slide_deck_folders (id, label, color, last_updated) VALUES
    ('df1', 'Quarterly', '#ff0000', ${T}), ('df2', 'Empty', '#00ff00', ${T})`;
  await db`INSERT INTO report_folders (id, label, color, last_updated) VALUES
    ('rf1', 'Quarterly', NULL, ${T})`;
  await db`INSERT INTO slide_decks (id, label, plan, config, last_updated, folder_id) VALUES
    ('d1', 'Deck A', NULL, '{"a":1}', ${T}, 'df1'), ('d2', 'Deck B', NULL, NULL, ${T}, NULL)`;
  await db`INSERT INTO slides (id, slide_deck_id, sort_order, config, last_updated) VALUES
    ('s1', 'd1', 0, ${layoutWithFigure()}, ${T}),
    ('s2', 'd1', 1, ${layoutWithPlaceholder()}, ${T}),
    ('s3', 'd2', 0, ${layoutWithFigure()}, ${T})`;
  await db`INSERT INTO reports (id, label, body, figures, images, last_updated, folder_id) VALUES
    ('r1', 'Report A', '<p>a</p>', ${figures}, '{}', ${T}, 'rf1'),
    ('r2', 'Report B', '', '{}', '{}', ${T}, NULL)`;
  const versionSlides = JSON.stringify([{ id: "s1", config: JSON.parse(layoutWithFigure()) }]);
  const slideEditors = JSON.stringify({ slides: { s1: [{ email: "editor@example.org" }] } });
  await db`INSERT INTO deck_versions
    (id, deck_id, created_at, label, deck_config, slides, editors, content_hash, restored_from_version_id, slide_editors) VALUES
    (${DV1}, 'd1', ${T}, 'v1', '{}', ${versionSlides}, '[]', 'h1', NULL, ${slideEditors}),
    (${DV2}, 'd1', ${T}, 'v2', '{}', ${versionSlides}, '[]', 'h2', ${DV1}, NULL)`;
  await db`INSERT INTO report_versions
    (id, report_id, created_at, label, body, figures, images, editors, content_hash, restored_from_version_id) VALUES
    (${RV1}, 'r1', ${T}, 'v1', '<p>a</p>', ${figures}, '{}', '[]', 'h1', NULL),
    (${RV2}, 'r1', ${T}, 'v2', '<p>b</p>', ${figures}, '{}', '[]', 'h2', ${RV1})`;
  await db`INSERT INTO visualization_folders (id, label, last_updated) VALUES ('vf1', 'Viz', ${T})`;
  await db`INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated) VALUES
    ('po1', 'm1', TRUE, 'Default', '{}', ${T}), ('po2', 'm1', FALSE, 'Custom', '{}', ${T})`;
  await db`INSERT INTO dashboards (id, title, is_public, layout, created_by_email, created_at, updated_at, last_updated) VALUES
    ('db1', 'Dash', TRUE, '{}', 'editor@example.org', ${T}, ${T}, ${T})`;
  await db`INSERT INTO dashboard_items (id, dashboard_id, label, sort_order, figure_block, last_updated) VALUES
    ('di1', 'db1', 'Item', 0, '{"type":"figure"}', ${T})`;
}

async function seedLegacyMain(db: Sql): Promise<void> {
  await db`INSERT INTO runs (id, label, status, provenance, pinned) VALUES
    (${RUN_PIN}, 'Pinned package', 'ready', '{}', TRUE),
    (${RUN_P1}, 'Older package', 'ready', '{}', FALSE)`;
  await db`INSERT INTO users (email, is_admin) VALUES
    ('viewer@example.org', FALSE), ('editor@example.org', FALSE), ('norole@example.org', FALSE)`;
  await db`INSERT INTO projects (id, label, ai_context, status, run_id, admin_area_2, is_central_reporting) VALUES
    (${P1}, 'Project One', '  Context for project one  ', 'ready', ${RUN_P1}, ${AA2}, FALSE),
    (${P2}, 'Project Two', '', 'ready', NULL, NULL, TRUE),
    (${P3}, 'Project Three', 'Gone', 'pending_deletion', ${RUN_P1}, NULL, FALSE),
    (${P4}, 'Project Four', '', 'copying', NULL, NULL, FALSE)`;
  await db`INSERT INTO project_user_roles (email, project_id, role) VALUES
    ('viewer@example.org', ${P1}, 'viewer'),
    ('editor@example.org', ${P1}, 'editor'),
    ('editor@example.org', ${P2}, 'viewer')`;
  await db`INSERT INTO dashboard_slugs (slug, project_id, dashboard_id) VALUES ('dash-one', ${P1}, 'db1')`;
  await db`INSERT INTO instance_config (config_key, config_json_value) VALUES
    ('ai_context', ${JSON.stringify("Existing instance context")})`;
}

// ── (a) The live-instance path ───────────────────────────────────────────────

type BundleSighting = { runId: unknown; adminArea2: unknown };

function collectBundles(node: unknown, out: BundleSighting[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  if (data?.type === "figure" && data.bundle !== undefined) {
    const b = data.bundle as { scope?: { adminArea2?: unknown }; provenance?: { runId?: unknown } };
    out.push({ runId: b.provenance?.runId, adminArea2: b.scope?.adminArea2 });
  }
  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      collectBundles(child, out);
    }
  }
}

function bundlesInFiguresMap(figuresJson: string): BundleSighting[] {
  const out: BundleSighting[] = [];
  for (const block of Object.values(JSON.parse(figuresJson) as Record<string, unknown>)) {
    collectBundles({ data: block }, out);
  }
  return out;
}

function bundlesInSlideConfig(configJson: string): BundleSighting[] {
  const out: BundleSighting[] = [];
  collectBundles((JSON.parse(configJson) as { layout?: unknown }).layout, out);
  return out;
}

async function assertConsolidated(db: Sql): Promise<void> {
  type ProductRow = {
    id: string;
    type: string;
    label: string;
    folder_id: string;
    run_id: string;
    admin_area_2: string | null;
    created_by: string | null;
    created_at: string | null;
  };
  type FolderRow = {
    id: string;
    label: string;
    color: string | null;
    parent_id: string | null;
    created_by: string | null;
  };
  const folders = await db<FolderRow[]>`SELECT id, label, color, parent_id, created_by FROM folders`;
  const products = await db<ProductRow[]>`
    SELECT id, type, label, folder_id, run_id, admin_area_2, created_by, created_at FROM products`;

  const roots = folders.filter((f) => f.parent_id === null);
  const children = folders.filter((f) => f.parent_id !== null);
  check(folders.length === 4, `4 folders planned (got ${folders.length})`);
  check(
    roots.length === 2 && roots.every((f) => ["Project One", "Project Two"].includes(f.label)),
    "two root folders, one per ready project, labelled by the project",
  );
  check(
    children.length === 2 && children.every((f) => f.label === "Quarterly") &&
      children.every((f) => roots.some((r) => r.id === f.parent_id)),
    "the same-label deck and report sub-folders merged into one 'Quarterly' child under each root",
  );
  check(
    children.every((f) => f.color === "#ff0000"),
    "the merged child keeps the first non-null legacy colour",
  );
  check(!folders.some((f) => f.label === "Empty"), "a sub-folder with no product is not emitted");
  check(
    folders.every((f) => f.created_by === null) && products.every((p) => p.created_by === null && p.created_at === null),
    "no invented provenance on folders or products",
  );

  check(products.length === 8, `8 products: 4 per ready project, the pending_deletion copy skipped (got ${products.length})`);
  const rootOne = roots.find((f) => f.label === "Project One")!;
  const childOne = children.find((f) => f.parent_id === rootOne.id)!;
  const byLabelOne = new Map(
    products.filter((p) => p.run_id === RUN_P1).map((p) => [p.label, p]),
  );
  check(
    byLabelOne.get("Deck A")?.folder_id === childOne.id &&
      byLabelOne.get("Report A")?.folder_id === childOne.id &&
      byLabelOne.get("Deck B")?.folder_id === rootOne.id &&
      byLabelOne.get("Report B")?.folder_id === rootOne.id,
    "products with a legacy sub-folder sit in the child, the rest in the root",
  );
  const one = products.filter((p) => p.run_id === RUN_P1);
  const two = products.filter((p) => p.run_id === RUN_PIN);
  check(
    one.length === 4 && one.every((p) => p.admin_area_2 === AA2),
    "Project One's products carry its run_id and admin_area_2",
  );
  check(
    two.length === 4 && two.every((p) => p.admin_area_2 === null),
    "Project Two (run_id NULL) is attached to the pin at national scope",
  );
  const legacyIds = new Set(["d1", "d2", "r1", "r2"]);
  check(
    one.every((p) => legacyIds.has(p.id)) && two.every((p) => !legacyIds.has(p.id) && p.id.length === 4),
    "the first project keeps its ids; the template copy's colliding ids are re-minted as 4-char ids",
  );

  const slides = await db<{ id: string; slide_deck_id: string; config: string; sort_order: number }[]>`
    SELECT id, slide_deck_id, config, sort_order FROM slides`;
  check(slides.length === 6, `6 slides (got ${slides.length})`);
  const legacySlideIds = new Set(["s1", "s2", "s3"]);
  check(
    slides.filter((s) => !legacySlideIds.has(s.id)).length === 3,
    "the copy's three slide ids are re-minted",
  );

  const deckVersions = await db<
    { id: string; slide_deck_id: string; slides: string; slide_editors: string | null; restored_from_version_id: string | null }[]
  >`SELECT id, slide_deck_id, slides, slide_editors, restored_from_version_id FROM slide_deck_versions`;
  check(deckVersions.length === 4, `4 slide deck versions (got ${deckVersions.length})`);
  const deckVersionIds = new Set(deckVersions.map((v) => v.id));
  check(
    deckVersions.filter((v) => v.restored_from_version_id !== null).every((v) =>
      deckVersionIds.has(v.restored_from_version_id!) &&
      deckVersions.find((o) => o.id === v.restored_from_version_id)!.slide_deck_id === v.slide_deck_id
    ),
    "slide_deck_versions.restored_from_version_id follows the re-minted version id within the deck",
  );
  check(
    deckVersions.every((v) => {
      const deckSlideIds = new Set(slides.filter((s) => s.slide_deck_id === v.slide_deck_id).map((s) => s.id));
      const snapshot = JSON.parse(v.slides) as { id: string }[];
      const editorKeys = v.slide_editors === null
        ? []
        : Object.keys((JSON.parse(v.slide_editors) as { slides: Record<string, unknown> }).slides);
      return snapshot.every((s) => deckSlideIds.has(s.id)) && editorKeys.every((k) => deckSlideIds.has(k));
    }),
    "version snapshots' slides[].id and slide_editors keys follow the re-minted slide ids",
  );

  const reportVersions = await db<{ id: string; report_id: string; figures: string; restored_from_version_id: string | null }[]>`
    SELECT id, report_id, figures, restored_from_version_id FROM report_versions`;
  check(reportVersions.length === 4, `4 report versions (got ${reportVersions.length})`);
  const reportVersionIds = new Set(reportVersions.map((v) => v.id));
  check(
    reportVersions.filter((v) => v.restored_from_version_id !== null).every((v) =>
      reportVersionIds.has(v.restored_from_version_id!) &&
      reportVersions.find((o) => o.id === v.restored_from_version_id)!.report_id === v.report_id
    ),
    "report_versions.restored_from_version_id follows the re-minted version id within the report",
  );

  // Stamps on all four surfaces, each checked against its owning product.
  const scopeOf = new Map(products.map((p) => [p.id, { runId: p.run_id, adminArea2: p.admin_area_2 }]));
  const stamped = (sightings: BundleSighting[], productId: string): boolean => {
    const expected = scopeOf.get(productId)!;
    return sightings.every((s) => s.runId === expected.runId && s.adminArea2 === expected.adminArea2);
  };
  const reports = await db<{ id: string; figures: string }[]>`SELECT id, figures FROM reports`;
  const liveSlideBundles = slides.flatMap((s) => bundlesInSlideConfig(s.config));
  const liveReportBundles = reports.flatMap((r) => bundlesInFiguresMap(r.figures));
  const deckVersionBundles = deckVersions.flatMap((v) =>
    (JSON.parse(v.slides) as { config: unknown }[]).flatMap((s) => {
      const out: BundleSighting[] = [];
      collectBundles((s.config as { layout?: unknown }).layout, out);
      return out;
    })
  );
  const reportVersionBundles = reportVersions.flatMap((v) => bundlesInFiguresMap(v.figures));
  check(
    liveSlideBundles.length === 4 && liveReportBundles.length === 2 &&
      deckVersionBundles.length === 4 && reportVersionBundles.length === 4,
    "every seeded bundle survives on all four surfaces (4 + 2 + 4 + 4)",
  );
  check(
    slides.every((s) => stamped(bundlesInSlideConfig(s.config), s.slide_deck_id)) &&
      reports.every((r) => stamped(bundlesInFiguresMap(r.figures), r.id)) &&
      deckVersions.every((v) =>
        stamped(
          (JSON.parse(v.slides) as { config: unknown }[]).flatMap((s) => {
            const out: BundleSighting[] = [];
            collectBundles((s.config as { layout?: unknown }).layout, out);
            return out;
          }),
          v.slide_deck_id,
        )
      ) &&
      reportVersions.every((v) => stamped(bundlesInFiguresMap(v.figures), v.report_id)),
    "every bundle is stamped with its owning product's run_id and admin_area_2",
  );
  check(
    slides.filter((s) => s.sort_order === 1).every((s) => !s.config.includes("bundle")),
    "placeholder figure blocks stay bundle-less",
  );

  const aiContext = await db<{ config_json_value: string }[]>`
    SELECT config_json_value FROM instance_config WHERE config_key = 'ai_context'`;
  check(
    aiContext.length === 1 &&
      JSON.parse(aiContext[0].config_json_value) ===
        "Existing instance context\n\n## Project One\n\nContext for project one",
    "ai_context: the existing value kept, the non-empty project context appended under its heading",
  );

  const applied = await db<{ migration_id: string }[]>`
    SELECT migration_id FROM schema_migrations
    WHERE migration_id IN ('000_legacy_project_shell', '085_consolidate_projects', '086_drop_project_layer')`;
  check(applied.length === 3, "000, 085 and 086 recorded in schema_migrations");
}

async function replayLiveInstance(): Promise<void> {
  console.log("\n=== (a) Live instance: base, migrations, two template-identical projects ===");
  await createDatabase("main");
  await withDb("main", async (db) => {
    await loadFile(db, MAIN_BASE);
    await runMigrationsInDir(db, INSTANCE_DIR, {}, "instance");
    await seedLegacyMain(db);
  });

  await createDatabase(P1);
  await withDb(P1, async (db) => {
    await loadFile(db, PROJECT_BASE);
    await runMigrationsInDir(db, PROJECT_DIR, {}, "project");
    const at041 = await db<{ one: number }[]>`
      SELECT 1 AS one FROM schema_migrations WHERE migration_id = '041_drop_frozen_results_plane'`;
    check(at041.length === 1, "the seeded project database is at 041_drop_frozen_results_plane");
    await seedProjectDatabase(db);
  });
  await createDatabase(P2, P1);
  await createDatabase(P3, P1);

  console.log("\n=== Dry-run of the seeded instance before the migrations run ===");
  const dryRun = await dryRunInstance({
    name: "replay",
    host: Deno.env.get("PG_HOST") ?? "localhost",
    port: parseInt(Deno.env.get("PG_PORT") ?? "5432", 10),
    password: Deno.env.get("PG_PASSWORD") ?? "",
  });
  check(dryRun.fails.length === 0, `dry-run reports zero FAIL (${dryRun.fails.join("; ")})`);
  check(
    dryRun.pendingDeletion.length === 1 && dryRun.centralReporting.length === 1 &&
      dryRun.runIdNull.length === 1 && dryRun.pinnedRunId === RUN_PIN,
    "dry-run lists the pending_deletion, central-reporting and run_id NULL projects and the pin",
  );
  check(
    dryRun.viewerOnlyUsers.length === 1 && dryRun.viewerOnlyUsers[0] === "viewer@example.org" &&
      dryRun.usersWithNoProjectRole === 1,
    "dry-run names the viewer-only user and counts the user with no project role",
  );
  check(
    dryRun.extraDropped.userAuthoredVisualizations === 2 &&
      dryRun.extraDropped.publicDashboards === 2 && dryRun.dashboardSlugs === 1,
    "dry-run counts the user-authored visualizations, public dashboards and slugs that are lost",
  );
  const planned = plannedCounts(dryRun);

  const stagedDir = await stageMigrationDir("full", true);
  await withDb("main", async (db) => {
    await runMigrationsInDir(db, stagedDir, TS_MIGRATIONS, "replay");
    await assertConsolidated(db);
    const actual = {
      products: await count(db, "products"),
      slideDecks: await count(db, "slide_decks"),
      reports: await count(db, "reports"),
      folders: await count(db, "folders"),
      slides: await count(db, "slides"),
      slideDeckVersions: await count(db, "slide_deck_versions"),
      reportVersions: await count(db, "report_versions"),
      remaps: planned.remaps,
    };
    check(
      JSON.stringify(actual) === JSON.stringify(planned) && planned.remaps === 11,
      `the dry-run's planned counts match what 085 inserted (${JSON.stringify(planned)})`,
    );
  });
}

// ── The reference schema: base plus 086 ──────────────────────────────────────

async function buildReference(): Promise<void> {
  console.log("\n=== Reference schema: fresh base plus 086 ===");
  await createDatabase("main_reference");
  await withDb("main_reference", async (db) => {
    await loadFile(db, MAIN_BASE);
    await loadFile(db, join(STAGED_DIR, "086_drop_project_layer.sql"));
  });
  await schemasMatch("main", "main_reference", "(a) migrated schema is byte-identical to fresh base plus 086");
}

// ── (b) Users, logs and aggregates through 086 ───────────────────────────────

async function replayLogsMerge(): Promise<void> {
  console.log("\n=== (b) Users, logs and aggregate rows through 086 ===");
  await createDatabase("main_logs");
  await withDb("main_logs", async (db) => {
    await loadFile(db, MAIN_BASE);
    await db`INSERT INTO users (email, is_admin, can_create_projects, default_project_can_view_data) VALUES
      ('a@example.org', FALSE, TRUE, TRUE), ('b@example.org', TRUE, TRUE, FALSE)`;
    await db`INSERT INTO projects (id, label, ai_context) VALUES (${P1}, 'One', ''), (${P2}, 'Two', '')`;
    await db`INSERT INTO user_logs (user_email, endpoint, endpoint_result, project_id) VALUES
      ('a@example.org', '/x', 'ok', ${P1}), ('a@example.org', '/y', 'ok', NULL)`;
    await db`INSERT INTO ai_usage_logs (user_email, project_id, model) VALUES ('b@example.org', ${P2}, 'm')`;
    await db`INSERT INTO user_logs_aggregate (user_email, endpoint, endpoint_result, project_id, week_start, count) VALUES
      ('a@example.org', '/x', 'ok', ${P1}, '2026-01-05', 5),
      ('a@example.org', '/x', 'ok', ${P2}, '2026-01-05', 7),
      ('a@example.org', '/x', 'ok', NULL, '2026-01-05', 1),
      ('a@example.org', '/y', 'ok', ${P1}, '2026-01-05', 2)`;
    await loadFile(db, join(STAGED_DIR, "086_drop_project_layer.sql"));

    check(await count(db, "users") === 2, "users preserved");
    check(await count(db, "user_logs") === 2, "user_logs preserved");
    check(await count(db, "ai_usage_logs") === 1, "ai_usage_logs preserved");
    const aggregates = await db<{ endpoint: string; count: number }[]>`
      SELECT endpoint, count FROM user_logs_aggregate ORDER BY endpoint`;
    check(
      aggregates.length === 2 && aggregates[0].count === 13 && aggregates[1].count === 2,
      "aggregate rows differing only by project_id merged, counts summed",
    );
    const userColumns = await db<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND (column_name LIKE 'default_project_%' OR column_name = 'can_create_projects')`;
    check(userColumns.length === 0, "the 17 default_project_* columns and can_create_projects dropped");
    const index = await db<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_user_logs_aggregate_unique'`;
    check(
      index.length === 1 && !index[0].indexdef.includes("COALESCE"),
      "idx_user_logs_aggregate_unique rebuilt without the COALESCE term",
    );
  });
}

// ── (c) and (d): the post-restructure base ───────────────────────────────────

async function expectFailureAt(
  variant: ShellVariant,
  database: string,
  expectedPrefix: string,
): Promise<void> {
  await createDatabase(database, "main_reference");
  const dir = await stageMigrationDir(variant, false);
  let failedAt: string | null = null;
  await withDb(database, async (db) => {
    try {
      await runMigrationsInDir(db, dir, {}, "negative control");
    } catch (error) {
      failedAt = error instanceof MigrationFailure ? error.filename : "?";
    }
  });
  check(
    failedAt !== null && (failedAt as string).startsWith(expectedPrefix),
    `000 (${variant}) fails at ${expectedPrefix} on the post-restructure base (failed at ${failedAt ?? "nothing"})`,
  );
}

async function replayNegativeControls(): Promise<void> {
  console.log("\n=== (c) Negative controls on the post-restructure base ===");
  await expectFailureAt("no_aggregate_alter", "main_negative_035", "035_");
  await expectFailureAt("no_log_alters", "main_negative_016", "016_");
}

async function replayFreshPath(): Promise<void> {
  console.log("\n=== (d) Fresh path: post-restructure base plus 000 to 086 in one pass ===");
  await createDatabase("main_fresh", "main_reference");
  const dir = await stageMigrationDir("full", true);
  const expected = (await listSqlFiles(INSTANCE_DIR)).length + 3;
  await withDb("main_fresh", async (db) => {
    await runMigrationsInDir(db, dir, TS_MIGRATIONS, "fresh");
    const applied = await count(db, "schema_migrations");
    check(applied === expected, `${expected} migrations recorded on the fresh path (got ${applied})`);
    check(await count(db, "products") === 0, "085 on a database with no projects inserts nothing");
  });
  await schemasMatch("main_fresh", "main_reference", "(d) fresh-path schema is byte-identical to fresh base plus 086");
}

// ── Main ─────────────────────────────────────────────────────────────────────

await replayLiveInstance();
await buildReference();
await replayLogsMerge();
await replayNegativeControls();
await replayFreshPath();

console.log("");
if (failures.length > 0) {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  Deno.exit(1);
}
console.log("All consolidation replay checks passed.");

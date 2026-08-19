#!/usr/bin/env -S deno run --allow-all
// =============================================================================
// PRE-DEPLOY FLEET DRY-RUN: project → product consolidation
// =============================================================================
//
// The gate for the products restructure (PLAN_PRODUCTS_RESTRUCTURE D13). Run it
// against the WHOLE fleet before the rollout deploy; zero FAIL is the gate.
//
// It shares its planning code with the migration: `planConsolidation()` from
// server/db/migrations/consolidation/plan.ts is exactly what
// 080_consolidate_projects.ts executes, so the thing that is gated here is the
// thing that runs there. This script only REPORTS the plan — it opens no write
// transaction, issues no INSERT/UPDATE/DELETE/ALTER, and never touches the
// instance containers. READ-ONLY throughout (PROTOCOL_ACCESS_DBS "Safety").
//
// Two verdict classes, kept apart on purpose:
//   FAIL   — the migration would abort here. Blocks the deploy. Exit 1.
//   REVIEW — a count Tim must read and accept before deploying: the
//            visualizations and dashboards that get DELETED (D3), the users who
//            become full editors (D2), the central-reporting projects that
//            become ordinary visible folders and the pending_deletion projects
//            that are NOT migrated (D11). None of these stop the migration;
//            all of them are irreversible once it runs.
//
// Usage:
//   ./validate_consolidation.ts                       # every running instance
//   ./validate_consolidation.ts sierraleone uganda    # named instances only
//   ./validate_consolidation.ts --local               # one instance, already
//                                                     # reachable on PG_HOST/
//                                                     # PG_PORT/PG_PASSWORD
//   ./validate_consolidation.ts --json [path]         # also write the planned
//                                                     # per-instance counts
//
// The `--json` file (default rollout_logs/consolidation_plan.json) is what
// `./rollout_products --expect` post-checks each migrated instance against, so
// the numbers the deploy is verified against are the numbers this gate approved.
//
// Fleet mode resolves each instance's Postgres port and password from the
// container over ssh and opens its own short-lived tunnel per instance
// (PROTOCOL_ACCESS_DBS recipe B), then tears it down. Nothing is written to the
// server and no password reaches argv.
//
// =============================================================================

import postgres from "postgres";
import type { Sql } from "postgres";
import {
  type ConsolidationPlan,
  type LegacyProjectRow,
  planConsolidation,
  type TakenIds,
} from "./server/db/migrations/consolidation/plan.ts";

// ── Config ───────────────────────────────────────────────────────────────────

const SSH_HOST = "wb-server";
const SSH_OPTS = [
  "-o",
  "ConnectTimeout=15",
  "-o",
  "ControlMaster=auto",
  "-o",
  `ControlPath=${Deno.env.get("HOME") ?? "/tmp"}/.ssh/cm-%r@%h:%p`,
  "-o",
  "ControlPersist=15m",
];

const PG_USER = Deno.env.get("PG_USER") ?? "postgres";
const TUNNEL_READY_TIMEOUT_MS = 30_000;

const GREEN = "\x1b[92m";
const RED = "\x1b[91m";
const RESET = "\x1b[0m";

// The source-schema assertion 080 makes before it reads a project DB.
const REQUIRED_SOURCE_MIGRATION = "039_metric_format_as_indicator";

// ── Types ────────────────────────────────────────────────────────────────────

type Instance = {
  name: string;
  host: string;
  port: number;
  password: string;
};

type ProjectRef = { id: string; label: string };

type ExtraDroppedCounts = {
  userAuthoredVisualizations: number;
  publicDashboards: number;
};

type InstanceReport = {
  instance: string;
  fails: string[];
  reviews: string[];
  statusCounts: Map<string, number>;
  pendingDeletion: ProjectRef[];
  centralReporting: ProjectRef[];
  dbAbsent: ProjectRef[];
  notAt039: ProjectRef[];
  runIdNull: ProjectRef[];
  pinnedRunId: string | null;
  pinnedRunLabel: string | null;
  plans: ConsolidationPlan[];
  extraDropped: ExtraDroppedCounts;
  dashboardSlugs: number;
  totalUsers: number;
  viewerOnlyUsers: string[];
  usersWithNoProjectRole: number;
};

function emptyReport(instance: string): InstanceReport {
  return {
    instance,
    fails: [],
    reviews: [],
    statusCounts: new Map(),
    pendingDeletion: [],
    centralReporting: [],
    dbAbsent: [],
    notAt039: [],
    runIdNull: [],
    pinnedRunId: null,
    pinnedRunLabel: null,
    plans: [],
    extraDropped: { userAuthoredVisualizations: 0, publicDashboards: 0 },
    dashboardSlugs: 0,
    totalUsers: 0,
    viewerOnlyUsers: [],
    usersWithNoProjectRole: 0,
  };
}

// ── ssh helpers ──────────────────────────────────────────────────────────────

async function ssh(command: string): Promise<string> {
  const child = new Deno.Command("ssh", {
    args: [...SSH_OPTS, SSH_HOST, command],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await child.output();
  if (!result.success) {
    throw new Error(
      `ssh failed (${result.code}): ${command}\n${
        new TextDecoder().decode(result.stderr).trim()
      }`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

async function listRunningInstances(): Promise<string[]> {
  const out = await ssh(`docker ps --format '{{.Names}}'`);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name.endsWith("-postgres"))
    .map((name) => name.slice(0, -"-postgres".length))
    .sort();
}

// `docker port` prints one line per bound address; every line carries the same
// host port, so the first is enough.
async function resolvePgPort(instance: string): Promise<number> {
  const out = await ssh(`docker port ${instance}-postgres 5432`);
  const first = out.split("\n")[0]?.trim() ?? "";
  const port = parseInt(first.slice(first.lastIndexOf(":") + 1), 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`could not parse a host port from "${out}"`);
  }
  return port;
}

async function resolvePgPassword(instance: string): Promise<string> {
  return await ssh(`docker exec ${instance}-postgres printenv POSTGRES_PASSWORD`);
}

function pickFreeLocalPort(): number {
  const listener = Deno.listen({ port: 0 });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

async function waitForPort(port: number): Promise<void> {
  const deadline = Date.now() + TUNNEL_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const conn = await Deno.connect({ hostname: "127.0.0.1", port });
      conn.close();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`tunnel on localhost:${port} never became reachable`);
}

// Runs `body` with a private ssh tunnel to the instance's Postgres, and tears
// the tunnel down whatever happens.
async function withTunnel<T>(
  instance: string,
  body: (conn: Instance) => Promise<T>,
): Promise<T> {
  const remotePort = await resolvePgPort(instance);
  const password = await resolvePgPassword(instance);
  const localPort = pickFreeLocalPort();
  const tunnel = new Deno.Command("ssh", {
    args: [...SSH_OPTS, "-N", "-L", `${localPort}:localhost:${remotePort}`, SSH_HOST],
    stdout: "null",
    stderr: "null",
  }).spawn();
  try {
    await waitForPort(localPort);
    return await body({
      name: instance,
      host: "127.0.0.1",
      port: localPort,
      password,
    });
  } finally {
    try {
      tunnel.kill("SIGTERM");
    } catch {
      // already gone
    }
    await tunnel.status;
  }
}

// ── Postgres helpers ─────────────────────────────────────────────────────────

function connect(instance: Instance, database: string): Sql {
  return postgres({
    host: instance.host,
    port: instance.port,
    user: PG_USER,
    password: instance.password,
    database,
    max: 2,
    onnotice: () => {},
  });
}

async function tableExists(db: Sql, table: string): Promise<boolean> {
  const rows = await db<{ one: number }[]>`
    SELECT 1 AS one FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

// ── The per-instance dry-run ─────────────────────────────────────────────────

async function checkInstance(instance: Instance): Promise<InstanceReport> {
  const report = emptyReport(instance.name);

  const mainDb = connect(instance, "main");
  try {
    // ── The pin (D5: the default run_id for a project that has none) ─────────
    const pinned = await mainDb<{ id: string; label: string }[]>`
      SELECT id, label FROM runs WHERE pinned
    `;
    if (pinned.length > 0) {
      report.pinnedRunId = pinned[0].id;
      report.pinnedRunLabel = pinned[0].label;
    }

    // ── Projects by status, and the two D11 lists ────────────────────────────
    // Ordered by id, exactly as 080 orders them, so the id-remap plan reported
    // here is the one the migration will produce.
    const projects = await mainDb<LegacyProjectRow[]>`
      SELECT id, label, ai_context, is_central_reporting, is_locked, status,
             deletion_scheduled_at, run_id, admin_area_2, follow_pinned
      FROM projects
      ORDER BY id
    `;
    for (const project of projects) {
      report.statusCounts.set(
        project.status,
        (report.statusCounts.get(project.status) ?? 0) + 1,
      );
      if (project.status === "pending_deletion") {
        report.pendingDeletion.push({ id: project.id, label: project.label });
      }
      if (project.is_central_reporting) {
        report.centralReporting.push({ id: project.id, label: project.label });
      }
    }

    // ── Users: the D2 blast radius ───────────────────────────────────────────
    const userRows = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM users
    `;
    report.totalUsers = userRows[0].count;
    const viewerOnly = await mainDb<{ email: string }[]>`
      SELECT u.email FROM users u
      WHERE EXISTS (
        SELECT 1 FROM project_user_roles r
        WHERE r.email = u.email AND r.role = 'viewer'
      )
      AND NOT EXISTS (
        SELECT 1 FROM project_user_roles r
        WHERE r.email = u.email AND r.role = 'editor'
      )
      ORDER BY u.email
    `;
    report.viewerOnlyUsers = viewerOnly.map((row) => row.email);
    const noRole = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM project_user_roles r
        WHERE r.email = u.email AND r.role IN ('viewer', 'editor')
      )
    `;
    report.usersWithNoProjectRole = noRole[0].count;

    // Public dashboards also have a main-DB slug row; counted here so the
    // number survives even when a project DB is unreachable.
    if (await tableExists(mainDb, "dashboard_slugs")) {
      const slugRows = await mainDb<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM dashboard_slugs
      `;
      report.dashboardSlugs = slugRows[0].count;
    }

    // ── takenIds: seeded exactly as 080 seeds them ───────────────────────────
    // Pre-deploy the products tables do not exist yet, which is the same as
    // seeding from empty. Post-deploy (a re-run) they do, and the remap plan
    // must account for what is already there.
    const takenIds = await seedTakenIds(mainDb);

    // ── Per-project planning ─────────────────────────────────────────────────
    for (const project of projects) {
      if (project.status !== "ready") {
        continue;
      }

      const dbExists = await mainDb<{ one: number }[]>`
        SELECT 1 AS one FROM pg_database WHERE datname = ${project.id}
      `;
      if (dbExists.length === 0) {
        report.dbAbsent.push({ id: project.id, label: project.label });
        continue;
      }

      if (project.run_id === null) {
        report.runIdNull.push({ id: project.id, label: project.label });
      }
      const runId = project.run_id ?? report.pinnedRunId;
      if (runId === null) {
        report.fails.push(
          `project ${project.id} ("${project.label}") has no run_id and this instance has no pinned package — pin one first (D5)`,
        );
        continue;
      }

      const projectDb = connect(instance, project.id);
      try {
        const applied = await projectDb<{ migration_id: string }[]>`
          SELECT migration_id FROM schema_migrations
          WHERE migration_id = ${REQUIRED_SOURCE_MIGRATION}
        `;
        if (applied.length === 0) {
          report.notAt039.push({ id: project.id, label: project.label });
          report.fails.push(
            `project database ${project.id} ("${project.label}") is not at ${REQUIRED_SOURCE_MIGRATION} — boot the previous release there first`,
          );
          continue;
        }

        const plan = await planConsolidation({
          projectDb,
          project,
          runId,
          takenIds,
        });
        report.plans.push(plan);

        const extra = await countExtraDropped(projectDb);
        report.extraDropped.userAuthoredVisualizations +=
          extra.userAuthoredVisualizations;
        report.extraDropped.publicDashboards += extra.publicDashboards;
      } catch (error) {
        report.fails.push(
          `project ${project.id} ("${project.label}") could not be planned: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        await projectDb.end().catch(() => {});
      }
    }
  } finally {
    await mainDb.end().catch(() => {});
  }

  addReviews(report);
  return report;
}

async function seedTakenIds(mainDb: Sql): Promise<TakenIds> {
  const takenIds: TakenIds = {
    products: new Set<string>(),
    slides: new Set<string>(),
    reportVersions: new Set<string>(),
    deckVersions: new Set<string>(),
  };
  const sources: Array<[string, Set<string>]> = [
    ["products", takenIds.products],
    ["slides", takenIds.slides],
    ["report_versions", takenIds.reportVersions],
    ["deck_versions", takenIds.deckVersions],
  ];
  for (const [table, target] of sources) {
    if (!(await tableExists(mainDb, table))) {
      continue;
    }
    const rows = await mainDb<{ id: string }[]>`
      SELECT id FROM ${mainDb(table)}
    `;
    for (const row of rows) {
      target.add(row.id);
    }
  }
  return takenIds;
}

// The two loss numbers plan.ts does not carry: how many of the dropped
// visualizations were user-authored (a default one is regenerable from the
// package presets — a hand-built one is not), and how many dashboards were
// public (D3 — dashboards are the app's only unauthenticated surface).
async function countExtraDropped(projectDb: Sql): Promise<ExtraDroppedCounts> {
  const counts: ExtraDroppedCounts = {
    userAuthoredVisualizations: 0,
    publicDashboards: 0,
  };
  if (await tableExists(projectDb, "presentation_objects")) {
    const rows = await projectDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM presentation_objects
      WHERE NOT is_default_visualization
    `;
    counts.userAuthoredVisualizations = rows[0].count;
  }
  if (await tableExists(projectDb, "dashboards")) {
    const rows = await projectDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM dashboards WHERE is_public
    `;
    counts.publicDashboards = rows[0].count;
  }
  return counts;
}

function addReviews(report: InstanceReport): void {
  if (report.viewerOnlyUsers.length > 0) {
    report.reviews.push(
      `${report.viewerOnlyUsers.length} viewer-only user(s) become full editors of every product (D2)`,
    );
  }
  if (report.usersWithNoProjectRole > 0) {
    report.reviews.push(
      `${report.usersWithNoProjectRole} user(s) with no project role become full editors of every product (D2)`,
    );
  }
  if (report.pendingDeletion.length > 0) {
    report.reviews.push(
      `${report.pendingDeletion.length} pending_deletion project(s) are NOT migrated — restore any that must survive (D11)`,
    );
  }
  if (report.centralReporting.length > 0) {
    report.reviews.push(
      `${report.centralReporting.length} central-reporting project(s) become ordinary folders visible to every approved user (D11)`,
    );
  }
  if (report.dbAbsent.length > 0) {
    report.reviews.push(
      `${report.dbAbsent.length} ready project(s) have no database — skipped by the migration`,
    );
  }
  const dropped = sumDropped(report);
  if (dropped.presentationObjects > 0) {
    report.reviews.push(
      `${dropped.presentationObjects} visualization(s) are DELETED, ${report.extraDropped.userAuthoredVisualizations} of them user-authored (D3)`,
    );
  }
  if (dropped.dashboards > 0) {
    report.reviews.push(
      `${dropped.dashboards} dashboard(s) are DELETED, ${report.extraDropped.publicDashboards} of them public (D3)`,
    );
  }
  const orphans = report.plans.reduce(
    (total, plan) => total + plan.warnings.length,
    0,
  );
  if (orphans > 0) {
    report.reviews.push(
      `${orphans} FK orphan(s) — the migration drops these rows`,
    );
  }
}

// ── Aggregation ──────────────────────────────────────────────────────────────

type DroppedTotals = {
  presentationObjects: number;
  visualizationFolders: number;
  dashboards: number;
  dashboardItems: number;
  dashboardItemGroups: number;
};

function sumDropped(report: InstanceReport): DroppedTotals {
  const totals: DroppedTotals = {
    presentationObjects: 0,
    visualizationFolders: 0,
    dashboards: 0,
    dashboardItems: 0,
    dashboardItemGroups: 0,
  };
  for (const plan of report.plans) {
    totals.presentationObjects += plan.droppedCounts.presentationObjects;
    totals.visualizationFolders += plan.droppedCounts.visualizationFolders;
    totals.dashboards += plan.droppedCounts.dashboards;
    totals.dashboardItems += plan.droppedCounts.dashboardItems;
    totals.dashboardItemGroups += plan.droppedCounts.dashboardItemGroups;
  }
  return totals;
}

function countBy(
  report: InstanceReport,
  pick: (plan: ConsolidationPlan) => number,
): number {
  return report.plans.reduce((total, plan) => total + pick(plan), 0);
}

function countProducts(report: InstanceReport): number {
  return countBy(report, (plan) => plan.products.length);
}

// ── Reporting ────────────────────────────────────────────────────────────────

function projectLine(ref: ProjectRef): string {
  return `      ${ref.id}  "${ref.label}"`;
}

function printInstanceReport(report: InstanceReport): void {
  console.log("");
  console.log(`════════ ${report.instance} ════════`);

  const statuses = [...report.statusCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
  console.log(`  projects:        ${statuses === "" ? "none" : statuses}`);
  console.log(
    `  pinned package:  ${
      report.pinnedRunId === null
        ? "NONE"
        : `${report.pinnedRunId} "${report.pinnedRunLabel}"`
    }`,
  );

  if (report.pendingDeletion.length > 0) {
    console.log("  pending_deletion (NOT migrated — D11):");
    for (const ref of report.pendingDeletion) console.log(projectLine(ref));
  }
  if (report.centralReporting.length > 0) {
    console.log("  central reporting (become visible folders — D11):");
    for (const ref of report.centralReporting) console.log(projectLine(ref));
  }
  if (report.dbAbsent.length > 0) {
    console.log("  database absent (skipped):");
    for (const ref of report.dbAbsent) console.log(projectLine(ref));
  }
  if (report.notAt039.length > 0) {
    console.log(`  not at ${REQUIRED_SOURCE_MIGRATION}:`);
    for (const ref of report.notAt039) console.log(projectLine(ref));
  }
  if (report.runIdNull.length > 0) {
    console.log(
      `  run_id NULL (attached to the pin — D5): ${report.runIdNull.length}`,
    );
    for (const ref of report.runIdNull) console.log(projectLine(ref));
  }

  const products = countProducts(report);
  const decks = countBy(report, (plan) => plan.slideDecks.length);
  const reports = countBy(report, (plan) => plan.reports.length);
  const slides = countBy(report, (plan) => plan.slides.length);
  const versions = countBy(
    report,
    (plan) => plan.deckVersions.length + plan.reportVersions.length,
  );
  const folders = countBy(report, (plan) => plan.folders.length);
  const remaps = countBy(report, (plan) => plan.remaps.length);

  console.log(
    `  plan:            ${products} products (${decks} decks / ${reports} reports), ` +
      `${folders} folders, ${slides} slides, ${versions} versions`,
  );
  console.log(`  id remaps:       ${remaps}`);
  for (const plan of report.plans) {
    for (const remap of plan.remaps) {
      console.log(`      ${remap.entity} ${remap.from} → ${remap.to}`);
    }
  }

  const orphans = report.plans.flatMap((plan) =>
    plan.warnings.map((warning) => `${plan.projectId}: ${warning}`)
  );
  if (orphans.length > 0) {
    console.log(`  FK orphans (rows the migration DROPS): ${orphans.length}`);
    for (const orphan of orphans) console.log(`      ${orphan}`);
  }

  const dropped = sumDropped(report);
  console.log(
    "  DELETED with the project DBs: " +
      `${dropped.presentationObjects} visualizations ` +
      `(${report.extraDropped.userAuthoredVisualizations} user-authored), ` +
      `${dropped.visualizationFolders} visualization folders, ` +
      `${dropped.dashboards} dashboards ` +
      `(${report.extraDropped.publicDashboards} public, ${report.dashboardSlugs} slugs), ` +
      `${dropped.dashboardItems} dashboard items, ` +
      `${dropped.dashboardItemGroups} dashboard item groups`,
  );

  console.log(
    `  users:           ${report.totalUsers} total, ` +
      `${report.viewerOnlyUsers.length} viewer-only, ` +
      `${report.usersWithNoProjectRole} with no project role ` +
      "— all become full editors (D2)",
  );

  for (const review of report.reviews) {
    console.log(`  REVIEW  ${review}`);
  }
  for (const fail of report.fails) {
    console.log(`  FAIL    ${fail}`);
  }
  console.log(
    `  RESULT:          ${report.fails.length === 0 ? "PASS" : "FAIL"} ` +
      `(${report.reviews.length} review item(s))`,
  );
}

function banner(passed: boolean, lines: string[]): void {
  const colour = passed ? GREEN : RED;
  const title = passed
    ? "CONSOLIDATION DRY-RUN PASSED"
    : "CONSOLIDATION DRY-RUN FAILED";
  console.log("");
  console.log(
    `${colour}╔══════════════════════════════════════════════════════════════╗`,
  );
  console.log(`║  ${title.padEnd(60)}║`);
  console.log("║                                                              ║");
  for (const line of lines) {
    console.log(`║  ${line.slice(0, 60).padEnd(60)}║`);
  }
  console.log(
    `╚══════════════════════════════════════════════════════════════╝${RESET}`,
  );
}

function printFleetSummary(reports: InstanceReport[]): boolean {
  console.log("");
  console.log("════════ FLEET SUMMARY ════════");
  console.log(
    "  instance              products  folders  slides  remaps  viz-del  dash-del  verdict",
  );
  for (const report of reports) {
    const dropped = sumDropped(report);
    const verdict = report.fails.length > 0
      ? `FAIL (${report.fails.length})`
      : report.reviews.length === 0
      ? "pass"
      : `pass (${report.reviews.length} review)`;
    console.log(
      "  " +
        report.instance.padEnd(20) +
        String(countProducts(report)).padStart(10) +
        String(countBy(report, (plan) => plan.folders.length)).padStart(9) +
        String(countBy(report, (plan) => plan.slides.length)).padStart(8) +
        String(countBy(report, (plan) => plan.remaps.length)).padStart(8) +
        String(dropped.presentationObjects).padStart(9) +
        String(dropped.dashboards).padStart(10) +
        "  " +
        verdict,
    );
  }

  const failing = reports.filter((report) => report.fails.length > 0);
  const maxProducts = reports.reduce(
    (max, report) => Math.max(max, countProducts(report)),
    0,
  );
  const totals = reports.reduce(
    (acc, report) => {
      const dropped = sumDropped(report);
      acc.viz += dropped.presentationObjects;
      acc.userViz += report.extraDropped.userAuthoredVisualizations;
      acc.dash += dropped.dashboards;
      acc.publicDash += report.extraDropped.publicDashboards;
      acc.viewerOnly += report.viewerOnlyUsers.length;
      acc.noRole += report.usersWithNoProjectRole;
      acc.central += report.centralReporting.length;
      acc.pending += report.pendingDeletion.length;
      return acc;
    },
    {
      viz: 0,
      userViz: 0,
      dash: 0,
      publicDash: 0,
      viewerOnly: 0,
      noRole: 0,
      central: 0,
      pending: 0,
    },
  );

  console.log("");
  console.log(
    `  Max products on any one instance (the D8 \`starting\` payload): ${maxProducts}`,
  );
  console.log("");
  console.log("  REVIEW totals — read and accept these before deploying:");
  console.log(
    `    visualizations DELETED:         ${totals.viz} (${totals.userViz} user-authored)`,
  );
  console.log(
    `    dashboards DELETED:             ${totals.dash} (${totals.publicDash} public)`,
  );
  console.log(
    `    viewer-only users → editors:    ${totals.viewerOnly}`,
  );
  console.log(
    `    no-project-role users → editors:${totals.noRole}`,
  );
  console.log(
    `    central-reporting projects:     ${totals.central}`,
  );
  console.log(
    `    pending_deletion, not migrated: ${totals.pending}`,
  );

  if (failing.length > 0) {
    console.log("");
    console.log("  FAILURES (must be fixed before deploying):");
    for (const report of failing) {
      for (const fail of report.fails) {
        console.log(`    [${report.instance}] ${fail}`);
      }
    }
    banner(false, [
      `${failing.length} of ${reports.length} instance(s) FAIL.`,
      "DO NOT DEPLOY until every one is resolved.",
    ]);
    return false;
  }

  banner(true, [
    `${reports.length} instance(s), zero FAIL.`,
    "Accept the REVIEW totals above, then deploy.",
  ]);
  return true;
}

// ── The plan file `./rollout_products` post-checks against ───────────────────

// Defaults into rollout_logs/, which is gitignored — the same place the three
// rollout scripts write, and no untracked file at the repo root.
const DEFAULT_PLAN_PATH = "rollout_logs/consolidation_plan.json";

async function writePlanFile(
  path: string,
  reports: InstanceReport[],
): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const report of reports) {
    if (report.fails.length > 0) {
      continue;
    }
    payload[report.instance] = {
      products: countProducts(report),
      slideDecks: countBy(report, (plan) => plan.slideDecks.length),
      reports: countBy(report, (plan) => plan.reports.length),
      folders: countBy(report, (plan) => plan.folders.length),
      slides: countBy(report, (plan) => plan.slides.length),
      deckVersions: countBy(report, (plan) => plan.deckVersions.length),
      reportVersions: countBy(report, (plan) => plan.reportVersions.length),
    };
  }
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir !== "") {
    await Deno.mkdir(dir, { recursive: true });
  }
  await Deno.writeTextFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  console.log("");
  console.log(
    `Planned counts written to ${path} — pass it to ./rollout_products --expect.`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = Deno.args;
  const local = args.includes("--local");
  // `--json` takes an optional path, which must end in .json so a bare
  // `--json sierraleone` cannot silently eat the instance name.
  const jsonIndex = args.indexOf("--json");
  const jsonValueIndex =
    jsonIndex !== -1 && (args[jsonIndex + 1]?.endsWith(".json") ?? false)
      ? jsonIndex + 1
      : -1;
  const jsonPath = jsonIndex === -1
    ? null
    : jsonValueIndex === -1
    ? DEFAULT_PLAN_PATH
    : args[jsonValueIndex];
  const named = args.filter((arg, index) =>
    !arg.startsWith("--") && index !== jsonValueIndex
  );

  const reports: InstanceReport[] = [];
  let unreachable = 0;

  if (local) {
    if (named.length > 1) {
      console.error("ERROR: --local takes at most one instance label.");
      Deno.exit(1);
    }
    const instance: Instance = {
      name: named[0] ?? "local",
      host: Deno.env.get("PG_HOST") ?? "localhost",
      port: parseInt(Deno.env.get("PG_PORT") ?? "5432", 10),
      password: Deno.env.get("PG_PASSWORD") ?? "",
    };
    console.log(
      `Consolidation dry-run (READ-ONLY) — ${instance.host}:${instance.port}`,
    );
    const report = await checkInstance(instance);
    printInstanceReport(report);
    reports.push(report);
  } else {
    const instances = named.length > 0 ? named : await listRunningInstances();
    console.log(
      `Consolidation dry-run (READ-ONLY) — ${instances.length} instance(s) via ${SSH_HOST}`,
    );
    for (const name of instances) {
      try {
        const report = await withTunnel(name, checkInstance);
        printInstanceReport(report);
        reports.push(report);
      } catch (error) {
        unreachable++;
        const report = emptyReport(name);
        report.fails.push(
          `instance unreachable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        printInstanceReport(report);
        reports.push(report);
      }
    }
  }

  if (unreachable > 0) {
    console.log("");
    console.log(
      `NOTE: ${unreachable} instance(s) could not be reached. An instance that is not`,
    );
    console.log(
      "      checked is not gated — resolve these before calling the fleet green.",
    );
  }

  const passed = printFleetSummary(reports);
  if (jsonPath !== null) {
    await writePlanFile(jsonPath, reports);
  }
  if (!passed) {
    Deno.exit(1);
  }
}

main().catch((error) => {
  console.error("Dry-run error:", error);
  Deno.exit(1);
});

// =============================================================================
// sweep_retired_figures.ts: a read-only sweep of every production instance for
// stored figures whose metric left the registry (lib/retired_metrics.ts).
//
// For every figure bundle on the two live surfaces (slides.config and
// reports.figures) and the two version tables, the sweep reads the metric id,
// the config, the figure's language and the product's run id. A figure of a
// retired metric is carried to its successor the way the app does at update
// time, and the carried config is checked the way retired_metrics_test.ts
// checks the presets: it parses, the successor is a metric of the local
// definitions (FASTR_MODULES_LOCAL_DIR), its required dimensions are grouped,
// every requested dimension is one its results object offers, a fetch config
// builds, and the band chart keeps its four props in order and no value
// filter. A figure whose metric is neither retired nor in the definitions is
// counted by id, so the next retirement has its numbers.
//
//   deno run --allow-all --env-file sweep_retired_figures.ts [--out <file>] [instance ...]
//
// Fleet access is PROTOCOL_ACCESS_DBS recipe B: each instance's Postgres port
// and password come from its container over ssh, a private tunnel is opened
// per instance and torn down after. The only SQL is SELECT; nothing is written
// anywhere but stdout and the --out file.
// =============================================================================

import postgres from "postgres";
import type { Sql } from "postgres";
import {
  figurePackageIssueForMetrics,
  getFetchConfigFromPresentationObjectConfig,
  type Language,
  type MetricWithStatus,
  presentationObjectConfigSchema,
  resolveFigureMetric,
  type RetiredMetric,
  retiredMetric,
  succeedRetiredFigure,
} from "lib";
import {
  loadModuleDefinitions,
  metricsWithStatusOf,
} from "./server/tests/_module_definitions.ts";

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
const PG_USER = "postgres";
const TUNNEL_READY_TIMEOUT_MS = 30_000;
const ROWS_PER_FETCH = 25;
const BAND_CHART_PROPS = ["observed", "expected", "ppi_lwr", "ppi_upr"];
const LANGUAGES: readonly Language[] = ["en", "fr", "pt"];

// ── The sweep of one database ────────────────────────────────────────────────

type Surface = "slide" | "report" | "deck version" | "report version";

const READS: readonly { surface: Surface; select: string }[] = [
  {
    surface: "slide",
    select:
      `SELECT s.id AS row_id, s.slide_deck_id AS product_id, p.run_id, s.config AS payload
       FROM slides s JOIN products p ON p.id = s.slide_deck_id`,
  },
  {
    surface: "report",
    select:
      `SELECT r.id AS row_id, r.id AS product_id, p.run_id, r.figures AS payload
       FROM reports r JOIN products p ON p.id = r.id`,
  },
  {
    surface: "deck version",
    select:
      `SELECT v.id AS row_id, v.slide_deck_id AS product_id, p.run_id, v.slides AS payload
       FROM slide_deck_versions v JOIN products p ON p.id = v.slide_deck_id`,
  },
  {
    surface: "report version",
    select:
      `SELECT v.id AS row_id, v.report_id AS product_id, p.run_id, v.figures AS payload
       FROM report_versions v JOIN products p ON p.id = v.report_id`,
  },
];

type PayloadRow = {
  row_id: string;
  product_id: string;
  run_id: string;
  payload: string;
};

type FigureRef = {
  surface: Surface;
  productId: string;
  rowId: string;
  runId: string;
};

export type SweepFailure = FigureRef & {
  metricId: string;
  successorId: string | undefined;
  reason: string;
};

export type DatabaseSweep = {
  figures: number;
  // retired metric id → successor id → count
  retired: Map<string, Map<string, number>>;
  // metric ids neither retired nor in the definitions → count
  unknown: Map<string, number>;
  failures: SweepFailure[];
  unreadable: (FigureRef & { reason: string })[];
};

type StoredBundle = { metricId: string; config: unknown; language: unknown };

// Every figure bundle inside a stored JSON value (a slide's layout, a
// version's slide list, a report's figure registry), found by shape rather
// than by schema so a row of any vintage yields its bundles.
function* bundlesIn(value: unknown): Generator<StoredBundle> {
  if (Array.isArray(value)) {
    for (const item of value) yield* bundlesIn(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "figure") {
    const bundle = record.bundle;
    if (bundle !== null && typeof bundle === "object") {
      const b = bundle as Record<string, unknown>;
      const localization = b.localization as
        | Record<string, unknown>
        | undefined;
      if (typeof b.metricId === "string") {
        yield {
          metricId: b.metricId,
          config: b.config,
          language: localization?.language,
        };
      }
    }
    return;
  }
  for (const child of Object.values(record)) yield* bundlesIn(child);
}

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

function firstIssue(
  error: { issues: { path: PropertyKey[]; message: string }[] },
): string {
  const issue = error.issues[0];
  return issue === undefined
    ? "invalid"
    : `${issue.path.join(".")}: ${issue.message}`;
}

// The carried config of a retired figure, checked as retired_metrics_test.ts
// checks the presets. `successorId` is known once the stored config parses.
function checkRetiredFigure(
  retired: RetiredMetric,
  stored: StoredBundle,
  metrics: readonly MetricWithStatus[],
): { successorId: string | undefined; reason: string | undefined } {
  const parsed = presentationObjectConfigSchema.safeParse(stored.config);
  if (!parsed.success) {
    return {
      successorId: undefined,
      reason: `the stored config does not parse (${firstIssue(parsed.error)})`,
    };
  }
  if (!isLanguage(stored.language)) {
    return {
      successorId: retired.successor(parsed.data).metricId,
      reason: `the bundle's language is ${JSON.stringify(stored.language)}`,
    };
  }
  const succession = succeedRetiredFigure(
    retired,
    parsed.data,
    stored.language,
  );
  const fail = (reason: string) => ({
    successorId: succession.metricId,
    reason,
  });
  const carried = presentationObjectConfigSchema.safeParse(succession.config);
  if (!carried.success) {
    return fail(
      `the carried config does not parse (${firstIssue(carried.error)})`,
    );
  }
  const resolution = resolveFigureMetric(metrics, {
    metricId: retired.id,
    config: parsed.data,
    localization: { language: stored.language },
  });
  if (resolution.kind !== "succeeded") {
    return fail(`${succession.metricId} is not in the local definitions`);
  }
  const { metric, config } = resolution;
  const issue = figurePackageIssueForMetrics(metric.id, config, metrics, null);
  if (issue !== null) {
    return fail(`package issue: ${JSON.stringify(issue)}`);
  }
  const fetch = getFetchConfigFromPresentationObjectConfig(metric, config);
  if (!fetch.success) return fail(`no fetch config: ${fetch.err}`);
  const grouped = new Set<string>([
    ...config.d.disaggregateBy.map((e) => e.disOpt),
    ...(config.d.timeseriesGrouping === undefined
      ? []
      : [config.d.timeseriesGrouping]),
  ]);
  const ungrouped = metric.disaggregationOptions
    .filter((o) => o.isRequired && !grouped.has(o.value))
    .map((o) => o.value);
  if (ungrouped.length > 0) {
    return fail(`required ${ungrouped.join(", ")} not grouped`);
  }
  const foreign = (config.d.valuesFilter ?? []).filter((prop) =>
    !metric.valueProps.includes(prop)
  );
  if (foreign.length > 0) {
    return fail(`filters on ${foreign.join(", ")}, which ${metric.id} lacks`);
  }
  if (config.s.specialDisruptionsChartV2) {
    if (
      metric.valueProps.length !== BAND_CHART_PROPS.length ||
      metric.valueProps.some((p, i) => p !== BAND_CHART_PROPS[i])
    ) {
      return fail(`the band chart's props are ${metric.valueProps.join(", ")}`);
    }
    if ("valuesFilter" in config.d) {
      return fail("the band chart keeps a value filter");
    }
  }
  return { successorId: metric.id, reason: undefined };
}

function count(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// Every stored figure of one instance's `main` database, read in pages so a
// deck of large bundles never sits in memory at once.
export async function sweepDatabase(
  sql: Sql,
  metrics: readonly MetricWithStatus[],
): Promise<DatabaseSweep> {
  const known = new Set(metrics.map((m) => m.id));
  const sweep: DatabaseSweep = {
    figures: 0,
    retired: new Map(),
    unknown: new Map(),
    failures: [],
    unreadable: [],
  };
  for (const { surface, select } of READS) {
    for await (
      const rows of sql.unsafe<PayloadRow[]>(select).cursor(ROWS_PER_FETCH)
    ) {
      for (const row of rows) {
        const ref: FigureRef = {
          surface,
          productId: row.product_id,
          rowId: row.row_id,
          runId: row.run_id,
        };
        let payload: unknown;
        try {
          payload = JSON.parse(row.payload);
        } catch (error) {
          sweep.unreadable.push({ ...ref, reason: String(error) });
          continue;
        }
        for (const stored of bundlesIn(payload)) {
          sweep.figures += 1;
          const retired = retiredMetric(stored.metricId);
          if (retired !== undefined) {
            const { successorId, reason } = checkRetiredFigure(
              retired,
              stored,
              metrics,
            );
            const bySuccessor = sweep.retired.get(retired.id) ??
              new Map<string, number>();
            count(bySuccessor, successorId ?? "?");
            sweep.retired.set(retired.id, bySuccessor);
            if (reason !== undefined) {
              sweep.failures.push({
                ...ref,
                metricId: retired.id,
                successorId,
                reason,
              });
            }
          } else if (!known.has(stored.metricId)) {
            count(sweep.unknown, stored.metricId);
          }
        }
      }
    }
  }
  return sweep;
}

// ── Reports ──────────────────────────────────────────────────────────────────

function retiredLines(retired: Map<string, Map<string, number>>): string[] {
  return [...retired.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([metricId, bySuccessor]) =>
      [...bySuccessor.entries()].map(([successorId, n]) =>
        `  ${metricId.padEnd(10)} -> ${successorId.padEnd(10)} ${n}`
      )
    );
}

function unknownLines(unknown: Map<string, number>): string[] {
  return [...unknown.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([metricId, n]) => `  ${metricId.padEnd(24)} ${n}`);
}

export function formatDatabaseSweep(
  name: string,
  sweep: DatabaseSweep,
): string[] {
  const lines = [
    `== ${name}: ${sweep.figures} stored figures`,
    "  retired metric -> successor  count",
    ...retiredLines(sweep.retired),
  ];
  if (sweep.retired.size === 0) lines.push("  (none)");
  if (sweep.unknown.size > 0) {
    lines.push("  neither retired nor in the definitions:");
    lines.push(...unknownLines(sweep.unknown));
  }
  for (const f of sweep.failures) {
    lines.push(
      `  FAIL ${f.metricId} -> ${
        f.successorId ?? "?"
      } in ${f.surface} ${f.rowId} of product ${f.productId} (package ${f.runId}): ${f.reason}`,
    );
  }
  for (const u of sweep.unreadable) {
    lines.push(
      `  UNREADABLE ${u.surface} ${u.rowId} of product ${u.productId}: ${u.reason}`,
    );
  }
  return lines;
}

function mergeCounts(
  into: Map<string, number>,
  from: Map<string, number>,
): void {
  for (const [key, n] of from) into.set(key, (into.get(key) ?? 0) + n);
}

export function formatFleetSummary(
  sweeps: readonly { name: string; sweep: DatabaseSweep }[],
): string[] {
  const retired = new Map<string, Map<string, number>>();
  const unknown = new Map<string, number>();
  let figures = 0;
  let failures = 0;
  for (const { sweep } of sweeps) {
    figures += sweep.figures;
    failures += sweep.failures.length + sweep.unreadable.length;
    for (const [metricId, bySuccessor] of sweep.retired) {
      const merged = retired.get(metricId) ?? new Map<string, number>();
      mergeCounts(merged, bySuccessor);
      retired.set(metricId, merged);
    }
    mergeCounts(unknown, sweep.unknown);
  }
  const lines = [
    `== ${sweeps.length} instances: ${figures} stored figures, ${failures} failing`,
    "  retired metric -> successor  count",
    ...retiredLines(retired),
  ];
  if (retired.size === 0) lines.push("  (none)");
  if (unknown.size > 0) {
    lines.push("  neither retired nor in the definitions:");
    lines.push(...unknownLines(unknown));
  }
  return lines;
}

// ── Fleet access (PROTOCOL_ACCESS_DBS recipe B) ──────────────────────────────

type Instance = {
  name: string;
  host: string;
  port: number;
  password: string;
};

async function ssh(command: string): Promise<string> {
  const result = await new Deno.Command("ssh", {
    args: [...SSH_OPTS, SSH_HOST, command],
    stdout: "piped",
    stderr: "piped",
  }).output();
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

// `docker port` prints one line per bound address; every line carries the
// same host port, so the first is enough.
async function resolvePgPort(instance: string): Promise<number> {
  const out = await ssh(`docker port ${instance}-postgres 5432`);
  const first = out.split("\n")[0]?.trim() ?? "";
  const port = parseInt(first.slice(first.lastIndexOf(":") + 1), 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`could not parse a host port from "${out}"`);
  }
  return port;
}

function resolvePgPassword(instance: string): Promise<string> {
  return ssh(`docker exec ${instance}-postgres printenv POSTGRES_PASSWORD`);
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
    args: [
      ...SSH_OPTS,
      "-N",
      "-L",
      `${localPort}:localhost:${remotePort}`,
      SSH_HOST,
    ],
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

async function sweepInstance(
  instance: Instance,
  metrics: readonly MetricWithStatus[],
): Promise<DatabaseSweep> {
  const sql = postgres({
    host: instance.host,
    port: instance.port,
    user: PG_USER,
    password: instance.password,
    database: "main",
    max: 1,
    onnotice: () => {},
  });
  try {
    return await sweepDatabase(sql, metrics);
  } finally {
    await sql.end();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outFlag = Deno.args.indexOf("--out");
  const outPath = outFlag === -1 ? undefined : Deno.args[outFlag + 1];
  const named = Deno.args.filter((a, i) =>
    !a.startsWith("--") && i !== outFlag + 1
  );
  const modulesDir = Deno.env.get("FASTR_MODULES_LOCAL_DIR");
  if (modulesDir === undefined) {
    throw new Error("FASTR_MODULES_LOCAL_DIR is not set");
  }
  const metrics = metricsWithStatusOf(await loadModuleDefinitions(modulesDir));
  const instances = named.length > 0 ? named : await listRunningInstances();
  if (outPath !== undefined) await Deno.writeTextFile(outPath, "");
  // Printed and appended to the file as each instance finishes, so a failure
  // later in the fleet loses nothing already read.
  const say = async (lines: string[]) => {
    for (const line of lines) console.log(line);
    if (outPath !== undefined) {
      await Deno.writeTextFile(outPath, lines.join("\n") + "\n", {
        append: true,
      });
    }
  };
  await say([`${instances.length} instances: ${instances.join(", ")}`]);
  const sweeps: { name: string; sweep: DatabaseSweep }[] = [];
  const failed: string[] = [];
  for (const name of instances) {
    try {
      const sweep = await withTunnel(
        name,
        (conn) => sweepInstance(conn, metrics),
      );
      sweeps.push({ name, sweep });
      await say(formatDatabaseSweep(name, sweep));
    } catch (error) {
      failed.push(name);
      await say([
        `== ${name}: FAILED ${
          error instanceof Error ? error.message : String(error)
        }`,
      ]);
    }
  }
  await say(formatFleetSummary(sweeps));
  if (failed.length > 0) await say([`  not swept: ${failed.join(", ")}`]);
}

if (import.meta.main) {
  await main();
}

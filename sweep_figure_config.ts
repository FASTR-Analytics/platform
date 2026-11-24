// =============================================================================
// sweep_figure_config.ts: a read-only sweep of every production instance's
// stored figures through the figure config (lib/figure_config).
//
// For every figure bundle in slides.config, reports.figures and
// visualizations.bundle, the sweep resolves the figure's metric the way the
// app does (a retired metric's figure carried to its successor) against the
// local module definitions (FASTR_MODULES_LOCAL_DIR), converts the stored
// config, checks that it fits the schema, runs the validator, and compares
// what today's functions derive from the stored config with what the figure
// config derives from the conversion (server/tests/_figure_config_comparison.ts).
// It counts the conversions by case and the differences by aspect, lists every
// difference no case explains and every figure the validator finds a problem
// in, by problem. A figure on a metric that is neither defined nor retired is
// converted with its bundle's value props and its roll-up kept, since its
// metric is unknown, and only checked to fit.
//
//   deno run --allow-all --env-file sweep_figure_config.ts [--out <file>] [instance ...]
//
// Fleet access is the one shared ssh connection and the per-instance tunnels
// of sweep_retired_figures.ts. The only SQL is SELECT; nothing is written
// anywhere but stdout and the --out file.
// =============================================================================

import postgres from "postgres";
import type { Sql } from "postgres";
import {
  type ConversionFailure,
  convertStoredConfig,
  type FigureBundle,
  figureBundleSchema,
  figureConfigSchema,
  getSingleValueDimsFromItems,
  inferPeriodFormatFromValue,
  type MetricWithStatus,
  presentationObjectConfigSchema,
  problemKey,
  resolveFigureMetric,
} from "lib";
import {
  compareWithToday,
  type Difference,
} from "./server/tests/_figure_config_comparison.ts";
import {
  EVERY_FACILITY_COLUMN,
  loadModuleDefinitions,
  metricsWithStatusOf,
} from "./server/tests/_module_definitions.ts";
import {
  type Instance,
  listRunningInstances,
  PG_USER,
  withTunnel,
} from "./sweep_retired_figures.ts";

const ROWS_PER_FETCH = 25;

type Surface = "slide" | "report" | "visualization";

// An instance whose schema predates a table holds no figures in it.
const READS: readonly { surface: Surface; table: string; select: string }[] = [
  {
    surface: "slide",
    table: "slides",
    select:
      `SELECT s.id AS row_id, s.slide_deck_id AS product_id, s.config AS payload
       FROM slides s`,
  },
  {
    surface: "report",
    table: "reports",
    select: `SELECT r.id AS row_id, r.id AS product_id, r.figures AS payload
       FROM reports r`,
  },
  {
    surface: "visualization",
    table: "visualizations",
    select: `SELECT v.id AS row_id, v.id AS product_id, v.bundle AS payload
       FROM visualizations v`,
  },
];

type PayloadRow = { row_id: string; product_id: string; payload: string };

type Ref = string;

type Sweep = {
  figures: Map<Surface, number>;
  absentTables: string[];
  unreadable: { ref: Ref; reason: string }[];
  metrics: Map<"current" | "succeeded" | "unknown", number>;
  failures: Map<ConversionFailure, Ref[]>;
  doesNotFit: { ref: Ref; issues: string[] }[];
  notes: Map<string, number>;
  differences: Map<string, number>;
  unlisted: { ref: Ref; difference: Difference }[];
  problems: Map<string, Ref[]>;
};

function emptySweep(): Sweep {
  return {
    figures: new Map(),
    absentTables: [],
    unreadable: [],
    metrics: new Map(),
    failures: new Map(),
    doesNotFit: [],
    notes: new Map(),
    differences: new Map(),
    unlisted: [],
    problems: new Map(),
  };
}

function count<K>(map: Map<K, number>, key: K, n = 1): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

function list<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

// Every stored figure bundle inside a payload: a slide's layout, a report's
// figure registry, or a visualization's bundle itself.
function* bundlesIn(surface: Surface, payload: unknown): Generator<unknown> {
  if (surface === "visualization") {
    yield payload;
    return;
  }
  yield* figureBlockBundles(payload);
}

function* figureBlockBundles(value: unknown): Generator<unknown> {
  if (Array.isArray(value)) {
    for (const item of value) yield* figureBlockBundles(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "figure") {
    if (record.bundle !== undefined) yield record.bundle;
    return;
  }
  for (const child of Object.values(record)) yield* figureBlockBundles(child);
}

function sweepBundle(
  sweep: Sweep,
  ref: Ref,
  bundle: FigureBundle,
  metrics: MetricWithStatus[],
): void {
  const stored = presentationObjectConfigSchema.safeParse(bundle.config);
  if (!stored.success) {
    sweep.unreadable.push({ ref, reason: "config does not parse" });
    return;
  }
  const resolution = resolveFigureMetric(metrics, {
    metricId: bundle.metricId,
    config: stored.data,
    localization: bundle.localization,
  });
  const config = resolution.kind === "absent" ? stored.data : resolution.config;
  const singleValueDims = getSingleValueDimsFromItems(config, bundle.items);
  if (resolution.kind === "absent") {
    count(sweep.metrics, "unknown");
    const conversion = convertStoredConfig(config, {
      valueProps: bundle.resultsValue.valueProps,
      canRollUp: true,
      singleValueDims,
      yearly: bundle.dateRange !== undefined &&
        inferPeriodFormatFromValue(bundle.dateRange.max) === "year",
    });
    for (const note of conversion.notes) count(sweep.notes, note);
    if (!conversion.ok) {
      list(sweep.failures, conversion.failure, ref);
      return;
    }
    const parsed = figureConfigSchema.safeParse(conversion.config);
    if (!parsed.success) {
      sweep.doesNotFit.push({
        ref,
        issues: parsed.error.issues.map((i) =>
          `${i.path.join(".")}: ${i.message}`
        ),
      });
    }
    return;
  }
  count(sweep.metrics, resolution.kind);
  const comparison = compareWithToday({
    metric: resolution.metric,
    config,
    singleValueDims,
  });
  for (const note of comparison.notes) count(sweep.notes, note);
  if (comparison.kind === "failed") {
    list(sweep.failures, comparison.failure, ref);
    return;
  }
  if (comparison.kind === "doesNotFit") {
    sweep.doesNotFit.push({ ref, issues: comparison.issues });
    return;
  }
  for (const difference of comparison.differences) {
    count(
      sweep.differences,
      `${difference.aspect}: ${difference.listed ?? "UNLISTED"}`,
    );
    if (difference.listed === undefined) {
      sweep.unlisted.push({ ref, difference });
    }
  }
  for (const problem of comparison.problems) {
    list(
      sweep.problems,
      problemKey(problem),
      `${ref} ${resolution.metric.id} ${comparison.config.type}`,
    );
  }
}

async function sweepDatabase(
  sql: Sql,
  instance: string,
  metrics: MetricWithStatus[],
): Promise<Sweep> {
  const sweep = emptySweep();
  for (const { surface, table, select } of READS) {
    const [{ present }] = await sql<{ present: boolean }[]>`
      SELECT to_regclass(${table}) IS NOT NULL AS present`;
    if (!present) {
      sweep.absentTables.push(`${instance} ${table}`);
      continue;
    }
    for await (
      const rows of sql.unsafe<PayloadRow[]>(select).cursor(ROWS_PER_FETCH)
    ) {
      for (const row of rows) {
        const rowRef = `${instance} ${surface} ${row.product_id}/${row.row_id}`;
        let payload: unknown;
        try {
          payload = JSON.parse(row.payload);
        } catch (error) {
          sweep.unreadable.push({ ref: rowRef, reason: String(error) });
          continue;
        }
        let n = 0;
        for (const raw of bundlesIn(surface, payload)) {
          const ref = `${rowRef}#${n++}`;
          count(sweep.figures, surface);
          const bundle = figureBundleSchema.safeParse(raw);
          if (!bundle.success) {
            sweep.unreadable.push({
              ref,
              reason: `bundle: ${bundle.error.issues[0]?.path.join(".")}`,
            });
            continue;
          }
          sweepBundle(sweep, ref, bundle.data, metrics);
        }
      }
    }
  }
  return sweep;
}

function mergeSweeps(sweeps: Sweep[]): Sweep {
  const out = emptySweep();
  for (const s of sweeps) {
    for (const [k, n] of s.figures) count(out.figures, k, n);
    out.absentTables.push(...s.absentTables);
    out.unreadable.push(...s.unreadable);
    for (const [k, n] of s.metrics) count(out.metrics, k, n);
    for (const [k, refs] of s.failures) {
      for (const r of refs) list(out.failures, k, r);
    }
    out.doesNotFit.push(...s.doesNotFit);
    for (const [k, n] of s.notes) count(out.notes, k, n);
    for (const [k, n] of s.differences) count(out.differences, k, n);
    out.unlisted.push(...s.unlisted);
    for (const [k, refs] of s.problems) {
      for (const r of refs) list(out.problems, k, r);
    }
  }
  return out;
}

function countLines<K>(map: Map<K, number>): string[] {
  return [...map.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([k, n]) => `    ${String(k).padEnd(44)} ${n}`);
}

function total<K>(map: Map<K, number>): number {
  return [...map.values()].reduce((a, b) => a + b, 0);
}

function formatSweep(
  name: string,
  sweep: Sweep,
  full: boolean,
): string[] {
  const failed = [...sweep.failures.values()].reduce((n, r) => n + r.length, 0);
  const lines = [
    `== ${name}: ${total(sweep.figures)} figures`,
    ...countLines(sweep.figures),
    `  tables the schema does not have: ${sweep.absentTables.join(", ")}`,
    `  metric`,
    ...countLines(sweep.metrics),
    `  unreadable: ${sweep.unreadable.length}`,
    ...sweep.unreadable.map((u) => `    ${u.ref}: ${u.reason}`),
    `  conversion failed: ${failed}`,
    ...[...sweep.failures.entries()].flatMap(([failure, refs]) => [
      `    ${failure}: ${refs.length}`,
      ...refs.map((r) => `      ${r}`),
    ]),
    `  converted and does not fit: ${sweep.doesNotFit.length}`,
    ...sweep.doesNotFit.map((d) => `    ${d.ref}: ${d.issues.join("; ")}`),
    `  conversion cases`,
    ...countLines(sweep.notes),
    `  differences from today, by aspect and case`,
    ...countLines(sweep.differences),
    `  differences no case explains: ${sweep.unlisted.length}`,
    ...sweep.unlisted.map((u) =>
      `    ${u.ref} ${u.difference.aspect}: today ${u.difference.today}, converted ${u.difference.next}`
    ),
    `  figures with a validator problem, by problem`,
  ];
  for (const [key, refs] of [...sweep.problems.entries()].sort()) {
    lines.push(`    ${key}: ${refs.length}`);
    if (full) lines.push(...refs.map((r) => `      ${r}`));
  }
  return lines;
}

async function sweepInstance(
  instance: Instance,
  metrics: MetricWithStatus[],
): Promise<Sweep> {
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
    return await sweepDatabase(sql, instance.name, metrics);
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const outFlag = Deno.args.indexOf("--out");
  const outPath = outFlag === -1 ? undefined : Deno.args[outFlag + 1];
  const named = Deno.args.filter((a, i) =>
    !a.startsWith("--") && (outFlag === -1 || i !== outFlag + 1)
  );
  const modulesDir = Deno.env.get("FASTR_MODULES_LOCAL_DIR");
  if (modulesDir === undefined) {
    throw new Error("FASTR_MODULES_LOCAL_DIR is not set");
  }
  const definitions = await loadModuleDefinitions(modulesDir);
  const metrics = metricsWithStatusOf(definitions, EVERY_FACILITY_COLUMN);
  const instances = named.length > 0 ? named : await listRunningInstances();
  if (outPath !== undefined) await Deno.writeTextFile(outPath, "");
  const say = async (lines: string[]) => {
    for (const line of lines) console.log(line);
    if (outPath !== undefined) {
      await Deno.writeTextFile(outPath, lines.join("\n") + "\n", {
        append: true,
      });
    }
  };
  await say([`${instances.length} instances: ${instances.join(", ")}`]);
  const sweeps: Sweep[] = [];
  const failed: string[] = [];
  for (const name of instances) {
    try {
      const sweep = await withTunnel(
        name,
        (conn) => sweepInstance(conn, metrics),
      );
      sweeps.push(sweep);
      await say(formatSweep(name, sweep, false));
    } catch (error) {
      failed.push(name);
      await say([
        `== ${name}: FAILED ${
          error instanceof Error ? error.message : String(error)
        }`,
      ]);
    }
  }
  const fleet = mergeSweeps(sweeps);
  await say(formatSweep(`fleet (${sweeps.length} instances)`, fleet, true));
  const unexpectedFailures = [...fleet.failures.entries()]
    .filter(([failure]) => failure !== "mapWithoutArea")
    .reduce((n, [, refs]) => n + refs.length, 0);
  const clean = fleet.unreadable.length === 0 && unexpectedFailures === 0 &&
    fleet.doesNotFit.length === 0 && fleet.unlisted.length === 0 &&
    failed.length === 0;
  await say([
    clean
      ? "VERDICT: every stored figure converts and fits but a map with no admin-level area, and every difference is one a case explains"
      : "VERDICT: NOT CLEAN (see the lists above)",
  ]);
  if (failed.length > 0) await say([`  not swept: ${failed.join(", ")}`]);
}

if (import.meta.main) {
  await main();
}

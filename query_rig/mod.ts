import type { Sql } from "postgres";
import {
  BLANK_SENTINEL,
  scopeDefinitionHash,
  setCalendar,
  UNCONSTRAINED_SCOPE_DEFINITION,
  validateFetchConfig,
} from "lib";
import { getSingleValueDimsFromPossibleValues } from "lib";
import {
  computeRunReplicantOptions,
  getIndicatorMetadataFromRun,
  getPossibleValuesFromRun,
  getPresentationObjectItemsFromRun,
  getResultsObjectItemsFromRun,
  getResultsValueInfoFromRun,
  type RunReadContext,
} from "../server/run_query/mod.ts";
import { type Case, CASES } from "./cases.ts";
import { ALL_FIXTURES, type Fixture } from "./fixtures.ts";
import {
  createDatabase,
  type Failure,
  loadSchemaFile,
  rowsMatch,
} from "./harness.ts";
import { buildFixturePackage, seedInstance } from "./build_package.ts";

const REPO = new URL("..", import.meta.url).pathname;
const INSTANCE_SCHEMA = `${REPO}server/db/instance/_main_database.sql`;
// The wrapper script points this at a throwaway directory it removes on exit.
const RUNS_DIR = Deno.env.get("QUERY_RIG_RUNS_DIR")!;

type Prepared = {
  fixture: Fixture;
  mainDb: Sql;
  ctx: RunReadContext;
  labelMap: Map<string, string>;
};

async function prepare(fx: Fixture): Promise<Prepared> {
  const mainDb = await createDatabase(`qr_${fx.name}_main`);
  await loadSchemaFile(mainDb, INSTANCE_SCHEMA);
  await seedInstance(mainDb, fx);
  const ctx = await buildFixturePackage(mainDb, fx, RUNS_DIR);

  // Built the same way the replicant-options route builds it, so the rig
  // exercises the manifest's indicator catalog rather than stubbing labels.
  const metadata = getIndicatorMetadataFromRun(ctx, fx.moduleId);
  const labelMap = new Map(metadata.map((m) => [m.id, m.label]));

  return { fixture: fx, mainDb, ctx, labelMap };
}

// A read context is a run and a resolved scope definition, built here rather
// than through getReadyRunReadContext because that gate reads the catalog row
// for `status = 'ready'` and the `scopes` row, and the rig's packages exist
// only on disk and its scopes only in the case table. Calendar is a run input: the read path takes it from the manifest,
// never from the env global, so a case that flips the calendar reads the same
// package through a context whose manifest says so.
function contextFor(c: Case, p: Prepared): RunReadContext {
  const calendar = c.calendar ?? "gregorian";
  const scope = c.scope ?? UNCONSTRAINED_SCOPE_DEFINITION;
  return {
    ...p.ctx,
    manifest: { ...p.ctx.manifest, calendar },
    scope,
    scopeToken: scopeDefinitionHash(scope),
  };
}

function describe(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

async function runPossibleValues(
  c: Case,
  p: Prepared,
): Promise<Failure | undefined> {
  const res = await getPossibleValuesFromRun(
    contextFor(c, p),
    p.fixture.resultsObjectId,
    c.disOpt!,
    p.labelMap,
    c.fetchConfig.filters,
  );

  if ("err" in c.expect) {
    if (res.success) {
      return {
        case: c.name,
        detail: `expected error containing "${c.expect.err}", got success`,
      };
    }
    return res.err.includes(c.expect.err) ? undefined : {
      case: c.name,
      detail: `expected error containing "${c.expect.err}", got: ${res.err}`,
    };
  }

  if (!("values" in c.expect)) {
    return { case: c.name, detail: "possibleValues case must expect `values`" };
  }
  if (!res.success) {
    return { case: c.name, detail: `expected values, got error: ${res.err}` };
  }

  // Sequence compare: ordering is the assertion (sentinel last).
  const actual = JSON.stringify(res.data);
  const expected = JSON.stringify(c.expect.values);
  return actual === expected ? undefined : {
    case: c.name,
    detail: `values differ (ordered)\n  expected: ${
      describe(c.expect.values)
    }\n  actual:   ${describe(res.data)}`,
  };
}

async function runMetricInfo(
  c: Case,
  p: Prepared,
): Promise<Failure | undefined> {
  if (!("dimStatus" in c.expect) && !("periodBounds" in c.expect)) {
    return {
      case: c.name,
      detail: "metricInfo case must expect `dimStatus` or `periodBounds`",
    };
  }
  const metricId = p.fixture.metric?.id;
  if (!metricId) {
    return {
      case: c.name,
      detail: `fixture "${p.fixture.name}" has no metric`,
    };
  }

  const res = await getResultsValueInfoFromRun(contextFor(c, p), metricId);
  if (!res.success) {
    return {
      case: c.name,
      detail: `expected metric info, got error: ${res.err}`,
    };
  }

  if ("periodBounds" in c.expect) {
    const actual = JSON.stringify(res.data.periodBounds ?? null);
    const expected = JSON.stringify(c.expect.periodBounds);
    return actual === expected ? undefined : {
      case: c.name,
      detail: `expected periodBounds ${expected}, got ${actual}`,
    };
  }

  const want = c.expect.dimStatus;
  const all = res.data.disaggregationPossibleValues;
  const got = all[want.disOpt];
  if (!got) {
    return {
      case: c.name,
      detail: `no status for "${want.disOpt}"; present: ${
        Object.keys(all).join(", ")
      }`,
    };
  }
  if (got.status !== want.status) {
    return {
      case: c.name,
      detail: `expected status "${want.status}", got "${got.status}"`,
    };
  }
  if (want.namedCount !== undefined) {
    const named = got.status === "ok"
      ? got.values.filter((v) => v.id !== BLANK_SENTINEL).length
      : -1;
    if (named !== want.namedCount) {
      return {
        case: c.name,
        detail: `expected ${want.namedCount} named values, got ${named}`,
      };
    }
  }
  if (want.isSingleValueDim !== undefined) {
    const dims = getSingleValueDimsFromPossibleValues(all);
    const actual = dims.has(want.disOpt);
    if (actual !== want.isSingleValueDim) {
      return {
        case: c.name,
        detail:
          `expected isSingleValueDim=${want.isSingleValueDim}, got ${actual}`,
      };
    }
  }
  return undefined;
}

// The replicant read's compute, below its cache (Valkey is out of the rig's
// scope), after the validation the handler runs first.
async function runReplicantOptions(
  c: Case,
  p: Prepared,
): Promise<Failure | undefined> {
  if (!("replicantIds" in c.expect)) {
    return {
      case: c.name,
      detail: "replicantOptions case must expect `replicantIds`",
    };
  }
  validateFetchConfig(c.fetchConfig);
  const res = await computeRunReplicantOptions(
    contextFor(c, p),
    {
      resultsObjectId: p.fixture.resultsObjectId,
      replicateBy: c.disOpt!,
      fetchConfig: c.fetchConfig,
    },
    p.fixture.moduleId,
  );
  if (!res.success) {
    return { case: c.name, detail: `expected options, got error: ${res.err}` };
  }
  const actual = res.data.status === "ok"
    ? res.data.possibleValues.map((v) => v.id)
    : res.data.status === "no_values_available"
    ? []
    : res.data.status;
  return JSON.stringify(actual) === JSON.stringify(c.expect.replicantIds)
    ? undefined
    : {
      case: c.name,
      detail: `expected option ids ${describe(c.expect.replicantIds)}, got ${
        describe(actual)
      }`,
    };
}

async function runRawPreview(
  c: Case,
  p: Prepared,
): Promise<Failure | undefined> {
  if (!("rawCount" in c.expect)) {
    return { case: c.name, detail: "rawPreview case must expect `rawCount`" };
  }
  const res = await getResultsObjectItemsFromRun(
    contextFor(c, p),
    p.fixture.resultsObjectId,
    undefined,
  );
  if (!res.success) {
    return { case: c.name, detail: `expected rows, got error: ${res.err}` };
  }
  const actual = res.data.status === "ok"
    ? { totalCount: res.data.totalCount, rows: res.data.items.length }
    : { totalCount: 0, rows: 0 };
  const want = c.expect.rawCount;
  return actual.totalCount === want && actual.rows === want ? undefined : {
    case: c.name,
    detail: `expected ${want} rows and totalCount ${want}, got ${
      describe(actual)
    }`,
  };
}

async function runCase(c: Case, p: Prepared): Promise<Failure | undefined> {
  setCalendar(c.calendar ?? "gregorian");

  if (c.entry === "possibleValues") {
    return await runPossibleValues(c, p);
  }
  if (c.entry === "metricInfo") {
    return await runMetricInfo(c, p);
  }
  if (c.entry === "replicantOptions") {
    return await runReplicantOptions(c, p);
  }
  if (c.entry === "rawPreview") {
    return await runRawPreview(c, p);
  }

  // Reproduce the route's sequence. validateFetchConfig lives in the handler,
  // not in the read function, so calling the read function alone would
  // silently skip the imperative SQL-safety guard. (The Zod boundary schema is
  // the other half and is deliberately out of the rig's scope.)
  const ctx = contextFor(c, p);
  let res: Awaited<ReturnType<typeof getPresentationObjectItemsFromRun>>;
  try {
    validateFetchConfig(c.fetchConfig);
    res = await getPresentationObjectItemsFromRun(
      ctx,
      p.fixture.resultsObjectId,
      c.fetchConfig,
      p.fixture.firstPeriodOption,
    );
  } catch (e) {
    res = { success: false, err: e instanceof Error ? e.message : String(e) };
  }

  if ("err" in c.expect) {
    if (res.success) {
      return {
        case: c.name,
        detail: `expected error containing "${c.expect.err}", got success`,
      };
    }
    if (!res.err.includes(c.expect.err)) {
      return {
        case: c.name,
        detail: `expected error containing "${c.expect.err}", got: ${res.err}`,
      };
    }
    return undefined;
  }

  if ("values" in c.expect) {
    return {
      case: c.name,
      detail: '`values` expectation requires entry: "possibleValues"',
    };
  }
  if (
    "dimStatus" in c.expect || "periodBounds" in c.expect ||
    "replicantIds" in c.expect || "rawCount" in c.expect
  ) {
    return {
      case: c.name,
      detail: "this expectation requires its own `entry`",
    };
  }

  if (!res.success) {
    return {
      case: c.name,
      detail: `expected status "${c.expect.status}", got error: ${res.err}`,
    };
  }

  const holder = res.data;

  // The echoed fetchConfig is the REQUEST, on every case: the scope lives in
  // the view, never in the config, or the client would see filters it never
  // sent (and cache them). The holder's identity is the (run, scope) pair,
  // which is what the caches key on.
  if (JSON.stringify(holder.fetchConfig) !== JSON.stringify(c.fetchConfig)) {
    return {
      case: c.name,
      detail: `echoed fetchConfig is not the request\n  expected: ${
        describe(c.fetchConfig)
      }\n  actual:   ${describe(holder.fetchConfig)}`,
    };
  }
  if (holder.runId !== ctx.runId || holder.scopeToken !== ctx.scopeToken) {
    return {
      case: c.name,
      detail:
        `holder identity is not (run, scope): got runId=${holder.runId} scopeToken=${holder.scopeToken}`,
    };
  }

  if (holder.status !== c.expect.status) {
    return {
      case: c.name,
      detail: `expected status "${c.expect.status}", got "${holder.status}"`,
    };
  }

  if (c.expect.status === "ok" && holder.status === "ok") {
    const actual = holder.items as Record<string, unknown>[];
    if (!rowsMatch(actual, c.expect.rows)) {
      return {
        case: c.name,
        detail: `rows differ (multiset compare)\n  expected: ${
          describe(c.expect.rows)
        }\n  actual:   ${describe(actual)}`,
      };
    }
  }

  return undefined;
}

const green = (s: string) => `\x1b[92m${s}\x1b[0m`;
const red = (s: string) => `\x1b[91m${s}\x1b[0m`;

const prepared = new Map<string, Prepared>();
const failures: Failure[] = [];
let passed = 0;

for (const fx of ALL_FIXTURES) {
  console.log(`Preparing fixture: ${fx.name}`);
  prepared.set(fx.name, await prepare(fx));
}

console.log("");
for (const c of CASES) {
  const p = prepared.get(c.fixture);
  if (!p) {
    failures.push({ case: c.name, detail: `unknown fixture "${c.fixture}"` });
    continue;
  }
  let failure: Failure | undefined;
  try {
    failure = await runCase(c, p);
  } catch (e) {
    failure = {
      case: c.name,
      detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (failure) {
    failures.push(failure);
    console.log(`  ${red("FAIL")}  ${c.name}`);
  } else {
    passed++;
    console.log(`  ${green("pass")}  ${c.name}`);
  }
}

for (const p of prepared.values()) {
  await p.mainDb.end();
}

console.log("");
if (failures.length > 0) {
  console.log(red(`${failures.length} failing / ${CASES.length} cases\n`));
  for (const f of failures) {
    console.log(`${red("FAIL")}  ${f.case}`);
    console.log(`      ${f.detail.replaceAll("\n", "\n      ")}\n`);
  }
  Deno.exit(1);
}

console.log(green(`All ${passed} cases passed`));
// DuckDB's native handles keep the event loop alive after the last case; a CLI
// that has printed its verdict exits explicitly.
Deno.exit(0);

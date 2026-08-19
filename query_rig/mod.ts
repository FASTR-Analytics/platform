import { BLANK_SENTINEL, validateFetchConfig } from "lib";
import { getSingleValueDimsFromPossibleValues } from "lib";
import {
  getIndicatorMetadataFromRun,
  getPossibleValuesFromRun,
  getPresentationObjectItemsFromRun,
  getResultsValueInfoFromRun,
  type RunReadContext,
} from "../server/run_query/mod.ts";
import { CASES, type Case } from "./cases.ts";
import { ALL_FIXTURES, type Fixture } from "./fixtures.ts";
import {
  ensureRunsDir,
  readContextFor,
  rowsMatch,
  type Failure,
} from "./harness.ts";
import { seedRunPackage } from "./seed.ts";

function describe(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

// Built the same way the replicant-options route builds it, so the rig
// exercises getIndicatorMetadataFromRun rather than stubbing labels.
function labelMapFor(ctx: RunReadContext, fx: Fixture): Map<string, string> {
  return new Map(
    getIndicatorMetadataFromRun(ctx, fx.moduleId).map((m) => [m.id, m.label]),
  );
}

async function runPossibleValues(
  c: Case,
  ctx: RunReadContext,
  fx: Fixture,
): Promise<Failure | undefined> {
  if (c.disOpt === undefined) {
    return { case: c.name, detail: "possibleValues case must set `disOpt`" };
  }
  const res = await getPossibleValuesFromRun(
    ctx,
    fx.resultsObjectId,
    c.disOpt,
    labelMapFor(ctx, fx),
    c.fetchConfig.filters,
  );

  if ("err" in c.expect) {
    if (res.success) {
      return { case: c.name, detail: `expected error containing "${c.expect.err}", got success` };
    }
    return res.err.includes(c.expect.err)
      ? undefined
      : { case: c.name, detail: `expected error containing "${c.expect.err}", got: ${res.err}` };
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
  return actual === expected
    ? undefined
    : {
        case: c.name,
        detail: `values differ (ordered)\n  expected: ${describe(c.expect.values)}\n  actual:   ${describe(res.data)}`,
      };
}

async function runMetricInfo(
  c: Case,
  ctx: RunReadContext,
  fx: Fixture,
): Promise<Failure | undefined> {
  if (!("dimStatus" in c.expect)) {
    return { case: c.name, detail: "metricInfo case must expect `dimStatus`" };
  }
  const metricId = fx.metric?.id;
  if (!metricId) {
    return { case: c.name, detail: `fixture "${fx.name}" has no metric` };
  }

  const res = await getResultsValueInfoFromRun(ctx, metricId);
  if (!res.success) {
    return { case: c.name, detail: `expected metric info, got error: ${res.err}` };
  }

  const want = c.expect.dimStatus;
  const all = res.data.disaggregationPossibleValues;
  const got = all[want.disOpt];
  if (!got) {
    return {
      case: c.name,
      detail: `no status for "${want.disOpt}"; present: ${Object.keys(all).join(", ")}`,
    };
  }
  if (got.status !== want.status) {
    return { case: c.name, detail: `expected status "${want.status}", got "${got.status}"` };
  }
  if (want.namedCount !== undefined) {
    const named =
      got.status === "ok"
        ? got.values.filter((v) => v.id !== BLANK_SENTINEL).length
        : -1;
    if (named !== want.namedCount) {
      return { case: c.name, detail: `expected ${want.namedCount} named values, got ${named}` };
    }
  }
  if (want.isSingleValueDim !== undefined) {
    const dims = getSingleValueDimsFromPossibleValues(all);
    const actual = dims.has(want.disOpt);
    if (actual !== want.isSingleValueDim) {
      return {
        case: c.name,
        detail: `expected isSingleValueDim=${want.isSingleValueDim}, got ${actual}`,
      };
    }
  }
  return undefined;
}

async function runCase(
  c: Case,
  ctx: RunReadContext,
  fx: Fixture,
): Promise<Failure | undefined> {
  if (c.entry === "possibleValues") {
    return await runPossibleValues(c, ctx, fx);
  }
  if (c.entry === "metricInfo") {
    return await runMetricInfo(c, ctx, fx);
  }

  // Reproduce the route's sequence. validateFetchConfig lives in the handler,
  // not in the read function, so calling the query function alone would
  // silently skip the imperative SQL-safety guard. (The Zod boundary schema is
  // the other half and is deliberately out of the rig's scope.)
  let res: Awaited<ReturnType<typeof getPresentationObjectItemsFromRun>>;
  try {
    validateFetchConfig(c.fetchConfig);
    res = await getPresentationObjectItemsFromRun(
      ctx,
      fx.resultsObjectId,
      c.fetchConfig,
      fx.firstPeriodOption,
    );
  } catch (e) {
    res = { success: false, err: e instanceof Error ? e.message : String(e) };
  }

  if ("err" in c.expect) {
    if (res.success) {
      return { case: c.name, detail: `expected error containing "${c.expect.err}", got success` };
    }
    if (!res.err.includes(c.expect.err)) {
      return { case: c.name, detail: `expected error containing "${c.expect.err}", got: ${res.err}` };
    }
    return undefined;
  }

  if ("values" in c.expect) {
    return { case: c.name, detail: "`values` expectation requires entry: \"possibleValues\"" };
  }
  if ("dimStatus" in c.expect) {
    return { case: c.name, detail: "`dimStatus` expectation requires entry: \"metricInfo\"" };
  }

  if (!res.success) {
    return { case: c.name, detail: `expected status "${c.expect.status}", got error: ${res.err}` };
  }

  const holder = res.data;

  // The echoed fetchConfig is the REQUEST, on every case: a scoped read adds
  // its filters internally and must restore the caller's config, or the client
  // would see filters it never sent (and cache them).
  if (JSON.stringify(holder.fetchConfig) !== JSON.stringify(c.fetchConfig)) {
    return {
      case: c.name,
      detail: `echoed fetchConfig is not the request\n  expected: ${describe(c.fetchConfig)}\n  actual:   ${describe(holder.fetchConfig)}`,
    };
  }
  if (holder.runId !== ctx.runId || holder.scopeToken !== ctx.scopeToken) {
    return {
      case: c.name,
      detail: `holder identity is not (run, scope): got runId=${holder.runId} scopeToken=${holder.scopeToken}`,
    };
  }

  if (holder.status !== c.expect.status) {
    return { case: c.name, detail: `expected status "${c.expect.status}", got "${holder.status}"` };
  }

  if (c.expect.status === "ok" && holder.status === "ok") {
    const actual = holder.items as Record<string, unknown>[];
    if (!rowsMatch(actual, c.expect.rows)) {
      return {
        case: c.name,
        detail: `rows differ (multiset compare)\n  expected: ${describe(c.expect.rows)}\n  actual:   ${describe(actual)}`,
      };
    }
  }

  return undefined;
}

const green = (s: string) => `\x1b[92m${s}\x1b[0m`;
const red = (s: string) => `\x1b[91m${s}\x1b[0m`;

await ensureRunsDir();

const fixtures = new Map<string, Fixture>();
const failures: Failure[] = [];
let passed = 0;

for (const fx of ALL_FIXTURES) {
  console.log(`Seeding package: ${fx.name}`);
  await seedRunPackage(fx);
  fixtures.set(fx.name, fx);
}

console.log("");
for (const c of CASES) {
  const fx = fixtures.get(c.fixture);
  if (!fx) {
    failures.push({ case: c.name, detail: `unknown fixture "${c.fixture}"` });
    continue;
  }
  let failure: Failure | undefined;
  try {
    const ctx = await readContextFor(
      fx,
      c.adminArea2 ?? null,
      c.calendar ?? "gregorian",
    );
    failure = await runCase(c, ctx, fx);
  } catch (e) {
    failure = { case: c.name, detail: `threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (failure) {
    failures.push(failure);
    console.log(`  ${red("FAIL")}  ${c.name}`);
  } else {
    passed++;
    console.log(`  ${green("pass")}  ${c.name}`);
  }
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
// Explicit: the DuckDB node addon does not always release the event loop when
// the last instance closes, and a rig that hangs after its verdict would hang
// ./deploy behind it.
Deno.exit(0);

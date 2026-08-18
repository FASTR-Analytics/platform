import type { Sql } from "postgres";
import { BLANK_SENTINEL, setCalendar, validateFetchConfig } from "lib";
import { getSingleValueDimsFromPossibleValues } from "lib";
import {
  getIndicatorMetadata,
  getPossibleValues,
  getPresentationObjectItems,
  getResultsValueInfoForPresentationObject,
} from "../server/server_only_funcs_presentation_objects/mod.ts";
import { CASES, type Case } from "./cases.ts";
import { ALL_FIXTURES, type Fixture } from "./fixtures.ts";
import {
  connect,
  createDatabase,
  loadSchemaFile,
  rowsMatch,
  type Failure,
} from "./harness.ts";
import { seedInstance, seedProject } from "./seed.ts";

const REPO = new URL("..", import.meta.url).pathname;
const INSTANCE_SCHEMA = `${REPO}server/db/instance/_main_database.sql`;
const PROJECT_SCHEMA = `${REPO}server/db/project/_project_database.sql`;

type Prepared = {
  fixture: Fixture;
  mainDb: Sql;
  projectDb: Sql;
  labelMap: Map<string, string>;
};

async function prepare(fx: Fixture): Promise<Prepared> {
  const mainDb = await createDatabase(`qr_${fx.name}_main`);
  const projectDb = await createDatabase(`qr_${fx.name}_project`);
  await loadSchemaFile(mainDb, INSTANCE_SCHEMA);
  await loadSchemaFile(projectDb, PROJECT_SCHEMA);
  await seedInstance(mainDb, fx);
  await seedProject(projectDb, fx);

  // Built the same way the replicant-options route builds it, so the rig
  // exercises getIndicatorMetadata rather than stubbing labels.
  const metadata = await getIndicatorMetadata(projectDb, fx.moduleId);
  const labelMap = new Map(metadata.map((m) => [m.id, m.label]));

  return { fixture: fx, mainDb, projectDb, labelMap };
}

function describe(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

async function runPossibleValues(
  c: Case,
  p: Prepared
): Promise<Failure | undefined> {
  const res = await getPossibleValues(
    p.projectDb,
    p.fixture.resultsObjectId,
    p.fixture.family,
    c.disOpt!,
    p.mainDb,
    p.labelMap,
    c.fetchConfig.filters
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
  p: Prepared
): Promise<Failure | undefined> {
  if (!("dimStatus" in c.expect)) {
    return { case: c.name, detail: "metricInfo case must expect `dimStatus`" };
  }
  const metricId = p.fixture.metric?.id;
  if (!metricId) {
    return { case: c.name, detail: `fixture "${p.fixture.name}" has no metric` };
  }

  const res = await getResultsValueInfoForPresentationObject(
    p.mainDb,
    p.projectDb,
    metricId,
    "2026-01-01T00:00:00.000Z",
    "ds-v1"
  );
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

async function runCase(c: Case, p: Prepared): Promise<Failure | undefined> {
  setCalendar(c.calendar ?? "gregorian");

  if (c.entry === "possibleValues") {
    return await runPossibleValues(c, p);
  }
  if (c.entry === "metricInfo") {
    return await runMetricInfo(c, p);
  }

  // Reproduce the route's sequence. validateFetchConfig lives in the handler,
  // not in getPresentationObjectItems, so calling the query function alone
  // would silently skip the imperative SQL-safety guard. (The Zod boundary
  // schema is the other half and is deliberately out of the rig's scope.)
  let res: Awaited<ReturnType<typeof getPresentationObjectItems>>;
  try {
    validateFetchConfig(c.fetchConfig);
    res = await getPresentationObjectItems(
      p.mainDb,
      p.projectDb,
      p.fixture.resultsObjectId,
      c.fetchConfig,
      p.fixture.firstPeriodOption,
      "2026-01-01T00:00:00.000Z",
      "ds-v1"
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

for (const p of prepared.values()) {
  await p.mainDb.end();
  await p.projectDb.end();
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

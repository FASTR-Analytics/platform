// Pins the apply of the DHIS2 id repair on a throwaway database built from
// _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards: each outcome's writes, a duplicate's references and
// deletion, the Sum rewrites, the stale ledger rows, the minted version row,
// the preconditions that roll the whole apply back, the dictionary stamp, the
// plan-file comparison `apply` refuses on, and the backfill's queued run.
//
//   deno test -A --env-file server/tests/dhis2_id_fix_execute_test.ts

import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "@std/assert";
import type { Dhis2IndicatorDecomposition } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import { getHmisIndicators } from "../db/instance/indicators.ts";
import { getIndicatorsVersion } from "../db/instance/instance.ts";
import { parseDhis2Indicator } from "../dhis2/goal2_indicators/decompose_indicator.ts";
import {
  applyDhis2IdFix,
  type Dhis2IdFixFacts,
  type Dhis2IdFixPlan,
  diffDhis2IdFixPlans,
  planDhis2IdFix,
  queueDhis2IdFixBackfill,
  readDhis2IdFixPlanFile,
  readRowSpans,
  readStaleLedgerCounts,
  waitForDhis2IdFixBackfill,
} from "../dhis2_id_fix/mod.ts";
import type { ElementRoute } from "../worker_routines/import_hmis_data_dhis2/dispatch.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "dhis2_id_fix_test_";
const URL_STORED = "https://dhis2.example.org";
const AT = "2026-10-21T10:00:00.000Z";

const A = "ElemAaaaaa1";
const B = "ElemBbbbbb2";
const F1 = "FormulaAa01";
const F2 = "FormulaBb02";
const NF = "NotFound001";
const U = "UploadedU01";
const DEFAULT_COC = "DefaultCoc1";
const DUP = `${A}.${DEFAULT_COC}`;

const FORMULA: ElementRoute = { kind: "unknown", reason: "dhis2_indicator" };
const NOT_FOUND: ElementRoute = { kind: "unknown", reason: "not_found" };
const DVS: ElementRoute = { kind: "dvs", dataElementId: A, coc: undefined };

const admin = getPgConnection("postgres", { max: 1 });
for (
  const { datname } of await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE ${DB_PREFIX + "%"}
  `
) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
}
const dbName = `${DB_PREFIX}${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${dbName}`);
const db = getPgConnection(dbName, { max: 2 });
await db.file(SCHEMA_PATH);

async function seed(): Promise<void> {
  await db`DELETE FROM dataset_hmis_import_ledger`;
  await db`DELETE FROM dataset_hmis`;
  await db`DELETE FROM dataset_hmis_scheduled_imports`;
  await db`DELETE FROM dataset_hmis_import_runs`;
  await db`DELETE FROM indicator_sum_members`;
  await db`DELETE FROM indicators`;
  await db`DELETE FROM dataset_hmis_versions`;
  await db`DELETE FROM facilities_hmis`;
  await db`DELETE FROM admin_areas_hmis_1`;
  await db`DELETE FROM instance_dhis2_credentials`;
  await db`INSERT INTO admin_areas_hmis_1 (admin_area_1) VALUES ('a1')`;
  await db`
    INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1) VALUES ('a2', 'a1')
  `;
  await db`
    INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1)
    VALUES ('a3', 'a2', 'a1')
  `;
  await db`
    INSERT INTO admin_areas_hmis_4
      (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    VALUES ('a4', 'a3', 'a2', 'a1')
  `;
  await db`
    INSERT INTO facilities_hmis
      (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    VALUES ('fac1', 'a4', 'a3', 'a2', 'a1')
  `;
  await db`
    INSERT INTO dataset_hmis_versions (id, n_rows_total_imported)
    VALUES (1, 0)
  `;
  await db`
    INSERT INTO instance_dhis2_credentials
      (url, username, password_encrypted, updated_by)
    VALUES (${URL_STORED}, 'user', 'encrypted', 'test')
  `;
}

async function element(
  id: string,
  dataId: string,
  options: { label?: string; sortOrder?: number; include?: boolean } = {},
): Promise<void> {
  await db`
    INSERT INTO indicators
      (indicator_common_id, indicator_common_label, definition_type, data_id,
       include_in_analysis, sort_order)
    VALUES (${id}, ${options.label ?? `Label ${id}`}, 'dhis2_element',
      ${dataId}, ${options.include ?? true}, ${options.sortOrder ?? 1})
  `;
}

async function uploaded(id: string, dataId: string): Promise<void> {
  await db`
    INSERT INTO indicators
      (indicator_common_id, indicator_common_label, definition_type, data_id)
    VALUES (${id}, ${`Label ${id}`}, 'uploaded', ${dataId})
  `;
}

async function sum(id: string, members: string[]): Promise<void> {
  await db`
    INSERT INTO indicators
      (indicator_common_id, indicator_common_label, definition_type)
    VALUES (${id}, ${`Label ${id}`}, 'sum')
  `;
  await db`
    INSERT INTO indicator_sum_members (sum_id, member_id)
    SELECT ${id}, UNNEST(${members}::text[])
  `;
}

async function rows(dataId: string, periods: number[]): Promise<void> {
  for (const period of periods) {
    await db`
      INSERT INTO dataset_hmis (facility_id, data_id, period_id, count, version_id)
      VALUES ('fac1', ${dataId}, ${period}, ${period % 100}, 1)
    `;
    await db`
      INSERT INTO dataset_hmis_import_ledger
        (data_id, period_id, n_records, sum_count, route, status, imported_at, version_id)
      VALUES (${dataId}, ${period}, 1, ${
      period % 100
    }, 'dhis2', 'ready', now(), 1)
    `;
  }
}

async function ledgerError(dataId: string, period: number): Promise<void> {
  await db`
    INSERT INTO dataset_hmis_import_ledger
      (data_id, period_id, n_records, sum_count, route, status, error)
    VALUES (${dataId}, ${period}, 0, 0, 'dhis2', 'error', 'refused')
  `;
}

// A pair that imported once and failed on a later run keeps its counts.
async function ledgerErrorAfterImport(
  dataId: string,
  period: number,
): Promise<void> {
  await db`
    INSERT INTO dataset_hmis_import_ledger
      (data_id, period_id, n_records, sum_count, route, status, error, imported_at, version_id)
    VALUES (${dataId}, ${period}, 1, 5, 'dhis2', 'error', 'refused', now(), 1)
  `;
}

function formula(
  numerator: string,
  options: { denominator?: string; factor?: number } = {},
): Dhis2IndicatorDecomposition {
  const parse = parseDhis2Indicator({
    numerator,
    denominator: options.denominator ?? "1",
    factor: options.factor ?? 1,
  });
  const operands = parse.accepted
    ? parse.operands.map((o) => ({
      ...o,
      verdict: { accepted: true as const },
      label: o.data_id,
    }))
    : [];
  return { parse, operands, annualized: false };
}

async function facts(
  partial:
    & Pick<Dhis2IdFixFacts, "routes" | "formulas">
    & Partial<Pick<Dhis2IdFixFacts, "elements">>,
): Promise<Dhis2IdFixFacts> {
  const keys = [A, B, F1, F2, NF, U, DUP];
  return {
    dhis2Url: URL_STORED,
    indicators: await getHmisIndicators(db),
    rows: await readRowSpans(db, keys),
    staleLedger: await readStaleLedgerCounts(db, keys),
    elements: {
      [A]: { name: "ANC first visit", verdict: { accepted: true } },
      [B]: { name: "ANC first visit (repeat)", verdict: { accepted: true } },
    },
    ...partial,
  };
}

type IndicatorRow = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition_type: string;
  data_id: string | null;
  dhis2_label: string | null;
  expression: string | null;
  format_as: string;
  include_in_analysis: boolean;
  sort_order: number;
};

async function indicatorRow(id: string): Promise<IndicatorRow> {
  const found = await db<IndicatorRow[]>`
    SELECT indicator_common_id, indicator_common_label, definition_type,
      data_id, dhis2_label, expression, format_as, include_in_analysis,
      sort_order
    FROM indicators WHERE indicator_common_id = ${id}
  `;
  assertEquals(found.length, 1, `indicator ${id}`);
  return found[0];
}

async function membersOf(sumId: string): Promise<string[]> {
  return (await db<{ member_id: string }[]>`
    SELECT member_id FROM indicator_sum_members
    WHERE sum_id = ${sumId} ORDER BY member_id
  `).map((r) => r.member_id);
}

async function periodsUnder(
  table: "dataset_hmis" | "dataset_hmis_import_ledger",
  dataId: string,
): Promise<number[]> {
  const rows = table === "dataset_hmis"
    ? await db<{ period_id: number }[]>`
      SELECT period_id FROM dataset_hmis WHERE data_id = ${dataId} ORDER BY period_id
    `
    : await db<{ period_id: number }[]>`
      SELECT period_id FROM dataset_hmis_import_ledger WHERE data_id = ${dataId} ORDER BY period_id
    `;
  return rows.map((r) => r.period_id);
}

async function versions(): Promise<
  { id: number; n_rows_total_imported: number; staging_result: string | null }[]
> {
  return await db`
    SELECT id, n_rows_total_imported, staging_result
    FROM dataset_hmis_versions ORDER BY id
  `;
}

Deno.test("retarget moves the key, the label, every row and every ledger row; no version is minted", async () => {
  await seed();
  await element("anc1", F1, { label: "ANC 1" });
  await rows(F1, [202301, 202302, 202303]);
  await ledgerError(F1, 202304);
  const before = await getIndicatorsVersion(db);
  const plan = planDhis2IdFix(
    await facts({
      routes: { [F1]: FORMULA },
      formulas: { [F1]: formula(`#{${A}}`) },
    }),
    AT,
  );
  assertEquals(plan.actions.map((a) => a.outcome), ["retarget"]);

  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result, {
    versionId: null,
    actions: [{
      indicatorId: "anc1",
      outcome: "retarget",
      rowsMoved: 3,
      rowsDeleted: 0,
    }],
    sumsRewritten: [],
    staleLedgerRowsDeleted: 0,
  });
  const row = await indicatorRow("anc1");
  assertEquals(row.definition_type, "dhis2_element");
  assertEquals(row.data_id, A);
  assertEquals(row.dhis2_label, "ANC first visit");
  assertEquals(row.indicator_common_label, "ANC 1");
  assertEquals(await periodsUnder("dataset_hmis", A), [202301, 202302, 202303]);
  assertEquals(await periodsUnder("dataset_hmis", F1), []);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", A), [
    202301,
    202302,
    202303,
    202304,
  ]);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", F1), []);
  const errorRow = await db<{ status: string; error: string | null }[]>`
    SELECT status, error FROM dataset_hmis_import_ledger
    WHERE data_id = ${A} AND period_id = 202304
  `;
  assertEquals([...errorRow], [{ status: "error", error: "refused" }]);
  assertEquals((await versions()).map((v) => v.id), [1]);
  assertNotEquals(await getIndicatorsVersion(db), before);
});

Deno.test("to_sum creates the elements, deletes rows and ledger rows, writes members, rewrites the outer Sum and mints one version", async () => {
  await seed();
  await element("anc_total", A, { sortOrder: 5 });
  await element("anc_all", F1, { sortOrder: 2, include: false });
  await sum("outer", ["anc_all", "anc_total"]);
  await rows(A, [202301]);
  await rows(F1, [202301, 202302]);
  await ledgerError(F1, 202303);
  const plan = planDhis2IdFix(
    await facts({
      routes: { [A]: DVS, [F1]: FORMULA },
      formulas: { [F1]: formula(`#{${A}} + #{${B}}`) },
    }),
    AT,
  );
  assertEquals(plan.createdElements.map((c) => c.indicatorId), [
    "anc_first_visit_repeat",
  ]);
  assertEquals(plan.sumRewrites, [{
    sumId: "outer",
    members: ["anc_first_visit_repeat", "anc_total"],
  }]);

  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result.versionId, 2);
  assertEquals(result.actions, [{
    indicatorId: "anc_all",
    outcome: "to_sum",
    rowsMoved: 0,
    rowsDeleted: 2,
  }]);
  assertEquals(result.sumsRewritten, ["outer"]);

  const created = await indicatorRow("anc_first_visit_repeat");
  assertEquals(created.definition_type, "dhis2_element");
  assertEquals(created.data_id, B);
  assertEquals(created.indicator_common_label, "ANC first visit (repeat)");
  assertEquals(created.dhis2_label, "ANC first visit (repeat)");
  assertEquals(created.include_in_analysis, false);
  assertEquals(created.sort_order, 6);

  const retyped = await indicatorRow("anc_all");
  assertEquals(retyped.definition_type, "sum");
  assertEquals(retyped.data_id, null);
  assertEquals(retyped.dhis2_label, null);
  assertEquals(retyped.include_in_analysis, false);
  assertEquals(retyped.sort_order, 2);
  assertEquals(await membersOf("anc_all"), [
    "anc_first_visit_repeat",
    "anc_total",
  ]);
  assertEquals(await membersOf("outer"), [
    "anc_first_visit_repeat",
    "anc_total",
  ]);
  assertEquals(await periodsUnder("dataset_hmis", F1), []);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", F1), []);
  assertEquals(await periodsUnder("dataset_hmis", A), [202301]);

  const minted = (await versions()).at(-1)!;
  assertEquals(minted.id, 2);
  assertEquals(minted.n_rows_total_imported, -2);
  const stagingResult = JSON.parse(minted.staging_result ?? "null");
  assertEquals(stagingResult.kind, "deletion");
  assertEquals(stagingResult.rowsDeleted, 2);
  assertEquals(stagingResult.indicators, ["anc_all"]);
  assert(typeof stagingResult.dateImported === "string");
});

Deno.test("to_calculated writes the expression and format, deletes its rows and leaves the Sum that named it", async () => {
  await seed();
  await element("anc_total", A);
  await element("coverage", F2);
  await sum("outer", ["anc_total", "coverage"]);
  await rows(F2, [202301]);
  const plan = planDhis2IdFix(
    await facts({
      routes: { [A]: DVS, [F2]: FORMULA },
      formulas: {
        [F2]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 100 }),
      },
    }),
    AT,
  );
  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result.versionId, 2);
  const row = await indicatorRow("coverage");
  assertEquals(row.definition_type, "calculated");
  assertEquals(row.data_id, null);
  assertEquals(row.expression, "(anc_total / anc_first_visit_repeat)");
  assertEquals(row.format_as, "percent");
  assertEquals(await membersOf("outer"), ["anc_total"]);
  assertEquals(await periodsUnder("dataset_hmis", F2), []);
  assertEquals((await indicatorRow("anc_first_visit_repeat")).data_id, B);
});

Deno.test("to_uploaded keeps the key, the rows and the ledger", async () => {
  await seed();
  await element("gone", NF, { label: "Gone" });
  await rows(NF, [202301, 202302]);
  const plan = planDhis2IdFix(
    await facts({ routes: { [NF]: NOT_FOUND }, formulas: {} }),
    AT,
  );
  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result.versionId, null);
  const row = await indicatorRow("gone");
  assertEquals(row.definition_type, "uploaded");
  assertEquals(row.data_id, NF);
  assertEquals(row.dhis2_label, null);
  assertEquals(row.indicator_common_label, "Gone");
  assertEquals(await periodsUnder("dataset_hmis", NF), [202301, 202302]);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", NF), [
    202301,
    202302,
  ]);
});

Deno.test("stale ledger rows: a refused dvs element is retyped and the error rows without records under it and under every Uploaded indicator go; ready rows, imported pairs and the Uploaded stamps stay", async () => {
  await seed();
  await uploaded("legacy", U);
  await rows(U, [202301]);
  await ledgerError(U, 202302);
  await ledgerError(U, 202303);
  await ledgerErrorAfterImport(U, 202304);
  await element("quarterly", A, { label: "Quarterly" });
  await rows(A, [202301, 202302]);
  await ledgerError(A, 202303);
  await element("healthy", B);
  await ledgerError(B, 202301);
  const legacyStamp = async () =>
    (await db<{ updated_at: string }[]>`
      SELECT updated_at::text FROM indicators WHERE indicator_common_id = 'legacy'
    `)[0].updated_at;
  const refusedFacts = () =>
    facts({
      routes: {
        [A]: DVS,
        [B]: { kind: "dvs", dataElementId: B, coc: undefined },
      },
      formulas: {},
      elements: {
        [A]: {
          name: "TB outcomes",
          verdict: {
            accepted: false,
            refusal: { kind: "period_type", value: "Quarterly" },
          },
        },
        [B]: { name: "ANC first visit (repeat)", verdict: { accepted: true } },
      },
    });
  const plan = planDhis2IdFix(await refusedFacts(), AT);
  assertEquals(plan.elementsHealthy, 1);
  assertEquals(plan.actions.map((a) => [a.indicatorId, a.outcome]), [[
    "quarterly",
    "to_uploaded",
  ]]);
  assertEquals(plan.staleLedgerRows, [
    { indicatorId: "legacy", dataId: U, count: 2 },
    { indicatorId: "quarterly", dataId: A, count: 1 },
  ]);

  const accepted = planDhis2IdFix(
    await facts({
      routes: {
        [A]: DVS,
        [B]: { kind: "dvs", dataElementId: B, coc: undefined },
      },
      formulas: {},
    }),
    AT,
  );
  const drift = diffDhis2IdFixPlans(plan, accepted);
  assertEquals(drift.length, 3);
  assert(drift[0].startsWith("elementsHealthy: the plan says 1"));
  assertEquals(drift[1], "action quarterly: in the plan, not in live state");
  assertEquals(
    drift[2],
    "stale ledger rows quarterly: in the plan, not in live state",
  );

  await ledgerError(U, 202305);
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    "legacy has 3 stale ledger rows, the plan counted 2",
  );
  await db`DELETE FROM dataset_hmis_import_ledger WHERE data_id = ${U} AND period_id = 202305`;
  await db`UPDATE indicators SET definition_type = 'dhis2_element' WHERE indicator_common_id = 'legacy'`;
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    `legacy is not Uploaded under ${U}`,
  );
  await db`UPDATE indicators SET definition_type = 'uploaded' WHERE indicator_common_id = 'legacy'`;
  const stampBefore = await legacyStamp();

  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result.versionId, null);
  assertEquals(result.staleLedgerRowsDeleted, 3);
  const row = await indicatorRow("quarterly");
  assertEquals(row.definition_type, "uploaded");
  assertEquals(row.data_id, A);
  assertEquals(await periodsUnder("dataset_hmis", A), [202301, 202302]);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", A), [
    202301,
    202302,
  ]);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", U), [
    202301,
    202304,
  ]);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", B), [202301]);
  assertEquals(await legacyStamp(), stampBefore);

  const second = planDhis2IdFix(await refusedFacts(), AT);
  assertEquals(second.actions, []);
  assertEquals(second.staleLedgerRows, []);
});

Deno.test("duplicate: references move to the holder, the holder joins the analysis, the duplicate goes with its rows and ledger rows into the version row; a changed holder rolls the apply back", async () => {
  await seed();
  await element("anc_bare", A, { include: false });
  await rows(A, [202301, 202302]);
  await element("anc_default", DUP);
  await rows(DUP, [202301, 202302, 202303]);
  await ledgerError(DUP, 202304);
  await element("other", B);
  await rows(B, [202301]);
  await sum("anc1", ["anc_default", "other"]);
  await sum("both", ["anc_bare", "anc_default"]);
  await db`
    INSERT INTO indicators
      (indicator_common_id, indicator_common_label, definition_type, expression)
    VALUES ('share', 'Share', 'calculated', 'anc_default / other')
  `;
  await db`
    INSERT INTO dataset_hmis_scheduled_imports
      (kind, enabled, selection, run_at, created_by)
    VALUES ('one_shot', TRUE, ${
    JSON.stringify({ indicatorIds: ["anc_default", "anc_bare"], monthsBack: 3 })
  }, now(), 'test')
  `;
  const duplicateFacts = () =>
    facts({
      routes: {
        [A]: DVS,
        [B]: { kind: "dvs", dataElementId: B, coc: undefined },
        [DUP]: { kind: "dvs", dataElementId: A, coc: DEFAULT_COC },
      },
      formulas: {},
      elements: {
        [A]: {
          name: "ANC first visit",
          categoryCombo: {
            id: "CcDefault01",
            name: "default",
            isDefault: true,
            categoryOptionCombos: [{ id: DEFAULT_COC, name: "default" }],
          },
          verdict: { accepted: true },
        },
        [B]: { name: "ANC first visit (repeat)", verdict: { accepted: true } },
      },
    });
  const plan = planDhis2IdFix(await duplicateFacts(), AT);
  assertEquals(plan.actions, [{
    indicatorId: "anc_default",
    dataId: DUP,
    rows: { count: 3, firstPeriodId: 202301, lastPeriodId: 202303 },
    outcome: "duplicate",
    holder: "anc_bare",
    holderDataId: A,
    includeHolderInAnalysis: true,
  }]);
  assertEquals(plan.sumRewrites, [
    { sumId: "anc1", members: ["anc_bare", "other"] },
    { sumId: "both", members: ["anc_bare"] },
  ]);

  await db`UPDATE indicators SET indicator_common_id = 'anc_bare_2' WHERE indicator_common_id = 'anc_bare'`;
  const moved = await snapshot();
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    `${A} is held by anc_bare_2, the plan's holder is anc_bare`,
  );
  assertEquals(await snapshot(), moved);
  await db`UPDATE indicators SET indicator_common_id = 'anc_bare' WHERE indicator_common_id = 'anc_bare_2'`;

  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result.versionId, 2);
  assertEquals(result.actions, [{
    indicatorId: "anc_default",
    outcome: "duplicate",
    rowsMoved: 0,
    rowsDeleted: 3,
  }]);
  assertEquals(result.sumsRewritten, ["anc1", "both"]);
  assertEquals(
    (await db`
      SELECT 1 FROM indicators WHERE indicator_common_id = 'anc_default'
    `).length,
    0,
  );
  assertEquals(await periodsUnder("dataset_hmis", DUP), []);
  assertEquals(await periodsUnder("dataset_hmis_import_ledger", DUP), []);
  assertEquals(await periodsUnder("dataset_hmis", A), [202301, 202302]);
  assertEquals(await membersOf("anc1"), ["anc_bare", "other"]);
  assertEquals(await membersOf("both"), ["anc_bare"]);
  assertEquals((await indicatorRow("share")).expression, "anc_bare / other");
  assertEquals((await indicatorRow("anc_bare")).include_in_analysis, true);
  const schedules = await db<{ selection: string }[]>`
    SELECT selection FROM dataset_hmis_scheduled_imports
  `;
  assertEquals(JSON.parse(schedules[0].selection), {
    indicatorIds: ["anc_bare"],
    monthsBack: 3,
  });
  const minted = (await versions()).at(-1)!;
  assertEquals(minted.n_rows_total_imported, -3);
  assertEquals(
    JSON.parse(minted.staging_result ?? "null").indicators,
    ["anc_default"],
  );

  const second = planDhis2IdFix(await duplicateFacts(), AT);
  assertEquals(second.actions, []);
  assertEquals(second.sumRewrites, []);
  assertEquals(second.staleLedgerRows, []);
});

async function planWithCreatedElement(): Promise<Dhis2IdFixPlan> {
  await seed();
  await element("anc_total", A);
  await element("anc1", F1);
  await element("anc_all", F2);
  await rows(F1, [202301]);
  await rows(F2, [202301]);
  return planDhis2IdFix(
    await facts({
      routes: { [A]: DVS, [F1]: FORMULA, [F2]: FORMULA },
      formulas: {
        [F1]: formula(`#{${B}}`),
        [F2]: formula(`#{${A}} + #{${B}}`),
      },
    }),
    AT,
  );
}

async function snapshot(): Promise<string> {
  const indicators = await db`
    SELECT indicator_common_id, definition_type, data_id, dhis2_label, expression
    FROM indicators ORDER BY indicator_common_id
  `;
  const members = await db`
    SELECT sum_id, member_id FROM indicator_sum_members ORDER BY sum_id, member_id
  `;
  const data = await db`
    SELECT data_id, period_id FROM dataset_hmis ORDER BY data_id, period_id
  `;
  const ledger = await db`
    SELECT data_id, period_id, status FROM dataset_hmis_import_ledger
    ORDER BY data_id, period_id
  `;
  return JSON.stringify({
    indicators,
    members,
    data,
    ledger,
    versions: await versions(),
  });
}

Deno.test("a failed precondition rolls back every write of the apply", async () => {
  const plan = await planWithCreatedElement();
  assertEquals(plan.actions.map((a) => a.outcome), ["retarget", "to_sum"]);
  assertEquals(plan.createdElements, []);
  const before = await snapshot();
  const stamp = await getIndicatorsVersion(db);

  await rows(F2, [202302]);
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    "anc_all has 2 rows, the plan counted 1",
  );
  await db`DELETE FROM dataset_hmis WHERE data_id = ${F2} AND period_id = 202302`;
  await db`DELETE FROM dataset_hmis_import_ledger WHERE data_id = ${F2} AND period_id = 202302`;
  assertEquals(await snapshot(), before);

  await db`
    INSERT INTO dataset_hmis_import_runs (trigger, route, status)
    VALUES ('manual', 'dhis2', 'running')
  `;
  await assertRejects(() => applyDhis2IdFix(db, plan), Error);
  await db`DELETE FROM dataset_hmis_import_runs`;
  assertEquals(await snapshot(), before);

  await db`UPDATE instance_dhis2_credentials SET url = 'https://other.example.org'`;
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    "The stored DHIS2 URL",
  );
  await db`UPDATE instance_dhis2_credentials SET url = ${URL_STORED}`;
  assertEquals(await snapshot(), before);
  assertEquals(await getIndicatorsVersion(db), stamp);

  const result = await applyDhis2IdFix(db, plan);
  assertEquals(result.actions.map((a) => a.outcome), ["retarget", "to_sum"]);
  assertEquals(await membersOf("anc_all"), ["anc1", "anc_total"]);
});

Deno.test("a failure after a write rolls the written actions back", async () => {
  const plan = await planWithCreatedElement();
  await sum("late", ["anc_all"]);
  const before = await snapshot();
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    "indicator_sum_members_member_has_rows_check",
  );
  assertEquals(await snapshot(), before);
});

Deno.test("a created id that is taken, or a Sum left without members, rolls the apply back", async () => {
  await seed();
  await element("anc_all", F1);
  await element("ratio", F2);
  await sum("only_ratio", ["ratio"]);
  await rows(F1, [202301]);
  const plan = planDhis2IdFix(
    await facts({
      routes: { [F1]: FORMULA, [F2]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}} + #{${B}}`),
        [F2]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 100 }),
      },
    }),
    AT,
  );
  assertEquals(plan.sumRewrites, [{ sumId: "only_ratio", members: [] }]);
  const before = await snapshot();
  await assertRejects(
    () => applyDhis2IdFix(db, plan),
    Error,
    "Sum only_ratio would be left with no members",
  );
  assertEquals(await snapshot(), before);

  await db`DELETE FROM indicator_sum_members WHERE sum_id = 'only_ratio'`;
  await db`DELETE FROM indicators WHERE indicator_common_id = 'only_ratio'`;
  const planWithoutSum = planDhis2IdFix(
    await facts({
      routes: { [F1]: FORMULA, [F2]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}} + #{${B}}`),
        [F2]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 100 }),
      },
    }),
    AT,
  );
  await db`
    INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type, expression)
    VALUES ('anc_first_visit', 'Taken', 'calculated', '1')
  `;
  const taken = await snapshot();
  await assertRejects(
    () => applyDhis2IdFix(db, planWithoutSum),
    Error,
    "Indicator id anc_first_visit is taken",
  );
  assertEquals(await snapshot(), taken);
});

Deno.test("the plan-file comparison ignores plannedAt and names every difference", async () => {
  const plan = await planWithCreatedElement();
  assertEquals(
    diffDhis2IdFixPlans(
      { ...plan, plannedAt: "2000-01-01T00:00:00.000Z" },
      plan,
    ),
    [],
  );
  const drifted: Dhis2IdFixPlan = {
    ...plan,
    elementsHealthy: 7,
    actions: [
      { ...plan.actions[0], outcome: "to_uploaded", reason: "x" },
      { ...plan.actions[1] },
    ],
    sumRewrites: [{ sumId: "outer", members: ["a"] }],
  };
  const differences = diffDhis2IdFixPlans(drifted, plan);
  assertEquals(differences.length, 3);
  assert(differences[0].startsWith("elementsHealthy: the plan says 7"));
  assert(differences[1].startsWith("action anc1: plan"));
  assertEquals(
    differences[2],
    "sum rewrite outer: in the plan, not in live state",
  );
  assertEquals(
    diffDhis2IdFixPlans(plan, {
      ...plan,
      createdElements: [{
        indicatorId: "x",
        label: "x",
        dataId: B,
        sortOrder: 9,
      }],
    }),
    [`created element ${B}: in live state, not in the plan`],
  );
  assertEquals(readDhis2IdFixPlanFile(JSON.stringify(plan)), plan);
  assertThrows(
    () => readDhis2IdFixPlanFile(JSON.stringify({ actions: [] })),
    Error,
    "not a plan file",
  );
});

Deno.test("backfill: one manual run queued for the server over the emptied Sum and the rewritten Sum, refused for another server's plan; the wait returns the run once it has ended", async () => {
  await seed();
  await db`
    INSERT INTO facilities_hmis
      (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    VALUES ('FacAaaaaaa1', 'a4', 'a3', 'a2', 'a1')
  `;
  await element("anc_total", A);
  await element("anc_all", F1);
  await rows(F1, [202301, 202302]);
  await sum("outer", ["anc_all", "anc_total"]);
  const plan = planDhis2IdFix(
    await facts({
      routes: { [A]: DVS, [F1]: FORMULA },
      formulas: { [F1]: formula(`#{${A}} + #{${B}}`) },
    }),
    AT,
  );
  await applyDhis2IdFix(db, plan);

  await assertRejects(
    () =>
      queueDhis2IdFixBackfill(db, {
        ...plan,
        dhis2Url: "https://other.example.org",
      }),
    Error,
    "The stored DHIS2 URL",
  );
  const { runId, selection } = await queueDhis2IdFixBackfill(db, plan);
  assertEquals(selection, {
    kind: "window",
    indicatorIds: ["anc_all", "outer"],
    startPeriod: 202301,
    endPeriod: 202302,
  });
  const queued = await db<
    {
      status: string;
      trigger: string;
      triggered_by: string;
      dhis2_url: string;
      selection: string;
      total_pairs: number;
    }[]
  >`
    SELECT status, trigger, triggered_by, dhis2_url, selection, total_pairs
    FROM dataset_hmis_import_runs
  `;
  assertEquals(queued.length, 1);
  assertEquals(queued[0].status, "queued");
  assertEquals(queued[0].trigger, "manual");
  assertEquals(queued[0].triggered_by, "dhis2-id-repair");
  assertEquals(queued[0].dhis2_url, URL_STORED);
  assertEquals(JSON.parse(queued[0].selection).dataIds.toSorted(), [A, B]);
  assertEquals(queued[0].total_pairs, 4);

  await db`
    UPDATE dataset_hmis_import_runs
    SET status = 'complete', succeeded_pairs = 3, failed_pairs = 1,
      ended_at = now()
    WHERE id = ${runId}
  `;
  const ended = await waitForDhis2IdFixBackfill(db, runId);
  assertEquals(
    [ended.id, ended.status, ended.succeededPairs, ended.failedPairs],
    [runId, "complete", 3, 1],
  );
});

Deno.test({
  name: "teardown",
  fn: async () => {
    await db.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

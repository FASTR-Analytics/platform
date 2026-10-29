// Pins the dispatcher's choice of dataValueSets selector by DHIS2 release and
// the pull grouping each selector implies (import_hmis_data_dhis2/dispatch.ts),
// whose contract is the dispatcher bullet of SYSTEM_06_ingestion.md. Pure: no
// DHIS2, no database.
//
//   deno test -A --env-file server/tests/dhis2_pull_route_test.ts

import { assertEquals } from "@std/assert";
import { parseDhis2Release } from "../dhis2/common/system_info.ts";
import { monthlyDataSetId } from "../dhis2/goal2_indicators/element_eligibility.ts";
import {
  dataValuesWithSetDefaults,
  type DHIS2DataValue,
} from "../dhis2/goal5_data_value_sets/mod.ts";
import {
  buildPullTasks,
  type DvsCoveredPair,
  type ElementRoute,
  pairKey,
  pullByForVersion,
  type PullTask,
  reduceDvsValues,
} from "../worker_routines/import_hmis_data_dhis2/dispatch.ts";

Deno.test("the release is read from every form DHIS2 reports", () => {
  assertEquals(parseDhis2Release("2.38.4"), 38);
  assertEquals(parseDhis2Release("2.39.0"), 39);
  assertEquals(parseDhis2Release("2.40.1"), 40);
  assertEquals(parseDhis2Release("2.44-SNAPSHOT"), 44);
  assertEquals(parseDhis2Release("40.2.0"), 40);
  assertEquals(parseDhis2Release("2.36"), 36);
  assertEquals(parseDhis2Release(""), undefined);
  assertEquals(parseDhis2Release(undefined), undefined);
  assertEquals(parseDhis2Release("SNAPSHOT"), undefined);
});

Deno.test("dataElement from 2.39, dataSet before, none when unreadable", () => {
  assertEquals(pullByForVersion("2.38.7"), "dataSet");
  assertEquals(pullByForVersion("2.36.0"), "dataSet");
  assertEquals(pullByForVersion("2.39.0"), "dataElement");
  assertEquals(pullByForVersion("2.40.1"), "dataElement");
  assertEquals(pullByForVersion("2.44-SNAPSHOT"), "dataElement");
  assertEquals(pullByForVersion(undefined), undefined);
  assertEquals(pullByForVersion("unknown"), undefined);
});

const ELEMENT_A = "ElemAaaaaa1";
const ELEMENT_B = "ElemBbbbbb1";
const COC = "CocAaaaaaa1";
const SET = "DsetAaaaaa1";

const routes = new Map<string, ElementRoute>([
  ["a", { kind: "dvs", dataElementId: ELEMENT_A, coc: undefined }],
  ["a.coc", { kind: "dvs", dataElementId: ELEMENT_A, coc: COC }],
  ["b", { kind: "dvs", dataElementId: ELEMENT_B, coc: undefined }],
  ["formula", { kind: "unknown", reason: "dhis2_indicator" }],
]);
const pairs = [
  { dataId: "a", periodId: 202402 },
  { dataId: "a", periodId: 202401 },
  { dataId: "a.coc", periodId: 202401 },
  { dataId: "b", periodId: 202401 },
  { dataId: "formula", periodId: 202401 },
];

function shape(tasks: PullTask[]) {
  return tasks.map((t) => [
    t.selector.kind,
    t.selector.id,
    t.periodId,
    t.coveredPairs.map((c) => c.dataId),
  ]);
}

Deno.test("by data element: one pull per element and month, operands share it, months in order", () => {
  const tasks = buildPullTasks(pairs, routes, "dataElement", new Map());
  assertEquals(shape(tasks), [
    ["dataElement", ELEMENT_A, 202401, ["a", "a.coc"]],
    ["dataElement", ELEMENT_A, 202402, ["a"]],
    ["dataElement", ELEMENT_B, 202401, ["b"]],
  ]);
  assertEquals(
    tasks[0]!.coveredPairs.map((c) => [c.dataElementId, c.coc]),
    [[ELEMENT_A, undefined], [ELEMENT_A, COC]],
  );
});

Deno.test("by data set: elements sharing a set share one pull; an element without a monthly set has none", () => {
  const tasks = buildPullTasks(
    pairs,
    routes,
    "dataSet",
    new Map([[ELEMENT_A, SET], [ELEMENT_B, SET]]),
  );
  assertEquals(shape(tasks), [
    ["dataSet", SET, 202401, ["a", "a.coc", "b"]],
    ["dataSet", SET, 202402, ["a"]],
  ]);
  const without = buildPullTasks(
    pairs,
    routes,
    "dataSet",
    new Map([[ELEMENT_A, SET]]),
  );
  assertEquals(
    without.flatMap((t) => t.coveredPairs.map((c) => c.dataId)),
    ["a", "a.coc", "a"],
  );
});

Deno.test("a field the export states once for the set is folded onto every value that lacks it", () => {
  const bare = {
    dataElement: ELEMENT_A,
    period: undefined,
    orgUnit: undefined,
    categoryOptionCombo: COC,
    attributeOptionCombo: undefined,
    value: "3",
    lastUpdated: undefined,
    deleted: false,
  };
  const own: DHIS2DataValue = {
    ...bare,
    period: "202312",
    orgUnit: "Fac2",
    attributeOptionCombo: "AocBbbbbbb1",
  };
  const values = dataValuesWithSetDefaults({
    period: "202401",
    orgUnit: "Root0000001",
    attributeOptionCombo: "AocAaaaaaa1",
    dataValues: [bare, own],
  });
  assertEquals(values[0], {
    ...bare,
    period: "202401",
    orgUnit: "Root0000001",
    attributeOptionCombo: "AocAaaaaaa1",
  });
  assertEquals(values[1], own);
  assertEquals(dataValuesWithSetDefaults({ dataValues: [bare] }), [bare]);
  assertEquals(dataValuesWithSetDefaults({ dataValues: undefined }), []);
});

Deno.test("a data-set pull is reduced per element: each pair takes only its element's values", () => {
  const value = (
    dataElement: string,
    orgUnit: string,
    raw: string,
    coc = COC,
  ): DHIS2DataValue => ({
    dataElement,
    period: "202401",
    orgUnit,
    categoryOptionCombo: coc,
    attributeOptionCombo: "AocAaaaaaa1",
    value: raw,
    lastUpdated: undefined,
    deleted: false,
  });
  const covered: DvsCoveredPair[] = [
    { dataId: "a", dataElementId: ELEMENT_A, coc: undefined, periodId: 202401 },
    { dataId: "a.coc", dataElementId: ELEMENT_A, coc: COC, periodId: 202401 },
    { dataId: "b", dataElementId: ELEMENT_B, coc: undefined, periodId: 202401 },
  ];
  const values = [
    value(ELEMENT_A, "Fac1", "3"),
    value(ELEMENT_A, "Fac1", "4", "CocBbbbbbb1"),
    value(ELEMENT_B, "Fac1", "10"),
    value("ElemCccccc1", "Fac1", "100"),
    value(ELEMENT_A, "Fac2", "x"),
  ];
  const reductions = reduceDvsValues(
    values,
    covered,
    new Set(["Fac1", "Fac2"]),
  );
  const of = (c: DvsCoveredPair) => reductions.get(pairKey(c))!;
  assertEquals(of(covered[0]!).rows, [{ facilityId: "Fac1", count: 7 }]);
  assertEquals(of(covered[1]!).rows, [{ facilityId: "Fac1", count: 3 }]);
  assertEquals(of(covered[2]!).rows, [{ facilityId: "Fac1", count: 10 }]);
  assertEquals(of(covered[0]!).skippedValues, 1);
  assertEquals(of(covered[2]!).skippedValues, 0);
});

Deno.test("the monthly data set is the first monthly one, none without", () => {
  assertEquals(
    monthlyDataSetId([
      { id: "A", periodType: "Quarterly" },
      { id: "M1", periodType: "Monthly" },
      { id: "M2", periodType: "Monthly" },
    ]),
    "M1",
  );
  assertEquals(
    monthlyDataSetId([{ id: "Q", periodType: "Quarterly" }]),
    undefined,
  );
  assertEquals(monthlyDataSetId([]), undefined);
  assertEquals(
    monthlyDataSetId([{ id: "X", periodType: undefined }]),
    undefined,
  );
});

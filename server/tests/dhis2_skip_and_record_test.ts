// Pins skip-and-record for the DHIS2 import (the dataValueSets reduce in
// import_hmis_data_dhis2/dispatch.ts): a facility value that is not a
// non-negative integer is skipped, counted per pair with a capped sample,
// and the pair still integrates with the values that were accepted.
//
//   deno test -A --env-file server/tests/dhis2_skip_and_record_test.ts

import { assertEquals } from "@std/assert";
import {
  type DvsCoveredPair,
  pairKey,
  parseNonNegativeInteger,
  reduceDvsValues,
  SKIPPED_VALUES_SAMPLE_CAP,
} from "../worker_routines/import_hmis_data_dhis2/dispatch.ts";
import type { DHIS2DataValue } from "../dhis2/goal5_data_value_sets/mod.ts";

const ELEMENT = "AbCdEfGhIj1";
const COC_A = "CocAaaaaaa1";
const COC_B = "CocBbbbbbb1";
const PERIOD = 202401;

const barePair: DvsCoveredPair = {
  sourceId: ELEMENT,
  coc: undefined,
  periodId: PERIOD,
};
const operandPair: DvsCoveredPair = {
  sourceId: `${ELEMENT}.${COC_A}`,
  coc: COC_A,
  periodId: PERIOD,
};

function value(
  orgUnit: string,
  raw: string,
  coc = COC_A,
  deleted = false,
): DHIS2DataValue {
  return {
    dataElement: ELEMENT,
    period: String(PERIOD),
    orgUnit,
    categoryOptionCombo: coc,
    attributeOptionCombo: "AocAaaaaaa1",
    value: raw,
    deleted,
  };
}

const scope = new Set(["FacAaaaaaa1", "FacBbbbbbb1", "FacCcccccc1"]);

function rowsOf(
  reductions: ReturnType<typeof reduceDvsValues>,
  pair: DvsCoveredPair,
) {
  return reductions.get(pairKey(pair))!.rows.sort((a, b) =>
    a.facilityId.localeCompare(b.facilityId)
  );
}

Deno.test("parseNonNegativeInteger accepts integers, including NUMBER-typed '12.0'", () => {
  assertEquals(parseNonNegativeInteger("12"), 12);
  assertEquals(parseNonNegativeInteger(" 12 "), 12);
  assertEquals(parseNonNegativeInteger("12.0"), 12);
  assertEquals(parseNonNegativeInteger("0"), 0);
});

Deno.test("parseNonNegativeInteger refuses fractional, negative, blank and non-numeric", () => {
  assertEquals(parseNonNegativeInteger("12.5"), undefined);
  assertEquals(parseNonNegativeInteger("-3"), undefined);
  assertEquals(parseNonNegativeInteger("-0.5"), undefined);
  assertEquals(parseNonNegativeInteger(""), undefined);
  assertEquals(parseNonNegativeInteger("   "), undefined);
  assertEquals(parseNonNegativeInteger("abc"), undefined);
  assertEquals(parseNonNegativeInteger("NaN"), undefined);
  assertEquals(parseNonNegativeInteger("Infinity"), undefined);
});

Deno.test("a fractional and a negative value are skipped, counted and sampled; the pair integrates", () => {
  const reductions = reduceDvsValues(
    [
      value("FacAaaaaaa1", "10"),
      value("FacBbbbbbb1", "2.5"),
      value("FacCcccccc1", "-4"),
    ],
    [barePair],
    scope,
  );
  const reduction = reductions.get(pairKey(barePair))!;
  assertEquals(reduction.rows, [{ facilityId: "FacAaaaaaa1", count: 10 }]);
  assertEquals(reduction.skippedValues, 2);
  assertEquals(reduction.skippedValuesSample, [
    { facilityId: "FacBbbbbbb1", value: "2.5" },
    { facilityId: "FacCcccccc1", value: "-4" },
  ]);
});

Deno.test("accepted values sum per facility across COC×AOC and nothing truncates", () => {
  const reductions = reduceDvsValues(
    [
      value("FacAaaaaaa1", "3", COC_A),
      value("FacAaaaaaa1", "4", COC_B),
      value("FacAaaaaaa1", "0.5", COC_B),
    ],
    [barePair],
    scope,
  );
  const reduction = reductions.get(pairKey(barePair))!;
  assertEquals(reduction.rows, [{ facilityId: "FacAaaaaaa1", count: 7 }]);
  assertEquals(reduction.skippedValues, 1);
});

Deno.test("an operand takes only its COC: another COC's bad value is not its skip", () => {
  const reductions = reduceDvsValues(
    [
      value("FacAaaaaaa1", "5", COC_A),
      value("FacAaaaaaa1", "1.5", COC_B),
      value("FacBbbbbbb1", "2.5", COC_A),
    ],
    [barePair, operandPair],
    scope,
  );
  const bare = reductions.get(pairKey(barePair))!;
  const operand = reductions.get(pairKey(operandPair))!;
  assertEquals(rowsOf(reductions, barePair), [{ facilityId: "FacAaaaaaa1", count: 5 }]);
  assertEquals(bare.skippedValues, 2);
  assertEquals(rowsOf(reductions, operandPair), [{ facilityId: "FacAaaaaaa1", count: 5 }]);
  assertEquals(operand.skippedValues, 1);
  assertEquals(operand.skippedValuesSample, [
    { facilityId: "FacBbbbbbb1", value: "2.5" },
  ]);
});

Deno.test("deleted values and facilities outside the scope are ignored, not skipped", () => {
  const reductions = reduceDvsValues(
    [
      value("FacAaaaaaa1", "7"),
      value("FacAaaaaaa1", "2.5", COC_A, true),
      value("OutOfScope1", "2.5"),
    ],
    [barePair],
    scope,
  );
  const reduction = reductions.get(pairKey(barePair))!;
  assertEquals(reduction.rows, [{ facilityId: "FacAaaaaaa1", count: 7 }]);
  assertEquals(reduction.skippedValues, 0);
  assertEquals(reduction.skippedValuesSample, []);
});

Deno.test("the sample is capped while the count keeps growing", () => {
  const values = Array.from({ length: SKIPPED_VALUES_SAMPLE_CAP + 5 }, (_, i) =>
    value("FacAaaaaaa1", `${i}.5`)
  );
  const reductions = reduceDvsValues(values, [barePair], scope);
  const reduction = reductions.get(pairKey(barePair))!;
  assertEquals(reduction.rows, []);
  assertEquals(reduction.skippedValues, SKIPPED_VALUES_SAMPLE_CAP + 5);
  assertEquals(reduction.skippedValuesSample.length, SKIPPED_VALUES_SAMPLE_CAP);
});

Deno.test("a month with no values integrates every covered pair as empty", () => {
  const reductions = reduceDvsValues([], [barePair, operandPair], scope);
  assertEquals(reductions.size, 2);
  for (const reduction of reductions.values()) {
    assertEquals(reduction, { rows: [], skippedValues: 0, skippedValuesSample: [] });
  }
});

// Pins PLAN_A4 ruling 5 and PLAN_A5 ruling 3: an import selects indicators
// and the expansion to the data ids it fetches happens once, at validation
// (expandIndicatorSelection in lib), and is then persisted on the run row.
// A sum expands to its members' data ids, a derived through the resolver
// to the DHIS2 elements it reaches, Uploaded indicators and population
// terms are dropped and counted, and the worker and every later reader
// enumerate pairs from that stored list (enumerateRunPairs), never from the
// dictionary as it stands.
//
//   deno test -A --env-file server/tests/indicator_selection_expansion_test.ts

import { assertEquals } from "@std/assert";
import {
  type HmisIndicator,
  type Dhis2RunSelection,
  expandIndicatorSelection,
  POPULATION_TYPE_IDS,
} from "lib";
import { enumerateRunPairs } from "../db/instance/dataset_hmis_import_runs.ts";

const ANC1_ELEMENT = "AbCdEfGhIj1";
const ANC1_OPERAND = "AbCdEfGhIj1.CocAaaaaaa1";
const ANC4_ELEMENT = "KlMnOpQrSt2";

function element(id: string, dataId: string): HmisIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "dhis2_element", data_id: dataId },
    include_in_analysis: true,
    format_as: "number",
    thresholds: null,
    sort_order: 0,
  };
}

function uploaded(id: string, dataId: string): HmisIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "uploaded", data_id: dataId },
    include_in_analysis: true,
    format_as: "number",
    thresholds: null,
    sort_order: 0,
  };
}

function sum(id: string, members: string[]): HmisIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "sum", members },
    include_in_analysis: true,
    format_as: "number",
    thresholds: null,
    sort_order: 0,
  };
}

function derived(id: string, expression: string): HmisIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "derived", expression },
    include_in_analysis: true,
    format_as: "percent",
    thresholds: null,
    sort_order: 0,
  };
}

const DICTIONARY: HmisIndicator[] = [
  element("anc1_first", ANC1_ELEMENT),
  element("anc1_repeat", ANC1_OPERAND),
  sum("anc1", ["anc1_first", "anc1_repeat"]),
  element("anc4", ANC4_ELEMENT),
  // A UID-shaped file id is still Uploaded: the type carries the intent.
  uploaded("anc4_csv", "UvWxYzAbCd9"),
  sum("anc4_all", ["anc4", "anc4_csv"]),
  uploaded("opd", "u_opd"),
  derived("anc4_rate", "anc4 / anc1"),
  derived("anc1_coverage", "anc1 / population_pregnancies"),
  derived("anc_chain", "anc4_rate * anc1_coverage"),
];

Deno.test("expansion: a DHIS2 element is its data id", () => {
  const e = expandIndicatorSelection(["anc4"], DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(e.dataIds, [ANC4_ELEMENT]);
  assertEquals(e.populationTermsDropped, []);
  assertEquals(e.uploadedIndicatorsDropped, []);
  assertEquals(e.unknownIndicatorIds, []);
  assertEquals(e.unresolvable, []);
});

Deno.test("expansion: a sum expands to its members' data ids", () => {
  const e = expandIndicatorSelection(["anc1"], DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(e.dataIds, [ANC1_ELEMENT, ANC1_OPERAND]);
});

Deno.test("expansion: a derived flattens to the elements it reaches, through a sum, once each", () => {
  const e = expandIndicatorSelection(
    ["anc4_rate", "anc1_first"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.dataIds, [ANC4_ELEMENT, ANC1_ELEMENT, ANC1_OPERAND]);
});

Deno.test("expansion: a population term is dropped and listed", () => {
  const e = expandIndicatorSelection(
    ["anc1_coverage"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.dataIds, [ANC1_ELEMENT, ANC1_OPERAND]);
  assertEquals(e.populationTermsDropped, ["population_pregnancies"]);
});

Deno.test("expansion: an Uploaded indicator is dropped and counted, whatever its data id's shape", () => {
  const e = expandIndicatorSelection(["anc4_all", "opd"], DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(e.dataIds, [ANC4_ELEMENT]);
  assertEquals(e.uploadedIndicatorsDropped, ["anc4_csv", "opd"]);
});

Deno.test("expansion: a chain through derived indicators reaches every leaf", () => {
  const e = expandIndicatorSelection(["anc_chain"], DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(e.dataIds, [ANC4_ELEMENT, ANC1_ELEMENT, ANC1_OPERAND]);
  assertEquals(e.populationTermsDropped, ["population_pregnancies"]);
});

Deno.test("expansion: unknown ids are reported", () => {
  const e = expandIndicatorSelection(["nope"], DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(e.dataIds, []);
  assertEquals(e.unknownIndicatorIds, ["nope"]);
});

Deno.test("expansion: an unresolvable derived is reported, not thrown", () => {
  const e = expandIndicatorSelection(
    ["broken"],
    [...DICTIONARY, derived("broken", "anc1 / missing_indicator")],
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.dataIds, []);
  assertEquals(e.unresolvable.map((u) => u.id), ["broken"]);
});

Deno.test("queued run: pairs come from the persisted data ids, not the dictionary", () => {
  // The selection as validated and stored at enqueue time.
  const e = expandIndicatorSelection(["anc1"], DICTIONARY, POPULATION_TYPE_IDS);
  const stored: Dhis2RunSelection = {
    kind: "window",
    indicatorIds: ["anc1"],
    startPeriod: 202401,
    endPeriod: 202402,
    dataIds: e.dataIds,
    populationTermsDropped: e.populationTermsDropped,
    uploadedIndicatorsDropped: e.uploadedIndicatorsDropped,
  };
  // A member added to the sum after enqueue.
  const later = [
    ...DICTIONARY.filter((i) => i.indicator_common_id !== "anc1"),
    element("anc1_third", "UvWxYzAbCd3"),
    sum("anc1", ["anc1_first", "anc1_repeat", "anc1_third"]),
  ];
  assertEquals(
    expandIndicatorSelection(["anc1"], later, POPULATION_TYPE_IDS).dataIds.length,
    3,
  );
  const pairs = enumerateRunPairs(stored);
  assertEquals(pairs.length, 4);
  assertEquals(
    new Set(pairs.map((p) => p.dataId)),
    new Set([ANC1_ELEMENT, ANC1_OPERAND]),
  );
});

Deno.test("pairs selection: enumerated at pair grain, deduplicated", () => {
  const pairs = enumerateRunPairs({
    kind: "pairs",
    pairs: [
      { dataId: ANC1_ELEMENT, periodId: 202401 },
      { dataId: ANC1_ELEMENT, periodId: 202401 },
      { dataId: ANC4_ELEMENT, periodId: 202413 },
    ],
  });
  assertEquals(pairs, [{ dataId: ANC1_ELEMENT, periodId: 202401 }]);
});

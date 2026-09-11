// Pins PLAN_A3 ruling 7: an import selects indicators and the expansion to
// sources happens once, at validation (expandIndicatorSelectionToSources in
// lib), and is then persisted on the run row. The worker and every later
// reader enumerate pairs from that stored list (enumerateRunPairs), never
// from the dictionary as it stands, so a source added to a base after
// enqueue is not in a queued run.
//
//   deno test -A --env-file server/tests/indicator_selection_expansion_test.ts

import { assertEquals } from "@std/assert";
import {
  type Dhis2RunSelection,
  expandIndicatorSelectionToSources,
  type IndicatorWithSources,
  POPULATION_TYPE_IDS,
} from "lib";
import { enumerateRunPairs } from "../db/instance/dataset_hmis_import_runs.ts";

const ANC1_ELEMENT = "AbCdEfGhIj1";
const ANC1_OPERAND = "AbCdEfGhIj1.CocAaaaaaa1";
const ANC4_ELEMENT = "KlMnOpQrSt2";
const CSV_COLUMN = "anc4_csv_column";

function base(
  id: string,
  sourceIds: string[],
): IndicatorWithSources {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "base" },
    format_as: "number",
    thresholds: null,
    sort_order: 0,
    sources: sourceIds.map((source_id) => ({
      source_id,
      source_label: source_id,
    })),
  };
}

function derived(id: string, expression: string): IndicatorWithSources {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "derived", expression },
    format_as: "percent",
    thresholds: null,
    sort_order: 0,
    sources: [],
  };
}

const DICTIONARY: IndicatorWithSources[] = [
  base("anc1", [ANC1_ELEMENT, ANC1_OPERAND]),
  base("anc4", [ANC4_ELEMENT, CSV_COLUMN]),
  base("opd", []),
  derived("anc4_rate", "anc4 / anc1"),
  derived("anc1_coverage", "anc1 / population_pregnancies"),
  derived("anc_chain", "anc4_rate * anc1_coverage"),
];

Deno.test("expansion: a base contributes its DHIS2-shaped sources", () => {
  const e = expandIndicatorSelectionToSources(
    ["anc1"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, [ANC1_ELEMENT, ANC1_OPERAND]);
  assertEquals(e.populationTermsDropped, []);
  assertEquals(e.nonDhis2SourcesDropped, []);
  assertEquals(e.unknownIndicatorIds, []);
  assertEquals(e.unresolvable, []);
});

Deno.test("expansion: a derived flattens to its base ingredients' sources, once each", () => {
  const e = expandIndicatorSelectionToSources(
    ["anc4_rate", "anc1"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, [ANC4_ELEMENT, ANC1_ELEMENT, ANC1_OPERAND]);
});

Deno.test("expansion: a population term is dropped and listed", () => {
  const e = expandIndicatorSelectionToSources(
    ["anc1_coverage"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, [ANC1_ELEMENT, ANC1_OPERAND]);
  assertEquals(e.populationTermsDropped, ["population_pregnancies"]);
});

Deno.test("expansion: a source that is not DHIS2-shaped is dropped and listed", () => {
  const e = expandIndicatorSelectionToSources(
    ["anc4"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, [ANC4_ELEMENT]);
  assertEquals(e.nonDhis2SourcesDropped, [CSV_COLUMN]);
});

Deno.test("expansion: a chain through derived indicators reaches every leaf", () => {
  const e = expandIndicatorSelectionToSources(
    ["anc_chain"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, [ANC4_ELEMENT, ANC1_ELEMENT, ANC1_OPERAND]);
  assertEquals(e.populationTermsDropped, ["population_pregnancies"]);
  assertEquals(e.nonDhis2SourcesDropped, [CSV_COLUMN]);
});

Deno.test("expansion: a base without sources contributes nothing; unknown ids are reported", () => {
  const e = expandIndicatorSelectionToSources(
    ["opd", "nope"],
    DICTIONARY,
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, []);
  assertEquals(e.unknownIndicatorIds, ["nope"]);
});

Deno.test("expansion: an unresolvable derived is reported, not thrown", () => {
  const e = expandIndicatorSelectionToSources(
    ["broken"],
    [...DICTIONARY, derived("broken", "anc1 / missing_indicator")],
    POPULATION_TYPE_IDS,
  );
  assertEquals(e.sourceIds, []);
  assertEquals(e.unresolvable.map((u) => u.id), ["broken"]);
});

Deno.test("queued run: pairs come from the persisted sourceIds, not the dictionary", () => {
  // The selection as validated and stored at enqueue time.
  const stored: Dhis2RunSelection = {
    kind: "window",
    indicatorIds: ["anc1"],
    startPeriod: 202401,
    endPeriod: 202402,
    ...(() => {
      const e = expandIndicatorSelectionToSources(
        ["anc1"],
        DICTIONARY,
        POPULATION_TYPE_IDS,
      );
      return {
        sourceIds: e.sourceIds,
        populationTermsDropped: e.populationTermsDropped,
        nonDhis2SourcesDropped: e.nonDhis2SourcesDropped,
      };
    })(),
  };
  // A source added to anc1 after enqueue.
  const later = [
    base("anc1", [ANC1_ELEMENT, ANC1_OPERAND, "UvWxYzAbCd3"]),
    ...DICTIONARY.slice(1),
  ];
  assertEquals(
    expandIndicatorSelectionToSources(["anc1"], later, POPULATION_TYPE_IDS)
      .sourceIds.length,
    3,
  );
  const pairs = enumerateRunPairs(stored);
  assertEquals(pairs.length, 4);
  assertEquals(
    new Set(pairs.map((p) => p.sourceId)),
    new Set([ANC1_ELEMENT, ANC1_OPERAND]),
  );
});

Deno.test("pairs selection: enumerated at source grain, deduplicated", () => {
  const pairs = enumerateRunPairs({
    kind: "pairs",
    pairs: [
      { sourceId: ANC1_ELEMENT, periodId: 202401 },
      { sourceId: ANC1_ELEMENT, periodId: 202401 },
      { sourceId: ANC4_ELEMENT, periodId: 202413 },
    ],
  });
  assertEquals(pairs, [{ sourceId: ANC1_ELEMENT, periodId: 202401 }]);
});

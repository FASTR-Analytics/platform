// Pins PLAN_A4 ruling 3, the analysed set (analysedIndicatorIds in lib): a
// count (Uploaded, DHIS2 element or Sum) is analysed when its checkbox is
// on, or it is a special, or a calculated with its checkbox on reaches it
// through the resolver; sum membership alone puts nothing in the extract; a
// calculated with its checkbox off is left out of the catalog. And PLAN_A5
// ruling 10's shape: the catalog row carries the stored type, and "with
// data" is judged by data id.
//
//   deno test -A --env-file server/tests/indicator_analysed_set_test.ts

import { assertEquals } from "@std/assert";
import {
  analysedIdsWithData,
  analysedIndicatorIds,
  type HmisIndicator,
  POPULATION_TYPE_IDS,
  resolveHmisIndicatorCatalog,
} from "lib";

function indicator(
  id: string,
  definition: HmisIndicator["definition"],
  includeInAnalysis: boolean,
): HmisIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition,
    include_in_analysis: includeInAnalysis,
    format_as: definition.type === "calculated" ? "percent" : "number",
    thresholds: null,
    direction: "higher-is-better",
    target: null,
    expected_low_counts: false,
    sort_order: 0,
  };
}

const DICTIONARY: HmisIndicator[] = [
  indicator("on_element", { type: "dhis2_element", data_id: "AbCdEfGhIj1" }, true),
  indicator("off_element", { type: "dhis2_element", data_id: "KlMnOpQrSt2" }, false),
  indicator("penta1", { type: "uploaded", data_id: "penta1_file" }, false),
  indicator("member_a", { type: "dhis2_element", data_id: "UvWxYzAbCd3" }, false),
  indicator("member_b", { type: "uploaded", data_id: "file_b" }, false),
  indicator("on_sum", { type: "sum", members: ["member_a", "member_b"] }, true),
  indicator("off_sum", { type: "sum", members: ["member_a"] }, false),
  indicator("reached_uploaded", { type: "uploaded", data_id: "file_reached" }, false),
  indicator("reached_sum", { type: "sum", members: ["member_b"] }, false),
  indicator("on_calculated", { type: "calculated", expression: "reached_uploaded / reached_sum" }, true),
  indicator("off_calculated", { type: "calculated", expression: "off_element / 2" }, false),
  indicator("chain_link", { type: "calculated", expression: "penta1 + off_sum" }, false),
  indicator("on_chain", { type: "calculated", expression: "chain_link / population_u5" }, true),
];

Deno.test("analysed: on, special, reached by a checked calculated (through a chain); not by a sum alone", () => {
  const analysed = analysedIndicatorIds(DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(
    [...analysed].toSorted(),
    [
      "on_element",
      "on_sum",
      "off_sum",
      "penta1",
      "reached_uploaded",
      "reached_sum",
    ].toSorted(),
  );
  // Members of analysed sums are not analysed themselves.
  assertEquals(analysed.has("member_a"), false);
  assertEquals(analysed.has("member_b"), false);
  // A calculated with its checkbox off reaches nothing.
  assertEquals(analysed.has("off_element"), false);
});

Deno.test("with data: by the rows under the data id, a sum by any member's data id", () => {
  const analysed = analysedIndicatorIds(DICTIONARY, POPULATION_TYPE_IDS);
  const withData = analysedIdsWithData(
    DICTIONARY,
    analysed,
    new Set(["AbCdEfGhIj1", "file_b", "KlMnOpQrSt2"]),
  );
  assertEquals([...withData].toSorted(), ["on_element", "on_sum", "reached_sum"]);
  // An indicator id in the set is not a data id: penta1 has no data id and
  // reached_uploaded's rows are keyed file_reached.
  assertEquals(
    analysedIdsWithData(DICTIONARY, analysed, new Set(["penta1", "reached_uploaded"])).size,
    0,
  );
});

Deno.test("catalog: analysed counts under their stored type, checked calculated only", () => {
  const analysed = analysedIndicatorIds(DICTIONARY, POPULATION_TYPE_IDS);
  const withData = analysedIdsWithData(
    DICTIONARY,
    analysed,
    new Set(["AbCdEfGhIj1", "UvWxYzAbCd3", "file_b", "file_reached", "penta1_file"]),
  );
  const catalog = resolveHmisIndicatorCatalog(
    DICTIONARY,
    withData,
    POPULATION_TYPE_IDS,
  );
  assertEquals(
    catalog.map((r) => [r.indicator_common_id, r.type]),
    [
      ["on_element", "dhis2_element"],
      ["penta1", "uploaded"],
      ["on_sum", "sum"],
      ["off_sum", "sum"],
      ["reached_uploaded", "uploaded"],
      ["reached_sum", "sum"],
      ["on_calculated", "calculated"],
      ["on_chain", "calculated"],
    ],
  );
  // off_sum's members have rows, so it carries its one slot.
  const offSum = catalog.find((r) => r.indicator_common_id === "off_sum")!;
  assertEquals(offSum.expression, "off_sum");
  assertEquals(offSum.slot_map, { off_sum: "ing1" });
  const sum = catalog.find((r) => r.indicator_common_id === "on_sum")!;
  assertEquals(sum.expression, "on_sum");
  assertEquals(sum.slot_map, { on_sum: "ing1" });
  const chain = catalog.find((r) => r.indicator_common_id === "on_chain")!;
  assertEquals(chain.expression, "((penta1 + off_sum) / population_u5)");
  assertEquals(chain.slot_map, { penta1: "ing1", off_sum: "ing2", population_u5: "ing3" });
});

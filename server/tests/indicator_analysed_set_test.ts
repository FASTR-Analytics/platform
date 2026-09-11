// Pins PLAN_A4 ruling 3, the analysed set (analysedIndicatorIds in lib): a
// base or sum is analysed when its checkbox is on, or it is a special, or a
// derived with its checkbox on reaches it through the resolver; sum
// membership alone puts nothing in the extract; a derived with its checkbox
// off is left out of the catalog. And ruling 4's shape: a sum is a `base`
// row in the catalog.
//
//   deno test -A --env-file server/tests/indicator_analysed_set_test.ts

import { assertEquals } from "@std/assert";
import {
  analysedIdsWithData,
  analysedIndicatorIds,
  type CommonIndicator,
  POPULATION_TYPE_IDS,
  resolveCommonIndicatorCatalog,
} from "lib";

function indicator(
  id: string,
  definition: CommonIndicator["definition"],
  includeInAnalysis: boolean,
): CommonIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition,
    include_in_analysis: includeInAnalysis,
    format_as: definition.type === "derived" ? "percent" : "number",
    thresholds: null,
    sort_order: 0,
  };
}

const DICTIONARY: CommonIndicator[] = [
  indicator("on_base", { type: "base", dhis2_id: "AbCdEfGhIj1" }, true),
  indicator("off_base", { type: "base", dhis2_id: "KlMnOpQrSt2" }, false),
  indicator("penta1", { type: "base", dhis2_id: null }, false),
  indicator("member_a", { type: "base", dhis2_id: "UvWxYzAbCd3" }, false),
  indicator("member_b", { type: "base", dhis2_id: null }, false),
  indicator("on_sum", { type: "sum", members: ["member_a", "member_b"] }, true),
  indicator("off_sum", { type: "sum", members: ["member_a"] }, false),
  indicator("reached_base", { type: "base", dhis2_id: null }, false),
  indicator("reached_sum", { type: "sum", members: ["member_b"] }, false),
  indicator("on_derived", { type: "derived", expression: "reached_base / reached_sum" }, true),
  indicator("off_derived", { type: "derived", expression: "off_base / 2" }, false),
  indicator("chain_link", { type: "derived", expression: "penta1 + off_sum" }, false),
  indicator("on_chain", { type: "derived", expression: "chain_link / population_u5" }, true),
];

Deno.test("analysed: on, special, reached by a checked derived (through a chain); not by a sum alone", () => {
  const analysed = analysedIndicatorIds(DICTIONARY, POPULATION_TYPE_IDS);
  assertEquals(
    [...analysed].toSorted(),
    [
      "on_base",
      "on_sum",
      "off_sum",
      "penta1",
      "reached_base",
      "reached_sum",
    ].toSorted(),
  );
  // Members of analysed sums are not analysed themselves.
  assertEquals(analysed.has("member_a"), false);
  assertEquals(analysed.has("member_b"), false);
  // A derived with its checkbox off reaches nothing.
  assertEquals(analysed.has("off_base"), false);
});

Deno.test("with data: a base by its own rows, a sum by any member's rows", () => {
  const analysed = analysedIndicatorIds(DICTIONARY, POPULATION_TYPE_IDS);
  const withData = analysedIdsWithData(
    DICTIONARY,
    analysed,
    new Set(["on_base", "member_b", "off_base"]),
  );
  assertEquals([...withData].toSorted(), ["on_base", "on_sum", "reached_sum"]);
});

Deno.test("catalog: analysed bases and sums as base rows, checked derived only", () => {
  const analysed = analysedIndicatorIds(DICTIONARY, POPULATION_TYPE_IDS);
  const withData = analysedIdsWithData(
    DICTIONARY,
    analysed,
    new Set(["on_base", "member_a", "member_b", "reached_base", "penta1"]),
  );
  const catalog = resolveCommonIndicatorCatalog(
    DICTIONARY,
    withData,
    POPULATION_TYPE_IDS,
  );
  assertEquals(
    catalog.map((r) => [r.indicator_common_id, r.type]),
    [
      ["on_base", "base"],
      ["penta1", "base"],
      ["on_sum", "base"],
      ["off_sum", "base"],
      ["reached_base", "base"],
      ["reached_sum", "base"],
      ["on_derived", "derived"],
      ["on_chain", "derived"],
    ],
  );
  const sum = catalog.find((r) => r.indicator_common_id === "on_sum")!;
  assertEquals(sum.expression, "on_sum");
  assertEquals(sum.slot_map, { on_sum: "ing1" });
  const chain = catalog.find((r) => r.indicator_common_id === "on_chain")!;
  assertEquals(chain.expression, "((penta1 + off_sum) / population_u5)");
  assertEquals(chain.slot_map, { penta1: "ing1", off_sum: "ing2", population_u5: "ing3" });
});

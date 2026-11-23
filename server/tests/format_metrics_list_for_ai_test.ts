// Pins what get_available_metrics writes of the lists whose length follows
// the package's data: the HFA indicators and each variant group's members
// are written whole up to the inline cap and as a count over it, each HFA
// category and sub-category states how many indicators it holds, the ICEH
// stratifiers are written once, and no ICEH indicator is written.
//
//   deno test -A --no-check server/tests/format_metrics_list_for_ai_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { AnyAITool } from "@timroberton/panther";
import {
  AI_INLINE_LIST_MAX,
  EMPTY_HFA_TAXONOMY,
  formatMetricsListForAI,
  getSharedToolsForMetrics,
  type HfaTaxonomyForAI,
  type MetricWithStatus,
} from "lib";

function metric(id: string, disOpts: string[]): MetricWithStatus {
  return {
    id,
    resultsObjectId: `ro_${id}`,
    valueProps: ["value"],
    valueFunc: "SUM",
    label: `Metric ${id}`,
    formatAs: "percent",
    disaggregationOptions: disOpts.map((value) => ({
      value,
      isRequired: false,
    })),
    status: "ready",
    moduleId: "m_test",
  } as unknown as MetricWithStatus;
}

type HfaIndicatorForAI = HfaTaxonomyForAI["indicators"][number];

function hfaIndicators(
  n: number,
  fields: Partial<HfaIndicatorForAI> = {},
): HfaIndicatorForAI[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `hfa_${i}`,
    label: `HFA indicator ${i}`,
    measure: "% of facilities",
    categoryId: "cat_a",
    subCategoryId: "sub_a1",
    serviceCategoryIds: [],
    variantGroupId: null,
    ...fields,
  }));
}

function taxonomy(indicators: HfaIndicatorForAI[]): HfaTaxonomyForAI {
  return {
    ...structuredClone(EMPTY_HFA_TAXONOMY),
    categories: [
      { id: "cat_a", label: "Category A" },
      { id: "cat_b", label: "Category B" },
    ],
    subCategories: [
      { id: "sub_a1", categoryId: "cat_a", label: "Sub A1" },
      { id: "sub_a2", categoryId: "cat_a", label: "Sub A2" },
    ],
    variantGroups: [{ id: "grp", label: "Group" }],
    variantItems: [{ id: "item_1", groupId: "grp", label: "Item 1" }],
    indicators,
  };
}

const HFA_METRIC = metric("m_hfa", ["hfa_indicator", "time_point"]);

function hfaListing(indicators: HfaIndicatorForAI[]): string {
  return formatMetricsListForAI([HFA_METRIC], [], taxonomy(indicators));
}

Deno.test("an HFA taxonomy at the inline cap lists every indicator", () => {
  const text = hfaListing(hfaIndicators(AI_INLINE_LIST_MAX));
  assertStringIncludes(
    text,
    "Indicators (hfa_indicator values), grouped by category › sub-category:",
  );
  for (let i = 0; i < AI_INLINE_LIST_MAX; i++) {
    assertStringIncludes(
      text,
      `      - hfa_${i}: HFA indicator ${i} [% of facilities]\n`,
    );
  }
});

Deno.test("an HFA taxonomy over the inline cap writes the count, names the lookup and writes no indicator line", () => {
  const n = AI_INLINE_LIST_MAX + 1;
  const text = hfaListing(hfaIndicators(n));
  assertStringIncludes(
    text,
    `Indicators (hfa_indicator values): ${n}, more than ${AI_INLINE_LIST_MAX}, too many to list here. get_dimension_values with disOpt "hfa_indicator" and the id of an HFA metric below lists them, each with its measure, category, sub-category, service categories and variant group, and its search finds them by name or by a category or variant group id.`,
  );
  assert(!text.includes("hfa_0"));
  assert(!text.includes("grouped by category › sub-category"));
  assertStringIncludes(text, "m_hfa: Metric m_hfa [percent]");
});

Deno.test("each HFA category and sub-category line states how many indicators it holds", () => {
  const text = hfaListing([
    ...hfaIndicators(3),
    ...hfaIndicators(1, { id: "hfa_x", subCategoryId: "sub_a2" }),
    ...hfaIndicators(2, {
      id: "hfa_none",
      categoryId: null,
      subCategoryId: null,
    }),
  ]);
  assertStringIncludes(
    text,
    "Categories (id: label (how many of all 6 indicators it holds)) with their sub-categories:\n" +
      "  - cat_a: Category A (4 indicators)\n" +
      "      - sub_a1: Sub A1 (3 indicators)\n" +
      "      - sub_a2: Sub A2 (1 indicator)\n" +
      "  - cat_b: Category B (0 indicators)\n" +
      "  - no category (2 indicators)\n",
  );
});

Deno.test("a variant group's members are listed up to the inline cap and counted over it", () => {
  const whole = hfaListing(
    hfaIndicators(AI_INLINE_LIST_MAX, { variantGroupId: "grp" }),
  );
  assertStringIncludes(
    whole,
    `      [indicators in this group: ${
      Array.from({ length: AI_INLINE_LIST_MAX }, (_, i) => `hfa_${i}`).join(
        ", ",
      )
    }]`,
  );
  const n = AI_INLINE_LIST_MAX + 1;
  const counted = hfaListing(hfaIndicators(n, { variantGroupId: "grp" }));
  assertStringIncludes(
    counted,
    `      [${n} indicators in this group, more than ${AI_INLINE_LIST_MAX}, too many to list here: get_dimension_values on the by-variant metric with disOpt "hfa_indicator" and search ["variant group grp"] lists them]`,
  );
  assert(!counted.includes("indicators in this group:"));
});

const ICEH_METRICS = [
  metric("m_iceh_1", ["iceh_indicator", "strat"]),
  metric("m_iceh_2", ["iceh_indicator", "strat"]),
];

Deno.test("the ICEH stratifier table is written once, before the modules, for two ICEH metrics", () => {
  const text = formatMetricsListForAI(
    ICEH_METRICS,
    [],
    structuredClone(EMPTY_HFA_TAXONOMY),
  );
  assertEquals(text.split("ICEH STRATIFIERS").length, 2);
  assertEquals(text.split("  - national: National").length, 2);
  assert(text.indexOf("ICEH STRATIFIERS") < text.indexOf("MODULE m_test"));
  assert(!text.includes("strat column values"));
});

Deno.test("no stratifier table is written without a ready ICEH metric", () => {
  const text = formatMetricsListForAI(
    [HFA_METRIC],
    [],
    structuredClone(EMPTY_HFA_TAXONOMY),
  );
  assert(!text.includes("ICEH STRATIFIERS"));
});

Deno.test("get_available_metrics writes no ICEH indicator, though the lookup is given them", async () => {
  const [listTool]: AnyAITool[] = getSharedToolsForMetrics(
    {
      getItems: () => Promise.reject(new Error("not read")),
      getResultsValueInfo: () => Promise.reject(new Error("not read")),
    },
    ICEH_METRICS,
    [],
    [],
    [{ id: "iceh_anc4", label: "ANC4 coverage", category: "Maternal" }],
    structuredClone(EMPTY_HFA_TAXONOMY),
  );
  assertEquals(listTool.sdkTool.name, "get_available_metrics");
  const text = await listTool.sdkTool.run({});
  assert(typeof text === "string");
  assert(!text.includes("iceh_anc4"));
  assert(!text.includes("ANC4 coverage"));
  assertStringIncludes(text, "ICEH STRATIFIERS");
});

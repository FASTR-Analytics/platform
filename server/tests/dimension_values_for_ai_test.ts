// Pins what get_dimension_values writes: every dimension of a metric with its
// count and, up to the inline cap, its values; one named dimension in pages;
// a search over each value's line as written, facts included; an indicator's
// value with its facts; and each refusal.
//
//   deno test -A --no-check server/tests/dimension_values_for_ai_test.ts

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { AIToolFailure } from "@timroberton/panther";
import {
  getDimensionValuesForAI,
  type IndicatorFactsForAI,
} from "../../lib/ai_tools/format_dimension_values_for_ai.ts";
import {
  AI_INLINE_LIST_MAX,
  AI_VALUE_PAGE_MAX,
} from "../../lib/ai_tools/read_bounds.ts";
import type { AIToolEnv } from "../../lib/ai_tools/env.ts";
import type {
  AiDimensionValuesQuery,
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
  MetricWithStatus,
} from "../../lib/types/mod.ts";

type Dimensions = Partial<
  Record<DisaggregationOption, DisaggregationPossibleValuesStatus>
>;

function metricWith(dimensions: Dimensions): MetricWithStatus {
  return {
    id: "m_test",
    resultsObjectId: "ro_test",
    valueProps: ["value"],
    valueFunc: "SUM",
    label: "Test metric",
    formatAs: "number",
    disaggregationOptions: Object.keys(dimensions).map((value) => ({
      value,
      isRequired: false,
    })),
    status: "ready",
    moduleId: "m001",
  } as unknown as MetricWithStatus;
}

function envWith(dimensions: Dimensions): AIToolEnv {
  return {
    getItems: () => Promise.resolve({ success: false, err: "not needed" }),
    getResultsValueInfo: (metricId) =>
      Promise.resolve({
        success: true,
        data: {
          resultsObjectId: "ro_test",
          metricId,
          runId: "run_test",
          scopeToken: "all-data",
          periodBounds: { min: 202301, max: 202312 },
          disaggregationPossibleValues: dimensions,
          indicatorFormats: {},
          indicatorRules: {},
        },
      }),
  };
}

const NO_FACTS: IndicatorFactsForAI = {
  hmisIndicators: [],
  icehIndicators: [],
  hfaIndicators: [],
};

function ok(values: { id: string; label: string }[]) {
  return { status: "ok" as const, values };
}

function areas(n: number): { id: string; label: string }[] {
  return Array.from(
    { length: n },
    (_, i) => ({ id: `area_${i}`, label: `Area ${i}` }),
  );
}

async function lookup(
  dimensions: Dimensions,
  query: Omit<AiDimensionValuesQuery, "metricId">,
  facts: IndicatorFactsForAI = NO_FACTS,
): Promise<string> {
  return await getDimensionValuesForAI(
    envWith(dimensions),
    [metricWith(dimensions)],
    facts,
    { metricId: "m_test", ...query },
  );
}

// The text after a dimension's heading line, up to the next blank line.
function section(text: string, disOpt: string): string[] {
  const start = text.split("\n").findIndex((l) =>
    l.startsWith(`**${disOpt}**`)
  );
  assert(start >= 0, `no section for ${disOpt}`);
  const lines = text.split("\n").slice(start);
  const end = lines.indexOf("");
  return end < 0 ? lines : lines.slice(0, end);
}

Deno.test("the text opens with the metric and its period coverage", async () => {
  const text = await lookup({ admin_area_2: ok(areas(2)) }, {});
  assert(
    text.startsWith(
      "# DIMENSION VALUES\n\n**Metric ID (metricId):** m_test\n**Metric Label:** Test metric\n**Period coverage (all data for this metric):** period_id 202301 to 202312\n",
    ),
    text,
  );
});

Deno.test("every dimension is written with its count", async () => {
  const text = await lookup({
    admin_area_2: ok(areas(3)),
    year: ok([{ id: "2023", label: "2023" }, { id: "2024", label: "2024" }]),
  }, {});
  assertEquals(section(text, "admin_area_2"), [
    "**admin_area_2** (3 values):",
    "area_0 (Area 0), area_1 (Area 1), area_2 (Area 2)",
  ]);
  assertEquals(section(text, "year"), ["**year** (2 values):", "2023, 2024"]);
});

Deno.test("a dimension at the inline cap is written whole, one over it as its count", async () => {
  const text = await lookup({
    admin_area_2: ok(areas(AI_INLINE_LIST_MAX)),
    admin_area_3: ok(areas(AI_INLINE_LIST_MAX + 1)),
  }, {});
  const [heading, values] = section(text, "admin_area_2");
  assertEquals(heading, `**admin_area_2** (100 values):`);
  assertEquals(values.split(", ").length, AI_INLINE_LIST_MAX);
  assertEquals(section(text, "admin_area_3"), [
    `**admin_area_3** (101 values): more than ${AI_INLINE_LIST_MAX} to write here; pass disOpt "admin_area_3" to list them, with search to find some.`,
  ]);
  assert(!section(text, "admin_area_3")[0].includes("area_0"));
});

Deno.test("a named dimension of exactly a page is written in one page", async () => {
  const text = await lookup(
    { admin_area_3: ok(areas(AI_VALUE_PAGE_MAX)) },
    { disOpt: "admin_area_3" },
  );
  const [heading, summary, values] = section(text, "admin_area_3");
  assertEquals(heading, `**admin_area_3** (${AI_VALUE_PAGE_MAX} values):`);
  assertEquals(summary, `Written: values 1 to 500 of 500.`);
  assertEquals(values.split(", ").length, AI_VALUE_PAGE_MAX);
});

Deno.test("a longer named dimension is written page by page from the offset each page names", async () => {
  const dims = { admin_area_3: ok(areas(AI_VALUE_PAGE_MAX + 20)) };
  const first = section(
    await lookup(dims, { disOpt: "admin_area_3" }),
    "admin_area_3",
  );
  assertEquals(
    first[1],
    "Written: values 1 to 500 of 520. The next page is offset 500.",
  );
  assert(first[2].startsWith("area_0 (Area 0), "));
  assert(first[2].endsWith(", area_499 (Area 499)"));

  const second = section(
    await lookup(dims, { disOpt: "admin_area_3", offset: 500 }),
    "admin_area_3",
  );
  assertEquals(second[1], "Written: values 501 to 520 of 520.");
  assertEquals(second[2].split(", ").length, 20);
  assert(second[2].startsWith("area_500 (Area 500), "));
});

Deno.test("a search narrows the values before they are paged, with both counts", async () => {
  const dims = {
    admin_area_3: ok([
      ...areas(AI_VALUE_PAGE_MAX + 20),
      { id: "kn", label: "Kano North" },
      { id: "ks", label: "Kano South" },
    ]),
  };
  const text = await lookup(dims, {
    disOpt: "admin_area_3",
    search: ["kano"],
  });
  assertEquals(section(text, "admin_area_3"), [
    `**admin_area_3** (522 values; 2 match "kano"):`,
    "Written: matching values 1 to 2 of 2.",
    "kn (Kano North), ks (Kano South)",
  ]);
});

Deno.test("a search with no match writes the counts and no values", async () => {
  const text = await lookup(
    { admin_area_3: ok(areas(10)) },
    { disOpt: "admin_area_3", search: ["kano"] },
  );
  assertEquals(section(text, "admin_area_3"), [
    `**admin_area_3** (10 values; 0 match "kano")`,
  ]);
});

Deno.test("a search without disOpt states each dimension's match count", async () => {
  const text = await lookup({
    admin_area_2: ok([
      { id: "kn", label: "Kano North" },
      { id: "lg", label: "Lagos" },
    ]),
    admin_area_3: ok([
      ...areas(AI_INLINE_LIST_MAX * 2),
      { id: "kn_1", label: "Kano Municipal" },
    ]),
    year: ok([{ id: "2023", label: "2023" }]),
  }, { search: ["kano", "lagos"] });
  assertEquals(section(text, "admin_area_2"), [
    `**admin_area_2** (2 values; 2 match "kano" or "lagos"):`,
    "kn (Kano North), lg (Lagos)",
  ]);
  assertEquals(section(text, "admin_area_3"), [
    `**admin_area_3** (201 values; 1 match "kano" or "lagos"):`,
    "kn_1 (Kano Municipal)",
  ]);
  assertEquals(section(text, "year"), [
    `**year** (1 value; 0 match "kano" or "lagos")`,
  ]);
});

Deno.test("without disOpt, more matches than the inline cap write the first ones and point at disOpt", async () => {
  const text = await lookup(
    { admin_area_3: ok(areas(AI_INLINE_LIST_MAX * 2)) },
    { search: ["area"] },
  );
  const [heading, values] = section(text, "admin_area_3");
  assertEquals(
    heading,
    `**admin_area_3** (200 values; 200 match "area"); the first 100 are written, and disOpt "admin_area_3" with the same search lists them all:`,
  );
  assertEquals(values.split(", ").length, AI_INLINE_LIST_MAX);
});

const FACTS: IndicatorFactsForAI = {
  hmisIndicators: [
    {
      id: "anc1",
      label: "ANC 1st visit (dictionary label)",
      format_as: "percent",
      direction: "higher-is-better",
      target: 0.9,
    },
    {
      id: "anc_rate",
      label: "ANC rate",
      format_as: "rate_per_10k",
      expression: "anc1 / pop_wra",
    },
  ],
  hfaIndicators: [{
    id: "wat_01",
    label: "Improved water",
    measure: "% of facilities",
    categoryId: "infra",
    subCategoryId: "water",
    serviceCategoryIds: ["hosp", "phc"],
    variantGroupId: null,
  }],
  icehIndicators: [{
    id: "sba",
    label: "Skilled birth attendance",
    category: "Maternal health",
  }],
};

const INDICATOR_DIMENSIONS: Dimensions = {
  indicator_common_id: ok([
    { id: "anc1", label: "ANC 1st visit" },
    { id: "anc_rate", label: "ANC rate" },
    { id: "opd", label: "Outpatient visits" },
  ]),
  hfa_indicator: ok([{ id: "wat_01", label: "Improved water" }]),
  iceh_indicator: ok([{ id: "sba", label: "Skilled birth attendance" }]),
};

Deno.test("an HMIS, an HFA and an ICEH indicator are each written with their facts", async () => {
  const text = await lookup(INDICATOR_DIMENSIONS, {}, FACTS);
  assertEquals(section(text, "indicator_common_id"), [
    "**indicator_common_id** (3 values), each line id: label [format; direction; thresholds in display units; target] = formula over counts and population types (computed indicators only):",
    "- anc1: ANC 1st visit [percent; higher is better; target 90%]",
    "- anc_rate: ANC rate [rate_per_10k] = anc1 / pop_wra",
    "- opd: Outpatient visits",
  ]);
  assertEquals(section(text, "hfa_indicator"), [
    "**hfa_indicator** (1 value), each line id: label [measure; category; sub-category; service categories]:",
    "- wat_01: Improved water [% of facilities; category infra; sub-category water; service categories hosp, phc]",
  ]);
  assertEquals(section(text, "iceh_indicator"), [
    "**iceh_indicator** (1 value), each line id: label [category]:",
    "- sba: Skilled birth attendance [category Maternal health]",
  ]);
});

Deno.test("a value of a dimension with no facts is written id (label), or id alone", async () => {
  const text = await lookup({
    facility_type: ok([
      { id: "hosp", label: "Hospital" },
      { id: "chc", label: "chc" },
      { id: "mchp", label: "" },
    ]),
  }, {});
  assertEquals(section(text, "facility_type"), [
    "**facility_type** (3 values):",
    "hosp (Hospital), chc, mchp",
  ]);
});

Deno.test("matching ignores case and accents and reads the facts", async () => {
  const accented = await lookup(
    { admin_area_2: ok([{ id: "sl_ke", label: "Kénéma" }, ...areas(3)]) },
    { search: ["KENEMA"] },
  );
  assertEquals(section(accented, "admin_area_2"), [
    `**admin_area_2** (4 values; 1 match "KENEMA"):`,
    "sl_ke (Kénéma)",
  ]);
  const byFact = await lookup(
    INDICATOR_DIMENSIONS,
    { disOpt: "indicator_common_id", search: ["pop_wra"] },
    FACTS,
  );
  assertEquals(section(byFact, "indicator_common_id").slice(1), [
    "Written: matching values 1 to 1 of 1.",
    "- anc_rate: ANC rate [rate_per_10k] = anc1 / pop_wra",
  ]);
  const byCategory = await lookup(
    INDICATOR_DIMENSIONS,
    { disOpt: "iceh_indicator", search: ["maternal"] },
    FACTS,
  );
  assertStringIncludes(byCategory, `(1 value; 1 match "maternal")`);
});

Deno.test("a dimension with no values and one that failed are written as that", async () => {
  const text = await lookup({
    hfa_variant_item: { status: "no_values_available" },
    facility_type: { status: "error", message: "column missing" },
  }, {});
  assertEquals(section(text, "hfa_variant_item"), [
    "**hfa_variant_item**: no values available.",
  ]);
  assertEquals(section(text, "facility_type"), [
    "**facility_type**: its values could not be read: column missing",
  ]);
  const named = await lookup(
    { facility_type: { status: "error", message: "column missing" } },
    { disOpt: "facility_type" },
  );
  assertEquals(section(named, "facility_type"), [
    "**facility_type**: its values could not be read: column missing",
  ]);
});

async function refusal(
  run: () => Promise<string>,
  message: string,
): Promise<void> {
  const error = await assertRejects(run, AIToolFailure);
  assertEquals(error.message, message);
}

Deno.test("a metric the package does not hold is refused", async () => {
  const dims = { admin_area_2: ok(areas(2)) };
  await refusal(
    () =>
      getDimensionValuesForAI(envWith(dims), [metricWith(dims)], NO_FACTS, {
        metricId: "m_other",
      }),
    `Metric "m_other" is not in this results package. get_available_metrics lists its metrics.`,
  );
  const unavailable = {
    ...metricWith(dims),
    status: "unavailable",
    statusReason: "Its module did not run",
  } as MetricWithStatus;
  await refusal(
    () =>
      getDimensionValuesForAI(envWith(dims), [unavailable], NO_FACTS, {
        metricId: "m_test",
      }),
    `Metric "m_test" has no data in this results package: Its module did not run`,
  );
});

Deno.test("a dimension the metric does not have is refused, naming the ones it has", async () => {
  await refusal(
    () =>
      lookup(
        { admin_area_2: ok(areas(2)), year: ok([]) },
        { disOpt: "facility_type" },
      ),
    `Metric "m_test" has no dimension "facility_type". Its dimensions: admin_area_2, year.`,
  );
});

Deno.test("an offset without disOpt is refused", async () => {
  await refusal(
    () => lookup({ admin_area_2: ok(areas(2)) }, { offset: 0 }),
    "offset pages one dimension's values: pass disOpt with it.",
  );
});

Deno.test("an offset at or past the values to write is refused", async () => {
  const dims = { admin_area_3: ok(areas(20)) };
  await refusal(
    () => lookup(dims, { disOpt: "admin_area_3", offset: 20 }),
    "offset 20 is past the end: there are 20 values, so an offset must be below 20.",
  );
  await refusal(
    () =>
      lookup(dims, {
        disOpt: "admin_area_3",
        search: ["area_1"],
        offset: 11,
      }),
    "offset 11 is past the end: there are 11 matching values, so an offset must be below 11.",
  );
  await refusal(
    () => lookup(dims, { disOpt: "admin_area_3", search: ["kano"], offset: 1 }),
    "offset 1 is past the end: there are no matching values.",
  );
});

Deno.test("a search with no word to match is refused", async () => {
  await refusal(
    () => lookup({ admin_area_2: ok(areas(2)) }, { search: ["", "  "] }),
    `search ["","  "] holds no word to match: give at least one term with a letter or digit.`,
  );
});

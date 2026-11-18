// Pins the CSV `get_metric_data` writes: long format, one row per item, each
// row naming every dimension as the data holds it, no row for a value the data
// does not hold, and a label with a comma or a quote kept in one cell; the
// time range it states, which is the rows' own and not the window asked for;
// the status it gives when a query returns too many items; and an indicator
// read's format, stated once in the header when its rows share one and in a
// format column when they do not, never in the Dimension Summary.
//
//   deno test -A --no-check server/tests/format_metric_data_for_ai_test.ts

import { assert, assertEquals } from "@std/assert";
import { getMetricDataForAI } from "../../lib/ai_tools/format_metric_data_for_ai.ts";
import type { AIToolEnv } from "../../lib/ai_tools/env.ts";
import type {
  AiMetricQuery,
  IndicatorMetadata,
  JsonArrayItem,
  MetricWithStatus,
} from "../../lib/types/mod.ts";

const METRIC = {
  id: "m_test",
  resultsObjectId: "ro_test",
  valueProps: ["value"],
  valueFunc: "SUM",
  label: "Test metric",
  formatAs: "number",
  disaggregationOptions: [
    { value: "indicator_common_id", isRequired: true },
    { value: "admin_area_2", isRequired: false },
    { value: "period_id", isRequired: false },
    { value: "year", isRequired: false },
  ],
  mostGranularTimePeriodColumnInResultsFile: "period_id",
  status: "ready",
  moduleId: "m001",
} as unknown as MetricWithStatus;

const AREA_BY_INDICATOR: Record<string, string> = {
  anc1: "Western Area, Urban",
  penta3: 'Bo "Town"',
};

// Two indicators by three periods, anc1 missing 202303.
const ITEMS: JsonArrayItem[] = [
  ["anc1", 202301, 10],
  ["anc1", 202302, 11],
  ["penta3", 202301, 20],
  ["penta3", 202302, 21],
  ["penta3", 202303, 22],
].map(([indicator, period, value]) => ({
  indicator_common_id: indicator,
  admin_area_2: AREA_BY_INDICATOR[indicator],
  period_id: period,
  year: 2023,
  value,
}));

const ENV: AIToolEnv = {
  getItems: (params) =>
    Promise.resolve({
      success: true,
      data: {
        resultsObjectId: params.resultsObjectId,
        fetchConfig: params.fetchConfig,
        runId: "run_test",
        scopeToken: "all-data",
        dateRange: { min: 202301, max: 202303 },
        status: "ok",
        items: ITEMS,
        indicatorMetadata: [],
      },
    }),
  getResultsValueInfo: () =>
    Promise.resolve({ success: false, err: "not needed" }),
};

async function csvLines(): Promise<string[]> {
  const text = await getMetricDataForAI(
    ENV,
    {
      metricId: METRIC.id,
      disaggregations: ["admin_area_2", "period_id", "year"],
    },
    [METRIC],
  );
  return text.split("## Data (CSV)\n\n")[1].split("\n");
}

Deno.test("one row per item, each naming its indicator and period", async () => {
  const [header, ...rows] = await csvLines();
  assertEquals(
    header,
    "indicator_common_id,admin_area_2,period_id,year,value",
  );
  assertEquals(rows.length, ITEMS.length);
  for (const [i, item] of ITEMS.entries()) {
    assert(rows[i].startsWith(`${item.indicator_common_id},`), rows[i]);
    assert(rows[i].includes(`,${item.period_id},`), rows[i]);
  }
});

Deno.test("a value the data does not hold writes no row", async () => {
  const [, ...rows] = await csvLines();
  for (const row of rows) {
    assert(!row.endsWith(","), row);
    assert(!row.includes(",,"), row);
  }
});

Deno.test("period_id and year are written as they are", async () => {
  const [, first] = await csvLines();
  assertEquals(
    first,
    `anc1,"Western Area, Urban",202301,2023,10.00`,
  );
});

Deno.test("a label with a comma is quoted, one with a quote escaped", async () => {
  const [, ...rows] = await csvLines();
  for (const row of rows) {
    assert(
      row.startsWith("anc1,")
        ? row.includes(`,"Western Area, Urban",`)
        : row.includes(`,"Bo ""Town""",`),
      row,
    );
  }
});

// Each disaggregation splits rows, so adding one never brings a query under
// the item limit.
Deno.test("too many items tells the model to remove disaggregations, never to add them", async () => {
  const text = await getMetricDataForAI(
    {
      ...ENV,
      getItems: (params) =>
        Promise.resolve({
          success: true,
          data: {
            resultsObjectId: params.resultsObjectId,
            fetchConfig: params.fetchConfig,
            runId: "run_test",
            scopeToken: "all-data",
            dateRange: undefined,
            status: "too_many_items",
          },
        }),
    },
    { metricId: METRIC.id, disaggregations: ["admin_area_2", "period_id"] },
    [METRIC],
  );
  const status = text.split("\n").find((line) => line.includes("STATUS"));
  assert(status?.includes("remove disaggregations"), status);
  assert(!/add[^,]*disaggregations/.test(status!), status);
});

// A custom filter's window is the requested bounds, whatever the data holds.
const WINDOW_ASKED = { min: 202301, max: 202312 };

async function textFor(
  items: JsonArrayItem[],
  disaggregations: AiMetricQuery["disaggregations"],
): Promise<string> {
  return await getMetricDataForAI(
    {
      ...ENV,
      getItems: (params) =>
        Promise.resolve({
          success: true,
          data: {
            resultsObjectId: params.resultsObjectId,
            fetchConfig: params.fetchConfig,
            runId: "run_test",
            scopeToken: "all-data",
            dateRange: WINDOW_ASKED,
            status: "ok",
            items,
            indicatorMetadata: [],
          },
        }),
    },
    { metricId: METRIC.id, disaggregations },
    [METRIC],
  );
}

Deno.test("the time range in data is the rows' own, not the window asked for", async () => {
  const text = await textFor(ITEMS, ["admin_area_2", "period_id", "year"]);
  assert(
    text.includes("**Time range in data:** period_id (202301 to 202303)"),
    text,
  );
  assert(!text.includes("202312"), text);
});

const INDICATOR_METRIC = {
  ...METRIC,
  formatAs: "indicator",
} as unknown as MetricWithStatus;

async function indicatorRead(
  items: JsonArrayItem[],
  indicatorMetadata: IndicatorMetadata[],
): Promise<string> {
  return await getMetricDataForAI(
    {
      ...ENV,
      getItems: (params) =>
        Promise.resolve({
          success: true,
          data: {
            resultsObjectId: params.resultsObjectId,
            fetchConfig: params.fetchConfig,
            runId: "run_test",
            scopeToken: "all-data",
            dateRange: undefined,
            status: "ok",
            items,
            indicatorMetadata,
          },
        }),
    },
    { metricId: INDICATOR_METRIC.id, disaggregations: ["period_id"] },
    [INDICATOR_METRIC],
  );
}

const PERCENT_ROWS: JsonArrayItem[] = [
  { indicator_common_id: "anc1", period_id: 202301, value: 0.853 },
  { indicator_common_id: "anc4", period_id: 202301, value: 0.61 },
];

function csvOf(text: string): string[] {
  return text.split("## Data (CSV)\n\n")[1].split("\n");
}

Deno.test("an indicator read whose rows share a format states it once, with no format column", async () => {
  const text = await indicatorRead(PERCENT_ROWS, [
    { id: "anc1", label: "ANC 1", format_as: "percent" },
    { id: "anc4", label: "ANC 4", format_as: "percent" },
  ]);
  assert(
    text.includes(
      "**Format:** percent (values are written as 0-1 fractions)\n",
    ),
    text,
  );
  assertEquals(text.split("percent").length, 2, text);
  assertEquals(csvOf(text), [
    "indicator_common_id,period_id,value",
    "anc1,202301,0.853",
    "anc4,202301,0.610",
  ]);
});

Deno.test("an indicator read whose rows hold two formats writes a format column between the dimensions and the values", async () => {
  const text = await indicatorRead(
    [
      ...PERCENT_ROWS,
      { indicator_common_id: "mmr", period_id: 202301, value: 0.00042 },
    ],
    [
      { id: "anc1", label: "ANC 1", format_as: "percent" },
      { id: "anc4", label: "ANC 4", format_as: "percent" },
      { id: "mmr", label: "Maternal deaths", format_as: "rate_per_10k" },
    ],
  );
  assert(
    text.includes(
      "**Format:** varies by indicator: the format column gives each row's (percent values are written as 0-1 fractions; rate_per_10k values are written already scaled to counts per 10,000)\n",
    ),
    text,
  );
  assertEquals(csvOf(text), [
    "indicator_common_id,period_id,format,value",
    "anc1,202301,percent,0.853",
    "anc4,202301,percent,0.610",
    "mmr,202301,rate_per_10k,4.20",
  ]);
  const summary = text.split("## Dimension Summary")[1].split("## Data")[0];
  assert(!summary.includes("percent"), summary);
  assert(!summary.includes("rate_per_10k"), summary);
});

Deno.test("a dimension of more than 20 values writes its count and no id outside the CSV", async () => {
  const ids = Array.from({ length: 21 }, (_, i) => `ind_${i}`);
  const text = await indicatorRead(
    ids.map((id) => ({ indicator_common_id: id, period_id: 202301, value: 1 })),
    ids.map((id) => ({ id, label: id, format_as: "number" })),
  );
  const [beforeCsv] = text.split("## Data (CSV)");
  assert(beforeCsv.includes("**indicator_common_id:** 21 unique values"), text);
  for (const id of ids) {
    assert(!beforeCsv.includes(id), `${id} written outside the CSV`);
  }
});

Deno.test("rows with no period column state the window they aggregate", async () => {
  const text = await textFor(
    ITEMS.map(({ indicator_common_id, admin_area_2, value }) => ({
      indicator_common_id,
      admin_area_2,
      value,
    })),
    ["admin_area_2"],
  );
  assert(!text.includes("Time range in data"), text);
  assert(
    text.includes("**Period window:** period_id (202301 to 202312)"),
    text,
  );
});

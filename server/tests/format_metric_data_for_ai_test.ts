// Pins the CSV `get_metric_data` writes: long format, one row per item, each
// row naming every dimension as the data holds it, no row for a value the data
// does not hold, and a label with a comma or a quote kept in one cell.
//
//   deno test -A --no-check server/tests/format_metric_data_for_ai_test.ts

import { assert, assertEquals } from "@std/assert";
import { getMetricDataForAI } from "../../lib/ai_tools/format_metric_data_for_ai.ts";
import type { AIToolEnv } from "../../lib/ai_tools/env.ts";
import type { JsonArrayItem, MetricWithStatus } from "../../lib/types/mod.ts";

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

// The editor's gate: a draft with a problem the document's config lacks is
// not written, and a draft with only that config's problems, or none, is.
//
//   deno test -A server/tests/figure_config_gate_test.ts

import { assert } from "@std/assert";
import {
  type FigureConfig,
  type FigureMetric,
  isDraftWritable,
  startingFigureConfig,
  validateFigureConfig,
} from "lib";

const METRIC: FigureMetric = {
  id: "m-test",
  valueProps: ["a", "b"],
  formatAs: "percent",
  valueFunc: "SUM",
  mostGranularTimePeriodColumnInResultsFile: "period_id",
  disaggregationOptions: [
    { value: "indicator_common_id", isRequired: true },
    { value: "admin_area_2", isRequired: false },
    { value: "admin_area_3", isRequired: false },
  ],
};

const GOOD = startingFigureConfig(METRIC, "table", ["admin_area_2"]);
const { row: _required, ...POOLED_LAYOUT } = GOOD.layout;
// A stored figure with a problem: its required dimension is pooled.
const BAD: FigureConfig = { ...GOOD, layout: POOLED_LAYOUT };

function writable(draft: unknown, document: FigureConfig): boolean {
  return isDraftWritable(
    validateFigureConfig(draft, METRIC),
    validateFigureConfig(document, METRIC),
  );
}

Deno.test("a draft with no problem is written", () => {
  assert(writable(GOOD, GOOD));
  assert(writable({ ...GOOD, text: { ...GOOD.text, title: "New" } }, GOOD));
});

Deno.test("a draft that adds a problem is not written", () => {
  assert(!writable(BAD, GOOD));
});

Deno.test("a draft that does not fit the shape is not written", () => {
  assert(
    !writable({
      ...GOOD,
      data: { filters: [{ dim: "admin_area_3", values: [] }] },
    }, GOOD),
  );
  assert(
    !writable({
      ...GOOD,
      style: { ...GOOD.style, decimalPlaces: 4 },
    }, GOOD),
  );
});

Deno.test("a stored figure with a problem can still be edited", () => {
  assert(writable({ ...BAD, text: { ...BAD.text, title: "New" } }, BAD));
  assert(
    writable(
      { ...BAD, layout: { ...BAD.layout, rowGroup: "admin_area_3" } },
      BAD,
    ),
  );
  assert(writable(GOOD, BAD));
});

Deno.test("a draft that keeps the old problem and adds another is not written", () => {
  assert(
    !writable({
      ...BAD,
      layout: { ...BAD.layout, colGroup: "admin_area_2" },
    }, BAD),
  );
});

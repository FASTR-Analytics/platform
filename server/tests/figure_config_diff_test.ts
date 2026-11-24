// The diff of two configs lists exactly the fields that differ.

import { assertEquals } from "@std/assert";
import { defaultFigureStyle, diffFigureConfigs, type FigureConfig } from "lib";

const BASE: FigureConfig = {
  type: "table",
  data: {
    filters: [{ dim: "admin_area_2", values: ["a", "b"] }],
  },
  layout: { row: "admin_area_2", col: "indicator_common_id" },
  style: defaultFigureStyle("table", { type: "none" }),
  text: { title: "T", subtitle: "", footnote: "" },
};

Deno.test("two equal configs differ in nothing", () => {
  assertEquals(diffFigureConfigs(BASE, structuredClone(BASE)), []);
});

Deno.test("a changed field is listed by its path, with both values", () => {
  const next: FigureConfig = {
    ...BASE,
    style: { ...BASE.style, decimalPlaces: 2 },
    text: { ...BASE.text, title: "U" },
  };
  assertEquals(diffFigureConfigs(BASE, next), [
    { path: "style.decimalPlaces", before: 0, after: 2 },
    { path: "text.title", before: "T", after: "U" },
  ]);
});

Deno.test("a list of objects of one length is compared item by item, a list of values whole", () => {
  const next: FigureConfig = {
    ...BASE,
    data: { filters: [{ dim: "admin_area_2", values: ["a", "c"] }] },
  };
  assertEquals(diffFigureConfigs(BASE, next), [
    { path: "data.filters[0].values", before: ["a", "b"], after: ["a", "c"] },
  ]);
});

Deno.test("a list whose length changes is one field, and an added field changes from undefined", () => {
  const next: FigureConfig = {
    ...BASE,
    data: {
      filters: [],
      periodFilter: { type: "lastFull", n: 1, unit: "year" },
    },
  };
  assertEquals(diffFigureConfigs(BASE, next), [
    { path: "data.filters", before: BASE.data.filters, after: [] },
    {
      path: "data.periodFilter",
      before: undefined,
      after: { type: "lastFull", n: 1, unit: "year" },
    },
  ]);
});

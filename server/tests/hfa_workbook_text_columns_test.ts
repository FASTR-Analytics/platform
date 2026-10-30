import { assertEquals, assertStringIncludes } from "@std/assert";
import { utils, write } from "xlsx";
import {
  buildHfaWorkbookBlob,
  detectHfaWorkbookShape,
  type WorkbookShape,
} from "../../client/src/components/data/hfa/indicators/xlsx_workbook.ts";
import type { Language } from "lib";

function workbook(sheets: Record<string, string[][]>): ArrayBuffer {
  const wb = utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    utils.book_append_sheet(wb, utils.aoa_to_sheet(aoa), name);
  }
  return write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function detectOk(buf: ArrayBuffer, language: Language): WorkbookShape {
  const res = detectHfaWorkbookShape(buf, [], language);
  if (!res.ok) throw new Error(res.err);
  return res.shape;
}

function detectErr(buf: ArrayBuffer, language: Language): string {
  const res = detectHfaWorkbookShape(buf, [], language);
  if (res.ok) throw new Error("expected the workbook to be rejected");
  return res.err;
}

const INDICATOR_TAIL = ["binary", "avg", "sh_01_c==1"];

const PER_LANGUAGE = workbook({
  Categories: [
    ["id", "label_en", "label_fr", "label_pt"],
    ["shocks", "Shocks", "Chocs", ""],
  ],
  "Sub-categories": [["id", "categoryId", "label_en", "label_fr", "label_pt"]],
  Indicators: [
    [
      "indicatorId",
      "categoryId",
      "shortLabel_en",
      "shortLabel_fr",
      "shortLabel_pt",
      "label_en",
      "label_fr",
      "label_pt",
      "type",
      "aggregation",
      "r_code__Round 1",
    ],
    [
      "ind001",
      "shocks",
      "Short EN",
      "Court FR",
      "",
      "Shock EN",
      "Choc FR",
      "Choque PT",
      ...INDICATOR_TAIL,
    ],
  ],
});

function labels(shape: WorkbookShape) {
  return {
    category: shape.categories[0].label,
    shortLabel: shape.indicators[0].shortLabel,
    definition: shape.indicators[0].definition,
  };
}

Deno.test("per-language columns: each instance language reads its own column", () => {
  assertEquals(labels(detectOk(PER_LANGUAGE, "en")), {
    category: "Shocks",
    shortLabel: "Short EN",
    definition: "Shock EN",
  });
  assertEquals(labels(detectOk(PER_LANGUAGE, "fr")), {
    category: "Chocs",
    shortLabel: "Court FR",
    definition: "Choc FR",
  });
});

Deno.test("per-language columns: a blank cell falls back to English", () => {
  assertEquals(labels(detectOk(PER_LANGUAGE, "pt")), {
    category: "Shocks",
    shortLabel: "Short EN",
    definition: "Choque PT",
  });
});

Deno.test("per-language columns: a missing language column falls back to English", () => {
  const twoLanguages = workbook({
    Categories: [["id", "label_en", "label_fr"], ["shocks", "Shocks", "Chocs"]],
    Indicators: [
      [
        "indicatorId",
        "categoryId",
        "label_en",
        "label_fr",
        "type",
        "aggregation",
        "r_code__Round 1",
      ],
      ["ind001", "shocks", "Shock EN", "Choc FR", ...INDICATOR_TAIL],
    ],
  });
  assertEquals(labels(detectOk(twoLanguages, "pt")), {
    category: "Shocks",
    shortLabel: "",
    definition: "Shock EN",
  });
});

Deno.test("single text columns still import for every instance language", () => {
  const single = workbook({
    Categories: [["id", "label"], ["shocks", "Shocks"]],
    Indicators: [
      [
        "indicatorId",
        "categoryId",
        "shortLabel",
        "label",
        "type",
        "aggregation",
        "r_code__Round 1",
      ],
      ["ind001", "shocks", "Short", "Shock", ...INDICATOR_TAIL],
    ],
  });
  for (const language of ["en", "fr", "pt"] as const) {
    assertEquals(labels(detectOk(single, language)), {
      category: "Shocks",
      shortLabel: "Short",
      definition: "Shock",
    });
  }
});

Deno.test("a required text column present in no form is rejected at the header", () => {
  const oldExportColumn = workbook({
    Categories: [["id", "label_en"], ["shocks", "Shocks"]],
    Indicators: [
      [
        "indicatorId",
        "categoryId",
        "definition",
        "type",
        "aggregation",
        "r_code__Round 1",
      ],
      ["ind001", "shocks", "Shock EN", ...INDICATOR_TAIL],
    ],
  });
  const err = detectErr(oldExportColumn, "en");
  assertStringIncludes(err, "Indicators sheet");
  assertStringIncludes(err, '"label_en"');

  const noCategoryLabel = workbook({
    Categories: [["id", "name"], ["shocks", "Shocks"]],
    Indicators: [
      ["indicatorId", "label", "type", "aggregation", "r_code__Round 1"],
      ["ind001", "Shock", ...INDICATOR_TAIL],
    ],
  });
  assertStringIncludes(detectErr(noCategoryLabel, "en"), "Categories sheet");
});

Deno.test("an exported workbook re-imports with the same labels", async () => {
  const blob = buildHfaWorkbookBlob({
    categories: [{ id: "shocks", label: "Chocs", sortOrder: 0 }],
    subCategories: [],
    serviceCategories: [],
    variantGroups: [],
    variantItems: [],
    indicators: [{
      indicatorId: "ind001",
      categoryId: "shocks",
      subCategoryId: null,
      serviceCategoryIds: [],
      shortLabel: "Court",
      definition: "Choc",
      type: "binary",
      aggregation: "avg",
      sortOrder: 0,
      variantGroupId: null,
    }],
    code: [{
      indicatorId: "ind001",
      timePoint: "Round 1",
      code: "sh_01_c==1",
    }],
    variantCode: [],
    timePoints: ["Round 1"],
  });
  const shape = detectOk(await blob.arrayBuffer(), "fr");
  assertEquals(labels(shape), {
    category: "Chocs",
    shortLabel: "Court",
    definition: "Choc",
  });
  assertEquals(shape.xlsxLabels, ["Round 1"]);
});

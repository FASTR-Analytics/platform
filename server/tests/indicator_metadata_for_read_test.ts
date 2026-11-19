// Pins indicatorMetadataForRead, the catalog entries a read or a stored
// figure names, and its use by the stored-figure transform: an entry is kept
// when a row's cell or a filter value equals its id as text, the kept entries
// stay in the catalog's order, a bundle's selected replicant value names an
// entry, the sweeps' predicate sees a bundle holding an entry it does not
// name, and the block leaves a trimmed bundle as it was.
//
//   deno test -A --env-file server/tests/indicator_metadata_for_read_test.ts

import { assertEquals } from "@std/assert";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  type FigureBundle,
  figureBundleSchema,
  type IndicatorMetadataDisplay,
  indicatorMetadataForRead,
  presentationObjectConfigSchema,
} from "lib";
import {
  bundleHoldsUnnamedIndicatorMetadata,
  type FigureBlockMut,
  transformFigureBlock,
} from "../db/migrations/data_transforms/_figure_block.ts";

const entry = (id: string, sortOrder: number): IndicatorMetadataDisplay => ({
  id,
  label: `Label ${id}`,
  format_as: "number",
  sort_order: sortOrder,
});

const CATALOG = [
  entry("anc1", 1),
  entry("penta3", 2),
  entry("opd", 3),
  entry("123", 4),
  entry("bcg", 5),
];

const ids = (entries: { id: string }[]): string[] => entries.map((e) => e.id);

Deno.test("an entry a row's cell names is kept and one nothing names is dropped", () => {
  assertEquals(
    ids(indicatorMetadataForRead(
      CATALOG,
      [{ indicator_common_id: "penta3", admin_area_2: "Kano", value: 7 }],
      [],
    )),
    ["penta3"],
  );
});

Deno.test("an entry only a filter value names is kept", () => {
  assertEquals(
    ids(indicatorMetadataForRead(
      CATALOG,
      [{ admin_area_2: "Kano", value: 7 }],
      ["opd"],
    )),
    ["opd"],
  );
});

Deno.test("a numeric cell that equals an id as text keeps the entry", () => {
  assertEquals(
    ids(indicatorMetadataForRead(
      CATALOG,
      [{ admin_area_2: "Kano", count: 123, value: null }],
      [],
    )),
    ["123"],
  );
});

Deno.test("the kept entries stay in the catalog's order", () => {
  assertEquals(
    ids(indicatorMetadataForRead(
      CATALOG,
      [
        { indicator_common_id: "bcg", value: 1 },
        { indicator_common_id: "penta3", value: 2 },
      ],
      ["anc1"],
    )),
    ["anc1", "penta3", "bcg"],
  );
});

function storedBundle(
  d: Record<string, unknown>,
  items: FigureBundle["items"],
  indicatorMetadata: IndicatorMetadataDisplay[],
): FigureBundle {
  return figureBundleSchema.parse({
    config: presentationObjectConfigSchema.parse({
      d: {
        type: "table",
        valuesDisDisplayOpt: "col",
        periodFilter: { filterType: "last_n_months", nMonths: 12 },
        ...d,
      },
      s: DEFAULT_S_CONFIG,
      t: DEFAULT_T_CONFIG,
    }),
    items,
    resultsValue: { formatAs: "indicator", valueProps: ["value"] },
    indicatorMetadata,
    localization: { language: "en", calendar: "gregorian", countryIso3: "" },
    metricId: "m1-01-01",
    scope: { definitionHash: "h", adminArea2: null },
    snapshotAt: "2026-11-18T00:00:00.000Z",
    provenance: { runId: "00000000-0000-4000-8000-000000000000" },
  });
}

// A figure replicated by indicator whose rows omit the indicator column, so
// only the selected replicant value names its entry.
const REPLICATED = storedBundle(
  {
    disaggregateBy: [
      { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
      { disOpt: "admin_area_2", disDisplayOpt: "row" },
    ],
    filterBy: [],
    selectedReplicantValue: "opd",
  },
  [{ admin_area_2: "Kano", value: 7 }],
  CATALOG,
);

// A figure an indicator filter pins, disaggregated by area only.
const PINNED = storedBundle(
  {
    disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "row" }],
    filterBy: [{ disOpt: "indicator_common_id", values: ["anc1"] }],
  },
  [{ admin_area_2: "Kano", value: 7 }],
  CATALOG,
);

function transformStored(bundle: FigureBundle): FigureBundle {
  const block: FigureBlockMut = {
    type: "figure",
    bundle: JSON.parse(JSON.stringify(bundle)),
  };
  transformFigureBlock(block);
  return figureBundleSchema.parse(block.bundle);
}

Deno.test("the transform keeps the entry the selected replicant value names", () => {
  assertEquals(ids(transformStored(REPLICATED).indicatorMetadata), ["opd"]);
});

Deno.test("the transform keeps the entry an indicator filter names", () => {
  assertEquals(ids(transformStored(PINNED).indicatorMetadata), ["anc1"]);
});

Deno.test("the predicate holds for a bundle with an unnamed entry and not for a trimmed one", () => {
  assertEquals(bundleHoldsUnnamedIndicatorMetadata(REPLICATED), true);
  assertEquals(
    bundleHoldsUnnamedIndicatorMetadata(transformStored(REPLICATED)),
    false,
  );
});

Deno.test("the block leaves a trimmed bundle byte-identical", () => {
  const stored = JSON.stringify(transformStored(PINNED));
  const block: FigureBlockMut = { type: "figure", bundle: JSON.parse(stored) };
  transformFigureBlock(block);
  assertEquals(JSON.stringify(block.bundle), stored);
});

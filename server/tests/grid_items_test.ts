// Harness for the grid read's payload codec: decoding an encoded row set
// reproduces the items read's rows exactly.
//
//   deno test -A server/tests/grid_items_test.ts

import { assertEquals } from "@std/assert";
import {
  BLANK_SENTINEL,
  decodeGridItems,
  encodeGridItems,
  type JsonArrayItem,
  ROLLUP_SENTINEL,
} from "lib";

const GROUP_BYS = ["admin_area_2", "indicator_common_id", "period_id"];

const ITEMS: JsonArrayItem[] = [
  { admin_area_2: ROLLUP_SENTINEL, indicator_common_id: "anc1", period_id: 202401, value: 0.72, __n_value: 40 },
  { admin_area_2: "Abia", indicator_common_id: "anc1", period_id: 202401, value: null, __n_value: 0 },
  { admin_area_2: "Abia", indicator_common_id: "anc4", period_id: 202402, value: "0.5", __n_value: 12 },
  { admin_area_2: BLANK_SENTINEL, indicator_common_id: "anc4", period_id: 202402, value: 3, __n_value: null },
  { admin_area_2: "", indicator_common_id: "anc1", period_id: 202402, value: 1, __n_value: 1 },
  { admin_area_2: null, indicator_common_id: "anc1", period_id: 202401, value: 2, __n_value: 1 },
];

Deno.test("grid items: decode reproduces every row, value and type", () => {
  const encoded = encodeGridItems(ITEMS, GROUP_BYS);
  assertEquals(decodeGridItems(encoded, GROUP_BYS), ITEMS);
});

Deno.test("grid items: each groupBy holds its distinct values once, in first-seen order", () => {
  const encoded = encodeGridItems(ITEMS, GROUP_BYS);
  assertEquals(encoded.levels, [
    [ROLLUP_SENTINEL, "Abia", BLANK_SENTINEL, "", null],
    ["anc1", "anc4"],
    [202401, 202402],
  ]);
  assertEquals(encoded.rows[2], [1, 1, 1]);
});

Deno.test("grid items: every non-groupBy column is a value column", () => {
  assertEquals(encodeGridItems(ITEMS, GROUP_BYS).valueProps, ["value", "__n_value"]);
});

Deno.test("grid items: an empty row set round-trips", () => {
  const encoded = encodeGridItems([], GROUP_BYS);
  assertEquals(encoded, { levels: [[], [], []], rows: [], valueProps: [], values: [] });
  assertEquals(decodeGridItems(encoded, GROUP_BYS), []);
});

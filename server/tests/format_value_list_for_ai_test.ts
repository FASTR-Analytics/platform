// Pins how a dimension's value list reads to the copilot in an error: whole
// up to AI_INLINE_LIST_MAX values, and above it only the values matching what
// the copilot sent, with the counts and the lookup that lists them all.
//
//   deno test -A --no-check server/tests/format_value_list_for_ai_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { formatValueListForAI } from "../../lib/ai_tools/format_value_list_for_ai.ts";
import {
  AI_INLINE_LIST_MAX,
  dimensionLookupSentence,
} from "../../lib/ai_tools/read_bounds.ts";

const LOOKUP = { metricId: "m_test", disOpt: "admin_area_2" };
const POINTER = dimensionLookupSentence(LOOKUP.metricId, LOOKUP.disOpt);

function areas(n: number): { id: string; label: string }[] {
  return Array.from(
    { length: n },
    (_, i) => ({ id: `area_${i}`, label: `Area ${i}` }),
  );
}

Deno.test("a list of exactly AI_INLINE_LIST_MAX values is written whole", () => {
  const text = formatValueListForAI(areas(AI_INLINE_LIST_MAX), [], LOOKUP);
  assertEquals(text.split(", ").length, AI_INLINE_LIST_MAX);
  assert(text.startsWith("area_0 (Area 0), area_1 (Area 1)"));
  assert(text.endsWith(`area_${AI_INLINE_LIST_MAX - 1} (Area 99)`));
  assert(!text.includes("get_dimension_values"));
});

Deno.test("a longer list is written as its matching values, with both counts and the lookup", () => {
  const values = [
    ...areas(AI_INLINE_LIST_MAX),
    { id: "kn", label: "Kano North" },
    { id: "ks", label: "Kano South" },
  ];
  assertEquals(
    formatValueListForAI(values, ["kano"], LOOKUP),
    `102 values, too many to list; 2 match "kano": kn (Kano North), ks (Kano South). get_dimension_values with metricId "m_test" and disOpt "admin_area_2" lists this dimension's values under the scope, before any filter, and its search finds one by name or id.`,
  );
});

Deno.test("a value matches when it holds every token of one near string", () => {
  const values = [
    ...areas(AI_INLINE_LIST_MAX),
    { id: "kn", label: "Kano North" },
    { id: "ks", label: "Kano South" },
    { id: "ln", label: "Lagos North" },
  ];
  assertEquals(
    formatValueListForAI(values, ["kano north", "lagos"], LOOKUP),
    `103 values, too many to list; 2 match "kano north" or "lagos": kn (Kano North), ln (Lagos North). ${POINTER}`,
  );
});

Deno.test("a longer list with no match gives the counts, no values and the lookup", () => {
  assertEquals(
    formatValueListForAI(areas(AI_INLINE_LIST_MAX + 1), ["kano"], LOOKUP),
    `101 values, too many to list; 0 match "kano". ${POINTER}`,
  );
});

Deno.test("a longer list with nothing to match gives the count and the lookup", () => {
  assertEquals(
    formatValueListForAI(areas(AI_INLINE_LIST_MAX + 1), [], LOOKUP),
    `101 values, too many to list. ${POINTER}`,
  );
});

Deno.test("more matches than AI_INLINE_LIST_MAX list the first AI_INLINE_LIST_MAX", () => {
  const text = formatValueListForAI(
    areas(AI_INLINE_LIST_MAX * 2),
    ["area"],
    LOOKUP,
  );
  assert(
    text.startsWith(
      `200 values, too many to list; 200 match "area", the first 100 listed: area_0 (Area 0),`,
    ),
  );
  assert(text.endsWith(`area_99 (Area 99). ${POINTER}`));
  assert(!text.includes("area_100 "));
});

Deno.test("matching ignores case and accents", () => {
  const values = [
    ...areas(AI_INLINE_LIST_MAX),
    { id: "sl_ke", label: "Kénéma" },
  ];
  assertStringIncludes(
    formatValueListForAI(values, ["KENEMA"], LOOKUP),
    `1 match "KENEMA": sl_ke (Kénéma).`,
  );
});

Deno.test("a value whose label equals its id is written as the id alone", () => {
  assertEquals(
    formatValueListForAI(
      [
        { id: "anc1", label: "anc1" },
        { id: "anc4", label: "ANC 4th visit" },
      ],
      [],
      LOOKUP,
    ),
    "anc1, anc4 (ANC 4th visit)",
  );
});

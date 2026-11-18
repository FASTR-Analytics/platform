// Pins how a dimension's value list reads to the copilot: whole up to
// AI_VALUE_LIST_MAX values, and above it only the values matching what the
// copilot sent, with the counts.
//
//   deno test -A --no-check server/tests/format_value_list_for_ai_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  AI_VALUE_LIST_MAX,
  formatValueListForAI,
} from "../../lib/ai_tools/format_value_list_for_ai.ts";

function areas(n: number): { id: string; label: string }[] {
  return Array.from(
    { length: n },
    (_, i) => ({ id: `area_${i}`, label: `Area ${i}` }),
  );
}

Deno.test("a list of exactly AI_VALUE_LIST_MAX values is written whole", () => {
  const values = areas(AI_VALUE_LIST_MAX);
  const text = formatValueListForAI(values, []);
  assertEquals(text.split(", ").length, AI_VALUE_LIST_MAX);
  assert(text.startsWith("area_0 (Area 0), area_1 (Area 1)"));
  assert(text.endsWith("area_499 (Area 499)"));
});

Deno.test("a longer list is written as its matching values, with both counts", () => {
  const values = [
    ...areas(AI_VALUE_LIST_MAX),
    { id: "kn", label: "Kano North" },
    { id: "ks", label: "Kano South" },
  ];
  assertEquals(
    formatValueListForAI(values, ["kano"]),
    `502 values, too many to list; 2 match "kano": kn (Kano North), ks (Kano South)`,
  );
});

Deno.test("a value matches when it holds every token of one near string", () => {
  const values = [
    ...areas(AI_VALUE_LIST_MAX),
    { id: "kn", label: "Kano North" },
    { id: "ks", label: "Kano South" },
    { id: "ln", label: "Lagos North" },
  ];
  assertEquals(
    formatValueListForAI(values, ["kano north", "lagos"]),
    `503 values, too many to list; 2 match "kano north" or "lagos": kn (Kano North), ln (Lagos North)`,
  );
});

Deno.test("a longer list with no match gives the counts and no values", () => {
  const text = formatValueListForAI(areas(AI_VALUE_LIST_MAX + 1), ["kano"]);
  assertEquals(text, `501 values, too many to list; 0 match "kano".`);
});

Deno.test("a longer list with nothing to match gives the count alone", () => {
  assertEquals(
    formatValueListForAI(areas(AI_VALUE_LIST_MAX + 1), []),
    "501 values, too many to list.",
  );
});

Deno.test("more matches than AI_VALUE_LIST_MAX list the first AI_VALUE_LIST_MAX", () => {
  const text = formatValueListForAI(areas(AI_VALUE_LIST_MAX * 2), ["area"]);
  assert(
    text.startsWith(
      `1000 values, too many to list; 1000 match "area", the first 500 listed: area_0 (Area 0),`,
    ),
  );
  assert(text.endsWith("area_499 (Area 499)"));
});

Deno.test("matching ignores case and accents", () => {
  const values = [
    ...areas(AI_VALUE_LIST_MAX),
    { id: "sl_ke", label: "Kénéma" },
  ];
  assertStringIncludes(
    formatValueListForAI(values, ["KENEMA"]),
    `1 match "KENEMA": sl_ke (Kénéma)`,
  );
});

Deno.test("a value whose label equals its id is written as the id alone", () => {
  assertEquals(
    formatValueListForAI([
      { id: "anc1", label: "anc1" },
      { id: "anc4", label: "ANC 4th visit" },
    ], []),
    "anc1, anc4 (ANC 4th visit)",
  );
});

// Regression pin for the HFA rounds both AI surfaces list: the SPA copilot
// and /mcp derive the taxonomy's time points from the instance's rounds
// through one function, so a round without data is listed by neither.
//
//   deno test -A --no-check server/tests/hfa_time_points_for_ai_test.ts

import { assertEquals } from "@std/assert";
import { hfaTimePointsForAI } from "../../lib/ai_tools/hfa_time_points_for_ai.ts";
import type { HfaTimePoint } from "../../lib/types/dataset_hfa.ts";

const ROUNDS: HfaTimePoint[] = [
  {
    label: "2021",
    periodId: "2021",
    sortOrder: 1,
    importedAt: "2025-01-10T00:00:00Z",
  },
  { label: "2023", periodId: "2023", sortOrder: 2, importedAt: undefined },
  {
    label: "2025",
    periodId: "2025",
    sortOrder: 3,
    importedAt: "2026-02-01T00:00:00Z",
  },
];

Deno.test("hfaTimePointsForAI: a round never imported is left out", () => {
  assertEquals(hfaTimePointsForAI(ROUNDS).map((tp) => tp.id), ["2021", "2025"]);
});

Deno.test("hfaTimePointsForAI: imported rounds keep their order, the label as the id", () => {
  assertEquals(hfaTimePointsForAI([ROUNDS[2], ROUNDS[0]]), [
    { id: "2025", label: "2025", periodId: "2025" },
    { id: "2021", label: "2021", periodId: "2021" },
  ]);
});

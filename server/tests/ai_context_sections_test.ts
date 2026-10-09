// Regression pin for the AI-context section both surfaces share
// (PLAN_COPILOT02_FIXES step 8, D31): the SPA prompt and /mcp get_overview add
// the instance ai_context through one function, so neither can omit it.
//
//   deno test -A --no-check server/tests/ai_context_sections_test.ts

import { assertEquals } from "@std/assert";
import { buildAiContextSections } from "../../lib/ai_tools/build_system_prompt.ts";

Deno.test("buildAiContextSections: a blank AI context adds no section", () => {
  assertEquals(buildAiContextSections(""), []);
  assertEquals(buildAiContextSections("  \n\t\n"), []);
});

Deno.test("buildAiContextSections: the AI context is trimmed under its heading", () => {
  assertEquals(
    buildAiContextSections("\n  The MoH merged two districts in 2024.  \n"),
    ["", "# Additional Context", "", "The MoH merged two districts in 2024."],
  );
});

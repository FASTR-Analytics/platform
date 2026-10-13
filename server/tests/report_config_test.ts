// Pins platform's own half of a report: the stored config (theme, template,
// the starting config and body) and the AI's editing brief. The document
// engine these sit on is Report Forge's, tested in report-forge/tests.
//
// Run: deno test -A server/tests/report_config_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  getFastrReportTheme,
  getStartingBodyForReport,
  getStartingConfigForReport,
  reportConfigSchema,
} from "../../lib/mod.ts";

Deno.test("getFastrReportTheme is total", () => {
  assertEquals(getFastrReportTheme(undefined), "default");
  assertEquals(getFastrReportTheme({}), "default");
  assertEquals(getFastrReportTheme({ fastrTheme: "swiss" }), "swiss");
  assertEquals(
    getFastrReportTheme({ fastrTheme: "vaporwave" as unknown as "swiss" }),
    "default",
  );
});

Deno.test("a fastr starting config round-trips the schema and carries a theme", () => {
  const config = getStartingConfigForReport(undefined, "ministry");
  assertEquals(config.format, "fastr");
  assertEquals(config.fastrTheme, "ministry");
  assertEquals(reportConfigSchema.parse(config).fastrTheme, "ministry");
});

Deno.test("the seeded body is just the title", () => {
  assertEquals(
    getStartingBodyForReport("My report"),
    "# My report\n\n",
  );
});

Deno.test("templates: the AI is told which one", async () => {
  const { getEditingReportInstructions } = await import(
    "../../lib/ai_tools/build_system_prompt.ts"
  );
  const withBrief = getEditingReportInstructions("R", "policy_brief");
  assertStringIncludes(withBrief, "POLICY BRIEF");
  assertStringIncludes(withBrief, "{.muted}");
  assertStringIncludes(
    getEditingReportInstructions("R", "long_form"),
    "LONG-FORM REPORT",
  );
  assertStringIncludes(
    getEditingReportInstructions("R", "empty"),
    "blank page",
  );
  assert(!getEditingReportInstructions("R").includes("POLICY BRIEF"));
});

Deno.test("templates: the choice survives the config schema and reads back totally", async () => {
  const r = await import("../../lib/mod.ts");
  const parsed = r.reportConfigSchema.parse({
    format: "fastr",
    template: "long_form",
  });
  assertEquals(r.getFastrReportTemplate(parsed), "long_form");
  assertEquals(
    r.getFastrReportTemplate({ template: "nonsense" as never }),
    undefined,
  );
  assertEquals(r.getFastrReportTemplate(undefined), undefined);
});

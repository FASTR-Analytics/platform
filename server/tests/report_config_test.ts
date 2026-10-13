// Pins platform's own half of a report: the stored config (theme, template,
// the starting config and body) and the AI's editing brief. The document
// engine these sit on is Report Forge's, tested in report-forge/tests.
//
// Run: deno test -A server/tests/report_config_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildFastrReportCss,
  buildFastrThemeVarsCss,
  FASTR_REPORT_TEMPLATES,
  FASTR_REPORT_THEMES,
  fastrRegisteredTheme,
  fastrTemplateIds,
  fastrThemeIds,
  fastrThemeTokens,
  getFastrReportTheme,
  getStartingBodyForReport,
  getStartingConfigForReport,
  isFastrReportTheme,
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

// The engine's themes are a registry: it ships ten and the platform registers
// `legacy` (lib/report_legacy_theme.ts). The stored-config schema is a
// membership test against that registry, so what it accepts is pinned here.
Deno.test("the stored theme is one of the engine's ten or legacy, legacy last", () => {
  assertEquals(FASTR_REPORT_THEMES.length, 10);
  assertEquals(fastrThemeIds(), [...FASTR_REPORT_THEMES, "legacy"]);
  for (const theme of fastrThemeIds()) {
    assertEquals(
      reportConfigSchema.parse({ format: "fastr", fastrTheme: theme })
        .fastrTheme,
      theme,
    );
    assertEquals(getFastrReportTheme({ fastrTheme: theme }), theme);
  }
  assert(isFastrReportTheme("legacy"));
  // An unknown theme must FAIL, not pass as a string: that failure is what
  // sends a report on a retired theme through the reports data transform.
  for (const bad of ["monochrome", "classic", "vaporwave", "", 7, null]) {
    assert(
      !reportConfigSchema.safeParse({ format: "fastr", fastrTheme: bad })
        .success,
      `accepted ${JSON.stringify(bad)}`,
    );
  }
  // Absent is fine: it reads as the default.
  assert(reportConfigSchema.safeParse({ format: "fastr" }).success);
});

Deno.test("the stored template is one of the engine's three", () => {
  assertEquals(fastrTemplateIds(), [...FASTR_REPORT_TEMPLATES]);
  assertEquals(fastrTemplateIds(), ["policy_brief", "long_form", "empty"]);
  for (const template of fastrTemplateIds()) {
    assert(reportConfigSchema.safeParse({ template }).success, template);
  }
  for (const bad of ["nonsense", "", 3]) {
    assert(
      !reportConfigSchema.safeParse({ template: bad }).success,
      `accepted ${JSON.stringify(bad)}`,
    );
  }
});

// What the engine's own tests hold its built-ins to, held here for the theme
// the platform owns. Its accent is the one exemption: the panther link blue,
// at full saturation, because muting it would make a converted report a
// different document.
Deno.test("the legacy theme is its own tokens, not the default's", () => {
  const t = fastrThemeTokens("legacy");
  assert(t !== fastrThemeTokens("default"));
  assertEquals(t.palette, {
    paper: "#ffffff",
    ink: "#2a2a2a",
    accent: "#0066cc",
    warm: "#9c5a4d",
  });
  assertEquals(t.page, "#ffffff");
  assertEquals(t.semantic.danger, "#9c5a4d");
  assertEquals(t.chart.good, "#0066cc");
  // Its extra rules name the four, never a colour of their own, and never
  // re-cut a heading's font metrics (those go in `headings`).
  assert(!/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black)\b/i.test(t.extraCss));
  for (const line of t.extraCss.split("\n")) {
    const sel = line.split("{")[0];
    if (!/^h[1-6]\b|,\s*h[1-6]\b/.test(sel)) continue;
    assert(!/\b(font-size|line-height)\s*:/.test(line), line);
  }
  const vars = buildFastrThemeVarsCss(t);
  assertStringIncludes(vars, "--fm-h1-size: 1.65em;");
  assertStringIncludes(vars, "--fm-h1-weight: 800;");
  assertStringIncludes(vars, "--fm-h4-weight: 400;");
  const css = buildFastrReportCss("legacy");
  assert(css.startsWith("@import url('https://fonts.googleapis.com/css2?"));
  assertStringIncludes(css, "--fm-accent: #0066cc;");
  assertStringIncludes(css, "table { width: auto;");
  assert(css !== buildFastrReportCss("default"));
});

// The whole theme as written, pinned. Report Forge's own baseline covers the
// engine on its ten themes and cannot see this one, so the two together are
// what says a `legacy` report renders as it did: the engine unchanged there,
// the theme unchanged here. The value was taken when the theme moved out of
// the engine, with its rendered output identical before and after. A change
// to the theme that is meant updates it.
Deno.test("the legacy theme is the one that moved out of the engine", async () => {
  const spec = fastrRegisteredTheme("legacy")?.tokens;
  assert(spec !== undefined);
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(spec)),
    ),
  );
  assertEquals(
    [...digest].map((b) => b.toString(16).padStart(2, "0")).join(""),
    "92a3a6ca4e389ea412f004b6c7628404b6c5a5fdf06820f84b04b983fc54383e",
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

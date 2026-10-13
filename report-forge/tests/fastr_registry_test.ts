// Pins the two registries a host extends: document themes
// (report-forge/engine/report_fastr_themes.ts, registerFastrTheme) and
// starting templates (report-forge/engine/fastr_report_templates.ts,
// registerFastrTemplate). The registries are module state, so every test
// here uses ids of its own and none depends on another having run.
//
// Run: deno test -A report-forge/tests/fastr_registry_test.ts

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  FASTR_REPORT_TEMPLATES,
  fastrRegisteredTemplate,
  fastrReportTemplateBody,
  fastrReportTemplateBrief,
  fastrTemplateIds,
  isFastrReportTemplate,
  registerFastrTemplate,
} from "../engine/fastr_report_templates.ts";
import {
  buildFastrReportCss,
  buildFastrThemeVarsCss,
  fastrAllFontImportsCss,
} from "../engine/report_fastr_css.ts";
import {
  FASTR_REPORT_THEMES,
  FASTR_THEME_TOKENS,
  fastrChartPalette,
  fastrRegisteredTheme,
  fastrThemeIds,
  type FastrThemeRegistration,
  fastrThemeTokens,
  isFastrReportTheme,
  registerFastrTheme,
} from "../engine/report_fastr_themes.ts";
import { setReportForgeLanguage } from "../engine/i18n.ts";
import {
  fastrTemplateCaption,
  fastrTemplateLabel,
  fastrThemeCaption,
  fastrThemeLabel,
} from "../ui/screen/fastr_theme_labels.ts";

function houseTheme(accent: string): FastrThemeRegistration {
  return {
    label: { en: "House", fr: "Maison" },
    caption: { en: "The house style", fr: "Le style maison", pt: "O estilo" },
    tokens: {
      scheme: "light",
      palette: { paper: "#fdfdfd", ink: "#202020", accent, warm: "#8a5a4a" },
      fontImport:
        "@import url('https://fonts.example/css2?family=House&display=swap');",
      fontBody: "House, sans-serif",
      fontHeading: "House, sans-serif",
      radius: "2px",
      borderWidth: "1px",
      headingWeight: "700",
      headingTracking: "0em",
      headingCase: "none",
      measure: "50rem",
      headings: { h1: { size: "1.9em", weight: "800" }, h4: { weight: "400" } },
      extraCss: `
h2 { border-bottom: 2px solid var(--fm-accent); }
`,
    },
  };
}

Deno.test("an unregistered theme id is not a theme and renders as the default", () => {
  assert(!isFastrReportTheme("nobody_registered_this"));
  assert(!fastrThemeIds().includes("nobody_registered_this"));
  assertEquals(
    fastrThemeTokens("nobody_registered_this"),
    FASTR_THEME_TOKENS.default,
  );
  assertEquals(
    buildFastrReportCss("nobody_registered_this"),
    buildFastrReportCss("default"),
  );
  assertEquals(
    fastrChartPalette("nobody_registered_this"),
    fastrChartPalette("default"),
  );
  // A name every object has is not a theme either.
  assert(!isFastrReportTheme("constructor"));
  assertEquals(fastrThemeTokens("constructor"), FASTR_THEME_TOKENS.default);
  // Its label is the id, so a picker never shows a blank tile.
  assertEquals(
    fastrThemeLabel("nobody_registered_this"),
    "nobody_registered_this",
  );
  assertEquals(fastrThemeCaption("nobody_registered_this"), "");
});

Deno.test("a registered theme is valid, listed after the built-ins, and builds", () => {
  registerFastrTheme("house", houseTheme("#35618f"));

  assert(isFastrReportTheme("house"));
  const ids = fastrThemeIds();
  assertEquals(ids.slice(0, FASTR_REPORT_THEMES.length), [
    ...FASTR_REPORT_THEMES,
  ]);
  assertEquals(ids[ids.length - 1], "house");
  // The static list is the built-ins and stays so.
  assertEquals(FASTR_REPORT_THEMES.length, 10);
  assert(!(FASTR_REPORT_THEMES as readonly string[]).includes("house"));

  // Its tokens are the spec plus the colours mixed from its four, exactly
  // as a built-in's are, and both lookups reach them.
  const t = fastrThemeTokens("house");
  assertEquals(FASTR_THEME_TOKENS.house, t);
  assertEquals(t.page, "#fdfdfd");
  assertEquals(t.accent, "#35618f");
  assertEquals(t.semantic.danger, "#8a5a4a");
  assertEquals(t.chart.series[0], "#35618f");
  assertEquals(t.grounds.ink.ink, "#fdfdfd");

  // The stylesheet is the theme's own, font import first.
  const css = buildFastrReportCss("house");
  assert(css.startsWith("@import url('https://fonts.example/"));
  assertStringIncludes(css, "--fm-accent: #35618f;");
  assertStringIncludes(
    css,
    "h2 { border-bottom: 2px solid var(--fm-accent); }",
  );
  assert(css !== buildFastrReportCss("default"));
  // Scoped for a picker tile, its own rules are scoped with it.
  const scoped = buildFastrReportCss("house", undefined, ".fmt-house", {
    omitFontImport: true,
  });
  assertStringIncludes(scoped, ".fmt-house h2 { border-bottom:");
  // A heading it re-cuts is re-cut in the tokens every sheet reads.
  const vars = buildFastrThemeVarsCss(t);
  assertStringIncludes(vars, "--fm-h1-size: 1.9em;");
  assertStringIncludes(vars, "--fm-h1-weight: 800;");
  assertStringIncludes(vars, "--fm-h4-weight: 400;");
  assertStringIncludes(vars, "--fm-h2-size: 1.55em;");
  // The picker's shared sheet leads with its font import too.
  assertStringIncludes(fastrAllFontImportsCss(), "fonts.example");
  assertEquals(fastrChartPalette("house").good, "#35618f");

  // Its strings are the ones it registered, in the page's language.
  assertEquals(fastrRegisteredTheme("house")?.label.en, "House");
  assertEquals(fastrRegisteredTheme("default"), undefined);
  assertEquals(fastrThemeLabel("house"), "House");
  assertEquals(fastrThemeCaption("house"), "The house style");
  setReportForgeLanguage("fr");
  try {
    assertEquals(fastrThemeLabel("house"), "Maison");
    assertEquals(fastrThemeLabel("default"), "Par défaut");
  } finally {
    setReportForgeLanguage("en");
  }
});

Deno.test("registering a theme again replaces it and keeps its place", () => {
  registerFastrTheme("first_house", houseTheme("#35618f"));
  registerFastrTheme("second_house", houseTheme("#2f6f5e"));
  const before = fastrThemeIds();

  registerFastrTheme("first_house", houseTheme("#7a4a8c"));
  assertEquals(fastrThemeIds(), before);
  assert(
    before.indexOf("first_house") < before.indexOf("second_house"),
    "registration order is the listing order",
  );
  assertEquals(fastrThemeTokens("first_house").accent, "#7a4a8c");
  assertEquals(fastrThemeTokens("first_house").chart.good, "#7a4a8c");
  assertStringIncludes(
    buildFastrReportCss("first_house"),
    "--fm-accent: #7a4a8c;",
  );
});

Deno.test("a theme started from another's tokens is mixed from its own four", () => {
  const corporate = fastrThemeTokens("corporate");
  const palette = {
    paper: "#101418",
    ink: "#f2efe8",
    accent: "#d9a441",
    warm: "#c9705a",
  };
  registerFastrTheme("corporate_night", {
    label: { en: "Night", fr: "Nuit" },
    caption: { en: "Corporate, dark", fr: "Institutionnel, sombre" },
    tokens: { ...corporate, scheme: "dark", palette },
  });
  const t = fastrThemeTokens("corporate_night");
  // The type and the extra rules are the ones it borrowed...
  assertEquals(t.fontHeading, corporate.fontHeading);
  assertEquals(t.extraCss, corporate.extraCss);
  // ...and no colour is: every derived one is re-mixed from the new four.
  assertEquals(t.page, "#101418");
  assertEquals(t.ink, "#f2efe8");
  assertEquals(t.accent, "#d9a441");
  assertEquals(t.semantic.danger, "#c9705a");
  assertEquals(t.chart.series[0], "#d9a441");
  assertEquals(t.grounds.ink.color, "#f2efe8");
  assert(t.border !== corporate.border);
  assert(t.surface !== corporate.surface);
  // The same keys, in the same order, as the theme it started from.
  assertEquals(Object.keys(t), Object.keys(corporate));
  // The built-in it borrowed from is untouched.
  assertEquals(fastrThemeTokens("corporate"), corporate);
  assertEquals(corporate.page, "#f7f8fa");
});

Deno.test("a built-in's id and an unusable id cannot be registered", () => {
  const before = FASTR_THEME_TOKENS.default;
  assertThrows(() => registerFastrTheme("default", houseTheme("#35618f")));
  assertEquals(FASTR_THEME_TOKENS.default, before);
  for (const id of ["", "my theme", "9lives", "a.b", "é"]) {
    assertThrows(() => registerFastrTheme(id, houseTheme("#35618f")), id);
    assert(!isFastrReportTheme(id), id);
  }
  assertThrows(() =>
    registerFastrTemplate("empty", {
      label: { en: "x", fr: "x" },
      caption: { en: "x", fr: "x" },
      body: () => "",
    })
  );
  assertThrows(() =>
    registerFastrTemplate("my template", {
      label: { en: "x", fr: "x" },
      caption: { en: "x", fr: "x" },
      body: () => "",
    })
  );
});

Deno.test("a registered template is valid, listed after the built-ins, and its body is used", () => {
  assert(!isFastrReportTemplate("memo"));
  assertEquals(fastrReportTemplateBody("memo", "Q3"), "");
  assertEquals(fastrReportTemplateBrief("memo"), "");

  registerFastrTemplate("memo", {
    label: { en: "Memo", fr: "Note" },
    caption: { en: "One page, to one reader", fr: "Une page" },
    body: (title) => `# ${title}\n\n[To whom]{.muted}\n`,
    brief: "## This report is a MEMO\n\nOne page.",
  });

  assert(isFastrReportTemplate("memo"));
  const ids = fastrTemplateIds();
  assertEquals(ids.slice(0, FASTR_REPORT_TEMPLATES.length), [
    ...FASTR_REPORT_TEMPLATES,
  ]);
  assertEquals(ids[ids.length - 1], "memo");
  assertEquals(FASTR_REPORT_TEMPLATES.length, 3);

  assertEquals(
    fastrReportTemplateBody("memo", "Q3"),
    "# Q3\n\n[To whom]{.muted}\n",
  );
  // The title reaches it the way it reaches a built-in: one line, never
  // empty.
  assertEquals(
    fastrReportTemplateBody("memo", " Q3\nreview "),
    "# Q3 review\n\n[To whom]{.muted}\n",
  );
  assert(fastrReportTemplateBody("memo", "").startsWith("# Report\n"));
  assertEquals(
    fastrReportTemplateBrief("memo"),
    "## This report is a MEMO\n\nOne page.",
  );
  assertEquals(fastrRegisteredTemplate("memo")?.label.fr, "Note");
  assertEquals(fastrTemplateLabel("memo"), "Memo");
  assertEquals(fastrTemplateCaption("memo"), "One page, to one reader");
  // The built-ins are untouched.
  assertEquals(fastrReportTemplateBody("empty", "Q3"), "");
  assertStringIncludes(fastrReportTemplateBrief("policy_brief"), "POLICY");
  assertEquals(fastrTemplateLabel("empty"), "Empty");

  // Registering it again replaces the body and keeps its place; a template
  // without a brief has none.
  registerFastrTemplate("memo", {
    label: { en: "Memo", fr: "Note" },
    caption: { en: "One page", fr: "Une page" },
    body: (title) => `# ${title}\n`,
  });
  assertEquals(fastrTemplateIds(), ids);
  assertEquals(fastrReportTemplateBody("memo", "Q3"), "# Q3\n");
  assertEquals(fastrReportTemplateBrief("memo"), "");
});

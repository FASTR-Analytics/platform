// Pins FASTR Markdown: the `:::` container syntax (lib/fastr_markdown_blocks.ts),
// its markdown-it compiler (lib/report_fastr_markdown.ts), the theme
// stylesheets (lib/report_fastr_css.ts) and the format's place in the shared
// report helpers. The compiled HTML feeds the SAME sanitize → iframe → export
// funnel as html-format reports, so what survives DOMPurify is part of the
// contract, not an implementation detail.
//
// Run: deno test -A server/tests/report_fastr_markdown_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  containerHtmlFor,
  FASTR_BLOCK_NAMES,
  isFastrLeafBlock,
  listFastrContainerDefects,
  parseContainerAttrs,
  parseContainerFence,
} from "../../lib/fastr_markdown_blocks.ts";
import { renderFastrMarkdownToHtml } from "../../lib/report_fastr_markdown.ts";
import {
  buildFastrReportCss,
  fastrAllFontImportsCss,
} from "../../lib/report_fastr_css.ts";
import {
  FASTR_REPORT_THEMES,
  FASTR_THEME_TOKENS,
} from "../../lib/types/report_fastr_themes.ts";
import {
  buildReportPreview,
  findReportEmbeds,
  getFastrReportTheme,
  getReportFormat,
  getStartingBodyForReport,
  getStartingConfigForReport,
  reportConfigSchema,
  reportRendersAsHtml,
} from "../../lib/types/reports.ts";
import {
  findReportHeadings,
  spliceReportSection,
} from "../../lib/report_sections.ts";

const render = (md: string) =>
  renderFastrMarkdownToHtml(md, { lineAnchors: false });

// ── Fence parsing ────────────────────────────────────────────────────────────

Deno.test("parseContainerFence: opens, closes, and non-fences", () => {
  assertEquals(parseContainerFence(":::callout"), {
    kind: "open",
    markerLength: 3,
    name: "callout",
    attrs: {},
  });
  assertEquals(parseContainerFence("::::tiles"), {
    kind: "open",
    markerLength: 4,
    name: "tiles",
    attrs: {},
  });
  assertEquals(parseContainerFence(":::"), {
    kind: "close",
    markerLength: 3,
  });
  // Two colons is not a fence; a bare fence with attributes is neither an open
  // (no name) nor a close, so it stays ordinary text.
  assertEquals(parseContainerFence("::"), undefined);
  assertEquals(parseContainerFence(":::{x=1}"), undefined);
  assertEquals(parseContainerFence("text :::callout"), undefined);
});

Deno.test("parseContainerAttrs: quoted values, bare values and flags", () => {
  assertEquals(
    parseContainerAttrs(`{kind=warning title="Two words" accent cols=3 dir='up'}`),
    { kind: "warning", title: "Two words", accent: true, cols: "3", dir: "up" },
  );
  assertEquals(parseContainerAttrs("{}"), {});
});

// ── Markup ───────────────────────────────────────────────────────────────────

Deno.test("containerHtmlFor: known blocks carry their taxonomy classes", () => {
  assertEquals(
    containerHtmlFor("callout", { kind: "warning" }).className,
    "fm-callout fm-callout--warning",
  );
  // An unknown kind falls back rather than emitting a bogus modifier class.
  assertEquals(
    containerHtmlFor("callout", { kind: "purple" }).className,
    "fm-callout fm-callout--note",
  );
  assertEquals(containerHtmlFor("tiles", {}).className, "fm-tiles fm-tiles--3");
  assertEquals(
    containerHtmlFor("tiles", { cols: "9" }).className,
    "fm-tiles fm-tiles--4",
  );
  assertEquals(containerHtmlFor("quote", {}).tag, "blockquote");
  assertEquals(
    containerHtmlFor("col", { span: "2" }).className,
    "fm-col fm-col--span2",
  );
  // Unknown names still group their content instead of swallowing it.
  assertEquals(containerHtmlFor("wat", {}).tag, "div");
  assertStringIncludes(containerHtmlFor("wat", {}).className, "fm-block");
});

Deno.test("containerHtmlFor: attribute text is entity-escaped", () => {
  const h = containerHtmlFor("callout", { title: `<script>x</script>` });
  assertStringIncludes(h.leadingHtml, "&lt;script&gt;");
  assert(!h.leadingHtml.includes("<script>"));
});

Deno.test("stat is a leaf block: one line, no closing fence", () => {
  assert(isFastrLeafBlock("stat"));
  for (const name of FASTR_BLOCK_NAMES) {
    if (name !== "stat") assert(!isFastrLeafBlock(name));
  }
  const html = render(`:::stat{value="64%" label="ANC4" delta="+3pp" dir=up}\n`);
  assertStringIncludes(html, `<div class="fm-stat"`);
  assertStringIncludes(html, `<div class="fm-stat__value">64%</div>`);
  assertStringIncludes(html, `fm-stat__delta--up">+3pp</div>`);
  assertStringIncludes(html, "</div>");
});

// ── Compiler ─────────────────────────────────────────────────────────────────

Deno.test("containers nest at the same marker length", () => {
  const html = render(
    `:::columns{cols=2}\n:::col\n:::callout{kind=note}\ndeep\n:::\n:::\n:::col\nb\n:::\n:::\n`,
  );
  assertStringIncludes(html, `<div class="fm-columns fm-columns--2">`);
  assertStringIncludes(html, `<div class="fm-callout fm-callout--note">`);
  // Two cols opened and closed, plus the callout and the wrapper.
  assertEquals(html.match(/<div class="fm-col">/g)?.length, 2);
});

Deno.test("a fence interrupts a paragraph", () => {
  const html = render("Text line\n:::callout{kind=info}\nInside\n:::\nAfter\n");
  assertStringIncludes(html, "<p>Text line</p>");
  assertStringIncludes(html, `<div class="fm-callout fm-callout--info">`);
  assertStringIncludes(html, "<p>After</p>");
});

Deno.test("an unclosed container runs to EOF and is reported as a defect", () => {
  const md = "# T\n\n:::tiles{cols=2}\n:::card\nx\n";
  const html = render(md);
  assertStringIncludes(html, `<div class="fm-tiles fm-tiles--2">`);
  assertStringIncludes(html, `<div class="fm-card">`);
  assertEquals(listFastrContainerDefects(md).map((d) => d.line), [3, 4]);
});

Deno.test("a stray close and an unknown block name are defects", () => {
  assertEquals(listFastrContainerDefects("# T\n\n:::\n").length, 1);
  const unknown = listFastrContainerDefects(":::wat\ny\n:::\n");
  assertEquals(unknown.length, 1);
  assertStringIncludes(unknown[0].message, "Unknown block");
});

Deno.test("fences inside a code block are literal text", () => {
  assertEquals(listFastrContainerDefects("```\n:::tiles\n```\n"), []);
  const html = render("```\n:::tiles\n```\n");
  assertStringIncludes(html, "<pre><code>:::tiles");
  assert(!html.includes("fm-tiles"));
});

Deno.test("an embed alone on a line becomes a captioned figure", () => {
  const html = render("![Trend in ANC4](figure:abc-123)\n");
  assertStringIncludes(html, `<figure class="fm-figure">`);
  assertStringIncludes(html, `<img src="figure:abc-123" alt="Trend in ANC4">`);
  assertStringIncludes(
    html,
    `<figcaption class="fm-figure__caption">Trend in ANC4</figcaption>`,
  );
  // No caption → no empty figcaption.
  assert(!render("![](figure:abc)\n").includes("figcaption"));
  // A plain web image is NOT an embed and stays an ordinary paragraph.
  assert(!render("![alt](https://e.org/a.png)\n").includes("fm-figure"));
});

Deno.test("line anchors are markdown source lines, 0-based", () => {
  const html = renderFastrMarkdownToHtml(
    "# H\n\nPara\n\n:::callout{kind=note}\nIn\n:::\n",
    { lineAnchors: true },
  );
  assertStringIncludes(html, `<h1 data-line="0">`);
  assertStringIncludes(html, `<p data-line="2">`);
  assertStringIncludes(html, `data-line="4"`);
  // Off by default, so exports and diffs stay clean.
  assert(!render("# H\n").includes("data-line"));
});

// ── Sections ─────────────────────────────────────────────────────────────────

const SECTIONED = `# Report

Intro.

## Findings

Text.

:::tiles{cols=2}
:::card{title="A"}
### Inner heading
x
:::
:::

More text.

## Recommendations

Do things.
`;

Deno.test("headings inside a container are not addressable sections", () => {
  const texts = findReportHeadings(SECTIONED, "fastr").map((h) => h.text);
  assertEquals(texts, ["Report", "Findings", "Recommendations"]);
  // Plain markdown is deliberately UNCHANGED — it still sees every `#` line.
  assert(
    findReportHeadings(SECTIONED, "markdown").map((h) => h.text).includes(
      "Inner heading",
    ),
  );
});

Deno.test("a section splice never cuts a container in half", () => {
  const res = spliceReportSection(
    SECTIONED,
    "fastr",
    "Findings",
    "## Findings\n\nReplaced.\n",
    undefined,
  );
  assert(!("error" in res));
  assert(!res.newBody.includes(":::"));
  assertStringIncludes(res.newBody, "## Recommendations");
  assertEquals(listFastrContainerDefects(res.newBody), []);
});

// ── Format plumbing ──────────────────────────────────────────────────────────

Deno.test("getReportFormat stays total with three values", () => {
  assertEquals(getReportFormat({ format: "fastr" }), "fastr");
  assertEquals(getReportFormat({ format: "html" }), "html");
  assertEquals(getReportFormat({}), "markdown");
  assertEquals(
    getReportFormat({ format: "FASTR" as unknown as "fastr" }),
    "markdown",
  );
  assert(reportRendersAsHtml("fastr"));
  assert(reportRendersAsHtml("html"));
  assert(!reportRendersAsHtml("markdown"));
});

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
  const config = getStartingConfigForReport(
    "fastr",
    "default",
    undefined,
    "ministry",
  );
  assertEquals(config.format, "fastr");
  assertEquals(config.fastrTheme, "ministry");
  assertEquals(reportConfigSchema.parse(config).fastrTheme, "ministry");
});

Deno.test("the seeded body demonstrates the syntax and is well formed", () => {
  const body = getStartingBodyForReport("My report", "fastr");
  assertStringIncludes(body, "# My report");
  assertStringIncludes(body, ":::callout{");
  assertStringIncludes(body, ":::tiles{");
  assertEquals(listFastrContainerDefects(body), []);
  const html = render(body);
  assertStringIncludes(html, "fm-callout");
  assertStringIncludes(html, "fm-stat__value");
});

Deno.test("embed helpers treat fastr as markdown", () => {
  const body = ":::card\n![Cap](figure:abc)\n:::\n";
  const refs = findReportEmbeds(body, "fastr");
  assertEquals(refs.length, 1);
  assertEquals(refs[0].id, "abc");
  assertEquals(refs[0].caption, "Cap");
});

Deno.test("the list-card preview skips fence lines", () => {
  const preview = buildReportPreview(
    "# T\n\n:::callout{kind=note}\nInside text.\n:::\n",
    "fastr",
  );
  assertEquals(preview.lines.map((l) => l.text), ["T", "Inside text."]);
});

// ── Themes ───────────────────────────────────────────────────────────────────

Deno.test("every theme builds a stylesheet, scoped and unscoped", () => {
  for (const theme of FASTR_REPORT_THEMES) {
    const css = buildFastrReportCss(theme);
    // @import must lead the sheet or the browser drops it.
    if (FASTR_THEME_TOKENS[theme].fontImport.length > 0) {
      assert(css.startsWith("@import"), `${theme} font import is not first`);
    }
    assertStringIncludes(css, "--fm-accent:");
    assertStringIncludes(css, ".fm-callout {");
    assertStringIncludes(css, ".fm-stat__value {");

    const scoped = buildFastrReportCss(theme, undefined, ".tile", {
      omitFontImport: true,
    });
    assert(!scoped.includes("@import"));
    assertStringIncludes(scoped, ".tile .fm-callout {");
    // Nothing may escape the scope onto the app's own document.
    assert(!/(^|\n)\.fm-/.test(scoped), `${theme} leaks an unscoped rule`);
    assert(!/(^|\n)(html|body|h1) /.test(scoped), `${theme} leaks an element rule`);
  }
});

Deno.test("a custom style's palette overrides the theme's", () => {
  const css = buildFastrReportCss("swiss", {
    page: "#101010",
    ink: "#fafafa",
    accent: "#00ffcc",
  });
  assertStringIncludes(css, "--fm-page: #101010;");
  assertStringIncludes(css, "--fm-ink: #fafafa;");
  assertStringIncludes(css, "--fm-accent: #00ffcc;");
});

Deno.test("font imports are deduped for a concatenated multi-theme sheet", () => {
  const all = fastrAllFontImportsCss();
  const lines = all.split("\n").filter((l) => l.length > 0);
  assertEquals(lines.length, new Set(lines).size);
  assert(lines.every((l) => l.startsWith("@import")));
});

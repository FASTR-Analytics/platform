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
  fastrDocumentOutline,
  FASTR_BLOCK_NAMES,
  FASTR_COVER_LAYOUTS,
  FASTR_INK_ROLES,
  FASTR_TONES,
  fastrContainerStackUpTo,
  fastrOpenFenceOnLine,
  serializeContainerFence,
  updateContainerFenceLine,
  isDarkCssColor,
  isFastrLeafBlock,
  listFastrContainerDefects,
  listFastrLiteralBackgrounds,
  parseContainerAttrs,
  parseContainerFence,
  parseFastrMarkAttrs,
  serializeFastrMarkAttrs,
  isDarkCssBackground,
  readFastrDocumentSettings,
  safeCssBackground,
  safeCssColor,
  safeCssGradient,
  fastrToneOf,
} from "../../lib/fastr_markdown_blocks.ts";
import { renderFastrMarkdownToHtml } from "../../lib/report_fastr_markdown.ts";
import {
  buildFastrCoverTileCss,
  buildFastrEditorSurfaceCss,
  buildFastrReportCss,
  fastrAllFontImportsCss,
} from "../../lib/report_fastr_css.ts";
import {
  coverSnippet,
  FASTR_COVER_PRESETS,
} from "../../lib/fastr_markdown_edits.ts";
import {
  fastrChartPalette,
  FASTR_REPORT_THEMES,
  FASTR_THEME_TOKENS,
  FASTR_GROUNDS,
} from "../../lib/types/report_fastr_themes.ts";
import { LEGACY_CF_PRESETS } from "../../lib/legacy_cf_presets.ts";
import { themeConditionalFormatting } from "../../lib/types/conditional_formatting.ts";
import { _CF_LIGHTER_GREEN, _CF_LIGHTER_RED, _CF_LIGHTER_YELLOW } from "../../lib/key_colors.ts";
import { getAdjustedColor } from "@timroberton/panther";

import {
  buildReportPreview,
  referencedReportEmbedIds,
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

Deno.test("stat, contents, pagebreak and report are leaf blocks: one line, no closing fence", () => {
  const leaves = ["stat", "contents", "pagebreak", "report"];
  for (const name of leaves) assert(isFastrLeafBlock(name));
  for (const name of FASTR_BLOCK_NAMES) {
    if (!leaves.includes(name)) assert(!isFastrLeafBlock(name));
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

Deno.test("listFastrLiteralBackgrounds finds literals, never tones", () => {
  const md = [
    ":::report{background=muted}",
    ":::band{tone=ink}",
    "x",
    ":::",
    ':::card{bg="#0b3d2e"}',
    "y",
    ":::",
    ':::cover{background="linear-gradient(180deg,#111,#222)"}',
    "# t",
    ":::",
    ":::callout{bg=image:abc overlay=dark}",
    "z",
    ":::",
    "```",
    ':::card{bg="#ffffff"}',
    "```",
  ].join("\n");
  assertEquals(listFastrLiteralBackgrounds(md), [
    { line: 5, attr: "bg", value: "#0b3d2e" },
    { line: 8, attr: "bg", value: "linear-gradient(180deg,#111,#222)" },
    { line: 11, attr: "bg", value: "image:abc" },
  ]);
  assertEquals(listFastrLiteralBackgrounds(":::band{tone=warm}\nx\n:::\n"), []);
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
  assertStringIncludes(html, `<h1 class="fm-top" data-line="0">`);
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

// ── Blank lines as space ────────────────────────────────────────────────────

Deno.test("a blank line beyond the separator is a line of space, anchored to its source line", () => {
  const html = (body: string) => renderFastrMarkdownToHtml(body, { lineAnchors: true });
  const spaces = (out: string) => [...out.matchAll(/<div class="fm-space" data-line="(\d+)"><\/div>/g)].map((m) => Number(m[1]));
  // One blank line is the paragraph separator: nothing.
  assertEquals(spaces(html("a\n\nb\n")), []);
  // Each further one is a line of space, on its own source line.
  assertEquals(spaces(html("a\n\n\n\nb\n")), [2, 3]);
  // Leading blank lines render nothing (the editor collapses them), and
  // the silent header does not start the count.
  assertEquals(spaces(html("\n\n\na\n")), []);
  assertEquals(spaces(html(":::report{width=wide}\n\n\n\na\n")), []);
  // Trailing blank lines count, as the editor shows them.
  assertEquals(spaces(html("a\n\n\n")), [2, 3]);
  // Inside a container the fence line is the block's own; after it, the same
  // rule. After the closing fence, the same rule.
  assertEquals(spaces(html(":::band\n\n\ntext\n:::\n\n\nb\n")), [2, 6]);
  // A list and a heading consume their lines like a paragraph.
  assertEquals(spaces(html("## H\n\n\n- a\n- b\n\n\n\nc\n")), [2, 6, 7]);
  // The space survives the sanitizer with its anchor (report_html_sanitize_test
  // pins that) and carries no text, so a page can start on it.
  assertStringIncludes(html("a\n\n\nb\n"), '<div class="fm-space" data-line="2"></div>');
});

// ── Backgrounds: tones, literals and images ─────────────────────────────────

Deno.test("tone is understood by every block and names a role, not a colour", () => {
  for (const tone of FASTR_TONES) {
    const cls = containerHtmlFor("band", { tone }).className;
    if (tone === "default") {
      assert(!cls.includes("fm-tone"), "default must add no tone class");
    } else {
      assertStringIncludes(cls, `fm-tone fm-tone--${tone}`);
    }
    // No literal colour ever reaches the markup for a tone.
    assertEquals(containerHtmlFor("band", { tone }).style, "");
  }
  assertStringIncludes(
    containerHtmlFor("card", { tone: "ink" }).className,
    "fm-card fm-tone fm-tone--ink",
  );
  // An unknown tone degrades to the mildest one rather than emitting a class
  // no stylesheet defines.
  assertStringIncludes(
    containerHtmlFor("band", { tone: "chartreuse" }).className,
    "fm-tone--paper",
  );
});

Deno.test("the older tone spellings still render, each as one of the five", () => {
  for (
    const [old, now] of [
      ["muted", "paper"],
      ["solid", "accent"],
      ["dark", "ink"],
      ["inverse", "ink"],
      ["gradient", "ink"],
      ["danger", "warm"],
      ["warning", "warm"],
      ["success", "cool"],
      ["info", "accent"],
    ] as const
  ) {
    assertEquals(fastrToneOf(old), now);
    assertEquals(fastrToneOf(old.toUpperCase()), now);
    assertStringIncludes(
      containerHtmlFor("band", { tone: old }).className,
      `fm-tone fm-tone--${now}`,
    );
    assertEquals(listFastrContainerDefects(`:::band{tone=${old}}\nx\n:::\n`), []);
  }
  assertEquals(fastrToneOf("chartreuse"), undefined);
  assertEquals(fastrToneOf(true), undefined);
  // The card's historical flag is the accent tone.
  assertStringIncludes(
    containerHtmlFor("card", { accent: true }).className,
    "fm-card fm-tone fm-tone--accent",
  );
  // The page background takes an old spelling too.
  assertStringIncludes(
    readFastrDocumentSettings(":::report{background=muted}\n").className,
    "fm-tone--paper",
  );
});

Deno.test("a literal bg is validated and its ink follows the luminance", () => {
  const dark = containerHtmlFor("band", { bg: "#0b3d2e" });
  assertEquals(dark.style, "background-color: #0b3d2e");
  assertStringIncludes(dark.className, "fm-ink--light");

  const light = containerHtmlFor("band", { bg: "#fef3c7" });
  assertStringIncludes(light.className, "fm-ink--dark");

  // An explicit ink wins over the luminance guess.
  assertStringIncludes(
    containerHtmlFor("band", { bg: "#fef3c7", ink: "light" }).className,
    "fm-ink--light",
  );

  // Anything that is not a colour literal is dropped — the style attribute
  // must never become a second declaration.
  assertEquals(safeCssColor("url(x)"), undefined);
  assertEquals(safeCssColor("red; background-image: url(x)"), undefined);
  assertEquals(safeCssColor("#0b3d2e"), "#0b3d2e");
  assertEquals(safeCssColor("rgb(11 61 46)"), "rgb(11 61 46)");
  assertEquals(containerHtmlFor("band", { bg: "url(evil.png)" }).style, "");

  assertEquals(isDarkCssColor("#000"), true);
  assertEquals(isDarkCssColor("#fff"), false);
  assertEquals(isDarkCssColor("not-a-colour"), undefined);
});

Deno.test("bg=image resolves through the image registry, not the stylesheet", () => {
  const h = containerHtmlFor("band", { bg: "image:abc-123" });
  assertStringIncludes(h.extraAttrs, 'data-bg-image="image:abc-123"');
  assertStringIncludes(h.className, "fm-has-bgimage");
  // A photo gets a scrim and light ink unless told otherwise.
  assertStringIncludes(h.className, "fm-overlay--dark");
  assertStringIncludes(h.className, "fm-ink--light");
  assertEquals(h.style, "");
  assertStringIncludes(
    containerHtmlFor("band", { bg: "image:abc", overlay: "none" }).className,
    "fm-has-bgimage",
  );
  assert(
    !containerHtmlFor("band", { bg: "image:abc", overlay: "none" }).className
      .includes("fm-overlay"),
  );
  // The source token stays in the body, so the orphan prune keeps the asset.
  const body = ":::band{bg=image:abc-123}\nx\n:::\n";
  assert(referencedReportEmbedIds(body, "any").images.has("abc-123"));
});

Deno.test("literal colours are listed from blocks AND phrase marks, with their attribute", () => {
  const body = [
    ':::band{bg="#101010"}',
    "Text [hot]{color=#c62828} and [lit]{highlight=yellow} and [role]{.danger}.",
    ":::",
    ":::callout{tone=paper}",
    "A tone is not a literal.",
    ":::",
    "```",
    ':::band{bg="#000"}',
    "```",
  ].join("\n");
  const found = listFastrLiteralBackgrounds(body);
  assertEquals(found, [
    { line: 1, attr: "bg", value: "#101010" },
    { line: 2, attr: "color", value: "#c62828" },
    { line: 2, attr: "highlight", value: "yellow" },
  ]);
});

Deno.test("the document header carries print setup and section numbering", () => {
  // Defaults, with no header at all.
  const bare = readFastrDocumentSettings("# Hi\n");
  assertEquals(bare.page, { size: "a4", orientation: "portrait", margin: "normal" });
  assertStringIncludes(bare.pageCss, "@page { size: 210mm 297mm; margin: 18mm; }");
  assertEquals(bare.className, "");
  // Landscape letter with wide margins, and numbering on.
  const set = readFastrDocumentSettings(
    ":::report{pagesize=letter orientation=landscape margin=wide numbering=sections}\n",
  );
  assertEquals(set.page, { size: "letter", orientation: "landscape", margin: "wide" });
  assertStringIncludes(set.pageCss, "@page { size: 279mm 216mm; margin: 28mm; }");
  assertStringIncludes(set.className, "fm-doc--numbered");
  // Junk values fall back rather than reaching the stylesheet.
  const junk = readFastrDocumentSettings(
    ":::report{pagesize=poster orientation=sideways margin=huge numbering=all}\n",
  );
  assertEquals(junk.page, { size: "a4", orientation: "portrait", margin: "normal" });
  assert(!junk.className.includes("fm-doc--numbered"));
  // The numbering rules exist, and count only top-level headings.
  const css = buildFastrReportCss("default");
  assertStringIncludes(css, ".fm-doc--numbered body > h2::before");
  assertStringIncludes(css, ".fm-doc--numbered body > h3::before");
  assert(!css.includes(".fm-doc--numbered h2::before"));
});

Deno.test("a table of contents is built from the document's own headings", () => {
  const body = [
    ":::cover{tone=ink}",
    "# Report title",
    ":::",
    "",
    ':::contents{title="Contents" depth=2}',
    "",
    "## Overview",
    "",
    "### Detail",
    "",
    "## Findings",
    "",
    ":::band{tone=ink}",
    "## Findings",
    ":::",
    "",
    "```",
    "## Not a heading",
    "```",
  ].join("\n");
  const html = renderFastrMarkdownToHtml(body, { lineAnchors: false });
  assertStringIncludes(html, '<nav class="fm-toc">');
  assertStringIncludes(html, '<div class="fm-toc__title">Contents</div>');
  // The cover's title is the title page, not a section; a code fence is text;
  // the depth leaves h3 out; a repeated heading still links to its OWN one.
  assert(!html.includes(">Report title</a>"));
  assert(!html.includes("Not a heading</a>"));
  assert(!html.includes(">Detail</a>"));
  assertStringIncludes(html, '<a href="#fm-overview" data-toc-line="7">Overview</a>');
  assertStringIncludes(html, '<a href="#fm-findings" data-toc-line="11">Findings</a>');
  assertStringIncludes(html, '<a href="#fm-findings-2" data-toc-line="14">Findings</a>');
  // Every link has its heading: the ids come from the same slug function.
  assertStringIncludes(html, '<h2 id="fm-overview" class="fm-top">Overview</h2>');
  // Inside a band: a heading, not a section, so no fm-top.
  assertStringIncludes(html, '<h2 id="fm-findings-2">Findings</h2>');
  // An h3 that the list skipped still carries its anchor, so raising the
  // depth later cannot renumber the slugs.
  assertStringIncludes(html, '<h3 id="fm-detail" class="fm-top">Detail</h3>');
  // A document with no contents block keeps its plain headings.
  assertStringIncludes(
    renderFastrMarkdownToHtml("## Overview\n", { lineAnchors: false }),
    '<h2 class="fm-top">Overview</h2>',
  );
  // Inline syntax is stripped from an entry, and an empty document says so.
  assertEquals(
    fastrDocumentOutline("## The [big]{.danger} **drop**\n")[0].text,
    "The big drop",
  );
  assertStringIncludes(
    renderFastrMarkdownToHtml(":::contents\n", { lineAnchors: false }),
    '<div class="fm-toc__empty">',
  );
  // The block is a LEAF: one line, no closing fence, and no defect.
  assert(isFastrLeafBlock("contents"));
  assertEquals(listFastrContainerDefects(":::contents\n\n## A\n").length, 0);
});

Deno.test("bands and covers are full-bleed sections", () => {
  const html = render(":::band{tone=ink}\n## Failing\ntext\n:::\n");
  assertStringIncludes(html, '<section class="fm-band fm-tone fm-tone--ink"');
  assertStringIncludes(html, "<h2>Failing</h2>");
  assertStringIncludes(
    render(":::cover{tone=accent}\n# T\n:::\n"),
    "fm-band fm-cover",
  );
});

// Hue on the 0–360 wheel and WCAG-ish relative luminance, enough to pin
// that "good" is a green, "bad" a red, and a ramp runs light to dark.
function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}
function lumOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

function satOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

Deno.test("every theme is five muted colours, and everything else is mixed from them", () => {
  const HEX = /^#[0-9a-f]{6}$/i;
  for (const theme of FASTR_REPORT_THEMES) {
    const t = FASTR_THEME_TOKENS[theme];
    const five = [t.palette.paper, t.palette.ink, t.palette.accent, t.palette.warm, t.palette.cool];
    for (const c of five) assert(HEX.test(c), `${theme}: ${c}`);
    assertEquals(new Set(five.map((c) => c.toLowerCase())).size, 5, `${theme} repeats a palette colour`);
    // Muted: no colour is saturated (HSL saturation), and the three hues
    // are neither near-white nor near-black.
    for (const c of [t.palette.accent, t.palette.warm, t.palette.cool]) {
      assert(satOf(c) <= 0.55, `${theme} ${c} is too saturated (${satOf(c).toFixed(2)})`);
    }
    // The roles are the five: the page is the paper, danger the warm,
    // success the cool, info the accent, and the charts agree.
    assertEquals(t.page, t.palette.paper);
    assertEquals(t.ink, t.palette.ink);
    assertEquals(t.accent, t.palette.accent);
    assertEquals(t.semantic.danger, t.palette.warm);
    assertEquals(t.semantic.success, t.palette.cool);
    assertEquals(t.semantic.info, t.palette.accent);
    assertEquals(t.chart.bad, t.palette.warm);
    assertEquals(t.chart.good, t.palette.cool);
    assertEquals(t.chart.series[0], t.palette.accent);
    // The five tones are the five as grounds, and the type on each stands
    // clear of it. The paper ground carries a hint of ink, so a paper panel
    // shows on the page; the ink ground is the ink itself.
    assertEquals(t.grounds.ink.color, t.palette.ink);
    assertEquals(t.grounds.ink.ink, t.palette.paper);
    assertEquals(t.grounds.accent.color, t.palette.accent);
    assertEquals(t.grounds.warm.color, t.palette.warm);
    assertEquals(t.grounds.cool.color, t.palette.cool);
    assertEquals(t.grounds.paper.ink, t.palette.ink);
    assert(t.grounds.paper.color !== t.palette.paper, `${theme}: a paper panel would vanish`);
    assert(
      Math.abs(lumOf(t.grounds.paper.color) - lumOf(t.palette.paper)) <
        Math.abs(lumOf(t.grounds.paper.color) - lumOf(t.palette.ink)) / 4,
      `${theme}: the paper ground is not paper`,
    );
    for (const tone of FASTR_GROUNDS) {
      const { color, ink } = t.grounds[tone];
      assert(ink === t.palette.paper || ink === t.palette.ink, `${theme} ${tone} ground ink ${ink}`);
      assert(Math.abs(lumOf(color) - lumOf(ink)) > 0.2, `${theme} ${tone}: ${ink} on ${color} does not read`);
    }
    // A theme's extra rules name the five, never a colour of their own.
    assert(!/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black)\b/i.test(t.extraCss), `${theme} extraCss carries a literal colour`);
  }
});

Deno.test("every theme's chart colours: a distinct series cycle, semantic colours that still read as such, a sequential ramp", () => {
  const HEX = /^#[0-9a-f]{6}$/i;
  for (const theme of FASTR_REPORT_THEMES) {
    const { chart, page, ink } = FASTR_THEME_TOKENS[theme];
    assert(chart.series.length >= 6, `${theme} has ${chart.series.length} series colours`);
    assertEquals(
      new Set(chart.series.map((c) => c.toLowerCase())).size,
      chart.series.length,
      `${theme} repeats a series colour`,
    );
    for (const c of [...chart.series, chart.neutral, chart.good, chart.bad, ...chart.ramp]) {
      assert(HEX.test(c), `${theme}: ${c}`);
    }
    // Meaning survives the theme: good is a green, bad a red — even on the
    // monochrome themes, where they are muted but still tell apart.
    const goodHue = hueOf(chart.good);
    assert(goodHue >= 70 && goodHue <= 170, `${theme} good ${chart.good} hue ${goodHue.toFixed(0)}`);
    const badHue = hueOf(chart.bad);
    assert(badHue <= 25 || badHue >= 335, `${theme} bad ${chart.bad} hue ${badHue.toFixed(0)}`);
    const warnHue = hueOf(chart.warn);
    assert(warnHue >= 20 && warnHue <= 65, `${theme} warn ${chart.warn} hue ${warnHue.toFixed(0)}`);
    assert(HEX.test(chart.warn), `${theme}: ${chart.warn}`);
    // The neutral is a mid tone that reads on the page, not a series colour
    // in disguise: no strong hue, and away from both page and ink.
    assert(Math.abs(lumOf(chart.neutral) - lumOf(page)) > 0.12, `${theme} neutral vanishes on the page`);
    assert(Math.abs(lumOf(chart.neutral) - lumOf(ink)) > 0.05, `${theme} neutral is the ink`);
    // The ramp is sequential: its ends differ clearly in lightness, the
    // emphatic end (`to`) being the one that contrasts most with the page.
    const [from, to] = chart.ramp;
    assert(Math.abs(lumOf(from) - lumOf(to)) > 0.15, `${theme} ramp ${from}→${to} is flat`);
    assert(
      Math.abs(lumOf(to) - lumOf(page)) > Math.abs(lumOf(from) - lumOf(page)),
      `${theme} ramp's emphatic end is the faint one`,
    );
    // The palette a figure receives: the theme's colours, its ink as the
    // strong line, and a faint tone between the neutral and the page.
    const p = fastrChartPalette(theme);
    assertEquals(p.series, chart.series);
    assertEquals(p.neutral, chart.neutral);
    assertEquals(p.good, chart.good);
    assertEquals(p.bad, chart.bad);
    assertEquals(p.ramp, chart.ramp);
    assertEquals(p.strong, ink);
    assert(HEX.test(p.faint), `${theme} faint ${p.faint}`);
    const fl = lumOf(p.faint), nl = lumOf(chart.neutral), pl = lumOf(page);
    assert(fl >= Math.min(nl, pl) - 1e-9 && fl <= Math.max(nl, pl) + 1e-9, `${theme} faint ${p.faint} is not between neutral and page`);
    // Conditional-formatting cell tints: each tier faded toward the page but
    // still distinct from it (a coloured cell must read as coloured), keeping
    // its hue so the traffic light still means what it means.
    for (const [tier, full] of [["good", chart.good], ["warn", chart.warn], ["bad", chart.bad]] as const) {
      const tint = p.cells[tier];
      assert(HEX.test(tint), `${theme} ${tier} cell ${tint}`);
      const tl = lumOf(tint), cl = lumOf(full);
      assert(tl >= Math.min(cl, pl) - 1e-9 && tl <= Math.max(cl, pl) + 1e-9, `${theme} ${tier} cell ${tint} is not between colour and page`);
      assert(Math.abs(tl - pl) > 0.02, `${theme} ${tier} cell ${tint} vanishes on the page`);
      // Fading toward a warm or cool page pulls a pale tint's hue around (a
      // near-grey has little hue to hold), so the check is the band, not the
      // drift: the green cell stays a green, the amber an amber, the red a red.
      const h = hueOf(tint);
      const inBand = tier === "good"
        ? h >= 60 && h <= 180
        : tier === "warn"
        ? h >= 20 && h <= 75
        : h <= 40 || h >= 335;
      assert(inBand, `${theme} ${tier} cell ${tint} hue ${h.toFixed(0)}° left its band`);
    }
    assertEquals(p.cells.none, page);
  }
  // A custom style: its accent leads the series, its ink is the strong
  // line, its page tunes the faint tone; the semantic colours stay the
  // theme's (a custom accent says nothing about good and bad).
  const custom = fastrChartPalette("ministry", { accent: "#ABCDEF", ink: "#123456", page: "#000000" });
  assertEquals(custom.series[0], "#abcdef");
  assertEquals(custom.series.length, FASTR_THEME_TOKENS.ministry.chart.series.length + 1);
  assertEquals(custom.strong, "#123456");
  assert(lumOf(custom.faint) < lumOf(fastrChartPalette("ministry").faint), "faint follows the page");
  assertEquals(custom.cells.none, "#000000");
  assert(lumOf(custom.cells.good) < lumOf(fastrChartPalette("ministry").cells.good), "cell tints follow the page");
  assertEquals(custom.good, FASTR_THEME_TOKENS.ministry.chart.good);
  // An accent the theme already has is not doubled.
  const same = fastrChartPalette("risograph", { accent: "#C26F93" });
  assertEquals(same.series, FASTR_THEME_TOKENS.risograph.chart.series.map((c) => c.toLowerCase() === "#c26f93" ? "#c26f93" : c));
  // A page that is not a 6-digit hex cannot be mixed: the faint tone falls
  // back to the neutral rather than a broken colour.
  assertEquals(fastrChartPalette("default", { page: "white" }).faint, FASTR_THEME_TOKENS.default.chart.neutral);
});

Deno.test("a themed report re-tints every stock traffic-light preset; chosen colours and scales pass through", () => {
  const stock = new Set<string>();
  for (const b of [_CF_LIGHTER_GREEN, _CF_LIGHTER_YELLOW, _CF_LIGHTER_RED]) {
    stock.add(b.toLowerCase());
    stock.add(getAdjustedColor(b, { darken: 0.25 }).toLowerCase());
    stock.add(getAdjustedColor(b, { brighten: 0.5 }).toLowerCase());
  }
  const palette = fastrChartPalette("artdeco");
  for (const [id, preset] of Object.entries(LEGACY_CF_PRESETS)) {
    const themed = themeConditionalFormatting(preset.value, palette);
    assert(themed.type === "thresholds", id);
    assertEquals(themed.buckets.length, preset.value.buckets.length, id);
    assertEquals(themed.cutoffs, preset.value.cutoffs, id);
    for (const [i, b] of themed.buckets.entries()) {
      const before = preset.value.buckets[i].color;
      if (typeof before !== "string") {
        // A structural key (the neutral middle bucket) is not a stock tint.
        assertEquals(b.color, before, `${id} bucket ${i}`);
        continue;
      }
      assert(typeof b.color === "string" && !stock.has(b.color.toLowerCase()), `${id} bucket ${i} still stock: ${b.color}`);
      assert(b.color !== before, `${id} bucket ${i} unchanged`);
    }
    // Stock white no-data cells become the page.
    assertEquals(themed.noDataColor, palette.cells.none, id);
  }
  // The three bases land on the theme's tints exactly.
  const basic = themeConditionalFormatting(LEGACY_CF_PRESETS["fmt-90-80"].value, palette);
  assert(basic.type === "thresholds");
  assertEquals(basic.buckets.map((b) => b.color), [palette.cells.bad, palette.cells.warn, palette.cells.good]);
  // A user's own colours are theirs.
  const custom = {
    type: "thresholds" as const,
    cutoffs: [0.5],
    buckets: [{ color: "#123456" }, { color: "#abcdef" }],
    noDataColor: "#eeeeee",
  };
  assertEquals(themeConditionalFormatting(custom, palette), custom);
  // A scale-mode format and an unthemed render are untouched (same object).
  const scale = { type: "scale" as const, scale: { palette: "rd-yl-gn" as const }, domain: { kind: "auto" as const } };
  assert(themeConditionalFormatting(scale, palette) === scale);
  assert(themeConditionalFormatting(LEGACY_CF_PRESETS["fmt-90-80"].value, undefined) === LEGACY_CF_PRESETS["fmt-90-80"].value);
});

Deno.test("a cover fills its page only with fill=page", () => {
  assertStringIncludes(
    render(":::cover{tone=ink fill=page}\n# T\n:::\n"),
    '<section class="fm-band fm-cover fm-cover--fill',
  );
  assertStringIncludes(
    render(":::cover{tone=ink layout=poster fill=page}\n# T\n:::\n"),
    '<section class="fm-band fm-cover fm-cover--poster fm-cover--fill',
  );
  assert(!render(":::cover{tone=ink}\n# T\n:::\n").includes("fm-cover--fill"));
  const defects = listFastrContainerDefects(":::cover{fill=tall}\n# T\n:::\n");
  assert(defects.some((d) => d.message.includes("Unknown fill `tall`")), JSON.stringify(defects));
  // The paged sheet gives only the filling cover its own page.
  const css = buildFastrPagedCss(
    { size: "a4", orientation: "portrait", margin: "normal" },
    { title: "Q3", pageWord: "Page", ofWord: "of" },
  );
  assertStringIncludes(css, ".fm-band.fm-cover--fill {\n  page: fmcover;");
  assertStringIncludes(css, ":has(+ .fm-cover--fill) { page: fmcover; }");
  assertStringIncludes(css, ".fm-band.fm-cover {\n  min-height: 544px;");
  // The browser-print block is the .html download's: a paged document
  // leaves it out (Paged.js would apply it during layout and Chrome again
  // when printing the fixed pages).
  assertStringIncludes(buildFastrReportCss("default"), "@media print {");
  assert(!buildFastrReportCss("default", undefined, "", { omitPrintRules: true }).includes("@media print"));
  // A natural cover hugs the top of its page, rising through the top
  // margin (the page keeps its margins and footer, and the report continues
  // below the cover on the same page).
  assertStringIncludes(
    css,
    ".fm-band.fm-cover:not(.fm-cover--fill) {\n  margin-top: calc(-1 * var(--pagedjs-margin-top));",
  );
});

Deno.test("a cover's layout is a class the sheet styles; classic is the bare cover", () => {
  assertStringIncludes(
    render(":::cover{tone=ink layout=poster}\n# T\n:::\n"),
    '<section class="fm-band fm-cover fm-cover--poster fm-tone fm-tone--ink"',
  );
  // Classic and an unknown layout both leave the class alone, so existing
  // covers render byte for byte.
  assertStringIncludes(render(":::cover{layout=classic}\n# T\n:::\n"), '<section class="fm-band fm-cover"');
  assertStringIncludes(render(":::cover{layout=swirly}\n# T\n:::\n"), '<section class="fm-band fm-cover"');
  // The masthead lines stay direct children whatever the layout (the editor's
  // kicker/dek islands depend on it).
  const html = render(':::cover{layout=split kicker="K" sub="S"}\n# T\n:::\n');
  assertStringIncludes(html, '<div class="fm-kicker">K</div><h1>T</h1>');
  assertStringIncludes(html, '<div class="fm-dek">S</div></section>');
  // Every layout the renderer accepts has rules in the sheet, plain and scoped.
  for (const layout of FASTR_COVER_LAYOUTS) {
    if (layout === "classic") continue;
    assertStringIncludes(buildFastrReportCss("default"), `.fm-cover.fm-cover--${layout}`);
    assertStringIncludes(buildFastrReportCss("swiss", undefined, ".t"), `.t .fm-cover.fm-cover--${layout}`);
  }
  // The thumbnail sheet fills the tile and knows every preset's layout.
  const tile = buildFastrCoverTileCss(".s");
  assertStringIncludes(tile, ".s.fm-cover-tile .fm-cover {");
  for (const preset of FASTR_COVER_PRESETS) {
    assert((FASTR_COVER_LAYOUTS as readonly string[]).includes(preset.layout));
  }
  // The preset snippet: fallbacks stay off the fence, quotes are kept safe.
  assertEquals(
    coverSnippet({ layout: "poster", tone: "accent" }, { kicker: 'Say "hi"', title: "T", sub: "S" }),
    `:::cover{tone=accent layout=poster kicker="Say 'hi'" sub="S"}\n# T\n:::`,
  );
  assertEquals(
    coverSnippet({ layout: "classic", tone: "default" }, { kicker: "K", title: "T", sub: "S" }),
    ':::cover{kicker="K" sub="S"}\n# T\n:::',
  );
});

// ── Document header ─────────────────────────────────────────────────────────

Deno.test(":::report configures the document and renders nothing", () => {
  const body = ":::report{background=paper width=wide}\n\n# T\n";
  const html = render(body);
  assert(!html.includes("fm-report"));
  assert(!html.includes(":::report"));
  // A top-level heading is a section: it carries fm-top for the paged sheet.
  assertStringIncludes(html, '<h1 class="fm-top">T</h1>');

  const doc = readFastrDocumentSettings(body);
  assertStringIncludes(doc.className, "fm-doc");
  assertStringIncludes(doc.className, "fm-doc--wide");
  assertStringIncludes(doc.className, "fm-tone--paper");
  assertEquals(doc.style, "");
});

Deno.test("a literal document background carries its own ink", () => {
  const doc = readFastrDocumentSettings(':::report{background="#101010"}\n');
  assertEquals(doc.style, "background-color: #101010");
  assertStringIncludes(doc.className, "fm-ink--light");
});

Deno.test("no :::report means no document settings, and code fences are literal", () => {
  const bare = readFastrDocumentSettings("# T\n");
  assertEquals(
    { className: bare.className, style: bare.style, extraAttrs: bare.extraAttrs },
    { className: "", style: "", extraAttrs: "" },
  );
  assertEquals(
    readFastrDocumentSettings("```\n:::report{width=full}\n```\n").className,
    "",
  );
});

// ── Figure widths ───────────────────────────────────────────────────────────

Deno.test("a figure takes a width, and the attribute block is consumed", () => {
  const wide = render("![Trend](figure:abc){width=wide}\n");
  assertStringIncludes(wide, 'class="fm-figure fm-figure--wide"');
  assert(!wide.includes("{width=wide}"));
  assertStringIncludes(
    wide,
    '<figcaption class="fm-figure__caption">Trend</figcaption>',
  );
  assertStringIncludes(
    render("![T](figure:abc){width=full}\n"),
    "fm-figure--full",
  );
  // No attribute block, and an unknown width, both stay the normal column.
  assertEquals(
    render("![T](figure:abc)\n").includes("fm-figure--"),
    false,
  );
  assertEquals(
    render("![T](figure:abc){width=enormous}\n").includes("fm-figure--"),
    false,
  );
});

// ── Themes carry the tone palette ───────────────────────────────────────────

Deno.test("every theme emits the five grounds and a rule for each tone", () => {
  for (const theme of FASTR_REPORT_THEMES) {
    const tokens = FASTR_THEME_TOKENS[theme];
    const css = buildFastrReportCss(theme);
    for (const tone of FASTR_GROUNDS) {
      assertStringIncludes(css, `--fm-${tone}-ground: ${tokens.grounds[tone].color};`);
      assertStringIncludes(css, `--fm-${tone}-ground-ink: ${tokens.grounds[tone].ink};`);
      const block = new RegExp(`\\.fm-tone\\.fm-tone--${tone} \\{([^}]*)\\}`).exec(css)?.[1];
      assert(block !== undefined, `${theme} has no ${tone} tone rule`);
      assertStringIncludes(block, `background: var(--fm-${tone}-ground);`);
      assertStringIncludes(block, `--fm-ink: var(--fm-${tone}-ground-ink);`);
      assertStringIncludes(block, `color: var(--fm-${tone}-ground-ink);`);
      // The status set inside follows the ground's darkness, which is the
      // theme's to know: the ink ground is dark on a light theme and light
      // on a dark one.
      const dark = tokens.grounds[tone].ink === tokens.lightInk;
      assertStringIncludes(block, `--fm-danger: var(--fm-danger-${dark ? "dark" : "light"});`);
      // A coloured ground's accent is its own ink; the paper ground is the
      // page again, so the accent returns (a stat value inside a paper card
      // inside an ink band would otherwise be paper on paper).
      assertStringIncludes(
        block,
        tone === "paper"
          ? "--fm-accent: var(--fm-accent-ground);"
          : `--fm-accent: var(--fm-${tone}-ground-ink);`,
      );
    }
    // The tone rules come after the structure, so they outrank a block's own
    // ground, and before the theme's extra rules.
    assert(css.indexOf(".fm-tone.fm-tone--ink {") > css.indexOf(".fm-band {"));
    assertStringIncludes(css, ".fm-ink--light {");
    // On a light theme the ink ground is dark; the paper ground is light.
    if (tokens.scheme === "light") {
      assert(isDarkCssColor(tokens.grounds.ink.color), `${theme} ink ground is not dark`);
      assertEquals(isDarkCssColor(tokens.grounds.paper.color), false);
    }
  }
});

// A tone rule paints its ground AND re-scopes the ink tokens. If it reads the
// same custom property it redefines, var() resolves against the override —
// which rendered `tone=accent` as white text on a white card until it was
// caught. Structural, because CSS cannot be evaluated here.
Deno.test("no tone rule reads a custom property it also redefines", () => {
  const css = buildFastrReportCss("default");
  for (const [, selector, block] of css.matchAll(/(\.fm-[\w-]+)\s*\{([^}]*)\}/g)) {
    const declared = new Set(
      [...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
    );
    for (const [, prop, read] of block.matchAll(/^\s*([a-z-]+)\s*:[^;]*var\((--[\w-]+)/gm)) {
      // A custom property that references ITSELF is a cycle and resolves to
      // nothing, which is the same failure wearing a different hat.
      assert(
        prop !== read,
        `${selector} defines ${prop} in terms of itself`,
      );
      if (prop.startsWith("--")) continue;
      assert(
        !declared.has(read),
        `${selector} sets ${prop}: var(${read}) while also redefining ${read}`,
      );
    }
  }
});

// ── Gradients ───────────────────────────────────────────────────────────────

Deno.test("gradients are accepted, and only the gradient functions are", () => {
  for (
    const ok of [
      "linear-gradient(180deg,#0b3d2e,#0a2a20)",
      "repeating-linear-gradient(45deg,#eee 0 10px,#fff 10px 20px)",
      "radial-gradient(circle at 30% 20%, rgb(11 61 46), #000)",
      "conic-gradient(from 90deg, #fff, #000)",
    ]
  ) {
    assertEquals(safeCssGradient(ok), ok, ok);
    assertEquals(safeCssBackground(ok)?.property, "background");
  }
  // A gradient needs the `background` shorthand; a flat colour must NOT use it
  // (background: red would also reset background-image on the same element).
  assertEquals(safeCssBackground("#0b3d2e")?.property, "background-color");

  for (
    const bad of [
      "linear-gradient(180deg,#000, url(evil.png))",
      "linear-gradient(180deg,#000,#fff); background-image: url(x)",
      "linear-gradient(180deg, var(--fm-page), #000)",
      "linear-gradient(180deg,#000,#fff",
      "url(https://example.org/paper.png)",
      "rotate(3deg)",
      `linear-gradient(${"#000,".repeat(120)}#fff)`,
    ]
  ) {
    assertEquals(safeCssGradient(bad), undefined, bad);
    assertEquals(safeCssBackground(bad), undefined, bad);
  }
});

Deno.test("a gradient's ink comes from the MEAN of its stops", () => {
  assertEquals(isDarkCssBackground("linear-gradient(180deg,#000,#111)"), true);
  assertEquals(isDarkCssBackground("linear-gradient(180deg,#fff,#eee)"), false);
  assertEquals(
    isDarkCssBackground("linear-gradient(180deg,#0b3d2e,#0a2a20)"),
    true,
  );
  // Judged across the sweep, NOT from the first stop: black→near-white reads
  // light overall even though it starts black.
  assertEquals(isDarkCssBackground("linear-gradient(180deg,#000,#f8f8f8)"), false);
  // A full-range sweep has no ink that works at both ends — it lands wherever
  // the mean falls, and the author overrides with ink= if that is wrong.
  assertEquals(isDarkCssBackground("linear-gradient(180deg,#fff,#050505)"), false);
  // No parseable stop → no guess; the author uses ink=.
  assertEquals(
    isDarkCssBackground("linear-gradient(180deg, teal, olive)"),
    undefined,
  );

  const h = containerHtmlFor("band", {
    bg: "linear-gradient(180deg,#0b3d2e,#0a2a20)",
  });
  assertEquals(h.style, "background: linear-gradient(180deg,#0b3d2e,#0a2a20)");
  assertStringIncludes(h.className, "fm-ink--light");
});

Deno.test("an unusable background is reported instead of vanishing", () => {
  const defects = listFastrContainerDefects(
    ':::band{bg="rotate(3deg)"}\nx\n:::\n',
  );
  assertEquals(defects.length, 1);
  assertStringIncludes(defects[0].message, "is not a background");
  // Everything legitimate stays silent.
  assertEquals(
    listFastrContainerDefects(
      ':::band{bg="linear-gradient(180deg,#000,#fff)"}\nx\n:::\n' +
        ":::band{bg=image:abc}\nx\n:::\n" +
        ':::band{bg="#0b3d2e"}\nx\n:::\n' +
        ":::band{tone=ink}\nx\n:::\n",
    ),
    [],
  );
});

// ── Dark-page themes ────────────────────────────────────────────────────────

Deno.test("a theme's scheme decides the semantic colours, and dark pages get the dark set", () => {
  for (const theme of FASTR_REPORT_THEMES) {
    const tokens = FASTR_THEME_TOKENS[theme];
    // The flag must match the page it describes, or callouts land unreadable.
    assertEquals(
      tokens.scheme === "dark",
      isDarkCssColor(tokens.page),
      `${theme} scheme "${tokens.scheme}" disagrees with page ${tokens.page}`,
    );
    // Body ink must contrast with the page it sits on.
    assertEquals(
      isDarkCssColor(tokens.ink),
      !isDarkCssColor(tokens.page),
      `${theme} ink ${tokens.ink} does not contrast with page ${tokens.page}`,
    );
    const css = buildFastrReportCss(theme);
    // The page reads its own status set (the light-ground set on a light
    // page, the dark-ground set on a dark one), and that set is the theme's
    // own warm.
    assertStringIncludes(css, `--fm-danger: var(--fm-danger-${tokens.scheme});`);
    assertStringIncludes(css, `--fm-danger-${tokens.scheme}: ${tokens.semantic.danger};`);
    assertEquals(tokens.semantic.danger, tokens.palette.warm);
    // The semantic colours are referenced, never inlined.
    assertStringIncludes(css, ".fm-callout--danger { --fm-callout-color: var(--fm-danger); }");
  }
});

Deno.test("every rule that darkens the ground re-points the semantic colours", () => {
  const css = buildFastrReportCss("default");
  // On the default theme every ground but paper is dark.
  for (
    const rule of [
      "fm-tone--ink",
      "fm-tone--accent",
      "fm-tone--warm",
      "fm-tone--cool",
      "fm-ink--light",
    ]
  ) {
    const block = new RegExp(`\\.${rule} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    assertStringIncludes(block, "--fm-danger: var(--fm-danger-dark);");
    assertStringIncludes(block, "--fm-success: var(--fm-success-dark);");
  }
  // And the one that LIGHTENS it goes back the other way.
  const lightBlock = /\.fm-ink--dark \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assertStringIncludes(lightBlock, "--fm-danger: var(--fm-danger-light);");
});

Deno.test("all 17 themes build, and every html style name has one bar retired themes", async () => {
  assertEquals(FASTR_REPORT_THEMES.length, 17);
  const { REPORT_HTML_STYLES } = await import("../../lib/types/reports.ts");
  const themes = new Set<string>(FASTR_REPORT_THEMES);
  // blueprint retired 2026-09-03 (fastr theme removed; the html style stays).
  assertEquals(REPORT_HTML_STYLES.filter((s) => !themes.has(s)), ["blueprint"]);
});

// The scope rewriter runs line-by-line over each theme's extraCss. A comment
// line preceding a rule once swallowed that rule's selector (the negated class
// matched newlines), leaving it unscoped so a picker tile repainted the whole
// app. Comments are ordinary in the themes now, so this is pinned per theme.
Deno.test("a comment in a theme's extraCss does not unscope the next rule", () => {
  for (const theme of FASTR_REPORT_THEMES) {
    const css = buildFastrReportCss(theme, undefined, ".tile", {
      omitFontImport: true,
    });
    for (const line of css.split("\n")) {
      assert(
        !/^\.fm-[\w-]+[^{]*\{/.test(line),
        `${theme} leaks an unscoped rule: ${line}`,
      );
    }
  }
});

// The stylesheet and theme files are one giant template literal each, so a
// backtick inside a CSS comment ends the string and the parse error lands
// somewhere unrelated. Bitten three times; pinned here.
Deno.test("no stray backtick inside the CSS template literals", async () => {
  for (
    const rel of ["../../lib/report_fastr_css.ts", "../../lib/types/report_fastr_themes.ts"]
  ) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    for (const [i, line] of src.split("\n").entries()) {
      if (!line.includes("`")) continue;
      // A line-comment sits outside the literal and may quote code freely.
      if (line.trim().startsWith("//")) continue;
      assert(
        !/\/\*[^*]*`/.test(line) && !/^\s+\*.*`/.test(line),
        `${rel}:${i + 1} has a backtick inside a block comment: ${line.trim()}`,
      );
    }
  }
});

// --fm-accent-text is the accent made safe as TYPE (it falls back to the ink
// when the accent cannot carry text on the theme's surface). A ground that
// re-scopes --fm-accent must re-scope it too, or the stat value, the step
// numbers and several themes' h2 keep the ground-less fallback and disappear —
// a black number on a black tile.
Deno.test("any ground that re-scopes the accent re-scopes the accent TEXT too", () => {
  const css = buildFastrReportCss("default");
  for (const [, selector, block] of css.matchAll(/(\.fm-[\w-]+)\s*\{([^}]*)\}/g)) {
    if (!/--fm-accent\s*:/.test(block)) continue;
    assert(
      /--fm-accent-text\s*:/.test(block),
      `${selector} re-scopes --fm-accent but not --fm-accent-text`,
    );
  }
});

// The warm and cool tones ARE the meaning colours: a warm tile is the same
// red the danger callout and the falling delta carry, in every theme, so
// "this is the bad news" is one colour wherever it is said.
Deno.test("the warm and cool tones are the semantic colours, in every theme", () => {
  for (const theme of FASTR_REPORT_THEMES) {
    const t = FASTR_THEME_TOKENS[theme];
    assertEquals(t.grounds.warm.color, t.semantic.danger);
    assertEquals(t.grounds.cool.color, t.semantic.success);
    assertEquals(t.grounds.accent.color, t.semantic.info);
    assertEquals(t.grounds.warm.color, t.chart.bad);
    assertEquals(t.grounds.cool.color, t.chart.good);
  }
  assertStringIncludes(
    containerHtmlFor("stat", { tone: "warm" }).className,
    "fm-tone fm-tone--warm",
  );
});

// A tone paints a ground, so it must outrank any background a THEME sets on the
// same element. Brutalist paints `.fm-callout` white; at equal specificity its
// rule (loaded later) beat the tone and the callout went white on
// white. Every tone rule that sets a background doubles its class to win.
Deno.test("a tone outranks a theme's own background", () => {
  const css = buildFastrReportCss("brutalist");
  for (const [, selector, block] of css.matchAll(/^(\.fm-tone[\w.-]*) \{([^}]*)\}/gm)) {
    if (!/(^|;|\s)background\s*:/.test(block)) continue;
    // Two class tokens = specificity 0,2,0, which beats a theme's single-class
    // element rule regardless of source order.
    assert(
      (selector.match(/\./g) ?? []).length >= 2,
      `${selector} paints a ground but does not outrank theme CSS`,
    );
  }
});

// ── Fence rewriting: the toolbar's contract with the author's source ─────────

import {
  FASTR_BLOCK_SNIPPETS,
  FASTR_MD_SYNTAX_DOC,
} from "../../lib/fastr_markdown_spec.ts";

function openFenceLines(): string[] {
  const out: string[] = [];
  for (const { snippet } of FASTR_BLOCK_SNIPPETS) {
    for (const line of snippet.split("\n")) {
      const f = parseContainerFence(line);
      if (f?.kind === "open") out.push(line);
    }
  }
  return out;
}

// The guarantee the whole toolbar rests on. A click that changes nothing must
// rewrite nothing — otherwise every interaction churns the version-history
// diff and emits Y.Text ops into everyone else's collab session.
Deno.test("a no-op patch returns the author's line byte for byte", () => {
  const lines = openFenceLines();
  assert(lines.length >= 8, "expected the snippets to cover the blocks");
  for (const line of lines) {
    assertEquals(updateContainerFenceLine(line, {}), line);
  }
});

Deno.test("a fence survives a serialize round-trip semantically", () => {
  for (const line of openFenceLines()) {
    const f = parseContainerFence(line);
    assert(f?.kind === "open");
    const back = parseContainerFence(
      serializeContainerFence(f.name, f.attrs, f.markerLength),
    );
    assertEquals(back, f, `round-trip lost something: ${line}`);
  }
});

Deno.test("a patch edits in place and leaves everything else alone", () => {
  const line = `:::callout{kind=warning title="Data caveat"}`;
  assertEquals(
    updateContainerFenceLine(line, { tone: "warm" }),
    `:::callout{kind=warning title="Data caveat" tone=warm}`,
  );
  assertEquals(
    updateContainerFenceLine(line, { kind: "danger" }),
    `:::callout{kind=danger title="Data caveat"}`,
  );
  // A removal takes its separator with it, or the line grows double spaces.
  assertEquals(
    updateContainerFenceLine(line, { title: undefined }),
    ":::callout{kind=warning}",
  );
  // Removing the last attribute removes the braces too.
  assertEquals(
    updateContainerFenceLine(line, { kind: undefined, title: undefined }),
    ":::callout",
  );
  // And adding to a bare fence creates them.
  assertEquals(
    updateContainerFenceLine(":::steps", { tone: "paper" }),
    ":::steps{tone=paper}",
  );
  // Indent and marker length are the author's, not ours.
  assertEquals(
    updateContainerFenceLine("  ::::tiles{cols=3}", { cols: "4" }),
    "  ::::tiles{cols=4}",
  );
  // A close fence is not an open fence.
  assertEquals(updateContainerFenceLine(":::", { tone: "dark" }), undefined);
});

Deno.test("a value is quoted only as much as it needs, and can always be re-parsed", () => {
  const quoted = (v: string) => {
    const line = updateContainerFenceLine(":::card", { title: v })!;
    const f = parseContainerFence(line);
    assert(f?.kind === "open", `unparseable: ${line}`);
    return { line, value: f.attrs.title };
  };
  assertEquals(quoted("wide").line, ":::card{title=wide}");
  assertEquals(quoted("two words").line, `:::card{title="two words"}`);
  // No escape mechanism in the parser, so a double quote flips to single.
  assertEquals(quoted(`He said "no"`).line, `:::card{title='He said "no"'}`);
  // Both quote characters cannot round-trip; a substituted glyph beats a fence
  // that no longer parses, which would swallow the author's whole block.
  assertEquals(quoted(`it's "fine"`).value, "it's ”fine”");
  // A `}` would terminate FENCE_RE's attribute group early.
  assertEquals(quoted("a}b").value, "ab");
});

// ── The container stack ──────────────────────────────────────────────────────

Deno.test("the stack reports the blocks enclosing a line", () => {
  const lines = [
    ":::tiles{cols=3}", // 1
    ':::card{title="A"}', // 2
    "text", // 3
  ];
  assertEquals(
    fastrContainerStackUpTo(lines).map((f) => `${f.name}@${f.line}`),
    ["tiles@1", "card@2"],
  );
});

Deno.test("a leaf block never enters the stack", () => {
  // `:::stat` carries no closing fence, so pushing it would mis-nest every
  // line after it — the stat's own line is reached through fenceHere instead.
  const lines = [":::tiles{cols=3}", ':::stat{value="64%"}', "after"];
  assertEquals(fastrContainerStackUpTo(lines).map((f) => f.name), ["tiles"]);
  assertEquals(fastrOpenFenceOnLine(lines[1], 2)?.name, "stat");
});

Deno.test("fences inside a code block are literal text", () => {
  const lines = ["```", ":::band{tone=ink}", "```", "after"];
  assertEquals(fastrContainerStackUpTo(lines), []);
});

Deno.test("an unclosed block stays open and a stray close does not underflow", () => {
  assertEquals(fastrContainerStackUpTo([":::band"]).map((f) => f.name), ["band"]);
  assertEquals(fastrContainerStackUpTo([":::", ":::", ":::quote"]).map((f) => f.name), [
    "quote",
  ]);
});

Deno.test("all three walkers agree about one document", () => {
  // The scanner is shared; this is the guard that keeps them sharing it.
  const body = [
    ":::tiles{cols=2}",
    ':::stat{value="1"}',
    ":::card",
    "```",
    ":::band",
    "```",
    ":::",
    ":::",
    "tail",
  ].join("\n");
  assertEquals(listFastrContainerDefects(body), []);
  assertEquals(fastrContainerStackUpTo(body.split("\n")), []);
});

// ── Inline role marks ────────────────────────────────────────────────────────

Deno.test("a role mark becomes a span, and nested markup survives", () => {
  const html = renderFastrMarkdownToHtml("A [fell **12**]{.danger} B", {
    lineAnchors: false,
  });
  assertStringIncludes(
    html,
    `<span class="fm-mark fm-mark--danger">fell <strong>12</strong></span>`,
  );
});

Deno.test("a mark never swallows a link, an image or an unknown role", () => {
  const r = (s: string) => renderFastrMarkdownToHtml(s, { lineAnchors: false });
  // Falls through to the real link rule.
  assertStringIncludes(r("[x](https://e.example)"), `<a href="https://e.example">x</a>`);
  // The figure width syntax fires on `!`, so the mark rule never sees it.
  assertStringIncludes(r("![Cap](figure:abc){width=wide}"), "fm-figure--wide");
  // An unknown role is the author's literal text, not a swallowed phrase.
  assertStringIncludes(r("[x]{.wat}"), "[x]{.wat}");
  // Escapes and code spans win, as they do for every other inline construct.
  assertStringIncludes(r("\\[x]{.danger}"), "[x]{.danger}");
  assertStringIncludes(r("`[x]{.danger}`"), "<code>[x]{.danger}</code>");
});

Deno.test("size marks: points, decimals, role combos, and malformed = literal", () => {
  const r = (s: string) => renderFastrMarkdownToHtml(s, { lineAnchors: false });
  assertStringIncludes(
    r("[x]{size=18}"),
    `<span class="fm-mark" style="font-size:18pt">x</span>`,
  );
  assertStringIncludes(
    r("[x]{size=10.5}"),
    `<span class="fm-mark" style="font-size:10.5pt">x</span>`,
  );
  // Role + size combine, in either order, into one span (role class + style).
  assertStringIncludes(
    r("[x]{.danger size=14}"),
    `<span class="fm-mark fm-mark--danger" style="font-size:14pt">x</span>`,
  );
  assertStringIncludes(
    r("[x]{size=14 .danger}"),
    `<span class="fm-mark fm-mark--danger" style="font-size:14pt">x</span>`,
  );
  // Out of range, non-numeric, duplicated, or junk-laden = the author's
  // literal text, exactly like an unknown role.
  assertStringIncludes(r("[x]{size=0}"), "[x]{size=0}");
  assertStringIncludes(r("[x]{size=401}"), "[x]{size=401}");
  assertStringIncludes(r("[x]{size=big}"), "[x]{size=big}");
  assertStringIncludes(r("[x]{size=12 size=14}"), "[x]{size=12 size=14}");
  assertStringIncludes(r("[x]{size=12 wat}"), "[x]{size=12 wat}");
  assertStringIncludes(r("`[x]{size=12}`"), "<code>[x]{size=12}</code>");
});

Deno.test("underline marks, alone and combined", () => {
  const r = (s: string) => renderFastrMarkdownToHtml(s, { lineAnchors: false });
  assertStringIncludes(
    r("[x]{underline}"),
    `<span class="fm-mark fm-mark--u" style="text-decoration:underline">x</span>`,
  );
  assertStringIncludes(
    r("[x]{.success size=14 underline}"),
    `<span class="fm-mark fm-mark--success fm-mark--u" style="font-size:14pt;text-decoration:underline">x</span>`,
  );
  assertStringIncludes(r("[x]{underline underline}"), "[x]{underline underline}");
  assertStringIncludes(r("[x]{underlined}"), "[x]{underlined}");
});

Deno.test("literal colour marks: any safe colour, alone or with size/underline", () => {
  const r = (s: string) => renderFastrMarkdownToHtml(s, { lineAnchors: false });
  assertStringIncludes(
    r("[x]{color=#c62828}"),
    `<span class="fm-mark" style="color:#c62828">x</span>`,
  );
  assertStringIncludes(
    r("[x]{color=crimson size=14 underline}"),
    `<span class="fm-mark fm-mark--u" style="color:crimson;font-size:14pt;text-decoration:underline">x</span>`,
  );
  // A hand-written role + colour still renders (the toolbar never writes both).
  assertStringIncludes(
    r("[x]{.danger color=#000}"),
    `<span class="fm-mark fm-mark--danger" style="color:#000">x</span>`,
  );
  // Anything safeCssColor refuses, or a duplicate, is literal text.
  assertStringIncludes(r("[x]{color=url(x)}"), "[x]{color=url(x)}");
  assertStringIncludes(r("[x]{color=muted}"), "[x]{color=muted}");
  assertStringIncludes(r("[x]{color=#123;x}"), "[x]{color=#123;x}");
  assertStringIncludes(r("[x]{color=#111 color=#222}"), "[x]{color=#111 color=#222}");
  assertEquals(parseFastrMarkAttrs(".info color=#abc size=10"), { role: "info", color: "#abc", size: 10 });
  assertEquals(serializeFastrMarkAttrs({ role: "info", color: "#abc", size: 10 }), "{.info color=#abc size=10}");
});

Deno.test("every role has a rule reading the right token, in every theme", () => {
  // Exhaustive over the constant, so a new role cannot ship without CSS.
  const expected: Record<string, string> = {
    accent: "var(--fm-accent-text)",
    muted: "var(--fm-ink-muted)",
    danger: "var(--fm-danger)",
    warning: "var(--fm-warning)",
    success: "var(--fm-success)",
    info: "var(--fm-info)",
  };
  for (const theme of FASTR_REPORT_THEMES) {
    const css = buildFastrReportCss(theme);
    for (const role of FASTR_INK_ROLES) {
      const m = new RegExp(
        `\\.fm-mark\\.fm-mark--${role} \\{[^}]*color: ([^;]+);`,
      ).exec(css);
      assert(m, `${theme}: no rule for .fm-mark--${role}`);
      assertEquals(m[1], expected[role], `${theme}: .fm-mark--${role}`);
    }
  }
});

Deno.test("a hue mark on a ground that IS that hue returns to the ground's ink", () => {
  // Otherwise `[x]{.danger}` inside `tone=warm` is pale red on red, the
  // same class of bug the accent-on-accent fixes closed.
  const css = buildFastrReportCss("brutalist");
  const grounds = ["fm-tone--accent", "fm-tone--warm", "fm-tone--cool"];
  for (const ground of grounds) {
    for (const role of ["danger", "warning", "success", "info"]) {
      const sel = `.${ground} .fm-mark--${role}`;
      const at = css.indexOf(sel);
      assert(at !== -1, `no neutraliser for ${sel}`);
      // It must come AFTER the base rule, or equal specificity resolves wrong.
      assert(
        at > css.indexOf(`.fm-mark.fm-mark--${role} {`),
        `${sel} is emitted before the base rule it must beat`,
      );
    }
  }
});

Deno.test("an accent mark is never a no-op, even where the accent cannot be text", () => {
  // An accent too close to the surface to carry text (a custom style's pale
  // accent on a white page) degrades to ink by design, so such a style marks
  // with weight instead — a control that silently does nothing is worse than
  // one that does something modest.
  for (const theme of FASTR_REPORT_THEMES) {
    const css = buildFastrReportCss(theme);
    assertStringIncludes(css, "--fm-mark-accent-weight:");
  }
  assertStringIncludes(
    buildFastrReportCss("default", { page: "#ffffff", ink: "#111111", accent: "#f2f2f2" }),
    "--fm-mark-accent-weight: 700",
  );
  assertStringIncludes(
    buildFastrReportCss("corporate"),
    "--fm-mark-accent-weight: inherit",
  );
});

Deno.test("the model-facing brief documents the marks it is allowed to write", () => {
  assertStringIncludes(FASTR_MD_SYNTAX_DOC, "{.danger}");
  // Everything the editor can insert is something the model is told about.
  for (const needle of [":::contents", "layout=", "highlight=", "numbering=sections", "color=", "size=", "underline"]) {
    assertStringIncludes(FASTR_MD_SYNTAX_DOC, needle);
  }
  // The one-line rule names every leaf, or the model closes a contents block.
  assertStringIncludes(
    FASTR_MD_SYNTAX_DOC,
    "`stat`, `contents`, `pagebreak` and `report` are ONE-LINE",
  );
  for (const needle of [":::pagebreak", "break=before", "pagesize", "orientation"]) {
    assertStringIncludes(FASTR_MD_SYNTAX_DOC, needle);
  }
  for (const role of FASTR_INK_ROLES) {
    assertStringIncludes(FASTR_MD_SYNTAX_DOC, `.${role}`);
  }
});

Deno.test("the editor surface sheet is scope-prefixed and token-driven", () => {
  const css = buildFastrEditorSurfaceCss(".fm-live-scope");
  for (const line of css.split("\n")) {
    if (!/\{$/.test(line.trim()) || !line.includes(".cm-")) continue;
    assert(
      line.trimStart().startsWith(".fm-live-scope "),
      `unscoped editor-surface rule: ${line.trim()}`,
    );
  }
  // The heading scale mirrors the structure sheet, so Edit shows print sizes.
  assertStringIncludes(css, ".cm-fm-h1");
  assertStringIncludes(css, "font-size: 2.15em");
  assertStringIncludes(css, "var(--fm-font-heading)");
  assertStringIncludes(css, ".cm-fm-link");
});

// ── Pagination: page breaks, break attributes and the paged sheet ────────────

import {
  buildFastrPagedCss,
  FASTR_PAGED_ATOMIC_SELECTORS,
  FASTR_PAGED_GLOBAL,
  fastrPagedRunnerJs,
  fastrPrintTitleHtml,
} from "../../lib/report_fastr_paged.ts";
import { fastrBreakMode, fastrSheetMm } from "../../lib/fastr_markdown_blocks.ts";

Deno.test(":::pagebreak is a one-line leaf that renders an empty marker", () => {
  assert(isFastrLeafBlock("pagebreak"));
  assert((FASTR_BLOCK_NAMES as readonly string[]).includes("pagebreak"));
  const html = renderFastrMarkdownToHtml(
    "Before\n\n:::pagebreak\n\nAfter",
    { lineAnchors: true },
  );
  assertStringIncludes(html, '<div class="fm-pagebreak" data-line="2">');
  assertStringIncludes(html, "<p data-line=\"4\">After</p>");
  assertEquals(listFastrContainerDefects("Before\n\n:::pagebreak\n\nAfter"), []);
  // The editor's snippet is the bare fence.
  assert(FASTR_BLOCK_SNIPPETS.some((s) => s.name === "pagebreak" && s.snippet === ":::pagebreak"));
});

Deno.test("break=before|after rides on any block as a data attribute; anything else is a defect", () => {
  assertEquals(fastrBreakMode({ break: "before" }), "before");
  assertEquals(fastrBreakMode({ break: "AFTER" }), "after");
  assertEquals(fastrBreakMode({ break: "page" }), undefined);
  assertEquals(fastrBreakMode({}), undefined);
  assertStringIncludes(
    containerHtmlFor("callout", { break: "before" }).extraAttrs,
    ' data-break="before"',
  );
  assertStringIncludes(
    containerHtmlFor("band", { tone: "dark", break: "after" }).extraAttrs,
    ' data-break="after"',
  );
  assertEquals(containerHtmlFor("callout", {}).extraAttrs, "");
  // The document header is silent and carries nothing.
  assertEquals(containerHtmlFor("report", { break: "before" }).silent, true);
  const html = renderFastrMarkdownToHtml(
    ":::callout{break=before}\nFresh page.\n:::",
    { lineAnchors: false },
  );
  assertStringIncludes(html, 'class="fm-callout fm-callout--note" data-break="before"');
  const defects = listFastrContainerDefects(":::callout{break=sideways}\nx\n:::");
  assertEquals(defects.length, 1);
  assertStringIncludes(defects[0].message, "break=before or break=after");
});

Deno.test("the paged sheet: sheet size, margins, footer, cover page, atomic blocks, explicit breaks", () => {
  const css = buildFastrPagedCss(
    { size: "a4", orientation: "portrait", margin: "normal" },
    { title: "Q3", pageWord: "Page", ofWord: "of" },
  );
  assertStringIncludes(css, "size: 210mm 297mm;");
  assertStringIncludes(css, "margin: 18mm 0;");
  assertStringIncludes(css, "--fm-print-column: 174mm;");
  assertStringIncludes(css, "--fm-print-area: 261mm;");
  assertStringIncludes(css, "content: string(fm-title);");
  assertStringIncludes(css, 'content: "Page " counter(page) " of " counter(pages);');
  // The cover's page: zero margins, no footer, and the cover fills it.
  assertStringIncludes(css, "@page fmcover {\n  margin: 0;");
  assertStringIncludes(css, "@bottom-left { content: none; }");
  assertStringIncludes(css, "page: fmcover;");
  assertStringIncludes(css, "var(--pagedjs-pagebox-height)");
  // Bleed geometry IS the page margin.
  assertStringIncludes(css, "--fm-bleed-margin: -18mm;");
  assertStringIncludes(css, "--fm-bleed-pad: 18mm;");
  // Every atomic block is protected, headings keep with next, orphans at 3.
  for (const sel of FASTR_PAGED_ATOMIC_SELECTORS) assertStringIncludes(css, sel);
  assertStringIncludes(css, "h1, h2, h3, h4, h5, h6 { break-after: avoid; break-inside: avoid; }");
  assertStringIncludes(css, "orphans: 3; widows: 3;");
  // Out of the flow and pinned to the page's corner: a marker pushed to the
  // next page by a margin would force a break after itself, a blank page.
  assertStringIncludes(css, ".fm-pagebreak {\n  break-after: page;\n  position: absolute;\n  top: 0;");
  assertStringIncludes(css, '[data-break="before"] { break-before: page; }');
  assertStringIncludes(css, '[data-break="after"] { break-after: page; }');
  // Contents entries get page numbers.
  assertStringIncludes(css, "target-counter(attr(href url), page)");
  // Landscape letter swaps the pair; footer words are CSS-string escaped.
  const land = buildFastrPagedCss(
    { size: "letter", orientation: "landscape", margin: "normal" },
    { title: "x", pageWord: 'Pa"ge', ofWord: "de" },
  );
  assertStringIncludes(land, "size: 279mm 216mm;");
  assertStringIncludes(land, 'content: "Pa\\"ge " counter(page) " de " counter(pages);');
  assertEquals(fastrSheetMm({ size: "a4", orientation: "landscape", margin: "narrow" }), [297, 210]);
});

Deno.test("the paged runner publishes on the agreed global and the title span is hidden text", () => {
  const js = fastrPagedRunnerJs();
  assertStringIncludes(js, JSON.stringify(FASTR_PAGED_GLOBAL));
  assertStringIncludes(js, "window.PagedPolyfill.preview()");
  assertStringIncludes(js, "registerHandlers");
  // The atomic list the runner reports splits for is the sheet's own.
  assertStringIncludes(js, JSON.stringify(FASTR_PAGED_ATOMIC_SELECTORS.join(", ")));
  assertEquals(
    fastrPrintTitleHtml("Q3 <review> & co"),
    '<span class="fm-print-title">Q3 &lt;review&gt; &amp; co</span>',
  );
  // The paged sheet is a template literal too; no backtick inside a comment.
  assert(!/\/\*[^*]*`/.test(buildFastrPagedCss(
    { size: "a4", orientation: "portrait", margin: "normal" },
    { title: "", pageWord: "Page", ofWord: "of" },
  )));
});

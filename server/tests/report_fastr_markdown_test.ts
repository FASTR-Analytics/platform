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
  FASTR_TONES,
  isDarkCssColor,
  isFastrLeafBlock,
  listFastrContainerDefects,
  parseContainerAttrs,
  parseContainerFence,
  isDarkCssBackground,
  readFastrDocumentSettings,
  safeCssBackground,
  safeCssColor,
  safeCssGradient,
} from "../../lib/fastr_markdown_blocks.ts";
import { renderFastrMarkdownToHtml } from "../../lib/report_fastr_markdown.ts";
import {
  buildFastrReportCss,
  fastrAllFontImportsCss,
} from "../../lib/report_fastr_css.ts";
import {
  FASTR_REPORT_THEMES,
  FASTR_SEMANTIC_COLORS,
  FASTR_THEME_TOKENS,
} from "../../lib/types/report_fastr_themes.ts";
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

Deno.test("stat and report are leaf blocks: one line, no closing fence", () => {
  assert(isFastrLeafBlock("stat"));
  assert(isFastrLeafBlock("report"));
  for (const name of FASTR_BLOCK_NAMES) {
    if (name !== "stat" && name !== "report") {
      assert(!isFastrLeafBlock(name));
    }
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
    containerHtmlFor("card", { tone: "dark" }).className,
    "fm-card fm-tone fm-tone--dark",
  );
  // An unknown tone degrades to the mildest one rather than emitting a class
  // no stylesheet defines.
  assertStringIncludes(
    containerHtmlFor("band", { tone: "chartreuse" }).className,
    "fm-tone--muted",
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

Deno.test("bands and covers are full-bleed sections", () => {
  const html = render(":::band{tone=dark}\n## Failing\ntext\n:::\n");
  assertStringIncludes(html, '<section class="fm-band fm-tone fm-tone--dark"');
  assertStringIncludes(html, "<h2>Failing</h2>");
  assertStringIncludes(
    render(":::cover{tone=solid}\n# T\n:::\n"),
    "fm-band fm-cover",
  );
});

// ── Document header ─────────────────────────────────────────────────────────

Deno.test(":::report configures the document and renders nothing", () => {
  const body = ":::report{background=muted width=wide}\n\n# T\n";
  const html = render(body);
  assert(!html.includes("fm-report"));
  assert(!html.includes(":::report"));
  assertStringIncludes(html, "<h1>T</h1>");

  const doc = readFastrDocumentSettings(body);
  assertStringIncludes(doc.className, "fm-doc");
  assertStringIncludes(doc.className, "fm-doc--wide");
  assertStringIncludes(doc.className, "fm-tone--muted");
  assertEquals(doc.style, "");
});

Deno.test("a literal document background carries its own ink", () => {
  const doc = readFastrDocumentSettings(':::report{background="#101010"}\n');
  assertEquals(doc.style, "background-color: #101010");
  assertStringIncludes(doc.className, "fm-ink--light");
});

Deno.test("no :::report means no document settings, and code fences are literal", () => {
  assertEquals(readFastrDocumentSettings("# T\n"), {
    className: "",
    style: "",
    extraAttrs: "",
  });
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

Deno.test("every theme defines a real dark ground and the tone rules read it", () => {
  for (const theme of FASTR_REPORT_THEMES) {
    const tokens = FASTR_THEME_TOKENS[theme];
    assert(isDarkCssColor(tokens.toneDark), `${theme} toneDark is not dark`);
    assertEquals(isDarkCssColor(tokens.toneDarkInk), false);
    const css = buildFastrReportCss(theme);
    assertStringIncludes(css, `--fm-tone-dark: ${tokens.toneDark};`);
    assertStringIncludes(css, ".fm-tone--dark {");
    assertStringIncludes(css, ".fm-band {");
    assertStringIncludes(css, ".fm-ink--light {");
  }
});

// A tone rule paints its ground AND re-scopes the ink tokens. If it reads the
// same custom property it redefines, var() resolves against the override —
// which rendered `tone=solid` as white text on a white card until it was
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

Deno.test("tone=gradient is the theme-safe sweep and carries no literal", () => {
  const h = containerHtmlFor("cover", { tone: "gradient" });
  assertStringIncludes(h.className, "fm-tone fm-tone--gradient");
  assertEquals(h.style, "");
  const css = buildFastrReportCss("ministry");
  assertStringIncludes(css, ".fm-tone--gradient {");
  assertStringIncludes(
    css,
    "linear-gradient(160deg, var(--fm-tone-dark), var(--fm-solid-bg))",
  );
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
        ":::band{tone=dark}\nx\n:::\n",
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
    const set = FASTR_SEMANTIC_COLORS[tokens.scheme];
    assertStringIncludes(css, `--fm-danger: ${set.danger};`);
    // The semantic colours are referenced, never inlined.
    assertStringIncludes(css, ".fm-callout--danger { --fm-callout-color: var(--fm-danger); }");
  }
});

Deno.test("every rule that darkens the ground re-points the semantic colours", () => {
  const css = buildFastrReportCss("default");
  const dark = FASTR_SEMANTIC_COLORS.dark;
  for (
    const rule of [
      "fm-tone--solid",
      "fm-tone--dark",
      "fm-tone--gradient",
      "fm-tone--inverse",
      "fm-ink--light",
      "fm-card--accent",
    ]
  ) {
    const block = new RegExp(`\\.${rule} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    assertStringIncludes(block, `--fm-danger: ${dark.danger};`);
    assertStringIncludes(block, `--fm-success: ${dark.success};`);
  }
  // And the one that LIGHTENS it goes back the other way.
  const lightBlock = /\.fm-ink--dark \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assertStringIncludes(
    lightBlock,
    `--fm-danger: ${FASTR_SEMANTIC_COLORS.light.danger};`,
  );
});

Deno.test("all 18 themes build, and every html style name now has one", async () => {
  assertEquals(FASTR_REPORT_THEMES.length, 18);
  const { REPORT_HTML_STYLES } = await import("../../lib/types/reports.ts");
  const themes = new Set<string>(FASTR_REPORT_THEMES);
  assertEquals(REPORT_HTML_STYLES.filter((s) => !themes.has(s)), []);
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

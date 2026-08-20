// Pins the format-aware report embed helpers (lib/types/reports.ts) — every
// token read/write in the app goes through them, and the editor's load-time
// orphan prune deletes registry entries based on what they (fail to) find.
//
// Run: deno test -A server/tests/report_format_helpers_test.ts

import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import {
  buildReportEmbedToken,
  buildReportPreview,
  getReportHtmlStyle,
  getStartingConfigForReport,
  REPORT_HTML_STYLES,
  reportConfigSchema,
  decodeReportHtmlEntities,
  escapeReportHtml,
  findReportEmbeds,
  getReportFormat,
  getStartingBodyForReport,
  parseReportEmbedLine,
  referencedReportEmbedIds,
  replaceReportEmbedTokens,
  rewriteReportEmbedToken,
  sanitizeReportCaption,
} from "../../lib/types/reports.ts";

const ID = "8b7c1c2e-6f2a-4a3b-9c1d-0e1f2a3b4c5d";
const ID2 = "11111111-2222-4333-8444-555555555555";

Deno.test("getReportFormat is total", () => {
  assertEquals(getReportFormat(undefined), "markdown");
  assertEquals(getReportFormat(null), "markdown");
  assertEquals(getReportFormat({}), "markdown");
  assertEquals(getReportFormat({ version: 1 }), "markdown");
  assertEquals(getReportFormat({ format: "html" }), "html");
  assertEquals(
    getReportFormat({ format: "HTML" as unknown as "html" }),
    "markdown",
  );
});

Deno.test("getReportHtmlStyle is total; the style is stored only for html configs", () => {
  assertEquals(getReportHtmlStyle(undefined), "default");
  assertEquals(getReportHtmlStyle({}), "default");
  assertEquals(getReportHtmlStyle({ htmlStyle: "editorial" }), "editorial");
  assertEquals(
    getReportHtmlStyle({ htmlStyle: "EDITORIAL" as unknown as "editorial" }),
    "default",
  );
  const html = getStartingConfigForReport("html", "editorial");
  assertEquals(reportConfigSchema.parse(html), {
    version: 1,
    format: "html",
    htmlStyle: "editorial",
  });
  const md = getStartingConfigForReport("markdown", "editorial");
  assertEquals("htmlStyle" in md, false);
  assertEquals(getStartingConfigForReport("html").htmlStyle, "default");
});

Deno.test("every declared html style round-trips through the config schema", () => {
  for (const style of REPORT_HTML_STYLES) {
    const cfg = getStartingConfigForReport("html", style);
    assertEquals(reportConfigSchema.parse(cfg).htmlStyle, style);
    assertEquals(getReportHtmlStyle(cfg), style);
  }
});

Deno.test("every styled preset briefs the AI (banner + design brief + shared constraints); default does not", async () => {
  const { getEditingReportInstructions } = await import(
    "../../lib/ai_tools/build_system_prompt.ts"
  );
  for (const style of REPORT_HTML_STYLES) {
    const ins = getEditingReportInstructions("X", "html", style);
    if (style === "default") {
      assertEquals(ins.includes("Design brief"), false);
      assertEquals(ins.includes("THIS REPORT'S STYLE IS"), false);
    } else {
      assert(ins.includes("THIS REPORT'S STYLE IS"), `${style}: banner missing`);
      assert(ins.includes("## Design brief:"), `${style}: brief missing`);
      assert(
        ins.includes("static markup only"),
        `${style}: shared constraints missing`,
      );
      assert(
        ins.includes("**Figures**"),
        `${style}: figure treatment missing`,
      );
    }
  }
  const md = getEditingReportInstructions("X", "markdown", "editorial");
  assertEquals(md.includes("Design brief"), false);
});

Deno.test("starting body per format", () => {
  assertEquals(getStartingBodyForReport("Q1 <review>", "markdown"), "# Q1 <review>\n\n");
  assertEquals(
    getStartingBodyForReport("Q1 <review>", "html"),
    "<h1>Q1 &lt;review&gt;</h1>\n",
  );
});

Deno.test("escape / decode round-trip", () => {
  const plain = `Fig & "quotes" <b> 'apos'`;
  const esc = escapeReportHtml(plain);
  assertEquals(esc, `Fig &amp; &quot;quotes&quot; &lt;b&gt; 'apos'`);
  assertEquals(decodeReportHtmlEntities(esc), plain);
  // single pass: an escaped ampersand entity is not double-decoded
  assertEquals(decodeReportHtmlEntities("&amp;lt;"), "&lt;");
  assertEquals(decodeReportHtmlEntities("&#39;&#x41;&nbsp;x"), "'A\u00a0x");
});

Deno.test("markdown tokens: find / line / build", () => {
  const body = `# T\n\n![Cap one](figure:${ID})\ntext ![inline](image:${ID2}) more\n`;
  const refs = findReportEmbeds(body, "markdown");
  assertEquals(refs.map((r) => [r.kind, r.id, r.caption]), [
    ["figure", ID, "Cap one"],
    ["image", ID2, "inline"],
  ]);
  assertEquals(body.slice(refs[0].start, refs[0].end), refs[0].raw);
  assertEquals(parseReportEmbedLine(`  ![c](figure:${ID})  `, "markdown"), {
    kind: "figure",
    id: ID,
    caption: "c",
  });
  assertEquals(parseReportEmbedLine(`x ![c](figure:${ID})`, "markdown"), undefined);
  assertEquals(
    buildReportEmbedToken("markdown", "figure", ID, " a [b]\nc "),
    `![a b c](figure:${ID})`,
  );
});

Deno.test("html tokens: quotes, order, self-closing, unquoted, uppercase, alt decode", () => {
  const body = [
    `<h1>T</h1>`,
    `<img src="figure:${ID}" alt="Cap &amp; one" class="wide">`,
    `<p>x <IMG ALT='two' SRC='image:${ID2}'/> y</p>`,
    `<img src=figure:${ID2} alt=bare>`,
    `<img src="https://x/y.png" alt="not an embed">`,
    `<img alt="a > b" src="figure:${ID}">`,
  ].join("\n");
  const refs = findReportEmbeds(body, "html");
  assertEquals(refs.map((r) => [r.kind, r.id, r.caption]), [
    ["figure", ID, "Cap & one"],
    ["image", ID2, "two"],
    ["figure", ID2, "bare"],
    ["figure", ID, "a > b"],
  ]);
  for (const r of refs) assertEquals(body.slice(r.start, r.end), r.raw);
});

Deno.test("html tokens: exact-line vs inline", () => {
  assertEquals(
    parseReportEmbedLine(`   <img src="figure:${ID}" alt="c" />  `, "html"),
    { kind: "figure", id: ID, caption: "c" },
  );
  assertEquals(
    parseReportEmbedLine(`<p><img src="figure:${ID}" alt="c"></p>`, "html"),
    undefined,
  );
  assertEquals(
    parseReportEmbedLine(`<img src="figure:${ID}"><img src="figure:${ID2}">`, "html"),
    undefined,
  );
});

Deno.test("html build token escapes and collapses the caption", () => {
  assertEquals(
    buildReportEmbedToken("html", "image", ID, ` A "q" &  <b>\n c `),
    `<img src="image:${ID}" alt="A &quot;q&quot; &amp; &lt;b&gt; c">`,
  );
  assertEquals(sanitizeReportCaption("html", " a [b]\n c "), "a [b] c");
  assertEquals(sanitizeReportCaption("markdown", " a [b]\n c "), "a b c");
});

Deno.test("rewriteReportEmbedToken keeps class/style/id (html) and patches src/alt only", () => {
  const raw = `<img class="wide" src='figure:${ID}' style="max-width:50%" alt="old &amp; cap" id="f1">`;
  const [ref] = findReportEmbeds(raw, "html");
  assertEquals(
    rewriteReportEmbedToken(ref, { caption: `new "cap"` }, "html"),
    `<img class="wide" src='figure:${ID}' style="max-width:50%" alt="new &quot;cap&quot;" id="f1">`,
  );
  assertEquals(
    rewriteReportEmbedToken(ref, { id: ID2 }, "html"),
    `<img class="wide" src='figure:${ID2}' style="max-width:50%" alt="old &amp; cap" id="f1">`,
  );
  // no alt → one is added right after src
  const noAlt = `<img src="figure:${ID}" class="x">`;
  const [ref2] = findReportEmbeds(noAlt, "html");
  assertEquals(
    rewriteReportEmbedToken(ref2, { caption: "c" }, "html"),
    `<img src="figure:${ID}" alt="c" class="x">`,
  );
  // markdown rebuilds
  const [ref3] = findReportEmbeds(`![old](figure:${ID})`, "markdown");
  assertEquals(
    rewriteReportEmbedToken(ref3, { id: ID2, caption: "n [x]" }, "markdown"),
    `![n x](figure:${ID2})`,
  );
});

Deno.test("replaceReportEmbedTokens replaces every occurrence of (kind,id) and counts", () => {
  const body = `<img src="figure:${ID}" alt="a">\n<p>t</p>\n<img src="figure:${ID}" alt="b" class="c">\n<img src="figure:${ID2}" alt="z">`;
  const res = replaceReportEmbedTokens(body, "html", "figure", ID, (ref) =>
    rewriteReportEmbedToken(ref, { id: ID2 }, "html"));
  assertEquals(res.count, 2);
  assertEquals(
    res.body,
    `<img src="figure:${ID2}" alt="a">\n<p>t</p>\n<img src="figure:${ID2}" alt="b" class="c">\n<img src="figure:${ID2}" alt="z">`,
  );
});

Deno.test("referencedReportEmbedIds('any') finds references the structured parsers miss", () => {
  const body = [
    `![md](figure:${ID})`, // markdown token in an html report
    `<a href="#"><img src = "image:${ID2}"></a>`, // spaces around '='
    `<img srcset="figure:${ID2} 1x">`, // wrong attribute
    `see figure:abc-DEF_1 in text`,
  ].join("\n");
  const any = referencedReportEmbedIds(body, "any");
  assertEquals([...any.figures].sort(), [ID, ID2, "abc-DEF_1"].sort());
  assertEquals([...any.images], [ID2]);
  const html = referencedReportEmbedIds(body, "html");
  assertEquals(html.figures.size, 0);
  assertEquals([...html.images], [ID2]);
});

Deno.test("buildReportPreview: markdown unchanged", () => {
  const p = buildReportPreview(`# Title\n\n![c](figure:${ID})\n\nSome **bold** text\n- item`);
  assertEquals(p.figureCount, 1);
  assertEquals(p.imageCount, 0);
  assertEquals(p.lines, [
    { text: "Title", headingLevel: 1 },
    { text: "Some bold text", headingLevel: 0 },
    { text: "item", headingLevel: 0 },
  ]);
});

Deno.test("buildReportPreview: html strips style/script/comments/tags, flags headings, counts embeds", () => {
  const body = [
    `<style>h1 { color: red } .x > p { margin: 0 }</style>`,
    `<script>alert(1)</script>`,
    `<!-- hidden -->`,
    `<div class="report"><h1 id="t">Q1 &amp; Q2 <small>report</small></h1>`,
    `<p>First <b>para</b><br>second line</p>`,
    `<img src="figure:${ID}" alt="a"><img src="image:${ID2}" alt="b">`,
    `<ul><li>one</li><li>two</li></ul>`,
    `<h2>Findings</h2></div>`,
  ].join("\n");
  const p = buildReportPreview(body, "html");
  assertEquals(p.figureCount, 1);
  assertEquals(p.imageCount, 1);
  assertEquals(p.lines, [
    { text: "Q1 & Q2 report", headingLevel: 1 },
    { text: "First para", headingLevel: 0 },
    { text: "second line", headingLevel: 0 },
    { text: "one", headingLevel: 0 },
    { text: "two", headingLevel: 0 },
    { text: "Findings", headingLevel: 2 },
  ]);
  assertStrictEquals(p.lines.some((l) => l.text.includes("color")), false);
});

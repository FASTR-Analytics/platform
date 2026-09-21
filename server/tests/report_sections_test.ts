// Pins the format-aware section resolver (lib/report_sections.ts) — the layer
// the AI's rewrite_section / insert_figure.afterHeading / headings index run
// on. HTML sections are resolved on the @lezer/html tree with the wrapper/flat
// rule (htmlSectionFor's doc comment / SYSTEM_12): a section is always a
// contiguous run of siblings, so a splice can never cross a tag boundary.
//
// Run: deno test -A server/tests/report_sections_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  countHtmlDefects,
  findReportHeadings,
  newHtmlDefect,
  injectReportHtmlLineAnchors,
  insertAfterReportHeading,
  resolveReportSection,
  spliceReportSection,
  validateHtmlFragment,
} from "../../lib/report_sections.ts";

function ok<T extends object>(r: T | { error: string }): T {
  if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
  return r;
}
function err(r: object): string {
  if ("error" in r) return String(r.error);
  throw new Error("expected an error");
}

// ── Markdown (historical behaviour) ─────────────────────────────────────────

Deno.test("markdown: headings, sections and splice are the historical #-line semantics", () => {
  const body = "# Title\n\nintro\n\n## A\n\na1\n\n### A.1\n\na11\n\n## B\n\nb1\n";
  const hs = findReportHeadings(body, "markdown");
  assertEquals(hs.map((h) => [h.level, h.text, h.line]), [
    [1, "Title", 1],
    [2, "A", 5],
    [3, "A.1", 9],
    [2, "B", 13],
  ]);
  assertEquals(hs[1].section, {
    from: body.indexOf("## A"),
    to: body.indexOf("## B"),
    fromLine: 5,
    toLine: 11,
    mode: "flat",
  });
  const spliced = ok(spliceReportSection(body, "markdown", "a", "## A\n\nnew\n\n", undefined));
  assertEquals(
    spliced.newBody,
    "# Title\n\nintro\n\n## A\n\nnew\n## B\n\nb1\n",
  );
  // last section runs to EOF (and the trailing newline goes with it, as before)
  const last = ok(spliceReportSection(body, "markdown", "B", "## B\nnb", undefined));
  assertEquals(last.newBody, "# Title\n\nintro\n\n## A\n\na1\n\n### A.1\n\na11\n\n## B\nnb");
});

Deno.test("markdown: insertAfterReportHeading is the historical insertFigureToken", () => {
  const body = "# T\n\ntext\n";
  assertEquals(
    ok(insertAfterReportHeading(body, "markdown", "t", "TOKEN")).newBody,
    "# T\n\nTOKEN\n\n\ntext\n",
  );
  assertEquals(
    ok(insertAfterReportHeading(body, "markdown", undefined, "TOKEN")).newBody,
    "# T\n\ntext\n\nTOKEN\n",
  );
  assertStringIncludes(
    err(insertAfterReportHeading(body, "markdown", "nope", "TOKEN")),
    "omit afterHeading",
  );
});

// ── HTML: the wrapper / flat rule ───────────────────────────────────────────

const FLAT = [
  `<h1>Report</h1>`,
  `<p>intro</p>`,
  `<h2>Results</h2>`,
  `<p>r1</p>`,
  `<h3>Detail</h3>`,
  `<p>d1</p>`,
  `<h2>Discussion</h2>`,
  `<p>x</p>`,
].join("\n");

Deno.test("html flat: sibling run to the next heading of level ≤ N; h1 spans the document", () => {
  const hs = findReportHeadings(FLAT, "html");
  assertEquals(hs.map((h) => [h.level, h.text, h.line, h.section.mode]), [
    [1, "Report", 1, "flat"],
    [2, "Results", 3, "flat"],
    [3, "Detail", 5, "flat"],
    [2, "Discussion", 7, "flat"],
  ]);
  const results = hs[1].section;
  assertEquals(FLAT.slice(results.from, results.to), `<h2>Results</h2>\n<p>r1</p>\n<h3>Detail</h3>\n<p>d1</p>`);
  assertEquals([results.fromLine, results.toLine], [3, 6]);
  // to excludes the trailing whitespace before the boundary heading
  assertEquals(FLAT[results.to], "\n");
  const report = hs[0].section;
  assertEquals(FLAT.slice(report.from, report.to), FLAT);
  const disc = hs[3].section;
  assertEquals(FLAT.slice(disc.from, disc.to), `<h2>Discussion</h2>\n<p>x</p>`);
});

Deno.test("html flat: splice keeps the newline before the next heading", () => {
  const out = ok(spliceReportSection(FLAT, "html", "results", "<h2>Results</h2>\n<p>NEW</p>\n\n", undefined)).newBody;
  assertEquals(
    out,
    [
      `<h1>Report</h1>`,
      `<p>intro</p>`,
      `<h2>Results</h2>`,
      `<p>NEW</p>`,
      `<h2>Discussion</h2>`,
      `<p>x</p>`,
    ].join("\n"),
  );
});

const WRAPPED = [
  `<div class="page">`,
  `  <header><h1>Report</h1><p class="sub">subtitle</p></header>`,
  `  <section id="results">`,
  `    <div class="header"><h2>Results</h2><span class="badge">Q1</span></div>`,
  `    <p>r1</p>`,
  `    <div class="grid"><div class="card"><h3>Sub A</h3><p>a</p></div><div class="card"><h3>Sub B</h3><p>b</p></div></div>`,
  `  </section>`,
  `  <section id="discussion">`,
  `    <h2>Discussion</h2>`,
  `    <p>x</p>`,
  `  </section>`,
  `</div>`,
].join("\n");

Deno.test("html wrapper: heading inside <div class=header> inside <section> climbs to the section", () => {
  const hs = findReportHeadings(WRAPPED, "html");
  const results = hs.find((h) => h.text === "Results")!;
  assertEquals(results.section.mode, "wrapper");
  assertEquals(results.section.wrapperTag, "section");
  assertEquals(
    WRAPPED.slice(results.section.from, results.section.to),
    WRAPPED.slice(WRAPPED.indexOf(`<section id="results">`), WRAPPED.indexOf(`</section>`) + `</section>`.length),
  );
  assertEquals([results.section.fromLine, results.section.toLine], [3, 7]);
  // h1 in <header> in the page div, and no other h1 → the whole page div
  const title = hs.find((h) => h.text === "Report")!;
  assertEquals(title.section.mode, "wrapper");
  assertEquals(title.section.wrapperTag, "div");
  assertEquals(WRAPPED.slice(title.section.from, title.section.to), WRAPPED);
  // h3 cards: each card is its own wrapper (the grid holds the sibling h3)
  const subA = hs.find((h) => h.text === "Sub A")!;
  assertEquals(subA.section.mode, "wrapper");
  assertEquals(WRAPPED.slice(subA.section.from, subA.section.to), `<div class="card"><h3>Sub A</h3><p>a</p></div>`);
});

Deno.test("html wrapper: replacement must start with the wrapper tag", () => {
  const e = err(spliceReportSection(WRAPPED, "html", "Results", "<h2>Results</h2><p>only inner</p>", undefined));
  assertStringIncludes(e, "must therefore start with <section");
  assertStringIncludes(e, "starts with <h2>");
  const okRes = ok(spliceReportSection(
    WRAPPED,
    "html",
    "Results",
    `<section id="results">\n  <h2>Results</h2>\n  <p>NEW</p>\n</section>\n`,
    undefined,
  ));
  assert(okRes.newBody.includes(`<section id="results">\n  <h2>Results</h2>\n  <p>NEW</p>\n</section>\n  <section id="discussion">`));
  assert(!okRes.newBody.includes("Sub A"));
});

Deno.test("html: one <div> wrapping several sections → flat runs inside it; an h3 in a following div does not end an h2 run", () => {
  const body = [
    `<div class="report">`,
    `<h2>A</h2>`,
    `<p>a</p>`,
    `<div class="box"><h3>A detail</h3><p>ad</p></div>`,
    `<h2>B</h2>`,
    `<p>b</p>`,
    `</div>`,
  ].join("\n");
  const hs = findReportHeadings(body, "html");
  const a = hs.find((h) => h.text === "A")!;
  assertEquals(a.section.mode, "flat");
  assertEquals(body.slice(a.section.from, a.section.to), `<h2>A</h2>\n<p>a</p>\n<div class="box"><h3>A detail</h3><p>ad</p></div>`);
  const b = hs.find((h) => h.text === "B")!;
  assertEquals(b.section.mode, "flat");
  assertEquals(body.slice(b.section.from, b.section.to), `<h2>B</h2>\n<p>b</p>`);
});

Deno.test("html: content BEFORE the heading inside a candidate wrapper → flat (preamble / badge)", () => {
  const preamble = [
    `<div class="report">`,
    `  <p class="meta">Prepared by X</p>`,
    `  <h2>Findings</h2>`,
    `  <p>f1</p>`,
    `</div>`,
  ].join("\n");
  const [f] = findReportHeadings(preamble, "html");
  assertEquals(f.section.mode, "flat");
  assertEquals(preamble.slice(f.section.from, f.section.to), `<h2>Findings</h2>\n  <p>f1</p>`);
  const badge = `<div class="card"><span class="badge">NEW</span><h3>Stockouts</h3><p>s</p></div>`;
  const [s] = findReportHeadings(badge, "html");
  assertEquals(s.section.mode, "flat");
  assertEquals(badge.slice(s.section.from, s.section.to), `<h3>Stockouts</h3><p>s</p>`);
  // comments and whitespace before the heading do not break the leading edge
  const commented = `<section>\n  <!-- c -->\n  <h2>A</h2><p>a</p>\n</section>`;
  const [c] = findReportHeadings(commented, "html");
  assertEquals(c.section.mode, "wrapper");
});

Deno.test("html: repeated headings need occurrenceIndex; heading text is decoded and collapsed", () => {
  const body = `<h2>Notes &amp;   <em>more</em></h2><p>1</p><h2>Notes &amp; more</h2><p>2</p>`;
  const hs = findReportHeadings(body, "html");
  assertEquals(hs.map((h) => h.text), ["Notes & more", "Notes & more"]);
  assertStringIncludes(err(resolveReportSection(body, "html", "notes & more", undefined)), "occurrenceIndex (1-2)");
  const second = ok(resolveReportSection(body, "html", "notes & more", 2));
  assertEquals(body.slice(second.from, second.to), `<h2>Notes &amp; more</h2><p>2</p>`);
  assertStringIncludes(err(resolveReportSection(body, "html", "notes & more", 3)), "out of range");
  assertStringIncludes(err(resolveReportSection(body, "html", "missing", undefined)), "No section with heading");
});

Deno.test("html insertAfterReportHeading: after the header block, not inside it; append inside a single wrapper", () => {
  const afterHeader = ok(insertAfterReportHeading(WRAPPED, "html", "results", `<img src="figure:x" alt="">`)).newBody;
  assert(afterHeader.includes(`<span class="badge">Q1</span></div>\n<img src="figure:x" alt="">\n\n    <p>r1</p>`));
  const flat = ok(insertAfterReportHeading(FLAT, "html", "Results", "TOKEN")).newBody;
  assert(flat.includes(`<h2>Results</h2>\nTOKEN\n\n<p>r1</p>`));
  // single top-level wrapper → before its close tag
  const single = `<div class="report">\n<h1>T</h1>\n<p>x</p>\n</div>\n`;
  assertEquals(
    ok(insertAfterReportHeading(single, "html", undefined, "TOKEN")).newBody,
    `<div class="report">\n<h1>T</h1>\n<p>x</p>\n\nTOKEN\n</div>\n`,
  );
  // several top-level nodes → append at end
  assertEquals(
    ok(insertAfterReportHeading(`<h1>T</h1>\n<p>x</p>\n\n`, "html", undefined, "TOKEN")).newBody,
    `<h1>T</h1>\n<p>x</p>\n\nTOKEN\n`,
  );
  assertStringIncludes(err(insertAfterReportHeading(FLAT, "html", "nope", "T")), "omit afterHeading");
});

// ── Well-formedness ─────────────────────────────────────────────────────────

Deno.test("validateHtmlFragment: accepts void tags and optional end tags", () => {
  assertEquals(validateHtmlFragment(`<p>a<br>b<img src="figure:x" alt="">c<hr></p>`), undefined);
  assertEquals(validateHtmlFragment(`<ul><li>a<li>b</ul>`), undefined);
  assertEquals(validateHtmlFragment(`<div><p>text</div>`), undefined);
  assertEquals(validateHtmlFragment(`<table><tr><td>a<td>b</table>`), undefined);
  assertEquals(validateHtmlFragment(`<style>h1{color:red} .a > b {}</style><h1>T</h1>`), undefined);
  assertEquals(validateHtmlFragment(`<!-- c --><p>a &amp; b</p>`), undefined);
});

Deno.test("validateHtmlFragment: rejects stray closes, unclosed elements, broken tags, doctype", () => {
  assertStringIncludes(validateHtmlFragment(`<div>a</span>b</div>`)!, "stray </span> at line 1");
  assertStringIncludes(validateHtmlFragment(`<p>x</p>\n<div>\n<p>never closed`)!, "unclosed <div> opened at line 2");
  assertStringIncludes(validateHtmlFragment(`<h2>Title <b>bold</h2>`)!, "unclosed <b>");
  assertStringIncludes(validateHtmlFragment(`<div`)!, "line 1");
  assertStringIncludes(validateHtmlFragment(`<p>ok</p><div class="a`)!, "line 1");
  assertStringIncludes(validateHtmlFragment(`<p>a < b</p>`)!, `stray "<"`);
  assertStringIncludes(validateHtmlFragment(`<!DOCTYPE html><p>a</p>`)!, "<!DOCTYPE>");
  assertEquals(countHtmlDefects(`<div>a</span>b</div><span>`), 2);
  assertEquals(countHtmlDefects(`<div>ok</div>`), 0);
});

Deno.test("newHtmlDefect: only defects the edit ADDED count (pre-existing ones may shift lines)", () => {
  const before = `<div>\n<p>a</p>\n<span>never closed\n<p>b</p>\n</div>`;
  // same defect, moved down a line by an inserted paragraph → not new
  assertEquals(newHtmlDefect(before, before.replace("<p>a</p>", "<p>a</p>\n<p>new</p>")), undefined);
  // an edit that spans a tag boundary but stays balanced → not new
  assertEquals(newHtmlDefect(`<p>one</p>\n<p>two</p>`, `<p>one</p>\n<p>three</p>\n<p>two</p>`), undefined);
  // a fresh unclosed div → new
  assertStringIncludes(newHtmlDefect(before, before.replace("<p>b</p>", "<div><p>b</p>"))!, "unclosed <div>");
  // a stray close → new
  assertStringIncludes(newHtmlDefect(`<p>a</p>`, `<p>a</p></section>`)!, "stray </section>");
});

// ── Line anchors ────────────────────────────────────────────────────────────

Deno.test("injectReportHtmlLineAnchors: block tags get 0-based data-line; raw text, comments and existing anchors untouched", () => {
  const html = [
    `<!-- <p>not a tag</p> -->`,
    `<style>`,
    `p > b { color: red } /* <div> */`,
    `</style>`,
    `<div class="a" title="x > y">`,
    `<h2 data-line="99">A</h2><span>inline</span>`,
    `<p>t <img src="figure:x" alt="a > b"> u</p>`,
    `</div>`,
  ].join("\n");
  const out = injectReportHtmlLineAnchors(html);
  assertEquals(
    out,
    [
      `<!-- <p>not a tag</p> -->`,
      `<style>`,
      `p > b { color: red } /* <div> */`,
      `</style>`,
      `<div data-line="4" class="a" title="x > y">`,
      `<h2 data-line="99">A</h2><span>inline</span>`,
      `<p data-line="6">t <img data-line="6" src="figure:x" alt="a > b"> u</p>`,
      `</div>`,
    ].join("\n"),
  );
});

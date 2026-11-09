// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Pins paragraph alignment (report-forge/engine/fastr_paragraph_align.ts):
// the `{align=…}` suffix as the renderer reads it, the toolbar's edit, the
// caret's alignment, and how typing keeps the hidden suffix last.
//
// Run: deno test -A report-forge/tests/fastr_paragraph_align_test.ts

import { assertEquals } from "@std/assert";
import {
  fastrAlignAwareInsert,
  fastrDocumentOutline,
  fastrParagraphAligns,
  paragraphAlignAt,
  renderFastrMarkdownToHtml,
  setParagraphAlignEdit,
  type TextEdit,
} from "../engine/mod.ts";
import { findReportHeadings } from "../engine/report_sections.ts";

const html = (body: string) =>
  renderFastrMarkdownToHtml(body, { lineAnchors: false }).replace(/\n/g, "");

function applyEdits(doc: string, changes: TextEdit[]): string {
  let out = doc;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

function typed(doc: string, at: number, insert: string): string {
  const r = fastrAlignAwareInsert(doc, at, insert);
  if (r === undefined) return doc.slice(0, at) + insert + doc.slice(at);
  return applyEdits(doc, [
    { from: r.at, to: r.at, insert: r.insert },
    ...(r.extra
      ? [{ from: r.extra.at, to: r.extra.at, insert: r.extra.insert }]
      : []),
  ]);
}

Deno.test("the renderer reads the suffix off a paragraph's last line only", () => {
  assertEquals(
    html("Some text. {align=justify}"),
    '<p class="fm-align-justify">Some text.</p>',
  );
  assertEquals(
    html("Line one\nline two {align=center}"),
    '<p class="fm-align-center">Line one<br>line two</p>',
  );
  // On a line of its own, the suffix takes its line break with it.
  assertEquals(
    html("Line one\n{align=right}"),
    '<p class="fm-align-right">Line one</p>',
  );
  // Anywhere else, and in code, it is text.
  assertEquals(
    html("Not at end {align=justify} more"),
    "<p>Not at end {align=justify} more</p>",
  );
  assertEquals(
    html("`code {align=justify}`"),
    "<p><code>code {align=justify}</code></p>",
  );
});

Deno.test("every line of an aligned paragraph takes its alignment", () => {
  const lines = [
    "# H",
    "",
    "a",
    "b {align=justify}",
    "",
    "c",
    "- d {align=center}",
  ];
  assertEquals(
    [...fastrParagraphAligns(lines).entries()],
    [[2, "justify"], [3, "justify"]],
  );
});

Deno.test("the toolbar's edit sets, replaces and clears the suffix", () => {
  const doc =
    "# H\n\nPara one a\nline b\n\nPara two {align=center}\n\n- item\n\nLast\n{align=right}\n";
  const set = (
    from: number,
    to: number,
    a: "left" | "center" | "right" | "justify",
  ) => applyEdits(doc, setParagraphAlignEdit(doc, from, to, a).changes);
  assertEquals(
    set(6, 6, "justify"),
    "# H\n\nPara one a\nline b {align=justify}\n\nPara two {align=center}\n\n- item\n\nLast\n{align=right}\n",
  );
  assertEquals(
    set(doc.indexOf("two"), doc.indexOf("two"), "left"),
    "# H\n\nPara one a\nline b\n\nPara two\n\n- item\n\nLast\n{align=right}\n",
  );
  // The heading takes it too, the list item is left alone, and a suffix on
  // its own line folds onto the text.
  assertEquals(
    set(0, doc.length, "justify"),
    "# H {align=justify}\n\nPara one a\nline b {align=justify}\n\nPara two {align=justify}\n\n- item\n\nLast {align=justify}\n",
  );
  assertEquals(
    paragraphAlignAt(doc, doc.indexOf("Para one")),
    "left",
  );
  assertEquals(paragraphAlignAt(doc, doc.indexOf("Para two")), "center");
  assertEquals(paragraphAlignAt(doc, doc.indexOf("Last")), "right");
  assertEquals(paragraphAlignAt(doc, 1), "left");
  assertEquals(paragraphAlignAt(doc, doc.indexOf("item")), undefined);
});

Deno.test("typing keeps the suffix last, and a split keeps the alignment on both halves", () => {
  const d = "Hello world {align=justify}";
  assertEquals(typed(d, d.length, "!"), "Hello world! {align=justify}");
  assertEquals(typed(d, 11, "!"), "Hello world! {align=justify}");
  assertEquals(typed(d, 5, "X"), "HelloX world {align=justify}");
  assertEquals(typed(d, d.length, "\n"), "Hello world\n {align=justify}");
  const own = "Hello world\n {align=justify}";
  assertEquals(
    typed(own, own.indexOf(" {"), "\n"),
    "Hello world {align=justify}\n\n {align=justify}",
  );
  const two = "Hello world\nmore text {align=center}";
  assertEquals(
    typed(two, two.indexOf("more"), "\n"),
    "Hello world {align=center}\n\nmore text {align=center}",
  );
  assertEquals(
    typed(two, two.indexOf("text"), "\n"),
    "Hello world\nmore \ntext {align=center}",
  );
  // Typed in front of a bare suffix alone on its line, a space keeps it one.
  const bare = "Hello world\n\n{align=justify}";
  assertEquals(
    typed(bare, bare.indexOf("{"), "S"),
    "Hello world\n\nS {align=justify}",
  );
  assertEquals(fastrAlignAwareInsert("Plain text", 5, "\n"), undefined);
});

Deno.test("a heading takes its own suffix, and its text, anchor and section name leave it out", () => {
  assertEquals(
    html("## Findings {align=center}"),
    '<h2 class="fm-align-center fm-top">Findings</h2>',
  );
  const outline = fastrDocumentOutline(
    "# Intro\n\n## Findings {align=center}\n",
  );
  assertEquals(outline.map((h) => [h.text, h.slug]), [
    ["Intro", "fm-intro"],
    ["Findings", "fm-findings"],
  ]);
  assertEquals(
    findReportHeadings("# One {align=right}\n\nText.\n").map((h) => h.text),
    ["One"],
  );
});

Deno.test("the toolbar aligns a heading's line, and typing at its end keeps the suffix", () => {
  const doc = "# Title\n\nText.\n";
  assertEquals(
    applyEdits(doc, setParagraphAlignEdit(doc, 2, 2, "center").changes),
    "# Title {align=center}\n\nText.\n",
  );
  const all = applyEdits(
    doc,
    setParagraphAlignEdit(doc, 0, doc.length, "right").changes,
  );
  assertEquals(all, "# Title {align=right}\n\nText. {align=right}\n");
  assertEquals(paragraphAlignAt(all, 2), "right");
  const h = "# Title {align=center}";
  assertEquals(typed(h, h.length, "s"), "# Titles {align=center}");
  // Enter at the heading's visible end opens the next line after the suffix.
  assertEquals(typed(h, 7, "\n"), "# Title {align=center}\n");
  // An empty heading: the marker's space is not the suffix's.
  const empty = "# {align=center}";
  assertEquals(typed(empty, 2, "X"), "# X {align=center}");
});

// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Pins the section resolver (report-forge/engine/report_sections.ts): the layer the AI's
// rewrite_section / insert_figure.afterHeading / headings index run on.
//
// Run: deno test -A report-forge/tests/report_sections_test.ts

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  findReportHeadings,
  insertAfterReportHeading,
  resolveReportSection,
  spliceReportSection,
} from "../engine/report_sections.ts";

function ok<T extends object>(r: T | { error: string }): T {
  if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
  return r;
}
function err(r: object): string {
  if ("error" in r) return String(r.error);
  throw new Error("expected an error");
}

Deno.test("headings, sections and splice follow the #-line scan", () => {
  const body =
    "# Title\n\nintro\n\n## A\n\na1\n\n### A.1\n\na11\n\n## B\n\nb1\n";
  const hs = findReportHeadings(body);
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
  });
  const spliced = ok(
    spliceReportSection(body, "a", "## A\n\nnew\n\n", undefined),
  );
  assertEquals(
    spliced.newBody,
    "# Title\n\nintro\n\n## A\n\nnew\n\n## B\n\nb1\n",
  );
  // the last section runs to EOF; the body's final newline stays
  const last = ok(
    spliceReportSection(body, "B", "## B\nnb", undefined),
  );
  assertEquals(
    last.newBody,
    "# Title\n\nintro\n\n## A\n\na1\n\n### A.1\n\na11\n\n## B\nnb\n",
  );
});

Deno.test("insertAfterReportHeading: after the heading line, or appended", () => {
  const body = "# T\n\ntext\n";
  assertEquals(
    ok(insertAfterReportHeading(body, "t", "TOKEN")).newBody,
    "# T\n\nTOKEN\n\n\ntext\n",
  );
  assertEquals(
    ok(insertAfterReportHeading(body, undefined, "TOKEN")).newBody,
    "# T\n\ntext\n\nTOKEN\n",
  );
  assertStringIncludes(
    err(insertAfterReportHeading(body, "nope", "TOKEN")),
    "omit afterHeading",
  );
});

Deno.test("a heading inside a container or a code fence is not a section", () => {
  const body = [
    "# Title",
    "",
    ":::callout{kind=info}",
    "## Inside a block",
    ":::",
    "",
    "```",
    "## Inside code",
    "```",
    "",
    "## Real",
    "",
    "text",
    "",
  ].join("\n");
  assertEquals(findReportHeadings(body).map((h) => h.text), ["Title", "Real"]);
  const picked = ok(resolveReportSection(body, "real", undefined));
  assertEquals(picked.heading.line, 11);
  assertStringIncludes(
    err(resolveReportSection(body, "Inside a block", undefined)),
    "No section with heading",
  );
});

Deno.test("repeated headings need occurrenceIndex", () => {
  const body = "## A\n\none\n\n## A\n\ntwo\n";
  assertStringIncludes(
    err(resolveReportSection(body, "A", undefined)),
    "Provide occurrenceIndex (1-2)",
  );
  assertEquals(ok(resolveReportSection(body, "A", 2)).heading.line, 5);
  assertStringIncludes(
    err(resolveReportSection(body, "A", 3)),
    "out of range",
  );
});

// A section's content is replaced; the blank lines between it and the next
// heading, and the body's final newline, are not the section's to take. A
// CRLF body stays CRLF.
Deno.test("splice keeps the separator after the section and the final newline", () => {
  const body = "## A\na\n\n## B\nb\n";
  assertEquals(
    ok(spliceReportSection(body, "A", "## A\nNEW", undefined)).newBody,
    "## A\nNEW\n\n## B\nb\n",
  );
  assertEquals(
    ok(spliceReportSection(body, "B", "## B\nNEW\n\n", undefined)).newBody,
    "## A\na\n\n## B\nNEW\n",
  );
  assertEquals(
    ok(spliceReportSection("## A\na\n\n\n## B\nb", "B", "## B\nNEW", undefined))
      .newBody,
    "## A\na\n\n\n## B\nNEW",
  );
  const crlf = "## A\r\na\r\n\r\n## B\r\nb\r\n";
  assertEquals(
    ok(spliceReportSection(crlf, "A", "## A\nNEW\n", undefined)).newBody,
    "## A\r\nNEW\r\n\r\n## B\r\nb\r\n",
  );
  assertEquals(
    ok(spliceReportSection("## A\r\na", "A", "## A\nNEW", undefined)).newBody,
    "## A\r\nNEW",
  );
});

// The headings index reads the renderer's tokens, so it lists what the
// document draws as a heading, as the outline and the contents block do.
Deno.test("headings follow the rendered document", () => {
  const heads = (body: string) =>
    findReportHeadings(body).map((h) => [h.level, h.text, h.line]);
  assertEquals(heads("## Foo ##\ntext\n"), [[2, "Foo", 1]]);
  assertEquals(heads("intro\n\n   ## Ind\ntext\n"), [[2, "Ind", 3]]);
  assertEquals(heads("Title\n=====\n\ntext\n"), [[1, "Title", 1]]);
  assertEquals(heads("<div>\n## Not\n</div>\n"), []);
  assertEquals(heads("```\n## Code\n```\n"), []);
  // A setext heading's section starts on its text line and the token goes
  // after its underline.
  const setext = "Title\n=====\ntext\n";
  assertEquals(findReportHeadings(setext)[0].section.fromLine, 1);
  assertEquals(
    ok(insertAfterReportHeading(setext, "Title", "TOKEN")).newBody,
    "Title\n=====\n\nTOKEN\n\ntext\n",
  );
});

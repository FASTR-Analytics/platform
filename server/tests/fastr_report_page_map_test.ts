import { assertStringIncludes } from "@std/assert";
import { fastrPageMapText } from "../../lib/fastr_report_page_map.ts";
import type { FastrPagedResult } from "../../lib/report_fastr_paged.ts";

const body = [
  ":::report{background=paper}",
  "",
  ':::cover{tone=ink layout=poster kicker="K" sub="S"}',
  "# ANC1 Reporting Completeness",
  ":::",
  "",
  "Completeness measures the share of facility month records that meet the criteria.",
  "",
  ":::tiles{cols=3}",
  ':::stat{value="91.8%" label="A"}',
  ':::stat{value="97.2%" label="B"}',
  ':::stat{value="67.9%" label="C"}',
  ":::",
  "",
  "# Where ANC1 completeness stands",
  "",
  "ANC1 remains one of the better reported indicators in the system.",
  "",
  ":::columns{cols=2}",
  ":::col{tone=cool}",
  "**Gaining**",
  ":::",
  ":::col{tone=warm}",
  "**Slipping**",
  ":::",
  ":::",
  "",
  ":::band{tone=ink}",
  "Prepared from the FASTR data quality module",
  ":::",
].join("\n");

// A4: 987px of content between the margins; page 1 opens flush to the top.
const result: FastrPagedResult = {
  total: 3,
  sheet: { width: 794, height: 1123 },
  pages: [
    { number: 1, firstLine: 2, lines: [2, 6, 8], cover: false, flushTop: true, contentHeight: 1000 },
    { number: 2, firstLine: 14, lines: [14, 16], cover: false, flushTop: false, contentHeight: 300 },
    { number: 3, firstLine: 18, lines: [18, 27], cover: false, flushTop: false, contentHeight: 500 },
  ],
  splits: [],
  blocks: [
    { line: 2, height: 620 },
    { line: 6, height: 150 },
    { line: 8, height: 230 },
    { line: 14, height: 124 },
    { line: 16, height: 160 },
    { line: 18, height: 300 },
    { line: 27, height: 200 },
  ],
};

Deno.test("the page map names every block, its share, and the pages left short", () => {
  const text = fastrPageMapText(result, body);
  assertStringIncludes(text, 'Page 1 of 3: 95% full');
  assertStringIncludes(text, 'cover "ANC1 Reporting Completeness"');
  assertStringIncludes(text, "tiles (3 stats)");
  assertStringIncludes(text, 'section heading "Where ANC1 completeness stands"');
  assertStringIncludes(text, "Page 2 of 3: 30% full, SHORT: the next block did not fit and moved whole to page 3: columns (2) (30%)");
  assertStringIncludes(text, "Page 3 of 3 (last): 51% full");
  assertStringIncludes(text, 'band "Prepared from the FASTR data quality module"');
  assertStringIncludes(text, "Problems:");
  assertStringIncludes(text, "Page 2 is 30% full");
});

Deno.test("a last page holding only closing blocks is a stub", () => {
  const stub: FastrPagedResult = {
    ...result,
    pages: [
      { number: 1, firstLine: 2, lines: [2], cover: false, flushTop: true, contentHeight: 1000 },
      { number: 2, firstLine: 27, lines: [27], cover: false, flushTop: false, contentHeight: 200 },
    ],
    total: 2,
  };
  const text = fastrPageMapText(stub, body);
  assertStringIncludes(text, "Page 2 of 2 (last): 20% full, STUB");
  assertStringIncludes(text, "a stub");
});

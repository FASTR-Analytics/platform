// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

import { assertFalse, assertStringIncludes } from "@std/assert";
import { fastrPageMapText } from "../engine/fastr_report_page_map.ts";
import type { FastrPagedResult } from "../engine/report_fastr_paged.ts";

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
    {
      number: 1,
      firstLine: 2,
      lines: [2, 6, 8],
      cover: false,
      flushTop: true,
      contentHeight: 1000,
    },
    {
      number: 2,
      firstLine: 14,
      lines: [14, 16],
      cover: false,
      flushTop: false,
      contentHeight: 300,
    },
    {
      number: 3,
      firstLine: 18,
      lines: [18, 27],
      cover: false,
      flushTop: false,
      contentHeight: 500,
    },
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
  assertStringIncludes(text, "Page 1 of 3: 95% full");
  assertStringIncludes(text, 'cover "ANC1 Reporting Completeness"');
  assertStringIncludes(text, "tiles (3 stats)");
  assertStringIncludes(
    text,
    'section heading "Where ANC1 completeness stands"',
  );
  assertStringIncludes(
    text,
    "Page 2 of 3: 30% full, SHORT: the next block did not fit and moved whole to page 3: columns (2) (30%)",
  );
  assertStringIncludes(text, "Page 3 of 3 (last): 51% full");
  assertStringIncludes(
    text,
    'band "Prepared from the FASTR data quality module"',
  );
  assertStringIncludes(text, "Problems:");
  assertStringIncludes(text, "Page 2 is 30% full");
});

Deno.test("a last page holding only closing blocks is a stub", () => {
  const stub: FastrPagedResult = {
    ...result,
    pages: [
      {
        number: 1,
        firstLine: 2,
        lines: [2],
        cover: false,
        flushTop: true,
        contentHeight: 1000,
      },
      {
        number: 2,
        firstLine: 27,
        lines: [27],
        cover: false,
        flushTop: false,
        contentHeight: 200,
      },
    ],
    total: 2,
  };
  const text = fastrPageMapText(stub, body);
  assertStringIncludes(text, "Page 2 of 2 (last): 20% full, STUB");
  assertStringIncludes(text, "a stub");
});

Deno.test("a page a break leaves under two thirds full is short, and the section after it is not a stub", () => {
  const broken = [
    ':::cover{tone=ink layout=poster kicker="K" sub="S"}',
    "# ANC1 Reporting Completeness",
    ":::",
    "",
    "Completeness measures the share of facility month records.",
    "",
    ":::pagebreak",
    "# Recommendations",
    "",
    "Follow up with the districts that fell behind.",
  ].join("\n");
  const paged: FastrPagedResult = {
    total: 2,
    sheet: { width: 794, height: 1123 },
    pages: [
      {
        number: 1,
        firstLine: 0,
        lines: [0, 4, 6],
        cover: false,
        flushTop: true,
        contentHeight: 400,
      },
      {
        number: 2,
        firstLine: 7,
        lines: [7, 9],
        cover: false,
        flushTop: false,
        contentHeight: 150,
      },
    ],
    splits: [],
    blocks: [
      { line: 0, height: 300 },
      { line: 4, height: 60 },
      { line: 6, height: 0 },
      { line: 7, height: 80 },
      { line: 9, height: 60 },
    ],
  };
  const text = fastrPageMapText(paged, broken);
  assertStringIncludes(text, "ends at a page break, SHORT");
  assertStringIncludes(text, "Drop the break");
  assertFalse(text.includes("STUB"));
  // A page the break ends well filled is not flagged.
  paged.pages[0].contentHeight = 800;
  const full = fastrPageMapText(paged, broken);
  assertStringIncludes(full, "ends at a page break");
  assertFalse(full.includes("SHORT"));
  assertStringIncludes(full, "Every page is set");
});

Deno.test("a section's overrun alone on a page before the next break is a spill, and two figures in a row are flagged", () => {
  const spilled = [
    ":::pagebreak",
    "# National trend",
    "",
    "Completeness climbed from 2022 to a peak in 2024.",
    "",
    "![Monthly completeness](figure:aaa)",
    "",
    "That high was not sustained into 2025.",
    "",
    ":::band{tone=warm}",
    "**The 2025 dip is the trend to watch.**",
    ":::",
    "",
    ":::pagebreak",
    "# Cross-checks",
    "",
    "![Outlier rate](figure:bbb)",
    "",
    "![Consistency](figure:ccc)",
    "",
    "Both checks agree.",
  ].join("\n");
  const paged: FastrPagedResult = {
    total: 3,
    sheet: { width: 794, height: 1123 },
    pages: [
      {
        number: 1,
        firstLine: 1,
        lines: [1, 3, 5, 7],
        cover: false,
        flushTop: false,
        contentHeight: 800,
      },
      {
        number: 2,
        firstLine: 9,
        lines: [9, 13],
        cover: false,
        flushTop: false,
        contentHeight: 160,
      },
      {
        number: 3,
        firstLine: 14,
        lines: [14, 16, 18, 20],
        cover: false,
        flushTop: false,
        contentHeight: 900,
      },
    ],
    splits: [],
    blocks: [
      { line: 0, height: 0 },
      { line: 1, height: 80 },
      { line: 3, height: 60 },
      { line: 5, height: 560 },
      { line: 7, height: 60 },
      { line: 9, height: 160 },
      { line: 13, height: 0 },
      { line: 14, height: 80 },
      { line: 16, height: 380 },
      { line: 18, height: 380 },
      { line: 20, height: 30 },
    ],
  };
  const text = fastrPageMapText(paged, spilled);
  assertStringIncludes(
    text,
    "Page 2 of 3: 16% full, ends at a page break, SPILL",
  );
  assertStringIncludes(text, 'only the end of the section from page 1 (band "');
  assertStringIncludes(
    text,
    'Page 3: two figures stand back to back (figure "Outlier rate", then figure "Consistency")',
  );
  // The page that opens the next section is its own start, not a spill.
  assertFalse(text.includes("Page 3 of 3: 91% full, SPILL"));
});

Deno.test("a figure caption longer than a line is flagged", () => {
  const long = Array.from({ length: 30 }, (_, k) => `word${k}`).join(" ");
  const body =
    `# Trend\n\nText.\n\n![${long}](figure:aaa)\n\n![Short and to the point](figure:bbb)\n`;
  const paged: FastrPagedResult = {
    total: 1,
    sheet: { width: 794, height: 1123 },
    pages: [{
      number: 1,
      firstLine: 0,
      lines: [0, 2, 4, 6],
      cover: false,
      flushTop: false,
      contentHeight: 900,
    }],
    splits: [],
    blocks: [
      { line: 0, height: 60 },
      { line: 2, height: 40 },
      { line: 4, height: 400 },
      { line: 6, height: 400 },
    ],
  };
  const text = fastrPageMapText(paged, body);
  assertStringIncludes(text, 'the caption of figure "word0 word1');
  assertStringIncludes(text, "is 30 words");
  assertFalse(text.includes(`caption of figure "Short`));
});

function onePage(body: string): FastrPagedResult {
  const lines = body.split("\n").map((_, i) => i);
  return {
    total: 1,
    sheet: { width: 794, height: 1123 },
    pages: [{
      number: 1,
      firstLine: 0,
      lines,
      cover: false,
      flushTop: false,
      contentHeight: 900,
    }],
    splits: [],
    blocks: lines.map((line) => ({ line, height: 40 })),
  };
}

Deno.test("a chart set small is flagged, a medium one is not", () => {
  const body =
    `# Trend\n\nText.\n\n![Tiny](figure:aaa){width=small}\n\nMore.\n\n![House size](figure:bbb){width=medium}\n`;
  const text = fastrPageMapText(onePage(body), body);
  assertStringIncludes(text, 'SMALL: figure "Tiny" is set {width=small}');
  assertFalse(text.includes('figure "House size" is set'));
});

Deno.test("a section whose chart has little prose around it is THIN", () => {
  const words = (n: number) =>
    Array.from({ length: n }, (_, k) => `w${k}`).join(" ");
  const body = [
    "# Thin",
    "",
    "One sentence about it.",
    "",
    "![Chart](figure:aaa){width=medium}",
    "",
    "Another.",
    "",
    "# Read",
    "",
    words(70),
    "",
    "![Chart](figure:bbb){width=medium}",
    "",
    `- ${words(60)}`,
    "",
    "# Prose only",
    "",
    "Short is fine without a chart.",
    "",
  ].join("\n");
  const text = fastrPageMapText(onePage(body), body);
  assertStringIncludes(
    text,
    'THIN: section "Thin" holds a figure and 5 words of prose',
  );
  assertFalse(text.includes('section "Read"'));
  assertFalse(text.includes('section "Prose only"'));
});

function twoPages(
  page1: { from: number; heights: [number, number][] },
  page2: { from: number; heights: [number, number][] },
): FastrPagedResult {
  const page = (number: number, p: typeof page1) => ({
    number,
    firstLine: p.from,
    lines: p.heights.map(([line]) => line),
    cover: false,
    flushTop: false,
    contentHeight: p.heights.reduce((sum, [, h]) => sum + h, 0),
  });
  return {
    total: 2,
    sheet: { width: 794, height: 1123 },
    pages: [page(1, page1), page(2, page2)],
    splits: [],
    blocks: [...page1.heights, ...page2.heights].map(([line, height]) => ({
      line,
      height,
    })),
  };
}

Deno.test("a heading and its lead-in left at a page's foot by the figure they introduce is a stranded opening", () => {
  const words = (n: number) =>
    Array.from({ length: n }, (_, k) => `w${k}`).join(" ");
  const body = (next: string) =>
    [
      "# Completeness",
      "",
      words(130),
      "",
      "![Trend](figure:aaa)",
      "",
      words(90),
      "",
      "# Outliers",
      "",
      "An outlier is a value far outside a facility's own trend.",
      "",
      next,
      "",
      words(130),
    ].join("\n");
  const paged = twoPages(
    {
      from: 0,
      heights: [[0, 60], [2, 200], [4, 450], [6, 150], [8, 60], [10, 50]],
    },
    { from: 12, heights: [[12, 450], [14, 200]] },
  );
  const stranded = body("![Outlier rate](figure:bbb)");
  const text = fastrPageMapText(paged, stranded);
  assertStringIncludes(
    text,
    'STRANDED OPENING: section heading "Outliers"',
  );
  assertStringIncludes(
    text,
    'and the figure "Outlier rate" they introduce opens page 2',
  );
  // Prose carrying on over the page boundary is ordinary flow.
  const flowing = body(words(60));
  assertFalse(
    fastrPageMapText(paged, flowing).includes("STRANDED OPENING"),
  );
});

Deno.test("a heading and its lead-in before a page template are a stranded opening", () => {
  const body = [
    "# Regional data quality",
    "",
    "Bringing the checks together shows where the gap sits.",
    "",
    ":::page{layout=scorecard}",
    "## Regional scorecard",
    "",
    "Each cell against the module's thresholds.",
    ":::",
  ].join("\n");
  const paged = twoPages(
    { from: 0, heights: [[0, 60], [2, 60]] },
    { from: 4, heights: [[4, 980]] },
  );
  const text = fastrPageMapText(paged, body);
  assertStringIncludes(
    text,
    "then the page template scorecard (",
  );
  assertStringIncludes(text, "drop this heading and fold the lead-in");
});

Deno.test("a steps block whose lines run together as one step is flagged", () => {
  const body = [
    ":::steps",
    "Target support in Region 002.",
    "Investigate the delivery check.",
    "Add a coverage module.",
    ":::",
    "",
    ":::steps",
    "One.",
    "",
    "Two.",
    ":::",
  ].join("\n");
  const text = fastrPageMapText(onePage(body), body);
  assertStringIncludes(text, "a steps block holds one step of 3 lines");
  assertFalse(text.split("a steps block holds").length > 2);
});

function pagesOf(...ps: { from: number; heights: [number, number][] }[]) {
  return {
    total: ps.length,
    sheet: { width: 794, height: 1123 },
    pages: ps.map((p, i) => ({
      number: i + 1,
      firstLine: p.from,
      lines: p.heights.map(([line]) => line),
      cover: false,
      flushTop: false,
      contentHeight: p.heights.reduce((sum, [, h]) => sum + h, 0),
    })),
    splits: [],
    blocks: ps.flatMap((p) =>
      p.heights.map(([line, height]) => ({ line, height }))
    ),
  } satisfies FastrPagedResult;
}

const longWords = (n: number) =>
  Array.from({ length: n }, (_, k) => `w${k}`).join(" ");

Deno.test("a page more than half empty is MUST FIX; a short one is not", () => {
  const body = [
    "# Trend",
    "",
    longWords(160),
    "",
    "![Completeness held](figure:aaa)",
    "",
    longWords(160),
  ].join("\n");
  const hole = fastrPageMapText(
    pagesOf({ from: 0, heights: [[0, 60], [2, 240]] }, {
      from: 4,
      heights: [[4, 800], [6, 150]],
    }),
    body,
  );
  assertStringIncludes(hole, "MUST FIX: Page 1 is ");
  const short = fastrPageMapText(
    pagesOf({ from: 0, heights: [[0, 60], [2, 620]] }, {
      from: 4,
      heights: [[4, 800], [6, 150]],
    }),
    body,
  );
  assertStringIncludes(short, "Page 1 is ");
  assertFalse(short.includes("MUST FIX"));
});

Deno.test("the page before a page template is short under three quarters", () => {
  const body = [
    "# Reading the scorecard",
    "",
    longWords(200),
    "",
    ":::callout",
    "A caveat.",
    ":::",
    "",
    ":::page{layout=back tone=ink}",
    "Prepared from routine data.",
    ":::",
  ].join("\n");
  const text = fastrPageMapText(
    pagesOf({ from: 0, heights: [[0, 60], [2, 480], [4, 140]] }, {
      from: 8,
      heights: [[8, 980]],
    }),
    body,
  );
  assertStringIncludes(text, "the page template after it takes the next page");
});

Deno.test("a closing callout cut off above the next section is DETACHED", () => {
  const body = [
    "# Why it matters",
    "",
    longWords(300),
    "",
    ':::callout{title="What this report does not cover"}',
    "No coverage module.",
    ":::",
    "",
    "# Trends",
    "",
    longWords(100),
  ].join("\n");
  const text = fastrPageMapText(
    pagesOf({ from: 0, heights: [[0, 60], [2, 870]] }, {
      from: 4,
      heights: [[4, 160], [8, 60], [10, 200]],
    }),
    body,
  );
  assertStringIncludes(text, 'DETACHED: callout "What this report');
});

Deno.test("a page of prose alone in a designed report is PLAIN; a plain document is not", () => {
  const prose = [
    "# Why it matters",
    "",
    longWords(150),
    "",
    longWords(150),
    "",
    longWords(150),
  ];
  const designed = [...prose, "", ":::callout", "A caveat.", ":::"].join("\n");
  const paged = pagesOf({
    from: 0,
    heights: [[0, 60], [2, 260], [4, 260], [
      6,
      260,
    ]],
  }, { from: 8, heights: [[8, 140]] });
  assertStringIncludes(fastrPageMapText(paged, designed), ", PLAIN");
  const plain = [...prose, "", "The end."].join("\n");
  assertFalse(fastrPageMapText(paged, plain).includes(", PLAIN"));
});

Deno.test("a band of analysis is LONG BAND, and a band before a template is flagged", () => {
  const body = [
    "# Consistency",
    "",
    longWords(250),
    "",
    ":::band{tone=warm}",
    longWords(60),
    ":::",
    "",
    ":::page{layout=back tone=ink}",
    "Prepared from routine data.",
    ":::",
  ].join("\n");
  const text = fastrPageMapText(
    pagesOf({ from: 0, heights: [[0, 60], [2, 620], [4, 220]] }, {
      from: 8,
      heights: [[8, 980]],
    }),
    body,
  );
  assertStringIncludes(text, "LONG BAND: band");
  assertStringIncludes(text, ", BAND BEFORE TEMPLATE");
});

Deno.test("a findings page of four is SPARSE; five is not", () => {
  const page = (n: number) =>
    [
      ':::page{layout=findings kicker="At a glance"}',
      "## Findings",
      ":::slot{name=items}",
      ...Array.from(
        { length: n },
        (_, k) => [`**Finding ${k}.** Support for it.`, ""],
      ).flat().slice(0, -1),
      ":::",
      ":::",
    ].join("\n");
  const four = page(4);
  assertStringIncludes(
    fastrPageMapText(onePage(four), four),
    "SPARSE: the findings page holds 4 findings",
  );
  const five = page(5);
  assertFalse(fastrPageMapText(onePage(five), five).includes("SPARSE"));
});

Deno.test("a citation printed on the method page and the back page is REPEATED", () => {
  const cite =
    "Suggested citation: Somalia Ministry of Health, HMIS Data Quality Review, 2022 to 2025.";
  const body = [
    ":::page{layout=method}",
    "## Methodology",
    ":::slot{name=panels}",
    ':::card{title="Sources" icon=database}',
    "Routine data.",
    ":::",
    ":::",
    ":::slot{name=cite}",
    cite.replace("Suggested citation: ", ""),
    ":::",
    ":::",
    "",
    ":::page{layout=back tone=ink}",
    cite,
    "",
    "fastr-analytics.org",
    ":::",
  ].join("\n");
  const text = fastrPageMapText(onePage(body), body);
  assertStringIncludes(text, 'REPEATED: "Suggested citation: Somalia');
  assertFalse(text.split("REPEATED").length > 2);
});

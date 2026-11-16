// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Pins the figure conventions (engine/fastr_figure_captions.ts): numbered
// captions in two sequences, captions above the figure, the source line and
// its overrides, a native table's `Table:` caption, the editor's slices
// numbering as the whole document does, the live regions taking a caption
// line into its table, and the Word export writing all of it.
//
// Run: deno test -A report-forge/tests/fastr_figure_captions_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrWordDocument,
  createFastrMarkdownIt,
  dataUrlToWordImage,
  fastrFigureContextAt,
  fastrFigureIndex,
  fastrFigureNumbers,
  fastrLiveRegions,
  readFastrFigureSettings,
  renderFastrMarkdownToHtml,
  setReportForgeLanguage,
} from "../engine/mod.ts";

const BULLETIN = `:::report{figures=numbered captions=above source="DHIS2 SNIS"}

# Complétude

![Complétude des rapports](figure:a)

**Analyse :** la complétude est de 100 %.

Table: Cas de référence
| Formation | Référés |
| --- | --- |
| CR Boulliwel | 0 |

:::columns{cols=2}
:::col
![Couverture](figure:b){width=medium source=PEV}
:::
:::col
![Décès par âge](figure:c){as=table source=none}
:::
:::

![](figure:d)

![Photo de terrain](image:p)

\`\`\`
![Not a figure](figure:z)
\`\`\`
`;

const render = (body: string) =>
  renderFastrMarkdownToHtml(body, { lineAnchors: false });

Deno.test("settings come from the report header", () => {
  assertEquals(readFastrFigureSettings(BULLETIN), {
    numbered: true,
    above: true,
    source: "DHIS2 SNIS",
    strong: false,
    lang: undefined,
  });
  assertEquals(readFastrFigureSettings("# Plain\n"), {
    numbered: false,
    above: false,
    source: undefined,
    strong: false,
    lang: undefined,
  });
  assertEquals(
    readFastrFigureSettings(":::report{source=none}\n").source,
    undefined,
  );
});

Deno.test("figures and tables are numbered in two sequences", () => {
  setReportForgeLanguage("fr");
  try {
    const html = render(BULLETIN);
    // French sets a no-break space (U+00A0) before its colon.
    const nb = "\u00a0";
    assertStringIncludes(
      html,
      `<span class="fm-caption-label">Figure 1${nb}:</span> Complétude`,
    );
    assertStringIncludes(html, `Figure 2${nb}:</span> Couverture`);
    assertStringIncludes(html, `Tableau 1${nb}:</span> Cas de référence`);
    assertStringIncludes(html, `Tableau 2${nb}:</span> Décès par âge`);
    // A captioned photograph is a figure too; the uncaptioned chart takes
    // no number, and the code block's line is literal text.
    assertStringIncludes(html, `Figure 3${nb}:</span> Photo de terrain`);
    assert(!html.includes("Figure 4"));
    assert(!html.includes("Not a figure</figcaption>"));
  } finally {
    setReportForgeLanguage("en");
  }
});

Deno.test("the report's own language sets its labels, whatever the interface's", () => {
  // The interface is English here; the report says it is French.
  const fr = BULLETIN.replace(":::report{", ":::report{lang=fr ");
  const html = render(fr);
  const nb = "\u00a0";
  assertStringIncludes(html, `Tableau 1${nb}:</span> Cas de référence`);
  assertStringIncludes(html, `Source${nb}: DHIS2 SNIS`);
  // An unknown language is the interface's.
  const xx = render(BULLETIN.replace(":::report{", ":::report{lang=xx "));
  assertStringIncludes(xx, "Table 1:</span> Cas de référence");
});

Deno.test("captionstyle=bold sets the whole caption in the accent", () => {
  const html = render(
    BULLETIN.replace(":::report{", ":::report{captionstyle=bold "),
  );
  assertStringIncludes(
    html,
    `<figcaption class="fm-figure__caption fm-caption--bold"><span class="fm-caption-label">Figure 1:</span> Complétude`,
  );
  assert(!render(BULLETIN).includes("fm-caption--bold"));
});

Deno.test("English labels, and no numbers when the document does not ask", () => {
  const html = render(BULLETIN);
  assertStringIncludes(html, "Figure 1:</span> Complétude des rapports");
  assertStringIncludes(html, "Table 1:</span> Cas de référence");
  const plain = render(
    "![Coverage](figure:a)\n\nTable: Referrals\n| a | b |\n| --- | --- |\n| 1 | 2 |\n",
  );
  assert(!plain.includes("fm-caption-label"));
  assertStringIncludes(
    plain,
    `<figcaption class="fm-figure__caption">Coverage</figcaption>`,
  );
  // A table caption is still a caption without numbering.
  assertStringIncludes(
    plain,
    `<caption class="fm-figure__caption fm-table__caption">Referrals</caption>`,
  );
  assert(!plain.includes("<p>Table:"));
});

Deno.test("captions above, and the source line with its overrides", () => {
  const html = render(BULLETIN);
  // Above: the figure is a grid whose first row the caption takes.
  assertStringIncludes(html, `class="fm-figure fm-figure--capabove"`);
  assertStringIncludes(
    html,
    `<p class="fm-figure__source">Source: DHIS2 SNIS</p>`,
  );
  assertStringIncludes(html, `<p class="fm-figure__source">Source: PEV</p>`);
  // source=none hides it; an uncaptioned chart still takes the document's;
  // an image takes only its own.
  const figures = html.split("<figure").slice(1);
  const of = (alt: string) => figures.find((f) => f.includes(`alt="${alt}"`))!;
  assert(!of("Décès par âge").includes("fm-figure__source"));
  assert(of("").includes("Source: DHIS2 SNIS"));
  assert(!of("Photo de terrain").includes("fm-figure__source"));
  // An uncaptioned figure is never classed above: there is no caption.
  assert(!of("").includes("fm-figure--capabove"));
});

Deno.test("a table caption joins its table only when directly over it", () => {
  const spaced = render(
    ":::report{figures=numbered}\n\nTable: Apart\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n",
  );
  assert(!spaced.includes("<caption"));
  assertStringIncludes(spaced, "<p>Table: Apart</p>");
  const anchored = renderFastrMarkdownToHtml(
    "Table: Over\n| a | b |\n| --- | --- |\n| 1 | 2 |\n",
    { lineAnchors: true },
  );
  // The table's anchor names the caption's line, where its block starts.
  assertStringIncludes(anchored, `<table data-line="0">`);
});

Deno.test("the index reads the compiler's numbers back", () => {
  const index = fastrFigureIndex(BULLETIN);
  assert(index.anySource);
  const lines = BULLETIN.split("\n");
  const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
  assertEquals(
    [...index.numbers.entries()].sort((a, b) => a[0] - b[0]),
    [
      [at("figure:a"), { kind: "figure", n: 1 }],
      [at("Table: Cas"), { kind: "table", n: 1 }],
      [at("figure:b"), { kind: "figure", n: 2 }],
      [at("figure:c"), { kind: "table", n: 2 }],
      [at("image:p"), { kind: "figure", n: 3 }],
    ],
  );
  assertEquals(fastrFigureNumbers("# None\n![x](figure:a)\n").size, 0);
  assertEquals(fastrFigureIndex("![x](figure:a)\n").anySource, false);
});

Deno.test("an editor slice numbers its figures as the document does", () => {
  const index = fastrFigureIndex(BULLETIN);
  const lines = BULLETIN.split("\n");
  // The columns block, rendered alone, as the editor renders a region.
  const start = lines.findIndex((l) => l.startsWith(":::columns"));
  const end = lines.findIndex((l, i) => i > start + 6 && l === ":::");
  const slice = lines.slice(start, end + 1).join("\n");
  const ctx = fastrFigureContextAt(index.settings, index.numbers, start);
  assertEquals(ctx.first, { figure: 2, table: 2 });
  const html = renderFastrMarkdownToHtml(slice, {
    lineAnchors: true,
    figures: ctx,
  });
  assertStringIncludes(html, "Figure 2:</span> Couverture");
  assertStringIncludes(html, "Table 2:</span> Décès par âge");
  assertStringIncludes(html, "fm-figure--capabove");
  // Without the context the slice cannot see the header: no numbers.
  assert(
    !renderFastrMarkdownToHtml(slice, { lineAnchors: true }).includes(
      "fm-caption-label",
    ),
  );
});

Deno.test("a caption line opens its table's live region", () => {
  const body = "Intro.\n\nTable: Cas\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const tables = fastrLiveRegions(body.split("\n")).filter((r) =>
    r.kind === "table"
  );
  assertEquals(tables, [{ kind: "table", startLine: 2, endLine: 5 }]);
  // Mid-paragraph, a `Table:` line is prose, as any line there is.
  const mid = "Intro.\nTable: Cas\n| a | b |\n| --- | --- |\n";
  assertEquals(
    fastrLiveRegions(mid.split("\n")).filter((r) => r.kind === "table").length,
    0,
  );
});

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

Deno.test("Word writes the numbers, the sources and the table caption", async () => {
  const tokens = createFastrMarkdownIt().parse(BULLETIN, {});
  const doc = buildFastrWordDocument({
    tokens,
    body: BULLETIN,
    title: "Bulletin",
    theme: "default",
    footer: { title: "Bulletin", pageWord: "Page", ofWord: "of" },
    figure: () =>
      dataUrlToWordImage(`data:image/png;base64,${PNG_1X1}`, 1920, 1080),
    image: () => undefined,
  });
  const zip = await JSZip.loadAsync(
    await (await Packer.toBlob(doc)).arrayBuffer(),
  );
  const xml = await zip.file("word/document.xml")!.async("string");
  const paras = xml.split("<w:p>").slice(1).map((p) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")
  );
  const at = (text: string) => paras.findIndex((p) => p === text);
  // Above: the caption comes before the chart, the source after it.
  const cap = at("Figure 1: Complétude des rapports");
  assert(cap >= 0, "numbered caption paragraph");
  const source = at("Source: DHIS2 SNIS");
  assert(source > cap, "source after its figure");
  assert(at("Table 1: Cas de référence") >= 0, "table caption");
  assert(at("Table 2: Décès par âge") >= 0, "as=table counts as a table");
  assert(at("Source: PEV") >= 0, "own source");
  // The compiler's html tokens are not printed as stray text.
  assert(!xml.includes("fm-caption-label"));
});

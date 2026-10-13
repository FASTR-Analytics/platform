// Pins the Word export of FASTR Markdown (report-forge/engine/report_fastr_word.ts): the
// document the builder writes from the token stream. Native headings, marks,
// tables, callouts, steps, columns, the contents field, the running footer,
// the embedded fonts and the page ground; and the design blocks (cover, band,
// tiles, card, stat) as the plain text they hold, with no picture and no text
// box anywhere. Assertions read the .docx's own XML, so what Word will see is
// the contract.
//
// Run: deno test -A report-forge/tests/report_fastr_word_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrWordDocument,
  createFastrMarkdownIt,
  cssColorToHex,
  dataUrlToWordImage,
  type FastrWordBuildInput,
  fastrWordDarkFigures,
} from "../engine/mod.ts";

// The kitchen-sink report, inline so the test reads on its own.
const KITCHEN_SINK = `:::report{background=paper numbering=sections}
:::cover{tone=ink layout=poster fill=page kicker="Ministry of Health · Q3 2026" sub="Routine data, national roll-up"}
# Quarterly service review
:::

:::contents{title="Contents" depth=2}

## Headline numbers

:::tiles{cols=3}
:::stat{value="64%" label="ANC4 coverage" delta="+3pp" dir=up tone=accent}
:::stat{value="41%" label="Facility deliveries" delta="-1pp" dir=down}
:::stat{value="88%" label="Reporting completeness" delta="+6pp" dir=up}
:::

Coverage rose in most regions, and the completeness of reporting is the best it has been since the new forms were introduced. The rest of this review walks through the districts that moved and the ones that did not.

:::callout{kind=warning title="Data caveat"}
Reporting completeness was 62% in the Northern region this quarter, so its figures are less certain than the others.
:::

## Where the system is failing

:::band{tone=ink kicker="Finding one" sub="Three regions have never reported on time."}
### Late reporting is concentrated

Three regions account for nearly all of the late submissions, and the same three have the weakest completeness. The pattern has held for six quarters.
:::

![ANC4 coverage by region](figure:f1)

:::columns{cols=2}
:::col{tone=cool}
### Gaining
Eastern and Southern regions improved on every indicator, led by a new outreach programme.
:::
:::col{tone=warm}
### Slipping
Northern and Western fell back on deliveries, and both report late.
:::
:::

## A note on method

:::quote{cite="Dr N. Kamara, DHMT"}
The data finally matches what we see in the facilities.
:::

| District | ANC4 | Deliveries | Completeness |
| --- | --- | --- | --- |
| Bo | 66% | 44% | 91% |
| Kenema | 61% | 39% | 87% |
| Kailahun | 58% | 37% | 80% |
| Bombali | 52% | 33% | 62% |

Some ordinary prose with **bold**, *italic* and a [marked phrase]{.danger}, followed by a list:

- The first thing to check is the completeness of the reporting.
- The second is whether the denominator moved.
- The third is whether the change is seasonal.

:::steps
Investigate the two weakest regions first.

Document what the strongest region changed.

Re-read this once a full year of data is in.
:::

:::pagebreak

## After the break

This heading opens a new page because of the explicit break above it.

:::callout{kind=info title="On a fresh page" break=before}
This callout asked to start on a new page of its own.
:::

:::band{tone=ink}
Prepared by the FASTR Analytics team.
:::
`;
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

type Built = { xml: string; zip: JSZip; files: string[] };

async function build(
  body: string,
  over: Partial<FastrWordBuildInput> = {},
): Promise<Built> {
  const tokens = createFastrMarkdownIt().parse(body, {});
  const doc = buildFastrWordDocument({
    tokens,
    body,
    title: "Quarterly review",
    theme: "default",
    footer: { title: "Quarterly review", pageWord: "Page", ofWord: "of" },
    figure: () =>
      dataUrlToWordImage(`data:image/png;base64,${PNG_1X1}`, 1920, 1080),
    image: () => undefined,
    ...over,
  });
  const blob = await Packer.toBlob(doc);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")!.async("string");
  return { xml, zip, files: Object.keys(zip.files) };
}

function count(s: string, needle: string): number {
  return s.split(needle).length - 1;
}

// The text of every paragraph, in document order.
function paragraphs(xml: string): string[] {
  return xml.split("<w:p>").slice(1).map((p) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")
  );
}

Deno.test("css colours as Word hex", () => {
  assertEquals(cssColorToHex("#abc"), "aabbcc");
  assertEquals(cssColorToHex("#11223344"), "112233");
  assertEquals(cssColorToHex("rgb(1, 2, 3)"), "010203");
  assertEquals(cssColorToHex("rgba(255 0 0 / 0.5)"), "ff0000");
  assertEquals(cssColorToHex("crimson"), "dc143c");
  assertEquals(cssColorToHex("linear-gradient(red, blue)"), undefined);
});

Deno.test("kitchen sink: native structures, plain design blocks, sections and footer", async () => {
  const { xml, zip, files } = await build(KITCHEN_SINK);
  // Numbered sections: the top-level h2s carry "1. ", "2. " …
  assertStringIncludes(xml, '<w:pStyle w:val="Heading2"/>');
  assertStringIncludes(xml, ">1. </w:t>");
  assertStringIncludes(xml, ">2. </w:t>");
  // The contents block is a live field over levels 1-2, updated on open.
  assertStringIncludes(xml, "TOC \\h \\o &quot;1-2&quot;");
  const settings = await zip.file("word/settings.xml")!.async("string");
  assertStringIncludes(settings, "<w:updateFields");
  // No design block is pictured: no floating picture, no text box. The one
  // drawing is the figure.
  assert(!xml.includes("behindDoc"));
  assert(!xml.includes("<v:shape"));
  assert(!xml.includes("<w:pict"));
  assertEquals(count(xml, "<w:drawing>"), 1);
  // The cover is its text, in order: kicker, title (Word's Title, so the
  // contents field does not list it), standfirst. Filling its page, it ends
  // it.
  const paras = paragraphs(xml);
  const kicker = paras.indexOf("Ministry of Health · Q3 2026");
  assert(kicker >= 0, "cover kicker");
  assertEquals(paras[kicker + 1], "Quarterly service review");
  assertEquals(paras[kicker + 2], "Routine data, national roll-up");
  assertStringIncludes(xml, '<w:pStyle w:val="Title"/>');
  assert(!xml.includes('<w:pStyle w:val="Heading1"/>'));
  // Each stat of the tiles row is one line: value, label, change.
  assert(paras.includes("64% ANC4 coverage (+3pp)"));
  assert(paras.includes("41% Facility deliveries (-1pp)"));
  // A band is its kicker, its content (the heading still a heading) and its
  // standfirst, in the page's own ink: nothing takes the ink band's paper.
  const band = paras.indexOf("Finding one");
  assert(band >= 0, "band kicker");
  assertEquals(paras[band + 1], "Late reporting is concentrated");
  assertEquals(
    paras[band + 3],
    "Three regions have never reported on time.",
  );
  assert(paras.includes("Prepared by the FASTR Analytics team."));
  assert(!xml.includes('<w:color w:val="fcfcfb"/>'));
  // Normal, columns, normal after the columns: three sections, all with the
  // page's margins.
  assertEquals(count(xml, "<w:sectPr"), 3);
  assert(!xml.includes('w:top="0"'));
  assert(/<w:cols [^>]*w:num="2"/.test(xml), "two-column section");
  assertStringIncludes(xml, '<w:type w:val="continuous"/>');
  // Explicit breaks become page-break-before on what follows, never a blank line.
  assert(count(xml, "<w:pageBreakBefore/>") >= 2);
  assert(!xml.includes('<w:br w:type="page"/>'));
  // Callout: a shaded cell with a coloured left rule; the warning kind.
  assert(/<w:left [^>]*w:sz="24"/.test(xml), "callout left rule");
  assertStringIncludes(xml, "<w:tblHeader/>");
  // Steps are numbered with leading zeros.
  const numbering = await zip.file("word/numbering.xml")!.async("string");
  assertStringIncludes(numbering, '<w:numFmt w:val="decimalZero"/>');
  // Bullets and the figure with its caption.
  assertStringIncludes(xml, '<w:pStyle w:val="Caption"/>');
  assertStringIncludes(xml, "ANC4 coverage by region");
  // The role mark takes the theme's danger colour (the warm pole).
  assertStringIncludes(xml, '<w:color w:val="936653"/>');
  // The running footer: title left, "Page X of Y" right.
  const footer = files.filter((f) => /^word\/footer\d+\.xml$/.test(f));
  assert(footer.length >= 1);
  const footerXml = await zip.file(footer[footer.length - 1])!.async("string");
  assertStringIncludes(footerXml, "Quarterly review");
  assertStringIncludes(footerXml, "PAGE");
  assertStringIncludes(footerXml, "NUMPAGES");
  // Fonts named on the runs.
  assertStringIncludes(xml, 'w:ascii="Inter"');
});

Deno.test("marks, tables, quotes, lists, code and a figure", async () => {
  const body = [
    "Some [danger]{.danger} and [big]{size=12 underline} and [lit]{color=#c62828} and [hl]{highlight=#ffe08a}.",
    "",
    "| A | B |",
    "| --- | ---: |",
    "| 1 | 2 |",
    "",
    ':::quote{cite="Someone"}',
    "Words.",
    ":::",
    "",
    "- one",
    "- two",
    "",
    "1. first",
    "2. second",
    "",
    "```",
    "code",
    "```",
    "",
    "---",
    "",
    "![cap](figure:f1)",
  ].join("\n");
  const { xml } = await build(body);
  assertStringIncludes(xml, '<w:sz w:val="24"/>');
  assertStringIncludes(xml, '<w:u w:val="single"/>');
  assertStringIncludes(xml, '<w:color w:val="c62828"/>');
  assertStringIncludes(xml, 'w:fill="ffe08a"');
  assertStringIncludes(xml, '<w:jc w:val="right"/>');
  assertStringIncludes(xml, "Someone");
  // Two lists, two numbering instances.
  const numIds = new Set(
    [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]),
  );
  assertEquals(numIds.size, 2);
  assertStringIncludes(xml, 'w:ascii="Consolas"');
  assertStringIncludes(xml, "<w:drawing>");
  assertStringIncludes(xml, "cap</w:t>");
});

Deno.test("a card and a stat anywhere: title, content and one line", async () => {
  const body = [
    ":::tiles{cols=2}",
    ':::card{title="Coverage" tone=ink}',
    "Up in **most** regions.",
    "",
    "- one",
    ":::",
    ':::stat{value="88%"}',
    ":::",
    "",
    ":::columns{cols=2}",
    ":::col",
    ':::stat{label="Only a label" delta="+2"}',
    ":::",
    ":::col",
    "text",
    ":::",
    ":::",
  ].join("\n");
  const { xml } = await build(body);
  const paras = paragraphs(xml);
  const title = paras.indexOf("Coverage");
  assert(title >= 0, "card title");
  assertEquals(paras[title + 1], "Up in most regions.");
  assertEquals(paras[title + 2], "one");
  assertEquals(paras[title + 3], "88%");
  assert(paras.includes("Only a label (+2)"));
  // The card's content keeps its own formatting and list.
  assertStringIncludes(xml, "<w:numPr>");
  assert(!xml.includes("<w:drawing>"));
  assert(!xml.includes("<v:shape"));
});

Deno.test("dark figures: by the Word ground, not the block's", () => {
  const body = [
    ":::band{tone=ink}",
    "![in a band](figure:band)",
    ":::",
    "",
    ":::callout{tone=ink}",
    "![in a callout](figure:callout)",
    ":::",
    "",
    "![plain](figure:plain)",
  ].join("\n");
  const input = (b: string) => ({
    tokens: createFastrMarkdownIt().parse(b, {}),
    body: b,
    title: "t",
    theme: "default" as const,
    footer: { title: "t", pageWord: "Page", ofWord: "of" },
  });
  // The band's figure stands on the page (the band is gone); the toned
  // callout keeps its ground, so its figure is on ink.
  assertEquals([...fastrWordDarkFigures(input(body))], ["callout"]);
  // On an ink page every figure is, except in a block that brings paper.
  const onInk = ":::report{background=ink}\n" + body;
  assertEquals(
    [...fastrWordDarkFigures(input(onInk))].sort(),
    ["band", "callout", "plain"],
  );
});

Deno.test("embedded fonts, page ground and a cover in the flow", async () => {
  const body =
    ':::report{background=ink}\n:::cover{kicker="K"}\n# Title\n:::\n\n## After\n\nText.\n';
  const font = {
    name: "Inter",
    data: new Uint8Array(256).fill(7),
    weight: 400,
  };
  const { xml, zip, files } = await build(body, { fonts: [font] });
  assert(files.includes("word/fonts/Inter.odttf"));
  const fontTable = await zip.file("word/fontTable.xml")!.async("string");
  assertStringIncludes(fontTable, "w:embedRegular");
  // The ink ground: the theme's ink as Word's page colour, the paper as ink.
  assertStringIncludes(xml, '<w:background w:color="24292e"');
  assertStringIncludes(xml, '<w:color w:val="fcfcfb"/>');
  const settings = await zip.file("word/settings.xml")!.async("string");
  assertStringIncludes(settings, "displayBackgroundShape");
  // A cover that does not fill its page stays in the flow: one section, no
  // break after it, its text in the page's ink.
  assertEquals(count(xml, "<w:sectPr"), 1);
  assert(!xml.includes("<w:pageBreakBefore/>"));
  assert(!xml.includes("<w:drawing>"));
  assertEquals(paragraphs(xml).slice(0, 3), ["K", "Title", "After"]);
  // The heading after it keeps its own top margin.
  assertStringIncludes(xml, '<w:pStyle w:val="Heading2"/>');
});

Deno.test("a logos row: its logos side by side in one aligned paragraph", async () => {
  const body =
    `Intro.\n\n:::logos{src="image:a image:gone image:b" align=center size=l}\n\nAfter.`;
  const { xml } = await build(body, {
    image: (id) =>
      id === "gone" ? undefined : dataUrlToWordImage(
        `data:image/png;base64,${PNG_1X1}`,
        id === "a" ? 200 : 100,
        50,
      ),
  });
  // Two drawings (the missing logo drops out), in one centred paragraph.
  assertEquals(count(xml, "<w:drawing>"), 2);
  const para = xml.split("<w:p>").find((p) => p.includes("<w:drawing>")) ?? "";
  assertEquals(count(para, "<w:drawing>"), 2);
  assertStringIncludes(para, '<w:jc w:val="center"/>');
  // Size l is 4.5em at 16px: 72px tall, widths by aspect (288 and 144).
  assertStringIncludes(para, `cy="${72 * 9525}"`);
  assertStringIncludes(para, `cx="${288 * 9525}"`);
  assertStringIncludes(para, `cx="${144 * 9525}"`);
});

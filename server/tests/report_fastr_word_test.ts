// Pins the Word export of FASTR Markdown (lib/report_fastr_word.ts): which
// blocks are pictured, the raster frame and measure script contracts, and the
// document the builder writes from the token stream — native headings, marks,
// tables, callouts, steps, columns, the contents field, the running footer,
// the overlay anchors with their text boxes, the cover's own section, the
// embedded fonts and the page ground. Assertions read the .docx's own XML, so
// what Word will see is the contract.
//
// Run: deno test -A server/tests/report_fastr_word_test.ts

import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrWordDocument,
  buildFastrWordRasterCss,
  createFastrMarkdownIt,
  cssColorToHex,
  dataUrlToWordImage,
  fastrWordBlockSelector,
  fastrWordMeasureJs,
  fastrWordRasterBlockIds,
  type FastrWordBuildInput,
  type FastrWordRasterBlock,
  type FastrWordRasterKind,
  type FastrWordRasterText,
} from "../../lib/mod.ts";

const FIXTURE = new URL("./fixtures/fastr_pdf/kitchen_sink.md", import.meta.url);
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function text(t: string, over: Partial<FastrWordRasterText> = {}): FastrWordRasterText {
  return {
    left: 40,
    top: 30,
    width: 500,
    height: 40,
    align: "left",
    lineHeightPx: 40,
    runs: [{
      text: t,
      fontFamily: "Inter",
      fontSizePx: 32,
      bold: true,
      italic: false,
      color: "24292e",
      letterSpacingPx: 0,
      underline: false,
      allCaps: false,
    }],
    ...over,
  };
}

function fakeRaster(
  id: number,
  kind: FastrWordRasterKind,
  texts: FastrWordRasterText[] = [text(`${kind} ${id}`)],
): FastrWordRasterBlock {
  const cover = kind === "cover";
  return {
    id,
    kind,
    widthPx: cover || kind === "band" ? 794 : 658,
    heightPx: cover ? 1123 : 200,
    leftPx: cover || kind === "band" ? -68 : 0,
    marginTopPx: 40,
    marginBottomPx: 40,
    png: PNG_1X1,
    texts,
  };
}

type Built = { xml: string; zip: JSZip; files: string[] };

async function build(body: string, over: Partial<FastrWordBuildInput> = {}): Promise<Built> {
  const tokens = createFastrMarkdownIt().parse(body, {});
  const rasters = new Map<number, FastrWordRasterBlock>();
  for (const b of fastrWordRasterBlockIds(tokens)) rasters.set(b.id, fakeRaster(b.id, b.kind));
  const doc = buildFastrWordDocument({
    tokens,
    body,
    title: "Quarterly review",
    theme: "default",
    footer: { title: "Quarterly review", pageWord: "Page", ofWord: "of" },
    rasters,
    figure: () => dataUrlToWordImage(`data:image/png;base64,${PNG_1X1}`, 1920, 1080),
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

Deno.test("raster block ids: the outermost decorative blocks, by fence line", async () => {
  const body = await Deno.readTextFile(FIXTURE);
  const tokens = createFastrMarkdownIt().parse(body, {});
  const ids = fastrWordRasterBlockIds(tokens);
  // cover (line 2), tiles (line 10), band (line 24), band (line 80): 0-based.
  assertEquals(ids, [
    { id: 1, kind: "cover" },
    { id: 9, kind: "tiles" },
    { id: 23, kind: "band" },
    { id: 79, kind: "band" },
  ]);
  // A stat inside a column is pictured on its own; a card inside tiles is not.
  const nested = ":::columns{cols=2}\n:::col\n:::stat{value=\"1\" label=\"one\"}\n:::\n:::col\ntext\n:::\n:::\n\n:::tiles\n:::card{title=\"c\"}\nx\n:::\n:::\n";
  const t2 = createFastrMarkdownIt().parse(nested, {});
  assertEquals(fastrWordRasterBlockIds(t2).map((b) => b.kind), ["stat", "tiles"]);
});

Deno.test("raster frame and measure script contracts", () => {
  const css = buildFastrWordRasterCss({ size: "a4", orientation: "portrait", margin: "normal" });
  // A4 at 96dpi is 794px; the normal margin 68px; the column 658px.
  assertStringIncludes(css, "body { width: 658px;");
  assertStringIncludes(css, "--fm-bleed-margin: -68px;");
  assertStringIncludes(css, "min-height: 1123px");
  assertStringIncludes(css, ".fm-word-hide");
  assert(fastrWordMeasureJs().startsWith("(function (id)"));
  assertEquals(fastrWordBlockSelector(9), '[data-line="9"]:not([data-line="9"] *)');
  assertEquals(cssColorToHex("#abc"), "aabbcc");
  assertEquals(cssColorToHex("#11223344"), "112233");
  assertEquals(cssColorToHex("rgb(1, 2, 3)"), "010203");
  assertEquals(cssColorToHex("rgba(255 0 0 / 0.5)"), "ff0000");
  assertEquals(cssColorToHex("crimson"), "dc143c");
  assertEquals(cssColorToHex("linear-gradient(red, blue)"), undefined);
});

Deno.test("kitchen sink: native structures, overlays, sections and footer", async () => {
  const body = await Deno.readTextFile(FIXTURE);
  const { xml, zip, files } = await build(body);
  // Numbered sections: the top-level h2s carry "1. ", "2. " …
  assertStringIncludes(xml, '<w:pStyle w:val="Heading2"/>');
  assertStringIncludes(xml, ">1. </w:t>");
  assertStringIncludes(xml, ">2. </w:t>");
  // The contents block is a live field over levels 1-2, updated on open.
  assertStringIncludes(xml, 'TOC \\h \\o &quot;1-2&quot;');
  const settings = await zip.file("word/settings.xml")!.async("string");
  assertStringIncludes(settings, "<w:updateFields");
  // Four pictures behind the text, one anchor each, one text box per element.
  assertEquals(count(xml, 'behindDoc="1"'), 4);
  assertEquals(count(xml, "<v:shape "), 4);
  assertStringIncludes(xml, 'filled="f" stroked="f"');
  assertStringIncludes(xml, "mso-position-vertical-relative:page");
  assertStringIncludes(xml, "mso-position-vertical-relative:text");
  // The filling cover is its own section with no margins, first in the file.
  const firstSect = xml.indexOf("<w:sectPr");
  assert(firstSect > 0);
  const firstSectXml = xml.slice(firstSect, xml.indexOf("</w:sectPr>", firstSect));
  assertStringIncludes(firstSectXml, 'w:top="0"');
  // Cover, normal, columns, normal after the columns: four sections.
  assertEquals(count(xml, "<w:sectPr"), 4);
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

Deno.test("marks, tables, quotes and an unpictured block", async () => {
  const body = [
    "Some [danger]{.danger} and [big]{size=12 underline} and [lit]{color=#c62828} and [hl]{highlight=#ffe08a}.",
    "",
    "| A | B |",
    "| --- | ---: |",
    "| 1 | 2 |",
    "",
    ":::quote{cite=\"Someone\"}",
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
  const numIds = new Set([...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]));
  assertEquals(numIds.size, 2);
  assertStringIncludes(xml, 'w:ascii="Consolas"');
  assertStringIncludes(xml, "<w:drawing>");
  assertStringIncludes(xml, "cap</w:t>");
  // A pictured block the server did not return is a hard failure.
  const tokens = createFastrMarkdownIt().parse(":::band\nx\n:::\n", {});
  assertThrows(
    () =>
      buildFastrWordDocument({
        tokens,
        body: ":::band\nx\n:::\n",
        title: "t",
        theme: "default",
        footer: { title: "t", pageWord: "Page", ofWord: "of" },
        rasters: new Map(),
        figure: () => undefined,
        image: () => undefined,
      }),
    Error,
    "was not rasterized",
  );
});

Deno.test("embedded fonts, page ground and a natural cover", async () => {
  const body = ":::report{background=ink}\n:::cover{kicker=\"K\"}\n# Title\n:::\n\n## After\n\nText.\n";
  const font = { name: "Inter", data: new Uint8Array(256).fill(7), weight: 400 };
  const { xml, zip, files } = await build(body, { fonts: [font] });
  assert(files.includes("word/fonts/Inter.odttf"));
  const fontTable = await zip.file("word/fontTable.xml")!.async("string");
  assertStringIncludes(fontTable, "w:embedRegular");
  // The ink ground: the theme's ink as Word's page colour, the paper as ink.
  assertStringIncludes(xml, '<w:background w:color="24292e"');
  assertStringIncludes(xml, '<w:color w:val="fcfcfb"/>');
  const settings = await zip.file("word/settings.xml")!.async("string");
  assertStringIncludes(settings, "displayBackgroundShape");
  // A natural cover stays in the flow: one section, the picture pulled up
  // through the top margin (68px = 647700 EMU).
  assertEquals(count(xml, "<w:sectPr"), 1);
  assertStringIncludes(xml, "<wp:posOffset>-647700</wp:posOffset>");
  // The heading after it keeps its own top margin.
  assertStringIncludes(xml, '<w:pStyle w:val="Heading2"/>');
});

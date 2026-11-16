// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Pins the page furniture (FastrPageFurniture, engine/fastr_markdown_blocks.ts):
// the `:::report` attributes read, the paged stylesheet's margin boxes, frame
// and rule, the section bars, and the Word header, footer and page borders.
//
// Run: deno test -A report-forge/tests/fastr_page_furniture_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrPagedCss,
  buildFastrWordDocument,
  createFastrMarkdownIt,
  fastrFrameGeometry,
  fastrPageFurnitureOf,
  parseContainerAttrs,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
} from "../engine/mod.ts";

const HEADER =
  `:::report{header="BULLETIN · N° 04" footer="DPS Exemple" footerrule="#ce1126 #fcd116 #009460" frame=double numbering=sections sections=bar}`;
const BODY = `${HEADER}

# Qualité des données

Texte.

## Détail

Texte.

# Services

Texte.
`;

Deno.test("furniture is read from the report header", () => {
  const f = readFastrDocumentSettings(BODY).page.furniture!;
  assertEquals(f.header, "BULLETIN · N° 04");
  assertEquals(f.footer, "DPS Exemple");
  assertEquals(f.footerRule, ["#ce1126", "#fcd116", "#009460"]);
  assertEquals(f.frame, { style: "double", color: "var(--fm-accent)" });
  // Tones become their grounds; junk colours and unknown frames are dropped.
  const t = fastrPageFurnitureOf(
    parseContainerAttrs(
      `{footerrule="accent nonsense" frame=dotted footer=none}`,
    ),
  )!;
  assertEquals(t.footerRule, ["var(--fm-accent-ground)"]);
  assertEquals(t.frame, undefined);
  assertEquals(t.footer, null);
  assertEquals(t.pageNumbers, true);
  // A heavy frame in two colours, and no page numbers.
  const h = fastrPageFurnitureOf(
    parseContainerAttrs(
      `{frame=heavy framecolor="#000080 #0070c0" pagenumbers=none}`,
    ),
  )!;
  assertEquals(h.frame, {
    style: "heavy",
    color: "#000080",
    innerColor: "#0070c0",
  });
  assertEquals(h.pageNumbers, false);
  assertEquals(fastrFrameGeometry("heavy", 68).lines.length, 2);
  const css = buildFastrPagedCss(
    readFastrDocumentSettings(
      `:::report{frame=heavy framecolor="#000080 #0070c0" pagenumbers=none footer=none}\n`,
    ).page,
    { title: "T", pageWord: "Page", ofWord: "of" },
  );
  assertStringIncludes(css, "border: 9px solid #000080;");
  assertStringIncludes(css, "border: 2px solid #0070c0;");
  assert(!css.includes("counter(page)"));
  // Nothing set: no furniture at all.
  assertEquals(
    readFastrDocumentSettings("# Plain\n").page.furniture,
    undefined,
  );
});

Deno.test("the paged sheet carries the header, footer, frame and rule", () => {
  const page = readFastrDocumentSettings(BODY).page;
  const css = buildFastrPagedCss(page, {
    title: "Titre",
    pageWord: "Page",
    ofWord: "sur",
  });
  assertStringIncludes(css, `@top-center {\n    content: "BULLETIN · N° 04";`);
  assertStringIncludes(css, `content: "DPS Exemple";`);
  assert(!css.includes("string(fm-title)"));
  const g = fastrFrameGeometry("double", 68);
  assertEquals(g.lines.length, 2);
  assertStringIncludes(css, ".pagedjs_pagebox::before");
  assertStringIncludes(css, ".pagedjs_pagebox::after");
  assertStringIncludes(css, ".pagedjs_margin-bottom::after");
  assertStringIncludes(css, "linear-gradient(to right, #ce1126 0.0000%");
  // A cover's page drops the header and the rule, keeps the frame.
  assertStringIncludes(css, "@top-center { content: none; }");
  assertStringIncludes(
    css,
    ".pagedjs_fmcover_page .pagedjs_margin-bottom::after { content: none; }",
  );
  // A plain document's sheet is as it was.
  const plain = buildFastrPagedCss(readFastrDocumentSettings("# x\n").page, {
    title: "T",
    pageWord: "Page",
    ofWord: "of",
  });
  assertStringIncludes(plain, "content: string(fm-title);");
  assert(!plain.includes("pagedjs_pagebox::before"));
  assert(!plain.includes("@top-center {\n"));
});

Deno.test("section bars mark the section-level headings only", () => {
  const html = renderFastrMarkdownToHtml(BODY, { lineAnchors: false });
  assertEquals((html.match(/fm-secbar/g) ?? []).length, 2);
  assert(/<h2[^>]*fm-secbar/.test(html) === false);
  const off = renderFastrMarkdownToHtml(BODY.replace(" sections=bar", ""), {
    lineAnchors: false,
  });
  assert(!off.includes("fm-secbar"));
});

Deno.test("Word gets a header, the footer's text, the rule and page borders", async () => {
  const tokens = createFastrMarkdownIt().parse(BODY, {});
  const doc = buildFastrWordDocument({
    tokens,
    body: BODY,
    title: "Titre",
    theme: "default",
    footer: { title: "Titre", pageWord: "Page", ofWord: "sur" },
    figure: () => undefined,
    image: () => undefined,
  });
  const zip = await JSZip.loadAsync(
    await (await Packer.toBlob(doc)).arrayBuffer(),
  );
  const files = Object.keys(zip.files);
  const header = files.find((f) => /^word\/header\d*\.xml$/.test(f));
  assert(header !== undefined, "a header part");
  assertStringIncludes(
    await zip.file(header)!.async("string"),
    "BULLETIN · N° 04",
  );
  const footer = files.find((f) => /^word\/footer\d*\.xml$/.test(f))!;
  const footXml = await zip.file(footer)!.async("string");
  assertStringIncludes(footXml, "DPS Exemple");
  assertStringIncludes(footXml, 'w:fill="ce1126"');
  assertStringIncludes(footXml, 'w:fill="009460"');
  assert(!footXml.includes('w:gridCol w:w="100"'), "the rule's grid is sized");
  const xml = await zip.file("word/document.xml")!.async("string");
  assertStringIncludes(xml, "<w:pgBorders");
  // The bars are shaded headings.
  assertStringIncludes(xml, "<w:shd");
});

// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Page templates (`:::page{layout=…}`, engine/fastr_page_templates.ts): the
// registry's examples hold to their own rules, the validator says what is
// wrong in words the model can act on, a template renders its composition,
// takes exactly one page, heads a section, reads as text in Word, and the AI
// can look a layout up.

import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrReportCss,
  buildFastrWordDocument,
  createFastrMarkdownIt,
  FASTR_MD_SYNTAX_DOC,
  FASTR_PAGE_TEMPLATES,
  FASTR_TEMPLATE_SLACK_PX,
  fastrBlockFillsPage,
  fastrDocumentOutline,
  type FastrLayoutBlock,
  type FastrPagedResult,
  fastrPageMapText,
  fastrPageTemplateLookup,
  findReportHeadings,
  layoutFastrPages,
  listFastrContainerDefects,
  renderFastrMarkdownToHtml,
  spliceReportSection,
} from "../engine/mod.ts";
import { createReportTextTools } from "../ai/tools.ts";

const html = (body: string) =>
  renderFastrMarkdownToHtml(body, { lineAnchors: false });
const messages = (body: string) =>
  listFastrContainerDefects(body).map((d) => `${d.line}: ${d.message}`);
const example = (layout: string) =>
  FASTR_PAGE_TEMPLATES.find((t) => t.layout === layout)!.example;

Deno.test("every layout's placeholder is valid, keeps the example's slots, and holds no example content", () => {
  for (const t of FASTR_PAGE_TEMPLATES) {
    assertEquals(messages(t.placeholder), [], t.layout);
    const out = html(t.placeholder);
    assertStringIncludes(out, `class="fm-tpl fm-tpl--${t.layout}`);
    for (const s of t.slots) {
      assertEquals(
        t.placeholder.includes(`:::slot{name=${s.name}`),
        t.example.includes(`:::slot{name=${s.name}`),
        `${t.layout}: ${s.name}`,
      );
    }
    // Generic: no place, person or year from the examples.
    for (
      const word of [
        "Kenema",
        "Kailahun",
        "Bo ",
        "Bombali",
        "Kono",
        "Freetown",
        "Sierra",
        "Ministry",
        "202",
      ]
    ) {
      assertFalse(t.placeholder.includes(word), `${t.layout}: ${word}`);
    }
  }
});

Deno.test("every layout's example is valid, renders its composition, and has CSS", () => {
  const css = buildFastrReportCss("default");
  for (const t of FASTR_PAGE_TEMPLATES) {
    assertEquals(messages(t.example), [], t.layout);
    const out = html(t.example);
    assertStringIncludes(out, `class="fm-tpl fm-tpl--${t.layout}`);
    if (t.main.required) assertStringIncludes(out, `<div class="fm-tpl-main">`);
    for (const s of t.slots) {
      if (t.example.includes(`:::slot{name=${s.name}`)) {
        assertStringIncludes(out, `fm-tpl-slot--${s.name}`, t.layout);
      }
    }
    assertStringIncludes(css, `.fm-tpl--${t.layout} {`, t.layout);
  }
});

Deno.test("a page's main text is gathered into one area; an empty slot is marked", () => {
  const out = html(example("story"));
  assertEquals(out.split(`class="fm-tpl-main"`).length - 1, 1);
  // Source order is reading order: side, main, media.
  assert(out.indexOf("fm-tpl-slot--side") < out.indexOf("fm-tpl-main"));
  assert(out.indexOf("fm-tpl-main") < out.indexOf("fm-tpl-slot--media"));
  assertStringIncludes(out, "fm-tpl-slot--media fm-tpl-slot--empty");
  // A slot's default ground: the exec sidebar is ink unless it says.
  assertStringIncludes(
    html(example("exec")),
    "fm-tpl-slot--side fm-tone fm-tone--ink",
  );
  assertStringIncludes(
    html(example("exec").replace("{name=side}", "{name=side tone=accent}")),
    "fm-tpl-slot--side fm-tone fm-tone--accent",
  );
});

Deno.test("one blank line between two templates is a separator, not a line of space", () => {
  const out = renderFastrMarkdownToHtml(
    `${example("story")}\n\n${example("summary")}`,
    { lineAnchors: true },
  );
  assertFalse(out.includes("fm-space"));
});

Deno.test("the validator names what is wrong with a page", () => {
  const all = messages([
    ":::page{layout=story}",
    "Text",
    ":::slot{name=side}",
    "## H",
    ":::",
    "more",
    ":::slot{name=bogus}",
    ":::",
    ":::slot{name=side}",
    ":::",
    ":::",
    ":::slot{name=x}",
    ":::",
    ":::page{layout=nope}",
    ":::",
    ":::page{layout=summary}",
    "## x",
    ":::slot{name=headline}",
    ':::stat{value="1" icon=zap}',
    ":::",
    ":::",
    ":::page{layout=exec}",
    "Text",
    ":::",
    ":::callout",
    ":::page{layout=back}",
    "x",
    ":::",
    ":::",
    ":::page{layout=story media=left}",
    ":::band",
    "x",
    ":::",
    ":::",
  ].join("\n")).join("\n");
  for (
    const want of [
      "6: The text outside a page's slots is its main text and must be one run",
      "7: Layout `story` has no `bogus` slot. Its slots: side, media.",
      "9: The `side` slot appears twice in this page.",
      "12: A `:::slot` belongs directly inside a `:::page`.",
      "14: Unknown page layout `nope`. Layouts: story, summary,",
      "18: The `headline` slot takes 2 to 3 stats; it has 1.",
      "19: Unknown icon `zap`.",
      "22: Layout `exec` needs a `side` slot",
      "26: A `:::page` is a page of its own",
      "30: Unknown media `left`. Use media=bottom or media=top.",
      "31: A `:::band` cannot stand inside a `:::page`",
    ]
  ) {
    assertStringIncludes(all, want);
  }
});

Deno.test("a template's own heading is a section: outline, numbering and section edits", () => {
  const body = [
    ":::report{numbering=sections}",
    "",
    "## Before",
    "",
    "Intro.",
    "",
    example("story"),
    "",
    "After the story.",
    "",
    "## Next",
    "",
    "End.",
  ].join("\n");
  const outline = fastrDocumentOutline(body, 6).map((h) => h.text);
  assertEquals(outline, ["Before", "Closing the reporting gap", "Next"]);
  // The story's heading stands in its side slot, the layout's heading area,
  // so it is numbered like any section.
  assertStringIncludes(
    html(body),
    `<h2 class="fm-top fm-numbered fm-numbered--sec">Closing the reporting gap</h2>`,
  );
  // Its section starts at the page fence, so a rewrite takes the whole page.
  const h = findReportHeadings(body).find((x) =>
    x.text === "Closing the reporting gap"
  )!;
  assertEquals(
    body.split("\n")[h.section.fromLine - 1],
    example("story").split("\n")[0],
  );
  const spliced = spliceReportSection(
    body,
    "Closing the reporting gap",
    "## Replaced\n\nNew text.",
    undefined,
  );
  assert("newBody" in spliced);
  assertEquals(messages(spliced.newBody), []);
  assertFalse(spliced.newBody.includes(":::page"));
  assertStringIncludes(spliced.newBody, "## Next");
  // A heading in an area that is not the layout's heading area is not.
  const boxed = example("boxed").replace(
    ':::slot{name=box title="Box 2.1 How completeness is calculated"}',
    ':::slot{name=box title="Box 2.1"}\n### Inside the box',
  );
  assertFalse(
    fastrDocumentOutline(boxed, 6).some((x) => x.text === "Inside the box"),
  );
});

Deno.test("a template takes a page alone, and a page break above one leaves no empty page", () => {
  assertEquals(fastrBlockFillsPage("page", {}), "template");
  assertEquals(fastrBlockFillsPage("cover", { fill: "page" }), "cover");
  assertEquals(fastrBlockFillsPage("cover", { fill: "Page" }), "cover");
  assertEquals(fastrBlockFillsPage("cover", {}), undefined);
  const g = { pageH: 1123, marginPx: 68, sheetW: 794, safety: 6 };
  const area = g.pageH - 2 * g.marginPx;
  const block = (line: number, over: Partial<FastrLayoutBlock> = {}) => ({
    line,
    endLine: line,
    height: 200,
    gap: 16,
    heading: false,
    pagebreak: false,
    breakBefore: false,
    breakAfter: false,
    ...over,
  });
  const tpl = (line: number) =>
    block(line, {
      endLine: line + 5,
      height: area - FASTR_TEMPLATE_SLACK_PX,
      breakBefore: true,
      breakAfter: true,
    });
  const r = layoutFastrPages([
    block(0),
    block(2, { height: 0, pagebreak: true }),
    tpl(4),
    block(12),
    tpl(14),
    tpl(22),
  ], g);
  assertEquals(r.pages.map((p) => p.firstLine), [0, 4, 12, 14, 22]);
});

Deno.test("the page map names a template, reports an overfull or underfilled one, and calls the page it leaves short", () => {
  const body = ["Intro paragraph.", "", example("findings")].join("\n");
  const result: FastrPagedResult = {
    total: 2,
    sheet: { width: 794, height: 1123 },
    pages: [
      {
        number: 1,
        firstLine: 0,
        lines: [0],
        cover: false,
        flushTop: false,
        contentHeight: 60,
      },
      {
        number: 2,
        firstLine: 2,
        lines: [2],
        cover: false,
        flushTop: false,
        contentHeight: 979,
        overfull: [{ line: 2, area: "items", px: 72 }],
        templateFill: 0.5,
      },
    ],
    splits: [],
    blocks: [{ line: 0, height: 60 }, { line: 2, height: 979 }],
  };
  const text = fastrPageMapText(result, body);
  assertStringIncludes(text, "page template findings (Key findings)");
  assertStringIncludes(text, "OVERFULL: `items` slot");
  assertStringIncludes(text, "holds about 3 lines more than it shows");
  assertStringIncludes(
    text,
    "UNDERFILLED: the template's content reaches 50% down",
  );
  // The page before the template stops where the template starts.
  assertStringIncludes(
    text,
    "Page 1 of 2: 6% full, ends at a page break, SHORT",
  );
  assertStringIncludes(text, "takes the next page whole");
});

Deno.test("Word writes a template as its text, in reading order, on a page of its own", async () => {
  const body = `:::report{numbering=sections}\n\n## Before\n\nIntro.\n\n${
    example("story")
  }\n\nAfter.`;
  const doc = buildFastrWordDocument({
    tokens: createFastrMarkdownIt().parse(body, {}),
    body,
    title: "t",
    theme: "default",
    footer: { title: "t", pageWord: "Page", ofWord: "of" },
    figure: () => undefined,
    image: () => undefined,
  });
  const zip = await JSZip.loadAsync(
    await (await Packer.toBlob(doc)).arrayBuffer(),
  );
  const xml = await zip.file("word/document.xml")!.async("string");
  const at = (s: string) => xml.indexOf(s);
  assert(at("Kenema District") > 0);
  assert(at("Kenema District") < at("Closing the reporting gap"));
  assert(at("Closing the reporting gap") < at("In 2024 only six in ten"));
  // Numbered as the second section, and a page break each side of it.
  assertStringIncludes(xml, ">2. </w:t>");
  assert(xml.split("<w:pageBreakBefore/>").length - 1 >= 2);
});

Deno.test("the AI can look a layout up, and the brief lists them", async () => {
  const spec = fastrPageTemplateLookup("summary");
  assertStringIncludes(spec, "layout=summary");
  assertStringIncludes(spec, "headline (required, stats, 2 to 3)");
  assertStringIncludes(spec, example("summary"));
  const list = fastrPageTemplateLookup("nope");
  assertStringIncludes(list, "There is no page template `nope`");
  for (const t of FASTR_PAGE_TEMPLATES) {
    assertStringIncludes(list, t.layout);
    assertStringIncludes(FASTR_MD_SYNTAX_DOC, `    ${t.layout}`);
  }
  assertStringIncludes(FASTR_MD_SYNTAX_DOC, "call get_page_template");
  const tools = createReportTextTools({
    getBody: () => "",
    getSelection: () => undefined,
    proposeEdit: () => Promise.resolve({ accepted: false }),
  });
  const tool = tools.find((t) => t.name === "get_page_template")!;
  assertEquals(
    await tool.run({ layout: "timeline" }),
    fastrPageTemplateLookup("timeline"),
  );
  // Every layout a report uses comes back from one call, each once.
  const both = await tool.run({ layouts: ["summary", "timeline", "summary"] });
  assertEquals(
    both,
    `${fastrPageTemplateLookup("summary")}\n\n---\n\n${
      fastrPageTemplateLookup("timeline")
    }`,
  );
  assertEquals(
    await tool.run({ layouts: [] }),
    fastrPageTemplateLookup(undefined),
  );
});

Deno.test("with `#` sections, a template's `##` heading is listed and numbered as a section", () => {
  const body = [
    ":::report{numbering=sections}",
    "",
    "# Before",
    "",
    "Intro.",
    "",
    example("findings"),
    "",
    "# Next",
    "",
    "End.",
  ].join("\n");
  const outline = fastrDocumentOutline(body, 6);
  assertEquals(outline.map((h) => h.level), [1, 1, 1]);
  assertStringIncludes(
    html(body),
    `<h2 class="fm-top fm-numbered fm-numbered--sec">What the third quarter’s data says</h2>`,
  );
});

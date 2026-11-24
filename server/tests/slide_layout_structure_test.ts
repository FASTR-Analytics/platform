// `describeSlideBlocks` is what a slide write tells the model about the
// blocks it left: every block by id and type, then the layout as rows of
// spans; `describeUndrawableTextBlock` is why every measure of a slide
// refuses it. The client module imports nothing but lib, so it loads under
// Deno as it is.
//
//   deno test -A --no-check server/tests/slide_layout_structure_test.ts

import { assert, assertEquals } from "@std/assert";
import { parseMarkdown } from "@timroberton/panther";
import {
  type ContentBlock,
  type ContentSlide,
  describeSlideTableOrImageForAI,
  slideRenderMarkdown,
} from "lib";
import {
  describeSlideBlocks,
  describeUndrawableTextBlock,
} from "../../client/src/components/products/copilot/slide_ai/layout_structure.ts";

type Layout = ContentSlide["layout"];

const TEXT: ContentBlock = { type: "text", markdown: "Three bullets" };
const FIGURE: ContentBlock = { type: "figure" };

const item = (id: string, data: ContentBlock, span?: number): Layout => ({
  type: "item",
  id,
  data,
  span,
});

const rows = (id: string, children: Layout[], span?: number): Layout => ({
  type: "rows",
  id,
  children,
  span,
});

const cols = (id: string, children: Layout[]): Layout => ({
  type: "cols",
  id,
  children,
});

Deno.test("a two-row layout reads as its blocks, then one row per line of spans", () => {
  // The shape buildLayoutFromSpec gives two rows: every cell an item inside
  // its own rows wrapper, a row of several cells a cols node.
  const layout = rows("r0", [
    rows("r1", [item("a1b", TEXT)]),
    cols("c1", [
      rows("r2", [item("c3d", FIGURE)], 5),
      rows("r3", [item("e5f", TEXT)], 7),
    ]),
  ]);
  assertEquals(describeSlideBlocks(layout), [
    "Blocks: a1b (text), c3d (figure), e5f (text)",
    "Layout: Row 1: a1b (span=12); Row 2: c3d (span=5) | e5f (span=7)",
  ]);
});

Deno.test("a layout that is not rows of cells still lists its blocks and says how to restructure", () => {
  // Two blocks stacked in one column beside a third: a column holding rows,
  // which no row-of-spans line can say.
  const layout = cols("c0", [
    rows("r1", [item("a1b", TEXT), item("c3d", TEXT)], 6),
    item("e5f", FIGURE, 6),
  ]);
  assertEquals(describeSlideBlocks(layout), [
    "Blocks: a1b (text), c3d (text), e5f (figure)",
    "Layout: Complex layout — use replace_slide to restructure",
  ]);
});

// A text block holding a table outside a quote or an image alone in a
// top-level paragraph cannot be laid out by MarkdownRenderer, so its slide's
// page cannot be measured: the model is told which block holds what, at which
// line, and how to show it instead. A quoted table or any other image is
// drawn (run together, dropped), so that page measures as the canvas shows
// it.
Deno.test("a text block panther cannot draw is named by id, with its table or image and line", () => {
  const text = (markdown: string): ContentBlock => ({ type: "text", markdown });
  const twoBlocks = (markdown: string) =>
    rows("r0", [item("a1b", TEXT), cols("c1", [item("e5f", text(markdown))])]);
  const refused: [string, "table" | "image", number][] = [
    ["a | b\n--- | ---", "table", 1],
    ["| a | b |\n|---|---|\n| 1 | 2 |", "table", 1],
    ["intro\n\n- x\n\n  a | b\n  --- | ---", "table", 5],
    ["![a](b.png)", "image", 1],
    ["One.\n\n![a](b.png)\n\nTwo.", "image", 3],
    ["- a\n- \n\n![a](b.png)", "image", 4],
  ];
  const drawn = [
    "see ![a](b.png) here",
    "- ![a](b.png)",
    "# ![a](b.png)",
    "[![a](b.png)](http://u)",
    "![a](b.png)\n![c](d.png)",
    "> a | b\n> --- | ---",
    "Region A | Region B | Region C",
    "`a | b`\n\n```\na | b\n--- | ---\n```",
  ];
  for (const [markdown, kind, line] of refused) {
    const said = describeUndrawableTextBlock(twoBlocks(markdown));
    assert(
      said?.startsWith(
        `block e5f holds a markdown ${kind} at line ${line}, which slide text cannot draw. To show `,
      ),
      `${markdown}: ${said}`,
    );
  }
  for (const markdown of drawn) {
    assertEquals(
      describeUndrawableTextBlock(twoBlocks(markdown)),
      undefined,
      markdown,
    );
  }
  assertEquals(
    describeUndrawableTextBlock(twoBlocks("a | b\n--- | ---")),
    "block e5f holds a markdown table at line 1, which slide text cannot draw. To show tabular data, use a from_metric block with a table preset",
  );
  assertEquals(
    describeUndrawableTextBlock(twoBlocks("![a](b.png)")),
    "block e5f holds a markdown image at line 1, which slide text cannot draw. To show an image, use an image block naming one of the instance's image assets (get_image_assets lists them)",
  );
  // What panther lays out as an item of its own, in the text it is given for
  // the block, is exactly what is refused, by kind and line.
  for (const markdown of [...refused.map(([m]) => m), ...drawn]) {
    const own = parseMarkdown(slideRenderMarkdown(markdown)).items.find((i) =>
      i.type === "table" || i.type === "image"
    );
    assertEquals(
      describeUndrawableTextBlock(twoBlocks(markdown)),
      own &&
        describeSlideTableOrImageForAI("block e5f", {
          kind: own.type === "table" ? "table" : "image",
          line: own.line!,
        }),
      markdown,
    );
  }
});

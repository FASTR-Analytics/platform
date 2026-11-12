// `describeSlideBlocks` is what a slide write tells the model about the
// blocks it left: every block by id and type, then the layout as rows of
// spans. The client module imports nothing but lib types, so it loads under
// Deno as it is.
//
//   deno test -A --no-check server/tests/slide_layout_structure_test.ts

import { assertEquals } from "@std/assert";
import type { ContentBlock, ContentSlide } from "lib";
import { describeSlideBlocks } from "../../client/src/components/products/copilot/slide_ai/layout_structure.ts";

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

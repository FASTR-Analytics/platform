import { assertEquals } from "@std/assert";
import {
  type FastrLayoutBlock,
  fastrPageStartLines,
  layoutFastrPages,
} from "../../lib/fastr_markdown_pages.ts";

const G = { pageH: 1123, marginPx: 68, sheetW: 794 };
// A4 at 96dpi: 987px of content between the margins.
const block = (line: number, height: number, extra: Partial<FastrLayoutBlock> = {}): FastrLayoutBlock => ({
  line,
  endLine: line,
  height,
  gap: 16,
  heading: false,
  pagebreak: false,
  breakBefore: false,
  breakAfter: false,
  ...extra,
});

Deno.test("blocks fill a page whole and the one that does not fit opens the next", () => {
  const r = layoutFastrPages([block(0, 400), block(2, 400), block(4, 400), block(6, 100)], G);
  // 400 + 16 + 400 = 816 fits; the third would make 1232.
  assertEquals(fastrPageStartLines(r), [4]);
  assertEquals(r.total, 2);
  assertEquals(r.pages[0].contentHeight, 816);
  assertEquals(r.pages[1].contentHeight, 516);
});

Deno.test("a heading travels with the block after it", () => {
  const r = layoutFastrPages(
    [block(0, 700), block(2, 40, { heading: true }), block(4, 400)],
    G,
  );
  assertEquals(fastrPageStartLines(r), [2]);
  // The page the heading left counts only what stayed: the heading was
  // added to it before the block after it failed to fit.
  assertEquals(r.pages[0].contentHeight, 700);
  assertEquals(r.pages[1].contentHeight, 40 + 16 + 400);
  // A heading that is the page's only block is not pushed into an empty page.
  const r2 = layoutFastrPages([block(0, 40, { heading: true }), block(2, 2000)], G);
  assertEquals(fastrPageStartLines(r2), []);
});

Deno.test("explicit breaks and covers end or start a page", () => {
  const r = layoutFastrPages(
    [block(0, 100), block(2, 0, { pagebreak: true }), block(4, 100), block(6, 100, { breakBefore: true }), block(8, 100, { breakAfter: true }), block(10, 100)],
    G,
  );
  assertEquals(fastrPageStartLines(r), [4, 6, 10]);
  const cover = layoutFastrPages([block(0, 500, { cover: "fill" }), block(2, 100)], G);
  assertEquals(cover.pages[0].cover, true);
  assertEquals(fastrPageStartLines(cover), [2]);
  const natural = layoutFastrPages([block(0, 500, { cover: "natural" }), block(2, 100)], G);
  assertEquals(natural.pages[0].flushTop, true);
  assertEquals(natural.pages[0].cover, false);
  assertEquals(fastrPageStartLines(natural), []);
});

Deno.test("a block taller than a page continues at the boundaries it offers", () => {
  const tall = block(4, 2500, {
    endLine: 20,
    inner: [{ line: 5, top: 0 }, { line: 8, top: 600 }, { line: 11, top: 1200 }, { line: 14, top: 1800 }, { line: 17, top: 2300 }],
  });
  const r = layoutFastrPages([block(0, 200), tall, block(22, 100)], G);
  // 200 + 16 + 2500 overflows: the tall block opens page 2 and continues at
  // 600 (part 600 fits), then at 1200 (600), then 1800; the tail (700) holds
  // the last block too.
  assertEquals(fastrPageStartLines(r), [4, 8, 11, 14]);
  assertEquals(r.splits, [{ line: 4, page: 2 }]);
  assertEquals(r.pages[r.pages.length - 1].contentHeight, 700 + 16 + 100);
  // No boundaries: it simply runs past the page.
  const r2 = layoutFastrPages([block(0, 2500), block(2, 100)], G);
  assertEquals(fastrPageStartLines(r2), [2]);
});

Deno.test("the safety margin keeps the foot of every page free", () => {
  const r = layoutFastrPages([block(0, 500), block(2, 480)], { ...G, safety: 12 });
  // 500 + 16 + 480 = 996 > 987 − 12.
  assertEquals(fastrPageStartLines(r), [2]);
  assertEquals(layoutFastrPages([block(0, 500), block(2, 450)], { ...G, safety: 12 }).total, 1);
});

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
  // A cover as tall as the sheet fills its page whole: no safety on a cover
  // page, and never a split, whatever boundaries it offers.
  const sheet = layoutFastrPages(
    [block(0, 1123, { cover: "fill", inner: [{ line: 1, top: 800 }] }), block(2, 100)],
    { ...G, safety: 6 },
  );
  assertEquals(fastrPageStartLines(sheet), [2]);
  assertEquals(sheet.splits, []);
  assertEquals(sheet.pages[0].contentHeight, 1123);
  // A marker that opens a page (first in the document, or right after
  // another break) leaves no empty page behind it.
  const markers = layoutFastrPages(
    [block(0, 0, { pagebreak: true }), block(2, 100), block(4, 0, { pagebreak: true }), block(6, 0, { pagebreak: true }), block(8, 100)],
    G,
  );
  assertEquals(fastrPageStartLines(markers), [6]);
  assertEquals(markers.total, 2);
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

Deno.test("a block that opens a page takes its whole top margin there", () => {
  // Mid-page the extra does not count: 500 + 16 + 460 = 976 fits.
  const r = layoutFastrPages([block(0, 500), block(2, 460, { topExtra: 16 })], G);
  assertEquals(r.total, 1);
  // Opening a page, the block stands 16 lower and the page counts it.
  const r2 = layoutFastrPages([block(0, 900), block(2, 460, { topExtra: 16 })], G);
  assertEquals(fastrPageStartLines(r2), [2]);
  assertEquals(r2.pages[1].contentHeight, 476);
  // Taller than the page once its extra is added, it continues at a
  // boundary; the continuation starts at the page's top, no extra.
  const tall = block(2, 980, { endLine: 9, topExtra: 16, inner: [{ line: 5, top: 500 }] });
  const r3 = layoutFastrPages([block(0, 900), tall], G);
  assertEquals(fastrPageStartLines(r3), [2, 5]);
  assertEquals(r3.pages[1].contentHeight, 516);
  assertEquals(r3.pages[2].contentHeight, 480);
});

Deno.test("a figure short of room shrinks to what is left, down to its floor", () => {
  // 600 used; the figure (400, may give up 160, keeps a 16 tail under it)
  // has 987 − 600 − 16 − 16 = 355 of room, above its floor of 240: it takes
  // the room and the page is full but for the tail.
  const r = layoutFastrPages([block(0, 600), block(2, 400, { flex: 160, tail: 16 }), block(4, 100)], G);
  assertEquals(fastrPageStartLines(r), [4]);
  assertEquals(r.fits, [{ line: 2, shrink: 45 }]);
  assertEquals(r.pages[0].contentHeight, 600 + 16 + 355);
  // Below the floor it moves whole, as any block does.
  const r2 = layoutFastrPages([block(0, 800), block(2, 400, { flex: 160, tail: 16 }), block(4, 100)], G);
  assertEquals(fastrPageStartLines(r2), [2]);
  assertEquals(r2.fits, []);
  // A heading before a block that shrinks stays with it on the page.
  const r3 = layoutFastrPages(
    [block(0, 500), block(2, 60, { heading: true }), block(4, 400, { flex: 160, tail: 16 }), block(6, 100)],
    G,
  );
  assertEquals(fastrPageStartLines(r3), [6]);
  assertEquals(r3.fits, [{ line: 4, shrink: 400 - (987 - 576 - 32) }]);
});

Deno.test("a block under a heading that only its heading precedes continues in place", () => {
  // The heading opened the page (nothing else stands before the table on
  // it), so the table cannot move without stranding it: it starts under the
  // heading and continues at a row boundary on the next page.
  const table = block(2, 1500, {
    endLine: 30,
    inner: [{ line: 5, top: 300 }, { line: 10, top: 600 }, { line: 15, top: 900 }, { line: 20, top: 1200 }],
  });
  const r = layoutFastrPages([block(0, 40, { heading: true }), table, block(32, 100)], G);
  // 40 + 16 + 900 = 956 fits, 1200 would not: the second page opens at the
  // row at 900 and holds the rest (600) with the block after it.
  assertEquals(fastrPageStartLines(r), [15]);
  assertEquals(r.splits, [{ line: 2, page: 1 }]);
  assertEquals(r.pages[0].contentHeight, 40 + 16 + 900);
  assertEquals(r.pages[1].contentHeight, 600 + 16 + 100);
  // Mid-page after prose, the same table moves whole to the next page first
  // (as any block does) and continues from that page's top: 900 fits, 1200
  // would not.
  const r2 = layoutFastrPages([block(0, 200), table, block(32, 100)], G);
  assertEquals(fastrPageStartLines(r2), [2, 15]);
  assertEquals(r2.splits, [{ line: 2, page: 2 }]);
  assertEquals(r2.pages[1].contentHeight, 900);
  assertEquals(r2.pages[2].contentHeight, 600 + 16 + 100);
  // Two headings above it travel together and it continues under both,
  // at the row that fits under them (600: 900 would not).
  const r3 = layoutFastrPages(
    [block(0, 500), block(2, 60, { heading: true }), block(4, 40, { heading: true }), { ...table, line: 6 }, block(36, 100)],
    G,
  );
  assertEquals(fastrPageStartLines(r3), [2, 10, 36]);
  assertEquals(r3.pages[1].contentHeight, 60 + 16 + 40 + 16 + 600);
  assertEquals(r3.pages[2].contentHeight, 900);
});

Deno.test("a page continued from a block re-sums from the block's last part", () => {
  const tall = block(2, 2000, { endLine: 20, inner: [{ line: 8, top: 900 }, { line: 14, top: 1800 }] });
  // The tall block continues twice; its last part (200) opens page 3, and
  // the heading + block after it, not fitting, move to page 4 and leave
  // page 3 with that last part only, not the whole block.
  const r = layoutFastrPages(
    [block(0, 100), tall, block(22, 40, { heading: true }), block(24, 800)],
    G,
  );
  assertEquals(fastrPageStartLines(r), [2, 8, 14, 22]);
  assertEquals(r.pages[3].contentHeight, 200);
  assertEquals(r.pages[4].contentHeight, 40 + 16 + 800);
});

Deno.test("headings travel with a block that starts a page by attribute", () => {
  const r = layoutFastrPages(
    [block(0, 300), block(2, 40, { heading: true }), block(4, 200, { breakBefore: true }), block(6, 100)],
    G,
  );
  assertEquals(fastrPageStartLines(r), [2]);
  assertEquals(r.pages[0].contentHeight, 300);
  assertEquals(r.pages[1].contentHeight, 40 + 16 + 200 + 16 + 100);
  // A heading that already opens the page stays where it is: no empty page.
  const r2 = layoutFastrPages([block(0, 40, { heading: true }), block(2, 200, { breakBefore: true })], G);
  assertEquals(r2.total, 1);
  // A cover after a heading takes its page alone as before.
  const r3 = layoutFastrPages([block(0, 40, { heading: true }), block(2, 500, { cover: "fill" }), block(4, 100)], G);
  assertEquals(fastrPageStartLines(r3), [2, 4]);
});

Deno.test("a line of space between a heading and its block travels with them", () => {
  const r = layoutFastrPages(
    [block(0, 700), block(2, 40, { heading: true }), block(4, 12, { space: true, gap: 0 }), block(5, 400)],
    G,
  );
  assertEquals(fastrPageStartLines(r), [2]);
  assertEquals(r.pages[0].contentHeight, 700);
  assertEquals(r.pages[1].contentHeight, 40 + 12 + 16 + 400);
  // A line of space with no heading above it stays on its page.
  const r2 = layoutFastrPages([block(0, 700), block(2, 12, { space: true }), block(4, 400)], G);
  assertEquals(fastrPageStartLines(r2), [4]);
  assertEquals(r2.pages[0].contentHeight, 700 + 16 + 12);
});

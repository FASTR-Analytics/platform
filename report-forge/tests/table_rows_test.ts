// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

import { assertEquals } from "@std/assert";
import MarkdownIt from "markdown-it";
import {
  cellSlices,
  escapeCellText,
  isTableRowText,
  tableCellIndexAt,
  tableRowCells,
} from "../engine/fastr_table_rows.ts";

// The cell islands edit cell i of a row's SOURCE and show cell i of its
// RENDER, so the two splits must agree: a row with an escaped pipe once wrote
// into the wrong cell and grew a column.

const md = new MarkdownIt();

// The body row's cells as markdown-it renders them (escapes undone), under a
// header `cols` wide (markdown-it drops a row's cells past the header's).
function renderedCells(row: string, cols = 3): string[] {
  const head = `|${" h |".repeat(cols)}\n|${" --- |".repeat(cols)}`;
  const html = md.render(`${head}\n${row}\n`);
  const body = html.split("<tbody>")[1] ?? "";
  return Array.from(body.matchAll(/<td>(.*?)<\/td>/g), (m) => m[1]);
}

Deno.test("table rows: an escaped pipe is text inside its cell", () => {
  const row = "| A \\| B | keep me | 10 |";
  assertEquals(tableRowCells(row), ["A \\| B", "keep me", "10"]);
  assertEquals(renderedCells(row), ["A | B", "keep me", "10"]);
});

Deno.test("table rows: cell count and order match markdown-it", () => {
  for (
    const row of [
      "| one | two | three |",
      "one | two | three",
      "| `a|b` | x | y |",
      "| a\\|b\\|c | | z |",
      "|  | mid |  |",
    ]
  ) {
    const ours = tableRowCells(row).map((c) => c.replace(/\\\|/g, "|"));
    const theirs = renderedCells(row, ours.length).map((c) =>
      c.replace(/<\/?code>/g, "`")
    );
    assertEquals(ours, theirs, row);
  }
});

Deno.test("table rows: slices carry their offsets in the line", () => {
  const row = "| A \\| B | keep me | 10 |";
  for (const s of cellSlices(row)) {
    assertEquals(row.slice(s.start, s.start + s.raw.length), s.raw);
  }
  assertEquals(cellSlices(row).map((s) => s.start), [1, 10, 20]);
});

Deno.test("table rows: the cell a column falls in", () => {
  const row = "| A \\| B | keep me | 10 |";
  assertEquals(tableCellIndexAt(row, 0), 0);
  assertEquals(tableCellIndexAt(row, 5), 0); // on the escaped pipe
  assertEquals(tableCellIndexAt(row, 12), 1);
  assertEquals(tableCellIndexAt(row, 21), 2);
  assertEquals(tableCellIndexAt(row, row.length), 2);
});

Deno.test("table rows: what counts as a row", () => {
  assertEquals(isTableRowText("| a | b |"), true);
  assertEquals(isTableRowText("a \\| b"), false);
  assertEquals(isTableRowText(':::callout{title="a|b"}'), false);
  assertEquals(isTableRowText("   "), false);
});

Deno.test("table rows: typed text is escaped for its cell", () => {
  assertEquals(escapeCellText("a|b"), "a\\|b");
  assertEquals(escapeCellText("a\\|b"), "a\\|b");
  assertEquals(escapeCellText("x\ny"), "x y");
});

// The cell menu's and the toolbar's row and column actions rebuild every row
// from its cells: an escaped pipe must stay inside its cell.
Deno.test("table actions keep an escaped pipe in its cell", async () => {
  const { applyTableCellAction } = await import(
    "../engine/fastr_markdown_edits.ts"
  );
  const table = [
    "| Name | Note |",
    "| --- | --- |",
    "| A \\| B | keep me |",
  ];
  assertEquals(applyTableCellAction(table, 2, 1, "insertColRight"), [
    "| Name | Note |  |",
    "| --- | --- | --- |",
    "| A \\| B | keep me |  |",
  ]);
  assertEquals(applyTableCellAction(table, 2, 0, "deleteCol"), [
    "| Note |",
    "| --- |",
    "| keep me |",
  ]);
});

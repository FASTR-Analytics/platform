import { assertEquals } from "@std/assert";
import { fastrLiveRegions } from "../../lib/fastr_live_regions.ts";

// The live-preview region mapper decides which line ranges Edit mode collapses
// into rendered widgets. Wrong boundaries here mean a widget renders the wrong
// slice or a collapse swallows prose — so the shapes are pinned line by line.

function regions(body: string) {
  return fastrLiveRegions(body.split("\n")).map((r) =>
    `${r.kind}:${r.startLine}-${r.endLine}${r.unclosed ? ":unclosed" : ""}${
      r.fence ? `:${r.fence.name}` : ""
    }`
  );
}

Deno.test("a container with nested blocks is ONE region", () => {
  const body = [
    "prose", // 0
    ":::tiles{cols=2}", // 1
    ':::card{title="A"}', // 2
    "text",
    ":::",
    ":::card",
    "text",
    ":::",
    ":::", // 8
    "more prose", // 9
  ].join("\n");
  assertEquals(regions(body), ["container:1-8:tiles"]);
});

Deno.test("adjacent regions each stand alone, prose stays out", () => {
  const body = [
    ":::band{tone=dark}", // 0
    "## Title",
    ":::", // 2
    "", // 3
    ':::stat{value="64%"}', // 4
    "prose between", // 5
    ":::quote", // 6
    "words",
    ":::", // 8
  ].join("\n");
  assertEquals(regions(body), [
    "container:0-2:band",
    "leaf:4-4:stat",
    "container:6-8:quote",
  ]);
});

Deno.test("a leaf at top level is a region; inside a container it is swallowed", () => {
  const body = [
    ":::report{width=wide}", // 0 — leaf region
    ":::tiles", // 1
    ':::stat{value="1"}', // 2 — inside the container, no region of its own
    ":::", // 3
  ].join("\n");
  assertEquals(regions(body), ["leaf:0-0:report", "container:1-3:tiles"]);
});

Deno.test("an unclosed container runs to EOF and says so", () => {
  const body = [":::band", "text", "more"].join("\n");
  assertEquals(regions(body), ["container:0-2:unclosed:band"]);
});

Deno.test("a stray close is prose, not a region", () => {
  assertEquals(regions([":::", "text"].join("\n")), []);
});

Deno.test("a code fence hides ::: and | from the mapper", () => {
  const body = [
    "```", // 0
    ":::band", // literal
    "| a | b |", // literal
    "| - | - |", // literal
    "```", // 4
  ].join("\n");
  assertEquals(regions(body), []);
});

// ── Tables ───────────────────────────────────────────────────────────────────

Deno.test("a table region spans header, delimiter and rows", () => {
  const body = [
    "", // 0
    "| Region | ANC4 |", // 1
    "| --- | ---: |", // 2
    "| R002 | 83.6% |",
    "| R003 | 86.9% |", // 4
    "", // 5
    "after",
  ].join("\n");
  assertEquals(regions(body), ["table:1-4"]);
});

Deno.test("a table ends at a blank line, a fence, or a line without a pipe", () => {
  const body = [
    "| a | b |", // 0
    "| - | - |", // 1
    "| 1 | 2 |", // 2
    "not a row", // 3
  ].join("\n");
  assertEquals(regions(body), ["table:0-2"]);
});

Deno.test("pipes without a delimiter row are prose", () => {
  assertEquals(regions(["a | b", "c | d"].join("\n")), []);
});

Deno.test("a table cannot grow out of the paragraph above it", () => {
  // No blank line before the header: markdown-it might accept this as an
  // interruption, but the mapper is deliberately conservative — the source
  // stays visible rather than risking a wrong boundary.
  const body = [
    "Some prose ending here", // 0
    "| a | b |", // 1
    "| - | - |", // 2
  ].join("\n");
  assertEquals(regions(body), []);
});

Deno.test("a bare --- is a thematic break, never a delimiter row", () => {
  assertEquals(regions(["title | words", "---"].join("\n")), []);
});

Deno.test("a table straight after a region starts cleanly", () => {
  const body = [
    ":::band", // 0
    "x",
    ":::", // 2
    "| a |", // 3
    "| - |", // 4
  ].join("\n");
  assertEquals(regions(body), ["container:0-2:band", "table:3-4"]);
});

// ── Embeds ───────────────────────────────────────────────────────────────────

Deno.test("a lone embed line is a region, with or without width attrs", () => {
  const id = "8b7c1c2e-6f2a-4a3b-9c1d-0e1f2a3b4c5d";
  const body = [
    `![Coverage](figure:${id})`, // 0
    "",
    `![Coverage](figure:${id}){width=wide}`, // 2
    `prose with ![inline](figure:${id}) is not a region`, // 3
  ].join("\n");
  assertEquals(regions(body), ["embed:0-0", "embed:2-2"]);
});

Deno.test("an embed inside a container belongs to the container", () => {
  const id = "8b7c1c2e-6f2a-4a3b-9c1d-0e1f2a3b4c5d";
  const body = [
    ":::columns", // 0
    `![c](figure:${id})`,
    ":::", // 2
  ].join("\n");
  assertEquals(regions(body), ["container:0-2:columns"]);
});

// Pins the window `get_module_r_script` and `get_module_log` write of a file:
// whole lines within the window, from the start or to the end, the counts and
// the range it opens with, fromLine reading on with no line lost or repeated,
// a long line cut with its length stated, and a search's matching lines with
// their numbers.
//
//   deno test -A --no-check server/tests/text_window_for_ai_test.ts

import { assert, assertEquals, assertThrows } from "@std/assert";
import { AIToolFailure } from "@timroberton/panther";
import { formatTextWindowForAI } from "../../lib/ai_tools/format_text_window_for_ai.ts";
import {
  AI_TEXT_LINE_MAX_CHARS,
  AI_TEXT_WINDOW_MAX_CHARS,
} from "../../lib/ai_tools/read_bounds.ts";

// Each line is 99 characters, so with its newline a window holds 400 of them.
const LINE_CHARS = 99;
const PER_WINDOW = Math.floor((AI_TEXT_WINDOW_MAX_CHARS + 1) / 100);

function linesOf(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `line ${i + 1}`.padEnd(LINE_CHARS, "."),
  );
}

function split(window: string): { head: string; body: string[] } {
  const at = window.indexOf("\n\n");
  return at === -1
    ? { head: window, body: [] }
    : { head: window.slice(0, at), body: window.slice(at + 2).split("\n") };
}

Deno.test("a text within the window is written whole with its counts", () => {
  const lines = ["a <- 1", "", "print(a)"];
  const text = `${lines.join("\n")}\n`;
  for (const defaultWindow of ["start", "end"] as const) {
    const { head, body } = split(
      formatTextWindowForAI(text, defaultWindow, {}),
    );
    assertEquals(
      head,
      `File: 3 lines, ${text.length} characters. Written: the whole file.`,
    );
    assertEquals(body, lines);
  }
});

Deno.test("a longer text is written from the start as whole lines, with the range and the next fromLine", () => {
  const lines = linesOf(1000);
  const { head, body } = split(
    formatTextWindowForAI(lines.join("\n"), "start", {}),
  );
  assertEquals(
    head,
    `File: 1000 lines, ${
      1000 * LINE_CHARS + 999
    } characters. Written: lines 1 to ${PER_WINDOW}. The next window is fromLine ${
      PER_WINDOW + 1
    }.`,
  );
  assertEquals(body, lines.slice(0, PER_WINDOW));
  assert(body.join("\n").length <= AI_TEXT_WINDOW_MAX_CHARS);
});

Deno.test("a longer text is written to the end as whole lines, with the range", () => {
  const lines = linesOf(1000);
  const { head, body } = split(
    formatTextWindowForAI(lines.join("\n"), "end", {}),
  );
  assertEquals(
    head,
    `File: 1000 lines, ${1000 * LINE_CHARS + 999} characters. Written: lines ${
      1000 - PER_WINDOW + 1
    } to 1000, the end of the file. fromLine reads from an earlier line.`,
  );
  assertEquals(body, lines.slice(1000 - PER_WINDOW));
});

Deno.test("fromLine continues from a window's last line with no line lost or repeated", () => {
  const lines = linesOf(1000);
  const text = lines.join("\n");
  const read: string[] = [];
  let fromLine = 1;
  for (let call = 0; call < 10; call++) {
    const { head, body } = split(
      formatTextWindowForAI(text, "end", { fromLine }),
    );
    read.push(...body);
    const next = head.match(/The next window is fromLine (\d+)\./);
    if (next === null) break;
    fromLine = Number(next[1]);
  }
  assertEquals(read, lines);
});

Deno.test("a line over the line bound is cut with its length stated", () => {
  const long = "x".repeat(AI_TEXT_LINE_MAX_CHARS + 500);
  const { body } = split(
    formatTextWindowForAI(["a", long, "b"].join("\n"), "start", {}),
  );
  assertEquals(body, [
    "a",
    `${
      "x".repeat(AI_TEXT_LINE_MAX_CHARS)
    } … [line cut at ${AI_TEXT_LINE_MAX_CHARS} of ${long.length} characters]`,
    "b",
  ]);
});

const LOG = [
  "Loading data",
  "Warning: 3 rows dropped",
  "Computing",
  "Error in fit(): singular matrix",
  "Écriture des résultats",
  "Done",
].join("\n");

Deno.test("a search writes the matching lines with their numbers and both counts", () => {
  const { head, body } = split(
    formatTextWindowForAI(LOG, "end", { search: ["error", "ecriture"] }),
  );
  assertEquals(
    head,
    `File: 6 lines, ${LOG.length} characters. 2 of 6 lines match "error" or "ecriture". Written: 2 matches, on lines 4 to 5.`,
  );
  assertEquals(body, [
    "4: Error in fit(): singular matrix",
    "5: Écriture des résultats",
  ]);
});

Deno.test("a search from fromLine states the matches from that line on", () => {
  const { head, body } = split(
    formatTextWindowForAI(LOG, "end", {
      search: ["error", "warning"],
      fromLine: 3,
    }),
  );
  assertEquals(
    head,
    `File: 6 lines, ${LOG.length} characters. 2 of 6 lines match "error" or "warning", 1 of them from line 3. Written: the match on line 4.`,
  );
  assertEquals(body, ["4: Error in fit(): singular matrix"]);
});

Deno.test("a search with no match writes the counts and no line", () => {
  assertEquals(
    formatTextWindowForAI(LOG, "start", { search: ["segfault"] }),
    `File: 6 lines, ${LOG.length} characters. 0 of 6 lines match "segfault".`,
  );
});

Deno.test("a search with more matches than the window holds names the next fromLine", () => {
  const lines = linesOf(1000);
  const { head, body } = split(
    formatTextWindowForAI(lines.join("\n"), "start", { search: ["line"] }),
  );
  const written = body.length;
  assert(written < 1000, head);
  assert(body.join("\n").length <= AI_TEXT_WINDOW_MAX_CHARS);
  assertEquals(body[written - 1], `${written}: ${lines[written - 1]}`);
  assert(
    head.endsWith(
      `1000 of 1000 lines match "line". Written: ${written} matches, on lines 1 to ${written}. The next window is fromLine ${
        written + 1
      }.`,
    ),
    head,
  );
});

Deno.test("fromLine past the end refuses with the line count", () => {
  assertThrows(
    () => formatTextWindowForAI(LOG, "start", { fromLine: 7 }),
    AIToolFailure,
    "fromLine 7 is past the end: the file holds 6 lines.",
  );
});

import { AIToolFailure } from "@timroberton/panther";
import { requiredSearchForAI } from "./format_value_list_for_ai.ts";
import {
  AI_TEXT_LINE_MAX_CHARS,
  AI_TEXT_WINDOW_MAX_CHARS,
} from "./read_bounds.ts";

export type TextWindowQuery = {
  fromLine?: number;
  search?: string[];
};

// get_module_r_script and get_module_log: one window of a file. `defaultWindow`
// is where a call with neither fromLine nor search reads: a script from its
// first line, a log to its last, where its error is.
export function formatTextWindowForAI(
  text: string,
  defaultWindow: "start" | "end",
  query: TextWindowQuery,
): string {
  const lines = text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/);
  const counts = `File: ${counted(lines.length, "line")}, ${
    counted(text.length, "character")
  }.`;
  if (query.fromLine !== undefined && query.fromLine > lines.length) {
    throw new AIToolFailure(
      `fromLine ${query.fromLine} is past the end: the file holds ${
        counted(lines.length, "line")
      }.`,
    );
  }
  const from = query.fromLine ?? 1;
  const next = (last: number, of: number) =>
    last < of ? ` The next window is fromLine ${last + 1}.` : "";
  if (query.search !== undefined) {
    const search = requiredSearchForAI(query.search);
    const matching = lines.flatMap((line, i) =>
      search.matches(line) ? [i + 1] : []
    );
    const matchingFrom = matching.filter((n) => n >= from);
    const matchCount = `${matching.length} of ${
      counted(lines.length, "line")
    } match ${search.quoted}${
      from > 1 ? `, ${matchingFrom.length} of them from line ${from}` : ""
    }.`;
    const entries = matchingFrom.map((n) => `${n}: ${cutLine(lines[n - 1])}`);
    const n = countWithinWindow(entries);
    if (n === 0) {
      return `${counts} ${matchCount}`;
    }
    const last = matchingFrom[n - 1];
    const written = `Written: ${
      n === 1 ? "the match on" : `${n} matches, on`
    } ${lineRange(matchingFrom[0], last)}.${
      next(last, matchingFrom[matchingFrom.length - 1])
    }`;
    return `${counts} ${matchCount} ${written}\n\n${
      entries.slice(0, n).join("\n")
    }`;
  }
  if (lines.length === 0) {
    return counts;
  }
  const entries = lines.map(cutLine);
  const fromEnd = query.fromLine === undefined && defaultWindow === "end";
  const n = countWithinWindow(
    fromEnd ? [...entries].reverse() : entries.slice(from - 1),
  );
  const first = fromEnd ? lines.length - n + 1 : from;
  const last = first + n - 1;
  const written = n === lines.length
    ? "Written: the whole file."
    : fromEnd
    ? `Written: ${
      lineRange(first, last)
    }, the end of the file. fromLine reads from an earlier line.`
    : `Written: ${lineRange(first, last)}.${next(last, lines.length)}`;
  return `${counts} ${written}\n\n${entries.slice(first - 1, last).join("\n")}`;
}

function counted(n: number, noun: string): string {
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

function lineRange(first: number, last: number): string {
  return first === last ? `line ${first}` : `lines ${first} to ${last}`;
}

function cutLine(line: string): string {
  return line.length > AI_TEXT_LINE_MAX_CHARS
    ? `${
      line.slice(0, AI_TEXT_LINE_MAX_CHARS)
    } … [line cut at ${AI_TEXT_LINE_MAX_CHARS} of ${line.length} characters]`
    : line;
}

// How many of the entries, from the first, fit the window one to a line.
function countWithinWindow(entries: string[]): number {
  let chars = -1;
  let n = 0;
  for (const entry of entries) {
    chars += entry.length + 1;
    if (chars > AI_TEXT_WINDOW_MAX_CHARS) break;
    n++;
  }
  return n;
}

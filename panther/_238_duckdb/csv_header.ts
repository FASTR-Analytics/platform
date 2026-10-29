// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  foldName,
  LongTableValidationError,
  validateColumnName,
} from "./deps.ts";

// The dialect panther accepts, taken from the file's first line rather than
// from DuckDB's sniffer. A sniffed file that is not rectangular loads as a
// different table with no error: `a,b,c` whose last row has a fourth cell
// sniffs as four columns named 7, 8, 9 and 10 with no rows, a short totals
// row makes the file one text column named after the whole header, and a
// one-column file whose later lines hold a semicolon loses its header and
// its first row. So the first line is the header and states the delimiter,
// quotes are `"`, and every row must have the header's cell count, which the
// read enforces by declaring the columns.
const DELIMITERS = [",", ";", "\t", "|"];
export const QUOTE = '"';
const BOM = "﻿";
// A one-column file states no delimiter, so the read is given one no text
// file carries. Any delimiter in a later line is then part of the single
// cell, which is what a file of one column says, whichever delimiter it is.
const NO_DELIMITER = "\u001f";
// A header longer than this is refused rather than read in full: no table
// has that much name.
const MAX_HEADER_BYTES = 1 << 20;

export type CsvHeader = { delimiter: string; names: string[] };

export async function readCsvHeader(path: string): Promise<CsvHeader> {
  const { text, atEof } = await readHead(path);
  if (text.trim().length === 0) {
    throw new LongTableValidationError(`CSV "${path}" has no header line`);
  }
  return parseCsvHeader(text, atEof, path);
}

async function readHead(
  path: string,
): Promise<{ text: string; atEof: boolean }> {
  const file = await Deno.open(path, { read: true });
  try {
    const buffer = new Uint8Array(MAX_HEADER_BYTES);
    let filled = 0;
    while (filled < buffer.length) {
      const read = await file.read(buffer.subarray(filled));
      if (read === null) {
        return { text: decode(buffer.subarray(0, filled)), atEof: true };
      }
      filled += read;
    }
    return { text: decode(buffer), atEof: false };
  } finally {
    file.close();
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

type Line = { cells: string[]; stated: string[]; ended: boolean; next: number };

// One line's cells and the delimiters it states, from `at`. A quote opens and
// closes a cell's text, where `""` is one quote character; outside a quoted
// cell a line break ends the line.
function readLine(text: string, at: number, path: string): Line {
  const cells: string[] = [];
  const stated = new Set<string>();
  let cell = "";
  let quoted = false;
  let i = at;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === QUOTE && text[i + 1] === QUOTE) {
        cell += QUOTE;
        i += 2;
        continue;
      }
      if (c === QUOTE) {
        quoted = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }
    if (c === QUOTE) {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      cells.push(cell);
      const breakLength = c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      return { cells, stated: [...stated], ended: true, next: i + breakLength };
    }
    if (DELIMITERS.includes(c)) {
      stated.add(c);
      cells.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    cell += c;
    i += 1;
  }
  if (quoted) {
    throw new LongTableValidationError(
      `CSV "${path}" has a quote that is never closed`,
    );
  }
  cells.push(cell);
  return { cells, stated: [...stated], ended: false, next: i };
}

export function parseCsvHeader(
  head: string,
  atEof: boolean,
  path: string,
): CsvHeader {
  const text = head.startsWith(BOM) ? head.slice(BOM.length) : head;
  const header = readLine(text, 0, path);
  if (!header.ended && !atEof) {
    throw new LongTableValidationError(
      `CSV "${path}" has no line break in its first ${MAX_HEADER_BYTES} bytes`,
    );
  }
  return {
    delimiter: delimiterOf(header, text, path),
    names: checkedNames(header.cells),
  };
}

function delimiterOf(header: Line, text: string, path: string): string {
  if (header.stated.length === 1) {
    return header.stated[0];
  }
  if (header.stated.length > 1) {
    throw new LongTableValidationError(
      `CSV "${path}" has a header line stating ${
        named(header.stated)
      }, so which one separates its cells is a guess`,
    );
  }
  // A title line above the real header is the one shape a first line of one
  // cell can be, and the line below it gives it away.
  const second = header.ended ? readLine(text, header.next, path) : undefined;
  if (second !== undefined && second.stated.length > 0) {
    throw new LongTableValidationError(
      `CSV "${path}" has a first line stating no delimiter above a line stating ${
        named(second.stated)
      }, so the first line reads as a title and not as the header`,
    );
  }
  return NO_DELIMITER;
}

function named(delimiters: string[]): string {
  return delimiters.map((d) => d === "\t" ? "a tab" : `"${d}"`).join(" and ");
}

function checkedNames(cells: string[]): string[] {
  const seen = new Set<string>();
  for (const name of cells) {
    validateColumnName(name);
    if (seen.has(foldName(name))) {
      throw new LongTableValidationError(
        `CSV header "${name}" appears twice (names are case-insensitive)`,
      );
    }
    seen.add(foldName(name));
  }
  return cells;
}

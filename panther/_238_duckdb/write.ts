// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { caseHint, foldName, LongTableValidationError } from "./deps.ts";
import { QUOTE, readCsvHeader } from "./csv_header.ts";
import type { DuckDBConnection, LongTableColumnType } from "./deps.ts";
import {
  describeStatement,
  readParquet,
  requireFile,
  requirePlainPath,
  withConnection,
} from "./instance.ts";
import { normalizeDuckDbType } from "./physical_types.ts";
import { quoteLiteral } from "./_sql/quote.ts";
import type { ParquetDescription } from "./describe.ts";

export type WriteParquetFromCsvOptions = {
  csv: string;
  parquet: string;
  columns?: { name: string; type: LongTableColumnType }[];
  types?: Record<string, string>;
  nullStrings?: string[];
};

const DUCKDB_TYPE: Record<LongTableColumnType, string> = {
  text: "VARCHAR",
  integer: "BIGINT",
  number: "DOUBLE",
};

// CSV to parquet through DuckDB, file to file. `columns` absent means
// DuckDB's inference with `types` as a partial override; present means every
// CSV header must be declared and is read as that type. An empty cell is
// always NULL; `nullStrings` adds to that. The parquet is written beside its
// target under a name this module owns and renamed into place, so a failed
// write leaves nothing and an existing target is replaced whole.
export async function writeParquetFromCsv(
  opts: WriteParquetFromCsvOptions,
): Promise<ParquetDescription> {
  requirePlainPath(opts.csv, "CSV");
  requirePlainPath(opts.parquet, "Parquet");
  if (opts.csv === opts.parquet) {
    throw new Error("The CSV and the parquet are the same path");
  }
  if (opts.columns !== undefined && opts.types !== undefined) {
    throw new Error(
      "`types` is an override of inference; omit it with `columns`",
    );
  }
  await requireFile(opts.csv, "CSV");
  const header = await readCsvHeader(opts.csv);
  const csv = quoteLiteral(opts.csv);
  const nullStrings = [...new Set(["", ...(opts.nullStrings ?? [])])];
  const dialect = [
    "header = true",
    `delim = ${quoteLiteral(header.delimiter)}`,
    `quote = ${quoteLiteral(QUOTE)}`,
    `escape = ${quoteLiteral(QUOTE)}`,
    "skip = 0",
    "comment = ''",
    "allow_quoted_nulls = false",
    `nullstr = [${nullStrings.map(quoteLiteral).join(", ")}]`,
  ].join(", ");
  const partial = `${opts.parquet}.${crypto.randomUUID()}.partial`;
  try {
    const description = await withConnection(async (connection) => {
      const types = opts.columns === undefined
        ? overriddenTypes(
          await sniffedTypes(connection, csv, dialect, header.names),
          opts.types ?? {},
        )
        : declaredTypes(header.names, opts.columns);
      const declaration = header.names
        .map((name) => `${quoteLiteral(name)}: ${quoteLiteral(types[name])}`)
        .join(", ");
      // auto_detect = false is what makes a row of the wrong cell count an
      // error naming the line: with the sniffer on, an explicit dialect is
      // still only its starting point, and it reports a file it cannot sniff
      // as one it could not find a dialect for, naming no line.
      const select =
        `SELECT * FROM read_csv(${csv}, ${dialect}, auto_detect = false, null_padding = false, columns = {${declaration}})`;
      // DuckDB's own temp file is tmp_<name> in the same directory, which
      // would overwrite and consume a parquet of that name.
      const copied = await copying(
        connection.runAndReadAll(
          `COPY (${select}) TO ${
            quoteLiteral(partial)
          } (FORMAT PARQUET, USE_TMP_FILE false)`,
        ),
        opts.csv,
      );
      const rowCount = Number(copied.getRowObjects()[0]?.Count ?? 0);
      const columns = (await describeStatement(
        connection,
        `SELECT * FROM ${readParquet(partial)}`,
      )).map((c) => ({
        name: c.name,
        type: normalizeDuckDbType(c.rawType),
        rawType: c.rawType,
      }));
      return { columns, rowCount };
    });
    await Deno.rename(partial, opts.parquet);
    return description;
  } catch (cause) {
    await Deno.remove(partial).catch(() => {});
    throw cause;
  }
}

// A row whose cell count is not the header's is the caller's to correct, and
// DuckDB's message for it names the line and the row. The lines after the
// counts are its suggestions to pad, to skip or to leave strict mode, none of
// which this function offers, so they are dropped rather than shown to a user
// who cannot act on them.
async function copying<T>(read: Promise<T>, csv: string): Promise<T> {
  try {
    return await read;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!message.includes(CSV_ROW_ERROR)) {
      throw cause;
    }
    const said = message
      .slice(message.indexOf(CSV_ROW_ERROR))
      .split("\n")
      .filter((line) => line.trim().length > 0);
    const suggestions = said.findIndex((l) => l.startsWith(CSV_SUGGESTIONS));
    throw new LongTableValidationError(
      `CSV "${csv}" has a row the header does not fit: ${
        said.slice(0, suggestions === -1 ? said.length : suggestions).join("; ")
      }`,
    );
  }
}

const CSV_ROW_ERROR = "CSV Error on Line:";
const CSV_SUGGESTIONS = "Possible fixes:";

function requireDistinct(names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(foldName(name))) {
      throw new Error(
        `Column "${name}" is declared twice (names are case-insensitive)`,
      );
    }
    seen.add(foldName(name));
  }
}

// DuckDB's types for the file, from the sniffer's sample over the dialect the
// header states. The names it reports are its own; the types are taken by
// position, since the header line is what names the columns. `ignore_errors`
// is what leaves the refusal to the read: without it the sniffer refuses a
// file whose rows are not rectangular with its own message, which names no
// line and says it could not find a dialect it was given.
async function sniffedTypes(
  connection: DuckDBConnection,
  csv: string,
  dialect: string,
  names: string[],
): Promise<Record<string, string>> {
  const sniffed = (await connection.runAndReadAll(
    `SELECT unnest(Columns).type AS type FROM sniff_csv(${csv}, ${dialect}, ignore_errors = true)`,
  )).getRowObjects().map((row) => String(row.type));
  if (sniffed.length !== names.length) {
    throw new Error(
      `CSV header states ${names.length} columns and DuckDB read ${sniffed.length}`,
    );
  }
  return Object.fromEntries(names.map((name, i) => [name, sniffed[i]]));
}

// `types` overrides the sniffer for the columns it names, and naming a column
// the header does not hold is an error: it used to be DuckDB's.
function overriddenTypes(
  sniffed: Record<string, string>,
  types: Record<string, string>,
): Record<string, string> {
  requireDistinct(Object.keys(types));
  const names = Object.keys(sniffed);
  for (const name of Object.keys(types)) {
    if (!Object.hasOwn(sniffed, name)) {
      throw new Error(
        `Column "${name}" given a type is not in the CSV${
          caseHint(name, names)
        }`,
      );
    }
  }
  return { ...sniffed, ...types };
}

// The declared columns and the CSV's headers must be the same names, each
// spelled as the file spells it.
function declaredTypes(
  headers: string[],
  columns: { name: string; type: LongTableColumnType }[],
): Record<string, string> {
  requireDistinct(columns.map((c) => c.name));
  const declared = columns.map((c) => c.name);
  for (const header of headers) {
    if (!declared.includes(header)) {
      throw new Error(
        `CSV column "${header}" is not declared${caseHint(header, declared)}`,
      );
    }
  }
  for (const name of declared) {
    if (!headers.includes(name)) {
      throw new Error(`Declared column "${name}" is not in the CSV`);
    }
  }
  return Object.fromEntries(
    columns.map((c) => [c.name, DUCKDB_TYPE[c.type]]),
  );
}

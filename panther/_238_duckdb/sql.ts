// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  DuckDBTypeId,
  foldName,
  isOutsideSafeRange,
  LongTableValidationError,
  StatementType,
  toLongTableCell,
} from "./deps.ts";
import type {
  DuckDBConnection,
  DuckDBPreparedStatement,
  DuckDBResult,
  DuckDBValue,
  LongTableColumnType,
  LongTableRow,
  SqlColumn,
  SqlRowsResult,
} from "./deps.ts";
import { closeLongTables, closeQuietly, openLongTables } from "./handle.ts";
import type { LongTableOpenOptions } from "./instance.ts";
import { requireCap } from "./reads.ts";
import type { ResolvedLongTable } from "./resolve.ts";

export type LongTableSqlRowsOptions = LongTableOpenOptions & {
  // Required: DuckDB's own default is four fifths of the machine's memory,
  // and the statement is a caller's.
  memoryLimit: string;
  params?: Record<string, string | number | null>;
  maxRows?: number;
  timeoutMs?: number;
};

export const DEFAULT_MAX_SQL_ROWS = 20000;
export const DEFAULT_SQL_TIMEOUT_MS = 30000;

// The classes DuckDB gives a statement its writer got wrong. Over some forty
// wrong statements each message held only the statement's own text, names
// from the tables given and values from them, so it is passed on whole. Any
// other class is the server's: an IO Error names a table's file.
const CALLER_ERROR_CLASSES = [
  "Parser Error",
  "Binder Error",
  "Catalog Error",
  "Conversion Error",
  "Out of Range Error",
  "Invalid Input Error",
  "Permission Error",
];

// The driver's words before a Parser Error met while it splits the text.
const EXTRACT_PREFIX = "Failed to extract statements: ";
const INTERRUPT_CLASS = "INTERRUPT Error";
const OUT_OF_MEMORY_CLASS = "Out of Memory Error";

const COLUMN_TYPES = new Map<DuckDBTypeId, LongTableColumnType>([
  [DuckDBTypeId.TINYINT, "integer"],
  [DuckDBTypeId.SMALLINT, "integer"],
  [DuckDBTypeId.INTEGER, "integer"],
  [DuckDBTypeId.BIGINT, "integer"],
  [DuckDBTypeId.HUGEINT, "integer"],
  [DuckDBTypeId.UTINYINT, "integer"],
  [DuckDBTypeId.USMALLINT, "integer"],
  [DuckDBTypeId.UINTEGER, "integer"],
  [DuckDBTypeId.UBIGINT, "integer"],
  [DuckDBTypeId.UHUGEINT, "integer"],
  [DuckDBTypeId.FLOAT, "number"],
  [DuckDBTypeId.DOUBLE, "number"],
  [DuckDBTypeId.DECIMAL, "number"],
  [DuckDBTypeId.VARCHAR, "text"],
]);

type SelectLimits = {
  params: Record<string, string | number | null>;
  maxRows: number;
  timeoutMs: number;
  memoryLimit: string;
};

// The instance is the call's own and is closed before it returns: a SELECT
// can change the instance it runs on (`enable_logging()` does, under the
// locked configuration), so caller SQL never runs on a handle an app keeps.
export async function getSqlRows(
  tables: Record<string, ResolvedLongTable>,
  sql: string,
  opts: LongTableSqlRowsOptions,
): Promise<SqlRowsResult> {
  if (holdsNoStatement(sql)) {
    throw new LongTableValidationError(
      "The SQL holds no statement; send one SELECT",
    );
  }
  const maxRows = requireCap(opts.maxRows ?? DEFAULT_MAX_SQL_ROWS, "maxRows");
  const timeoutMs = requireCap(
    opts.timeoutMs ?? DEFAULT_SQL_TIMEOUT_MS,
    "timeoutMs",
  );
  const { memoryLimit, threads, tempDirectory } = opts;
  const handle = await openLongTables(tables, {
    memoryLimit,
    threads,
    tempDirectory,
  });
  let result: SqlRowsResult;
  try {
    result = await runSelect(handle.connection, sql, {
      params: opts.params ?? {},
      maxRows,
      timeoutMs,
      memoryLimit,
    });
  } catch (cause) {
    closeQuietly(handle.connection, handle.instance);
    throw cause;
  }
  closeLongTables(handle);
  return result;
}

// The driver answers a text with no statement with its bare "Error in native
// callback", so such a text is refused here, before an instance opens. Block
// comments nest, as DuckDB's do; an unclosed one is left for DuckDB's parser
// to name.
function holdsNoStatement(sql: string): boolean {
  let i = 0;
  while (i < sql.length) {
    if (/[\s;]/.test(sql[i])) {
      i++;
    } else if (sql.startsWith("--", i)) {
      const end = sql.slice(i).search(/[\n\r]/);
      if (end === -1) {
        return true;
      }
      i += end + 1;
    } else if (sql.startsWith("/*", i)) {
      const end = blockCommentEnd(sql, i);
      if (end === undefined) {
        return false;
      }
      i = end;
    } else {
      return false;
    }
  }
  return true;
}

function blockCommentEnd(sql: string, start: number): number | undefined {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql.startsWith("/*", i)) {
      depth++;
      i += 2;
    } else if (sql.startsWith("*/", i)) {
      depth--;
      i += 2;
      if (depth === 0) {
        return i;
      }
    } else {
      i++;
    }
  }
  return undefined;
}

async function runSelect(
  connection: DuckDBConnection,
  sql: string,
  limits: SelectLimits,
): Promise<SqlRowsResult> {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    connection.interrupt();
  }, limits.timeoutMs);
  try {
    const prepared = await prepareSelect(connection, sql);
    bindParams(prepared, limits.params);
    const result = await prepared.stream();
    const columns = readColumns(result);
    const rows = await fetchRows(result, limits.maxRows + 1);
    if (rows.length > limits.maxRows) {
      return { status: "too_many_rows", columns };
    }
    if (rows.length === 0) {
      return { status: "no_data", columns };
    }
    return {
      status: "ok",
      columns,
      rows: rows.map((row) => toRow(row, columns)),
    };
  } catch (cause) {
    throw toCallerError(cause, timedOut, limits);
  } finally {
    clearTimeout(timer);
  }
}

// DuckDB counts the statements and types the one, and preparing it runs
// nothing. A PIVOT with no IN list is two statements: one reads the values
// to pivot on.
async function prepareSelect(
  connection: DuckDBConnection,
  sql: string,
): Promise<DuckDBPreparedStatement> {
  const extracted = await connection.extractStatements(sql);
  if (extracted.count !== 1) {
    throw new LongTableValidationError(
      `The SQL holds ${extracted.count} statements; send one SELECT. A PIVOT with no IN list counts as two: list the values it pivots on with IN (…)`,
    );
  }
  const prepared = await extracted.prepare(0);
  if (prepared.statementType !== StatementType.SELECT) {
    throw new LongTableValidationError(
      `The statement is ${
        StatementType[prepared.statementType].replaceAll("_", " ")
      }; only a SELECT is run`,
    );
  }
  return prepared;
}

// The names given must be exactly the statement's, so a misspelled one is
// named rather than left unbound or ignored. A whole number binds as BIGINT,
// so it reads back as an integer where the statement gives it no type
// (`SELECT $n`); any other number binds as DOUBLE.
function bindParams(
  prepared: DuckDBPreparedStatement,
  params: Record<string, string | number | null>,
): void {
  const names = Array.from(
    { length: prepared.parameterCount },
    (_, i) => prepared.parameterName(i + 1),
  );
  const missing = names.filter((name) => !Object.hasOwn(params, name));
  const unknown = Object.keys(params).filter((name) => !names.includes(name));
  const faults = [
    ...(missing.length > 0
      ? [`no value is given for ${listParameters(missing)}`]
      : []),
    ...(unknown.length > 0
      ? [`the statement has no ${listParameters(unknown)}`]
      : []),
  ];
  if (faults.length > 0) {
    throw new LongTableValidationError(`Parameters: ${faults.join("; ")}`);
  }
  names.forEach((name, i) => {
    const value = params[name];
    if (value === null) {
      prepared.bindNull(i + 1);
    } else if (typeof value === "string") {
      prepared.bindVarchar(i + 1, value);
    } else if (Number.isSafeInteger(value)) {
      prepared.bindBigInt(i + 1, BigInt(value));
    } else {
      prepared.bindDouble(i + 1, value);
    }
  });
}

function listParameters(names: string[]): string {
  return names.map((name) => `$${name}`).join(", ");
}

// Read from the result, not the prepared statement: before binding, a
// column built from a parameter has no type. Every other type is refused for
// a cast in the SELECT, so a text cell is always DuckDB's own cast, under the
// session's UTC, and panther formats nothing.
function readColumns(result: DuckDBResult): SqlColumn[] {
  const seen = new Map<string, string>();
  return Array.from({ length: result.columnCount }, (_, i) => {
    const name = result.columnName(i);
    const other = seen.get(foldName(name));
    if (other !== undefined) {
      throw new LongTableValidationError(
        other === name
          ? `Column "${name}" appears twice in the result; give each column its own name with AS`
          : `Columns "${other}" and "${name}" differ only in case; give each column its own name with AS`,
      );
    }
    seen.set(foldName(name), name);
    const duckDbType = result.columnType(i);
    const rawType = duckDbType.toString();
    const type = COLUMN_TYPES.get(duckDbType.typeId);
    if (type === undefined) {
      throw new LongTableValidationError(
        `Column "${name}" is ${rawType}, which is neither a number nor text; cast it in the SELECT, as CAST(… AS VARCHAR)`,
      );
    }
    return { name, type, rawType };
  });
}

// Stops once `limit` rows have arrived, so a result past the cap is never
// fetched whole.
async function fetchRows(
  result: DuckDBResult,
  limit: number,
): Promise<DuckDBValue[][]> {
  const rows: DuckDBValue[][] = [];
  while (rows.length < limit) {
    const chunk = await result.fetchChunk();
    if (chunk === null || chunk.rowCount === 0) {
      break;
    }
    rows.push(...chunk.getRows().slice(0, limit - rows.length));
  }
  return rows;
}

function toRow(values: DuckDBValue[], columns: SqlColumn[]): LongTableRow {
  return Object.fromEntries(
    columns.map((column, i) => [column.name, toSqlCell(values[i], column)]),
  );
}

// Refused, never rounded: an id past 2^53 would read back as another id.
function toSqlCell(
  value: DuckDBValue,
  column: SqlColumn,
): string | number | null {
  if (typeof value === "bigint" && isOutsideSafeRange(value)) {
    throw new LongTableValidationError(
      `Column "${column.name}" holds ${value}, outside the safe integer range; cast it to DOUBLE, or to VARCHAR when it is an id`,
    );
  }
  return toLongTableCell(value, column.name);
}

// A refusal of the statement's writer stays as it is. DuckDB's own Out of
// Memory and interrupt messages suggest settings the writer cannot change,
// so those two are refused in panther's words.
function toCallerError(
  cause: unknown,
  timedOut: boolean,
  limits: SelectLimits,
): unknown {
  if (!(cause instanceof Error) || cause instanceof LongTableValidationError) {
    return cause;
  }
  const message = cause.message.startsWith(EXTRACT_PREFIX)
    ? cause.message.slice(EXTRACT_PREFIX.length)
    : cause.message;
  if (timedOut && message.startsWith(INTERRUPT_CLASS)) {
    return new LongTableValidationError(
      `The statement did not finish within ${limits.timeoutMs} ms; aggregate or filter so it reads less`,
    );
  }
  if (message.startsWith(OUT_OF_MEMORY_CLASS)) {
    return new LongTableValidationError(
      `The statement needs more than the ${limits.memoryLimit} of memory it may use; aggregate or filter so it holds less`,
    );
  }
  if (CALLER_ERROR_CLASSES.some((c) => message.startsWith(`${c}:`))) {
    return new LongTableValidationError(message);
  }
  return cause;
}

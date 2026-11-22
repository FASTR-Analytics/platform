// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { foldName, hasControlCharacter } from "./deps.ts";
import type { DuckDBConnection, DuckDBInstance } from "./deps.ts";
import { createInstance, lockDown } from "./instance.ts";
import type { LongTableOpenOptions } from "./instance.ts";
import type { ResolvedLongTable } from "./resolve.ts";
import { quoteIdentifier } from "./_sql/quote.ts";

export type LongTablesHandle = {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
  tables: Readonly<Record<string, ResolvedLongTable>>;
};

export async function openLongTables(
  tables: Record<string, ResolvedLongTable>,
  opts: LongTableOpenOptions = {},
): Promise<LongTablesHandle> {
  const entries = Object.entries(tables);
  validateTableNames(entries.map(([name]) => name));
  const instance = await createInstance(opts);
  let connection: DuckDBConnection | undefined;
  try {
    connection = await instance.connect();
    await lockDown(connection, entries.flatMap(([, table]) => table.files));
    for (const [name, table] of entries) {
      await connection.run(
        `CREATE VIEW ${quoteIdentifier(name)} AS ${table.select}`,
      );
    }
    // Nothing the open set may be changed afterwards: without this a holder
    // of the connection could raise the memory limit or the thread count.
    await connection.run("SET lock_configuration = true");
  } catch (cause) {
    closeQuietly(connection, instance);
    throw cause;
  }
  return { instance, connection, tables: Object.fromEntries(entries) };
}

export function closeLongTables(handle: LongTablesHandle): void {
  handle.connection.closeSync();
  handle.instance.closeSync();
}

// A table name is the app's, so a bad one is a plain Error. Names are unique
// under DuckDB's own fold, which refuses a view named `Ghed` beside `ghed`.
function validateTableNames(names: string[]): void {
  const seen = new Map<string, string>();
  for (const name of names) {
    if (name.length === 0) {
      throw new Error("A table name is empty");
    }
    if (hasControlCharacter(name)) {
      throw new Error(
        `Table name ${JSON.stringify(name)} has a control character`,
      );
    }
    const other = seen.get(foldName(name));
    if (other !== undefined) {
      throw new Error(
        `Table names "${other}" and "${name}" differ only in case`,
      );
    }
    seen.set(foldName(name), name);
  }
}

// The original failure is the one to report, so a close that throws on the
// way out is dropped; the instance is closed even when the connection's
// close fails.
function closeQuietly(
  connection: DuckDBConnection | undefined,
  instance: DuckDBInstance,
): void {
  try {
    connection?.closeSync();
  } catch {
    // dropped: see above
  }
  try {
    instance.closeSync();
  } catch {
    // dropped: see above
  }
}

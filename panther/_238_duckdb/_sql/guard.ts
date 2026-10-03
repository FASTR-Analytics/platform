// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The check every emitted query passes before it runs. A double-quoted
// identifier may hold anything (a column named "children's visits" is an
// ordinary CSV header), so it is skipped; every single-quoted literal must be
// one the plan registered; and nothing outside quotes may start a second
// statement, a comment or a dollar-quoted string, the three ways text could
// change the query without a single quote. With every query-owned string a
// bind or a quoted identifier this never fires: it is the assertion that the
// builders kept to that.
export function assertSqlShape(
  sql: string,
  registeredLiterals: readonly string[],
): void {
  const registered = new Set(registeredLiterals);
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '"' || ch === "'") {
      const end = closingQuote(sql, i, ch);
      if (ch === "'" && !registered.has(sql.slice(i, end + 1))) {
        throw new Error(
          "Emitted SQL holds a literal the plan did not register",
        );
      }
      i = end + 1;
      continue;
    }
    const next = sql[i + 1];
    if (
      ch === ";" || (ch === "-" && next === "-") ||
      (ch === "/" && next === "*") ||
      (ch === "$" && !(next !== undefined && next >= "0" && next <= "9"))
    ) {
      throw new Error(
        `Emitted SQL holds ${JSON.stringify(ch + (next ?? ""))} outside quotes`,
      );
    }
    i++;
  }
}

// The index of the quote that closes the one at `start`; a doubled quote
// inside is the escape and does not close.
function closingQuote(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] !== quote) {
        return i;
      }
      i++;
    }
    i++;
  }
  throw new Error("Emitted SQL holds an unterminated quote");
}

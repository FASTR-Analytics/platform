// =============================================================================
// DATA TRANSFORM: HFA indicator code, R list syntax to the language's
// =============================================================================
//
// Tables:   hfa_indicator_code (r_code, r_filter_code),
//           hfa_indicator_variant_code (r_code)
//
// Stored code was written as R, and its one construct the language spells
// differently is the list test: `x %in% c(1, 2)` becomes `x IN (1, 2)`. The
// other R it used (`&`, `|`, `!`, comparisons, arithmetic, quoted text) is
// already the language. Text inside quotes is never rewritten.
//
// A rewritten row holds no `%in% c(`, so the forward rewrite is idempotent.
// The reverse direction exists for a rollback to an image that reads R: it
// turns every `IN (` back into `%in% c(`, which gives a row this rewrote its
// R back with the spacing around `%in% c(` normalised.
//
// =============================================================================

import type { Sql } from "postgres";
import { describeHfaCodeError, parseHfaIndicatorCode } from "lib";

export type HfaListSyntax = "r" | "language";

const LIST_OPENER: Record<HfaListSyntax, { pattern: RegExp; text: string }> = {
  r: { pattern: /\s*%in%\s*c\s*\(/g, text: " %in% c(" },
  language: { pattern: /\s*\bIN\s*\(/gi, text: " IN (" },
};

export function rewriteHfaListSyntax(
  source: string,
  from: HfaListSyntax,
  to: HfaListSyntax,
): string {
  const { pattern } = LIST_OPENER[from];
  const { text } = LIST_OPENER[to];
  return source
    .split(/("[^"]*"|'[^']*')/)
    .map((segment) =>
      segment.startsWith('"') || segment.startsWith("'")
        ? segment
        : segment.replace(pattern, text)
    )
    .join("");
}

type CodeRow = {
  table: "hfa_indicator_code" | "hfa_indicator_variant_code";
  column: "r_code" | "r_filter_code";
  indicatorId: string;
  timePoint: string;
  itemId: string | null;
  code: string;
};

export async function migrateHfaCodeToLanguageLists(tx: Sql): Promise<void> {
  const codeRows = await tx<
    {
      indicator_id: string;
      time_point: string;
      r_code: string;
      r_filter_code: string | null;
    }[]
  >`
    SELECT indicator_id, time_point, r_code, r_filter_code
    FROM hfa_indicator_code
  `;
  const variantRows = await tx<
    {
      indicator_id: string;
      time_point: string;
      item_id: string;
      r_code: string;
    }[]
  >`
    SELECT indicator_id, time_point, item_id, r_code
    FROM hfa_indicator_variant_code
  `;

  const rows: CodeRow[] = [
    ...codeRows.flatMap((r): CodeRow[] => [
      {
        table: "hfa_indicator_code",
        column: "r_code",
        indicatorId: r.indicator_id,
        timePoint: r.time_point,
        itemId: null,
        code: r.r_code,
      },
      ...(r.r_filter_code === null ? [] : [{
        table: "hfa_indicator_code" as const,
        column: "r_filter_code" as const,
        indicatorId: r.indicator_id,
        timePoint: r.time_point,
        itemId: null,
        code: r.r_filter_code,
      }]),
    ]),
    ...variantRows.map((r): CodeRow => ({
      table: "hfa_indicator_variant_code",
      column: "r_code",
      indicatorId: r.indicator_id,
      timePoint: r.time_point,
      itemId: r.item_id,
      code: r.r_code,
    })),
  ];

  let rewritten = 0;
  for (const row of rows) {
    const code = rewriteHfaListSyntax(row.code, "r", "language");
    if (code !== row.code) {
      rewritten++;
      await writeCode(tx, row, code);
    }
    if (!code.trim()) continue;
    const parsed = parseHfaIndicatorCode(code);
    if (!parsed.ok) {
      console.log(
        `  [hfa-code] still fails: ${row.table}.${row.column} indicator ${row.indicatorId}, round ${row.timePoint}${
          row.itemId === null ? "" : `, item ${row.itemId}`
        }: ${parsed.error.kind} (${describeHfaCodeError(parsed.error).en})`,
      );
    }
  }
  console.log(
    `  [hfa-code] ${rewritten} of ${rows.length} code fields rewritten`,
  );
}

async function writeCode(tx: Sql, row: CodeRow, code: string): Promise<void> {
  if (row.table === "hfa_indicator_variant_code") {
    await tx`
      UPDATE hfa_indicator_variant_code SET r_code = ${code}
      WHERE indicator_id = ${row.indicatorId} AND time_point = ${row.timePoint}
        AND item_id = ${row.itemId}
    `;
  } else if (row.column === "r_code") {
    await tx`
      UPDATE hfa_indicator_code SET r_code = ${code}
      WHERE indicator_id = ${row.indicatorId} AND time_point = ${row.timePoint}
    `;
  } else {
    await tx`
      UPDATE hfa_indicator_code SET r_filter_code = ${code}
      WHERE indicator_id = ${row.indicatorId} AND time_point = ${row.timePoint}
    `;
  }
}

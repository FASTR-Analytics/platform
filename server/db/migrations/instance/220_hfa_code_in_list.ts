// Migration 220: stored HFA indicator code moves from R's list test to the
// expression language's. The code was written as R, and its one construct the
// language spells differently is `x %in% c(1, 2)`, which becomes
// `x IN (1, 2)`. The rest (`&`, `|`, `!`, comparisons, arithmetic, quoted
// text) is already the language. Text inside quotes is never rewritten.
//
// A rewritten row holds no `%in% c(`, so the rewrite is idempotent. The
// reverse direction exists for a rollback to an image that reads R: it turns
// every `IN (` back into `%in% c(`, which gives a row this rewrote its R back
// with the spacing around `%in% c(` normalised.
//
// Rows that still do not parse afterwards are logged and left as they are;
// the editor shows their error. Every indicator whose code changed has its
// `updated_at` bumped, since that is what moves `hfaIndicatorsVersion`.

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

type CodeField = {
  label: string;
  indicatorId: string;
  timePoint: string;
  itemId: string;
  code: string;
};

export async function hfaCodeInList(tx: Sql): Promise<void> {
  // A fresh database loads a base schema whose columns 223 has already
  // renamed, and the code there is already the language.
  const [{ hasRCode }] = await tx<{ hasRCode: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'hfa_indicator_code' AND column_name = 'r_code'
    ) AS "hasRCode"
  `;
  if (!hasRCode) return;

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

  const codeFields = codeRows.map((r): CodeField => ({
    label: "hfa_indicator_code.r_code",
    indicatorId: r.indicator_id,
    timePoint: r.time_point,
    itemId: "",
    code: r.r_code,
  }));
  const filterFields = codeRows.flatMap((r): CodeField[] =>
    r.r_filter_code === null ? [] : [{
      label: "hfa_indicator_code.r_filter_code",
      indicatorId: r.indicator_id,
      timePoint: r.time_point,
      itemId: "",
      code: r.r_filter_code,
    }]
  );
  const variantFields = variantRows.map((r): CodeField => ({
    label: "hfa_indicator_variant_code.r_code",
    indicatorId: r.indicator_id,
    timePoint: r.time_point,
    itemId: r.item_id,
    code: r.r_code,
  }));

  const code = rewritten(codeFields);
  const filter = rewritten(filterFields);
  const variant = rewritten(variantFields);

  if (code.length > 0) {
    await tx`
      UPDATE hfa_indicator_code AS t SET r_code = u.code
      FROM unnest(
        ${code.map((f) => f.indicatorId)}::text[],
        ${code.map((f) => f.timePoint)}::text[],
        ${code.map((f) => f.code)}::text[]
      ) AS u(indicator_id, time_point, code)
      WHERE t.indicator_id = u.indicator_id AND t.time_point = u.time_point
    `;
  }
  if (filter.length > 0) {
    await tx`
      UPDATE hfa_indicator_code AS t SET r_filter_code = u.code
      FROM unnest(
        ${filter.map((f) => f.indicatorId)}::text[],
        ${filter.map((f) => f.timePoint)}::text[],
        ${filter.map((f) => f.code)}::text[]
      ) AS u(indicator_id, time_point, code)
      WHERE t.indicator_id = u.indicator_id AND t.time_point = u.time_point
    `;
  }
  if (variant.length > 0) {
    await tx`
      UPDATE hfa_indicator_variant_code AS t SET r_code = u.code
      FROM unnest(
        ${variant.map((f) => f.indicatorId)}::text[],
        ${variant.map((f) => f.timePoint)}::text[],
        ${variant.map((f) => f.itemId)}::text[],
        ${variant.map((f) => f.code)}::text[]
      ) AS u(indicator_id, time_point, item_id, code)
      WHERE t.indicator_id = u.indicator_id AND t.time_point = u.time_point
        AND t.item_id = u.item_id
    `;
  }

  const changedIndicatorIds = [
    ...new Set([...code, ...filter, ...variant].map((f) => f.indicatorId)),
  ];
  if (changedIndicatorIds.length > 0) {
    await tx`
      UPDATE hfa_indicators SET updated_at = CURRENT_TIMESTAMP
      WHERE indicator_id = ANY(${changedIndicatorIds}::text[])
    `;
  }

  const fields = [...codeFields, ...filterFields, ...variantFields];
  for (const field of fields) {
    const source = rewriteHfaListSyntax(field.code, "r", "language");
    if (!source.trim()) continue;
    const parsed = parseHfaIndicatorCode(source);
    if (!parsed.ok) {
      console.log(
        `  [hfa-code] still fails: ${field.label} indicator ${field.indicatorId}, round ${field.timePoint}${
          field.itemId ? `, item ${field.itemId}` : ""
        }: ${parsed.error.kind} (${describeHfaCodeError(parsed.error).en})`,
      );
    }
  }
  console.log(
    `  [hfa-code] ${
      code.length + filter.length + variant.length
    } of ${fields.length} code fields rewritten, ${changedIndicatorIds.length} indicators`,
  );
}

function rewritten(fields: CodeField[]): CodeField[] {
  return fields.flatMap((field) => {
    const code = rewriteHfaListSyntax(field.code, "r", "language");
    return code === field.code ? [] : [{ ...field, code }];
  });
}

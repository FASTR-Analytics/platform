// Migration 215: a CSV structure attempt stores its step-1 result as the CSV
// details themselves. An attempt stored while step 1 also took an XLSForm
// holds them under `csv`, which this unwraps.

import type { Sql } from "postgres";

export async function structureAttemptCsvDetails(tx: Sql): Promise<void> {
  const rows = await tx<{ slot: string; step_1_result: string }[]>`
    SELECT slot, step_1_result FROM structure_upload_attempts
    WHERE source_type = 'csv' AND step_1_result IS NOT NULL
  `;
  for (const row of rows) {
    const parsed: unknown = JSON.parse(row.step_1_result);
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    ) {
      throw new Error(
        `structure_upload_attempts ${row.slot} step_1_result is not an object`,
      );
    }
    if (!("csv" in parsed)) {
      continue;
    }
    await tx`
      UPDATE structure_upload_attempts
      SET step_1_result = ${JSON.stringify(parsed.csv)}
      WHERE slot = ${row.slot}
    `;
  }
}

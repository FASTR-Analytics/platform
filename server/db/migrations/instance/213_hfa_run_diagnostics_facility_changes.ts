// Migration 213: the HFA data import now writes the facility registry from
// its own file. Stored run diagnostics lose the facility-not-found counter and
// its sample, which no import produces any more. Stored launch configs gain
// the facility mapping fields every config now carries, empty for runs
// launched before them. A run held for review is cancelled, since its staging
// predates the facility columns, and its staging tables are dropped.

import type { Sql } from "postgres";

const SUPERSEDED_MESSAGE =
  "Cancelled by the release in which HFA imports read facilities from the data file. Start the import again.";

function legacyStagingTables(runId: number): string[] {
  return [
    `uploaded_hfa_staging_raw_run_${runId}`,
    `uploaded_hfa_staging_validfac_run_${runId}`,
    `uploaded_hfa_staging_keeprows_run_${runId}`,
    `uploaded_hfa_data_staging_ready_for_integration_run_${runId}`,
    `uploaded_hfa_dictionary_vars_staging_run_${runId}`,
    `uploaded_hfa_dictionary_values_staging_run_${runId}`,
  ];
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

export async function hfaRunDiagnosticsFacilityChanges(tx: Sql): Promise<void> {
  const rows = await tx<
    {
      id: number;
      status: string;
      csv_config: string;
      diagnostics: string | null;
    }[]
  >`
    SELECT id, status, csv_config, diagnostics FROM hfa_import_runs ORDER BY id
  `;
  for (const row of rows) {
    const config = asObject(
      JSON.parse(row.csv_config),
      `hfa_import_runs ${row.id} csv_config`,
    );
    const mappings = asObject(
      config.mappings,
      `hfa_import_runs ${row.id} csv_config.mappings`,
    );
    const configChanged = !("facilityColumns" in mappings);
    if (configChanged) {
      mappings.facilityColumns = {
        adminArea1: { value: "" },
        adminAreas: [],
        optional: {},
      };
      mappings.facilityChanges = [];
      mappings.recodes = {};
    }

    let diagnostics = row.diagnostics;
    if (row.diagnostics !== null) {
      const parsed = asObject(
        JSON.parse(row.diagnostics),
        `hfa_import_runs ${row.id} diagnostics`,
      );
      if (
        "nRowsInvalidFacilityNotFound" in parsed ||
        "facilityNotFoundSample" in parsed
      ) {
        delete parsed.nRowsInvalidFacilityNotFound;
        delete parsed.facilityNotFoundSample;
        diagnostics = JSON.stringify(parsed);
      }
    }

    if (configChanged || diagnostics !== row.diagnostics) {
      await tx`
        UPDATE hfa_import_runs
        SET csv_config = ${JSON.stringify(config)}, diagnostics = ${diagnostics}
        WHERE id = ${row.id}
      `;
    }

    const held = row.status === "needs_review";
    if (held) {
      await tx`
        UPDATE hfa_import_runs
        SET status = 'cancelled', ended_at = now(), progress = NULL,
          error = ${SUPERSEDED_MESSAGE}
        WHERE id = ${row.id}
      `;
    }
    // A run still marked running is swept at boot by the current table
    // names, which no longer include the facility-check table.
    const tables = held
      ? legacyStagingTables(row.id)
      : row.status === "running"
      ? [`uploaded_hfa_staging_validfac_run_${row.id}`]
      : [];
    for (const table of tables) {
      await tx`DROP TABLE IF EXISTS ${tx(table)}`;
    }
  }
}

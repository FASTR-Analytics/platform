// Maps Postgres information_schema data_type values (the ro_* / facilities
// column types) to the DuckDB types the parquet query store uses. NUMERIC maps
// to DOUBLE by decision (PLAN_RESULTS_RUNS §3.3 — 69/69 prod configs matched
// Postgres to 2.0e-15 relative error). Anything outside this closed set (dates,
// timestamps, json, arrays) is verified absent from the results surface and
// throws rather than guessing.
export function duckDbTypeForPgType(pgDataType: string): string {
  switch (pgDataType) {
    case "smallint":
      return "SMALLINT";
    case "integer":
      return "INTEGER";
    case "bigint":
      return "BIGINT";
    case "numeric":
    case "double precision":
    case "real":
      return "DOUBLE";
    case "text":
    case "character varying":
      return "VARCHAR";
    case "boolean":
      return "BOOLEAN";
    default:
      throw new Error(`No DuckDB type mapping for Postgres type: ${pgDataType}`);
  }
}

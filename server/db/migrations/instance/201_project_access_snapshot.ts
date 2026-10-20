// Migration 201_project_access_snapshot: record, before 202 drops the
// project layer, who may open each consolidated product. Registered in
// TS_MIGRATIONS (server/db/migrations/runner.ts); the body is
// ../consolidation/access.ts, and 216_legacy_product_access applies it.
export { snapshotProjectAccess } from "../consolidation/access.ts";

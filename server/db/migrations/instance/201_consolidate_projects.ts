// Migration 201: consolidate the per-project databases into the products
// tables. Registered in TS_MIGRATIONS (server/db/migrations/runner.ts); the
// body is ../consolidation/execute.ts.
export { consolidateProjects } from "../consolidation/execute.ts";

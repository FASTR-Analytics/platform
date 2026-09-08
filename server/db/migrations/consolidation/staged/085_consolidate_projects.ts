// Migration 085: consolidate the per-project databases into the products
// tables. Staged here until PLAN_PRODUCTS_RESTRUCTURE step 9b moves it into
// ../../instance/ and registers it in TS_MIGRATIONS
// (server/db/migrations/runner.ts). The body is ../execute.ts.
export { consolidateProjects } from "../execute.ts";

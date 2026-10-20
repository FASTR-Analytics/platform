// Migration 217_legacy_user_scopes: restrict the users whose projects were all
// held to one zone to that zone's scope, from what 201_project_access_snapshot
// recorded. Registered in TS_MIGRATIONS (server/db/migrations/runner.ts); the
// body is ../consolidation/user_scopes.ts.
export { applyLegacyUserScopes } from "../consolidation/user_scopes.ts";

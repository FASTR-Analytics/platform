import type { Context } from "hono";
import { routeRegistry } from "lib";

// Deny-by-default route allowlist for the /pat mount
// (REVIEW_MCP_HOST_ARCHITECTURE.md §8): a personal access token can reach
// exactly the routes the headless MCP host needs — the AI-Assistant read
// tools + create_report, SSE hydration, a whoami, and the /info reference
// docs. A route added next year is PAT-closed until opted in here. Token
// mint/list/revoke and user/admin routes are deliberately absent: a PAT can
// never mint or revoke PATs.
//
// NEVER allowlist any backups route: server/routes/instance/backups.ts
// forwards the raw incoming Authorization header off-instance (to
// status-api.fastr-analytics.org), which would ship the user's PAT to an
// external service.
const PAT_ALLOWED_ROUTE_NAMES = [
  // getCurrentUser: not called by the host or lib tools — it is the parity
  // test's whoami probe (server/tests/pat_identity_parity_test.ts) and grants
  // only the caller's own identity.
  "getCurrentUser",
  "getPresentationObjectItems",
  "getResultsValueInfoForPresentationObject",
  "getPresentationObjectDetail",
  "getReplicantOptions",
  "getSlide",
  // Module script/logs: the PROJECT-scoped attached-package routes (no runId
  // in the path — the server resolves projects.run_id; per-project
  // can_view_script_code / can_view_logs gates). The instance-wide run-keyed
  // routes (getRunModuleScript/getRunModuleLogs) are deliberately NOT
  // allowlisted: they would give a leaked PAT every run in the instance.
  "getAttachedPackageModuleScript",
  "getAttachedPackageModuleLogs",
  "getModuleWithConfigSelections",
  "getReportDetail",
  "createReport",
  "updateReportBody",
] as const satisfies readonly (keyof typeof routeRegistry)[];

// Non-registry paths the host also needs: the SSE hydration streams and the
// /info markdown docs (served by the pat app's static handler).
const PAT_ALLOWED_RAW: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/instance_updates$/ },
  { method: "GET", pattern: /^\/project_sse_v2\/[^/]+$/ },
  { method: "GET", pattern: /^\/info\/[A-Za-z0-9_-]+\.md$/ },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS: { method: string; pattern: RegExp }[] = [
  ...PAT_ALLOWED_ROUTE_NAMES.map((name) => {
    const route = routeRegistry[name];
    return {
      method: route.method.toUpperCase(),
      pattern: new RegExp(
        "^" + route.path.split(/:\w+/).map(escapeRegExp).join("[^/]+") + "$",
      ),
    };
  }),
  ...PAT_ALLOWED_RAW,
];

export async function patRouteAllowlist(
  c: Context,
  next: () => Promise<void>,
): Promise<Response | void> {
  // c.req.path carries the full original path including the /pat mount prefix.
  const path = c.req.path.replace(/^\/pat(?=\/|$)/, "");
  const method = c.req.method.toUpperCase();
  const allowed = MATCHERS.some(
    (m) => m.method === method && m.pattern.test(path),
  );
  if (!allowed) {
    c.status(403);
    return c.json({
      success: false,
      err: "This route is not available with personal access token auth",
    });
  }
  await next();
}

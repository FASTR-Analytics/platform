import type { Context } from "hono";
import { routeRegistry } from "lib";

// Deny-by-default route allowlist for the internal headless app
// (REVIEW_MCP_HOST_ARCHITECTURE.md §8; public mount retired by PLAN_112 D5 —
// the /mcp endpoint dispatches into headlessApp in-process): a headless
// credential can reach exactly the routes the /mcp tools need — the
// AI-Assistant read tools + create_report, a whoami, the projects listing, and
// the /info reference docs. A route added next year is headless-closed until
// opted in here. Token mint/list/revoke and user/admin routes are deliberately
// absent: a headless caller can never mint or revoke PATs.
//
// NEVER allowlist any backups route: server/routes/instance/backups.ts
// forwards the raw incoming Authorization header off-instance (to
// status-api.fastr-analytics.org), which would ship the user's credential to
// an external service.
const HEADLESS_ALLOWED_ROUTE_NAMES = [
  // getCurrentUser: not called by the host or lib tools — it is the parity
  // test's whoami probe (server/tests/pat_identity_parity_test.ts) and grants
  // only the caller's own identity.
  "getCurrentUser",
  // The /mcp get_projects tool + orientation (PLAN_112): the caller's own
  // accessible projects only.
  "getProjectsForUser",
  "getPresentationObjectItems",
  "getResultsValueInfoForPresentationObject",
  "getPresentationObjectDetail",
  "getReplicantOptions",
  "getSlide",
  // Module script/logs: the run-keyed package reads under the instance data
  // bits (Tim's ruling 2026-08-18 — reads mounted once). A leaked credential
  // reaches exactly what its user's own can_view_data / can_view_logs already
  // reach in the UI; the AI tools resolve the runId from the project's
  // attached package at call time, never from the model.
  "getRunModuleScript",
  "getRunModuleLogs",
  "getModuleWithConfigSelections",
  "getReportDetail",
  "createReport",
  "updateReportBody",
] as const satisfies readonly (keyof typeof routeRegistry)[];

// Non-registry paths: the /info markdown docs (served by the headless app's
// static handler). The SSE hydration patterns died with the local MCP host
// (PLAN_112 D5) — the /mcp endpoint builds state server-side.
const HEADLESS_ALLOWED_RAW: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/info\/[A-Za-z0-9_-]+\.md$/ },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS: { method: string; pattern: RegExp }[] = [
  ...HEADLESS_ALLOWED_ROUTE_NAMES.map((name) => {
    const route = routeRegistry[name];
    return {
      method: route.method.toUpperCase(),
      pattern: new RegExp(
        "^" + route.path.split(/:\w+/).map(escapeRegExp).join("[^/]+") + "$",
      ),
    };
  }),
  ...HEADLESS_ALLOWED_RAW,
];

export async function headlessRouteAllowlist(
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
      err: "This route is not available with headless credential auth",
    });
  }
  await next();
}

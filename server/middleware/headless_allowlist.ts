import type { Context } from "hono";
import { routeRegistry } from "lib";

// Deny-by-default route allowlist for the internal headless app
// (REVIEW_MCP_HOST_ARCHITECTURE.md §8; public mount retired by PLAN_112 D5 —
// the /mcp endpoint dispatches into headlessApp in-process): a headless
// credential can reach exactly the routes the /mcp tools need — the
// run-keyed package reads (all read-only, all under the instance data bits),
// a whoami, and the /info reference docs. A route added next year is
// headless-closed until opted in here. Token mint/list/revoke and user/admin
// routes are deliberately absent: a headless caller can never mint or revoke
// PATs.
//
// NEVER allowlist any backups route: server/routes/instance/backups.ts
// forwards the raw incoming Authorization header off-instance (to
// status-api.fastr-analytics.org), which would ship the user's credential to
// an external service.
const HEADLESS_ALLOWED_ROUTE_NAMES = [
  // getCurrentUser: not called by the lib tools — it is the parity test's
  // whoami probe (server/tests/pat_identity_parity_test.ts) and grants only
  // the caller's own identity.
  "getCurrentUser",
  // The run-keyed package reads (S8 "one core, two lenses"; Tim's ruling
  // 2026-08-18 — what a package contains is a function of the runId alone,
  // gated on instance can_view_data / can_view_logs). A leaked credential
  // reaches exactly what its user's own instance bits already reach in the
  // UI; the /mcp tools resolve the runId from the instance's pin at call
  // time, never from the model.
  "getRunPresentationObjectItems",
  "getRunResultsValueInfo",
  "getRunModuleScript",
  "getRunModuleLogs",
  "getRunModuleWithConfigSelections",
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

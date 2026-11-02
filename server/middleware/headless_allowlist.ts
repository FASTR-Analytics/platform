import type { Context } from "hono";
import { routeRegistry } from "lib";

// Deny-by-default route allowlist for the internal headless app (the /mcp
// endpoint dispatches into headlessApp in-process): a headless credential
// reaches exactly the registry entries declaring `headless: true` (the
// run-keyed package reads the /mcp tools need, read-only and gated on an
// approved user and the scope grant, plus the whoami probe) and the /info
// reference docs. A route added next year is headless-closed until its entry
// opts in. Token mint/list/revoke and user/admin routes carry no flag: a
// headless caller can never mint or revoke PATs.
export const HEADLESS_ROUTE_NAMES = Object.entries(routeRegistry)
  .filter(([, entry]) => entry.headless)
  .map(([name]) => name as keyof typeof routeRegistry);

// Non-registry paths: the /info markdown docs (served by the headless app's
// static handler).
const HEADLESS_ALLOWED_RAW: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/info\/[A-Za-z0-9_-]+\.md$/ },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS: { method: string; pattern: RegExp }[] = [
  ...HEADLESS_ROUTE_NAMES.map((name) => {
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
  const path = c.req.path;
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

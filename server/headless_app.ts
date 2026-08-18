import { Hono } from "hono";
import { routeRegistry } from "lib";
import { HEADLESS_ALLOWED_ROUTE_NAMES } from "./middleware/headless_allowlist.ts";
import {
  headlessAuthMiddleware,
  headlessRouteAllowlist,
} from "./middleware/mod.ts";
import { routesRunGeneration } from "./routes/instance/run_generation.ts";
import { routesUsers } from "./routes/instance/users.ts";

// The headless app (REVIEW_MCP_HOST_ARCHITECTURE.md §8, retired as a public
// mount by PLAN_112 D5): headless-credential-only auth + deny-by-default route
// allowlist. Since the /mcp endpoint replaced the local MCP host, this app is
// INTERNAL plumbing — the /mcp context builds per-principal server actions
// whose fetchImpl dispatches into it via headlessAppFetch below, so every tool
// call runs the full headless middleware chain (credential verify, allowlist,
// permissions, logging) exactly as a network caller would. Handlers are
// auth-agnostic (they read context set by getGlobalUser), so identity parity
// with the cookie mount is structural (pinned by
// server/tests/pat_identity_parity).
//
// Only the route FILES containing allowlisted routes are registered — the
// allowlist (middleware/headless_allowlist.ts) remains the authority on which
// individual routes a headless caller can reach. Since 2026-08-19 those are
// the run-keyed package reads (routes/instance/run_generation.ts) and the
// whoami; the project route files are gone from this mount with the
// project-scoped /mcp surface.
export const headlessApp = new Hono();
//@ts-ignore - middleware typed loosely, same as authMiddleware in main.ts
headlessApp.use("*", headlessAuthMiddleware);
headlessApp.use("*", headlessRouteAllowlist);
headlessApp.route("/", routesUsers);
headlessApp.route("/", routesRunGeneration);
// The /info reference docs (get_info tool): same files the SPA fetches from
// its origin, served from the built client (dev fallback: the source dir).
headlessApp.get("/info/:file{[A-Za-z0-9_-]+\\.md}", async (c) => {
  const file = c.req.param("file");
  for (const dir of ["./client_dist/info", "./client/public/info"]) {
    try {
      const content = await Deno.readTextFile(`${dir}/${file}`);
      return c.text(content);
    } catch {
      // try the next location
    }
  }
  return c.notFound();
});

// In-process dispatch entry (PLAN_112 D4): the ServerActionTransport.fetchImpl
// the /mcp context cache installs. headlessApp.request paths carry no /pat
// prefix (the allowlist's replace() is a no-op for them, by design).
export function headlessAppFetch(
  input: string | URL | Request,
  init: RequestInit,
): Promise<Response> {
  return Promise.resolve(headlessApp.request(input, init));
}

// Boot-time self-check (dev only — main.ts): every allowlisted route must be
// MOUNTED above. The allowlist and the mount list are two hand-kept lists and
// drifted once — allowlisted run-keyed reads whose route file was never
// mounted 404'd silently through /mcp, because a 404 is a well-formed
// response. One request per allowlisted name; any status but 404 means a
// handler was reached (200, a zod 400 on the dummy body, a permission 403);
// 404 means "allowlisted, not mounted" and boot fail-stops, like
// validateAllRoutesDefined. Only meaningful under BYPASS_AUTH: with auth ON
// the credential middleware answers 401 before routing, for mounted and
// unmounted paths alike.
export async function validateHeadlessMounts(): Promise<void> {
  const unmounted: string[] = [];
  for (const name of HEADLESS_ALLOWED_ROUTE_NAMES) {
    const route = routeRegistry[name];
    const path = route.path.replace(/:\w+/g, "x");
    const method = route.method.toUpperCase();
    const headers: Record<string, string> = {};
    if (route.requiresProject) headers["Project-Id"] = "x";
    const init: RequestInit = { method, headers };
    if (method !== "GET") {
      headers["content-type"] = "application/json";
      init.body = "{}";
    }
    const res = await headlessApp.request(path, init);
    await res.body?.cancel();
    if (res.status === 404) unmounted.push(`${name} (${method} ${path})`);
  }
  if (unmounted.length > 0) {
    console.error(
      `❌ Headless routes allowlisted but NOT mounted in headlessApp — add the route file in server/headless_app.ts:\n${
        unmounted.map((u) => `   - ${u}`).join("\n")
      }\n`,
    );
    Deno.exit(1);
  }
  console.log(
    `✅ All ${HEADLESS_ALLOWED_ROUTE_NAMES.length} allowlisted headless routes are mounted\n`,
  );
}

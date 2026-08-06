import { Hono } from "hono";
import { patAuthMiddleware, patRouteAllowlist } from "./middleware/mod.ts";
import { routesUsers } from "./routes/instance/users.ts";
import { routesModules } from "./routes/project/modules.ts";
import { routesProjectResultsPackage } from "./routes/project/results_package.ts";
import { routesPresentationObjects } from "./routes/project/presentation_objects.ts";
import { routesSlides } from "./routes/project/slides.ts";
import { routesReports } from "./routes/project/reports.ts";

// The PAT app (REVIEW_MCP_HOST_ARCHITECTURE.md §8, retired as a public mount
// by PLAN_112 D5): PAT-only auth + deny-by-default route allowlist. Since the
// /mcp endpoint replaced the local MCP host, this app is INTERNAL plumbing —
// the /mcp context builds per-principal server actions whose fetchImpl
// dispatches into it via patAppFetch below, so every tool call runs the full
// PAT middleware chain (verify + last-used stamp, allowlist, permissions,
// logging) exactly as a network caller would. Handlers are auth-agnostic
// (they read context set by getGlobalUser), so identity parity with the
// cookie mount is structural (pinned by server/tests/pat_identity_parity).
//
// Only the route FILES containing allowlisted routes are registered — the
// allowlist (middleware/pat_allowlist.ts) remains the authority on which
// individual routes a PAT can reach.
export const patApp = new Hono();
//@ts-ignore - middleware typed loosely, same as authMiddleware in main.ts
patApp.use("*", patAuthMiddleware);
patApp.use("*", patRouteAllowlist);
patApp.route("/", routesUsers);
patApp.route("/", routesModules);
patApp.route("/", routesProjectResultsPackage);
patApp.route("/", routesPresentationObjects);
patApp.route("/", routesSlides);
patApp.route("/", routesReports);
// The /info reference docs (get_info tool): same files the SPA fetches from
// its origin, served from the built client (dev fallback: the source dir).
patApp.get("/info/:file{[A-Za-z0-9_-]+\\.md}", async (c) => {
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
// the /mcp context cache installs. patApp.request paths carry no /pat prefix
// (the allowlist's replace() is a no-op for them, by design).
export function patAppFetch(
  input: string | URL | Request,
  init: RequestInit,
): Promise<Response> {
  return Promise.resolve(patApp.request(input, init));
}

// Every allowlisted headless route must actually be MOUNTED in headlessApp.
//
// WHY THIS EXISTS: the allowlist (middleware/headless_allowlist.ts) and the
// mount list (headless_app.ts) are two hand-maintained lists. They drifted
// once — the run-keyed script/log routes were allowlisted but their route
// file was never mounted, so every /mcp get_module_r_script call 404'd
// through the in-process dispatch, and nothing failed loudly because a 404
// is a perfectly well-formed response. This test dispatches one request per
// allowlisted name into headlessApp and asserts it reached a handler: any
// status but 404 will do (200, a zod 400 on the dummy body, a permission
// 403 — all mean "mounted"); 404 means "allowlisted, not mounted".
//
// Run with the dev .env AS IS (BYPASS_AUTH set): the headless auth
// middleware then passes straight through, so a 404 can only mean an
// unmounted route rather than an unauthenticated one. Postgres must be up
// (./pg_run) — some handlers touch the main DB before they answer.
//   deno test -A --env-file server/tests/headless_mount_test.ts

import { assert, assertNotEquals } from "@std/assert";
import { routeRegistry } from "lib";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { headlessApp } from "../headless_app.ts";
import { HEADLESS_ALLOWED_ROUTE_NAMES } from "../middleware/headless_allowlist.ts";

Deno.test("headless: every allowlisted route is mounted in headlessApp", async () => {
  if (!_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is not set — the headless auth middleware would 401 before routing and a 404 could not be told apart from a bad credential. Run with the dev .env as is.",
    );
  }
  try {
    const unmounted: string[] = [];
    for (const name of HEADLESS_ALLOWED_ROUTE_NAMES) {
      const route = routeRegistry[name];
      const path = route.path.replace(/:\w+/g, "x");
      const method = route.method.toUpperCase();
      const init: RequestInit = { method, headers: {} };
      if (route.requiresProject) {
        (init.headers as Record<string, string>)["Project-Id"] = "x";
      }
      if (method !== "GET") {
        (init.headers as Record<string, string>)["content-type"] =
          "application/json";
        init.body = "{}";
      }
      const res = await headlessApp.request(path, init);
      await res.body?.cancel();
      if (res.status === 404) {
        unmounted.push(`${name} (${method} ${path})`);
      }
    }
    assert(
      unmounted.length === 0,
      `Allowlisted but NOT mounted in headlessApp — add the route file to server/headless_app.ts:\n  ${
        unmounted.join("\n  ")
      }`,
    );

    // And the guard the other way still holds: a mounted route that is NOT
    // allowlisted is refused by the allowlist (403), never served.
    const denied = await headlessApp.request("/personal-access-tokens");
    await denied.body?.cancel();
    assertNotEquals(denied.status, 200);
  } finally {
    await closeAllConnections();
  }
});

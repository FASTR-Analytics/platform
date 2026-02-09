import type { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { _ASSETS_DIR_PATH, _SANDBOX_DIR_PATH } from "../exposed_env_vars.ts";
import { requireGlobalPermission } from "./userPermission.ts";

export function setupStaticServing(app: Hono) {
  // Public static files (no auth required)
  app.use("*", serveStatic({ root: "./client_dist" }));

  // Protected static files (require global user auth)
  app.use(
    "*",
    requireGlobalPermission(),
    serveStatic({ root: _SANDBOX_DIR_PATH }),
  );
  app.use(
    "*",
    requireGlobalPermission(),
    serveStatic({ root: _ASSETS_DIR_PATH }),
  );
}

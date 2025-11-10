import { serveStatic } from "hono/deno";
import type { Hono } from "hono";
import { getGlobalNonAdmin } from "../project_auth.ts";

export function setupStaticServing(app: Hono) {
  // Public static files (no auth required)
  app.use("*", serveStatic({ root: "./client_dist" }));

  // Protected static files (require global user auth)
  // Apply auth middleware before serving sandbox files
  app.use("*", getGlobalNonAdmin, serveStatic({ root: "./sandbox" }));

  // Apply auth middleware before serving assets files
  app.use("*", getGlobalNonAdmin, serveStatic({ root: "./assets" }));
}

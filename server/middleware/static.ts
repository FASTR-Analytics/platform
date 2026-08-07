import type { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { _ASSETS_DIR_PATH, _RUNS_DIR_PATH } from "../exposed_env_vars.ts";
import { getGlobalUser } from "../project_auth.ts";
import { requireGlobalPermission } from "./userPermission.ts";

// Uploaded IMAGE assets (e.g. logos shown on public dashboards / share links)
// are served WITHOUT auth — scoped to image extensions so non-image uploads stay
// behind requireGlobalPermission below. Asset filenames are already public (the
// public dashboard bundle returns them), so exposing the image bytes is
// consistent. Mounted AFTER the client_dist serve (bundled assets win, no
// shadowing) and BEFORE the protected serves.
const PUBLIC_IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

// Data-file assets (import-wizard inputs live here now — raw facility-level
// health data) require can_view_data OR can_configure_data, the same OR gate
// as the assets page, so its download buttons keep working for everyone who
// can see the page. requireGlobalPermission(a, b) is AND, hence the inline
// check. Asset NAMES stay visible to all authenticated users (the SSE
// starting payload) — only the bytes are gated.
const DATA_FILE_RE = /\.(csv|xlsx?|zip)$/i;

export function setupStaticServing(app: Hono) {
  // Public static files (no auth required)
  app.use("*", serveStatic({ root: "./client_dist" }));

  // Public uploaded IMAGE assets only (logos on public dashboards / share links)
  app.use("*", async (c, next) => {
    if (PUBLIC_IMAGE_RE.test(c.req.path)) {
      return serveStatic({ root: _ASSETS_DIR_PATH })(c, next);
    }
    await next();
  });

  // Run output downloads, the files-viewer's surface, at
  // /{runId}/outputs/{moduleId}/{file}. Scoped to that shape AND gated on
  // can_configure_data (PLAN_RESULTS_RUNS Q-G): this mount used to answer
  // any path under the runs volume for any authenticated instance user, so
  // knowing a runId was enough to download another project's raw output
  // CSVs. It carries the same guard as the viewer routes the listing comes
  // from. The path scope also matters for what follows: a wildcard mount
  // with this guard would 403 every non-admin request that falls through to
  // the assets serve below.
  app.use(
    "/:run_id/outputs/*",
    requireGlobalPermission("can_configure_data"),
    serveStatic({ root: _RUNS_DIR_PATH }),
  );

  // Third tier: data-file bytes for data-permitted users only (admins pass).
  app.use("*", async (c, next) => {
    // CORS preflight passes through, same as requireGlobalPermission.
    if (!DATA_FILE_RE.test(c.req.path) || c.req.method === "OPTIONS") {
      await next();
      return;
    }
    const globalUser = await getGlobalUser(c);
    if (globalUser === "NOT_AUTHENTICATED") {
      c.status(401);
      return c.text("Authentication required");
    }
    const allowed =
      globalUser.isGlobalAdmin ||
      globalUser.thisUserPermissions.can_view_data ||
      globalUser.thisUserPermissions.can_configure_data;
    if (!allowed) {
      c.status(403);
      return c.text("You do not have permission to download data files");
    }
    return serveStatic({ root: _ASSETS_DIR_PATH })(c, next);
  });

  app.use(
    "*",
    requireGlobalPermission(),
    serveStatic({ root: _ASSETS_DIR_PATH }),
  );
}

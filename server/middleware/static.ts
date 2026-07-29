import type { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { _ASSETS_DIR_PATH, _RUNS_DIR_PATH } from "../exposed_env_vars.ts";
import { requireGlobalPermission } from "./userPermission.ts";

// Uploaded IMAGE assets (e.g. logos shown on public dashboards / share links)
// are served WITHOUT auth — scoped to image extensions so non-image uploads stay
// behind requireGlobalPermission below. Asset filenames are already public (the
// public dashboard bundle returns them), so exposing the image bytes is
// consistent. Mounted AFTER the client_dist serve (bundled assets win, no
// shadowing) and BEFORE the protected serves.
const PUBLIC_IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

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
  app.use(
    "*",
    requireGlobalPermission(),
    serveStatic({ root: _ASSETS_DIR_PATH }),
  );
}

import type { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { _ASSETS_DIR_PATH, _SANDBOX_DIR_PATH } from "../exposed_env_vars.ts";
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

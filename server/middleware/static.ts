import type { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { normalize } from "@std/path/posix";
import { _ASSETS_DIR_PATH, _RUNS_DIR_PATH } from "../exposed_env_vars.ts";
import { getGlobalUser } from "../auth/global_user.ts";
import { requireGlobalPermission } from "./userPermission.ts";

// Uploaded IMAGE assets (deck and report logos) are served WITHOUT auth —
// scoped to image extensions so non-image uploads stay behind
// requireGlobalPermission below. Deck PDFs are emailed and reports are
// downloaded, both outside any session, so the logos inside them have to
// resolve unauthenticated. Mounted AFTER the client_dist serve (bundled assets
// win, no shadowing) and BEFORE the protected serves.
const PUBLIC_IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

// Data-file assets (import-wizard inputs live here now — raw facility-level
// health data) require can_view_data OR can_configure_data (admins pass).
// requireGlobalPermission(a, b) is AND, hence the inline check. The assets
// PAGE itself is visible to all authenticated users — asset NAMES are public
// (the SSE starting payload); only the bytes are gated, and the page hides
// the data-file download button from users this tier would 403.
const DATA_FILE_RE = /\.(csv|xlsx?|zip)$/i;

export function setupStaticServing(app: Hono) {
  // Public static files (no auth required)
  app.use("*", serveStatic({ root: "./client_dist" }));

  // Public uploaded IMAGE assets only (deck and report logos)
  app.use("*", async (c, next) => {
    if (PUBLIC_IMAGE_RE.test(c.req.path)) {
      return serveStatic({ root: _ASSETS_DIR_PATH })(c, next);
    }
    await next();
  });

  // Run output downloads, the package detail's file rows, at
  // /{runId}/outputs/{moduleId}/{file}. Scoped to that shape AND gated on
  // the instance data bit (PLAN_RESULTS_RUNS Q-G, regated 2026-08-18): this
  // mount used to answer any path under the runs volume for any
  // authenticated instance user, so knowing a runId was enough to download
  // raw output CSVs. It carries the same guard as the run-keyed package reads
  // the listing comes from (`getRunDetail`, `can_view_data`). The path scope
  // also matters for what follows: a wildcard mount with this guard would
  // 403 every non-data request that falls through to the assets serve below.
  app.use(
    "/:run_id/outputs/*",
    requireGlobalPermission("can_view_data"),
    serveStatic({ root: _RUNS_DIR_PATH }),
  );

  // Third tier: data-file bytes for data-permitted users only (admins pass).
  // The extension test runs on the DECODED, NORMALIZED path with trailing
  // slashes stripped — serveStatic resolves `/x.csv/`, `/x.csv/.`, and
  // `/x.csv/y/..` to the same file on some hono versions, and this tier
  // fails OPEN (falls through to the any-authenticated serve below), so the
  // gate must see every spelling of a data-file path.
  app.use("*", async (c, next) => {
    // decodeURI throws on malformed escapes (a bare % survives
    // sanitizeUploadFilename, so "coverage_100%.csv" is a real asset name);
    // serveStatic cannot decode such a path either, so gating on the raw
    // path is equivalent there — never let the throw escape to onError.
    let decoded = c.req.path;
    try {
      decoded = decodeURI(c.req.path);
    } catch {
      // Keep the raw path.
    }
    const path = normalize(decoded).replace(/\/+$/, "");
    // CORS preflight passes through, same as requireGlobalPermission.
    if (!DATA_FILE_RE.test(path) || c.req.method === "OPTIONS") {
      await next();
      return;
    }
    let globalUser: Awaited<ReturnType<typeof getGlobalUser>>;
    try {
      globalUser = await getGlobalUser(c);
    } catch {
      c.status(503);
      return c.text("Service temporarily unavailable");
    }
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

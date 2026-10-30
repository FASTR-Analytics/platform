import type { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { normalize } from "@std/path/posix";
import { _ASSETS_DIR_PATH, _RUNS_DIR_PATH } from "../exposed_env_vars.ts";
import { getGlobalUser } from "../auth/global_user.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { canUserSeeAsset } from "lib";
import { getAssetPrivacyForAnyName } from "../db/instance/assets.ts";
import { createMiddleware } from "hono/factory";
import {
  type GuardEnv,
  requireApprovedUser,
  requirePermission,
} from "../auth/guards.ts";
import { NOT_FOUND, SERVICE_UNAVAILABLE } from "../auth/refusals.ts";

// Uploaded IMAGE assets (logos and images placed in decks and reports) are
// served WITHOUT auth: scoped to image extensions so non-image uploads stay
// behind requireApprovedUser below. Mounted AFTER the client_dist serve
// (bundled assets win, no shadowing) and BEFORE the protected serves.
const PUBLIC_IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

// Data-file assets (import-wizard inputs live here now: raw facility-level
// health data) require can_view_data, which configure implies. The assets
// PAGE itself is visible to all authenticated users: asset NAMES are public
// (the SSE starting payload); only the bytes are gated, and the page hides
// the data-file download button from users this tier would 403.
const DATA_FILE_RE = /\.(csv|xlsx?|zip)$/i;

export function setupStaticServing(app: Hono) {
  // Public static files (no auth required)
  app.use("*", serveStatic({ root: "./client_dist" }));

  // Private assets, ahead of every asset tier (including the public image
  // one): only the owner and chosen viewers get the bytes. The lookup covers
  // every spelling serveStatic might resolve to the same file (raw, decoded,
  // component-decoded, normalized), so no encoding slips past it. Everyone
  // else, an unapproved caller included (a deleted owner's live session),
  // gets a plain 404: a private file's existence is not revealed.
  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      await next();
      return;
    }
    const candidates = assetNameCandidates(c.req.path);
    if (candidates.length === 0) {
      await next();
      return;
    }
    let privacy: Awaited<ReturnType<typeof getAssetPrivacyForAnyName>>;
    try {
      privacy = await getAssetPrivacyForAnyName(
        getPgConnectionFromCacheOrNew("main", "READ_ONLY"),
        candidates,
      );
    } catch {
      c.status(503);
      return c.text(SERVICE_UNAVAILABLE);
    }
    if (privacy === null) {
      await next();
      return;
    }
    let globalUser: Awaited<ReturnType<typeof getGlobalUser>>;
    try {
      globalUser = await getGlobalUser(c);
    } catch {
      c.status(503);
      return c.text(SERVICE_UNAVAILABLE);
    }
    if (
      globalUser === "NOT_AUTHENTICATED" ||
      !globalUser.approved ||
      !canUserSeeAsset(privacy, globalUser.email, globalUser.isGlobalAdmin)
    ) {
      c.status(404);
      return c.text(NOT_FOUND);
    }
    c.header("Cache-Control", "private, no-store");
    // A data file still needs the data bit below; anything else is served
    // straight to the permitted viewer.
    if (candidates.some((n) => DATA_FILE_RE.test(n))) {
      await next();
      return;
    }
    return serveStatic({ root: _ASSETS_DIR_PATH })(c, next);
  });

  // Public uploaded IMAGE assets only
  app.use("*", async (c, next) => {
    if (PUBLIC_IMAGE_RE.test(c.req.path)) {
      return serveStatic({ root: _ASSETS_DIR_PATH })(c, next);
    }
    await next();
  });

  // Run output downloads, the package detail's file rows, at
  // /{runId}/outputs/{moduleId}/{file}. Scoped to that shape AND gated on
  // the instance data bit, so knowing a runId is not enough to download raw
  // output CSVs. It carries the same guard as the run-keyed package reads
  // the listing comes from (`getRunDetail`, `can_view_data`). The path scope
  // also matters for what follows: a wildcard mount with this guard would
  // 403 every non-data request that falls through to the assets serve below.
  app.use(
    "/:run_id/outputs/*",
    requirePermission("can_view_data"),
    serveStatic({ root: _RUNS_DIR_PATH }),
  );

  // Third tier: data-file bytes for holders of can_view_data. The extension
  // test runs on the DECODED, NORMALIZED path with trailing slashes
  // stripped: serveStatic resolves `/x.csv/`, `/x.csv/.`, and `/x.csv/y/..`
  // to the same file on some hono versions, and this tier fails OPEN (falls
  // through to the approved-user serve below), so the gate must see every
  // spelling of a data-file path.
  const dataFileGuard = requirePermission("can_view_data");
  const serveDataFile = serveStatic({ root: _ASSETS_DIR_PATH });
  app.use(
    "*",
    createMiddleware<GuardEnv>(async (c, next) => {
      if (!isDataFilePath(c.req.path)) {
        await next();
        return;
      }
      // A Response the inner serve returns is not this middleware's return
      // value, so it is captured and returned, else lost.
      let served: Response | undefined;
      const refusal = await dataFileGuard(c, async () => {
        served = (await serveDataFile(c, next)) ?? undefined;
      });
      return refusal ?? served;
    }),
  );

  app.use(
    "*",
    requireApprovedUser(),
    serveStatic({ root: _ASSETS_DIR_PATH }),
  );
}

// decodeURI throws on malformed escapes (a bare % survives
// sanitizeUploadFilename, so "coverage_100%.csv" is a real asset name);
// serveStatic cannot decode such a path either, so gating on the raw path is
// equivalent there: never let the throw escape to onError.
function isDataFilePath(rawPath: string): boolean {
  let decoded = rawPath;
  try {
    decoded = decodeURI(rawPath);
  } catch {
    // Keep the raw path.
  }
  return DATA_FILE_RE.test(normalize(decoded).replace(/\/+$/, ""));
}

// The top-level asset names a request path could be served as. Assets are
// bare basenames, so a path with a directory part after normalizing is not
// one (serveStatic would look in a subdirectory, and none holds assets).
function assetNameCandidates(rawPath: string): string[] {
  const spellings = new Set<string>([rawPath]);
  try {
    spellings.add(decodeURI(rawPath));
  } catch {
    // Keep the others.
  }
  try {
    spellings.add(decodeURIComponent(rawPath));
  } catch {
    // Keep the others.
  }
  const names = new Set<string>();
  for (const spelling of spellings) {
    const normalized = normalize(spelling).replace(/\/+$/, "").replace(
      /^\/+/,
      "",
    );
    if (normalized === "" || normalized.includes("/") || normalized === "..") {
      continue;
    }
    names.add(normalized);
  }
  return [...names];
}

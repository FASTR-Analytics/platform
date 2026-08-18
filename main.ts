import { type Context, Hono } from "hono";
import { dbStartUp } from "./server/db_startup.ts";
import { getPgConnectionFromCacheOrNew } from "./server/db/mod.ts";
import { DeleteOldLogs } from "./server/db/instance/user_logs.ts";
import { purgeExpiredProjects } from "./server/db/mod.ts";
import {
  notifyInstanceProjectsLastUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "./server/task_management/notify_instance_updated.ts";
import { connectValkey, disconnectValkey } from "./server/valkey/connection.ts";
import { startDhis2ImportScheduler } from "./server/worker_routines/import_hmis_data_dhis2/scheduler.ts";
import { closeAllConnections } from "./server/db/postgres/connection_manager.ts";
import {
  flushAllVersions,
  startVersionSweeper,
} from "./server/collab/version_capture.ts";
import { flushAllRooms } from "./server/collab/doc_rooms.ts";
import { validateAllRoutesDefined } from "./server/routes/route-tracker.ts";
import { _IS_DEV, _PORT } from "./server/exposed_env_vars.ts";
import { validateHeadlessMounts } from "./server/headless_app.ts";
import { runServerTestSuiteOrExit } from "./server/dev_boot_checks.ts";
import {
  authMiddleware,
  cacheMiddleware,
  corsMiddleware,
  setupStaticServing,
} from "./server/middleware/mod.ts";

// Instance routes
import { routesAssets } from "./server/routes/instance/assets.ts";
import { routesDatasets } from "./server/routes/instance/datasets.ts";
import { routesDhis2Credentials } from "./server/routes/instance/dhis2_credentials.ts";
import { routesHealth } from "./server/routes/instance/health.ts";
import { routesHfaIndicators } from "./server/routes/instance/hfa_indicators.ts";
import { routesHfaTimePoints } from "./server/routes/instance/hfa_time_points.ts";
import { routesIceh } from "./server/routes/instance/iceh.ts";
import { routesIndicators } from "./server/routes/instance/indicators.ts";
import { routesCalculatedIndicators } from "./server/routes/instance/calculated_indicators.ts";
import { routesIndicatorsDhis2 } from "./server/routes/instance/indicators_dhis2.ts";
import { routesInstance } from "./server/routes/instance/instance.ts";
import { routesRunGeneration } from "./server/routes/instance/run_generation.ts";
import { routesStructure } from "./server/routes/instance/structure.ts";
import { routesUpload } from "./server/routes/instance/upload.ts";
import { routesUsers } from "./server/routes/instance/users.ts";
import { routesBackups } from "./server/routes/instance/backups.ts";
import { routesGeoJsonMaps } from "./server/routes/instance/geojson_maps.ts";
import { routesInstanceModules } from "./server/routes/instance/modules.ts";
import { routesInstanceSSE } from "./server/routes/instance/instance-sse.ts";

// Project routes
import { routesProject } from "./server/routes/project/project.ts";
import { routesProjectSSEV2 } from "./server/routes/project/project-sse-v2.ts";
import { routesProjectCollab } from "./server/routes/project/project-collab.ts";
import { routesModules } from "./server/routes/project/modules.ts";
import { routesProjectResultsPackage } from "./server/routes/project/results_package.ts";
import { routesPresentationObjects } from "./server/routes/project/presentation_objects.ts";
import { routesSlideDecks } from "./server/routes/project/slide_decks.ts";
import { routesSlides } from "./server/routes/project/slides.ts";
import { routesAiProxy } from "./server/routes/project/ai_proxy.ts";
import { routesInstanceAiProxy } from "./server/routes/instance/ai_proxy.ts";
import { routesAiFiles } from "./server/routes/project/ai_files.ts";
import { routesVisualizationFolders } from "./server/routes/project/visualization_folders.ts";
import { routesSlideDeckFolders } from "./server/routes/project/slide_deck_folders.ts";
import { routesReports } from "./server/routes/project/reports.ts";
import { routesReportFolders } from "./server/routes/project/report_folders.ts";
import { routesDashboards } from "./server/routes/project/dashboards.ts";
import { routesEmails } from "./server/routes/project/emails.ts";
import { routesCacheStatus } from "./server/routes/project/cache_status.ts";

// Public routes (no auth)
import { routesPublicDashboard } from "./server/routes/public/dashboard.ts";
import { routesOAuthMetadata } from "./server/routes/public/oauth_metadata.ts";

import { routesCustomPrompts } from "./server/routes/instance/custom_prompts.ts";
import { routesWhatsNew } from "./server/routes/instance/whats_new.ts";
import { routesOnboarding } from "./server/routes/instance/onboarding.ts";
import { mcpHttpHandler } from "./server/mcp/mcp_endpoint.ts";

await dbStartUp();

const runLogCleanup = () => {
  const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  DeleteOldLogs(db).catch((e) => console.error("Log cleanup failed:", e));
};
runLogCleanup();
setInterval(runLogCleanup, 24 * 60 * 60 * 1000);

const runProjectPurge = () => {
  const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  purgeExpiredProjects(db)
    .then((purgedCount) => {
      // The purge drops projects.run_id pointers — the catalogue's
      // attachedProjects and delete-guard facts — so connected clients must
      // be signalled (forceDeleteProject's route fires the same pair). The
      // boot-time invocation notifies harmlessly: no clients are connected
      // yet.
      if (purgedCount > 0) {
        notifyInstanceProjectsLastUpdated(new Date().toISOString());
        notifyInstanceRunsCatalogUpdated();
      }
    })
    .catch((e) => console.error("Project purge failed:", e));
};
runProjectPurge();
setInterval(runProjectPurge, 24 * 60 * 60 * 1000);

// DHIS2 auto-pull (PLAN_DHIS2_IMPORTER Phase 4): ~60 s tick draining queued
// runs FIFO and firing due schedules — a minute-level tick, NOT one of the
// boot-anchored 24 h jobs above (a daily tick would usually miss a 01:15
// Lagos window).
startDhis2ImportScheduler();

// Version history: sweep editing-session accumulators into stored versions.
startVersionSweeper();

await connectValkey();

const app = new Hono();

// CORS for public routes
app.use("/api/d/*", corsMiddleware);

// Dashboards are readable anonymously only when public; not-public dashboards
// require an authenticated user. Run Clerk here so the route can READ the
// session — clerkMiddleware populates auth without rejecting anonymous requests.
//@ts-ignore - Clerk middleware types not fully compatible with Hono
app.use("/api/d/*", authMiddleware);

// Public routes (no auth required) - must be before authMiddleware
app.route("/", routesPublicDashboard);

// OAuth discovery for /mcp (PLAN_MCP_OAUTH). These are what a connector reads
// BEFORE it has any credential, so they must sit ahead of the global Clerk
// middleware — behind it they 401 and the Connect button spins forever.
app.route("/", routesOAuthMetadata);

// Serve SPA HTML for public dashboard routes (before auth)
try {
  const indexHtml = Deno.readTextFileSync("./client_dist/index.html");
  // These two shell serves are registered ahead of cacheMiddleware, so they
  // never reach its no-cache branch for HTML — they set it themselves. Same
  // reason as there: a heuristically cached shell pins the browser to the
  // previous build's immutable bundles.
  const serveShell = (c: Context) => {
    c.header("Cache-Control", "no-cache, must-revalidate");
    return c.html(indexHtml);
  };
  app.get("/d/:slug", serveShell);
  // The unlisted /access-tokens SPA route (PAT panel) needs the same
  // pre-auth HTML serve: there is NO general SPA fallback (unknown paths
  // 302 to "/"), and the Clerk middleware would 401 a logged-out
  // navigation. The page itself is the public SPA bundle; LoggedInWrapper
  // gates it client-side and every PAT route stays server-gated.
  app.get("/access-tokens", serveShell);
} catch {
  // In development, handled by Vite dev server
}

// The /mcp endpoint (PLAN_112) authenticates with PATs inside the panther
// adapter — the global Clerk middleware and CORS headers must not touch it.
const isMcpPath = (path: string) => path === "/mcp" || path.startsWith("/mcp/");

//@ts-ignore - Clerk middleware types not fully compatible with Hono
// LOCAL_DEVELOPMENT_TOGGLE
app.use(
  "*",
  (c, next) => isMcpPath(c.req.path) ? next() : authMiddleware(c, next),
);

app.onError((err: unknown, c) => {
  return c.json({
    success: false,
    err: "Server error: " + (err instanceof Error ? err.message : ""),
  });
});

// Unmatched GETs 302 to "/" (the SPA fallback below), so only non-GET
// requests reach this — in practice a client calling a route this server
// build no longer has, i.e. a tab running pre-deploy JS. Return the
// APIResponse envelope with the actual cause instead of Hono's bare
// "404 Not Found", so the failure is diagnosable from the error modal.
app.notFound((c) => {
  return c.json(
    {
      success: false,
      err:
        `Unknown route: ${c.req.method} ${c.req.path}. ` +
        "The app may have been updated since this page was loaded — reload the page and try again.",
    },
    404,
  );
});

app.use(
  "*",
  (c, next) => isMcpPath(c.req.path) ? next() : corsMiddleware(c, next),
);

app.route("/", routesHealth);
app.route("/", routesInstance);
app.route("/", routesInstanceSSE);
app.route("/", routesUsers);
app.route("/", routesProject);
app.route("/", routesProjectSSEV2);
app.route("/", routesProjectCollab);
app.route("/", routesStructure);
app.route("/", routesRunGeneration);
app.route("/", routesBackups);
app.route("/", routesAssets);
app.route("/", routesGeoJsonMaps);
app.route("/", routesUpload);
app.route("/", routesDatasets);
app.route("/", routesDhis2Credentials);
app.route("/", routesHfaIndicators);
app.route("/", routesHfaTimePoints);
app.route("/", routesIceh);
app.route("/", routesIndicators);
app.route("/", routesCalculatedIndicators);
app.route("/", routesIndicatorsDhis2);
app.route("/", routesInstanceModules);
app.route("/", routesModules);
app.route("/", routesProjectResultsPackage);
app.route("/", routesSlideDecks);
app.route("/", routesReports);
app.route("/", routesReportFolders);
app.route("/", routesSlides);
app.route("/", routesDashboards);
app.route("/", routesPresentationObjects);
app.route("/", routesVisualizationFolders);
app.route("/", routesSlideDeckFolders);
app.route("/", routesEmails);
app.route("/", routesCacheStatus);
app.route("/ai", routesAiProxy);
app.route("/ai-instance", routesInstanceAiProxy);
app.route("/ai", routesAiFiles);
app.route("/", routesCustomPrompts);
app.route("/", routesWhatsNew);
app.route("/", routesOnboarding);

// The remote MCP endpoint (PLAN_112): URL + PAT header, nothing local. The
// panther adapter handles auth (401/503), era routing, sessions, and
// elicitation; Hono just hands it the raw Request.
// CORS headers for browser-origin MCP clients. This endpoint authenticates by
// bearer token and carries NO ambient cookie credentials, so a wildcard origin
// is safe — and `Access-Control-Allow-Credentials` is deliberately NOT set (a
// browser can only read a response it explicitly attached the token to).
// `Mcp-Session-Id` must be exposed or a browser client cannot read the session
// the server issues on initialize.
const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, Last-Event-ID, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

app.all("/mcp", async (c) => {
  // The preflight MUST be answered BEFORE auth: browsers never send the
  // Authorization header on an OPTIONS preflight, so letting it reach the
  // adapter's authenticate hook 401s every browser-origin connector before it
  // can make its real request. The app's own permission guards skip OPTIONS
  // for exactly this reason.
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }
  const res = await mcpHttpHandler(c.req.raw);
  for (const [k, v] of Object.entries(MCP_CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
});

// Cache headers middleware
app.use("*", cacheMiddleware);

// Static file serving
setupStaticServing(app);

app.get("*", (c) => {
  return c.redirect("/", 302);
});

// Validate that all routes in the registry have been defined
validateAllRoutesDefined();
// Dev-only self-checks, fail-stop like the route validation above: the
// structural headless-mount check, then the whole server test suite
// (`deno task test` — a subprocess, because those tests need BYPASS_AUTH
// cleared and their own module graph; ~2 s with --no-check, the tests'
// typecheck being `deno task typecheck`'s job). Production boots skip both.
if (_IS_DEV) {
  validateHeadlessMounts();
  await runServerTestSuiteOrExit();
}

// Process-level backstop for the serving phase. A single collaborative-editing
// frame — or any other un-awaited async path — must never take down this
// multi-tenant server. The known Yjs crash vectors are guarded at their source
// (server/collab/doc_rooms.ts); these handlers are defense-in-depth so an
// unforeseen throw degrades one request instead of every project. Both log
// loudly so nothing is silently swallowed. Registered AFTER startup so a failed
// dbStartUp/valkey/route-validation still crashes fast rather than limping on.
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
  e.preventDefault();
});
globalThis.addEventListener("error", (e) => {
  console.error("[uncaught error]", e.error ?? e.message);
  e.preventDefault();
});

console.log(`Starting server on port ${_PORT}...`);

const server = Deno.serve({ port: _PORT }, app.fetch);

const shutdown = async () => {
  console.log("\nShutting down...");
  setTimeout(() => {
    console.warn("[Shutdown] Timed out — forcing exit");
    Deno.exit(1);
  }, 8000);
  // Collab rooms first: dirty rooms hold up to CHECKPOINT_DEBOUNCE_MS of
  // typing that exists nowhere else, and the version flush below reads
  // document content from the DB — so the rooms' checkpoints must land first.
  // Both must finish BEFORE closeAllConnections() — they write through the pools.
  await flushAllRooms().catch((e) =>
    console.error("Room flush on shutdown failed:", e)
  );
  // Version history: open editing sessions become versions before exit.
  await flushAllVersions().catch((e) =>
    console.error("Version flush on shutdown failed:", e)
  );
  await Promise.all([
    server.shutdown(),
    disconnectValkey(),
    closeAllConnections(),
  ]);
  Deno.exit(0);
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

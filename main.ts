import { Hono } from "hono";
import { dbStartUp } from "./server/db_startup.ts";
import { getPgConnectionFromCacheOrNew } from "./server/db/mod.ts";
import { DeleteOldLogs } from "./server/db/instance/user_logs.ts";
import { purgeExpiredProjects } from "./server/db/mod.ts";
import { connectValkey, disconnectValkey } from "./server/valkey/connection.ts";
import { closeAllConnections } from "./server/db/postgres/connection_manager.ts";
import { validateAllRoutesDefined } from "./server/routes/route-tracker.ts";
import {
  authMiddleware,
  cacheMiddleware,
  corsMiddleware,
  setupStaticServing,
} from "./server/middleware/mod.ts";

// Instance routes
import { routesAssets } from "./server/routes/instance/assets.ts";
import { routesDatasets } from "./server/routes/instance/datasets.ts";
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
import { routesModules } from "./server/routes/project/modules.ts";
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

import { routesCustomPrompts } from "./server/routes/instance/custom_prompts.ts";

await dbStartUp();

const runLogCleanup = () => {
  const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  DeleteOldLogs(db).catch((e) => console.error("Log cleanup failed:", e));
};
runLogCleanup();
setInterval(runLogCleanup, 24 * 60 * 60 * 1000);

const runProjectPurge = () => {
  const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  purgeExpiredProjects(db).catch((e) =>
    console.error("Project purge failed:", e)
  );
};
runProjectPurge();
setInterval(runProjectPurge, 24 * 60 * 60 * 1000);

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

// Serve SPA HTML for public dashboard routes (before auth)
try {
  const indexHtml = Deno.readTextFileSync("./client_dist/index.html");
  app.get("/d/:slug", (c) => c.html(indexHtml));
} catch {
  // In development, handled by Vite dev server
}

//@ts-ignore - Clerk middleware types not fully compatible with Hono
// LOCAL_DEVELOPMENT_TOGGLE
app.use("*", authMiddleware);

app.onError((err: unknown, c) => {
  return c.json({
    success: false,
    err: "Server error: " + (err instanceof Error ? err.message : ""),
  });
});

app.use("*", corsMiddleware);

app.route("/", routesHealth);
app.route("/", routesInstance);
app.route("/", routesInstanceSSE);
app.route("/", routesUsers);
app.route("/", routesProject);
app.route("/", routesProjectSSEV2);
app.route("/", routesStructure);
app.route("/", routesRunGeneration);
app.route("/", routesBackups);
app.route("/", routesAssets);
app.route("/", routesGeoJsonMaps);
app.route("/", routesUpload);
app.route("/", routesDatasets);
app.route("/", routesHfaIndicators);
app.route("/", routesHfaTimePoints);
app.route("/", routesIceh);
app.route("/", routesIndicators);
app.route("/", routesCalculatedIndicators);
app.route("/", routesIndicatorsDhis2);
app.route("/", routesInstanceModules);
app.route("/", routesModules);
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

// Cache headers middleware
app.use("*", cacheMiddleware);

// Static file serving
setupStaticServing(app);

app.get("*", (c) => {
  return c.redirect("/", 302);
});

// Validate that all routes in the registry have been defined
validateAllRoutesDefined();

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Starting server on port ${port}...`);

const server = Deno.serve({ port }, app.fetch);

const shutdown = async () => {
  console.log("\nShutting down...");
  setTimeout(() => {
    console.warn("[Shutdown] Timed out — forcing exit");
    Deno.exit(1);
  }, 8000);
  await Promise.all([
    server.shutdown(),
    disconnectValkey(),
    closeAllConnections(),
  ]);
  Deno.exit(0);
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

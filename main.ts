import { Hono } from "hono";
import { dbStartUp } from "./server/db_startup.ts";
import { warmAllCaches } from "./server/cache_warming.ts";
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
import { routesIndicators } from "./server/routes/instance/indicators.ts";
import { routesIndicatorsDhis2 } from "./server/routes/instance/indicators_dhis2.ts";
import { routesInstance } from "./server/routes/instance/instance.ts";
import { routesStructure } from "./server/routes/instance/structure.ts";
import { routesUpload } from "./server/routes/instance/upload.ts";
import { routesUsers } from "./server/routes/instance/users.ts";
import { routesBackups } from "./server/routes/instance/backups.ts";

// Project routes
import { routesProject } from "./server/routes/project/project.ts";
import { routesProjectSSE } from "./server/routes/project/project-sse.ts";
import { routesModules } from "./server/routes/project/modules.ts";
import { routesPresentationObjects } from "./server/routes/project/presentation_objects.ts";
import { routesReports } from "./server/routes/project/reports.ts";
import { routesAi } from "./server/routes/project/ai_interpretation.ts";

await dbStartUp();

await warmAllCaches();

const app = new Hono();

// Debug ALL requests
app.use("*", async (c, next) => {
  // Intercept HEAD requests to /upload/:id
  if (c.req.method === "HEAD" && c.req.path.startsWith("/upload/")) {
    console.log("[INTERCEPTED HEAD REQUEST]");
    const clientOrigin = Deno.env.get("CLIENT_ORIGIN") ||
      "http://localhost:3000";
    c.status(404);
    c.header("Tus-Resumable", "1.0.0");
    c.header("Access-Control-Allow-Origin", clientOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header(
      "Access-Control-Expose-Headers",
      "Upload-Offset, Upload-Length, Tus-Resumable",
    );
    return c.text("");
  }

  await next();
});

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
app.route("/", routesUsers);
app.route("/", routesProject);
app.route("/", routesProjectSSE);
app.route("/", routesStructure);
app.route("/", routesBackups);
app.route("/", routesAssets);
app.route("/", routesUpload);
app.route("/", routesDatasets);
app.route("/", routesIndicators);
app.route("/", routesIndicatorsDhis2);
app.route("/", routesModules);
app.route("/", routesReports);
app.route("/", routesPresentationObjects);
app.route("/", routesAi);

// Cache headers middleware
app.use("*", cacheMiddleware);

// Static file serving
setupStaticServing(app);

// Only serve static HTML in production (when client_dist exists)
try {
  const indexHtml = Deno.readTextFileSync("./client_dist/index.html");
  app.get("/docs", (c) => c.html(indexHtml));
  app.get("/claire", (c) => c.html(indexHtml));
} catch {
  // In development, these routes are handled by the Vite dev server
  console.log("Skipping /docs and /claire routes (client_dist not found - running in dev mode)");
}

app.get("*", (c) => {
  return c.redirect("/", 302);
});

// Validate that all routes in the registry have been defined
validateAllRoutesDefined();

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Starting server on port ${port}...`);

const server = Deno.serve({ port }, app.fetch);

const shutdown = () => {
  console.log("\nShutting down...");
  server.shutdown();
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", shutdown);

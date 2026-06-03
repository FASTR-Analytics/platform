import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { buildPublicDashboardBundle } from "lib";
import { getDashboardDetail } from "../../db/project/dashboards.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getCountryIso3Config } from "../../db/instance/config.ts";
import { resolveDashboardSlug } from "../../db/instance/dashboard_slugs.ts";

export const routesPublicDashboard = new Hono();

routesPublicDashboard.get("/api/d/:slug", async (c) => {
  const slug = c.req.param("slug");

  // Slug → (project, dashboard) lives in the main DB, so a bare /d/:slug URL
  // resolves to the right project database without a projectId in the path.
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const location = await resolveDashboardSlug(mainDb, slug);
  if (!location) {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  let projectDb;
  try {
    projectDb = getPgConnectionFromCacheOrNew(location.projectId, "READ_ONLY");
  } catch {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  const result = await getDashboardDetail(
    projectDb,
    mainDb,
    location.projectId,
    location.dashboardId,
  );
  if (!result.success || !result.data) {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  // isPublic: true  → anyone can see it.
  // isPublic: false → only authenticated users can see it.
  // NB: this must check the real Clerk session, not _BYPASS_AUTH — under
  // BYPASS_AUTH there is no session at all, so a not-public dashboard is hidden
  // from everyone in that mode (including the dev browser).
  if (!result.data.isPublic) {
    // @ts-ignore: Clerk middleware types not fully compatible with Hono
    const isAuthenticated = !!getAuth(c)?.userId;
    if (!isAuthenticated) {
      return c.json({ success: false, err: "Not found" }, 404);
    }
  }

  // Country drives display-only label cleaning (e.g. Nigeria admin-area names)
  // in the shared transform. Best-effort and non-sensitive: a failure here must
  // never block serving the dashboard, so fall back to no cleaning.
  let countryIso3: string | undefined;
  try {
    const countryRes = await getCountryIso3Config(mainDb);
    countryIso3 = countryRes.success ? countryRes.data.countryIso3 : undefined;
  } catch {
    countryIso3 = undefined;
  }

  // Shared transform (lib): groups collapse to entries, group members carry the
  // group's shared geojson. Same builder the editor uses.
  const bundle = buildPublicDashboardBundle(result.data, countryIso3);

  return c.json({ success: true, data: bundle });
});

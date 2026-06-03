import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { buildPublicDashboardBundle } from "lib";
import { getDashboardBySlug } from "../../db/project/dashboards.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getCountryIso3Config } from "../../db/instance/config.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const routesPublicDashboard = new Hono();

routesPublicDashboard.get("/api/d/:projectId/:slug", async (c) => {
  const projectId = c.req.param("projectId");
  const slug = c.req.param("slug");

  if (!UUID_REGEX.test(projectId)) {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  let projectDb;
  try {
    projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
  } catch {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  const result = await getDashboardBySlug(projectDb, slug);
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
    const countryRes = await getCountryIso3Config(
      getPgConnectionFromCacheOrNew("main", "READ_ONLY"),
    );
    countryIso3 = countryRes.success ? countryRes.data.countryIso3 : undefined;
  } catch {
    countryIso3 = undefined;
  }

  // Shared transform (lib): groups collapse to entries, group members carry the
  // group's shared geojson. Same builder the editor uses.
  const bundle = buildPublicDashboardBundle(result.data, countryIso3);

  return c.json({ success: true, data: bundle });
});

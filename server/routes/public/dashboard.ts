import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import type { FigureInputs } from "@timroberton/panther";
import type {
  IndicatorMetadata,
  PresentationObjectConfig,
  PublicDashboardBundle,
  PublicDashboardItem,
} from "lib";
import { getDashboardBySlug } from "../../db/project/dashboards.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";

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

  const dashboard = result.data;

  const items: PublicDashboardItem[] = dashboard.items.map((item) => {
    const source = item.figureBlock.source;
    const fromData = source?.type === "from_data" ? source : undefined;
    return {
      id: item.id,
      label: item.label,
      sortOrder: item.sortOrder,
      strippedFigureInputs: (item.figureBlock.figureInputs ?? {}) as FigureInputs,
      source: {
        config: (fromData?.config ?? {}) as PresentationObjectConfig,
        metricId: fromData?.metricId ?? "",
        formatAs: "number",
        indicatorMetadata: fromData?.indicatorMetadata as
          | IndicatorMetadata[]
          | undefined,
      },
      geoData: item.geoData,
    };
  });

  const bundle: PublicDashboardBundle = {
    title: dashboard.title,
    layout: dashboard.layout,
    items,
  };

  return c.json({ success: true, data: bundle });
});

import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  createShareToken,
  listShareTokensForResource,
  deleteShareToken,
} from "../../db/instance/share_tokens.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import type { ShareVizBundle } from "lib";

export const routesShare = new Hono();

// Create share link
routesShare.post("/share/viz", requireGlobalPermission(), async (c) => {
  const body = await c.req.json<{ resourceId: string; bundle: ShareVizBundle }>();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const token = await createShareToken(
    mainDb,
    "visualization",
    body.resourceId,
    body.bundle,
    c.var.globalUser.email,
  );
  return c.json({ success: true, token });
});

// List share links for a visualization
routesShare.get("/share/viz", requireGlobalPermission(), async (c) => {
  const resourceId = c.req.query("resourceId");
  if (!resourceId) {
    return c.json({ success: false, error: "resourceId required" }, 400);
  }
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const tokens = await listShareTokensForResource(mainDb, "visualization", resourceId);
  return c.json({ success: true, tokens });
});

// Delete share link
routesShare.delete("/share/viz/:token", requireGlobalPermission(), async (c) => {
  const token = c.req.param("token");
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const deleted = await deleteShareToken(mainDb, token, c.var.globalUser.email);
  return c.json({ success: deleted });
});

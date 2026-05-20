import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  createShareToken,
  listShareTokensForResource,
  listShareTokensForResources,
  deleteShareToken,
  updateShareToken,
} from "../../db/instance/share_tokens.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import type { ShareVizBundle } from "lib";

export const routesShare = new Hono();

// Create share link
routesShare.post("/api/share/viz", requireGlobalPermission(), async (c) => {
  const body = await c.req.json<{ resourceId: string; bundle: ShareVizBundle; slug?: string; password?: string }>();
  const slug = body.slug?.trim() || null;
  const password = body.password?.trim() || null;
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  try {
    const token = await createShareToken(
      mainDb,
      "visualization",
      body.resourceId,
      body.bundle,
      c.var.globalUser.email,
      slug,
      password,
    );
    return c.json({ success: true, token, slug });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return c.json({ success: false, error: "slug_taken" }, 409);
    }
    throw err;
  }
});

// List share links for a visualization
routesShare.get("/api/share/viz", requireGlobalPermission(), async (c) => {
  const resourceId = c.req.query("resourceId");
  if (!resourceId) {
    return c.json({ success: false, error: "resourceId required" }, 400);
  }
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const tokens = await listShareTokensForResource(mainDb, "visualization", resourceId);
  return c.json({ success: true, tokens });
});

// List share links for multiple visualizations
routesShare.post("/api/share/viz/all", requireGlobalPermission(), async (c) => {
  const body = await c.req.json<{ resourceIds: string[] }>();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const tokens = await listShareTokensForResources(mainDb, "visualization", body.resourceIds);
  return c.json({ success: true, tokens });
});

// Edit share link (slug and/or password)
routesShare.patch("/api/share/viz/:token", requireGlobalPermission(), async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json<{
    slug: string | null;
    passwordAction: "keep" | "clear" | "set";
    newPassword?: string;
  }>();
  const passwordOp =
    body.passwordAction === "keep"
      ? ("keep" as const)
      : body.passwordAction === "clear"
        ? ("clear" as const)
        : { newPassword: body.newPassword! };
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  try {
    const updated = await updateShareToken(mainDb, token, body.slug, passwordOp);
    return c.json({ success: updated });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return c.json({ success: false, error: "slug_taken" }, 409);
    }
    throw err;
  }
});

// Delete share link
routesShare.delete("/api/share/viz/:token", requireGlobalPermission(), async (c) => {
  const token = c.req.param("token");
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const deleted = await deleteShareToken(mainDb, token, c.var.globalUser.email);
  return c.json({ success: deleted });
});

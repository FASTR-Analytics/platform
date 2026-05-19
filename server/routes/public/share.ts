import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getShareTokenData } from "../../db/instance/share_tokens.ts";

export const routesPublicShare = new Hono();

routesPublicShare.get("/api/share/viz/:token", async (c) => {
  const token = c.req.param("token");
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const result = await getShareTokenData(mainDb, token);
  if (!result) return c.json({ success: false, err: "Not found" }, 404);
  if (!("data" in result)) return c.json({ success: false, requiresPassword: true }, 401);
  return c.json({ success: true, data: result.data });
});

routesPublicShare.post("/api/share/viz/:token", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json<{ password: string }>();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const result = await getShareTokenData(mainDb, token, body.password);
  if (!result) return c.json({ success: false, err: "Not found" }, 404);
  if ("requiresPassword" in result) return c.json({ success: false, requiresPassword: true }, 401);
  if ("wrongPassword" in result) return c.json({ success: false, wrongPassword: true }, 401);
  return c.json({ success: true, data: result.data });
});

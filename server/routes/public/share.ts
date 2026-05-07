import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getShareTokenData } from "../../db/instance/share_tokens.ts";

export const routesPublicShare = new Hono();

routesPublicShare.get("/api/share/viz/:token", async (c) => {
  const token = c.req.param("token");
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const data = await getShareTokenData(mainDb, token);
  if (!data) {
    return c.json({ success: false, err: "Not found" }, 404);
  }
  return c.json({ success: true, data });
});

import { createMiddleware } from "hono/factory";
import type { GlobalUser } from "lib";
import { checkAssetsVisibleToUser } from "../db/instance/assets.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";

/**
 * By-name asset read gate for routes whose JSON body names assets (keys may
 * be dotted, e.g. "config.fileName"): refuses
 * when any named asset is private and hidden from the caller, with the same
 * "no longer in assets" envelope a missing file gets. Mount AFTER the
 * permission guard (it needs c.var.globalUser). Hono caches the parsed body,
 * so defineRoute's own validation reads it again for free.
 */
export function requireVisibleAssets(...bodyKeys: string[]) {
  return createMiddleware<{ Variables: { globalUser: GlobalUser } }>(
    async (c, next) => {
      if (c.req.method === "OPTIONS") {
        await next();
        return;
      }
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // No JSON body: nothing named, defineRoute reports the shape error.
      }
      const names = bodyKeys
        .map((k) =>
          k.split(".").reduce<unknown>(
            (v, part) =>
              v !== null && typeof v === "object"
                ? (v as Record<string, unknown>)[part]
                : undefined,
            body,
          )
        )
        .filter((v): v is string => typeof v === "string" && v !== "");
      if (names.length > 0) {
        const res = await checkAssetsVisibleToUser(
          getPgConnectionFromCacheOrNew("main", "READ_ONLY"),
          names,
          c.var.globalUser,
        );
        if (!res.success) {
          return c.json(res);
        }
      }
      await next();
    },
  );
}

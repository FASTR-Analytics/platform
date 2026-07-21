import { Hono } from "hono";
import { compareDottedVersions, type WhatsNewPost } from "lib";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { _SERVER_VERSION } from "../../exposed_env_vars.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesWhatsNew = new Hono();

const WHATS_NEW_URL = "https://status-api.fastr-analytics.org/api/whats-new/posts";
const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;

let cache: { posts: WhatsNewPost[]; expires: number } | null = null;

// Fail-silent by design: this feeds a login-time popup, so an unreachable
// status-api must never surface as an error — serve stale if warm, [] if cold.
async function getPublishedPosts(): Promise<WhatsNewPost[]> {
  if (cache && cache.expires > Date.now()) {
    return cache.posts;
  }
  try {
    const res = await fetch(WHATS_NEW_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const posts = ((await res.json()).posts ?? []) as WhatsNewPost[];
    cache = { posts, expires: Date.now() + CACHE_TTL_MS };
    return posts;
  } catch (err) {
    console.error("[whats_new] fetch failed:", err);
    return cache?.posts ?? [];
  }
}

// Ad-hoc/test deploys have a non-dotted SERVER_VERSION (e.g. "test-feature-x"),
// which the numeric compare can't order — skip the version gate there so
// testers see every published post.
const _VERSION_GATE_ACTIVE = /^\d+\.\d+\.\d+$/.test(_SERVER_VERSION);

defineRoute(routesWhatsNew, "getWhatsNewPosts", requireGlobalPermission(), async (c) => {
  if (!c.var.globalUser.approved) {
    return c.json({ success: true, data: [] });
  }
  const posts = await getPublishedPosts();
  const eligible = posts.filter((p) =>
    p.published &&
    (!_VERSION_GATE_ACTIVE || compareDottedVersions(p.version, _SERVER_VERSION) <= 0) &&
    (!p.adminsOnly || c.var.globalUser.isGlobalAdmin)
  );
  return c.json({ success: true, data: eligible });
});

import { Hono } from "hono";
import { compareDottedVersions, type WhatsNewPost } from "lib";
import { AddLog } from "../../db/instance/user_logs.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { _SERVER_VERSION } from "../../exposed_env_vars.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesWhatsNew = new Hono();

const WHATS_NEW_URL = "https://status-api.fastr-analytics.org/api/whats-new/posts";
const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_POSTS = 20;

let cache: { posts: WhatsNewPost[]; expires: number } | null = null;
let inflight: Promise<WhatsNewPost[]> | null = null;

// Upstream data is authored on another server — drop anything malformed
// before it can reach the filter/render path (a bad post must not 500 this
// route, let alone get cached for the next 5 minutes).
function sanitizePosts(raw: unknown): WhatsNewPost[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is WhatsNewPost =>
      !!p && typeof p === "object" &&
      typeof p.id === "string" &&
      typeof p.version === "string" &&
      !!p.title && typeof p.title === "object" &&
      Array.isArray(p.pages)
    )
    .sort((a, b) => compareDottedVersions(b.version, a.version))
    .slice(0, MAX_POSTS);
}

// Fail-silent by design: this feeds a login-time popup, so an unreachable
// status-api must never surface as an error — serve stale if warm, [] if
// cold. Concurrent cold-cache requests share one upstream fetch.
function getPublishedPosts(): Promise<WhatsNewPost[]> {
  if (cache && cache.expires > Date.now()) {
    return Promise.resolve(cache.posts);
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    try {
      const res = await fetch(WHATS_NEW_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const posts = sanitizePosts((await res.json()).posts);
      cache = { posts, expires: Date.now() + CACHE_TTL_MS };
      return posts;
    } catch (err) {
      console.error("[whats_new] fetch failed:", err);
      return cache?.posts ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
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

// Popup telemetry, written through the user-log pipeline's writer. The post
// id is encoded in the endpoint name (not the details blob) so per-post
// counts survive the 7-day rollup into user_logs_aggregate.
defineRoute(routesWhatsNew, "recordWhatsNewEvent", requireGlobalPermission(), async (c, { body }) => {
  if (c.var.globalUser.approved) {
    AddLog(
      c.var.mainDb,
      c.var.globalUser.email,
      `whats_new_${body.event}:${body.postId}`,
      "200",
    ).catch(() => {});
  }
  return c.json({ success: true });
});

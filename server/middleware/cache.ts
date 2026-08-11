import type { Context, Next } from "hono";

export const cacheMiddleware = async (c: Context, next: Next) => {
  await next();

  const url = new URL(c.req.url);
  const path = url.pathname;

  // Skip caching for API routes
  if (path.startsWith("/api/") || path.startsWith("/streaming/")) {
    c.header("Cache-Control", "no-store");
    return;
  }

  // Only cache successful responses
  if (c.res.status < 200 || c.res.status >= 400 || c.res.status === 302) {
    return;
  }

  // The SPA shell is unhashed, so freshness must be explicit: with no
  // directive a browser MAY reuse a stale copy heuristically (RFC 9111
  // §4.2.2), and a stale shell references the previous build's hashed
  // bundles, which ARE served immutable. Defensive hardening — no observed
  // incident was traced to heuristic shell caching (with no validator the
  // major engines' heuristics effectively don't cache it). Revalidate the
  // shell on every load; the hashed assets keep their immutable year.
  if (c.res.headers.get("content-type")?.includes("text/html")) {
    c.header("Cache-Control", "no-cache, must-revalidate");
    return;
  }

  // Cache logo.png for 1 year
  if (path.endsWith("/logo.png")) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Cache fonts for 1 year
  else if (/\.(woff2?|ttf|otf|eot)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Cache content-hashed CSS/JS for 1 year. Vite's hash is base64url, so it
  // can contain "-" and "_" (index-pRqhO-X5.js) — an [a-zA-Z0-9]+ pattern
  // misses those and silently drops them to the 1-hour branch below. Anchored
  // to exactly Vite's 8-char hash immediately before the extension so an
  // unhashed, hyphenated name (my-component-name.js) can never match and get
  // pinned immutable for a year.
  else if (/-[a-zA-Z0-9_-]{8}\.(css|js)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Cache other CSS/JS for 1 hour (no hash)
  else if (/\.(css|js)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=3600");
  }
  // Cache images for 1 day
  else if (/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=86400");
  }
  // Data files are permission-gated (S1's static tier + run outputs), so the
  // response depends on who asked — shared caches must never store it.
  else if (/\.(csv|xlsx?|zip)$/i.test(path)) {
    c.header("Cache-Control", "private, no-store");
  }
  // Cache JSON/XML files for 5 minutes
  else if (/\.(json|xml)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=300");
  }
};
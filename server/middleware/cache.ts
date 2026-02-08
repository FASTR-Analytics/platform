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

  // Cache logo.png for 1 year
  if (path.endsWith("/logo.png")) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Cache fonts for 1 year
  else if (/\.(woff2?|ttf|otf|eot)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Cache CSS/JS for 1 year (assuming they have hash in filename)
  else if (/\.(css|js)$/i.test(path) && /-[a-zA-Z0-9]{8,}\./i.test(path)) {
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
  // Cache JSON/data files for 5 minutes
  else if (/\.(json|csv|xml)$/i.test(path)) {
    c.header("Cache-Control", "public, max-age=300");
  }
};
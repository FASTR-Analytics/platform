import { cors } from "hono/cors";
import { _CLIENT_ORIGINS } from "../exposed_env_vars.ts";

export const corsMiddleware = cors({
  origin: _CLIENT_ORIGINS,
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
  allowHeaders: [
    "Content-Type",
    "Upload-Length",
    "Upload-Offset",
    "Upload-Metadata",
    "Tus-Resumable",
    "X-Requested-With",
    // Allow all Anthropic SDK headers (x-stainless-*, anthropic-*, x-api-key)
    "*",
  ],
  exposeHeaders: [
    // The copilot proxy's quota rejection tells the SDK not to retry; across
    // origins (the dev client) the SDK reads the header only if it is exposed.
    "x-should-retry",
    "Location",
    "Upload-Offset",
    "Upload-Length",
    "Tus-Resumable",
    "Tus-Version",
    "Tus-Extension",
    "Tus-Max-Size",
    "X-Upload-Complete",
    "X-Upload-Filename",
  ],
});

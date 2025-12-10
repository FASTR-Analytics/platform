import { cors } from "hono/cors";

const allowedOrigins = Deno.env.get("CLIENT_ORIGIN")?.split(",") || [
  "http://localhost:3000",
  "http://localhost:3001",
];

export const corsMiddleware = cors({
  origin: allowedOrigins,
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
  allowHeaders: [
    "Content-Type",
    "Project-Id",
    "Upload-Length",
    "Upload-Offset",
    "Upload-Metadata",
    "Tus-Resumable",
    "X-Requested-With",
    // Allow all Anthropic SDK headers (x-stainless-*, anthropic-*, x-api-key)
    "*",
  ],
  exposeHeaders: [
    "Location",
    "Upload-Offset", 
    "Upload-Length",
    "Tus-Resumable",
    "Tus-Version",
    "Tus-Extension",
    "Tus-Max-Size",
    "X-Upload-Complete",
    "X-Upload-Filename",
    "X-Upload-Final-Path"
  ],
});
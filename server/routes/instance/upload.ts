import { Hono } from "hono";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { getGlobalAdmin } from "../../project_auth.ts";

export const routesUpload = new Hono();

// Ensure CORS headers are set for all upload routes
routesUpload.use("*", async (c, next) => {
  await next();
  // Ensure these headers are always present
  if (
    c.req.method === "HEAD" ||
    c.req.method === "PATCH" ||
    c.req.method === "POST"
  ) {
    c.header("Tus-Resumable", "1.0.0");
  }
});

// TUS protocol implementation for resumable uploads
// https://tus.io/protocols/resumable-upload

// In-memory storage for upload metadata (in production, use a database)
const uploads = new Map<
  string,
  {
    id: string;
    filename: string;
    size: number;
    offset: number;
    createdAt: Date;
    metadata?: Record<string, string>;
  }
>();

// TUS upload directory
const TUS_UPLOAD_DIR = join(_ASSETS_DIR_PATH, ".tus-uploads");

// Ensure upload directory exists
await ensureDir(TUS_UPLOAD_DIR);

// Helper function to cleanup old uploads
function cleanupOldUploads() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [id, upload] of uploads.entries()) {
    if (now - upload.createdAt.getTime() > maxAge) {
      // Remove from memory
      uploads.delete(id);

      // Remove temporary file
      const filePath = join(TUS_UPLOAD_DIR, id);
      Deno.remove(filePath).catch(() => {
        // File might already be gone
      });
    }
  }
}

// Call cleanup on each new upload (lightweight check)
// This ensures cleanup happens regularly without timers

// Helper to generate unique upload ID
function generateUploadId(): string {
  return crypto.randomUUID();
}

// Helper to parse metadata header
function parseMetadata(metadataHeader: string | null): Record<string, string> {
  if (!metadataHeader) return {};

  const metadata: Record<string, string> = {};
  const pairs = metadataHeader.split(",");

  for (const pair of pairs) {
    const [key, value] = pair.trim().split(" ");
    if (key && value) {
      // Decode base64 value
      metadata[key] = atob(value);
    }
  }

  return metadata;
}

// POST /upload - Create new upload
routesUpload.post("/upload", getGlobalAdmin, async (c) => {
  // Cleanup old uploads when starting a new one
  cleanupOldUploads();

  const uploadLength = c.req.header("Upload-Length");
  const uploadMetadata = c.req.header("Upload-Metadata") || null;

  if (!uploadLength) {
    c.status(400);
    return c.text("Upload-Length header required");
  }

  const size = parseInt(uploadLength);
  if (isNaN(size) || size < 0) {
    c.status(400);
    return c.text("Invalid Upload-Length");
  }

  // Parse metadata to get filename
  const metadata = parseMetadata(uploadMetadata);
  const filename = metadata.filename || `upload-${Date.now()}`;

  // Create upload record
  const uploadId = generateUploadId();
  const upload = {
    id: uploadId,
    filename,
    size,
    offset: 0,
    createdAt: new Date(),
    metadata,
  };

  uploads.set(uploadId, upload);

  // Create empty file
  const filePath = join(TUS_UPLOAD_DIR, uploadId);
  
  // Ensure directory exists before creating file
  await ensureDir(TUS_UPLOAD_DIR);
  
  const file = await Deno.create(filePath);
  file.close();

  // Return 201 Created with Location header
  // TUS clients expect a full URL in the Location header
  const host = c.req.header("host") || "localhost:8000";
  const protocol = c.req.header("x-forwarded-proto") || "http";
  const location = `${protocol}://${host}/upload/${uploadId}`;

  c.status(201);
  c.header("Location", location);
  c.header("Tus-Resumable", "1.0.0");

  return c.body(null);
});

// HEAD /upload/:id - Get upload status
// Note: Removing auth middleware temporarily to debug
routesUpload.on("HEAD", "/upload/:id", async (c) => {
  const uploadId = c.req.param("id");
  const upload = uploads.get(uploadId);

  console.log(`[HEAD] Upload ID: ${uploadId}, exists: ${!!upload}`);

  const clientOrigin = Deno.env.get("CLIENT_ORIGIN") || "http://localhost:3000";

  if (!upload) {
    c.status(404);
    c.header("Tus-Resumable", "1.0.0");
    // Also set CORS headers for 404 response
    c.header("Access-Control-Allow-Origin", clientOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header(
      "Access-Control-Expose-Headers",
      "Upload-Offset, Upload-Length, Tus-Resumable, Cache-Control"
    );
    return c.text("");
  }

  // Get actual file size to determine offset
  const filePath = join(TUS_UPLOAD_DIR, uploadId);
  try {
    const fileInfo = await Deno.stat(filePath);
    upload.offset = fileInfo.size;
  } catch {
    upload.offset = 0;
  }

  // Set status first
  c.status(200);

  // Then set headers
  c.header("Upload-Offset", upload.offset.toString());
  c.header("Upload-Length", upload.size.toString());
  c.header("Tus-Resumable", "1.0.0");
  c.header("Cache-Control", "no-store");

  // IMPORTANT: Explicitly set CORS headers for this response
  c.header("Access-Control-Allow-Origin", clientOrigin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header(
    "Access-Control-Expose-Headers",
    "Upload-Offset, Upload-Length, Tus-Resumable, Cache-Control"
  );

  // Use c.text with empty string instead of c.body(null) for HEAD requests
  return c.text("");
});

// PATCH /upload/:id - Upload chunk
routesUpload.patch("/upload/:id", getGlobalAdmin, async (c) => {
  const uploadId = c.req.param("id");
  const upload = uploads.get(uploadId);

  if (!upload) {
    c.status(404);
    return c.text("Upload not found");
  }

  // Check Upload-Offset header
  const uploadOffset = c.req.header("Upload-Offset");
  if (!uploadOffset) {
    c.status(400);
    return c.text("Upload-Offset header required");
  }

  const offset = parseInt(uploadOffset);
  if (isNaN(offset) || offset !== upload.offset) {
    c.status(409);
    return c.text(`Expected offset ${upload.offset}, got ${offset}`);
  }

  // Check content type
  const contentType = c.req.header("Content-Type");
  if (contentType !== "application/offset+octet-stream") {
    c.status(415);
    return c.text("Content-Type must be application/offset+octet-stream");
  }

  // Get request body
  const body = c.req.raw.body;
  if (!body) {
    c.status(400);
    return c.text("No request body");
  }

  // Open file for appending
  const filePath = join(TUS_UPLOAD_DIR, uploadId);
  const file = await Deno.open(filePath, { write: true, create: false });

  try {
    // Seek to current offset
    await file.seek(offset, Deno.SeekMode.Start);

    // Stream body to file
    const reader = body.getReader();
    let bytesWritten = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await file.write(value);
      bytesWritten += value.length;
    }

    // Update offset
    upload.offset += bytesWritten;

    // Check if upload is complete
    if (upload.offset >= upload.size) {
      // Move file to final location
      const finalPath = join(_ASSETS_DIR_PATH, upload.filename);
      await Deno.rename(filePath, finalPath);

      // Delete the upload record immediately
      uploads.delete(uploadId);

      // Return success response with all necessary information
      c.status(204);
      c.header("Upload-Offset", upload.size.toString());
      c.header("Tus-Resumable", "1.0.0");
      c.header("X-Upload-Complete", "true");
      c.header("X-Upload-Filename", upload.filename);
      c.header("X-Upload-Final-Path", finalPath);

      return c.body(null);
    }

    // Return progress response
    c.status(204);
    c.header("Upload-Offset", upload.offset.toString());
    c.header("Tus-Resumable", "1.0.0");

    return c.body(null);
  } finally {
    file.close();
  }
});

// DELETE /upload/:id - Cancel upload
routesUpload.delete("/upload/:id", getGlobalAdmin, async (c) => {
  const uploadId = c.req.param("id");
  const upload = uploads.get(uploadId);

  if (!upload) {
    c.status(404);
    return c.text("Upload not found");
  }

  // Delete temporary file
  const filePath = join(TUS_UPLOAD_DIR, uploadId);
  try {
    await Deno.remove(filePath);
  } catch {
    // File might not exist
  }

  // Remove upload record
  uploads.delete(uploadId);

  c.status(204);
  c.header("Tus-Resumable", "1.0.0");

  return c.body(null);
});

// OPTIONS /upload - CORS preflight
routesUpload.options("/upload", (c) => {
  c.status(204);
  c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Upload-Length, Upload-Offset, Upload-Metadata, Tus-Resumable, X-Requested-With"
  );
  c.header("Access-Control-Max-Age", "86400");
  c.header("Tus-Resumable", "1.0.0");
  c.header("Tus-Version", "1.0.0");
  c.header("Tus-Extension", "creation,termination");

  return c.text("");
});

// OPTIONS /upload/:id - CORS preflight for specific upload
routesUpload.options("/upload/:id", (c) => {
  c.status(204);
  c.header("Access-Control-Allow-Methods", "HEAD, PATCH, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Upload-Length, Upload-Offset, Upload-Metadata, Tus-Resumable, X-Requested-With"
  );
  c.header("Access-Control-Max-Age", "86400");
  c.header("Tus-Resumable", "1.0.0");
  c.header("Tus-Version", "1.0.0");

  return c.text("");
});

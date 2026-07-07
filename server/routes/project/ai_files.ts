import { Hono } from "hono";
import { resolveAssetFilePath } from "../../db/instance/assets.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import {
  _ANTHROPIC_API_KEY,
  _ANTHROPIC_API_URL,
} from "../../exposed_env_vars.ts";

export const routesAiFiles = new Hono();

// The Anthropic Files endpoint. _ANTHROPIC_API_URL is the /v1/messages
// endpoint, so the Files URL is derived from the same origin rather than
// re-hardcoding a host.
const ANTHROPIC_FILES_URL = new URL("/v1/files", _ANTHROPIC_API_URL).toString();
const FILES_API_BETA_HEADER = "files-api-2025-04-14";

// POST /files - Upload a file from assets to Anthropic
routesAiFiles.post("/files", requireProjectPermission(), async (c) => {
  const apiKey = _ANTHROPIC_API_KEY;

  const body = await c.req.json();
  const { assetFilename } = body as { assetFilename: string };

  if (!assetFilename) {
    return c.json({ error: { message: "assetFilename is required" } }, 400);
  }

  // Read file from assets
  let filePath: string;
  try {
    filePath = resolveAssetFilePath(assetFilename);
  } catch {
    return c.json({ error: { message: "Invalid filename" } }, 400);
  }
  let fileData: Uint8Array;
  try {
    fileData = await Deno.readFile(filePath);
  } catch {
    return c.json({ error: { message: "File not found in assets" } }, 404);
  }

  // Create FormData for Anthropic Files API
  const formData = new FormData();
  const blob = new Blob([fileData.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  formData.append("file", blob, assetFilename);

  const response = await fetch(ANTHROPIC_FILES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": FILES_API_BETA_HEADER,
    },
    body: formData,
  });

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});

// GET /files/:file_id - Get file metadata from Anthropic
routesAiFiles.get("/files/:file_id", requireProjectPermission(), async (c) => {
  const apiKey = _ANTHROPIC_API_KEY;

  const fileId = c.req.param("file_id");

  const response = await fetch(`${ANTHROPIC_FILES_URL}/${fileId}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": FILES_API_BETA_HEADER,
    },
  });

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});

// DELETE /files/:file_id - Delete file from Anthropic
routesAiFiles.delete(
  "/files/:file_id",
  requireProjectPermission(),
  async (c) => {
    const apiKey = _ANTHROPIC_API_KEY;

    const fileId = c.req.param("file_id");

    const response = await fetch(`${ANTHROPIC_FILES_URL}/${fileId}`, {
      method: "DELETE",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": FILES_API_BETA_HEADER,
      },
    });

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  },
);

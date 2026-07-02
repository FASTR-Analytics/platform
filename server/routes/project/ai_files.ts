import { Hono } from "hono";
import { resolveAssetFilePath } from "../../db/instance/assets.ts";
import { requireProjectPermission } from "../../project_auth.ts";

export const routesAiFiles = new Hono();

const ANTHROPIC_FILES_URL = "https://api.anthropic.com/v1/files";
const FILES_API_BETA_HEADER = "files-api-2025-04-14";

// POST /files - Upload a file from assets to Anthropic
routesAiFiles.post("/files", requireProjectPermission(), async (c) => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return c.json({ error: { message: "API key not configured" } }, 500);
  }

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
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return c.json({ error: { message: "API key not configured" } }, 500);
  }

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
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return c.json({ error: { message: "API key not configured" } }, 500);
    }

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

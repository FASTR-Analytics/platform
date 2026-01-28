import { Hono } from "hono";
import { join } from "@std/path";
import { getGlobalNonAdmin, getProjectEditor, getProjectViewer } from "../../project_auth.ts";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";

export const routesAiFiles = new Hono();

const ANTHROPIC_FILES_URL = "https://api.anthropic.com/v1/files";
const FILES_API_BETA_HEADER = "files-api-2025-04-14";

// POST /files - Upload a file from assets to Anthropic
routesAiFiles.post(
  "/files",
  getGlobalNonAdmin,
  getProjectEditor,
  async (c) => {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return c.json({ error: { message: "API key not configured" } }, 500);
    }

    const body = await c.req.json();
    const { assetFilename } = body as { assetFilename: string };

    if (!assetFilename) {
      return c.json({ error: { message: "assetFilename is required" } }, 400);
    }

    // Validate filename doesn't contain path traversal
    if (assetFilename.includes("..") || assetFilename.includes("/")) {
      return c.json({ error: { message: "Invalid filename" } }, 400);
    }

    // Read file from assets
    const filePath = join(_ASSETS_DIR_PATH, assetFilename);
    let fileData: Uint8Array;
    try {
      fileData = await Deno.readFile(filePath);
    } catch {
      return c.json({ error: { message: "File not found in assets" } }, 404);
    }

    // Create FormData for Anthropic Files API
    const formData = new FormData();
    const blob = new Blob([fileData.buffer as ArrayBuffer], { type: "application/pdf" });
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
  }
);

// GET /files/:file_id - Get file metadata from Anthropic
routesAiFiles.get(
  "/files/:file_id",
  getGlobalNonAdmin,
  getProjectViewer,
  async (c) => {
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
  }
);

// DELETE /files/:file_id - Delete file from Anthropic
routesAiFiles.delete(
  "/files/:file_id",
  getGlobalNonAdmin,
  getProjectEditor,
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
  }
);

import { Hono } from "hono";
import { getGlobalNonAdmin } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { _SANDBOX_DIR_PATH, _INSTANCE_ID } from "../../exposed_env_vars.ts";
import { join } from "@std/path";

export const routesBackups = new Hono();

interface BackupFileInfo {
  name: string;
  size: number;
  type: "main" | "project" | "metadata" | "log" | "other";
}

interface ProjectBackupInfo {
  project_id: string;
  project_label: string;
  folder: string;
  timestamp: string;
  backup_date: string;
  size: number;
  file_count: number;
  files: BackupFileInfo[];
}

// Get all project backups across all projects from external API
defineRoute(
  routesBackups,
  "getAllProjectsBackups",
  getGlobalNonAdmin,
  async (c) => {
    try {
      // Get the authorization header from the incoming request
      const authHeader = c.req.header('Authorization');

      if (!authHeader) {
        return c.json({
          success: false,
          backups: [],
          error: "Authorization header required"
        }, 401);
      }

      // Forward the request to the external API with the same auth token
      const response = await fetch(
        `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backups`,
        {
          headers: {
            'Authorization': authHeader,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch backups: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const allBackups = data.backups || [];

      return c.json({
        success: true,
        backups: allBackups
      });
    } catch (error) {
      console.error("Error fetching all project backups:", error);
      return c.json({
        success: false,
        backups: [],
        error: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  }
);

// Download a specific backup file
defineRoute(
  routesBackups,
  "downloadBackupFile",
  getGlobalNonAdmin,
  async (c) => {
    try {
      const folder = c.req.param("folder");
      const fileName = c.req.param("file");

      // Security: Prevent directory traversal
      if (
        !folder ||
        !fileName ||
        folder.includes("..") ||
        fileName.includes("..") ||
        folder.includes("/") ||
        fileName.includes("/")
      ) {
        return c.json({ error: "Invalid path" }, 400);
      }

      // Get the authorization header from the incoming request
      const authHeader = c.req.header('Authorization');

      if (!authHeader) {
        return c.json({
          success: false,
          error: "Authorization header required"
        }, 401);
      }

      // Fetch the file from the external API
      const response = await fetch(
        `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backups/${folder}/${fileName}`,
        {
          headers: {
            'Authorization': authHeader,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to download file: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      // Log response headers for debugging
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response content-type:', response.headers.get('content-type'));

      // Get the file content
      const fileContent = await response.arrayBuffer();
      console.log('File content size:', fileContent.byteLength);

      // Determine content type
      let contentType = "application/octet-stream";
      if (fileName.endsWith(".gz")) {
        contentType = "application/gzip";
      } else if (fileName.endsWith(".json")) {
        contentType = "application/json";
      } else if (fileName.endsWith(".log")) {
        contentType = "text/plain";
      } else if (fileName.endsWith(".sql")) {
        contentType = "text/plain";
      }

      // Return the file with appropriate headers
      return new Response(fileContent, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": fileContent.byteLength.toString(),
        },
      });
    } catch (error) {
      console.error("Error downloading backup file:", error);
      return c.json({ error: "File not found" }, 404);
    }
  }
);

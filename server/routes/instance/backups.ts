import { Hono } from "hono";
import { getGlobalNonAdmin } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { _SANDBOX_DIR_PATH, _INSTANCE_ID, _PG_HOST, _PG_PORT, _PG_PASSWORD } from "../../exposed_env_vars.ts";
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

// Create a backup file
defineRoute(
  routesBackups,
  "createBackupFile",
  getGlobalNonAdmin,
  async (c) => {
    try{
      const name = c.req.param("name");

      if (
        !name ||
        name.includes("..") ||
        name.includes("/") ||
        name.includes("\\") ||
        name.includes("\0") ||
        name.trim() !== name ||
        name.startsWith(".") ||
        name.length > 255
      ) {
        return c.json({ 
          success: false, 
          error: "Invalid backup name" 
        }, 400);
      }

      const authHeader = c.req.header('Authorization');

      if (!authHeader) {
        return c.json({
          success: false,
          error: "Authorization header required"
        }, 401);
      }

      // Call the external API to create backup
      const url = `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backup/${name}`;
      console.log('Calling backup API:', url, 'with name:', name);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to create backup: ${response.status} ${response.statusText}`, errorText);
        return c.json({
          success: false,
          error: `Failed to create backup: ${response.status} ${response.statusText}`
        }, response.status);
      }

      const data = await response.json();
      console.log('Backup API response:', data);

      // Check if the backup script itself failed
      if (!data.success) {
        console.error('Backup script failed:', data.error);
        return c.json({
          success: false,
          error: data.error || "Backup failed"
        }, 500);
      }

      // Success - backup script ran successfully
      return c.json({
        success: true,
        logs: data.logs
      });
    } catch (error) {
      console.error("Error downloading backup file:", error);
      return c.json({ error: "File not found" }, 404);
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

      console.log('Download params - folder:', folder, 'fileName:', fileName);

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

// Restore a backup to the project database
defineRoute(
  routesBackups,
  "restoreBackup",
  getGlobalNonAdmin,
  async (c) => {
    try {
      const { folder, fileName } = await c.req.json();

      // Security: Prevent directory traversal
      if (
        !folder ||
        !fileName ||
        folder.includes("..") ||
        fileName.includes("..") ||
        folder.includes("/") ||
        fileName.includes("/")
      ) {
        return c.json({
          success: false,
          error: "Invalid path"
        }, 400);
      }

      const authHeader = c.req.header('Authorization');

      if (!authHeader) {
        return c.json({
          success: false,
          error: "Authorization header required"
        }, 401);
      }

      console.log('Restoring backup - folder:', folder, 'fileName:', fileName);

      // Step 1: Download the pgdump file from external API
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
        console.error(`Failed to download backup file: ${response.status} ${response.statusText}`, errorText);
        return c.json({
          success: false,
          error: `Failed to download backup file: ${response.status} ${response.statusText}`
        }, 500);
      }

      // Step 2: Get the file content
      const fileContent = await response.arrayBuffer();
      console.log('Downloaded backup file, size:', fileContent.byteLength);

      // Step 3: Write to temporary file
      const tempPath = join(_SANDBOX_DIR_PATH, `restore_${Date.now()}.sql.gz`);
      await Deno.writeFile(tempPath, new Uint8Array(fileContent));
      console.log('Wrote backup to temp file:', tempPath);

      try {
        // Step 4: Extract project ID from filename
        // Filename format: <project_id>.sql.gz
        const projectIdMatch = fileName.match(/^([^.]+)\.sql\.gz$/);
        if (!projectIdMatch) {
          throw new Error("Invalid backup filename format. Expected: <project_id>.sql.gz");
        }
        const projectId = projectIdMatch[1];
        console.log('Extracted project ID:', projectId);

        // Step 5: Get database connection details from environment
        const dbHost = _PG_HOST;
        const dbPort = _PG_PORT;
        const dbUser = "postgres";
        const dbPassword = _PG_PASSWORD;
        const dbName = projectId;

        console.log('Database connection details:', {
          host: dbHost,
          port: dbPort,
          user: dbUser,
          database: dbName,
        });

        // Step 6: Execute restore command
        const command = new Deno.Command("sh", {
          args: [
            "-c",
            `gunzip -c "${tempPath}" | PGPASSWORD="${dbPassword}" psql -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}"`
          ],
          stdout: "piped",
          stderr: "piped",
        });

        const process = command.spawn();
        const { code, stdout, stderr } = await process.output();

        const stdoutText = new TextDecoder().decode(stdout);
        const stderrText = new TextDecoder().decode(stderr);

        console.log('Restore command stdout:', stdoutText);
        console.log('Restore command stderr:', stderrText);

        if (code !== 0) {
          console.error('Restore command failed with code:', code);
          return c.json({
            success: false,
            error: `Restore command failed: ${stderrText}`
          }, 500);
        }

        console.log('Successfully restored backup');
        return c.json({
          success: true,
        });
      } finally {
        // Clean up temporary file
        try {
          await Deno.remove(tempPath);
          console.log('Cleaned up temp file:', tempPath);
        } catch (err) {
          console.error('Failed to clean up temp file:', err);
        }
      }
    } catch (error) {
      console.error("Error restoring backup:", error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  }
);

import { Hono } from "hono";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  _SANDBOX_DIR_PATH,
  _INSTANCE_ID,
  _PG_HOST,
  _PG_PORT,
  _PG_PASSWORD,
  _STATUS_API_KEY,
} from "../../exposed_env_vars.ts";
import { join } from "@std/path";
import {
  getPgConnection,
  closePgConnection,
} from "../../db/postgres/connection_manager.ts";
import { runProjectMigrations } from "../../db/migrations/runner.ts";
import { log } from "../../middleware/mod.ts";

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
  requireProjectPermission("can_configure_settings"),
  async (c) => {
    try {
      // Get the authorization header from the incoming request
      const authHeader = c.req.header("Authorization");
      const secretKey = _STATUS_API_KEY;

      if (!authHeader) {
        return c.json({ success: false, err: "Authorization header required" }, 401);
      }

      // Forward the request to the external API with the same auth token
      const response = await fetch(
        `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backups`,
        {
          headers: {
            Authorization: authHeader,
            "status-api-key": secretKey || "",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch backups: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const allBackups = data.backups || [];

      return c.json({
        success: true,
        backups: allBackups,
      });
    } catch (error) {
      console.error("Error fetching all project backups:", error);
      return c.json(
        { success: false, err: error instanceof Error ? error.message : "Unknown error" },
        500,
      );
    }
  },
);

// Create a backup file
defineRoute(
  routesBackups,
  "createBackupFile",
  requireProjectPermission("can_create_backups"),
  log("createBackupFile"),
  async (c) => {
    try {
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
        return c.json({ success: false, err: "Invalid backup name" }, 400);
      }

      const authHeader = c.req.header("Authorization");
      const secretKey = _STATUS_API_KEY;

      if (!authHeader) {
        return c.json({ success: false, err: "Authorization header required" }, 401);
      }

      // Call the external API to create backup
      const url = `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backup/${name}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "status-api-key": secretKey || "",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to create backup: ${response.status} ${response.statusText}`, errorText);
        return c.json(
          { success: false, err: `Failed to create backup: ${response.status} ${response.statusText}` },
          response.status as 400 | 401 | 403 | 404 | 500 | 502 | 503,
        );
      }

      const data = await response.json();

      // Check if the backup script itself failed
      if (!data.success) {
        console.error("Backup script failed:", data.error);
        return c.json({ success: false, err: data.error || "Backup failed" }, 500);
      }

      // Success - backup script ran successfully
      return c.json({
        success: true,
        logs: data.logs,
      });
    } catch (error) {
      console.error("Error creating backup file:", error);
      return c.json(
        { success: false, err: error instanceof Error ? error.message : "Unknown error" },
        500,
      );
    }
  },
);

// Download a specific backup file
defineRoute(
  routesBackups,
  "downloadBackupFile",
  requireProjectPermission("can_restore_backups"),
  log("downloadBackupFile"),
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
        return c.json({ success: false, err: "Invalid path" }, 400);
      }

      // Get the authorization header from the incoming request
      const authHeader = c.req.header("Authorization");
      const secretKey = _STATUS_API_KEY;

      if (!authHeader) {
        return c.json({ success: false, err: "Authorization header required" }, 401);
      }

      // Fetch the file from the external API
      const response = await fetch(
        `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backups/${folder}/${fileName}`,
        {
          headers: {
            Authorization: authHeader,
            "status-api-key": secretKey || "",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to download file: ${response.status} ${response.statusText}`,
          errorText,
        );
        throw new Error(
          `Failed to download file: ${response.status} ${response.statusText}`,
        );
      }

      // Get the file content
      const fileContent = await response.arrayBuffer();

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

      // Binary download — not a JSON envelope; cast to satisfy RouteHandler return type.
      return new Response(fileContent, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": fileContent.byteLength.toString(),
        },
      }) as any;
    } catch (error) {
      console.error("Error downloading backup file:", error);
      return c.json(
        { success: false, err: error instanceof Error ? error.message : "File not found" },
        404,
      );
    }
  },
);

// Restore a backup to the project database
defineRoute(
  routesBackups,
  "restoreBackup",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_restore_backups",
  ),
  log("restoreBackup"),
  async (c, { body }) => {
    try {
      const folder = body.folder;
      const fileName = body.fileName;
      const fileData = body.fileData;
      const projectId = c.var.ppk.projectId;

      let fileContent;
      if (!fileData) {
        // Security: Prevent directory traversal
        if (
          !folder ||
          !fileName ||
          folder.includes("..") ||
          fileName.includes("..") ||
          folder.includes("/") ||
          fileName.includes("/")
        ) {
          return c.json(
            {
              success: false,
              err: "Invalid path",
            },
            400,
          );
        }

        const authHeader = c.req.header("Authorization");
        const statusApiKey = _STATUS_API_KEY;

        if (!authHeader) {
          return c.json(
            {
              success: false,
              err: "Authorization header required",
            },
            401,
          );
        }

        // Step 1: Download the pgdump file from external API
        const response = await fetch(
          `https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/backups/${folder}/${fileName}`,
          {
            headers: {
              Authorization: authHeader,
              "status-api-key": statusApiKey || "",
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `Failed to download backup file: ${response.status} ${response.statusText}`,
            errorText,
          );
          return c.json(
            {
              success: false,
              err: `Failed to download backup file: ${response.status} ${response.statusText}`,
            },
            500,
          );
        }

        // Step 2: Get the file content
        fileContent = await response.arrayBuffer();
      } else {
        // Decode base64 file data
        const binaryString = atob(fileData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fileContent = bytes.buffer;
      }
      // Step 3: Write to temporary file
      const tempPath = join(_SANDBOX_DIR_PATH, `restore_${Date.now()}.sql.gz`);
      await Deno.writeFile(tempPath, new Uint8Array(fileContent));

      try {
        // Step 6: Decompress the gzipped SQL file
        const decompressCommand = new Deno.Command("gunzip", {
          args: [tempPath],
          stdout: "piped",
          stderr: "piped",
        });

        const decompressProcess = decompressCommand.spawn();
        const { code: decompressCode, stderr: decompressStderr } =
          await decompressProcess.output();

        if (decompressCode !== 0) {
          const stderrText = new TextDecoder().decode(decompressStderr);
          console.error("Decompress failed:", stderrText);
          return c.json(
            {
              success: false,
              err: `Failed to decompress backup: ${stderrText}`,
            },
            500,
          );
        }

        // After decompression, the file will be without .gz extension
        const decompressedPath = tempPath.replace(/\.gz$/, "");

        // Step 7: Drop and recreate the database for a clean restore

        // First, close any cached connections to the project database
        await closePgConnection(projectId);

        // Terminate all existing connections to ensure clean restore
        const postgresDb = getPgConnection("postgres");
        try {
          await postgresDb.unsafe(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '${projectId}'
              AND pid <> pg_backend_pid()
          `);

          // Small delay to ensure connections are fully terminated
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Drop and recreate the database for a clean slate
          await postgresDb.unsafe(`DROP DATABASE IF EXISTS "${projectId}"`);
          await postgresDb.unsafe(`CREATE DATABASE "${projectId}"`);
        } finally {
          await postgresDb.end();
        }

        // Now restore the backup using docker exec to run psql in the postgres container
        // The dump file contains all necessary DROP and CREATE statements

        const restoreCommand = new Deno.Command("docker", {
          args: [
            "exec",
            "-i",
            `${_INSTANCE_ID}-postgres`,
            "psql",
            "-U",
            "postgres",
            "-d",
            projectId,
          ],
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });

        const restoreProcess = restoreCommand.spawn();

        // Read the SQL file and pipe it to psql's stdin
        const sqlContent = await Deno.readFile(decompressedPath);

        const writer = restoreProcess.stdin.getWriter();
        await writer.write(sqlContent);
        await writer.close();

        const {
          code: restoreCode,
          stderr: restoreStderr,
          stdout: restoreStdout,
        } = await restoreProcess.output();

        const stderrText = new TextDecoder().decode(restoreStderr);
        const stdoutText = new TextDecoder().decode(restoreStdout);

        if (restoreCode !== 0) {
          console.error("Restore failed with code:", restoreCode);
          console.error("stderr:", stderrText);
          console.error("stdout:", stdoutText);

          // Clean up decompressed file
          try {
            await Deno.remove(decompressedPath);
          } catch (err) {
            console.error("Failed to clean up decompressed file:", err);
          }

          return c.json(
            {
              success: false,
              err: `Failed to restore backup: ${stderrText || stdoutText}`,
            },
            500,
          );
        }

        // A restored dump may carry an older schema (e.g. the pre-split
        // facilities table); bring it up to date now instead of waiting for
        // the next server restart.
        const restoredProjectDb = getPgConnection(projectId);
        await runProjectMigrations(restoredProjectDb);

        // Clean up decompressed file
        try {
          await Deno.remove(decompressedPath);
        } catch (err) {
          console.error("Failed to clean up decompressed file:", err);
        }

        return c.json({
          success: true,
        });
      } finally {
        // Clean up temporary file (gunzip removes the .gz file, so this might not exist)
        try {
          await Deno.remove(tempPath);
        } catch (err) {
          // Ignore NotFound errors - gunzip already removed the .gz file
          if (!(err instanceof Deno.errors.NotFound)) {
            console.error("Failed to clean up temp file:", err);
          }
        }
      }
    } catch (error) {
      console.error("Error restoring backup:", error);
      return c.json(
        {
          success: false,
          err: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

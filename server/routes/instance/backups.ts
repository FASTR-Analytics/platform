import { Hono } from "hono";
import { getGlobalNonAdmin } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { _SANDBOX_DIR_PATH, _INSTANCE_ID, _PG_HOST, _PG_PORT, _PG_PASSWORD } from "../../exposed_env_vars.ts";
import { join } from "@std/path";
import { getPgConnection, closePgConnection } from "../../db/postgres/connection_manager.ts";

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
      // Check content type to determine how to parse the request
      const contentType = c.req.header('Content-Type') || '';
      let folder: string | undefined;
      let fileName: string | undefined;
      let file: File | null = null;
      let projectId: string;

      if (contentType.includes('multipart/form-data')) {
        // Parse as FormData (file upload)
        const formData = await c.req.formData();
        folder = formData.get('folder') as string | undefined;
        fileName = formData.get('fileName') as string | undefined;
        file = formData.get('file') as File | null;
        projectId = formData.get('projectId') as string;
        console.log('Parsed FormData - file type:', file?.constructor.name, 'file:', file);
      } else {
        // Parse as JSON (existing backup restore)
        const body = await c.req.json() as { folder?: string; fileName?: string; file?: File; projectId: string };
        folder = body.folder;
        fileName = body.fileName;
        file = body.file || null;
        projectId = body.projectId;
        console.log('Parsed JSON - folder:', folder, 'fileName:', fileName);
      }

      let fileContent;
      if (!file) {
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
        fileContent = await response.arrayBuffer();
        console.log('Downloaded backup file, size:', fileContent.byteLength);
      } else {
        fileContent = await file.arrayBuffer();
        console.log('Received uploaded backup file, size:', fileContent.byteLength);
      }
      // Step 3: Write to temporary file
      const tempPath = join(_SANDBOX_DIR_PATH, `restore_${Date.now()}.sql.gz`);
      await Deno.writeFile(tempPath, new Uint8Array(fileContent));
      console.log('Wrote backup to temp file:', tempPath);

      try {

        // Step 5: Log database details for debugging
        console.log('Database connection details:', {
          host: _PG_HOST,
          port: _PG_PORT,
          user: "postgres",
          database: projectId,
        });

        // Step 6: Decompress the gzipped SQL file
        const decompressCommand = new Deno.Command("gunzip", {
          args: [tempPath],
          stdout: "piped",
          stderr: "piped",
        });

        const decompressProcess = decompressCommand.spawn();
        const { code: decompressCode, stderr: decompressStderr } = await decompressProcess.output();

        if (decompressCode !== 0) {
          const stderrText = new TextDecoder().decode(decompressStderr);
          console.error('Decompress failed:', stderrText);
          return c.json({
            success: false,
            error: `Failed to decompress backup: ${stderrText}`
          }, 500);
        }

        // After decompression, the file will be without .gz extension
        const decompressedPath = tempPath.replace(/\.gz$/, '');
        console.log('Decompressed to:', decompressedPath);

        // Step 7: Drop and recreate the database for a clean restore

        // First, close any cached connections to the project database
        await closePgConnection(projectId);
        console.log(`Closed cached connections for database: ${projectId}`);

        // Terminate all existing connections to ensure clean restore
        const postgresDb = getPgConnection("postgres");
        try {
          await postgresDb.unsafe(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '${projectId}'
              AND pid <> pg_backend_pid()
          `);
          console.log(`Terminated all connections to database: ${projectId}`);

          // Small delay to ensure connections are fully terminated
          await new Promise(resolve => setTimeout(resolve, 100));

          // Drop and recreate the database for a clean slate
          console.log(`Dropping database: ${projectId}`);
          await postgresDb.unsafe(`DROP DATABASE IF EXISTS "${projectId}"`);

          console.log(`Creating fresh database: ${projectId}`);
          await postgresDb.unsafe(`CREATE DATABASE "${projectId}"`);
        } finally {
          await postgresDb.end();
        }

        // Now restore the backup using docker exec to run psql in the postgres container
        // The dump file contains all necessary DROP and CREATE statements
        console.log('Restoring SQL file using docker exec psql:', decompressedPath);

        const restoreCommand = new Deno.Command("docker", {
          args: [
            "exec",
            "-i",
            `${_INSTANCE_ID}-postgres`,
            "psql",
            "-U", "postgres",
            "-d", projectId,
          ],
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });

        const restoreProcess = restoreCommand.spawn();

        // Read the SQL file and pipe it to psql's stdin
        const sqlContent = await Deno.readFile(decompressedPath);
        const sqlText = new TextDecoder().decode(sqlContent);
        const lineCount = sqlText.split('\n').length;
        const copyCommands = (sqlText.match(/^COPY /gm) || []).length;
        console.log(`SQL file stats: ${lineCount} lines, ${copyCommands} COPY commands, ${sqlContent.byteLength} bytes`);

        const writer = restoreProcess.stdin.getWriter();
        await writer.write(sqlContent);
        await writer.close();

        const { code: restoreCode, stderr: restoreStderr, stdout: restoreStdout } = await restoreProcess.output();

        const stderrText = new TextDecoder().decode(restoreStderr);
        const stdoutText = new TextDecoder().decode(restoreStdout);

        console.log('psql exit code:', restoreCode);
        console.log('psql stderr:', stderrText);
        console.log('psql stdout (first 500 chars):', stdoutText.substring(0, 500));

        if (restoreCode !== 0) {
          console.error('Restore failed with code:', restoreCode);
          console.error('stderr:', stderrText);
          console.error('stdout:', stdoutText);

          // Clean up decompressed file
          try {
            await Deno.remove(decompressedPath);
          } catch (err) {
            console.error('Failed to clean up decompressed file:', err);
          }

          return c.json({
            success: false,
            error: `Failed to restore backup: ${stderrText || stdoutText}`
          }, 500);
        }

        console.log('Successfully restored backup');
        console.log('psql output:', stdoutText);

        // Clean up decompressed file
        try {
          await Deno.remove(decompressedPath);
          console.log('Cleaned up decompressed file:', decompressedPath);
        } catch (err) {
          console.error('Failed to clean up decompressed file:', err);
        }

        return c.json({
          success: true,
        });
      } finally {
        // Clean up temporary file (gunzip removes the .gz file, so this might not exist)
        try {
          await Deno.remove(tempPath);
          console.log('Cleaned up temp file:', tempPath);
        } catch (err) {
          // Ignore NotFound errors - gunzip already removed the .gz file
          if (!(err instanceof Deno.errors.NotFound)) {
            console.error('Failed to clean up temp file:', err);
          }
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

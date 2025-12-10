import { Hono } from "hono";
import { getGlobalNonAdmin } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { _SANDBOX_DIR_PATH } from "../../exposed_env_vars.ts";
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

// Get all project backups across all projects
defineRoute(
  routesBackups,
  "getAllProjectsBackups",
  getGlobalNonAdmin,
  async (c) => {
    try {
      // Backup directory is inside the sandbox directory
      const backupBaseDir = join(_SANDBOX_DIR_PATH, "backups");

      const allBackups: ProjectBackupInfo[] = [];

      try {
        // Check if backup directory exists
        const dirInfo = await Deno.stat(backupBaseDir);
        if (!dirInfo.isDirectory) {
          return c.json({
            success: true,
            backups: []
          });
        }
      } catch {
        // Backup directory doesn't exist yet
        return c.json({
          success: true,
          backups: []
        });
      }

      // Read all project folders in backups directory
      for await (const projectEntry of Deno.readDir(backupBaseDir)) {
        if (projectEntry.isDirectory) {
          const projectId = projectEntry.name;
          const projectBackupDir = join(backupBaseDir, projectId);

          // Read all backup folders for this project
          try {
            for await (const backupEntry of Deno.readDir(projectBackupDir)) {
              if (backupEntry.isDirectory) {
                const backupPath = join(projectBackupDir, backupEntry.name);

                // Try to read metadata.json
                let metadata: any = null;
                let projectLabel = projectId;
                try {
                  const metadataText = await Deno.readTextFile(join(backupPath, "metadata.json"));
                  metadata = JSON.parse(metadataText);
                  projectLabel = metadata.project_label || projectId;
                } catch {
                  // If metadata doesn't exist, use folder name
                  metadata = {
                    timestamp: backupEntry.name,
                    backup_date: backupEntry.name,
                  };
                }

                // Get folder size, file count, and list all files
                let totalSize = 0;
                let fileCount = 0;
                const files: BackupFileInfo[] = [];

                try {
                  for await (const file of Deno.readDir(backupPath)) {
                    if (file.isFile) {
                      const fileInfo = await Deno.stat(join(backupPath, file.name));
                      totalSize += fileInfo.size;
                      fileCount++;

                      // Categorize file type
                      let fileType: "main" | "project" | "metadata" | "log" | "other" = "other";
                      if (file.name === "main.sql.gz") {
                        fileType = "main";
                      } else if (file.name === "metadata.json") {
                        fileType = "metadata";
                      } else if (file.name === "backup.log") {
                        fileType = "log";
                      } else if (file.name.endsWith(".sql.gz") || file.name.endsWith(".sql")) {
                        fileType = "project";
                      }

                      files.push({
                        name: file.name,
                        size: fileInfo.size,
                        type: fileType,
                      });
                    }
                  }
                } catch (err) {
                  console.error(`Error reading backup files in ${backupPath}:`, err);
                }

                allBackups.push({
                  project_id: projectId,
                  project_label: projectLabel,
                  folder: backupEntry.name,
                  timestamp: metadata.timestamp || backupEntry.name,
                  backup_date: metadata.backup_date || backupEntry.name,
                  size: totalSize,
                  file_count: fileCount,
                  files: files,
                });
              }
            }
          } catch (err) {
            console.error(`Error reading project backup directory ${projectBackupDir}:`, err);
          }
        }
      }

      // Sort by timestamp (newest first)
      allBackups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

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

// Get backups for a specific project
defineRoute(
  routesBackups,
  "getProjectBackups",
  getGlobalNonAdmin,
  async (c) => {
    try {
      const projectId = c.req.param("project_id");

      // Security: Prevent directory traversal
      if (!projectId || projectId.includes("..") || projectId.includes("/")) {
        return c.json({
          success: false,
          backups: [],
          error: "Invalid project ID"
        }, 400);
      }

      // Backup directory is inside the sandbox directory
      const backupBaseDir = join(_SANDBOX_DIR_PATH, "backups");
      const projectBackupDir = join(backupBaseDir, projectId);

      const projectBackups: ProjectBackupInfo[] = [];

      try {
        // Check if project backup directory exists
        const dirInfo = await Deno.stat(projectBackupDir);
        if (!dirInfo.isDirectory) {
          return c.json({
            success: true,
            backups: []
          });
        }
      } catch {
        // Project backup directory doesn't exist yet
        return c.json({
          success: true,
          backups: []
        });
      }

      // Read all backup folders for this project
      try {
        for await (const backupEntry of Deno.readDir(projectBackupDir)) {
          if (backupEntry.isDirectory) {
            const backupPath = join(projectBackupDir, backupEntry.name);

            // Try to read metadata.json
            let metadata: any = null;
            let projectLabel = projectId;
            try {
              const metadataText = await Deno.readTextFile(join(backupPath, "metadata.json"));
              metadata = JSON.parse(metadataText);
              projectLabel = metadata.project_label || projectId;
            } catch {
              // If metadata doesn't exist, use folder name
              metadata = {
                timestamp: backupEntry.name,
                backup_date: backupEntry.name,
              };
            }

            // Get folder size, file count, and list all files
            let totalSize = 0;
            let fileCount = 0;
            const files: BackupFileInfo[] = [];

            try {
              for await (const file of Deno.readDir(backupPath)) {
                if (file.isFile) {
                  const fileInfo = await Deno.stat(join(backupPath, file.name));
                  totalSize += fileInfo.size;
                  fileCount++;

                  // Categorize file type
                  let fileType: "main" | "project" | "metadata" | "log" | "other" = "other";
                  if (file.name === "main.sql.gz") {
                    fileType = "main";
                  } else if (file.name === "metadata.json") {
                    fileType = "metadata";
                  } else if (file.name === "backup.log") {
                    fileType = "log";
                  } else if (file.name.endsWith(".sql.gz") || file.name.endsWith(".sql")) {
                    fileType = "project";
                  }

                  files.push({
                    name: file.name,
                    size: fileInfo.size,
                    type: fileType,
                  });
                }
              }
            } catch (err) {
              console.error(`Error reading backup files in ${backupPath}:`, err);
            }

            projectBackups.push({
              project_id: projectId,
              project_label: projectLabel,
              folder: backupEntry.name,
              timestamp: metadata.timestamp || backupEntry.name,
              backup_date: metadata.backup_date || backupEntry.name,
              size: totalSize,
              file_count: fileCount,
              files: files,
            });
          }
        }
      } catch (err) {
        console.error(`Error reading project backup directory ${projectBackupDir}:`, err);
      }

      // Sort by timestamp (newest first)
      projectBackups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return c.json({
        success: true,
        backups: projectBackups
      });
    } catch (error) {
      console.error("Error fetching project backups:", error);
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
      const projectId = c.req.param("project_id");
      const folder = c.req.param("folder");
      const fileName = c.req.param("file");

      // Security: Prevent directory traversal
      if (
        !projectId ||
        !folder ||
        !fileName ||
        projectId.includes("..") ||
        folder.includes("..") ||
        fileName.includes("..") ||
        projectId.includes("/") ||
        folder.includes("/") ||
        fileName.includes("/")
      ) {
        return c.json({ error: "Invalid path" }, 400);
      }

      const backupBaseDir = join(_SANDBOX_DIR_PATH, "backups");
      const filePath = join(backupBaseDir, projectId, folder, fileName);

      // Check if file exists
      const fileInfo = await Deno.stat(filePath);
      if (!fileInfo.isFile) {
        return c.json({ error: "File not found" }, 404);
      }

      // Read the file
      const fileContent = await Deno.readFile(filePath);

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

      // Set appropriate headers for download
      return new Response(fileContent, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": fileInfo.size.toString(),
        },
      });
    } catch (error) {
      console.error("Error downloading backup file:", error);
      return c.json({ error: "File not found" }, 404);
    }
  }
);

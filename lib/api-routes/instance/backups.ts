import { route } from "../route-utils.ts";

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

// Route registry for backups
export const backupRouteRegistry = {
  getAllProjectsBackups: route({
    path: "/api/all-projects-backups",
    method: "GET",
    response: {} as {
      success: boolean;
      backups: ProjectBackupInfo[];
    },
  }),
  createBackupFile: route({
    path: "/api/create-backup/:name",
    method: "POST",
    params: {} as {
      name: string;
    },
    response: {} as {
      success: boolean;
      logs?: string;
      error?: string;
    },
  }),
  downloadBackupFile: route({
    path: "/api/backups/:folder/:file",
    method: "GET",
    params: {} as {
      folder: string;
      file: string;
    },
  }),
  restoreBackup: route({
    path: "/api/restore-backup",
    method: "POST",
    body: {} as {
      folder?: string;
      fileName?: string;
      projectId: string;
      file?: File;
    },
    response: {} as {
      success: boolean;
      error?: string;
    },
  }),
} as const;

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
  downloadBackupFile: route({
    path: "/api/backups/:folder/:file",
    method: "GET",
    params: {} as {
      folder: string;
      file: string;
    },
  }),
} as const;

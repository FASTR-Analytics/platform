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
  getProjectBackups: route({
    path: "/api/project-backups/:project_id",
    method: "GET",
    params: {} as {
      project_id: string;
    },
    response: {} as {
      success: boolean;
      backups: ProjectBackupInfo[];
    },
  }),
  downloadBackupFile: route({
    path: "/api/backups/:project_id/:folder/:file",
    method: "GET",
    params: {} as {
      project_id: string;
      folder: string;
      file: string;
    },
  }),
} as const;

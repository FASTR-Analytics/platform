import { route } from "../route-utils.ts";

// Route registry for backups
export const backupRouteRegistry = {
  // Note: these routes return non-standard shapes alongside the APIResponse envelope.
  // The `response` field is omitted so InferredResponse = APIResponseNoData; extra success
  // properties (backups, logs) are structurally compatible with { success: true }.
  getAllProjectsBackups: route({
    path: "/api/all-projects-backups",
    method: "GET",
  }),
  createBackupFile: route({
    path: "/api/create-backup/:name",
    method: "POST",
    params: {} as {
      name: string;
    },
    requiresProject: true,
  }),
  // downloadBackupFile returns a binary Response on success (not JSON); error paths return JSON.
  downloadBackupFile: route({
    path: "/api/backups/:folder/:file",
    method: "GET",
    params: {} as {
      folder: string;
      file: string;
    },
    requiresProject: true,
  }),
  restoreBackup: route({
    path: "/api/restore-backup",
    method: "POST",
    body: {} as {
      folder?: string;
      fileName?: string;
      fileData?: string;
    },
    requiresProject: true,
  }),
} as const;

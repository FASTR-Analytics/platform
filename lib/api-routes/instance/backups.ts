import { z } from "zod";
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
    params: z.object({ name: z.string() }),
    requiresProject: true,
  }),
  // downloadBackupFile returns a binary Response on success (not JSON); error paths return JSON.
  downloadBackupFile: route({
    path: "/api/backups/:folder/:file",
    method: "GET",
    params: z.object({ folder: z.string(), file: z.string() }),
    requiresProject: true,
  }),
  restoreBackup: route({
    path: "/api/restore-backup",
    method: "POST",
    body: z.object({
      folder: z.string().optional(),
      fileName: z.string().optional(),
      fileData: z.string().optional(),
    }),
    requiresProject: true,
  }),
} as const;

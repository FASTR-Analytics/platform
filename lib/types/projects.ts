import type { DatasetInProject } from "./datasets_in_project.ts";
import { ProjectUser } from "./instance.ts";
import { type InstalledModuleSummary } from "./modules.ts";
import { PresentationObjectSummary } from "./presentation_objects.ts";
import { ReportSummary } from "./reports.ts";

// ============================================================================
// Project Types
// ============================================================================

export type ProjectSummary = {
  id: string;
  label: string;
  thisUserRole: "viewer" | "editor";
  isLocked: boolean;
};

export type ProjectDetail = {
  id: string;
  label: string;
  aiContext: string;
  thisUserRole: "viewer" | "editor" | "admin";
  isLocked: boolean;
  projectDatasets: DatasetInProject[];
  projectModules: InstalledModuleSummary[];
  visualizations: PresentationObjectSummary[];
  reports: ReportSummary[];
  projectUsers: ProjectUser[];
  thisUserPermissions: {
    can_configure_settings: boolean;
    can_create_backups: boolean;
    can_restore_backups: boolean;
    can_configure_modules: boolean;
    can_run_modules: boolean;
    can_configure_users: boolean;
    can_configure_visulizations: boolean;
    can_configure_reports: boolean;
    can_configure_data: boolean;
    can_view_data: boolean;
    can_view_logs: boolean;
  };
};

// ============================================================================
// User Role Types
// ============================================================================

export type ProjectUserRoleType = "none" | "viewer" | "editor";

import type { DatasetInProject } from "./datasets_in_project.ts";
import { ProjectUser } from "./instance.ts";
import { type MetricWithStatus } from "./module_definitions.ts";
import { type InstalledModuleSummary } from "./modules.ts";
import { PresentationObjectSummary } from "./presentation_objects.ts";
import { ReportSummary } from "./reports.ts";
import { SlideDeckFolder, SlideDeckSummary } from "./slides.ts";
import { VisualizationFolder } from "./visualization_folders.ts";

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
  metrics: MetricWithStatus[];
  visualizations: PresentationObjectSummary[];
  visualizationFolders: VisualizationFolder[];
  reports: ReportSummary[];
  slideDecks: SlideDeckSummary[];
  slideDeckFolders: SlideDeckFolder[];
  projectUsers: ProjectUser[];
  thisUserPermissions: {
    can_configure_settings: boolean;
    can_create_backups: boolean;
    can_restore_backups: boolean;
    can_configure_modules: boolean;
    can_run_modules: boolean;
    can_configure_users: boolean;
    can_configure_visualizations: boolean;
    can_view_visualizations: boolean;
    can_configure_reports: boolean;
    can_view_reports: boolean;
    can_configure_slide_decks: boolean;
    can_view_slide_decks: boolean;
    can_configure_data: boolean;
    can_view_data: boolean;
    can_view_logs: boolean;
  };
};

// ============================================================================
// User Role Types
// ============================================================================

export type ProjectUserRoleType = "none" | "viewer" | "editor";

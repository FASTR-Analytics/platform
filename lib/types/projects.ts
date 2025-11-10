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
};

// ============================================================================
// User Role Types
// ============================================================================

export type ProjectUserRoleType = "none" | "viewer" | "editor";

import type { DatasetInProject } from "./datasets_in_project.ts";
import { ProjectUser } from "./instance.ts";
import { type MetricWithStatus } from "./module_definitions.ts";
import { type InstalledModuleSummary } from "./modules.ts";
import { PresentationObjectSummary } from "./presentation_objects.ts";
import { ReportSummary } from "./reports.ts";
import { SlideDeckSummary } from "./slides.ts";
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
  projectUsers: ProjectUser[];
};

// ============================================================================
// User Role Types
// ============================================================================

export type ProjectUserRoleType = "none" | "viewer" | "editor";

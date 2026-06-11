import type { DatasetInProject } from "./datasets_in_project.ts";
import type { HfaTaxonomyForAI } from "./hfa_types.ts";
import { ProjectUser } from "./instance.ts";
import { type MetricWithStatus, type InstalledModuleSummary } from "./modules.ts";
import type { ProjectUserPermissions } from "./permissions.ts";
import { PresentationObjectSummary } from "./presentation_objects.ts";
import { SlideDeckFolder, SlideDeckSummary } from "./slides.ts";
import { ReportFolder, ReportSummary } from "./reports.ts";
import { VisualizationFolder } from "./visualization_folders.ts";
import { DashboardSummary } from "./dashboard.ts";

// ============================================================================
// Project Types
// ============================================================================

export type ProjectSummary = {
  id: string;
  label: string;
  thisUserRole: "viewer" | "editor";
  isLocked: boolean;
  isCentralReporting: boolean;
  status: "ready" | "copying" | "pending_deletion";
  lastActivityAt: string | undefined;
  deletionScheduledAt: string | undefined;
};

export type ProjectDetail = {
  id: string;
  label: string;
  aiContext: string;
  thisUserRole: "viewer" | "editor" | "admin";
  isLocked: boolean;
  isCentralReporting: boolean;
  projectDatasets: DatasetInProject[];
  projectModules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  commonIndicators: { id: string; label: string }[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: HfaTaxonomyForAI;
  visualizations: PresentationObjectSummary[];
  visualizationFolders: VisualizationFolder[];
  slideDecks: SlideDeckSummary[];
  slideDeckFolders: SlideDeckFolder[];
  reports: ReportSummary[];
  reportFolders: ReportFolder[];
  dashboards: DashboardSummary[];
  projectUsers: ProjectUser[];
  thisUserPermissions: ProjectUserPermissions;
};

// ============================================================================
// User Role Types
// ============================================================================

export type ProjectUserRoleType = "none" | "viewer" | "editor";

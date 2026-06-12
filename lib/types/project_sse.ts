import type { DatasetInProject } from "./datasets_in_project.ts";
import type { HfaTaxonomyForAI } from "./hfa_types.ts";
import type { ProjectUser } from "./instance.ts";
import type { InstalledModuleSummary, MetricWithStatus } from "./modules.ts";
import type { ProjectUserPermissions } from "./permissions.ts";
import type { PresentationObjectSummary } from "./presentation_objects.ts";
import type {
  DirtyOrRunStatus,
  LastUpdateTableName,
} from "./project_dirty_states.ts";
import type { SlideDeckFolder, SlideDeckSummary } from "./slides.ts";
import type { ReportFolder, ReportSummary } from "./reports.ts";
import type { VisualizationFolder } from "./visualization_folders.ts";
import type { DashboardSummary } from "./dashboard.ts";

/**
 * Unified project state pushed via SSE.
 *
 * Excludes:
 * - `rLogs` (ephemeral, demoted to T5 component-local)
 */
export type ProjectState = {
  isReady: boolean;
  currentUserEmail: string;

  // From ProjectDetail
  id: string;
  label: string;
  aiContext: string;
  thisUserRole: "viewer" | "editor" | "admin"; // kept with hardcoding bug intact
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

  // From ProjectDirtyStates
  projectLastUpdated: string;
  anyRunning: boolean;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
  moduleLastRun: Record<string, string>;
  moduleLastRunGitRef: Record<string, string>;
  lastUpdated: Record<LastUpdateTableName, Record<string, string>>;
};

/**
 * SSE message types for project state updates.
 *
 * Granular events that carry actual data, replacing the current
 * "project_updated" catch-all that triggers a full refetch.
 */
export type ProjectSseMessage =
  // Initial state on connection
  | { type: "starting"; data: ProjectState }

  // Module execution events (already granular today — kept as-is)
  | { type: "any_running"; data: { anyRunning: boolean } }
  | { type: "r_script"; data: { moduleId: string; text: string } }
  | {
      type: "module_dirty_state";
      data: {
        ids: string[];
        dirtyOrRunStatus: DirtyOrRunStatus;
        lastRun?: string;
        lastRunGitRef?: string;
      };
    }

  // Data updates (replace current "project_updated" catch-all)
  | { type: "project_config_updated"; data: { label: string; isLocked: boolean; aiContext?: string; isCentralReporting?: boolean } }
  | {
      type: "modules_updated";
      data: {
        projectModules: InstalledModuleSummary[];
        metrics: MetricWithStatus[];
        commonIndicators: { id: string; label: string }[];
        icehIndicators: { id: string; label: string; category: string }[];
      };
    }
  | { type: "datasets_updated"; data: { projectDatasets: DatasetInProject[] } }
  | {
      type: "visualizations_updated";
      data: { visualizations: PresentationObjectSummary[] };
    }
  | {
      type: "visualization_folders_updated";
      data: { visualizationFolders: VisualizationFolder[] };
    }
  | { type: "slide_decks_updated"; data: { slideDecks: SlideDeckSummary[] } }
  | {
      type: "slide_deck_folders_updated";
      data: { slideDeckFolders: SlideDeckFolder[] };
    }
  | { type: "reports_updated"; data: { reports: ReportSummary[] } }
  | {
      type: "report_folders_updated";
      data: { reportFolders: ReportFolder[] };
    }
  | { type: "dashboards_updated"; data: { dashboards: DashboardSummary[] } }
  | { type: "project_users_updated"; data: { projectUsers: ProjectUser[] } }

  // Per-entity timestamps (kept — project caches use per-entity versioning)
  | {
      type: "last_updated";
      data: { tableName: LastUpdateTableName; ids: string[]; lastUpdated: string };
    }

  // Error
  | { type: "error"; data: { message: string } };

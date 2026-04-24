import type { DatasetInProject } from "./datasets_in_project.ts";
import type { ProjectUser } from "./instance.ts";
import type { InstalledModuleSummary, MetricWithStatus } from "./modules.ts";
import type { ProjectUserPermissions } from "./permissions.ts";
import type { PresentationObjectSummary } from "./presentation_objects.ts";
import type {
  DirtyOrRunStatus,
  LastUpdateTableName,
} from "./project_dirty_states.ts";
import type { ReportSummary } from "./reports.ts";
import type { SlideDeckFolder, SlideDeckSummary } from "./slides.ts";
import type { VisualizationFolder } from "./visualization_folders.ts";

/**
 * Unified project state pushed via SSE.
 *
 * Merges the current `ProjectDetail` and `ProjectDirtyStates` into one shape.
 * Excludes:
 * - `aiContext` (unbounded user content, stays T3)
 * - `rLogs` (ephemeral, demoted to T5 component-local)
 */
export type ProjectState = {
  isReady: boolean;

  // From ProjectDetail
  id: string;
  label: string;
  thisUserRole: "viewer" | "editor" | "admin"; // kept with hardcoding bug intact
  isLocked: boolean;
  projectDatasets: DatasetInProject[];
  projectModules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  commonIndicators: { id: string; label: string }[];
  visualizations: PresentationObjectSummary[];
  visualizationFolders: VisualizationFolder[];
  reports: ReportSummary[];
  slideDecks: SlideDeckSummary[];
  slideDeckFolders: SlideDeckFolder[];
  projectUsers: ProjectUser[];
  thisUserPermissions: ProjectUserPermissions;

  // From ProjectDirtyStates
  projectLastUpdated: string;
  anyRunning: boolean;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
  anyModuleLastRun: string;
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
  | { type: "project_config_updated"; data: { label: string; isLocked: boolean } }
  | {
      type: "modules_updated";
      data: {
        projectModules: InstalledModuleSummary[];
        metrics: MetricWithStatus[];
        commonIndicators: { id: string; label: string }[];
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
  | { type: "reports_updated"; data: { reports: ReportSummary[] } }
  | { type: "slide_decks_updated"; data: { slideDecks: SlideDeckSummary[] } }
  | {
      type: "slide_deck_folders_updated";
      data: { slideDeckFolders: SlideDeckFolder[] };
    }
  | { type: "project_users_updated"; data: { projectUsers: ProjectUser[] } }

  // Per-entity timestamps (kept — project caches use per-entity versioning)
  | {
      type: "last_updated";
      data: { tableName: LastUpdateTableName; ids: string[]; lastUpdated: string };
    }

  // Error
  | { type: "error"; data: { message: string } };

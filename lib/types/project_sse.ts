import type { DatasetInProject } from "./datasets_in_project.ts";
import type { HfaTaxonomyForAI } from "./hfa_types.ts";
import type { ProjectUser } from "./instance.ts";
import type { InstalledModuleSummary, MetricWithStatus } from "./modules.ts";
import type { ProjectUserPermissions } from "./permissions.ts";
import type { PresentationObjectSummary } from "./presentation_objects.ts";
import type { LastUpdateTableName } from "./project_dirty_states.ts";
import type { SlideDeckFolder, SlideDeckSummary } from "./slides.ts";
import type { ReportFolder, ReportSummary } from "./reports.ts";
import type { VisualizationFolder } from "./visualization_folders.ts";
import type { DashboardSummary } from "./dashboard.ts";
import type { RunProgress } from "./run_generation.ts";

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
  // The immutable results run this project serves from — the client-side
  // cache identity for all run-derived data (PLAN_RESULTS_RUNS §2.5);
  // null = no run attached (typed replacement for the "unknown" sentinel).
  attachedRunId: string | null;
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

  // Per-entity last-updated snapshot (project caches use per-entity versioning)
  projectLastUpdated: string;
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

  // Live R output line for the currently generating module
  | { type: "r_script"; data: { moduleId: string; text: string } }

  // Results-package generation (PLAN_RESULTS_RUNS item 2): worker-pushed
  // pipeline progress on every state change, and the repoint event when a
  // finished run becomes the project's attached package — it carries the
  // full run-derived catalog (modules, metrics, datasets, indicators) so
  // clients re-key live without a reconnect.
  | { type: "run_progress"; data: { runId: string; progress: RunProgress } }
  | {
      type: "run_attached";
      data: {
        attachedRunId: string;
        projectModules: InstalledModuleSummary[];
        metrics: MetricWithStatus[];
        projectDatasets: DatasetInProject[];
        commonIndicators: { id: string; label: string }[];
        icehIndicators: { id: string; label: string; category: string }[];
        // Default visualizations are projections of the attached run (item
        // 5b), so the visualizations list changes at repoint — server-built,
        // like every other list emission.
        visualizations: PresentationObjectSummary[];
      };
    }

  // Data updates (replace current "project_updated" catch-all)
  | { type: "project_config_updated"; data: { label: string; isLocked: boolean; aiContext?: string; isCentralReporting?: boolean } }
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

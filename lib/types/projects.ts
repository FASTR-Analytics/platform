import type { RunListingItem } from "./run_generation.ts";
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
  adminArea2: string | null;
  status: "ready" | "copying" | "pending_deletion";
  // projects.run_id + the run's label, for the project card badge; the pinned
  // marker is derived client-side against instanceState.pinnedRunId.
  attachedRunId: string | null;
  attachedRunLabel: string | null;
  followPinned: boolean;
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
  // The project's Admin Area 2 identity (projects.admin_area_2); null =
  // national. Scopes every run read server-side (PLAN_1_PROJECT_AA2_SCOPE).
  adminArea2: string | null;
  // The immutable results run this project serves from (projects.run_id);
  // null = no run attached — data reads error until one is synthesized/attached.
  attachedRunId: string | null;
  // Its catalogue row, for the project T1 store (see ProjectState.attachedRun).
  attachedRun: RunListingItem | null;
  // projects.follow_pinned — subscribed to the instance's pinned package; a
  // pin-move physically repoints this project (SYSTEM_08 "The pinned
  // package + followers").
  followPinned: boolean;
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

// The ONE scope token used by server cache keys, response-holder stamps, and
// the client version key. encodeURIComponent keeps it readable in Valkey keys
// and escapes `|` (cache-segment separator); the tilde replace closes the one
// unreserved char that would collide with the client version-key separator.
export function projectScopeToken(adminArea2: string | null): string {
  return adminArea2 === null
    ? "national"
    : encodeURIComponent(adminArea2.toUpperCase()).replaceAll("~", "%7E");
}

// ============================================================================
// User Role Types
// ============================================================================

export type ProjectUserRoleType = "none" | "viewer" | "editor";

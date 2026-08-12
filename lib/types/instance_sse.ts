import type { Language } from "@timroberton/panther";
import type { AssetInfo } from "./assets.ts";
import type { HfaTimePoint } from "./dataset_hfa.ts";
import type { DatasetType } from "./datasets.ts";
import type { UserPermissions } from "./permissions.ts";
import type { GeoJsonMapSummary } from "./geojson_maps.ts";
import type { InstanceCalendar, InstanceConfigAdminAreaLabels, InstanceFiscalYear, OtherUser, StructureFamilyCounts, StructureSchema } from "./instance.ts";
import type { ProjectSummary } from "./projects.ts";
import type { RunProgress } from "./run_generation.ts";
import type { HfaWeightsCoverage } from "./structure.ts";

// ============================================================================
// Instance SSE State
// ============================================================================

export type InstanceState = {
  // Client and server share one type. The server sends `isReady: true` in the
  // `starting` message. The client initializes the store with `isReady: false`
  // and applies the full starting payload via `reconcile()`, which flips it to
  // true in a single atomic update. No special client-side logic needed.
  isReady: boolean;

  // Immutable (set from env vars at server startup, never changes at runtime,
  // only sent in the `starting` message, no SSE event updates these)
  instanceName: string;
  instanceLanguage: Language;
  instanceCalendar: InstanceCalendar;
  instanceFiscalYear: InstanceFiscalYear;

  // Config (rarely changes, updated via `config_updated` event)
  countryIso3: string | undefined;
  structureSchemaHmis: StructureSchema | null;
  structureSchemaHfa: StructureSchema | null;
  adminAreaLabels: InstanceConfigAdminAreaLabels;

  // Lists (sent as full arrays on change)
  projects: ProjectSummary[];
  projectsLastUpdated: string;
  users: OtherUser[];
  assets: AssetInfo[];
  geojsonMaps: GeoJsonMapSummary[];

  // Summaries (lightweight aggregates)
  structure:
    | {
        hmis: StructureFamilyCounts;
        hfa: StructureFamilyCounts;
      }
    | undefined;
  structureLastUpdated: string | undefined;
  hfaWeights: HfaWeightsCoverage[];
  indicators: {
    commonIndicators: number;
    rawIndicators: number;
    hfaIndicators: number;
    calculatedIndicators: number;
  };
  datasetsWithData: DatasetType[];
  datasetVersions: { hmis?: number; hfa?: number };
  hmisNVersions: number;
  // While a per-pair DHIS2 run is integrating, dataset_hmis keeps changing
  // under the settled version token — display caches must be bypassed.
  hmisImportRunActive: boolean;
  // Queued DHIS2 runs waiting for the import slot (Phase 4 C6).
  hmisImportRunsQueued: number;
  // A scheduled DHIS2 import needs attention: its last fire was refused or
  // missed, or the run it launched ended in error (Phase 4 C4).
  hmisScheduledImportAttention: boolean;
  hfaTimePoints: HfaTimePoint[];
  hfaCacheHash: string;
  icehCacheHash: string;

  // Cache versioning (regular fields, read by dataset caches as version keys)
  indicatorMappingsVersion: string;
  hfaIndicatorsVersion: string;
  calculatedIndicatorsVersion: string;

  // Per-connection current user (populated by server in starting message,
  // re-derived on users_updated — different for each connected client)
  currentUserEmail: string;
  currentUserApproved: boolean;
  currentUserIsGlobalAdmin: boolean;
  currentUserPermissions: UserPermissions;
};

// ============================================================================
// Instance SSE Event Data Types
// ============================================================================

export type InstanceConfig = {
  countryIso3: string | undefined;
  structureSchemaHmis: StructureSchema | null;
  structureSchemaHfa: StructureSchema | null;
  adminAreaLabels: InstanceConfigAdminAreaLabels;
};

export type InstanceStructureSummary = {
  structure:
    | {
        hmis: StructureFamilyCounts;
        hfa: StructureFamilyCounts;
      }
    | undefined;
  structureLastUpdated: string | undefined;
  hfaWeights: HfaWeightsCoverage[];
};

export type InstanceIndicatorsSummary = {
  indicators: {
    commonIndicators: number;
    rawIndicators: number;
    hfaIndicators: number;
    calculatedIndicators: number;
  };
  indicatorMappingsVersion: string;
  hfaIndicatorsVersion: string;
  calculatedIndicatorsVersion: string;
};

export type InstanceDatasetsSummary = {
  datasetsWithData: DatasetType[];
  datasetVersions: { hmis?: number; hfa?: number };
  hmisNVersions: number;
  hmisImportRunActive: boolean;
  hmisImportRunsQueued: number;
  hmisScheduledImportAttention: boolean;
  hfaTimePoints: HfaTimePoint[];
  hfaCacheHash: string;
  icehCacheHash: string;
};

// ============================================================================
// Instance SSE Message (discriminated union)
// ============================================================================

// `run_progress` and `r_script` are the results-package catalogue's live
// generation view (Q-B ruling). They are ephemeral execution state, not
// InstanceState fields, and they are the only messages on this channel that
// are FILTERED per user: routesInstanceSSE drops them for callers without
// can_configure_data, because run labels, module ids and R error detail must
// not fan out to every connected user. Both keep their project-SSE copies
// for attach targets; a run with no targets has only this channel.
export type InstanceSseMessage =
  | { type: "starting"; data: InstanceState }
  | { type: "run_progress"; data: { runId: string; progress: RunProgress } }
  | {
      type: "r_script";
      data: { runId: string; moduleId: string; text: string };
    }
  | { type: "config_updated"; data: InstanceConfig }
  | { type: "projects_last_updated"; data: string }
  | { type: "users_updated"; data: OtherUser[] }
  | { type: "assets_updated"; data: AssetInfo[] }
  | { type: "geojson_maps_updated"; data: GeoJsonMapSummary[] }
  | { type: "structure_updated"; data: InstanceStructureSummary }
  | { type: "indicators_updated"; data: InstanceIndicatorsSummary }
  | { type: "datasets_updated"; data: InstanceDatasetsSummary }
  | { type: "error"; data: { message: string } };

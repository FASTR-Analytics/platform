import type { Language } from "@timroberton/panther";
import type { AssetInfo } from "./assets.ts";
import type { HfaTimePoint } from "./dataset_hfa.ts";
import type { DatasetType } from "./datasets.ts";
import type { UserPermissions } from "./permissions.ts";
import type { GeoJsonMapSummary } from "./geojson_maps.ts";
import type { InstanceCalendar, InstanceConfigAdminAreaLabels, InstanceFiscalYear, OtherUser, StructureFamilyCounts, StructureSchema } from "./instance.ts";
import type { ProjectSummary } from "./projects.ts";
import type {
  InstancePopulationSummary,
  PopulationCoverage,
  PopulationTypeInfo,
} from "./population.ts";
import type { RunCatalogItem, RunProgress } from "./run_generation.ts";
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
  dhis2ConnectionUrl: string | null;

  // Lists (sent as full arrays on change)
  projects: ProjectSummary[];
  projectsLastUpdated: string;
  // [] for an unapproved connection (its user absent from the roster), in
  // the starting payload and every users_updated, until a roster names them
  // — routesInstanceSSE / buildInstanceState.
  users: OtherUser[];
  assets: AssetInfo[];
  geojsonMaps: GeoJsonMapSummary[];
  // Per-user, the `projects` pattern (Q-B: run labels must not fan out).
  // Filled at build for can_configure_data / global-admin callers ([] for
  // everyone else); after that, `runs_catalog_updated` broadcasts only a
  // data-free nonce and each entitled client refetches via listRunCatalog,
  // whose route guard is evaluated per request — so grants/revocations take
  // effect live, with no connection-captured gating anywhere.
  // `runsCatalogSignal` is a NONCE (collision-proof; a same-ms timestamp pair
  // was dropped by the store's equality guard), stamped fresh on every
  // connect: the refetch after every `starting` is DELIBERATE — it is the
  // reconnect self-healing path (backfill runs, missed signals). The
  // starting-payload fill above prevents an empty flash while it resolves.
  runsCatalog: RunCatalogItem[];
  runsCatalogSignal: string;
  // The at-most-one package the instance blesses (SYSTEM_08 "The pinned
  // package + followers"); null = nothing pinned. The ONE field every
  // Pinned badge derives from (catalogue, project card, picker). Broadcast
  // to EVERY client (unlike runsCatalog): a bare run id is not sensitive —
  // a project member already sees the id of the package their project
  // serves from — and the project tab needs it for editors without
  // can_configure_data.
  pinnedRunId: string | null;

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
  // The population store (PLAN_1b): its type vocabulary (the indicator
  // editor's picker), per-(type, level) coverage against the HMIS structure
  // (the manager page and the Data card), and the stamp that keys the T2
  // rows cache. One event, `population_updated`, carries all three.
  populationTypes: PopulationTypeInfo[];
  populationCoverage: PopulationCoverage[];
  populationLastUpdated: string | undefined;

  // Cache versioning (regular fields, read by dataset caches as version keys).
  // Two indicator stamps, split in PLAN_1a §1.13: the full one moves whenever
  // ANY common indicator changes and keys the indicator manager; the base one
  // moves only when the extract-relevant rows change, so editing a derived
  // definition costs the HMIS datatable caches nothing.
  indicatorMappingsVersion: string;
  baseIndicatorMappingsVersion: string;
  hfaIndicatorsVersion: string;

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
  dhis2ConnectionUrl: string | null;
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
  };
  indicatorMappingsVersion: string;
  baseIndicatorMappingsVersion: string;
  hfaIndicatorsVersion: string;
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
// not fan out to every connected user. The filter is LIVE — it re-derives
// from each `users_updated` passing through the forward loop, so grants and
// revocations take effect without a reconnect. Per-message filtering is
// acceptable ONLY because these are ephemeral telemetry — durable per-user
// state (`runsCatalog`, `projects`) instead broadcasts a data-free signal
// and lets each client fetch its own view through a per-request-guarded
// route. `pinned_run_updated` is neither: a plain unfiltered broadcast of a
// bare run id (see `pinnedRunId`), the same class as `config_updated`.
// This is the ONLY channel generation telemetry rides: a project is
// attached only once a run is ready, so it has no live view to feed (C2
// ruling, 2026-08-16 — the per-attach-target project copies were deleted).
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
  // Data-free nonce signal only — the catalogue itself is fetched per user.
  | { type: "runs_catalog_updated"; data: string }
  | { type: "pinned_run_updated"; data: { pinnedRunId: string | null } }
  | { type: "assets_updated"; data: AssetInfo[] }
  | { type: "geojson_maps_updated"; data: GeoJsonMapSummary[] }
  | { type: "structure_updated"; data: InstanceStructureSummary }
  | { type: "indicators_updated"; data: InstanceIndicatorsSummary }
  | { type: "datasets_updated"; data: InstanceDatasetsSummary }
  | { type: "population_updated"; data: InstancePopulationSummary }
  | { type: "error"; data: { message: string } };

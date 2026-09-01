import { createStore, reconcile, unwrap } from "solid-js/store";
import type {
  FacilityFamily,
  StructureSchema,
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstanceState,
  InstanceStructureSummary,
  AssetInfo,
  GeoJsonMapSummary,
  OtherUser,
  ProjectSummary,
  FigureLocalization,
  RunCatalogItem,
} from "lib";

// ============================================================================
// Store
// ============================================================================

// Hoisted so resetInstanceState can reconcile back to it — the instance
// sibling of EMPTY_PROJECT_STATE. `isReady: false` included: a disconnect
// must never leave the previous user's state renderable (Clerk cross-tab
// user switch unmounts/remounts the boundary without a reload).
const EMPTY_INSTANCE_STATE: InstanceState = {
  isReady: false,
  instanceName: "",
  instanceLanguage: "en",
  instanceCalendar: "gregorian",
  instanceFiscalYear: "none",
  countryIso3: undefined,
  structureSchemaHmis: null,
  structureSchemaHfa: null,
  dhis2ConnectionUrl: null,
  adminAreaLabels: {},
  projects: [],
  projectsLastUpdated: "",
  users: [],
  assets: [],
  geojsonMaps: [],
  runsCatalog: [],
  runsCatalogSignal: "",
  pinnedRunId: null,
  structure: undefined,
  structureLastUpdated: undefined,
  hfaWeights: [],
  indicators: {
    commonIndicators: 0,
    rawIndicators: 0,
    hfaIndicators: 0,
    derivedIndicators: 0,
  },
  datasetsWithData: [],
  datasetVersions: {},
  hmisNVersions: 0,
  hmisImportRunActive: false,
  hmisImportRunsQueued: 0,
  hmisScheduledImportAttention: false,
  hfaTimePoints: [],
  hfaCacheHash: "",
  icehCacheHash: "",
  indicatorMappingsVersion: "",
  baseIndicatorMappingsVersion: "",
  hfaIndicatorsVersion: "",
  currentUserEmail: "",
  currentUserApproved: false,
  currentUserIsGlobalAdmin: false,
  currentUserPermissions: {
    can_configure_users: false,
    can_view_users: false,
    can_view_logs: false,
    can_configure_settings: false,
    can_configure_data: false,
    can_view_data: false,
    can_create_projects: false,
  },
};

const [instanceState, setInstanceState] = createStore<InstanceState>(
  structuredClone(EMPTY_INSTANCE_STATE),
);

export { instanceState };

// ============================================================================
// Snapshot-read getters (for caches and async code) — named getSnapshot*
// ============================================================================

export function getSnapshotInstanceLocalization(): FigureLocalization {
  const s = unwrap(instanceState);
  return {
    language: s.instanceLanguage,
    calendar: s.instanceCalendar,
    countryIso3: s.countryIso3 ?? "",
    fiscalYear: s.instanceFiscalYear,
  };
}

// ============================================================================
// Setters (called by SSE handler only, never by components)
// ============================================================================

export function initInstanceState(data: InstanceState): void {
  setInstanceState(reconcile(data));
}

// Mirrors resetProjectState: called from disconnectInstanceSSE so a boundary
// unmount (incl. the Clerk-listener user-switch path, which does NOT reload)
// never lets the next user render the previous user's permissions, roster or
// catalogue.
export function resetInstanceState(): void {
  setInstanceState(reconcile(structuredClone(EMPTY_INSTANCE_STATE)));
}

export function updateInstanceConfig(data: InstanceConfig): void {
  setInstanceState("countryIso3", data.countryIso3);
  // Solid's reconcile handles null↔object transitions cleanly (verified:
  // isWrappable guard returns the value directly when either side is not
  // wrappable)
  setInstanceState("structureSchemaHmis", reconcile(data.structureSchemaHmis));
  setInstanceState("structureSchemaHfa", reconcile(data.structureSchemaHfa));
  setInstanceState("adminAreaLabels", reconcile(data.adminAreaLabels));
  setInstanceState("dhis2ConnectionUrl", data.dhis2ConnectionUrl);
}

// The shared-surface depth: the deepest level either registry uses. Surfaces
// that are family-scoped read their own family's schema instead.
export function maxDepth(): number {
  return Math.max(
    instanceState.structureSchemaHmis?.adminDepth ?? 1,
    instanceState.structureSchemaHfa?.adminDepth ?? 1,
  );
}

// Family-scoped surfaces that need a definite schema. The fallback matches
// the seeded default (depth 4, all columns off) and only applies on an
// instance whose schema row is missing — near-zero probability, guarded by
// the pre-deploy check.
const FALLBACK_STRUCTURE_SCHEMA: StructureSchema = {
  adminDepth: 4,
  includeNames: false,
  includeTypes: false,
  includeOwnership: false,
  includeCustom1: false,
  includeCustom2: false,
  includeCustom3: false,
  includeCustom4: false,
  includeCustom5: false,
};

export function structureSchemaForFamily(family: FacilityFamily): StructureSchema {
  const schema = family === "hmis"
    ? instanceState.structureSchemaHmis
    : instanceState.structureSchemaHfa;
  return schema ?? FALLBACK_STRUCTURE_SCHEMA;
}

export function updateInstanceProjects(projects: ProjectSummary[]): void {
  setInstanceState("projects", reconcile(projects));
}

export function updateProjectsLastUpdated(lastUpdated: string): void {
  setInstanceState("projectsLastUpdated", lastUpdated);
}

export function updateInstanceUsers(users: OtherUser[]): void {
  setInstanceState("users", reconcile(users));
}

export function updateInstanceAssets(assets: AssetInfo[]): void {
  setInstanceState("assets", reconcile(assets));
}

export function updateInstanceGeoJsonMaps(maps: GeoJsonMapSummary[]): void {
  setInstanceState("geojsonMaps", reconcile(maps));
}

export function updateInstanceRunsCatalog(runs: RunCatalogItem[]): void {
  setInstanceState("runsCatalog", reconcile(runs));
}

export function updateRunsCatalogSignal(signal: string): void {
  setInstanceState("runsCatalogSignal", signal);
}

export function updatePinnedRunId(pinnedRunId: string | null): void {
  setInstanceState("pinnedRunId", pinnedRunId);
}

// Live read of the current user's own catalogue entitlement (Q-B): the
// boundary's catalogue fetch tracks this, so a grant or revocation takes
// effect without a reconnect.
export function canSeeRunsCatalog(): boolean {
  return instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;
}

export function updateInstanceStructure(data: InstanceStructureSummary): void {
  setInstanceState("structure", reconcile(data.structure));
  setInstanceState("structureLastUpdated", data.structureLastUpdated);
  setInstanceState("hfaWeights", reconcile(data.hfaWeights));
}

export function updateInstanceIndicators(
  data: InstanceIndicatorsSummary,
): void {
  setInstanceState("indicators", reconcile(data.indicators));
  setInstanceState("indicatorMappingsVersion", data.indicatorMappingsVersion);
  setInstanceState(
    "baseIndicatorMappingsVersion",
    data.baseIndicatorMappingsVersion,
  );
  setInstanceState("hfaIndicatorsVersion", data.hfaIndicatorsVersion);
}

export function updateInstanceDatasets(data: InstanceDatasetsSummary): void {
  setInstanceState("datasetsWithData", reconcile(data.datasetsWithData));
  setInstanceState("datasetVersions", reconcile(data.datasetVersions));
  setInstanceState("hmisNVersions", data.hmisNVersions);
  setInstanceState("hmisImportRunActive", data.hmisImportRunActive);
  setInstanceState("hmisImportRunsQueued", data.hmisImportRunsQueued);
  setInstanceState(
    "hmisScheduledImportAttention",
    data.hmisScheduledImportAttention,
  );
  setInstanceState("hfaTimePoints", reconcile(data.hfaTimePoints));
  setInstanceState("hfaCacheHash", data.hfaCacheHash);
  setInstanceState("icehCacheHash", data.icehCacheHash);
}

// ============================================================================
// Current user (per-connection, populated by server in starting message)
// ============================================================================

export function updateCurrentUser(me: OtherUser | undefined): void {
  setInstanceState("currentUserApproved", !!me);
  setInstanceState("currentUserIsGlobalAdmin", me?.isGlobalAdmin ?? false);
  setInstanceState(
    "currentUserPermissions",
    reconcile(
      me
        ? {
            can_configure_users: me.can_configure_users,
            can_view_users: me.can_view_users,
            can_view_logs: me.can_view_logs,
            can_configure_settings: me.can_configure_settings,
            can_configure_data: me.can_configure_data,
            can_view_data: me.can_view_data,
            can_create_projects: me.can_create_projects,
          }
        : {
            can_configure_users: false,
            can_view_users: false,
            can_view_logs: false,
            can_configure_settings: false,
            can_configure_data: false,
            can_view_data: false,
            can_create_projects: false,
          },
    ),
  );
}

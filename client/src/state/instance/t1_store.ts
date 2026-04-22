import { createStore, reconcile, unwrap } from "solid-js/store";
import type {
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstanceState,
  InstanceStructureSummary,
  AssetInfo,
  GeoJsonMapSummary,
  InstanceConfigFacilityColumns,
  OtherUser,
  ProjectSummary,
} from "lib";

// ============================================================================
// Store
// ============================================================================

const [instanceState, setInstanceState] = createStore<InstanceState>({
  isReady: false,
  instanceName: "",
  maxAdminArea: 0,
  countryIso3: undefined,
  facilityColumns: {
    includeNames: false,
    includeTypes: false,
    includeOwnership: false,
    includeCustom1: false,
    includeCustom2: false,
    includeCustom3: false,
    includeCustom4: false,
    includeCustom5: false,
  },
  adminAreaLabels: {},
  projects: [],
  projectsLastUpdated: "",
  users: [],
  assets: [],
  geojsonMaps: [],
  structure: undefined,
  structureLastUpdated: undefined,
  indicators: {
    commonIndicators: 0,
    rawIndicators: 0,
    hfaIndicators: 0,
    calculatedIndicators: 0,
  },
  datasetsWithData: [],
  datasetVersions: {},
  hmisNVersions: 0,
  hfaTimePoints: [],
  hfaCacheHash: "",
  indicatorMappingsVersion: "",
  hfaIndicatorsVersion: "",
  calculatedIndicatorsVersion: "",
  currentUserEmail: "",
  currentUserApproved: false,
  currentUserIsGlobalAdmin: false,
  currentUserPermissions: {
    can_configure_users: false,
    can_view_users: false,
    can_view_logs: false,
    can_configure_settings: false,
    can_configure_assets: false,
    can_configure_data: false,
    can_view_data: false,
    can_create_projects: false,
  },
});

export { instanceState };

// ============================================================================
// Non-reactive getters (for caches and async code)
// ============================================================================

export function getIndicatorMappingsVersion(): string {
  return unwrap(instanceState).indicatorMappingsVersion;
}

export function getInstanceFacilityColumns(): InstanceConfigFacilityColumns {
  return unwrap(instanceState).facilityColumns;
}

export function getDatasetVersionHmis(): number | undefined {
  return unwrap(instanceState).datasetVersions.hmis;
}

export function getInstanceMaxAdminArea(): number {
  return unwrap(instanceState).maxAdminArea;
}

export function getInstanceCountryIso3(): string | undefined {
  return unwrap(instanceState).countryIso3;
}

export function getInstanceProjects(): ProjectSummary[] {
  return unwrap(instanceState).projects;
}

export function getInstanceUsers(): OtherUser[] {
  return unwrap(instanceState).users;
}

export function getInstanceAssets(): AssetInfo[] {
  return unwrap(instanceState).assets;
}

export function getHfaCacheHash(): string {
  return unwrap(instanceState).hfaCacheHash;
}

export function getHfaIndicatorsVersion(): string {
  return unwrap(instanceState).hfaIndicatorsVersion;
}

export function getCalculatedIndicatorsVersion(): string {
  return unwrap(instanceState).calculatedIndicatorsVersion;
}

// ============================================================================
// Setters (called by SSE handler only, never by components)
// ============================================================================

export function initInstanceState(data: InstanceState): void {
  setInstanceState(reconcile(data));
}

export function updateInstanceConfig(data: InstanceConfig): void {
  setInstanceState("maxAdminArea", data.maxAdminArea);
  setInstanceState("countryIso3", data.countryIso3);
  setInstanceState("facilityColumns", reconcile(data.facilityColumns));
  setInstanceState("adminAreaLabels", reconcile(data.adminAreaLabels));
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

export function updateInstanceStructure(data: InstanceStructureSummary): void {
  setInstanceState("structure", reconcile(data.structure));
  setInstanceState("structureLastUpdated", data.structureLastUpdated);
}

export function updateInstanceIndicators(
  data: InstanceIndicatorsSummary,
): void {
  setInstanceState("indicators", reconcile(data.indicators));
  setInstanceState("indicatorMappingsVersion", data.indicatorMappingsVersion);
  setInstanceState("hfaIndicatorsVersion", data.hfaIndicatorsVersion);
  setInstanceState(
    "calculatedIndicatorsVersion",
    data.calculatedIndicatorsVersion,
  );
}

export function updateInstanceDatasets(data: InstanceDatasetsSummary): void {
  setInstanceState("datasetsWithData", reconcile(data.datasetsWithData));
  setInstanceState("datasetVersions", reconcile(data.datasetVersions));
  setInstanceState("hmisNVersions", data.hmisNVersions);
  setInstanceState("hfaTimePoints", reconcile(data.hfaTimePoints));
  setInstanceState("hfaCacheHash", data.hfaCacheHash);
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
            can_configure_assets: me.can_configure_assets,
            can_configure_data: me.can_configure_data,
            can_view_data: me.can_view_data,
            can_create_projects: me.can_create_projects,
          }
        : {
            can_configure_users: false,
            can_view_users: false,
            can_view_logs: false,
            can_configure_settings: false,
            can_configure_assets: false,
            can_configure_data: false,
            can_view_data: false,
            can_create_projects: false,
          },
    ),
  );
}

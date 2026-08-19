import { createStore, reconcile, unwrap } from "solid-js/store";
import { _USER_PERMISSIONS_DEFAULT_NO_ACCESS } from "lib";
import type {
  FacilityFamily,
  Folder,
  LastUpdateTableName,
  StructureSchema,
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstanceState,
  InstanceStructureSummary,
  AssetInfo,
  GeoJsonMapSummary,
  OtherUser,
  ProductSummary,
  FigureLocalization,
  ReadyPackage,
  RunCatalogItem,
} from "lib";

// ============================================================================
// Store
// ============================================================================

// Hoisted so resetInstanceState can reconcile back to it. `isReady: false`
// included: a disconnect must never leave the previous user's state
// renderable (Clerk cross-tab user switch unmounts/remounts the boundary
// without a reload).
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
  aiContext: "",
  products: [],
  folders: [],
  readyPackages: [],
  lastUpdated: {
    products: {},
    slides: {},
  },
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
    calculatedIndicators: 0,
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
  hfaIndicatorsVersion: "",
  calculatedIndicatorsVersion: "",
  currentUserEmail: "",
  currentUserApproved: false,
  currentUserIsGlobalAdmin: false,
  currentUserPermissions: structuredClone(_USER_PERMISSIONS_DEFAULT_NO_ACCESS),
};

const [instanceState, setInstanceState] = createStore<InstanceState>(
  structuredClone(EMPTY_INSTANCE_STATE),
);

export { instanceState };

// ============================================================================
// Snapshot-read getters (for caches and async code) — named getSnapshot*
// ============================================================================

// The whole store, unwrapped. Read by the T2 caches' version-key callbacks
// (they run inside async code, where a tracked read would subscribe the
// caller's effect to fields it never asked for). A consumer inside a
// createEffect must still make its own TRACKED read of the version field on
// the live `instanceState` proxy before its first await — cache-internal
// reads are untracked by construction.
export function getSnapshotInstanceState(): InstanceState {
  return unwrap(instanceState);
}

export function getSnapshotInstanceCountryIso3(): string | undefined {
  return unwrap(instanceState).countryIso3;
}

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

// Called from disconnectInstanceSSE so a boundary unmount (incl. the
// Clerk-listener user-switch path, which does NOT reload) never lets the next
// user render the previous user's products, permissions, roster or catalogue.
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
  setInstanceState("aiContext", data.aiContext);
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

// ============================================================================
// Products, folders, ready packages
// ============================================================================

// PER ROW, never a list replacement: `products_upserted` carries only the
// products that actually changed (a deck-heavy instance would otherwise
// re-send every card on every collab checkpoint). An existing row is
// reconciled in place so surviving cards keep their identity; a new one is
// appended.
//
// A product's own version stamp rides its summary — there is no
// `last_updated` message for the `products` table — so the cache-version
// index is maintained from the summary here, in the same update.
export function upsertInstanceProducts(products: ProductSummary[]): void {
  for (const product of products) {
    const index = instanceState.products.findIndex((p) => p.id === product.id);
    if (index === -1) {
      setInstanceState("products", instanceState.products.length, product);
    } else {
      setInstanceState("products", index, reconcile(product));
    }
    setInstanceState("lastUpdated", "products", product.id, product.lastUpdated);
  }
}

export function removeInstanceProducts(ids: string[]): void {
  const removed = new Set(ids);
  const snapshot = unwrap(instanceState);
  setInstanceState(
    "products",
    reconcile(snapshot.products.filter((p) => !removed.has(p.id))),
  );
  // Reconcile, not a merged partial: a store set with a plain object MERGES,
  // so a rebuilt record would leave the dead keys behind.
  const stamps = { ...snapshot.lastUpdated.products };
  for (const id of ids) {
    delete stamps[id];
  }
  setInstanceState("lastUpdated", "products", reconcile(stamps));
}

export function updateInstanceFolders(folders: Folder[]): void {
  setInstanceState("folders", reconcile(folders));
}

export function updateInstanceReadyPackages(packages: ReadyPackage[]): void {
  setInstanceState("readyPackages", reconcile(packages));
}

// The cache-version index (S3 "the last_updated → SSE → cache triangle").
// Carries `slides` only: a product's stamp comes from its own summary above.
export function updateInstanceLastUpdated(
  tableName: LastUpdateTableName,
  ids: string[],
  lastUpdated: string,
): void {
  for (const id of ids) {
    setInstanceState("lastUpdated", tableName, id, lastUpdated);
  }
}

// Live derived lookup: the editors read their product's label, package and
// scope from the T1 row (D16 — never from a snapshot taken at open), so a
// reattach or scope change mid-edit moves the figures' authoring context and
// lights the stale badges.
export function productById(id: string): ProductSummary | undefined {
  return instanceState.products.find((p) => p.id === id);
}

// The ONE product-surface edit gate (D2: every approved user is a full editor
// of every product). A later permission model replaces this function, not
// twenty scattered checks.
export function canEditProducts(): boolean {
  return instanceState.currentUserApproved;
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
          }
        : structuredClone(_USER_PERMISSIONS_DEFAULT_NO_ACCESS),
    ),
  );
}

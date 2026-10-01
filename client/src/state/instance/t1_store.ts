import { type Accessor, createMemo } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type {
  AssetInfo,
  DatasetType,
  FacilityFamily,
  FigureLocalization,
  FigureScope,
  Folder,
  GeoJsonMapSummary,
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstancePopulationSummary,
  InstanceState,
  InstanceStructureSummary,
  LastUpdateTableName,
  OtherUser,
  PackageScope,
  ProductSummary,
  ReadyPackage,
  ResolvedPackageScope,
  RunCatalogItem,
  Scope,
  StructureSchema,
} from "lib";
import {
  ALL_SCOPES,
  permissionsUnderScopeAccess,
  resolvePackageScope,
  scopeAreaForFamily,
} from "lib";

// ============================================================================
// Store
// ============================================================================

// Hoisted so resetInstanceState can reconcile back to it. `isReady: false`
// included: a disconnect
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
  aiContext: "",
  products: [],
  folders: [],
  readyPackages: [],
  scopes: [],
  lastUpdated: { products: {}, slides: {} },
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
    hmisIndicators: 0,
    hfaIndicators: 0,
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
  populationLevel: undefined,
  populationRowCount: 0,
  populationCoverage: [],
  populationLastUpdated: undefined,
  indicatorsVersion: "",
  countIndicatorsVersion: "",
  hfaIndicatorsVersion: "",
  currentUserEmail: "",
  currentUserApproved: false,
  currentUserIsGlobalAdmin: false,
  currentUserScopeAccess: ALL_SCOPES,
  currentUserPermissions: {
    can_configure_users: false,
    can_view_users: false,
    can_view_logs: false,
    can_configure_settings: false,
    can_configure_data: false,
    can_view_data: false,
  },
};

const [instanceState, setInstanceState] = createStore<InstanceState>(
  structuredClone(EMPTY_INSTANCE_STATE),
);

export { instanceState };

// ============================================================================
// Snapshot-read getters (for caches and async code): named getSnapshot*
// ============================================================================

// The whole store, unwrapped, for the T2 caches' version-key callbacks: they
// run inside async code, where a tracked read would subscribe the caller's
// effect to fields it never asked for. A consumer inside a createEffect must
// still make its own TRACKED read of the version field on the live
// `instanceState` proxy before its first await.
export function getSnapshotInstanceState(): InstanceState {
  return unwrap(instanceState);
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

// Called from disconnectInstanceSSE so a boundary
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
// instance whose schema row is missing: near-zero probability, guarded by
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

export function structureSchemaForFamily(
  family: FacilityFamily,
): StructureSchema {
  const schema = family === "hmis"
    ? instanceState.structureSchemaHmis
    : instanceState.structureSchemaHfa;
  return schema ?? FALLBACK_STRUCTURE_SCHEMA;
}

// ============================================================================
// Products, folders, ready packages (PLAN_PRODUCTS_RESTRUCTURE D8)
// ============================================================================

// PER ROW, never a list replacement: `products_upserted` carries only the
// products that changed. An existing row is reconciled in place so surviving
// cards keep their identity; a new one is appended. A product's version
// stamp rides its summary, so the cache-version index is maintained from it
// in the same update.
export function upsertInstanceProducts(products: ProductSummary[]): void {
  for (const product of products) {
    const index = instanceState.products.findIndex((p) => p.id === product.id);
    if (index === -1) {
      setInstanceState("products", instanceState.products.length, product);
    } else {
      setInstanceState("products", index, reconcile(product));
    }
    setInstanceState(
      "lastUpdated",
      "products",
      product.id,
      product.lastUpdated,
    );
  }
}

export function removeInstanceProducts(ids: string[]): void {
  const removed = new Set(ids);
  const snapshot = unwrap(instanceState);
  setInstanceState(
    "products",
    reconcile(snapshot.products.filter((p) => !removed.has(p.id))),
  );
  // Reconcile, not a merged partial: a store set with a plain object merges,
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

export function updateInstanceScopes(scopes: Scope[]): void {
  setInstanceState("scopes", reconcile(scopes));
}

// A pair with its scope read from T1. Reactive where it is called in a
// tracking context, so a stale check or a caption follows an edit to the
// scope's definition or label.
export function resolveScope(scope: PackageScope): ResolvedPackageScope {
  return resolvePackageScope(scope, instanceState.scopes);
}

// The resolved pair as a memo that keeps its previous object while the run,
// the scope id and the definition hash are unchanged. resolveScope reads the
// whole scopes list, so a consumer that tracked it directly would re-run when
// any other scope is created or deleted.
export function createResolvedScope(
  scope: Accessor<PackageScope | undefined>,
): Accessor<ResolvedPackageScope | undefined> {
  return createMemo<ResolvedPackageScope | undefined>((prev) => {
    const pair = scope();
    if (pair === undefined) return undefined;
    const next = resolveScope(pair);
    return prev !== undefined && prev.runId === next.runId &&
        prev.scopeId === next.scopeId &&
        prev.definitionHash === next.definitionHash
      ? prev
      : next;
  });
}

// The server resolves a scope id against the `scopes` row at request time,
// and this store learns of an edit only when `scopes_updated` arrives, so the
// two can disagree for a moment (or for as long as the stream is down). A
// figure-data cache therefore keys by the hash resolved when the read starts
// and stores a response only when the server computed it under that hash.
export function answersKeyedScope(
  data: { scopeToken: string },
  params: { scope: ResolvedPackageScope },
): boolean {
  return data.scopeToken === params.scope.definitionHash;
}

// What a bundle resolved under this pair records beside its run id. The hash
// is the one the server computed the rows under (the payload's scopeToken),
// never this store's: rows read under a definition the store has since
// replaced must read as stale. The area is the one the scope holds the
// figure's own family to.
export function figureScopeStamp(
  scope: PackageScope,
  scopeToken: string,
  family: DatasetType | undefined,
): FigureScope {
  return {
    definitionHash: scopeToken,
    adminArea2: scopeAreaForFamily(resolveScope(scope).areas, family),
  };
}

// The cache-version index (S3's last_updated to SSE to cache triangle). The
// message carries `slides` only: a product's own stamp arrives on its
// `products_upserted` summary and is written by upsertInstanceProducts.
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
// scope from the T1 row (D16), never from a snapshot taken at open, so a
// reattach or scope change mid-edit moves the figure data and the authoring
// context together and lights the stale badges.
export function productById(id: string): ProductSummary | undefined {
  return instanceState.products.find((p) => p.id === id);
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
  setInstanceState("indicatorsVersion", data.indicatorsVersion);
  setInstanceState(
    "countIndicatorsVersion",
    data.countIndicatorsVersion,
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

export function updateInstancePopulation(
  data: InstancePopulationSummary,
): void {
  setInstanceState("populationLevel", data.populationLevel);
  setInstanceState("populationRowCount", data.populationRowCount);
  setInstanceState("populationCoverage", reconcile(data.populationCoverage));
  setInstanceState("populationLastUpdated", data.populationLastUpdated);
}

// ============================================================================
// Current user (per-connection, populated by server in starting message)
// ============================================================================

// The roster row carries stored permission bits; the current user's are
// reduced for a restricted user (R26), as the server reduces them.
export function updateCurrentUser(me: OtherUser | undefined): void {
  const scopeAccess = me?.scopeAccess ?? ALL_SCOPES;
  const permissions = me === undefined
    ? undefined
    : permissionsUnderScopeAccess(me, scopeAccess);
  setInstanceState("currentUserApproved", !!me);
  setInstanceState("currentUserIsGlobalAdmin", me?.isGlobalAdmin ?? false);
  setInstanceState("currentUserScopeAccess", reconcile(scopeAccess));
  setInstanceState(
    "currentUserPermissions",
    reconcile(
      permissions
        ? {
          can_configure_users: permissions.can_configure_users,
          can_view_users: permissions.can_view_users,
          can_view_logs: permissions.can_view_logs,
          can_configure_settings: permissions.can_configure_settings,
          can_configure_data: permissions.can_configure_data,
          can_view_data: permissions.can_view_data,
        }
        : {
          can_configure_users: false,
          can_view_users: false,
          can_view_logs: false,
          can_configure_settings: false,
          can_configure_data: false,
          can_view_data: false,
        },
    ),
  );
}

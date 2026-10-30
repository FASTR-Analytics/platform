import {
  ALL_SCOPES,
  effectivePermissions,
  type GlobalUser,
  type InstanceGrounding,
  type InstanceState,
  rosterForViewer,
  type RunCatalogItem,
  type ScopeId,
  userPermissions,
} from "lib";
import type { Sql } from "postgres";
import { holdsProductLevel, visibleFolderIds } from "../auth/product_access.ts";
import {
  getInstanceDatasetsSummary,
  getInstanceDetail,
  getInstanceIndicatorsSummary,
  getInstancePopulationSummary,
  getInstanceUsers,
} from "../db/mod.ts";
import { getAssetsForUser } from "../db/instance/assets.ts";
import {
  getPinnedRunId,
  listReadyPackages,
  listRunCatalog,
} from "../db/instance/run_generation.ts";
import { listScopes } from "../db/instance/scopes.ts";
import { listFolders } from "../db/products/folders.ts";
import { listProducts } from "../db/products/products.ts";
import { listSlideLastUpdated } from "../db/products/slides.ts";
import {
  _INSTANCE_CALENDAR,
  _INSTANCE_COUNTRY_ISO3,
  _INSTANCE_FISCAL_YEAR,
  _INSTANCE_LANGUAGE,
} from "../exposed_env_vars.ts";

type GroundingResult =
  | { success: true; data: InstanceGrounding }
  | { success: false; err: string };

type BuildResult =
  | { success: true; data: InstanceState }
  | { success: false; err: string };

/**
 * The instance facts every connection shares: the config, the summaries and
 * the pin, with no roster, no catalogue and no product plane. The /mcp
 * context cache grounds on this alone (mcp/context_cache.ts); the SSE handler
 * builds the per-connection state over it with buildInstanceState below.
 */
export async function buildInstanceGrounding(
  mainDb: Sql,
): Promise<GroundingResult> {
  const res = await getInstanceDetail(mainDb);
  if (!res.success) {
    return { success: false, err: res.err };
  }
  const datasetsSummary = await getInstanceDatasetsSummary(mainDb);
  const indicatorsSummary = await getInstanceIndicatorsSummary(mainDb);
  const populationSummary = await getInstancePopulationSummary(mainDb);
  // Degrades to null like every list here degrades to empty: a read failure
  // must not stop the boundary from coming up.
  const pinnedRes = await getPinnedRunId(mainDb);
  let pinnedRunId: string | null = null;
  if (pinnedRes.success) {
    pinnedRunId = pinnedRes.data;
  } else {
    console.error(`buildInstanceGrounding pinnedRunId: ${pinnedRes.err}`);
  }
  return {
    success: true,
    data: {
      isReady: true,
      instanceName: res.data.instanceName,
      instanceLanguage: _INSTANCE_LANGUAGE,
      instanceCalendar: _INSTANCE_CALENDAR,
      instanceFiscalYear: _INSTANCE_FISCAL_YEAR,
      countryIso3: _INSTANCE_COUNTRY_ISO3,
      structureSchemaHmis: res.data.structureSchemaHmis,
      structureSchemaHfa: res.data.structureSchemaHfa,
      adminAreaLabels: res.data.adminAreaLabels,
      dhis2ConnectionUrl: res.data.dhis2ConnectionUrl,
      aiContext: res.data.aiContext,
      geojsonMaps: res.data.geojsonMaps,
      pinnedRunId,
      structure: res.data.structure,
      structureLastUpdated: res.data.structureLastUpdated,
      hfaWeights: res.data.hfaWeights,
      ...indicatorsSummary,
      ...datasetsSummary,
      ...populationSummary,
    },
  };
}

// Blanked for a connection whose user is absent from the roster: the copilot
// grounding and the boundary files have no consumer on the pending-approval
// screen, and the roster, the catalogue and the product plane are withheld
// by the same rule.
export function groundingForUnapproved(
  grounding: InstanceGrounding,
): InstanceGrounding {
  return { ...grounding, aiContext: "", geojsonMaps: [] };
}

/**
 * One connection's `starting` payload: the grounding, the roster projected
 * for the viewer, the viewer's assets, the catalogue when entitled, and for
 * an approved connection the product plane it can see (restrictProductPlane).
 * Each read degrades independently: a failure logs and leaves that list
 * empty rather than stopping the boundary from coming up.
 */
export async function buildInstanceState(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<BuildResult> {
  const groundingRes = await buildInstanceGrounding(mainDb);
  if (!groundingRes.success) {
    return groundingRes;
  }
  const users = await getInstanceUsers(mainDb);
  const me = users.find((u) => u.email === globalUser.email);
  const assetsRes = await getAssetsForUser(mainDb, globalUser);
  if (!assetsRes.success) {
    console.error(`buildInstanceState assets: ${assetsRes.err}`);
  }
  const myPermissions = me === undefined
    ? userPermissions(false)
    : effectivePermissions(me);
  // Per-user fill (run labels must not fan out): entitled callers get the
  // catalogue in the starting payload, a fresh-auth point-in-time response,
  // like every field here, and everyone else gets []. After connect,
  // runs_catalog_updated broadcasts only a timestamp and entitled clients
  // refetch via listRunCatalog (per-request guard).
  let runsCatalog: RunCatalogItem[] = [];
  if (myPermissions.can_view_data) {
    const runsRes = await listRunCatalog(mainDb);
    if (runsRes.success) {
      runsCatalog = runsRes.data;
    } else {
      console.error(`buildInstanceState runsCatalog: ${runsRes.err}`);
    }
  }
  const state: InstanceState = {
    ...(me === undefined
      ? groundingForUnapproved(groundingRes.data)
      : groundingRes.data),
    products: [],
    folders: [],
    readyPackages: [],
    scopes: [],
    lastUpdated: { products: {}, slides: {} },
    // The roster, projected for this connection (rosterForViewer); the SSE
    // forward filter applies the same projection to every users_updated.
    users: rosterForViewer(users, globalUser.email),
    assets: assetsRes.success ? assetsRes.data : [],
    runsCatalog,
    // Fresh nonce per connect: the client's boundary effect sees a changed
    // value after every `starting` and refetches: DELIBERATE, the reconnect
    // self-healing path (see the field's doc in lib/types/instance_sse.ts).
    runsCatalogSignal: crypto.randomUUID(),
    currentUserEmail: globalUser.email,
    currentUserApproved: me !== undefined,
    currentUserIsGlobalAdmin: me?.isGlobalAdmin ?? false,
    currentUserScopeAccess: me?.scopeAccess ?? ALL_SCOPES,
    currentUserPermissions: myPermissions,
  };
  if (me === undefined) {
    return { success: true, data: state };
  }

  const [productsRes, foldersRes, packagesRes, scopesRes, slideStampsRes] =
    await Promise.all([
      listProducts(mainDb),
      listFolders(mainDb),
      listReadyPackages(mainDb),
      listScopes(mainDb),
      listSlideLastUpdated(mainDb),
    ]);
  for (
    const [name, r] of [
      ["products", productsRes],
      ["folders", foldersRes],
      ["readyPackages", packagesRes],
      ["scopes", scopesRes],
      ["slide stamps", slideStampsRes],
    ] as const
  ) {
    if (!r.success) {
      console.error(`buildInstanceState ${name}: ${r.err}`);
    }
  }

  const plane = restrictProductPlane(
    {
      email: state.currentUserEmail,
      isGlobalAdmin: state.currentUserIsGlobalAdmin,
      scopeAccess: state.currentUserScopeAccess,
    },
    {
      products: productsRes.success ? productsRes.data : [],
      folders: foldersRes.success ? foldersRes.data : [],
      scopes: scopesRes.success ? scopesRes.data : [],
    },
  );
  const visibleProductIds = new Set(plane.products.map((p) => p.id));

  // A product's own stamp IS its cache version, so the index is derived from
  // the list rather than read twice; products_upserted keeps it in step.
  const productStamps: Record<string, string> = {};
  for (const product of plane.products) {
    productStamps[product.id] = product.lastUpdated;
  }
  const slideStamps: Record<string, string> = {};
  for (const stamp of slideStampsRes.success ? slideStampsRes.data : []) {
    if (visibleProductIds.has(stamp.productId)) {
      slideStamps[stamp.slideId] = stamp.lastUpdated;
    }
  }

  return {
    success: true,
    data: {
      ...state,
      ...plane,
      readyPackages: packagesRes.success ? packagesRes.data : [],
      lastUpdated: { products: productStamps, slides: slideStamps },
    },
  };
}

type ProductPlane = Pick<InstanceState, "products" | "folders" | "scopes">;

// The share of the product plane a connection can see: the products it holds
// view on, by scope and level, and the folders visibleFolderIds keeps for it
// (those holding a visible product, or that it created); a restricted
// connection also keeps only its granted scopes. A global admin's plane is
// whole.
export function restrictProductPlane(
  viewer: Pick<GlobalUser, "email" | "isGlobalAdmin" | "scopeAccess">,
  plane: ProductPlane,
): ProductPlane {
  if (viewer.isGlobalAdmin) return plane;
  const products = plane.products.filter((p) =>
    holdsProductLevel(viewer, p.scopeId, p, "view")
  );
  const folderIds = visibleFolderIds(
    plane.folders,
    products.map((p) => p.folderId),
    viewer.email,
  );
  const folders = plane.folders.filter((f) => folderIds.has(f.id));
  const access = viewer.scopeAccess;
  if (access.all) return { ...plane, products, folders };
  const granted: ReadonlySet<ScopeId> = new Set(access.scopeIds);
  return {
    products,
    folders,
    scopes: plane.scopes.filter((s) => granted.has(s.id)),
  };
}

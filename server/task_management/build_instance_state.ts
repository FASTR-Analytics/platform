import {
  ALL_SCOPES,
  type GlobalUser,
  type InstanceState,
  permissionsUnderScopeAccess,
  type RunCatalogItem,
  type ScopeAccess,
} from "lib";
import type { Sql } from "postgres";
import { visibleFolderIds } from "../auth/product_access.ts";
import {
  getInstanceDatasetsSummary,
  getInstanceDetail,
  getInstanceIndicatorsSummary,
  getInstancePopulationSummary,
} from "../db/mod.ts";
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

type BuildResult =
  | { success: true; data: InstanceState }
  | { success: false; err: string };

/**
 * The instance grounding half of the `starting` payload: everything except
 * the product plane, which is empty here. This is what the /mcp context
 * cache grounds on (mcp/context_cache.ts): it reads instance facts only, so
 * the product lists would be pure weight in a per-principal cache. The SSE
 * handler uses buildInstanceState below.
 */
export async function buildInstanceStateWithoutProducts(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<BuildResult> {
  const res = await getInstanceDetail(mainDb);
  if (!res.success) {
    return { success: false, err: res.err };
  }

  const datasetsSummary = await getInstanceDatasetsSummary(mainDb);
  const indicatorsSummary = await getInstanceIndicatorsSummary(mainDb);
  const populationSummary = await getInstancePopulationSummary(mainDb);

  const users = res.data.users;
  const me = users.find((u) => u.email === globalUser.email);
  // Roster fill mirrors the SSE forward filter (routes/instance/instance-sse.ts):
  // an unapproved caller, absent from the roster, gets [] instead of every
  // user's email, name and permission map. Their pending-approval screen has
  // no roster consumer, and the first `users_updated` naming them flows whole.
  const rosterForCaller = me === undefined ? [] : users;

  // Per-user fill (Q-B: run labels must not fan out): entitled callers get the catalogue in the starting payload, a
  // fresh-auth point-in-time response, like every field here, and everyone
  // else gets []. After connect, runs_catalog_updated broadcasts only a
  // timestamp and entitled clients refetch via listRunCatalog (per-request
  // guard). The /mcp context cache inherits the same fill, which is correct.
  const scopeAccess = me?.scopeAccess ?? ALL_SCOPES;
  const myPermissions = me === undefined
    ? undefined
    : permissionsUnderScopeAccess(me, scopeAccess);
  const canSeeRuns = (me?.isGlobalAdmin ?? false) ||
    (myPermissions?.can_configure_data ?? false);
  let runsCatalog: RunCatalogItem[] = [];
  if (canSeeRuns) {
    const runsRes = await listRunCatalog(mainDb);
    if (runsRes.success) {
      runsCatalog = runsRes.data;
    } else {
      console.error(`buildInstanceState runsCatalog: ${runsRes.err}`);
    }
  }
  // Every caller, entitled or not: the id alone is not gated (see the
  // field's doc in lib/types/instance_sse.ts). Degrades to null like the
  // catalogue above degrades to []: a read failure must not stop the
  // boundary from coming up.
  const pinnedRes = await getPinnedRunId(mainDb);
  let pinnedRunId: string | null = null;
  if (pinnedRes.success) {
    pinnedRunId = pinnedRes.data;
  } else {
    console.error(`buildInstanceState pinnedRunId: ${pinnedRes.err}`);
  }

  const instanceState: InstanceState = {
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
    products: [],
    folders: [],
    readyPackages: [],
    scopes: [],
    lastUpdated: { products: {}, slides: {} },
    users: rosterForCaller,
    assets: res.data.assets,
    geojsonMaps: res.data.geojsonMaps,
    // Fresh nonce per connect: the client's boundary effect sees a changed
    // value after every `starting` and refetches: DELIBERATE, the reconnect
    // self-healing path (see the field's doc in lib/types/instance_sse.ts).
    runsCatalog,
    runsCatalogSignal: crypto.randomUUID(),
    pinnedRunId,
    structure: res.data.structure,
    structureLastUpdated: res.data.structureLastUpdated,
    hfaWeights: res.data.hfaWeights,
    ...indicatorsSummary,
    ...datasetsSummary,
    ...populationSummary,
    currentUserEmail: globalUser.email,
    currentUserApproved: !!me,
    currentUserIsGlobalAdmin: me?.isGlobalAdmin ?? false,
    currentUserScopeAccess: scopeAccess,
    currentUserPermissions: myPermissions
      ? {
        can_configure_users: myPermissions.can_configure_users,
        can_view_users: myPermissions.can_view_users,
        can_view_logs: myPermissions.can_view_logs,
        can_configure_settings: myPermissions.can_configure_settings,
        can_configure_data: myPermissions.can_configure_data,
        can_view_data: myPermissions.can_view_data,
      }
      : {
        can_configure_users: false,
        can_view_users: false,
        can_view_logs: false,
        can_configure_settings: false,
        can_configure_data: false,
        can_view_data: false,
      },
  };

  return { success: true, data: instanceState };
}

/**
 * The full instance-SSE `starting` payload: the grounding half plus the
 * product plane (products, folders, ready packages, scopes and the last_updated
 * cache-version index; PLAN_PRODUCTS_RESTRUCTURE D8).
 *
 * The product plane is withheld from an UNAPPROVED connection by the same
 * roster rule that empties `users`; the client reconnects once a roster
 * names its user, which rebuilds this payload whole. A RESTRICTED connection
 * gets only its grants' share (restrictProductPlane). Each read degrades
 * independently: a failure logs and leaves that list empty rather than
 * stopping the boundary from coming up (the runsCatalog rule).
 */
export async function buildInstanceState(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<BuildResult> {
  const res = await buildInstanceStateWithoutProducts(mainDb, globalUser);
  if (!res.success || !res.data.currentUserApproved) {
    return res;
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

  const plane = restrictProductPlane(res.data.currentUserScopeAccess, {
    products: productsRes.success ? productsRes.data : [],
    folders: foldersRes.success ? foldersRes.data : [],
    scopes: scopesRes.success ? scopesRes.data : [],
  });
  const slideStamps = slideStampsRes.success ? slideStampsRes.data : {};
  const visibleSlideIds = res.data.currentUserScopeAccess.all
    ? undefined
    : new Set(
      await slideIdsInScopes(
        mainDb,
        Object.keys(slideStamps),
        res.data.currentUserScopeAccess.scopeIds,
      ),
    );

  // A product's own stamp IS its cache version, so the index is derived from
  // the list rather than read twice; products_upserted keeps it in step.
  const productStamps: Record<string, string> = {};
  for (const product of plane.products) {
    productStamps[product.id] = product.lastUpdated;
  }

  return {
    success: true,
    data: {
      ...res.data,
      ...plane,
      readyPackages: packagesRes.success ? packagesRes.data : [],
      lastUpdated: {
        products: productStamps,
        slides: visibleSlideIds === undefined
          ? slideStamps
          : Object.fromEntries(
            Object.entries(slideStamps).filter(([id]) =>
              visibleSlideIds.has(id)
            ),
          ),
      },
    },
  };
}

type ProductPlane = Pick<InstanceState, "products" | "folders" | "scopes">;

// A restricted user's share of the product plane (PLAN_SCOPES §2.6): the
// products and scopes of their grants, and the folders that hold one of
// those products (R23). An unrestricted user's plane is returned whole.
export function restrictProductPlane(
  access: ScopeAccess,
  plane: ProductPlane,
): ProductPlane {
  if (access.all) return plane;
  const granted = new Set(access.scopeIds);
  const products = plane.products.filter((p) => granted.has(p.scopeId));
  const folderIds = visibleFolderIds(
    plane.folders,
    products.map((p) => p.folderId),
  );
  return {
    products,
    folders: plane.folders.filter((f) => folderIds.has(f.id)),
    scopes: plane.scopes.filter((s) => granted.has(s.id)),
  };
}

// The slides, of those named, whose deck carries one of the scopes.
export async function slideIdsInScopes(
  mainDb: Sql,
  slideIds: string[],
  scopeIds: string[],
): Promise<string[]> {
  if (slideIds.length === 0 || scopeIds.length === 0) return [];
  const rows = await mainDb<{ id: string }[]>`
    SELECT s.id FROM slides s
    JOIN products p ON p.id = s.slide_deck_id
    WHERE s.id = ANY(${slideIds}) AND p.scope_id = ANY(${scopeIds})
  `;
  return rows.map((r) => r.id);
}

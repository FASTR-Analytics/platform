import type { GlobalUser, InstanceState, RunCatalogItem } from "lib";
import type { Sql } from "postgres";
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
  const res = await getInstanceDetail(mainDb, globalUser);
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

  // Per-user fill, the `projects` pattern (Q-B: run labels must not fan
  // out): entitled callers get the catalogue in the starting payload, a
  // fresh-auth point-in-time response, like every field here, and everyone
  // else gets []. After connect, runs_catalog_updated broadcasts only a
  // timestamp and entitled clients refetch via listRunCatalog (per-request
  // guard). The /mcp context cache inherits the same fill, which is correct.
  const canSeeRuns = (me?.isGlobalAdmin ?? false) ||
    (me?.can_configure_data ?? false);
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
    projects: res.data.projects,
    projectsLastUpdated: new Date().toISOString(),
    products: [],
    folders: [],
    readyPackages: [],
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
    currentUserPermissions: me
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
  };

  return { success: true, data: instanceState };
}

/**
 * The full instance-SSE `starting` payload: the grounding half plus the
 * product plane (products, folders, ready packages and the last_updated
 * cache-version index; PLAN_PRODUCTS_RESTRUCTURE D8).
 *
 * The product plane is withheld from an UNAPPROVED connection by the same
 * roster rule that empties `users`; the client reconnects once a roster
 * names its user, which rebuilds this payload whole. Each read degrades
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

  const [productsRes, foldersRes, packagesRes, slideStampsRes] = await Promise
    .all([
      listProducts(mainDb),
      listFolders(mainDb),
      listReadyPackages(mainDb),
      listSlideLastUpdated(mainDb),
    ]);
  for (
    const [name, r] of [
      ["products", productsRes],
      ["folders", foldersRes],
      ["readyPackages", packagesRes],
      ["slide stamps", slideStampsRes],
    ] as const
  ) {
    if (!r.success) {
      console.error(`buildInstanceState ${name}: ${r.err}`);
    }
  }

  // A product's own stamp IS its cache version, so the index is derived from
  // the list rather than read twice; products_upserted keeps it in step.
  const products = productsRes.success ? productsRes.data : [];
  const productStamps: Record<string, string> = {};
  for (const product of products) {
    productStamps[product.id] = product.lastUpdated;
  }

  return {
    success: true,
    data: {
      ...res.data,
      products,
      folders: foldersRes.success ? foldersRes.data : [],
      readyPackages: packagesRes.success ? packagesRes.data : [],
      lastUpdated: {
        products: productStamps,
        slides: slideStampsRes.success ? slideStampsRes.data : {},
      },
    },
  };
}

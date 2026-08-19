import type { Sql } from "postgres";
import type {
  AssetInfo,
  Folder,
  GeoJsonMapSummary,
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstanceSseMessage,
  InstanceStructureSummary,
  OtherUser,
  ProductSummary,
  RunProgress,
} from "lib";
import {
  getAdminAreaLabelsConfig,
  getStructureSchema,
} from "../db/instance/config.ts";
import { getStoredDhis2CredentialsInfo } from "../db/instance/instance_dhis2_credentials.ts";
import { _INSTANCE_COUNTRY_ISO3 } from "../exposed_env_vars.ts";

const broadcastInstanceUpdates = new BroadcastChannel("instance_updates");

export function notifyInstanceUpdate(message: InstanceSseMessage) {
  broadcastInstanceUpdates.postMessage(message);
}

export function notifyInstanceConfigUpdated(config: InstanceConfig) {
  notifyInstanceUpdate({ type: "config_updated", data: config });
}

// Reads the live per-family schemas + shared labels and broadcasts them.
// Fired after config edits, structure integration and both delete paths. A
// missing schema row (near-zero probability, guarded by the pre-deploy check)
// broadcasts as null rather than suppressing the event.
export async function notifyInstanceConfigUpdatedFromDb(mainDb: Sql) {
  const [hmisRes, hfaRes, labelsRes, dhis2Info] = await Promise.all([
    getStructureSchema(mainDb, "hmis"),
    getStructureSchema(mainDb, "hfa"),
    getAdminAreaLabelsConfig(mainDb),
    getStoredDhis2CredentialsInfo(mainDb),
  ]);
  if (labelsRes.success === false) {
    return;
  }
  const config: InstanceConfig = {
    structureSchemaHmis: hmisRes.success ? hmisRes.data : null,
    structureSchemaHfa: hfaRes.success ? hfaRes.data : null,
    countryIso3: _INSTANCE_COUNTRY_ISO3,
    adminAreaLabels: labelsRes.data,
    dhis2ConnectionUrl: dhis2Info?.url ?? null,
  };
  notifyInstanceConfigUpdated(config);
}

// The ONE product-list message. Per-row, not whole-list: every product
// mutation route and every collab checkpoint emits the summary for the ids it
// touched, so a keystroke checkpoint on one deck never re-sends the whole
// instance's cards. A summary's own `lastUpdated` is what versions that
// product's detail cache — there is no separate `last_updated` emit for it.
export function notifyInstanceProductsUpserted(products: ProductSummary[]) {
  if (products.length === 0) {
    return;
  }
  notifyInstanceUpdate({ type: "products_upserted", data: { products } });
}

export function notifyInstanceProductsDeleted(ids: string[]) {
  if (ids.length === 0) {
    return;
  }
  notifyInstanceUpdate({ type: "products_deleted", data: { ids } });
}

// Folders are few and change rarely, so the whole list rides each change —
// the per-row treatment products need buys nothing here.
export function notifyInstanceFoldersUpdated(folders: Folder[]) {
  notifyInstanceUpdate({ type: "folders_updated", data: { folders } });
}

export function notifyInstanceUsersUpdated(users: OtherUser[]) {
  notifyInstanceUpdate({ type: "users_updated", data: users });
}

export function notifyInstanceAssetsUpdated(assets: AssetInfo[]) {
  notifyInstanceUpdate({ type: "assets_updated", data: assets });
}

export function notifyInstanceGeoJsonMapsUpdated(maps: GeoJsonMapSummary[]) {
  notifyInstanceUpdate({ type: "geojson_maps_updated", data: maps });
}

export function notifyInstanceStructureUpdated(data: InstanceStructureSummary) {
  notifyInstanceUpdate({ type: "structure_updated", data });
}

export function notifyInstanceIndicatorsUpdated(data: InstanceIndicatorsSummary) {
  notifyInstanceUpdate({ type: "indicators_updated", data });
}

export function notifyInstanceDatasetsUpdated(data: InstanceDatasetsSummary) {
  notifyInstanceUpdate({ type: "datasets_updated", data });
}

// The catalogue's T1 signal (the projects_last_updated pattern): a data-free
// signal broadcast — each entitled client refetches via listRunCatalog,
// whose guard is evaluated per request, so nothing sensitive rides the wire
// and no per-connection filtering is needed. Fired by every in-process
// catalogue mutation — launch (incl. its row-created-then-failed path),
// delete, worker finalize/fail/crash, attach/repoint, and the
// projects.run_id/label movers (project force-delete, copy completion,
// rename). The backfill synthesizer is a separate process, so its runs
// surface on the next reconnect instead (plan ruling 2).
//
// The value is a NONCE, not a timestamp: two mutations in the same
// millisecond minted identical ISO strings, and the client store's equality
// guard dropped the second write — the second refetch never fired. A nonce
// cannot collide, and needs no cross-context counter coordination (the
// generate-run worker has its own module instance of this file, so a
// monotonic counter would regress across contexts).
export function notifyInstanceRunsCatalogUpdated() {
  notifyInstanceUpdate({
    type: "runs_catalog_updated",
    data: crypto.randomUUID(),
  });
}

// The pinned package moved or was cleared (SYSTEM_08 "The pinned package
// + followers"). Plain unfiltered broadcast — a bare run id is not
// sensitive, and it is the one field every Pinned badge derives from.
// Callers ALSO re-nonce the catalogue (a pin-move moves attachedProjects).
export function notifyInstancePinnedRunUpdated(pinnedRunId: string | null) {
  notifyInstanceUpdate({ type: "pinned_run_updated", data: { pinnedRunId } });
}

// Results-package generation telemetry, for the instance catalogue (Q-B) —
// the ONLY channel it rides: a project is attached only once a run is
// ready, so no project channel has a live view to feed. routesInstanceSSE
// drops both messages for callers without can_configure_data (live filter).
export function notifyInstanceRunProgress(runId: string, progress: RunProgress) {
  notifyInstanceUpdate({ type: "run_progress", data: { runId, progress } });
}

export function notifyInstanceRScript(
  runId: string,
  moduleId: string,
  text: string,
) {
  notifyInstanceUpdate({ type: "r_script", data: { runId, moduleId, text } });
}

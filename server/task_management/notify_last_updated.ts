import {
  LastUpdateTableName,
  // _ID_FOR_PO_LISTING,
  ProjectSseUpdateMessage,
} from "lib";
import { notifyProjectLastUpdatedV2 } from "./notify_project_v2.ts";

const broadcastDirtyStates = new BroadcastChannel("dirty_states");

export function notifyProjectUpdated(projectId: string, lastUpdated: string) {
  const bm1: ProjectSseUpdateMessage = {
    projectId,
    type: "project_updated",
    lastUpdated,
  };
  broadcastDirtyStates.postMessage(bm1);
}

export function notifyLastUpdated(
  projectId: string,
  tableName: LastUpdateTableName,
  ids: string[],
  lastUpdated: string
) {
  const bm1: ProjectSseUpdateMessage = {
    projectId,
    type: "last_updated",
    tableName,
    ids,
    lastUpdated,
  };
  broadcastDirtyStates.postMessage(bm1);
  notifyProjectLastUpdatedV2(projectId, tableName, ids, lastUpdated);
}

// let _LAST_UPDATED_PO_LISTING = new Date().toISOString();

// export function notifyLastUpdatedForPOListing(projectId: string) {
//   _LAST_UPDATED_PO_LISTING = new Date().toISOString();
//   const bm1: ProjectSseUpdateMessage = {
//     projectId,
//     type: "last_update",
//     obj: { [_ID_FOR_PO_LISTING]: _LAST_UPDATED_PO_LISTING },
//   };
//   broadcastDirtyStates.postMessage(bm1);
// }

// export function getLastUpdatedForPOListing() {
//   return _LAST_UPDATED_PO_LISTING;
// }

import type {
  AssetInfo,
  GeoJsonMapSummary,
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstanceSseMessage,
  InstanceStructureSummary,
  OtherUser,
} from "lib";

const broadcastInstanceUpdates = new BroadcastChannel("instance_updates");

export function notifyInstanceUpdate(message: InstanceSseMessage) {
  broadcastInstanceUpdates.postMessage(message);
}

export function notifyInstanceConfigUpdated(config: InstanceConfig) {
  notifyInstanceUpdate({ type: "config_updated", data: config });
}

export function notifyInstanceProjectsLastUpdated(lastUpdated: string) {
  notifyInstanceUpdate({ type: "projects_last_updated", data: lastUpdated });
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

import type {
  AssetInfo,
  GeoJsonMapSummary,
  InstanceConfig,
  InstanceDatasetsSummary,
  InstanceIndicatorsSummary,
  InstanceSseMessage,
  InstanceStructureSummary,
  OtherUser,
  RunProgress,
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

// Results-package generation, for the instance catalogue (Q-B). Emitted
// alongside the per-attach-target project copies, and the ONLY channel a run
// launched with no attach targets has. routesInstanceSSE drops both messages
// for callers without can_configure_data.
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

import type { DashboardDetail, PublicDashboardBundle } from "lib";
import { buildPublicDashboardBundle } from "lib";
import { instanceState } from "~/state/instance/t1_store";

// Thin wrapper around the shared lib transform (used by both the editor and the
// server public route, so they can't diverge). Group members carry the group's
// shared geojson; entries collapse a replicant group into one unit.
export function buildDashboardBundle(
  dashboard: DashboardDetail,
): PublicDashboardBundle {
  return buildPublicDashboardBundle(dashboard, instanceState.countryIso3);
}

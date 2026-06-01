import type { DashboardDetail, PublicDashboardBundle } from "lib";
import { buildPublicDashboardBundle } from "lib";

// Thin wrapper around the shared lib transform (used by both the editor and the
// server public route, so they can't diverge). Group members carry the group's
// shared geojson; entries collapse a replicant group into one unit.
export function buildDashboardBundle(
  dashboard: DashboardDetail,
): PublicDashboardBundle {
  return buildPublicDashboardBundle(dashboard);
}

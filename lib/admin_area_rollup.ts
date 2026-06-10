// Shared definitions for the admin-area roll-up ("National" / total) row feature.
// The server query builder and the client (gate + display) both depend on these,
// so they live in lib/ and use no panther UI surface. The pinned sort config
// (rollupAwareSortByLabel) is intentionally NOT here — it needs a panther UI type
// and only the client uses it, so it stays in client/generate_visualization.
//
// The roll-up COLLAPSE LEVEL is chosen by `getRollupAdminLevel` (in
// get_fetch_config_from_po.ts, where the single-value-filter check lives) — the
// finest admin level that is grouped, not displayed as replicant/mapArea, and not
// filtered to a single value. That level is baked into the fetch config and the
// server obeys it; the server must NOT recompute "finest" from raw group-bys (raw
// group-bys include replicant levels, which are not valid collapse targets).

export const ADMIN_LEVELS = [
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

// Sentinel values placed in the collapsed admin column to mark the roll-up row.
// ROLLUP_SENTINEL_TOP sorts to the top, ROLLUP_SENTINEL_BOTTOM to the bottom (see
// rollupAwareSortByLabel, client-side). Both render as the same roll-up label.
export const ROLLUP_SENTINEL_TOP = "__NATIONAL";
export const ROLLUP_SENTINEL_BOTTOM = "zzNATIONAL";

export function isAdminLevel(disOpt: string): disOpt is AdminLevel {
  return (ADMIN_LEVELS as readonly string[]).includes(disOpt);
}

// The admin level one step coarser than `level` (its "parent"), used for the
// roll-up row's label heuristic. AA2's parent (AA1) is not a disaggregation
// option, so it returns undefined.
export function getParentAdminLevel(level: AdminLevel): AdminLevel | undefined {
  return level === "admin_area_4"
    ? "admin_area_3"
    : level === "admin_area_3"
      ? "admin_area_2"
      : undefined;
}
